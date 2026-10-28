"""Deterministic edit/booking interleaving against a disposable database."""
from datetime import date, time
from unittest import mock

from django.contrib.auth import get_user_model
from django.db import connection
from django.test import TestCase
from rest_framework.exceptions import ValidationError
from organizations.models import OwnerOnboarding, Pharmacy
from shifts.models import Shift, ShiftSlot, ShiftSlotAssignment
from shifts.posting import revise_shift, normalize_slots_payload


class ShiftPostingLockTests(TestCase):
    def setUp(self):
        users = get_user_model()
        self.owner = users.objects.create(username="posting_owner", email="posting-owner@example.invalid", role="OWNER")
        self.worker = users.objects.create(username="posting_worker", email="posting-worker@example.invalid", role="PHARMACIST")
        profile = OwnerOnboarding.objects.create(user=self.owner)
        self.pharmacy = Pharmacy.objects.create(name="Posting lock", owner=profile)
        self.shift = Shift.objects.create(
            pharmacy=self.pharmacy, created_by=self.owner, role_needed="PHARMACIST", description="Original",
        )
        self.slot = ShiftSlot.objects.create(
            shift=self.shift, date=date(2026, 11, 2), start_time=time(9), end_time=time(17),
        )
        self.payload = [{"date": date(2026, 11, 3), "start_time": time(10), "end_time": time(18), "rate": "95"}]

    def book(self):
        return ShiftSlotAssignment.objects.create(
            shift=self.shift, slot=self.slot, user=self.worker, slot_date=self.slot.date,
        )

    def test_booking_arriving_during_validation_prevents_replacement(self):
        booking_ids = []

        def validate_then_book(payload):
            result = normalize_slots_payload(payload)
            booking_ids.append(self.book().pk)
            return result

        original_lock = Shift.objects.select_for_update

        def lock_inside_transaction(*args, **kwargs):
            self.assertTrue(connection.in_atomic_block)
            return original_lock(*args, **kwargs)

        with mock.patch("shifts.posting.normalize_slots_payload", side_effect=validate_then_book), mock.patch.object(
            Shift.objects, "select_for_update", side_effect=lock_inside_transaction,
        ) as lock:
            with self.assertRaises(ValidationError):
                revise_shift(self.shift, {"description": "Changed"}, slots_payload=self.payload)
            lock.assert_called_once()
        self.shift.refresh_from_db()
        self.assertEqual(self.shift.description, "Original")
        self.assertEqual(list(self.shift.slots.values_list("pk", flat=True)), [self.slot.pk])
        self.assertEqual(list(self.shift.slot_assignments.values_list("pk", flat=True)), booking_ids)

    def test_unbooked_shift_still_replaces_slots(self):
        revise_shift(self.shift, {"description": "Changed"}, slots_payload=self.payload)
        self.shift.refresh_from_db()
        self.assertEqual(self.shift.description, "Changed")
        slot = self.shift.slots.get()
        self.assertEqual((slot.date, slot.start_time, str(slot.rate)), (date(2026, 11, 3), time(10), "95.00"))

    def test_text_edit_keeps_confirmed_booking(self):
        booking = self.book()
        revise_shift(self.shift, {"description": "Changed"})
        self.shift.refresh_from_db()
        booking.refresh_from_db()
        self.assertEqual(self.shift.description, "Changed")
        self.assertEqual(booking.slot_id, self.slot.pk)
