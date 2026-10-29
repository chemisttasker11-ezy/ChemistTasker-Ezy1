"""B02: safely resize an existing Stripe extra-seat subscription."""
from types import SimpleNamespace
from unittest.mock import patch
from django.test import TestCase, override_settings
from billing.models import OwnerSubscription, StripeWebhookEvent
from client_profile.characterization_support import client_for, make_owner_with_pharmacy
from billing.views import EXTRA_SEAT_PRICE

URL = "/api/v1/billing/subscription/seats/"

def stripe_result(quantity, customer="cus_b02", status="active"):
    item = {"id": "si_b02", "price": {"id": EXTRA_SEAT_PRICE}, "quantity": quantity}
    return {"id": "sub_addon_b02", "customer": customer, "status": status,
            "items": {"data": [item]}}

@override_settings(STRIPE_WEBHOOK_SECRET="whsec-b02-test")
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
            patch("billing.stripe_support.stripe.Subscription.retrieve", return_value=provider or stripe_result(2)) as retrieve,
            patch("billing.stripe_support.stripe.Subscription.modify", return_value=stripe_result(count - 5 if isinstance(count, int) else 2)) as modify,
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

    def deliver_update(self, event_quantity, current=None, error=None):
        event = SimpleNamespace(
            id="evt_b02_update", type="customer.subscription.updated",
            data=SimpleNamespace(object=stripe_result(event_quantity)),
        )
        with (
            patch("billing.stripe_support.stripe.Webhook.construct_event", return_value=event),
            patch("billing.stripe_support.stripe.Subscription.retrieve", return_value=current, side_effect=error) as retrieve,
        ):
            response = self.client.post("/api/v1/billing/webhook/", b"{}", content_type="application/json")
        self.sub.refresh_from_db()
        return response, retrieve

    def test_stale_seat_event_uses_current_stripe_quantity(self):
        response, retrieve = self.deliver_update(1, stripe_result(4))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.sub.staff_count, 9)
        retrieve.assert_called_once_with("sub_addon_b02")

    def test_current_seat_event_positive_control(self):
        response, _ = self.deliver_update(4, stripe_result(4))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.sub.staff_count, 9)

    def test_stripe_read_failure_is_retryable_without_changing_seats(self):
        response, _ = self.deliver_update(1, error=RuntimeError("provider unavailable"))
        self.assertEqual(response.status_code, 500)
        self.assertEqual(self.sub.staff_count, 7)
        self.assertEqual(StripeWebhookEvent.objects.get(event_id="evt_b02_update").status, "failed")

    def test_current_subscription_must_still_belong_to_customer(self):
        response, _ = self.deliver_update(4, stripe_result(4, customer="cus_foreign"))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.sub.staff_count, 7)

    def test_seat_update_cannot_modify_a_canceled_base_plan(self):
        self.sub.status = "canceled"
        self.sub.save(update_fields=["status"])
        response, retrieve = self.deliver_update(4, stripe_result(4))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.sub.staff_count, 7)
        self.assertEqual(self.sub.status, "canceled")
        retrieve.assert_not_called()
