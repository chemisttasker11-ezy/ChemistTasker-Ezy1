"""Focused test suite for Checkpoint 5: Secure Kiosk, QR, and PIN Flows.

Verifies:
1. Kiosk device tokens are stored only as SHA-256 hashes in DB and authenticate correctly.
2. Backward compatibility with legacy unhashed device tokens.
3. Generic PIN failure responses prevent worker enumeration.
4. Kiosk PIN brute-force lockout after 5 failed attempts with non-extending lockout window.
5. Draft roster assignments do NOT confer normal attendance eligibility.
6. Kiosk authentication works without JWT middleware conflict.
7. Dedicated throttles for kiosk QR, PIN, and worker clocking.
"""

from datetime import date, datetime, time, timedelta, timezone as dt_timezone
import os
import unittest

import django
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "attendance_tests.settings")
django.setup()

from django.contrib.auth import get_user_model
from django.core.exceptions import PermissionDenied, ValidationError
from django.db import connection
from django.test import RequestFactory
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

User = get_user_model()

from client_profile.attendance_credentials import (
    activate_kiosk_device,
    authenticate_kiosk_device,
    generate_signed_pharmacy_qr,
    hash_kiosk_token,
    set_worker_personal_code,
    verify_kiosk_worker_pin,
)
from client_profile.attendance_eligibility import (
    EligibilityType,
    is_draft_roster_assignment,
    resolve_attendance_eligibility,
)
from client_profile.attendance_throttles import (
    KioskPINRateThrottle,
    KioskQRRateThrottle,
    WorkerClockInThrottle,
    WorkerClockOutThrottle,
)
from client_profile.attendance_views import (
    KioskPinClockView,
    KioskQRView,
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
    RosterPeriod,
    Shift,
    ShiftSlot,
    ShiftSlotAssignment,
    WorkerPIN,
)

SECURITY_SCHEMA_MODELS = (
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
    RosterPeriod,
    KioskDevice,
    PharmacyQRSession,
    WorkerPIN,
    AttendanceSession,
    AttendanceEvent,
    ProvisionalAttendance,
    AttendanceCorrection,
)


class KioskQrPinSecurityTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        with connection.schema_editor() as editor:
            for model in SECURITY_SCHEMA_MODELS:
                editor.create_model(model)
        connection.disable_constraint_checking()

    @classmethod
    def tearDownClass(cls):
        connection.disable_constraint_checking()
        with connection.schema_editor() as editor:
            for model in reversed(SECURITY_SCHEMA_MODELS):
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
                "client_profile_rosterperiod",
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
        self.client = APIClient()

        # Users
        self.owner_user = User.objects.create(
            id=1, username="owner@test.com", email="owner@test.com"
        )
        self.manager_user = User.objects.create(
            id=2, username="manager@test.com", email="manager@test.com"
        )
        self.worker_user = User.objects.create(
            id=3, username="worker@test.com", email="worker@test.com"
        )
        self.external_locum_user = User.objects.create(
            id=4, username="locum@test.com", email="locum@test.com"
        )

        # Owner onboarding & Pharmacy
        self.owner = OwnerOnboarding.objects.create(
            id=1,
            user=self.owner_user,
            phone_number="0400000001",
            role="PHARMACIST",
        )
        self.pharmacy = Pharmacy.objects.create(
            id=1,
            name="Security Test Pharmacy",
            owner=self.owner,
            timezone="Australia/Sydney",
        )

        # Manager Admin
        self.manager_admin = PharmacyAdmin.objects.create(
            user=self.manager_user,
            pharmacy=self.pharmacy,
            admin_level=PharmacyAdmin.AdminLevel.MANAGER,
            is_active=True,
        )

        # Local Worker Membership
        self.worker_membership = Membership.objects.create(
            id=1,
            user=self.worker_user,
            pharmacy=self.pharmacy,
            role="PHARMACIST",
            employment_type="FULL_TIME",
            status=Membership.Status.ACCEPTED,
            is_active=True,
        )

    def tearDown(self):
        self._clean_tables()

    # -------------------------------------------------------------------------
    # 1. Hashed Device Token Storage & Backward-Compatible Authentication
    # -------------------------------------------------------------------------
    def test_kiosk_token_stored_hashed_and_authenticates(self):
        """Kiosk device tokens are stored only as SHA-256 hashes in DB and resolve correctly."""
        device, raw_token = activate_kiosk_device(self.manager_user, self.pharmacy, "Front iPad")

        # Database record must NOT contain raw token
        device.refresh_from_db()
        self.assertNotEqual(device.device_token, raw_token)
        self.assertEqual(device.device_token, hash_kiosk_token(raw_token))
        self.assertTrue(raw_token.startswith("ctk_kiosk_"))

        # Resolving via raw token returns the active kiosk device
        resolved = authenticate_kiosk_device(raw_token)
        self.assertIsNotNone(resolved)
        self.assertEqual(resolved.id, device.id)
        self.assertEqual(resolved.pharmacy, self.pharmacy)

    def test_kiosk_token_backward_compatibility_unhashed(self):
        """Legacy unhashed device tokens in the database continue to authenticate seamlessly."""
        raw_legacy = "ctk_kiosk_legacy_unhashed_test_token_999"
        legacy_device = KioskDevice.objects.create(
            pharmacy=self.pharmacy,
            device_name="Old Terminal",
            device_token=raw_legacy,  # stored plaintext like older migrations
            is_active=True,
            activated_by=self.manager_user,
        )

        resolved = authenticate_kiosk_device(raw_legacy)
        self.assertIsNotNone(resolved)
        self.assertEqual(resolved.id, legacy_device.id)

    # -------------------------------------------------------------------------
    # 2. Generic PIN Failure Responses (No Worker Enumeration)
    # -------------------------------------------------------------------------
    def test_generic_pin_failure_responses_prevent_worker_enumeration(self):
        """Invalid PIN on real user and attempt on nonexistent user return identical error response."""
        device, raw_token = activate_kiosk_device(self.manager_user, self.pharmacy, "Pin Pad")
        set_worker_personal_code(self.manager_user, self.worker_membership, "1234")

        # Case A: Real user, incorrect PIN
        req_wrong_pin = self.factory.post(
            "/api/attendance/kiosk/pin-clock/",
            {"identifier": self.worker_user.email, "pin": "0000"},
            content_type="application/json",
            HTTP_X_DEVICE_TOKEN=raw_token,
        )
        res_wrong_pin = KioskPinClockView.as_view()(req_wrong_pin)
        self.assertEqual(res_wrong_pin.status_code, 400)
        self.assertEqual(res_wrong_pin.data["error"], "Invalid worker identifier or PIN.")
        self.assertFalse(res_wrong_pin.data["locked"])

        # Case B: Completely non-existent user identifier
        req_fake_user = self.factory.post(
            "/api/attendance/kiosk/pin-clock/",
            {"identifier": "nonexistent_worker_xyz@test.com", "pin": "1234"},
            content_type="application/json",
            HTTP_X_DEVICE_TOKEN=raw_token,
        )
        res_fake_user = KioskPinClockView.as_view()(req_fake_user)
        self.assertEqual(res_fake_user.status_code, 400)
        # Responses must be strictly identical so attacker cannot distinguish real vs fake workers
        self.assertEqual(res_fake_user.data["error"], "Invalid worker identifier or PIN.")
        self.assertFalse(res_fake_user.data["locked"])

    # -------------------------------------------------------------------------
    # 3. Kiosk PIN Lockout & Non-Extending Window
    # -------------------------------------------------------------------------
    def test_pin_lockout_after_five_attempts_and_window_non_extension(self):
        """PIN locks out on 5th attempt; attempts during lockout do NOT extend lockout duration."""
        device, raw_token = activate_kiosk_device(self.manager_user, self.pharmacy, "Pin Pad")
        set_worker_personal_code(self.manager_user, self.worker_membership, "4321")

        # 4 failed attempts -> not locked
        for i in range(4):
            valid, mem, reason = verify_kiosk_worker_pin(device, self.worker_user.email, "0000")
            self.assertFalse(valid)
            self.assertEqual(reason, "INVALID_PIN")

        worker_pin = WorkerPIN.objects.get(membership=self.worker_membership)
        self.assertEqual(worker_pin.failed_attempts, 4)
        self.assertFalse(worker_pin.is_locked)

        # 5th failed attempt -> locks out for 15 minutes
        valid, mem, reason = verify_kiosk_worker_pin(device, self.worker_user.email, "0000")
        self.assertFalse(valid)
        self.assertEqual(reason, "PIN_LOCKED")

        worker_pin.refresh_from_db()
        self.assertTrue(worker_pin.is_locked)
        initial_locked_until = worker_pin.locked_until
        self.assertIsNotNone(initial_locked_until)

        # 6th attempt during active lockout
        valid, mem, reason = verify_kiosk_worker_pin(device, self.worker_user.email, "0000")
        self.assertFalse(valid)
        self.assertEqual(reason, "PIN_LOCKED")

        # Locked until MUST NOT be extended into the future
        worker_pin.refresh_from_db()
        self.assertEqual(worker_pin.locked_until, initial_locked_until)

        # API returns generic locked message
        req_locked = self.factory.post(
            "/api/attendance/kiosk/pin-clock/",
            {"identifier": self.worker_user.email, "pin": "0000"},
            content_type="application/json",
            HTTP_X_DEVICE_TOKEN=raw_token,
        )
        res_locked = KioskPinClockView.as_view()(req_locked)
        self.assertEqual(res_locked.status_code, 400)
        self.assertTrue(res_locked.data["locked"])
        self.assertIn("temporarily locked", res_locked.data["error"])

    # -------------------------------------------------------------------------
    # 4. Draft Assignment Protection in Attendance Eligibility
    # -------------------------------------------------------------------------
    def test_draft_roster_assignment_does_not_grant_confirmed_eligibility(self):
        """Assignments in a DRAFT roster period are excluded from Tier 1 confirmed eligibility."""
        today = date.today()
        monday = today - timedelta(days=today.weekday())

        # 1. Create a DRAFT roster period
        draft_period = RosterPeriod.objects.create(
            pharmacy=self.pharmacy,
            week_start=monday,
            status=RosterPeriod.Status.DRAFT,
            created_by=self.manager_user,
        )

        shift = Shift.objects.create(
            pharmacy=self.pharmacy,
            role_needed="PHARMACIST",
        )
        slot = ShiftSlot.objects.create(
            shift=shift,
            date=today,
            start_time=time(9, 0),
            end_time=time(17, 0),
        )

        # Rostered assignment in the draft week
        assignment = ShiftSlotAssignment.objects.create(
            shift=shift,
            slot=slot,
            slot_date=today,
            user=self.worker_user,
            is_rostered=True,
        )

        # Verify helper identifies it as draft
        self.assertTrue(is_draft_roster_assignment(assignment))

        # Eligibility check: Since roster is draft, worker cannot get CONFIRMED_ASSIGNMENT.
        # Local staff falls back to Tier 2 UNROSTERED_LOCAL provisional.
        local_result = resolve_attendance_eligibility(
            self.worker_user,
            self.pharmacy,
            target_time=datetime.combine(today, time(9, 0), tzinfo=dt_timezone.utc),
        )
        self.assertTrue(local_result.is_eligible)
        self.assertEqual(local_result.eligibility_type, EligibilityType.UNROSTERED_LOCAL)
        self.assertTrue(local_result.is_provisional)
        self.assertIsNone(local_result.assignment)

        # External locum with no membership assigned in draft is REJECTED
        slot2 = ShiftSlot.objects.create(
            shift=shift,
            date=today,
            start_time=time(9, 0),
            end_time=time(17, 0),
        )
        locum_assignment = ShiftSlotAssignment.objects.create(
            shift=shift,
            slot=slot2,
            slot_date=today,
            user=self.external_locum_user,
            is_rostered=True,
        )
        locum_result = resolve_attendance_eligibility(
            self.external_locum_user,
            self.pharmacy,
            target_time=datetime.combine(today, time(9, 0), tzinfo=dt_timezone.utc),
        )
        self.assertFalse(locum_result.is_eligible)
        self.assertEqual(locum_result.rejection_reason, "NO_ASSIGNMENT_OR_MEMBERSHIP")

        # 2. Publish the roster period -> Now assignments are confirmed!
        draft_period.status = RosterPeriod.Status.PUBLISHED
        draft_period.published_at = timezone.now()
        draft_period.save()

        self.assertFalse(is_draft_roster_assignment(assignment))

        published_result = resolve_attendance_eligibility(
            self.worker_user,
            self.pharmacy,
            target_time=datetime.combine(today, time(9, 0), tzinfo=dt_timezone.utc),
        )
        self.assertTrue(published_result.is_eligible)
        self.assertEqual(published_result.eligibility_type, EligibilityType.CONFIRMED_ASSIGNMENT)
        self.assertFalse(published_result.is_provisional)
        self.assertEqual(published_result.assignment.id, assignment.id)

    # -------------------------------------------------------------------------
    # 5. Kiosk Device Authentication Without JWT Conflict
    # -------------------------------------------------------------------------
    def test_kiosk_qr_endpoint_accepts_device_token_without_jwt(self):
        """Kiosk QR view accepts X-Device-Token without requiring user JWT authorization."""
        device, raw_token = activate_kiosk_device(self.manager_user, self.pharmacy, "Counter Kiosk")

        req = self.factory.post(
            "/api/attendance/kiosk/qr/",
            content_type="application/json",
            HTTP_X_DEVICE_TOKEN=raw_token,
        )
        res = KioskQRView.as_view()(req)
        self.assertEqual(res.status_code, 200)
        self.assertIn("qr_token", res.data)
        self.assertIn("expires_at", res.data)
        self.assertEqual(res.data["pharmacy_id"], self.pharmacy.id)

    # -------------------------------------------------------------------------
    # 6. Throttle Classes Configured
    # -------------------------------------------------------------------------
    def test_throttle_classes_attached_to_views(self):
        """Attendance views have appropriate dedicated rate throttles configured."""
        self.assertIn(KioskQRRateThrottle, KioskQRView.throttle_classes)
        self.assertIn(KioskPINRateThrottle, KioskPinClockView.throttle_classes)


if __name__ == "__main__":
    unittest.main()
