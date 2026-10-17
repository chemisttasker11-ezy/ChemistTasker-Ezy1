from datetime import datetime, timedelta, timezone
from decimal import Decimal
from django.test import SimpleTestCase
from shifts.cancellation_policy import estimate_owner_cancellation_fee, owner_cancellation_percentage


class OwnerCancellationPolicyPreviewTests(SimpleTestCase):
    def setUp(self):
        self.now = datetime(2026, 10, 17, 12, tzinfo=timezone.utc)

    def test_owner_approved_rate_bands_and_boundaries(self):
        cases = [
            (timedelta(days=9), "0"), (timedelta(days=7), "0"),
            (timedelta(days=5), "0"), (timedelta(hours=72), "0"),
            (timedelta(hours=71), "10"), (timedelta(hours=24), "10"),
            (timedelta(hours=23), "15"), (timedelta(hours=12), "15"),
            (timedelta(hours=11), "20"), (timedelta(hours=2), "20"),
            (timedelta(hours=1), "25"), (timedelta(seconds=1), "25"),
            (timedelta(0), "30"), (-timedelta(hours=1), "30"),
        ]
        for lead, rate in cases:
            with self.subTest(lead=str(lead)):
                self.assertEqual(owner_cancellation_percentage(
                    start_at=self.now + lead, cancelled_at=self.now,
                ), Decimal(rate))

    def test_preview_uses_each_affected_occurrence_and_does_not_charge(self):
        result = estimate_owner_cancellation_fee(
            cancelled_at=self.now, affected_occurrences=[
                {"start_at": self.now + timedelta(hours=8), "wages": Decimal("320")},
                {"start_at": self.now + timedelta(hours=36), "wages": Decimal("400")},
            ],
        )
        self.assertTrue(result["preview_only"])
        self.assertEqual(result["total"], Decimal("104.00"))
        self.assertEqual([row["percentage"] for row in result["occurrences"]],
                         [Decimal("20"), Decimal("10")])

    def test_rejects_invalid_negative_wage(self):
        with self.assertRaises(ValueError):
            estimate_owner_cancellation_fee(
                cancelled_at=self.now,
                affected_occurrences=[{"start_at": self.now + timedelta(hours=1), "wages": "-50"}],
            )

    def test_rejects_naive_timestamps(self):
        with self.assertRaises(ValueError):
            estimate_owner_cancellation_fee(
                cancelled_at=self.now.replace(tzinfo=None),
                affected_occurrences=[{"start_at": self.now + timedelta(hours=1), "wages": "100"}],
            )
