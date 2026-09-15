import os
import unittest
from datetime import date, datetime, time, timedelta, timezone as dt_timezone

import django
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "attendance_tests.settings")
django.setup()

from django.contrib.auth import get_user_model
from django.core.exceptions import PermissionDenied, ValidationError
from django.db import connection
from django.test import RequestFactory
from django.utils import timezone

User = get_user_model()

from client_profile.attendance_approvals import (
    approve_provisional_attendance,
    create_attendance_correction,
    is_authorized_attendance_manager,
    reject_provisional_attendance,
)
from client_profile.attendance_credentials import activate_kiosk_device, generate_signed_pharmacy_qr
from client_profile.attendance_transitions import clock_in, clock_out
from client_profile.attendance_views import (
    ManagerApproveAttendanceView,
    ManagerCreateCorrectionView,
    ManagerRejectAttendanceView,
)
from client_profile.models import (
    AttendanceCorrection,
    AttendanceEvent,
    AttendanceSession,
    Chain,
    KioskDevice,
    Membership,
    Organization,
    OwnerOnboarding,
    Pharmacy,
    PharmacyAdmin,
    PharmacyQRSession,
    ProvisionalAttendance,
    Shift,
    ShiftSlot,
    ShiftSlotAssignment,
    WorkerPIN,
)

SCHEMA_MODELS = (
    User,
    Organization,
    OwnerOnboarding,
    Pharmacy,
    PharmacyAdmin,
    Chain,
    Membership,
    Shift,
    ShiftSlot,
    ShiftSlotAssignment,
    KioskDevice,
    PharmacyQRSession,
    WorkerPIN,
    AttendanceSession,
    AttendanceEvent,
    ProvisionalAttendance,
    AttendanceCorrection,
)


class ProvisionalApprovalSafetyTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        with connection.schema_editor() as editor:
            for model in SCHEMA_MODELS:
                editor.create_model(model)
        connection.disable_constraint_checking()

    @classmethod
    def tearDownClass(cls):
        connection.disable_constraint_checking()
        with connection.schema_editor() as editor:
            for model in reversed(SCHEMA_MODELS):
                editor.delete_model(model)
        connection.enable_constraint_checking()
        super().tearDownClass()

    def _clean_tables(self):
        with connection.cursor() as cursor:
            for table in (
                "client_profile_attendancecorrection",
                "client_profile_provisionalattendance",
                "client_profile_attendanceevent",
                "client_profile_attendancesession",
                "client_profile_workerpin",
                "client_profile_pharmacyqrsession",
                "client_profile_kioskdevice",
                "client_profile_shiftslotassignment",
                "client_profile_shiftslot",
                "client_profile_shift",
                "client_profile_membership",
                "client_profile_chain_pharmacies",
                "client_profile_chain",
                "client_profile_pharmacyadmin",
                "client_profile_pharmacy",
                "client_profile_owneronboarding",
                "client_profile_organization",
                "users_user",
            ):
                cursor.execute(f"DELETE FROM {table};")

    def setUp(self):
        self._clean_tables()
        self.factory = RequestFactory()

        # Users
        self.owner_user = User.objects.create(
            id=1, username="owner_user", email="owner@test.com"
        )
        self.manager_alpha_user = User.objects.create(
            id=2, username="manager_alpha", email="mgr_a@test.com"
        )
        self.manager_beta_user = User.objects.create(
            id=3, username="manager_beta", email="mgr_b@test.com"
        )
        self.worker_user = User.objects.create(
            id=4, username="worker_local", email="worker@test.com"
        )
        self.cross_worker_user = User.objects.create(
            id=5, username="worker_cross", email="cross@test.com"
        )

        # Owner onboarding & Chain
        self.owner = OwnerOnboarding.objects.create(
            id=1,
            user=self.owner_user,
            phone_number="0400000001",
            role="PHARMACIST",
        )
        self.chain = Chain.objects.create(id=1, name="Safe Chain", owner=self.owner)
        self.pharmacy_a = Pharmacy.objects.create(
            id=1,
            name="Pharmacy Alpha Brisbane",
            owner=self.owner,
            timezone="Australia/Brisbane",
        )
        self.pharmacy_b = Pharmacy.objects.create(
            id=2,
            name="Pharmacy Beta Sydney",
            owner=self.owner,
            timezone="Australia/Sydney",
        )
        self.chain.pharmacies.add(self.pharmacy_a, self.pharmacy_b)

        # Managers
        self.admin_a = PharmacyAdmin.objects.create(
            user=self.manager_alpha_user,
            pharmacy=self.pharmacy_a,
            admin_level=PharmacyAdmin.AdminLevel.MANAGER,
            is_active=True,
        )
        self.admin_b = PharmacyAdmin.objects.create(
            user=self.manager_beta_user,
            pharmacy=self.pharmacy_b,
            admin_level=PharmacyAdmin.AdminLevel.MANAGER,
            is_active=True,
        )

        # Memberships: cross_worker is member at Beta only
        self.mem_beta = Membership.objects.create(
            id=1,
            user=self.cross_worker_user,
            pharmacy=self.pharmacy_b,
            role="PHARMACIST",
            employment_type="PART_TIME",
            status=Membership.Status.ACCEPTED,
            is_active=True,
        )

        # Kiosks
        self.kiosk_a, _ = activate_kiosk_device(self.manager_alpha_user, self.pharmacy_a, "Alpha Counter")
        self.kiosk_b, _ = activate_kiosk_device(self.manager_beta_user, self.pharmacy_b, "Beta Counter")

    def tearDown(self):
        with connection.cursor() as cursor:
            for table in (
                "client_profile_attendancecorrection",
                "client_profile_provisionalattendance",
                "client_profile_attendanceevent",
                "client_profile_attendancesession",
                "client_profile_workerpin",
                "client_profile_pharmacyqrsession",
                "client_profile_kioskdevice",
                "client_profile_shiftslotassignment",
                "client_profile_shiftslot",
                "client_profile_shift",
                "client_profile_membership",
                "client_profile_chain_pharmacies",
                "client_profile_chain",
                "client_profile_pharmacyadmin",
                "client_profile_pharmacy",
                "client_profile_owneronboarding",
                "client_profile_organization",
                "users_user",
            ):
                cursor.execute(f"DELETE FROM {table};")

    def test_reject_approval_of_open_session(self):
        """Require a closed attendance session before shift backfill."""
        qr = generate_signed_pharmacy_qr(self.kiosk_a)
        session, _ = clock_in(self.cross_worker_user, self.pharmacy_a, signed_qr_token=qr["signed_token"])
        prov = session.provisional_review
        self.assertIsNotNone(prov)
        self.assertIsNone(session.ended_at)

        with self.assertRaises(ValidationError) as ctx:
            approve_provisional_attendance(self.manager_alpha_user, prov.id)
        self.assertIn("open attendance session", str(ctx.exception))

    def test_approval_clears_provisional_flag_and_backfills(self):
        """On approval, clear the provisional flag and create backfill shift, slot, assignment."""
        qr = generate_signed_pharmacy_qr(self.kiosk_a)
        session, _ = clock_in(self.cross_worker_user, self.pharmacy_a, signed_qr_token=qr["signed_token"])
        clock_out(self.cross_worker_user, signed_qr_token=qr["signed_token"])
        session.refresh_from_db()
        self.assertTrue(session.is_provisional)

        prov = session.provisional_review
        approved_prov = approve_provisional_attendance(self.manager_alpha_user, prov.id, reason="Approved cover.")

        self.assertEqual(approved_prov.status, ProvisionalAttendance.Status.APPROVED)
        session.refresh_from_db()
        self.assertFalse(session.is_provisional)
        self.assertIsNotNone(session.assignment)
        self.assertEqual(session.assignment.user, self.cross_worker_user)
        self.assertEqual(session.assignment.shift.pharmacy, self.pharmacy_a)

    def test_approval_preserves_actual_times_in_pharmacy_timezone(self):
        """Timestamps crossing UTC midnight are correctly resolved to the pharmacy's local work date."""
        # 22:30 UTC on Oct 10 is 08:30 AEST on Oct 11 in Australia/Brisbane (UTC+10)
        utc_start = datetime(2026, 10, 10, 22, 30, tzinfo=dt_timezone.utc)
        utc_end = datetime(2026, 10, 11, 6, 30, tzinfo=dt_timezone.utc)  # 16:30 AEST

        session = AttendanceSession.objects.create(
            user=self.cross_worker_user,
            pharmacy=self.pharmacy_a,
            source_membership=self.mem_beta,
            started_at=utc_start,
            ended_at=utc_end,
            is_provisional=True,
        )
        prov = ProvisionalAttendance.objects.create(
            session=session,
            cover_type=ProvisionalAttendance.CoverType.CROSS_SITE_CHAIN,
            status=ProvisionalAttendance.Status.PENDING,
        )

        approve_provisional_attendance(self.manager_alpha_user, prov.id)
        prov.refresh_from_db()

        assignment = prov.backfill_assignment
        slot = assignment.slot

        # Slot date must match local Brisbane date (Oct 11), NOT UTC date (Oct 10)
        self.assertEqual(slot.date, date(2026, 10, 11))
        self.assertEqual(slot.start_time, time(8, 30))
        self.assertEqual(slot.end_time, time(16, 30))

    def test_approval_concurrency_idempotent(self):
        """Repeated approval calls do not create duplicate shifts or slots."""
        qr = generate_signed_pharmacy_qr(self.kiosk_a)
        session, _ = clock_in(self.cross_worker_user, self.pharmacy_a, signed_qr_token=qr["signed_token"])
        clock_out(self.cross_worker_user, signed_qr_token=qr["signed_token"])
        prov = session.provisional_review

        p1 = approve_provisional_attendance(self.manager_alpha_user, prov.id, reason="First")
        shift_count = Shift.objects.filter(pharmacy=self.pharmacy_a).count()
        slot_count = ShiftSlot.objects.count()

        p2 = approve_provisional_attendance(self.manager_alpha_user, prov.id, reason="Second")
        self.assertEqual(p1.id, p2.id)
        self.assertEqual(Shift.objects.filter(pharmacy=self.pharmacy_a).count(), shift_count)
        self.assertEqual(ShiftSlot.objects.count(), slot_count)

    def test_unauthorized_manager_returns_403_in_api(self):
        """Wrong-site managers receive HTTP 403 Forbidden on approve, reject, and correct."""
        qr = generate_signed_pharmacy_qr(self.kiosk_a)
        session, in_event = clock_in(self.cross_worker_user, self.pharmacy_a, signed_qr_token=qr["signed_token"])
        clock_out(self.cross_worker_user, signed_qr_token=qr["signed_token"])
        prov = session.provisional_review

        # 1. Approve
        req_approve = self.factory.post(
            "/api/attendance/manager/approve/",
            {"provisional_id": prov.id, "reason": "Unauthorized"},
            content_type="application/json",
        )
        req_approve.user = self.manager_beta_user
        res_approve = ManagerApproveAttendanceView.as_view()(req_approve)
        self.assertEqual(res_approve.status_code, 403)

        # 2. Reject
        req_reject = self.factory.post(
            "/api/attendance/manager/reject/",
            {"provisional_id": prov.id, "reason": "Unauthorized"},
            content_type="application/json",
        )
        req_reject.user = self.manager_beta_user
        res_reject = ManagerRejectAttendanceView.as_view()(req_reject)
        self.assertEqual(res_reject.status_code, 403)

        # 3. Correct
        req_correct = self.factory.post(
            "/api/attendance/manager/correct/",
            {
                "event_id": in_event.id,
                "corrected_timestamp": timezone.now().isoformat(),
                "reason": "Unauthorized",
            },
            content_type="application/json",
        )
        req_correct.user = self.manager_beta_user
        res_correct = ManagerCreateCorrectionView.as_view()(req_correct)
        self.assertEqual(res_correct.status_code, 403)

    def test_correction_rejects_future_timestamp(self):
        """Manager correction cannot set an event timestamp in the future."""
        qr = generate_signed_pharmacy_qr(self.kiosk_a)
        session, in_event = clock_in(self.cross_worker_user, self.pharmacy_a, signed_qr_token=qr["signed_token"])
        future_time = timezone.now() + timedelta(hours=2)

        with self.assertRaises(ValidationError) as ctx:
            create_attendance_correction(
                self.manager_alpha_user,
                in_event.id,
                corrected_timestamp=future_time,
                reason="Future time",
            )
        self.assertIn("future", str(ctx.exception).lower())

    def test_correction_chronology_validation(self):
        """Validates that CLOCK_IN cannot be corrected to after CLOCK_OUT, and vice-versa."""
        now = timezone.now()
        start = now - timedelta(hours=4)
        end = now - timedelta(hours=1)

        session = AttendanceSession.objects.create(
            user=self.cross_worker_user,
            pharmacy=self.pharmacy_a,
            started_at=start,
            ended_at=end,
        )
        ev_in = AttendanceEvent.objects.create(
            session=session,
            event_type=AttendanceEvent.EventType.CLOCK_IN,
            occurred_at=start,
            source=AttendanceEvent.Source.KIOSK_PIN,
        )
        ev_out = AttendanceEvent.objects.create(
            session=session,
            event_type=AttendanceEvent.EventType.CLOCK_OUT,
            occurred_at=end,
            source=AttendanceEvent.Source.KIOSK_PIN,
        )

        # Clock-in corrected after clock-out -> Invalid
        with self.assertRaises(ValidationError) as ctx:
            create_attendance_correction(
                self.manager_alpha_user,
                ev_in.id,
                corrected_timestamp=end + timedelta(minutes=10),
                reason="Invalid in after out",
            )
        self.assertIn("cannot be after", str(ctx.exception).lower())

        # Clock-out corrected before clock-in -> Invalid
        with self.assertRaises(ValidationError) as ctx:
            create_attendance_correction(
                self.manager_alpha_user,
                ev_out.id,
                corrected_timestamp=start - timedelta(minutes=10),
                reason="Invalid out before in",
            )
        self.assertIn("cannot be before", str(ctx.exception).lower())

    def test_no_permanent_membership_created(self):
        """Cross-site approval never creates a permanent destination pharmacy membership."""
        qr = generate_signed_pharmacy_qr(self.kiosk_a)
        session, _ = clock_in(self.cross_worker_user, self.pharmacy_a, signed_qr_token=qr["signed_token"])
        clock_out(self.cross_worker_user, signed_qr_token=qr["signed_token"])

        self.assertEqual(
            Membership.objects.filter(user=self.cross_worker_user, pharmacy=self.pharmacy_a).count(),
            0,
        )

        approve_provisional_attendance(self.manager_alpha_user, session.provisional_review.id)

        self.assertEqual(
            Membership.objects.filter(user=self.cross_worker_user, pharmacy=self.pharmacy_a).count(),
            0,
        )


if __name__ == "__main__":
    unittest.main()
