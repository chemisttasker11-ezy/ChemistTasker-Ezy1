import base64
import os
import uuid
from unittest.mock import patch

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "attendance_tests.settings")

import django
django.setup()

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.core.exceptions import ValidationError
from django.test import TestCase

from client_profile.attendance_credentials import (
    WORKER_PIN_OTP_CACHE_PREFIX,
    _pairing_recovery_message,
    activate_kiosk_device,
    authenticate_kiosk_device,
    generate_kiosk_pairing_code,
    redeem_kiosk_pairing_code,
    send_worker_pin_setup_code,
)
from client_profile.models import Membership, Organization, OwnerOnboarding, Pharmacy


class KioskReleaseBlockerTests(TestCase):
    def setUp(self):
        User = get_user_model()
        self.owner = User.objects.create_user(
            username="kiosk_release_owner",
            email="owner@kiosk-release.invalid",
            password="irrelevant",
            role="OWNER",
        )
        self.worker = User.objects.create_user(
            username="kiosk_release_worker",
            email="worker@kiosk-release.invalid",
            password="irrelevant",
            role="PHARMACIST",
        )
        self.org = Organization.objects.create(name="Kiosk Release Test Org")
        profile = OwnerOnboarding.objects.create(
            user=self.owner,
            role="PHARMACIST",
            phone_number="0400000000",
        )
        self.pharmacy = Pharmacy.objects.create(
            owner=profile,
            organization=self.org,
            name="Kiosk Release Test Pharmacy",
            timezone="Australia/Brisbane",
        )
        self.membership = Membership.objects.create(
            user=self.worker,
            pharmacy=self.pharmacy,
            role="PHARMACIST",
            employment_type="FULL_TIME",
            status=Membership.Status.ACCEPTED,
            is_active=True,
        )
        self.web_device, _ = activate_kiosk_device(
            self.owner,
            self.pharmacy,
            "PIN delivery test",
        )
        cache.clear()

    @patch("users.tasks.send_async_email", return_value=None)
    def test_pin_delivery_failure_is_not_reported_as_success(self, _send):
        with self.assertRaises(ValidationError):
            send_worker_pin_setup_code(self.web_device, self.worker.email)
        self.assertIsNone(cache.get(f"{WORKER_PIN_OTP_CACHE_PREFIX}{self.worker.id}"))

    @patch("users.tasks.send_async_email", return_value=1)
    def test_pin_delivery_success_reports_email_channel(self, _send):
        result = send_worker_pin_setup_code(self.web_device, self.worker.email)
        self.assertEqual(result["email_delivery"], "SENT")
        self.assertEqual(result["delivery_channel"], "EMAIL")
        self.assertFalse(result["code_already_sent"])

    def test_native_pairing_can_recover_after_lost_response_without_new_device(self):
        code = generate_kiosk_pairing_code(self.owner, self.pharmacy)
        attempt_id = uuid.uuid4()
        private_key = Ed25519PrivateKey.generate()
        public_key = base64.b64encode(
            private_key.public_key().public_bytes(
                encoding=serialization.Encoding.Raw,
                format=serialization.PublicFormat.Raw,
            )
        ).decode("ascii")
        proof = base64.b64encode(
            private_key.sign(_pairing_recovery_message(code, attempt_id))
        ).decode("ascii")

        first_device, first_token = redeem_kiosk_pairing_code(
            pairing_code=code,
            public_signing_key=public_key,
            platform="windows",
            client_attempt_id=str(attempt_id),
            proof_signature=proof,
        )
        recovered_device, recovered_token = redeem_kiosk_pairing_code(
            pairing_code=code,
            public_signing_key=public_key,
            platform="windows",
            client_attempt_id=str(attempt_id),
            proof_signature=proof,
        )

        self.assertEqual(first_device.pk, recovered_device.pk)
        self.assertNotEqual(first_token, recovered_token)
        self.assertIsNone(authenticate_kiosk_device(first_token))
        self.assertEqual(authenticate_kiosk_device(recovered_token).pk, first_device.pk)
        self.assertEqual(
            type(first_device).objects.filter(pharmacy=self.pharmacy).count(),
            2,  # one web PIN-delivery fixture + one native device
        )

        wrong_attempt = uuid.uuid4()
        wrong_proof = base64.b64encode(
            private_key.sign(_pairing_recovery_message(code, wrong_attempt))
        ).decode("ascii")
        with self.assertRaises(ValidationError):
            redeem_kiosk_pairing_code(
                pairing_code=code,
                public_signing_key=public_key,
                platform="windows",
                client_attempt_id=str(wrong_attempt),
                proof_signature=wrong_proof,
            )
