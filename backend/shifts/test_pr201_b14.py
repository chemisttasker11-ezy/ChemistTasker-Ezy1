"""B14: date-effective Pharmacy Award 2026 and Queensland 2027 holiday contracts."""
from datetime import date, time
from decimal import Decimal
from types import SimpleNamespace
from django.test import SimpleTestCase
from shifts.pricing import calculate_shift_rates, get_day_type, is_public_holiday
from shifts.pricing_data import award_rates, reset_cache

class ShiftAwardSourceContracts(SimpleTestCase):
    def tearDown(self):
        reset_cache()

    def rate(self, day, start=time(9), end=time(17), role="ASSISTANT", state="QLD"):
        shift = SimpleNamespace(
            role_needed=role, pharmacy=SimpleNamespace(state=state), owner_adjusted_rate=None,
        )
        return calculate_shift_rates(shift, day, start, end)

    def test_july_2026_casual_minimum_uses_workforce_canonical(self):
        before = self.rate(date(2026, 6, 30))
        after = self.rate(date(2026, 7, 1))
        self.assertEqual(before[0], Decimal("33.19"))
        self.assertEqual(after[0], Decimal("34.76"))
        self.assertEqual(award_rates(date(2026, 7, 1))["PHARMACIST"]["PHARMACIST"]["casual"]["weekday"], "52.18")
        self.assertEqual(award_rates(date(2026, 7, 1))["TECHNICIAN"]["LEVEL_1"]["casual"]["weekday"], "36.81")

    def test_2027_qld_australia_day_is_public_holiday(self):
        self.assertTrue(is_public_holiday(date(2027, 1, 26), "QLD"))
        self.assertEqual(get_day_type(date(2027, 1, 26), "Queensland"), "public_holiday")
        self.assertEqual(self.rate(date(2027, 1, 26))[0], Decimal("69.53"))

    def test_award_sat_evening_and_21_boundary(self):
        before, _ = self.rate(date(2026, 10, 31), time(18), time(19))
        after, _ = self.rate(date(2026, 10, 31), time(21), time(22))
        self.assertEqual(before, Decimal("48.67"))
        self.assertEqual(after, Decimal("55.62"))

    def test_qld_christmas_eve_not_full_day_public_holiday(self):
        self.assertFalse(is_public_holiday(date(2027, 12, 24), "QLD", at_time=time(17)))
        self.assertTrue(is_public_holiday(date(2027, 12, 24), "QLD", at_time=time(18)))
        self.assertEqual(self.rate(date(2027, 12, 24), time(17), time(18))[0], Decimal("34.76"))
        self.assertEqual(self.rate(date(2027, 12, 24), time(18), time(19))[0], Decimal("69.53"))
