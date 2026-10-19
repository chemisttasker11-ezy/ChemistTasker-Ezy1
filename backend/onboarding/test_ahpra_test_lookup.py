from datetime import timedelta
from unittest.mock import AsyncMock, patch

from django.core import mail
from django.core.cache import caches
from django.test import Client, TestCase, override_settings
from django.urls import path, reverse
from django.utils import timezone
from django_otp import DEVICE_ID_SESSION_KEY
from django_otp.plugins.otp_totp.models import TOTPDevice

from client_profile.characterization_support import make_user
from core.admin_site import otp_admin_site
from onboarding.ahpra_test_lookup import LookupForm, TEST_MODEL
from onboarding.models import AhpraCheck, OnboardingNotification, PharmacistOnboarding
from onboarding.tasks import alert_overdue_ahpra_checks
from onboarding.test_ahpra_desktop import NUMBER, TEST_CACHES, result
from onboarding.verification.desktop import claim_checks, handle_verifier_result, store_repair_report, verifier_seen

urlpatterns = [path('hidden-staff/', otp_admin_site.urls)]


@override_settings(
    ROOT_URLCONF=__name__, AHPRA_TEST_LOOKUP_ENABLED=True, AHPRA_SOURCE='desktop',
    CACHES=TEST_CACHES, CHANNEL_LAYERS={'default': {'BACKEND': 'channels.layers.InMemoryChannelLayer'}},
    EMAIL_BACKEND='django.core.mail.backends.locmem.EmailBackend', ADMINS=[('Admin', 'admin@example.test')],
    SECURE_SSL_REDIRECT=False,
)
class AhpraTestLookupTests(TestCase):
    def setUp(self):
        caches['ahpra'].clear()
        self.user = make_user('PHARMACIST', is_staff=True, first_name='Jane', last_name='Doe')
        self.profile = PharmacistOnboarding.objects.create(user=self.user, ahpra_number=NUMBER)
        self.url = reverse('otpadmin:ahpra_test_lookup')
        self.data = {'registration_number': NUMBER, 'first_name': 'Jane', 'last_name': 'Doe', 'role': 'pharmacist'}
        self.login(self.user)

    def login(self, user, verified=True):
        self.client.force_login(user)
        if verified:
            device = TOTPDevice.objects.create(user=user, confirmed=True)
            session = self.client.session
            session[DEVICE_ID_SESSION_KEY] = device.persistent_id
            session.save()

    def submit(self):
        with self.captureOnCommitCallbacks(execute=True):
            response = self.client.post(self.url, self.data)
        self.assertRedirects(response, self.url, fetch_redirect_response=False)
        return AhpraCheck.objects.filter(model_name=TEST_MODEL).latest('pk')

    @override_settings(AHPRA_TEST_LOOKUP_ENABLED=False)
    def test_disabled_lookup_returns_404(self):
        for method in (self.client.get, self.client.post, Client().get):
            self.assertEqual(method(self.url).status_code, 404)
        self.assertFalse(AhpraCheck.objects.exists())

    def test_staff_and_otp_required(self):
        self.assertEqual(Client().get(self.url).status_code, 302)
        self.login(make_user(), verified=True)
        self.assertEqual(self.client.get(self.url).status_code, 302)
        self.assertEqual(self.client.post(self.url, self.data).status_code, 302)
        self.login(self.user, verified=False)
        self.assertEqual(self.client.get(self.url).status_code, 302)
        self.assertFalse(AhpraCheck.objects.exists())
        self.login(self.user)
        self.assertEqual(self.client.get(self.url).status_code, 200)

    def test_registration_number_validation(self):
        for number in ('PHA123', 'PHA00012345678', '0001234567', 'MED0001234567'):
            self.assertFalse(LookupForm({**self.data, 'registration_number': number}).is_valid())
        form = LookupForm({**self.data, 'registration_number': 'pha 0001234567'})
        self.assertTrue(form.is_valid())
        self.assertEqual(form.cleaned_data['registration_number'], NUMBER)

    def test_same_routing_and_would_be_decision(self):
        verifier_seen('extension')
        check = self.submit()
        self.assertEqual(check.stage, 'extension')
        self.assertEqual(claim_checks(check.pk, 'extension')[0]['registration_number'], NUMBER)
        with self.captureOnCommitCallbacks(execute=True):
            self.assertTrue(handle_verifier_result(dict(result(check.pk, 'error'), error='Unavailable'), 'extension'))
        check.refresh_from_db()
        self.assertEqual((check.stage, check.status), ('bridge', 'pending'))
        self.assertEqual(claim_checks(check.pk, 'bridge')[0]['check_id'], check.pk)
        self.assertTrue(handle_verifier_result(result(check.pk, registration_status='Suspended'), 'bridge'))
        response = self.client.get(self.url)
        self.assertContains(response, 'rejected')
        self.assertContains(response, 'Jane Doe')
        self.assertNotContains(response, 'http-equiv="refresh"')

    def test_results_never_change_profile_send_mail_notify_or_repair(self):
        PharmacistOnboarding.objects.filter(pk=self.profile.pk).update(verified=True, ahpra_verified=True)
        before = PharmacistOnboarding.objects.filter(pk=self.profile.pk).values().get()
        notifications = OnboardingNotification.objects.count()
        with patch('onboarding.verification.desktop.check_profile') as profile_lookup, \
                patch('onboarding.verification.state.apply_state_transition') as transition, \
                patch('onboarding.verification.desktop._update_ahpra_fields') as update, \
                patch('onboarding.verification.desktop.get_channel_layer') as layer:
            layer.return_value.group_send = AsyncMock()
            for outcome in ('found', 'not_found', 'blocked', 'error'):
                check = self.submit()
                self.assertEqual(check.stage, 'bridge')
                layer.reset_mock()
                with self.captureOnCommitCallbacks(execute=True):
                    self.assertTrue(handle_verifier_result(result(check.pk, outcome, registration_status='Suspended'), 'bridge'))
                check.refresh_from_db()
                self.assertEqual((check.status, check.outcome), ('done', 'rejected' if outcome == 'found' else outcome))
                self.assertEqual(check.register_data['_test_outcome'], outcome)
                self.assertIsNotNone(check.completed_at)
                self.assertFalse(check.needs_attention)
                layer.assert_not_called()
            profile_lookup.assert_not_called()
            transition.assert_not_called()
            update.assert_not_called()
        self.assertEqual(PharmacistOnboarding.objects.filter(pk=self.profile.pk).values().get(), before)
        self.assertEqual(OnboardingNotification.objects.count(), notifications)
        self.assertEqual(mail.outbox, [])

    def test_overdue_test_checks_never_alert_or_accept_repair(self):
        check = self.submit()
        AhpraCheck.objects.filter(pk=check.pk).update(created_at=timezone.now() - timedelta(hours=1))
        with self.captureOnCommitCallbacks(execute=True):
            alert_overdue_ahpra_checks()
            self.assertFalse(store_repair_report({'check_id': check.pk, 'summary': 'Unexpected', 'branch': ''}))
        self.assertEqual(mail.outbox, [])
        check.refresh_from_db()
        self.assertIsNone(check.alerted_at)

    def test_delete_only_test_checks_and_ignore_late_results(self):
        check = self.submit()
        real = AhpraCheck.objects.create(model_name='PharmacistOnboarding', object_pk=self.profile.pk,
                                         registration_number=NUMBER, reason='onboarding')
        self.assertEqual(self.client.get(self.url, {'action': 'delete'}).status_code, 200)
        self.assertTrue(AhpraCheck.objects.filter(pk=check.pk).exists())
        self.assertRedirects(self.client.post(self.url, {'action': 'delete'}), self.url, fetch_redirect_response=False)
        self.assertEqual(list(AhpraCheck.objects.values_list('pk', flat=True)), [real.pk])
        self.assertFalse(handle_verifier_result(result(check.pk), 'bridge'))

    def test_last_twenty_and_refresh_for_pending_outside_list(self):
        pending = self.submit()
        for _ in range(21):
            AhpraCheck.objects.create(model_name=TEST_MODEL, object_pk=self.user.pk,
                                      registration_number=NUMBER, reason='onboarding', status='done')
        response = self.client.get(self.url)
        self.assertEqual(len(response.context['checks']), 20)
        self.assertNotIn(pending.pk, [check.pk for check in response.context['checks']])
        self.assertContains(response, 'http-equiv="refresh" content="5"')
