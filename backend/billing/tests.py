from unittest.mock import patch
from datetime import datetime, time, timedelta
from decimal import Decimal

from django.test import TestCase, override_settings
from django.urls import reverse

from .models import StripeWebhookEvent
from .models import ShiftPayment
from django.contrib.auth import get_user_model
from django.utils import timezone
from client_profile.models import Pharmacy, Shift
from client_profile.characterization_support import client_for, make_owner_with_pharmacy


class _StripeObject(dict):
    def __getattr__(self, name):
        try:
            return self[name]
        except KeyError as exc:
            raise AttributeError(name) from exc


@override_settings(STRIPE_WEBHOOK_SECRET='whsec-test')
class StripeWebhookIdempotencyTests(TestCase):
    @patch('billing.views.stripe.Webhook.construct_event')
    @patch('billing.views._finalize_pending_offers_for_shift')
    def test_failed_fulfillment_rolls_back_payment_and_allows_retry(self, finalize, construct_event):
        owner = get_user_model().objects.create_user(email='billing-owner@example.test', role='OWNER')
        pharmacy = Pharmacy.objects.create(name='Billing test pharmacy')
        shift = Shift.objects.create(pharmacy=pharmacy, created_by=owner, role_needed='PHARMACIST', employment_type='LOCUM', payment_status='PENDING')
        construct_event.return_value = _StripeObject(
            id='evt_fulfillment_retry', type='checkout.session.completed',
            data=_StripeObject(object=_StripeObject(
                mode='payment', payment_status='paid', amount_total=12345,
                payment_intent='pi_retry', metadata={'shift_id': str(shift.pk), 'type': 'fulfillment', 'owner_user_id': str(owner.pk)},
            )),
        )
        finalize.side_effect = [RuntimeError('temporary assignment failure'), (0, [])]
        with patch('shifts.emails.send_shift_payment_finalized_notifications'):
            first = self.client.post(reverse('api_v1:billing:stripe_webhook'), b'{}', content_type='application/json')
            self.assertEqual(first.status_code, 500)
            self.assertFalse(ShiftPayment.objects.exists())
            shift.refresh_from_db()
            self.assertEqual(shift.payment_status, 'PENDING')
            second = self.client.post(reverse('api_v1:billing:stripe_webhook'), b'{}', content_type='application/json')
            self.assertEqual(second.status_code, 200)
            replay = self.client.post(reverse('api_v1:billing:stripe_webhook'), b'{}', content_type='application/json')
            self.assertEqual(replay.status_code, 200)
        self.assertEqual(ShiftPayment.objects.count(), 1)
        self.assertEqual(finalize.call_count, 2)
        shift.refresh_from_db()
        self.assertEqual(shift.payment_status, 'PAID')

    @patch('billing.views.logger.exception')
    @patch('billing.views._process_stripe_event', side_effect=RuntimeError('failed attempt'))
    @patch('billing.views.stripe.Webhook.construct_event')
    def test_failed_attempt_cannot_downgrade_a_completed_retry(self, construct_event, process, log):
        construct_event.return_value = self._event('evt_interleaved')
        # Reproduce the interleaving after rollback but before recording failure.
        def completed_retry(*args, **kwargs):
            StripeWebhookEvent.objects.create(event_id='evt_interleaved', event_type='test.event', status=StripeWebhookEvent.Status.PROCESSED, processed_at=timezone.now())
        log.side_effect = completed_retry
        response = self.client.post(reverse('api_v1:billing:stripe_webhook'), b'{}', content_type='application/json')
        self.assertEqual(response.status_code, 500)
        delivery = StripeWebhookEvent.objects.get(event_id='evt_interleaved')
        self.assertEqual(delivery.status, StripeWebhookEvent.Status.PROCESSED)
        replay = self.client.post(reverse('api_v1:billing:stripe_webhook'), b'{}', content_type='application/json')
        self.assertEqual(replay.status_code, 200)
        self.assertEqual(process.call_count, 1)

    def _event(self, event_id='evt_test_1', event_type='test.event'):
        return _StripeObject(
            id=event_id,
            type=event_type,
            data=_StripeObject(object=_StripeObject()),
        )

    @patch('billing.views._process_stripe_event')
    @patch('billing.views.stripe.Webhook.construct_event')
    def test_replayed_processed_event_is_not_processed_twice(self, construct_event, process_event):
        construct_event.return_value = self._event()

        first = self.client.post(
            reverse('api_v1:billing:stripe_webhook'),
            data=b'{}',
            content_type='application/json',
            HTTP_STRIPE_SIGNATURE='test-signature',
        )
        second = self.client.post(
            reverse('api_v1:billing:stripe_webhook'),
            data=b'{}',
            content_type='application/json',
            HTTP_STRIPE_SIGNATURE='test-signature',
        )

        self.assertEqual(first.status_code, 200)
        self.assertEqual(second.status_code, 200)
        self.assertEqual(process_event.call_count, 1)
        delivery = StripeWebhookEvent.objects.get(event_id='evt_test_1')
        self.assertEqual(delivery.status, StripeWebhookEvent.Status.PROCESSED)
        self.assertIsNotNone(delivery.processed_at)

    @patch('billing.views._process_stripe_event')
    @patch('billing.views.stripe.Webhook.construct_event')
    def test_failed_event_can_be_retried_and_then_marked_processed(self, construct_event, process_event):
        construct_event.return_value = self._event(event_id='evt_retry')
        process_event.side_effect = [RuntimeError('synthetic failure'), None]

        first = self.client.post(
            reverse('api_v1:billing:stripe_webhook'),
            data=b'{}',
            content_type='application/json',
            HTTP_STRIPE_SIGNATURE='test-signature',
        )
        delivery = StripeWebhookEvent.objects.get(event_id='evt_retry')
        self.assertEqual(first.status_code, 500)
        self.assertEqual(delivery.status, StripeWebhookEvent.Status.FAILED)
        self.assertIsNotNone(delivery.failed_at)

        second = self.client.post(
            reverse('api_v1:billing:stripe_webhook'),
            data=b'{}',
            content_type='application/json',
            HTTP_STRIPE_SIGNATURE='test-signature',
        )
        delivery.refresh_from_db()

        self.assertEqual(second.status_code, 200)
        self.assertEqual(process_event.call_count, 2)
        self.assertEqual(delivery.status, StripeWebhookEvent.Status.PROCESSED)
        self.assertIsNotNone(delivery.processed_at)

class ShiftFulfillmentCheckoutTests(TestCase):
    def setUp(self):
        from datetime import time
        from client_profile.characterization_support import client_for, make_owner_with_pharmacy, make_user
        from shifts.models import ShiftOffer, ShiftSlot

        self.owner, self.pharmacy = make_owner_with_pharmacy('Checkout pharmacy')
        self.worker = make_user('PHARMACIST')
        self.client = client_for(self.owner)
        self.shift = Shift.objects.create(
            pharmacy=self.pharmacy, created_by=self.owner, role_needed='PHARMACIST',
            employment_type='LOCUM', payment_status='PENDING',
        )
        self.slot = ShiftSlot.objects.create(
            shift=self.shift, date=timezone.localdate(), start_time=time(9), end_time=time(17),
        )
        self.offer = ShiftOffer.objects.create(
            shift=self.shift, slot=self.slot, user=self.worker,
            status=ShiftOffer.Status.ACCEPTED_AWAITING_PAYMENT,
        )
        self.url = reverse('api_v1:billing:charge_fulfillment', args=[self.shift.pk])
        billing_state = patch('billing.views.get_billing_state_for_account', return_value='PAYMENT_REQUIRED')
        billing_state.start()
        self.addCleanup(billing_state.stop)
        checkout = patch('billing.views.stripe.checkout.Session.create')
        self.checkout = checkout.start()
        self.addCleanup(checkout.stop)
        self.checkout.return_value = _StripeObject(id='cs_test', url='https://checkout.example.test/cs_test')

    def test_empty_or_invalid_selection_does_not_create_checkout(self):
        for selection in ({}, {'offer_ids': ['invalid']}, {'slot_ids': ['invalid']}):
            with self.subTest(selection=selection):
                response = self.client.post(self.url, selection, format='json')
                self.assertEqual(response.status_code, 400, response.data)
        self.checkout.assert_not_called()

    def test_already_paid_selection_does_not_create_checkout(self):
        from shifts.models import ShiftOffer

        self.offer.status = ShiftOffer.Status.ACCEPTED
        self.offer.save(update_fields=['status'])
        for selection in ({'offer_ids': [self.offer.pk]}, {'slot_ids': [self.slot.pk]}):
            with self.subTest(selection=selection):
                response = self.client.post(self.url, selection, format='json')
                self.assertEqual(response.status_code, 400, response.data)
        self.checkout.assert_not_called()

    def test_foreign_offer_does_not_create_checkout(self):
        other_shift = Shift.objects.create(
            pharmacy=self.pharmacy, created_by=self.owner, role_needed='PHARMACIST', employment_type='LOCUM',
        )
        self.offer.shift = other_shift
        self.offer.save(update_fields=['shift'])
        response = self.client.post(self.url, {'offer_ids': [self.offer.pk]}, format='json')
        self.assertEqual(response.status_code, 400, response.data)
        self.checkout.assert_not_called()

    def test_one_unpaid_offer_creates_one_checkout_with_quantity_one(self):
        response = self.client.post(self.url, {'offer_ids': [self.offer.pk]}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['url'], self.checkout.return_value.url)
        self.checkout.assert_called_once()
        self.assertEqual(self.checkout.call_args.kwargs['line_items'], [
            {'price': 'price_1T52jFBQXaySV5ukezd5JmzS', 'quantity': 1},
        ])

    def test_repeated_checkout_uses_same_idempotency_key(self):
        selection = {'offer_ids': [self.offer.pk]}
        first = self.client.post(self.url, selection, format='json')
        second = self.client.post(self.url, selection, format='json')
        self.assertEqual(first.status_code, 200, first.data)
        self.assertEqual(second.status_code, 200, second.data)
        self.assertEqual(self.checkout.call_count, 2)
        first_key = self.checkout.call_args_list[0].kwargs.get('idempotency_key')
        self.assertTrue(first_key)
        self.assertEqual(first_key, self.checkout.call_args_list[1].kwargs.get('idempotency_key'))

    def test_slot_selection_and_offer_selection_use_same_idempotency_key(self):
        first = self.client.post(self.url, {'slot_ids': [self.slot.pk]}, format='json')
        second = self.client.post(self.url, {'offer_ids': [self.offer.pk]}, format='json')
        self.assertEqual(first.status_code, 200, first.data)
        self.assertEqual(second.status_code, 200, second.data)
        first_key = self.checkout.call_args_list[0].kwargs.get('idempotency_key')
        self.assertTrue(first_key)
        self.assertEqual(first_key, self.checkout.call_args_list[1].kwargs.get('idempotency_key'))

    def test_offer_order_does_not_change_key_but_selection_does(self):
        from shifts.models import ShiftOffer

        other_offer = ShiftOffer.objects.create(
            shift=self.shift, user=self.worker, status=ShiftOffer.Status.ACCEPTED_AWAITING_PAYMENT,
        )
        for offer_ids in ([self.offer.pk, other_offer.pk], [other_offer.pk, self.offer.pk], [self.offer.pk]):
            response = self.client.post(self.url, {'offer_ids': offer_ids}, format='json')
            self.assertEqual(response.status_code, 200, response.data)
        keys = [call.kwargs.get('idempotency_key') for call in self.checkout.call_args_list]
        self.assertTrue(keys[0])
        self.assertEqual(keys[0], keys[1])
        self.assertNotEqual(keys[0], keys[2])
        self.assertEqual(self.checkout.call_args_list[0].kwargs['line_items'][0]['quantity'], 2)

    def test_changed_params_or_next_day_get_a_new_idempotency_key(self):
        from datetime import timedelta

        selection = {'offer_ids': [self.offer.pk]}
        self.client.post(self.url, selection, format='json')
        self.client.post(self.url, {**selection, 'platform': 'mobile'}, format='json')
        with patch('billing.views.timezone.now', return_value=timezone.now() + timedelta(days=1)):
            self.client.post(self.url, selection, format='json')
        keys = [call.kwargs.get('idempotency_key') for call in self.checkout.call_args_list]
        self.assertEqual(len(set(keys)), 3)

    def test_candidate_mismatch_does_not_charge_offers_the_webhook_would_skip(self):
        mismatch = self.client.post(self.url, {'candidate_id': self.worker.pk + 999, 'offer_ids': [self.offer.pk]}, format='json')
        self.assertEqual(mismatch.status_code, 400, mismatch.data)
        self.checkout.assert_not_called()
        match = self.client.post(self.url, {'candidate_id': self.worker.pk, 'offer_ids': [self.offer.pk]}, format='json')
        self.assertEqual(match.status_code, 200, match.data)
        self.checkout.assert_called_once()


class OrganizationBillingScopeTests(TestCase):
    def setUp(self):
        from client_profile.characterization_support import make_owner_with_pharmacy, make_user
        from organizations.models import Organization, PharmacyAdmin
        from users.models import OrganizationMembership

        self.OrganizationMembership = OrganizationMembership
        self.PharmacyAdmin = PharmacyAdmin
        self.organization = Organization.objects.create(name="Billing Org")
        self.owner, self.pharmacy = make_owner_with_pharmacy("Billing Org Pharmacy")
        self.pharmacy.organization = self.organization
        self.pharmacy.save(update_fields=["organization"])

        self.org_admin = make_user("ORG_STAFF")
        OrganizationMembership.objects.create(
            user=self.org_admin, organization=self.organization, role="ORG_ADMIN",
        )
        self.chief = make_user("ORG_STAFF")
        OrganizationMembership.objects.create(
            user=self.chief, organization=self.organization, role="CHIEF_ADMIN", admin_level="MANAGER",
        )
        self.region_manager = make_user("ORG_STAFF")
        self.region_manager_membership = OrganizationMembership.objects.create(
            user=self.region_manager, organization=self.organization, role="REGION_ADMIN", admin_level="MANAGER",
        )
        self.region_manager_membership.pharmacies.add(self.pharmacy)
        self.region_comms = make_user("ORG_STAFF")
        self.region_comms_membership = OrganizationMembership.objects.create(
            user=self.region_comms, organization=self.organization, role="REGION_ADMIN",
            admin_level="COMMUNICATION_MANAGER",
        )
        self.region_comms_membership.pharmacies.add(self.pharmacy)
        self.unassigned_region = make_user("ORG_STAFF")
        OrganizationMembership.objects.create(
            user=self.unassigned_region, organization=self.organization, role="REGION_ADMIN", admin_level="MANAGER",
        )

        self.pharmacy_manager = make_user("PHARMACY_MANAGER")
        PharmacyAdmin.objects.create(
            user=self.pharmacy_manager, pharmacy=self.pharmacy,
            admin_level=PharmacyAdmin.AdminLevel.MANAGER, is_active=True,
        )
        self.roster_manager = make_user("PHARMACIST")
        PharmacyAdmin.objects.create(
            user=self.roster_manager, pharmacy=self.pharmacy,
            admin_level=PharmacyAdmin.AdminLevel.ROSTER_MANAGER, is_active=True,
        )
        self.comms_admin = make_user("PHARMACIST")
        PharmacyAdmin.objects.create(
            user=self.comms_admin, pharmacy=self.pharmacy,
            admin_level=PharmacyAdmin.AdminLevel.COMMUNICATION_MANAGER, is_active=True,
        )
        self.unrelated = make_user("PHARMACIST")

    def test_subscription_authority_stays_owner_and_org_admin_only(self):
        from billing.utils import user_can_manage_billing_for_pharmacy

        self.assertTrue(user_can_manage_billing_for_pharmacy(self.owner, self.pharmacy))
        self.assertTrue(user_can_manage_billing_for_pharmacy(self.org_admin, self.pharmacy))
        for user in (
            self.chief,
            self.region_manager,
            self.region_comms,
            self.unassigned_region,
            self.pharmacy_manager,
            self.roster_manager,
            self.comms_admin,
            self.unrelated,
        ):
            with self.subTest(user=user.email):
                self.assertFalse(user_can_manage_billing_for_pharmacy(user, self.pharmacy))

    def test_shift_charge_payers_follow_operational_scope(self):
        from billing.utils import user_can_pay_shift_charge_for_pharmacy

        for user in (
            self.owner,
            self.org_admin,
            self.chief,
            self.region_manager,
            self.pharmacy_manager,
            self.roster_manager,
        ):
            with self.subTest(allowed=user.email):
                self.assertTrue(user_can_pay_shift_charge_for_pharmacy(user, self.pharmacy))

        for user in (
            self.region_comms,
            self.unassigned_region,
            self.comms_admin,
            self.unrelated,
        ):
            with self.subTest(refused=user.email):
                self.assertFalse(user_can_pay_shift_charge_for_pharmacy(user, self.pharmacy))

        from client_profile.characterization_support import make_user
        ownerless = Pharmacy.objects.create(name="Ownerless Billing Pharmacy")
        ownerless_manager = make_user("PHARMACY_MANAGER")
        self.PharmacyAdmin.objects.create(
            user=ownerless_manager,
            pharmacy=ownerless,
            admin_level=self.PharmacyAdmin.AdminLevel.MANAGER,
            is_active=True,
        )
        self.assertFalse(
            user_can_pay_shift_charge_for_pharmacy(ownerless_manager, ownerless),
            "delegated payer authority must not manufacture a billing owner for an ownerless standalone pharmacy",
        )

    def test_operational_payer_never_becomes_billing_contact(self):
        from billing.utils import resolve_billing_account

        for payer in (self.chief, self.region_manager, self.pharmacy_manager, self.roster_manager):
            with self.subTest(payer=payer.email):
                account = resolve_billing_account(self.pharmacy, acting_user=payer)
                self.assertEqual(account["scope"], "organization")
                self.assertEqual(account["billing_contact"], self.org_admin)

    @patch('billing.views.get_billing_state_for_account', return_value='PRE_LIVE')
    @patch('billing.views._finalize_pending_offers_for_shift', return_value=(0, []))
    @patch('shifts.emails.send_shift_payment_finalized_notifications')
    def test_http_shift_charge_allows_operational_payer_but_subscription_stays_restricted(
        self, notify, finalize, billing_state,
    ):
        from rest_framework.test import APIClient
        from shifts.models import Shift, ShiftOffer

        shift = Shift.objects.create(
            pharmacy=self.pharmacy,
            created_by=self.owner,
            role_needed='ASSISTANT',
            employment_type='LOCUM',
            payment_status='PENDING',
        )
        offer = ShiftOffer.objects.create(
            shift=shift, user=self.unrelated, status=ShiftOffer.Status.ACCEPTED_AWAITING_PAYMENT,
        )
        client = APIClient()
        client.force_authenticate(self.chief)

        subscription = client.get(
            reverse('api_v1:billing:current_subscription'),
            {'pharmacy_id': self.pharmacy.pk},
        )
        self.assertEqual(subscription.status_code, 403, subscription.data)

        charge = client.post(
            reverse('api_v1:billing:charge_fulfillment', args=[shift.pk]),
            {'offer_ids': [offer.pk]},
            format='json',
        )
        self.assertEqual(charge.status_code, 200, charge.data)
        finalize.assert_called_once()
        notify.assert_called_once()

    def test_http_cancellation_penalty_follows_the_shift_charge_payer_policy(self):
        """charge_penalty uses the same payer authority as fulfilment, at the HTTP boundary."""
        from rest_framework.test import APIClient
        from shifts.models import Shift

        shift = Shift.objects.create(
            pharmacy=self.pharmacy,
            created_by=self.owner,
            role_needed='ASSISTANT',
            employment_type='LOCUM',
            payment_status='PENDING',
        )
        url = reverse('api_v1:billing:charge_penalty', args=[shift.pk])
        allowed = [self.owner, self.org_admin, self.chief, self.region_manager, self.pharmacy_manager, self.roster_manager]
        refused = [self.region_comms, self.unassigned_region, self.comms_admin, self.unrelated]
        for user in allowed + refused:
            with self.subTest(user=user.email):
                client = APIClient()
                client.force_authenticate(user)
                response = client.post(url, {}, format='json')
                # No assignments means no penalty: authorised payers get 200 without reaching Stripe.
                self.assertEqual(response.status_code, 200 if user in allowed else 403, response.data)

    def test_http_shift_charge_rejects_communication_only_region_admin(self):
        from rest_framework.test import APIClient
        from shifts.models import Shift

        shift = Shift.objects.create(
            pharmacy=self.pharmacy,
            created_by=self.owner,
            role_needed='ASSISTANT',
            employment_type='LOCUM',
            payment_status='PENDING',
        )
        client = APIClient()
        client.force_authenticate(self.region_comms)
        response = client.post(
            reverse('api_v1:billing:charge_fulfillment', args=[shift.pk]),
            {},
            format='json',
        )
        self.assertEqual(response.status_code, 403, response.data)


@override_settings(STRIPE_WEBHOOK_SECRET="whsec-pr200-test")
class StripePaymentIsolationContracts(TestCase):
    def test_b15_cancellation_webhook_never_finalizes_worker_offer(self):
        owner, pharmacy = make_owner_with_pharmacy("PR200 Penalty")
        shift = Shift.objects.create(
            pharmacy=pharmacy, created_by=owner,
            role_needed="PHARMACIST", employment_type="LOCUM",
            payment_status="PENDING",
        )
        event = _StripeObject(
            id="evt_pr200_cancellation", type="checkout.session.completed",
            data=_StripeObject(object=_StripeObject(
                mode="payment", payment_status="paid", amount_total=1200,
                payment_intent="pi_pr200_cancel",
                metadata={
                    "shift_id": str(shift.pk), "type": "cancellation",
                    "owner_user_id": str(owner.pk), "actor_user_id": str(owner.pk),
                },
            )),
        )
        with (
            patch("billing.views.stripe.Webhook.construct_event", return_value=event),
            patch("billing.views._finalize_pending_offers_for_shift", return_value=(0, [])) as finalize,
            patch("shifts.emails.send_shift_payment_finalized_notifications"),
        ):
            response = client_for().post(
                reverse("api_v1:billing:stripe_webhook"),
                data=b"{}", content_type="application/json",
            )
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(
            ShiftPayment.objects.filter(shift=shift, payment_type="cancellation").count(), 1
        )
        finalize.assert_not_called()
        shift.refresh_from_db()
        self.assertEqual(shift.payment_status, "PENDING")


class PenaltyMoneyContracts(TestCase):
    def setUp(self):
        from client_profile.characterization_support import make_assignment, make_user

        self.owner, pharmacy = make_owner_with_pharmacy("Penalty rounding")
        day = timezone.localdate() + timedelta(days=1)
        self.now = timezone.make_aware(datetime.combine(day, time(8)))
        self.shift, self.slot, self.assignment = make_assignment(
            pharmacy, self.owner, make_user("PHARMACIST"), day=day,
        )
        self.slot.end_time = time(9, 30)
        self.slot.save(update_fields=["end_time"])
        self.url = reverse("api_v1:billing:charge_penalty", args=[self.shift.pk])

    def penalty(self, rate):
        self.assignment.unit_rate = Decimal(rate)
        self.assignment.save(update_fields=["unit_rate"])
        with (
            patch("billing.views.timezone.now", return_value=self.now),
            patch("billing.views.stripe.checkout.Session.create", return_value=_StripeObject(url="https://checkout.example.test")) as checkout,
        ):
            response = client_for(self.owner).post(self.url, {}, format="json")
        self.assertEqual(response.status_code, 200, response.data)
        cents = checkout.call_args.kwargs["line_items"][0]["price_data"]["unit_amount"]
        self.assertIsInstance(cents, int)
        return cents

    def test_fractional_cent_penalty_rounds_half_up(self):
        self.assertEqual(self.penalty("0.05"), 1)

    def test_exact_cent_penalty_positive_control(self):
        self.assertEqual(self.penalty("1.00"), 10)

    def test_fractional_cent_below_half_rounds_down(self):
        self.assertEqual(self.penalty("0.04"), 0)


@override_settings(STRIPE_WEBHOOK_SECRET="whsec-payment-commit")
class PaymentWebhookCommitContracts(TestCase):
    def setUp(self):
        self.owner, pharmacy = make_owner_with_pharmacy("Payment commit")
        self.shift = Shift.objects.create(
            pharmacy=pharmacy, created_by=self.owner,
            role_needed="PHARMACIST", employment_type="LOCUM", payment_status="PENDING",
        )
        self.event = _StripeObject(
            id="evt_payment_commit", type="checkout.session.completed",
            data=_StripeObject(object=_StripeObject(
                mode="payment", payment_status="paid", amount_total=12345,
                payment_intent="pi_payment_commit",
                metadata={"shift_id": str(self.shift.pk), "type": "fulfillment", "owner_user_id": str(self.owner.pk)},
            )),
        )
        for target, value in (
            ("billing.views.stripe.Webhook.construct_event", self.event),
            ("billing.views._finalize_pending_offers_for_shift", (0, [])),
        ):
            mock = patch(target, return_value=value)
            mock.start()
            self.addCleanup(mock.stop)

    def deliver(self):
        return self.client.post(reverse("api_v1:billing:stripe_webhook"), b"{}", content_type="application/json")

    def test_checkout_ledger_uses_decimal_before_database_conversion(self):
        with patch.object(ShiftPayment.objects, "get_or_create", wraps=ShiftPayment.objects.get_or_create) as create:
            response = self.deliver()
        self.assertEqual(response.status_code, 200)
        amount = create.call_args.kwargs["defaults"]["amount_aud"]
        self.assertIsInstance(amount, Decimal)
        self.assertEqual(amount, Decimal("123.45"))
        self.assertEqual(ShiftPayment.objects.get().amount_aud, Decimal("123.45"))

    def test_checkout_exact_dollar_positive_control(self):
        self.event.data.object['amount_total'] = 1200
        self.assertEqual(self.deliver().status_code, 200)
        self.assertEqual(ShiftPayment.objects.get().amount_aud, Decimal("12.00"))

    def test_notification_waits_until_commit_with_finalized_state(self):
        with patch("shifts.emails.send_shift_payment_finalized_notifications") as notify:
            with self.captureOnCommitCallbacks(execute=True) as callbacks:
                self.assertEqual(self.deliver().status_code, 200)
                notify.assert_not_called()
            self.assertEqual(len(callbacks), 1)
            notify.assert_called_once()
            self.assertEqual(notify.call_args.kwargs["shift"].payment_status, "PAID")

    def test_rollback_discards_notification_and_payment(self):
        with (
            patch("shifts.emails.send_shift_payment_finalized_notifications") as notify,
            patch.object(Shift, "save", side_effect=RuntimeError("payment status update failed")),
            self.captureOnCommitCallbacks(execute=True) as callbacks,
        ):
            self.assertEqual(self.deliver().status_code, 500)
            notify.assert_not_called()
        self.assertEqual(callbacks, [])
        self.assertFalse(ShiftPayment.objects.exists())
        self.shift.refresh_from_db()
        self.assertEqual(self.shift.payment_status, "PENDING")


@override_settings(STRIPE_WEBHOOK_SECRET="whsec-lost-occurrence")
class PaidOfferLosingOccurrenceContracts(TestCase):
    def setUp(self):
        from client_profile.characterization_support import make_user
        from shifts.models import ShiftSlot
        self.owner, pharmacy = make_owner_with_pharmacy("Lost occurrence")
        self.day = timezone.localdate() + timedelta(days=3)
        self.shift = Shift.objects.create(
            pharmacy=pharmacy, created_by=self.owner, role_needed="PHARMACIST",
            employment_type="LOCUM", single_user_only=False, payment_status="PENDING",
        )
        self.slot = ShiftSlot.objects.create(
            shift=self.shift, date=self.day, start_time=time(9), end_time=time(17), rate=Decimal("70"),
            is_recurring=True, recurring_days=list(range(7)), recurring_end_date=self.day + timedelta(days=7),
        )
        self.make_user = make_user

    def offer(self, status, day):
        from shifts.models import ShiftOffer
        return ShiftOffer.objects.create(shift=self.shift, slot=self.slot, user=self.make_user("PHARMACIST"),
                                         status=status, offered_slot_date=day)

    def pay(self, offer, intent, event_id=None, real_notifications=False, before_commit=None):
        from shifts.notifications import notify_shift_managers
        event = _StripeObject(
            id=event_id or f"evt_{intent}", type="checkout.session.completed",
            data=_StripeObject(object=_StripeObject(
                mode="payment", payment_status="paid", amount_total=1500, payment_intent=intent,
                metadata={"shift_id": str(self.shift.pk), "type": "fulfillment", "offer_ids": str(offer.pk),
                          "owner_user_id": str(self.owner.pk), "actor_user_id": str(self.owner.pk)},
            )),
        )
        with (
            patch("billing.views.stripe.Webhook.construct_event", return_value=event),
            patch("shifts.finalize.get_locked_rate_for_slot", return_value=(Decimal("70"), {})),
            patch("shifts.emails.send_shift_payment_finalized_notifications"),
            patch("shifts.notifications.notify_shift_managers",
                  wraps=notify_shift_managers if real_notifications else None) as notify,
            self.captureOnCommitCallbacks(execute=True),
        ):
            response = client_for().post(reverse("api_v1:billing:stripe_webhook"), data=b"{}",
                                         content_type="application/json")
            if before_commit:
                before_commit()
        return response, notify

    def test_refund_alert_survives_delivery_failure_and_payment_intent_replays(self):
        from notifications.models import Notification
        from shifts.models import ShiftOffer
        expired = self.offer(ShiftOffer.Status.EXPIRED, self.day)
        def durable_before_delivery():
            self.assertEqual(Notification.objects.filter(
                payload__notification_kind="shift_payment_refund_required").count(), 1)
        with patch("notifications.services._broadcast", side_effect=RuntimeError("delivery unavailable")) as send:
            for event_id in (None, None, "evt_same_payment_new_event"):
                response, _ = self.pay(expired, "pi_durable_refund", event_id, real_notifications=True,
                                       before_commit=durable_before_delivery)
                self.assertEqual(response.status_code, 200, response.content)
                alert = Notification.objects.get(payload__notification_kind="shift_payment_refund_required")
                self.assertEqual(alert.user_id, self.owner.pk)
                self.assertEqual(alert.payload["payment_id"], ShiftPayment.objects.get(
                    stripe_payment_intent_id="pi_durable_refund").pk)
            send.assert_called_once()
        self.assertEqual(ShiftPayment.objects.count(), 1)

    def test_refund_alert_delivers_after_commit_when_transport_is_healthy(self):
        from notifications.models import Notification
        from shifts.models import ShiftOffer
        expired = self.offer(ShiftOffer.Status.EXPIRED, self.day)
        with patch("notifications.services._broadcast") as send, patch("notifications.services._send_expo_push") as push:
            response, _ = self.pay(expired, "pi_healthy_refund", real_notifications=True)
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(Notification.objects.count(), 1)
        self.assertEqual(send.call_args_list[0].args[1], "notification.created")
        self.assertEqual(send.call_count, 2)
        push.assert_called_once()

    def test_refund_alert_rolls_back_with_payment(self):
        from notifications.models import Notification
        from shifts.models import ShiftOffer
        expired = self.offer(ShiftOffer.Status.EXPIRED, self.day)
        with patch.object(Shift, "save", side_effect=RuntimeError("payment status update failed")), patch(
            "notifications.services._broadcast",
        ) as send:
            response, _ = self.pay(expired, "pi_rolled_back_refund", real_notifications=True)
        self.assertEqual(response.status_code, 500)
        self.assertFalse(Notification.objects.exists())
        self.assertFalse(ShiftPayment.objects.exists())
        send.assert_not_called()

    def test_losing_paid_offer_records_payment_and_is_flagged_for_refund(self):
        from shifts.finalize import finalize_shift_offer
        from shifts.models import ShiftOffer, ShiftSlotAssignment
        winner = self.offer(ShiftOffer.Status.ACCEPTED_AWAITING_PAYMENT, self.day)
        with patch("shifts.finalize.get_locked_rate_for_slot", return_value=(Decimal("70"), {})):
            finalize_shift_offer(winner)
        loser = self.offer(ShiftOffer.Status.ACCEPTED_AWAITING_PAYMENT, self.day)
        response, notify = self.pay(loser, "pi_lost_occurrence")
        self.assertEqual(response.status_code, 200, response.content)
        self.assertTrue(ShiftPayment.objects.filter(stripe_payment_intent_id="pi_lost_occurrence", status="paid").exists())
        loser.refresh_from_db()
        self.assertEqual(loser.status, ShiftOffer.Status.EXPIRED)
        self.assertEqual(list(ShiftSlotAssignment.objects.filter(shift=self.shift).values_list("source_offer_id", flat=True)), [winner.pk])
        notify.assert_called_once()
        self.assertEqual(notify.call_args.kwargs["kind"], "shift_payment_refund_required")
        self.assertEqual(notify.call_args.kwargs["payload"]["offer_ids"], [loser.pk])

    def test_winning_paid_offer_closes_only_its_own_occurrence(self):
        from shifts.models import ShiftOffer
        winner = self.offer(ShiftOffer.Status.ACCEPTED_AWAITING_PAYMENT, self.day)
        same_date = self.offer(ShiftOffer.Status.PENDING, self.day)
        next_date = self.offer(ShiftOffer.Status.PENDING, self.day + timedelta(days=1))
        response, notify = self.pay(winner, "pi_won_occurrence")
        self.assertEqual(response.status_code, 200, response.content)
        for offer, expected in ((winner, ShiftOffer.Status.ACCEPTED), (same_date, ShiftOffer.Status.EXPIRED),
                                (next_date, ShiftOffer.Status.PENDING)):
            offer.refresh_from_db()
            self.assertEqual(offer.status, expected)
        notify.assert_not_called()
        self.shift.refresh_from_db()
        self.assertEqual(self.shift.payment_status, "PAID")

    def test_second_paid_checkout_reconciles_expired_competitor_once(self):
        from shifts.models import ShiftOffer, ShiftSlotAssignment
        winner = self.offer(ShiftOffer.Status.ACCEPTED_AWAITING_PAYMENT, self.day)
        loser = self.offer(ShiftOffer.Status.ACCEPTED_AWAITING_PAYMENT, self.day)
        response, notify = self.pay(winner, "pi_first_checkout")
        self.assertEqual(response.status_code, 200, response.content)
        notify.assert_not_called()
        loser.refresh_from_db()
        self.assertEqual(loser.status, ShiftOffer.Status.EXPIRED)

        with patch("billing.views.logger.error") as log:
            response, notify = self.pay(loser, "pi_second_checkout")
            self.assertEqual(response.status_code, 200, response.content)
            payment = ShiftPayment.objects.get(stripe_payment_intent_id="pi_second_checkout")
            self.assertEqual(payment.status, "paid")
            self.assertEqual(payment.amount_aud, Decimal("15.00"))
            notify.assert_called_once()
            self.assertEqual(notify.call_args.kwargs["kind"], "shift_payment_refund_required")
            self.assertEqual(notify.call_args.kwargs["payload"], {"payment_id": payment.pk, "offer_ids": [loser.pk]})
            log.assert_called_once()
            for event_id in (None, "evt_second_checkout_replay"):
                response, replay_notify = self.pay(loser, "pi_second_checkout", event_id=event_id)
                self.assertEqual(response.status_code, 200, response.content)
                replay_notify.assert_not_called()
            log.assert_called_once()

        self.assertEqual(ShiftPayment.objects.count(), 2)
        loser.refresh_from_db()
        self.assertEqual(loser.status, ShiftOffer.Status.EXPIRED)
        self.assertEqual(list(ShiftSlotAssignment.objects.filter(shift=self.shift).values_list("source_offer_id", flat=True)), [winner.pk])

    def test_paid_expired_offer_is_not_resurrected_on_an_available_date(self):
        from shifts.models import ShiftOffer, ShiftSlotAssignment
        expired = self.offer(ShiftOffer.Status.EXPIRED, self.day)
        response, notify = self.pay(expired, "pi_expired_available_date")
        self.assertEqual(response.status_code, 200, response.content)
        self.assertTrue(ShiftPayment.objects.filter(stripe_payment_intent_id="pi_expired_available_date", status="paid").exists())
        self.assertFalse(ShiftSlotAssignment.objects.exists())
        expired.refresh_from_db()
        self.assertEqual(expired.status, ShiftOffer.Status.EXPIRED)
        notify.assert_called_once()

    def test_winning_checkout_does_not_flag_unselected_expired_offer(self):
        from shifts.models import ShiftOffer
        self.offer(ShiftOffer.Status.EXPIRED, self.day)
        winner = self.offer(ShiftOffer.Status.ACCEPTED_AWAITING_PAYMENT, self.day)
        response, notify = self.pay(winner, "pi_unrelated_expired")
        self.assertEqual(response.status_code, 200, response.content)
        winner.refresh_from_db()
        self.assertEqual(winner.status, ShiftOffer.Status.ACCEPTED)
        notify.assert_not_called()

    def test_reconciliation_without_explicit_offer_ids_ignores_expired_offers(self):
        from billing.views import _finalize_pending_offers_for_shift
        from shifts.models import ShiftOffer
        self.offer(ShiftOffer.Status.EXPIRED, self.day)
        unbookable = []
        self.assertEqual(_finalize_pending_offers_for_shift(self.shift, unbookable=unbookable), 0)
        self.assertEqual(unbookable, [])
