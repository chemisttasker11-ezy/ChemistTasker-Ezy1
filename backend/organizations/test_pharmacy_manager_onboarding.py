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
        self.assertIsNone(assignment.staff_role)
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

    def test_existing_pharmacist_gets_concrete_pharmacy_membership_and_manager_assignment(self):
        existing = make_user("PHARMACIST")

        response, _ = self.onboard(self.org_admin(), email=existing.email)
        self.assertEqual(response.status_code, 201, response.content)

        existing.refresh_from_db()
        self.assertEqual(existing.role, "PHARMACIST")
        onboarded = Pharmacy.objects.get(email__iexact=existing.email, organization=self.organization)
        membership = Membership.objects.get(user=existing, pharmacy=onboarded)
        assignment = PharmacyAdmin.objects.get(user=existing, pharmacy=onboarded)
        self.assertEqual(membership.role, "PHARMACIST")
        self.assertEqual(membership.status, Membership.Status.ACCEPTED)
        self.assertTrue(membership.is_active)
        self.assertEqual(assignment.admin_level, PharmacyAdmin.AdminLevel.MANAGER)
        self.assertEqual(assignment.staff_role, "PHARMACIST")

    def test_existing_owner_keeps_owner_role_and_can_manage_organization_onboarded_pharmacy(self):
        existing_owner, owned_pharmacy = make_owner_with_pharmacy("Existing Owner Pharmacy")

        response, _ = self.onboard(self.org_admin(), email=existing_owner.email)
        self.assertEqual(response.status_code, 201, response.content)

        existing_owner.refresh_from_db()
        self.assertEqual(existing_owner.role, "OWNER")
        self.assertEqual(owned_pharmacy.owner.user_id, existing_owner.id)

        onboarded = Pharmacy.objects.get(email__iexact=existing_owner.email, organization=self.organization)
        self.assertIsNone(onboarded.owner_id)
        membership = Membership.objects.get(user=existing_owner, pharmacy=onboarded)
        self.assertEqual((membership.role, membership.status, membership.is_active), ("CONTACT", "ACCEPTED", True))

        assignment = PharmacyAdmin.objects.get(user=existing_owner, pharmacy=onboarded)
        self.assertEqual(assignment.admin_level, PharmacyAdmin.AdminLevel.MANAGER)
        self.assertTrue(assignment.is_active)
        self.assertTrue(has_admin_capability(existing_owner, onboarded, CAPABILITY_MANAGE_STAFF))

        # A later owner-profile submission must not turn delegated MANAGER
        # authority into pharmacy ownership.
        existing_owner.is_otp_verified = True
        existing_owner.save(update_fields=["is_otp_verified"])
        owner_client = APIClient()
        owner_client.force_authenticate(user=existing_owner)
        profile_response = owner_client.patch(
            "/api/v1/owner/onboarding/me/",
            {
                "tab": "basic",
                "phone_number": "0400000000",
                "role": "MANAGER",
                "submitted_for_verification": True,
            },
            format="json",
        )
        self.assertEqual(profile_response.status_code, 200, profile_response.content)
        onboarded.refresh_from_db()
        assignment.refresh_from_db()
        self.assertIsNone(onboarded.owner_id)
        self.assertEqual(assignment.admin_level, PharmacyAdmin.AdminLevel.MANAGER)

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

    def choose(self, role, *, pharmacy=None, staff_role=None):
        payload = {
            "role": role,
            "pharmacy_id": (pharmacy or self.pharmacy).id,
        }
        if staff_role:
            payload["staff_role"] = staff_role
        return self.client.post("/api/v1/users/me/account-type/", payload, format="json")

    def test_dashboard_is_the_admin_dashboard_of_the_managed_pharmacy(self):
        from users.navigation import get_frontend_dashboard_url

        self.assertTrue(get_frontend_dashboard_url(self.contact).endswith(f"/dashboard/admin/{self.pharmacy.id}"))

    def test_unassigned_pharmacy_manager_lands_on_admin_invitations(self):
        from users.navigation import get_frontend_dashboard_url

        PharmacyAdmin.objects.filter(user=self.contact, pharmacy=self.pharmacy).update(is_active=False)
        self.assertTrue(get_frontend_dashboard_url(self.contact).endswith("/dashboard/admin-invitations"))

    def test_account_type_is_chosen_once_and_admin_access_is_kept(self):
        self.assertEqual(self.choose("EXPLORER").status_code, 400)
        self.assertEqual(self.choose("OWNER").status_code, 400)
        self.contact.refresh_from_db()
        self.assertEqual(self.contact.role, "PHARMACY_MANAGER")

        response = self.choose("PHARMACIST")
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response.json()["role"], "PHARMACIST")
        self.assertTrue(response.json()["onboarding_url"].endswith("/dashboard/pharmacist/onboarding"))

        membership = Membership.objects.get(user=self.contact, pharmacy=self.pharmacy)
        assignment = PharmacyAdmin.objects.get(user=self.contact, pharmacy=self.pharmacy)
        self.assertEqual(membership.role, "PHARMACIST")
        self.assertEqual(assignment.staff_role, "PHARMACIST")
        self.assertEqual(assignment.admin_level, PharmacyAdmin.AdminLevel.MANAGER)

        self.assertEqual(self.choose("OTHER_STAFF").status_code, 400, "the account type can be chosen only once")
        self.assertTrue(has_admin_capability(self.contact, self.pharmacy, CAPABILITY_MANAGE_STAFF))

    def test_other_staff_conversion_sets_specific_role_once_and_profile_edits_do_not_rewrite_memberships(self):
        second_pharmacy = Pharmacy.objects.create(name="Second Managed Site", organization=self.organization)
        second_membership = Membership.objects.create(
            user=self.contact,
            pharmacy=second_pharmacy,
            role="CONTACT",
            employment_type="FULL_TIME",
            status=Membership.Status.ACCEPTED,
            is_active=True,
        )
        second_assignment = PharmacyAdmin.objects.create(
            user=self.contact,
            pharmacy=second_pharmacy,
            membership=second_membership,
            admin_level=PharmacyAdmin.AdminLevel.MANAGER,
            is_active=True,
        )

        response = self.choose("OTHER_STAFF", staff_role="ASSISTANT")
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response.json()["staff_role"], "ASSISTANT")
        self.assertEqual(response.json()["pharmacy_id"], self.pharmacy.id)

        membership = Membership.objects.get(user=self.contact, pharmacy=self.pharmacy)
        assignment = PharmacyAdmin.objects.get(user=self.contact, pharmacy=self.pharmacy)
        second_membership.refresh_from_db()
        second_assignment.refresh_from_db()
        self.assertEqual(membership.role, "ASSISTANT")
        self.assertEqual(assignment.staff_role, "ASSISTANT")
        self.assertEqual(assignment.admin_level, PharmacyAdmin.AdminLevel.MANAGER)
        self.assertEqual(second_membership.role, "CONTACT")
        self.assertIsNone(second_assignment.staff_role)

        # force_authenticate keeps the original in-memory PHARMACY_MANAGER object,
        # so refresh/re-authenticate before exercising an OTHER_STAFF-only endpoint.
        self.contact.refresh_from_db()
        self.client.force_authenticate(user=self.contact)
        onboarding_response = self.client.patch(
            "/api/v1/otherstaff/onboarding/me/",
            {"tab": "basic", "first_name": "Updated"},
            format="json",
        )
        self.assertEqual(onboarding_response.status_code, 200, onboarding_response.content)

        membership.refresh_from_db()
        assignment.refresh_from_db()
        second_membership.refresh_from_db()
        second_assignment.refresh_from_db()
        self.assertEqual(membership.role, "ASSISTANT")
        self.assertEqual(assignment.staff_role, "ASSISTANT")
        self.assertEqual(second_membership.role, "CONTACT")
        self.assertIsNone(second_assignment.staff_role)

    def test_other_staff_requires_a_concrete_role_at_conversion(self):
        response = self.choose("OTHER_STAFF")
        self.assertEqual(response.status_code, 400, response.content)
        self.assertIn("staff_role", response.json())
        self.contact.refresh_from_db()
        self.assertEqual(self.contact.role, "PHARMACY_MANAGER")

    def test_pharmacist_conversion_only_changes_the_selected_pharmacy(self):
        second_pharmacy = Pharmacy.objects.create(name="Second Managed Pharmacy", organization=self.organization)
        second_membership = Membership.objects.create(
            user=self.contact,
            pharmacy=second_pharmacy,
            role="CONTACT",
            employment_type="FULL_TIME",
            status=Membership.Status.ACCEPTED,
            is_active=True,
        )
        PharmacyAdmin.objects.create(
            user=self.contact,
            pharmacy=second_pharmacy,
            membership=second_membership,
            admin_level=PharmacyAdmin.AdminLevel.MANAGER,
            is_active=True,
        )

        response = self.choose("PHARMACIST")
        self.assertEqual(response.status_code, 200, response.content)

        first_membership = Membership.objects.get(user=self.contact, pharmacy=self.pharmacy)
        second_membership.refresh_from_db()
        self.assertEqual(first_membership.role, "PHARMACIST")
        self.assertEqual(second_membership.role, "CONTACT")

    def test_pharmacist_membership_enables_cross_site_org_kiosk_eligibility(self):
        from attendance.eligibility import EligibilityType, resolve_attendance_eligibility

        response = self.choose("PHARMACIST")
        self.assertEqual(response.status_code, 200, response.content)
        sibling = Pharmacy.objects.create(name="Sibling Site", organization=self.organization)

        eligibility = resolve_attendance_eligibility(self.contact, sibling)
        self.assertTrue(eligibility.is_eligible)
        self.assertEqual(eligibility.eligibility_type, EligibilityType.CROSS_SITE_ORG)
        self.assertEqual(eligibility.source_membership.pharmacy_id, self.pharmacy.id)

    def test_owner_account_type_is_rejected_and_manager_authority_is_unchanged(self):
        response = self.choose("OWNER")
        self.assertEqual(response.status_code, 400, response.content)
        self.assertIn("role", response.json())

        self.contact.refresh_from_db()
        self.pharmacy.refresh_from_db()
        assignment = PharmacyAdmin.objects.get(user=self.contact, pharmacy=self.pharmacy)
        self.assertEqual(self.contact.role, "PHARMACY_MANAGER")
        self.assertIsNone(self.pharmacy.owner_id)
        self.assertEqual(assignment.admin_level, PharmacyAdmin.AdminLevel.MANAGER)
        self.assertEqual(
            assignment.capabilities,
            {
                PharmacyAdmin.CAPABILITY_MANAGE_ADMINS,
                PharmacyAdmin.CAPABILITY_MANAGE_STAFF,
                PharmacyAdmin.CAPABILITY_MANAGE_ROSTER,
                PharmacyAdmin.CAPABILITY_MANAGE_COMMS,
            },
        )


class SelfRegistrationRoleTests(TestCase):
    def test_invitation_only_account_types_cannot_be_self_registered(self):
        for role in ("PHARMACY_MANAGER", "ORG_STAFF"):
            with (
                self.subTest(role=role),
                mock.patch("users.api_auth.send_async_email"),
                mock.patch("users.api_auth.verify_recaptcha", return_value=True),
            ):
                response = APIClient().post(
                    "/api/v1/users/register/",
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
