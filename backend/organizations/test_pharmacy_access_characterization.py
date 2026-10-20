"""Read/write tenancy characterization for the pharmacy API.

This suite pins permitted access without redefining product policy. A separate
security decision is needed before changing per-role write capability checks.
"""
from django.test import TestCase
from rest_framework.test import APIClient

from client_profile.characterization_support import make_owner_with_pharmacy, make_user
from organizations.models import Organization, Pharmacy, PharmacyAdmin
from users.models import OrganizationMembership


class PharmacyAccessCharacterizationTests(TestCase):
    def setUp(self):
        self.owner, self.owned = make_owner_with_pharmacy("Owned Pharmacy")
        self.stranger, self.unrelated = make_owner_with_pharmacy("Unrelated Pharmacy")
        self.organization = Organization.objects.create(name="Scoped Network", slug="scoped-network")
        self.in_scope = Pharmacy.objects.create(name="North", organization=self.organization, abn="51824753556")
        self.out_of_scope = Pharmacy.objects.create(name="South", organization=self.organization, abn="51824753556")
        self.region_user = make_user("ORG_STAFF")
        region = OrganizationMembership.objects.create(
            user=self.region_user, organization=self.organization,
            role="REGION_ADMIN", admin_level="COMMUNICATION_MANAGER", region="North",
        )
        region.pharmacies.add(self.in_scope)
        self.pharmacy_manager = make_user("PHARMACY_MANAGER")
        PharmacyAdmin.objects.create(
            user=self.pharmacy_manager, pharmacy=self.in_scope,
            admin_level=PharmacyAdmin.AdminLevel.MANAGER, is_active=True,
        )

    def request(self, user, method, pharmacy, payload=None):
        client = APIClient()
        client.force_authenticate(user=user)
        url = f"/api/v1/pharmacies/{pharmacy.id}/"
        if method == "GET":
            return client.get(url)
        if method == "PATCH":
            return client.patch(url, payload or {}, format="json")
        raise AssertionError(method)

    def test_owner_can_read_and_edit_owned_pharmacy(self):
        response = self.request(self.owner, "PATCH", self.owned, {"about": "Owner updated"})
        self.assertEqual(response.status_code, 200, response.content)
        self.owned.refresh_from_db()
        self.assertEqual(self.owned.about, "Owner updated")

    def test_unrelated_owner_cannot_read_or_write_another_pharmacy(self):
        for method in ("GET", "PATCH"):
            with self.subTest(method=method):
                response = self.request(self.stranger, method, self.owned, {"name": "Unauthorized"})
                self.assertEqual(response.status_code, 404, response.content)
        self.owned.refresh_from_db()
        self.assertEqual(self.owned.name, "Owned Pharmacy")

    def test_region_scope_limits_visibility_across_same_organization(self):
        self.assertEqual(self.request(self.region_user, "GET", self.in_scope).status_code, 200)
        self.assertEqual(self.request(self.region_user, "GET", self.out_of_scope).status_code, 404)

    def test_pharmacy_manager_visibility_is_specific_to_assignment(self):
        self.assertEqual(self.request(self.pharmacy_manager, "GET", self.in_scope).status_code, 200)
        self.assertEqual(self.request(self.pharmacy_manager, "GET", self.out_of_scope).status_code, 404)

    def test_cross_organization_and_anonymous_requests_are_not_implicitly_authorized(self):
        client = APIClient()
        self.assertIn(client.get(f"/api/v1/pharmacies/{self.owned.id}/").status_code, (401, 403))
        self.assertEqual(self.request(self.region_user, "GET", self.unrelated).status_code, 404)
        self.assertEqual(self.request(self.pharmacy_manager, "PATCH", self.unrelated, {"name": "Blocked"}).status_code, 403)
        self.unrelated.refresh_from_db()
        self.assertEqual(self.unrelated.name, "Unrelated Pharmacy")
