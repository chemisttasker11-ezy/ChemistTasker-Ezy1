"""Organization/identity model, field and scope contracts frozen before movement."""
import ast
import importlib
import os
import pickle
import subprocess
import sys
from dataclasses import FrozenInstanceError
from pathlib import Path
from unittest import mock

from django.apps import apps
from django.test import SimpleTestCase, TestCase, override_settings

from client_profile.characterization_support import make_user
from organizations.models import Organization, Pharmacy, PharmacyAdmin
from users.models import OrganizationMembership, User
from users.navigation import get_frontend_dashboard_url
from users.org_roles import membership_visible_pharmacies
from users.serializers import InviteOrgUserSerializer


class OrganizationIdentityFactsTests(SimpleTestCase):
    def test_model_registry_table_and_relationship_identity_stays_historical(self):
        self.assertIs(apps.get_model('users', 'User'), User)
        self.assertIs(apps.get_model('users', 'OrganizationMembership'), OrganizationMembership)
        self.assertEqual(OrganizationMembership._meta.db_table, 'users_organizationmembership')
        relation = OrganizationMembership._meta.get_field('organization')
        self.assertIs(relation.remote_field.model, Organization)
        self.assertEqual(relation.deconstruct()[3]['to'], 'client_profile.organization')
        level = OrganizationMembership._meta.get_field('admin_level')
        self.assertEqual(level.choices, PharmacyAdmin._meta.get_field('admin_level').choices)
        self.assertEqual(level.default, 'MANAGER')

    def test_admin_enum_keeps_choices_and_historical_pickle_identity(self):
        levels = PharmacyAdmin.AdminLevel
        self.assertEqual(levels.choices, [('OWNER', 'Owner'), ('MANAGER', 'Manager'),
            ('ROSTER_MANAGER', 'Roster Manager'), ('COMMUNICATION_MANAGER', 'Communication Manager')])
        self.assertEqual(levels.__module__, 'organizations.models')
        self.assertEqual(levels.__qualname__, 'PharmacyAdmin.AdminLevel')
        for value in levels:
            self.assertIs(pickle.loads(pickle.dumps(value)), value)
        self.assertEqual(PharmacyAdmin.CAPABILITY_MATRIX[levels.ROSTER_MANAGER],
            {'MANAGE_ROSTER', 'MANAGE_COMMUNICATIONS'})

    def test_missing_organization_membership_is_an_empty_pharmacy_queryset(self):
        queryset = membership_visible_pharmacies(None)
        self.assertIs(queryset.model, Pharmacy)
        self.assertEqual(list(queryset), [])


class OrganizationIdentityValidationTests(TestCase):
    def setUp(self):
        self.org = Organization.objects.create(name='Identity validation organization')
        self.pharmacy = Pharmacy.objects.create(name='Scoped pharmacy', organization=self.org)

    def validate_invite(self, **overrides):
        data = {'email': 'invitee@example.test', 'organization': self.org.pk,
                'role': 'REGION_ADMIN', 'admin_level': 'MANAGER', 'job_title': 'Regional lead',
                'region': 'North', 'pharmacies': [self.pharmacy.pk]}
        data.update(overrides)
        serializer = InviteOrgUserSerializer(data=data)
        serializer.is_valid()
        return serializer

    def test_invitation_related_fields_keep_same_resolved_models_and_error_codes(self):
        valid = self.validate_invite()
        self.assertEqual(valid.errors, {})
        self.assertEqual(valid.validated_data['organization'], self.org)
        self.assertEqual(valid.validated_data['pharmacies'], [self.pharmacy])
        invalid_org = self.validate_invite(organization=999999)
        self.assertEqual(invalid_org.errors['organization'][0].code, 'does_not_exist')
        invalid_pharmacy = self.validate_invite(pharmacies=['invalid'])
        self.assertEqual(invalid_pharmacy.errors['pharmacies'][0].code, 'incorrect_type')
        foreign = Pharmacy.objects.create(name='Foreign pharmacy')
        invalid_scope = self.validate_invite(pharmacies=[foreign.pk])
        self.assertEqual(str(invalid_scope.errors['pharmacies'][0]),
                         'All selected pharmacies must belong to this organization.')

    @override_settings(FRONTEND_BASE_URL='https://frontend.example.test')
    def test_manager_navigation_retains_active_assignment_order_and_empty_fallback(self):
        manager = make_user('PHARMACY_MANAGER')
        self.assertEqual(get_frontend_dashboard_url(manager),
            'https://frontend.example.test/dashboard/admin-invitations')
        inactive = PharmacyAdmin.objects.create(user=manager, pharmacy=self.pharmacy, is_active=False)
        second = Pharmacy.objects.create(name='Second pharmacy')
        PharmacyAdmin.objects.create(user=manager, pharmacy=second, is_active=True)
        self.assertEqual(get_frontend_dashboard_url(manager),
            f'https://frontend.example.test/dashboard/admin/{second.pk}')
        inactive.is_active = True
        inactive.save(update_fields=['is_active'])
        self.assertEqual(get_frontend_dashboard_url(manager),
            f'https://frontend.example.test/dashboard/admin/{self.pharmacy.pk}')


class OrganizationReadCompositionTests(SimpleTestCase):
    def test_shared_policy_is_model_free_and_preserves_model_enum_object(self):
        from access_control import pharmacy_roles

        policy = pharmacy_roles.PharmacyAdminPolicy
        self.assertIs(PharmacyAdmin.AdminLevel, policy.AdminLevel)
        self.assertIs(PharmacyAdmin.CAPABILITY_MATRIX, policy.CAPABILITY_MATRIX)
        tree = ast.parse(Path(pharmacy_roles.__file__).read_text())
        imports = {node.module for node in ast.walk(tree) if isinstance(node, ast.ImportFrom)}
        self.assertEqual(imports, {'django.db'})

    def test_read_bindings_are_immutable_canonical_and_perform_no_io(self):
        from composition import identity_organizations
        from organizations import identity_reads
        from users.organization_port import organization_reads

        with mock.patch('django.db.backends.utils.CursorWrapper.execute', side_effect=AssertionError('startup SQL')), \
                mock.patch('celery.app.base.Celery.send_task', side_effect=AssertionError('startup delivery')):
            importlib.reload(identity_organizations)
        reads = organization_reads()
        for name in reads.__dataclass_fields__:
            self.assertIs(getattr(reads, name), getattr(identity_reads, name))
        with self.assertRaises(FrozenInstanceError):
            reads.owned_pharmacies = None

    def test_cold_worker_helpers_do_not_require_url_composition_then_http_binds_without_io(self):
        child = '''
import sys
from types import SimpleNamespace
from unittest import mock
import django
django.setup()
assert 'composition.urls' not in sys.modules
from users.organization_port import _reads
assert _reads is not None
from users.organization_port import organization_reads
from organizations import identity_reads
assert organization_reads().visible_pharmacies_for_membership is identity_reads.visible_pharmacies_for_membership
from users.org_roles import membership_visible_pharmacies
from users.navigation import get_frontend_dashboard_url
from organizations.models import Pharmacy, PharmacyAdmin
with mock.patch('django.db.backends.utils.CursorWrapper.execute', side_effect=AssertionError('startup SQL')):
    assert membership_visible_pharmacies(None).model is Pharmacy
    with mock.patch.object(PharmacyAdmin.objects, 'filter') as selected:
        selected.return_value.order_by.return_value.values_list.return_value.first.return_value = None
        assert get_frontend_dashboard_url(SimpleNamespace(role='PHARMACY_MANAGER')).endswith('/dashboard/admin-invitations')
with mock.patch('django.db.backends.utils.CursorWrapper.execute', side_effect=AssertionError('startup SQL')), mock.patch('celery.app.base.Celery.send_task', side_effect=AssertionError('startup delivery')):
    from django.urls import get_resolver
    get_resolver().url_patterns
from users.organization_port import organization_reads
from organizations import identity_reads
assert organization_reads().owned_pharmacies is identity_reads.owned_pharmacies
print('cold worker and HTTP composition ready')
'''
        result = subprocess.run([sys.executable, '-c', child],
            cwd=Path(__file__).resolve().parents[1],
            env={**os.environ, 'DJANGO_SETTINGS_MODULE': 'core.contract_test_settings'},
            capture_output=True, text=True, timeout=60)
        self.assertEqual(result.returncode, 0, result.stderr[-3000:])
        self.assertIn('cold worker and HTTP composition ready', result.stdout)
