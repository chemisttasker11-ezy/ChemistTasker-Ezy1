"""Independent PostgreSQL connections exercise committed preparation and overlap races."""
from concurrent.futures import ThreadPoolExecutor
from threading import Event, Lock
from unittest import skipUnless
from django.db import connection, connections
from django.test import TransactionTestCase
from billing import tests as fixtures
from billing.models import FulfillmentCheckout, FulfillmentReservation
from client_profile.characterization_support import client_for
from shifts.models import ShiftOffer


@skipUnless(connection.vendor == 'postgresql', 'Requires PostgreSQL row locks')
class CheckoutReservationConcurrencyTests(TransactionTestCase):
    def setUp(self):
        fixtures.ShiftFulfillmentCheckoutTests.setUp(self)

    def request(self, **changes):
        connections.close_all()
        try:
            return client_for(self.owner).post(self.url, {'offer_ids': [self.offer.pk], **changes}, format='json')
        finally:
            connections.close_all()

    def test_platform_competitor_sees_reservation_while_first_provider_request_is_in_flight(self):
        accepted, finish = Event(), Event()
        def provider(**kwargs):
            accepted.set()
            if not finish.wait(15):
                raise AssertionError('test did not release provider')
            return fixtures._StripeObject(id='cs_concurrent', url='https://checkout.example.test/concurrent')
        self.checkout.side_effect = provider
        with ThreadPoolExecutor(max_workers=1) as pool:
            first = pool.submit(self.request)
            try:
                self.assertTrue(accepted.wait(15))
                self.assertEqual(FulfillmentReservation.objects.filter(active=True).count(), 1)
                second = self.request(platform='mobile')
                self.assertEqual(second.status_code, 409, second.data)
                self.checkout.assert_called_once()
            finally:
                finish.set()
            self.assertEqual(first.result(timeout=15).status_code, 200)
        self.assertEqual(FulfillmentCheckout.objects.count(), 1)

    def test_identical_inflight_requests_share_provider_idempotency_key(self):
        accepted, second_called, finish = Event(), Event(), Event()
        keys, mutex = [], Lock()
        def provider(**kwargs):
            with mutex:
                keys.append(kwargs['idempotency_key'])
                first = len(keys) == 1
            if first:
                accepted.set()
                if not finish.wait(15):
                    raise AssertionError('test did not release provider')
            else:
                second_called.set()
            return fixtures._StripeObject(id='cs_same', url='https://checkout.example.test/same')
        self.checkout.side_effect = provider
        with ThreadPoolExecutor(max_workers=2) as pool:
            first = pool.submit(self.request)
            try:
                self.assertTrue(accepted.wait(15))
                second = pool.submit(self.request)
                self.assertTrue(second_called.wait(15))
                self.assertEqual(second.result(timeout=15).status_code, 200)
            finally:
                finish.set()
            self.assertEqual(first.result(timeout=15).status_code, 200)
        self.assertEqual(len(keys), 2)
        self.assertEqual(len(set(keys)), 1)
        self.assertEqual(FulfillmentCheckout.objects.count(), 1)
        self.assertEqual(FulfillmentReservation.objects.filter(active=True).count(), 1)

    def test_different_candidate_overlap_cannot_prepare_second_provider_request(self):
        from client_profile.characterization_support import make_user
        competitor = ShiftOffer.objects.create(shift=self.shift, slot=self.slot, user=make_user('PHARMACIST'),
                                              status=ShiftOffer.Status.ACCEPTED_AWAITING_PAYMENT)
        accepted, finish = Event(), Event()
        def provider(**kwargs):
            accepted.set()
            if not finish.wait(15):
                raise AssertionError('test did not release provider')
            return fixtures._StripeObject(id='cs_winner', url='https://checkout.example.test/winner')
        self.checkout.side_effect = provider
        with ThreadPoolExecutor(max_workers=1) as pool:
            first = pool.submit(self.request)
            try:
                self.assertTrue(accepted.wait(15))
                second = self.request(offer_ids=[competitor.pk])
                self.assertEqual(second.status_code, 409, second.data)
            finally:
                finish.set()
            self.assertEqual(first.result(timeout=15).status_code, 200)
        self.checkout.assert_called_once()
