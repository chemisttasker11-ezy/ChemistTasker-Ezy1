from datetime import timedelta
from unittest.mock import patch

from django.core.cache import cache
from django.core.cache.backends.locmem import LocMemCache
from django.core.exceptions import ValidationError
from django.db import IntegrityError
from django.test import TestCase
from django.utils import timezone

from attendance import credentials
from attendance.models import KioskDevice, KioskPairingAuthorization
from client_profile.characterization_support import client_for, make_owner_with_pharmacy, make_user
from memberships.models import Membership
from notifications.models import Notification


LOOKUP = '/api/v1/attendance/kiosk/notice-code/'


class NoticeCodeTests(TestCase):
    def setUp(self):
        self.owner, self.pharmacy = make_owner_with_pharmacy('Notice Pharmacy')
        self.other = make_user('PHARMACIST')
        self.security = LocMemCache(self.id(), {})
        self.cache_patch = patch.object(credentials, 'security_cache', self.security)
        self.cache_patch.start()
        self.addCleanup(self.cache_patch.stop)
        cache.clear()
        self.addCleanup(cache.clear)

    def assert_safe(self, secret, push, broadcast):
        notice = Notification.objects.latest('pk')
        for value in (notice.title, notice.body, notice.action_url, notice.payload,
                      push.call_args, broadcast.call_args_list):
            self.assertNotIn(secret, str(value))
        self.assertTrue(push.called)
        self.assertTrue(broadcast.called)

    @patch('notifications.services._broadcast')
    @patch('notifications.services._send_expo_push')
    def test_pairing_notice_and_recipient_scope(self, push, broadcast):
        code = credentials.generate_kiosk_pairing_code(self.owner, self.pharmacy)
        self.assert_safe(code, push, broadcast)
        auth = KioskPairingAuthorization.objects.get(authorized_by=self.owner)
        query = {'kind': 'pairing', 'authorization_id': auth.pk}
        self.assertEqual(client_for(self.owner).get(LOOKUP, query).data['code'], code)
        self.assertEqual(client_for(self.other).get(LOOKUP, query).status_code, 404)
        auth.consumed_at = timezone.now()
        auth.save(update_fields=['consumed_at'])
        self.assertEqual(client_for(self.owner).get(LOOKUP, query).status_code, 404)
        auth.consumed_at = None
        auth.expires_at = timezone.now() - timedelta(seconds=1)
        auth.save(update_fields=['consumed_at', 'expires_at'])
        self.assertEqual(client_for(self.owner).get(LOOKUP, query).status_code, 404)

    @patch('users.tasks.send_async_email', return_value=True)
    @patch('notifications.services._broadcast')
    @patch('notifications.services._send_expo_push')
    def test_pin_notice_and_recipient_scope(self, push, broadcast, mail):
        worker = make_user('PHARMACIST')
        Membership.objects.create(user=worker, pharmacy=self.pharmacy, role='PHARMACIST',
                                  employment_type='FULL_TIME', status='ACCEPTED', is_active=True)
        device = KioskDevice.objects.create(pharmacy=self.pharmacy, device_name='Counter',
                                            device_token='test-token', activated_by=self.owner)
        credentials.send_worker_pin_setup_code(device, worker.email)
        code = credentials.get_pin_notice_code(worker)['code']
        self.assert_safe(code, push, broadcast)
        self.assertEqual(client_for(worker).get(LOOKUP, {'kind': 'pin'}).data['code'], code)
        self.assertEqual(client_for(self.other).get(LOOKUP, {'kind': 'pin', 'worker_id': worker.pk}).status_code, 404)
        with patch('attendance.credentials.timezone.now', return_value=timezone.now() + timedelta(minutes=11)):
            self.assertEqual(client_for(worker).get(LOOKUP, {'kind': 'pin'}).status_code, 404)
        credentials.consume_worker_pin_otp(worker.pk)
        self.assertEqual(client_for(worker).get(LOOKUP, {'kind': 'pin'}).status_code, 404)

    @patch('notifications.services.notify_users')
    def test_pairing_notice_service_limits_access_to_valid_issuer(self, notify):
        code = credentials.generate_kiosk_pairing_code(self.owner, self.pharmacy)
        authorization = KioskPairingAuthorization.objects.get(authorized_by=self.owner)
        self.assertEqual(credentials.get_pairing_notice_code(self.owner, authorization.pk)['code'], code)
        self.assertIsNone(credentials.get_pairing_notice_code(self.other, authorization.pk))
        self.assertIsNone(credentials.get_pairing_notice_code(self.owner, authorization.pk + 1))
        with patch('attendance.credentials.timezone.now', return_value=authorization.expires_at):
            self.assertIsNone(credentials.get_pairing_notice_code(self.owner, authorization.pk))

    @patch('users.tasks.send_async_email', return_value=True)
    @patch('notifications.services.notify_users')
    def test_pin_notice_service_rejects_invalid_claim_and_consumed_code(self, notify, mail):
        worker = make_user('PHARMACIST')
        membership = Membership.objects.create(user=worker, pharmacy=self.pharmacy, role='PHARMACIST',
                                               employment_type='FULL_TIME', status='ACCEPTED', is_active=True)
        device = KioskDevice.objects.create(pharmacy=self.pharmacy, device_name='Counter',
                                            device_token='service-test-token', activated_by=self.owner)
        credentials.send_worker_pin_setup_code(device, worker.email)
        data = credentials.get_pin_notice_code(worker)
        self.assertRegex(data['code'], r'^\d{6}$')
        self.assertIsNone(credentials.get_pin_notice_code(self.other))
        # A malformed cache value must fail closed without exposing cache key formats to callers.
        with patch.object(self.security, 'get', side_effect=[{
            'worker_id': worker.pk, 'membership_id': membership.pk, 'otp': data['code'],
        }, ['invalid claim']]):
            self.assertIsNone(credentials.get_pin_notice_code(worker))
        credentials.consume_worker_pin_otp(worker.pk)
        self.assertIsNone(credentials.get_pin_notice_code(worker))

    def test_pairing_creation_failure_does_not_use_unset_authorization(self):
        for failure in (IntegrityError, None):
            with self.subTest(failure=failure):
                with patch.object(KioskPairingAuthorization.objects, 'create', side_effect=failure, return_value=None):
                    with self.assertRaises(ValidationError):
                        credentials.generate_kiosk_pairing_code(self.owner, self.pharmacy)
