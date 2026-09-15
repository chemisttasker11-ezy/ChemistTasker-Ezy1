"""Isolated integration tests for Manager Approval, Rejection, and Corrections.

Runs strictly in-memory using disposable SQLite under attendance_tests.settings.
Does not touch core.settings, unapplied migrations, or the configured database.
"""

import os
import unittest
from datetime import timedelta
import zoneinfo

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "attendance_tests.settings")

import django
django.setup()

from django.contrib.auth import get_user_model
from django.core.exceptions import PermissionDenied, ValidationError
from django.db import connection
from django.utils import timezone

from client_profile.attendance_approvals import (
    approve_provisional_attendance,
    create_attendance_correction,
    get_effective_session_timeline,
    get_pending_provisional_attendances,
    reject_provisional_attendance,
)
from client_profile.attendance_credentials import (
    activate_kiosk_device,
    generate_signed_pharmacy_qr,
)
from client_profile.attendance_transitions import (
    clock_in,
    clock_out,
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

User = get_user_model()

APPROVAL_SCHEMA_MODELS = (
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


class AttendanceApprovalsTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        with connection.schema_editor() as editor:
            for model in APPROVAL_SCHEMA_MODELS:
                editor.create_model(model)
        connection.disable_constraint_checking()

    @classmethod
    def tearDownClass(cls):
        connection.disable_constraint_checking()
        with connection.schema_editor() as editor:
            for model in reversed(APPROVAL_SCHEMA_MODELS):
                editor.delete_model(model)
        connection.enable_constraint_checking()
        super().tearDownClass()

    def setUp(self):
        # Users
        self.owner_user = User.objects.create(id=1, username="owner@test.com", email="owner@test.com")
        self.manager_a_user = User.objects.create(id=2, username="mgr_a@test.com", email="mgr_a@test.com")
        self.manager_b_user = User.objects.create(id=3, username="mgr_b@test.com", email="mgr_b@test.com")
        self.worker_user = User.objects.create(id=4, username="worker@test.com", email="worker@test.com")
        self.cross_worker_user = User.objects.create(id=5, username="cross@test.com", email="cross@test.com")

        # Network Setup
        self.org = Organization.objects.create(id=1, name="Test Network")
        self.owner = OwnerOnboarding.objects.create(
            id=1,
            user=self.owner_user,
            phone_number="0400000001",
            role="PHARMACIST",
        )

        # Pharmacy A & Pharmacy B (same owner network)
        self.pharmacy_a = Pharmacy.objects.create(
            id=1,
            name="Pharmacy Alpha",
            owner=self.owner,
            organization=self.org,
            timezone="Australia/Sydney",
        )
        self.pharmacy_b = Pharmacy.objects.create(
            id=2,
            name="Pharmacy Beta",
            owner=self.owner,
            organization=self.org,
            timezone="Australia/Sydney",
        )

        # Manager A for Pharmacy Alpha
        self.admin_a = PharmacyAdmin.objects.create(
            id=1,
            user=self.manager_a_user,
            pharmacy=self.pharmacy_a,
            admin_level=PharmacyAdmin.AdminLevel.MANAGER,
            is_active=True,
        )

        # Manager B for Pharmacy Beta
        self.admin_b = PharmacyAdmin.objects.create(
            id=2,
            user=self.manager_b_user,
            pharmacy=self.pharmacy_b,
            admin_level=PharmacyAdmin.AdminLevel.MANAGER,
            is_active=True,
        )

        # Kiosk for Alpha
        self.kiosk_a, _ = activate_kiosk_device(self.owner_user, self.pharmacy_a, "Alpha Counter")

        # Memberships: Worker local to Alpha; Cross-worker member at Beta
        self.mem_alpha = Membership.objects.create(
            id=1,
            user=self.worker_user,
            pharmacy=self.pharmacy_a,
            role="PHARMACIST",
            employment_type="FULL_TIME",
            status=Membership.Status.ACCEPTED,
            is_active=True,
        )
        self.mem_beta = Membership.objects.create(
            id=2,
            user=self.cross_worker_user,
            pharmacy=self.pharmacy_b,
            role="TECHNICIAN",
            employment_type="PART_TIME",
            status=Membership.Status.ACCEPTED,
            is_active=True,
        )

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

    # -------------------------------------------------------------------------
    # 1. Approval and Backfill
    # -------------------------------------------------------------------------
    def test_destination_manager_approves_and_backfills(self):
        qr = generate_signed_pharmacy_qr(self.kiosk_a)
        session, in_event = clock_in(self.worker_user, self.pharmacy_a, signed_qr_token=qr["signed_token"])
        prov = ProvisionalAttendance.objects.get(session=session)

        # Manager A of Alpha approves
        approved_prov = approve_provisional_attendance(
            self.manager_a_user,
            prov.id,
            reason="Approved unscheduled shift after phone confirmation.",
        )

        self.assertEqual(approved_prov.status, ProvisionalAttendance.Status.APPROVED)
        self.assertEqual(approved_prov.decided_by, self.manager_a_user)
        self.assertIsNotNone(approved_prov.decided_at)

        # Backfill records exist and link
        shift = approved_prov.backfill_shift
        slot = approved_prov.backfill_assignment.slot
        assignment = approved_prov.backfill_assignment

        self.assertIsNotNone(shift)
        self.assertEqual(shift.pharmacy, self.pharmacy_a)
        self.assertEqual(shift.role_needed, "PHARMACIST")
        self.assertEqual(slot.date, session.started_at.date())
        self.assertEqual(assignment.user, self.worker_user)
        self.assertFalse(assignment.is_rostered)

        session.refresh_from_db()
        self.assertEqual(session.assignment_id, assignment.id)

    def test_wrong_site_manager_denied_approval(self):
        qr = generate_signed_pharmacy_qr(self.kiosk_a)
        session, _ = clock_in(self.worker_user, self.pharmacy_a, signed_qr_token=qr["signed_token"])
        prov = ProvisionalAttendance.objects.get(session=session)

        # Manager B of Beta attempts to approve Alpha session -> Denied
        with self.assertRaises(PermissionDenied) as ctx:
            approve_provisional_attendance(self.manager_b_user, prov.id)
        self.assertIn("Wrong-site manager", str(ctx.exception))

    def test_duplicate_approval_is_idempotent(self):
        qr = generate_signed_pharmacy_qr(self.kiosk_a)
        session, _ = clock_in(self.worker_user, self.pharmacy_a, signed_qr_token=qr["signed_token"])
        prov = ProvisionalAttendance.objects.get(session=session)

        p1 = approve_provisional_attendance(self.manager_a_user, prov.id, reason="Initial approval")
        shift_count_after_first = Shift.objects.count()

        # Second approval call returns same record without creating new shift
        p2 = approve_provisional_attendance(self.manager_a_user, prov.id, reason="Retry approval")
        self.assertEqual(p1.id, p2.id)
        self.assertEqual(Shift.objects.count(), shift_count_after_first)

    def test_no_permanent_membership_created_on_approval(self):
        """Cross-site worker approved at destination pharmacy does NOT receive permanent membership."""
        qr = generate_signed_pharmacy_qr(self.kiosk_a)
        session, _ = clock_in(self.cross_worker_user, self.pharmacy_a, signed_qr_token=qr["signed_token"])
        prov = ProvisionalAttendance.objects.get(session=session)

        self.assertEqual(prov.cover_type, ProvisionalAttendance.CoverType.CROSS_SITE_CHAIN)
        self.assertEqual(
            Membership.objects.filter(user=self.cross_worker_user, pharmacy=self.pharmacy_a).count(),
            0,
        )

        approve_provisional_attendance(self.manager_a_user, prov.id)

        # Still strictly 0 memberships at destination pharmacy
        self.assertEqual(
            Membership.objects.filter(user=self.cross_worker_user, pharmacy=self.pharmacy_a).count(),
            0,
        )

    # -------------------------------------------------------------------------
    # 2. Rejection with Audit Preservation
    # -------------------------------------------------------------------------
    def test_rejection_retains_evidence(self):
        qr = generate_signed_pharmacy_qr(self.kiosk_a)
        session, in_event = clock_in(self.worker_user, self.pharmacy_a, signed_qr_token=qr["signed_token"])
        prov = ProvisionalAttendance.objects.get(session=session)

        rejected_prov = reject_provisional_attendance(
            self.manager_a_user,
            prov.id,
            reason="Unapproved early arrival without manager permission.",
        )

        self.assertEqual(rejected_prov.status, ProvisionalAttendance.Status.REJECTED)
        self.assertEqual(rejected_prov.decided_by, self.manager_a_user)
        self.assertIsNotNone(rejected_prov.decided_at)
        self.assertEqual(rejected_prov.decision_reason, "Unapproved early arrival without manager permission.")

        # Raw session and events intact
        self.assertTrue(AttendanceSession.objects.filter(id=session.id).exists())
        self.assertTrue(AttendanceEvent.objects.filter(session_id=session.id).exists())

    def test_cannot_approve_rejected_attendance(self):
        qr = generate_signed_pharmacy_qr(self.kiosk_a)
        session, _ = clock_in(self.worker_user, self.pharmacy_a, signed_qr_token=qr["signed_token"])
        prov = ProvisionalAttendance.objects.get(session=session)

        reject_provisional_attendance(self.manager_a_user, prov.id, reason="Rejected")

        with self.assertRaises(ValidationError) as ctx:
            approve_provisional_attendance(self.manager_a_user, prov.id)
        self.assertIn("already rejected", str(ctx.exception))

    def test_cannot_reject_approved_attendance(self):
        qr = generate_signed_pharmacy_qr(self.kiosk_a)
        session, _ = clock_in(self.worker_user, self.pharmacy_a, signed_qr_token=qr["signed_token"])
        prov = ProvisionalAttendance.objects.get(session=session)

        approve_provisional_attendance(self.manager_a_user, prov.id)

        with self.assertRaises(ValidationError) as ctx:
            reject_provisional_attendance(self.manager_a_user, prov.id, reason="Try reject")
        self.assertIn("already approved", str(ctx.exception))

    # -------------------------------------------------------------------------
    # 3. Manual Manager Corrections & Effective Timeline
    # -------------------------------------------------------------------------
    def test_append_only_manager_correction_preserves_original_event(self):
        qr = generate_signed_pharmacy_qr(self.kiosk_a)
        session, in_event = clock_in(self.worker_user, self.pharmacy_a, signed_qr_token=qr["signed_token"])
        original_time = in_event.occurred_at
        adjusted_time = original_time - timedelta(minutes=15)

        corr = create_attendance_correction(
            self.manager_a_user,
            in_event.id,
            corrected_timestamp=adjusted_time,
            reason="Worker arrived at 08:45 but kiosk app was restarting.",
        )

        self.assertEqual(corr.original_event_id, in_event.id)
        self.assertEqual(corr.corrected_timestamp, adjusted_time)
        self.assertEqual(corr.corrected_by, self.manager_a_user)

        # Original event was NEVER modified
        in_event.refresh_from_db()
        self.assertEqual(in_event.occurred_at, original_time)

    def test_wrong_site_manager_denied_correction(self):
        qr = generate_signed_pharmacy_qr(self.kiosk_a)
        session, in_event = clock_in(self.worker_user, self.pharmacy_a, signed_qr_token=qr["signed_token"])

        with self.assertRaises(PermissionDenied):
            create_attendance_correction(
                self.manager_b_user,
                in_event.id,
                corrected_timestamp=timezone.now(),
                reason="Wrong manager correcting event",
            )

    def test_effective_session_timeline_resolution(self):
        qr = generate_signed_pharmacy_qr(self.kiosk_a)
        session, in_event = clock_in(self.worker_user, self.pharmacy_a, signed_qr_token=qr["signed_token"])
        clock_out(self.worker_user, signed_qr_token=qr["signed_token"])

        # Create correction on in_event
        corrected_in = in_event.occurred_at - timedelta(minutes=10)
        create_attendance_correction(
            self.manager_a_user,
            in_event.id,
            corrected_timestamp=corrected_in,
            reason="Arrival adjusted",
        )

        timeline = get_effective_session_timeline(session)
        self.assertEqual(len(timeline), 2)

        # Clock-in event is corrected
        self.assertTrue(timeline[0]["is_corrected"])
        self.assertEqual(timeline[0]["effective_timestamp"], corrected_in)
        self.assertEqual(timeline[0]["original_timestamp"], in_event.occurred_at)

        # Clock-out event is uncorrected
        self.assertFalse(timeline[1]["is_corrected"])
        self.assertEqual(timeline[1]["effective_timestamp"], timeline[1]["original_timestamp"])

    # -------------------------------------------------------------------------
    # 4. Pending Review Listing
    # -------------------------------------------------------------------------
    def test_get_pending_provisional_attendances(self):
        qr = generate_signed_pharmacy_qr(self.kiosk_a)
        session, _ = clock_in(self.worker_user, self.pharmacy_a, signed_qr_token=qr["signed_token"])

        pending = get_pending_provisional_attendances(self.manager_a_user, self.pharmacy_a)
        self.assertEqual(pending.count(), 1)
        self.assertEqual(pending.first().session.id, session.id)

        # Unauthorized manager denied
        with self.assertRaises(PermissionDenied):
            get_pending_provisional_attendances(self.manager_b_user, self.pharmacy_a)


if __name__ == "__main__":
    unittest.main()
