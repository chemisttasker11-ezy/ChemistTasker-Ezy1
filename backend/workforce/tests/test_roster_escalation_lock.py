"""Real PostgreSQL race: a booking finalized while an escalation waits must survive the escalation's delete."""
import time as clock
from datetime import time, timedelta
from queue import Queue
from threading import Event, Thread
from unittest import skipUnless

from django.db import close_old_connections, connection, transaction
from django.test import TransactionTestCase
from django.utils import timezone
from rest_framework.test import APIClient

from client_profile.characterization_support import make_owner_with_pharmacy, make_user
from shifts.models import Shift, ShiftOffer, ShiftSlot, ShiftSlotAssignment
from users.models import User


@skipUnless(connection.vendor == "postgresql", "Requires real PostgreSQL row locks and independent transactions.")
class RosterEscalationLockTests(TransactionTestCase):
    def setUp(self):
        self.owner, self.pharmacy = make_owner_with_pharmacy("Escalation lock")
        self.day = timezone.localdate() + timedelta(days=14)
        self.shift = Shift.objects.create(
            pharmacy=self.pharmacy, created_by=self.owner, role_needed="PHARMACIST", employment_type="LOCUM",
            visibility="FULL_PART_TIME",
        )
        self.rostered = ShiftSlot.objects.create(shift=self.shift, date=self.day, start_time=time(9), end_time=time(13))
        self.open_slot = ShiftSlot.objects.create(shift=self.shift, date=self.day, start_time=time(14),
                                                  end_time=time(18))
        ShiftSlotAssignment.objects.create(shift=self.shift, slot=self.rostered, slot_date=self.day,
                                           user=make_user("PHARMACIST"), is_rostered=True)
        self.booked_worker = make_user("PHARMACIST")

    def run_thread(self, results, name, command):
        close_old_connections()
        try:
            with connection.cursor() as cursor:
                cursor.execute("SET lock_timeout = '10s'")
            results.put((name, command()))
        except Exception as exc:
            results.put((name, repr(exc)))
        finally:
            connection.close()

    def test_a_booking_finalized_while_escalation_waits_is_not_erased(self):
        locked = Event()
        results = Queue()

        def finalize_booking():
            with transaction.atomic():   # the same locks as offer finalization: shift, then its slots
                Shift.objects.select_for_update().get(pk=self.shift.pk)
                list(ShiftSlot.objects.select_for_update().filter(shift_id=self.shift.pk).order_by("pk"))
                locked.set()
                for _ in range(100):   # wait until the escalation is blocked on one of our locks
                    with connection.cursor() as cursor:
                        cursor.execute(
                            "SELECT 1 FROM pg_stat_activity WHERE datname = current_database() "
                            "AND wait_event_type = 'Lock' AND pid <> pg_backend_pid()")
                        if cursor.fetchone():
                            break
                    clock.sleep(0.05)
                offer = ShiftOffer.objects.create(shift_id=self.shift.pk, slot_id=self.open_slot.pk,
                                                  offered_slot_date=self.day, user=self.booked_worker,
                                                  status=ShiftOffer.Status.ACCEPTED)
                return ShiftSlotAssignment.objects.create(
                    shift_id=self.shift.pk, slot_id=self.open_slot.pk, slot_date=self.day, user=self.booked_worker,
                    is_rostered=True, source_offer=offer).pk

        def escalate():
            self.assertTrue(locked.wait(timeout=10))
            client = APIClient()
            client.force_authenticate(User.objects.get(pk=self.owner.pk))
            client.raise_request_exception = False
            response = client.post(f"/api/v1/roster-shifts/{self.shift.pk}/escalate/",
                                   {"target_visibility": "LOCUM_CASUAL"}, format="json")
            return response.status_code, str(response.data)

        threads = [Thread(target=self.run_thread, args=(results, name, command), daemon=True)
                   for name, command in (("finalize", finalize_booking), ("escalate", escalate))]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join(timeout=30)
        self.assertTrue(all(not thread.is_alive() for thread in threads), "A transaction did not finish.")
        outcomes = dict(results.get(timeout=2) for _ in threads)
        booked_id = outcomes["finalize"]
        self.assertIsInstance(booked_id, int, outcomes)
        self.assertTrue(ShiftSlotAssignment.objects.filter(pk=booked_id).exists(), outcomes)
        self.assertEqual(outcomes["escalate"][0], 400, outcomes)
        self.assertIn("already assigned or awaiting payment", outcomes["escalate"][1])
        self.assertEqual(Shift.objects.get(pk=self.shift.pk).visibility, "FULL_PART_TIME")
