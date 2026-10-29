"""Payment confirmations retain independent worker, other-candidate and owner delivery attempts."""
from datetime import date, time, timedelta
from decimal import Decimal
from unittest import mock

from django.test import TestCase

from client_profile.characterization_support import client_for, make_owner_with_pharmacy, make_user
from notifications.models import Notification
from shifts.emails import send_shift_payment_finalized_notifications
from shifts.models import Shift, ShiftOffer, ShiftInterest, ShiftSlot


class PaymentNotificationIsolationTests(TestCase):
    def setUp(self):
        self.owner, pharmacy = make_owner_with_pharmacy("Payment notices")
        self.shift = Shift.objects.create(pharmacy=pharmacy, created_by=self.owner, role_needed="PHARMACIST",
                                          employment_type="LOCUM", single_user_only=False)
        self.offers = []
        for i in range(2):
            slot = ShiftSlot.objects.create(shift=self.shift, date=date.today() + timedelta(days=14+i),
                                            start_time=time(9), end_time=time(17), rate="70.00")
            self.offers.append(ShiftOffer.objects.create(shift=self.shift, slot=slot, user=make_user("PHARMACIST"),
                                                        status=ShiftOffer.Status.ACCEPTED))
        self.other = make_user("PHARMACIST")
        ShiftInterest.objects.create(shift=self.shift, slot=self.offers[0].slot, user=self.other)

    def send(self):
        send_shift_payment_finalized_notifications(shift=self.shift, offers=self.offers, paid_by=self.owner,
                                                   payment_method="stripe")

    def test_socket_outage_preserves_all_email_attempts_and_notification_rows(self):
        with mock.patch("notifications.services._broadcast", side_effect=RuntimeError("socket offline")), mock.patch(
            "notifications.services._send_expo_push",
        ), mock.patch("shifts.emails.async_task") as email:
            self.send()
        self.assertEqual(email.call_count, 4)
        self.assertEqual(Notification.objects.count(), 4)

    def test_first_worker_queue_failure_does_not_suppress_other_worker_candidate_or_owner(self):
        def enqueue(*args, **kwargs):
            if kwargs["recipient_list"] == [self.offers[0].user.email]:
                raise RuntimeError("queue offline")
        with mock.patch("notifications.services._broadcast"), mock.patch("notifications.services._send_expo_push"), mock.patch(
            "shifts.emails.async_task", side_effect=enqueue,
        ) as email:
            self.send()
        self.assertEqual(email.call_count, 4)
        self.assertEqual(Notification.objects.count(), 4)
        self.assertEqual({c.kwargs["recipient_list"][0] for c in email.call_args_list},
                         {self.owner.email, self.other.email, *(o.user.email for o in self.offers)})

    def test_other_candidate_queue_failure_does_not_suppress_owner(self):
        def enqueue(*args, **kwargs):
            if kwargs["recipient_list"] == [self.other.email]:
                raise RuntimeError("queue offline")
        with mock.patch("notifications.services._broadcast"), mock.patch("notifications.services._send_expo_push"), mock.patch(
            "shifts.emails.async_task", side_effect=enqueue,
        ) as email:
            self.send()
        self.assertEqual(email.call_count, 4)
        self.assertEqual(email.call_args.kwargs["recipient_list"], [self.owner.email])

    def test_success_preserves_recipients_templates_and_payment_labels(self):
        with mock.patch("notifications.services._broadcast"), mock.patch("notifications.services._send_expo_push"), mock.patch(
            "shifts.emails.async_task",
        ) as email:
            self.send()
        self.assertEqual([c.kwargs["template_name"] for c in email.call_args_list], [
            "emails/shift_payment_finalized_worker.html", "emails/shift_payment_finalized_worker.html",
            "emails/shift_not_selected_after_payment.html", "emails/shift_payment_finalized_owner.html",
        ])
        self.assertEqual(email.call_args.kwargs["context"]["payment_method"], "Stripe")
        self.assertTrue(all(c.kwargs["suppress_auto_notification"] for c in email.call_args_list))

    def test_free_checkout_keeps_real_assignments_and_all_message_attempts_during_outage(self):
        from shifts.models import ShiftSlotAssignment
        ShiftOffer.objects.filter(pk__in=[o.pk for o in self.offers]).update(
            status=ShiftOffer.Status.ACCEPTED_AWAITING_PAYMENT,
        )
        def enqueue(*args, **kwargs):
            if kwargs["recipient_list"] == [self.offers[0].user.email]:
                raise RuntimeError("queue offline")
        with mock.patch("billing.views.get_billing_state_for_account", return_value="PRE_LIVE"), mock.patch(
            "shifts.finalize.get_locked_rate_for_slot", return_value=(Decimal("70.00"), {}),
        ), mock.patch("notifications.services._broadcast", side_effect=RuntimeError("socket offline")), mock.patch(
            "notifications.services._send_expo_push",
        ), mock.patch("shifts.emails.async_task", side_effect=enqueue) as email, mock.patch(
            "billing.stripe_support.stripe.checkout.Session.create",
        ) as stripe, self.captureOnCommitCallbacks(execute=True):
            response = client_for(self.owner).post(
                f"/api/v1/billing/charge-fulfillment/{self.shift.pk}/",
                {"offer_ids": [o.pk for o in self.offers]}, format="json",
            )
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["finalized_offers"], 2)
        self.assertEqual(ShiftSlotAssignment.objects.filter(source_offer__in=self.offers).count(), 2)
        self.assertEqual(ShiftOffer.objects.filter(pk__in=[o.pk for o in self.offers], status=ShiftOffer.Status.ACCEPTED).count(), 2)
        self.assertEqual(email.call_count, 4)
        self.assertEqual(Notification.objects.count(), 4)
        stripe.assert_not_called()
