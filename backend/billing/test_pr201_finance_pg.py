"""B10/B57/B69: genuine multi-connection PostgreSQL money contracts.

No mocked database lock or transaction/receipt serializer. Network-bound
Stripe signature verification is replaced with synthetic valid events only.
"""
import json
from datetime import timedelta, time
from queue import Queue
from threading import Barrier, Thread
from unittest import skipUnless
from unittest.mock import patch

from django.db import close_old_connections, connection
from django.test import TransactionTestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from billing.models import ShiftPayment, StripeWebhookEvent
from client_profile.characterization_support import (
    make_owner_with_pharmacy, make_user,
)
from rewards.models import PillLedgerEntry
from rewards.services import get_pill_balance, get_shift_post_pill_cost
from shifts.models import Shift, ShiftOffer, ShiftSlot


class ProviderObject(dict):
    def __getattr__(self, key):
        try:
            return self[key]
        except KeyError as exc:
            raise AttributeError(key) from exc


@skipUnless(connection.vendor == "postgresql", "Real PostgreSQL locks required")
@override_settings(STRIPE_WEBHOOK_SECRET="whsec-pr201-finance-pg")
class FinancePostgresConcurrency(TransactionTestCase):
    def setUp(self):
        self.owner, pharmacy = make_owner_with_pharmacy("PR201 finance concurrency")
        self.shifts = []
        for index in (0, 1):
            shift = Shift.objects.create(
                pharmacy=pharmacy, created_by=self.owner,
                role_needed="ASSISTANT", employment_type="LOCUM",
                payment_status="PENDING",
            )
            slot = ShiftSlot.objects.create(
                shift=shift,
                date=timezone.localdate() + timedelta(days=20 + index),
                start_time=time(9), end_time=time(17),
            )
            offer = ShiftOffer.objects.create(
                shift=shift, slot=slot, user=make_user("ASSISTANT"),
                status=ShiftOffer.Status.ACCEPTED_AWAITING_PAYMENT,
            )
            self.shifts.append((shift, offer))

    def _threads(self, work):
        entry = Barrier(2)
        results = Queue()

        def runner(index):
            close_old_connections()
            try:
                entry.wait(timeout=15)
                results.put(("HTTP", index, work(index)))
            except Exception as exc:
                results.put(("EXCEPTION", index, repr(exc)))
            finally:
                close_old_connections()

        threads = [Thread(target=runner, args=(i,), daemon=True) for i in range(2)]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join(timeout=40)
        self.assertFalse(any(thread.is_alive() for thread in threads), "Concurrency setup timed out")
        output = [results.get(timeout=5) for _ in threads]
        self.assertFalse(any(row[0] == "EXCEPTION" for row in output),
                         "Do not classify fixture/DB errors as defects: " + repr(output))
        return sorted(output, key=lambda row: row[1])

    def test_b10_two_shift_pill_debits_cannot_overdraw_one_balance(self):
        cost = get_shift_post_pill_cost()
        PillLedgerEntry.objects.create(
            user=self.owner, entry_type="EARN", source="MANUAL",
            delta=cost, balance_after=cost,
            idempotency_key="p6-pg-concurrency-start",
        )

        def spend(index):
            shift, offer = self.shifts[index]
            client = APIClient()
            from django.contrib.auth import get_user_model
            client.force_authenticate(get_user_model().objects.get(pk=self.owner.pk))
            response = client.post(
                "/api/v1/pill-rewards/pay-shift/",
                {"shift_id": shift.pk, "offer_ids": [offer.pk]},
                format="json",
            )
            return response.status_code

        with patch("rewards.views.send_shift_payment_finalized_notifications"):
            rows = self._threads(spend)
        self.assertEqual(sorted(row[2] for row in rows), [200, 400], rows)
        self.assertEqual(get_pill_balance(self.owner), 0)
        self.assertEqual(PillLedgerEntry.objects.filter(
            user=self.owner, entry_type="SPEND",
        ).count(), 1)
        self.assertEqual(ShiftOffer.objects.filter(
            shift__in=[pair[0] for pair in self.shifts],
            status=ShiftOffer.Status.ACCEPTED_AWAITING_PAYMENT,
        ).count(), 1)

    def _deliver_event(self, event_id, provider):
        client = APIClient()
        response = client.post(
            "/api/v1/billing/webhook/",
            json.dumps({"id": event_id}).encode(),
            content_type="application/json",
            HTTP_STRIPE_SIGNATURE="synthetic-test",
        )
        return response.status_code

    def test_b69_distinct_stripe_webhooks_same_payment_intent_have_one_debit(self):
        shift = self.shifts[0][0]
        def fake_event(payload, _sig, _secret):
            eid = json.loads(payload.decode())["id"]
            return ProviderObject(
                id=eid, type="checkout.session.completed",
                data=ProviderObject(object=ProviderObject(
                    mode="payment", payment_status="paid", amount_total=1500,
                    payment_intent="pi_pr201_pg_same",
                    metadata={"shift_id": str(shift.pk), "type": "cancellation",
                              "owner_user_id": str(self.owner.pk),
                              "actor_user_id": str(self.owner.pk)},
                )),
            )

        with patch("billing.stripe_support.stripe.Webhook.construct_event", side_effect=fake_event):
            rows = self._threads(
                lambda i: self._deliver_event(f"evt_pg_same_{i}", None),
            )
        self.assertEqual([row[2] for row in rows], [200, 200], rows)
        self.assertEqual(ShiftPayment.objects.filter(
            stripe_payment_intent_id="pi_pr201_pg_same",
        ).count(), 1)
        self.assertEqual(StripeWebhookEvent.objects.filter(
            event_id__startswith="evt_pg_same_", status="processed",
        ).count(), 2)

    def test_b57_concurrent_partial_and_full_refund_is_monotonic(self):
        shift = self.shifts[0][0]
        payment = ShiftPayment.objects.create(
            owner=self.owner, shift=shift,
            payment_type="fulfillment", payment_method="card", status="paid",
            amount_aud="45.00", stripe_payment_intent_id="pi_pr201_pg_refund",
        )
        def fake_event(payload, _sig, _secret):
            eid = json.loads(payload.decode())["id"]
            cents = 4500 if eid.endswith("_full") else 1000
            return ProviderObject(
                id=eid, type="charge.refunded",
                data=ProviderObject(object=ProviderObject(
                    id="ch_pr201_pg", payment_intent="pi_pr201_pg_refund",
                    amount_refunded=cents, refunded=(cents == 4500),
                )),
            )
        with patch("billing.stripe_support.stripe.Webhook.construct_event", side_effect=fake_event):
            rows = self._threads(
                lambda i: self._deliver_event(
                    "evt_pg_refund_full" if i else "evt_pg_refund_partial", None,
                ),
            )
        self.assertEqual([row[2] for row in rows], [200, 200], rows)
        payment.refresh_from_db()
        self.assertEqual(str(payment.refunded_amount_aud), "45.00")
        self.assertEqual(payment.status, "refunded")
