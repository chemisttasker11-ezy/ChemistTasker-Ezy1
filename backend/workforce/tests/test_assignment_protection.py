"""Both roster editors refuse to overwrite assigned or payment-pending occurrences."""
from datetime import time, timedelta
from unittest.mock import patch

from django.core.exceptions import ValidationError
from django.test import TestCase
from django.utils import timezone

from client_profile.characterization_support import client_for, make_owner_with_pharmacy, make_user
from memberships.models import Membership
from shifts.models import Shift, ShiftOffer, ShiftSlot, ShiftSlotAssignment
from workforce.models import RosterPeriod
from workforce.roster.bulk_edit import bulk_edit_roster_period


class RosterAssignmentProtectionTests(TestCase):
    def setUp(self):
        self.owner, self.pharmacy = make_owner_with_pharmacy("Assignment guard")
        self.worker = make_user("PHARMACIST")
        Membership.objects.create(
            user=self.worker, pharmacy=self.pharmacy, role="PHARMACIST",
            employment_type="FULL_TIME", status=Membership.Status.ACCEPTED, is_active=True,
        )
        self.other = make_user("PHARMACIST")
        self.day = timezone.localdate() + timedelta(days=14)
        self.period = RosterPeriod.objects.create(
            pharmacy=self.pharmacy, created_by=self.owner,
            week_start=self.day - timedelta(days=self.day.weekday()),
        )
        self.shift = Shift.objects.create(
            pharmacy=self.pharmacy, created_by=self.owner, role_needed="PHARMACIST",
            employment_type="LOCUM", is_roster_container=True,
        )
        self.slot = ShiftSlot.objects.create(
            shift=self.shift, date=self.day, start_time=time(9), end_time=time(17), roster_period=self.period,
        )

    def protect(self, state):
        if state == "assigned":
            ShiftSlotAssignment.objects.create(
                shift=self.shift, slot=self.slot, slot_date=self.day, user=self.other, is_rostered=True,
            )
        else:
            ShiftOffer.objects.create(
                shift=self.shift, slot=self.slot, offered_slot_date=self.day, user=self.other,
                status=ShiftOffer.Status.ACCEPTED_AWAITING_PAYMENT,
            )

    def assert_unchanged(self, state):
        rows = self.slot.assignments.all()
        self.assertEqual(list(rows.values_list("user_id", flat=True)), [self.other.pk] if state == "assigned" else [])

    def test_bulk_assign_and_move_refuse_protected_occurrences(self):
        for state in ("assigned", "payment_pending"):
            self.protect(state)
            for action in ("assign_worker", "move_shift"):
                with self.subTest(state=state, action=action):
                    op = {"action": action, "slot_id": self.slot.pk,
                          "user_id" if action == "assign_worker" else "target_user_id": self.worker.pk}
                    with self.assertRaisesMessage(ValidationError, "already assigned or awaiting payment"):
                        bulk_edit_roster_period(self.period, [op], self.owner)
                    self.assert_unchanged(state)
            self.slot.assignments.all().delete()

    def test_roster_patch_refuses_protected_occurrences(self):
        for state in ("assigned", "payment_pending"):
            self.protect(state)
            with self.subTest(state=state):
                response = client_for(self.owner).patch(
                    f"/api/v1/roster-shifts/{self.shift.pk}/", {"user_id": self.worker.pk}, format="json",
                )
                self.assertEqual(response.status_code, 400, response.data)
                self.assertIn("already assigned or awaiting payment", str(response.data))
                self.assert_unchanged(state)
            self.slot.assignments.all().delete()

    def test_move_date_and_assign_cannot_evade_payment_pending_guard(self):
        self.protect("payment_pending")
        target = self.period.week_start if self.day != self.period.week_start else self.day + timedelta(days=1)
        with self.assertRaisesMessage(ValidationError, "already assigned or awaiting payment"):
            bulk_edit_roster_period(self.period, [{
                "action": "move_shift", "slot_id": self.slot.pk,
                "target_date": str(target), "target_user_id": self.worker.pk,
            }], self.owner)
        self.slot.refresh_from_db()
        self.assertEqual(self.slot.date, self.day)
        self.assert_unchanged("payment_pending")

    def book(self):
        offer = ShiftOffer.objects.create(shift=self.shift, slot=self.slot, offered_slot_date=self.day,
                                          user=self.worker, status=ShiftOffer.Status.ACCEPTED)
        return ShiftSlotAssignment.objects.create(shift=self.shift, slot=self.slot, slot_date=self.day,
                                                  user=self.worker, is_rostered=True, source_offer=offer)

    def other_day(self):
        return self.period.week_start if self.day != self.period.week_start else self.day + timedelta(days=1)

    def test_move_without_worker_refuses_booked_or_pending_occurrences(self):
        for state in ("booked", "payment_pending"):
            self.book() if state == "booked" else self.protect(state)
            for op in ({"target_date": str(self.other_day())}, {"target_user_id": None}):
                with self.subTest(state=state, op=op):
                    with self.assertRaisesMessage(ValidationError, "already assigned or awaiting payment"):
                        bulk_edit_roster_period(self.period, [{"action": "move_shift", "slot_id": self.slot.pk, **op}],
                                                self.owner)
                    self.slot.refresh_from_db()
                    self.assertEqual(self.slot.date, self.day)
                    self.assertEqual(self.slot.assignments.count(), 1 if state == "booked" else 0)
            self.slot.assignments.all().delete()
            ShiftOffer.objects.all().delete()

    def test_slot_patch_refuses_booked_or_pending_occurrences(self):
        url = f"/api/v1/roster-shifts/{self.shift.pk}/"
        for state in ("booked", "payment_pending"):
            self.book() if state == "booked" else self.protect(state)
            for body in ({"slots": [{"id": self.slot.pk, "date": str(self.other_day())}]},
                         {"slots": [{"id": self.slot.pk}], "user_id": self.worker.pk}):
                with self.subTest(state=state, body=body):
                    response = client_for(self.owner).patch(url, body, format="json")
                    self.assertEqual(response.status_code, 400, response.data)
                    self.slot.refresh_from_db()
                    self.assertEqual(self.slot.date, self.day)
                    self.assertEqual(self.slot.assignments.count(), 1 if state == "booked" else 0)
            self.slot.assignments.all().delete()
            ShiftOffer.objects.all().delete()

    def test_roster_shift_delete_refuses_booked_or_pending_occurrences(self):
        url = f"/api/v1/roster-shifts/{self.shift.pk}/"
        for state in ("booked", "payment_pending"):
            self.book() if state == "booked" else self.protect(state)
            with self.subTest(state=state):
                self.assertEqual(client_for(self.owner).delete(url).status_code, 409)
                self.assertTrue(Shift.objects.filter(pk=self.shift.pk).exists())
                self.assertEqual(self.slot.assignments.count(), 1 if state == "booked" else 0)
            self.slot.assignments.all().delete()
            ShiftOffer.objects.all().delete()

    def test_plain_rostered_staff_stay_editable(self):
        self.protect("assigned")
        with patch("workforce.roster.bulk_edit._validate_and_price"):
            bulk_edit_roster_period(self.period, [
                {"action": "move_shift", "slot_id": self.slot.pk, "target_date": str(self.other_day())},
            ], self.owner)
        self.assertEqual(self.slot.assignments.get().slot_date, self.other_day())
        response = client_for(self.owner).delete(f"/api/v1/roster-shifts/{self.shift.pk}/")
        self.assertEqual(response.status_code, 204)
        self.assertFalse(Shift.objects.filter(pk=self.shift.pk).exists())

    def test_bulk_free_occurrence_control(self):
        with patch("workforce.roster.bulk_edit._validate_and_price"):
            bulk_edit_roster_period(self.period, [
                {"action": "assign_worker", "slot_id": self.slot.pk, "user_id": self.worker.pk},
            ], self.owner)
        self.assertEqual(self.slot.assignments.get().user_id, self.worker.pk)

    def next_week(self):
        """Make the slot weekly so next week's date is a valid occurrence to move to."""
        ShiftSlot.objects.filter(pk=self.slot.pk).update(
            is_recurring=True, recurring_days=[self.day.weekday()], recurring_end_date=self.day + timedelta(days=7))
        return self.day + timedelta(days=7)

    def test_single_assignment_patch_and_delete_refuse_booked_or_pending_occurrences(self):
        target = self.next_week()
        for state in ("booked", "payment_pending"):
            if state == "booked":
                row = self.book()
            else:
                self.protect(state)
                row = ShiftSlotAssignment.objects.create(shift=self.shift, slot=self.slot, slot_date=self.day,
                                                         user=self.worker, is_rostered=True)
            url = f"/api/v1/roster-owner/{row.pk}/"
            for body in ({"user": self.other.pk}, {"unit_rate": "99.00"}, {"slot_date": str(target)}):
                with self.subTest(state=state, body=body):
                    self.assertEqual(client_for(self.owner).patch(url, body, format="json").status_code, 400)
                    row.refresh_from_db()
                    self.assertEqual((row.user_id, row.slot_date), (self.worker.pk, self.day))
                    self.assertNotEqual(str(row.unit_rate), "99.00")
            with self.subTest(state=state, method="delete"):
                self.assertEqual(client_for(self.owner).delete(url).status_code, 400)
                self.assertTrue(ShiftSlotAssignment.objects.filter(pk=row.pk).exists())
            ShiftSlotAssignment.objects.all().delete()
            ShiftOffer.objects.all().delete()

    def test_single_assignment_patch_refuses_moving_onto_pending_date(self):
        target = self.next_week()
        row = ShiftSlotAssignment.objects.create(shift=self.shift, slot=self.slot, slot_date=self.day,
                                                 user=self.worker, is_rostered=True)
        ShiftOffer.objects.create(shift=self.shift, slot=self.slot, offered_slot_date=target, user=self.other,
                                  status=ShiftOffer.Status.ACCEPTED_AWAITING_PAYMENT)
        response = client_for(self.owner).patch(f"/api/v1/roster-owner/{row.pk}/", {"slot_date": str(target)},
                                                format="json")
        self.assertEqual(response.status_code, 400)
        row.refresh_from_db()
        self.assertEqual(row.slot_date, self.day)

    def test_single_plain_rostered_assignment_stays_editable(self):
        target = self.next_week()
        row = ShiftSlotAssignment.objects.create(shift=self.shift, slot=self.slot, slot_date=self.day,
                                                 user=self.worker, is_rostered=True)
        url = f"/api/v1/roster-owner/{row.pk}/"
        response = client_for(self.owner).patch(url, {"user": self.other.pk, "unit_rate": "55.00",
                                                      "slot_date": str(target)}, format="json")
        self.assertEqual(response.status_code, 200, response.data)
        row.refresh_from_db()
        self.assertEqual((row.user_id, str(row.unit_rate), row.slot_date), (self.other.pk, "55.00", target))
        self.assertEqual(client_for(self.owner).delete(url).status_code, 204)
        self.assertFalse(ShiftSlotAssignment.objects.filter(pk=row.pk).exists())
