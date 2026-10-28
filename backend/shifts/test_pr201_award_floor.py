"""B14: accepted external TFN award floors use the same regional holiday law."""
from datetime import date
from decimal import Decimal
from types import SimpleNamespace
from django.test import SimpleTestCase

from workforce.award_rates import resolve_award_schedule
from shifts.engagement import _award_floor_for_occurrence


class RegionalAwardFloorTests(SimpleTestCase):
    def floor(self, date_string, region, start="11:00", end="13:00", state="QLD"):
        day=date.fromisoformat(date_string)
        snapshot=resolve_award_schedule(
            role="ASSISTANT",classification="LEVEL_3",
            employment_type="CASUAL",as_of=day,
        )
        pharmacy=SimpleNamespace(state=state,public_holiday_region=region)
        occurrence={"date":date_string,"start_time":start,"end_time":end}
        return _award_floor_for_occurrence(snapshot,occurrence,pharmacy)

    def test_2026_gold_coast_show_floor_not_brisbane_floor(self):
        coast=self.floor("2026-08-28","QLD_GOLD_COAST")
        brisbane=self.floor("2026-08-28","QLD_BRISBANE")
        self.assertFalse(coast["review_required"],coast)
        self.assertFalse(brisbane["review_required"],brisbane)
        self.assertEqual(Decimal(coast["rate"]),Decimal("73.63"))
        self.assertEqual(Decimal(brisbane["rate"]),Decimal("36.81"))
        self.assertTrue(all(x["day_type"]=="public_holiday" for x in coast["segments"]))
        self.assertTrue(all(x["day_type"]=="weekday" for x in brisbane["segments"]))

    def test_nsw_local_part_day_floor_changes_exactly_at_noon(self):
        floor=self.floor("2026-02-06","NSW_WALCHA",start="11:00",end="13:00",state="NSW")
        self.assertFalse(floor["review_required"],floor)
        self.assertEqual([x["day_type"] for x in floor["segments"]],["weekday","public_holiday"])
        self.assertEqual(floor["segments"][1]["start_time"],"12:00:00")

    def test_qld_christmas_eve_floor_splits_at_6pm(self):
        floor=self.floor("2027-12-24","QLD_BRISBANE",start="17:00",end="19:00")
        self.assertFalse(floor["review_required"],floor)
        self.assertEqual([x["day_type"] for x in floor["segments"]],["weekday","public_holiday"])
        self.assertEqual(floor["segments"][1]["start_time"],"18:00:00")

    def test_unconfigured_region_keeps_statewide_floor_and_flags_review(self):
        floor=self.floor("2026-08-12","")
        self.assertTrue(floor["review_required"])
        self.assertFalse(floor["payroll_blocked"])
        self.assertIsNotNone(floor["rate"])
        self.assertEqual({x["day_type"] for x in floor["segments"]},{"weekday"})
        self.assertIn("REGION_REQUIRED",floor["review_reason"])

    def test_unpublished_2027_local_show_requires_review(self):
        floor=self.floor("2027-08-27","QLD_GOLD_COAST")
        self.assertTrue(floor["review_required"])
        self.assertTrue(floor["payroll_blocked"])
        self.assertIn("LOCAL_DECLARATION_PENDING",floor["review_reason"])
