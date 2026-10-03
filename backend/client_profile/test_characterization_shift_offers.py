"""Shift offers (/api/client-profile/shift-offers/): who sees which offer, and that offers are not created here."""
from django.test import TestCase

from client_profile.characterization_support import (
    BASE, client_for, make_assignment, make_owner_with_pharmacy, make_user,
)
from client_profile.models import ShiftOffer

URL = BASE + "shift-offers/"


class ShiftOfferTests(TestCase):
    def setUp(self):
        self.owner, self.pharmacy = make_owner_with_pharmacy()
        self.worker = make_user("PHARMACIST")
        shift, slot, assignment = make_assignment(self.pharmacy, self.owner, make_user("PHARMACIST"))
        self.offer = ShiftOffer.objects.create(shift=shift, slot=slot, user=self.worker)

    @staticmethod
    def ids(res):
        body = res.json()
        return [row["id"] for row in (body["results"] if isinstance(body, dict) else body)]

    def test_requires_authentication(self):
        self.assertEqual(client_for().get(URL).status_code, 401)

    def test_the_worker_and_the_pharmacy_owner_see_the_offer_and_nobody_else_does(self):
        self.assertEqual(self.ids(client_for(self.worker).get(URL)), [self.offer.id])
        self.assertEqual(self.ids(client_for(self.owner).get(URL)), [self.offer.id])
        self.assertEqual(self.ids(client_for(make_user("PHARMACIST")).get(URL)), [])

    def test_offers_cannot_be_created_through_this_endpoint(self):
        for user in (self.owner, self.worker):
            res = client_for(user).post(URL, {"shift": self.offer.shift_id, "user": self.worker.id}, format="json")
            self.assertEqual(res.status_code, 405)
            self.assertEqual(res.json(), {"detail": 'Method "POST" not allowed.'})
        self.assertEqual(ShiftOffer.objects.count(), 1)
