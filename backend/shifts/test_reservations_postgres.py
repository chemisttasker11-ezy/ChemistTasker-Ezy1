"""Real PostgreSQL reservation-serialisation regression. Run with core.postgres_test_settings."""
from concurrent.futures import ThreadPoolExecutor
from datetime import date, time, timedelta
from decimal import Decimal
from threading import Barrier
from unittest import mock

from django.db import close_old_connections, connection, transaction
from django.test import TransactionTestCase
from django.utils import timezone

from client_profile.characterization_support import make_owner_with_pharmacy, make_user
from billing.views import _finalize_pending_offers_for_shift
from shifts.models import Shift, ShiftOffer, ShiftSlot, ShiftSlotAssignment
from shifts.reservations import expire_overdue_reservations


class ReservationPostgresConcurrencyTests(TransactionTestCase):
    def setUp(self):
        self.owner, self.pharmacy = make_owner_with_pharmacy("Race pharmacy")
        self.workers = [make_user("PHARMACIST"), make_user("PHARMACIST")]
        self.shift = Shift.objects.create(
            pharmacy=self.pharmacy, created_by=self.owner, role_needed="PHARMACIST",
            employment_type="LOCUM", single_user_only=False, visibility="LOCUM_CASUAL",
            payment_status="PENDING",
        )
        self.slot = ShiftSlot.objects.create(
            shift=self.shift, date=date.today() + timedelta(days=5),
            start_time=time(9, 0), end_time=time(17, 0), rate=Decimal("70.00"),
        )

    def _run_parallel(self, callables):
        gate = Barrier(len(callables))

        def runner(fn):
            close_old_connections()
            try:
                gate.wait(timeout=10)
                return fn()
            finally:
                connection.close()

        with ThreadPoolExecutor(max_workers=len(callables)) as pool:
            jobs = [pool.submit(runner, fn) for fn in callables]
            return [job.result(timeout=30) for job in jobs]

    def test_two_payments_for_same_occurrence_cannot_confirm_two_workers(self):
        if connection.vendor != "postgresql":
            self.skipTest("Row-lock race requires PostgreSQL")
        offers = [
            ShiftOffer.objects.create(
                shift=self.shift, slot=self.slot, user=worker,
                status=ShiftOffer.Status.ACCEPTED_AWAITING_PAYMENT,
                payment_due_at=timezone.now() + timedelta(hours=2),
            )
            for worker in self.workers
        ]

        def settle(pk):
            with transaction.atomic():
                locked = Shift.objects.select_for_update().get(pk=self.shift.pk)
                return _finalize_pending_offers_for_shift(
                    locked, offer_ids=[pk],
                )
        # The first winner expires the competing offer in the same slot.
        results = self._run_parallel([lambda: settle(offers[0].pk),
                                      lambda: settle(offers[1].pk)])
        self.assertEqual(sorted(results), [0, 1])
        self.assertEqual(
            ShiftSlotAssignment.objects.filter(shift=self.shift, slot=self.slot).count(), 1,
        )
        statuses = list(ShiftOffer.objects.filter(shift=self.shift).values_list("status", flat=True))
        self.assertEqual(statuses.count(ShiftOffer.Status.ACCEPTED), 1)
        self.assertEqual(statuses.count(ShiftOffer.Status.EXPIRED), 1)

    def test_concurrent_sweep_does_not_release_confirmed_reservation(self):
        if connection.vendor != "postgresql":
            self.skipTest("Row-lock race requires PostgreSQL")
        offer = ShiftOffer.objects.create(
            shift=self.shift, slot=self.slot, user=self.workers[0],
            status=ShiftOffer.Status.ACCEPTED_AWAITING_PAYMENT,
            payment_due_at=timezone.now() - timedelta(seconds=1),
        )
        # At the payment deadline the sweep has authority; a simultaneous
        # settlement must never yield both EXPIRED and an assignment.
        def sweep():
            return expire_overdue_reservations(now=timezone.now())
        def settle():
            with transaction.atomic():
                locked = Shift.objects.select_for_update().get(pk=self.shift.pk)
                return _finalize_pending_offers_for_shift(locked, offer_ids=[offer.pk])
        with mock.patch("shifts.reservations.expiry_notification"):
            self._run_parallel([sweep, settle])
        offer.refresh_from_db()
        self.assertEqual(offer.status, ShiftOffer.Status.EXPIRED)
        self.assertFalse(ShiftSlotAssignment.objects.filter(source_offer=offer).exists())
