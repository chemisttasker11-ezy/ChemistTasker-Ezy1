"""Provisional reviews lock mutable rows, not nullable membership joins."""
from datetime import timedelta
from queue import Queue
from threading import Barrier, Thread
from unittest import skipUnless

from django.core.exceptions import PermissionDenied
from django.db import close_old_connections, connection
from django.test import TestCase, TransactionTestCase
from django.test.utils import CaptureQueriesContext
from django.utils import timezone

from attendance.approvals import approve_provisional_attendance, reject_provisional_attendance
from attendance.models import AttendanceSession, ProvisionalAttendance
from client_profile.characterization_support import make_owner_with_pharmacy, make_user
from memberships.models import Membership
from shifts.models import ShiftSlotAssignment
from users.models import User


class ReviewFixture:
    def setUp(self):
        self.owner, self.pharmacy = make_owner_with_pharmacy("Approval Lock Pharmacy")
        self.worker = make_user("PHARMACIST")
        now = timezone.now()
        self.session = AttendanceSession.objects.create(
            pharmacy=self.pharmacy, user=self.worker,
            source_membership=None, started_at=now - timedelta(hours=3),
            ended_at=now - timedelta(minutes=5), is_provisional=True,
        )
        self.review = ProvisionalAttendance.objects.create(
            session=self.session, cover_type=ProvisionalAttendance.CoverType.UNROSTERED_LOCAL,
        )


class ApprovalLockingContracts(ReviewFixture, TestCase):
    def test_null_membership_can_be_approved_once_without_creating_membership(self):
        first = approve_provisional_attendance(self.owner, self.review.pk)
        repeated = approve_provisional_attendance(self.owner, self.review.pk)
        self.assertEqual(first.backfill_assignment_id, repeated.backfill_assignment_id)
        self.assertEqual(ShiftSlotAssignment.objects.filter(user=self.worker).count(), 1)
        self.assertFalse(Membership.objects.filter(user=self.worker).exists())
        self.session.refresh_from_db()
        self.assertEqual(self.session.assignment_id, first.backfill_assignment_id)
        self.assertFalse(self.session.is_provisional)

    def test_nonnull_membership_keeps_the_source_role_and_identity(self):
        membership = Membership.objects.create(
            pharmacy=self.pharmacy, user=self.worker, role="ASSISTANT",
            employment_type="CASUAL", status=Membership.Status.ACCEPTED, is_active=True,
        )
        self.session.source_membership = membership
        self.session.save(update_fields=["source_membership"])
        result = approve_provisional_attendance(self.owner, self.review.pk)
        self.assertEqual(result.backfill_shift.role_needed, "ASSISTANT")
        self.session.refresh_from_db()
        self.assertEqual(self.session.source_membership_id, membership.pk)
        self.assertEqual(Membership.objects.filter(user=self.worker).count(), 1)

    def test_wrong_site_manager_cannot_approve_or_reject(self):
        other_owner, _ = make_owner_with_pharmacy("Other Approval Pharmacy")
        with self.assertRaises(PermissionDenied):
            approve_provisional_attendance(other_owner, self.review.pk)
        with self.assertRaises(PermissionDenied):
            reject_provisional_attendance(other_owner, self.review.pk, reason="Wrong site")
        self.review.refresh_from_db()
        self.assertEqual(self.review.status, ProvisionalAttendance.Status.PENDING)
        self.assertFalse(ShiftSlotAssignment.objects.filter(user=self.worker).exists())

    def test_missing_record_keeps_the_domain_not_found_exception(self):
        with self.assertRaises(ProvisionalAttendance.DoesNotExist):
            approve_provisional_attendance(self.owner, self.review.pk + 1000)

    def test_rejection_keeps_evidence_without_backfill(self):
        result = reject_provisional_attendance(self.owner, self.review.pk, reason="Duplicate record")
        self.assertEqual(result.status, ProvisionalAttendance.Status.REJECTED)
        self.assertTrue(AttendanceSession.objects.filter(pk=self.session.pk).exists())
        self.assertFalse(ShiftSlotAssignment.objects.filter(user=self.worker).exists())


@skipUnless(connection.vendor == "postgresql", "Requires independent PostgreSQL transactions and row locks.")
class ApprovalLockingPostgresContracts(ReviewFixture, TransactionTestCase):
    def test_for_update_targets_only_the_review_and_session(self):
        with CaptureQueriesContext(connection) as captured:
            approve_provisional_attendance(self.owner, self.review.pk)
        locking = [query["sql"] for query in captured.captured_queries if "FOR UPDATE" in query["sql"]]
        self.assertTrue(locking)
        expected = 'FOR UPDATE OF "{}", "{}"'.format(
            ProvisionalAttendance._meta.db_table, AttendanceSession._meta.db_table,
        )
        self.assertIn(expected, locking[0])
        self.assertNotIn(Membership._meta.db_table, locking[0].split("FOR UPDATE OF", 1)[1])

    def test_concurrent_approval_creates_one_backfill(self):
        barrier = Barrier(2)
        results = Queue()

        def approve():
            close_old_connections()
            try:
                with connection.cursor() as cursor:
                    cursor.execute("SET lock_timeout = '5s'")
                    cursor.execute("SET statement_timeout = '10s'")
                manager = User.objects.get(pk=self.owner.pk)
                barrier.wait(timeout=10)
                row = approve_provisional_attendance(manager, self.review.pk)
                results.put(("ok", row.backfill_assignment_id))
            except Exception as exc:
                results.put(("unexpected", repr(exc)))
            finally:
                connection.close()

        threads = [Thread(target=approve, daemon=True) for _ in range(2)]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join(timeout=20)
        self.assertTrue(all(not thread.is_alive() for thread in threads), "Approval did not finish.")
        outcomes = [results.get(timeout=2) for _ in threads]
        self.assertTrue(all(kind == "ok" for kind, _ in outcomes), outcomes)
        self.assertEqual(outcomes[0][1], outcomes[1][1])
        self.assertEqual(ShiftSlotAssignment.objects.filter(user=self.worker).count(), 1)
        self.review.refresh_from_db()
        self.session.refresh_from_db()
        self.assertEqual(self.review.backfill_assignment_id, self.session.assignment_id)
