from django.core.exceptions import ValidationError
from django.test import SimpleTestCase

from .award_rates import classification_options, resolve_award_schedule
from .employment_terms import correspondence_profile, normalise_part_time_pattern


class PharmacyAwardResolverTests(SimpleTestCase):
    def test_full_time_pharmacist_schedule_matches_published_adult_schedule(self):
        result = resolve_award_schedule(
            role="PHARMACIST",
            classification="PHARMACIST",
            employment_type="FULL_TIME",
        )
        self.assertEqual(result["minimum_hourly_rate"], "41.74")
        self.assertEqual(result["rate_weekday"], "41.74")
        self.assertEqual(result["rate_saturday"], "52.18")
        self.assertEqual(result["rate_sunday"], "62.61")
        self.assertEqual(result["rate_public_holiday"], "93.92")
        self.assertEqual(result["schedule"]["weekday"]["early_07_08"], "62.61")
        self.assertEqual(result["schedule"]["weekday"]["evening_19_21"], "52.18")
        self.assertEqual(result["schedule"]["weekday"]["late_21_24"], "62.61")
        self.assertEqual(result["schedule"]["saturday"]["late_21_24"], "73.05")
        self.assertEqual(result["schedule"]["sunday"]["outside_07_21"], "83.48")
        self.assertEqual(result["schedule"]["overtime"]["public_holiday_all_day"], "104.35")

    def test_casual_pharmacist_schedule_matches_published_casual_penalties(self):
        result = resolve_award_schedule(
            role="PHARMACIST",
            classification="PHARMACIST",
            employment_type="CASUAL",
        )
        self.assertEqual(result["rate_weekday"], "52.18")
        self.assertEqual(result["rate_saturday"], "62.61")
        self.assertEqual(result["rate_sunday"], "73.05")
        self.assertEqual(result["rate_public_holiday"], "104.35")
        self.assertEqual(result["schedule"]["weekday"]["early_07_08"], "73.05")
        self.assertEqual(result["schedule"]["weekday"]["evening_19_21"], "62.61")
        self.assertEqual(result["schedule"]["weekday"]["late_21_24"], "73.05")
        self.assertEqual(result["schedule"]["saturday"]["early_07_08"], "93.92")
        self.assertEqual(result["schedule"]["saturday"]["late_21_24"], "83.48")
        # Casual loading is not added to the published overtime schedule.
        self.assertEqual(result["schedule"]["overtime"]["monday_saturday_first_2_hours"], "62.61")

    def test_experienced_pharmacist_is_selectable(self):
        options = {row["value"] for row in classification_options("PHARMACIST")}
        self.assertIn("EXPERIENCED_PHARMACIST", options)
        result = resolve_award_schedule(
            role="PHARMACIST",
            classification="EXPERIENCED_PHARMACIST",
            employment_type="PART_TIME",
        )
        self.assertEqual(result["minimum_hourly_rate"], "45.72")
        self.assertEqual(result["rate_saturday"], "57.15")

    def test_technician_role_uses_dispensary_assistant_award_levels(self):
        options = {row["value"] for row in classification_options("TECHNICIAN")}
        self.assertEqual(options, {"LEVEL_3", "LEVEL_4"})
        level_3 = resolve_award_schedule(
            role="TECHNICIAN",
            classification="LEVEL_3",
            employment_type="FULL_TIME",
        )
        self.assertEqual(level_3["classification_label"], "Pharmacy assistant / dispensary assistant level 3")
        self.assertEqual(level_3["minimum_hourly_rate"], "29.45")
        with self.assertRaises(ValidationError):
            resolve_award_schedule(
                role="TECHNICIAN",
                classification="LEVEL_1",
                employment_type="FULL_TIME",
            )

    def test_student_year_maps_to_published_student_row(self):
        result = resolve_award_schedule(
            role="STUDENT",
            classification="YEAR_4",
            employment_type="CASUAL",
        )
        self.assertEqual(result["minimum_hourly_rate"], "30.66")
        self.assertEqual(result["rate_weekday"], "38.33")
        self.assertEqual(result["rate_public_holiday"], "76.65")

    def test_invalid_classification_fails_closed(self):
        with self.assertRaises(ValidationError):
            resolve_award_schedule(
                role="PHARMACIST",
                classification="LEVEL_1",
                employment_type="FULL_TIME",
            )

    def test_non_employee_membership_type_is_not_silently_mapped_to_casual(self):
        with self.assertRaises(ValidationError):
            resolve_award_schedule(
                role="PHARMACIST",
                classification="PHARMACIST",
                employment_type="LOCUM",
            )


class EmploymentTermsTests(SimpleTestCase):
    def test_correspondence_is_selected_by_employment_type_and_pay_basis(self):
        self.assertEqual(
            correspondence_profile("FULL_TIME", "AWARD")["key"],
            "FULL_TIME_AWARD_TERMS",
        )
        self.assertEqual(
            correspondence_profile("PART_TIME", "ABOVE_AWARD")["key"],
            "PART_TIME_ABOVE_AWARD_TERMS",
        )
        self.assertEqual(
            correspondence_profile("CASUAL", "AWARD")["key"],
            "CASUAL_AWARD_TERMS",
        )

    def test_part_time_pattern_normalises_written_hours_and_breaks(self):
        result = normalise_part_time_pattern(
            {
                "days": [
                    {
                        "weekday": 0,
                        "start_time": "09:00",
                        "end_time": "17:00",
                        "meal_break_start": "13:00",
                        "meal_break_minutes": 30,
                    },
                    {
                        "weekday": 2,
                        "start_time": "09:00",
                        "end_time": "14:00",
                        "meal_break_minutes": 0,
                    },
                ]
            }
        )
        self.assertEqual(result["weekly_ordinary_minutes"], 750)
        self.assertEqual(result["days"][0]["weekday_label"], "Monday")
        self.assertTrue(result["variation_must_be_in_writing"])
        self.assertTrue(result["overtime_above_agreed_hours"])

    def test_part_time_pattern_requires_meal_break_for_long_day(self):
        with self.assertRaises(ValidationError):
            normalise_part_time_pattern(
                {
                    "days": [
                        {
                            "weekday": 0,
                            "start_time": "09:00",
                            "end_time": "17:00",
                            "meal_break_minutes": 0,
                        }
                    ]
                }
            )

    def test_part_time_pattern_rejects_38_hours_or_more(self):
        with self.assertRaises(ValidationError):
            normalise_part_time_pattern(
                {
                    "days": [
                        {
                            "weekday": weekday,
                            "start_time": "09:00",
                            "end_time": "17:00",
                            "meal_break_start": "13:00",
                            "meal_break_minutes": 30,
                        }
                        for weekday in range(5)
                    ]
                }
            )
