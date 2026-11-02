"""Real PostgreSQL ordering of paid fulfillment/freeze and emergency-cover writers."""
from threading import Event
from zoneinfo import ZoneInfo
from unittest import skipUnless
from unittest.mock import patch
from django.db import connection
from django.test import TransactionTestCase, override_settings
from django.core.exceptions import ValidationError
from billing.models import ShiftPayment
from shifts.models import ShiftSlotAssignment
from workforce import signals, timesheet_transitions
from workforce.models import TimesheetManifest, TimesheetPeriod
from workforce.tests import test_payroll_activation_locking as races
from workforce.tests.test_assignment_freeze import AssignmentFreezeFixture
from workforce.timesheets import ensure_period_timesheets, build_timesheet, approve_timesheet, lock_period, correct_locked_period
from attendance.test_cover_terms_acceptance import CoverTermsFixture


@skipUnless(connection.vendor == 'postgresql', 'Requires PostgreSQL row locks')
@override_settings(STRIPE_WEBHOOK_SECRET='whsec-freeze-test')
class PaidFulfillmentFreezePostgresTests(AssignmentFreezeFixture, TransactionTestCase):
    parallel = races.PayrollFreezePostgresContracts.parallel
    observe_period_lock = races.PayrollFreezePostgresContracts.observe_period_lock

    def test_fulfillment_wins_and_freeze_requires_recalculation(self):
        self.checkout()
        locked, attempted = Event(), Event()
        enqueue = signals._enqueue
        def pause(*args, **kwargs):
            locked.set()
            self.assertTrue(attempted.wait(10))
            return enqueue(*args, **kwargs)
        def freeze():
            self.assertTrue(locked.wait(10))
            with self.observe_period_lock(attempted):
                try:
                    self.freeze()
                except ValidationError as exc:
                    return exc.messages
            return 'unexpectedly locked'
        with patch('workforce.signals._enqueue', side_effect=pause), patch('workforce.signals.rebuild_timesheet_task.delay'):
            results = self.parallel(('payment', lambda: self.paid_webhook().status_code), ('freeze', freeze))
        self.assertEqual(results['payment'], 200, results)
        self.assertIn('Recalculate all timesheets before locking this period.', results['freeze'])
        self.assertFalse(TimesheetManifest.objects.filter(period=self.period).exists())
        self.assertFalse(ShiftPayment.objects.get().reconciliation_required)
        self.assertTrue(ShiftSlotAssignment.objects.filter(source_offer=self.late_offer).exists())

    def test_freeze_wins_and_paid_intent_is_retained_for_correction(self):
        self.checkout()
        locked, attempted = Event(), Event()
        ensure = timesheet_transitions.ensure_period_timesheets
        def pause(period):
            locked.set()
            self.assertTrue(attempted.wait(10))
            return ensure(period)
        def pay():
            self.assertTrue(locked.wait(10))
            with self.observe_period_lock(attempted):
                return self.paid_webhook().status_code
        with patch('workforce.timesheet_transitions.ensure_period_timesheets', side_effect=pause), patch(
                'workforce.signals.rebuild_timesheet_task.delay'):
            results = self.parallel(('freeze', lambda: self.freeze().manifest_hash), ('payment', pay))
        self.assertEqual(results['payment'], 503, results)
        self.assertEqual(TimesheetManifest.objects.get(period=self.period).manifest_hash, results['freeze'])
        self.assertEqual(ShiftPayment.objects.get().reconciliation_reason, 'locked_payroll_period')
        self.assertFalse(ShiftSlotAssignment.objects.filter(source_offer=self.late_offer).exists())


@skipUnless(connection.vendor == 'postgresql', 'Requires migrated cover acceptance fixtures')
class CoverAssignmentFreezePostgresTests(CoverTermsFixture, TransactionTestCase):
    def freeze_real_period(self):
        day = self.now.astimezone(ZoneInfo(self.pharmacy.timezone)).date()
        period = TimesheetPeriod.objects.create(pharmacy=self.pharmacy, start_date=day, end_date=day,
                                               timezone=self.pharmacy.timezone, created_by=self.manager)
        ensure_period_timesheets(period)
        for sheet in period.timesheets.all():
            revision = build_timesheet(sheet.pk, actor=self.manager)
            approve_timesheet(sheet, self.manager, revision.revision_number)
        return period, lock_period(period, self.manager)

    def test_abn_cover_approval_preserves_its_existing_recording_workflow_after_freeze(self):
        _period, manifest = self.freeze_real_period()
        original_hash = manifest.manifest_hash
        review = self.cover(approve=False)
        response = self.decide_review(review)
        self.assertEqual(response.status_code, 200, response.content)
        review.refresh_from_db()
        self.assertIsNotNone(review.backfill_assignment_id)
        self.assertEqual(review.backfill_assignment.settlement_channel, 'INVOICE')
        self.assertEqual(TimesheetManifest.objects.get(pk=manifest.pk).manifest_hash, original_hash)

    def test_abn_worker_cover_acceptance_keeps_existing_behavior_and_frozen_manifest(self):
        review = self.cover()
        assignment = review.backfill_assignment
        _period, manifest = self.freeze_real_period()
        original_hash = manifest.manifest_hash
        response = self.accept(assignment)
        self.assertEqual(response.status_code, 200, response.content)
        assignment.refresh_from_db()
        self.assertIsNotNone(assignment.engagement_terms_accepted_at)
        self.assertEqual(assignment.settlement_channel, 'INVOICE')
        self.assertEqual(TimesheetManifest.objects.get(pk=manifest.pk).manifest_hash, original_hash)
