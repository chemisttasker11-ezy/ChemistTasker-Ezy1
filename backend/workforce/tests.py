from datetime import date
from types import SimpleNamespace
from unittest.mock import patch

from django.core.exceptions import ValidationError
from django.test import SimpleTestCase

from .award_rates import classification_options, resolve_award_schedule
from .employment_terms import correspondence_profile, normalise_part_time_pattern
from .employment_engagement_service import build_employment_engagement_payload


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


    def test_level_1_junior_percentages_follow_clause_16_2_by_age(self):
        as_of = date(2026, 9, 19)
        cases = [
            (15, date(2011, 9, 19), "45.00", "12.51"),
            (16, date(2010, 9, 19), "50.00", "13.91"),
            (17, date(2009, 9, 19), "60.00", "16.69"),
            (18, date(2008, 9, 19), "70.00", "19.47"),
            (19, date(2007, 9, 19), "80.00", "22.25"),
            (20, date(2006, 9, 19), "90.00", "25.03"),
        ]
        for age, dob, percentage, weekday_rate in cases:
            with self.subTest(age=age):
                result = resolve_award_schedule(
                    role="ASSISTANT",
                    classification="LEVEL_1",
                    employment_type="FULL_TIME",
                    date_of_birth=dob,
                    as_of=as_of,
                )
                self.assertEqual(result["age_at_effective_date"], age)
                self.assertEqual(result["junior_percentage"], percentage)
                self.assertEqual(result["rate_weekday"], weekday_rate)

        adult = resolve_award_schedule(
            role="ASSISTANT",
            classification="LEVEL_1",
            employment_type="FULL_TIME",
            date_of_birth=date(2005, 9, 19),
            as_of=as_of,
        )
        self.assertEqual(adult["age_at_effective_date"], 21)
        self.assertIsNone(adult["junior_percentage"])
        self.assertEqual(adult["rate_weekday"], "27.81")


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
                            "end_time": "17:30",
                            "meal_break_start": "13:00",
                            "meal_break_minutes": 30,
                        }
                        for weekday in range(5)
                    ]
                }
            )

    def test_part_time_pattern_rejects_ordinary_start_before_7am(self):
        with self.assertRaises(ValidationError):
            normalise_part_time_pattern(
                {
                    "days": [
                        {
                            "weekday": 0,
                            "start_time": "06:30",
                            "end_time": "10:00",
                            "meal_break_minutes": 0,
                        }
                    ]
                }
            )

    def test_part_time_pattern_allows_12_paid_hours_plus_meal_break(self):
        result = normalise_part_time_pattern(
            {
                "days": [
                    {
                        "weekday": 1,
                        "start_time": "10:00",
                        "end_time": "22:30",
                        "meal_break_start": "14:00",
                        "meal_break_minutes": 30,
                    }
                ]
            }
        )
        self.assertEqual(result["days"][0]["ordinary_minutes"], 720)

    def test_part_time_pattern_accepts_midnight_as_end_of_day(self):
        result = normalise_part_time_pattern(
            {
                "days": [
                    {
                        "weekday": 4,
                        "start_time": "18:00",
                        "end_time": "00:00",
                        "meal_break_start": "21:00",
                        "meal_break_minutes": 30,
                    }
                ]
            }
        )
        self.assertEqual(result["days"][0]["ordinary_minutes"], 330)


class EmploymentEngagementPayloadTests(SimpleTestCase):
    @staticmethod
    def _membership(**overrides):
        values = {
            "role": "PHARMACIST",
            "employment_type": "FULL_TIME",
            "job_title": "",
            "pharmacist_award_level": "PHARMACIST",
            "otherstaff_classification_level": "",
            "intern_half": "",
            "student_year": "",
        }
        values.update(overrides)
        return SimpleNamespace(**values)

    @patch(
        "workforce.employment_engagement_service.membership_date_of_birth",
        return_value=date(2006, 10, 1),
    )
    def test_level_1_assistant_uses_dob_driven_junior_rate(self, _mock_dob):
        membership = self._membership(
            role="ASSISTANT",
            otherstaff_classification_level="LEVEL_1",
        )
        payload = build_employment_engagement_payload(
            {
                "pay_basis": "AWARD",
                "award_classification": "LEVEL_1",
            },
            membership,
            effective_from=date(2026, 9, 19),
            effective_to=date(2026, 9, 30),
        )
        self.assertEqual(str(payload["rate_weekday"]), "22.25")
        self.assertEqual(payload["award_rate_snapshot"]["rate_scope"], "junior")
        self.assertEqual(payload["award_rate_snapshot"]["age_at_effective_date"], 19)
        self.assertEqual(payload["award_rate_snapshot"]["junior_percentage"], "80.00")
        self.assertEqual(payload["award_rate_snapshot"]["next_rate_review_date"], "2026-10-01")

    @patch(
        "workforce.employment_engagement_service.membership_date_of_birth",
        return_value=date(2006, 10, 1),
    )
    def test_junior_engagement_must_end_before_next_birthday(self, _mock_dob):
        membership = self._membership(
            role="ASSISTANT",
            otherstaff_classification_level="LEVEL_1",
        )
        with self.assertRaises(ValidationError):
            build_employment_engagement_payload(
                {
                    "pay_basis": "AWARD",
                    "award_classification": "LEVEL_1",
                },
                membership,
                effective_from=date(2026, 9, 19),
            )

    @patch("workforce.employment_engagement_service.membership_date_of_birth", return_value=None)
    def test_above_award_cannot_undercut_award_summary_floor(self):
        membership = self._membership()
        with self.assertRaises(ValidationError):
            build_employment_engagement_payload(
                {
                    "pay_basis": "ABOVE_AWARD",
                    "award_classification": "PHARMACIST",
                    "rate_weekday": "40.00",
                    "rate_saturday": "60.00",
                    "rate_sunday": "70.00",
                    "rate_public_holiday": "100.00",
                },
                membership,
            )

    @patch("workforce.employment_engagement_service.membership_date_of_birth", return_value=None)
    def test_above_award_requires_at_least_one_rate_above_the_floor(self):
        membership = self._membership()
        with self.assertRaises(ValidationError):
            build_employment_engagement_payload(
                {
                    "pay_basis": "ABOVE_AWARD",
                    "award_classification": "PHARMACIST",
                    "rate_weekday": "41.74",
                    "rate_saturday": "52.18",
                    "rate_sunday": "62.61",
                    "rate_public_holiday": "93.92",
                },
                membership,
            )

    @patch("workforce.employment_engagement_service.membership_date_of_birth", return_value=None)
    def test_above_award_snapshot_keeps_penalty_and_overtime_floors(self):
        membership = self._membership()
        payload = build_employment_engagement_payload(
            {
                "pay_basis": "ABOVE_AWARD",
                "award_classification": "PHARMACIST",
                "rate_weekday": "55.00",
                "rate_saturday": "70.00",
                "rate_sunday": "80.00",
                "rate_public_holiday": "110.00",
                "late_night_applicable": True,
                "rate_late_night": "75.00",
            },
            membership,
        )
        snapshot = payload["award_rate_snapshot"]
        self.assertEqual(snapshot["kind"], "ABOVE_AWARD")
        self.assertEqual(snapshot["effective_ordinary_schedule"]["weekday"]["evening_19_21"], "55.00")
        self.assertEqual(snapshot["effective_ordinary_schedule"]["weekday"]["late_21_24"], "75.00")
        self.assertEqual(snapshot["overtime_floor"]["sunday_all_day"], "83.48")
