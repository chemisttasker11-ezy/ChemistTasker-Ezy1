"""Durable checkout ownership through HTTP and signed-payment dispatch boundaries."""
from datetime import time, timedelta
from decimal import Decimal
from unittest.mock import patch
from django.test import TestCase, override_settings
from django.urls import reverse
from django.utils import timezone
from rest_framework.exceptions import ValidationError
from billing import tests as fixtures
from billing.models import FulfillmentCheckout, FulfillmentReservation, ShiftPayment
from billing.checkout_reservations import occurrence_keys
from client_profile.characterization_support import client_for, make_user
from shifts.models import ShiftOffer, ShiftSlot, ShiftSlotAssignment


@override_settings(STRIPE_WEBHOOK_SECRET="whsec-disposable-reservation")
class CheckoutReservationTests(TestCase):
    def setUp(self):
        fixtures.ShiftFulfillmentCheckoutTests.setUp(self)
        rate = patch('shifts.finalize.get_locked_rate_for_slot', return_value=(Decimal('70'), {}))
        rate.start()
        self.addCleanup(rate.stop)

    def charge(self, offer=None, **extra):
        return self.client.post(self.url, {'offer_ids': [(offer or self.offer).pk], **extra}, format='json')

    def attempt(self):
        return FulfillmentCheckout.objects.get()

    def expire(self, actor=None):
        return client_for(actor or self.owner).post(reverse('api_v1:billing:expire_fulfillment_checkout',
                    args=[self.shift.pk, self.attempt().pk]), {}, format='json')

    def pay(self, *, metadata=None, intent='pi_reserved', session_id='cs_test', currency='aud', amount=3000):
        attempt = self.attempt()
        session = fixtures._StripeObject(id=session_id, mode='payment', payment_status='paid',
            amount_total=amount, currency=currency, payment_intent=intent,
            metadata=metadata if metadata is not None else attempt.parameters['metadata'])
        event = fixtures._StripeObject(id=f'evt_{intent}', type='checkout.session.completed',
                                      data=fixtures._StripeObject(object=session))
        with (patch('billing.stripe_support.stripe.Webhook.construct_event', return_value=event),
              patch('shifts.emails.send_shift_payment_finalized_notifications'),
              patch('notifications.services.notify_users') as alert):
            response = client_for().post(reverse('api_v1:billing:stripe_webhook'), b'{}', content_type='application/json')
        self.assertEqual(response.status_code, 200, response.content)
        return alert

    def test_unknown_provider_outcome_persists_reservation_and_retries_identical_parameters(self):
        def lost_ack(**kwargs):
            self.assertTrue(FulfillmentReservation.objects.filter(active=True).exists())
            raise TimeoutError('provider may have accepted')
        self.checkout.side_effect = lost_ack
        self.assertEqual(self.charge().status_code, 503)
        attempt = self.attempt()
        self.assertEqual(attempt.state, FulfillmentCheckout.State.UNKNOWN)
        first = self.checkout.call_args.kwargs.copy()
        self.assertEqual(self.charge(platform='mobile').status_code, 409)
        self.checkout.side_effect = None
        retry = self.charge()
        self.assertEqual(retry.status_code, 200, retry.data)
        self.assertEqual(first, self.checkout.call_args.kwargs)
        self.assertEqual(FulfillmentCheckout.objects.count(), 1)

    def test_unknown_past_provider_key_retention_requires_reconciliation(self):
        self.checkout.side_effect = TimeoutError('unknown')
        self.assertEqual(self.charge().status_code, 503)
        FulfillmentCheckout.objects.update(created_at=timezone.now() - timedelta(hours=24))
        self.assertEqual(self.charge().status_code, 503)
        self.assertEqual(self.checkout.call_count, 1)

    def test_alternate_candidate_on_same_occurrence_is_reserved(self):
        self.assertEqual(self.charge().status_code, 200)
        competitor = ShiftOffer.objects.create(shift=self.shift, slot=self.slot, user=make_user('PHARMACIST'),
                                              status=ShiftOffer.Status.ACCEPTED_AWAITING_PAYMENT)
        self.assertEqual(self.charge(competitor).status_code, 409)
        self.checkout.assert_called_once()

    def test_disjoint_occurrence_allows_independent_checkout(self):
        self.assertEqual(self.charge().status_code, 200)
        slot = ShiftSlot.objects.create(shift=self.shift, date=self.slot.date, start_time=time(18), end_time=time(21))
        other = ShiftOffer.objects.create(shift=self.shift, slot=slot, user=self.worker,
                                         status=ShiftOffer.Status.ACCEPTED_AWAITING_PAYMENT)
        self.checkout.return_value = fixtures._StripeObject(id='cs_other', url='https://checkout.example.test/other')
        self.assertEqual(self.charge(other).status_code, 200)
        self.assertEqual(FulfillmentCheckout.objects.count(), 2)
        self.assertEqual(len({c.kwargs['idempotency_key'] for c in self.checkout.call_args_list}), 2)

    def test_whole_shift_overlaps_existing_slot_checkout(self):
        self.assertEqual(self.charge().status_code, 200)
        whole = ShiftOffer.objects.create(shift=self.shift, user=self.worker,
                                         status=ShiftOffer.Status.ACCEPTED_AWAITING_PAYMENT)
        self.assertEqual(self.charge(whole).status_code, 409)

    def test_recurrence_selection_reserves_only_accepted_dates(self):
        self.slot.is_recurring, self.slot.recurring_days = True, list(range(7))
        self.slot.recurring_end_date = self.slot.date + timedelta(days=2)
        self.slot.save()
        self.offer.offered_slot_date = self.slot.date
        self.offer.save()
        self.assertEqual(occurrence_keys(self.offer), {f'{self.shift.pk}:{self.slot.pk}:{self.slot.date}'})
        whole = ShiftOffer.objects.create(shift=self.shift, user=self.worker,
            engagement_terms_snapshot={'occurrences': [{'slot_id': self.slot.pk, 'date': str(self.slot.date)}]})
        self.assertEqual(len(occurrence_keys(whole)), 3)

    def test_expiry_requires_payer_authority_before_contacting_provider(self):
        self.charge()
        with patch('billing.stripe_support.stripe.checkout.Session.retrieve') as retrieve:
            self.assertEqual(self.expire(self.worker).status_code, 403)
        retrieve.assert_not_called()

    def test_expiry_releases_only_after_confirmed_unpaid_expiry(self):
        first = self.charge()
        original_key = self.checkout.call_args.kwargs['idempotency_key']
        expired = fixtures._StripeObject(id='cs_test', status='expired', payment_status='unpaid')
        with (patch('billing.stripe_support.stripe.checkout.Session.retrieve', return_value=fixtures._StripeObject(id='cs_test', status='open')),
              patch('billing.stripe_support.stripe.checkout.Session.expire', return_value=expired) as expire):
            self.assertEqual(self.expire().status_code, 200)
            expire.assert_called_once_with('cs_test')
        self.assertFalse(FulfillmentReservation.objects.filter(active=True).exists())
        self.checkout.return_value = fixtures._StripeObject(id='cs_new', url='https://checkout.example.test/new')
        second = self.charge(platform='mobile')
        self.assertEqual(second.status_code, 200, second.data)
        self.assertNotEqual(first.data['checkout_id'], second.data['checkout_id'])
        self.assertNotEqual(original_key, self.checkout.call_args.kwargs['idempotency_key'])

    def test_paid_or_uncertain_expiry_never_releases_reservation(self):
        self.charge()
        for result in (TimeoutError('lost'), fixtures._StripeObject(id='cs_test', status='complete', payment_status='paid'),
                       fixtures._StripeObject(id='different', status='expired', payment_status='unpaid')):
            with self.subTest(result=type(result).__name__):
                with patch('billing.stripe_support.stripe.checkout.Session.retrieve',
                           **({'side_effect': result} if isinstance(result, Exception) else {'return_value': result})):
                    self.assertIn(self.expire().status_code, (409, 503))
                self.assertTrue(FulfillmentReservation.objects.filter(active=True).exists())

    def test_free_route_cannot_bypass_card_reservation(self):
        self.charge()
        with patch('billing.views.get_billing_state_for_account', return_value='PRE_LIVE'):
            response = self.charge()
        self.assertEqual(response.status_code, 400, response.data)
        self.assertFalse(ShiftSlotAssignment.objects.exists())
        self.offer.refresh_from_db()
        self.assertEqual(self.offer.status, ShiftOffer.Status.ACCEPTED_AWAITING_PAYMENT)

    def test_deletion_guard_survives_offer_withdrawal_and_status_changes(self):
        from shifts.deletion import protect_shift_deletion
        from shifts.access import ShiftActionRefused
        self.charge()
        self.shift.payment_status = 'PAID'
        self.shift.save()
        self.offer.delete()
        with self.assertRaises(ShiftActionRefused):
            protect_shift_deletion(self.shift)

    def test_signed_payment_binds_and_books_once(self):
        self.charge()
        self.pay()
        self.pay()  # event replay
        attempt = self.attempt()
        self.assertEqual(attempt.state, FulfillmentCheckout.State.COMPLETE)
        self.assertEqual(ShiftPayment.objects.count(), 1)
        self.assertEqual(ShiftSlotAssignment.objects.count(), 1)
        self.assertFalse(ShiftPayment.objects.get().reconciliation_required)

    def test_webhook_before_provider_ack_is_reconciled_without_second_checkout(self):
        def paid_before_ack(**kwargs):
            self.pay()
            return fixtures._StripeObject(id='cs_test', url='https://checkout.example.test/paid')
        self.checkout.side_effect = paid_before_ack
        self.assertEqual(self.charge().status_code, 409)
        self.assertEqual(self.attempt().state, FulfillmentCheckout.State.COMPLETE)
        self.assertEqual(ShiftSlotAssignment.objects.count(), 1)
        self.assertEqual(self.charge().status_code, 400)
        self.checkout.assert_called_once()

    def test_mismatched_paid_identity_retains_money_and_reconciliation_flag(self):
        self.charge()
        metadata = dict(self.attempt().parameters['metadata'], fulfillment_checkout_id='invalid-uuid')
        alert = self.pay(metadata=metadata)
        payment = ShiftPayment.objects.get()
        self.assertEqual(payment.amount_aud, Decimal('30.00'))
        self.assertEqual(payment.reconciliation_reason, 'invalid_checkout_identity')
        self.assertTrue(payment.reconciliation_required)
        self.assertFalse(ShiftSlotAssignment.objects.exists())
        alert.assert_called_once()

    def test_currency_or_metadata_mismatch_cannot_fulfill_reserved_work(self):
        self.charge()
        metadata = dict(self.attempt().parameters['metadata'], offer_ids='999999')
        self.pay(metadata=metadata)
        self.pay(intent='pi_wrong_currency', currency='usd')
        self.assertEqual(set(ShiftPayment.objects.values_list('reconciliation_reason', flat=True)),
                         {'checkout_metadata_mismatch', 'checkout_currency_mismatch'})
        self.assertFalse(ShiftSlotAssignment.objects.exists())

    def test_second_paid_intent_is_recorded_for_refund_and_not_rebooked(self):
        self.charge()
        self.pay()
        self.pay(intent='pi_duplicate')
        self.assertEqual(ShiftSlotAssignment.objects.count(), 1)
        second = ShiftPayment.objects.get(stripe_payment_intent_id='pi_duplicate')
        self.assertTrue(second.reconciliation_required)
        self.assertEqual(second.reconciliation_reason, 'duplicate_paid_checkout_intent')

    def test_late_payment_after_expiry_does_not_consume_new_reserved_work(self):
        self.charge()
        old = self.attempt()
        expired = fixtures._StripeObject(id='cs_test', status='expired', payment_status='unpaid')
        with patch('billing.stripe_support.stripe.checkout.Session.retrieve', return_value=expired):
            self.assertEqual(self.expire().status_code, 200)
        self.checkout.return_value = fixtures._StripeObject(id='cs_replacement', url='https://checkout.example.test/new')
        self.assertEqual(self.charge(platform='mobile').status_code, 200)
        with patch.object(self, 'attempt', return_value=old):
            self.pay()
        self.assertFalse(ShiftSlotAssignment.objects.exists())
        self.assertEqual(ShiftPayment.objects.get().reconciliation_reason, 'paid_work_unavailable')
        self.offer.refresh_from_db()
        self.assertEqual(self.offer.status, ShiftOffer.Status.ACCEPTED_AWAITING_PAYMENT)

    def test_wrong_paid_amount_is_retained_without_booking(self):
        self.charge()
        self.pay(amount=1)
        self.assertEqual(ShiftPayment.objects.get().reconciliation_reason, 'checkout_amount_mismatch')
        self.assertFalse(ShiftSlotAssignment.objects.exists())

    def test_resume_uses_original_parameters_across_platforms_and_authorizes_first(self):
        self.checkout.side_effect = TimeoutError('unknown')
        self.assertEqual(self.charge().status_code, 503)
        original = self.checkout.call_args.kwargs.copy()
        url = reverse('api_v1:billing:resume_fulfillment_checkout', args=[self.shift.pk, self.attempt().pk])
        self.assertEqual(client_for(self.worker).post(url).status_code, 403)
        self.assertEqual(self.checkout.call_count, 1)
        self.checkout.side_effect = None
        response = self.client.post(url)
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(original, self.checkout.call_args.kwargs)

    def test_pill_route_rolls_back_debit_when_card_checkout_owns_work(self):
        from rewards.models import PillLedgerEntry
        from rewards.services import get_shift_post_pill_cost, get_pill_balance
        cost = get_shift_post_pill_cost()
        PillLedgerEntry.objects.create(user=self.owner, entry_type='EARN', source='MANUAL', delta=cost,
                                      balance_after=cost, idempotency_key='reservation-test-credit')
        self.charge()
        response = self.client.post('/api/v1/pill-rewards/pay-shift/',
                                    {'shift_id': self.shift.pk, 'offer_ids': [self.offer.pk]}, format='json')
        self.assertEqual(response.status_code, 400, response.data)
        self.assertEqual(get_pill_balance(self.owner), cost)
        self.assertFalse(PillLedgerEntry.objects.filter(entry_type='SPEND').exists())
        self.assertFalse(ShiftSlotAssignment.objects.exists())

    def test_real_stripe_signature_accepts_original_payload_and_rejects_tampering(self):
        import hashlib
        import hmac
        import json
        import time as clock
        self.charge()
        event = {'id': 'evt_real_signature', 'object': 'event', 'type': 'checkout.session.completed',
                 'data': {'object': {'id': 'cs_test', 'object': 'checkout.session', 'mode': 'payment',
                     'payment_status': 'paid', 'payment_intent': 'pi_real_signature', 'amount_total': 3000,
                     'currency': 'aud', 'metadata': self.attempt().parameters['metadata']}}}
        payload = json.dumps(event).encode()
        timestamp = int(clock.time())
        signature = hmac.new(b'whsec-disposable-reservation', str(timestamp).encode() + b'.' + payload,
                             hashlib.sha256).hexdigest()
        url = reverse('api_v1:billing:stripe_webhook')
        headers = {'HTTP_STRIPE_SIGNATURE': f't={timestamp},v1={signature}'}
        with patch('shifts.emails.send_shift_payment_finalized_notifications'):
            rejected = client_for().post(url, payload + b' ', content_type='application/json', **headers)
            self.assertEqual(rejected.status_code, 400)
            self.assertFalse(ShiftPayment.objects.exists())
            accepted = client_for().post(url, payload, content_type='application/json', **headers)
        self.assertEqual(accepted.status_code, 200, accepted.content)
        self.assertEqual(ShiftPayment.objects.count(), 1)
        self.assertEqual(ShiftSlotAssignment.objects.count(), 1)

    def test_changed_occurrence_after_checkout_retains_payment_and_original_selection(self):
        self.charge()
        original = set(self.attempt().reservations.values_list('occurrence_key', flat=True))
        self.slot.date += timedelta(days=1)
        self.slot.save(update_fields=['date'])
        self.pay()
        self.assertEqual(ShiftPayment.objects.get().reconciliation_reason, 'paid_work_unavailable')
        self.assertFalse(ShiftSlotAssignment.objects.exists())
        self.assertEqual(set(self.attempt().reservations.values_list('occurrence_key', flat=True)), original)
        self.offer.refresh_from_db()
        self.assertEqual(self.offer.status, ShiftOffer.Status.ACCEPTED_AWAITING_PAYMENT)

    def test_changed_worker_after_checkout_cannot_redirect_paid_booking(self):
        self.charge()
        self.offer.user = make_user('PHARMACIST')
        self.offer.save(update_fields=['user'])
        self.pay()
        self.assertTrue(ShiftPayment.objects.get().reconciliation_required)
        self.assertFalse(ShiftSlotAssignment.objects.exists())

    def test_changed_selection_metadata_cannot_bind_to_original_paid_attempt(self):
        self.charge()
        metadata = dict(self.attempt().parameters['metadata'], fulfillment_selection_hash='different')
        self.pay(metadata=metadata)
        self.assertEqual(ShiftPayment.objects.get().reconciliation_reason, 'checkout_metadata_mismatch')
        self.assertFalse(ShiftSlotAssignment.objects.exists())
