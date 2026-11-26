"""Independent PostgreSQL connections exercise committed preparation and overlap races."""
from concurrent.futures import Future, ThreadPoolExecutor
from datetime import time, timedelta
from re import search
from threading import Barrier, Event, Lock, Thread
from unittest import mock, skipUnless

from django.db import connection, connections, transaction
from django.test import TransactionTestCase, override_settings
from django.test.utils import CaptureQueriesContext
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from billing import fulfillment
from billing.utils import BILLING_STATE_PAYMENT_REQUIRED
from billing import tests as fixtures
from billing.models import FulfillmentCheckout, FulfillmentReservation
from client_profile.characterization_support import client_for, make_owner_with_pharmacy, make_verified_pharmacist
from onboarding.models import AhpraCheck, PharmacistOnboarding
from onboarding.verification.state import apply_state_transition
from shifts import cancellation
from shifts.finalize import finalize_shift_offer
from shifts.models import Shift, ShiftOffer, ShiftSlot, ShiftSlotAssignment


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
        competitor = ShiftOffer.objects.create(shift=self.shift, slot=self.slot, user=make_verified_pharmacist(),
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


@skipUnless(connection.vendor == 'postgresql', 'Requires PostgreSQL row locks')
@override_settings(AHPRA_ENFORCEMENT_ENABLED=True, AHPRA_SOURCE='manual',
                   CHANNEL_LAYERS={'default': {'BACKEND': 'channels.layers.InMemoryChannelLayer'}})
class BookingLockOrderTests(TransactionTestCase):
    def setUp(self):
        self.owner, self.pharmacy = make_owner_with_pharmacy()
        self.worker = make_verified_pharmacist()
        self.profile = PharmacistOnboarding.objects.get(user=self.worker)
        self.day = timezone.localdate() + timedelta(days=2)

    def offers(self, day, workers, *, status=ShiftOffer.Status.ACCEPTED_AWAITING_PAYMENT):
        shift = Shift.objects.create(
            pharmacy=self.pharmacy, created_by=self.owner, role_needed='PHARMACIST',
            employment_type='LOCUM', visibility='PLATFORM', single_user_only=False,
            rate_type='FIXED', fixed_rate=70, payment_status='PENDING',
        )
        offers = []
        for index, worker in enumerate(workers):
            slot = ShiftSlot.objects.create(
                shift=shift, date=day, start_time=time(9 + index), end_time=time(10 + index), rate=70,
            )
            offers.append(ShiftOffer.objects.create(shift=shift, slot=slot, user=worker, status=status))
        return offers

    def race(self, left, right, *, left_hook=None, right_hook=None):
        def run(operation, hook):
            seen = set()

            def observe(execute, sql, params, many, context):
                table = self.locked_table(sql)
                if hook is None or table is None or table in seen:
                    return execute(sql, params, many, context)
                seen.add(table)
                hook(table, before=True, seen=seen)
                result = execute(sql, params, many, context)
                hook(table, before=False, seen=seen)
                return result

            try:
                with transaction.atomic():
                    with connection.cursor() as cursor:
                        cursor.execute("SET LOCAL lock_timeout = '8s'")
                        cursor.execute("SET LOCAL statement_timeout = '12s'")
                    with CaptureQueriesContext(connection) as queries, connection.execute_wrapper(observe):
                        result = operation()
                return result, queries.captured_queries
            finally:
                connections.close_all()

        def collect(future, operation, hook):
            try:
                future.set_result(run(operation, hook))
            except Exception as exc:
                future.set_exception(exc)

        results = [Future(), Future()]
        threads = [Thread(target=collect, args=(result, operation, hook), daemon=True)
                   for result, operation, hook in zip(results, (left, right), (left_hook, right_hook))]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join(timeout=20)
        self.assertFalse(any(thread.is_alive() for thread in threads), 'Booking race did not finish')
        # An OperationalError (including 40P01) propagates as a failure.
        return [result.result(timeout=0) for result in results]

    @staticmethod
    def locked_table(sql):
        if 'FOR UPDATE' in sql or 'FOR NO KEY UPDATE' in sql:
            return search(r'\bFROM "([^"]+)"', sql)[1]

    def assert_booking_order(self, queries, profile_ids):
        shift, profile, offer, user, slot = (
            model._meta.db_table for model in (Shift, PharmacistOnboarding, ShiftOffer,
                                               type(self.worker), ShiftSlot))
        tables = [self.locked_table(query['sql']) for query in queries]
        self.assertEqual([tables.index(table) for table in (shift, profile, offer, user, slot)],
                         sorted(tables.index(table) for table in (shift, profile, offer, user, slot)))
        profile_sql = [query['sql'] for query, table in zip(queries, tables) if table == profile]
        self.assertEqual([int(search(r'"id" = (\d+)', sql)[1]) for sql in profile_sql[:len(profile_ids)]],
                         profile_ids)
        self.assertGreater(tables.index(offer), tables.index(profile) + len(profile_ids) - 1)

    def finalize(self, offer):
        try:
            return finalize_shift_offer(offer, payment_completed_at=timezone.now())
        except ValidationError as exc:
            return exc.detail

    def test_suspension_and_paid_finalize(self):
        offer, booked = self.offers(self.day, [self.worker, self.worker])
        period = self.pharmacy.roster_periods.create(week_start=self.day - timedelta(days=self.day.weekday()))
        self.assertEqual(len(finalize_shift_offer(booked)[0]), 1)
        self.profile.ahpra_number = 'PHA0000123456'
        self.profile.save(update_fields=['ahpra_number'])
        check = AhpraCheck.objects.create(
            model_name='PharmacistOnboarding', object_pk=self.profile.pk,
            registration_number=self.profile.ahpra_number, reason='recheck',
        )
        together = Barrier(2)
        original = cancellation.cancel_upcoming_assignments

        def suspend():
            PharmacistOnboarding.objects.select_for_update().get(pk=self.profile.pk)
            AhpraCheck.objects.select_for_update().get(pk=check.pk)
            AhpraCheck.objects.filter(pk=check.pk).update(
                status='done', outcome='rejected', completed_at=timezone.now(),
                register_data={'registration_status': 'Suspended'},
            )
            apply_state_transition(self.profile, {'state': 'ok'})

        def cancel(*args, **kwargs):
            together.wait(timeout=6)
            return original(*args, **kwargs)

        def booking_hook(table, *, before, seen):
            if ((table == PharmacistOnboarding._meta.db_table and before and ShiftOffer._meta.db_table not in seen)
                    or (table == ShiftOffer._meta.db_table and not before and PharmacistOnboarding._meta.db_table not in seen)):
                together.wait(timeout=6)

        with mock.patch.object(cancellation, 'cancel_upcoming_assignments', side_effect=cancel), \
                mock.patch('onboarding.verification.state.announce_suspension'), \
                mock.patch('onboarding.verification.state.announce_member_suspension'), \
                mock.patch('onboarding.verification.state.announce_support_review'):
            (_, suspension_queries), (result, _) = self.race(
                suspend, lambda: self.finalize(offer), right_hook=booking_hook)
        self.assertEqual(result['code'], 'candidate_ahpra_ineligible')
        locked_tables = [self.locked_table(query['sql']) for query in suspension_queries]
        self.assertIn(period._meta.db_table, locked_tables)
        self.assertNotIn(Shift._meta.db_table, locked_tables)
        offer.refresh_from_db()
        self.assertEqual(offer.status, ShiftOffer.Status.DECLINED)
        self.assertFalse(ShiftSlotAssignment.objects.filter(shift=offer.shift).exists())

    def test_accept_and_finalize_on_different_shifts(self):
        pending, = self.offers(self.day, [self.worker], status=ShiftOffer.Status.PENDING)
        paid, = self.offers(self.day + timedelta(days=1), [self.worker])
        together = Barrier(2)
        worker_table = type(self.worker)._meta.db_table

        def accept():
            return client_for(self.worker).post(f'/api/v1/shift-offers/{pending.pk}/accept/', {}, format='json')

        def accept_hook(table, *, before, seen):
            if table == worker_table and before:
                together.wait(timeout=6)

        def booking_hook(table, *, before, seen):
            if ((table == PharmacistOnboarding._meta.db_table and before and worker_table not in seen)
                    or (table == worker_table and not before and PharmacistOnboarding._meta.db_table not in seen)):
                together.wait(timeout=6)

        with mock.patch('shifts.engagement.build_shift_engagement_terms', return_value={}), \
                mock.patch('billing.utils.get_billing_state_for_pharmacy', return_value=BILLING_STATE_PAYMENT_REQUIRED), \
                mock.patch('shifts.offers.notify_shift_users'), mock.patch('shifts.offers.async_task'):
            (response, accept_queries), (result, finalize_queries) = self.race(
                accept, lambda: self.finalize(paid), left_hook=accept_hook, right_hook=booking_hook)
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(len(result[0]), 1)
        for queries in (accept_queries, finalize_queries):
            self.assert_booking_order(queries, [self.profile.pk])

    def test_multi_worker_fulfillments_in_opposite_offer_order(self):
        second_worker = make_verified_pharmacist()
        left = self.offers(self.day, [self.worker, second_worker])
        right = self.offers(self.day + timedelta(days=1), [second_worker, self.worker])
        together = Barrier(2)

        def after_shift_lock(table, *, before, seen):
            if table == Shift._meta.db_table and not before:
                together.wait(timeout=6)

        def fulfill(offers):
            return fulfillment._finalize_pending_offers_for_shift(
                offers[0].shift, offer_ids=[offer.pk for offer in offers])

        for count, queries in self.race(lambda: fulfill(left), lambda: fulfill(right),
                                       left_hook=after_shift_lock, right_hook=after_shift_lock):
            self.assertEqual(count, 2)
            self.assert_booking_order(queries, sorted([self.profile.pk, second_worker.pharmacistonboarding.pk]))
        self.assertEqual(ShiftSlotAssignment.objects.count(), 4)
