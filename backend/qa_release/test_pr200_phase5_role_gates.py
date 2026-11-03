"""Frozen-main PR200 Phase 5: manual roster qualification and offer reservations.

Only isolated Django HTTP scenarios. Positive control first. These red
negative assertions do not prove Stripe external charges or race timing.
"""
from datetime import timedelta, time
from unittest.mock import patch

from django.test import TestCase
from django.utils import timezone

from client_profile.characterization_support import (
    client_for, make_owner_with_pharmacy, make_staff_member,
)
from shifts.models import Shift, ShiftSlot, ShiftSlotAssignment, ShiftOffer
from billing.utils import BILLING_STATE_PAYMENT_REQUIRED


class Phase5ManualRosterRole(TestCase):
    def setUp(self):
        self.owner, self.pharmacy = make_owner_with_pharmacy("PR200 Qualification")
        self.worker, self.membership = make_staff_member(
            self.pharmacy, role="TECHNICIAN",
        )
        self.membership.employment_type = "FULL_TIME"
        self.membership.save(update_fields=["employment_type"])
        self.day = timezone.localdate() + timedelta(days=5)

    def _shift_and_slot(self, role):
        shift = Shift.objects.create(
            pharmacy=self.pharmacy, created_by=self.owner,
            role_needed=role, employment_type="FULL_TIME",
            visibility="FULL_PART_TIME", min_hourly_rate=75, max_hourly_rate=75,
        )
        slot = ShiftSlot.objects.create(
            shift=shift, date=self.day,
            start_time=time(9, 0), end_time=time(17, 0),
        )
        return shift, slot

    def _manual(self, shift, slot):
        return client_for(self.owner).post(
            f"/api/v1/shifts/{shift.pk}/manual-assign/",
            {
                "user_id": self.worker.pk,
                "assignments": [
                    {"slot_id": slot.pk, "slot_date": self.day.isoformat()},
                ],
            },
            format="json",
        )

    def test_c020_n1_manual_pharmacist_slot_rejects_technician(self):
        # Isolate actual manual roster authorization from unrelated payroll
        # configuration: valid same-role assignment must succeed first.
        with patch("shifts.assignment.staff_assignment_defaults", return_value={}), patch(
            "shifts.assignment.notify_shift_users"
        ):
            technician_shift, technician_slot = self._shift_and_slot("TECHNICIAN")
            allowed = self._manual(technician_shift, technician_slot)
            self.assertEqual(allowed.status_code, 200, allowed.data)
            self.assertTrue(ShiftSlotAssignment.objects.filter(
                shift=technician_shift, user=self.worker,
            ).exists())

            pharmacist_shift, pharmacist_slot = self._shift_and_slot("PHARMACIST")
            denied = self._manual(pharmacist_shift, pharmacist_slot)
            self.assertIn(denied.status_code, (400, 403), denied.data)
            self.assertFalse(ShiftSlotAssignment.objects.filter(
                shift=pharmacist_shift, user=self.worker,
            ).exists())


class Phase5OfferPaymentReservation(TestCase):
    def test_b54_two_pending_workers_cannot_both_reserve_one_paid_slot(self):
        owner, pharmacy = make_owner_with_pharmacy("PR200 Paid Reservation")
        worker_a, member_a = make_staff_member(pharmacy, role="TECHNICIAN")
        worker_b, member_b = make_staff_member(pharmacy, role="TECHNICIAN")
        for member in (member_a, member_b):
            member.employment_type = "FULL_TIME"
            member.save(update_fields=["employment_type"])
        day = timezone.localdate() + timedelta(days=5)
        shift = Shift.objects.create(
            pharmacy=pharmacy, created_by=owner,
            role_needed="TECHNICIAN", employment_type="FULL_TIME",
            visibility="FULL_PART_TIME", single_user_only=False,
            min_hourly_rate=75, max_hourly_rate=75,
        )
        slot = ShiftSlot.objects.create(
            shift=shift, date=day, rate=75,
            start_time=time(9, 0), end_time=time(17, 0),
        )
        offer_a = ShiftOffer.objects.create(
            shift=shift, slot=slot, user=worker_a,
            offered_slot_date=day, offered_start_time=slot.start_time,
            offered_end_time=slot.end_time, offered_rate=75,
        )
        offer_b = ShiftOffer.objects.create(
            shift=shift, slot=slot, user=worker_b,
            offered_slot_date=day, offered_start_time=slot.start_time,
            offered_end_time=slot.end_time, offered_rate=75,
        )
        with (
            patch("billing.utils.get_billing_state_for_pharmacy",
                  return_value=BILLING_STATE_PAYMENT_REQUIRED),
            patch("shifts.offers.notify_shift_users"),
            patch("shifts.offers.async_task"),
        ):
            first = client_for(worker_a).post(
                f"/api/v1/shift-offers/{offer_a.pk}/accept/", {}, format="json",
            )
            self.assertEqual(first.status_code, 200, first.data)
            offer_a.refresh_from_db()
            self.assertEqual(
                offer_a.status, ShiftOffer.Status.ACCEPTED_AWAITING_PAYMENT,
                "First valid worker must reserve slot pending owner payment.",
            )

            second = client_for(worker_b).post(
                f"/api/v1/shift-offers/{offer_b.pk}/accept/", {}, format="json",
            )
        self.assertIn(second.status_code, (400, 403, 409), second.data)
        offer_b.refresh_from_db()
        self.assertNotEqual(
            offer_b.status, ShiftOffer.Status.ACCEPTED_AWAITING_PAYMENT,
            "Second worker must not reserve a paid slot already reserved by another.",
        )
        self.assertEqual(
            ShiftOffer.objects.filter(
                shift=shift, slot=slot,
                status=ShiftOffer.Status.ACCEPTED_AWAITING_PAYMENT,
            ).count(), 1,
        )
