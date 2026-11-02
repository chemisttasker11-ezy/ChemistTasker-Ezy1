"""Seven behavior cases passed before moving the worker-side organisation queries."""
import ast
from pathlib import Path
from unittest import mock

from django.test import SimpleTestCase, TestCase, override_settings
from client_profile.characterization_support import make_user
from organizations.models import Organization, Pharmacy, PharmacyAdmin
from users.models import OrganizationMembership
from users.org_roles import membership_visible_pharmacies
from users.navigation import get_frontend_dashboard_url

@override_settings(FRONTEND_BASE_URL='https://frontend.example.test')
class WorkerOrganizationBehaviorTests(TestCase):
    def setUp(self):
        self.org=Organization.objects.create(name='Worker scope')
        self.foreign=Organization.objects.create(name='Foreign')
        self.first=Pharmacy.objects.create(name='First',organization=self.org)
        self.second=Pharmacy.objects.create(name='Second',organization=self.org)
        self.outside=Pharmacy.objects.create(name='Outside',organization=self.foreign)

    def membership(self,role):
        return OrganizationMembership.objects.create(user=make_user('OWNER'),organization=self.org,role=role,admin_level='COMMUNICATION_MANAGER')

    def test_no_membership_returns_empty_canonical_queryset_without_queries(self):
        with self.assertNumQueries(0):
            result=membership_visible_pharmacies(None)
            self.assertIs(result.model,Pharmacy)
            self.assertEqual(list(result),[])

    def test_org_and_chief_scope_are_org_wide_even_with_communication_admin_level(self):
        for role in ['ORG_ADMIN','CHIEF_ADMIN']:
            with self.subTest(role=role):
                membership=self.membership(role)
                self.assertCountEqual(membership_visible_pharmacies(membership).values_list('pk',flat=True),[self.first.pk,self.second.pk])

    def test_region_scope_filters_foreign_assigned_pharmacies(self):
        membership=self.membership('REGION_ADMIN')
        membership.pharmacies.set([self.first,self.outside])
        self.assertEqual(list(membership_visible_pharmacies(membership).values_list('pk',flat=True)),[self.first.pk])

    def test_unknown_role_returns_empty_queryset(self):
        membership=self.membership('UNKNOWN')
        with self.assertNumQueries(0):
            self.assertEqual(list(membership_visible_pharmacies(membership)),[])

    def test_manager_navigation_preserves_active_assignment_id_order(self):
        user=make_user('PHARMACY_MANAGER')
        PharmacyAdmin.objects.create(user=user,pharmacy=self.first,is_active=False)
        PharmacyAdmin.objects.create(user=user,pharmacy=self.second,is_active=True)
        PharmacyAdmin.objects.create(user=user,pharmacy=self.outside,is_active=True)
        self.assertEqual(get_frontend_dashboard_url(user),f'https://frontend.example.test/dashboard/admin/{self.second.pk}')

    def test_navigation_does_not_adopt_the_stricter_actor_authorization_selector(self):
        user=make_user('PHARMACY_MANAGER',is_active=False)
        PharmacyAdmin.objects.create(user=user,pharmacy=self.first,is_active=True)
        self.assertEqual(get_frontend_dashboard_url(user),f'https://frontend.example.test/dashboard/admin/{self.first.pk}')

    def test_manager_without_assignment_keeps_invitation_fallback(self):
        self.assertEqual(get_frontend_dashboard_url(make_user('PHARMACY_MANAGER')),'https://frontend.example.test/dashboard/admin-invitations')


class WorkerOrganizationOwnershipTests(SimpleTestCase):
    def test_startup_ports_point_to_the_canonical_organization_selectors(self):
        from organizations import identity_reads
        from users.organization_port import organization_reads
        reads = organization_reads()
        self.assertIs(reads.visible_pharmacies_for_membership, identity_reads.visible_pharmacies_for_membership)
        self.assertIs(reads.manager_dashboard_pharmacy_id, identity_reads.manager_dashboard_pharmacy_id)

    def test_identity_scope_and_navigation_no_longer_import_organization_models(self):
        root = Path(__file__).resolve().parent
        for name in ["org_roles.py", "navigation.py"]:
            tree = ast.parse((root / name).read_text())
            imports = [node.module for node in ast.walk(tree) if isinstance(node, ast.ImportFrom) and node.module]
            imports += [alias.name for node in ast.walk(tree) if isinstance(node, ast.Import) for alias in node.names]
            self.assertFalse(any(name == "organizations" or name.startswith("organizations.") for name in imports))

    def test_rebinding_is_idempotent_and_runs_without_queries_or_delivery(self):
        from composition.identity_organizations import configure_identity_organization_reads
        from users.organization_port import organization_reads
        from organizations import identity_reads
        with mock.patch("django.db.backends.utils.CursorWrapper.execute", side_effect=AssertionError("startup SQL")), \
                mock.patch("celery.app.base.Celery.send_task", side_effect=AssertionError("startup task")):
            configure_identity_organization_reads()
            configure_identity_organization_reads()
        self.assertIs(organization_reads().manager_dashboard_pharmacy_id, identity_reads.manager_dashboard_pharmacy_id)
