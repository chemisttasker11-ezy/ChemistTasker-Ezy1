import asyncio
import copy
import hashlib
from datetime import timedelta
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from channels.db import database_sync_to_async
from channels.routing import URLRouter
from channels.testing import WebsocketCommunicator
from django.contrib.admin.sites import AdminSite
from django.core import mail
from django.core.cache import caches
from django.test import TestCase, TransactionTestCase, override_settings
from django.utils import timezone
from django.urls import reverse

from client_profile.characterization_support import make_user
from onboarding.admin import AhpraCheckAdmin
from onboarding.models import AhpraCheck, OtherStaffOnboarding, PharmacistOnboarding
from onboarding.routing import websocket_urlpatterns
from onboarding.tasks import alert_overdue_ahpra_checks, verify_ahpra_task
from onboarding.verification.desktop import (
    RegisterSerializer, apply_ahpra_result, claim_checks, enqueue_check, handle_verifier_result,
    store_repair_report, valid_result, verifier_seen,
)
from onboarding.verification.state import ahpra_state
from users.jwt_ws import JWTAuthMiddlewareStack

NUMBER = 'PHA0001234567'
TOKEN = 'test-desktop-secret'
DIGEST = hashlib.sha256(TOKEN.encode()).hexdigest()
TEST_CACHES = {
    'default': {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache'},
    'security': {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache', 'LOCATION': 'security-tests'},
    'ahpra': {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache', 'LOCATION': 'ahpra-tests'},
}


def profile_fixture():
    user = make_user('PHARMACIST', first_name='Jane', last_name='Doe')
    return PharmacistOnboarding.objects.create(user=user, ahpra_number=NUMBER)


def check_fixture(profile, **kwargs):
    return AhpraCheck.objects.create(model_name='PharmacistOnboarding', object_pk=profile.pk,
                                     registration_number=NUMBER, reason='onboarding', **kwargs)


def result(check_id, outcome='found', **record):
    return {'type': 'result', 'check_id': check_id, 'outcome': outcome,
            'checked_at': timezone.now().isoformat(), 'error': '',
            'register': dict(name='Jane Doe', profession='Pharmacy', registration_status='Registered',
                             registration_type='General', expiry_date='2099-01-02', conditions=False,
                             undertakings=False, reprimands=False) | record if outcome == 'found' else None}


@override_settings(AHPRA_SOURCE='desktop', CACHES=TEST_CACHES,
                   CHANNEL_LAYERS={'default': {'BACKEND': 'channels.layers.InMemoryChannelLayer'}},
                   EMAIL_BACKEND='django.core.mail.backends.locmem.EmailBackend', ADMINS=[('Admin', 'admin@example.test')])
class DesktopTests(TestCase):
    def setUp(self):
        caches['ahpra'].delete_many(['ahpra_verifier_presence_extension', 'ahpra_verifier_presence_bridge'])
        self.profile = profile_fixture()

    def test_found_outcomes_and_duplicate_result(self):
        for changes, expected in [({}, 'verified'), ({'name': 'Other Person'}, 'review'),
                                  ({'registration_status': 'Suspended'}, 'rejected')]:
            with self.subTest(outcome=expected):
                check = check_fixture(self.profile)
                self.assertTrue(apply_ahpra_result(check, result(check.pk, **changes)))
                check.refresh_from_db()
                self.profile.refresh_from_db()
                self.assertEqual(check.outcome, expected)
                self.assertEqual(check.status, 'done')
                self.assertEqual(self.profile.ahpra_verified, expected == 'verified')
                self.assertEqual(self.profile.ahpra_expiry_date.isoformat(), '2099-01-02')
                self.assertFalse(apply_ahpra_result(check, result(check.pk, 'not_found')))

    def test_not_found_blocked_error(self):
        for outcome in ('not_found', 'blocked', 'error'):
            with self.subTest(outcome=outcome):
                self.profile.ahpra_verified = True
                self.profile.ahpra_verification_note = 'Previously verified'
                self.profile.save()
                check = check_fixture(self.profile)
                self.assertTrue(apply_ahpra_result(check, result(check.pk, outcome)))
                check.refresh_from_db()
                self.profile.refresh_from_db()
                self.assertEqual(check.outcome, outcome)
                self.assertEqual(self.profile.ahpra_verified, outcome != 'not_found')
                if outcome == 'not_found':
                    self.assertEqual(self.profile.ahpra_verification_note, 'Registration number not found on the AHPRA register')
                else:
                    self.assertEqual(self.profile.ahpra_verification_note, 'Previously verified')

    def test_verifier_error_keeps_verified_user_verified(self):
        check = check_fixture(self.profile)
        self.assertTrue(apply_ahpra_result(check, result(check.pk)))
        PharmacistOnboarding.objects.filter(pk=self.profile.pk).update(verified=True)
        before = PharmacistOnboarding.objects.filter(pk=self.profile.pk).values().get()
        self.assertTrue(before['ahpra_verified'])
        for outcome in ('error', 'blocked'):
            with self.subTest(outcome=outcome):
                check = check_fixture(self.profile)
                self.assertTrue(apply_ahpra_result(check, result(check.pk, outcome)))
                self.assertEqual(PharmacistOnboarding.objects.filter(pk=self.profile.pk).values().get(), before)
                self.assertEqual(ahpra_state(self.profile)['state'], 'ok')

    def test_found_without_name_or_status_is_error_and_leaves_profile_unchanged(self):
        self.profile.ahpra_verified = True
        self.profile.ahpra_verification_note = 'Previously verified'
        self.profile.ahpra_registration_status = 'Registered'
        self.profile.save()
        before = PharmacistOnboarding.objects.filter(pk=self.profile.pk).values().get()
        for field in ('name', 'registration_status'):
            for blank in ('', '   '):
                with self.subTest(field=field, blank=blank):
                    check = check_fixture(self.profile)
                    self.assertTrue(apply_ahpra_result(check, result(check.pk, **{field: blank})))
                    check.refresh_from_db()
                    self.assertEqual(check.outcome, 'error' if field == 'name' else 'review')
                    # A found record with a blank status is unreadable: not verified (owner decision B, 2026-10-19);
                    # a blank name is a verifier error and changes nothing.
                    unreadable = {'ahpra_verified': False, 'verified': False} if field == 'registration_status' else {}
                    self.assertEqual(PharmacistOnboarding.objects.filter(pk=self.profile.pk).values().get(),
                                     before | unreadable)
                    PharmacistOnboarding.objects.filter(pk=self.profile.pk).update(**{k: before[k] for k in unreadable})

    def test_registration_requirements_persist_and_render_in_admin(self):
        for fields in ({}, {'registration_requirements': 'Only practise under supervisor Jane Smith at Example Pharmacy.',
                           'supervised_practice': True}):
            with self.subTest(fields=fields):
                check = check_fixture(self.profile)
                payload = result(check.pk, **fields)
                self.assertTrue(apply_ahpra_result(check, payload))
                check.refresh_from_db()
                self.assertEqual(check.register_data, payload['register'])
                self.assertEqual(check.outcome, 'review' if fields else 'verified')
                rendered = AhpraCheckAdmin(AhpraCheck, AdminSite()).register_rendering(check)
                for key in fields:
                    self.assertIn(key, rendered)

    def test_shape_validation(self):
        good = result(1)
        self.assertTrue(valid_result(good))
        serializer = RegisterSerializer(data=good['register'])
        self.assertTrue(serializer.is_valid())
        self.assertEqual(serializer.validated_data['registration_requirements'], '')
        self.assertFalse(serializer.validated_data['supervised_practice'])
        for fields in ({'registration_requirements': ''}, {'supervised_practice': False}):
            self.assertTrue(valid_result(result(1, **fields)))
        for key, value in [('check_id', True), ('checked_at', 'bad'), ('outcome', 'verified'), ('register', None)]:
            bad = dict(good, **{key: value})
            self.assertFalse(valid_result(bad))
        for key, value in [('conditions', 'false'), ('expiry_date', '2099-02-30'), ('name', 123),
                           ('registration_requirements', 123), ('registration_requirements', None),
                           ('supervised_practice', 'false'), ('supervised_practice', 1), ('unexpected', True)]:
            bad = copy.deepcopy(good)
            bad['register'][key] = value
            self.assertFalse(valid_result(bad))
        self.assertFalse(valid_result(dict(good, unexpected=True)))

    def test_stale_profile_result_does_not_update(self):
        check = check_fixture(self.profile)
        self.profile.ahpra_number = 'PHA9991234567'
        self.profile.save()
        apply_ahpra_result(check, result(check.pk))
        check.refresh_from_db()
        self.profile.refresh_from_db()
        self.assertEqual(check.outcome, 'error')
        self.assertFalse(self.profile.ahpra_verified)

    def test_enqueue_deduplicates_and_pushes_after_commit(self):
        with patch('onboarding.verification.desktop.get_channel_layer') as layer:
            layer.return_value.group_send = AsyncMock()
            with self.captureOnCommitCallbacks(execute=True):
                one = enqueue_check(self.profile, NUMBER, 'onboarding')
                two = enqueue_check(self.profile, NUMBER, 'recheck')
            self.assertEqual(one.pk, two.pk)
            layer.return_value.group_send.assert_awaited_once_with('ahpra_verifiers_bridge', {'type': 'ahpra.check', 'check_id': one.pk})

    def test_routing_by_extension_presence(self):
        with patch('onboarding.verification.desktop.get_channel_layer') as layer:
            layer.return_value.group_send = AsyncMock()
            for present, stage in [(False, 'bridge'), (True, 'extension')]:
                if present:
                    verifier_seen('extension')
                with self.captureOnCommitCallbacks(execute=True):
                    check = enqueue_check(self.profile, NUMBER, 'onboarding')
                self.assertEqual(check.stage, stage)
                layer.return_value.group_send.assert_awaited_with(
                    f'ahpra_verifiers_{stage}', {'type': 'ahpra.check', 'check_id': check.pk},
                )
                check.delete()
        with patch.object(caches['ahpra'], 'set') as set_presence:
            verifier_seen('bridge')
        set_presence.assert_called_once_with('ahpra_verifier_presence_bridge', True, timeout=120)

    def test_extension_error_hands_off_once_without_applying(self):
        check = check_fixture(self.profile, status='sent', sent_at=timezone.now())
        error = dict(result(check.pk, 'error'), error='extension failed')
        before = PharmacistOnboarding.objects.filter(pk=self.profile.pk).values().get()
        with patch('onboarding.verification.desktop.get_channel_layer') as layer:
            layer.return_value.group_send = AsyncMock()
            with self.captureOnCommitCallbacks(execute=True):
                self.assertTrue(handle_verifier_result(error, 'extension'))
                self.assertTrue(handle_verifier_result(error, 'extension'))
            layer.return_value.group_send.assert_awaited_once_with(
                'ahpra_verifiers_bridge', {'type': 'ahpra.check', 'check_id': check.pk},
            )
        check.refresh_from_db()
        self.assertEqual((check.stage, check.status, check.extension_error), ('bridge', 'pending', 'extension failed'))
        self.assertIsNone(check.sent_at)
        self.assertEqual(PharmacistOnboarding.objects.filter(pk=self.profile.pk).values().get(), before)
        self.assertFalse(mail.outbox)
        self.assertEqual(claim_checks(stage='extension'), [])
        self.assertEqual(claim_checks(stage='bridge'), [
            {'type': 'check', 'check_id': check.pk, 'registration_number': NUMBER},
        ])
        self.assertTrue(handle_verifier_result(result(check.pk), 'bridge'))
        self.profile.refresh_from_db()
        self.assertTrue(self.profile.ahpra_verified)

    def test_bridge_error_needs_attention_sends_repair_and_private_email_once(self):
        check = check_fixture(self.profile, stage='bridge', extension_error='extension failed')
        error = dict(result(check.pk, 'error'), error='bridge failed')
        with patch('onboarding.verification.desktop.get_channel_layer') as layer:
            layer.return_value.group_send = AsyncMock()
            with self.captureOnCommitCallbacks(execute=True):
                self.assertTrue(handle_verifier_result(error, 'bridge'))
                self.assertTrue(handle_verifier_result(error, 'bridge'))
                self.assertFalse(mail.outbox)
            layer.return_value.group_send.assert_awaited_once_with('ahpra_verifiers_bridge', {
                'type': 'ahpra.repair', 'message': {
                    'type': 'repair', 'check_id': check.pk, 'registration_number': NUMBER,
                    'errors': ['extension failed', 'bridge failed'],
                },
            })
        check.refresh_from_db()
        self.profile.refresh_from_db()
        self.assertEqual((check.status, check.outcome, check.needs_attention), ('done', 'error', True))
        self.assertFalse(self.profile.ahpra_verified)
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn('AHPRA check needs your input', mail.outbox[0].subject)
        self.assertEqual(mail.outbox[0].to, ['admin@example.test'])
        for text in [str(check.pk), NUMBER, 'extension failed', 'bridge failed', 'Claude repair has started',
                     reverse('admin:client_profile_ahpracheck_change', args=[check.pk])]:
            self.assertIn(text, mail.outbox[0].body)
        for text in ['Jane', 'Doe', self.profile.user.email]:
            self.assertNotIn(text, mail.outbox[0].body)

    def test_repair_report_stores_caps_and_emails_once(self):
        check = check_fixture(self.profile, stage='bridge', status='done', needs_attention=True)
        report = {'check_id': check.pk, 'summary': 's' * 4001, 'branch': 'repair/' + 'b' * 300}
        with self.captureOnCommitCallbacks(execute=True):
            self.assertTrue(store_repair_report(report))
            self.assertTrue(store_repair_report(report))
            self.assertFalse(mail.outbox)
        check.refresh_from_db()
        self.assertEqual(check.repair_summary, report['summary'][:4000])
        self.assertEqual(check.repair_branch, report['branch'][:255])
        self.assertIsNotNone(check.repair_reported_at)
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn(check.repair_summary, mail.outbox[0].body)
        self.assertIn(check.repair_branch, mail.outbox[0].body)
        self.assertIn('Please decide', mail.outbox[0].body)

    def test_repair_report_rejects_unknown_non_attention_and_invalid_fields(self):
        check = check_fixture(self.profile)
        report = {'check_id': check.pk, 'summary': 'Fixed selector', 'branch': ''}
        self.assertFalse(store_repair_report(report))
        AhpraCheck.objects.filter(pk=check.pk).update(needs_attention=True)
        for invalid in [dict(report, check_id=999999), dict(report, check_id=True),
                        dict(report, summary=[]), dict(report, branch=None), dict(report, summary='')]:
            self.assertFalse(store_repair_report(invalid))
        self.assertFalse(mail.outbox)

    def test_admin_emails_are_deferred_and_fail_silently(self):
        check = check_fixture(self.profile, stage='bridge')
        with patch('onboarding.verification.desktop.mail_admins') as notify:
            with self.captureOnCommitCallbacks(execute=True):
                self.assertTrue(handle_verifier_result(result(check.pk, 'error'), 'bridge'))
                notify.assert_not_called()
            notify.assert_called_once()
            self.assertIs(notify.call_args.kwargs['fail_silently'], True)
            notify.reset_mock()
            with self.captureOnCommitCallbacks(execute=True):
                self.assertTrue(store_repair_report({'check_id': check.pk, 'summary': 'Fixed', 'branch': ''}))
                notify.assert_not_called()
            notify.assert_called_once()
            self.assertIs(notify.call_args.kwargs['fail_silently'], True)

    def test_attention_reminder_after_45_minutes_once_without_report(self):
        check = check_fixture(self.profile, status='done', stage='bridge', needs_attention=True,
                              completed_at=timezone.now() - timedelta(minutes=44))
        alert_overdue_ahpra_checks()
        self.assertFalse(mail.outbox)
        AhpraCheck.objects.filter(pk=check.pk).update(completed_at=timezone.now() - timedelta(minutes=46))
        alert_overdue_ahpra_checks()
        alert_overdue_ahpra_checks()
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn('no repair report', mail.outbox[0].body)
        AhpraCheck.objects.filter(pk=check.pk).update(alerted_at=None, repair_reported_at=timezone.now())
        alert_overdue_ahpra_checks()
        self.assertEqual(len(mail.outbox), 1)

    def test_extension_real_answers_do_not_hand_off(self):
        for outcome, fields in [('not_found', {}), ('blocked', {}),
                                ('found', {'registration_status': 'Suspended'})]:
            with self.subTest(outcome=outcome):
                check = check_fixture(self.profile)
                self.assertTrue(handle_verifier_result(result(check.pk, outcome, **fields), 'extension'))
                check.refresh_from_db()
                self.assertEqual(check.stage, 'extension')
                self.assertEqual(check.status, 'done')
                self.assertFalse(check.needs_attention)
        self.assertFalse(mail.outbox)

    def test_claim_pending_and_stale_sent_only(self):
        check = check_fixture(self.profile)
        self.assertEqual(len(claim_checks()), 1)
        self.assertEqual(claim_checks(), [])
        AhpraCheck.objects.filter(pk=check.pk).update(sent_at=timezone.now() - timedelta(minutes=6))
        self.assertEqual(len(claim_checks()), 1)
        AhpraCheck.objects.filter(pk=check.pk).update(status='done')
        self.assertEqual(claim_checks(), [])

    def test_bridge_claims_abandoned_extension_checks(self):
        now = timezone.now()
        for present in (False, True):
            for status, age in [('pending', None), ('sent', 1), ('sent', 5), ('sent', 6), ('done', 6)]:
                with self.subTest(present=present, status=status, age=age):
                    caches['ahpra'].set('ahpra_verifier_presence_extension', present)
                    check = check_fixture(self.profile, stage='extension', status=status,
                                          sent_at=now - timedelta(minutes=age) if age else None)
                    expected = status != 'done' and (not present or (status == 'sent' and age > 5))
                    with patch('onboarding.verification.desktop.timezone.now', return_value=now):
                        messages = claim_checks(check.pk, stage='bridge')
                    self.assertEqual(messages, [
                        {'type': 'check', 'check_id': check.pk, 'registration_number': NUMBER},
                    ] if expected else [])
                    check.refresh_from_db()
                    self.assertEqual(check.stage, 'bridge' if expected else 'extension')
                    if expected:
                        self.assertEqual((check.status, check.sent_at), ('sent', now))
                        self.assertEqual(claim_checks(check.pk, stage='bridge'), [])
                    check.delete()

    def test_admin_actions(self):
        check = check_fixture(self.profile)
        admin = AhpraCheckAdmin(AhpraCheck, AdminSite())
        request = SimpleNamespace(user=self.profile.user)
        for action, expected in [(admin.mark_verified, True), (admin.mark_rejected, False)]:
            action(request, AhpraCheck.objects.filter(pk=check.pk))
            check.refresh_from_db()
            self.profile.refresh_from_db()
            self.assertEqual(self.profile.ahpra_verified, expected)
            self.assertEqual(check.reviewed_by, request.user)
            self.assertEqual(check.status, 'done')
            self.assertIsNotNone(check.reviewed_at)
            self.assertIn('Manually ', self.profile.ahpra_verification_note)
        self.assertIn('Open AHPRA register', admin.open_register(check))

    def test_overdue_once_and_excludes_done_and_fresh(self):
        check = check_fixture(self.profile)
        alert_overdue_ahpra_checks()
        self.assertEqual(len(mail.outbox), 0)
        AhpraCheck.objects.filter(pk=check.pk).update(created_at=timezone.now() - timedelta(minutes=16))
        alert_overdue_ahpra_checks()
        alert_overdue_ahpra_checks()
        self.assertEqual(len(mail.outbox), 1)
        check.refresh_from_db()
        self.assertIsNotNone(check.alerted_at)
        AhpraCheck.objects.filter(pk=check.pk).update(status='done', alerted_at=None)
        alert_overdue_ahpra_checks()
        self.assertEqual(len(mail.outbox), 1)

    @override_settings(AHPRA_SOURCE='scrapingbee')
    def test_beat_noop_for_scrapingbee(self):
        check_fixture(self.profile)
        alert_overdue_ahpra_checks()
        self.assertEqual(AhpraCheck.objects.count(), 1)
        self.assertEqual(len(mail.outbox), 0)

    @override_settings(ADMINS=[])
    def test_no_recipients_does_not_mark_alert_delivered(self):
        check = check_fixture(self.profile)
        AhpraCheck.objects.filter(pk=check.pk).update(created_at=timezone.now() - timedelta(minutes=16))
        alert_overdue_ahpra_checks()
        check.refresh_from_db()
        self.assertIsNone(check.alerted_at)

    @patch('onboarding.tasks.ahpra_lookup')
    def test_desktop_switch_and_skip_rules(self, lookup):
        args = ('PharmacistOnboarding', self.profile.pk, NUMBER, 'Jane', 'Doe', self.profile.user.email)
        verify_ahpra_task(*args)
        verify_ahpra_task(*args)
        self.assertEqual(AhpraCheck.objects.count(), 1)
        lookup.assert_not_called()
        AhpraCheck.objects.all().delete()
        verify_ahpra_task(*args, role='student')
        verify_ahpra_task(*args[:2], 'invalid', *args[3:])
        self.profile.ahpra_verified = True
        self.profile.save()
        verify_ahpra_task(*args)
        self.assertFalse(AhpraCheck.objects.exists())

    def test_changed_number_with_stale_status_is_queued(self):
        self.profile.ahpra_registration_status = 'Registered'  # left over from the previous number's lookup
        self.profile.save()
        verify_ahpra_task('PharmacistOnboarding', self.profile.pk, NUMBER, 'Jane', 'Doe', self.profile.user.email)
        self.assertEqual(AhpraCheck.objects.count(), 1)

    @override_settings(AHPRA_SOURCE='scrapingbee')
    @patch('onboarding.tasks.parse_ahpra_html')
    @patch('onboarding.tasks.ahpra_lookup')
    def test_scrapingbee_switch(self, lookup, parse):
        parse.return_value = dict(result(1)['register'], practitioner_name='Jane Doe')
        verify_ahpra_task('PharmacistOnboarding', self.profile.pk, NUMBER, 'Jane', 'Doe', self.profile.user.email)
        lookup.assert_called_once()
        self.assertFalse(AhpraCheck.objects.exists())


@override_settings(AHPRA_VERIFIER_TOKEN_SHA256=DIGEST, CACHES=TEST_CACHES,
                   CHANNEL_LAYERS={'default': {'BACKEND': 'channels.layers.InMemoryChannelLayer'}},
                   EMAIL_BACKEND='django.core.mail.backends.locmem.EmailBackend', ADMINS=[('Admin', 'admin@example.test')])
class VerifierSocketTests(TransactionTestCase):
    def setUp(self):
        caches['ahpra'].delete_many(['ahpra_verifier_presence_extension', 'ahpra_verifier_presence_bridge'])
        self.profile = profile_fixture()
        self.check = check_fixture(self.profile, stage='bridge')

    def communicator(self, headers=None):
        return WebsocketCommunicator(JWTAuthMiddlewareStack(URLRouter(websocket_urlpatterns)),
                                     '/ws/ahpra-verifier/', headers=headers or [])

    async def test_kind_replays_only_own_stage_and_refreshes_presence(self):
        extension_profile = await database_sync_to_async(profile_fixture)()
        extension_check = await database_sync_to_async(check_fixture)(extension_profile)
        for kind, expected in [('extension', extension_check), ('bridge', self.check)]:
            socket = self.communicator()
            try:
                await socket.connect()
                await socket.send_json_to({'type': 'hello', 'agent': 'verifier', 'token': TOKEN, 'kind': kind})
                self.assertEqual(await socket.receive_json_from(), {'type': 'ready'})
                self.assertEqual(await socket.receive_json_from(), {
                    'type': 'check', 'check_id': expected.pk, 'registration_number': NUMBER,
                })
                self.assertTrue(await socket.receive_nothing())
                self.assertTrue(await database_sync_to_async(caches['ahpra'].get)(f'ahpra_verifier_presence_{kind}'))
                await database_sync_to_async(caches['ahpra'].delete)(f'ahpra_verifier_presence_{kind}')
                await socket.send_json_to({'type': 'pong'})
                self.assertTrue(await socket.receive_nothing())
                self.assertTrue(await database_sync_to_async(caches['ahpra'].get)(f'ahpra_verifier_presence_{kind}'))
            finally:
                await socket.disconnect()

    async def test_old_bridge_without_kind_records_bridge_presence(self):
        socket = self.communicator()
        try:
            await socket.connect()
            await socket.send_json_to({'type': 'hello', 'agent': 'old bridge', 'token': TOKEN})
            self.assertEqual(await socket.receive_json_from(), {'type': 'ready'})
            self.assertEqual((await socket.receive_json_from())['check_id'], self.check.pk)
            self.assertTrue(await database_sync_to_async(caches['ahpra'].get)('ahpra_verifier_presence_bridge'))
            self.assertIsNone(await database_sync_to_async(caches['ahpra'].get)('ahpra_verifier_presence_extension'))
        finally:
            await socket.disconnect()

    async def test_extension_handoff_ack_and_bridge_live_delivery(self):
        await database_sync_to_async(AhpraCheck.objects.filter(pk=self.check.pk).update)(stage='extension')
        # enqueue_check only assigns the extension stage while the extension is present.
        await database_sync_to_async(verifier_seen)('extension')
        extension, bridge = self.communicator(), self.communicator()
        try:
            for socket, kind in [(bridge, 'bridge'), (extension, 'extension')]:
                await socket.connect()
                await socket.send_json_to({'type': 'hello', 'agent': kind, 'token': TOKEN, 'kind': kind})
                self.assertEqual(await socket.receive_json_from(), {'type': 'ready'})
            self.assertEqual((await extension.receive_json_from())['check_id'], self.check.pk)
            error = dict(result(self.check.pk, 'error'), error='extension failed')
            await extension.send_json_to(error)
            self.assertEqual(await extension.receive_json_from(), {'type': 'ack', 'check_id': self.check.pk})
            self.assertEqual(await bridge.receive_json_from(), {
                'type': 'check', 'check_id': self.check.pk, 'registration_number': NUMBER,
            })
            await extension.send_json_to(error)
            self.assertEqual(await extension.receive_json_from(), {'type': 'ack', 'check_id': self.check.pk})
            self.assertTrue(await bridge.receive_nothing())
            await bridge.send_json_to(dict(result(self.check.pk, 'error'), error='bridge failed'))
            self.assertEqual(await bridge.receive_json_from(), {'type': 'ack', 'check_id': self.check.pk})
            self.assertEqual(await bridge.receive_json_from(), {
                'type': 'repair', 'check_id': self.check.pk, 'registration_number': NUMBER,
                'errors': ['extension failed', 'bridge failed'],
            })
            self.assertTrue(await extension.receive_nothing())
        finally:
            await extension.disconnect()
            await bridge.disconnect()

    async def test_repair_report_only_accepted_from_bridge(self):
        await database_sync_to_async(AhpraCheck.objects.filter(pk=self.check.pk).update)(
            status='done', needs_attention=True,
        )
        report = {'type': 'repair_report', 'check_id': self.check.pk, 'summary': 'Repaired selector', 'branch': ''}
        for kind in ('extension', 'bridge'):
            socket = self.communicator()
            try:
                await socket.connect()
                await socket.send_json_to({'type': 'hello', 'agent': 'verifier', 'token': TOKEN, 'kind': kind})
                await socket.receive_json_from()
                await socket.send_json_to(report)
                self.assertTrue(await socket.receive_nothing())
                await database_sync_to_async(self.check.refresh_from_db)()
                self.assertEqual(self.check.repair_summary, 'Repaired selector' if kind == 'bridge' else '')
            finally:
                await socket.disconnect()

    async def test_invalid_kind_rejected(self):
        socket = self.communicator()
        await socket.connect()
        await socket.send_json_to({'type': 'hello', 'agent': 'verifier', 'token': TOKEN, 'kind': 'unknown'})
        self.assertEqual((await socket.receive_output())['code'], 4401)
        await socket.disconnect()

    async def test_header_and_hello_auth_replay_without_names(self):
        for headers in ([], [(b'authorization', f'Bearer {TOKEN}'.encode())]):
            socket = self.communicator(headers)
            self.assertTrue((await socket.connect())[0])
            await socket.send_json_to({'type': 'hello', 'agent': 'bridge', **({} if headers else {'token': TOKEN})})
            self.assertEqual(await socket.receive_json_from(), {'type': 'ready'})
            self.assertEqual(await socket.receive_json_from(), {'type': 'check', 'check_id': self.check.pk, 'registration_number': NUMBER})
            await socket.disconnect()
            await database_sync_to_async(AhpraCheck.objects.filter(pk=self.check.pk).update)(sent_at=timezone.now() - timedelta(minutes=6))

    async def test_bad_header(self):
        socket = self.communicator([(b'authorization', b'Bearer bad')])
        self.assertEqual(await socket.connect(), (False, 4401))
        await socket.disconnect()

    async def test_heartbeat_reclaims_stale_sent_check_without_reconnect(self):
        await database_sync_to_async(AhpraCheck.objects.filter(pk=self.check.pk).update)(
            status='sent', sent_at=timezone.now(),
        )
        tick = asyncio.Event()

        async def wait_for_tick(seconds):
            await tick.wait()
            tick.clear()

        with patch('onboarding.consumers.asyncio', SimpleNamespace(
                create_task=asyncio.create_task, sleep=wait_for_tick)):
            socket = self.communicator()
            try:
                self.assertTrue((await socket.connect())[0])
                await socket.send_json_to({'type': 'hello', 'agent': 'bridge', 'token': TOKEN})
                self.assertEqual(await socket.receive_json_from(), {'type': 'ready'})
                self.assertTrue(await socket.receive_nothing())
                await database_sync_to_async(AhpraCheck.objects.filter(pk=self.check.pk).update)(
                    sent_at=timezone.now() - timedelta(minutes=6),
                )
                tick.set()
                self.assertEqual(await socket.receive_json_from(), {'type': 'ping'})
                self.assertEqual(await socket.receive_json_from(), {
                    'type': 'check', 'check_id': self.check.pk, 'registration_number': NUMBER,
                })
                await database_sync_to_async(self.check.refresh_from_db)()
                self.assertGreater(self.check.sent_at, timezone.now() - timedelta(minutes=1))
            finally:
                await socket.disconnect()

    async def test_bad_and_missing_hello_token(self):
        for token in ('bad', None):
            socket = self.communicator()
            await socket.connect()
            await socket.send_json_to({'type': 'hello', 'agent': 'bridge', 'token': token})
            self.assertEqual((await socket.receive_output())['code'], 4401)
            await socket.disconnect()

    @override_settings(AHPRA_VERIFIER_TOKEN_SHA256='')
    async def test_disabled(self):
        socket = self.communicator()
        self.assertEqual(await socket.connect(), (False, 4401))
        await socket.disconnect()

    async def test_result_ack_unknown_done_and_malformed_ignored(self):
        socket = self.communicator()
        await socket.connect()
        await socket.send_json_to({'type': 'hello', 'agent': 'bridge', 'token': TOKEN})
        await socket.receive_json_from()
        await socket.receive_json_from()
        await socket.send_json_to(result(999999))
        self.assertTrue(await socket.receive_nothing())
        await socket.send_json_to({'type': 'result', 'check_id': self.check.pk})
        self.assertTrue(await socket.receive_nothing())
        await socket.send_json_to(result(self.check.pk))
        self.assertEqual(await socket.receive_json_from(), {'type': 'ack', 'check_id': self.check.pk})
        await socket.send_json_to(result(self.check.pk, 'not_found'))
        self.assertEqual(await socket.receive_json_from(), {'type': 'ack', 'check_id': self.check.pk})
        await socket.disconnect()
        await database_sync_to_async(self.profile.refresh_from_db)()
        self.assertTrue(self.profile.ahpra_verified)

    async def test_live_push_and_all_result_outcomes(self):
        socket = self.communicator()
        await socket.connect()
        await socket.send_json_to({'type': 'hello', 'agent': 'bridge', 'token': TOKEN})
        await socket.receive_json_from()
        await socket.receive_json_from()
        await socket.send_json_to(result(self.check.pk))
        await socket.receive_json_from()
        for outcome, record, expected in [
            ('found', {'conditions': True}, 'review'),
            ('found', {'registration_status': 'Cancelled'}, 'rejected'),
            ('not_found', {}, 'not_found'), ('blocked', {}, 'blocked'), ('error', {}, 'error'),
        ]:
            check = await database_sync_to_async(enqueue_check)(self.profile, NUMBER, 'recheck')
            self.assertEqual(await socket.receive_json_from(), {'type': 'check', 'check_id': check.pk, 'registration_number': NUMBER})
            await socket.send_json_to(result(check.pk, outcome, **record))
            self.assertEqual(await socket.receive_json_from(), {'type': 'ack', 'check_id': check.pk})
            await database_sync_to_async(check.refresh_from_db)()
            self.assertEqual(check.outcome, expected)
            if outcome == 'error':
                self.assertEqual(await socket.receive_json_from(), {
                    'type': 'repair', 'check_id': check.pk, 'registration_number': NUMBER, 'errors': ['', ''],
                })
        await socket.send_json_to({'type': 'pong'})
        self.assertTrue(await socket.receive_nothing())
        await socket.disconnect()
