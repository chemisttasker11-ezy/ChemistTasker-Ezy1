"""Payment reconciliation and atomic occurrence-confirmation regressions."""
from datetime import time, timedelta
from decimal import Decimal
from unittest.mock import patch

from django.test import TestCase, override_settings
from django.urls import reverse
from django.utils import timezone

from billing.models import ShiftPayment
from client_profile.characterization_support import client_for, make_owner_with_pharmacy, make_user
from client_profile.models import Shift


class _S(dict):
    def __getattr__(self, name):
        try:
            return self[name]
        except KeyError as exc:
            raise AttributeError(name) from exc


RATE = patch("shifts.finalize.get_locked_rate_for_slot", return_value=(Decimal("70"), {}))


class _ShiftBase(TestCase):
    def setUp(self):
        from shifts.models import ShiftSlot
        self.owner, self.pharmacy = make_owner_with_pharmacy("Repro203")
        self.day = timezone.localdate() + timedelta(days=3)
        self.shift = Shift.objects.create(
            pharmacy=self.pharmacy, created_by=self.owner, role_needed="PHARMACIST",
            employment_type="LOCUM", single_user_only=False, payment_status="PENDING",
        )
        self.slot = ShiftSlot.objects.create(
            shift=self.shift, date=self.day, start_time=time(9), end_time=time(17), rate=Decimal("70"),
            is_recurring=True, recurring_days=list(range(7)), recurring_end_date=self.day + timedelta(days=7),
        )
        RATE.start()
        self.addCleanup(RATE.stop)

    def offer(self, status, day, slot=None):
        from shifts.models import ShiftOffer
        return ShiftOffer.objects.create(shift=self.shift, slot=slot or self.slot, user=make_user("PHARMACIST"),
                                         status=status, offered_slot_date=day)


@override_settings(STRIPE_WEBHOOK_SECRET="whsec-repro203")
class PaidOfferReconciliationTests(_ShiftBase):
    def pay(self, offer, intent, event_id=None):
        event = _S(id=event_id or f"evt_{intent}", type="checkout.session.completed", data=_S(object=_S(
            mode="payment", payment_status="paid", amount_total=1500, payment_intent=intent,
            metadata={"shift_id": str(self.shift.pk), "type": "fulfillment", "offer_ids": str(offer.pk),
                      "owner_user_id": str(self.owner.pk), "actor_user_id": str(self.owner.pk)})))
        with (patch("billing.stripe_support.stripe.Webhook.construct_event", return_value=event),
              patch("shifts.emails.send_shift_payment_finalized_notifications"),
              patch("shifts.notifications.notify_shift_managers") as notify,
              self.captureOnCommitCallbacks(execute=True)):
            response = client_for().post(reverse("api_v1:billing:stripe_webhook"), data=b"{}",
                                         content_type="application/json")
        return response, notify

    def test_claim1_two_sessions_for_one_offer_are_creatable_control(self):
        from shifts.models import ShiftOffer
        o = self.offer(ShiftOffer.Status.ACCEPTED_AWAITING_PAYMENT, self.day)
        url = reverse("api_v1:billing:charge_fulfillment", args=[self.shift.pk])
        with patch("billing.views.get_billing_state_for_account", return_value="PAYMENT_REQUIRED"), \
                patch("billing.stripe_support.stripe.checkout.Session.create",
                      return_value=_S(id="cs", url="https://x.test/cs")) as create:
            for platform in ("web", "mobile"):
                self.assertEqual(client_for(self.owner).post(url, {"offer_ids": [o.pk], "platform": platform},
                                                             format="json").status_code, 200)
        keys = {c.kwargs["idempotency_key"] for c in create.call_args_list}
        offers = {c.kwargs["metadata"]["offer_ids"] for c in create.call_args_list}
        self.assertEqual((len(keys), offers), (2, {str(o.pk)}))  # two distinct Stripe sessions, same offer

    def test_claim1_second_paid_session_for_booked_offer_alerts_refund_bug(self):
        from shifts.models import ShiftOffer
        o = self.offer(ShiftOffer.Status.ACCEPTED_AWAITING_PAYMENT, self.day)
        r, notify = self.pay(o, "pi_first")
        self.assertEqual(r.status_code, 200, r.content)
        o.refresh_from_db()
        self.assertEqual(o.status, ShiftOffer.Status.ACCEPTED)
        notify.assert_not_called()
        r, notify = self.pay(o, "pi_second")
        self.assertEqual(r.status_code, 200, r.content)
        self.assertTrue(ShiftPayment.objects.filter(stripe_payment_intent_id="pi_second", status="paid").exists())
        kinds = [c.kwargs.get("kind") for c in notify.call_args_list]
        self.assertIn("shift_payment_refund_required", kinds,
                      "second paid checkout for an already-booked offer raised NO refund alert")
        for event_id in (None, "evt_second_intent_replay"):
            r, replay_notify = self.pay(o, "pi_second", event_id=event_id)
            self.assertEqual(r.status_code, 200, r.content)
            replay_notify.assert_not_called()
        self.assertEqual(ShiftPayment.objects.count(), 2)

    def test_claim1_expired_competitor_alerts_control(self):
        from shifts.models import ShiftOffer
        winner = self.offer(ShiftOffer.Status.ACCEPTED_AWAITING_PAYMENT, self.day)
        loser = self.offer(ShiftOffer.Status.ACCEPTED_AWAITING_PAYMENT, self.day)
        self.pay(winner, "pi_w")
        r, notify = self.pay(loser, "pi_l")
        self.assertEqual(notify.call_args.kwargs["kind"], "shift_payment_refund_required")


class _ChargeBase(_ShiftBase):
    def charge(self, offer_ids, state):
        url = reverse("api_v1:billing:charge_fulfillment", args=[self.shift.pk])
        with patch("billing.views.get_billing_state_for_account", return_value=state), \
                patch("billing.stripe_support.stripe.checkout.Session.create",
                      return_value=_S(id="cs", url="https://x.test/cs")) as create, \
                patch("shifts.emails.send_shift_payment_finalized_notifications") as notif, \
                self.captureOnCommitCallbacks(execute=True):
            r = client_for(self.owner).post(url, {"offer_ids": offer_ids}, format="json")
        return r, create, notif


class FreeConfirmationAtomicityTests(_ChargeBase):
    def setUp(self):
        super().setUp()
        from shifts.finalize import finalize_shift_offer
        from shifts.models import ShiftOffer, ShiftSlot
        self.slot_b = ShiftSlot.objects.create(shift=self.shift, date=self.day, start_time=time(18),
                                               end_time=time(21), rate=Decimal("70"))
        A = ShiftOffer.Status.ACCEPTED_AWAITING_PAYMENT
        self.o1 = self.offer(A, self.day)
        self.occupy = lambda: finalize_shift_offer(self.offer(A, self.day, self.slot_b))
        self.o2 = None

    def test_claim2_partial_free_confirmation_is_rolled_back_bug(self):
        from shifts.models import ShiftOffer, ShiftSlotAssignment
        self.occupy()  # slot_b occurrence already booked by someone else
        self.o2 = self.offer(ShiftOffer.Status.ACCEPTED_AWAITING_PAYMENT, self.day, self.slot_b)
        r, _, notif = self.charge([self.o1.pk, self.o2.pk], "PRE_LIVE")
        self.o1.refresh_from_db()
        self.assertEqual(r.status_code, 400, r.data)
        self.assertFalse(ShiftSlotAssignment.objects.filter(source_offer=self.o1).exists())
        self.shift.refresh_from_db()
        self.assertEqual(self.shift.payment_status, "PENDING")
        notif.assert_not_called()
        if r.status_code >= 400:
            self.assertNotEqual(self.o1.status, ShiftOffer.Status.ACCEPTED,
                                "request failed but offer 1 stayed booked (no enclosing transaction)")

    def test_claim2_both_free_offers_book_control(self):
        from shifts.models import ShiftOffer
        self.o2 = self.offer(ShiftOffer.Status.ACCEPTED_AWAITING_PAYMENT, self.day, self.slot_b)
        r, _, _ = self.charge([self.o1.pk, self.o2.pk], "PRE_LIVE")
        self.assertEqual(r.status_code, 200, r.data)

    def test_free_notifications_wait_for_commit(self):
        from shifts.models import ShiftOffer, ShiftSlotAssignment
        self.o2 = self.offer(ShiftOffer.Status.ACCEPTED_AWAITING_PAYMENT, self.day, self.slot_b)
        with (
            patch("billing.views.get_billing_state_for_account", return_value="FREE_TRIAL"),
            patch("shifts.emails.send_shift_payment_finalized_notifications") as notify,
            self.captureOnCommitCallbacks(execute=True) as callbacks,
        ):
            response = client_for(self.owner).post(
                reverse("api_v1:billing:charge_fulfillment", args=[self.shift.pk]),
                {"offer_ids": [self.o1.pk, self.o2.pk]}, format="json",
            )
            self.assertEqual(response.status_code, 200, response.data)
            notify.assert_not_called()
        self.assertEqual(len(callbacks), 1)
        notify.assert_called_once()
        self.assertEqual(notify.call_args.kwargs["shift"].payment_status, "PAID")
        self.assertEqual(ShiftSlotAssignment.objects.filter(source_offer__in=[self.o1, self.o2]).count(), 2)


class RecurringOccurrenceSelectionTests(_ChargeBase):
    def two(self, same_day=False):
        from shifts.models import ShiftOffer
        A = ShiftOffer.Status.ACCEPTED_AWAITING_PAYMENT
        return self.offer(A, self.day), self.offer(A, self.day if same_day else self.day + timedelta(days=1))

    def test_claim3_paid_checkout_two_dates_same_slot_bug(self):
        o1, o2 = self.two()
        r, create, _ = self.charge([o1.pk, o2.pk], "PAYMENT_REQUIRED")
        self.assertEqual(r.status_code, 200, f"two different occurrence dates rejected: {r.data}")

    def test_claim3_free_two_dates_same_slot_bug(self):
        o1, o2 = self.two()
        r, _, _ = self.charge([o1.pk, o2.pk], "PRE_LIVE")
        self.assertEqual(r.status_code, 200, f"two different occurrence dates rejected (free): {r.data}")

    def test_claim3_same_date_same_slot_rejected_control(self):
        o1, o2 = self.two(same_day=True)
        r, create, _ = self.charge([o1.pk, o2.pk], "PAYMENT_REQUIRED")
        self.assertEqual(r.status_code, 400)
        create.assert_not_called()

    def test_free_same_date_same_slot_rejected(self):
        o1, o2 = self.two(same_day=True)
        r, create, _ = self.charge([o1.pk, o2.pk], "PRE_LIVE")
        self.assertEqual(r.status_code, 400)
        create.assert_not_called()

    def test_claim3_single_date_accepted_control(self):
        o1, _ = self.two()
        r, _, _ = self.charge([o1.pk], "PAYMENT_REQUIRED")
        self.assertEqual(r.status_code, 200, r.data)


