"""B02: safely resize an existing Stripe extra-seat subscription."""
from types import SimpleNamespace
from unittest.mock import patch
from django.test import TestCase
from billing.models import OwnerSubscription
from client_profile.characterization_support import client_for, make_owner_with_pharmacy
from billing.views import EXTRA_SEAT_PRICE

URL = "/api/v1/billing/subscription/seats/"

def stripe_result(quantity, customer="cus_b02", status="active"):
    item = {"id": "si_b02", "price": {"id": EXTRA_SEAT_PRICE}, "quantity": quantity}
    return {"id": "sub_addon_b02", "customer": customer, "status": status,
            "items": {"data": [item]}}

class SeatQuantityContracts(TestCase):
    def setUp(self):
        self.owner, self.pharmacy = make_owner_with_pharmacy("P6 B02")
        self.sub = OwnerSubscription.objects.create(
            owner=self.owner, stripe_customer_id="cus_b02",
            stripe_subscription_id="sub_base_b02", stripe_extra_seat_subscription_id="sub_addon_b02",
            staff_count=7, status="active",
        )

    def update(self, count, provider=None):
        with (
            patch("billing.views.stripe.Subscription.retrieve", return_value=provider or stripe_result(2)) as retrieve,
            patch("billing.views.stripe.Subscription.modify", return_value=stripe_result(count - 5)) as modify,
        ):
            resp = client_for(self.owner).post(URL, {"staff_count": count}, format="json")
        return resp, retrieve, modify

    def test_upsize_existing_seats_without_new_checkout(self):
        resp, retrieve, modify = self.update(9)
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(modify.call_args.kwargs["items"][0]["quantity"], 4)
        self.assertEqual(modify.call_args.kwargs["proration_behavior"], "create_prorations")
        self.sub.refresh_from_db()
        self.assertEqual(self.sub.staff_count, 9)

    def test_downsize_to_base_without_canceling_base_subscription(self):
        resp, _, modify = self.update(5)
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(modify.call_args.kwargs["items"][0]["quantity"], 0)
        self.sub.refresh_from_db()
        self.assertEqual(self.sub.staff_count, 5)
        self.assertEqual(self.sub.stripe_subscription_id, "sub_base_b02")

    def test_same_quantity_is_idempotent_without_stripe_change(self):
        resp, retrieve, modify = self.update(7)
        self.assertEqual(resp.status_code, 200, resp.data)
        retrieve.assert_not_called()
        modify.assert_not_called()

    def test_foreign_customer_never_gets_modified(self):
        resp, _, modify = self.update(10, provider=stripe_result(2, customer="cus_elsewhere"))
        self.assertEqual(resp.status_code, 409, resp.data)
        modify.assert_not_called()
        self.sub.refresh_from_db()
        self.assertEqual(self.sub.staff_count, 7)

    def test_bad_count_is_400_without_provider_interaction(self):
        resp, retrieve, modify = self.update("not-an-integer")
        self.assertEqual(resp.status_code, 400, resp.data)
        retrieve.assert_not_called()
        modify.assert_not_called()
