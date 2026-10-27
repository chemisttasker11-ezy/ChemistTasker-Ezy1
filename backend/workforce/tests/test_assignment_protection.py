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

    def test_bulk_free_occurrence_control(self):
        with patch("workforce.roster.bulk_edit._validate_and_price"):
            bulk_edit_roster_period(self.period, [
                {"action": "assign_worker", "slot_id": self.slot.pk, "user_id": self.worker.pk},
            ], self.owner)
        self.assertEqual(self.slot.assignments.get().user_id, self.worker.pk)
