"""B57 paid, partial and full refund reconciliation at webhook boundary."""
from unittest.mock import patch
from django.test import TestCase, override_settings
from django.urls import reverse
from rest_framework.test import APIClient
from billing.models import ShiftPayment, StripeWebhookEvent
from client_profile.characterization_support import make_owner_with_pharmacy
from shifts.models import Shift

class Object(dict):
    def __getattr__(self, name):
        try:
            return self[name]
        except KeyError as exc:
            raise AttributeError(name) from exc

@override_settings(STRIPE_WEBHOOK_SECRET="whsec-pr201-b57")
class RefundLedgerContracts(TestCase):
    def setUp(self):
        owner, pharmacy = make_owner_with_pharmacy("PR201 Refund")
        shift = Shift.objects.create(
            pharmacy=pharmacy, created_by=owner,
            role_needed="PHARMACIST", employment_type="LOCUM",
        )
        self.payment = ShiftPayment.objects.create(
            owner=owner, shift=shift,
            stripe_payment_intent_id="pi_pr201_b57",
            amount_aud="45.00", payment_type="fulfillment",
            payment_method="card", status="paid",
        )

    def deliver(self, event_id, amount_cents, payment_intent="pi_pr201_b57", sessions=()):
        event = Object(
            id=event_id, type="charge.refunded",
            data=Object(object=Object(
                id="ch_pr201_b57", payment_intent=payment_intent,
                refunded=amount_cents >= 4500,
                amount_refunded=amount_cents,
            )),
        )
        with (
            patch("billing.views.stripe.Webhook.construct_event", return_value=event),
            patch("billing.views.stripe.checkout.Session.list", return_value=Object(data=list(sessions))),
        ):
            return APIClient().post(
                reverse("api_v1:billing:stripe_webhook"), b"{}",
                content_type="application/json",
                HTTP_STRIPE_SIGNATURE="synthetic",
            )

    def test_partial_then_full_then_stale_refund_event(self):
        self.assertEqual(self.deliver("evt_p6_partial", 1000).status_code, 200)
        self.payment.refresh_from_db()
        self.assertEqual(self.payment.status, "partially_refunded")
        self.assertEqual(str(self.payment.refunded_amount_aud), "10.00")
        self.assertEqual(self.deliver("evt_p6_full", 4500).status_code, 200)
        self.payment.refresh_from_db()
        self.assertEqual(self.payment.status, "refunded")
        self.assertEqual(str(self.payment.refunded_amount_aud), "45.00")
        self.assertEqual(self.deliver("evt_p6_old", 1000).status_code, 200)
        self.payment.refresh_from_db()
        self.assertEqual(self.payment.status, "refunded")
        self.assertEqual(str(self.payment.refunded_amount_aud), "45.00")

    def test_unrelated_payment_intent_does_not_change_ledger(self):
        self.assertEqual(
            self.deliver("evt_p6_other", 4500, payment_intent="pi_other").status_code, 200
        )
        self.payment.refresh_from_db()
        self.assertEqual(self.payment.status, "paid")
        self.assertEqual(str(self.payment.refunded_amount_aud), "0.00")
        self.assertEqual(
            StripeWebhookEvent.objects.get(event_id="evt_p6_other").status, "processed"
        )

    def test_refund_before_checkout_is_retried_after_payment_is_recorded(self):
        owner_id, shift_id = self.payment.owner_id, self.payment.shift_id
        self.payment.delete()
        response = self.deliver(
            "evt_p6_early_refund", 4500, sessions=[Object(metadata={"type": "cancellation"})],
        )
        self.assertEqual(response.status_code, 500)
        receipt = StripeWebhookEvent.objects.get(event_id="evt_p6_early_refund")
        self.assertEqual(receipt.status, "failed")
        self.assertIsNone(receipt.processed_at)
        self.assertFalse(ShiftPayment.objects.exists())

        checkout = Object(
            id="evt_p6_checkout_after_refund", type="checkout.session.completed",
            data=Object(object=Object(
                mode="payment", payment_status="paid", amount_total=4500,
                payment_intent="pi_pr201_b57",
                metadata={"shift_id": str(shift_id), "owner_user_id": str(owner_id), "type": "cancellation"},
            )),
        )
        with patch("billing.views.stripe.Webhook.construct_event", return_value=checkout):
            response = APIClient().post(
                reverse("api_v1:billing:stripe_webhook"), b"{}", content_type="application/json",
            )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.deliver("evt_p6_early_refund", 4500).status_code, 200)
        payment = ShiftPayment.objects.get(stripe_payment_intent_id="pi_pr201_b57")
        self.assertEqual(payment.status, "refunded")
        self.assertEqual(str(payment.refunded_amount_aud), "45.00")
        receipt.refresh_from_db()
        self.assertEqual(receipt.status, "processed")
