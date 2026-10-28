"""PR201 B14: work-base declaration API, tenant ownership and region validation."""
from unittest.mock import patch
from django.test import TestCase

from client_profile.characterization_support import client_for, make_owner_with_pharmacy
from organizations.serializers import PharmacySerializer


class PharmacyHolidayConfigurationContracts(TestCase):
    def setUp(self):
        self.owner, self.pharmacy = make_owner_with_pharmacy("P6 holiday work base")
        self.pharmacy.state = "QLD"
        self.pharmacy.save(update_fields=["state"])

    def test_region_validation_exception_is_private_in_api_response(self):
        from shifts.pricing_data import PricingDataError
        secret = "private pricing file /srv/secrets/holiday-pricing.json"
        with patch("shifts.holidays.region_details", side_effect=PricingDataError(secret)), \
                self.assertLogs("organizations.serializers", level="WARNING") as logs:
            response = client_for(self.owner).patch(
                f"/api/v1/pharmacies/{self.pharmacy.pk}/",
                {"public_holiday_region": "QLD_GOLD_COAST"}, format="json",
            )
        self.assertEqual(response.status_code, 400, response.content)
        self.assertNotIn(secret, response.content.decode())
        self.assertIn(secret, "\n".join(logs.output))
        self.assertEqual(response.json()["public_holiday_region"],
                         ["Select a valid public holiday region for this state."])
        self.pharmacy.refresh_from_db()
        self.assertEqual(self.pharmacy.public_holiday_region, "")

    def test_owner_can_read_authoritative_region_options_by_state(self):
        result = client_for(self.owner).get("/api/v1/holidays/regions/", {"state": "QLD"})
        self.assertEqual(result.status_code, 200, result.data)
        regions = result.data["regions"]
        self.assertIn("QLD_GOLD_COAST", [record["code"] for record in regions])
        self.assertIn("QLD_CAIRNS", [record["code"] for record in regions])
        self.assertIn("QLD_BRISBANE", [record["code"] for record in regions])
        gold = next(region for region in regions if region["code"] == "QLD_GOLD_COAST")
        self.assertEqual(gold["pendingYears"], [2027])
        self.assertTrue(gold["requiresBoundaryVerification"])

    def test_unverified_state_and_missing_state_are_rejected(self):
        invalid = client_for(self.owner).get("/api/v1/holidays/regions/", {"state": "NOT_A_STATE"})
        self.assertEqual(invalid.status_code, 400, invalid.data)

    def test_pharmacy_holiday_district_rejects_cross_state_assignment(self):
        serializer = PharmacySerializer(
            instance=self.pharmacy,
            data={"public_holiday_region": "NSW_WALCHA"}, partial=True,
        )
        self.assertFalse(serializer.is_valid())
        self.assertIn("public_holiday_region", serializer.errors)
        self.pharmacy.refresh_from_db()
        self.assertEqual(self.pharmacy.public_holiday_region, "")

    def test_pharmacy_holiday_district_accepts_verified_region_and_serializes_windows(self):
        serializer = PharmacySerializer(
            instance=self.pharmacy,
            data={"public_holiday_region": "qld_gold_coast"}, partial=True,
        )
        self.assertTrue(serializer.is_valid(), serializer.errors)
        self.assertEqual(serializer.validated_data["public_holiday_region"], "QLD_GOLD_COAST")
        instance = serializer.save()
        payload = PharmacySerializer(instance).data
        self.assertIn("2026-08-28", payload["public_holiday_dates"])
        self.assertNotIn("2026-08-12", payload["public_holiday_dates"])
        self.assertEqual(payload["public_holiday_calendar_status"]["pendingYears"], [2027])
        self.assertTrue(any(
            x["date"] == "2027-12-24" and x["start"] == "18:00"
            for x in payload["public_holiday_windows"]
        ))
