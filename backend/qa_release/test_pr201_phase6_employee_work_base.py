"""Employee-specific holiday entitlement cannot be inferred from shift pharmacy."""
from datetime import date
from django.core.exceptions import ValidationError
from django.test import SimpleTestCase
from shifts.holidays import confirmed_employee_work_base
from shifts.engagement import _award_floor_for_occurrence
from workforce.award_rates import resolve_award_schedule
from types import SimpleNamespace

class EmployeeBaseHolidayTests(SimpleTestCase):
    def setUp(self):
        self.pharmacy=SimpleNamespace(state="QLD",public_holiday_region="QLD_BRISBANE")
        self.award=resolve_award_schedule(role="PHARMACIST",classification="PHARMACIST",employment_type="CASUAL",as_of=date(2026,8,28))
        self.occ={"date":"2026-08-28","start_time":"09:00","end_time":"17:00"}

    def test_actual_gold_coast_employee_base_overrides_brisbane_shift_pharmacy(self):
        base=confirmed_employee_work_base({"state":"QLD","region":"QLD_GOLD_COAST","confirmed":True,"source":"Employee confirmation"})
        floor=_award_floor_for_occurrence(self.award,self.occ,self.pharmacy,work_base=base)
        self.assertFalse(floor["review_required"])
        self.assertTrue(all(s["day_type"]=="public_holiday" for s in floor["segments"]))

    def test_same_shift_pharmacy_base_brisbane_has_no_gold_coast_show(self):
        base=confirmed_employee_work_base({"state":"QLD","region":"QLD_BRISBANE","confirmed":True,"source":"Signed employment contract"})
        floor=_award_floor_for_occurrence(self.award,self.occ,self.pharmacy,work_base=base)
        self.assertFalse(floor["review_required"])
        self.assertTrue(all(s["day_type"]=="weekday" for s in floor["segments"]))

    def test_missing_worker_confirmation_fails_closed(self):
        for payload in ({"state":"QLD","region":"QLD_GOLD_COAST","source":"Verbal"}, {"state":"QLD","confirmed":True,"source":"Verbal"}, {"state":"QLD","region":"NSW_WALCHA","confirmed":True,"source":"Verbal"}):
            with self.subTest(payload=payload), self.assertRaises(ValidationError):
                confirmed_employee_work_base(payload)
