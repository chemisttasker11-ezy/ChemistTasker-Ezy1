from datetime import date, time, timedelta

from django.test import TestCase

from client_profile.characterization_support import client_for, make_owner_with_pharmacy
from shifts.models import Shift, ShiftSlot


API = "/api/v1/dashboard/owner/"


class OwnerUpcomingShiftOrderTests(TestCase):
    def setUp(self):
        self.owner, self.pharmacy = make_owner_with_pharmacy("Upcoming Order Pharmacy")
        self.today = date.today()

    def shift(self, *days):
        shift = Shift.objects.create(
            pharmacy=self.pharmacy,
            created_by=self.owner,
            role_needed="PHARMACIST",
            employment_type="LOCUM",
            visibility="PLATFORM",
            rate_type="FLEXIBLE",
        )
        for offset in days:
            ShiftSlot.objects.create(
                shift=shift,
                date=self.today + timedelta(days=offset),
                start_time=time(9, 0),
                end_time=time(17, 0),
            )
        return shift

    def test_upcoming_shifts_are_soonest_first_and_dated_by_their_next_slot(self):
        later = self.shift(-3, 10)  # first slot already passed; next one is in 10 days
        soonest = self.shift(2)
        middle = self.shift(5)

        response = client_for(self.owner).get(API, {"pharmacy_id": self.pharmacy.id})
        self.assertEqual(response.status_code, 200, response.data)

        boxes = [box for box in response.data["shifts"] if box["id"] in {later.id, soonest.id, middle.id}]
        self.assertEqual([box["id"] for box in boxes], [soonest.id, middle.id, later.id])
        self.assertEqual(str(boxes[-1]["date"]), str(self.today + timedelta(days=10)))
        self.assertEqual(set(boxes[0]), {"id", "pharmacy_name", "date"})
