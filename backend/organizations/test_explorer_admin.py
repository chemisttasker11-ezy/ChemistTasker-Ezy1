"""Admin assignment routes must refuse Explorers atomically, including legacy invitations."""
from datetime import timedelta
from unittest import mock
from types import SimpleNamespace

from django.contrib import admin
from django.core.exceptions import ValidationError
from django.test import TestCase
from django.utils import timezone

from client_profile.characterization_support import client_for, make_owner_with_pharmacy, make_user
from memberships.models import Membership, MembershipApplication, MembershipInviteLink
from memberships.organization_management import bootstrap_contact, link_owner
from organizations.models import Organization, Pharmacy, PharmacyAdmin
from organizations.serializers import PharmacyAdminSerializer
from users.models import OrganizationMembership

MESSAGE = "Explorer accounts cannot be admins."


class ExplorerPharmacyAdminTests(TestCase):
    def setUp(self):
        self.owner, self.pharmacy = make_owner_with_pharmacy("Explorer regression pharmacy")
        self.explorer = make_user("EXPLORER")
        self.org = Organization.objects.create(name="Explorer regression org")
        OrganizationMembership.objects.create(user=self.owner, organization=self.org, role="ORG_ADMIN")

    def invite(self, user, level="MANAGER", staff_role="PHARMACIST"):
        return client_for(self.owner).post("/api/v1/pharmacy-admins/", {
            "pharmacy": self.pharmacy.pk, "email": user.email.upper(), "admin_level": level,
            "staff_role": staff_role,
        }, format="json")

    def legacy_invite(self, user):
        member = Membership.objects.create(user=user, pharmacy=self.pharmacy, role="CONTACT",
            employment_type="FULL_TIME", status="PENDING", is_active=False)
        assignment = PharmacyAdmin(user=user, pharmacy=self.pharmacy, membership=member,
            admin_level="MANAGER", is_active=False, created_at=timezone.now(), updated_at=timezone.now())
        assignment.save_base(raw=True)
        return member, assignment

    def test_every_admin_level_and_contact_invite_refuses_explorer_without_writes(self):
        for level in PharmacyAdmin.AdminLevel.values:
            for staff_role, _ in PharmacyAdmin.ADMIN_STAFF_ROLE_CHOICES:
                with self.subTest(level=level, staff_role=staff_role):
                    explorer = make_user("EXPLORER")
                    with self.captureOnCommitCallbacks(execute=False) as callbacks:
                        response = self.invite(explorer, level, staff_role)
                        self.assertEqual(response.status_code, 400, response.content)
                        self.assertEqual(response.json()["detail"], MESSAGE)
                        self.assertFalse(Membership.objects.filter(user=explorer).exists())
                        self.assertFalse(PharmacyAdmin.objects.filter(user=explorer).exists())
                    self.assertEqual(callbacks, [])

    def test_new_admin_invite_still_creates_eligible_staff_account(self):
        response = client_for(self.owner).post("/api/v1/pharmacy-admins/", {
            "pharmacy": self.pharmacy.pk, "email": "new-manager@example.test",
            "admin_level": "MANAGER", "staff_role": "PHARMACIST",
        }, format="json")
        self.assertEqual(response.status_code, 201, response.content)
        self.assertEqual(PharmacyAdmin.objects.get(user__email="new-manager@example.test").user.role,
            "PHARMACIST")

    def test_eligible_accounts_can_be_invited_and_accept_through_both_routes(self):
        for account in ("OWNER", "PHARMACIST", "OTHER_STAFF", "ORG_STAFF", "PHARMACY_MANAGER"):
            for route in ("admin", "member"):
                with self.subTest(account=account, route=route):
                    user = make_user(account)
                    with self.captureOnCommitCallbacks(execute=False):
                        response = self.invite(user)
                    self.assertEqual(response.status_code, 201, response.content)
                    assignment = PharmacyAdmin.objects.get(user=user)
                    url = (f"pharmacy-admins/{assignment.pk}/accept-invitation/" if route == "admin"
                        else f"my-memberships/{assignment.membership_id}/accept/")
                    with self.captureOnCommitCallbacks(execute=False):
                        response = client_for(user).post("/api/v1/" + url, {}, format="json")
                    self.assertEqual(response.status_code, 200, response.content)
                    assignment.refresh_from_db()
                    self.assertTrue(assignment.is_active)

    def test_both_acceptance_routes_refuse_legacy_explorer_invitation_without_changes(self):
        for route in ("admin", "member"):
            with self.subTest(route=route):
                explorer = make_user("EXPLORER")
                member, assignment = self.legacy_invite(explorer)
                url = (f"pharmacy-admins/{assignment.pk}/accept-invitation/" if route == "admin"
                    else f"my-memberships/{member.pk}/accept/")
                with self.captureOnCommitCallbacks(execute=False) as callbacks:
                    before = Membership.objects.values().get(pk=member.pk)
                    response = client_for(explorer).post("/api/v1/" + url, {}, format="json")
                    self.assertEqual(response.status_code, 400, response.content)
                    self.assertEqual(response.json()["detail"], MESSAGE)
                    self.assertEqual(Membership.objects.values().get(pk=member.pk), before)
                    assignment.refresh_from_db()
                    self.assertFalse(assignment.is_active)
                self.assertEqual(callbacks, [])

    def test_claim_bootstrap_refuses_explorer_without_placeholder_or_notification(self):
        before = Pharmacy.objects.count()
        with mock.patch("organizations.claims.async_task") as sent:
            response = client_for(self.owner).post("/api/v1/owner-onboarding/claim/",
                {"pharmacy_email": self.explorer.email}, format="json")
        self.assertEqual(response.status_code, 400, response.content)
        self.assertEqual(response.json()["detail"], MESSAGE)
        self.assertEqual(Pharmacy.objects.count(), before)
        self.assertFalse(Membership.objects.filter(user=self.explorer).exists())
        self.assertFalse(PharmacyAdmin.objects.filter(user=self.explorer).exists())
        sent.assert_not_called()

    def test_pharmacy_creation_refuses_explorer_before_creating_owner_assignment(self):
        legacy = OrganizationMembership(user=self.explorer, organization=self.org, role="ORG_ADMIN")
        legacy.save_base(raw=True)
        before = Pharmacy.objects.count()
        with self.captureOnCommitCallbacks(execute=False) as callbacks:
            response = client_for(self.explorer).post("/api/v1/pharmacies/",
                {"name": "Forbidden explorer pharmacy", "abn": "51824753556"}, format="json")
        self.assertEqual(response.status_code, 400, response.content)
        self.assertEqual(response.json()["detail"], MESSAGE)
        self.assertEqual(Pharmacy.objects.count(), before)
        self.assertFalse(Membership.objects.filter(user=self.explorer).exists())
        self.assertFalse(PharmacyAdmin.objects.filter(user=self.explorer).exists())
        self.assertEqual(callbacks, [])

    def test_pharmacy_creation_preserves_eligible_account_types(self):
        for role in ("OWNER", "PHARMACIST", "OTHER_STAFF"):
            with self.subTest(role=role):
                user = make_user(role)
                OrganizationMembership.objects.create(user=user, organization=self.org, role="ORG_ADMIN")
                with self.captureOnCommitCallbacks(execute=False):
                    response = client_for(user).post("/api/v1/pharmacies/",
                        {"name": f"Allowed {role} pharmacy", "abn": "51824753556"}, format="json")
                self.assertEqual(response.status_code, 201, response.content)
                self.assertTrue(PharmacyAdmin.objects.filter(user=user, admin_level="OWNER").exists())

    def test_claim_bootstrap_cannot_bypass_existing_explorer_with_email_casing(self):
        self.explorer.email = self.explorer.email.upper()
        self.explorer.save(update_fields=["email"])
        before_users = type(self.explorer).objects.count()
        before_pharmacies = Pharmacy.objects.count()
        with mock.patch("organizations.claims.async_task") as sent:
            response = client_for(self.owner).post("/api/v1/owner-onboarding/claim/",
                {"pharmacy_email": self.explorer.email.lower()}, format="json")
        self.assertEqual(response.status_code, 400, response.content)
        self.assertEqual(response.json()["detail"], MESSAGE)
        self.assertEqual(type(self.explorer).objects.count(), before_users)
        self.assertEqual(Pharmacy.objects.count(), before_pharmacies)
        sent.assert_not_called()

    def test_claim_bootstrap_preserves_eligible_account_types(self):
        for role in ("OWNER", "PHARMACIST", "OTHER_STAFF", "ORG_STAFF", "PHARMACY_MANAGER"):
            with self.subTest(role=role):
                user = make_user(role)
                with mock.patch("organizations.claims.async_task"):
                    response = client_for(self.owner).post("/api/v1/owner-onboarding/claim/",
                        {"pharmacy_email": user.email}, format="json")
                self.assertEqual(response.status_code, 201, response.content)
                assignment = PharmacyAdmin.objects.get(user=user)
                self.assertEqual(assignment.admin_level, "MANAGER")
                user.refresh_from_db()
                self.assertEqual(user.role, role)

    def test_reinviting_explorer_does_not_change_existing_membership_or_assignment(self):
        member, assignment = self.legacy_invite(self.explorer)
        before_member = Membership.objects.values().get(pk=member.pk)
        before_admin = PharmacyAdmin.objects.values().get(pk=assignment.pk)
        response = self.invite(self.explorer)
        self.assertEqual(response.status_code, 400, response.content)
        self.assertEqual(response.json()["detail"], MESSAGE)
        self.assertEqual(Membership.objects.values().get(pk=member.pk), before_member)
        self.assertEqual(PharmacyAdmin.objects.values().get(pk=assignment.pk), before_admin)

    def test_owner_can_still_revoke_legacy_explorer_admin_access(self):
        member, assignment = self.legacy_invite(self.explorer)
        client = client_for(self.owner)
        client.raise_request_exception = False
        response = client.delete(f"/api/v1/pharmacy-admins/{assignment.pk}/")
        self.assertEqual(response.status_code, 204, response.content)
        assignment.refresh_from_db()
        member.refresh_from_db()
        self.assertFalse(assignment.is_active)
        self.assertIsNone(assignment.membership_id)
        self.assertEqual(member.status, Membership.Status.REJECTED)

    def test_shared_services_refuse_before_creating_staff_membership(self):
        from pharmacy_hub.access import HubScopeResolver

        for name, operation in (
            ("contact", lambda user: bootstrap_contact(user, self.pharmacy, self.owner)),
            ("owner", lambda user: link_owner(user, self.pharmacy)),
            ("hub", lambda user: HubScopeResolver(user)._activate_or_create_membership(self.pharmacy)),
        ):
            with self.subTest(operation=name):
                explorer = make_user("EXPLORER")
                with self.assertRaisesMessage(ValidationError, MESSAGE):
                    operation(explorer)
                self.assertFalse(Membership.objects.filter(user=explorer).exists())
                self.assertFalse(PharmacyAdmin.objects.filter(user=explorer).exists())

    def test_models_forms_and_serializer_refuse_each_level_and_user_reassignment(self):
        for level in PharmacyAdmin.AdminLevel.values:
            assignment = PharmacyAdmin(user=self.explorer, pharmacy=self.pharmacy, admin_level=level)
            with self.subTest(level=level):
                with self.assertRaisesMessage(ValidationError, MESSAGE):
                    assignment.clean()
                with self.assertRaisesMessage(ValidationError, MESSAGE):
                    assignment.save()
        user = make_user("PHARMACIST")
        assignment = PharmacyAdmin.objects.create(user=user, pharmacy=self.pharmacy, admin_level="MANAGER")
        serializer = PharmacyAdminSerializer(assignment, data={"user": self.explorer.pk}, partial=True)
        self.assertFalse(serializer.is_valid())
        self.assertIn(MESSAGE, str(serializer.errors))
        assignment.user = self.explorer
        with self.assertRaisesMessage(ValidationError, MESSAGE):
            assignment.save(update_fields=["user"])
        assignment.refresh_from_db()
        self.assertEqual(assignment.user_id, user.pk)
        model_admin = admin.site._registry[PharmacyAdmin]
        form = model_admin.get_form(SimpleNamespace(user=self.owner))(data={"user": self.explorer.pk, "pharmacy": self.pharmacy.pk,
            "admin_level": "MANAGER", "staff_role": "PHARMACIST", "is_active": True})
        self.assertFalse(form.is_valid())
        self.assertIn(MESSAGE, str(form.errors))

    def test_non_admin_contact_invite_and_acceptance_still_work_for_explorer(self):
        with mock.patch("memberships.invites.async_task"), self.captureOnCommitCallbacks(execute=False):
            response = client_for(self.owner).post("/api/v1/memberships/", {
                "pharmacy": self.pharmacy.pk, "email": self.explorer.email, "role": "CONTACT",
                "employment_type": "FULL_TIME", "job_title": "Contact", "is_admin": True,
            }, format="json")
        self.assertEqual(response.status_code, 201, response.content)
        member = Membership.objects.get(user=self.explorer)
        with self.captureOnCommitCallbacks(execute=False):
            response = client_for(self.explorer).post(f"/api/v1/my-memberships/{member.pk}/accept/", {}, format="json")
        self.assertEqual(response.status_code, 200, response.content)
        self.assertFalse(PharmacyAdmin.objects.filter(user=self.explorer).exists())

    def test_staff_bulk_invites_and_magic_application_cannot_grant_admin(self):
        with mock.patch("memberships.invites.async_task"), self.captureOnCommitCallbacks(execute=False):
            response = client_for(self.owner).post("/api/v1/memberships/bulk_invite/", {"invitations": [{
                "pharmacy": self.pharmacy.pk, "email": self.explorer.email, "role": "PHARMACY_ADMIN",
                "employment_type": "FULL_TIME", "is_admin": True,
            }]}, format="json")
        self.assertEqual(response.status_code, 207, response.content)
        self.assertFalse(Membership.objects.filter(user=self.explorer).exists())
        link = MembershipInviteLink.objects.create(pharmacy=self.pharmacy, created_by=self.owner,
            category="LOCUM_CASUAL", expires_at=timezone.now() + timedelta(days=1))
        response = client_for(self.explorer).post(f"/api/v1/magic/memberships/{link.token}/apply/", {
            "role": "PHARMACY_ADMIN", "email": self.explorer.email, "first_name": "Explorer",
            "last_name": "Applicant", "mobile_number": "0400000000", "date_of_birth": "1990-01-01",
            "is_admin": True,
        }, format="json")
        self.assertEqual(response.status_code, 400, response.content)
        self.assertFalse(MembershipApplication.objects.filter(email=self.explorer.email).exists())
        self.assertFalse(PharmacyAdmin.objects.filter(user=self.explorer).exists())
