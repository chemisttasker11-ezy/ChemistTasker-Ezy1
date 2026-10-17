"""D01=C, D02=generous, D03=B reservation acceptance tests."""
from datetime import date, datetime, time, timedelta
from unittest import mock

from django.db import connection
from django.test import TestCase, TransactionTestCase
from django.utils import timezone

from client_profile.characterization_support import make_owner_with_pharmacy, make_user
from shifts.models import Shift, ShiftOffer, ShiftSlot, ShiftSlotAssignment
from shifts.reservations import (
    expire_overdue_reservations, payment_deadline, reservation_available,
)


class ReservationPolicyTests(TestCase):
    def setUp(self):
        self.owner, self.pharmacy = make_owner_with_pharmacy("Reservation pharmacy")
        self.worker = make_user("PHARMACIST")
        self.shift = Shift.objects.create(
            pharmacy=self.pharmacy, created_by=self.owner,
            role_needed="PHARMACIST", employment_type="LOCUM",
            single_user_only=False, visibility="LOCUM_CASUAL",
        )

    def offer_at(self, lead):
        local = timezone.localtime(timezone.now() + lead)
        slot = ShiftSlot.objects.create(
            shift=self.shift, date=local.date(), start_time=local.time().replace(microsecond=0),
            end_time=(local + timedelta(hours=1)).time().replace(microsecond=0),
        )
        return ShiftOffer.objects.create(
            shift=self.shift, slot=slot, user=self.worker,
            status=ShiftOffer.Status.ACCEPTED_AWAITING_PAYMENT,
        )

    @mock.patch("shifts.reservations.start_at")
    def test_generous_deadline_bands_and_start_cap(self, start_at):
        now = timezone.now().replace(microsecond=0)
        for lead, minutes in [(timedelta(hours=72), 24 * 60),
                              (timedelta(hours=48), 6 * 60),
                              (timedelta(hours=13), 6 * 60),
                              (timedelta(hours=12), 120),
                              (timedelta(hours=3), 120),
                              (timedelta(hours=2), 30),
                              (timedelta(minutes=20), 20)]:
            with self.subTest(lead=str(lead)):
                start_at.return_value = now + lead
                self.assertEqual(payment_deadline(self.shift, None, now=now), now + timedelta(minutes=minutes))
        start_at.return_value = now
        self.assertIsNone(payment_deadline(self.shift, None, now=now))

    def test_expiry_restores_same_audience_and_is_idempotent(self):
        offer = self.offer_at(timedelta(days=5))
        offer.payment_due_at = timezone.now() - timedelta(minutes=2)
        offer.save(update_fields=["payment_due_at"])
        self.shift.payment_status = "PENDING"
        self.shift.save(update_fields=["payment_status"])
        with mock.patch("shifts.reservations.expiry_notification") as notice:
            with self.captureOnCommitCallbacks(execute=True):
                self.assertEqual(expire_overdue_reservations(), 1)
            offer.refresh_from_db()
            self.shift.refresh_from_db()
            self.assertEqual(offer.status, ShiftOffer.Status.EXPIRED)
            self.assertIsNotNone(offer.payment_expired_at)
            self.assertEqual(self.shift.payment_status, "NOT_REQUIRED")
            self.assertEqual(self.shift.visibility, "LOCUM_CASUAL")
            self.assertEqual(ShiftSlotAssignment.objects.count(), 0)
            self.assertFalse(reservation_available(offer))
            self.assertEqual(expire_overdue_reservations(), 0)
            notice.assert_called_once_with(offer.pk)

    def test_future_reservation_stays_locked(self):
        offer = self.offer_at(timedelta(days=3))
        offer.payment_due_at = timezone.now() + timedelta(minutes=20)
        offer.save(update_fields=["payment_due_at"])
        self.assertTrue(reservation_available(offer))
        self.assertEqual(expire_overdue_reservations(), 0)
        offer.refresh_from_db()
        self.assertEqual(offer.status, ShiftOffer.Status.ACCEPTED_AWAITING_PAYMENT)

    def test_expire_only_overdue_occurrence_and_leave_other_reservation(self):
        first = self.offer_at(timedelta(days=4))
        second = self.offer_at(timedelta(days=6))
        first.payment_due_at = timezone.now() - timedelta(minutes=1)
        second.payment_due_at = timezone.now() + timedelta(hours=1)
        first.save(update_fields=["payment_due_at"])
        second.save(update_fields=["payment_due_at"])
        self.shift.payment_status = "PENDING"
        self.shift.save(update_fields=["payment_status"])
        with self.captureOnCommitCallbacks(execute=False):
            self.assertEqual(expire_overdue_reservations(), 1)
        self.shift.refresh_from_db()
        self.assertEqual(self.shift.payment_status, "PENDING")
        second.refresh_from_db()
        self.assertEqual(second.status, ShiftOffer.Status.ACCEPTED_AWAITING_PAYMENT)


class PostgresReservationLockContract(TransactionTestCase):
    """Actual row locks run in PostgreSQL CI. SQLite has different lock semantics."""
    def test_lock_support_is_enabled_on_postgres(self):
        if connection.vendor == "postgresql":
            self.assertTrue(connection.features.has_select_for_update)
        else:
            self.assertEqual(connection.vendor, "sqlite")
