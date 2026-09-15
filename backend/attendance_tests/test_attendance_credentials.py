"""Isolated unit tests for Kiosk, Signed QR, and Worker PIN credential services.

Runs strictly in-memory using disposable SQLite under attendance_tests.settings.
Does not touch core.settings, unapplied migrations, or the configured database.
"""

import os
import unittest
from datetime import timedelta
from unittest.mock import patch

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "attendance_tests.settings")

import django
django.setup()

from django.contrib.auth import get_user_model
from django.core.exceptions import PermissionDenied, ValidationError
from django.db import connection
from django.utils import timezone

from client_profile.attendance_credentials import (
    activate_kiosk_device,
    authenticate_kiosk_device,
    generate_signed_pharmacy_qr,
    revoke_kiosk_device,
    set_worker_personal_code,
    toggle_worker_personal_code,
    verify_kiosk_worker_pin,
    verify_signed_pharmacy_qr,
)
from client_profile.models import (
    Chain,
    KioskDevice,
    Membership,
    Organization,
    OwnerOnboarding,
    Pharmacy,
    PharmacyAdmin,
    PharmacyQRSession,
    WorkerPIN,
)

User = get_user_model()

CREDENTIAL_SCHEMA_MODELS = (
    User,
    Organization,
    OwnerOnboarding,
    Pharmacy,
    PharmacyAdmin,
    Chain,
    Membership,
    KioskDevice,
    PharmacyQRSession,
    WorkerPIN,
)


class AttendanceCredentialsTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        with connection.schema_editor() as editor:
            for model in CREDENTIAL_SCHEMA_MODELS:
                editor.create_model(model)
        connection.disable_constraint_checking()

    @classmethod
    def tearDownClass(cls):
        connection.disable_constraint_checking()
        with connection.schema_editor() as editor:
            for model in reversed(CREDENTIAL_SCHEMA_MODELS):
                editor.delete_model(model)
        connection.enable_constraint_checking()
        super().tearDownClass()

    def setUp(self):
        # Users
        self.owner_user = User.objects.create(id=1, username="owner@test.com", email="owner@test.com")
        self.manager_user = User.objects.create(id=2, username="mgr@test.com", email="mgr@test.com")
        self.worker_user = User.objects.create(id=3, username="worker@test.com", email="worker@test.com")
        self.cross_worker_user = User.objects.create(id=4, username="cross@test.com", email="cross@test.com")
        self.unauth_user = User.objects.create(id=5, username="intruder@test.com", email="intruder@test.com")

        # Owner onboarding & Org
        self.org = Organization.objects.create(id=1, name="Test Pharmacy Network")
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

        # Manager Admin
        self.admin_record = PharmacyAdmin.objects.create(
            id=1,
            user=self.manager_user,
            pharmacy=self.pharmacy_a,
            admin_level=PharmacyAdmin.AdminLevel.MANAGER,
            is_active=True,
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

    def tearDown(self):
        with connection.cursor() as cursor:
            for table in (
                "client_profile_workerpin",
                "client_profile_pharmacyqrsession",
                "client_profile_kioskdevice",
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
    # 1. Kiosk Device Activation & Revocation
    # -------------------------------------------------------------------------
    def test_owner_and_manager_can_activate_kiosk(self):
        # Owner activates
        device1, token1 = activate_kiosk_device(self.owner_user, self.pharmacy_a, "Front Counter iPad")
        self.assertTrue(token1.startswith("ctk_kiosk_"))
        self.assertTrue(device1.is_active)
        self.assertEqual(device1.device_name, "Front Counter iPad")
        self.assertEqual(device1.activated_by, self.owner_user)

        # Manager activates
        device2, token2 = activate_kiosk_device(self.manager_user, self.pharmacy_a, "Dispense Terminal")
        self.assertTrue(device2.is_active)
        self.assertEqual(device2.activated_by, self.manager_user)

        # Authenticate with token
        auth_device = authenticate_kiosk_device(token1)
        self.assertIsNotNone(auth_device)
        self.assertEqual(auth_device.id, device1.id)

    def test_unauthorized_user_cannot_activate_kiosk(self):
        with self.assertRaises(PermissionDenied):
            activate_kiosk_device(self.unauth_user, self.pharmacy_a, "Hacker Device")

    def test_kiosk_revocation_disables_authentication(self):
        device, token = activate_kiosk_device(self.owner_user, self.pharmacy_a, "Counter Tablet")
        self.assertIsNotNone(authenticate_kiosk_device(token))

        revoke_kiosk_device(self.owner_user, device)
        device.refresh_from_db()
        self.assertFalse(device.is_active)

        # Authentication immediately fails for revoked token
        self.assertIsNone(authenticate_kiosk_device(token))

    def test_unauthorized_revocation_rejected(self):
        device, token = activate_kiosk_device(self.owner_user, self.pharmacy_a, "Counter Tablet")
        with self.assertRaises(PermissionDenied):
            revoke_kiosk_device(self.unauth_user, device)

    # -------------------------------------------------------------------------
    # 2. Signed Rotating Pharmacy QR
    # -------------------------------------------------------------------------
    def test_generate_and_verify_signed_qr(self):
        device, _ = activate_kiosk_device(self.owner_user, self.pharmacy_a, "Kiosk 1")
        qr_info = generate_signed_pharmacy_qr(device, ttl_seconds=60)

        signed_token = qr_info["signed_token"]
        self.assertTrue(signed_token)
        self.assertEqual(qr_info["pharmacy_id"], self.pharmacy_a.id)

        # Verification succeeds
        valid, qr_session, reason = verify_signed_pharmacy_qr(signed_token, expected_pharmacy_id=self.pharmacy_a.id)
        self.assertTrue(valid)
        self.assertIsNotNone(qr_session)
        self.assertIsNone(reason)

    def test_multiple_workers_can_use_same_active_qr(self):
        device, _ = activate_kiosk_device(self.owner_user, self.pharmacy_a, "Kiosk 1")
        qr_info = generate_signed_pharmacy_qr(device, ttl_seconds=60)
        token = qr_info["signed_token"]

        # Worker 1 verifies
        v1, s1, _ = verify_signed_pharmacy_qr(token, expected_pharmacy_id=self.pharmacy_a.id)
        # Worker 2 verifies with same token
        v2, s2, _ = verify_signed_pharmacy_qr(token, expected_pharmacy_id=self.pharmacy_a.id)

        self.assertTrue(v1)
        self.assertTrue(v2)
        self.assertEqual(s1.id, s2.id)

    def test_qr_expires_at_exact_deadline(self):
        device, _ = activate_kiosk_device(self.owner_user, self.pharmacy_a, "Kiosk 1")
        now = timezone.now()
        qr_info = generate_signed_pharmacy_qr(device, ttl_seconds=60)
        token = qr_info["signed_token"]
        expires_at = qr_info["expires_at"]

        # 1 microsecond before deadline -> Valid
        with patch("client_profile.models.timezone.now", return_value=expires_at - timedelta(microseconds=1)):
            valid, _, _ = verify_signed_pharmacy_qr(token, expected_pharmacy_id=self.pharmacy_a.id)
            self.assertTrue(valid)

        # At exact deadline -> Expired
        with patch("client_profile.models.timezone.now", return_value=expires_at):
            valid, _, reason = verify_signed_pharmacy_qr(token, expected_pharmacy_id=self.pharmacy_a.id)
            self.assertFalse(valid)
            self.assertEqual(reason, "QR_EXPIRED")

    def test_tampered_qr_signature_is_rejected(self):
        device, _ = activate_kiosk_device(self.owner_user, self.pharmacy_a, "Kiosk 1")
        qr_info = generate_signed_pharmacy_qr(device)
        tampered_token = qr_info["signed_token"] + "xyz_tampered"

        valid, session, reason = verify_signed_pharmacy_qr(tampered_token, expected_pharmacy_id=self.pharmacy_a.id)
        self.assertFalse(valid)
        self.assertIsNone(session)
        self.assertEqual(reason, "TAMPERED_OR_INVALID_SIGNATURE")

    def test_cross_pharmacy_qr_isolation(self):
        device_a, _ = activate_kiosk_device(self.owner_user, self.pharmacy_a, "Kiosk Alpha")
        qr_info = generate_signed_pharmacy_qr(device_a)

        # Presented to Pharmacy Beta context
        valid, _, reason = verify_signed_pharmacy_qr(qr_info["signed_token"], expected_pharmacy_id=self.pharmacy_b.id)
        self.assertFalse(valid)
        self.assertEqual(reason, "PHARMACY_CONTEXT_MISMATCH")

    def test_revoked_kiosk_cannot_generate_qr(self):
        device, _ = activate_kiosk_device(self.owner_user, self.pharmacy_a, "Kiosk Alpha")
        revoke_kiosk_device(self.owner_user, device)

        with self.assertRaises(ValidationError):
            generate_signed_pharmacy_qr(device)

    # -------------------------------------------------------------------------
    # 3. Worker Personal Code (PIN) Lifecycle & Verification
    # -------------------------------------------------------------------------
    def test_set_and_verify_local_worker_pin(self):
        device, _ = activate_kiosk_device(self.owner_user, self.pharmacy_a, "Kiosk Alpha")

        # Owner sets PIN "012345"
        pin_obj = set_worker_personal_code(self.owner_user, self.local_membership, "012345")
        self.assertTrue(pin_obj.is_enabled)
        self.assertNotEqual(pin_obj.pin_hash, "012345")

        # Worker verifies with email
        valid, mem, reason = verify_kiosk_worker_pin(device, "worker@test.com", "012345")
        self.assertTrue(valid)
        self.assertEqual(mem.id, self.local_membership.id)
        self.assertIsNone(reason)

    def test_cross_site_pin_resolution_without_prefixes(self):
        """Worker from Pharmacy Beta can verify PIN at sister store Pharmacy Alpha."""
        device_a, _ = activate_kiosk_device(self.owner_user, self.pharmacy_a, "Kiosk Alpha")

        # Set PIN for cross-site worker at Pharmacy Beta
        set_worker_personal_code(self.owner_user, self.cross_membership, "987654")

        # Worker inputs email at Pharmacy Alpha kiosk without organizational prefix
        valid, mem, reason = verify_kiosk_worker_pin(device_a, "cross@test.com", "987654")
        self.assertTrue(valid)
        self.assertEqual(mem.id, self.cross_membership.id)
        self.assertIsNone(reason)

    def test_pin_brute_force_lockout_after_five_attempts(self):
        device, _ = activate_kiosk_device(self.owner_user, self.pharmacy_a, "Kiosk Alpha")
        set_worker_personal_code(self.owner_user, self.local_membership, "012345")

        now = timezone.now()

        # 4 consecutive failures
        for attempt in range(1, 5):
            valid, _, reason = verify_kiosk_worker_pin(device, "worker@test.com", "wrong_pin")
            self.assertFalse(valid)
            self.assertEqual(reason, "INVALID_PIN")

        pin_row = WorkerPIN.objects.get(membership=self.local_membership)
        self.assertEqual(pin_row.failed_attempts, 4)
        self.assertIsNone(pin_row.locked_until)

        # 5th failure -> Locks out for 15 minutes
        valid, _, reason = verify_kiosk_worker_pin(device, "worker@test.com", "wrong_pin")
        self.assertFalse(valid)
        self.assertEqual(reason, "PIN_LOCKED")

        pin_row.refresh_from_db()
        self.assertEqual(pin_row.failed_attempts, 5)
        self.assertIsNotNone(pin_row.locked_until)
        lockout_deadline = pin_row.locked_until

        # Additional attempts during lockout do NOT extend the lockout timer
        with patch("client_profile.attendance_credentials.timezone.now", return_value=now + timedelta(minutes=5)):
            valid, _, reason = verify_kiosk_worker_pin(device, "worker@test.com", "012345")
            self.assertFalse(valid)
            self.assertEqual(reason, "PIN_LOCKED")

        pin_row.refresh_from_db()
        self.assertEqual(pin_row.locked_until, lockout_deadline)

    def test_lockout_expires_and_resets_on_next_window(self):
        device, _ = activate_kiosk_device(self.owner_user, self.pharmacy_a, "Kiosk Alpha")
        set_worker_personal_code(self.owner_user, self.local_membership, "012345")

        now = timezone.now()
        # Lock out
        for _ in range(5):
            verify_kiosk_worker_pin(device, "worker@test.com", "wrong_pin")

        # Advance past 15-minute lockout duration
        past_lockout = now + timedelta(minutes=16)
        with patch("client_profile.attendance_credentials.timezone.now", return_value=past_lockout):
            # Now correct PIN succeeds and clears lockout
            valid, mem, reason = verify_kiosk_worker_pin(device, "worker@test.com", "012345")
            self.assertTrue(valid)
            self.assertIsNone(reason)

        pin_row = WorkerPIN.objects.get(membership=self.local_membership)
        self.assertEqual(pin_row.failed_attempts, 0)
        self.assertIsNone(pin_row.locked_until)

    def test_disabled_pin_is_rejected(self):
        device, _ = activate_kiosk_device(self.owner_user, self.pharmacy_a, "Kiosk Alpha")
        set_worker_personal_code(self.owner_user, self.local_membership, "012345")
        toggle_worker_personal_code(self.owner_user, self.local_membership, is_enabled=False)

        valid, _, reason = verify_kiosk_worker_pin(device, "worker@test.com", "012345")
        self.assertFalse(valid)
        self.assertEqual(reason, "PIN_DISABLED")


if __name__ == "__main__":
    unittest.main()
