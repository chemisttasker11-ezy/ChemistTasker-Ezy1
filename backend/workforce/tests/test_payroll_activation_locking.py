"""Payroll settlement changes serialize with the reviewed timesheet-period freeze."""
from datetime import datetime, timedelta
from queue import Queue
from threading import Barrier, Event, Thread
from unittest import skipUnless
from unittest.mock import patch
from zoneinfo import ZoneInfo

from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.db import close_old_connections, connection
from django.test import TestCase, TransactionTestCase
from rest_framework.test import APIClient

from attendance.models import AttendanceEvent, AttendanceSession
from client_profile import test_membership_application_integrity as fixtures
from onboarding.models import OwnerOnboarding
from organizations.models import Pharmacy
from shifts.models import Shift, ShiftOffer, ShiftSlot, ShiftSlotAssignment
from workforce import signals, timesheet_transitions
from workforce.models import RosterPeriod, Timesheet, TimesheetManifest, TimesheetPeriod
from workforce.timesheets import approve_timesheet, build_timesheet, correct_locked_period, lock_period


class PayrollFreezeFixture:
    def setUp(self):
        with patch("workforce.signals.rebuild_timesheet_task.delay"):
            fixtures.DeferredPayrollActivationTests.setUp(self)
            fixtures.DeferredPayrollActivationTests._complete_payroll_profile(self)
            self.pharmacy.owner = OwnerOnboarding.objects.create(
                user=self.manager, role="MANAGER", phone_number="0400000000",
            )
            self.pharmacy.timezone = "Australia/Brisbane"
            self.pharmacy.save(update_fields=["owner", "timezone"])
            ShiftSlotAssignment.objects.filter(pk=self.assignment.pk).update(is_rostered=True)
            RosterPeriod.objects.create(
                pharmacy=self.pharmacy,
                week_start=self.slot.date - timedelta(days=self.slot.date.weekday()),
                status=RosterPeriod.Status.PUBLISHED, created_by=self.manager,
            )
            self.period = TimesheetPeriod.objects.create(
                pharmacy=self.pharmacy, start_date=self.slot.date, end_date=self.slot.date,
                timezone=self.pharmacy.timezone, created_by=self.manager,
            )
            self.timesheet = Timesheet.objects.create(period=self.period, user=self.worker)
            tz = ZoneInfo(self.pharmacy.timezone)
            start = datetime.combine(self.slot.date, self.slot.start_time, tzinfo=tz)
            end = datetime.combine(self.slot.date, self.slot.end_time, tzinfo=tz)
            session = AttendanceSession.objects.create(
                pharmacy=self.pharmacy, user=self.worker, assignment=self.assignment,
                started_at=start, ended_at=end,
            )
            for kind, moment in (("CLOCK_IN", start), ("CLOCK_OUT", end)):
                AttendanceEvent.objects.create(
                    session=session, event_type=kind, occurred_at=moment, source="QR_KIOSK",
                )
            self.review()

    def activate(self, *, user_id=None, offer_id=None):
        client = APIClient()
        client.force_authenticate(get_user_model().objects.get(pk=user_id or self.manager.pk))
        return client.post(f"/api/v1/shift-offers/{offer_id or self.offer.pk}/activate-payroll/", {}, format="json")

    def review(self):
        revision = build_timesheet(self.timesheet.pk, actor=self.manager)
        approve_timesheet(self.timesheet, self.manager, revision.revision_number)
        return revision

    def freeze(self):
        return lock_period(TimesheetPeriod.objects.get(pk=self.period.pk), self.manager)

    def assert_not_activated(self):
        self.offer.refresh_from_db()
        self.assignment.refresh_from_db()
        self.assertEqual(self.offer.settlement_channel, "TIMESHEET_ONLY")
        self.assertEqual(self.assignment.settlement_channel, "TIMESHEET_ONLY")
        self.assertIsNone(self.offer.payroll_activated_at)
        self.assertIsNone(self.assignment.payroll_activated_at)


class PayrollFreezeContracts(PayrollFreezeFixture, TestCase):
    def test_locked_work_refuses_activation_and_preserves_reviewed_evidence(self):
        manifest = self.freeze()
        snapshot, digest = manifest.snapshot, manifest.manifest_hash
        response = self.activate()
        self.assertEqual(response.status_code, 409, response.data)
        self.assertEqual(response.data["code"], "locked_payroll_period")
        self.assertEqual(response.data["period_ids"], [self.period.pk])
        self.assert_not_activated()
        manifest.refresh_from_db()
        self.timesheet.refresh_from_db()
        self.assertEqual((manifest.snapshot, manifest.manifest_hash), (snapshot, digest))
        self.assertFalse(self.timesheet.needs_rebuild)

    def test_explicit_correction_allows_activation_review_and_adjustment_export(self):
        original = self.freeze()
        self.assertEqual(original.snapshot["payroll_export"], [])
        self.assertEqual(self.activate().status_code, 409)
        correct_locked_period(self.period, self.manager, "Activate the reviewed external employee for payroll")
        with patch("workforce.signals.rebuild_timesheet_task.delay"):
            self.assertEqual(self.activate().status_code, 200)
        self.review()
        adjustment = self.freeze()
        self.assertEqual(adjustment.snapshot["adjustment"]["supersedes_manifest_hash"], original.manifest_hash)
        self.assertEqual(adjustment.snapshot["payroll_export"][0]["assignment_ids"], [self.assignment.pk])
        self.assertEqual(len(adjustment.snapshot["corrections"]), 1)

    def test_unchanged_activation_retry_after_lock_is_still_successful(self):
        with patch("workforce.signals.rebuild_timesheet_task.delay"):
            first = self.activate()
        self.assertEqual(first.status_code, 200, first.data)
        self.review()
        original = self.freeze()
        second = self.activate()
        self.assertEqual(second.status_code, 200, second.data)
        self.assertEqual(second.data, first.data)
        self.assertEqual(TimesheetManifest.objects.get(pk=original.pk).manifest_hash, original.manifest_hash)

    def test_another_pharmacys_locked_period_does_not_block_activation(self):
        pharmacy = Pharmacy.objects.create(name="Unrelated pharmacy")
        TimesheetPeriod.objects.create(
            pharmacy=pharmacy, start_date=self.slot.date, end_date=self.slot.date,
            created_by=self.manager, status=TimesheetPeriod.Status.LOCKED,
        )
        self.assertEqual(self.activate().status_code, 200)

    def test_foreign_worker_cannot_activate_payroll(self):
        self.assertEqual(self.activate(user_id=self.worker.pk).status_code, 403)
        self.assert_not_activated()

    def test_pending_offer_cannot_activate_future_assignment_in_locked_period(self):
        self.freeze()
        shift = Shift.objects.create(
            pharmacy=self.pharmacy, created_by=self.manager, role_needed="ASSISTANT", employment_type="LOCUM",
        )
        slot = ShiftSlot.objects.create(
            shift=shift, date=self.slot.date, start_time=self.slot.start_time, end_time=self.slot.end_time,
        )
        for whole_shift in (False, True):
            with self.subTest(whole_shift=whole_shift):
                offer = ShiftOffer.objects.create(
                    shift=shift, slot=None if whole_shift else slot, user=self.worker,
                    status=ShiftOffer.Status.ACCEPTED_AWAITING_PAYMENT,
                    payment_preference_snapshot="TFN", engagement_kind="SHIFT_EMPLOYMENT",
                    settlement_channel="TIMESHEET_ONLY",
                    engagement_terms_snapshot={"occurrences": [{"slot_id": slot.pk, "date": str(slot.date)}]},
                )
                response = self.activate(offer_id=offer.pk)
                self.assertEqual(response.status_code, 409, response.data)
                offer.refresh_from_db()
                self.assertIsNone(offer.payroll_activated_at)

    def test_slot_offer_does_not_include_unselected_recurrence_in_lock_check(self):
        self.freeze()
        shift = Shift.objects.create(
            pharmacy=self.pharmacy, created_by=self.manager, role_needed="ASSISTANT", employment_type="LOCUM",
        )
        selected = self.slot.date + timedelta(days=1)
        slot = ShiftSlot.objects.create(
            shift=shift, date=self.slot.date, start_time=self.slot.start_time, end_time=self.slot.end_time,
            is_recurring=True, recurring_days=list(range(7)), recurring_end_date=selected,
        )
        offer = ShiftOffer.objects.create(
            shift=shift, slot=slot, user=self.worker, offered_slot_date=selected,
            status=ShiftOffer.Status.ACCEPTED_AWAITING_PAYMENT,
            payment_preference_snapshot="TFN", engagement_kind="SHIFT_EMPLOYMENT",
            settlement_channel="TIMESHEET_ONLY",
            engagement_terms_snapshot={"occurrences": [{"slot_id": slot.pk, "date": str(selected)}]},
        )
        response = self.activate(offer_id=offer.pk)
        self.assertEqual(response.status_code, 200, response.data)

    def test_whole_shift_offer_checks_later_recurrences_even_with_first_date_snapshot(self):
        shift = Shift.objects.create(
            pharmacy=self.pharmacy, created_by=self.manager, role_needed="ASSISTANT", employment_type="LOCUM",
        )
        first = self.slot.date + timedelta(days=1)
        last = first + timedelta(days=1)
        slot = ShiftSlot.objects.create(
            shift=shift, date=first, start_time=self.slot.start_time, end_time=self.slot.end_time,
            is_recurring=True, recurring_days=list(range(7)), recurring_end_date=last,
        )
        TimesheetPeriod.objects.create(
            pharmacy=self.pharmacy, start_date=last, end_date=last, created_by=self.manager,
            status=TimesheetPeriod.Status.LOCKED,
        )
        offer = ShiftOffer.objects.create(
            shift=shift, user=self.worker, status=ShiftOffer.Status.ACCEPTED_AWAITING_PAYMENT,
            payment_preference_snapshot="TFN", engagement_kind="SHIFT_EMPLOYMENT",
            settlement_channel="TIMESHEET_ONLY",
            engagement_terms_snapshot={"occurrences": [{"slot_id": slot.pk, "date": str(first)}]},
        )
        response = self.activate(offer_id=offer.pk)
        self.assertEqual(response.status_code, 409, response.data)


@skipUnless(connection.vendor == "postgresql", "Real PostgreSQL row locks and independent connections required")
class PayrollFreezePostgresContracts(PayrollFreezeFixture, TransactionTestCase):
    def parallel(self, *jobs):
        results = Queue()

        def runner(name, job):
            close_old_connections()
            try:
                with connection.cursor() as cursor:
                    cursor.execute("SET lock_timeout = '10s'")
                    cursor.execute("SET statement_timeout = '20s'")
                results.put((name, "ok", job()))
            except Exception as exc:
                results.put((name, "error", repr(exc)))
            finally:
                connection.close()

        threads = [Thread(target=runner, args=job, daemon=True) for job in jobs]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join(timeout=30)
        self.assertFalse(any(thread.is_alive() for thread in threads), "A real database operation did not finish")
        rows = [results.get(timeout=2) for _ in jobs]
        self.assertFalse([row for row in rows if row[1] != "ok"], rows)
        return {name: result for name, _, result in rows}

    def observe_period_lock(self, event):
        def observe(execute, sql, params, many, context):
            if '"workforce_timesheetperiod"' in sql and "FOR " in sql:
                event.set()
            return execute(sql, params, many, context)
        return connection.execute_wrapper(observe)

    def test_activation_wins_then_freeze_requires_recalculation(self):
        activation_locked, freeze_attempted = Event(), Event()
        enqueue = signals._enqueue

        def pause_invalidation(*args, **kwargs):
            activation_locked.set()
            self.assertTrue(freeze_attempted.wait(10))
            return enqueue(*args, **kwargs)

        def freeze():
            self.assertTrue(activation_locked.wait(10))
            with self.observe_period_lock(freeze_attempted):
                try:
                    self.freeze()
                except ValidationError as exc:
                    return exc.messages
            return "unexpectedly locked"

        with patch("workforce.signals._enqueue", side_effect=pause_invalidation), patch(
            "workforce.signals.rebuild_timesheet_task.delay"
        ):
            rows = self.parallel(("activation", lambda: self.activate().status_code), ("freeze", freeze))
        self.assertEqual(rows["activation"], 200, rows)
        self.assertIn("Recalculate all timesheets before locking this period.", rows["freeze"], rows)
        self.assertFalse(TimesheetManifest.objects.filter(period=self.period).exists())
        self.timesheet.refresh_from_db()
        self.assertTrue(self.timesheet.needs_rebuild)

    def test_freeze_wins_then_activation_is_rolled_back(self):
        freeze_locked, activation_attempted = Event(), Event()
        ensure = timesheet_transitions.ensure_period_timesheets

        def pause_freeze(period):
            freeze_locked.set()
            self.assertTrue(activation_attempted.wait(10))
            return ensure(period)

        def activate():
            self.assertTrue(freeze_locked.wait(10))
            with self.observe_period_lock(activation_attempted):
                return self.activate().status_code

        with patch("workforce.timesheet_transitions.ensure_period_timesheets", side_effect=pause_freeze), patch(
            "workforce.signals.rebuild_timesheet_task.delay"
        ):
            rows = self.parallel(("freeze", lambda: self.freeze().manifest_hash), ("activation", activate))
        self.assertEqual(rows["activation"], 409, rows)
        self.assertEqual(TimesheetManifest.objects.get(period=self.period).manifest_hash, rows["freeze"])
        self.assert_not_activated()

    def test_two_activation_requests_keep_one_timestamp_and_one_rebuild(self):
        barrier = Barrier(2)

        def activate():
            barrier.wait(timeout=10)
            response = self.activate()
            return response.status_code, response.data

        with patch("workforce.signals.rebuild_timesheet_task.delay") as rebuild:
            rows = self.parallel(("first", activate), ("second", activate))
        self.assertEqual(rows["first"][0], 200, rows)
        self.assertEqual(rows["first"], rows["second"])
        rebuild.assert_called_once_with(self.period.pk, self.worker.pk)
