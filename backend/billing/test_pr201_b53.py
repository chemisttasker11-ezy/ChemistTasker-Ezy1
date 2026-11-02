"""PR201 Phase 6 B53 out-of-order webhook regression.

The real Django webhook view and durable StripeWebhookEvent receipt are used.
Stripe signature verification and subscription retrieval are mocked.
"""
from unittest.mock import patch
from datetime import datetime, timezone
from django.test import TestCase, override_settings
from django.urls import reverse
from rest_framework.test import APIClient
from billing.models import OwnerSubscription, StripeWebhookEvent
from client_profile.characterization_support import make_user


class _StripeObject(dict):
    def __getattr__(self, key):
        try:
            return self[key]
        except KeyError as exc:
            raise AttributeError(key) from exc


@override_settings(STRIPE_WEBHOOK_SECRET="whsec-pr201-b53")
class B53OutOfOrderSubscriptionEvents(TestCase):
    def setUp(self):
        owner = make_user("OWNER")
        self.sub = OwnerSubscription.objects.create(
            owner=owner, stripe_customer_id="cus_b53",
            stripe_subscription_id="sub_b53", status="active",
        )
        self.enterContext(patch("billing.stripe_support.stripe.Subscription.retrieve", side_effect=lambda sub_id: {
            "id": sub_id, "customer": "cus_b53", "status": "active",
        }))

    def deliver(self, event_id, event_type, obj):
        event = _StripeObject(
            id=event_id, type=event_type,
            data=_StripeObject(object=_StripeObject(obj)),
        )
        with patch("billing.stripe_support.stripe.Webhook.construct_event", return_value=event):
            response = APIClient().post(
                reverse("api_v1:billing:stripe_webhook"),
                b"{}", content_type="application/json",
                HTTP_STRIPE_SIGNATURE="synthetic",
            )
        self.assertEqual(response.status_code, 200, response.content)
        self.assertTrue(StripeWebhookEvent.objects.filter(
            event_id=event_id, status=StripeWebhookEvent.Status.PROCESSED,
        ).exists())
        self.sub.refresh_from_db()

    def test_b53_current_paid_invoice_does_not_deactivate_subscription_positive(self):
        self.deliver("evt_b53_current_paid", "invoice.paid", {
            "id": "in_b53_current", "customer": "cus_b53",
            "subscription": "sub_b53", "lines": {"data": []},
        })
        self.assertEqual(self.sub.status, "active")
        self.assertEqual(self.sub.stripe_subscription_id, "sub_b53")

    def test_b53_late_invoice_for_deleted_subscription_must_not_reactivate(self):
        self.deliver("evt_b53_deleted", "customer.subscription.deleted", {
            "id": "sub_b53", "customer": "cus_b53",
        })
        self.assertEqual(self.sub.status, "canceled")
        self.deliver("evt_b53_late_paid", "invoice.paid", {
            "id": "in_b53_old", "customer": "cus_b53",
            "subscription": "sub_b53", "lines": {"data": []},
        })
        self.assertEqual(
            self.sub.status, "canceled",
            "Payment for an old invoice must not reverse a later cancellation.",
        )

    def test_b53_paid_invoice_wrong_customer_is_not_authorized(self):
        self.sub.status = "inactive"
        self.sub.save(update_fields=["status"])
        self.deliver("evt_b53_wrong_cus", "invoice.paid", {
            "id": "in_wrong_cus", "customer": "cus_other",
            "subscription": "sub_b53", "lines": {"data": []},
        })
        self.assertEqual(self.sub.status, "inactive")

    def test_b53_late_checkout_does_not_resurrect_deleted_plan(self):
        self.sub.status = "canceled"
        self.sub.save(update_fields=["status"])
        self.deliver("evt_b53_late_checkout", "checkout.session.completed", {
            "mode": "subscription", "customer": "cus_b53",
            "subscription": "sub_b53", "payment_status": "paid",
            "metadata": {"owner_user_id": str(self.sub.owner_id)},
        })
        self.assertEqual(self.sub.status, "canceled")
        self.assertEqual(self.sub.stripe_subscription_id, "sub_b53")

    def test_subscription_checkout_wrong_customer_cannot_activate_owner(self):
        self.sub.status = "inactive"
        self.sub.save(update_fields=["status"])
        self.deliver("evt_b53_foreign_checkout", "checkout.session.completed", {
            "mode": "subscription", "customer": "cus_someone_else",
            "subscription": "sub_foreign",
            "metadata": {"owner_user_id": str(self.sub.owner_id)},
        })
        self.assertEqual(self.sub.status, "inactive")
        self.assertEqual(self.sub.stripe_subscription_id, "sub_b53")

    def test_subscription_checkout_correct_customer_activates_inactive(self):
        self.sub.status = "inactive"
        self.sub.save(update_fields=["status"])
        self.deliver("evt_b53_current_checkout", "checkout.session.completed", {
            "mode": "subscription", "customer": "cus_b53",
            "subscription": "sub_b53_new",
            "metadata": {"owner_user_id": str(self.sub.owner_id)},
        })
        self.assertEqual(self.sub.status, "active")
        self.assertEqual(self.sub.stripe_subscription_id, "sub_b53_new")

    def test_first_invoice_before_checkout_keeps_period_end(self):
        for empty_id in (None, ""):
            with self.subTest(empty_id=empty_id):
                self.sub.stripe_subscription_id = empty_id
                self.sub.status = "inactive"
                self.sub.current_period_end = None
                self.sub.save()
                self.deliver(f"evt_b53_first_{empty_id}", "invoice.paid", {
                    "customer": "cus_b53", "subscription": "sub_b53_new",
                    "lines": {"data": [{"period": {"end": 1800000000}}]},
                })
                self.assertEqual(self.sub.status, "active")
                self.assertEqual(self.sub.current_period_end, datetime.fromtimestamp(1800000000, tz=timezone.utc))
                self.deliver(f"evt_b53_checkout_{empty_id}", "checkout.session.completed", {
                    "mode": "subscription", "customer": "cus_b53",
                    "subscription": "sub_b53_new", "payment_status": "paid",
                    "metadata": {"owner_user_id": str(self.sub.owner_id)},
                })
                self.assertEqual(self.sub.current_period_end, datetime.fromtimestamp(1800000000, tz=timezone.utc))

    def test_invoice_for_another_plan_cannot_use_customer_fallback(self):
        self.sub.status = "inactive"
        self.sub.save(update_fields=["status"])
        self.deliver("evt_b53_other_plan", "invoice.paid", {
            "customer": "cus_b53", "subscription": "sub_unrelated",
            "lines": {"data": [{"period": {"end": 1800000000}}]},
        })
        self.assertEqual(self.sub.status, "inactive")
        self.assertIsNone(self.sub.current_period_end)

    def test_first_invoice_cannot_match_another_customer(self):
        self.sub.stripe_subscription_id = None
        self.sub.status = "inactive"
        self.sub.save(update_fields=["stripe_subscription_id", "status"])
        self.deliver("evt_b53_first_foreign", "invoice.paid", {
            "customer": "cus_other", "subscription": "sub_b53_new",
            "lines": {"data": [{"period": {"end": 1800000000}}]},
        })
        self.assertEqual(self.sub.status, "inactive")
        self.assertIsNone(self.sub.current_period_end)

    def test_new_paid_checkout_reactivates_canceled_customer(self):
        self.sub.status = "canceled"
        self.sub.save(update_fields=["status"])
        with patch("billing.stripe_support.stripe.Subscription.retrieve", return_value={
            "id": "sub_b53_new", "customer": "cus_b53", "status": "active",
        }) as retrieve:
            self.deliver("evt_b53_rejoin", "checkout.session.completed", {
                "mode": "subscription", "customer": "cus_b53",
                "subscription": "sub_b53_new", "payment_status": "paid",
                "metadata": {"owner_user_id": str(self.sub.owner_id)},
            })
        retrieve.assert_called_once_with("sub_b53_new")
        self.assertEqual(self.sub.status, "active")
        self.assertEqual(self.sub.stripe_subscription_id, "sub_b53_new")

    def test_new_checkout_with_canceled_stripe_subscription_stays_canceled(self):
        self.sub.status = "canceled"
        self.sub.save(update_fields=["status"])
        with patch("billing.stripe_support.stripe.Subscription.retrieve", return_value={
            "id": "sub_b53_new", "customer": "cus_b53", "status": "canceled",
        }):
            self.deliver("evt_b53_stale_new", "checkout.session.completed", {
                "mode": "subscription", "customer": "cus_b53",
                "subscription": "sub_b53_new", "payment_status": "paid",
                "metadata": {"owner_user_id": str(self.sub.owner_id)},
            })
        self.assertEqual(self.sub.status, "canceled")
        self.assertEqual(self.sub.stripe_subscription_id, "sub_b53")

    def test_unpaid_new_checkout_cannot_reactivate_canceled_customer(self):
        self.sub.status = "canceled"
        self.sub.save(update_fields=["status"])
        with patch("billing.stripe_support.stripe.Subscription.retrieve") as retrieve:
            self.deliver("evt_b53_unpaid_rejoin", "checkout.session.completed", {
                "mode": "subscription", "customer": "cus_b53",
                "subscription": "sub_b53_new", "payment_status": "unpaid",
                "metadata": {"owner_user_id": str(self.sub.owner_id)},
            })
        retrieve.assert_not_called()
        self.assertEqual(self.sub.status, "canceled")
        self.assertEqual(self.sub.stripe_subscription_id, "sub_b53")

    def test_invoice_does_not_overwrite_unrelated_seat_fields(self):
        original_save = OwnerSubscription.save

        def save_with_seat_update(instance, *args, **kwargs):
            OwnerSubscription.objects.filter(pk=instance.pk).update(staff_count=12)
            return original_save(instance, *args, **kwargs)

        with patch.object(OwnerSubscription, "save", save_with_seat_update):
            self.deliver("evt_b53_preserve_seats", "invoice.paid", {
                "customer": "cus_b53", "subscription": "sub_b53",
                "lines": {"data": [{"period": {"end": 1800000000}}]},
            })
        self.assertEqual(self.sub.staff_count, 12)
        self.assertEqual(self.sub.status, "active")
        self.assertEqual(self.sub.current_period_end, datetime.fromtimestamp(1800000000, tz=timezone.utc))

    def test_checkout_does_not_overwrite_unrelated_period_end(self):
        original_save = OwnerSubscription.save
        period_end = datetime.fromtimestamp(1800000000, tz=timezone.utc)

        def save_with_period_update(instance, *args, **kwargs):
            OwnerSubscription.objects.filter(pk=instance.pk).update(current_period_end=period_end)
            return original_save(instance, *args, **kwargs)

        with patch.object(OwnerSubscription, "save", save_with_period_update):
            self.deliver("evt_b53_preserve_period", "checkout.session.completed", {
                "mode": "subscription", "customer": "cus_b53",
                "subscription": "sub_b53_new",
                "metadata": {"owner_user_id": str(self.sub.owner_id)},
            })
        self.assertEqual(self.sub.current_period_end, period_end)
        self.assertEqual(self.sub.stripe_subscription_id, "sub_b53_new")
