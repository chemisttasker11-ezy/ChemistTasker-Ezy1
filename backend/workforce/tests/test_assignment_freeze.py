"""Settlement-linked assignment writes must honor the reviewed period freeze."""
from datetime import time
from unittest.mock import patch
from django.core.exceptions import ValidationError
from django.test import TestCase, override_settings
from django.db import transaction
from django.urls import reverse
from django.utils import timezone
from billing import tests as billing_fixtures
from billing.models import FulfillmentCheckout, ShiftPayment
from client_profile.characterization_support import client_for
from shifts.models import ShiftOffer, ShiftSlot, ShiftSlotAssignment
from workforce.models import RosterPeriod, TimesheetManifest
from workforce.roster.publication import unpublish_roster_period
from workforce.tests.test_payroll_activation_locking import PayrollFreezeFixture


class AssignmentFreezeFixture(PayrollFreezeFixture):
    def setUp(self):
        super().setUp()
        with patch('workforce.signals.rebuild_timesheet_task.delay'):
            unpublish_roster_period(RosterPeriod.objects.get(pharmacy=self.pharmacy), self.manager)
            self.late_slot = ShiftSlot.objects.create(shift=self.shift, date=self.slot.date,
                start_time=time(18), end_time=time(20), rate='45.00')
            self.late_offer = ShiftOffer.objects.create(shift=self.shift, slot=self.late_slot, user=self.worker,
                status=ShiftOffer.Status.ACCEPTED_AWAITING_PAYMENT, payment_preference_snapshot='TFN',
                settlement_channel='PAYROLL', engagement_kind='SHIFT_EMPLOYMENT', payroll_activated_at=timezone.now(),
                engagement_terms_accepted_at=timezone.now(), engagement_terms_snapshot={
                    'version': 1, 'award_payroll_review_required': False,
                    'occurrences': [{'slot_id': self.late_slot.pk, 'date': str(self.slot.date), 'agreed_rate': '45.00'}]})
            self.shift.payment_status = 'PENDING'
            self.shift.save(update_fields=['payment_status'])
            self.review()

    def checkout(self):
        with (patch('billing.views.get_billing_state_for_account', return_value='PAYMENT_REQUIRED'),
              patch('billing.stripe_support.stripe.checkout.Session.create', return_value=billing_fixtures._StripeObject(
                  id='cs_freeze', url='https://checkout.example.test/freeze'))):
            response = client_for(self.manager).post(reverse('api_v1:billing:charge_fulfillment', args=[self.shift.pk]),
                {'offer_ids': [self.late_offer.pk]}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        return FulfillmentCheckout.objects.get()

    def paid_webhook(self):
        attempt = FulfillmentCheckout.objects.get()
        session = billing_fixtures._StripeObject(id='cs_freeze', mode='payment', payment_status='paid',
            amount_total=3000, currency='aud', payment_intent='pi_frozen_period', metadata=attempt.parameters['metadata'])
        event = billing_fixtures._StripeObject(id='evt_frozen_period', type='checkout.session.completed',
                                             data=billing_fixtures._StripeObject(object=session))
        with (patch('billing.stripe_support.stripe.Webhook.construct_event', return_value=event),
              patch('shifts.emails.send_shift_payment_finalized_notifications')):
            return client_for().post(reverse('api_v1:billing:stripe_webhook'), b'{}', content_type='application/json')


@override_settings(STRIPE_WEBHOOK_SECRET='whsec-freeze-test')
class AssignmentFreezeContracts(AssignmentFreezeFixture, TestCase):
    def test_paid_fulfillment_after_freeze_records_money_without_changing_assignments(self):
        self.checkout()
        manifest = self.freeze()
        original = manifest.snapshot, manifest.manifest_hash
        response = self.paid_webhook()
        self.assertEqual(response.status_code, 503, response.content)
        payment = ShiftPayment.objects.get()
        self.assertTrue(payment.reconciliation_required)
        self.assertEqual(payment.reconciliation_reason, 'locked_payroll_period')
        self.assertFalse(ShiftSlotAssignment.objects.filter(source_offer=self.late_offer).exists())
        self.late_offer.refresh_from_db()
        self.assertEqual(self.late_offer.status, ShiftOffer.Status.ACCEPTED_AWAITING_PAYMENT)
        manifest.refresh_from_db()
        self.assertEqual((manifest.snapshot, manifest.manifest_hash), original)

    def test_assignment_creation_cannot_backfill_a_locked_period(self):
        manifest = self.freeze()
        with self.assertRaises(ValidationError) as refused:
            ShiftSlotAssignment.objects.create(shift=self.shift, slot=self.late_slot, slot_date=self.slot.date,
                user=self.worker, settlement_channel='PAYROLL', engagement_kind='SHIFT_EMPLOYMENT', is_rostered=True)
        self.assertEqual(refused.exception.code, 'locked_payroll_period')
        self.assertFalse(ShiftSlotAssignment.objects.filter(slot=self.late_slot).exists())
        self.assertEqual(TimesheetManifest.objects.get(pk=manifest.pk).manifest_hash, manifest.manifest_hash)

    def test_settlement_update_cannot_change_locked_inputs_after_roster_unpublish(self):
        self.freeze()
        self.assignment.settlement_channel = 'PAYROLL'
        with self.assertRaises(ValidationError):
            self.assignment.save(update_fields=['settlement_channel'])
        self.assignment.refresh_from_db()
        self.assertEqual(self.assignment.settlement_channel, 'TIMESHEET_ONLY')

    def test_queryset_delete_cannot_remove_a_locked_assignment(self):
        with patch('workforce.signals.rebuild_timesheet_task.delay'):
            self.assertEqual(self.activate().status_code, 200)
        self.review()
        self.freeze()
        with self.assertRaises(ValidationError), transaction.atomic():
            ShiftSlotAssignment.objects.filter(pk=self.assignment.pk).delete()
        self.assertTrue(ShiftSlotAssignment.objects.filter(pk=self.assignment.pk).exists())

    def test_unchanged_field_save_does_not_require_a_correction(self):
        manifest = self.freeze()
        self.assignment.save(update_fields=['unit_rate'])
        self.assertEqual(TimesheetManifest.objects.get(pk=manifest.pk).manifest_hash, manifest.manifest_hash)

    def test_audited_correction_replays_the_same_paid_event_without_second_charge(self):
        from workforce.timesheets import correct_locked_period
        from workforce.roster.publication import publish_roster_period
        from attendance.models import AttendanceSession, AttendanceEvent
        from datetime import datetime
        from zoneinfo import ZoneInfo
        self.checkout()
        original = self.freeze()
        original_digest = original.manifest_hash
        with patch('shifts.notifications.notify_shift_managers') as alert:
            self.assertEqual(self.paid_webhook().status_code, 503)
            self.assertEqual(self.paid_webhook().status_code, 503)
            alert.assert_called_once()
        correct_locked_period(self.period, self.manager, 'Record the paid late fulfillment and review its payroll adjustment')
        with (patch('workforce.signals.rebuild_timesheet_task.delay'),
              patch('billing.stripe_support.stripe.checkout.Session.create') as create,
              patch('shifts.emails.send_shift_payment_finalized_notifications')):
            self.assertEqual(self.paid_webhook().status_code, 200)
            self.assertEqual(self.paid_webhook().status_code, 200)
            create.assert_not_called()
            assignment = ShiftSlotAssignment.objects.get(source_offer=self.late_offer)
            tz = ZoneInfo(self.pharmacy.timezone)
            start = datetime.combine(self.slot.date, self.late_slot.start_time, tzinfo=tz)
            end = datetime.combine(self.slot.date, self.late_slot.end_time, tzinfo=tz)
            session = AttendanceSession.objects.create(pharmacy=self.pharmacy, user=self.worker,
                assignment=assignment, started_at=start, ended_at=end)
            for kind, moment in (('CLOCK_IN', start), ('CLOCK_OUT', end)):
                AttendanceEvent.objects.create(session=session, event_type=kind, occurred_at=moment, source='QR_KIOSK')
            from memberships.models import Membership
            Membership.objects.create(user=self.worker, pharmacy=self.pharmacy, role='ASSISTANT',
                                      employment_type='LOCUM', status='ACCEPTED', is_active=True)
            publish_roster_period(RosterPeriod.objects.get(pharmacy=self.pharmacy), self.manager, force_warnings=True)
            self.review()
            adjustment = self.freeze()
        self.assertEqual(ShiftPayment.objects.count(), 1)
        self.assertFalse(ShiftPayment.objects.get().reconciliation_required)
        self.assertEqual(adjustment.snapshot['adjustment']['supersedes_manifest_hash'], original_digest)
        self.assertIn(assignment.pk, adjustment.snapshot['payroll_export'][0]['assignment_ids'])

    def test_fulfillment_refreshes_offer_terms_changed_by_activation(self):
        from shifts.finalize import finalize_shift_offer
        ShiftOffer.objects.filter(pk=self.late_offer.pk).update(settlement_channel='TIMESHEET_ONLY', payroll_activated_at=None)
        stale = ShiftOffer.objects.get(pk=self.late_offer.pk)
        with patch('workforce.signals.rebuild_timesheet_task.delay'):
            response = self.activate(offer_id=self.late_offer.pk)
            self.assertEqual(response.status_code, 200, response.data)
            finalize_shift_offer(stale)
        assignment = ShiftSlotAssignment.objects.get(source_offer=self.late_offer)
        self.late_offer.refresh_from_db()
        self.assertEqual(assignment.settlement_channel, 'PAYROLL')
        self.assertEqual(assignment.payroll_activated_at, self.late_offer.payroll_activated_at)

    def test_durable_invalidation_failure_rolls_back_payment_and_can_be_replayed(self):
        self.checkout()
        with patch('workforce.signals._enqueue', side_effect=RuntimeError('durable marker unavailable')):
            response = self.paid_webhook()
        self.assertEqual(response.status_code, 500)
        self.assertFalse(ShiftPayment.objects.exists())
        self.assertFalse(ShiftSlotAssignment.objects.filter(source_offer=self.late_offer).exists())
        with patch('workforce.signals.rebuild_timesheet_task.delay'):
            self.assertEqual(self.paid_webhook().status_code, 200)
        self.assertEqual(ShiftPayment.objects.count(), 1)
        self.assertEqual(ShiftSlotAssignment.objects.filter(source_offer=self.late_offer).count(), 1)

    def test_non_rostered_cover_recording_is_not_silently_given_a_new_freeze_workflow(self):
        self.freeze()
        assignment = ShiftSlotAssignment.objects.create(shift=self.shift, slot=self.late_slot, slot_date=self.slot.date,
            user=self.worker, settlement_channel='PAYROLL', engagement_kind='SHIFT_EMPLOYMENT', is_rostered=False)
        self.assertTrue(ShiftSlotAssignment.objects.filter(pk=assignment.pk).exists())

    def test_payroll_slot_time_edit_after_unpublish_requires_existing_correction(self):
        with patch('workforce.signals.rebuild_timesheet_task.delay'):
            self.assertEqual(self.activate().status_code, 200)
        self.review()
        manifest = self.freeze()
        original_end = self.slot.end_time
        self.slot.end_time = time(19)
        with self.assertRaises(ValidationError) as refused:
            self.slot.save(update_fields=['end_time'])
        self.assertEqual(refused.exception.code, 'locked_payroll_period')
        self.slot.refresh_from_db()
        self.assertEqual(self.slot.end_time, original_end)
        self.assertEqual(TimesheetManifest.objects.get(pk=manifest.pk).manifest_hash, manifest.manifest_hash)

    def test_refunded_payment_never_resumes_booking_during_correction_replay(self):
        from workforce.timesheets import correct_locked_period
        self.checkout()
        self.freeze()
        self.assertEqual(self.paid_webhook().status_code, 503)
        payment = ShiftPayment.objects.get()
        payment.status = 'refunded'
        payment.refunded_amount_aud = payment.amount_aud
        payment.reconciliation_required = False
        payment.save(update_fields=['status', 'refunded_amount_aud', 'reconciliation_required'])
        correct_locked_period(self.period, self.manager, 'Reconcile the refunded checkout')
        self.assertEqual(self.paid_webhook().status_code, 200)
        self.assertFalse(ShiftSlotAssignment.objects.filter(source_offer=self.late_offer).exists())

    def test_unlocked_payroll_delete_invalidates_once(self):
        with patch('workforce.signals.rebuild_timesheet_task.delay'):
            self.assertEqual(self.activate().status_code, 200)
        with patch('workforce.signals._enqueue') as enqueue:
            ShiftSlotAssignment.objects.filter(pk=self.assignment.pk).delete()
        enqueue.assert_called_once()
