"""Chains (/api/client-profile/chains/): authentication, listing scope and who may create one."""
from django.test import TestCase

from client_profile.characterization_support import BASE, client_for, make_owner_with_pharmacy, make_user
from client_profile.models import Chain, OwnerOnboarding

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
