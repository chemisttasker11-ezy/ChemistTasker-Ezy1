import json
from datetime import datetime, time, timedelta
from unittest.mock import patch
from zoneinfo import ZoneInfo

from django.http import QueryDict
from django.test import SimpleTestCase, TestCase
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from client_profile.characterization_support import client_for, make_owner_with_pharmacy, make_user
from notifications.models import Notification
from organizations.pharmacy_profile import record_marketplace_review, validate_marketplace_review
from organizations.serializers import PharmacySerializer
from shifts.models import Shift, ShiftSlot, ShiftSlotAssignment


class PharmacyProfileContractTests(SimpleTestCase):
    def test_pharmacy_context_accepts_multipart_json(self):
        form = QueryDict('', mutable=True)
        form.update({'software': json.dumps(['WinIFRED']), 'services': json.dumps(['VACCINATION', 'VACCINATION']),
                     'script_volume_weekday': 'BUSY', 'script_volume_weekend': 'QUIET'})
        attrs = PharmacySerializer(partial=True).to_internal_value(form)
        self.assertEqual(attrs['software'], ['FRED'])
        self.assertEqual(attrs['services'], ['VACCINATION'])
        self.assertEqual(attrs['script_volume_weekday'], 'BUSY')
        self.assertEqual(attrs['script_volume_weekend'], 'QUIET')

    def test_optional_pharmacy_fields_can_be_cleared(self):
        attrs = PharmacySerializer(partial=True).to_internal_value({
            'software': [], 'services': [], 'script_volume_weekday': '', 'script_volume_weekend': ''})
        self.assertEqual(attrs['services'], [])
        self.assertEqual(attrs['script_volume_weekday'], '')

    def test_invalid_services_and_script_bands_are_rejected(self):
        for payload in ({'services': ['FRED']}, {'services': {'VACCINATION': True}},
                        {'script_volume_weekend': 'unknown'}, {'software': ['VACCINATION']}):
            with self.assertRaises(ValidationError):
                PharmacySerializer(partial=True).to_internal_value(payload)


class PharmacyBookingChangeContractTests(TestCase):
    def test_pharmacy_edit_preserves_booked_address_and_timezone_and_tells_worker(self):
        owner, pharmacy = make_owner_with_pharmacy("Confirm Pharmacy")
        worker = make_user("PHARMACIST")
        pharmacy.street_address = "1 Original Road"
        pharmacy.state, pharmacy.postcode, pharmacy.timezone = "WA", "6000", ""
        pharmacy.save(update_fields=["street_address", "state", "postcode", "timezone"])
        shift = Shift.objects.create(pharmacy=pharmacy, created_by=owner, role_needed="PHARMACIST")
        day = timezone.localdate() + timedelta(days=2)
        slot = ShiftSlot.objects.create(shift=shift, date=day, start_time=time(9), end_time=time(17))
        assignment = ShiftSlotAssignment.objects.create(shift=shift, slot=slot, slot_date=day, user=worker)
        url = f"/api/v1/pharmacies/{pharmacy.pk}/"

        impact = client_for(owner).get(url + "booking-impact/")
        self.assertEqual(impact.data, {"bookings": [{"shift_id": shift.pk, "date": day.isoformat()}]})
        with self.captureOnCommitCallbacks(execute=True):
            changed = client_for(owner).patch(url, {
                "street_address": "2 New Road", "state": "QLD", "postcode": "4000",
            }, format="json")
        self.assertEqual(changed.status_code, 200, changed.data)
        assignment.refresh_from_db()
        self.assertEqual(assignment.engagement_terms_snapshot["booking_site"]["street_address"], "1 Original Road")
        # In Brisbane it's already 18:30, but the Perth booking still has half an hour.
        still_working = datetime.combine(day, time(16, 30), tzinfo=ZoneInfo("Australia/Perth"))
        with patch("django.utils.timezone.now", return_value=still_working):
            confirmation = client_for(worker).get(f"/api/v1/my-confirmed-shifts/{shift.pk}/")
            impact = client_for(owner).get(url + "booking-impact/")
        self.assertEqual(confirmation.status_code, 200, confirmation.data)
        self.assertEqual(impact.data, {"bookings": [{"shift_id": shift.pk, "date": day.isoformat()}]})
        self.assertEqual(confirmation.data["pharmacy_detail"]["street_address"], "1 Original Road")
        self.assertEqual(confirmation.data["pharmacy_detail"]["timezone"], "Australia/Perth")
        self.assertEqual(confirmation.data["assigned_occurrences"][0]["timezone"], "Australia/Perth")
        self.assertTrue(Notification.objects.filter(user=worker, title="Pharmacy details updated").exists())

    def test_marketplace_review_attributes_and_notifies_an_explicit_decision(self):
        owner, pharmacy = make_owner_with_pharmacy("Review Pharmacy")
        reviewer = make_user("OWNER")
        pharmacy.owner.gov_id_verified = True
        pharmacy.abn_verified, pharmacy.abn = True, "12345678901"
        pharmacy.street_address, pharmacy.suburb, pharmacy.state, pharmacy.postcode = "1 Main Road", "Brisbane", "QLD", "4000"
        pharmacy.email = "local@example.test"
        data = {
            "marketplace_review_status": "APPROVED",
            "marketplace_approval_number": "local-approval",
            "marketplace_business_phone": "0730000000",
        }
        validate_marketplace_review(pharmacy, data)
        pharmacy.marketplace_review_status = "APPROVED"
        with self.captureOnCommitCallbacks(execute=True):
            record_marketplace_review(pharmacy, reviewer)
            pharmacy.save()
        pharmacy.refresh_from_db()
        self.assertTrue(pharmacy.verified)
        self.assertEqual(pharmacy.marketplace_reviewed_by_id, reviewer.pk)
        self.assertTrue(Notification.objects.filter(user=owner, title="Marketplace review decision").exists())
