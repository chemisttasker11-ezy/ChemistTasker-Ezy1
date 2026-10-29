"""What the shift actions do: interest, profile reveal, offers, counter offers, rejection, sharing, manual
assignment, escalation and member status.

The tests drive the real endpoints and assert the response, the rows written, the in-app notifications and the
e-mails queued. E-mails are captured at Celery's send_task, so the assertions hold wherever the code that queues them
lives.
"""
import logging
from contextlib import contextmanager
from datetime import date, time, timedelta
from decimal import Decimal
from unittest import mock

from django.test import TestCase, TransactionTestCase, override_settings
from django.db import close_old_connections, connection, transaction
from unittest import skipUnless
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from django.utils import timezone

from client_profile.characterization_support import client_for, make_owner_with_pharmacy, make_staff_member, make_user
from memberships.models import Membership
from notifications.models import Notification
from onboarding.models import PharmacistOnboarding
from workforce.models import RosterPeriod
from shifts.models import (
    Shift,
    ShiftCounterOffer,
    ShiftCounterOfferSlot,
    ShiftInterest,
    ShiftOffer,
    ShiftProfileAccessAudit,
    ShiftRejection,
    ShiftSlot,
    ShiftSlotAssignment,
)

API = "/api/v1/"
DAY = date.today() + timedelta(days=10)


@contextmanager
def queued_emails():
    sent = []

    def record(name, args=None, kwargs=None, **options):
        kwargs = kwargs or {}
        sent.append({
            "task": name,
            "template": kwargs.get("template_name"),
            "to": list(kwargs.get("recipient_list") or []),
            "subject": kwargs.get("subject"),
        })

    with override_settings(CELERY_TASK_ALWAYS_EAGER=False), mock.patch("celery.app.base.Celery.send_task", side_effect=record):
        yield sent


def notifications_for(user, kind=None):
    rows = Notification.objects.filter(user=user).order_by("id")
    if kind:
        rows = [row for row in rows if (row.payload or {}).get("notification_kind") == kind]
    return list(rows)


class ShiftActionFixture(TestCase):
    def setUp(self):
        self.owner, self.pharmacy = make_owner_with_pharmacy("Action Pharmacy")
        self.owner_client = client_for(self.owner)

    def worker(self, employment_type="LOCUM", verified=True):
        user = make_user("PHARMACIST", mobile_number="0411111111")
        PharmacistOnboarding.objects.create(user=user, verified=verified, short_bio="Bio", rate_preference={})
        if employment_type:
            Membership.objects.create(
                user=user, pharmacy=self.pharmacy, role="PHARMACIST", employment_type=employment_type,
                status=Membership.Status.ACCEPTED, is_active=True,
            )
        return user

    def shift(self, *, single_user_only=True, slots=1, visibility="LOCUM_CASUAL", **extra):
        shift = Shift.objects.create(
            pharmacy=self.pharmacy, created_by=self.owner, role_needed="PHARMACIST", employment_type="LOCUM",
            visibility=visibility, single_user_only=single_user_only, **extra,
        )
        for index in range(slots):
            ShiftSlot.objects.create(
                shift=shift, date=DAY + timedelta(days=index), start_time=time(9, 0), end_time=time(17, 0),
                rate=Decimal("60.00"),
            )
        return shift

    def post(self, user, path, data=None):
        with queued_emails() as sent:
            response = client_for(user).post(f"{API}{path}", data or {}, format="json")
        return response, sent


class CancellationWageContracts(ShiftActionFixture):
    def test_overnight_cancellation_has_same_positive_wage_as_day_shift(self):
        from datetime import datetime
        worker = self.worker()
        shift = self.shift()
        slot = shift.slots.get()
        ShiftSlotAssignment.objects.create(
            shift=shift, slot=slot, slot_date=slot.date, user=worker, unit_rate=Decimal("65.00"),
        )
        for start, end in ((time(9), time(17)), (time(22), time(6))):
            with self.subTest(start=start, end=end):
                slot.start_time, slot.end_time = start, end
                slot.save(update_fields=["start_time", "end_time"])
                now = timezone.make_aware(datetime.combine(slot.date, start)) - timedelta(hours=6)
                with mock.patch("django.utils.timezone.now", return_value=now), mock.patch("billing.views.stripe.checkout.Session.create") as checkout:
                    checkout.return_value.url = "https://checkout.example.test/cancellation"
                    response = self.owner_client.post(f"{API}billing/charge-penalty/{shift.pk}/", {}, format="json")
                self.assertEqual(response.status_code, 200, response.data)
                checkout.assert_called_once()
                self.assertEqual(checkout.call_args.kwargs["line_items"][0]["price_data"]["unit_amount"], 10400)


class ExpressInterestTests(ShiftActionFixture):
    def test_member_interest_notifies_managers_once(self):
        worker = self.worker()
        shift = self.shift()

        response, sent = self.post(worker, f"shifts/{shift.id}/express_interest/")
        self.assertEqual(response.status_code, 201, response.data)
        interest = ShiftInterest.objects.get(shift=shift, user=worker)
        self.assertEqual((response.data["id"], response.data["slot"]), (interest.id, None))
        [notice] = notifications_for(self.owner, "shift_interest")
        self.assertEqual(notice.title, "New member shift interest")
        self.assertTrue(notice.body.startswith(f"{worker.get_full_name()} expressed interest in 1 slot(s) at Action Pharmacy."))
        self.assertEqual(
            [(e["template"], e["to"], e["subject"]) for e in sent],
            [("emails/shift_member_interest.html", [self.owner.email], "New interest in your shift at Action Pharmacy")],
        )

        again, sent_again = self.post(worker, f"shifts/{shift.id}/express_interest/")
        self.assertEqual(again.status_code, 200)
        self.assertEqual(sent_again, [])
        self.assertEqual(len(notifications_for(self.owner, "shift_interest")), 1)

    def test_multi_slot_interest_payloads(self):
        worker = self.worker()
        shift = self.shift(single_user_only=False, slots=2)
        first, second = shift.slots.order_by("id")

        response, sent = self.post(worker, f"shifts/{shift.id}/express_interest/", {"slot_ids": [first.id, second.id]})
        self.assertEqual(response.status_code, 201)
        self.assertEqual(sorted(item["slot"] for item in response.data), [first.id, second.id])
        self.assertEqual(len(sent), 1)
        [notice] = notifications_for(self.owner, "shift_interest")
        self.assertEqual(notice.payload["slot_ids"], [first.id, second.id])
        self.assertEqual(notice.payload["slot_id"], first.id)

        cases = {
            "not a list": ({"slot_ids": "x"}, "slot_ids must be a list."),
            "unknown slot": ({"slot_ids": [999999]}, "Invalid slot_id(s): [999999]"),
            "bad value": ({"slotId": "abc"}, "Invalid slot_id: abc"),
            "empty list": ({"slot_ids": []}, "slot_ids cannot be empty."),
        }
        for label, (payload, detail) in cases.items():
            with self.subTest(label):
                refused, _ = self.post(worker, f"shifts/{shift.id}/express_interest/", payload)
                self.assertEqual(refused.status_code, 400)
                self.assertEqual(refused.data["detail"], detail)

        shift_level, _ = self.post(worker, f"shifts/{shift.id}/express_interest/")
        self.assertEqual(shift_level.status_code, 201)
        self.assertIsNone(shift_level.data["slot"])

    def test_public_shift_requires_verified_onboarding(self):
        shift = self.shift(visibility="PLATFORM")
        no_onboarding = make_user("PHARMACIST")
        unverified = self.worker(employment_type=None, verified=False)
        verified = self.worker(employment_type=None, verified=True)

        response, _ = self.post(no_onboarding, f"public-shifts/{shift.id}/express_interest/")
        self.assertEqual((response.status_code, response.data["detail"]), (
            400, "Please complete your pharmacist onboarding before applying for public shifts."))
        response, _ = self.post(unverified, f"public-shifts/{shift.id}/express_interest/")
        self.assertEqual((response.status_code, response.data["detail"]), (
            403, "Verify your profile (email and mobile, plus AHPRA for pharmacists and interns) before applying for public shifts."))
        response, sent = self.post(verified, f"public-shifts/{shift.id}/express_interest/")
        self.assertEqual(response.status_code, 201)
        [notice] = notifications_for(self.owner, "shift_interest")
        self.assertEqual(notice.title, "New public shift interest")
        self.assertTrue(notice.body.startswith("A candidate expressed interest"))
        self.assertEqual([e["template"] for e in sent], ["emails/shift_interest.html"])

    def test_unknown_shift_is_not_found(self):
        response, _ = self.post(self.worker(), "shifts/999999/express_interest/")
        self.assertEqual(response.status_code, 404)


class RevealProfileTests(ShiftActionFixture):
    def test_first_reveal_counts_notifies_and_audits(self):
        worker = self.worker()
        shift = self.shift(reveal_quota=1)
        interest = ShiftInterest.objects.create(shift=shift, slot=None, user=worker)

        response, sent = self.post(self.owner, f"shifts/{shift.id}/reveal_profile/", {"user_id": worker.id})
        self.assertEqual(response.status_code, 200, response.data)
        # Owner decision: a revealed candidate shows the work profile, never contact details or the CV.
        self.assertTrue({"id", "first_name", "last_name", "profile_photo", "short_bio", "skills", "role_label",
                         "verified", "ahpra_verified", "rate_preference"} <= set(response.data))
        self.assertFalse({"email", "phone_number", "resume"} & set(response.data))
        self.assertEqual((response.data["id"], response.data["short_bio"]), (worker.id, "Bio"))
        shift.refresh_from_db()
        interest.refresh_from_db()
        self.assertEqual(shift.reveal_count, 1)
        self.assertTrue(shift.revealed_users.filter(pk=worker.pk).exists())
        self.assertTrue(interest.revealed)
        self.assertEqual(ShiftProfileAccessAudit.objects.filter(
            shift=shift, target_user=worker, actor=self.owner,
            action=ShiftProfileAccessAudit.Action.REVEAL_PROFILE).count(), 1)
        [notice] = notifications_for(worker, "shift_profile_revealed")
        self.assertEqual(notice.title, "Profile revealed: Action Pharmacy")
        self.assertEqual([(e["template"], e["to"]) for e in sent], [("emails/shift_reveal.html", [worker.email])])

        again, sent_again = self.post(self.owner, f"shifts/{shift.id}/reveal_profile/", {"user_id": worker.id})
        self.assertEqual(again.status_code, 200)
        self.assertEqual(sent_again, [])
        shift.refresh_from_db()
        self.assertEqual(shift.reveal_count, 1)
        self.assertEqual(len(notifications_for(worker, "shift_profile_revealed")), 1)
        self.assertEqual(ShiftProfileAccessAudit.objects.filter(shift=shift, target_user=worker).count(), 2)

        other = self.worker()
        ShiftInterest.objects.create(shift=shift, slot=None, user=other)
        over_quota, _ = self.post(self.owner, f"shifts/{shift.id}/reveal_profile/", {"user_id": other.id})
        self.assertEqual((over_quota.status_code, over_quota.data["detail"]), (403, "Reveal quota exceeded."))

    def test_revealed_platform_interest_lists_work_profile_without_contacts(self):
        worker = self.worker()
        shift = self.shift(visibility="PLATFORM")
        ShiftInterest.objects.create(shift=shift, slot=None, user=worker, revealed=True)
        response = client_for(self.owner).get(f"{API}shift-interests/?shift={shift.id}")
        self.assertEqual(response.status_code, 200, response.data)
        rows = response.data.get("results", response.data)
        detail = rows[0]["user_detail"]
        self.assertEqual((detail["id"], detail["short_bio"]), (worker.id, "Bio"))
        self.assertIn("skills", detail)
        self.assertFalse({"email", "phone_number", "resume"} & set(detail))

    def test_platform_counteroffer_uses_revealed_work_profile_and_keeps_anonymity(self):
        worker = self.worker()
        shift = self.shift(visibility="PLATFORM")
        offer = ShiftCounterOffer.objects.create(shift=shift, user=worker)
        ShiftCounterOfferSlot.objects.create(offer=offer, slot=shift.slots.first(), proposed_start_time=time(9), proposed_end_time=time(17))
        interest = ShiftInterest.objects.create(shift=shift, user=worker, revealed=False)
        endpoint = f"{API}shifts/{shift.id}/counter-offers/"
        response = client_for(self.owner).get(endpoint)
        self.assertEqual(response.status_code, 200, response.data)
        self.assertIsNone(response.data[0]["user_detail"])

        revealed, _ = self.post(self.owner, f"shifts/{shift.id}/reveal_profile/", {"user_id": worker.id})
        self.assertEqual(revealed.status_code, 200, revealed.data)
        listed = client_for(self.owner).get(endpoint)
        detail = listed.data[0]["user_detail"]
        interest.refresh_from_db()
        from shifts.serializers import ShiftInterestSerializer
        self.assertEqual(detail, ShiftInterestSerializer(interest).data["user_detail"])
        self.assertEqual(detail["role_label"], "Pharmacist")
        self.assertTrue({"skills", "verified", "rate_preference"} <= set(detail))
        self.assertFalse({"email", "phone_number", "resume"} & set(detail))
        batch = client_for(self.owner).get(f"{API}shifts/counter-offers-batch/?shift_ids={shift.id}")
        self.assertEqual(batch.data[str(shift.id)][0]["user_detail"], detail)

        # Network contracts are preserved; this change is bounded to PLATFORM reviews.
        network = self.shift()
        network_offer = ShiftCounterOffer.objects.create(shift=network, user=worker)
        ShiftCounterOfferSlot.objects.create(offer=network_offer, slot=network.slots.first(), proposed_start_time=time(9), proposed_end_time=time(17))
        network_detail = client_for(self.owner).get(f"{API}shifts/{network.id}/counter-offers/").data[0]["user_detail"]
        self.assertEqual(network_detail["email"], worker.email)

    def test_reveal_refusals(self):
        worker = self.worker()
        single = self.shift()
        response, _ = self.post(self.owner, f"shifts/{single.id}/reveal_profile/", {})
        self.assertEqual((response.status_code, response.data["detail"]), (400, "user_id is required."))
        response, _ = self.post(self.owner, f"shifts/{single.id}/reveal_profile/", {"user_id": worker.id})
        self.assertEqual((response.status_code, response.data["detail"]), (
            404, "No ShiftInterest matches the given query."))
        multi = self.shift(single_user_only=False, slots=2)
        response, _ = self.post(self.owner, f"shifts/{multi.id}/reveal_profile/", {"user_id": worker.id})
        self.assertEqual(response.status_code, 404)

    def test_multi_slot_reveal_falls_back_to_shift_level_interest(self):
        worker = self.worker()
        shift = self.shift(single_user_only=False, slots=2)
        slot = shift.slots.order_by("id").first()
        interest = ShiftInterest.objects.create(shift=shift, slot=None, user=worker)
        response, _ = self.post(self.owner, f"shifts/{shift.id}/reveal_profile/", {"user_id": worker.id, "slot_id": slot.id})
        self.assertEqual(response.status_code, 200)
        interest.refresh_from_db()
        self.assertTrue(interest.revealed)
        self.assertEqual(ShiftProfileAccessAudit.objects.get(shift=shift).slot, slot)


class AcceptUserTests(ShiftActionFixture):
    def test_offer_is_created_once_and_refreshed(self):
        worker = self.worker()
        shift = self.shift(fixed_rate=Decimal("70.00"))
        before = timezone.now()

        with queued_emails() as sent, self.captureOnCommitCallbacks(execute=True):
            response = self.owner_client.post(
                f"{API}shifts/{shift.id}/accept_user/", {"user_id": worker.id}, format="json",
            )
        self.assertEqual(response.status_code, 200, response.data)
        offer = ShiftOffer.objects.get(shift=shift, user=worker)
        self.assertEqual(response.data, {"status": f"Offer sent to {worker.get_full_name()}.", "offer_id": offer.id})
        self.assertEqual((offer.status, offer.slot_id, offer.offered_rate), (ShiftOffer.Status.PENDING, None, Decimal("70.00")))
        self.assertIsNone(offer.offered_slot_date)
        self.assertGreaterEqual(offer.expires_at, before + timedelta(hours=48))
        [notice] = notifications_for(worker, "shift_offer_received")
        self.assertEqual(notice.payload["offer_id"], offer.id)
        self.assertEqual([(e["template"], e["subject"]) for e in sent], [("emails/shift_offer.html", "You have a new shift offer")])

        again, sent_again = self.post(self.owner, f"shifts/{shift.id}/accept_user/", {"user_id": worker.id})
        self.assertEqual(again.data, {
            "status": "Offer is already pending candidate confirmation.",
            "offer_id": offer.id,
            "worker_confirmation_required": True,
        })
        self.assertEqual(sent_again, [])

        offer.expires_at = timezone.now() - timedelta(minutes=1)
        offer.save(update_fields=["expires_at"])
        renewed, _ = self.post(self.owner, f"shifts/{shift.id}/accept_user/", {"user_id": worker.id})
        offer.refresh_from_db()
        self.assertEqual(offer.status, ShiftOffer.Status.EXPIRED)
        self.assertNotEqual(renewed.data["offer_id"], offer.id)

    def test_multi_slot_offer_picks_the_unassigned_slot(self):
        worker = self.worker()
        other = self.worker()
        shift = self.shift(single_user_only=False, slots=2)
        first, second = shift.slots.order_by("id")
        ShiftSlotAssignment.objects.create(shift=shift, slot=first, slot_date=first.date, user=other)

        response, _ = self.post(self.owner, f"shifts/{shift.id}/accept_user/", {"user_id": worker.id})
        self.assertEqual(response.status_code, 200, response.data)
        offer = ShiftOffer.objects.get(pk=response.data["offer_id"])
        self.assertEqual((offer.slot_id, offer.offered_slot_date, offer.offered_rate), (second.id, second.date, Decimal("60.00")))

        locked, _ = self.post(self.owner, f"shifts/{shift.id}/accept_user/", {"user_id": worker.id, "slot_id": str(first.id)})
        self.assertEqual((locked.status_code, locked.data["detail"]), (400, "This slot is already locked or awaiting payment."))

    def test_single_user_shift_locked_by_an_assignment(self):
        worker = self.worker()
        shift = self.shift()
        slot = shift.slots.get()
        ShiftSlotAssignment.objects.create(shift=shift, slot=slot, slot_date=slot.date, user=self.worker())
        response, _ = self.post(self.owner, f"shifts/{shift.id}/accept_user/", {"user_id": worker.id})
        self.assertEqual((response.status_code, response.data["detail"]), (400, "This shift is already locked or awaiting payment."))
        missing, _ = self.post(self.owner, f"shifts/{shift.id}/accept_user/", {})
        self.assertEqual((missing.status_code, missing.data["detail"]), (400, "user_id is required"))

    def test_a_worker_cannot_send_offers(self):
        worker = self.worker()
        shift = self.shift()
        response, _ = self.post(worker, f"shifts/{shift.id}/accept_user/", {"user_id": worker.id})
        self.assertEqual(response.status_code, 403)
        self.assertFalse(ShiftOffer.objects.exists())


class CounterOfferTests(ShiftActionFixture):
    def submit(self, worker, shift, slot, rate="75.00"):
        payload = {"slots": [{
            "slot_id": slot.id, "slot_date": str(slot.date), "proposed_start_time": "09:00:00",
            "proposed_end_time": "17:00:00", "proposed_rate": rate,
        }], "message": "Can do"}
        return self.post(worker, f"shifts/{shift.id}/counter-offers/", payload)

    def test_public_counteroffer_preserves_onboarding_outcomes_with_enforcement_on_or_off(self):
        for enforcement in (True, False):
            with self.subTest(enforcement=enforcement), override_settings(AHPRA_ENFORCEMENT_ENABLED=enforcement):
                shift = self.shift(single_user_only=False, visibility="PLATFORM", rate_type="FLEXIBLE")
                slot = shift.slots.get()
                cases = [
                    ("missing", make_user("PHARMACIST"), 400,
                     "Please complete your pharmacist onboarding before applying for public shifts."),
                    ("unverified", self.worker(employment_type=None, verified=False), 403,
                     "Verify your profile (email and mobile, plus AHPRA for pharmacists and interns) before applying for public shifts."),
                    ("verified", self.worker(employment_type=None, verified=True), 201, None),
                ]
                for profile_state, worker, expected_status, detail in cases:
                    with self.subTest(profile=profile_state):
                        response, sent = self.submit(worker, shift, slot)
                        self.assertEqual(response.status_code, expected_status, response.data)
                        if detail:
                            self.assertEqual(response.data["detail"], detail)
                            self.assertFalse(ShiftCounterOffer.objects.filter(shift=shift, user=worker).exists())
                            self.assertEqual(sent, [])
                        else:
                            counter = ShiftCounterOffer.objects.get(shift=shift, user=worker)
                            self.assertEqual((response.data["id"], counter.status), (counter.pk, ShiftCounterOffer.Status.PENDING))
                self.assertFalse(ShiftOffer.objects.filter(shift=shift).exists())
                self.assertFalse(ShiftSlotAssignment.objects.filter(shift=shift).exists())

    def test_submit_records_interest_and_notifies_managers(self):
        worker = self.worker()
        shift = self.shift(single_user_only=False, slots=2, rate_type="FLEXIBLE")
        slot = shift.slots.order_by("id").first()

        response, sent = self.submit(worker, shift, slot)
        self.assertEqual(response.status_code, 201, response.data)
        offer = ShiftCounterOffer.objects.get(shift=shift, user=worker)
        self.assertEqual(response.data["id"], offer.id)
        self.assertEqual(offer.status, ShiftCounterOffer.Status.PENDING)
        self.assertTrue(ShiftInterest.objects.filter(shift=shift, slot=slot, user=worker).exists())
        [notice] = notifications_for(self.owner, "shift_counter_offer_received")
        self.assertEqual((notice.title, notice.payload["slot_ids"], notice.payload["slot_id"]),
                         ("New counter offer: Action Pharmacy", [slot.id], slot.id))
        self.assertTrue(notice.body.startswith(f"{worker.get_full_name()} sent a counter offer"))
        self.assertEqual([(e["template"], e["to"]) for e in sent], [("emails/shift_counter_offer.html", [self.owner.email])])

        listed = client_for(self.owner).get(f"{API}shifts/{shift.id}/counter-offers/")
        self.assertEqual([item["id"] for item in listed.data], [offer.id])
        batch = client_for(self.owner).get(f"{API}shifts/counter-offers-batch/?shift_ids={shift.id},{shift.id}")
        self.assertEqual([item["id"] for item in batch.data[str(shift.id)]], [offer.id])
        bad_batch = client_for(self.owner).get(f"{API}shifts/counter-offers-batch/?shift_ids=x")
        self.assertEqual(bad_batch.status_code, 400)

    def test_accept_turns_the_counter_offer_into_a_worker_offer(self):
        worker = self.worker()
        shift = self.shift(single_user_only=False, slots=2, rate_type="FLEXIBLE")
        slot = shift.slots.order_by("id").first()
        self.submit(worker, shift, slot)
        counter = ShiftCounterOffer.objects.get()

        with queued_emails() as sent, self.captureOnCommitCallbacks(execute=True):
            response = self.owner_client.post(
                f"{API}shifts/{shift.id}/counter-offers/{counter.id}/accept/", {}, format="json",
            )
        self.assertEqual(response.status_code, 200, response.data)
        generated = ShiftOffer.objects.get(shift=shift, user=worker)
        self.assertEqual(response.data, {
            "detail": "Offer sent for candidate confirmation.",
            "offer_ids": [generated.id],
            "assignment_ids": [],
            "payment_required": False,
            "payment_status": shift.payment_status,
            "worker_confirmation_required": True,
        })
        counter.refresh_from_db()
        self.assertEqual((counter.status, counter.decided_by_id), (ShiftCounterOffer.Status.ACCEPTED, self.owner.id))
        self.assertEqual((generated.slot_id, generated.offered_rate, generated.counter_offer_id, generated.status),
                         (slot.id, Decimal("75.00"), counter.id, ShiftOffer.Status.PENDING))
        [notice] = notifications_for(worker, "shift_counter_offer_accepted")
        self.assertEqual(notice.payload["generated_offer_ids"], [generated.id])
        self.assertEqual([e["template"] for e in sent], ["emails/shift_counter_offer_accepted.html"])

        rejected_after, _ = self.post(self.owner, f"shifts/{shift.id}/counter-offers/{counter.id}/reject/")
        self.assertEqual((rejected_after.status_code, rejected_after.data["detail"]), (400, "Counter offer is not pending."))

    def test_accept_does_not_log_the_request_payload(self):
        worker = self.worker()
        shift = self.shift(single_user_only=False, slots=2, rate_type="FLEXIBLE")
        slot = shift.slots.order_by("id").first()
        self.submit(worker, shift, slot)
        counter = ShiftCounterOffer.objects.get()
        marker = "payload-marker-7f3a"
        with mock.patch.object(logging.Logger, "_log") as emitted:
            response, _ = self.post(self.owner, f"shifts/{shift.id}/counter-offers/{counter.id}/accept/",
                                    {"note": marker})
        self.assertEqual(response.status_code, 200)
        logged = [str(call) for call in emitted.call_args_list if call.args and call.args[0] >= logging.WARNING]
        self.assertFalse([line for line in logged if marker in line or "counter_offer_accept" in line], logged)

    def test_reject_and_refusals(self):
        worker = self.worker()
        shift = self.shift(single_user_only=False, slots=2, rate_type="FLEXIBLE")
        slot = shift.slots.order_by("id").first()
        self.submit(worker, shift, slot)
        counter = ShiftCounterOffer.objects.get()

        by_worker, _ = self.post(worker, f"shifts/{shift.id}/counter-offers/{counter.id}/accept/")
        self.assertEqual(by_worker.status_code, 403)

        response, sent = self.post(self.owner, f"shifts/{shift.id}/counter-offers/{counter.id}/reject/")
        self.assertEqual((response.status_code, response.data), (200, {"detail": "Counter offer rejected."}))
        counter.refresh_from_db()
        self.assertEqual(counter.status, ShiftCounterOffer.Status.REJECTED)
        [notice] = notifications_for(worker, "shift_counter_offer_declined")
        self.assertEqual(notice.payload["slot_ids"], [slot.id])
        self.assertEqual([e["template"] for e in sent], ["emails/shift_counter_offer_rejected.html"])

        accept_rejected, _ = self.post(self.owner, f"shifts/{shift.id}/counter-offers/{counter.id}/accept/",
                                       {"slot_id": slot.id})
        self.assertEqual((accept_rejected.status_code, accept_rejected.data["detail"]), (400, "Counter offer has been rejected."))
        self.assertFalse(ShiftOffer.objects.exists())

    def test_accept_refuses_a_taken_slot(self):
        worker = self.worker()
        shift = self.shift(single_user_only=False, slots=2, rate_type="FLEXIBLE")
        slot = shift.slots.order_by("id").first()
        self.submit(worker, shift, slot)
        counter = ShiftCounterOffer.objects.get()
        ShiftSlotAssignment.objects.create(shift=shift, slot=slot, slot_date=slot.date, user=self.worker())
        response, _ = self.post(self.owner, f"shifts/{shift.id}/counter-offers/{counter.id}/accept/")
        self.assertEqual((response.status_code, response.data["detail"]), (400, "One or more slots are no longer available."))
        counter.refresh_from_db()
        self.assertEqual(counter.status, ShiftCounterOffer.Status.PENDING)
        self.assertEqual(ShiftCounterOfferSlot.objects.filter(offer=counter).count(), 1)


@override_settings(CELERY_TASK_ALWAYS_EAGER=False)
class OfferNotificationCommitTests(TransactionTestCase):
    """Offer rows and their in-app notice commit before either external transport is attempted."""

    def setUp(self):
        self.owner, self.pharmacy = make_owner_with_pharmacy("Offer notification pharmacy")
        self.owner_client = client_for(self.owner)
        self.worker = make_user("PHARMACIST", mobile_number="0411111111")
        PharmacistOnboarding.objects.create(user=self.worker, verified=True, short_bio="Bio", rate_preference={})
        Membership.objects.create(
            user=self.worker, pharmacy=self.pharmacy, role="PHARMACIST", employment_type="LOCUM",
            status=Membership.Status.ACCEPTED, is_active=True,
        )

    def request_case(self, kind):
        shift = Shift.objects.create(
            pharmacy=self.pharmacy, created_by=self.owner, role_needed="PHARMACIST", employment_type="LOCUM",
            visibility="LOCUM_CASUAL", single_user_only=False, rate_type="FLEXIBLE",
        )
        slot = ShiftSlot.objects.create(
            shift=shift, date=DAY, start_time=time(9), end_time=time(17), rate=Decimal("70.00"),
        )
        if kind == "counteroffer":
            counter = ShiftCounterOffer.objects.create(shift=shift, user=self.worker, message="Can do")
            ShiftCounterOfferSlot.objects.create(
                offer=counter, slot=slot, slot_date=DAY, proposed_start_time=time(9),
                proposed_end_time=time(17), proposed_rate=Decimal("75.00"),
            )
            return shift, counter, f"{API}shifts/{shift.id}/counter-offers/{counter.id}/accept/", {"slot_id": slot.id}
        return shift, None, f"{API}shifts/{shift.id}/accept_user/", {"user_id": self.worker.id, "slot_id": slot.id}

    def committed_offer(self, shift, counter):
        offer = ShiftOffer.objects.get(shift=shift, user=self.worker)
        self.assertEqual(offer.status, ShiftOffer.Status.PENDING)
        self.assertFalse(ShiftSlotAssignment.objects.filter(shift=shift).exists())
        if counter:
            counter.refresh_from_db()
            self.assertEqual(counter.status, ShiftCounterOffer.Status.ACCEPTED)
        return offer

    def test_announcements_wait_for_outer_commit(self):
        for kind in ("offer", "counteroffer"):
            with self.subTest(kind=kind):
                shift, counter, path, data = self.request_case(kind)
                with mock.patch("notifications.services._deliver_notification") as deliver, \
                        mock.patch("celery.app.base.Celery.send_task") as enqueue:
                    with transaction.atomic():
                        response = self.owner_client.post(path, data, format="json")
                        self.assertEqual(response.status_code, 200, response.data)
                        offer = self.committed_offer(shift, counter)
                        notice = Notification.objects.get(user=self.worker, payload__shift_id=shift.id)
                        deliver.assert_not_called()
                        enqueue.assert_not_called()
                    deliver.assert_called_once()
                    self.assertEqual(deliver.call_args.args[0].pk, notice.pk)
                    enqueue.assert_called_once()
                    self.assertEqual(enqueue.call_args.args[0], "users.tasks.send_email_task")
                    email = enqueue.call_args.kwargs["kwargs"]
                    expected_template = "emails/shift_counter_offer_accepted.html" if counter else "emails/shift_offer.html"
                    self.assertEqual(email["template_name"], expected_template)
                    self.assertEqual(email["recipient_list"], [self.worker.email])
                    self.assertIn(f"offer_id={offer.id}", email["context"]["shift_link"])
                self.assertTrue(Notification.objects.filter(pk=notice.pk).exists())

    def test_rollback_discards_offer_notice_and_external_callbacks(self):
        for kind in ("offer", "counteroffer"):
            with self.subTest(kind=kind):
                shift, counter, path, data = self.request_case(kind)
                with mock.patch("notifications.services._deliver_notification") as deliver, \
                        mock.patch("celery.app.base.Celery.send_task") as enqueue:
                    with self.assertRaisesMessage(RuntimeError, "later business failure"):
                        with transaction.atomic():
                            response = self.owner_client.post(path, data, format="json")
                            self.assertEqual(response.status_code, 200, response.data)
                            self.assertTrue(Notification.objects.filter(user=self.worker, payload__shift_id=shift.id).exists())
                            raise RuntimeError("later business failure")
                    self.assertFalse(ShiftOffer.objects.filter(shift=shift).exists())
                    self.assertFalse(Notification.objects.filter(user=self.worker, payload__shift_id=shift.id).exists())
                    if counter:
                        counter.refresh_from_db()
                        self.assertEqual(counter.status, ShiftCounterOffer.Status.PENDING)
                    deliver.assert_not_called()
                    enqueue.assert_not_called()

    def test_notification_outage_keeps_committed_offer_and_email_attempt(self):
        for kind in ("offer", "counteroffer"):
            with self.subTest(kind=kind):
                shift, counter, path, data = self.request_case(kind)
                with mock.patch("notifications.services._deliver_notification", side_effect=RuntimeError("notification offline")) as deliver, \
                        mock.patch("celery.app.base.Celery.send_task") as enqueue, \
                        self.assertLogs("django.db.backends.base", level="ERROR") as logged:
                    response = self.owner_client.post(path, data, format="json")
                self.assertEqual(response.status_code, 200, response.data)
                self.committed_offer(shift, counter)
                self.assertEqual(Notification.objects.filter(user=self.worker, payload__shift_id=shift.id).count(), 1)
                deliver.assert_called_once()
                enqueue.assert_called_once()
                self.assertTrue(any("notification offline" in record.getMessage() and record.exc_info for record in logged.records))

    def test_queue_outage_keeps_committed_offer_and_notice(self):
        for kind in ("offer", "counteroffer"):
            with self.subTest(kind=kind):
                shift, counter, path, data = self.request_case(kind)
                with mock.patch("notifications.services._deliver_notification") as deliver, \
                        mock.patch("celery.app.base.Celery.send_task", side_effect=RuntimeError("queue offline")) as enqueue, \
                        self.assertLogs("django.db.backends.base", level="ERROR") as logged:
                    response = self.owner_client.post(path, data, format="json")
                self.assertEqual(response.status_code, 200, response.data)
                self.committed_offer(shift, counter)
                self.assertEqual(Notification.objects.filter(user=self.worker, payload__shift_id=shift.id).count(), 1)
                deliver.assert_called_once()
                enqueue.assert_called_once()
                self.assertTrue(any("queue offline" in record.getMessage() and record.exc_info for record in logged.records))

    def test_repeated_requests_preserve_existing_offer_and_announcement_behavior(self):
        for kind in ("offer", "counteroffer"):
            with self.subTest(kind=kind):
                shift, counter, path, data = self.request_case(kind)
                with mock.patch("notifications.services._deliver_notification") as deliver, \
                        mock.patch("celery.app.base.Celery.send_task") as enqueue:
                    first = self.owner_client.post(path, data, format="json")
                    repeated = self.owner_client.post(path, data, format="json")
                self.assertEqual(first.status_code, 200, first.data)
                self.assertEqual(repeated.status_code, 200, repeated.data)
                offer = self.committed_offer(shift, counter)
                id_field = "offer_ids" if counter else "offer_id"
                expected_id = [offer.id] if counter else offer.id
                self.assertEqual(first.data[id_field], expected_id)
                self.assertEqual(repeated.data[id_field], expected_id)
                # Counteroffer reacceptance currently announces its refreshed offer; ordinary pending offers do not.
                expected_attempts = 2 if counter else 1
                self.assertEqual(deliver.call_count, expected_attempts)
                self.assertEqual(enqueue.call_count, expected_attempts)


class RejectShiftTests(ShiftActionFixture):
    def test_whole_shift_rejection_prompts_escalation_once(self):
        worker = self.worker()
        shift = self.shift(single_user_only=False, slots=2)

        with self.captureOnCommitCallbacks() as on_commit:
            response, sent = self.post(worker, f"shifts/{shift.id}/reject/")
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(ShiftRejection.objects.filter(shift=shift, user=worker).count(), 2)
        self.assertEqual(len(response.data), 2)
        self.assertEqual([(e["template"], e["to"]) for e in sent], [("emails/shift_rejected.html", [self.owner.email])])
        self.assertEqual(len(on_commit), 1)  # the e-mail's own in-app notification is dispatched after commit
        self.assertEqual(sent[0]["subject"], f"Shift Update: {worker.get_full_name()} has declined your shift")

        again, sent_again = self.post(worker, f"shifts/{shift.id}/reject/")
        self.assertEqual(again.status_code, 200)
        self.assertEqual(sent_again, [])

    def test_single_user_rejection_and_refusals(self):
        worker = self.worker()
        single = self.shift()
        response, _ = self.post(worker, f"shifts/{single.id}/reject/")
        self.assertEqual(response.status_code, 201)
        self.assertIsNone(ShiftRejection.objects.get(shift=single).slot)

        multi = self.shift(single_user_only=False, slots=1)
        slot = multi.slots.get()
        cases = {
            "not a list": ({"slot_ids": 5}, "slot_ids must be a list."),
            "bad value": ({"slot_id": "x"}, "Invalid slot_id: x"),
            "unknown slot": ({"slot_ids": [999999]}, "Invalid slot_id(s): [999999]"),
            "bad date": ({"slot_id": slot.id, "slot_date": "10/10/2030"}, "Invalid slot_date format, use YYYY-MM-DD"),
        }
        for label, (payload, detail) in cases.items():
            with self.subTest(label):
                refused, _ = self.post(worker, f"shifts/{multi.id}/reject/", payload)
                self.assertEqual((refused.status_code, refused.data["detail"]), (400, detail))

        slotless = self.shift(single_user_only=False, slots=0)
        refused, _ = self.post(worker, f"shifts/{slotless.id}/reject/")
        self.assertEqual((refused.status_code, refused.data["detail"]), (400, "No slots are available to reject."))


class ShareAndEscalateTests(ShiftActionFixture):
    def test_share_link_requires_platform_visibility(self):
        shift = self.shift()
        response, _ = self.post(self.owner, f"shifts/{shift.id}/generate-share-link/")
        self.assertEqual((response.status_code, response.data["detail"]), (
            400, "You must escalate this shift to platform level before it can be shared."))
        shift.visibility = "PLATFORM"
        shift.save(update_fields=["visibility"])
        old_token = shift.share_token
        response, _ = self.post(self.owner, f"shifts/{shift.id}/generate-share-link/")
        shift.refresh_from_db()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data, {"share_token": str(shift.share_token)})
        self.assertNotEqual(shift.share_token, old_token)

    def test_manual_escalation(self):
        shift = self.shift(visibility="FULL_PART_TIME")
        response, _ = self.post(self.owner, f"shifts/{shift.id}/escalate/")
        shift.refresh_from_db()
        self.assertEqual((response.status_code, response.data["detail"]), (200, "Shift escalated to LOCUM_CASUAL."))
        self.assertEqual(shift.visibility, "LOCUM_CASUAL")
        self.assertIsNotNone(shift.escalate_to_locum_casual)

        invalid, _ = self.post(self.owner, f"shifts/{shift.id}/escalate/", {"target_visibility": "NOPE"})
        self.assertEqual(invalid.status_code, 400)
        self.assertTrue(invalid.data["detail"].startswith("Invalid target_visibility. Must be one of"))
        backwards, _ = self.post(self.owner, f"shifts/{shift.id}/escalate/", {"target_visibility": "FULL_PART_TIME"})
        self.assertEqual(backwards.data["detail"], "Shift is already at or above that visibility level.")
        to_top, _ = self.post(self.owner, f"shifts/{shift.id}/escalate/", {"target_visibility": "PLATFORM"})
        self.assertEqual(to_top.data["detail"], "Shift escalated to PLATFORM.")
        beyond, _ = self.post(self.owner, f"shifts/{shift.id}/escalate/")
        self.assertEqual(beyond.data["detail"], "Already at the highest escalation level.")


class ManualAssignTests(ShiftActionFixture):
    def test_malformed_slot_date_and_published_roster_are_refused(self):
        # Regression: a JSON slot_date used to reach ShiftSlotAssignment.save() as a string and crash the
        # published-roster guard, and a published roster week raised a server error instead of a refusal.
        staff = self.worker("FULL_TIME")
        shift = self.shift(single_user_only=False, slots=1)
        slot = shift.slots.get()
        bad, _ = self.post(self.owner, f"shifts/{shift.id}/manual-assign/",
                           {"user_id": staff.id, "assignments": [{"slot_id": slot.id, "slot_date": "10/10/2030"}]})
        self.assertEqual((bad.status_code, bad.data["detail"]), (400, "Invalid slot_date format, use YYYY-MM-DD"))

        RosterPeriod.objects.create(
            pharmacy=self.pharmacy, week_start=slot.date - timedelta(days=slot.date.weekday()),
            status=RosterPeriod.Status.PUBLISHED,
        )
        published, _ = self.post(self.owner, f"shifts/{shift.id}/manual-assign/",
                                 {"user_id": staff.id, "assignments": [{"slot_id": slot.id, "slot_date": str(slot.date)}]})
        self.assertEqual(published.status_code, 400)
        self.assertIn("published roster", str(published.data))
        self.assertFalse(ShiftSlotAssignment.objects.exists())

    def test_direct_staff_are_rostered_and_notified(self):
        staff = self.worker("FULL_TIME")
        shift = self.shift(single_user_only=False, slots=2)
        first, second = shift.slots.order_by("id")
        payload = {"user_id": staff.id, "assignments": [
            {"slot_id": first.id, "slot_date": str(first.date)},
            {"slot_id": second.id},  # skipped: no date
        ]}
        response, _ = self.post(self.owner, f"shifts/{shift.id}/manual-assign/", payload)
        self.assertEqual(response.status_code, 200, response.data)
        assignment = ShiftSlotAssignment.objects.get(shift=shift)
        self.assertEqual(response.data, {
            "detail": f"1 slot(s) rostered for {staff.get_full_name()}",
            "assignment_ids": [assignment.id],
        })
        self.assertEqual((assignment.user_id, assignment.slot_id, assignment.is_rostered, assignment.unit_rate),
                         (staff.id, first.id, True, Decimal("0.00")))
        self.assertEqual(assignment.rate_reason, {"source": "Rostered manual assign"})
        [notice] = notifications_for(staff, "shift_assigned")
        self.assertEqual(notice.payload["assignment_ids"], [assignment.id])

        again, _ = self.post(self.owner, f"shifts/{shift.id}/manual-assign/", payload)
        self.assertEqual(again.data["assignment_ids"], [assignment.id])
        self.assertEqual(ShiftSlotAssignment.objects.filter(shift=shift).count(), 1)

    def test_inactive_former_staff_cannot_be_manually_rostered(self):
        staff = self.worker("FULL_TIME")
        Membership.objects.filter(user=staff, pharmacy=self.pharmacy).update(
            is_active=False,
            status=Membership.Status.LEFT,
        )
        shift = self.shift(single_user_only=False, slots=1)
        slot = shift.slots.get()
        response, _ = self.post(
            self.owner,
            f"shifts/{shift.id}/manual-assign/",
            {"user_id": staff.id, "assignments": [{"slot_id": slot.id, "slot_date": str(slot.date)}]},
        )
        self.assertEqual(response.status_code, 400)
        self.assertTrue(response.data["detail"].startswith(
            "Only direct full-time, part-time or casual pharmacy staff"
        ))
        self.assertFalse(ShiftSlotAssignment.objects.filter(shift=shift).exists())

    def test_manual_assign_rolls_back_earlier_slots_when_a_later_slot_is_locked(self):
        staff = self.worker("FULL_TIME")
        shift = self.shift(single_user_only=False, slots=2)
        first, second = shift.slots.order_by("id")
        second.date = first.date + timedelta(days=7)
        second.save(update_fields=["date"])

        RosterPeriod.objects.create(
            pharmacy=self.pharmacy,
            week_start=second.date - timedelta(days=second.date.weekday()),
            status=RosterPeriod.Status.PUBLISHED,
        )
        response, _ = self.post(
            self.owner,
            f"shifts/{shift.id}/manual-assign/",
            {
                "user_id": staff.id,
                "assignments": [
                    {"slot_id": first.id, "slot_date": str(first.date)},
                    {"slot_id": second.id, "slot_date": str(second.date)},
                ],
            },
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("published roster", str(response.data))
        self.assertFalse(
            ShiftSlotAssignment.objects.filter(shift=shift).exists(),
            "manual assignment must be all-or-nothing across the submitted slot list",
        )

    def test_refusals(self):
        shift = self.shift(single_user_only=False, slots=1)
        locum = self.worker("LOCUM")
        response, _ = self.post(self.owner, f"shifts/{shift.id}/manual-assign/", {"user_id": locum.id, "assignments": []})
        self.assertEqual(response.status_code, 400)
        self.assertTrue(response.data["detail"].startswith("Only direct full-time, part-time or casual pharmacy staff"))
        missing, _ = self.post(self.owner, f"shifts/{shift.id}/manual-assign/", {"assignments": []})
        self.assertEqual((missing.status_code, missing.data["detail"]), (400, "user_id and assignments list are required."))
        by_worker, _ = self.post(locum, f"shifts/{shift.id}/manual-assign/", {"user_id": locum.id, "assignments": []})
        self.assertEqual(by_worker.status_code, 403)


class MemberStatusTests(ShiftActionFixture):
    def test_statuses_for_each_member(self):
        shift = self.shift(visibility="FULL_PART_TIME")
        interested, rejected, assigned, offered, silent = (self.worker("FULL_TIME") for _ in range(5))
        ShiftInterest.objects.create(shift=shift, slot=None, user=interested)
        ShiftRejection.objects.create(shift=shift, slot=None, user=rejected)
        slot = shift.slots.get()
        ShiftSlotAssignment.objects.create(shift=shift, slot=slot, slot_date=slot.date, user=assigned)
        offer = ShiftOffer.objects.create(shift=shift, user=offered, offered_rate=Decimal("61.00"),
                                          expires_at=timezone.now() + timedelta(hours=1))

        response = client_for(self.owner).get(f"{API}shifts/{shift.id}/member_status/")
        self.assertEqual(response.status_code, 200)
        rows = {row["user_id"]: row for row in response.data}
        self.assertEqual({user: rows[user.id]["status"] for user in (interested, rejected, assigned, offered, silent)}, {
            interested: "interested", rejected: "rejected", assigned: "accepted", offered: "no_response",
            silent: "no_response",
        })
        self.assertEqual(set(rows[silent.id]), {
            "user_id", "name", "employment_type", "role", "status", "is_member", "membership_id", "pharmacy_id",
            "pharmacy_name", "organization_id", "organization_name", "visibility_level", "pending_confirmation",
            "pending_offer_id", "pending_confirmation_counter_offer", "awaiting_payment", "awaiting_payment_offer_id",
            "awaiting_payment_counter_offer", "user_detail",
        })
        # Members and favourites carry their work profile for the review dialog, never a CV.
        self.assertIn("skills", rows[silent.id]["user_detail"])
        self.assertNotIn("resume", rows[silent.id]["user_detail"])
        pending = rows[offered.id]
        self.assertEqual((pending["pending_confirmation"], pending["pending_offer_id"]), (True, offer.id))
        synthetic = pending["pending_confirmation_counter_offer"]
        self.assertEqual((synthetic["id"], synthetic["status"], synthetic["slots"][0]["proposed_rate"]),
                         (None, "ACCEPTED", Decimal("61.00")))
        self.assertEqual(rows[silent.id]["visibility_level"], "FULL_PART_TIME")

        locum_view = client_for(self.owner).get(f"{API}shifts/{shift.id}/member_status/?visibility=LOCUM_CASUAL")
        self.assertEqual(locum_view.data, [])

    def test_member_status_refusals(self):
        public = self.shift(visibility="PLATFORM")
        response = client_for(self.owner).get(f"{API}shifts/{public.id}/member_status/")
        self.assertEqual(response.status_code, 400)
        self.assertTrue(response.data["detail"].startswith("Member status is not applicable for Public shifts"))
        multi = self.shift(single_user_only=False, slots=2)
        response = client_for(self.owner).get(f"{API}shifts/{multi.id}/member_status/")
        self.assertEqual((response.status_code, response.data["detail"]), (
            400, "slot_id is required for multi-slot shifts via this endpoint."))


class ShiftTenantIsolationContracts(TestCase):
    def setUp(self):
        self.owner_a, self.a = make_owner_with_pharmacy("PR200 A")
        self.owner_b, self.b = make_owner_with_pharmacy("PR200 B")
        self.outsider = make_user("PHARMACIST")
        self.day = date.today() + timedelta(days=21)

    def test_f04_private_staff_member_status_denies_external_shift_viewer(self):
        shift = Shift.objects.create(
            pharmacy=self.b, created_by=self.owner_b,
            role_needed="PHARMACIST", employment_type="LOCUM",
            visibility="PLATFORM", single_user_only=True,
        )
        member, _membership = make_staff_member(self.b, role="PHARMACIST")
        outsider = client_for(self.outsider)
        response = outsider.get(
            f"/api/v1/shifts/{shift.pk}/member_status/?visibility=FULL_PART_TIME"
        )
        self.assertIn(response.status_code, (403, 404), response.data)
        manager_response = client_for(self.owner_b).get(
            f"/api/v1/shifts/{shift.pk}/member_status/?visibility=FULL_PART_TIME"
        )
        self.assertEqual(manager_response.status_code, 200, manager_response.data)

    def test_f04_shift_patch_denies_cross_tenant_and_paid_override(self):
        shift = Shift.objects.create(
            pharmacy=self.a, created_by=self.owner_a,
            role_needed="PHARMACIST", employment_type="LOCUM",
            visibility="LOCUM_CASUAL", payment_status="PENDING",
        )
        client = client_for(self.owner_a)
        client.raise_request_exception = False
        response = client.patch(
            f"/api/v1/shifts/{shift.pk}/",
            {"pharmacy": self.b.pk, "payment_status": "PAID"}, format="json",
        )
        self.assertIn(response.status_code, (400, 403, 404), response.data)
        shift.refresh_from_db()
        self.assertEqual(shift.pharmacy_id, self.a.pk)
        self.assertEqual(shift.payment_status, "PENDING")


class BookingSafetyTests(ShiftActionFixture):
    def offer(self, shift, worker, **extra):
        slot = shift.slots.first() if not shift.single_user_only else None
        return ShiftOffer.objects.create(shift=shift, slot=slot, user=worker, **extra)

    def accept(self, offer, payment=True):
        from billing.utils import BILLING_STATE_PAYMENT_REQUIRED
        with mock.patch('shifts.engagement.build_shift_engagement_terms', return_value={}), \
                mock.patch('billing.utils.get_billing_state_for_pharmacy',
                           return_value=BILLING_STATE_PAYMENT_REQUIRED if payment else 'FREE'), \
                mock.patch('shifts.offers.notify_shift_users'), mock.patch('shifts.offers.async_task'), \
                mock.patch('shifts.offers.send_shift_payment_finalized_notifications'), \
                self.captureOnCommitCallbacks(execute=True):
            return client_for(offer.user).post(f'{API}shift-offers/{offer.id}/accept/', {}, format='json')

    def test_public_accept_preserves_onboarding_outcomes_with_enforcement_on_or_off(self):
        for enforcement in (True, False):
            with self.subTest(enforcement=enforcement), override_settings(AHPRA_ENFORCEMENT_ENABLED=enforcement):
                cases = [
                    ("missing", make_user("PHARMACIST"), 400,
                     "Please complete your pharmacist onboarding before applying for public shifts."),
                    ("unverified", self.worker(employment_type=None, verified=False), 403,
                     "Verify your profile (email and mobile, plus AHPRA for pharmacists and interns) before applying for public shifts."),
                    ("verified", self.worker(employment_type=None, verified=True), 200, None),
                ]
                for profile_state, worker, expected_status, detail in cases:
                    with self.subTest(profile=profile_state):
                        shift = self.shift(single_user_only=False, visibility="PLATFORM")
                        offer = self.offer(shift, worker)
                        response = self.accept(offer)
                        self.assertEqual(response.status_code, expected_status, response.data)
                        offer.refresh_from_db()
                        if detail:
                            self.assertEqual(response.data["detail"], detail)
                            self.assertEqual(offer.status, ShiftOffer.Status.PENDING)
                            self.assertIsNone(offer.engagement_terms_accepted_at)
                        else:
                            self.assertEqual(offer.status, ShiftOffer.Status.ACCEPTED_AWAITING_PAYMENT)
                        self.assertFalse(ShiftSlotAssignment.objects.filter(shift=shift).exists())

    def test_b54_second_confirmation_cannot_reserve_the_same_occurrence(self):
        for payment in (True, False):
            with self.subTest(payment=payment):
                shift = self.shift(single_user_only=False)
                first = self.offer(shift, self.worker())
                second = self.offer(shift, self.worker())
                self.assertEqual(self.accept(first, payment).status_code, 200)
                refused = self.accept(second, payment)
                self.assertEqual(refused.status_code, 400, refused.data)
                second.refresh_from_db()
                self.assertNotIn(second.status, [ShiftOffer.Status.ACCEPTED, ShiftOffer.Status.ACCEPTED_AWAITING_PAYMENT])

    def test_b54_a_different_occurrence_remains_available(self):
        shift = self.shift(single_user_only=False, slots=2)
        first, second = shift.slots.order_by('id')
        reserved = self.offer(shift, self.worker(), status=ShiftOffer.Status.ACCEPTED_AWAITING_PAYMENT,
                              offered_slot_date=first.date)
        offer = ShiftOffer.objects.create(shift=shift, slot=second, user=self.worker(), offered_slot_date=second.date)
        self.assertEqual(self.accept(offer).status_code, 200)
        reserved.refresh_from_db()
        self.assertEqual(reserved.status, ShiftOffer.Status.ACCEPTED_AWAITING_PAYMENT)

    def test_b54_another_date_of_the_same_recurring_slot_remains_available(self):
        shift = self.shift(single_user_only=False)
        slot = shift.slots.get()
        slot.is_recurring = True
        slot.recurring_days = list(range(7))
        slot.recurring_end_date = slot.date + timedelta(days=7)
        slot.save()
        reserved = self.offer(shift, self.worker(), status=ShiftOffer.Status.ACCEPTED_AWAITING_PAYMENT,
                              offered_slot_date=slot.date)
        next_date = self.offer(shift, self.worker(), offered_slot_date=slot.date + timedelta(days=7))
        self.assertEqual(self.accept(next_date).status_code, 200)
        reserved.refresh_from_db()
        self.assertEqual(reserved.status, ShiftOffer.Status.ACCEPTED_AWAITING_PAYMENT)

    def test_b54_single_worker_shift_keeps_remaining_dates_for_the_same_worker(self):
        shift = self.shift(single_user_only=True, slots=3)
        worker, other = self.worker(), self.worker()
        first, second, third = shift.slots.order_by('id')
        for candidate, slot, expected in ((worker, first, 200), (other, second, 400), (worker, third, 200)):
            offer = ShiftOffer.objects.create(shift=shift, user=candidate, slot=slot, offered_slot_date=slot.date)
            self.assertEqual(self.accept(offer).status_code, expected)

    def test_b54_finalization_refuses_a_losing_offer_and_is_idempotent_for_the_winner(self):
        from shifts.finalize import finalize_shift_offer
        from rest_framework.exceptions import ValidationError
        shift = self.shift(single_user_only=False)
        winner = self.offer(shift, self.worker(), offered_rate=Decimal('70'))
        loser = self.offer(shift, self.worker(), offered_rate=Decimal('70'))
        with mock.patch('shifts.finalize.get_locked_rate_for_slot', return_value=(Decimal('70'), {})):
            self.assertEqual(len(finalize_shift_offer(winner)[0]), 1)
            self.assertEqual(finalize_shift_offer(winner)[0], [])
            with self.assertRaises(ValidationError):
                finalize_shift_offer(loser)
        loser.refresh_from_db()
        self.assertEqual(loser.status, ShiftOffer.Status.PENDING)

    def test_b20_interest_and_rejection_cannot_be_moved_to_another_shift_or_slot(self):
        worker = self.worker()
        shift, other = self.shift(single_user_only=False), self.shift(single_user_only=False)
        for model, endpoint in [(ShiftInterest, 'shift-interests'), (ShiftRejection, 'shift-rejections')]:
            row = model.objects.create(shift=shift, slot=shift.slots.get(), user=worker)
            response = client_for(worker).patch(f'{API}{endpoint}/{row.id}/',
                                               {'shift': other.id, 'slot': other.slots.get().id}, format='json')
            self.assertIn(response.status_code, (400, 405), response.data)
            row.refresh_from_db()
            self.assertEqual((row.shift_id, row.slot_id), (shift.id, shift.slots.get().id))
            self.assertEqual(client_for(worker).get(f'{API}{endpoint}/?shift={shift.id}').status_code, 200)
            action = 'express_interest' if model is ShiftInterest else 'reject'
            legitimate, _ = self.post(worker, f'shifts/{shift.id}/{action}/', {'slot_id': row.slot_id})
            self.assertIn(legitimate.status_code, (200, 201), legitimate.data)

    def test_b67_generic_offer_delete_is_disabled_but_pending_decline_works(self):
        worker = self.worker()
        shift = self.shift()
        for user in (worker, self.owner):
            offer = self.offer(shift, worker, status=ShiftOffer.Status.ACCEPTED_AWAITING_PAYMENT)
            response = client_for(user).delete(f'{API}shift-offers/{offer.id}/')
            self.assertEqual(response.status_code, 405)
            self.assertTrue(ShiftOffer.objects.filter(pk=offer.pk).exists())
        pending = self.offer(shift, worker)
        response, _ = self.post(worker, f'shift-offers/{pending.id}/decline/')
        self.assertEqual(response.status_code, 200, response.data)

    def test_f01_n2_pending_payment_blocks_terms_and_slot_replacement(self):
        worker = self.worker()
        shift = self.shift(single_user_only=False)
        offer = self.offer(shift, worker, status=ShiftOffer.Status.ACCEPTED_AWAITING_PAYMENT)
        slot = shift.slots.get()
        for payload in ({'role_needed': 'PHARMACIST', 'fixed_rate': '999.00'}, {'slots': []}):
            response = self.owner_client.patch(f'{API}shifts/{shift.id}/', payload, format='json')
            self.assertEqual(response.status_code, 400, response.data)
            self.assertIn('awaiting payment', str(response.data))
            self.assertTrue(shift.slots.filter(pk=slot.pk).exists())
            offer.refresh_from_db()
            self.assertEqual(offer.slot_id, slot.id)
        # A description-only edit (2c omits unchanged slots) keeps the offer awaiting payment.
        with mock.patch('shifts.posting.send_shift_updated_notifications'), self.captureOnCommitCallbacks(execute=True):
            response = self.owner_client.patch(f'{API}shifts/{shift.id}/', {'description': 'Different duties'}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        offer.refresh_from_db()
        self.assertEqual((offer.status, offer.slot_id), (ShiftOffer.Status.ACCEPTED_AWAITING_PAYMENT, slot.id))
        self.assertTrue(shift.slots.filter(pk=slot.pk).exists())

    def test_b71_notification_outage_does_not_fail_confirmation(self):
        from billing.utils import BILLING_STATE_PAYMENT_REQUIRED
        for broken in (False, True):
            offer = self.offer(self.shift(), self.worker())
            with mock.patch('shifts.engagement.build_shift_engagement_terms', return_value={}), \
                    mock.patch('billing.utils.get_billing_state_for_pharmacy', return_value=BILLING_STATE_PAYMENT_REQUIRED), \
                    mock.patch('shifts.offers.notify_shift_users', side_effect=RuntimeError('offline') if broken else None) as notice, \
                    mock.patch('shifts.offers.async_task'), self.captureOnCommitCallbacks(execute=True):
                response = client_for(offer.user).post(f'{API}shift-offers/{offer.id}/accept/', {}, format='json')
            self.assertEqual(response.status_code, 200, response.data)
            offer.refresh_from_db()
            self.assertEqual(offer.status, ShiftOffer.Status.ACCEPTED_AWAITING_PAYMENT)
            self.assertTrue(notice.called)

    def test_c020_n1_f05_n3_wrong_role_cannot_be_rostered_offered_or_confirmed(self):
        from onboarding.models import OtherStaffOnboarding
        technician = make_user('OTHER_STAFF')
        OtherStaffOnboarding.objects.create(user=technician, role_type='TECHNICIAN', verified=True)
        Membership.objects.create(user=technician, pharmacy=self.pharmacy, role='TECHNICIAN',
                                  employment_type='FULL_TIME', status=Membership.Status.ACCEPTED, is_active=True)
        pharmacist = self.worker('FULL_TIME')
        for worker, expected in ((technician, 400), (pharmacist, 200)):
            shift = self.shift(single_user_only=False)
            slot = shift.slots.get()
            for action, payload in [('accept_user', {'user_id': worker.id, 'slot_id': slot.id}),
                                    ('manual-assign', {'user_id': worker.id, 'assignments': [
                                        {'slot_id': slot.id, 'slot_date': str(slot.date)}]})]:
                response, _ = self.post(self.owner, f'shifts/{shift.id}/{action}/', payload)
                self.assertEqual(response.status_code, expected, response.data)
            offer = self.offer(self.shift(single_user_only=False), worker)
            self.assertEqual(self.accept(offer).status_code, expected)

    def test_f05_n1_explorer_requires_verification_to_apply(self):
        from onboarding.models import ExplorerOnboarding
        worker = make_user('EXPLORER')
        profile = ExplorerOnboarding.objects.create(user=worker, verified=False)
        shift = self.shift(visibility='PLATFORM')
        shift.role_needed = 'EXPLORER'
        shift.save(update_fields=['role_needed'])
        response, _ = self.post(worker, f'public-shifts/{shift.id}/express_interest/')
        self.assertEqual(response.status_code, 403, response.data)
        self.assertFalse(shift.interests.exists())
        counter_payload = {'slots': [{'slot_id': shift.slots.get().id, 'proposed_start_time': '09:00:00',
                                     'proposed_end_time': '17:00:00', 'proposed_rate': '60.00'}]}
        response, _ = self.post(worker, f'public-shifts/{shift.id}/counter-offers/', counter_payload)
        self.assertEqual(response.status_code, 403, response.data)
        self.assertFalse(shift.counter_offers.exists())
        profile.verified = True
        profile.save(update_fields=['verified'])
        response, _ = self.post(worker, f'public-shifts/{shift.id}/express_interest/')
        self.assertEqual(response.status_code, 201, response.data)
        response, _ = self.post(worker, f'public-shifts/{shift.id}/counter-offers/', counter_payload)
        self.assertEqual(response.status_code, 201, response.data)

    def test_c020_n5_slotless_counteroffer_acceptance(self):
        worker = self.worker()
        shift = self.shift(slots=0)
        shift.employment_type = 'FULL_TIME'
        shift.min_hourly_rate = Decimal('40.00')
        shift.max_hourly_rate = Decimal('50.00')
        shift.save(update_fields=['employment_type', 'min_hourly_rate', 'max_hourly_rate'])
        counter = ShiftCounterOffer.objects.create(shift=shift, user=worker)
        ShiftCounterOfferSlot.objects.create(offer=counter, proposed_start_time=time(10),
                                             proposed_end_time=time(14), proposed_rate=Decimal('70'))
        outsider = self.worker()
        refused, _ = self.post(outsider, f'shifts/{shift.id}/counter-offers/{counter.id}/accept/')
        self.assertIn(refused.status_code, (403, 404))
        response, _ = self.post(self.owner, f'shifts/{shift.id}/counter-offers/{counter.id}/accept/')
        self.assertEqual(response.status_code, 200, response.data)
        offer = ShiftOffer.objects.get(counter_offer=counter)
        self.assertEqual((offer.slot_id, offer.offered_slot_date, offer.offered_start_time,
                          offer.offered_end_time, offer.offered_rate), (None, None, time(10), time(14), Decimal('70')))

    def test_c020_n6_finalization_books_only_the_accepted_occurrence(self):
        from shifts.finalize import finalize_shift_offer
        from rest_framework.exceptions import ValidationError
        worker = self.worker()
        shift = self.shift(single_user_only=False)
        slot = shift.slots.get()
        slot.is_recurring = True
        slot.recurring_days = [(slot.date.weekday() + 1) % 7]
        slot.recurring_end_date = slot.date + timedelta(days=14)
        slot.save()
        offer = self.offer(shift, worker, offered_slot_date=slot.date + timedelta(days=7), offered_rate=Decimal('70'))
        with mock.patch('shifts.finalize.get_locked_rate_for_slot', return_value=(Decimal('70'), {})):
            ids, _ = finalize_shift_offer(offer)
        self.assertEqual(list(ShiftSlotAssignment.objects.filter(id__in=ids).values_list('slot_date', flat=True)),
                         [offer.offered_slot_date])
        self.assertEqual(ShiftSlotAssignment.objects.filter(shift=shift).count(), 1)
        offer.offered_slot_date = slot.date + timedelta(days=21)
        with self.assertRaises(ValidationError):
            finalize_shift_offer(offer)
        self.assertEqual(ShiftSlotAssignment.objects.filter(shift=shift).count(), 1)

    def test_c020_n6_whole_shift_offer_still_books_every_recurring_date(self):
        from shifts.engagement import _offer_occurrences
        from shifts.finalize import finalize_shift_offer
        shift = self.shift()
        slot = shift.slots.get()
        slot.is_recurring = True
        slot.recurring_days = list(range(7))
        slot.recurring_end_date = slot.date + timedelta(days=2)
        slot.save()
        offer = self.offer(shift, self.worker(), engagement_terms_snapshot={'occurrences': _offer_occurrences(shift)})
        with mock.patch('shifts.finalize.get_locked_rate_for_slot', return_value=(Decimal('70'), {})):
            ids, _ = finalize_shift_offer(offer)
        self.assertEqual(len(ids), 3)

    def test_c041_n1_partial_counteroffer_stays_actionable_until_all_dates_are_offered(self):
        worker = self.worker()
        shift = self.shift(single_user_only=False, slots=2)
        counter = ShiftCounterOffer.objects.create(shift=shift, user=worker)
        slots = list(shift.slots.order_by('id'))
        for slot in slots:
            ShiftCounterOfferSlot.objects.create(offer=counter, slot=slot, slot_date=slot.date,
                                                 proposed_start_time=time(9), proposed_end_time=time(17))
        for index, slot in enumerate(slots):
            response, _ = self.post(self.owner, f'shifts/{shift.id}/counter-offers/{counter.id}/accept/', {'slot_id': slot.id})
            self.assertEqual(response.status_code, 200, response.data)
            listed = self.owner_client.get(f'{API}shifts/{shift.id}/counter-offers/')
            self.assertEqual([row['id'] for row in listed.data], [counter.id] if index == 0 else [])
            if index == 0:
                self.assertEqual([entry['slot']['id'] for entry in listed.data[0]['slots']], [slots[1].id])
        self.assertEqual(ShiftOffer.objects.filter(counter_offer=counter).count(), 2)


@skipUnless(connection.vendor == 'postgresql', 'Requires PostgreSQL row locks')
class OfferConfirmationRaceTests(TransactionTestCase):
    def test_finalize_and_manual_assignment_serialize_on_the_same_occurrence(self):
        from billing.utils import BILLING_STATE_FREE_TRIAL
        from shifts.assignment import roster_direct_staff as real_roster_direct_staff
        from shifts.offers import ShiftOfferViewSet

        owner, pharmacy = make_owner_with_pharmacy('Finalize versus manual assignment')
        shift = Shift.objects.create(
            pharmacy=pharmacy,
            created_by=owner,
            role_needed='PHARMACIST',
            employment_type='LOCUM',
            visibility='LOCUM_CASUAL',
            single_user_only=False,
        )
        slot = ShiftSlot.objects.create(
            shift=shift,
            date=DAY,
            start_time=time(9),
            end_time=time(17),
            rate=Decimal('70'),
        )
        offered_worker = make_user('PHARMACIST')
        offer = ShiftOffer.objects.create(
            shift=shift,
            slot=slot,
            user=offered_worker,
            offered_slot_date=DAY,
        )
        staff_worker = make_user('PHARMACIST')
        Membership.objects.create(
            user=staff_worker,
            pharmacy=pharmacy,
            role='PHARMACIST',
            employment_type='FULL_TIME',
            status=Membership.Status.ACCEPTED,
            is_active=True,
        )

        barrier = Barrier(2)
        original_get = ShiftOfferViewSet.get_object

        def read_offer_together(view):
            row = original_get(view)
            barrier.wait(timeout=15)
            return row

        def roster_together(*, shift, candidate, assignments):
            barrier.wait(timeout=15)
            return real_roster_direct_staff(
                shift=shift,
                candidate=candidate,
                assignments=assignments,
            )

        def accept_offer():
            close_old_connections()
            try:
                return client_for(User.objects.get(pk=offered_worker.pk)).post(
                    f'{API}shift-offers/{offer.pk}/accept/',
                    {},
                    format='json',
                ).status_code
            finally:
                close_old_connections()

        def manual_assign():
            close_old_connections()
            try:
                return client_for(User.objects.get(pk=owner.pk)).post(
                    f'{API}shifts/{shift.pk}/manual-assign/',
                    {
                        'user_id': staff_worker.pk,
                        'assignments': [{'slot_id': slot.pk, 'slot_date': str(DAY)}],
                    },
                    format='json',
                ).status_code
            finally:
                close_old_connections()

        with mock.patch.object(ShiftOfferViewSet, 'get_object', read_offer_together), \
                mock.patch('shifts.base.roster_direct_staff', side_effect=roster_together), \
                mock.patch('shifts.engagement.build_shift_engagement_terms', return_value={}), \
                mock.patch('billing.utils.get_billing_state_for_pharmacy', return_value=BILLING_STATE_FREE_TRIAL), \
                mock.patch('shifts.offers.notify_shift_users'), mock.patch('shifts.offers.async_task'), \
                mock.patch('shifts.offers.send_shift_payment_finalized_notifications'), \
                ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(lambda fn: fn(), (accept_offer, manual_assign)))

        self.assertEqual(sorted(results), [200, 400], results)
        assignments = list(ShiftSlotAssignment.objects.filter(slot=slot, slot_date=DAY))
        self.assertEqual(len(assignments), 1)
        self.assertIn(assignments[0].user_id, {offered_worker.pk, staff_worker.pk})
        offer.refresh_from_db()
        if assignments[0].user_id == offered_worker.pk:
            self.assertEqual(assignments[0].source_offer_id, offer.pk)
            self.assertEqual(offer.status, ShiftOffer.Status.ACCEPTED)
        else:
            self.assertIsNone(assignments[0].source_offer_id)
            self.assertEqual(offer.status, ShiftOffer.Status.PENDING)

    def test_b54_only_one_simultaneous_worker_reserves_or_books_the_occurrence(self):
        from billing.utils import BILLING_STATE_PAYMENT_REQUIRED
        from shifts.offers import ShiftOfferViewSet
        for payment in (True, False):
            owner, pharmacy = make_owner_with_pharmacy('Race pharmacy')
            shift = Shift.objects.create(pharmacy=pharmacy, created_by=owner, role_needed='PHARMACIST',
                                         employment_type='LOCUM', visibility='LOCUM_CASUAL', single_user_only=False)
            slot = ShiftSlot.objects.create(shift=shift, date=DAY, start_time=time(9), end_time=time(17), rate=Decimal('70'))
            workers = [make_user('PHARMACIST') for _ in range(2)]
            offers = [ShiftOffer.objects.create(shift=shift, slot=slot, user=worker, offered_slot_date=DAY) for worker in workers]
            barrier = Barrier(2)
            original_get = ShiftOfferViewSet.get_object

            def read_pending_together(view):
                offer = original_get(view)
                barrier.wait(timeout=15)
                return offer

            def confirm(offer):
                close_old_connections()
                try:
                    return client_for(offer.user).post(f'{API}shift-offers/{offer.id}/accept/', {}, format='json').status_code
                finally:
                    close_old_connections()

            with mock.patch.object(ShiftOfferViewSet, 'get_object', read_pending_together), \
                    mock.patch('shifts.engagement.build_shift_engagement_terms', return_value={}), \
                    mock.patch('billing.utils.get_billing_state_for_pharmacy',
                               return_value=BILLING_STATE_PAYMENT_REQUIRED if payment else 'FREE'), \
                    mock.patch('shifts.offers.notify_shift_users'), mock.patch('shifts.offers.async_task'), \
                    mock.patch('shifts.offers.send_shift_payment_finalized_notifications'), \
                    ThreadPoolExecutor(max_workers=2) as pool:
                results = list(pool.map(confirm, offers))
            self.assertEqual(sorted(results), [200, 400])
            self.assertEqual(shift.offers.filter(status__in=[ShiftOffer.Status.ACCEPTED,
                                                           ShiftOffer.Status.ACCEPTED_AWAITING_PAYMENT]).count(), 1)
            self.assertEqual(shift.slot_assignments.count(), 0 if payment else 1)


# ============================================================================
# B21 / B55: Worker cover request scope & unlinked concurrency contracts
# ============================================================================
from queue import Queue
from threading import Barrier, Thread
from unittest import skipUnless
from django.db import close_old_connections, connection
from django.test import TransactionTestCase
from shifts.models import WorkerShiftRequest
from users.models import User

WORKER_REQUEST_URL = API + "worker-shift-requests/"


class CoverRequestScopeTests(TestCase):
    def setUp(self):
        self.owner_a, self.pharmacy_a = make_owner_with_pharmacy("Cover A")
        self.owner_b, self.pharmacy_b = make_owner_with_pharmacy("Cover B")
        self.worker, _ = make_staff_member(self.pharmacy_b, role="ASSISTANT")
        self.day = timezone.localdate() + timedelta(days=14)
        from client_profile.characterization_support import make_assignment
        _, _, self.assignment = make_assignment(self.pharmacy_b, self.owner_b, self.worker, day=self.day)

    def payload(self, pharmacy, assignment):
        return {"pharmacy": pharmacy.pk, "shift": assignment.pk, "role": "ASSISTANT",
                "slot_date": self.day.isoformat(), "start_time": "09:00", "end_time": "17:00"}

    def test_request_cannot_point_at_an_assignment_in_another_pharmacy(self):
        with mock.patch("shifts.worker_requests.async_task"):
            res = client_for(self.worker).post(WORKER_REQUEST_URL, self.payload(self.pharmacy_a, self.assignment), format="json")
        self.assertEqual(res.status_code, 400, res.data)
        self.assertFalse(WorkerShiftRequest.objects.exists())

    def test_request_cannot_point_at_someone_elses_assignment(self):
        other, _ = make_staff_member(self.pharmacy_b, role="ASSISTANT")
        with mock.patch("shifts.worker_requests.async_task"):
            res = client_for(other).post(WORKER_REQUEST_URL, self.payload(self.pharmacy_b, self.assignment), format="json")
        self.assertEqual(res.status_code, 400, res.data)
        self.assertFalse(WorkerShiftRequest.objects.exists())

    def test_foreign_manager_cannot_release_the_assignment(self):
        req = WorkerShiftRequest.objects.create(
            pharmacy=self.pharmacy_a, requested_by=self.worker, shift=self.assignment, role="ASSISTANT",
            slot_date=self.day, start_time=time(9), end_time=time(17))
        with mock.patch("shifts.worker_requests.async_task"):
            res = client_for(self.owner_a).post(f"{WORKER_REQUEST_URL}{req.pk}/approve/")
        self.assertEqual(res.status_code, 400, res.data)
        self.assertTrue(ShiftSlotAssignment.objects.filter(pk=self.assignment.pk).exists())

    def test_own_assignment_request_is_accepted(self):
        with mock.patch("shifts.worker_requests.async_task"):
            res = client_for(self.worker).post(WORKER_REQUEST_URL, self.payload(self.pharmacy_b, self.assignment), format="json")
        self.assertEqual(res.status_code, 201, res.data)
        self.assertEqual(WorkerShiftRequest.objects.get().shift_id, self.assignment.pk)


class UnlinkedCoverFixture:
    def setUp(self):
        self.owner, self.pharmacy = make_owner_with_pharmacy("Unlinked Cover")
        self.worker, _ = make_staff_member(self.pharmacy, role="ASSISTANT")
        self.req = WorkerShiftRequest.objects.create(
            pharmacy=self.pharmacy, requested_by=self.worker, role="ASSISTANT",
            slot_date=timezone.localdate() + timedelta(days=7), start_time=time(9), end_time=time(17))


class UnlinkedCoverApprovalTests(UnlinkedCoverFixture, TestCase):
    def test_single_approval_publishes_one_vacancy_and_replay_is_refused(self):
        with mock.patch("shifts.worker_requests.async_task") as task:
            first = client_for(self.owner).post(f"{WORKER_REQUEST_URL}{self.req.pk}/approve/")
            replay = client_for(self.owner).post(f"{WORKER_REQUEST_URL}{self.req.pk}/approve/")
        self.assertEqual(first.status_code, 200, first.data)
        self.assertEqual(replay.status_code, 400, replay.data)
        self.assertEqual(Shift.objects.filter(pharmacy=self.pharmacy).count(), 1)
        self.assertEqual(task.call_count, 1)


@skipUnless(connection.vendor == "postgresql", "Requires independent PostgreSQL transactions and row locks.")
class UnlinkedCoverApprovalPostgresTests(UnlinkedCoverFixture, TransactionTestCase):
    def test_concurrent_approvals_publish_one_vacancy(self):
        barrier = Barrier(2)
        results = Queue()

        def approve():
            close_old_connections()
            try:
                manager = User.objects.get(pk=self.owner.pk)
                with mock.patch("shifts.worker_requests.async_task"), mock.patch(
                    "shifts.worker_requests.WorkerShiftRequestViewSet._assert_decider_permissions",
                    side_effect=lambda req: barrier.wait(timeout=10),
                ):
                    res = client_for(manager).post(f"{WORKER_REQUEST_URL}{self.req.pk}/approve/")
                results.put(res.status_code)
            except Exception as exc:
                results.put(repr(exc))
            finally:
                connection.close()

        threads = [Thread(target=approve, daemon=True) for _ in range(2)]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join(timeout=30)
        outcomes = sorted(str(results.get(timeout=2)) for _ in threads)
        self.assertEqual(outcomes, ["200", "400"])
        self.assertEqual(Shift.objects.filter(pharmacy=self.pharmacy).count(), 1)
        self.req.refresh_from_db()
        self.assertEqual(self.req.status, "AUTO_PUBLISHED")
