"""Email onboarding makes the invited contact the manager of that one pharmacy, never an organisation-wide admin.

Chief Admin is an organisation-wide role, so the onboarding flow grants a pharmacy-level MANAGER assignment (the
owner's capabilities without being the owner) and no organisation membership. users.0002 converts the scoped Chief
Admins the old flow created.
"""
import importlib
from types import SimpleNamespace
from unittest import mock

from django.apps import apps
from django.db import connection
from django.test import TestCase
from rest_framework.test import APIClient

from client_profile.characterization_support import make_owner_with_pharmacy, make_user
from memberships.models import Membership
from organizations.access import CAPABILITY_MANAGE_STAFF, has_admin_capability
from organizations.models import Organization, Pharmacy, PharmacyAdmin
from users.models import OrganizationMembership

CLAIM_URL = "/api/client-profile/owner-onboarding/claim/"


class PharmacyManagerOnboardingTests(TestCase):
    def setUp(self):
        self.organization = Organization.objects.create(name="Onboarding Org", slug="onboarding-org")
        self.sibling = Pharmacy.objects.create(name="Sibling", organization=self.organization)

    def org_admin(self, role="ORG_ADMIN"):
        user = make_user("OWNER")
        OrganizationMembership.objects.create(user=user, organization=self.organization, role=role)
        return user

    def onboard(self, actor, email="contact@new-pharmacy.test"):
        client = APIClient()
        client.force_authenticate(user=actor)
        with mock.patch("organizations.claims.async_task") as queued:
            response = client.post(CLAIM_URL, {"pharmacy_email": email}, format="json")
        return response, queued

    def test_onboarded_contact_is_a_pharmacy_manager_without_an_organisation_role(self):
        response, queued = self.onboard(self.org_admin())
        self.assertEqual(response.status_code, 201, response.content)
        body = response.json()
        pharmacy = Pharmacy.objects.get(email="contact@new-pharmacy.test")
        contact = pharmacy.memberships.get().user

        self.assertEqual(contact.role, "EXPLORER")
        self.assertFalse(OrganizationMembership.objects.filter(user=contact).exists())
        self.assertIsNone(body["organization_membership_id"])

        assignment = PharmacyAdmin.objects.get(user=contact, pharmacy=pharmacy)
        self.assertEqual(assignment.admin_level, PharmacyAdmin.AdminLevel.MANAGER)
        self.assertTrue(assignment.is_active)
        self.assertEqual(body["pharmacy_admin_id"], assignment.id)
        membership = Membership.objects.get(user=contact, pharmacy=pharmacy)
        self.assertEqual((membership.role, membership.status, membership.is_active), ("CONTACT", "ACCEPTED", True))

        self.assertTrue(has_admin_capability(contact, pharmacy, CAPABILITY_MANAGE_STAFF))
        self.assertFalse(has_admin_capability(contact, self.sibling, CAPABILITY_MANAGE_STAFF))

        context = queued.call_args.kwargs["context"]
        self.assertTrue(context["dashboard_link"].endswith(f"/dashboard/admin/{pharmacy.id}"))
        self.assertEqual(context["pharmacies"], [pharmacy.name])
        self.assertEqual(context["role_label"], "Pharmacy Manager")

    def test_chief_admin_can_onboard_but_region_admin_cannot(self):
        chief_response, _ = self.onboard(self.org_admin("CHIEF_ADMIN"), email="chief@new-pharmacy.test")
        self.assertEqual(chief_response.status_code, 201, chief_response.content)
        region_response, _ = self.onboard(self.org_admin("REGION_ADMIN"), email="region@new-pharmacy.test")
        self.assertEqual(region_response.status_code, 403, region_response.content)


class OnboardedChiefAdminMigrationTests(TestCase):
    """users.0002 converts the old scoped onboarding Chief Admins and leaves every other Chief Admin alone."""

    def setUp(self):
        self.organization = Organization.objects.create(name="Migration Org", slug="migration-org")
        _owner, self.pharmacy = make_owner_with_pharmacy("Migrated")
        self.pharmacy.organization = self.organization
        self.pharmacy.save(update_fields=["organization"])

    def legacy_onboarded(self, job_title="Pharmacy Onboarding Admin", with_assignment=True):
        user = make_user("ORG_STAFF")
        membership = OrganizationMembership.objects.create(
            user=user, organization=self.organization, role="CHIEF_ADMIN", job_title=job_title,
        )
        membership.pharmacies.add(self.pharmacy)
        if with_assignment:
            pharmacy_membership = Membership.objects.create(
                user=user, pharmacy=self.pharmacy, role="CONTACT", employment_type="FULL_TIME",
                status=Membership.Status.ACCEPTED, is_active=True,
            )
            PharmacyAdmin.objects.create(
                user=user, pharmacy=self.pharmacy, membership=pharmacy_membership,
                admin_level=PharmacyAdmin.AdminLevel.MANAGER, is_active=True,
            )
        return user, membership

    def migrate(self):
        module = importlib.import_module("users.migrations.0002_onboarded_pharmacy_managers")
        module.convert_onboarded_chief_admins(apps, SimpleNamespace(connection=connection))

    def test_onboarding_chief_admin_becomes_pharmacy_manager(self):
        user, membership = self.legacy_onboarded()
        self.migrate()
        self.assertFalse(OrganizationMembership.objects.filter(pk=membership.pk).exists())
        user.refresh_from_db()
        self.assertEqual(user.role, "EXPLORER")
        assignment = PharmacyAdmin.objects.get(user=user, pharmacy=self.pharmacy)
        self.assertTrue(assignment.is_active)
        self.assertEqual(assignment.admin_level, PharmacyAdmin.AdminLevel.MANAGER)

    def test_other_chief_admins_are_untouched(self):
        _user, real_chief = self.legacy_onboarded(job_title="Chief Operations Officer")
        _user, unassigned = self.legacy_onboarded(with_assignment=False)
        self.migrate()
        self.assertTrue(OrganizationMembership.objects.filter(pk=real_chief.pk, role="CHIEF_ADMIN").exists())
        self.assertTrue(OrganizationMembership.objects.filter(pk=unassigned.pk, role="CHIEF_ADMIN").exists())
