"""Dispatch and public-access regressions supplementing the senior-review reproductions."""
from datetime import timedelta
from types import SimpleNamespace
from unittest.mock import patch

from django.contrib.admin.sites import AdminSite
from django.core.cache import caches
from django.test import TestCase, override_settings
from django.utils import timezone

from client_profile.characterization_support import client_for, make_assignment, make_owner_with_pharmacy
from memberships.models import Membership
from onboarding.admin import AhpraCheckAdmin
from onboarding.models import AhpraCheck
from onboarding.test_ahpra_desktop import NUMBER, TEST_CACHES, check_fixture, profile_fixture, result
from onboarding.verification.desktop import apply_ahpra_result, claim_checks, enqueue_check, handle_verifier_result
from onboarding.verification.state import ahpra_frozen, ahpra_state, queue_public_recheck, require_public_ahpra
from shifts.access import ShiftActionRefused


@override_settings(AHPRA_SOURCE='desktop', CACHES=TEST_CACHES,
                   CHANNEL_LAYERS={'default': {'BACKEND': 'channels.layers.InMemoryChannelLayer'}})
class Review183FixTests(TestCase):
    def setUp(self):
        caches['ahpra'].clear()
        self.profile = profile_fixture()

    @override_settings(AHPRA_SOURCE='scrapingbee')
    def test_source_switch_blocks_profile_enqueue_claim_and_result_but_allows_diagnostics(self):
        check = check_fixture(self.profile, stage='bridge')
        self.assertIsNone(enqueue_check(self.profile, NUMBER, 'onboarding'))
        self.assertEqual(claim_checks(stage='bridge'), [])
        self.assertFalse(apply_ahpra_result(check, result(check.pk)))
        self.assertFalse(handle_verifier_result(result(check.pk), 'bridge'))
        check.refresh_from_db()
        self.assertEqual(check.status, 'pending')
        check.model_name = 'AhpraTestLookup'
        check.save(update_fields=['model_name'])
        self.assertEqual(len(claim_checks(stage='bridge', limit=1)), 1)
        self.assertTrue(handle_verifier_result(result(check.pk), 'bridge'))
        self.profile.refresh_from_db()
        self.assertFalse(self.profile.ahpra_verified)

    def test_failed_expiry_recheck_is_queued_but_not_dispatched_for_24_hours(self):
        self.profile.ahpra_expiry_date = timezone.localdate() - timedelta(days=10)
        self.profile.save(update_fields=['ahpra_expiry_date'])
        check_fixture(self.profile, status='done', outcome='verified',
                      completed_at=timezone.now() - timedelta(days=40))
        failure = check_fixture(self.profile, status='done', outcome='blocked', completed_at=timezone.now())
        queue_public_recheck(self.profile.user)
        self.assertTrue(AhpraCheck.objects.filter(status='pending').exists())
        self.assertEqual(claim_checks(stage='bridge'), [])
        AhpraCheck.objects.filter(pk=failure.pk).update(completed_at=timezone.now() - timedelta(hours=25))
        self.assertEqual(len(claim_checks(stage='bridge')), 1)

    def test_limited_dispatch_leaves_backlog_unleased_while_extension_connected(self):
        caches['ahpra'].set('ahpra_verifier_presence_extension', True, timeout=None)
        first = check_fixture(self.profile, stage='extension')
        second = check_fixture(profile_fixture(), stage='extension')
        self.assertEqual(claim_checks(stage='extension', limit=1)[0]['check_id'], first.pk)
        second.refresh_from_db()
        self.assertEqual(second.status, 'pending')
        self.assertIsNone(second.sent_at)
        with patch('onboarding.verification.desktop.timezone.now', return_value=timezone.now() + timedelta(minutes=6)):
            self.assertEqual(claim_checks(stage='bridge'), [])

    def test_user_recheck_is_never_held_by_verifier_failure(self):
        user = self.profile.user
        user.is_otp_verified = user.is_mobile_verified = True
        user.save(update_fields=['is_otp_verified', 'is_mobile_verified'])
        client = client_for(user)
        for status in ('Registered', 'Unknown'):  # normal (1 per hour) and unreadable (3 instant) paths
            with self.subTest(status=status):
                caches['ahpra'].clear()
                AhpraCheck.objects.all().delete()
                check_fixture(self.profile, status='done', outcome='verified', completed_at=timezone.now() - timedelta(days=1),
                              register_data={'registration_status': status, 'registration_type': 'General'})
                check_fixture(self.profile, status='done', outcome='blocked', completed_at=timezone.now())
                self.assertEqual(client.post('/api/v1/onboarding/ahpra/recheck/').status_code, 202)
                self.assertEqual(len(claim_checks(stage='bridge')), 1)

    def test_user_recheck_takes_over_held_automatic_check(self):
        self.profile.user.is_otp_verified = self.profile.user.is_mobile_verified = True
        self.profile.user.save(update_fields=['is_otp_verified', 'is_mobile_verified'])
        self.profile.ahpra_expiry_date = timezone.localdate() - timedelta(days=10)
        self.profile.save(update_fields=['ahpra_expiry_date'])
        check_fixture(self.profile, status='done', outcome='verified', completed_at=timezone.now() - timedelta(days=40),
                      register_data={'registration_status': 'Registered', 'registration_type': 'General'})
        check_fixture(self.profile, status='done', outcome='error', completed_at=timezone.now())
        queue_public_recheck(self.profile.user)
        self.assertEqual(claim_checks(stage='bridge'), [])
        client = client_for(self.profile.user)
        self.assertEqual(client.post('/api/v1/onboarding/ahpra/recheck/').status_code, 202)
        self.assertEqual(len(claim_checks(stage='bridge')), 1)
        self.assertEqual(client.post('/api/v1/onboarding/ahpra/recheck/').status_code, 429)  # own 1-per-hour rule stays

    def reject(self):
        check = check_fixture(self.profile, status='done', outcome='verified', completed_at=timezone.now(),
                              register_data={'registration_status': 'Registered', 'registration_type': 'General'})
        AhpraCheckAdmin(AhpraCheck, AdminSite()).mark_rejected(
            SimpleNamespace(user=self.profile.user), AhpraCheck.objects.filter(pk=check.pk))

    def test_admin_rejection_is_sticky_until_admin_verifies(self):
        self.reject()
        for reason in ('public_recheck', 'recheck'):
            with self.subTest(reason=reason):
                check = enqueue_check(self.profile, NUMBER, reason)
                self.assertTrue(apply_ahpra_result(check, result(check.pk)))
                self.assertEqual(AhpraCheck.objects.get(pk=check.pk).outcome, 'verified')
                self.profile.refresh_from_db()
                self.assertEqual(ahpra_state(self.profile)['state'], 'rejected')
                self.assertFalse(self.profile.ahpra_verified or self.profile.verified)
        AhpraCheckAdmin(AhpraCheck, AdminSite()).mark_verified(
            SimpleNamespace(user=self.profile.user), AhpraCheck.objects.filter(pk=check.pk))
        self.profile.refresh_from_db()
        self.assertEqual(ahpra_state(self.profile)['state'], 'ok')
        self.assertTrue(self.profile.ahpra_verified)

    def test_admin_rejection_leaves_member_work_alone(self):
        self.reject()
        owner, pharmacy = make_owner_with_pharmacy()
        shift, _, _ = make_assignment(pharmacy, owner, self.profile.user, timezone.localdate() + timedelta(days=5))
        shift.role_needed = 'PHARMACIST'
        with self.assertRaises(ShiftActionRefused) as refused:
            require_public_ahpra(self.profile.user, shift)
        self.assertEqual(refused.exception.detail['code'], 'ahpra_rejected')
        Membership.objects.create(user=self.profile.user, pharmacy=pharmacy, invited_by=owner, role='PHARMACIST',
                                  employment_type='FULL_TIME', is_active=True)
        require_public_ahpra(self.profile.user, shift)
        self.assertFalse(ahpra_frozen(self.profile.user))

    def test_pending_unverified_profile_cannot_pick_up_public_work(self):
        owner, pharmacy = make_owner_with_pharmacy()
        shift, _, _ = make_assignment(pharmacy, owner, self.profile.user, timezone.localdate() + timedelta(days=5))
        with self.assertRaises(ShiftActionRefused):
            require_public_ahpra(self.profile.user, shift)
