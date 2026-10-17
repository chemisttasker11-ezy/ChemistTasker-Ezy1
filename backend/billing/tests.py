from unittest.mock import patch
from datetime import timedelta, date, time
from decimal import Decimal

from django.test import TestCase, override_settings
from django.urls import reverse

from .models import StripeWebhookEvent
from .models import ShiftPayment
from django.contrib.auth import get_user_model
from django.utils import timezone
from client_profile.models import Pharmacy, Shift


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
        # This fixture mocks an empty finalizer (there was no payable offer).
        # Under the new policy, payment is recorded for reconciliation rather
        # than falsely claiming the shift was confirmed.
        self.assertEqual(shift.payment_status, 'PENDING')
        self.assertTrue(ShiftPayment.objects.get().needs_reconciliation)

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


    @patch('billing.views.stripe.Webhook.construct_event')
    @patch('billing.views._finalize_pending_offers_for_shift')
    def test_paid_cancellation_penalty_does_not_confirm_reserved_worker(self, finalize, construct_event):
        """A penalty settlement is not a fulfillment fee: pending work stays pending."""
        owner = get_user_model().objects.create_user(
            email='cancellation-payment-owner@example.test', role='OWNER',
        )
        pharmacy = Pharmacy.objects.create(name='Penalty isolation pharmacy')
        shift = Shift.objects.create(
            pharmacy=pharmacy, created_by=owner, role_needed='PHARMACIST',
            employment_type='LOCUM', payment_status='PENDING',
        )
        construct_event.return_value = _StripeObject(
            id='evt_penalty_does_not_confirm', type='checkout.session.completed',
            data=_StripeObject(object=_StripeObject(
                mode='payment', payment_status='paid', amount_total=1000,
                payment_intent='pi_penalty_isolated',
                metadata={
                    'shift_id': str(shift.pk),
                    'type': 'cancellation',
                    'owner_user_id': str(owner.pk),
                },
            )),
        )
        response = self.client.post(
            reverse('api_v1:billing:stripe_webhook'),
            b'{}', content_type='application/json',
        )
        self.assertEqual(response.status_code, 200)
        finalize.assert_not_called()
        shift.refresh_from_db()
        self.assertEqual(shift.payment_status, 'PENDING')
        payment = ShiftPayment.objects.get(stripe_payment_intent_id='pi_penalty_isolated')
        self.assertEqual(payment.payment_type, 'cancellation')



    @patch('billing.views.stripe.Webhook.construct_event')
    def test_late_fulfillment_payment_is_held_for_reconciliation_not_booking(self, construct_event):
        from shifts.models import ShiftOffer
        owner = get_user_model().objects.create_user(
            email='late-fulfillment-owner@example.test', role='OWNER',
        )
        worker = get_user_model().objects.create_user(
            email='late-fulfillment-worker@example.test', role='PHARMACIST',
        )
        pharmacy = Pharmacy.objects.create(name='Late payment pharmacy')
        shift = Shift.objects.create(
            pharmacy=pharmacy, created_by=owner, role_needed='PHARMACIST',
            employment_type='LOCUM', single_user_only=True,
            payment_status='NOT_REQUIRED',
        )
        offer = ShiftOffer.objects.create(
            shift=shift, user=worker, status=ShiftOffer.Status.EXPIRED,
            payment_due_at=timezone.now() - timedelta(minutes=1),
            payment_expired_at=timezone.now(),
        )
        construct_event.return_value = _StripeObject(
            id='evt_late_reservation_payment', type='checkout.session.completed',
            data=_StripeObject(object=_StripeObject(
                mode='payment', payment_status='paid', amount_total=1500,
                payment_intent='pi_late_payment_reservation',
                metadata={
                    'shift_id': str(shift.pk), 'type': 'fulfillment',
                    'owner_user_id': str(owner.pk),
                    'offer_ids': str(offer.pk),
                },
            )),
        )
        with patch('shifts.emails.send_shift_payment_finalized_notifications') as notice:
            response = self.client.post(
                reverse('api_v1:billing:stripe_webhook'), b'{}',
                content_type='application/json',
            )
        self.assertEqual(response.status_code, 200)
        notice.assert_not_called()
        shift.refresh_from_db()
        offer.refresh_from_db()
        self.assertEqual(shift.payment_status, 'NOT_REQUIRED')
        self.assertEqual(offer.status, ShiftOffer.Status.EXPIRED)
        self.assertTrue(ShiftPayment.objects.get(
            stripe_payment_intent_id='pi_late_payment_reservation',
        ).needs_reconciliation)

    @patch('billing.views.stripe.Webhook.construct_event')
    def test_after_deadline_before_sweep_is_not_falsely_booked(self, construct_event):
        from shifts.models import ShiftOffer
        owner = get_user_model().objects.create_user(
            email='late-before-sweep-owner@example.test', role='OWNER',
        )
        worker = get_user_model().objects.create_user(
            email='late-before-sweep-worker@example.test', role='PHARMACIST',
        )
        pharmacy = Pharmacy.objects.create(name='Before sweep pharmacy')
        shift = Shift.objects.create(
            pharmacy=pharmacy, created_by=owner, role_needed='PHARMACIST',
            employment_type='LOCUM', payment_status='PENDING',
        )
        offer = ShiftOffer.objects.create(
            shift=shift, user=worker,
            status=ShiftOffer.Status.ACCEPTED_AWAITING_PAYMENT,
            payment_due_at=timezone.now() - timedelta(minutes=1),
        )
        construct_event.return_value = _StripeObject(
            id='evt_expired_before_sweep', type='checkout.session.completed',
            data=_StripeObject(object=_StripeObject(
                mode='payment', payment_status='paid', amount_total=1500,
                payment_intent='pi_after_expiry_before_sweep',
                metadata={
                    'shift_id': str(shift.pk), 'type': 'fulfillment',
                    'owner_user_id': str(owner.pk), 'offer_ids': str(offer.pk),
                },
            )),
        )
        response = self.client.post(
            reverse('api_v1:billing:stripe_webhook'), b'{}',
            content_type='application/json',
        )
        self.assertEqual(response.status_code, 200)
        offer.refresh_from_db()
        self.assertEqual(offer.status, ShiftOffer.Status.ACCEPTED_AWAITING_PAYMENT)
        self.assertTrue(ShiftPayment.objects.get(
            stripe_payment_intent_id='pi_after_expiry_before_sweep',
        ).needs_reconciliation)



    @patch('billing.views.stripe.Webhook.construct_event')
    def test_verified_fulfillment_before_deadline_confirms_once(self, construct_event):
        from shifts.models import ShiftOffer, ShiftSlot, ShiftSlotAssignment
        owner = get_user_model().objects.create_user(
            email='on-time-owner@example.test', role='OWNER',
        )
        worker = get_user_model().objects.create_user(
            email='on-time-worker@example.test', role='PHARMACIST',
        )
        pharmacy = Pharmacy.objects.create(name='On-time payment pharmacy')
        shift = Shift.objects.create(
            pharmacy=pharmacy, created_by=owner, role_needed='PHARMACIST',
            employment_type='LOCUM', single_user_only=True, payment_status='PENDING',
        )
        slot = ShiftSlot.objects.create(
            shift=shift, date=date.today() + timedelta(days=5),
            start_time=time(9, 0), end_time=time(17, 0), rate=Decimal('75.00'),
        )
        offer = ShiftOffer.objects.create(
            shift=shift, user=worker,
            status=ShiftOffer.Status.ACCEPTED_AWAITING_PAYMENT,
            payment_due_at=timezone.now() + timedelta(hours=6),
        )
        construct_event.return_value = _StripeObject(
            id='evt_on_time_confirmed', type='checkout.session.completed',
            data=_StripeObject(object=_StripeObject(
                mode='payment', payment_status='paid', amount_total=1500,
                payment_intent='pi_on_time_confirmed',
                metadata={
                    'shift_id': str(shift.pk), 'type': 'fulfillment',
                    'owner_user_id': str(owner.pk), 'offer_ids': str(offer.pk),
                },
            )),
        )
        with self.captureOnCommitCallbacks(execute=False):
            response = self.client.post(
                reverse('api_v1:billing:stripe_webhook'),
                b'{}', content_type='application/json',
            )
        self.assertEqual(response.status_code, 200)
        offer.refresh_from_db()
        shift.refresh_from_db()
        self.assertEqual(offer.status, ShiftOffer.Status.ACCEPTED)
        self.assertEqual(shift.payment_status, 'PAID')
        self.assertEqual(ShiftSlotAssignment.objects.filter(
            shift=shift, slot=slot, user=worker, source_offer=offer,
        ).count(), 1)
        self.assertFalse(ShiftPayment.objects.get(
            stripe_payment_intent_id='pi_on_time_confirmed',
        ).needs_reconciliation)
        again = self.client.post(
            reverse('api_v1:billing:stripe_webhook'),
            b'{}', content_type='application/json',
        )
        self.assertEqual(again.status_code, 200)
        self.assertEqual(ShiftSlotAssignment.objects.filter(shift=shift).count(), 1)


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
        from shifts.models import Shift

        shift = Shift.objects.create(
            pharmacy=self.pharmacy,
            created_by=self.owner,
            role_needed='ASSISTANT',
            employment_type='LOCUM',
            payment_status='PENDING',
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
            {},
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

    def test_internal_employed_shift_never_enters_penalty_checkout(self):
        from rest_framework.test import APIClient
        from shifts.models import Shift
        for employment in ("FULL_TIME", "PART_TIME", "CASUAL"):
            with self.subTest(employment=employment):
                shift = Shift.objects.create(
                    pharmacy=self.pharmacy, created_by=self.owner,
                    role_needed="ASSISTANT", employment_type=employment,
                )
                client = APIClient()
                client.force_authenticate(self.owner)
                response = client.post(
                    reverse("api_v1:billing:charge_penalty", args=[shift.pk]),
                    {}, format="json",
                )
                self.assertEqual(response.status_code, 409, response.data)

    def test_roster_owned_shift_never_enters_penalty_checkout(self):
        from rest_framework.test import APIClient
        from shifts.models import Shift
        shift = Shift.objects.create(
            pharmacy=self.pharmacy, created_by=self.owner,
            role_needed="PHARMACIST", employment_type="LOCUM",
        )
        # Roster origin is immutable outside the workforce-owned commands.
        Shift.objects.filter(pk=shift.pk).update(is_roster_container=True)
        client = APIClient()
        client.force_authenticate(self.owner)
        response = client.post(
            reverse("api_v1:billing:charge_penalty", args=[shift.pk]),
            {}, format="json",
        )
        self.assertEqual(response.status_code, 409, response.data)

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

