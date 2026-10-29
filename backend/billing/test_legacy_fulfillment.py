"""Legacy paid checkouts that book nothing require a durable, replay-safe alert."""
from unittest.mock import patch
from uuid import uuid4
from django.test import TestCase, override_settings
from django.urls import reverse
from billing.models import ShiftPayment
from billing.test_deleted_shift_payment import _S
from shifts.test_payment_edit_guards import _ShiftMixin
from client_profile.characterization_support import client_for


REFUND_KIND = "shift_payment_refund_required"


def refund_alerts():
    from notifications.models import Notification
    return Notification.objects.filter(payload__notification_kind=REFUND_KIND).count()


@override_settings(STRIPE_WEBHOOK_SECRET="whsec-adv")
class LegacyFulfillmentTests(_ShiftMixin, TestCase):
    def setUp(self):
        self.make_shift()

    def assignments(self, day=None):
        from shifts.models import ShiftSlotAssignment
        qs = ShiftSlotAssignment.objects.filter(slot=self.slot)
        return qs.filter(slot_date=day) if day else qs

    def webhook(self, pi, offers=(), event_id=None, shift_id=None, **meta):
        metadata = {"shift_id": str(shift_id or self.shift.pk), "type": "fulfillment",
                    "owner_user_id": str(self.owner.pk), "actor_user_id": str(self.owner.pk)}
        if offers:
            metadata["offer_ids"] = ",".join(str(o.pk) for o in offers)
        metadata.update(meta)
        event = _S(id=event_id or f"evt_{uuid4().hex}", type="checkout.session.completed", data=_S(object=_S(
            mode="payment", payment_status="paid", amount_total=1500, payment_intent=pi, metadata=metadata)))
        with (patch("billing.stripe_support.stripe.Webhook.construct_event", return_value=event),
              patch("shifts.emails.send_shift_payment_finalized_notifications")):
            return client_for().post(reverse("api_v1:billing:stripe_webhook"), data=b"{}",
                                     content_type="application/json")

    def test_i1_legacy_candidate_only_session_offer_gone(self):
        # Checkout sessions created before offer_ids metadata (24h Stripe session lifetime across deploy).
        from shifts.models import ShiftOffer
        o = self.offer(self.day)
        ShiftOffer.objects.filter(pk=o.pk).update(status=ShiftOffer.Status.DECLINED)
        r = self.webhook("pi_a", candidate_id=str(o.user_id), slot_id=str(self.slot.pk))
        self.assertEqual(r.status_code, 200)
        self.assertEqual(self.assignments().count(), 0)
        self.assertGreaterEqual(refund_alerts(), 1, "legacy paid checkout booked nothing and recorded no refund alert")

        payment = ShiftPayment.objects.get(stripe_payment_intent_id="pi_a")
        self.assertEqual(payment.status, "paid")
        alerts = refund_alerts()
        replay = self.webhook("pi_a", candidate_id=str(o.user_id), slot_id=str(self.slot.pk))
        self.assertEqual(replay.status_code, 200)
        self.assertEqual(refund_alerts(), alerts)
        self.assertEqual(ShiftPayment.objects.count(), 1)
