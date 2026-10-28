from unittest.mock import patch
from uuid import uuid4
from django.test import TransactionTestCase, override_settings
from django.urls import reverse
from billing.models import ShiftPayment
from client_profile.models import Shift
from client_profile.characterization_support import client_for
from shifts.test_payment_edit_guards import _ShiftMixin


class _S(dict):
    def __getattr__(self, name):
        try:
            return self[name]
        except KeyError as exc:
            raise AttributeError(name) from exc


@override_settings(STRIPE_WEBHOOK_SECRET="whsec-repro204")
class Claim2DeletedShiftWebhook(_ShiftMixin, TransactionTestCase):
    def setUp(self):
        self.make_shift()
        self.o = self.offer(self.day)

    def webhook(self, shift_id):
        event = _S(id=f"evt_{uuid4().hex}", type="checkout.session.completed", data=_S(object=_S(
            mode="payment", payment_status="paid", amount_total=1500, payment_intent="pi_204",
            metadata={"shift_id": str(shift_id), "type": "fulfillment", "offer_ids": str(self.o.pk),
                      "owner_user_id": str(self.owner.pk), "actor_user_id": str(self.owner.pk)})))
        with (patch("billing.views.stripe.Webhook.construct_event", return_value=event),
              patch("shifts.emails.send_shift_payment_finalized_notifications"),
              patch("shifts.notifications.notify_shift_managers") as notify):
            r = client_for().post(reverse("api_v1:billing:stripe_webhook"), data=b"{}",
                                  content_type="application/json")
        return r, notify

    def test_claim2_delete_pending_payment_shift_refused_bug(self):
        r = client_for(self.owner).delete(f"/api/v1/shifts/{self.shift.pk}/")
        self.assertNotEqual(r.status_code, 204, "shift with an accepted, payment-pending offer was deleted")
        self.assertEqual(r.status_code, 409)
        self.assertIn("pending payment", r.data["detail"])
        self.assertTrue(Shift.objects.filter(pk=self.shift.pk).exists())

    def test_claim2_paid_webhook_after_delete_records_payment_bug(self):
        shift_id = self.shift.pk
        # Simulate a historical deletion before the endpoint guard existed.
        self.shift.delete()
        r, _ = self.webhook(shift_id)
        self.assertEqual(r.status_code, 200, "paid webhook for the deleted shift's checkout failed")
        self.assertTrue(ShiftPayment.objects.filter(stripe_payment_intent_id="pi_204").exists(),
                        "card payment was not recorded")

    def test_claim2_paid_webhook_existing_shift_control(self):
        r, _ = self.webhook(self.shift.pk)
        self.assertEqual(r.status_code, 200, r.content)
        self.assertTrue(ShiftPayment.objects.filter(stripe_payment_intent_id="pi_204", shift=self.shift).exists())

    def test_missing_shift_payment_and_refund_alert_are_replay_safe(self):
        from notifications.models import Notification
        shift_id = self.shift.pk
        self.shift.delete()
        for _ in range(2):  # Distinct Stripe event IDs for the same payment intent.
            r, _ = self.webhook(shift_id)
            self.assertEqual(r.status_code, 200)
        payment = ShiftPayment.objects.get(stripe_payment_intent_id='pi_204')
        self.assertIsNone(payment.shift_id)
        self.assertEqual(ShiftPayment.objects.count(), 1)
        alerts = Notification.objects.filter(user=self.owner, payload__notification_kind='shift_payment_refund_required')
        self.assertEqual(alerts.count(), 1)
        self.assertEqual(alerts.get().payload['payment_id'], payment.pk)

    def test_pending_payment_without_pending_offer_still_blocks_delete(self):
        self.shift.offers.all().delete()
        r = client_for(self.owner).delete(f'/api/v1/shifts/{self.shift.pk}/')
        self.assertEqual(r.status_code, 409)

    def test_pending_payment_record_blocks_delete(self):
        self.shift.offers.all().delete()
        self.shift.payment_status = 'NOT_REQUIRED'
        self.shift.save(update_fields=['payment_status'])
        ShiftPayment.objects.create(owner=self.owner, shift=self.shift, payment_type='fulfillment',
                                    payment_method='card', amount_aud=15, status='pending')
        self.assertEqual(client_for(self.owner).delete(f'/api/v1/shifts/{self.shift.pk}/').status_code, 409)

    def test_shift_without_pending_payment_can_be_deleted(self):
        self.shift.offers.all().delete()
        self.shift.payment_status = 'NOT_REQUIRED'
        self.shift.save(update_fields=['payment_status'])
        self.assertEqual(client_for(self.owner).delete(f'/api/v1/shifts/{self.shift.pk}/').status_code, 204)
