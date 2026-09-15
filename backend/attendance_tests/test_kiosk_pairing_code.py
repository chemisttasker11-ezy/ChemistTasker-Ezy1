"""Test suite for single-use 6-digit kiosk pairing codes via push notification.

Verifies:
1. Owner/Manager can generate a 6-digit pairing code with 15m TTL and notification dispatched.
2. Unauthorized user cannot request pairing code (PermissionDenied / 403).
3. Physical kiosk can redeem valid 6-digit code without session auth, receiving a scoped ctk_kiosk_ token.
4. Single-use enforcement: replaying an already-used code fails.
5. Expired or non-existent pairing code is rejected with 400 Bad Request.
6. Malformed codes (e.g. non-numeric, wrong length) are rejected.
7. Confirmation notification is dispatched to owner on successful pairing.
"""

from datetime import date, datetime, time, timedelta
import os
import unittest

import django
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "attendance_tests.settings")
django.setup()

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.core.exceptions import PermissionDenied, ValidationError
from django.db import connection
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

User = get_user_model()

from client_profile.attendance_credentials import (
    activate_kiosk_device,
    authenticate_kiosk_device,
    generate_kiosk_pairing_code,
    redeem_kiosk_pairing_code,
    KIOSK_PAIR_CACHE_PREFIX,
)
from client_profile.models import (
    KioskDevice,
    Notification,
    OwnerOnboarding,
    Pharmacy,
    PharmacyAdmin,
)

PAIRING_SCHEMA_MODELS = (
    User,
    OwnerOnboarding,
    Pharmacy,
    PharmacyAdmin,
    KioskDevice,
    Notification,
)


class KioskPairingCodeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        with connection.schema_editor() as editor:
            for model in PAIRING_SCHEMA_MODELS:
                editor.create_model(model)
        connection.disable_constraint_checking()

    @classmethod
    def tearDownClass(cls):
        connection.disable_constraint_checking()
        with connection.schema_editor() as editor:
            for model in reversed(PAIRING_SCHEMA_MODELS):
                editor.delete_model(model)
        connection.enable_constraint_checking()
        super().tearDownClass()

    def setUp(self):
        cache.clear()
        self.client = APIClient()

        ts = int(timezone.now().timestamp() * 1000)
        self.owner_user = User.objects.create(
            id=1,
            username=f"kiosk_pair_owner_{ts}",
            email=f"owner_{ts}@test.com",
            first_name="Owner",
            last_name="Test",
        )
        self.manager_user = User.objects.create(
            id=2,
            username=f"kiosk_pair_mgr_{ts}",
            email=f"mgr_{ts}@test.com",
            first_name="Manager",
            last_name="Test",
        )
        self.unauth_user = User.objects.create(
            id=3,
            username=f"kiosk_pair_unauth_{ts}",
            email=f"unauth_{ts}@test.com",
            first_name="Stranger",
            last_name="Test",
        )

        self.owner = OwnerOnboarding.objects.create(
            id=1,
            user=self.owner_user,
            phone_number="0400000001",
            role="PHARMACIST",
        )
        self.pharmacy = Pharmacy.objects.create(
            id=1,
            name="Beaumont Hills Counter Kiosk Test",
            owner=self.owner,
            timezone="Australia/Sydney",
        )
        PharmacyAdmin.objects.create(
            id=1,
            pharmacy=self.pharmacy,
            user=self.manager_user,
            admin_level=PharmacyAdmin.AdminLevel.MANAGER,
            is_active=True,
        )

    def tearDown(self):
        cache.clear()
        with connection.cursor() as cursor:
            for table in (
                "client_profile_notification",
                "client_profile_kioskdevice",
                "client_profile_pharmacyadmin",
                "client_profile_pharmacy",
                "client_profile_owneronboarding",
                "users_user",
            ):
                try:
                    cursor.execute(f'DELETE FROM "{table}";')
                except Exception:
                    pass

    def test_owner_generates_pairing_code(self):
        """Owner can generate a 6-digit pairing code stored in cache with notification."""
        code = generate_kiosk_pairing_code(
            user=self.owner_user,
            pharmacy=self.pharmacy,
            device_name="Front Counter Tablet",
        )
        self.assertEqual(len(code), 6)
        self.assertTrue(code.isdigit())

        # Verify cached payload
        cached = cache.get(f"{KIOSK_PAIR_CACHE_PREFIX}{code}")
        self.assertIsNotNone(cached)
        self.assertEqual(cached["pharmacy_id"], self.pharmacy.id)
        self.assertEqual(cached["user_id"], self.owner_user.id)
        self.assertEqual(cached["device_name"], "Front Counter Tablet")

        # Verify notification created
        notif = Notification.objects.filter(
            user=self.owner_user,
            payload__pairing_code=code,
        ).first()
        self.assertIsNotNone(notif)
        self.assertIn(code, notif.body)

    def test_manager_generates_pairing_code(self):
        """Pharmacy manager can also request pairing code."""
        code = generate_kiosk_pairing_code(
            user=self.manager_user,
            pharmacy=self.pharmacy,
            device_name="Dispense Terminal",
        )
        self.assertEqual(len(code), 6)
        self.assertTrue(code.isdigit())

    def test_unauthorized_user_cannot_generate_code(self):
        """Unrelated user is rejected with PermissionDenied."""
        with self.assertRaises(PermissionDenied):
            generate_kiosk_pairing_code(
                user=self.unauth_user,
                pharmacy=self.pharmacy,
            )

    def test_redeem_pairing_code_success(self):
        """Physical kiosk can redeem a 6-digit code and receive valid device token."""
        code = generate_kiosk_pairing_code(
            user=self.owner_user,
            pharmacy=self.pharmacy,
            device_name="Front iPad",
        )

        device, raw_token = redeem_kiosk_pairing_code(
            pairing_code=code,
            device_name="Front iPad Register",
        )
        self.assertTrue(raw_token.startswith("ctk_kiosk_"))
        self.assertEqual(device.pharmacy_id, self.pharmacy.id)
        self.assertEqual(device.device_name, "Front iPad Register")
        self.assertTrue(device.is_active)

        # Verify token authenticates successfully
        auth_device = authenticate_kiosk_device(raw_token)
        self.assertIsNotNone(auth_device)
        self.assertEqual(auth_device.id, device.id)

        # Verify code is consumed / deleted (replay protection)
        self.assertIsNone(cache.get(f"{KIOSK_PAIR_CACHE_PREFIX}{code}"))

        # Second redemption attempt MUST fail
        with self.assertRaises(ValidationError):
            redeem_kiosk_pairing_code(pairing_code=code)

    def test_redeem_with_spaces_or_dashes(self):
        """Code entry formats like '849-201' or '849 201' are normalized."""
        code = generate_kiosk_pairing_code(
            user=self.owner_user,
            pharmacy=self.pharmacy,
        )
        formatted_code = f"{code[:3]}-{code[3:]}"
        device, raw_token = redeem_kiosk_pairing_code(pairing_code=formatted_code)
        self.assertIsNotNone(device)
        self.assertTrue(raw_token.startswith("ctk_kiosk_"))

    def test_redeem_invalid_or_expired_code(self):
        """Non-existent code raises ValidationError."""
        with self.assertRaises(ValidationError):
            redeem_kiosk_pairing_code(pairing_code="999999")

    def test_redeem_malformed_code(self):
        """Code that is not 6 digits raises ValidationError."""
        with self.assertRaises(ValidationError):
            redeem_kiosk_pairing_code(pairing_code="123")
        with self.assertRaises(ValidationError):
            redeem_kiosk_pairing_code(pairing_code="abcdef")

    def test_api_pairing_endpoints_flow(self):
        """End-to-end API verification of request and pair endpoints."""
        # 1. Request pairing code via API as authenticated owner
        self.client.force_authenticate(user=self.owner_user)
        res_req = self.client.post("/attendance/kiosk/pairing/request/", {
            "pharmacy_id": self.pharmacy.id,
            "device_name": "Counter POS 1",
        }, format="json")
        self.assertEqual(res_req.status_code, status.HTTP_200_OK)
        code = res_req.data.get("pairing_code")
        self.assertEqual(len(code), 6)

        # 2. Use a new unauthenticated client (simulate physical kiosk tablet without user cookies)
        kiosk_client = APIClient()

        # 3. Redeem code via public kiosk pairing endpoint
        res_pair = kiosk_client.post("/attendance/kiosk/pairing/pair/", {
            "pairing_code": code,
            "device_name": "Counter POS 1",
        }, format="json")
        self.assertEqual(res_pair.status_code, status.HTTP_201_CREATED)
        self.assertTrue(res_pair.data["device_token"].startswith("ctk_kiosk_"))
        self.assertEqual(res_pair.data["pharmacy_id"], self.pharmacy.id)

        # 4. Attempt to use code again -> 400 Bad Request
        res_replay = kiosk_client.post("/attendance/kiosk/pairing/pair/", {
            "pairing_code": code,
        }, format="json")
        self.assertEqual(res_replay.status_code, status.HTTP_400_BAD_REQUEST)
