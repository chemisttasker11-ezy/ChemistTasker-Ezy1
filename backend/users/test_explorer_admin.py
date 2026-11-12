"""Explorer accounts cannot acquire organisation authority through any writer."""
from django.contrib import admin
from django.core.exceptions import ValidationError
from django.test import TestCase
from types import SimpleNamespace
from unittest import mock

from client_profile.characterization_support import client_for, make_user
from organizations.models import Organization, Pharmacy
from users.models import OrganizationMembership
from users.serializers import OrganizationMembershipDetailSerializer

MESSAGE = "Explorer accounts cannot be admins."


class ExplorerOrganizationAdminTests(TestCase):
    def setUp(self):
        self.org = Organization.objects.create(name="Explorer admin regression")
        self.pharmacy = Pharmacy.objects.create(name="Scoped pharmacy", organization=self.org)
        self.actor = make_user("ORG_STAFF")
        OrganizationMembership.objects.create(user=self.actor, organization=self.org, role="ORG_ADMIN")
        self.explorer = make_user("EXPLORER")

    def invite(self, user, role="ORG_ADMIN"):
        with mock.patch("users.api_organizations.deliver_email_best_effort") as sent:
            response = client_for(self.actor).post("/api/v1/users/invite-org-user/", {
                "email": user.email, "organization": self.org.pk, "role": role,
                "job_title": "Lead", "region": "North", "pharmacies": [self.pharmacy.pk],
            }, format="json")
        return response, sent

    def legacy_membership(self):
        # Represent a row predating this rule; never change a user's account role.
        member = OrganizationMembership(user=self.explorer, organization=self.org, role="ORG_ADMIN")
        member.save_base(raw=True)
        return member

    def test_invite_refuses_each_organisation_role_without_writes_or_delivery(self):
        for role, _ in OrganizationMembership.ROLE_CHOICES:
            with self.subTest(role=role):
                response, sent = self.invite(self.explorer, role)
                self.assertEqual(response.status_code, 400, response.content)
                self.assertEqual(response.json()["detail"], MESSAGE)
                self.assertFalse(OrganizationMembership.objects.filter(user=self.explorer).exists())
                sent.assert_not_called()

    def test_invite_preserves_eligible_account_types(self):
        for role in ("OWNER", "PHARMACIST", "OTHER_STAFF", "ORG_STAFF", "PHARMACY_MANAGER"):
            with self.subTest(role=role):
                user = make_user(role)
                response, _ = self.invite(user)
                self.assertEqual(response.status_code, 201, response.content)
                self.assertEqual(OrganizationMembership.objects.get(user=user).role, "ORG_ADMIN")
                user.refresh_from_db()
                self.assertEqual(user.role, role)

    def test_invite_matches_existing_explorer_email_without_case_bypass(self):
        self.explorer.email = self.explorer.email.upper()
        self.explorer.save(update_fields=["email"])
        before = type(self.explorer).objects.count()
        response, sent = self.invite(self.explorer)
        self.assertEqual(response.status_code, 400, response.content)
        self.assertEqual(response.json()["detail"], MESSAGE)
        self.assertEqual(type(self.explorer).objects.count(), before)
        self.assertFalse(OrganizationMembership.objects.filter(user=self.explorer).exists())
        sent.assert_not_called()

    def test_patch_preserves_eligible_account_types(self):
        for role in ("OWNER", "PHARMACIST", "OTHER_STAFF"):
            user = make_user(role)
            member = OrganizationMembership.objects.create(user=user, organization=self.org, role="REGION_ADMIN")
            response = client_for(self.actor).patch(
                f"/api/v1/users/organization-memberships/{member.pk}/",
                {"role": "CHIEF_ADMIN", "job_title": "Updated lead"}, format="json",
            )
            self.assertEqual(response.status_code, 200, response.content)
            member.refresh_from_db()
            self.assertEqual(member.role, "CHIEF_ADMIN")

    def test_reinvite_and_patch_of_legacy_explorer_membership_write_nothing(self):
        member = self.legacy_membership()
        before = OrganizationMembership.objects.values().get(pk=member.pk)
        response, sent = self.invite(self.explorer, "CHIEF_ADMIN")
        self.assertEqual(response.status_code, 400, response.content)
        sent.assert_not_called()
        response = client_for(self.actor).patch(
            f"/api/v1/users/organization-memberships/{member.pk}/",
            {"job_title": "Changed"}, format="json",
        )
        self.assertEqual(response.status_code, 400, response.content)
        self.assertEqual(response.json()["detail"], MESSAGE)
        self.assertEqual(OrganizationMembership.objects.values().get(pk=member.pk), before)

    def test_model_clean_create_update_and_serializer_refuse_explorer(self):
        for role, _ in OrganizationMembership.ROLE_CHOICES:
            with self.subTest(role=role):
                member = OrganizationMembership(user=self.explorer, organization=self.org, role=role)
                with self.assertRaisesMessage(ValidationError, MESSAGE):
                    member.clean()
                with self.assertRaisesMessage(ValidationError, MESSAGE):
                    member.save()
        member = self.legacy_membership()
        member.job_title = "Changed"
        with self.assertRaisesMessage(ValidationError, MESSAGE):
            member.save(update_fields=["job_title"])
        serializer = OrganizationMembershipDetailSerializer(member, data={"job_title": "Changed"}, partial=True)
        self.assertFalse(serializer.is_valid())
        self.assertIn(MESSAGE, str(serializer.errors))

    def test_admin_site_form_rejects_explorer_on_add_and_edit(self):
        model_admin = admin.site._registry[OrganizationMembership]
        for instance in (None, self.legacy_membership()):
            form = model_admin.get_form(SimpleNamespace(user=self.actor), instance)(data={
                "user": self.explorer.pk, "organization": self.org.pk, "role": "ORG_ADMIN",
                "admin_level": "MANAGER", "job_title": "", "region": "",
            }, instance=instance)
            self.assertFalse(form.is_valid())
            self.assertIn(MESSAGE, str(form.errors))
