"""Phase-5 payment/Stripe negative controls on frozen main, without real provider calls."""
from datetime import date, timedelta
from types import SimpleNamespace
from unittest.mock import patch

from django.test import TestCase, override_settings
from django.urls import reverse
from rest_framework.test import APIClient

from billing.models import OwnerSubscription, ShiftPayment
from client_profile.characterization_support import (
    client_for, make_owner_with_pharmacy, make_staff_member, make_user,
)
from shifts.models import Shift, ShiftOffer


class _StripeObject(dict):
    def __getattr__(self, name):
        try:
            return self[name]
        except KeyError as exc:
            raise AttributeError(name) from exc


@override_settings(STRIPE_WEBHOOK_SECRET="whsec-pr200-phase5")
class Phase5StripeFinance(TestCase):
    def setUp(self):
        self.owner, self.pharmacy = make_owner_with_pharmacy("PR200 Money")
        self.shift = Shift.objects.create(
            pharmacy=self.pharmacy, created_by=self.owner,
            role_needed="PHARMACIST", employment_type="LOCUM",
            payment_status="PENDING",
        )
        self.worker1 = make_user("PHARMACIST")
        self.worker2 = make_user("PHARMACIST")
        self.offer1 = ShiftOffer.objects.create(
            shift=self.shift, user=self.worker1,
            status=ShiftOffer.Status.ACCEPTED_AWAITING_PAYMENT,
        )
        self.offer2 = ShiftOffer.objects.create(
            shift=self.shift, user=self.worker2,
            status=ShiftOffer.Status.ACCEPTED_AWAITING_PAYMENT,
        )

    def _event(self, event_id, event_type, obj):
        return _StripeObject(
            id=event_id, type=event_type, data=_StripeObject(object=_StripeObject(obj))
        )

    def _post_webhook(self, event):
        with patch("billing.views.stripe.Webhook.construct_event", return_value=event):
            return client_for().post(
                reverse("api_v1:billing:stripe_webhook"),
                b"{}", content_type="application/json",
            )

    def test_c004_n2_unspecified_offer_checkout_must_not_charge_one_and_book_two(self):
        fake = SimpleNamespace(url="https://checkout.example.test/test")
        with (
            patch("billing.views.get_billing_state_for_account", return_value="PAYMENT_REQUIRED"),
            patch("billing.views.stripe.checkout.Session.create", return_value=fake) as stripe_create,
        ):
            response = client_for(self.owner).post(
                f"/api/v1/billing/charge-fulfillment/{self.shift.pk}/",
                {}, format="json",
            )
        if response.status_code == 200:
            stripe_create.assert_called_once()
            params = stripe_create.call_args.kwargs
            units = params["line_items"][0]["quantity"]
            # Either require selection or bill for the actual two pending offers.
            self.assertEqual(units, 2, "No selector charged once with two pending offers.")
        else:
            self.assertEqual(response.status_code, 400)

    def test_c004_n2_explicit_single_offer_bills_exactly_one(self):
        fake = SimpleNamespace(url="https://checkout.example.test/single")
        with (
            patch("billing.views.get_billing_state_for_account", return_value="PAYMENT_REQUIRED"),
            patch("billing.views.stripe.checkout.Session.create", return_value=fake) as stripe_create,
        ):
            response = client_for(self.owner).post(
                f"/api/v1/billing/charge-fulfillment/{self.shift.pk}/",
                {"offer_ids": [self.offer1.pk]}, format="json",
            )
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(stripe_create.call_args.kwargs["line_items"][0]["quantity"], 1)
        self.assertIn(str(self.offer1.pk), stripe_create.call_args.kwargs["metadata"]["offer_ids"])

    def test_b70_repeated_invoice_subscription_setup_must_not_create_two_recurring_ids(self):
        with (
            patch("billing.views.stripe.Customer.create",
                  return_value=SimpleNamespace(id="cus_pr200")) as customer,
            patch("billing.views.stripe.Subscription.create",
                  side_effect=[SimpleNamespace(id="sub_one"), SimpleNamespace(id="sub_two")]) as subscriptions,
        ):
            first = client_for(self.owner).post(
                "/api/v1/billing/subscribe/",
                {"payment_method": "invoice"}, format="json",
            )
            second = client_for(self.owner).post(
                "/api/v1/billing/subscribe/",
                {"payment_method": "invoice"}, format="json",
            )
        self.assertEqual(first.status_code, 200, first.data)
        self.assertLessEqual(subscriptions.call_count, 1, (
            f"Repeated requests made {subscriptions.call_count} independent recurring subscriptions; "
            f"second status={second.status_code}"
        ))

    def test_f08_n2_unpaid_stripe_status_must_deactivate_entitlement(self):
        sub = OwnerSubscription.objects.create(
            owner=self.owner, stripe_customer_id="cus_unpaid",
            stripe_subscription_id="sub_unpaid", status="active",
            current_period_end=__import__("django.utils.timezone",fromlist=["now"]).now()
            - timedelta(days=3),
        )
        event = self._event(
            "evt_unpaid_status", "customer.subscription.updated",
            {"id": "sub_unpaid", "customer": "cus_unpaid", "status": "unpaid"},
        )
        response = self._post_webhook(event)
        self.assertEqual(response.status_code, 200, response.content)
        sub.refresh_from_db()
        self.assertNotEqual(sub.status, "active")

    def test_b68_unknown_subscription_on_same_customer_must_not_activate_other_entitlement(self):
        sub = OwnerSubscription.objects.create(
            owner=self.owner, stripe_customer_id="cus_owned",
            stripe_subscription_id="sub_valid", status="inactive",
        )
        event = self._event(
            "evt_foreign_sub", "invoice.paid",
            {
                "id": "in_unlinked", "customer": "cus_owned",
                "subscription": "sub_unknown", "lines": {"data": []},
            },
        )
        response = self._post_webhook(event)
        self.assertEqual(response.status_code, 200, response.content)
        sub.refresh_from_db()
        self.assertEqual(sub.status, "inactive")
        self.assertEqual(sub.stripe_subscription_id, "sub_valid")

    def test_b68_known_subscription_paid_restores_entitlement_positive_control(self):
        sub = OwnerSubscription.objects.create(
            owner=self.owner, stripe_customer_id="cus_owned",
            stripe_subscription_id="sub_valid", status="inactive",
        )
        event = self._event(
            "evt_valid_sub", "invoice.paid",
            {
                "id": "in_valid", "customer": "cus_owned",
                "subscription": "sub_valid", "lines": {"data": []},
            },
        )
        response = self._post_webhook(event)
        self.assertEqual(response.status_code, 200, response.content)
        sub.refresh_from_db()
        self.assertEqual(sub.status, "active")

    def test_b69_same_cancellation_payment_intent_in_two_events_must_record_once(self):
        payload = {
            "mode": "payment", "payment_status": "paid", "amount_total": 1350,
            "payment_intent": "pi_one_penalty",
            "metadata": {
                "shift_id": str(self.shift.pk), "type": "cancellation",
                "owner_user_id": str(self.owner.pk),
                "actor_user_id": str(self.owner.pk),
            },
        }
        with (
            patch("billing.views._finalize_pending_offers_for_shift", return_value=(0, [])),
            patch("shifts.emails.send_shift_payment_finalized_notifications"),
        ):
            first = self._post_webhook(self._event("evt_cancel_a", "checkout.session.completed", payload))
            second = self._post_webhook(self._event("evt_cancel_b", "checkout.session.completed", payload))
        self.assertEqual(first.status_code, 200, first.content)
        self.assertEqual(second.status_code, 200, second.content)
        self.assertEqual(
            ShiftPayment.objects.filter(stripe_payment_intent_id="pi_one_penalty").count(), 1,
            "One Stripe payment intent must not be recorded as two separate paid penalties.",
        )

    def test_f01_n3_worker_cannot_delete_payment_waiting_offer(self):
        res = client_for(self.worker1).delete(
            f"/api/v1/shift-offers/{self.offer1.pk}/"
        )
        self.assertIn(res.status_code, (403, 405), res.content)
        self.assertTrue(ShiftOffer.objects.filter(pk=self.offer1.pk).exists())

    def test_f08_n5_owner_delete_does_not_leave_active_recurring_billing(self):
        sub = OwnerSubscription.objects.create(
            owner=self.owner, stripe_customer_id="cus_active",
            stripe_subscription_id="sub_active",
            stripe_extra_seat_subscription_id="sub_active_seats",
            status="active", staff_count=8,
        )
        with patch("users.api_account.deliver_email_best_effort"):
            response = client_for(self.owner).delete("/api/v1/account/")
        sub.refresh_from_db()
        # Either deny the delete or cancel the linked recurring subscriptions
        # before disabling billing account access. A 200 + active is unsafe.
        if response.status_code == 200:
            self.assertNotEqual(sub.status, "active")
        else:
            self.assertIn(response.status_code, (400, 403, 409))
