from queue import Queue
from threading import Barrier, BrokenBarrierError, Thread
from unittest import mock, skipUnless

from django.contrib.auth import get_user_model
from django.db import close_old_connections, connection
from django.test import TestCase, TransactionTestCase

from client_profile.characterization_support import make_owner_with_pharmacy, make_user
from client_profile.models import OwnerOnboarding
from shifts.models import Shift, ShiftOffer
from rewards.models import PillLedgerEntry, PillReferralEvent
from rewards.services import (
    award_referral_event,
    award_verified_referrals_for_user,
    claim_referral_code,
    get_or_create_referral_code,
    get_pill_balance,
    get_shift_post_pill_cost,
    RewardError,
    seed_default_reward_rules,
    spend_pills_for_shift_post,
)


class PillRewardsTests(TestCase):
    @mock.patch("rewards.services._send_pill_award_message")
    def test_duplicate_referral_events_share_one_award_key(self, _send):
        code = get_or_create_referral_code(self.referrer)
        event = claim_referral_code(referred_user=self.referred, code=code.code, award=True)
        duplicate = PillReferralEvent.objects.create(referrer=self.referrer, referred_user=self.referred, referral_code=code, referral_type="FRIEND", status="CLAIMED")
        award_referral_event(duplicate)
        self.assertEqual(get_pill_balance(self.referrer), 100)
        self.assertEqual(PillLedgerEntry.objects.count(), 1)
        replay = claim_referral_code(referred_user=self.referred, code=code.code, award=True)
        self.assertEqual(replay.pk, event.pk)
        other = get_user_model().objects.create_user(email="other-referred@example.test", role="PHARMACIST")
        claim_referral_code(referred_user=other, code=code.code, award=True)
        self.assertEqual(get_pill_balance(self.referrer), 200)

    def setUp(self):
        seed_default_reward_rules()
        User = get_user_model()
        self.referrer = User.objects.create_user(
            email="referrer@example.com",
            password="password",
            role="PHARMACIST",
        )
        self.referred = User.objects.create_user(
            email="referred@example.com",
            password="password",
            role="PHARMACIST",
        )

    def test_referral_claim_waits_until_referred_user_is_verified(self):
        code = get_or_create_referral_code(self.referrer)

        event = claim_referral_code(referred_user=self.referred, code=code.code)
        claim_referral_code(referred_user=self.referred, code=code.code)

        event.refresh_from_db()
        self.assertEqual(event.status, PillReferralEvent.Status.CLAIMED)
        self.assertEqual(get_pill_balance(self.referrer), 0)
        self.assertEqual(PillLedgerEntry.objects.filter(user=self.referrer).count(), 0)

        self.referred.role = "OWNER"
        self.referred.is_otp_verified = True
        self.referred.save(update_fields=["role", "is_otp_verified"])
        OwnerOnboarding.objects.create(
            user=self.referred,
            phone_number="0400000000",
            role=OwnerOnboarding.ROLE_CHOICES[0][0],
            chain_pharmacy=False,
            verified=True,
        )
        award_verified_referrals_for_user(self.referred)
        event.refresh_from_db()

        self.assertEqual(event.status, PillReferralEvent.Status.AWARDED)
        self.assertEqual(get_pill_balance(self.referrer), 100)
        self.assertEqual(PillLedgerEntry.objects.filter(user=self.referrer).count(), 1)

    def test_self_referral_is_blocked(self):
        code = get_or_create_referral_code(self.referrer)

        with self.assertRaises(RewardError):
            claim_referral_code(referred_user=self.referrer, code=code.code)

        self.assertEqual(get_pill_balance(self.referrer), 0)


@skipUnless(connection.vendor == "postgresql", "PostgreSQL row locks required.")
class PillReferralConcurrencyTests(TransactionTestCase):
    @mock.patch("rewards.services._send_pill_award_message")
    def test_concurrent_first_claims_create_one_event_and_award(self, _send):
        from django.db.models.query import QuerySet
        seed_default_reward_rules()
        referrer = get_user_model().objects.create_user(email="race-referrer@example.test", role="PHARMACIST")
        referred = get_user_model().objects.create_user(email="race-referred@example.test", role="PHARMACIST")
        code = get_or_create_referral_code(referrer)
        start, reads, results = Barrier(2), Barrier(2), Queue()
        first = QuerySet.first

        def synchronized_first(queryset):
            row = first(queryset)
            if queryset.model is PillReferralEvent and row is None:
                try:
                    reads.wait(timeout=2)
                except BrokenBarrierError:
                    pass
            return row

        def claim():
            close_old_connections()
            try:
                start.wait(timeout=10)
                event = claim_referral_code(referred_user=referred, code=code.code, award=True)
                results.put(event.pk)
            except Exception as exc:
                results.put(repr(exc))
            finally:
                close_old_connections()

        with mock.patch.object(QuerySet, "first", synchronized_first):
            threads = [Thread(target=claim) for _ in range(2)]
            for thread in threads:
                thread.start()
            for thread in threads:
                thread.join(timeout=20)
            self.assertFalse(any(thread.is_alive() for thread in threads), "Referral race timed out")
        event = PillReferralEvent.objects.get(referred_user=referred)
        self.assertEqual([results.get(timeout=5) for _ in threads], [event.pk, event.pk])
        self.assertEqual(PillLedgerEntry.objects.filter(user=referrer).count(), 1)
        self.assertEqual(get_pill_balance(referrer), 100)
        other = get_user_model().objects.create_user(email="race-other@example.test", role="PHARMACIST")
        claim_referral_code(referred_user=other, code=code.code, award=True)
        self.assertEqual(get_pill_balance(referrer), 200)


class PillOfferSpendTests(TestCase):
    def test_replaying_one_offer_spend_is_idempotent(self):
        owner, pharmacy = make_owner_with_pharmacy()
        shift = Shift.objects.create(
            pharmacy=pharmacy, created_by=owner, role_needed="ASSISTANT", employment_type="LOCUM",
        )
        offer = ShiftOffer.objects.create(shift=shift, user=make_user())
        cost = get_shift_post_pill_cost()
        PillLedgerEntry.objects.create(
            user=owner, entry_type="EARN", source="MANUAL", delta=cost,
            balance_after=cost, idempotency_key="idempotent-spend-credit",
        )
        first = spend_pills_for_shift_post(user=owner, shift=shift, offer=offer)
        replay = spend_pills_for_shift_post(user=owner, shift=shift, offer=offer)
        self.assertEqual(first.pk, replay.pk)
        self.assertEqual(get_pill_balance(owner), 0)
        self.assertEqual(PillLedgerEntry.objects.filter(entry_type="SPEND").count(), 1)


@skipUnless(connection.vendor == "postgresql", "PostgreSQL row locks required.")
class PillSpendPostgresConcurrencyTests(TransactionTestCase):
    def test_concurrent_offer_spends_cannot_overdraw(self):
        owner, pharmacy = make_owner_with_pharmacy()
        shift = Shift.objects.create(
            pharmacy=pharmacy, created_by=owner, role_needed="ASSISTANT", employment_type="LOCUM",
        )
        offers = [ShiftOffer.objects.create(shift=shift, user=make_user()) for _ in range(2)]
        cost = get_shift_post_pill_cost()
        PillLedgerEntry.objects.create(
            user=owner, entry_type="EARN", source="MANUAL", delta=cost,
            balance_after=cost, idempotency_key="concurrent-spend-credit",
        )
        start, balances_read, results = Barrier(2), Barrier(2), Queue()

        def synchronized_balance(user):
            balance = get_pill_balance(user)
            try:
                # Without serialization both transactions read the same spendable balance.
                balances_read.wait(timeout=5)
            except BrokenBarrierError:
                pass
            return balance

        def spend(offer):
            close_old_connections()
            try:
                start.wait(timeout=10)
                spend_pills_for_shift_post(user=owner, shift=shift, offer=offer)
                results.put("spent")
            except RewardError:
                results.put("insufficient")
            except Exception as exc:
                results.put(repr(exc))
            finally:
                close_old_connections()

        with mock.patch("rewards.services.get_pill_balance", side_effect=synchronized_balance):
            threads = [Thread(target=spend, args=(offer,)) for offer in offers]
            for thread in threads:
                thread.start()
            for thread in threads:
                thread.join(timeout=20)
            self.assertFalse(any(thread.is_alive() for thread in threads), "Pill spend race timed out")
        self.assertCountEqual([results.get(timeout=5), results.get(timeout=5)], ["spent", "insufficient"])
        self.assertEqual(get_pill_balance(owner), 0)
        self.assertEqual(PillLedgerEntry.objects.filter(entry_type="SPEND").count(), 1)
