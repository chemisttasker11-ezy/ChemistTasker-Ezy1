"""B14 narrow release acceptance: actual MA000012 1 July 2026 amounts.

Cross-checked against Fair Work Commission Pharmacy Industry Award 2020
Schedule B.1/B.2 (consolidated 1 July 2026). These tests intentionally do
not add or change 2026-2027 public holiday calendars.
https://awards.fairwork.gov.au/MA000012.html
"""
from datetime import date, time
from decimal import Decimal
from types import SimpleNamespace

from django.test import SimpleTestCase
from shifts.engagement import _award_floor_for_occurrence
from shifts.pricing import calculate_shift_rates, get_locked_rate_for_slot
from workforce.award_rates import resolve_award_schedule


class VerifiedPharmacyAwardCalculations(SimpleTestCase):
    def test_money_half_cent_rounds_up_in_preview_posted_staff_and_floor(self):
        store = self.store("QLD_BRISBANE")
        store.rate_weekday = Decimal("60.005")
        shift = SimpleNamespace(role_needed="PHARMACIST", pharmacy=store, rate_type="FIXED")
        slot = SimpleNamespace(date=date(2026, 9, 21), start_time=time(9), end_time=time(17), rate=Decimal("60.005"))
        preview, _ = calculate_shift_rates(shift, slot.date, slot.start_time, slot.end_time)
        posted, _ = get_locked_rate_for_slot(slot, shift, None)
        staff, _ = get_locked_rate_for_slot(slot, shift, None, staff_terms={
            "settlement_channel": "PAYROLL", "rates": {"weekday": "60.005"},
        })
        award = self.award("PHARMACIST", "PHARMACIST", as_of=slot.date)
        award["schedule"]["weekday"]["daytime_08_19"] = "60.005"
        floor = _award_floor_for_occurrence(award, {
            "date": str(slot.date), "start_time": "09:00", "end_time": "17:00",
        }, store)
        self.assertEqual((preview, posted, staff), (Decimal("60.01"),) * 3)
        self.assertEqual(floor["rate"], "60.01")

    def award(self, role, classification, employment="CASUAL", as_of=date(2026, 8, 28)):
        return resolve_award_schedule(
            role=role, classification=classification,
            employment_type=employment, as_of=as_of,
            date_of_birth=date(1990, 1, 1),
        )

    def store(self, region="QLD_GOLD_COAST", state="QLD"):
        return SimpleNamespace(
            state=state, public_holiday_region=region,
            use_chemisttasker_payroll=True,
            owner_adjusted_rate=None,
        )

    def test_fair_work_published_2026_full_time_vs_casual_public_holiday_rates(self):
        pharmacist = self.award("PHARMACIST", "PHARMACIST", "CASUAL")
        permanent = self.award("PHARMACIST", "PHARMACIST", "FULL_TIME")
        assistant = self.award("ASSISTANT", "LEVEL_3")
        intern = self.award("INTERN", "FIRST_HALF")
        self.assertEqual(pharmacist["schedule"]["weekday"]["daytime_08_19"], "52.18")
        self.assertEqual(pharmacist["schedule"]["saturday"]["evening_18_21"], "73.05")
        self.assertEqual(pharmacist["schedule"]["saturday"]["late_21_24"], "83.48")
        self.assertEqual(pharmacist["schedule"]["public_holiday"]["all_day"], "104.35")
        self.assertEqual(permanent["schedule"]["public_holiday"]["all_day"], "93.92")
        self.assertEqual(assistant["schedule"]["public_holiday"]["all_day"], "73.63")
        self.assertEqual(intern["schedule"]["public_holiday"]["all_day"], "84.98")
        self.assertEqual(pharmacist["schedule"]["overtime"]["public_holiday_all_day"], "104.35")

    def test_store_show_day_changes_actual_tfn_pharmacist_floor(self):
        award = self.award("PHARMACIST", "PHARMACIST")
        occurrence = {"date": "2026-08-28", "start_time": "09:00", "end_time": "17:00"}
        coast = _award_floor_for_occurrence(award, occurrence, self.store())
        brisbane = _award_floor_for_occurrence(
            award, occurrence, self.store("QLD_BRISBANE"),
        )
        self.assertFalse(coast["review_required"], coast)
        self.assertFalse(brisbane["review_required"], brisbane)
        self.assertEqual(coast["rate"], "104.35")
        self.assertEqual(brisbane["rate"], "52.18")
        self.assertEqual(coast["segments"][0]["day_type"], "public_holiday")
        self.assertEqual(brisbane["segments"][0]["day_type"], "weekday")

    def test_technician_casual_pricing_uses_published_level3_not_assistant1(self):
        shift = SimpleNamespace(
            role_needed="TECHNICIAN", pharmacy=self.store("QLD_BRISBANE"),
            owner_adjusted_rate=Decimal("0"),
        )
        actual, details = calculate_shift_rates(
            shift, date(2026, 8, 28), time(9), time(17),
        )
        self.assertEqual(actual, Decimal("36.81"))
        self.assertEqual(details["segments"][0]["rate"], "36.81")

    def test_saturday_evening_and_late_band_exact_fair_work_minima(self):
        award = self.award(
            "PHARMACIST", "PHARMACIST", as_of=date(2026, 10, 31),
        )
        for start, end, expected in (("18:00", "19:00", "73.05"), ("21:00", "22:00", "83.48")):
            result = _award_floor_for_occurrence(
                award, {"date": "2026-10-31", "start_time": start, "end_time": end},
                self.store("QLD_BRISBANE"),
            )
            self.assertEqual(result["rate"], expected, result)

    def test_staff_payroll_uses_public_holiday_not_ordinary_evening_penalty(self):
        shift = SimpleNamespace(
            role_needed="ASSISTANT", pharmacy=self.store("QLD_BRISBANE"),
        )
        slot = SimpleNamespace(
            date=date(2027, 12, 24), start_time=time(17), end_time=time(19),
        )
        rates = {
            "weekday": "28.00", "saturday": "40.00",
            "public_holiday": "63.00",
            "early_morning": "36.00", "late_night": "45.00",
        }
        result, detail = get_locked_rate_for_slot(
            slot, shift, user=None, staff_terms={
                "settlement_channel": "PAYROLL", "rates": rates,
            },
        )
        self.assertEqual(result, Decimal("45.50"))
        self.assertEqual([x["day_type"] for x in detail["segments"]], [
            "weekday", "public_holiday",
        ])
        self.assertEqual([x["rate"] for x in detail["segments"]], ["28.00", "63.00"])

    def test_worker_supplied_region_never_overrides_shift_store(self):
        shift = SimpleNamespace(
            role_needed="ASSISTANT", pharmacy=self.store("QLD_BRISBANE"),
        )
        slot = SimpleNamespace(
            date=date(2026, 8, 28), start_time=time(9), end_time=time(17),
        )
        rate, detail = get_locked_rate_for_slot(slot, shift, user=None, staff_terms={
            "settlement_channel": "PAYROLL",
            "public_holiday_work_base": {
                "state": "QLD", "region": "QLD_GOLD_COAST", "confirmed": True,
            },
            "rates": {
                "weekday": "29.45", "public_holiday": "66.26",
                "saturday": "36.81", "sunday": "44.18",
            },
        })
        self.assertEqual(rate, Decimal("29.45"))
        self.assertEqual(detail["segments"][0]["day_type"], "weekday")
