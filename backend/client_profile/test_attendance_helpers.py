from datetime import timedelta
from unittest.mock import patch

from django.core.exceptions import ValidationError
from django.test import SimpleTestCase
from django.utils import timezone

from client_profile.models import PharmacyQRSession, WorkerPIN


class AttendanceCredentialTests(SimpleTestCase):
    def test_qr_expires_at_exact_deadline(self):
        deadline = timezone.now()
        qr = PharmacyQRSession(expires_at=deadline)
        with patch("client_profile.models.timezone.now", return_value=deadline):
            self.assertTrue(qr.is_expired)
        with patch("client_profile.models.timezone.now", return_value=deadline - timedelta(microseconds=1)):
            self.assertFalse(qr.is_expired)

    def test_pin_is_hashed_and_preserves_leading_zero(self):
        pin = WorkerPIN()
        pin.set_pin("012345")
        self.assertNotEqual(pin.pin_hash, "012345")
        self.assertTrue(pin.check_pin("012345"))
        self.assertFalse(pin.check_pin("12345"))
        self.assertFalse(pin.check_pin(None))

    def test_disabled_and_locked_codes_are_rejected(self):
        pin = WorkerPIN()
        pin.set_pin("012345")
        pin.is_enabled = False
        self.assertFalse(pin.check_pin("012345"))
        pin.is_enabled = True
        pin.locked_until = timezone.now() + timedelta(minutes=1)
        self.assertFalse(pin.check_pin("012345"))

    def test_lock_expires_at_deadline(self):
        now = timezone.now()
        pin = WorkerPIN(locked_until=now)
        with patch("client_profile.models.timezone.now", return_value=now):
            self.assertFalse(pin.is_locked)

    def test_setting_code_resets_attempts_without_enabling_it(self):
        pin = WorkerPIN(is_enabled=False, failed_attempts=5, locked_until=timezone.now())
        pin.set_pin("012345")
        self.assertEqual(pin.failed_attempts, 0)
        self.assertIsNone(pin.locked_until)
        self.assertFalse(pin.is_enabled)

    def test_empty_or_non_string_code_is_rejected(self):
        for raw_pin in (None, "", "  ", 123456):
            with self.subTest(raw_pin=raw_pin), self.assertRaises(ValidationError):
                WorkerPIN().set_pin(raw_pin)
