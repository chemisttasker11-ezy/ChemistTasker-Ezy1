from types import SimpleNamespace
from unittest.mock import patch
from django.test import TestCase
from client_profile.characterization_support import client_for, make_owner_with_pharmacy, make_user
from shifts.models import Shift, ShiftOffer

class FulfillmentSelectionTests(TestCase):
    def setUp(self):
        self.owner, pharmacy = make_owner_with_pharmacy("P6 checkout")
        self.shift = Shift.objects.create(pharmacy=pharmacy, created_by=self.owner, role_needed="PHARMACIST", employment_type="LOCUM")
        self.worker1 = make_user("PHARMACIST")
        self.worker2 = make_user("PHARMACIST")
        self.offers = [ShiftOffer.objects.create(shift=self.shift, user=worker, status=ShiftOffer.Status.ACCEPTED_AWAITING_PAYMENT) for worker in (self.worker1, self.worker2)]

    def checkout(self, payload):
        with (
            patch("billing.views.get_billing_state_for_account", return_value="PAYMENT_REQUIRED"),
            patch("billing.views.stripe.checkout.Session.create", return_value=SimpleNamespace(url="https://checkout.example.test")) as create,
        ):
            response = client_for(self.owner).post(f"/api/v1/billing/charge-fulfillment/{self.shift.pk}/", payload, format="json")
        return response, create

    def test_unspecified_selection_denied(self):
        result, create = self.checkout({})
        self.assertEqual(result.status_code, 400, result.data)
        create.assert_not_called()

    def test_one_offer_charges_one(self):
        result, create = self.checkout({"offer_ids": [self.offers[0].id]})
        self.assertEqual(result.status_code, 200, result.data)
        self.assertEqual(create.call_args.kwargs["line_items"][0]["quantity"], 1)

    def test_two_offers_charge_two(self):
        result, create = self.checkout({"offer_ids": [o.id for o in self.offers]})
        self.assertEqual(result.status_code, 200, result.data)
        self.assertEqual(create.call_args.kwargs["line_items"][0]["quantity"], 2)

    def test_candidate_only_charges_matching_offer(self):
        result, create = self.checkout({"candidate_id": self.worker1.id})
        self.assertEqual(result.status_code, 200, result.data)
        self.assertEqual(create.call_args.kwargs["line_items"][0]["quantity"], 1)

    def test_free_pre_live_checkout_without_selector_preserved(self):
        from unittest.mock import patch
        with (
            patch("billing.views.get_billing_state_for_account", return_value="PRE_LIVE"),
            patch("billing.views._finalize_pending_offers_for_shift", return_value=(2, self.offers)) as finalize,
            patch("shifts.emails.send_shift_payment_finalized_notifications") as notify,
            patch("billing.views.stripe.checkout.Session.create") as create,
            self.captureOnCommitCallbacks(execute=True),
        ):
            response = client_for(self.owner).post(
                f"/api/v1/billing/charge-fulfillment/{self.shift.pk}/", {}, format="json",
            )
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["finalized_offers"], 2)
        finalize.assert_called_once()
        notify.assert_called_once()
        create.assert_not_called()
