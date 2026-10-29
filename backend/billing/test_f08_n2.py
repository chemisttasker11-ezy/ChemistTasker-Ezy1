"""F08-N2: current Stripe state controls entitlements across late events."""
from unittest.mock import patch

from django.test import TestCase, override_settings

from billing.models import OwnerSubscription, StripeWebhookEvent
from client_profile.characterization_support import make_user


class StripeObject(dict):
    def __getattr__(self, key):
        try:
            return self[key]
        except KeyError as exc:
            raise AttributeError(key) from exc


@override_settings(STRIPE_WEBHOOK_SECRET="whsec-f08-n2")
class SubscriptionEntitlementContracts(TestCase):
    def setUp(self):
        self.sub = OwnerSubscription.objects.create(
            owner=make_user("OWNER"), stripe_customer_id="cus_f08_n2",
            stripe_subscription_id="sub_f08_n2", stripe_extra_seat_subscription_id="sub_f08_n2_extra",
            status="active",
        )

    def deliver(self, event_type, current_status, event_status="active", subscription_kind="base", **provider_overrides):
        sub_id = "sub_f08_n2_extra" if subscription_kind == "extra_seats" else "sub_f08_n2"
        provider = {
            "id": sub_id, "customer": "cus_f08_n2", "status": current_status,
            **provider_overrides,
        }
        obj = StripeObject(
            id=sub_id, customer="cus_f08_n2", status=event_status,
            subscription=sub_id, mode="subscription", payment_status="paid",
            metadata={"owner_user_id": str(self.sub.owner_id), "subscription_kind": subscription_kind,
                      "extra_seat_count": "2"}, lines={"data": []},
        )
        event_id = f"evt_f08_n2_{StripeWebhookEvent.objects.count()}"
        event = StripeObject(id=event_id, type=event_type, data=StripeObject(object=obj))
        with (
            patch("billing.stripe_support.stripe.Webhook.construct_event", return_value=event),
            patch("billing.stripe_support.stripe.Subscription.retrieve", return_value=provider) as retrieve,
        ):
            response = self.client.post("/api/v1/billing/webhook/", b"{}", content_type="application/json")
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(StripeWebhookEvent.objects.get(event_id=event_id).status, "processed")
        self.sub.refresh_from_db()
        return retrieve

    def test_unpaid_update_and_late_paid_events_cannot_restore_entitlement(self):
        for current_status in ("unpaid", "incomplete_expired", "canceled", "past_due"):
            for late_event in ("invoice.paid", "checkout.session.completed"):
                with self.subTest(status=current_status, late_event=late_event):
                    self.sub.status = "active"
                    self.sub.save(update_fields=["status"])
                    self.deliver("customer.subscription.updated", current_status)
                    self.assertEqual(self.sub.status, "inactive")
                    retrieve = self.deliver(late_event, current_status)
                    self.assertEqual(self.sub.status, "inactive")
                    retrieve.assert_called_once_with("sub_f08_n2")

    def test_current_active_and_trialing_restore_entitlement_positive_control(self):
        for current_status in ("active", "trialing"):
            for event_type in ("customer.subscription.updated", "invoice.paid", "checkout.session.completed"):
                with self.subTest(status=current_status, event_type=event_type):
                    self.sub.status = "inactive"
                    self.sub.save(update_fields=["status"])
                    self.deliver(event_type, current_status, event_status="unpaid")
                    self.assertEqual(self.sub.status, "active")

    def test_foreign_current_subscription_cannot_restore_entitlement(self):
        for event_type in ("invoice.paid", "checkout.session.completed"):
            with self.subTest(event_type=event_type):
                self.sub.status = "inactive"
                self.sub.save(update_fields=["status"])
                self.deliver(event_type, "active", customer="cus_other")
                self.assertEqual(self.sub.status, "inactive")

    def test_extra_seat_payment_does_not_restore_unpaid_base_entitlement(self):
        for event_type in ("invoice.paid", "checkout.session.completed"):
            with self.subTest(event_type=event_type):
                self.deliver("customer.subscription.updated", "unpaid")
                self.deliver(event_type, "active", subscription_kind="extra_seats")
                self.assertEqual(self.sub.status, "inactive")

    def test_extra_seat_checkout_preserves_active_base_positive_control(self):
        for current_status, seats in (("active", 7), ("unpaid", 5)):
            with self.subTest(status=current_status):
                self.deliver("checkout.session.completed", current_status, subscription_kind="extra_seats")
                self.assertEqual(self.sub.status, "active")
                self.assertEqual(self.sub.staff_count, seats)
