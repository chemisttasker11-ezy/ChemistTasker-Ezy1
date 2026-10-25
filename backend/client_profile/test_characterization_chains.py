"""Chains (/api/v1/chains/): authentication, listing scope and who may create one."""
from django.test import TestCase

from client_profile.characterization_support import BASE, client_for, make_owner_with_pharmacy, make_user
from client_profile.models import Chain, OwnerOnboarding, Pharmacy

URL = BASE + "chains/"
ANONYMOUS = {"detail": "Authentication credentials were not provided."}


class ChainTests(TestCase):
    def setUp(self):
        self.owner, self.pharmacy = make_owner_with_pharmacy()
        self.chain = Chain.objects.create(
            name="Owner Chain", primary_contact_email="chain@example.com",
            owner=OwnerOnboarding.objects.get(user=self.owner))

    @staticmethod
    def ids(res):
        return [row["id"] for row in res.json()["results"]]

    def test_anonymous_requests_are_refused_with_401(self):
        anonymous = client_for()
        for res in (anonymous.get(URL), anonymous.post(URL, {}, format="json"), anonymous.get(f"{URL}{self.chain.id}/")):
            self.assertEqual(res.status_code, 401)
            self.assertEqual(res.json(), ANONYMOUS)

    def test_the_owner_lists_their_chain_and_others_list_none(self):
        self.assertEqual(self.ids(client_for(self.owner).get(URL)), [self.chain.id])
        other_owner, _ = make_owner_with_pharmacy("Other Pharmacy")
        self.assertEqual(self.ids(client_for(other_owner).get(URL)), [])
        self.assertEqual(self.ids(client_for(make_user("PHARMACIST")).get(URL)), [])

    def test_only_owners_and_org_admins_may_create(self):
        res = client_for(make_user("PHARMACIST")).post(URL, {"name": "Nope"}, format="json")
        self.assertEqual(res.status_code, 403)
        res = client_for(self.owner).post(URL, {}, format="json")
        self.assertEqual(res.status_code, 400)
        self.assertEqual(set(res.json()), {"name", "pharmacy_ids", "primary_contact_email"})

    def test_owner_cannot_put_foreign_pharmacies_into_chain(self):
        _, foreign = make_owner_with_pharmacy("Foreign Pharmacy")
        self.chain.pharmacies.add(self.pharmacy)
        response = client_for(self.owner).put(f"{URL}{self.chain.pk}/", {
            "name": "Hijacked Chain", "primary_contact_email": "chain@example.com",
            "pharmacy_ids": [self.pharmacy.pk, foreign.pk],
        }, format="multipart")
        self.assertIn(response.status_code, (400, 403), response.data)
        self.chain.refresh_from_db()
        self.assertEqual(self.chain.name, "Owner Chain")
        self.assertEqual(list(self.chain.pharmacies.all()), [self.pharmacy])

    def test_owner_can_put_own_pharmacies_into_chain(self):
        second = Pharmacy.objects.create(name="Second Pharmacy", owner=self.chain.owner)
        response = client_for(self.owner).put(f"{URL}{self.chain.pk}/", {
            "name": "Updated Chain", "primary_contact_email": "chain@example.com",
            "pharmacy_ids": [self.pharmacy.pk, second.pk],
        }, format="multipart")
        self.assertEqual(response.status_code, 200, response.data)
        self.assertCountEqual(self.chain.pharmacies.all(), [self.pharmacy, second])

    def test_owner_cannot_create_chain_with_foreign_pharmacy(self):
        _, foreign = make_owner_with_pharmacy("Foreign Pharmacy")
        response = client_for(self.owner).post(URL, {
            "name": "Foreign Chain", "primary_contact_email": "chain@example.com",
            "pharmacy_ids": [foreign.pk],
        }, format="json")
        self.assertIn(response.status_code, (400, 403), response.data)
        self.assertFalse(Chain.objects.filter(name="Foreign Chain").exists())

    def test_owner_can_create_chain_with_own_pharmacy(self):
        response = client_for(self.owner).post(URL, {
            "name": "New Chain", "primary_contact_email": "chain@example.com",
            "pharmacy_ids": [self.pharmacy.pk],
        }, format="json")
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(list(Chain.objects.get(pk=response.data["id"]).pharmacies.all()), [self.pharmacy])
