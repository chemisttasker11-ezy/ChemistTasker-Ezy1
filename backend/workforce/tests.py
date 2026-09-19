from django.core.exceptions import ValidationError
from django.test import SimpleTestCase

from .award_rates import classification_options, resolve_award_schedule


class PharmacyAwardResolverTests(SimpleTestCase):
    def test_full_time_pharmacist_schedule_uses_permanent_penalties(self):
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
        self.assertEqual(result["schedule"]["saturday"]["late_night"], "73.05")

    def test_casual_pharmacist_schedule_uses_casual_penalties(self):
        result = resolve_award_schedule(
            role="PHARMACIST",
            classification="PHARMACIST",
            employment_type="CASUAL",
        )
        self.assertEqual(result["rate_weekday"], "52.18")
        self.assertEqual(result["rate_saturday"], "62.61")
        self.assertEqual(result["rate_sunday"], "73.05")
        self.assertEqual(result["rate_public_holiday"], "104.35")

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
