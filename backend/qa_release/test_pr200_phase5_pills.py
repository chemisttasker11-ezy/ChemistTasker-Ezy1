"""Targeted B10 reward ledger double-unit integrity audit; frozen main."""
from unittest.mock import patch
from django.test import TestCase
from client_profile.characterization_support import make_owner_with_pharmacy
from shifts.models import Shift
from rewards.models import PillRewardRule, PillLedgerEntry
from rewards.services import spend_pills_for_shift_post, get_pill_balance


class Phase5PillsSpend(TestCase):
    def test_b10_two_distinct_paid_offer_units_require_two_debits(self):
        owner, pharmacy = make_owner_with_pharmacy("P5 Two Unit Shift")
        shift = Shift.objects.create(
            pharmacy=pharmacy, created_by=owner, role_needed="PHARMACIST",
            employment_type="LOCUM",
        )
        rule = PillRewardRule.objects.create(
            code="p5-shift-cost", name="Cost", event_type="SPEND",
            pill_amount=10, is_active=True,
        )
        PillLedgerEntry.objects.create(
            user=owner, entry_type=PillLedgerEntry.EntryType.EARN,
            source=PillLedgerEntry.Source.MANUAL, delta=100,
            balance_after=100, idempotency_key="p5-100-credit",
        )
        self.assertEqual(get_pill_balance(owner), 100)
        with patch("rewards.services.get_current_rule", return_value=rule):
            first = spend_pills_for_shift_post(user=owner, shift=shift)
            self.assertEqual(first.delta, -10)
            self.assertEqual(get_pill_balance(owner), 90)
            second = spend_pills_for_shift_post(user=owner, shift=shift)
        self.assertNotEqual(
            first.pk, second.pk,
            "Two independent paid slot units must create two independent debits.",
        )
        self.assertEqual(
            PillLedgerEntry.objects.filter(
                user=owner, source=PillLedgerEntry.Source.SHIFT_POST, shift=shift,
            ).count(), 2,
        )
        self.assertEqual(get_pill_balance(owner), 80)
