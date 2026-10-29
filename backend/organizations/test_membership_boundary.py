"""Membership orchestration retains organisation routes and deferred dispatch."""
import ast
import importlib
import os
import subprocess
import sys
from dataclasses import FrozenInstanceError
from pathlib import Path
from unittest import mock

from django.test import SimpleTestCase, TestCase

from client_profile.characterization_support import client_for, make_owner_with_pharmacy, make_user
from memberships.models import Membership
from organizations.membership_port import membership_operations
from organizations.models import PharmacyAdmin


class MembershipCompositionTests(SimpleTestCase):
    def test_fresh_process_configures_services_for_both_historical_import_orders_without_io(self):
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
from organizations.membership_port import membership_operations
from memberships import organization_management
assert membership_operations().create_admin is organization_management.create_admin
print('membership composition ready')
'''
        orders = (
            ('organizations.views', 'organizations.claims'),
            ('memberships.serializers', 'organizations.claims', 'organizations.views'),
        )
        for order in orders:
            with self.subTest(order=order):
                result = subprocess.run(
                    [sys.executable, '-c', child, *order],
                    cwd=Path(__file__).resolve().parents[1],
                    env={**os.environ, 'DJANGO_SETTINGS_MODULE': 'core.contract_test_settings'},
                    capture_output=True, text=True, timeout=120,
                )
                self.assertEqual(result.returncode, 0, result.stderr[-3000:])
                self.assertIn('membership composition ready', result.stdout)

    def test_canonical_url_composition_keeps_the_historical_route_objects(self):
        from composition import urls
        from core import urls as historical

        self.assertIs(urls.urlpatterns, historical.urlpatterns)

    def test_membership_implementations_are_bound_without_startup_io(self):
        from composition import organization_memberships
        from memberships import organization_management

        # Binding is repeatable and owns neither queries nor delivery.
        with mock.patch('django.db.backends.utils.CursorWrapper.execute', side_effect=AssertionError('SQL during wiring')), \
                mock.patch('celery.app.base.Celery.send_task', side_effect=AssertionError('queue during wiring')), \
                mock.patch('celery.app.task.Task.apply_async', side_effect=AssertionError('task during wiring')):
            importlib.reload(organization_memberships)
        operations = membership_operations()
        for name in operations.__dataclass_fields__:
            self.assertIs(getattr(operations, name), getattr(organization_management, name))
        with self.assertRaises(FrozenInstanceError):
            operations.link_owner = None

    def test_organization_runtime_has_no_reverse_membership_or_composition_imports(self):
        from core.test_backend_ownership_boundaries import runtime_files

        reverse = []
        for relative, _path, tree in runtime_files():
            if not relative.startswith('organizations/'):
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

    def test_business_packages_do_not_import_the_composition_root(self):
        from core.test_backend_ownership_boundaries import runtime_files

        importers = []
        for relative, _path, tree in runtime_files():
            if relative.startswith('composition/'):
                continue
            for node in ast.walk(tree):
                modules = []
                if isinstance(node, ast.Import):
                    modules = [alias.name for alias in node.names]
                elif isinstance(node, ast.ImportFrom) and not node.level:
                    modules = [node.module or '']
                if any(module.split('.')[0] == 'composition' for module in modules):
                    importers.append((relative, node.lineno))
        self.assertEqual(importers, [])


class MembershipRouteContinuationTests(TestCase):
    def setUp(self):
        self.owner, self.pharmacy = make_owner_with_pharmacy('Boundary pharmacy')
        self.target = make_user('PHARMACIST')
        self.client = client_for(self.owner)

    def invite(self):
        return self.client.post('/api/v1/pharmacy-admins/', {
            'pharmacy': self.pharmacy.pk, 'email': self.target.email,
            'admin_level': 'MANAGER', 'staff_role': 'PHARMACIST',
        }, format='json')

    def test_notice_keeps_the_adapter_dispatch_lookup_at_callback_execution(self):
        with self.captureOnCommitCallbacks(execute=False) as callbacks:
            response = self.invite()
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(len(callbacks), 1)
        # The historical patch point is resolved when the callback executes,
        # even if it was not patched while the invitation was registered.
        with mock.patch('organizations.views.async_task') as queued:
            callbacks[0]()
        queued.assert_called_once()
        self.assertEqual(queued.call_args.args[0], 'users.tasks.send_async_email')
        self.assertEqual(queued.call_args.kwargs['recipient_list'], [self.target.email])
        member = Membership.objects.get(user=self.target, pharmacy=self.pharmacy)
        self.assertEqual(queued.call_args.kwargs['notification']['payload']['membership_id'], member.pk)

    def test_unauthorised_invite_creates_no_membership_assignment_or_callback(self):
        stranger = make_user('PHARMACIST')
        self.client = client_for(stranger)
        with self.captureOnCommitCallbacks(execute=False) as callbacks, \
                mock.patch('organizations.views.async_task') as queued:
            response = self.invite()
        self.assertEqual(response.status_code, 403, response.data)
        self.assertFalse(Membership.objects.filter(user=self.target, pharmacy=self.pharmacy).exists())
        self.assertFalse(PharmacyAdmin.objects.filter(user=self.target, pharmacy=self.pharmacy).exists())
        self.assertEqual(callbacks, [])
        queued.assert_not_called()

    def test_queue_failure_occurs_after_membership_and_invitation_are_committed(self):
        with self.captureOnCommitCallbacks(execute=False) as callbacks:
            response = self.invite()
        self.assertEqual(response.status_code, 201, response.data)
        with mock.patch('organizations.views.async_task', side_effect=ConnectionError('queue unavailable')):
            with self.assertRaisesMessage(ConnectionError, 'queue unavailable'):
                callbacks[0]()
        member = Membership.objects.get(user=self.target, pharmacy=self.pharmacy)
        assignment = PharmacyAdmin.objects.get(user=self.target, pharmacy=self.pharmacy)
        self.assertEqual(member.status, Membership.Status.PENDING)
        self.assertFalse(member.is_active)
        self.assertFalse(assignment.is_active)
        self.assertEqual(assignment.membership_id, member.pk)
