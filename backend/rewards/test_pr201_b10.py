"""Phase 6 B10: independent charged units, atomic balance and retry controls."""
from datetime import timedelta, time
from unittest.mock import patch

from django.test import TestCase
from django.utils import timezone
from client_profile.characterization_support import client_for, make_owner_with_pharmacy, make_user
from rewards.models import PillLedgerEntry
from rewards.services import get_pill_balance, get_shift_post_pill_cost
from shifts.models import Shift, ShiftSlot, ShiftOffer

URL = "/api/v1/pill-rewards/pay-shift/"

class B10PillPaymentIntegrity(TestCase):
    def setUp(self):
        self.owner, pharmacy = make_owner_with_pharmacy("P6 B10 pills")
        self.shift = Shift.objects.create(
            pharmacy=pharmacy, created_by=self.owner,
            role_needed="ASSISTANT", employment_type="LOCUM", payment_status="PENDING",
        )
        day = timezone.localdate() + timedelta(days=14)
        self.offers = []
        for i in range(2):
            slot = ShiftSlot.objects.create(
                shift=self.shift, date=day + timedelta(days=i),
                start_time=time(9), end_time=time(17),
            )
            offer = ShiftOffer.objects.create(
                shift=self.shift, slot=slot, user=make_user("ASSISTANT"),
                status=ShiftOffer.Status.ACCEPTED_AWAITING_PAYMENT,
            )
            self.offers.append(offer)

    def fund(self, amount):
        PillLedgerEntry.objects.create(
            user=self.owner, entry_type="EARN", source="MANUAL",
            delta=amount, balance_after=amount, idempotency_key=f"p6-b10-fund-{amount}",
        )

    def pay(self, offer_ids):
        return client_for(self.owner).post(
            URL, {"shift_id": self.shift.id, "offer_ids": offer_ids}, format="json",
        )

    def test_two_offers_create_two_distinct_debits_and_replay_no_extra(self):
        cost = get_shift_post_pill_cost()
        self.fund(cost * 3)
        with patch("rewards.views.send_shift_payment_finalized_notifications"):
            result = self.pay([offer.id for offer in self.offers])
            self.assertEqual(result.status_code, 200, result.data)
            self.assertEqual(result.data["finalized_offers"], 2)
            self.assertEqual(get_pill_balance(self.owner), cost)
            debits = PillLedgerEntry.objects.filter(user=self.owner, entry_type="SPEND")
            self.assertEqual(debits.count(), 2)
            self.assertEqual(debits.values("idempotency_key").distinct().count(), 2)
            replay = self.pay([offer.id for offer in self.offers])
            self.assertEqual(replay.status_code, 200, replay.data)
            self.assertEqual(get_pill_balance(self.owner), cost)
            self.assertEqual(debits.count(), 2)

    def test_insufficient_balance_rolls_back_every_offer_and_debit(self):
        cost = get_shift_post_pill_cost()
        self.fund(cost)
        result = self.pay([offer.id for offer in self.offers])
        self.assertEqual(result.status_code, 400, result.data)
        self.assertEqual(get_pill_balance(self.owner), cost)
        self.assertFalse(PillLedgerEntry.objects.filter(user=self.owner, entry_type="SPEND").exists())
        self.assertEqual(ShiftOffer.objects.filter(shift=self.shift, status="ACCEPTED_AWAITING_PAYMENT").count(), 2)

    def test_ambiguous_multi_offer_no_selector_must_not_debit(self):
        self.fund(get_shift_post_pill_cost() * 3)
        result = client_for(self.owner).post(URL, {"shift_id": self.shift.id}, format="json")
        self.assertEqual(result.status_code, 400, result.data)
        self.assertFalse(PillLedgerEntry.objects.filter(user=self.owner, entry_type="SPEND").exists())

    def test_one_offer_only_bills_one_and_keeps_other_pending(self):
        cost = get_shift_post_pill_cost()
        self.fund(cost * 3)
        with patch("rewards.views.send_shift_payment_finalized_notifications"):
            result = self.pay([self.offers[0].id])
        self.assertEqual(result.status_code, 200, result.data)
        self.assertEqual(result.data["finalized_offers"], 1)
        self.assertEqual(get_pill_balance(self.owner), cost * 2)
        self.shift.refresh_from_db()
        self.assertEqual(self.shift.payment_status, "PENDING")
