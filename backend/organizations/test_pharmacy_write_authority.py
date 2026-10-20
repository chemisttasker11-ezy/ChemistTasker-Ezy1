"""Pharmacy profile authority: visibility is not a mutation permission."""
from django.test import TestCase
from rest_framework.test import APIClient

from client_profile.characterization_support import make_owner_with_pharmacy, make_user
from organizations.access import can_edit_pharmacy_profile
from organizations.models import Organization, Pharmacy, PharmacyAdmin
from users.models import OrganizationMembership


class PharmacyProfileWriteAuthorityTests(TestCase):
    def setUp(self):
        self.owner, self.owned = make_owner_with_pharmacy("Owner Pharmacy")
        self.organization = Organization.objects.create(name="Network")
        self.north = Pharmacy.objects.create(name="North Pharmacy", organization=self.organization)
        self.south = Pharmacy.objects.create(name="South Pharmacy", organization=self.organization)
        _, self.unrelated = make_owner_with_pharmacy("Unrelated Pharmacy")

    def organization_user(self, role, level="MANAGER"):
        user = make_user("ORG_STAFF")
        member = OrganizationMembership.objects.create(
            user=user, organization=self.organization,
            role=role, admin_level=level, region="North"
        )
        member.pharmacies.add(self.north)
        return user

    def local_admin(self, level, active=True):
        user = make_user("OTHER_STAFF")
        PharmacyAdmin.objects.create(
            user=user, pharmacy=self.north,
            admin_level=level, is_active=active
        )
        return user

    def client_for(self, user):
        client = APIClient()
        client.force_authenticate(user=user)
        return client

    def patch_name(self, user, pharmacy, name):
        return self.client_for(user).patch(
            f"/api/v1/pharmacies/{pharmacy.pk}/", {"name": name}, format="json"
        )

    def test_owner_still_edits_own_pharmacy(self):
        response = self.patch_name(self.owner, self.owned, "Owner Edited")
        self.assertEqual(response.status_code, 200, response.content)
        self.owned.refresh_from_db()
        self.assertEqual(self.owned.name, "Owner Edited")

    def test_full_manager_assignment_edits_pharmacy_without_owner_persona(self):
        manager = self.local_admin("MANAGER")
        response = self.patch_name(manager, self.north, "Manager Edited")
        self.assertEqual(response.status_code, 200, response.content)
        self.north.refresh_from_db()
        self.assertEqual(self.north.name, "Manager Edited")
        self.assertIsNone(self.north.owner_id)

    def test_org_admin_and_chief_admin_remain_organization_scoped(self):
        for role in ("ORG_ADMIN", "CHIEF_ADMIN"):
            user = self.organization_user(role)
            with self.subTest(role=role):
                self.assertEqual(
                    self.patch_name(user, self.south, f"{role} Edited").status_code, 200
                )
                self.assertEqual(
                    self.patch_name(user, self.unrelated, "Cross-Tenant").status_code, 404
                )
        self.unrelated.refresh_from_db()
        self.assertEqual(self.unrelated.name, "Unrelated Pharmacy")

    def test_region_manager_edits_only_assigned_pharmacy(self):
        manager = self.organization_user("REGION_ADMIN", "MANAGER")
        self.assertTrue(can_edit_pharmacy_profile(manager, self.north))
        self.assertFalse(can_edit_pharmacy_profile(manager, self.south))
        self.assertEqual(
            self.patch_name(manager, self.north, "North Edited").status_code, 200
        )
        self.assertEqual(
            self.patch_name(manager, self.south, "South Not Allowed").status_code, 404
        )
        self.south.refresh_from_db()
        self.assertEqual(self.south.name, "South Pharmacy")

    def test_region_roster_and_communications_levels_can_read_not_edit(self):
        for level in ("ROSTER_MANAGER", "COMMUNICATION_MANAGER"):
            user = self.organization_user("REGION_ADMIN", level)
            with self.subTest(level=level):
                self.assertFalse(can_edit_pharmacy_profile(user, self.north))
                c = self.client_for(user)
                url = f"/api/v1/pharmacies/{self.north.pk}/"
                self.assertEqual(c.get(url).status_code, 200)
                self.assertEqual(c.patch(url, {"name": "Blocked"}, format="json").status_code, 403)
        self.north.refresh_from_db()
        self.assertEqual(self.north.name, "North Pharmacy")

    def test_local_roster_and_communication_admins_cannot_edit_pharmacy_profile(self):
        for level in ("ROSTER_MANAGER", "COMMUNICATION_MANAGER"):
            user = self.local_admin(level)
            with self.subTest(level=level):
                self.assertFalse(can_edit_pharmacy_profile(user, self.north))
                self.assertEqual(
                    self.patch_name(user, self.north, "Blocked").status_code, 403
                )
                self.assertEqual(
                    self.client_for(user).get(f"/api/v1/pharmacies/{self.north.pk}/").status_code, 200
                )
        self.north.refresh_from_db()
        self.assertEqual(self.north.name, "North Pharmacy")

    def test_inactive_admin_cannot_edit_or_read_without_other_scope(self):
        user = self.local_admin("MANAGER", active=False)
        self.assertFalse(can_edit_pharmacy_profile(user, self.north))
        self.assertEqual(self.patch_name(user, self.north, "Blocked").status_code, 404)

    def test_dual_role_owner_can_edit_under_delegated_manager_assignment(self):
        user, _ = make_owner_with_pharmacy("Another Owner Pharmacy")
        PharmacyAdmin.objects.create(
            user=user, pharmacy=self.north, admin_level="MANAGER", is_active=True
        )
        self.assertEqual(
            self.patch_name(user, self.north, "Delegated Edit").status_code, 200
        )
        self.north.refresh_from_db()
        self.assertEqual(self.north.name, "Delegated Edit")
        self.assertIsNone(self.north.owner_id)

    def test_anonymous_and_unrelated_users_cannot_mutate(self):
        url = f"/api/v1/pharmacies/{self.north.pk}/"
        self.assertIn(APIClient().patch(url, {"name": "Anonymous"}, format="json").status_code, (401, 403))
        unrelated = make_user("OTHER_STAFF")
        self.assertEqual(
            self.patch_name(unrelated, self.north, "Unrelated").status_code, 404
        )
        self.north.refresh_from_db()
        self.assertEqual(self.north.name, "North Pharmacy")
