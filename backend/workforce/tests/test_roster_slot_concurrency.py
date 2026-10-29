"""Real PostgreSQL transactions for the F01 edit/publication lock contract."""
from datetime import date, time, timedelta
from queue import Queue
from threading import Barrier, Thread
from unittest import mock, skipUnless

from django.core.exceptions import ValidationError
from django.db import OperationalError, close_old_connections, connection, transaction
from django.test import TransactionTestCase
from django.test.utils import CaptureQueriesContext
from rest_framework.test import APIClient

from client_profile.characterization_support import make_owner_with_pharmacy, make_user
from memberships.models import Membership
from shifts.models import Shift, ShiftSlot, ShiftSlotAssignment
from users.models import User
from workforce.models import RosterPeriod
from workforce.roster.publication import (
    get_worker_published_roster,
    republish_roster_shift,
    unpublish_roster_period,
    unpublish_roster_shift,
)


@skipUnless(connection.vendor == "postgresql", "Requires real PostgreSQL row locks and independent transactions.")
class RosterSlotConcurrencyTests(TransactionTestCase):
    def setUp(self):
        self.owner, self.pharmacy = make_owner_with_pharmacy("F01 Concurrent Pharmacy")
        self.worker = make_user("PHARMACIST")
        Membership.objects.create(
            user=self.worker, pharmacy=self.pharmacy, role="PHARMACIST", employment_type="FULL_TIME",
            status=Membership.Status.ACCEPTED, is_active=True,
        )
        self.week = date(2030, 1, 7)
        self.period = RosterPeriod.objects.create(
            pharmacy=self.pharmacy, week_start=self.week, created_by=self.owner,
        )
        self.shift = Shift.objects.create(
            pharmacy=self.pharmacy, role_needed="PHARMACIST", is_roster_container=True, created_by=self.owner,
        )
        self.slot = ShiftSlot.objects.create(
            shift=self.shift, date=self.week, start_time=time(9), end_time=time(17), roster_period=self.period,
        )
        self.assignment = ShiftSlotAssignment.objects.create(
            shift=self.shift, slot=self.slot, slot_date=self.week, user=self.worker, is_rostered=True,
        )
        RosterPeriod.objects.filter(pk=self.period.pk).update(status=RosterPeriod.Status.PUBLISHED)
        unpublish_roster_shift(self.slot, self.owner)

    def patch(self, *, shift_id=None, slot_id=None, work_date=None):
        client = APIClient()
        client.force_authenticate(User.objects.get(pk=self.owner.pk))
        client.raise_request_exception = False
        response = client.patch(
            f"/api/v1/roster-shifts/{shift_id or self.shift.pk}/",
            {"slots": [{"id": slot_id or self.slot.pk,
                        "date": str(work_date or self.week), "end_time": "18:00"}]},
            format="json",
        )
        return response.status_code, str(response.data)

    def race(self, commands):
        barrier = Barrier(len(commands))
        results = Queue()

        def run(name, command):
            close_old_connections()
            try:
                with connection.cursor() as cursor:
                    cursor.execute("SET lock_timeout = '5s'")
                    cursor.execute("SET statement_timeout = '10s'")
                barrier.wait(timeout=10)
                result = command()
                results.put((name, "result", result))
            except ValidationError as exc:
                results.put((name, "validation", str(exc)))
            except Exception as exc:
                results.put((name, "unexpected", repr(exc)))
            finally:
                connection.close()

        threads = [Thread(target=run, args=(name, command), daemon=True) for name, command in commands]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join(timeout=20)
        self.assertTrue(all(not thread.is_alive() for thread in threads), "A roster transaction did not finish.")
        outcomes = {name: (kind, value) for name, kind, value in [results.get(timeout=2) for _ in commands]}
        self.assertFalse(any(kind == "unexpected" for kind, _ in outcomes.values()), outcomes)
        return outcomes

    def test_http_edit_locks_period_before_worker_shift_slot_and_assignment(self):
        with CaptureQueriesContext(connection) as captured:
            status, body = self.patch()
        self.assertEqual(status, 200, body)
        positions = []
        for model in (RosterPeriod, User, Shift, ShiftSlot, ShiftSlotAssignment):
            table = f'"{model._meta.db_table}"'
            indices = [index for index, query in enumerate(captured.captured_queries)
                       if "FOR UPDATE" in query["sql"].upper() and table in query["sql"]]
            self.assertTrue(indices, f"Missing lock for {table}")
            positions.append(indices[0])
        self.assertEqual(positions, sorted(positions))

    def test_roster_lock_does_not_hide_unrelated_database_failures(self):
        from workforce.roster.slot_locking import lock_roster_shifts

        error = OperationalError("Connection interrupted")
        error.__cause__ = type("ConnectionFailure", (Exception,), {"sqlstate": "08006"})()
        with transaction.atomic(), mock.patch.object(Shift.objects, "select_for_update", side_effect=error):
            with self.assertRaises(OperationalError) as raised:
                lock_roster_shifts([self.shift.pk])
            self.assertIs(raised.exception, error)

    def test_edit_and_republish_cannot_leave_an_editable_published_row_or_lose_identity(self):
        def republish():
            row = ShiftSlot.objects.get(pk=self.slot.pk)
            republish_roster_shift(row, User.objects.get(pk=self.owner.pk), notify="none")
            return "published"

        outcomes = self.race([("edit", self.patch), ("publish", republish)])
        edit_kind, edit_result = outcomes["edit"]
        self.assertEqual(edit_kind, "result", outcomes)
        self.assertIn(edit_result[0], (200, 400), outcomes)
        self.slot.refresh_from_db()
        self.assignment.refresh_from_db()
        self.assertEqual(self.assignment.slot_id, self.slot.pk)
        self.assertEqual(self.assignment.slot_date, self.slot.date)
        self.assertEqual(ShiftSlot.objects.filter(shift=self.shift).count(), 1)
        self.assertEqual(ShiftSlotAssignment.objects.filter(shift=self.shift).count(), 1)
        self.assertEqual(self.slot.end_time, time(18) if edit_result[0] == 200 else time(17))
        if outcomes["publish"][0] == "result":
            self.assertIsNone(self.slot.unpublished_at)
        else:
            self.assertIsNotNone(self.slot.unpublished_at)
            self.assertEqual(edit_result[0], 200, outcomes)

    def test_whole_week_unpublish_serializes_with_single_slot_republish(self):
        def republish():
            republish_roster_shift(ShiftSlot.objects.get(pk=self.slot.pk), self.owner, notify="none")
            return "published"

        def unpublish_week():
            unpublish_roster_period(RosterPeriod.objects.get(pk=self.period.pk), self.owner)
            return "draft"

        outcomes = self.race([("publish", republish), ("unpublish_week", unpublish_week)])
        self.assertEqual(outcomes["unpublish_week"], ("result", "draft"), outcomes)
        self.period.refresh_from_db()
        self.assertEqual(self.period.status, RosterPeriod.Status.DRAFT)
        self.assertEqual(get_worker_published_roster(self.worker), [])

    def test_opposite_cross_week_moves_take_the_same_period_lock_order(self):
        destination = RosterPeriod.objects.create(
            pharmacy=self.pharmacy, week_start=self.week + timedelta(days=7), created_by=self.owner,
        )
        other_worker = make_user("PHARMACIST")
        Membership.objects.create(
            user=other_worker, pharmacy=self.pharmacy, role="PHARMACIST", employment_type="FULL_TIME",
            status=Membership.Status.ACCEPTED, is_active=True,
        )
        other_shift = Shift.objects.create(
            pharmacy=self.pharmacy, role_needed="PHARMACIST", is_roster_container=True, created_by=self.owner,
        )
        other_slot = ShiftSlot.objects.create(
            shift=other_shift, date=destination.week_start, start_time=time(9), end_time=time(17),
            roster_period=destination,
        )
        other_assignment = ShiftSlotAssignment.objects.create(
            shift=other_shift, slot=other_slot, slot_date=other_slot.date, user=other_worker, is_rostered=True,
        )
        RosterPeriod.objects.filter(pk=destination.pk).update(status=RosterPeriod.Status.PUBLISHED)
        unpublish_roster_shift(other_slot, self.owner)
        outcomes = self.race([
            ("forward", lambda: self.patch(work_date=destination.week_start)),
            ("backward", lambda: self.patch(shift_id=other_shift.pk, slot_id=other_slot.pk, work_date=self.week)),
        ])
        for kind, value in outcomes.values():
            self.assertEqual(kind, "result", outcomes)
            self.assertEqual(value[0], 200, outcomes)
        self.slot.refresh_from_db()
        other_slot.refresh_from_db()
        self.assignment.refresh_from_db()
        other_assignment.refresh_from_db()
        self.assertEqual((self.slot.roster_period_id, self.assignment.slot_date), (destination.pk, destination.week_start))
        self.assertEqual((other_slot.roster_period_id, other_assignment.slot_date), (self.period.pk, self.week))
        self.assertIsNotNone(self.slot.unpublished_at)
        self.assertIsNotNone(other_slot.unpublished_at)
