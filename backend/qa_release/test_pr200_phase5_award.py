"""B14 standalone frozen-main shift guide and 2027 holiday RED contracts.

No database, payroll settlements, invoices, or provider charges. The current
2026 Fair Work Pharmacy Industry Award adult casual rates are the reference.
"""
from datetime import date
from decimal import Decimal

from django.test import SimpleTestCase
from workforce.award_rates import CASUAL_WEEKDAY
from shifts.pricing_data import award_rates
from shifts.pricing import is_public_holiday


class Phase5AwardDateSourceAudit(SimpleTestCase):
    def test_b14_workforce_2026_casual_pharmacist_positive(self):
        self.assertEqual(Decimal(CASUAL_WEEKDAY["PHARMACIST"][0]), Decimal("52.18"))

    def test_b14_shift_guide_2026_casual_pharmacist_minimum(self):
        guide = award_rates()["PHARMACIST"]["PHARMACIST"]["casual"]["weekday"]
        self.assertGreaterEqual(Decimal(str(guide)), Decimal("52.18"))

    def test_b14_shift_guide_2026_casual_assistant_minimum(self):
        guide = award_rates()["ASSISTANT"]["LEVEL_1"]["casual"]["weekday"]
        self.assertGreaterEqual(Decimal(str(guide)), Decimal("34.76"))

    def test_b14_queensland_2027_australia_day(self):
        self.assertTrue(is_public_holiday(date(2027, 1, 26), "QLD"))

    def test_b14_queensland_2027_nonholiday_positive(self):
        self.assertFalse(is_public_holiday(date(2027, 1, 27), "QLD"))
