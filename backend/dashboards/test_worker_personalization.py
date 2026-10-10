from datetime import date, time, timedelta

from django.test import TestCase

from client_profile.characterization_support import client_for, make_owner_with_pharmacy, make_user
from onboarding.models import ExplorerOnboarding, PharmacistOnboarding
from shifts.models import (
    Shift, ShiftCounterOffer, ShiftCounterOfferSlot, ShiftInterest, ShiftOffer,
    ShiftSlot, ShiftSlotAssignment,
)
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


    def test_expired_worker_actions_do_not_claim_an_unrelated_upcoming_slot(self):
        shift, _ = self.shift()
        past_date = date.today() - timedelta(days=3)
        past = ShiftSlot.objects.create(
            shift=shift, date=past_date, start_time=time(9, 0), end_time=time(17, 0)
        )
        ShiftSlotAssignment.objects.create(shift=shift, slot=past, slot_date=past_date, user=self.worker)
        ShiftInterest.objects.create(shift=shift, slot=past, user=self.worker)
        ShiftOffer.objects.create(
            shift=shift, slot=past, user=self.worker,
            offered_slot_date=past_date, status="PENDING",
        )
        counter = ShiftCounterOffer.objects.create(shift=shift, user=self.worker, status="PENDING")
        ShiftCounterOfferSlot.objects.create(
            offer=counter, slot=past, slot_date=past_date,
            proposed_start_time=time(9, 0), proposed_end_time=time(17, 0),
        )

        response = client_for(self.worker).get(API, {"workspace": "platform"})
        self.assertEqual(response.status_code, 200, response.data)
        self.assertNotIn(shift.id, {item["id"] for item in response.data["shifts"]})
        self.assertEqual(response.data["upcoming_shifts_count"], 0)
        self.assertEqual(response.data["confirmed_shifts_count"], 0)

    def test_upcoming_interest_has_correct_date_and_does_not_inherit_past_confirmation(self):
        shift, upcoming = self.shift()
        past_date = date.today() - timedelta(days=3)
        past = ShiftSlot.objects.create(
            shift=shift, date=past_date, start_time=time(9, 0), end_time=time(17, 0)
        )
        ShiftSlotAssignment.objects.create(shift=shift, slot=past, slot_date=past_date, user=self.worker)
        ShiftInterest.objects.create(shift=shift, slot=upcoming, user=self.worker)

        response = client_for(self.worker).get(API, {"workspace": "platform"})
        self.assertEqual(response.status_code, 200, response.data)
        item = next(item for item in response.data["shifts"] if item["id"] == shift.id)
        self.assertEqual(item["date"], self.day)
        self.assertEqual(item["status"], "Interested")
        self.assertEqual(response.data["confirmed_shifts_count"], 0)

    def test_upcoming_assignment_prefers_worker_slot_over_earlier_open_slot(self):
        shift, assigned_slot = self.shift()
        earlier = ShiftSlot.objects.create(
            shift=shift, date=self.day - timedelta(days=1),
            start_time=time(10, 0), end_time=time(14, 0),
        )
        ShiftInterest.objects.create(shift=shift, slot=earlier, user=self.worker)
        ShiftSlotAssignment.objects.create(
            shift=shift, slot=assigned_slot, slot_date=self.day, user=self.worker
        )

        response = client_for(self.worker).get(API, {"workspace": "platform"})
        self.assertEqual(response.status_code, 200, response.data)
        item = next(item for item in response.data["shifts"] if item["id"] == shift.id)
        self.assertEqual(item["date"], self.day)
        self.assertEqual(item["status"], "Confirmed")
        self.assertEqual(response.data["confirmed_shifts_count"], 1)


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
