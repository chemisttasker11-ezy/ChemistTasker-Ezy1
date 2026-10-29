"""Freeze the distinct session/token/OTP membership contracts before extraction."""
import ast
import importlib
import os
import subprocess
import sys
from dataclasses import FrozenInstanceError
from pathlib import Path
from unittest import mock

from django.contrib.auth.hashers import make_password
from django.test import SimpleTestCase, TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from client_profile.characterization_support import make_owner_with_pharmacy, make_user
from memberships.models import Membership
from organizations.models import Organization, Pharmacy
from users.models import OrganizationMembership


class MembershipPayloadBehaviourTests(TestCase):
    def setUp(self):
        self.user, self.owned = make_owner_with_pharmacy('Owned boundary pharmacy')
        self.user.is_otp_verified = True
        self.user.save(update_fields=['is_otp_verified'])
        self.accepted = Pharmacy.objects.create(name='Accepted boundary pharmacy')
        self.membership = Membership.objects.create(
            user=self.user, pharmacy=self.accepted, role='PHARMACIST',
            status='ACCEPTED', is_active=True, employment_type='CASUAL',
        )
        self.overlap = Membership.objects.create(
            user=self.user, pharmacy=self.owned, role='PHARMACIST',
            status='ACCEPTED', is_active=True, employment_type='CASUAL',
        )
        for index, (status, active) in enumerate([
            ('PENDING', True), ('REJECTED', True), ('LEFT', True), ('ACCEPTED', False),
        ]):
            Membership.objects.create(
                user=self.user, pharmacy=Pharmacy.objects.create(name=f'Excluded {index}'),
                role='PHARMACIST', status=status, is_active=active,
            )
        Membership.objects.create(user=make_user(), pharmacy=self.accepted, role='ASSISTANT', status='ACCEPTED')
        self.client = APIClient()

    def assert_memberships(self, rows, *, session=False, otp=False):
        self.assertEqual({row['pharmacy_id'] for row in rows}, {self.accepted.pk, self.owned.pk})
        by_id = {row['pharmacy_id']: row for row in rows}
        expected = {'pharmacy_id': self.accepted.pk, 'pharmacy_name': self.accepted.name, 'role': 'PHARMACIST'}
        if not otp:
            expected['employment_type'] = 'CASUAL'
        if session:
            expected['id'] = self.membership.pk
        self.assertEqual(by_id[self.accepted.pk], expected)
        owned = {'pharmacy_id': self.owned.pk, 'pharmacy_name': self.owned.name, 'role': 'OWNER'}
        if otp:
            owned['role'] = 'PHARMACIST'
        self.assertEqual(by_id[self.owned.pk], owned)

    def test_current_user_keeps_membership_id_and_owner_precedence(self):
        self.client.force_authenticate(self.user)
        response = self.client.get('/api/v1/users/me/')
        self.assertEqual(response.status_code, 200, response.data)
        self.assert_memberships(response.data['memberships'], session=True)

    def test_login_and_refresh_keep_distinct_wire_shape(self):
        response = self.client.post('/api/v1/users/login/',
            {'email': self.user.email, 'password': 'test-pass'}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        self.assert_memberships(response.data['user']['memberships'])
        refresh = self.client.post('/api/v1/users/token/refresh/',
            {'refresh': response.data['refresh']}, format='json')
        self.assertEqual(refresh.status_code, 200, refresh.data)
        self.assert_memberships(refresh.data['user']['memberships'])

    def test_mobile_otp_keeps_membership_role_without_owner_overlay(self):
        self.user.is_otp_verified = False
        self.user.otp_code = make_password('123456')
        self.user.otp_created_at = timezone.now()
        self.user.save(update_fields=['is_otp_verified', 'otp_code', 'otp_created_at'])
        response = self.client.post('/api/v1/users/verify-otp/',
            {'email': self.user.email, 'otp': '123456'}, format='json', HTTP_X_CLIENT_PLATFORM='mobile')
        self.assertEqual(response.status_code, 200, response.data)
        self.assert_memberships(response.data['user']['memberships'], otp=True)

    def test_directory_retains_active_pending_rows_without_creating_memberships(self):
        org = Organization.objects.create(name='Directory boundary organization')
        self.accepted.organization = org
        self.accepted.save(update_fields=['organization'])
        OrganizationMembership.objects.create(user=self.user, organization=org, role='ORG_ADMIN')
        pending_user = make_user()
        pending = Membership.objects.create(user=pending_user, pharmacy=self.accepted,
            role='ASSISTANT', status='PENDING', is_active=True)
        count = Membership.objects.count()
        self.client.force_authenticate(self.user)
        response = self.client.get('/api/v1/users/organization-memberships/',
            {'organization': org.pk, 'include_pharmacy_members': 'true'})
        self.assertEqual(response.status_code, 200, response.data)
        rows = response.data.get('results', []) if isinstance(response.data, dict) else response.data
        self.assertIn(pending.pk, [row['membership_id'] for row in rows])
        self.assertEqual(Membership.objects.count(), count)


class MembershipServiceCompositionTests(SimpleTestCase):
    def test_composition_binds_canonical_services_without_io(self):
        from composition import identity_memberships
        from memberships import account_management, identity_reads
        from users.membership_port import membership_services

        with mock.patch('django.db.backends.utils.CursorWrapper.execute', side_effect=AssertionError('startup SQL')), \
                mock.patch('celery.app.base.Celery.send_task', side_effect=AssertionError('startup delivery')):
            importlib.reload(identity_memberships)
        services = membership_services()
        self.assertIs(services.accepted_for_user, identity_reads.accepted_for_user)
        self.assertIs(services.directory_memberships, identity_reads.directory_memberships)
        self.assertIs(services.convert_manager_account, account_management.convert_manager_account)
        with self.assertRaises(FrozenInstanceError):
            services.accepted_for_user = None

    def test_identity_has_no_membership_or_composition_import_at_any_depth(self):
        from core.test_backend_ownership_boundaries import runtime_files

        reverse = []
        for relative, _path, tree in runtime_files():
            if not relative.startswith('users/'):
                continue
            for node in ast.walk(tree):
                if isinstance(node, ast.Import):
                    modules = [alias.name for alias in node.names]
                elif isinstance(node, ast.ImportFrom) and not node.level:
                    modules = [node.module or '']
                else:
                    continue
                if any(module.split('.')[0] in {'memberships', 'composition'} for module in modules):
                    reverse.append((relative, node.lineno))
        self.assertEqual(reverse, [])

    def test_fresh_import_orders_configure_before_endpoint_use_without_io(self):
        child = '''
import importlib, sys
from unittest import mock
import django
django.setup()
for name in sys.argv[1:]:
    importlib.import_module(name)
with mock.patch('django.db.backends.utils.CursorWrapper.execute', side_effect=AssertionError('startup SQL')), mock.patch('celery.app.base.Celery.send_task', side_effect=AssertionError('startup delivery')):
    from django.urls import get_resolver
    get_resolver().url_patterns
from users.membership_port import membership_services
from memberships import identity_reads
assert membership_services().accepted_for_user is identity_reads.accepted_for_user
print('identity membership composition ready')
'''
        for order in (('users.serializers', 'memberships.serializers'),
                      ('memberships.account_management', 'users.api_account', 'users.sessions')):
            with self.subTest(order=order):
                result = subprocess.run([sys.executable, '-c', child, *order],
                    cwd=Path(__file__).resolve().parents[1],
                    env={**os.environ, 'DJANGO_SETTINGS_MODULE': 'core.contract_test_settings'},
                    capture_output=True, text=True, timeout=60)
                self.assertEqual(result.returncode, 0, result.stderr[-3000:])
                self.assertIn('identity membership composition ready', result.stdout)
