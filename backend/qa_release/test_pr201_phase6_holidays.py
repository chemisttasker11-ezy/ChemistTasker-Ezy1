"""Phase 6 B14: one holiday authority for state, district, part-day and pricing."""
from datetime import date, time
from decimal import Decimal
from types import SimpleNamespace

from django.test import SimpleTestCase
from shifts.holidays import (
    full_day_public_holidays, holiday_calendar_status, part_day_public_holidays,
    resolve_public_holiday, holiday_boundaries,
)
from shifts.pricing import calculate_shift_rates
from shifts.pricing_data import PricingDataError

class PublicHolidayWorkBaseContracts(SimpleTestCase):
    def classify(self, work_date, state, region="", at=time(10)):
        return resolve_public_holiday(work_date, state, region, at)

    def rate(self, work_date, region, start=time(9), end=time(17), state="QLD", payroll=False):
        shift = SimpleNamespace(
            role_needed="ASSISTANT",
            pharmacy=SimpleNamespace(
                state=state, public_holiday_region=region,
                owner_adjusted_rate=None, use_chemisttasker_payroll=payroll,
            ),
        )
        return calculate_shift_rates(shift, work_date, start, end)

    def test_2026_ekka_applies_to_brisbane_not_gold_coast(self):
        d = date(2026, 8, 12)
        brisbane = self.classify(d, "QLD", "QLD_BRISBANE")
        gold_coast = self.classify(d, "QLD", "QLD_GOLD_COAST")
        self.assertTrue(brisbane.is_public_holiday)
        self.assertEqual(brisbane.scope, "REGIONAL")
        self.assertFalse(gold_coast.is_public_holiday)
        self.assertEqual(brisbane.status, "VERIFIED")
        self.assertEqual(self.rate(d, "QLD_BRISBANE")[0], Decimal("69.53"))
        self.assertEqual(self.rate(d, "QLD_GOLD_COAST")[0], Decimal("34.76"))

    def test_gold_coast_show_is_not_brisbane_or_cairns(self):
        d = date(2026, 8, 28)
        self.assertTrue(self.classify(d, "QLD", "QLD_GOLD_COAST").is_public_holiday)
        self.assertFalse(self.classify(d, "QLD", "QLD_BRISBANE").is_public_holiday)
        self.assertFalse(self.classify(d, "QLD", "QLD_CAIRNS").is_public_holiday)

    def test_cairns_show_is_not_brisbane_or_gold_coast(self):
        d = date(2026, 7, 17)
        self.assertTrue(self.classify(d, "QLD", "QLD_CAIRNS").is_public_holiday)
        self.assertFalse(self.classify(d, "QLD", "QLD_BRISBANE").is_public_holiday)
        self.assertFalse(self.classify(d, "QLD", "QLD_GOLD_COAST").is_public_holiday)

    def test_wa_regional_kings_birthday_replaces_statewide(self):
        karratha = "WA_KARRATHA"
        self.assertTrue(self.classify(date(2026, 8, 3), "WA", karratha).is_public_holiday)
        self.assertFalse(self.classify(date(2026, 9, 28), "WA", karratha).is_public_holiday)
        self.assertTrue(self.classify(date(2026, 9, 28), "WA", "").is_public_holiday)
        self.assertIn("2026-08-03", full_day_public_holidays("WA", karratha))
        self.assertNotIn("2026-09-28", full_day_public_holidays("WA", karratha))

    def test_nsw_part_day_with_no_ph_before_noon(self):
        d=date(2026, 2, 6)
        self.assertFalse(self.classify(d, "NSW", "NSW_WALCHA", time(11)).is_public_holiday)
        mid=self.classify(d, "NSW", "NSW_WALCHA", time(12))
        self.assertTrue(mid.is_public_holiday)
        self.assertEqual(mid.scope, "REGIONAL_PART_DAY")
        self.assertFalse(self.classify(d, "NSW", "NSW_WALCHA", time(18)).is_public_holiday)
        windows=part_day_public_holidays("NSW","NSW_WALCHA")
        self.assertTrue(any(w["date"]=="2026-02-06" and w["start"]=="12:00" for w in windows))
        self.assertIn(time(12),holiday_boundaries(d,"NSW","NSW_WALCHA"))

    def test_nsw_walcha_shift_splits_at_noon(self):
        rate, meta=self.rate(date(2026, 2, 6),"NSW_WALCHA",time(11),time(13),state="NSW")
        self.assertEqual(len(meta["segments"]),2)
        self.assertEqual([x["day_type"] for x in meta["segments"]],["weekday","public_holiday"])
        self.assertEqual([x["rate"] for x in meta["segments"]],["33.19","66.38"])

    def test_qld_christmas_eve_only_from_6pm_and_over_midnight(self):
        d=date(2027,12,24)
        self.assertFalse(self.classify(d,"QLD","QLD_BRISBANE",time(17)).is_public_holiday)
        self.assertTrue(self.classify(d,"QLD","QLD_BRISBANE",time(18)).is_public_holiday)
        hourly, meta=self.rate(d,"QLD_BRISBANE",time(17),time(19))
        self.assertEqual(len(meta["segments"]),2)
        self.assertEqual([s["day_type"] for s in meta["segments"]],["weekday","public_holiday"])
        _, overnight=self.rate(d,"QLD_BRISBANE",time(23),time(2))
        self.assertEqual(set(x["date"] for x in overnight["segments"]),{"2027-12-24","2027-12-25"})
        self.assertTrue(all(x["day_type"]=="public_holiday" for x in overnight["segments"]))

    def test_pending_2027_local_show_and_unconfigured_region_are_not_certified(self):
        pending=self.classify(date(2027,8,27),"QLD","QLD_GOLD_COAST")
        self.assertEqual(pending.status,"LOCAL_DECLARATION_PENDING")
        self.assertTrue(pending.needs_review)
        missing=self.classify(date(2027,8,27),"QLD","")
        self.assertEqual(missing.status,"REGION_REQUIRED")
        self.assertTrue(missing.needs_review)
        self.assertEqual(holiday_calendar_status("QLD","QLD_GOLD_COAST")["pendingYears"],[2027])

    def test_invalid_region_and_uncertified_year_cannot_be_claimed_verified(self):
        with self.assertRaises(PricingDataError):
            self.classify(date(2026,8,28),"QLD","NSW_WALCHA")
        self.assertEqual(self.classify(date(2028,8,27),"QLD","QLD_GOLD_COAST").status,"YEAR_NOT_CERTIFIED")

    def test_missing_region_payroll_preview_refuses_guess(self):
        rate, reason=self.rate(date(2026,8,12),"",payroll=True)
        self.assertEqual(rate,Decimal("0.00"))
        self.assertIn("REGION_REQUIRED",reason["error"])

    def test_victorian_melbourne_cup_replacement_not_double_counted(self):
        region="VIC_WARRNAMBOOL"
        self.assertTrue(self.classify(date(2026,5,7),"VIC",region).is_public_holiday)
        self.assertFalse(self.classify(date(2026,11,3),"VIC",region).is_public_holiday)
        self.assertTrue(self.classify(date(2026,11,3),"VIC","").is_public_holiday)
        self.assertEqual(self.classify(date(2027,11,2),"VIC",region).status,"LOCAL_DECLARATION_PENDING")

    def test_nsw_2027_part_day_declared_places_not_other_lga(self):
        self.assertTrue(self.classify(date(2027,3,19),"NSW","NSW_ALBURY",time(13)).is_public_holiday)
        self.assertFalse(self.classify(date(2027,3,19),"NSW","NSW_ALBURY",time(11)).is_public_holiday)
        self.assertFalse(self.classify(date(2027,3,19),"NSW","NSW_WALCHA",time(13)).is_public_holiday)

    def test_2026_qld_townsville_and_2027_pending_status(self):
        self.assertTrue(self.classify(date(2026,7,6),"QLD","QLD_TOWNSVILLE").is_public_holiday)
        self.assertFalse(self.classify(date(2026,7,6),"QLD","QLD_BRISBANE").is_public_holiday)
        self.assertEqual(self.classify(date(2027,7,6),"QLD","QLD_TOWNSVILLE").status,"LOCAL_DECLARATION_PENDING")

    def test_all_eight_states_have_both_years_and_kings_birthday_differs(self):
        from shifts.pricing_data import public_holidays
        data=public_holidays()
        self.assertEqual(set(data),{"ACT","NSW","NT","QLD","SA","TAS","VIC","WA"})
        for state, dates in data.items():
            self.assertEqual({int(d[:4]) for d in dates},{2026,2027},state)
        self.assertTrue(self.classify(date(2026,10,5),"QLD","QLD_BRISBANE").is_public_holiday)
        self.assertTrue(self.classify(date(2026,6,8),"NSW","").is_public_holiday)
        self.assertTrue(self.classify(date(2026,9,28),"WA","").is_public_holiday)
