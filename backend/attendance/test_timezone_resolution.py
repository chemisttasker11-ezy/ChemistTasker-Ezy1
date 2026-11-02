from datetime import date, datetime, time, timedelta, timezone as datetime_timezone
from unittest.mock import patch
from zoneinfo import ZoneInfo

from django.test import TestCase, override_settings
from rest_framework.test import APIRequestFactory, force_authenticate

from attendance.eligibility import EligibilityType, resolve_attendance_eligibility
from attendance.kiosk_api import KioskRequestPairingCodeView
from client_profile.characterization_support import make_assignment, make_owner_with_pharmacy, make_user
from shifts.browse import SharedShiftDetailView


@override_settings(TIME_ZONE="UTC")
class AttendanceTimezoneResolutionTests(TestCase):
    def setUp(self):
        self.owner, self.pharmacy = make_owner_with_pharmacy("Timezone attendance")
        self.worker = make_user("PHARMACIST")

    def test_assignment_uses_store_date_and_window_for_utc_events_in_summer_and_winter(self):
        _, slot, assignment = make_assignment(self.pharmacy, self.owner, self.worker)
        slot.start_time, slot.end_time = time(0, 30), time(1, 30)
        for day in (date(2026, 1, 5), date(2026, 7, 5)):
            slot.date = assignment.slot_date = day
            slot.save(update_fields=["date", "start_time", "end_time"])
            assignment.save(update_fields=["slot_date"])
            for explicit, state, postcode, expected in (
                (None, " nSw ", None, "Australia/Sydney"),
                ("invalid-zone", "New South Wales", "2880", "Australia/Broken_Hill"),
                (None, "Queensland", None, "Australia/Brisbane"),
                ("Australia/Perth", "NSW", "2880", "Australia/Perth"),
            ):
                with self.subTest(day=day, explicit=explicit, state=state, postcode=postcode):
                    self.pharmacy.timezone, self.pharmacy.state, self.pharmacy.postcode = explicit, state, postcode
                    self.pharmacy.save(update_fields=["timezone", "state", "postcode"])
                    local_event = datetime.combine(day, time(0, 45), tzinfo=ZoneInfo(expected))
                    utc_event = local_event.astimezone(datetime_timezone.utc)
                    self.assertEqual(utc_event.date(), day - timedelta(days=1))
                    result = resolve_attendance_eligibility(self.worker, self.pharmacy, utc_event)
                    self.assertEqual(result.eligibility_type, EligibilityType.CONFIRMED_ASSIGNMENT)
                    self.assertEqual(result.assignment.pk, assignment.pk)
                    self.assertFalse(result.is_provisional)
                    # A caller's timezone representation cannot change the matching assignment.
                    equivalent = utc_event.astimezone(ZoneInfo("Pacific/Honolulu"))
                    self.assertEqual(
                        resolve_attendance_eligibility(self.worker, self.pharmacy, equivalent).assignment.pk,
                        assignment.pk,
                    )
                    outside_window = (local_event + timedelta(hours=5)).astimezone(datetime_timezone.utc)
                    self.assertFalse(resolve_attendance_eligibility(self.worker, self.pharmacy, outside_window).is_eligible)
                    self.pharmacy.refresh_from_db()
                    self.assertEqual(self.pharmacy.timezone, explicit)

    def test_pairing_options_resolve_timezone_without_persisting_it(self):
        for explicit, state, postcode, expected in (
            (None, "QLD", None, "Australia/Brisbane"),
            ("invalid-zone", "nsw", "2880", "Australia/Broken_Hill"),
            ("Australia/Perth", "NSW", "2880", "Australia/Perth"),
            (None, None, None, "UTC"),
        ):
            with self.subTest(explicit=explicit, state=state, postcode=postcode):
                self.pharmacy.timezone, self.pharmacy.state, self.pharmacy.postcode = explicit, state, postcode
                self.pharmacy.save(update_fields=["timezone", "state", "postcode"])
                request = APIRequestFactory().get("/api/v1/attendance/kiosk/pairing/request/")
                force_authenticate(request, user=self.owner)
                response = KioskRequestPairingCodeView.as_view()(request)
                self.assertEqual(response.status_code, 200, response.data)
                self.assertEqual(response.data["pharmacies"], [{
                    "id": self.pharmacy.pk, "name": self.pharmacy.name, "timezone": expected,
                }])
                self.pharmacy.refresh_from_db()
                self.assertEqual(self.pharmacy.timezone, explicit)

    def test_pairing_options_remain_hidden_from_unrelated_workers(self):
        request = APIRequestFactory().get("/api/v1/attendance/kiosk/pairing/request/")
        force_authenticate(request, user=self.worker)
        response = KioskRequestPairingCodeView.as_view()(request)
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["pharmacies"], [])

    def test_shared_link_availability_uses_the_same_store_timezone(self):
        shift, slot, assignment = make_assignment(self.pharmacy, self.owner, self.worker)
        assignment.delete()
        slot.start_time, slot.end_time = time(0, 30), time(1, 30)
        slot.save(update_fields=["start_time", "end_time"])
        for explicit, postcode, expected in (
            (None, None, "Australia/Sydney"),
            ("invalid-zone", "2880", "Australia/Broken_Hill"),
        ):
            self.pharmacy.timezone, self.pharmacy.state, self.pharmacy.postcode = explicit, "NSW", postcode
            self.pharmacy.save(update_fields=["timezone", "state", "postcode"])
            for local_time, closed in ((time(0, 45), False), (time(2), True)):
                with self.subTest(explicit=explicit, postcode=postcode, local_time=local_time):
                    stamp = datetime.combine(slot.date, local_time, tzinfo=ZoneInfo(expected)).astimezone(datetime_timezone.utc)
                    request = APIRequestFactory().get("/api/v1/view-shared-shift/", {"token": str(shift.share_token)})
                    with patch("django.utils.timezone.now", return_value=stamp):
                        response = SharedShiftDetailView.as_view()(request)
                    self.assertEqual(response.status_code, 200, response.data)
                    self.assertEqual(response.data["is_closed"], closed)
