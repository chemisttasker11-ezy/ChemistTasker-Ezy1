from datetime import date, time, timedelta
from queue import Queue
from threading import Barrier, Thread
from unittest import mock, skipUnless

from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.db import close_old_connections, connection, transaction
from django.test import TransactionTestCase
from django.test.utils import CaptureQueriesContext
from django.utils import timezone

from client_profile.models import (
    MembershipApplication,
    MembershipInviteLink,
    OtherStaffOnboarding,
    Pharmacy,
    Shift,
    ShiftSlot,
    ShiftSlotAssignment,
)
from invoicing.models import Invoice, InvoiceLineItem
from memberships.serializers import MembershipApplicationSerializer
from invoicing.services import generate_invoice_from_shifts
from workforce.models import Timesheet, TimesheetPeriod, TimesheetRevision
from workforce.timesheet_builder import build_timesheet
from workforce.timesheet_transitions import submit_timesheet
from memberships.invites import create_membership_invite
from memberships.models import Membership
from organizations.models import PharmacyAdmin
from rest_framework.test import APIClient


User = get_user_model()
POSTGRES_ONLY = skipUnless(
    connection.vendor == "postgresql",
    "PostgreSQL row-lock/constraint semantics required.",
)


@POSTGRES_ONLY
class MembershipApplicationPostgresConcurrencyTests(TransactionTestCase):
    reset_sequences = True

    def setUp(self):
        self.manager = User.objects.create_user(
            email="pg-manager@example.com",
            password="test-pass",
            role="OWNER",
        )
        self.pharmacy = Pharmacy.objects.create(name="PG Membership Pharmacy")
        self.link = MembershipInviteLink.objects.create(
            pharmacy=self.pharmacy,
            created_by=self.manager,
            category="FULL_PART_TIME",
            expires_at=timezone.now() + timedelta(days=7),
        )

    def _payload(self):
        return {
            "invite_link": self.link.pk,
            "role": "PHARMACIST",
            "first_name": "Concurrent",
            "last_name": "Applicant",
            "username": "concurrent.applicant",
            "mobile_number": "0412345678",
            "date_of_birth": "1990-01-02",
            "job_title": "Pharmacist",
            "email": "concurrent-applicant@example.com",
        }

    def test_same_identity_concurrent_submission_creates_one_pending_application(self):
        barrier = Barrier(2)
        results = Queue()

        def submit():
            close_old_connections()
            try:
                barrier.wait(timeout=10)
                with transaction.atomic():
                    Pharmacy.objects.select_for_update().get(pk=self.pharmacy.pk)
                    serializer = MembershipApplicationSerializer(data=self._payload())
                    if not serializer.is_valid():
                        results.put(("validation", serializer.errors))
                        return
                    app = serializer.save()
                    results.put(("created", app.pk))
            except Exception as exc:  # surface unexpected DB/locking failures to the assertion
                results.put(("exception", repr(exc)))
            finally:
                close_old_connections()

        threads = [Thread(target=submit), Thread(target=submit)]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join(timeout=20)

        outcomes = [results.get(timeout=5), results.get(timeout=5)]
        self.assertEqual(sum(kind == "created" for kind, _ in outcomes), 1, outcomes)
        self.assertEqual(sum(kind == "validation" for kind, _ in outcomes), 1, outcomes)
        self.assertEqual(sum(kind == "exception" for kind, _ in outcomes), 0, outcomes)
        self.assertEqual(
            MembershipApplication.objects.filter(
                pharmacy=self.pharmacy,
                status="PENDING",
            ).count(),
            1,
        )


@POSTGRES_ONLY
class MembershipLimitPostgresLockingTests(TransactionTestCase):
    reset_sequences = True

    def setUp(self):
        self.worker = User.objects.create_user(
            email="pg-membership-worker@example.com",
            password="test-pass",
            role="PHARMACIST",
        )
        self.owner = User.objects.create_user(
            email="pg-membership-owner@example.com",
            password="test-pass",
            role="OWNER",
        )
        self.pharmacies = [Pharmacy.objects.create(name=f"PG Membership {index}") for index in range(4)]
        for pharmacy in self.pharmacies[:2]:
            Membership.objects.create(
                user=self.worker,
                pharmacy=pharmacy,
                role="PHARMACIST",
                employment_type="LOCUM",
                status=Membership.Status.ACCEPTED,
                is_active=True,
            )
        self.pending = Membership.objects.create(
            user=self.worker,
            pharmacy=self.pharmacies[2],
            role="PHARMACIST",
            employment_type="LOCUM",
            status=Membership.Status.PENDING,
            is_active=False,
        )

    def _for_update_positions(self, queries, table_name):
        return [
            index
            for index, query in enumerate(queries)
            if "FOR UPDATE" in query["sql"].upper() and table_name in query["sql"]
        ]

    def test_worker_accept_locks_user_and_membership_before_enforcing_limit(self):
        client = APIClient()
        client.force_authenticate(self.worker)
        with CaptureQueriesContext(connection) as captured:
            response = client.post(
                f"/api/client-profile/my-memberships/{self.pending.pk}/accept/",
                {},
                format="json",
            )
        self.assertEqual(response.status_code, 200, response.data)
        queries = list(captured.captured_queries)
        user_locks = self._for_update_positions(queries, User._meta.db_table)
        membership_locks = self._for_update_positions(queries, Membership._meta.db_table)
        self.assertTrue(user_locks, "accept must lock the worker row to serialize the cross-pharmacy membership cap")
        self.assertTrue(membership_locks, "accept must lock the pending membership before changing its state")
        self.assertLess(user_locks[0], membership_locks[0], "lock order must be user then membership")

    def test_generic_reactivation_locks_user_then_membership_before_cap_check(self):
        PharmacyAdmin.objects.create(
            user=self.owner,
            pharmacy=self.pharmacies[2],
            admin_level=PharmacyAdmin.AdminLevel.MANAGER,
            is_active=True,
        )
        client = APIClient()
        client.force_authenticate(self.owner)
        with CaptureQueriesContext(connection) as captured:
            response = client.patch(
                f"/api/client-profile/memberships/{self.pending.pk}/",
                {"is_active": True, "status": Membership.Status.ACCEPTED},
                format="json",
            )
        self.assertEqual(response.status_code, 200, response.data)

        queries = list(captured.captured_queries)
        user_locks = self._for_update_positions(queries, User._meta.db_table)
        membership_locks = self._for_update_positions(queries, Membership._meta.db_table)
        self.assertTrue(user_locks, "generic reactivation must serialize the worker's cross-pharmacy cap")
        self.assertTrue(membership_locks, "generic reactivation must lock the membership row before mutation")
        self.assertLess(user_locks[0], membership_locks[0], "lock order must be user then membership")

    def test_immediate_invite_locks_existing_user_before_counting_active_memberships(self):
        with CaptureQueriesContext(connection) as captured:
            membership, error = create_membership_invite(
                {
                    "email": self.worker.email,
                    "pharmacy": self.pharmacies[3].pk,
                    "role": "PHARMACIST",
                    "employment_type": "LOCUM",
                    "activate_immediately": True,
                },
                inviter=self.owner,
            )
        self.assertIsNone(error)
        self.assertIsNotNone(membership)
        queries = list(captured.captured_queries)
        user_locks = self._for_update_positions(queries, User._meta.db_table)
        self.assertTrue(user_locks, "invite activation must share the worker-row lock used by self-acceptance")



@POSTGRES_ONLY
class TimesheetTransitionPostgresLockingTests(TransactionTestCase):
    reset_sequences = True

    def test_submit_locks_only_timesheet_with_nullable_membership(self):
        worker = User.objects.create_user(
            email="pg-timesheet-worker@example.com",
            password="test-pass",
            role="PHARMACIST",
        )
        owner = User.objects.create_user(
            email="pg-timesheet-owner@example.com",
            password="test-pass",
            role="OWNER",
        )
        pharmacy = Pharmacy.objects.create(name="PG Timesheet Pharmacy")
        period = TimesheetPeriod.objects.create(
            pharmacy=pharmacy,
            start_date=date(2026, 10, 5),
            end_date=date(2026, 10, 11),
            created_by=owner,
        )
        timesheet = Timesheet.objects.create(
            period=period,
            user=worker,
            membership=None,
            status=Timesheet.Status.READY,
            needs_rebuild=False,
        )
        TimesheetRevision.objects.create(
            timesheet=timesheet,
            revision_number=1,
            source_fingerprint="pg-lock-test",
            snapshot={},
        )

        revision = submit_timesheet(timesheet, worker, 1)

        self.assertEqual(revision.revision_number, 1)
        timesheet.refresh_from_db()
        self.assertEqual(timesheet.status, Timesheet.Status.SUBMITTED)

    def test_builder_locks_period_before_timesheet(self):
        worker = User.objects.create_user(
            email="pg-timesheet-builder-worker@example.com",
            password="test-pass",
            role="PHARMACIST",
        )
        owner = User.objects.create_user(
            email="pg-timesheet-builder-owner@example.com",
            password="test-pass",
            role="OWNER",
        )
        pharmacy = Pharmacy.objects.create(name="PG Timesheet Builder Pharmacy")
        period = TimesheetPeriod.objects.create(
            pharmacy=pharmacy,
            start_date=date(2026, 10, 12),
            end_date=date(2026, 10, 18),
            created_by=owner,
        )
        timesheet = Timesheet.objects.create(
            period=period,
            user=worker,
            membership=None,
            status=Timesheet.Status.READY,
            needs_rebuild=True,
        )

        with CaptureQueriesContext(connection) as captured, mock.patch(
            "workforce.timesheet_builder._period_bounds",
            side_effect=RuntimeError("stop after row locks"),
        ):
            with self.assertRaisesMessage(RuntimeError, "stop after row locks"):
                build_timesheet(timesheet.pk, actor=owner)

        queries = list(captured.captured_queries)
        period_table = connection.ops.quote_name(TimesheetPeriod._meta.db_table)
        timesheet_table = connection.ops.quote_name(Timesheet._meta.db_table)
        period_from = f"FROM {period_table}"
        timesheet_from = f"FROM {timesheet_table}"
        period_locks = [
            index
            for index, query in enumerate(queries)
            if "FOR UPDATE" in query["sql"].upper()
            and period_from in query["sql"]
        ]
        timesheet_locks = [
            index
            for index, query in enumerate(queries)
            if "FOR UPDATE" in query["sql"].upper()
            and timesheet_from in query["sql"]
        ]
        self.assertTrue(period_locks, "builder must lock the timesheet period")
        self.assertTrue(timesheet_locks, "builder must lock the timesheet row")
        self.assertLess(
            period_locks[0],
            timesheet_locks[0],
            "builder lock order must be period then timesheet to match transition/period locking",
        )



@POSTGRES_ONLY
class InvoicePostgresConcurrencyTests(TransactionTestCase):
    reset_sequences = True

    def setUp(self):
        self.worker = User.objects.create_user(
            email="pg-invoice-worker@example.com",
            password="test-pass",
            role="OTHER_STAFF",
            first_name="Invoice",
            last_name="Worker",
        )
        OtherStaffOnboarding.objects.create(
            user=self.worker,
            role_type="ASSISTANT",
            payment_preference="ABN",
            abn="51824753556",
            abn_verified=True,
            abn_entity_confirmed=True,
            gst_registered=True,
        )
        self.owner = User.objects.create_user(
            email="pg-owner@example.com",
            password="test-pass",
            role="OWNER",
        )
        self.pharmacy = Pharmacy.objects.create(
            name="PG Invoice Pharmacy",
            abn="51824753556",
        )
        self.shift = Shift.objects.create(
            pharmacy=self.pharmacy,
            created_by=self.owner,
            role_needed="ASSISTANT",
            employment_type="LOCUM",
        )
        self.slot = ShiftSlot.objects.create(
            shift=self.shift,
            date=date(2026, 9, 21),
            start_time=time(9, 0),
            end_time=time(17, 0),
        )
        self.assignment = ShiftSlotAssignment.objects.create(
            shift=self.shift,
            slot=self.slot,
            slot_date=self.slot.date,
            user=self.worker,
            unit_rate="70.00",
            settlement_channel="INVOICE",
            engagement_kind="INDEPENDENT_CONTRACTOR",
            engagement_terms_accepted_at=timezone.now(),
            engagement_terms_snapshot={
                "gst_registered": True,
                "super_review_required": True,
                "super_payable_confirmed": False,
                "occurrences": [{
                    "slot_id": self.slot.id,
                    "date": str(self.slot.date),
                    "agreed_rate": "70.00",
                }],
            },
        )

    def _billing_data(self):
        return {
            "shift_ids": [self.shift.id],
            "external": False,
            "gst_registered": True,
            "super_rate_snapshot": "12.00",
            "bank_account_name": "Invoice Worker",
            "bsb": "123456",
            "account_number": "12345678",
            "cc_emails": "",
        }

    def test_concurrent_invoice_creation_bills_assignment_once(self):
        barrier = Barrier(2)
        results = Queue()
        worker_id = self.worker.id
        pharmacy_id = self.pharmacy.id
        shift_id = self.shift.id

        def create_invoice():
            close_old_connections()
            try:
                user = User.objects.get(pk=worker_id)
                barrier.wait(timeout=10)
                invoice = generate_invoice_from_shifts(
                    user=user,
                    pharmacy_id=pharmacy_id,
                    shift_ids=[shift_id],
                    custom_lines=[],
                    external=False,
                    billing_data=self._billing_data(),
                )
                results.put(("created", invoice.pk))
            except ValidationError as exc:
                results.put(("validation", str(exc)))
            except Exception as exc:
                results.put(("exception", repr(exc)))
            finally:
                close_old_connections()

        threads = [Thread(target=create_invoice), Thread(target=create_invoice)]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join(timeout=30)

        outcomes = [results.get(timeout=5), results.get(timeout=5)]
        self.assertEqual(sum(kind == "created" for kind, _ in outcomes), 1, outcomes)
        self.assertEqual(sum(kind == "validation" for kind, _ in outcomes), 1, outcomes)
        self.assertEqual(sum(kind == "exception" for kind, _ in outcomes), 0, outcomes)
        self.assertEqual(Invoice.objects.count(), 1)
        self.assertEqual(
            InvoiceLineItem.objects.filter(
                source_assignment=self.assignment,
                category_code="ProfessionalServices",
            ).count(),
            1,
        )
