"""PR201 blockers 2/3: a store without a holiday district is priced and Award-floored statewide.

Only dates that some district of the store's state declares locally carry a review flag.
"""
from datetime import date, time
from decimal import Decimal

from django.core.exceptions import ValidationError
from django.test import TestCase

from client_profile.characterization_support import client_for, make_owner_with_pharmacy, make_user
from client_profile.models import OtherStaffOnboarding, Shift, ShiftOffer, ShiftSlot
from shifts.engagement import build_shift_engagement_terms
from shifts.pricing import get_locked_rate_for_slot

ORDINARY_MONDAY = date(2026, 9, 21)
EKKA_WEDNESDAY = date(2026, 8, 12)  # QLD_BRISBANE local show day only


class NoRegionStoreTests(TestCase):
    def make_shift(self, region="", payroll=False, pref="TFN", work_date=ORDINARY_MONDAY):
        owner, pharmacy = make_owner_with_pharmacy("No region store")
        self.owner = owner
        pharmacy.state, pharmacy.public_holiday_region = "QLD", region
        pharmacy.use_chemisttasker_payroll = payroll
        pharmacy.save(update_fields=["state", "public_holiday_region", "use_chemisttasker_payroll"])
        self.worker = make_user("OTHER_STAFF")
        OtherStaffOnboarding.objects.create(
            user=self.worker, role_type="ASSISTANT", classification_level="LEVEL_3",
            payment_preference=pref, date_of_birth=date(1990, 1, 1),
            tfn_number="123456789", super_fund_name="Example Super", super_usi="EXAMPLE123",
            super_member_number="MEMBER123",
        )
        self.shift = Shift.objects.create(
            pharmacy=pharmacy, created_by=owner, role_needed="ASSISTANT",
            employment_type="LOCUM", payment_preference=pref,
        )
        self.slot = ShiftSlot.objects.create(
            shift=self.shift, date=work_date, start_time=time(9), end_time=time(17),
        )

    def terms(self, rate):
        offer = ShiftOffer.objects.create(
            shift=self.shift, slot=self.slot, user=self.worker, offered_rate=rate,
        )
        return build_shift_engagement_terms(shift=self.shift, user=self.worker, offer=offer)

    def test_tfn_below_award_offer_is_raised_to_statewide_floor(self):
        self.make_shift()
        terms = self.terms("10.00")
        occ = terms["occurrences"][0]
        self.assertIsNotNone(occ["award_floor_rate"], occ["award_review_reason"])
        self.assertEqual(occ["agreed_rate"], occ["minimum_with_bonus"])
        self.assertGreater(Decimal(occ["agreed_rate"]), Decimal("25"))
        self.assertFalse(terms["award_payroll_review_required"])

    def test_tfn_award_staff_offer_without_rate_gets_the_floor(self):
        self.make_shift()
        occ = self.terms(None)["occurrences"][0]
        self.assertEqual(occ["agreed_rate"], occ["minimum_with_bonus"])

    def test_local_holiday_date_keeps_floor_and_flags_review(self):
        self.make_shift(work_date=EKKA_WEDNESDAY)
        terms = self.terms("10.00")
        occ = terms["occurrences"][0]
        self.assertEqual({s["day_type"] for s in occ["award_floor_segments"]}, {"weekday"})
        self.assertGreater(Decimal(occ["agreed_rate"]), Decimal("25"))
        self.assertTrue(occ["award_review_required"])
        self.assertFalse(terms["award_payroll_review_required"])
        self.assertIn("REGION_REQUIRED", occ["award_review_reason"])

    def test_control_configured_district_still_gets_its_local_holiday(self):
        self.make_shift(region="QLD_BRISBANE", work_date=EKKA_WEDNESDAY)
        terms = self.terms("10.00")
        occ = terms["occurrences"][0]
        self.assertEqual({s["day_type"] for s in occ["award_floor_segments"]}, {"public_holiday"})
        self.assertFalse(terms["award_payroll_review_required"])

    def test_abn_locum_at_payroll_store_is_priced(self):
        self.make_shift(payroll=True, pref="ABN")
        rate, meta = get_locked_rate_for_slot(self.slot, self.shift, self.worker)
        self.assertGreater(rate, 0, meta)

    def test_abn_locum_on_local_holiday_date_is_priced_statewide_with_flag(self):
        self.make_shift(payroll=True, pref="ABN", work_date=EKKA_WEDNESDAY)
        rate, meta = get_locked_rate_for_slot(self.slot, self.shift, self.worker)
        self.assertGreater(rate, 0, meta)
        self.assertEqual({s["holiday_status"] for s in meta["segments"]}, {"REGION_REQUIRED"})
        self.assertEqual({s["day_type"] for s in meta["segments"]}, {"weekday"})

    def test_payroll_staff_uses_statewide_rates_and_only_flags_missing_region(self):
        terms = {"settlement_channel": "PAYROLL", "rates": {"weekday": "40.00", "public_holiday": "90.00"}}
        self.make_shift(payroll=True)
        rate, _ = get_locked_rate_for_slot(self.slot, self.shift, self.worker, staff_terms=terms)
        self.assertEqual(rate, Decimal("40.00"))
        rate, meta = get_locked_rate_for_slot(
            self.slot, self.shift, self.worker, override_date=EKKA_WEDNESDAY, staff_terms=terms,
        )
        self.assertEqual(rate, Decimal("40.00"))
        self.assertEqual(meta["segments"][0]["holiday_status"], "REGION_REQUIRED")

    def test_only_payroll_blocks_genuinely_uncertified_dates(self):
        self.make_shift()
        terms = {"settlement_channel": "PAYROLL", "rates": {"weekday": "40.00"}}
        with self.assertRaisesMessage(ValidationError, "YEAR_NOT_CERTIFIED"):
            get_locked_rate_for_slot(
                self.slot, self.shift, self.worker, override_date=date(2028, 1, 3), staff_terms=terms,
            )
        terms["settlement_channel"] = "INVOICE"
        rate, _ = get_locked_rate_for_slot(
            self.slot, self.shift, self.worker, override_date=date(2028, 1, 3), staff_terms=terms,
        )
        self.assertEqual(rate, Decimal("40.00"))

    def test_tfn_payroll_with_missing_region_and_local_date_remains_ready(self):
        self.make_shift(payroll=True, work_date=EKKA_WEDNESDAY)
        terms = self.terms(None)
        self.assertEqual(terms["settlement_channel"], "PAYROLL")
        self.assertTrue(terms["occurrences"][0]["award_review_required"])

    def test_accepted_tfn_offer_activates_payroll_without_legacy_worker_base(self):
        from django.utils import timezone
        self.make_shift(region="QLD_BRISBANE", payroll=True)
        for with_worker_base in (False, True):
            with self.subTest(with_worker_base=with_worker_base):
                snapshot = {"version": 1, "payroll_setup_status": "DEFERRED",
                            "award_payroll_review_required": False,
                            "occurrences": [{"slot_id": self.slot.pk, "date": str(self.slot.date), "agreed_rate": "45.00"}]}
                if with_worker_base:
                    snapshot["public_holiday_work_base"] = {"state": "QLD", "region": "QLD_BRISBANE", "confirmed": True}
                offer = ShiftOffer.objects.create(
                    shift=self.shift, slot=self.slot, user=self.worker, status="ACCEPTED",
                    payment_preference_snapshot="TFN", settlement_channel="TIMESHEET_ONLY",
                    engagement_kind="SHIFT_EMPLOYMENT", engagement_terms_snapshot=snapshot,
                    engagement_terms_accepted_at=timezone.now(),
                )
                response = client_for(self.owner).post(f"/api/v1/shift-offers/{offer.pk}/activate-payroll/", {}, format="json")
                self.assertEqual(response.status_code, 200, response.data)
                offer.delete()

    def test_preview_and_locked_rate_both_use_configured_local_holiday(self):
        from rest_framework.test import APIRequestFactory, force_authenticate
        from shifts.lifecycle import ShiftDetailViewSet
        self.make_shift(region="QLD_BRISBANE", payroll=True, pref="ABN", work_date=EKKA_WEDNESDAY)
        request = APIRequestFactory().post("/api/v1/shifts/calculate-rates/", {
            "pharmacyId": self.shift.pharmacy_id, "role": "ASSISTANT",
            "slots": [{"date": str(EKKA_WEDNESDAY), "startTime": "09:00", "endTime": "17:00"}],
        }, format="json")
        force_authenticate(request, user=self.owner)
        response = ShiftDetailViewSet.as_view({"post": "calculate_rates"})(request)
        self.assertEqual(response.status_code, 200, response.data)
        locked, _ = get_locked_rate_for_slot(self.slot, self.shift, self.worker)
        self.assertEqual(Decimal(response.data[0]["rate"]), locked)
        self.assertEqual(response.data[0]["meta"]["segments"][0]["day_type"], "public_holiday")
