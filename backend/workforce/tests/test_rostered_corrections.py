"""Tests proving workforce projection invalidation, rebuild, revision check, and approval locking on rostered corrections.

Core rules proven:
1. An approved timesheet reopens when its attendance is corrected.
2. Approval only applies to the revision the manager saw.
3. Workers and other pharmacies' managers cannot approve timesheets.
4. Positive controls: destination pharmacy owner and scoped manager can approve.
5. Invalidation, rebuild, snapshot timeline with correction audit.
"""
from datetime import datetime, time, timedelta
from queue import Queue
from threading import Barrier, Event, Thread
from time import monotonic
from unittest import mock, skipUnless
from zoneinfo import ZoneInfo

from django.contrib.auth import get_user_model
from django.core.exceptions import PermissionDenied, ValidationError
from django.db import close_old_connections, connection, transaction
from django.test import TestCase, TransactionTestCase
from django.test.utils import CaptureQueriesContext
from django.utils import timezone

from attendance.approvals import create_attendance_correction
from attendance.models import AttendanceCorrection, AttendanceEvent, AttendanceSession
from client_profile.models import (
    Membership,
    Organization,
    OwnerOnboarding,
    Pharmacy,
    Shift,
    ShiftSlot,
    ShiftSlotAssignment,
)
from users.models import OrganizationMembership
from workforce.models import RosterPeriod, Timesheet, TimesheetApproval, TimesheetPeriod, TimesheetRevision
from workforce.signals import _enqueue
from workforce.timesheet_builder import build_timesheet
from workforce.timesheet_transitions import approve_timesheet


class WorkforceRosteredCorrectionFixture:
    def setUp(self):
        User = get_user_model()
        self.owner = User.objects.create(username="wf_corr_owner", email="wf-corr-owner@example.invalid", role="OWNER")
        self.worker = User.objects.create(
            username="wf_corr_worker", email="wf-corr-worker@example.invalid", role="PHARMACIST",
            first_name="Test", last_name="Pharmacist",
        )
        self.org = Organization.objects.create(name="WF Rostered Corr Org")
        self.profile = OwnerOnboarding.objects.create(
            user=self.owner, role="PHARMACIST", phone_number="0400000000", organization=self.org,
        )
        self.pharmacy = Pharmacy.objects.create(
            name="WF Rostered Corr Pharmacy", owner=self.profile, organization=self.org, timezone="Australia/Brisbane",
        )
        self.membership = Membership.objects.create(
            user=self.worker, pharmacy=self.pharmacy, role="PHARMACIST",
            employment_type="FULL_TIME", status=Membership.Status.ACCEPTED, is_active=True,
        )

        self.tz = ZoneInfo("Australia/Brisbane")
        now_local = timezone.now().astimezone(self.tz)
        # Anchor work_date in the past so events and corrections precede current time
        self.work_date = (now_local - timedelta(days=7)).date()
        self.monday = self.work_date - timedelta(days=self.work_date.weekday())

        self.roster_period = RosterPeriod.objects.create(
            pharmacy=self.pharmacy, week_start=self.monday, status=RosterPeriod.Status.DRAFT, created_by=self.owner,
        )
        self.shift = Shift.objects.create(
            pharmacy=self.pharmacy, created_by=self.owner, dedicated_user=self.worker,
            role_needed="PHARMACIST", employment_type="FULL_TIME", min_hourly_rate=50, max_hourly_rate=50,
        )
        self.slot = ShiftSlot.objects.create(
            shift=self.shift, date=self.work_date, start_time=time(8, 0), end_time=time(16, 0), planned_break_minutes=30,
            roster_period=self.roster_period,
        )
        self.assignment = ShiftSlotAssignment.objects.create(
            shift=self.shift, slot=self.slot, slot_date=self.work_date, user=self.worker, is_rostered=True,
        )
        self.roster_period.status = RosterPeriod.Status.PUBLISHED
        self.roster_period.save(update_fields=["status"])

        self.start_dt = datetime.combine(self.work_date, time(8, 0), tzinfo=self.tz)
        self.end_dt = datetime.combine(self.work_date, time(16, 0), tzinfo=self.tz)
        self.session = AttendanceSession.objects.create(
            pharmacy=self.pharmacy, user=self.worker, assignment=self.assignment,
            source_membership=self.membership, started_at=self.start_dt, ended_at=self.end_dt,
        )
        self.clock_in = AttendanceEvent.objects.create(
            session=self.session,
            event_type=AttendanceEvent.EventType.CLOCK_IN,
            occurred_at=self.start_dt,
            source=AttendanceEvent.Source.QR_KIOSK,
        )
        self.clock_out = AttendanceEvent.objects.create(
            session=self.session,
            event_type=AttendanceEvent.EventType.CLOCK_OUT,
            occurred_at=self.end_dt,
            source=AttendanceEvent.Source.QR_KIOSK,
        )
        self.period = TimesheetPeriod.objects.create(
            pharmacy=self.pharmacy, start_date=self.monday, end_date=self.monday + timedelta(days=6),
            timezone="Australia/Brisbane", created_by=self.owner,
        )
        self.timesheet = Timesheet.objects.create(period=self.period, user=self.worker, membership=self.membership)


class WorkforceRosteredCorrectionContracts(WorkforceRosteredCorrectionFixture, TestCase):
    def test_approved_timesheet_reopens_when_attendance_is_corrected(self):
        """Rule 2: an approved timesheet reopens when its attendance is corrected."""
        # 1. Initial timesheet build and approval
        rev1 = build_timesheet(self.timesheet.pk, actor=self.owner)
        self.timesheet.refresh_from_db()
        self.assertEqual(self.timesheet.worked_minutes, 480)
        self.assertFalse(self.timesheet.needs_rebuild)

        approve_timesheet(self.timesheet, self.owner, rev1.revision_number)
        self.timesheet.refresh_from_db()
        self.assertEqual(self.timesheet.status, Timesheet.Status.APPROVED)
        self.assertEqual(self.timesheet.reviewed_minutes, 480)

        # 2. Manager submits audited attendance correction (extending clock-out by 60 mins)
        new_end = datetime.combine(self.work_date, time(17, 0), tzinfo=self.tz)
        create_attendance_correction(
            self.owner,
            self.clock_out.pk,
            corrected_timestamp=new_end,
            reason="Approved 1 hour overtime for stock inventory",
        )

        # 3. Assert invalidation: timesheet immediately marked as needing rebuild
        self.timesheet.refresh_from_db()
        self.assertTrue(self.timesheet.needs_rebuild)
        self.assertEqual(self.timesheet.status, Timesheet.Status.APPROVED)  # Remains APPROVED until recalculation

        # 4. Attempting approval while rebuild is pending is refused
        with self.assertRaises(ValidationError) as ctx:
            approve_timesheet(self.timesheet, self.owner, rev1.revision_number)
        self.assertIn("recalculation", str(ctx.exception).lower())

        # 5. Assert rebuild reopens the timesheet and projects the corrected worked time
        rev2 = build_timesheet(self.timesheet.pk, actor=self.owner)
        self.timesheet.refresh_from_db()
        self.assertEqual(self.timesheet.status, Timesheet.Status.REOPENED)  # Rule 2 proven!
        self.assertFalse(self.timesheet.needs_rebuild)
        self.assertEqual(self.timesheet.worked_minutes, 540)
        self.assertEqual(rev2.revision_number, 2)
        self.assertNotEqual(rev1.source_fingerprint, rev2.source_fingerprint)

    def test_approval_only_applies_to_revision_manager_saw(self):
        """Rule 4: approval only applies to the revision the manager saw."""
        rev1 = build_timesheet(self.timesheet.pk, actor=self.owner)
        self.timesheet.refresh_from_db()
        approve_timesheet(self.timesheet, self.owner, rev1.revision_number)

        # Correct attendance and rebuild to produce revision 2
        new_end = datetime.combine(self.work_date, time(17, 0), tzinfo=self.tz)
        create_attendance_correction(
            self.owner,
            self.clock_out.pk,
            corrected_timestamp=new_end,
            reason="Approved overtime",
        )
        rev2 = build_timesheet(self.timesheet.pk, actor=self.owner)
        self.timesheet.refresh_from_db()
        self.assertEqual(self.timesheet.status, Timesheet.Status.REOPENED)
        self.assertEqual(rev2.revision_number, 2)

        # 1. Attempting to approve passing the old revision number (1) is rejected
        with self.assertRaises(ValidationError) as ctx:
            approve_timesheet(self.timesheet, self.owner, rev1.revision_number)
        self.assertIn("Timesheet changed. Refresh and review the current revision.", str(ctx.exception))

        # 2. Approving passing the current revision number (2) succeeds
        approved_rev = approve_timesheet(
            self.timesheet,
            self.owner,
            rev2.revision_number,
            reason="Overtime verified and approved",
        )
        self.timesheet.refresh_from_db()
        self.assertEqual(self.timesheet.status, Timesheet.Status.APPROVED)
        self.assertEqual(self.timesheet.reviewed_minutes, 540)
        self.assertEqual(approved_rev.pk, rev2.pk)
        self.assertTrue(
            TimesheetApproval.objects.filter(
                revision=rev2,
                kind=TimesheetApproval.Kind.TIME_APPROVAL,
                actor=self.owner,
            ).exists()
        )

    def test_workers_and_wrong_site_managers_cannot_approve(self):
        """Rule 3 in workforce: workers and other pharmacies' managers cannot approve timesheets."""
        rev = build_timesheet(self.timesheet.pk, actor=self.owner)

        # Worker cannot approve timesheet
        with self.assertRaises(PermissionDenied):
            approve_timesheet(self.timesheet, self.worker, rev.revision_number)

        # Wrong-site manager cannot approve timesheet
        User = get_user_model()
        other_owner = User.objects.create(username="wf_other_mgr", email="other-wf-mgr@example.invalid", role="OWNER")
        with self.assertRaises(PermissionDenied):
            approve_timesheet(self.timesheet, other_owner, rev.revision_number)

    def test_positive_controls_owner_and_scoped_manager_can_approve(self):
        """Positive controls: destination pharmacy owner and scoped manager can approve."""
        rev = build_timesheet(self.timesheet.pk, actor=self.owner)

        # Scoped organization manager with ROSTER_MANAGER authority
        User = get_user_model()
        scoped_user = User.objects.create(username="wf_scoped_lead", email="scoped-lead@example.invalid", role="EXPLORER")
        scoped = OrganizationMembership.objects.create(
            user=scoped_user,
            organization=self.org,
            role="REGION_ADMIN",
            admin_level="ROSTER_MANAGER",
            region="Brisbane",
            job_title="Regional Lead",
        )
        scoped.pharmacies.add(self.pharmacy)

        # Scoped manager approves timesheet
        approve_timesheet(
            self.timesheet,
            scoped_user,
            rev.revision_number,
            reason="Approved by regional roster manager",
        )
        self.timesheet.refresh_from_db()
        self.assertEqual(self.timesheet.status, Timesheet.Status.APPROVED)
        self.assertEqual(self.timesheet.reviewed_minutes, rev.worked_minutes)

    def test_rebuild_snapshot_contains_corrected_timeline_audit(self):
        """Snapshot captures the corrected session attendance and preserves raw events."""
        corr_dt = datetime.combine(self.work_date, time(16, 45), tzinfo=self.tz)
        correction = create_attendance_correction(
            self.owner,
            self.clock_out.pk,
            corrected_timestamp=corr_dt,
            reason="Closing shift extended",
        )

        rev = build_timesheet(self.timesheet.pk, actor=self.owner)

        # 1. Raw event remains unmodified in the database
        self.clock_out.refresh_from_db()
        self.assertEqual(self.clock_out.occurred_at, self.end_dt)
        self.assertEqual(self.clock_out.source, AttendanceEvent.Source.QR_KIOSK)

        # 2. Audit record accurately links to event
        self.assertEqual(correction.original_event_id, self.clock_out.pk)
        self.assertEqual(correction.corrected_timestamp, corr_dt)
        self.assertEqual(correction.reason, "Closing shift extended")
        self.assertEqual(correction.corrected_by_id, self.owner.pk)

        # 3. Snapshot days projection reflects the corrected finish and worked minutes
        self.assertIn("days", rev.snapshot)
        day_entry = next(d for d in rev.snapshot["days"] if d["session_id"] == self.session.pk)
        self.assertEqual(datetime.fromisoformat(day_entry["actual_end"]), corr_dt)
        self.assertEqual(day_entry["worked_minutes"], 525)

        # 4. Totals and segments reflect the corrected worked time
        self.assertEqual(rev.snapshot["totals"]["worked_minutes"], 525)
        work_segment = rev.segments.get(segment_type="WORK")
        self.assertEqual(work_segment.ended_at, corr_dt)
        self.assertEqual(work_segment.minutes, 525)


@skipUnless(connection.vendor == "postgresql", "Requires independent PostgreSQL transactions and row locks.")
class WorkforceRosteredCorrectionPostgresContracts(WorkforceRosteredCorrectionFixture, TransactionTestCase):
    def _start_db_operation(self, name, operation, hook=None):
        result, pid = Queue(), Queue()
        finished = Event()

        def run():
            close_old_connections()
            try:
                with connection.cursor() as cursor:
                    cursor.execute("SET lock_timeout = '10s'")
                    cursor.execute("SET statement_timeout = '15s'")
                    cursor.execute("SELECT pg_backend_pid()")
                    pid.put(cursor.fetchone()[0])

                def observe(execute, sql, params, many, context):
                    if hook:
                        return hook(execute, sql, params, many, context)
                    return execute(sql, params, many, context)

                with connection.execute_wrapper(observe):
                    result.put(("ok", operation()))
            except Exception as exc:
                result.put(("error", exc))
            finally:
                finished.set()
                connection.close()

        thread = Thread(target=run, name=name, daemon=True)
        thread.start()
        return thread, result, pid.get(timeout=10), finished

    def _finish_db_operation(self, task):
        thread, result, _, _ = task
        thread.join(timeout=20)
        self.assertFalse(thread.is_alive(), f"{thread.name} did not finish within its database timeouts.")
        return result.get(timeout=2)

    def _assert_blocked_by(self, waiter, blocker):
        deadline = monotonic() + 5
        while monotonic() < deadline:
            self.assertFalse(waiter[3].is_set(), "Contender finished without the expected database wait.")
            with connection.cursor() as cursor:
                cursor.execute("SELECT pg_blocking_pids(%s)", [waiter[2]])
                if blocker[2] in cursor.fetchone()[0]:
                    return
        self.fail("Contender did not reach the expected database lock.")

    def _is_period_lock_query(self, sql):
        table = connection.ops.quote_name(TimesheetPeriod._meta.db_table)
        return f"FROM {table} " in sql and (
            sql.endswith(f"FOR UPDATE OF {table}")
            or sql.endswith(f"FOR NO KEY UPDATE OF {table}")
        )

    def test_select_for_update_locks_period_and_timesheet_on_approval(self):
        """Approval takes the period mutex before the stronger Timesheet row lock."""
        rev = build_timesheet(self.timesheet.pk, actor=self.owner)
        with CaptureQueriesContext(connection) as captured:
            approve_timesheet(self.timesheet, self.owner, rev.revision_number)

        tables = [TimesheetPeriod._meta.db_table, Timesheet._meta.db_table]
        modes = ["FOR NO KEY UPDATE", "FOR UPDATE"]
        positions = []
        for table, mode in zip(tables, modes):
            quoted_table = connection.ops.quote_name(table)
            locking = [
                (index, query["sql"])
                for index, query in enumerate(captured.captured_queries)
                if f"FROM {quoted_table} " in query["sql"] and " FOR " in query["sql"]
            ]
            self.assertEqual(len(locking), 1, f"Expected exactly one lock query for {table}: {locking}")
            self.assertTrue(locking[0][1].endswith(f"{mode} OF {quoted_table}"), locking[0][1])
            positions.append(locking[0][0])
        self.assertLess(positions[0], positions[1], "Approval must lock the period before the timesheet.")

    def test_double_invalidation_commits_before_waiting_approval_refuses_dirty_timesheet(self):
        """Repeated attendance invalidation can commit while approval waits for its Timesheet."""
        revision = build_timesheet(self.timesheet.pk, actor=self.owner)
        self.timesheet.refresh_from_db()
        original_status = self.timesheet.status
        first_invalidation = Event()
        period_locked = Event()
        release_invalidation = Event()

        def invalidate():
            with transaction.atomic():
                _enqueue(self.pharmacy.pk, self.worker.pk, self.work_date)
                first_invalidation.set()
                if not release_invalidation.wait(timeout=10):
                    raise AssertionError("Approval did not reach the Timesheet lock.")
                # An event and its session can both invalidate the same Timesheet.
                # The second UPDATE also exercises PostgreSQL's deferred FK recheck.
                _enqueue(self.pharmacy.pk, self.worker.pk, self.work_date)

        def approve():
            timesheet = Timesheet.objects.get(pk=self.timesheet.pk)
            manager = get_user_model().objects.get(pk=self.owner.pk)
            return approve_timesheet(timesheet, manager, revision.revision_number)

        def observe_approval(execute, sql, params, many, context):
            result = execute(sql, params, many, context)
            if self._is_period_lock_query(sql):
                period_locked.set()
            return result

        tasks = []
        with mock.patch("workforce.signals.rebuild_timesheet_task.delay") as schedule_rebuild:
            try:
                invalidator = self._start_db_operation("double-invalidation", invalidate)
                tasks.append(invalidator)
                self.assertTrue(first_invalidation.wait(timeout=10), "First invalidation did not finish.")
                approver = self._start_db_operation("dirty-approval", approve, observe_approval)
                tasks.append(approver)
                self.assertTrue(period_locked.wait(timeout=10), "Approval did not acquire the period mutex.")
                self._assert_blocked_by(approver, invalidator)
                schedule_rebuild.assert_not_called()
            finally:
                release_invalidation.set()
                outcomes = [self._finish_db_operation(task) for task in tasks]

            self.assertEqual(outcomes[0], ("ok", None), outcomes)
            self.assertEqual(outcomes[1][0], "error", outcomes)
            self.assertIsInstance(outcomes[1][1], ValidationError, outcomes)
            self.assertEqual(outcomes[1][1].messages, ["Timesheet needs recalculation before approval."])
            self.assertEqual(
                schedule_rebuild.call_args_list,
                [mock.call(self.period.pk, self.worker.pk)] * 2,
            )

        self.timesheet.refresh_from_db()
        self.assertTrue(self.timesheet.needs_rebuild)
        self.assertEqual(self.timesheet.status, original_status)
        self.assertEqual(self.timesheet.revisions.count(), 1)
        self.assertFalse(TimesheetApproval.objects.filter(revision=revision).exists())

    def test_builders_for_different_workers_serialize_on_the_same_period(self):
        """The period mutex still excludes another builder even when child rows differ."""
        other_worker = get_user_model().objects.create(
            username="wf_corr_other_worker", email="wf-corr-other-worker@example.invalid", role="PHARMACIST",
        )
        other_membership = Membership.objects.create(
            user=other_worker, pharmacy=self.pharmacy, role="PHARMACIST",
            employment_type="FULL_TIME", status=Membership.Status.ACCEPTED, is_active=True,
        )
        other_timesheet = Timesheet.objects.create(
            period=self.period, user=other_worker, membership=other_membership,
        )
        period_locked = Event()
        second_period_attempted = Event()
        release_first_builder = Event()

        def hold_first_period(execute, sql, params, many, context):
            result = execute(sql, params, many, context)
            if self._is_period_lock_query(sql):
                period_locked.set()
                if not release_first_builder.wait(timeout=10):
                    raise AssertionError("Second builder did not reach the period lock.")
            return result

        def observe_second_period(execute, sql, params, many, context):
            if self._is_period_lock_query(sql):
                second_period_attempted.set()
            return execute(sql, params, many, context)

        tasks = []
        try:
            first = self._start_db_operation(
                "first-worker-builder",
                lambda: build_timesheet(self.timesheet.pk, actor=self.owner),
                hold_first_period,
            )
            tasks.append(first)
            self.assertTrue(period_locked.wait(timeout=10), "First builder did not lock the period.")
            second = self._start_db_operation(
                "second-worker-builder",
                lambda: build_timesheet(other_timesheet.pk, actor=self.owner),
                observe_second_period,
            )
            tasks.append(second)
            self.assertTrue(second_period_attempted.wait(timeout=10), "Second builder did not request the period.")
            self._assert_blocked_by(second, first)
        finally:
            release_first_builder.set()
            outcomes = [self._finish_db_operation(task) for task in tasks]

        self.assertTrue(all(kind == "ok" for kind, _ in outcomes), outcomes)
        for timesheet, (_, revision) in zip((self.timesheet, other_timesheet), outcomes):
            timesheet.refresh_from_db()
            self.assertFalse(timesheet.needs_rebuild)
            self.assertEqual(revision.timesheet_id, timesheet.pk)
            self.assertEqual(revision.revision_number, 1)
            self.assertEqual(timesheet.revisions.count(), 1)
            self.assertEqual(timesheet.worked_minutes, revision.worked_minutes)

    def test_rolled_back_invalidation_does_not_publish_a_rebuild(self):
        build_timesheet(self.timesheet.pk, actor=self.owner)
        with mock.patch("workforce.signals.rebuild_timesheet_task.delay") as schedule_rebuild:
            with self.assertRaisesMessage(RuntimeError, "roll back attendance mutation"):
                with transaction.atomic():
                    _enqueue(self.pharmacy.pk, self.worker.pk, self.work_date)
                    _enqueue(self.pharmacy.pk, self.worker.pk, self.work_date)
                    self.assertTrue(Timesheet.objects.get(pk=self.timesheet.pk).needs_rebuild)
                    schedule_rebuild.assert_not_called()
                    raise RuntimeError("roll back attendance mutation")

            self.timesheet.refresh_from_db()
            self.assertFalse(self.timesheet.needs_rebuild)
            schedule_rebuild.assert_not_called()

            with transaction.atomic():
                _enqueue(self.pharmacy.pk, self.worker.pk, self.work_date)
                schedule_rebuild.assert_not_called()
            schedule_rebuild.assert_called_once_with(self.period.pk, self.worker.pk)
            self.timesheet.refresh_from_db()
            self.assertTrue(self.timesheet.needs_rebuild)

    def test_concurrent_approvals_serialize_cleanly(self):
        """Concurrent approvals of the same revision serialize cleanly without unhandled locking errors."""
        rev = build_timesheet(self.timesheet.pk, actor=self.owner)
        barrier = Barrier(2)
        results = Queue()

        def approve_worker():
            close_old_connections()
            try:
                with connection.cursor() as cursor:
                    cursor.execute("SET lock_timeout = '5s'")
                    cursor.execute("SET statement_timeout = '10s'")
                User = get_user_model()
                manager = User.objects.get(pk=self.owner.pk)
                timesheet = Timesheet.objects.get(pk=self.timesheet.pk)
                barrier.wait(timeout=10)
                approved = approve_timesheet(timesheet, manager, rev.revision_number)
                results.put(("ok", approved.revision_number))
            except Exception as exc:
                results.put(("unexpected", repr(exc)))
            finally:
                connection.close()

        threads = [Thread(target=approve_worker, daemon=True) for _ in range(2)]
        for t in threads:
            t.start()
        for t in threads:
            t.join(timeout=20)

        self.assertTrue(all(not t.is_alive() for t in threads), "Concurrent approval threads did not finish.")
        outcomes = [results.get(timeout=2) for _ in threads]
        self.assertTrue(all(kind == "ok" for kind, _ in outcomes), outcomes)
        self.timesheet.refresh_from_db()
        self.assertEqual(self.timesheet.status, Timesheet.Status.APPROVED)
        self.assertEqual(self.timesheet.reviewed_minutes, rev.worked_minutes)
