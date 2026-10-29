"""Review 3 (2026-10-20) repro: each test asserts the wanted behaviour, so a failure confirms the claim."""
from datetime import timedelta
from unittest.mock import patch

from django.core.cache import caches
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework import serializers

from client_profile.characterization_support import make_assignment, make_owner_with_pharmacy
from onboarding.models import AhpraCheck
from onboarding.test_ahpra_desktop import TEST_CACHES, check_fixture, profile_fixture, result
from onboarding.verification.ahpra_numbers import guard_ahpra_number
from onboarding.verification.desktop import apply_ahpra_result
from onboarding.verification.state import ahpra_frozen, ahpra_state, require_ahpra_application
from shifts.access import ShiftActionRefused
from shifts.interest import _require_public_shift_onboarding
from shifts.models import ShiftSlotAssignment


@override_settings(AHPRA_SOURCE='desktop', CACHES=TEST_CACHES,
                   CHANNEL_LAYERS={'default': {'BACKEND': 'channels.layers.InMemoryChannelLayer'}},
                   EMAIL_BACKEND='django.core.mail.backends.locmem.EmailBackend',
                   ADMINS=[('Admin', 'admin@example.test')])
class Review3ReproTests(TestCase):
    def setUp(self):
        caches['ahpra'].clear()
        self.profile = profile_fixture()  # Jane Doe
        self.user = self.profile.user
        self.user.is_otp_verified = self.user.is_mobile_verified = True
        self.user.save(update_fields=['is_otp_verified', 'is_mobile_verified'])

    def apply(self, **record):
        check = check_fixture(self.profile)
        with self.captureOnCommitCallbacks(execute=True):
            apply_ahpra_result(check, result(check.pk, **record))
        check.refresh_from_db()
        self.profile.refresh_from_db()
        return check

    def public_refused(self):
        try:
            require_ahpra_application(self.user)
            _require_public_shift_onboarding(self.user)
        except ShiftActionRefused:
            return True
        return False

    def test_p1a_name_mismatch_on_suspended_record_must_not_freeze(self):
        owner, pharmacy = make_owner_with_pharmacy()
        _, _, future = make_assignment(pharmacy, owner, self.user, timezone.localdate() + timedelta(days=2))
        with patch('notifications.services.notify_users'), patch('users.task_dispatch.async_task'), \
                patch('shifts.cancellation.async_task'), patch('shifts.cancellation.notify_shift_managers', return_value=[]):
            check = self.apply(name='Someone Else', registration_status='Suspended')
        state = ahpra_state(self.profile)['state']  # Before the number change below resets it.
        try:
            guard_ahpra_number(self.profile, 'PHA0007654321')
            locked = False
        except serializers.ValidationError:
            locked = True
        self.assertEqual(check.outcome, 'review')
        self.assertEqual({
            'state': state, 'frozen': ahpra_frozen(self.user),
            'booking_cancelled': not ShiftSlotAssignment.objects.filter(pk=future.pk).exists(), 'number_locked': locked,
        }, {'state': 'review', 'frozen': False, 'booking_cancelled': False, 'number_locked': False})

    def test_p1b_review_on_registered_record_must_remove_public_eligibility(self):
        cases = {'name mismatch': {'name': 'Someone Else'}, 'conditions': {'conditions': True},
                 'expired': {'expiry_date': '2000-01-01'}}
        for label, record in cases.items():
            with self.subTest(label):
                self.profile.verified = self.profile.ahpra_verified = True
                self.profile.save(update_fields=['verified', 'ahpra_verified'])
                check = self.apply(registration_status='Registered', **record)
                self.assertEqual((check.outcome, ahpra_state(self.profile)['state']), ('review', 'review'))
                self.assertEqual({'verified': self.profile.verified, 'public_refused': self.public_refused()},
                                 {'verified': False, 'public_refused': True})

    def test_admin_verify_settles_name_mismatch_review(self):
        check = self.apply(name='Someone Else', registration_status='Registered')
        self.assertEqual(ahpra_state(self.profile)['state'], 'review')
        AhpraCheck.objects.filter(pk=check.pk).update(outcome='verified', reviewed_at=timezone.now())
        self.assertEqual(ahpra_state(self.profile)['state'], 'ok')

    def test_p1c_failed_cancellation_rolls_back_suspension_and_keeps_booking(self):
        owner, pharmacy = make_owner_with_pharmacy()
        _, _, future = make_assignment(pharmacy, owner, self.user, timezone.localdate() + timedelta(days=2))
        with patch('shifts.cancellation.cancel_upcoming_assignments', side_effect=RuntimeError('db blip')), \
                patch('notifications.services.notify_users'), patch('users.task_dispatch.async_task'), \
                self.assertRaises(RuntimeError):
            self.apply(registration_status='Suspended')
        self.profile.refresh_from_db()
        self.assertEqual(ahpra_state(self.profile)['state'], 'pending')
        self.assertFalse(ahpra_frozen(self.user))
        self.assertTrue(ShiftSlotAssignment.objects.filter(pk=future.pk).exists())
