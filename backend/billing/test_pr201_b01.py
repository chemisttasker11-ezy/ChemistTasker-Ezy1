"""Phase 6: ensure active subscription pricing at the correct account boundary."""
from types import SimpleNamespace
from unittest.mock import patch
from django.test import TestCase
from billing.models import OwnerSubscription
from client_profile.characterization_support import client_for, make_owner_with_pharmacy, make_user
from shifts.models import Shift, ShiftOffer

class B01CheckoutPricing(TestCase):
    PRICES = {
        "LOCUM": ("price_1T52jFBQXaySV5ukezd5JmzS", "price_1T52jFBQXaySV5ukkXOKPHSV"),
        "FULL_TIME": ("price_1T52ilBQXaySV5uksvQy2RTk", "price_1T52imBQXaySV5ukuwLH3ikI"),
    }

    def setUp(self):
        self.owner, self.pharmacy = make_owner_with_pharmacy("PR201 B01")
        self.other_owner, _other_pharmacy = make_owner_with_pharmacy("PR201 other account")
        self.worker = make_user("PHARMACIST")

    def checkout(self, category):
        extra = {"min_hourly_rate": 60, "max_hourly_rate": 80} if category == "FULL_TIME" else {}
        shift = Shift.objects.create(
            pharmacy=self.pharmacy, created_by=self.owner, role_needed="PHARMACIST",
            employment_type=category, payment_status="PENDING", **extra,
        )
        offer = ShiftOffer.objects.create(
            shift=shift, user=self.worker, status=ShiftOffer.Status.ACCEPTED_AWAITING_PAYMENT,
        )
        with (
            patch("billing.views.get_billing_state_for_account", return_value="PAYMENT_REQUIRED"),
            patch("billing.views.stripe.checkout.Session.create",
                  return_value=SimpleNamespace(url="https://checkout.example.test/b01")) as create,
        ):
            response = client_for(self.owner).post(
                f"/api/v1/billing/charge-fulfillment/{shift.pk}/",
                {"offer_ids": [offer.pk]}, format="json",
            )
        self.assertEqual(response.status_code, 200, response.data)
        create.assert_called_once()
        line = create.call_args.kwargs["line_items"][0]
        self.assertEqual(line["quantity"], 1)
        return line["price"]

    def test_no_subscription_standard_prices(self):
        for name, prices in self.PRICES.items():
            with self.subTest(category=name):
                self.assertEqual(self.checkout(name), prices[0])

    def test_active_subscription_discounted_prices(self):
        OwnerSubscription.objects.create(owner=self.owner, status="active", stripe_customer_id="cus_pr201_b01")
        for name, prices in self.PRICES.items():
            with self.subTest(category=name):
                self.assertEqual(self.checkout(name), prices[1])

    def test_unrelated_owner_does_not_get_discount(self):
        OwnerSubscription.objects.create(owner=self.other_owner, status="active", stripe_customer_id="cus_pr201_b01_other")
        self.assertEqual(self.checkout("LOCUM"), self.PRICES["LOCUM"][0])

    def test_inactive_subscriber_standard_price(self):
        OwnerSubscription.objects.create(owner=self.owner, status="inactive", stripe_customer_id="cus_pr201_b01_inactive")
        self.assertEqual(self.checkout("LOCUM"), self.PRICES["LOCUM"][0])
