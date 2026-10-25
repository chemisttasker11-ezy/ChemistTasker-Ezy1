"""PR201 B69: payment intent uniqueness and exact webhook replay."""
from unittest.mock import patch
from django.db import IntegrityError, transaction
from django.test import TestCase, override_settings
from django.urls import reverse
from rest_framework.test import APIClient
from billing.models import ShiftPayment
from client_profile.characterization_support import make_owner_with_pharmacy
from shifts.models import Shift

class StripeValue(dict):
    def __getattr__(self, name):
        try:
            return self[name]
        except KeyError as exc:
            raise AttributeError(name) from exc

@override_settings(STRIPE_WEBHOOK_SECRET="whsec-pr201-b69")
class PaymentIntentDeduplicationTests(TestCase):
    def setUp(self):
        self.owner, pharmacy = make_owner_with_pharmacy("PR201 B69")
        self.shift = Shift.objects.create(pharmacy=pharmacy, created_by=self.owner,
            role_needed="PHARMACIST", employment_type="LOCUM")

    def event(self, event_id):
        event = StripeValue(id=event_id, type="checkout.session.completed",
            data=StripeValue(object=StripeValue(
                mode="payment", payment_status="paid", amount_total=1500,
                payment_intent="pi_pr201_b69",
                metadata={"shift_id": str(self.shift.pk), "type": "cancellation",
                    "owner_user_id": str(self.owner.pk), "actor_user_id": str(self.owner.pk)},
            )))
        with patch("billing.views.stripe.Webhook.construct_event", return_value=event):
            return APIClient().post(
                reverse("api_v1:billing:stripe_webhook"), b"{}",
                content_type="application/json", HTTP_STRIPE_SIGNATURE="synthetic")

    def test_distinct_provider_events_share_one_payment_intent(self):
        self.assertEqual(self.event("evt_p6_b69_a").status_code, 200)
        self.assertEqual(self.event("evt_p6_b69_b").status_code, 200)
        self.assertEqual(ShiftPayment.objects.filter(stripe_payment_intent_id="pi_pr201_b69").count(), 1)

    def test_database_rejects_second_record_with_same_real_payment_intent(self):
        self.assertEqual(self.event("evt_p6_b69_start").status_code, 200)
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                ShiftPayment.objects.create(
                    owner=self.owner, shift=self.shift, amount_aud="15.00",
                    payment_type="cancellation", payment_method="card",
                    stripe_payment_intent_id="pi_pr201_b69", status="paid",
                )
        self.assertEqual(ShiftPayment.objects.count(), 1)
