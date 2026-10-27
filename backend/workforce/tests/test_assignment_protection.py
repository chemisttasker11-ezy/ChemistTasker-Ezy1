"""Both roster editors refuse to overwrite assigned or payment-pending occurrences."""
from datetime import time, timedelta
from unittest.mock import patch

from django.core.exceptions import ValidationError
from django.test import TestCase
from django.utils import timezone

from client_profile.characterization_support import client_for, make_owner_with_pharmacy, make_user
from memberships.models import Membership
from shifts.models import Shift, ShiftOffer, ShiftSlot, ShiftSlotAssignment, WorkerShiftRequest
from workforce.models import RosterActionAudit, RosterPeriod
from workforce.roster.bulk_edit import bulk_edit_roster_period
from workforce.roster.worker_actions import (
    approve_cover_replacement, approve_direct_swap, release_worker_from_assignment,
)


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

    def row(self, state, slot_date=None):
        """The worker's row on an occurrence that is booked, payment-pending (another worker's offer) or plain."""
        slot_date = slot_date or self.day
        offer = None
        if state == "booked":
            offer = ShiftOffer.objects.create(shift=self.shift, slot=self.slot, offered_slot_date=slot_date,
                                              user=self.worker, status=ShiftOffer.Status.ACCEPTED)
        elif state == "payment_pending":
            ShiftOffer.objects.create(shift=self.shift, slot=self.slot, offered_slot_date=slot_date, user=self.other,
                                      status=ShiftOffer.Status.ACCEPTED_AWAITING_PAYMENT)
        return ShiftSlotAssignment.objects.create(shift=self.shift, slot=self.slot, slot_date=slot_date,
                                                  user=self.worker, is_rostered=True, source_offer=offer)

    def reset(self):
        ShiftSlotAssignment.objects.all().delete()
        ShiftOffer.objects.all().delete()

    def test_roster_patch_clear_and_recurring_cleanup_refuse_booked_or_pending_occurrences(self):
        url = f"/api/v1/roster-shifts/{self.shift.pk}/"
        later = self.next_week()
        for state in ("booked", "payment_pending"):
            for slot_date, body in ((self.day, {"user_id": None}), (later, {"user_id": self.worker.pk})):
                row = self.row(state, slot_date)
                with self.subTest(state=state, body=body):
                    self.assertEqual(client_for(self.owner).patch(url, body, format="json").status_code, 400)
                    self.assertTrue(ShiftSlotAssignment.objects.filter(pk=row.pk, slot_date=slot_date).exists())
                self.reset()

    def test_roster_patch_still_clears_and_cleans_up_plain_rostered_rows(self):
        url = f"/api/v1/roster-shifts/{self.shift.pk}/"
        self.row("plain", self.next_week())
        self.assertEqual(client_for(self.owner).patch(url, {"user_id": self.worker.pk}, format="json").status_code, 200)
        self.assertEqual(list(self.slot.assignments.values_list("slot_date", flat=True)), [self.day])
        self.assertEqual(client_for(self.owner).patch(url, {"user_id": None}, format="json").status_code, 200)
        self.assertFalse(self.slot.assignments.exists())

    def test_bulk_unassign_and_time_edits_refuse_booked_or_pending_occurrences_and_keep_their_rate(self):
        # Bulk edits refuse recurring slots outright (edit_guards._protect_marketplace_slot), so only slot.date counts.
        for state in ("booked", "payment_pending"):
            row = self.row(state)
            # A staff member's accepted offer would otherwise be repriced from their staff terms.
            ShiftSlotAssignment.objects.filter(pk=row.pk).update(
                engagement_kind="STAFF_EMPLOYMENT", unit_rate="99.99",
                engagement_terms_snapshot={"settlement_channel": "TIMESHEET_ONLY"})
            for op in ({"action": "update_slot_times", "slot_id": self.slot.pk, "start_time": "10:00",
                        "end_time": "18:00", "planned_break_minutes": 30},
                       {"action": "unassign_worker", "assignment_id": row.pk}):
                with self.subTest(state=state, action=op["action"]):
                    with self.assertRaisesMessage(ValidationError, "already assigned or awaiting payment"):
                        bulk_edit_roster_period(self.period, [op], self.owner)
                    row.refresh_from_db()
                    self.slot.refresh_from_db()
                    self.assertEqual((self.slot.start_time, self.slot.planned_break_minutes, str(row.unit_rate)),
                                     (time(9), 0, "99.99"))
            self.reset()

    def test_bulk_unassign_and_time_edits_keep_plain_rostered_rows_editable(self):
        row = self.row("plain")
        with patch("workforce.roster.bulk_edit._validate_and_price"):
            bulk_edit_roster_period(self.period, [
                {"action": "update_slot_times", "slot_id": self.slot.pk, "start_time": "10:00", "end_time": "18:00"},
                {"action": "unassign_worker", "assignment_id": row.pk},
            ], self.owner)
        self.slot.refresh_from_db()
        self.assertEqual(self.slot.start_time, time(10))
        self.assertFalse(ShiftSlotAssignment.objects.filter(pk=row.pk).exists())

    def worker_request(self, row, swap_to=None):
        req = WorkerShiftRequest.objects.create(pharmacy=self.pharmacy, requested_by=self.worker, shift=row,
                                                role="PHARMACIST", slot_date=row.slot_date, start_time=time(9),
                                                end_time=time(17), status="PENDING")
        if swap_to:
            RosterActionAudit.objects.create(pharmacy=self.pharmacy, shift_assignment=row, performed_by=self.worker,
                                             action_type=RosterActionAudit.ActionType.SWAP_REQUESTED,
                                             target_user=swap_to, details={"request_id": req.pk})
        return req

    def manager_actions(self, row):
        return {
            "swap": lambda: approve_direct_swap(self.worker_request(row, swap_to=self.other), self.owner),
            "cover": lambda: approve_cover_replacement(self.worker_request(row), self.other, self.owner),
            "release": lambda: release_worker_from_assignment(self.worker_request(row), self.owner),
        }

    def test_swap_cover_and_release_refuse_booked_or_pending_occurrences(self):
        Membership.objects.create(user=self.other, pharmacy=self.pharmacy, role="PHARMACIST",
                                  employment_type="FULL_TIME", status=Membership.Status.ACCEPTED, is_active=True)
        for state in ("booked", "payment_pending"):
            row = self.row(state)
            for name, approve in self.manager_actions(row).items():
                with self.subTest(state=state, action=name):
                    with self.assertRaisesMessage(ValidationError, "cancel the booking"):
                        approve()
                    self.assertEqual(ShiftSlotAssignment.objects.get(pk=row.pk).user_id, self.worker.pk)
            with self.subTest(state=state, action="worker-shift-requests approve"):
                req = self.worker_request(row)
                response = client_for(self.owner).post(f"/api/v1/worker-shift-requests/{req.pk}/approve/")
                self.assertEqual(response.status_code, 400, response.data)
                self.assertTrue(ShiftSlotAssignment.objects.filter(pk=row.pk).exists())
            self.reset()

    def test_swap_cover_and_release_keep_working_for_plain_rostered_rows(self):
        Membership.objects.create(user=self.other, pharmacy=self.pharmacy, role="PHARMACIST",
                                  employment_type="FULL_TIME", status=Membership.Status.ACCEPTED, is_active=True)
        for name in ("swap", "cover", "release"):
            row = self.row("plain")
            with self.subTest(action=name):
                self.manager_actions(row)[name]()
                remaining = ShiftSlotAssignment.objects.filter(pk=row.pk)
                self.assertEqual(list(remaining.values_list("user_id", flat=True)),
                                 [] if name == "release" else [self.other.pk])
            self.reset()

    def test_escalate_refuses_booked_or_pending_occurrences(self):
        url = f"/api/v1/roster-shifts/{self.shift.pk}/escalate/"
        Shift.objects.filter(pk=self.shift.pk).update(visibility="FULL_PART_TIME", escalation_level=0)
        for state in ("booked", "payment_pending"):
            row = self.row(state)
            with self.subTest(state=state):
                response = client_for(self.owner).post(url, {}, format="json")
                self.assertEqual(response.status_code, 400, response.data)
                self.assertIn("already assigned or awaiting payment", str(response.data))
                self.assertTrue(ShiftSlotAssignment.objects.filter(pk=row.pk).exists())
            self.reset()
        row = self.row("plain")
        response = client_for(self.owner).post(url, {}, format="json")
        self.assertEqual(response.status_code, 200, response.data)
        self.assertFalse(ShiftSlotAssignment.objects.filter(pk=row.pk).exists())
