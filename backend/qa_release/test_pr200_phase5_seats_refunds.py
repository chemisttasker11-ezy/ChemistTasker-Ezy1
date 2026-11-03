"""B02/B57 isolated audit contracts. No app code or Stripe network changes."""
from types import SimpleNamespace
from unittest.mock import patch
from django.test import TestCase, override_settings
from django.urls import reverse
from rest_framework.test import APIClient
from billing.models import OwnerSubscription, ShiftPayment, StripeWebhookEvent
from client_profile.characterization_support import make_owner_with_pharmacy
from shifts.models import Shift


class B02PurchasedSeatAdjustment(TestCase):
    def setUp(self):
        self.owner, self.pharmacy = make_owner_with_pharmacy("PR200 B02")
        self.sub = OwnerSubscription.objects.create(
            owner=self.owner, stripe_customer_id="cus_b02",
            stripe_subscription_id="sub_base", status="active", staff_count=7,
        )

    def seat_post(self, staff_count):
        client = APIClient()
        client.force_authenticate(self.owner)
        with patch("billing.views.stripe.checkout.Session.create",
                   return_value=SimpleNamespace(url="https://checkout.example.test/b02")) as create:
            result = client.post(
                "/api/v1/billing/subscription/seats/",
                {"staff_count": staff_count}, format="json",
            )
        return result, create

    def test_b02_first_addon_purchase_positive(self):
        self.sub.staff_count = 5
        self.sub.save(update_fields=["staff_count"])
        response, create = self.seat_post(7)
        self.assertEqual(response.status_code, 200, response.data)
        create.assert_called_once()
        self.assertEqual(create.call_args.kwargs["line_items"][0]["quantity"], 2)

    def test_b02_existing_addon_seat_quantity_can_be_changed(self):
        self.sub.stripe_extra_seat_subscription_id = "sub_extra_b02"
        self.sub.save(update_fields=["stripe_extra_seat_subscription_id"])
        response, create = self.seat_post(8)
        self.assertEqual(response.status_code, 200, response.data)
        self.assertTrue(create.called or response.data.get("message"))


class _StripeObject(dict):
    def __getattr__(self, key):
        try:
            return self[key]
        except KeyError as exc:
            raise AttributeError(key) from exc


@override_settings(STRIPE_WEBHOOK_SECRET="whsec-pr200-b57")
class B57RefundLocalLedgerReconciliation(TestCase):
    def setUp(self):
        self.owner, self.pharmacy = make_owner_with_pharmacy("PR200 B57")
        self.shift = Shift.objects.create(
            pharmacy=self.pharmacy, created_by=self.owner,
            role_needed="PHARMACIST", employment_type="LOCUM",
        )
        self.payment = ShiftPayment.objects.create(
            owner=self.owner, shift=self.shift,
            stripe_payment_intent_id="pi_b57_refunded",
            amount_aud="45.00", payment_type="fulfillment",
            payment_method="card", status="paid",
        )

    def post_event(self, event_id, event_type, obj):
        event = _StripeObject(
            id=event_id, type=event_type,
            data=_StripeObject(object=_StripeObject(obj)),
        )
        with patch("billing.views.stripe.Webhook.construct_event", return_value=event):
            return APIClient().post(
                reverse("api_v1:billing:stripe_webhook"),
                b"{}", content_type="application/json",
                HTTP_STRIPE_SIGNATURE="synthetic",
            )

    def test_b57_unrelated_callback_keeps_paid_payment_positive(self):
        result = self.post_event("evt_b57_other", "customer.updated", {"id": "cus_unrelated"})
        self.assertEqual(result.status_code, 200, result.content)
        self.payment.refresh_from_db()
        self.assertEqual(self.payment.status, "paid")

    def test_b57_refund_callback_cannot_leave_local_unreconciled_paid(self):
        result = self.post_event("evt_b57_refund", "charge.refunded", {
            "id": "ch_b57", "payment_intent": "pi_b57_refunded",
            "refunded": True, "amount_refunded": 4500,
        })
        self.assertEqual(result.status_code, 200, result.content)
        self.assertTrue(StripeWebhookEvent.objects.filter(
            event_id="evt_b57_refund",
            status=StripeWebhookEvent.Status.PROCESSED,
        ).exists())
        self.payment.refresh_from_db()
        self.assertNotEqual(self.payment.status, "paid")
