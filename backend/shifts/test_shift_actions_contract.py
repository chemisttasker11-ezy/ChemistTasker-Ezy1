"""What the shift actions do: interest, profile reveal, offers, counter offers, rejection, sharing, manual
assignment, escalation and member status.

The tests drive the real endpoints and assert the response, the rows written, the in-app notifications and the
e-mails queued. E-mails are captured at Celery's send_task, so the assertions hold wherever the code that queues them
lives.
"""
from contextlib import contextmanager
from datetime import date, time, timedelta
from decimal import Decimal
from unittest import mock

from django.test import TestCase
from django.utils import timezone

from client_profile.characterization_support import client_for, make_owner_with_pharmacy, make_user
from memberships.models import Membership
from notifications.models import Notification
from onboarding.models import PharmacistOnboarding
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

API = "/api/client-profile/"
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

    with mock.patch("celery.app.base.Celery.send_task", side_effect=record):
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
            403, "Your onboarding must be verified by admin before applying for public shifts."))
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
        self.assertEqual(
            set(response.data),
            {"id", "first_name", "last_name", "email", "phone_number", "short_bio", "resume", "rate_preference"},
        )
        self.assertEqual((response.data["id"], response.data["short_bio"], response.data["phone_number"]),
                         (worker.id, "Bio", "0411111111"))
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

        response, sent = self.post(self.owner, f"shifts/{shift.id}/accept_user/", {"user_id": worker.id})
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

        response, sent = self.post(self.owner, f"shifts/{shift.id}/counter-offers/{counter.id}/accept/")
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
    def test_current_behaviour_a_json_slot_date_crashes_the_roster_guard(self):
        # CURRENT BEHAVIOUR: the slot_date arrives as a string and is stored unparsed; the published-roster guard on
        # ShiftSlotAssignment.save() calls .weekday() on it, so every manual assignment ends in a server error.
        staff = self.worker("FULL_TIME")
        shift = self.shift(single_user_only=False, slots=1)
        slot = shift.slots.get()
        payload = {"user_id": staff.id, "assignments": [{"slot_id": slot.id, "slot_date": str(slot.date)}]}
        with self.assertRaisesMessage(AttributeError, "'str' object has no attribute 'weekday'"):
            self.post(self.owner, f"shifts/{shift.id}/manual-assign/", payload)
        self.assertFalse(ShiftSlotAssignment.objects.exists())

    def _test_direct_staff_are_rostered_and_notified(self):  # enabled by the slot_date fix
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
            "awaiting_payment_counter_offer",
        })
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
