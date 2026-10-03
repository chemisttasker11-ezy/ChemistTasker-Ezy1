"""Pricing equivalence: a fingerprint of calculate_shift_rates over a representative matrix.

Covers award roles (casual first-level rates, owner bonus), pharmacist shifts priced from pharmacy rates and from the
pharmacist's own rate preference, three states, weekday / Saturday / Sunday / public holiday, and early-morning,
daytime, late-night and overnight times. Any change to the award data, the holiday data or the calculation changes the
fingerprint, so data or loader refactors must leave it untouched; a deliberate rate update changes it in the same
commit as the data.
"""
import hashlib
import json
from datetime import date, time
from decimal import Decimal
from types import SimpleNamespace

from django.test import SimpleTestCase

from shifts.pricing import calculate_shift_rates

STATES = ("NSW", "Victoria", "wa")
DATES = (date(2026, 1, 27), date(2026, 1, 31), date(2026, 2, 1), date(2026, 1, 26), date(2026, 3, 9))
TIMES = ((time(6, 0), time(14, 0)), (time(9, 0), time(17, 0)), (time(18, 0), time(23, 0)), (time(22, 0), time(6, 0)))
PHARMACY_RATES = dict(
    rate_weekday=Decimal("60.00"), rate_saturday=Decimal("70.00"), rate_sunday=Decimal("80.00"),
    rate_public_holiday=Decimal("95.00"), rate_early_morning=Decimal("65.00"), rate_late_night=Decimal("75.00"),
)
PREFERENCE = {
    "weekday": "61", "saturday": "71", "sunday": "81", "public_holiday": "96", "early_morning": "66",
    "late_night": "76", "early_morning_same_as_day": False, "late_night_same_as_day": True,
}


def pricing_matrix():
    shifts = []
    for state in STATES:
        pharmacy = SimpleNamespace(state=state, **PHARMACY_RATES)
        for role in ("ASSISTANT", "TECHNICIAN", "STUDENT", "INTERN"):
            for bonus in (None, Decimal("2.50")):
                shifts.append(SimpleNamespace(role_needed=role, pharmacy=pharmacy, owner_adjusted_rate=bonus,
                                              rate_preference={}))
        shifts.append(SimpleNamespace(role_needed="PHARMACIST", pharmacy=pharmacy, rate_type="FLEXIBLE",
                                      rate_preference={}))
        shifts.append(SimpleNamespace(role_needed="PHARMACIST", pharmacy=pharmacy, rate_type="PHARMACIST_PROVIDED",
                                      rate_preference=PREFERENCE))
    results = []
    for shift in shifts:
        for slot_date in DATES:
            for start, end in TIMES:
                rate, meta = calculate_shift_rates(shift, slot_date, start, end)
                results.append([
                    shift.role_needed, getattr(shift, "rate_type", None), str(shift.owner_adjusted_rate)
                    if hasattr(shift, "owner_adjusted_rate") else None, shift.pharmacy.state, str(slot_date),
                    str(start), str(end), str(rate), meta,
                ])
    return results


def fingerprint(results):
    return hashlib.sha256(json.dumps(results, sort_keys=True, default=str).encode("utf-8")).hexdigest()


class PricingEquivalenceTests(SimpleTestCase):
    def test_matrix_fingerprint_is_unchanged(self):
        results = pricing_matrix()
        self.assertEqual(len(results), 3 * 10 * 5 * 4)
        self.assertEqual(fingerprint(results), EXPECTED_FINGERPRINT)

    def test_representative_rates(self):
        assistant = SimpleNamespace(role_needed="ASSISTANT", pharmacy=SimpleNamespace(state="NSW"),
                                    owner_adjusted_rate=None, rate_preference={})
        rates = {
            day: str(calculate_shift_rates(assistant, day, time(9, 0), time(17, 0))[0]) for day in DATES[:4]
        }
        self.assertEqual(rates, EXPECTED_ASSISTANT_DAYTIME)


EXPECTED_FINGERPRINT = "e28fcfd3cd9c2b7ad17e5d448555841721d5d99c04009e05341a47376a2bef79"
EXPECTED_ASSISTANT_DAYTIME = {  # casual first-level assistant, 09:00-17:00, NSW
    date(2026, 1, 27): "33.19",  # weekday
    date(2026, 1, 31): "39.83",  # Saturday
    date(2026, 2, 1): "46.46",  # Sunday
    date(2026, 1, 26): "66.38",  # public holiday (Australia Day)
}


class PricingDataLoaderTests(SimpleTestCase):
    def tearDown(self):
        from shifts import pricing_data

        pricing_data.reset_cache()

    def test_data_lives_in_the_shifts_app_and_loads_once(self):
        from unittest import mock

        from shifts import pricing_data

        self.assertEqual(pricing_data.DATA_DIR.parent.name, "shifts")
        pricing_data.reset_cache()
        with mock.patch.object(pricing_data, "_read_json", wraps=pricing_data._read_json) as read:
            pricing_data.award_rates()
            pricing_data.award_rates()
            pricing_data.public_holidays()
        self.assertEqual(read.call_count, 2)

    def test_missing_or_corrupt_files_raise_a_named_error(self):
        import tempfile
        from pathlib import Path
        from unittest import mock

        from shifts import pricing_data

        with tempfile.TemporaryDirectory() as folder:
            corrupt = Path(folder) / "award_rates_casual_first_level.json"
            corrupt.write_text("{not json", encoding="utf-8")
            with mock.patch.object(pricing_data, "AWARD_RATES_FILE", corrupt):
                pricing_data.reset_cache()
                with self.assertRaisesRegex(pricing_data.PricingDataError, "award_rates_casual_first_level.json"):
                    pricing_data.award_rates()
            missing = Path(folder) / "public_holidays.json"
            with mock.patch.object(pricing_data, "PUBLIC_HOLIDAYS_FILE", missing):
                pricing_data.reset_cache()
                with self.assertRaisesRegex(pricing_data.PricingDataError, "public_holidays.json"):
                    pricing_data.public_holidays()

    def test_incomplete_award_table_is_rejected(self):
        import json
        import tempfile
        from copy import deepcopy
        from pathlib import Path
        from unittest import mock

        from shifts import pricing_data

        source = json.loads(pricing_data.AWARD_RATES_FILE.read_text(encoding="utf-8"))
        missing = deepcopy(source)
        del missing["ASSISTANT"]["LEVEL_1"]["casual"]["sunday"]
        with tempfile.TemporaryDirectory() as folder:
            bad = Path(folder) / "award_rates_casual_first_level.json"
            bad.write_text(json.dumps(missing), encoding="utf-8")
            with mock.patch.object(pricing_data, "AWARD_RATES_FILE", bad):
                pricing_data.reset_cache()
                with self.assertRaisesRegex(pricing_data.PricingDataError, "ASSISTANT/LEVEL_1.*sunday"):
                    pricing_data.award_rates()

    def test_nonnumeric_award_rate_is_rejected(self):
        import json
        import tempfile
        from copy import deepcopy
        from pathlib import Path
        from unittest import mock

        from shifts import pricing_data

        source = json.loads(pricing_data.AWARD_RATES_FILE.read_text(encoding="utf-8"))
        invalid = deepcopy(source)
        invalid["INTERN"]["FIRST_HALF"]["casual"]["early_morning"]["weekday"] = "not-a-rate"
        with tempfile.TemporaryDirectory() as folder:
            bad = Path(folder) / "award_rates_casual_first_level.json"
            bad.write_text(json.dumps(invalid), encoding="utf-8")
            with mock.patch.object(pricing_data, "AWARD_RATES_FILE", bad):
                pricing_data.reset_cache()
                with self.assertRaisesRegex(pricing_data.PricingDataError, "INTERN/FIRST_HALF.*early_morning.*weekday"):
                    pricing_data.award_rates()

    def test_required_award_role_is_rejected_when_missing(self):
        import json
        import tempfile
        from pathlib import Path
        from unittest import mock

        from shifts import pricing_data

        data = json.loads(pricing_data.AWARD_RATES_FILE.read_text(encoding="utf-8"))
        del data["STUDENT"]
        with tempfile.TemporaryDirectory() as folder:
            bad = Path(folder) / "award_rates_casual_first_level.json"
            bad.write_text(json.dumps(data), encoding="utf-8")
            with mock.patch.object(pricing_data, "AWARD_RATES_FILE", bad):
                pricing_data.reset_cache()
                with self.assertRaisesRegex(pricing_data.PricingDataError, "STUDENT/YEAR_1"):
                    pricing_data.award_rates()

    def test_public_holidays_require_all_states_and_canonical_iso_dates(self):
        import json
        import tempfile
        from copy import deepcopy
        from pathlib import Path
        from unittest import mock

        from shifts import pricing_data

        source = json.loads(pricing_data.PUBLIC_HOLIDAYS_FILE.read_text(encoding="utf-8"))
        with tempfile.TemporaryDirectory() as folder:
            bad = Path(folder) / "public_holidays.json"

            missing_state = deepcopy(source)
            del missing_state["QLD"]
            bad.write_text(json.dumps(missing_state), encoding="utf-8")
            with mock.patch.object(pricing_data, "PUBLIC_HOLIDAYS_FILE", bad):
                pricing_data.reset_cache()
                with self.assertRaisesRegex(pricing_data.PricingDataError, "QLD"):
                    pricing_data.public_holidays()

            invalid_date = deepcopy(source)
            invalid_date["NSW"][0] = "2026/01/01"
            bad.write_text(json.dumps(invalid_date), encoding="utf-8")
            with mock.patch.object(pricing_data, "PUBLIC_HOLIDAYS_FILE", bad):
                pricing_data.reset_cache()
                with self.assertRaisesRegex(pricing_data.PricingDataError, "NSW.*2026/01/01"):
                    pricing_data.public_holidays()

    def test_malformed_structure_is_rejected(self):
        import tempfile
        from pathlib import Path
        from unittest import mock

        from shifts import pricing_data

        with tempfile.TemporaryDirectory() as folder:
            bad = Path(folder) / "award_rates_casual_first_level.json"
            bad.write_text('{"ASSISTANT": {"LEVEL_1": {"permanent": {}}}}', encoding="utf-8")
            with mock.patch.object(pricing_data, "AWARD_RATES_FILE", bad):
                pricing_data.reset_cache()
                with self.assertRaisesRegex(pricing_data.PricingDataError, "no casual rates"):
                    pricing_data.award_rates()
