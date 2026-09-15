"""Isolated integration tests for Attendance Transitions (Clock-in, Breaks, Clock-out).

Runs strictly in-memory using disposable SQLite under attendance_tests.settings.
Does not touch core.settings, unapplied migrations, or the configured database.
"""

import os
import unittest
from datetime import time, timedelta
from unittest.mock import patch
import zoneinfo

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "attendance_tests.settings")

import django
django.setup()

from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.db import connection
from django.utils import timezone

from client_profile.attendance_credentials import (
    activate_kiosk_device,
    generate_signed_pharmacy_qr,
    set_worker_personal_code,
)
from client_profile.attendance_transitions import (
    clock_in,
    clock_out,
    end_break,
    get_active_session_status,
    start_break,
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

TRANSITION_SCHEMA_MODELS = (
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


class AttendanceTransitionsTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        with connection.schema_editor() as editor:
            for model in TRANSITION_SCHEMA_MODELS:
                editor.create_model(model)
        connection.disable_constraint_checking()

    @classmethod
    def tearDownClass(cls):
        connection.disable_constraint_checking()
        with connection.schema_editor() as editor:
            for model in reversed(TRANSITION_SCHEMA_MODELS):
                editor.delete_model(model)
        connection.enable_constraint_checking()
        super().tearDownClass()

    def setUp(self):
        # Users
        self.owner_user = User.objects.create(id=1, username="owner@test.com", email="owner@test.com")
        self.worker_user = User.objects.create(id=2, username="worker@test.com", email="worker@test.com")
        self.cross_worker_user = User.objects.create(id=3, username="cross@test.com", email="cross@test.com")

        # Owner & Org
        self.org = Organization.objects.create(id=1, name="Care Network")
        self.owner = OwnerOnboarding.objects.create(
            id=1,
            user=self.owner_user,
            phone_number="0400000001",
            role="PHARMACIST",
        )

        # Pharmacy A & Pharmacy B (same owner)
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

        # Kiosks
        self.kiosk_a, self.kiosk_token_a = activate_kiosk_device(
            self.owner_user, self.pharmacy_a, "Alpha Kiosk"
        )
        self.kiosk_b, self.kiosk_token_b = activate_kiosk_device(
            self.owner_user, self.pharmacy_b, "Beta Kiosk"
        )

        # Memberships
        self.local_membership = Membership.objects.create(
            id=1,
            user=self.worker_user,
            pharmacy=self.pharmacy_a,
            role="PHARMACIST",
            employment_type="FULL_TIME",
            status=Membership.Status.ACCEPTED,
            is_active=True,
        )
        self.cross_membership = Membership.objects.create(
            id=2,
            user=self.cross_worker_user,
            pharmacy=self.pharmacy_b,
            role="PHARMACIST",
            employment_type="FULL_TIME",
            status=Membership.Status.ACCEPTED,
            is_active=True,
        )

        # Set personal codes
        set_worker_personal_code(self.owner_user, self.local_membership, "123456")
        set_worker_personal_code(self.owner_user, self.cross_membership, "654321")

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
    # 1. Full Lifecycle with Mobile QR
    # -------------------------------------------------------------------------
    def test_full_attendance_lifecycle_with_qr(self):
        # 1. Generate QR
        qr_data_in = generate_signed_pharmacy_qr(self.kiosk_a)

        # 2. Clock-In
        session, in_event = clock_in(
            self.worker_user,
            self.pharmacy_a,
            signed_qr_token=qr_data_in["signed_token"],
        )
        self.assertIsNotNone(session.id)
        self.assertTrue(session.is_open)
        self.assertIsNone(session.ended_at)
        self.assertEqual(in_event.event_type, AttendanceEvent.EventType.CLOCK_IN)
        self.assertEqual(in_event.source, AttendanceEvent.Source.MOBILE_QR)

        # Check status
        status = get_active_session_status(self.worker_user)
        self.assertIsNotNone(status)
        self.assertEqual(status["session_id"], session.id)
        self.assertFalse(status["is_on_break"])

        # 3. Start Break
        break_start = start_break(self.worker_user)
        self.assertEqual(break_start.event_type, AttendanceEvent.EventType.BREAK_START)
        status = get_active_session_status(self.worker_user)
        self.assertTrue(status["is_on_break"])

        # 4. End Break
        break_end = end_break(self.worker_user)
        self.assertEqual(break_end.event_type, AttendanceEvent.EventType.BREAK_END)
        status = get_active_session_status(self.worker_user)
        self.assertFalse(status["is_on_break"])

        # 5. Clock-Out
        qr_data_out = generate_signed_pharmacy_qr(self.kiosk_a)
        closed_session, out_event = clock_out(
            self.worker_user,
            signed_qr_token=qr_data_out["signed_token"],
        )
        self.assertFalse(closed_session.is_open)
        self.assertIsNotNone(closed_session.ended_at)
        self.assertEqual(out_event.event_type, AttendanceEvent.EventType.CLOCK_OUT)

        # Session is now closed
        self.assertIsNone(get_active_session_status(self.worker_user))

    # -------------------------------------------------------------------------
    # 2. Kiosk PIN Clock-In and Clock-Out
    # -------------------------------------------------------------------------
    def test_kiosk_pin_clock_in_and_clock_out(self):
        session, in_event = clock_in(
            self.worker_user,
            self.pharmacy_a,
            kiosk_device=self.kiosk_a,
            raw_pin="123456",
        )
        self.assertTrue(session.is_open)
        self.assertEqual(in_event.source, AttendanceEvent.Source.KIOSK_PIN)
        self.assertEqual(in_event.device, self.kiosk_a)

        closed_session, out_event = clock_out(
            self.worker_user,
            kiosk_device=self.kiosk_a,
            raw_pin="123456",
        )
        self.assertFalse(closed_session.is_open)
        self.assertEqual(out_event.event_type, AttendanceEvent.EventType.CLOCK_OUT)
        self.assertEqual(out_event.source, AttendanceEvent.Source.KIOSK_PIN)

    # -------------------------------------------------------------------------
    # 3. Provisional Unscheduled Local & Cross-Site Attendance
    # -------------------------------------------------------------------------
    def test_unscheduled_local_staff_creates_provisional_attendance(self):
        qr_data = generate_signed_pharmacy_qr(self.kiosk_a)
        session, _ = clock_in(
            self.worker_user,
            self.pharmacy_a,
            signed_qr_token=qr_data["signed_token"],
        )
        self.assertTrue(session.is_provisional)

        prov = ProvisionalAttendance.objects.get(session=session)
        self.assertEqual(prov.cover_type, ProvisionalAttendance.CoverType.UNROSTERED_LOCAL)
        self.assertEqual(prov.status, ProvisionalAttendance.Status.PENDING)

    def test_cross_site_staff_creates_provisional_attendance(self):
        qr_data = generate_signed_pharmacy_qr(self.kiosk_a)
        session, _ = clock_in(
            self.cross_worker_user,
            self.pharmacy_a,
            signed_qr_token=qr_data["signed_token"],
        )
        self.assertTrue(session.is_provisional)
        self.assertEqual(session.source_membership.id, self.cross_membership.id)

        prov = ProvisionalAttendance.objects.get(session=session)
        self.assertEqual(prov.cover_type, ProvisionalAttendance.CoverType.CROSS_SITE_CHAIN)
        self.assertEqual(prov.status, ProvisionalAttendance.Status.PENDING)

    # -------------------------------------------------------------------------
    # 4. Open Session Invariant & Duplicate Rejection
    # -------------------------------------------------------------------------
    def test_reject_simultaneous_open_sessions_across_pharmacies(self):
        qr_a = generate_signed_pharmacy_qr(self.kiosk_a)
        qr_b = generate_signed_pharmacy_qr(self.kiosk_b)

        # Worker clocks in at Pharmacy A
        clock_in(self.worker_user, self.pharmacy_a, signed_qr_token=qr_a["signed_token"])

        # Attempting to clock in at Pharmacy B while Alpha session is active must fail
        with self.assertRaises(ValidationError) as ctx:
            clock_in(self.worker_user, self.pharmacy_b, signed_qr_token=qr_b["signed_token"])
        self.assertIn("already has an open attendance session", str(ctx.exception))

    def test_idempotent_duplicate_clock_in_within_thirty_seconds(self):
        qr_a = generate_signed_pharmacy_qr(self.kiosk_a)

        s1, e1 = clock_in(self.worker_user, self.pharmacy_a, signed_qr_token=qr_a["signed_token"])
        # Duplicate call within 30s
        s2, e2 = clock_in(self.worker_user, self.pharmacy_a, signed_qr_token=qr_a["signed_token"])

        self.assertEqual(s1.id, s2.id)
        self.assertEqual(e1.id, e2.id)
        self.assertEqual(AttendanceSession.objects.count(), 1)

    # -------------------------------------------------------------------------
    # 5. In-App Break Constraints
    # -------------------------------------------------------------------------
    def test_break_validation_rules(self):
        # Cannot start break when not clocked in
        with self.assertRaises(ValidationError):
            start_break(self.worker_user)

        qr_a = generate_signed_pharmacy_qr(self.kiosk_a)
        clock_in(self.worker_user, self.pharmacy_a, signed_qr_token=qr_a["signed_token"])

        # Start break succeeds
        start_break(self.worker_user)

        # Cannot start another break while already on break
        with self.assertRaises(ValidationError):
            start_break(self.worker_user)

        # End break succeeds
        end_break(self.worker_user)

        # Cannot end break when not on break
        with self.assertRaises(ValidationError):
            end_break(self.worker_user)

    def test_clock_out_while_on_break_auto_closes_break(self):
        qr_a = generate_signed_pharmacy_qr(self.kiosk_a)
        session, _ = clock_in(self.worker_user, self.pharmacy_a, signed_qr_token=qr_a["signed_token"])

        # Start break
        start_break(self.worker_user)

        # Clock out directly
        closed_session, out_event = clock_out(self.worker_user, signed_qr_token=qr_a["signed_token"])
        self.assertFalse(closed_session.is_open)

        # Verify event sequence: CLOCK_IN -> BREAK_START -> BREAK_END -> CLOCK_OUT
        events = list(session.events.order_by("id").values_list("event_type", flat=True))
        self.assertEqual(
            events,
            [
                AttendanceEvent.EventType.CLOCK_IN,
                AttendanceEvent.EventType.BREAK_START,
                AttendanceEvent.EventType.BREAK_END,
                AttendanceEvent.EventType.CLOCK_OUT,
            ],
        )

    # -------------------------------------------------------------------------
    # 6. Overnight Session & Mid-Shift Membership Resilience
    # -------------------------------------------------------------------------
    def test_overnight_session_lifecycle(self):
        t_start = timezone.now().replace(hour=22, minute=0, second=0)
        t_end = t_start + timedelta(hours=8)  # 06:00 next day

        with patch("client_profile.models.timezone.now", return_value=t_start), \
             patch("client_profile.attendance_transitions.timezone.now", return_value=t_start):
            qr_data_start = generate_signed_pharmacy_qr(self.kiosk_a)
            session, in_event = clock_in(
                self.worker_user,
                self.pharmacy_a,
                signed_qr_token=qr_data_start["signed_token"],
            )
            self.assertEqual(session.started_at, t_start)

        with patch("client_profile.models.timezone.now", return_value=t_end), \
             patch("client_profile.attendance_transitions.timezone.now", return_value=t_end):
            qr_data_end = generate_signed_pharmacy_qr(self.kiosk_a)
            closed_session, out_event = clock_out(
                self.worker_user,
                signed_qr_token=qr_data_end["signed_token"],
            )
            self.assertEqual(closed_session.ended_at, t_end)
            self.assertTrue(closed_session.ended_at > closed_session.started_at)

    def test_resilience_to_mid_shift_membership_deactivation(self):
        """Worker membership deactivated mid-shift must NOT strand worker in open session."""
        qr_a = generate_signed_pharmacy_qr(self.kiosk_a)
        session, _ = clock_in(self.worker_user, self.pharmacy_a, signed_qr_token=qr_a["signed_token"])

        # Deactivate membership while session is open
        self.local_membership.is_active = False
        self.local_membership.save(update_fields=["is_active"])

        # Clock-out still succeeds cleanly, closing the session
        closed_session, out_event = clock_out(self.worker_user, signed_qr_token=qr_a["signed_token"])
        self.assertFalse(closed_session.is_open)
        self.assertIsNotNone(closed_session.ended_at)

    # -------------------------------------------------------------------------
    # 7. Negative Credential Rejections
    # -------------------------------------------------------------------------
    def test_reject_clock_in_with_expired_qr(self):
        qr_a = generate_signed_pharmacy_qr(self.kiosk_a)
        now = timezone.now()
        with patch("client_profile.models.timezone.now", return_value=now + timedelta(minutes=10)):
            with self.assertRaises(ValidationError) as ctx:
                clock_in(self.worker_user, self.pharmacy_a, signed_qr_token=qr_a["signed_token"])
            self.assertIn("QR_EXPIRED", str(ctx.exception))

    def test_reject_clock_out_with_wrong_pharmacy_qr(self):
        qr_a = generate_signed_pharmacy_qr(self.kiosk_a)
        qr_b = generate_signed_pharmacy_qr(self.kiosk_b)

        clock_in(self.worker_user, self.pharmacy_a, signed_qr_token=qr_a["signed_token"])

        # Attempt clock-out at Pharmacy A using QR for Pharmacy B
        with self.assertRaises(ValidationError) as ctx:
            clock_out(self.worker_user, signed_qr_token=qr_b["signed_token"])
        self.assertIn("PHARMACY_CONTEXT_MISMATCH", str(ctx.exception))

    def test_reject_clock_in_with_invalid_pin(self):
        with self.assertRaises(ValidationError) as ctx:
            clock_in(
                self.worker_user,
                self.pharmacy_a,
                kiosk_device=self.kiosk_a,
                raw_pin="wrong_pin",
            )
        self.assertIn("PIN verification failed", str(ctx.exception))


if __name__ == "__main__":
    unittest.main()
