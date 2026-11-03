"""Collection is fail-closed without blocking settlement of historical provider events."""
import os
from unittest.mock import Mock, patch

from django.core.exceptions import ImproperlyConfigured
from django.test import SimpleTestCase, TestCase, override_settings

from billing import tests as fixtures
from billing import test_checkout_reservations as reservations
from billing.checkout_reservations import open_checkout, prepare_checkout
from billing.models import FulfillmentCheckout, FulfillmentReservation, ShiftPayment
from billing.release_guards import LiveCollectionRestricted, assert_can_create_shift_charge, get_stripe_mode, validate_provider_preflight
from client_profile.characterization_support import client_for

TEST_KEY = "sk_test_disposablecontractonly"
LIVE_KEY = "sk_live_disposablecontractonly"


class ProviderModeContracts(SimpleTestCase):
    def test_missing_and_unrecognized_keys_are_not_test_mode(self):
        for key in ("", "sk_test_", "sk_live_", "not-a-key", "sk_test_!invalid", " " + TEST_KEY):
            with self.subTest(key=key), override_settings(STRIPE_SECRET_KEY=key):
                self.assertEqual(get_stripe_mode(), "invalid")
                with self.assertRaises(LiveCollectionRestricted):
                    assert_can_create_shift_charge("fulfillment")

    def test_test_and_restricted_test_keys_work_with_live_flags_off(self):
        for environment in ("local", "dev", "development", "test", "staging"):
            for key in (TEST_KEY, TEST_KEY.replace("sk_", "rk_")):
                with self.subTest(environment=environment,key=key), patch.dict("os.environ", {"APP_ENV":environment}), override_settings(
                    STRIPE_SECRET_KEY=key, BILLING_LIVE_SHIFT_FULFILLMENT_ENABLED=False, BILLING_LIVE_SHIFT_PENALTY_ENABLED=False,
                ):
                    assert_can_create_shift_charge("fulfillment")
                    assert_can_create_shift_charge("cancellation")

    def test_test_keys_require_an_explicit_nonproduction_environment(self):
        for environment in ("production", "prod", " PRODUCTION ", "preview", "", None):
            for key in (TEST_KEY, TEST_KEY.replace("sk_", "rk_")):
                for enabled in (False, True):
                    with self.subTest(environment=environment,key=key,enabled=enabled), patch.dict("os.environ"), override_settings(
                        STRIPE_SECRET_KEY=key, BILLING_LIVE_SHIFT_FULFILLMENT_ENABLED=enabled, BILLING_LIVE_SHIFT_PENALTY_ENABLED=enabled,
                    ):
                        if environment is None:
                            os.environ.pop("APP_ENV",None)
                        else:
                            os.environ["APP_ENV"]=environment
                        for kind in ("fulfillment", "cancellation"):
                            with self.assertRaises(LiveCollectionRestricted) as rejected:
                                assert_can_create_shift_charge(kind)
                            self.assertEqual(str(rejected.exception.detail["code"]),"test_provider_environment_rejected")

    @override_settings(STRIPE_SECRET_KEY=LIVE_KEY, BILLING_LIVE_SHIFT_FULFILLMENT_ENABLED=True)
    def test_capabilities_are_independent_and_unknown_kind_never_bypasses(self):
        assert_can_create_shift_charge("fulfillment")
        with self.assertRaises(LiveCollectionRestricted):
            assert_can_create_shift_charge("cancellation")
        with override_settings(STRIPE_SECRET_KEY=TEST_KEY), self.assertRaises(LiveCollectionRestricted):
            assert_can_create_shift_charge("unknown")

    @override_settings(STRIPE_SECRET_KEY=LIVE_KEY, BILLING_LIVE_SHIFT_FULFILLMENT_ENABLED=True)
    def test_staging_rejects_live_mode_at_startup_and_at_collection(self):
        with patch.dict("os.environ", {"APP_ENV": "staging"}):
            with self.assertRaises(ImproperlyConfigured):
                validate_provider_preflight()
            with self.assertRaises(LiveCollectionRestricted):
                assert_can_create_shift_charge("fulfillment")


class FulfillmentReleaseContracts(TestCase):
    def setUp(self):
        reservations.CheckoutReservationTests.setUp(self)

    attempt = reservations.CheckoutReservationTests.attempt
    pay = reservations.CheckoutReservationTests.pay

    @override_settings(STRIPE_SECRET_KEY=LIVE_KEY)
    def test_restricted_http_collection_creates_no_attempt_or_booking(self):
        response = self.client.post(self.url, {"offer_ids": [self.offer.pk]}, format="json")
        self.assertEqual(response.status_code, 503, response.data)
        self.assertEqual(response.data["code"], "live_collection_disabled")
        self.checkout.assert_not_called()
        self.assertFalse(FulfillmentCheckout.objects.exists())
        self.assertFalse(FulfillmentReservation.objects.exists())
        self.assertFalse(self.shift.slot_assignments.exists())
        self.offer.refresh_from_db()
        self.assertEqual(self.offer.status, "ACCEPTED_AWAITING_PAYMENT")

    @override_settings(STRIPE_SECRET_KEY=TEST_KEY, BILLING_LIVE_SHIFT_FULFILLMENT_ENABLED=False, BILLING_LIVE_SHIFT_PENALTY_ENABLED=False)
    def test_production_test_key_creates_no_provider_checkout_reservation_or_booking(self):
        with patch.dict("os.environ",{"APP_ENV":"production"}):
            response=self.client.post(self.url,{"offer_ids":[self.offer.pk]},format="json")
        self.assertEqual(response.status_code,503,response.data)
        self.assertEqual(str(response.data["code"]),"test_provider_environment_rejected")
        self.checkout.assert_not_called()
        self.assertFalse(FulfillmentCheckout.objects.exists())
        self.assertFalse(FulfillmentReservation.objects.exists())
        self.assertFalse(self.shift.slot_assignments.exists())
        self.offer.refresh_from_db()
        self.assertEqual(self.offer.status,"ACCEPTED_AWAITING_PAYMENT")

    @override_settings(STRIPE_SECRET_KEY=LIVE_KEY)
    def test_direct_prepare_and_resume_cannot_bypass_collection_control(self):
        with self.assertRaises(LiveCollectionRestricted):
            prepare_checkout(shift_id=self.shift.pk, actor=self.owner, offer_ids=[self.offer.pk], parameters={})
        attempt = Mock()
        with self.assertRaises(LiveCollectionRestricted):
            open_checkout(attempt)
        attempt.refresh_from_db.assert_called_once()
        self.checkout.assert_not_called()
        self.assertFalse(FulfillmentCheckout.objects.exists())

    def test_restricted_resume_preserves_paid_and_expired_state_messages(self):
        response = self.client.post(self.url, {"offer_ids": [self.offer.pk]}, format="json")
        self.assertEqual(response.status_code, 200, response.data)
        attempt = self.attempt()
        self.checkout.reset_mock()
        for state, message in ((FulfillmentCheckout.State.COMPLETE, "already been paid"),
                               (FulfillmentCheckout.State.EXPIRED, "expired")):
            with self.subTest(state=state):
                FulfillmentCheckout.objects.filter(pk=attempt.pk).update(state=state)
                with override_settings(STRIPE_SECRET_KEY=LIVE_KEY):
                    response = self.client.post(
                        f"/api/v1/billing/charge-fulfillment/{self.shift.pk}/checkouts/{attempt.pk}/resume/",
                        {}, format="json")
                self.assertEqual(response.status_code, 409, response.data)
                self.assertIn(message, str(response.data))
                self.checkout.assert_not_called()

    def test_historical_signed_payment_is_reconciled_with_new_live_collection_disabled(self):
        with override_settings(STRIPE_SECRET_KEY=TEST_KEY):
            response = self.client.post(self.url, {"offer_ids": [self.offer.pk]}, format="json")
        self.assertEqual(response.status_code, 200, response.data)
        with patch.dict("os.environ",{"APP_ENV":"production"}), override_settings(STRIPE_SECRET_KEY=LIVE_KEY, STRIPE_WEBHOOK_SECRET="disposable"):
            self.pay()
            self.pay()
        self.assertEqual(ShiftPayment.objects.count(), 1)
        self.assertEqual(self.attempt().state, FulfillmentCheckout.State.COMPLETE)


class PenaltyReleaseContracts(TestCase):
    def setUp(self):
        fixtures.PenaltyMoneyContracts.setUp(self)

    @override_settings(STRIPE_SECRET_KEY=TEST_KEY, BILLING_LIVE_SHIFT_FULFILLMENT_ENABLED=False, BILLING_LIVE_SHIFT_PENALTY_ENABLED=False)
    def test_production_test_key_penalty_creates_no_provider_charge(self):
        self.assignment.unit_rate=100
        self.assignment.save(update_fields=['unit_rate'])
        with patch.dict("os.environ",{"APP_ENV":"production"}), patch("django.utils.timezone.now",return_value=self.now), patch(
            "billing.stripe_support.stripe.checkout.Session.create",
        ) as create:
            response=client_for(self.owner).post(self.url,{},format="json")
        self.assertEqual(response.status_code,503,response.data)
        create.assert_not_called()
        self.assertFalse(ShiftPayment.objects.exists())

    @override_settings(STRIPE_SECRET_KEY=LIVE_KEY)
    def test_restricted_cancellation_never_calls_provider(self):
        self.assignment.unit_rate = 100
        self.assignment.save(update_fields=['unit_rate'])
        with patch("django.utils.timezone.now", return_value=self.now), patch(
            "billing.stripe_support.stripe.checkout.Session.create"
        ) as create:
            response = client_for(self.owner).post(self.url, {}, format="json")
        self.assertEqual(response.status_code, 503, response.data)
        create.assert_not_called()
        self.assertFalse(ShiftPayment.objects.exists())
