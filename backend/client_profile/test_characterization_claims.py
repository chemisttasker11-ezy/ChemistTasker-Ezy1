"""Characterization of pharmacy claims (/api/client-profile/pharmacy-claims/).

Claims are created through the owner-onboarding/claim flow, not by this viewset, so the tests create rows
directly and pin listing scope plus the owner's accept/reject decision."""
from django.test import TestCase

from client_profile.models import Organization, Pharmacy, PharmacyClaim
from client_profile.characterization_support import BASE, client_for, make_owner_with_pharmacy, make_user
from users.models import OrganizationMembership

URL = BASE + "pharmacy-claims/"
FIELDS = {
    "id", "pharmacy", "organization", "status", "status_display", "message", "response_message", "requested_by",
    "requested_by_user", "responded_by", "responded_by_user", "responded_at", "can_respond", "created_at", "updated_at",
}


class ClaimsBase(TestCase):
    def setUp(self):
        self.owner, self.pharmacy = make_owner_with_pharmacy()
        self.org = Organization.objects.create(name="Alpha Group")
        self.other_org = Organization.objects.create(name="Beta Group")
        self.org_admin = make_user("ORG_STAFF")
        OrganizationMembership.objects.create(user=self.org_admin, organization=self.org, role="ORG_ADMIN")
        self.stranger = make_user("PHARMACIST")
        self.claim = PharmacyClaim.objects.create(
            pharmacy=self.pharmacy, organization=self.org, requested_by=self.org_admin, message="please")

    @staticmethod
    def rows(res):
        body = res.json()
        return body["results"] if isinstance(body, dict) and "results" in body else body


class ClaimListTests(ClaimsBase):
    def test_requires_authentication(self):
        self.assertIn(client_for().get(URL).status_code, (401, 403))

    def test_owner_and_claiming_org_admin_see_the_claim_but_a_stranger_does_not(self):
        self.assertEqual([r["id"] for r in self.rows(client_for(self.owner).get(URL))], [self.claim.id])
        self.assertEqual([r["id"] for r in self.rows(client_for(self.org_admin).get(URL))], [self.claim.id])
        self.assertEqual(self.rows(client_for(self.stranger).get(URL)), [])

    def test_org_admin_of_a_different_org_does_not_see_it(self):
        other_admin = make_user("ORG_STAFF")
        OrganizationMembership.objects.create(user=other_admin, organization=self.other_org, role="ORG_ADMIN")
        self.assertEqual(self.rows(client_for(other_admin).get(URL)), [])

    def test_response_fields_and_nested_summaries(self):
        row = self.rows(client_for(self.owner).get(URL))[0]
        self.assertEqual(set(row), FIELDS)
        self.assertEqual(row["pharmacy"]["id"], self.pharmacy.id)
        self.assertEqual(row["pharmacy"]["owner"]["user_id"], self.owner.id)
        self.assertEqual(row["organization"], {"id": self.org.id, "name": "Alpha Group"})
        self.assertEqual((row["status"], row["status_display"]), ("PENDING", "Pending"))

    def test_can_respond_is_true_only_for_the_owner_while_pending(self):
        self.assertTrue(self.rows(client_for(self.owner).get(URL))[0]["can_respond"])
        self.assertFalse(self.rows(client_for(self.org_admin).get(URL))[0]["can_respond"])

    def test_status_filter_and_invalid_status(self):
        c = client_for(self.owner)
        self.assertEqual(len(self.rows(c.get(URL + "?status=pending"))), 1)
        self.assertEqual(self.rows(c.get(URL + "?status=accepted")), [])
        self.assertEqual(self.rows(c.get(URL + "?status=bogus")), [])

    def test_owned_by_me_restricts_to_the_owners_pharmacies(self):
        self.assertEqual(len(self.rows(client_for(self.owner).get(URL + "?owned_by_me=true"))), 1)
        self.assertEqual(self.rows(client_for(self.org_admin).get(URL + "?owned_by_me=true")), [])

    def test_pharmacy_and_organization_filters(self):
        c = client_for(self.owner)
        self.assertEqual(len(self.rows(c.get(URL + f"?pharmacy={self.pharmacy.id}"))), 1)
        self.assertEqual(self.rows(c.get(URL + "?pharmacy=999999")), [])
        self.assertEqual(self.rows(c.get(URL + "?pharmacy=abc")), [])
        self.assertEqual(len(self.rows(client_for(self.org_admin).get(URL + f"?organization={self.org.id}"))), 1)
        self.assertEqual(self.rows(client_for(self.org_admin).get(URL + f"?organization={self.other_org.id}")), [])


class ClaimDecisionTests(ClaimsBase):
    def decide(self, who, status, **extra):
        return client_for(who).patch(f"{URL}{self.claim.id}/", {"status": status, **extra}, format="json")

    def test_only_the_pharmacy_owner_can_respond(self):
        self.assertEqual(self.decide(self.org_admin, "ACCEPTED").status_code, 403)
        self.assertEqual(self.decide(self.stranger, "ACCEPTED").status_code, 404)
        self.claim.refresh_from_db()
        self.assertEqual(self.claim.status, "PENDING")

    def test_accept_links_the_pharmacy_to_the_organization(self):
        res = self.decide(self.owner, "ACCEPTED", response_message="welcome")
        self.assertEqual(res.status_code, 200)
        self.claim.refresh_from_db()
        self.pharmacy.refresh_from_db()
        self.assertEqual((self.claim.status, self.claim.response_message, self.claim.responded_by), ("ACCEPTED", "welcome", self.owner))
        self.assertEqual(self.pharmacy.organization_id, self.org.id)
        self.assertIsNotNone(self.claim.responded_at)

    def test_accepting_one_claim_rejects_other_pending_claims(self):
        rival = PharmacyClaim.objects.create(
            pharmacy=self.pharmacy, organization=self.other_org, requested_by=self.stranger)
        self.assertEqual(self.decide(self.owner, "ACCEPTED").status_code, 200)
        rival.refresh_from_db()
        self.assertEqual(rival.status, "REJECTED")
        self.assertIn("Automatically rejected", rival.response_message)

    def test_reject_unlinks_the_pharmacy_when_it_was_linked_to_that_org(self):
        Pharmacy.objects.filter(pk=self.pharmacy.pk).update(organization=self.org)
        self.assertEqual(self.decide(self.owner, "REJECTED").status_code, 200)
        self.pharmacy.refresh_from_db()
        self.assertIsNone(self.pharmacy.organization_id)

    def test_only_pending_claims_can_be_decided(self):
        self.decide(self.owner, "REJECTED")
        res = client_for(self.owner).patch(f"{URL}{self.claim.id}/", {"status": "ACCEPTED"}, format="json")
        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.json(), {"detail": "Only pending claims can be updated."})
        self.claim.refresh_from_db()
        self.assertEqual(self.claim.status, "REJECTED")

    def test_invalid_status_is_rejected(self):
        res = client_for(self.owner).patch(f"{URL}{self.claim.id}/", {"status": "PENDING"}, format="json")
        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.json(), {"status": "Status must be ACCEPTED or REJECTED."})
        self.claim.refresh_from_db()
        self.assertEqual(self.claim.status, "PENDING")

    def test_claims_cannot_be_created_or_deleted_through_this_endpoint(self):
        c = client_for(self.owner)
        self.assertEqual(c.post(URL, {"pharmacy_id": self.pharmacy.id}, format="json").status_code, 405)
        self.assertEqual(c.delete(f"{URL}{self.claim.id}/").status_code, 405)
