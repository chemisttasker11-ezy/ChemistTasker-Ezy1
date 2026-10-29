"""PR-L/E9: unbooked provisional cover needs destination review before sign-off."""
from datetime import timedelta
from unittest import skipUnless

from django.db import connection
from django.test import TestCase

from attendance.models import AttendanceEvent, AttendanceSession, ProvisionalAttendance
from attendance.test_unbooked_locum_cover import BASE, LocumCoverFixture
from client_profile.characterization_support import client_for
from workforce.models import Timesheet, TimesheetApproval, TimesheetCheckDecision, TimesheetPeriod


# Skip before TestCase opens its class transaction; the fixture rejects SQLite.
# The PostgreSQL matrix still runs every approval contract below.
@skipUnless(connection.vendor == "postgresql", "Unbooked locum approval contracts require PostgreSQL.")
class LocumApprovalGateTests(LocumCoverFixture, TestCase):
    def setUp(self):
        super().setUp()
        self.review = self.seed_review()
        monday = self.now.date() - timedelta(days=self.now.weekday())
        self.period = TimesheetPeriod.objects.create(
            pharmacy=self.pharmacy, start_date=monday, end_date=monday + timedelta(days=6),
            timezone="Australia/Brisbane", created_by=self.owner,
        )
        self.timesheet = Timesheet.objects.create(period=self.period, user=self.worker)
        self.url = f"/api/v1/workforce/timesheets/{self.timesheet.pk}/"

    def recalculate(self):
        response = self.api.post(self.url + "recalculate/", {"force": True}, format="json")
        self.assertEqual(response.status_code, 200, response.data)
        self.timesheet.refresh_from_db()
        return self.timesheet.revisions.order_by("-revision_number").first()

    def approve_time(self, revision):
        return self.api.post(self.url + "approve-time/", {
            "revision_number": revision.revision_number, "reason": "Reviewed actual cover time.",
        }, format="json")

    def assert_blocked(self, revision):
        check = revision.checks.get(code="UNRESOLVED_PROVISIONAL_ATTENDANCE")
        self.assertEqual(check.severity, "BLOCKER")
        response = self.approve_time(revision)
        self.assertEqual(response.status_code, 400, response.data)
        self.assertIn("TIMESHEET_BLOCKERS", str(response.data))
        self.timesheet.refresh_from_db()
        self.assertNotEqual(self.timesheet.status, "APPROVED")
        self.assertFalse(TimesheetApproval.objects.filter(
            revision__timesheet=self.timesheet, kind="TIME_APPROVAL",
        ).exists())
        return check

    def test_pending_unbooked_session_blocks_timesheet_approval_and_waiver(self):
        revision = self.recalculate()
        check = self.assert_blocked(revision)
        for decision in ("WAIVED", "RESOLVED"):
            with self.subTest(decision=decision):
                response = self.api.post(f"/api/v1/workforce/timesheet-checks/{check.pk}/decision/", {
                    "decision": decision, "reason": "Attempt to bypass destination review.",
                }, format="json")
                self.assertEqual(response.status_code, 400, response.data)
                self.assertFalse(TimesheetCheckDecision.objects.filter(timesheet_check=check).exists())
                self.assert_blocked(revision)

    def test_pending_review_still_blocks_if_session_provisional_flag_is_false(self):
        AttendanceSession.objects.filter(pk=self.review.session_id).update(is_provisional=False)
        self.assert_blocked(self.recalculate())

    def test_destination_review_then_normal_timesheet_approval(self):
        self.assert_blocked(self.recalculate())
        response = self.decide_review(self.review)
        self.assertEqual(response.status_code, 200, response.data)
        self.review.refresh_from_db()
        self.assertIsNotNone(self.review.backfill_assignment_id)
        self.assertEqual(self.review.backfill_assignment.shift.role_needed, "PHARMACIST")
        # Attendance approval alone is not payroll approval (E9).
        self.timesheet.refresh_from_db()
        self.assertNotEqual(self.timesheet.status, "APPROVED")
        self.assertFalse(TimesheetApproval.objects.filter(kind="TIME_APPROVAL").exists())
        revision = self.recalculate()
        self.assertFalse(revision.checks.filter(code="UNRESOLVED_PROVISIONAL_ATTENDANCE").exists())
        self.assertEqual(self.timesheet.worked_minutes, 60)
        response = self.approve_time(revision)
        self.assertEqual(response.status_code, 200, response.data)
        self.timesheet.refresh_from_db()
        self.assertEqual((self.timesheet.status, self.timesheet.reviewed_minutes), ("APPROVED", 60))
        approval = TimesheetApproval.objects.get(revision=revision, kind="TIME_APPROVAL")
        self.assertEqual(approval.actor_id, self.manager.pk)

    def test_qr_cover_flows_through_destination_review_before_timesheet_approval(self):
        self.worker, self.profile = self.verified_worker()
        self.timesheet = Timesheet.objects.create(period=self.period, user=self.worker)
        self.url = f"/api/v1/workforce/timesheets/{self.timesheet.pk}/"
        session = self.assert_cover(self.scan())
        # A real hour of controlled time avoids the E13 opposite-action prompt.
        self.now += timedelta(hours=1)
        with self.captureOnCommitCallbacks(execute=True):
            response = client_for(self.worker).post(BASE + "worker/clock-out/", {
                "qr_token": self.qr(),
            }, format="json")
        self.assertEqual(response.status_code, 200, response.data)
        review = session.provisional_review
        queue = self.api.get(BASE + "manager/pending/", {"pharmacy_id": self.pharmacy.pk})
        self.assertEqual(queue.status_code, 200, queue.data)
        row = next(row for row in queue.data if row["provisional_id"] == review.pk)
        self.assertIsNone(row["source_pharmacy_name"])
        self.assert_blocked(self.recalculate())
        response = self.decide_review(review)
        self.assertEqual(response.status_code, 200, response.data)
        revision = self.recalculate()
        self.assertFalse(revision.checks.filter(code="UNRESOLVED_PROVISIONAL_ATTENDANCE").exists())
        response = self.approve_time(revision)
        self.assertEqual(response.status_code, 200, response.data)
        self.timesheet.refresh_from_db()
        self.assertEqual((self.timesheet.status, self.timesheet.reviewed_minutes), ("APPROVED", 60))

    def test_rejected_cover_excluded_from_projection_and_audit_evidence_kept(self):
        session = self.review.session
        original_session = AttendanceSession.objects.filter(pk=session.pk).values().get()
        original_events = list(AttendanceEvent.objects.filter(session=session).order_by("pk").values())
        self.assert_blocked(self.recalculate())
        response = self.decide_review(self.review, decision="reject")
        self.assertEqual(response.status_code, 200, response.data)
        self.review.refresh_from_db()
        self.assertEqual(self.review.status, "REJECTED")
        self.assertEqual(self.review.decided_by_id, self.manager.pk)
        self.assertIsNotNone(self.review.decided_at)
        self.assertTrue(self.review.decision_reason)
        self.assertIsNone(self.review.backfill_assignment_id)
        self.assertEqual(AttendanceSession.objects.filter(pk=session.pk).values().get(), original_session)
        self.assertEqual(list(AttendanceEvent.objects.filter(session=session).order_by("pk").values()), original_events)
        self.assertTrue(ProvisionalAttendance.objects.filter(pk=self.review.pk).exists())
        revision = self.recalculate()
        self.assertEqual(self.timesheet.worked_minutes, 0)
        self.assertEqual(revision.worked_minutes, 0)
        self.assertFalse(revision.checks.filter(code="UNRESOLVED_PROVISIONAL_ATTENDANCE").exists())
        queue = self.api.get(BASE + "manager/pending/", {"pharmacy_id": self.pharmacy.pk})
        self.assertEqual(queue.status_code, 200, queue.data)
        self.assertEqual(queue.data, [])
