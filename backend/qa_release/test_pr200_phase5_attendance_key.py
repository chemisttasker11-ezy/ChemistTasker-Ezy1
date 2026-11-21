"""PR200 audit only: B32 assignment-id clock window and key rotation.

Synthetic fixtures only. No production code or migration modifications.
"""
from datetime import datetime, time, timedelta
from zoneinfo import ZoneInfo

from django.test import TestCase, SimpleTestCase, override_settings
from django.utils import timezone
from client_profile.characterization_support import (
    make_owner_with_pharmacy, make_user, make_assignment,
)
from attendance.eligibility import resolve_attendance_eligibility, EligibilityType
from client_profile.fields import EncryptedTextField


class B32AssignmentIdTimeScope(TestCase):
    def setUp(self):
        self.owner, self.pharmacy = make_owner_with_pharmacy("PR200 B32 Time")
        self.worker = make_user("OTHER_STAFF")
        day = timezone.localdate() + timedelta(days=14)
        self.shift, self.slot, self.assignment = make_assignment(
            self.pharmacy, self.owner, self.worker, day=day,
        )
        self.working_time = datetime.combine(day, time(10, 0),
                                             tzinfo=ZoneInfo("Australia/Brisbane"))
        self.outside_time = self.working_time - timedelta(days=10)

    def test_b32_valid_assignment_in_window_positive(self):
        allowed = resolve_attendance_eligibility(
            self.worker, self.pharmacy,
            target_time=self.working_time, assignment_id=self.assignment.pk,
        )
        self.assertTrue(allowed.is_eligible)
        self.assertFalse(allowed.is_provisional)
        self.assertEqual(allowed.eligibility_type, EligibilityType.CONFIRMED_ASSIGNMENT)

    def test_b32_without_id_outside_window_rejected_positive(self):
        denied = resolve_attendance_eligibility(
            self.worker, self.pharmacy, target_time=self.outside_time,
        )
        self.assertFalse(denied.is_eligible)
        self.assertEqual(denied.eligibility_type, EligibilityType.REJECTED)

    def test_b32_explicit_assignment_id_must_obey_time_window(self):
        bypass = resolve_attendance_eligibility(
            self.worker, self.pharmacy,
            target_time=self.outside_time, assignment_id=self.assignment.pk,
        )
        self.assertFalse(
            bypass.is_eligible,
            "Explicit assignment ID must never bypass scheduled clock window.",
        )


class P5EncryptionKeyRotationFailure(SimpleTestCase):
    def test_p5_same_key_roundtrip_positive(self):
        field = EncryptedTextField()
        with override_settings(SECRET_KEY="pr200-field-key-a"):
            token = field.get_prep_value("Synthetic private note")
            self.assertTrue(token.startswith("enc1$"))
            self.assertEqual(field.to_python(token), "Synthetic private note")

    def test_p5_wrong_key_must_not_return_ciphertext_as_plaintext(self):
        field = EncryptedTextField()
        with override_settings(SECRET_KEY="pr200-field-key-a"):
            token = field.get_prep_value("Synthetic private note")
        with override_settings(SECRET_KEY="pr200-field-key-b"):
            read = field.to_python(token)
        self.assertNotEqual(
            read, token,
            "Key rotation must not silently return enc1$ ciphertext as data.",
        )
