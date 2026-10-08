from datetime import date, time, timedelta

from django.test import TestCase

from client_profile.characterization_support import client_for, make_owner_with_pharmacy, make_user
from onboarding.models import ExplorerOnboarding, PharmacistOnboarding
from shifts.models import Shift, ShiftInterest, ShiftSlot, ShiftSlotAssignment
from talent.models import UserAvailability


API = "/api/v1/dashboard/pharmacist/"


class WorkerDashboardPersonalizationTests(TestCase):
    def setUp(self):
        self.owner, self.pharmacy = make_owner_with_pharmacy("Dashboard Match Pharmacy")
        self.pharmacy.state = "QLD"
        self.pharmacy.save(update_fields=["state"])
        self.worker = make_user("PHARMACIST")
        PharmacistOnboarding.objects.create(
            user=self.worker,
            open_to_travel=True,
            travel_states=["QLD"],
        )
        self.day = date.today() + timedelta(days=7)
        UserAvailability.objects.create(
            user=self.worker,
            date=self.day,
            start_time=time(8, 0),
            end_time=time(18, 0),
            notify_new_shifts=False,
        )

    def shift(self, *, start=time(9, 0), end=time(17, 0)):
        shift = Shift.objects.create(
            pharmacy=self.pharmacy,
            created_by=self.owner,
            role_needed="PHARMACIST",
            employment_type="LOCUM",
            visibility="PLATFORM",
            rate_type="FLEXIBLE",
        )
        slot = ShiftSlot.objects.create(
            shift=shift,
            date=self.day,
            start_time=start,
            end_time=end,
        )
        return shift, slot

    def test_my_shifts_excludes_unrelated_open_shift_and_recommends_availability_match(self):
        interested, _ = self.shift()
        ShiftInterest.objects.create(shift=interested, user=self.worker)

        confirmed, confirmed_slot = self.shift(start=time(10, 0), end=time(14, 0))
        ShiftSlotAssignment.objects.create(
            shift=confirmed,
            slot=confirmed_slot,
            slot_date=self.day,
            user=self.worker,
        )

        recommended, _ = self.shift(start=time(11, 0), end=time(15, 0))

        response = client_for(self.worker).get(API, {"workspace": "platform"})
        self.assertEqual(response.status_code, 200, response.data)

        my_shifts = {item["id"]: item for item in response.data["shifts"]}
        recommendations = {item["id"]: item for item in response.data["recommended_shifts"]}

        self.assertEqual(set(my_shifts), {interested.id, confirmed.id})
        self.assertEqual(my_shifts[interested.id]["status"], "Interested")
        self.assertEqual(my_shifts[confirmed.id]["status"], "Confirmed")
        self.assertNotIn(recommended.id, my_shifts)
        self.assertIn(recommended.id, recommendations)
        self.assertEqual(recommendations[recommended.id]["status"], "Recommended")
        self.assertEqual(
            recommendations[recommended.id]["reason"],
            "Matches your availability and travel area",
        )
        self.assertEqual(response.data["upcoming_shifts_count"], 2)
        self.assertEqual(response.data["shift_summary"]["open_count"], 1)


class ExplorerDashboardPersonalizationTests(TestCase):
    def setUp(self):
        self.owner, self.pharmacy = make_owner_with_pharmacy("Explorer Match Pharmacy")
        self.pharmacy.state = "QLD"
        self.pharmacy.save(update_fields=["state"])
        self.worker = make_user("EXPLORER")
        ExplorerOnboarding.objects.create(
            user=self.worker,
            open_to_travel=True,
            travel_states=["QLD"],
        )
        self.day = date.today() + timedelta(days=9)
        UserAvailability.objects.create(
            user=self.worker,
            date=self.day,
            start_time=time(8, 0),
            end_time=time(18, 0),
            notify_new_shifts=False,
        )

    def shift(self, *, start=time(9, 0), end=time(17, 0)):
        shift = Shift.objects.create(
            pharmacy=self.pharmacy,
            created_by=self.owner,
            role_needed="EXPLORER",
            employment_type="CASUAL",
            visibility="PLATFORM",
        )
        ShiftSlot.objects.create(
            shift=shift,
            date=self.day,
            start_time=start,
            end_time=end,
        )
        return shift

    def test_explorer_dashboard_separates_my_activity_from_matching_opportunities(self):
        interested = self.shift()
        ShiftInterest.objects.create(shift=interested, user=self.worker)
        recommended = self.shift(start=time(10, 0), end=time(15, 0))

        response = client_for(self.worker).get("/api/v1/dashboard/explorer/")
        self.assertEqual(response.status_code, 200, response.data)

        my_shifts = {item["id"]: item for item in response.data["shifts"]}
        recommendations = {item["id"]: item for item in response.data["recommended_shifts"]}
        self.assertEqual(set(my_shifts), {interested.id})
        self.assertEqual(my_shifts[interested.id]["status"], "Interested")
        self.assertNotIn(recommended.id, my_shifts)
        self.assertIn(recommended.id, recommendations)
        self.assertEqual(response.data["shift_summary"]["open_count"], 1)

        shift_activity = next(
            (item for item in response.data["activity"] if item.get("kind") == "shift"),
            None,
        )
        self.assertIsNotNone(shift_activity)
        self.assertEqual(
            shift_activity["action_url"],
            f"/dashboard/explorer/shifts/{interested.id}",
        )
