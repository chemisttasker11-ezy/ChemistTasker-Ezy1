"""Organisation role scope: Org Admin and Chief Admin reach every pharmacy of their organisation; Region Admin only its
assigned pharmacies."""
from django.test import TestCase

from client_profile.characterization_support import client_for, make_owner_with_pharmacy, make_user
from organizations.models import Organization, Pharmacy, PharmacyAdmin
from organizations.serializers import PharmacySerializer
from users.models import OrganizationMembership, User
from users.org_roles import (
    ORG_WIDE_ADMIN_ROLES,
    ROLE_DEFINITIONS,
    membership_has_org_wide_scope,
    membership_visible_pharmacy_ids,
    role_capabilities,
)


class OrgRoleScopeTests(TestCase):
    def setUp(self):
        self.organization = Organization.objects.create(name="Scope Org", slug="scope-org")
        self.north = Pharmacy.objects.create(name="North", organization=self.organization)
        self.south = Pharmacy.objects.create(name="South", organization=self.organization)
        Pharmacy.objects.create(name="Elsewhere", organization=Organization.objects.create(name="Other", slug="other"))

    def membership(self, role, pharmacies=()):
        user = User.objects.create_user(email=f"{role.lower()}@scope.test", password=None, role="ORG_STAFF")
        membership = OrganizationMembership.objects.create(user=user, organization=self.organization, role=role)
        membership.pharmacies.set(pharmacies)
        return membership

    def test_org_wide_roles(self):
        self.assertEqual(set(ORG_WIDE_ADMIN_ROLES), {"ORG_ADMIN", "CHIEF_ADMIN"})
        self.assertEqual(role_capabilities("CHIEF_ADMIN"), role_capabilities("ORG_ADMIN"))
        self.assertFalse(ROLE_DEFINITIONS["CHIEF_ADMIN"].requires_pharmacies)
        self.assertTrue(ROLE_DEFINITIONS["REGION_ADMIN"].requires_pharmacies)

    def test_visible_pharmacies_per_role(self):
        org_wide = {self.north.id, self.south.id}
        for role in ("ORG_ADMIN", "CHIEF_ADMIN"):
            with self.subTest(role=role):
                membership = self.membership(role, [self.north])
                self.assertTrue(membership_has_org_wide_scope(membership))
                self.assertEqual(set(membership_visible_pharmacy_ids(membership)), org_wide)
        region = self.membership("REGION_ADMIN", [self.north])
        self.assertFalse(membership_has_org_wide_scope(region))
        self.assertEqual(membership_visible_pharmacy_ids(region), [self.north.id])

    def test_restricted_member_can_read_but_cannot_write_pharmacy(self):
        membership = self.membership("REGION_ADMIN", [self.north])
        membership.admin_level = PharmacyAdmin.AdminLevel.COMMUNICATION_MANAGER
        membership.save(update_fields=["admin_level"])
        client = client_for(membership.user)
        path = f"/api/v1/pharmacies/{self.north.pk}/"
        before = Pharmacy.objects.values().get(pk=self.north.pk)

        response = client.get(path)
        self.assertEqual(response.status_code, 200)
        self.assertIs(response.data["can_edit"], False)
        for method in (client.patch, client.put, client.delete):
            with self.subTest(method=method.__name__):
                self.assertEqual(method(path, {"name": "Changed"}, format="json").status_code, 403)
                self.assertEqual(Pharmacy.objects.values().get(pk=self.north.pk), before)

    def test_assigned_region_admin_cannot_patch_pharmacy(self):
        membership = self.membership("REGION_ADMIN", [self.north])
        detail = client_for(membership.user).get(f"/api/v1/pharmacies/{self.north.pk}/")
        self.assertEqual(detail.status_code, 200)
        self.assertIs(detail.data["can_edit"], False)
        response = client_for(membership.user).patch(
            f"/api/v1/pharmacies/{self.north.pk}/", {"name": "Changed"}, format="json",
        )
        self.assertEqual(response.status_code, 403)
        self.north.refresh_from_db()
        self.assertEqual(self.north.name, "North")

    def test_pharmacy_admin_cannot_write_pharmacy(self):
        for level in (PharmacyAdmin.AdminLevel.MANAGER, PharmacyAdmin.AdminLevel.OWNER):
            with self.subTest(level=level):
                user = make_user("OWNER")
                PharmacyAdmin.objects.create(user=user, pharmacy=self.north, admin_level=level)
                client = client_for(user)
                path = f"/api/v1/pharmacies/{self.north.pk}/"
                self.assertEqual(client.get(path).status_code, 200)
                self.assertEqual(client.patch(path, {"name": "Changed"}, format="json").status_code, 403)
                self.assertEqual(client.delete(path).status_code, 403)
                self.north.refresh_from_db()
                self.assertEqual(self.north.name, "North")

    def test_owner_can_patch_and_delete_pharmacy(self):
        owner, pharmacy = make_owner_with_pharmacy("Owned")
        client = client_for(owner)
        path = f"/api/v1/pharmacies/{pharmacy.pk}/"

        detail = client.get(path)
        self.assertEqual(detail.status_code, 200)
        self.assertIs(detail.data["can_edit"], True)
        response = client.patch(path, {"name": "Renamed", "can_edit": False}, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertIs(response.data["can_edit"], True)
        pharmacy.refresh_from_db()
        self.assertEqual(pharmacy.name, "Renamed")
        self.assertEqual(client.delete(path).status_code, 204)
        self.assertFalse(Pharmacy.objects.filter(pk=pharmacy.pk).exists())

    def test_org_wide_admin_can_patch_pharmacy(self):
        for role in ORG_WIDE_ADMIN_ROLES:
            with self.subTest(role=role):
                membership = self.membership(role)
                response = client_for(membership.user).patch(
                    f"/api/v1/pharmacies/{self.north.pk}/", {"name": role}, format="json",
                )
                self.assertEqual(response.status_code, 200)
                self.assertIs(response.data["can_edit"], True)
                self.north.refresh_from_db()
                self.assertEqual(self.north.name, role)

    def test_pharmacy_serializer_without_request_cannot_edit(self):
        self.assertIs(PharmacySerializer(self.north).data["can_edit"], False)

    def test_out_of_scope_pharmacy_remains_not_found(self):
        membership = self.membership("REGION_ADMIN", [self.north])
        client = client_for(membership.user)
        path = f"/api/v1/pharmacies/{self.south.pk}/"
        before = Pharmacy.objects.values().get(pk=self.south.pk)

        self.assertEqual(client.get(path).status_code, 404)
        for method in (client.patch, client.put, client.delete):
            with self.subTest(method=method.__name__):
                self.assertEqual(method(path, {"name": "Changed"}, format="json").status_code, 404)
                self.assertEqual(Pharmacy.objects.values().get(pk=self.south.pk), before)

    def test_other_organization_admin_cannot_write_visible_pharmacy(self):
        membership = self.membership("ORG_ADMIN")
        pharmacy = Pharmacy.objects.exclude(organization=self.organization).get()
        PharmacyAdmin.objects.create(user=membership.user, pharmacy=pharmacy)
        client = client_for(membership.user)
        path = f"/api/v1/pharmacies/{pharmacy.pk}/"

        self.assertEqual(client.get(path).status_code, 200)
        self.assertEqual(client.patch(path, {"name": "Changed"}, format="json").status_code, 403)
        self.assertEqual(client.delete(path).status_code, 403)
        pharmacy.refresh_from_db()
        self.assertEqual(pharmacy.name, "Elsewhere")
