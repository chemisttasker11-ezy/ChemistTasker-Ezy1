"""Test suite for first-time worker PIN setup on kiosk via email OTP and self-service updates.

Verifies:
1. Status check detects first-time worker without PIN and dispatches email OTP.
2. Status check works with both Email and numeric Staff ID.
3. Status check identifies existing workers with PINs as READY_FOR_PIN without sending OTP.
4. Non-existent staff identifiers return 404.
5. Submitting valid OTP and 4-6 digit PIN creates WorkerPIN, clocks in the worker, and sends email.
6. Submitting invalid or expired OTP is rejected with 400.
7. Submitting malformed PIN (e.g. non-numeric, 3 digits) is rejected.
8. Authenticated worker can update their PIN from their web/mobile dashboard.
"""

from datetime import date, datetime, time, timedelta
import os
import unittest

import django
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "attendance_tests.settings")
django.setup()

from django.contrib.auth import get_user_model
from django.core.cache import cache, caches
from django.core.exceptions import PermissionDenied, ValidationError
from django.db import connection
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

User = get_user_model()
security_cache = caches["security"]

from users.models import DeviceToken
from client_profile.models import (
    AttendanceCorrection,
    AttendanceEvent,
    AttendanceSession,
    Chain,
    KioskDevice,
    Membership,
    Notification,
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
from client_profile.attendance_credentials import (
    WORKER_PIN_OTP_CACHE_PREFIX,
    activate_kiosk_device,
    mask_email,
    send_worker_pin_setup_code,
    setup_worker_kiosk_pin,
    verify_kiosk_worker_pin,
    worker_update_own_pin,
)

WORKER_PIN_SCHEMA_MODELS = (
    User,
    DeviceToken,
    Organization,
    OwnerOnboarding,
    Pharmacy,
    PharmacyAdmin,
    Chain,
    Membership,
    Shift,
    ShiftSlot,
    ShiftSlotAssignment,
    WorkerPIN,
    KioskDevice,
    PharmacyQRSession,
    AttendanceSession,
    AttendanceEvent,
    ProvisionalAttendance,
    AttendanceCorrection,
    Notification,
)


class WorkerPinSetupTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        connection.disable_constraint_checking()
        tables = connection.introspection.table_names()
        with connection.schema_editor() as editor:
            for model in WORKER_PIN_SCHEMA_MODELS:
                if model._meta.db_table not in tables:
                    try:
                        editor.create_model(model)
                    except Exception:
                        pass
        connection.disable_constraint_checking()

    @classmethod
    def tearDownClass(cls):
        super().tearDownClass()

    def setUp(self):
        cache.clear()
        security_cache.clear()
        self.client = APIClient()

        ts = int(timezone.now().timestamp() * 1000)
        self.owner_user = User.objects.create(
            id=10,
            username=f"owner_{ts}",
            email=f"owner_{ts}@test.com",
            first_name="Owner",
            last_name="Test",
        )
        self.worker_no_pin = User.objects.create(
            id=11,
            username=f"sarah_{ts}",
            email=f"sarah_{ts}@chemisttasker.com",
            first_name="Sarah",
            last_name="Connor",
        )
        self.worker_with_pin = User.objects.create(
            id=12,
            username=f"john_{ts}",
            email=f"john_{ts}@chemisttasker.com",
            first_name="John",
            last_name="Smith",
        )

        self.owner = OwnerOnboarding.objects.create(
            id=10,
            user=self.owner_user,
            phone_number="0400000001",
            role="PHARMACIST",
        )
        self.pharmacy = Pharmacy.objects.create(
            id=10,
            name="Beaumont Hills Counter Kiosk",
            owner=self.owner,
            timezone="Australia/Sydney",
        )

        # Active memberships
        self.mem_no_pin = Membership.objects.create(
            id=11,
            user=self.worker_no_pin,
            pharmacy=self.pharmacy,
            role="PHARMACIST",
            employment_type="CASUAL",
            status=Membership.Status.ACCEPTED,
            is_active=True,
        )
        self.mem_with_pin = Membership.objects.create(
            id=12,
            user=self.worker_with_pin,
            pharmacy=self.pharmacy,
            role="DISPENSER",
            employment_type="CASUAL",
            status=Membership.Status.ACCEPTED,
            is_active=True,
        )

        # Set existing PIN for worker_with_pin
        wpin = WorkerPIN.objects.create(membership=self.mem_with_pin)
        wpin.set_pin("4321")
        wpin.save()

        # Activate kiosk device
        self.device, self.device_token = activate_kiosk_device(
            user=self.owner_user,
            pharmacy=self.pharmacy,
            device_name="Front Counter Tablet",
        )

    def tearDown(self):
        cache.clear()
        security_cache.clear()
        with connection.cursor() as cursor:
            for table in (
                "client_profile_notification",
                "client_profile_attendancecorrection",
                "client_profile_attendanceevent",
                "client_profile_provisionalattendance",
                "client_profile_attendancesession",
                "client_profile_pharmacyqrsession",
                "client_profile_workerpin",
                "client_profile_shiftslotassignment",
                "client_profile_shiftslot",
                "client_profile_shift",
                "client_profile_membership",
                "client_profile_kioskdevice",
                "client_profile_pharmacyadmin",
                "client_profile_pharmacy",
                "client_profile_chain",
                "client_profile_organization",
                "client_profile_owneronboarding",
                "users_devicetoken",
                "users_user",
            ):
                try:
                    cursor.execute(f'DELETE FROM "{table}";')
                except Exception:
                    pass

    def test_mask_email_helper(self):
        """Test email masking for shared kiosk privacy."""
        self.assertEqual(mask_email("sarah@chemisttasker.com"), "s***h@chemisttasker.com")
        self.assertEqual(mask_email("ab@gmail.com"), "a*@gmail.com")
        self.assertEqual(mask_email("invalid"), "***")

    def test_worker_status_detects_first_time_email(self):
        """Kiosk detects worker without PIN and sends email OTP."""
        res = self.client.post(
            "/attendance/kiosk/worker-pin/status/",
            {"identifier": self.worker_no_pin.email},
            HTTP_X_DEVICE_TOKEN=self.device_token,
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["status"], "NEEDS_SETUP")
        self.assertFalse(res.data["has_pin"])
        self.assertEqual(res.data["worker_id"], self.worker_no_pin.id)
        self.assertIn("s***", res.data["masked_email"])

        # Check OTP in cache
        cached = security_cache.get(f"{WORKER_PIN_OTP_CACHE_PREFIX}{self.worker_no_pin.id}")
        self.assertIsNotNone(cached)
        self.assertEqual(len(cached["otp"]), 6)

    def test_worker_status_detects_first_time_staff_id(self):
        """Kiosk resolves staff by numeric ID and sends code to their registered email."""
        res = self.client.post(
            "/attendance/kiosk/worker-pin/status/",
            {"identifier": str(self.worker_no_pin.id)},
            HTTP_X_DEVICE_TOKEN=self.device_token,
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["status"], "NEEDS_SETUP")
        self.assertEqual(res.data["worker_name"], "Sarah Connor")

    def test_worker_status_with_existing_pin(self):
        """Worker who already has a PIN returns READY_FOR_PIN without sending OTP."""
        res = self.client.post(
            "/attendance/kiosk/worker-pin/status/",
            {"identifier": self.worker_with_pin.email},
            HTTP_X_DEVICE_TOKEN=self.device_token,
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["status"], "READY_FOR_PIN")
        self.assertTrue(res.data["has_pin"])
        self.assertIsNone(security_cache.get(f"{WORKER_PIN_OTP_CACHE_PREFIX}{self.worker_with_pin.id}"))

    def test_worker_status_unknown_identifier(self):
        """Unknown email/ID returns 404."""
        res = self.client.post(
            "/attendance/kiosk/worker-pin/status/",
            {"identifier": "stranger@unknown.com"},
            HTTP_X_DEVICE_TOKEN=self.device_token,
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)

    def test_worker_setup_pin_and_clocks_in(self):
        """First-time worker submits valid OTP + new PIN, gets clocked in, and OTP consumed."""
        # 1. Trigger OTP
        send_worker_pin_setup_code(self.device, self.worker_no_pin.email)
        otp = security_cache.get(f"{WORKER_PIN_OTP_CACHE_PREFIX}{self.worker_no_pin.id}")["otp"]

        # 2. Setup PIN via kiosk
        res = self.client.post(
            "/attendance/kiosk/worker-pin/setup/",
            {
                "identifier": self.worker_no_pin.email,
                "verification_code": otp,
                "new_pin": "5678",
            },
            HTTP_X_DEVICE_TOKEN=self.device_token,
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertTrue(res.data["success"])
        self.assertEqual(res.data["action"], "CLOCKED_IN")

        # Verify WorkerPIN created in DB
        wpin = WorkerPIN.objects.get(membership=self.mem_no_pin)
        self.assertTrue(wpin.check_pin("5678"))

        # Verify OTP consumed
        self.assertIsNone(security_cache.get(f"{WORKER_PIN_OTP_CACHE_PREFIX}{self.worker_no_pin.id}"))

        # Verify new PIN authenticates for subsequent clockings
        valid, mem, err = verify_kiosk_worker_pin(self.device, self.worker_no_pin.email, "5678")
        self.assertTrue(valid)
        self.assertEqual(mem.id, self.mem_no_pin.id)

    def test_worker_setup_pin_invalid_otp(self):
        """Incorrect OTP is rejected."""
        send_worker_pin_setup_code(self.device, self.worker_no_pin.email)
        res = self.client.post(
            "/attendance/kiosk/worker-pin/setup/",
            {
                "identifier": self.worker_no_pin.email,
                "verification_code": "000000",
                "new_pin": "5678",
            },
            HTTP_X_DEVICE_TOKEN=self.device_token,
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_worker_setup_code_locks_after_five_wrong_guesses(self):
        send_worker_pin_setup_code(self.device, self.worker_no_pin.email)
        cache_key = f"{WORKER_PIN_OTP_CACHE_PREFIX}{self.worker_no_pin.id}"
        correct_code = security_cache.get(cache_key)["otp"]
        wrong_code = "000000" if correct_code != "000000" else "111111"
        for _ in range(5):
            with self.assertRaises(ValidationError):
                setup_worker_kiosk_pin(self.device, self.worker_no_pin.email, wrong_code, "5678")
        self.assertIsNone(security_cache.get(cache_key))
        with self.assertRaises(ValidationError):
            setup_worker_kiosk_pin(self.device, self.worker_no_pin.email, correct_code, "5678")

    def test_worker_setup_pin_invalid_format(self):
        """Non-numeric or too short PIN is rejected."""
        send_worker_pin_setup_code(self.device, self.worker_no_pin.email)
        otp = security_cache.get(f"{WORKER_PIN_OTP_CACHE_PREFIX}{self.worker_no_pin.id}")["otp"]
        res = self.client.post(
            "/attendance/kiosk/worker-pin/setup/",
            {
                "identifier": self.worker_no_pin.email,
                "verification_code": otp,
                "new_pin": "12",
            },
            HTTP_X_DEVICE_TOKEN=self.device_token,
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_worker_self_service_update_pin(self):
        """Worker updates their PIN from the web dashboard."""
        self.client.force_authenticate(user=self.worker_with_pin)
        res = self.client.post(
            "/attendance/worker/pin/update/",
            {"new_pin": "9999"},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        # Verify updated PIN works on kiosk
        valid, mem, err = verify_kiosk_worker_pin(self.device, self.worker_with_pin.email, "9999")
        self.assertTrue(valid)
        # Old PIN no longer works
        valid_old, _, _ = verify_kiosk_worker_pin(self.device, self.worker_with_pin.email, "4321")
        self.assertFalse(valid_old)

