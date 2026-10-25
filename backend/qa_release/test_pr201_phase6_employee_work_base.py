"""PR201 B14: the posted store controls shift public-holiday rates.

The legacy module filename is kept for the targeted CI regression command;
no personal work-base evidence is required for ordinary store-based shifts.
"""
from datetime import date
from types import SimpleNamespace
from django.test import SimpleTestCase
from shifts.engagement import _award_floor_for_occurrence
from shifts.pricing import _holiday_work_base, calculate_shift_rates
from workforce.award_rates import resolve_award_schedule


class ShiftStorePublicHolidayContracts(SimpleTestCase):
    def setUp(self):
        self.award = resolve_award_schedule(
            role="PHARMACIST", classification="PHARMACIST",
            employment_type="CASUAL", as_of=date(2026, 8, 28),
        )
        self.occurrence = {"date": "2026-08-28", "start_time": "09:00", "end_time": "17:00"}

    def store(self, region, state="QLD", payroll=False):
        return SimpleNamespace(
            state=state, public_holiday_region=region,
            use_chemisttasker_payroll=payroll,
            owner_adjusted_rate=None,
        )

    def floor(self, region):
        return _award_floor_for_occurrence(
            self.award, self.occurrence, self.store(region),
        )

    def test_gold_coast_show_applies_when_posting_store_is_gold_coast(self):
        result = self.floor("QLD_GOLD_COAST")
        self.assertFalse(result["review_required"], result)
        self.assertTrue(all(x["day_type"] == "public_holiday" for x in result["segments"]))

    def test_brisbane_store_is_not_affected_by_gold_coast_show(self):
        result = self.floor("QLD_BRISBANE")
        self.assertFalse(result["review_required"], result)
        self.assertTrue(all(x["day_type"] == "weekday" for x in result["segments"]))

    def test_worker_supplied_region_cannot_override_store(self):
        shift = SimpleNamespace(pharmacy=self.store("QLD_BRISBANE"))
        untrusted = {"public_holiday_work_base": {"state": "QLD", "region": "QLD_GOLD_COAST"}}
        self.assertEqual(_holiday_work_base(shift, untrusted), ("QLD", "QLD_BRISBANE"))
        shift.pharmacy = self.store("QLD_GOLD_COAST")
        self.assertEqual(_holiday_work_base(shift, untrusted), ("QLD", "QLD_GOLD_COAST"))

    def test_locked_staff_rate_cannot_accept_fake_worker_region(self):
        shift = SimpleNamespace(
            pharmacy=self.store("QLD_BRISBANE"), role_needed="ASSISTANT",
        )
        self.assertEqual(_holiday_work_base(shift, {
            "public_holiday_work_base": {"state": "NSW", "region": "NSW_WALCHA"}
        }), ("QLD", "QLD_BRISBANE"))

    def test_store_region_missing_flags_payroll_review_not_worker_evidence(self):
        result = _award_floor_for_occurrence(
            self.award, self.occurrence, self.store(""),
        )
        self.assertTrue(result["review_required"])
        self.assertIn("REGION_REQUIRED", result["review_reason"])

    def test_store_shift_pricing_uses_pharmacy_region(self):
        qld_store = SimpleNamespace(
            role_needed="ASSISTANT", pharmacy=self.store("QLD_GOLD_COAST")
        )
        brisbane_store = SimpleNamespace(
            role_needed="ASSISTANT", pharmacy=self.store("QLD_BRISBANE")
        )
        holiday_rate, holiday_details = calculate_shift_rates(
            qld_store, date(2026, 8, 28),
            __import__("datetime").time(9), __import__("datetime").time(17),
        )
        weekday_rate, weekday_details = calculate_shift_rates(
            brisbane_store, date(2026, 8, 28),
            __import__("datetime").time(9), __import__("datetime").time(17),
        )
        self.assertGreater(holiday_rate, weekday_rate)
        self.assertEqual(holiday_details["segments"][0]["day_type"], "public_holiday")
        self.assertEqual(weekday_details["segments"][0]["day_type"], "weekday")
