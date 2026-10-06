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

CLAIM_URL = "/api/v1/owner-onboarding/claim/"


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

        self.assertEqual(contact.role, "PHARMACY_MANAGER")
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
                user=user, pharmacy=self.pharmacy, role="OWNER", employment_type="FULL_TIME",
                status=Membership.Status.ACCEPTED, is_active=True,
            )
            PharmacyAdmin.objects.create(
                user=user, pharmacy=self.pharmacy, membership=pharmacy_membership,
                admin_level=PharmacyAdmin.AdminLevel.OWNER, is_active=True,
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
        self.assertEqual(user.role, "PHARMACY_MANAGER")
        assignment = PharmacyAdmin.objects.get(user=user, pharmacy=self.pharmacy)
        self.assertTrue(assignment.is_active)
        self.assertEqual(assignment.admin_level, PharmacyAdmin.AdminLevel.MANAGER)
        self.assertEqual(
            Membership.objects.get(user=user, pharmacy=self.pharmacy).role,
            "CONTACT",
            "the legacy OWNER membership must become the same CONTACT membership created by the new flow",
        )

    def test_other_chief_admins_are_untouched(self):
        _user, real_chief = self.legacy_onboarded(job_title="Chief Operations Officer")
        _user, unassigned = self.legacy_onboarded(with_assignment=False)
        self.migrate()
        self.assertTrue(OrganizationMembership.objects.filter(pk=real_chief.pk, role="CHIEF_ADMIN").exists())
        self.assertTrue(OrganizationMembership.objects.filter(pk=unassigned.pk, role="CHIEF_ADMIN").exists())


class PharmacyManagerAccountTypeTests(TestCase):
    """The PHARMACY_MANAGER account works from the admin dashboard and may choose its own account type once."""

    def setUp(self):
        self.organization = Organization.objects.create(name="Choice Org", slug="choice-org")
        org_admin = make_user("OWNER")
        OrganizationMembership.objects.create(user=org_admin, organization=self.organization, role="ORG_ADMIN")
        client = APIClient()
        client.force_authenticate(user=org_admin)
        with mock.patch("organizations.claims.async_task"):
            response = client.post(CLAIM_URL, {"pharmacy_email": "manager@choice.test"}, format="json")
        self.assertEqual(response.status_code, 201, response.content)
        self.pharmacy = Pharmacy.objects.get(email="manager@choice.test")
        self.contact = self.pharmacy.memberships.get().user
        self.contact.is_otp_verified = True
        self.contact.save(update_fields=["is_otp_verified"])
        self.client = APIClient()
        self.client.force_authenticate(user=self.contact)

    def choose(self, role):
        return self.client.post("/api/users/me/account-type/", {"role": role}, format="json")

    def test_dashboard_is_the_admin_dashboard_of_the_managed_pharmacy(self):
        from users.navigation import get_frontend_dashboard_url

        self.assertTrue(get_frontend_dashboard_url(self.contact).endswith(f"/dashboard/admin/{self.pharmacy.id}"))

    def test_account_type_is_chosen_once_and_admin_access_is_kept(self):
        self.assertEqual(self.choose("EXPLORER").status_code, 400)
        response = self.choose("PHARMACIST")
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response.json()["role"], "PHARMACIST")
        self.assertTrue(response.json()["onboarding_url"].endswith("/dashboard/pharmacist/onboarding"))
        self.assertEqual(self.choose("OWNER").status_code, 400, "the account type can be chosen only once")
        self.assertTrue(has_admin_capability(self.contact, self.pharmacy, CAPABILITY_MANAGE_STAFF))

    def test_owner_onboarding_submission_makes_them_the_real_owner(self):
        self.assertEqual(self.choose("OWNER").status_code, 200)
        self.contact.refresh_from_db()
        response = self.client.patch(
            "/api/v1/owner/onboarding/me/",
            {"tab": "basic", "phone_number": "0400000000", "role": "MANAGER", "submitted_for_verification": True},
            format="json",
        )
        self.assertEqual(response.status_code, 200, response.content)
        self.pharmacy.refresh_from_db()
        self.assertEqual(self.pharmacy.owner.user_id, self.contact.id)
        self.assertEqual(self.pharmacy.organization_id, self.organization.id, "the pharmacy stays in its organisation")
        self.assertEqual(
            PharmacyAdmin.objects.get(user=self.contact, pharmacy=self.pharmacy).admin_level,
            PharmacyAdmin.AdminLevel.OWNER,
        )

    def test_owner_submission_never_takes_over_an_owned_pharmacy(self):
        _owner, owned = make_owner_with_pharmacy("Already Owned")
        owned.email = "manager@choice.test"
        owned.organization = self.organization
        owned.save(update_fields=["email", "organization"])
        PharmacyAdmin.objects.create(user=self.contact, pharmacy=owned, admin_level=PharmacyAdmin.AdminLevel.MANAGER)
        self.choose("OWNER")
        self.client.patch(
            "/api/v1/owner/onboarding/me/",
            {"tab": "basic", "phone_number": "0400000000", "role": "MANAGER", "submitted_for_verification": True},
            format="json",
        )
        owned.refresh_from_db()
        self.assertNotEqual(owned.owner.user_id, self.contact.id)


class SelfRegistrationRoleTests(TestCase):
    def test_invitation_only_account_types_cannot_be_self_registered(self):
        for role in ("PHARMACY_MANAGER", "ORG_STAFF"):
            with (
                self.subTest(role=role),
                mock.patch("users.api_auth.send_async_email"),
                mock.patch("users.api_auth.verify_recaptcha", return_value=True),
            ):
                response = APIClient().post(
                    "/api/users/register/",
                    {
                        "email": f"{role.lower()}@register.test",
                        "password": "Sufficiently-Long-9",
                        "confirm_password": "Sufficiently-Long-9",
                        "role": role,
                        "accepted_terms": True,
                        "captcha_token": "test-token",
                    },
                    format="json",
                )
                self.assertEqual(response.status_code, 400, response.content)
                self.assertIn("role", response.json())
