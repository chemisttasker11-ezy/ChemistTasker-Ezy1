from django.test import TestCase
from unittest.mock import patch
from datetime import timedelta
from client_profile.characterization_support import client_for
from shifts.test_payment_edit_guards import _ShiftMixin


class Claim1PillsRecurringDates(_ShiftMixin, TestCase):
    def setUp(self):
        from rewards.models import PillLedgerEntry
        from rewards.services import _create_ledger_entry, seed_default_reward_rules
        self.make_shift()
        seed_default_reward_rules()
        _create_ledger_entry(user=self.owner, rule=None, entry_type=PillLedgerEntry.EntryType.ADJUSTMENT,
                             source=PillLedgerEntry.Source.MANUAL, amount=1000, idempotency_key="seed-204")

    def pay(self, *offers):
        with patch("rewards.views.send_shift_payment_finalized_notifications"):
            return client_for(self.owner).post("/api/v1/pill-rewards/pay-shift/",
                                               {"shift_id": self.shift.pk, "offer_ids": [o.pk for o in offers]},
                                               format="json")

    def test_claim1_two_dates_one_slot_paid_together_bug(self):
        o1, o2 = self.offer(self.day), self.offer(self.day + timedelta(days=1))
        r = self.pay(o1, o2)
        self.assertEqual(r.status_code, 200, f"two occurrence dates of one slot rejected: {r.data}")

    def test_claim1_paying_first_date_keeps_second_date_bug(self):
        from shifts.models import ShiftOffer
        o1, o2 = self.offer(self.day), self.offer(self.day + timedelta(days=1))
        r = self.pay(o1)
        self.assertEqual(r.status_code, 200, r.data)
        o2.refresh_from_db()
        self.assertEqual(o2.status, ShiftOffer.Status.ACCEPTED_AWAITING_PAYMENT,
                         "paying date 1 expired the accepted offer for date 2")

    def test_claim1_same_date_competitor_expires_control(self):
        from shifts.models import ShiftOffer
        o1, o2 = self.offer(self.day), self.offer(self.day)
        r = self.pay(o1)
        self.assertEqual(r.status_code, 200, r.data)
        o1.refresh_from_db(); o2.refresh_from_db()
        self.assertEqual((o1.status, o2.status), (ShiftOffer.Status.ACCEPTED, ShiftOffer.Status.EXPIRED))

    def test_same_occurrence_cannot_be_paid_twice_in_one_selection(self):
        o1, o2 = self.offer(self.day), self.offer(self.day)
        self.assertEqual(self.pay(o1, o2).status_code, 400)
