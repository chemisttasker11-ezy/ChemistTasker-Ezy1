"""Read/write tenancy characterization for the pharmacy API.

This suite pins permitted access without redefining product policy. A separate
security decision is needed before changing per-role write capability checks.
"""
from unittest.mock import patch

from django.test import TestCase
from rest_framework.test import APIClient

from client_profile.characterization_support import make_owner_with_pharmacy, make_user
from organizations.models import Chain, Organization, Pharmacy, PharmacyAdmin, PharmacyClaim
from users.models import OrganizationMembership


class PharmacyAccessCharacterizationTests(TestCase):
    def test_chain_put_without_pharmacies_preserves_links(self):
        from client_profile.characterization_support import client_for
        owner, first = make_owner_with_pharmacy("Chain first")
        second = Pharmacy.objects.create(name="Chain second", owner=first.owner, abn="51824753556")
        chain = Chain.objects.create(owner=first.owner, name="Chain", primary_contact_email=owner.email)
        chain.pharmacies.set([first, second])
        client = client_for(owner)
        for fmt in ("multipart", "json"):
            with self.subTest(format=fmt):
                response = client.put(f"/api/v1/chains/{chain.pk}/", {
                    "name": "Updated", "primary_contact_email": "updated@example.com",
                }, format=fmt)
                self.assertEqual(response.status_code, 200, response.data)
                self.assertCountEqual(chain.pharmacies.values_list("pk", flat=True), [first.pk, second.pk])
        response = client.put(f"/api/v1/chains/{chain.pk}/", {
            "name": "Updated", "primary_contact_email": owner.email, "pharmacy_ids": [first.pk],
        }, format="json")
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(list(chain.pharmacies.values_list("pk", flat=True)), [first.pk])
        response = client.patch(f"/api/v1/chains/{chain.pk}/", {"pharmacy_ids": []}, format="json")
        self.assertEqual(response.status_code, 200, response.data)
        self.assertFalse(chain.pharmacies.exists())

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

    @patch("organizations.views.PharmacyViewSet.get_queryset")
    def test_stale_visibility_object_permission_denial_returns_generic_403_without_leak(self, mock_get_queryset):
        mock_get_queryset.return_value = Pharmacy.objects.filter(id=self.owned.id)
        for method in ("GET", "PATCH"):
            with self.subTest(method=method):
                response = self.request(self.stranger, method, self.owned, {"name": "Unauthorized"})
                self.assertEqual(response.status_code, 403, response.content)
                self.assertEqual(response.data, {"detail": "You do not have permission to perform this action."})
                self.assertNotIn(self.owned.name, response.content.decode())
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
        # Existing global unsafe-method gate rejects a non-owner without org membership
        # before object lookup. This is a 403 (not a 404) on the current deployed policy.
        self.assertEqual(self.request(self.pharmacy_manager, "PATCH", self.unrelated, {"name": "Blocked"}).status_code, 403)
        self.unrelated.refresh_from_db()
        self.assertEqual(self.unrelated.name, "Unrelated Pharmacy")

    def test_claim_put_requires_owner_and_runs_acceptance_workflow(self):
        claim = PharmacyClaim.objects.create(
            pharmacy=self.owned, organization=self.organization, requested_by=self.region_user,
        )
        OrganizationMembership.objects.create(
            user=self.stranger, organization=self.organization, role="ORG_ADMIN",
        )
        client = APIClient()
        url = f"/api/v1/pharmacy-claims/{claim.pk}/"
        client.force_authenticate(self.stranger)
        denied = client.put(url, {"status": "ACCEPTED"}, format="json")
        self.assertEqual(denied.status_code, 403, denied.data)
        claim.refresh_from_db()
        self.assertEqual(claim.status, "PENDING")

        client.force_authenticate(self.owner)
        accepted = client.put(url, {"status": "ACCEPTED"}, format="json")
        self.assertEqual(accepted.status_code, 200, accepted.data)
        claim.refresh_from_db()
        self.owned.refresh_from_db()
        self.assertEqual(claim.responded_by_id, self.owner.pk)
        self.assertEqual(self.owned.organization_id, self.organization.pk)
        self.assertEqual(client.put(url, {"status": "REJECTED"}, format="json").status_code, 400)


class ChainRemoveUserTests(TestCase):
    def setUp(self):
        from memberships.models import Membership
        self.owner, self.pharmacy = make_owner_with_pharmacy("Chain")
        self.chain = Chain.objects.create(owner=self.pharmacy.owner, name="Chain")
        self.chain.pharmacies.add(self.pharmacy)
        self.admin_user = make_user("PHARMACIST")
        self.membership = Membership.objects.create(user=self.admin_user, pharmacy=self.pharmacy, role="PHARMACY_ADMIN",
                                                    employment_type="FULL_TIME", status=Membership.Status.ACCEPTED, is_active=True)
        PharmacyAdmin.objects.create(user=self.admin_user, pharmacy=self.pharmacy, membership=self.membership,
                                     admin_level=PharmacyAdmin.AdminLevel.MANAGER, is_active=True)

    def remove(self, actor, chain):
        client = APIClient()
        client.force_authenticate(user=actor)
        return client.post(f"/api/v1/chains/{chain.id}/remove_user/", {"user_id": self.admin_user.id}, format="json")

    def test_owner_removal_also_revokes_pharmacy_admin_access(self):
        self.assertEqual(self.remove(self.owner, self.chain).status_code, 204)
        self.assertFalse(type(self.membership).objects.filter(pk=self.membership.pk).exists())
        self.assertFalse(PharmacyAdmin.objects.filter(user=self.admin_user, pharmacy=self.pharmacy, is_active=True).exists())

    def test_org_admin_of_the_chain_organization_can_remove(self):
        org = Organization.objects.create(name="Chain org", slug="chain-org")
        Pharmacy.objects.filter(pk=self.pharmacy.pk).update(organization=org)
        org_chain = Chain.objects.create(organization=org, name="Org chain")
        org_chain.pharmacies.add(self.pharmacy)
        org_admin = make_user("OWNER")
        OrganizationMembership.objects.create(user=org_admin, organization=org, role="ORG_ADMIN")
        self.assertEqual(self.remove(org_admin, org_chain).status_code, 204)
        self.assertFalse(type(self.membership).objects.filter(pk=self.membership.pk).exists())

    def test_chain_owner_cannot_remove_staff_of_a_pharmacy_they_no_longer_own(self):
        _, other = make_owner_with_pharmacy("New owner")
        Pharmacy.objects.filter(pk=self.pharmacy.pk).update(owner=other.owner)
        self.assertEqual(self.remove(self.owner, self.chain).status_code, 403)
        self.assertTrue(type(self.membership).objects.filter(pk=self.membership.pk).exists())
        self.assertTrue(PharmacyAdmin.objects.filter(user=self.admin_user, pharmacy=self.pharmacy, is_active=True).exists())
