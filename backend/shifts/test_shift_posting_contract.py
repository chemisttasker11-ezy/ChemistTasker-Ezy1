"""What posting and editing a shift does beyond saving it.

Posting a shift picks its escalation level, fills payment and rate defaults, creates the slots, offers a dedicated
shift to its worker, can copy the posted rates to the pharmacy's defaults, and after commit e-mails the pharmacy's
staff / favourites / chain members (as the owner chose and the visibility allows) and, for platform shifts, the
workers whose availability matches. Editing recalculates the escalation level, replaces the slots and announces the
update. The tests drive the real endpoints and capture queued e-mails at Celery's send_task.
"""
from contextlib import contextmanager
from datetime import date, time, timedelta
from decimal import Decimal
from unittest import mock

from django.test import TestCase, override_settings

from client_profile.characterization_support import client_for, make_owner_with_pharmacy, make_user
from memberships.models import Membership
from notifications.models import Notification
from onboarding.models import OtherStaffOnboarding, PharmacistOnboarding
from organizations.models import Chain
from shifts.models import Shift, ShiftInterest, ShiftOffer, ShiftSlot
from talent.models import UserAvailability

API = "/api/v1/"
DAY = date.today() + timedelta(days=14)


@contextmanager
def queued_emails():
    sent = []

    def record(name, args=None, kwargs=None, **options):
        kwargs = kwargs or {}
        sent.append({
            "template": kwargs.get("template_name"),
            "to": tuple(kwargs.get("recipient_list") or []),
            "subject": kwargs.get("subject"),
        })

    with override_settings(CELERY_TASK_ALWAYS_EAGER=False), mock.patch("celery.app.base.Celery.send_task", side_effect=record):
        yield sent


class ShiftPostingFixture(TestCase):
    def setUp(self):
        self.owner, self.pharmacy = make_owner_with_pharmacy("Posting Pharmacy")
        self.pharmacy.state = "NSW"
        self.pharmacy.suburb = "Parramatta"
        self.pharmacy.save(update_fields=["state", "suburb"])

    def member(self, employment_type, *, role="PHARMACIST", user_role="PHARMACIST", pharmacy=None, is_active=True):
        user = make_user(user_role)
        Membership.objects.create(
            user=user, pharmacy=pharmacy or self.pharmacy, role=role, employment_type=employment_type,
            status=Membership.Status.ACCEPTED, is_active=is_active,
        )
        return user

    def payload(self, **overrides):
        data = {
            "pharmacy": self.pharmacy.id,
            "role_needed": "PHARMACIST",
            "employment_type": "LOCUM",
            "visibility": "LOCUM_CASUAL",
            "rate_type": "FLEXIBLE",
            "single_user_only": False,
            "description": "Cover",
            "slots": [
                {"date": str(DAY), "start_time": "09:00", "end_time": "17:00", "rate": "70"},
                {"date": str(DAY + timedelta(days=1)), "start_time": "10:00", "end_time": "18:00"},
            ],
        }
        data.update(overrides)
        return data

    def post_shift(self, user=None, **overrides):
        with queued_emails() as sent, self.captureOnCommitCallbacks(execute=True):
            response = client_for(user or self.owner).post(f"{API}shifts/", self.payload(**overrides), format="json")
        return response, sent


class PostedShiftAnnouncementTests(ShiftPostingFixture):
    def test_platform_chain_flag_cannot_notify_an_unrelated_chain(self):
        _, sibling = make_owner_with_pharmacy('Elsewhere')
        sibling.owner = self.pharmacy.owner
        sibling.save(update_fields=['owner'])
        chain = Chain.objects.create(owner=self.pharmacy.owner, name='Other pharmacy chain', is_active=True)
        chain.pharmacies.add(sibling)  # The posting pharmacy is not in it.
        self.member('FULL_TIME')
        self.member('LOCUM', pharmacy=sibling)
        response, sent = self.post_shift(visibility='PLATFORM', notify_chain_members=True)
        self.assertEqual(response.status_code, 201, response.data)
        self.assertNotIn('OWNER_CHAIN', response.data['allowed_escalation_levels'])
        self.assertFalse(response.data['pharmacy_detail']['has_chain'])
        self.assertEqual([e for e in sent if e['template'] == 'emails/shift_posted.html'], [])
        self.assertFalse(Notification.objects.filter(title='New shift available').exists())

    def test_inactive_chain_is_unavailable_for_metadata_escalation_and_outreach(self):
        chain = Chain.objects.create(owner=self.pharmacy.owner, name='Inactive chain', is_active=False)
        chain.pharmacies.add(self.pharmacy)
        self.member('FULL_TIME')
        response, sent = self.post_shift(visibility='PLATFORM', notify_chain_members=True)
        self.assertEqual(response.status_code, 201, response.data)
        self.assertNotIn('OWNER_CHAIN', response.data['allowed_escalation_levels'])
        self.assertFalse(response.data['pharmacy_detail']['has_chain'])
        self.assertEqual([e for e in sent if e['template'] == 'emails/shift_posted.html'], [])

    def test_staff_and_favourites_are_emailed_when_the_owner_asks(self):
        staff = self.member("FULL_TIME")
        locum = self.member("LOCUM")
        self.member("PART_TIME", is_active=False)
        self.member("FULL_TIME", role="ASSISTANT", user_role="OTHER_STAFF")
        response, sent = self.post_shift(notify_pharmacy_staff=True, notify_favorite_staff=True)

        self.assertEqual(response.status_code, 201, response.data)
        shift = Shift.objects.get(pk=response.data["id"])
        self.assertEqual((shift.escalation_level, shift.payment_preference, shift.created_by_id),
                         (1, "ABN", self.owner.id))
        slots = list(shift.slots.order_by("date"))
        self.assertEqual([(s.date, s.rate) for s in slots], [(DAY, Decimal("70.00")), (DAY + timedelta(days=1), None)])
        posted = sorted(e["to"] for e in sent if e["template"] == "emails/shift_posted.html")
        self.assertEqual(posted, sorted([(staff.email,), (locum.email,)]))
        self.assertEqual({e["subject"] for e in sent if e["template"] == "emails/shift_posted.html"},
                         {"New Pharmacist shift at Posting Pharmacy"})
        # each posted e-mail carries its own in-app notification, dispatched after commit
        self.assertEqual(Notification.objects.filter(user=staff, title="New shift available").count(), 1)

    def test_nobody_is_emailed_unless_asked(self):
        self.member("FULL_TIME")
        response, sent = self.post_shift()
        self.assertEqual(response.status_code, 201)
        self.assertEqual([e for e in sent if e["template"] == "emails/shift_posted.html"], [])

    def test_other_staff_member_announcements_follow_specific_role_policy(self):
        workers = {}
        for role_type in ("INTERN", "TECHNICIAN", "ASSISTANT", "STUDENT"):
            worker = make_user("OTHER_STAFF")
            OtherStaffOnboarding.objects.create(user=worker, role_type=role_type)
            Membership.objects.create(
                user=worker,
                pharmacy=self.pharmacy,
                role=role_type,
                employment_type="FULL_TIME",
                status=Membership.Status.ACCEPTED,
                is_active=True,
            )
            workers[role_type] = worker

        cases = {
            "INTERN": {workers["INTERN"].email},
            "TECHNICIAN": {workers[role].email for role in ('TECHNICIAN', 'INTERN', 'STUDENT')},
            "STUDENT": {workers["STUDENT"].email},
            "ASSISTANT": {worker.email for worker in workers.values()},
        }
        for role_needed, expected in cases.items():
            with self.subTest(role_needed=role_needed):
                response, sent = self.post_shift(
                    role_needed=role_needed,
                    employment_type="FULL_TIME",
                    visibility="FULL_PART_TIME",
                    min_hourly_rate="30.00",
                    max_hourly_rate="35.00",
                    notify_pharmacy_staff=True,
                )
                self.assertEqual(response.status_code, 201, response.data)
                recipients = {
                    item["to"][0]
                    for item in sent
                    if item["template"] == "emails/shift_posted.html"
                }
                self.assertEqual(recipients, expected)

    def test_visibility_and_anonymity_limit_who_is_emailed(self):
        staff = self.member("FULL_TIME")
        locum = self.member("LOCUM")
        cases = {
            # (visibility, anonymous, flags): recipients
            ("FULL_PART_TIME", False, ("notify_pharmacy_staff", "notify_favorite_staff")): {staff.email},
            ("LOCUM_CASUAL", True, ("notify_pharmacy_staff", "notify_favorite_staff")): {locum.email},
            ("FULL_PART_TIME", False, ("notify_favorite_staff",)): set(),
        }
        for (visibility, anonymous, flags), expected in cases.items():
            with self.subTest(visibility=visibility, anonymous=anonymous, flags=flags):
                response, sent = self.post_shift(
                    visibility=visibility, post_anonymously=anonymous, **{flag: True for flag in flags},
                )
                self.assertEqual(response.status_code, 201, response.data)
                self.assertEqual({e["to"][0] for e in sent if e["template"] == "emails/shift_posted.html"}, expected)

    def test_chain_members_across_the_chain_are_emailed(self):
        # Regression: the chain query used to yield only the shift's own pharmacy, so members of the other chain
        # pharmacies were never e-mailed.
        _, sibling = make_owner_with_pharmacy("Sibling")
        sibling.owner = self.pharmacy.owner
        sibling.save(update_fields=["owner"])
        _, outsider = make_owner_with_pharmacy("Outsider")
        chain = Chain.objects.create(owner=self.pharmacy.owner, name="Chain", is_active=True)
        chain.pharmacies.set([self.pharmacy, sibling])
        sibling_locum = self.member("LOCUM", pharmacy=sibling)
        sibling_staff = self.member("CASUAL", pharmacy=sibling)
        own_staff = self.member("FULL_TIME")
        self.member("LOCUM", pharmacy=outsider)
        self.member("LOCUM", pharmacy=sibling, role="ASSISTANT", user_role="OTHER_STAFF")
        response, sent = self.post_shift(visibility="OWNER_CHAIN", notify_chain_members=True)
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual({e["to"][0] for e in sent if e["template"] == "emails/shift_posted.html"},
                         {sibling_locum.email, sibling_staff.email, own_staff.email})

        inactive = Chain.objects.create(owner=self.pharmacy.owner, name="Old", is_active=False)
        _, old_member_pharmacy = make_owner_with_pharmacy("Old member")
        inactive.pharmacies.set([self.pharmacy, old_member_pharmacy])
        old_locum = self.member("LOCUM", pharmacy=old_member_pharmacy)
        _, sent = self.post_shift(visibility="OWNER_CHAIN", notify_chain_members=True)
        self.assertNotIn(old_locum.email, {e["to"][0] for e in sent})


class AvailabilityMatchTests(ShiftPostingFixture):
    def worker_available_on(self, day, *, travel_states=("NSW",)):
        worker = make_user("PHARMACIST")
        PharmacistOnboarding.objects.create(user=worker, open_to_travel=True, travel_states=list(travel_states))
        UserAvailability.objects.create(user=worker, date=day, start_time=time(8, 0), end_time=time(12, 0),
                                        notify_new_shifts=True)
        return worker

    def other_staff_available_on(self, day, role_type, *, travel_states=("NSW",)):
        worker = make_user("OTHER_STAFF")
        OtherStaffOnboarding.objects.create(
            user=worker,
            role_type=role_type,
            open_to_travel=True,
            travel_states=list(travel_states),
        )
        UserAvailability.objects.create(
            user=worker,
            date=day,
            start_time=time(8, 0),
            end_time=time(12, 0),
            notify_new_shifts=True,
        )
        return worker

    def test_platform_shifts_email_matching_available_workers(self):
        match = self.worker_available_on(DAY)
        self.worker_available_on(DAY + timedelta(days=5))
        self.worker_available_on(DAY, travel_states=("VIC",))
        response, sent = self.post_shift(visibility="PLATFORM")
        self.assertEqual(response.status_code, 201, response.data)
        shift = Shift.objects.get(pk=response.data["id"])
        self.assertIsNotNone(shift.escalate_to_platform)
        self.assertEqual(
            [(e["to"], e["subject"]) for e in sent if e["template"] == "emails/shift_availability_match.html"],
            [((match.email,), "New Pharmacist shift that matches your availability")],
        )

    def test_member_shifts_do_not_email_available_workers(self):
        self.worker_available_on(DAY)
        _, sent = self.post_shift(visibility="LOCUM_CASUAL")
        self.assertEqual([e for e in sent if e["template"] == "emails/shift_availability_match.html"], [])

    def test_other_staff_match_notifications_follow_specific_role_policy(self):
        intern = self.other_staff_available_on(DAY, "INTERN")
        technician = self.other_staff_available_on(DAY, "TECHNICIAN")
        assistant = self.other_staff_available_on(DAY, "ASSISTANT")
        student = self.other_staff_available_on(DAY, "STUDENT")

        cases = {
            "INTERN": {intern.email},
            "TECHNICIAN": {technician.email, intern.email, student.email},
            "STUDENT": {student.email},
            "ASSISTANT": {intern.email, technician.email, assistant.email, student.email},
        }
        for role_needed, expected in cases.items():
            with self.subTest(role_needed=role_needed):
                response, sent = self.post_shift(
                    visibility="PLATFORM",
                    role_needed=role_needed,
                    employment_type="CASUAL",
                )
                self.assertEqual(response.status_code, 201, response.data)
                recipients = {
                    e["to"][0]
                    for e in sent
                    if e["template"] == "emails/shift_availability_match.html"
                }
                self.assertEqual(recipients, expected)


class PostingDefaultsTests(ShiftPostingFixture):
    def test_dedicated_booking_partial_edits_keep_privacy_without_visibility_input(self):
        worker = self.member('LOCUM')
        response, _ = self.post_shift(dedicated_user=worker.id, visibility='LOCUM_CASUAL')
        self.assertEqual(response.status_code, 201, response.data)
        shift_id = response.data['id']
        replacement = self.member('LOCUM')
        for payload in (
            {'description': 'Updated private booking'},
            {'slots': [{'date': DAY.isoformat(), 'start_time':'09:00', 'end_time':'17:00', 'rate':'80.00'}]},
            {'dedicated_user': replacement.id},
        ):
            with self.subTest(payload=list(payload)), queued_emails():
                updated = client_for(self.owner).patch(f'{API}shifts/{shift_id}/', payload, format='json')
                self.assertEqual(updated.status_code, 200, updated.data)
                shift = Shift.objects.get(pk=shift_id)
                self.assertEqual(shift.visibility, 'LOCUM_CASUAL')
                self.assertIsNone(shift.escalate_to_platform)
        unauthorized = client_for(worker).patch(f'{API}shifts/{shift_id}/', {'description':'Unauthorized'}, format='json')
        self.assertIn(unauthorized.status_code, (403,404))

    def test_direct_booking_ignores_widening_and_broadcast_controls(self):
        worker = self.member('LOCUM')
        colleague = self.member('FULL_TIME')
        response, sent = self.post_shift(
            dedicated_user=worker.id, visibility='PLATFORM', notify_pharmacy_staff=True,
            notify_favorite_staff=True, notify_chain_members=True,
            escalate_to_platform=f'{DAY.isoformat()}T09:00:00+10:00',
        )
        self.assertEqual(response.status_code, 201, response.data)
        shift = Shift.objects.get(pk=response.data['id'])
        self.assertEqual(shift.visibility, 'LOCUM_CASUAL')
        self.assertIsNone(shift.escalate_to_platform)
        self.assertEqual([e['to'] for e in sent if e['template'] == 'emails/shift_offer.html'], [(worker.email,)])
        self.assertEqual([e for e in sent if e['template'] in ('emails/shift_posted.html', 'emails/shift_availability_match.html')], [])
        self.assertFalse(Notification.objects.filter(user=colleague, title='New shift available').exists())
        community = client_for(colleague).get(f'{API}community-shifts/{shift.id}/')
        self.assertEqual(community.status_code, 404)

    def test_dedicated_shift_offers_each_slot_to_its_worker(self):
        worker = self.member("LOCUM")
        response, sent = self.post_shift(dedicated_user=worker.id)
        self.assertEqual(response.status_code, 201, response.data)
        shift = Shift.objects.get(pk=response.data["id"])
        offers = list(ShiftOffer.objects.filter(shift=shift, user=worker).order_by("offered_slot_date"))
        self.assertEqual([(o.slot.date, o.offered_rate, o.status) for o in offers], [
            (DAY, Decimal("70.00"), ShiftOffer.Status.PENDING),
            (DAY + timedelta(days=1), None, ShiftOffer.Status.PENDING),
        ])
        self.assertEqual([e["to"] for e in sent if e["template"] == "emails/shift_offer.html"], [(worker.email,)])
        self.assertEqual(Notification.objects.filter(user=worker, title="Shift offer received").count(), 1)

    def test_single_user_dedicated_shift_gets_one_shift_level_offer(self):
        worker = self.member("LOCUM")
        response, _ = self.post_shift(dedicated_user=worker.id, single_user_only=True, rate_type="FIXED",
                                      fixed_rate="80.00")
        offer = ShiftOffer.objects.get(shift_id=response.data["id"])
        self.assertEqual((offer.slot_id, offer.offered_rate), (None, Decimal("80.00")))

    def test_fixed_rate_defaults_and_rate_copy_to_pharmacy(self):
        self.pharmacy.default_fixed_rate = Decimal("65.00")
        self.pharmacy.save(update_fields=["default_fixed_rate"])
        response, _ = self.post_shift(rate_type="FIXED")
        self.assertEqual(Shift.objects.get(pk=response.data["id"]).fixed_rate, Decimal("65.00"))

        response, _ = self.post_shift(rate_type="FIXED", fixed_rate="90.00", apply_rates_to_pharmacy=True,
                                      rate_weekday="71.50", rate_sunday="99")
        self.assertEqual(response.status_code, 201, response.data)
        self.pharmacy.refresh_from_db()
        self.assertEqual(
            (self.pharmacy.default_rate_type, self.pharmacy.default_fixed_rate, self.pharmacy.rate_weekday,
             self.pharmacy.rate_saturday, self.pharmacy.rate_sunday),
            ("FIXED", Decimal("90.00"), Decimal("71.50"), None, Decimal("99.00")),
        )

    def test_full_time_shift_defaults(self):
        response, _ = self.post_shift(employment_type="FULL_TIME", visibility="FULL_PART_TIME",
                                      min_hourly_rate="40", max_hourly_rate="50", slots=[])
        self.assertEqual(response.status_code, 201, response.data)
        shift = Shift.objects.get(pk=response.data["id"])
        self.assertEqual((shift.payment_preference, shift.flexible_timing, shift.escalation_level), ("TFN", True, 0))

    def test_refusals(self):
        response, _ = self.post_shift(visibility="ORG_CHAIN")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(str(response.data["visibility"]),
                         "Invalid choice; must be one of ['FULL_PART_TIME', 'LOCUM_CASUAL', 'PLATFORM']")
        data = self.payload()
        del data["slots"]
        with queued_emails():
            missing = client_for(self.owner).post(f"{API}shifts/", data, format="json")
        self.assertEqual((missing.status_code, str(missing.data["slots"])), (400, "This field is required."))
        bad_rate, _ = self.post_shift(slots=[{"date": str(DAY), "start_time": "09:00", "end_time": "17:00",
                                              "rate": "abc"}])
        self.assertEqual((bad_rate.status_code, str(bad_rate.data["slots"][0])), (400, "Slot #1 has an invalid rate."))
        self.assertEqual(Shift.objects.count(), 0)


class ShiftEditTests(ShiftPostingFixture):
    def test_copy_partial_rates_preserves_omitted_defaults_and_allows_explicit_clear(self):
        self.pharmacy.rate_saturday = Decimal('88.00')
        self.pharmacy.rate_sunday = Decimal('99.00')
        self.pharmacy.save(update_fields=['rate_saturday', 'rate_sunday'])
        response, _ = self.post_shift(apply_rates_to_pharmacy=True, rate_weekday='71.50')
        self.assertEqual(response.status_code, 201, response.data)
        self.pharmacy.refresh_from_db()
        self.assertEqual(self.pharmacy.rate_saturday, Decimal('88.00'))
        self.assertEqual(self.pharmacy.rate_weekday, Decimal('71.50'))
        with queued_emails():
            edited = client_for(self.owner).patch(f'{API}shifts/{response.data["id"]}/',
                {'description': 'Edited', 'apply_rates_to_pharmacy': True, 'rate_saturday': None}, format='json')
        self.assertEqual(edited.status_code, 200, edited.data)
        self.pharmacy.refresh_from_db()
        self.assertIsNone(self.pharmacy.rate_saturday)
        self.assertEqual(self.pharmacy.rate_sunday, Decimal('99.00'))
        self.assertEqual(self.pharmacy.rate_weekday, Decimal('71.50'))

    def test_payment_status_only_patch_cannot_mark_shift_paid(self):
        shift = Shift.objects.create(
            pharmacy=self.pharmacy, created_by=self.owner, role_needed="PHARMACIST",
            employment_type="LOCUM", payment_status="PENDING",
        )
        response = client_for(self.owner).patch(
            f"{API}shifts/{shift.pk}/", {"payment_status": "PAID"}, format="json")
        self.assertIn(response.status_code, (200, 400), response.data)
        shift.refresh_from_db()
        self.assertEqual(shift.payment_status, "PENDING")

    def test_owner_can_edit_description_while_payment_status_is_ignored(self):
        shift = Shift.objects.create(
            pharmacy=self.pharmacy, created_by=self.owner, role_needed="PHARMACIST",
            employment_type="LOCUM", payment_status="PENDING",
        )
        with queued_emails():
            response = client_for(self.owner).patch(f"{API}shifts/{shift.pk}/", {
                "description": "Updated cover", "payment_status": "PAID",
            }, format="json")
        self.assertEqual(response.status_code, 200, response.data)
        shift.refresh_from_db()
        self.assertEqual((shift.description, shift.payment_status), ("Updated cover", "PENDING"))

    def test_move_to_managed_pharmacy_only_updates_destination_rates(self):
        _, destination = make_owner_with_pharmacy("Managed destination")
        destination.owner = self.pharmacy.owner
        destination.save(update_fields=["owner"])
        _, unrelated = make_owner_with_pharmacy("Unrelated")
        response, _ = self.post_shift()
        shift = Shift.objects.get(pk=response.data["id"])
        originals = {p.pk: (p.default_rate_type, p.default_fixed_rate, p.rate_weekday)
                     for p in (self.pharmacy, unrelated)}
        with queued_emails():
            edited = client_for(self.owner).patch(f"{API}shifts/{shift.id}/", {
                "pharmacy": destination.pk, "role_needed": "PHARMACIST", "rate_type": "FIXED",
                "fixed_rate": "90.00", "rate_weekday": "71.50", "apply_rates_to_pharmacy": True,
            }, format="json")
        self.assertEqual(edited.status_code, 200, edited.data)
        shift.refresh_from_db()
        destination.refresh_from_db()
        self.assertEqual(shift.pharmacy_id, destination.pk)
        self.assertEqual((destination.default_rate_type, destination.default_fixed_rate, destination.rate_weekday),
                         ("FIXED", Decimal("90.00"), Decimal("71.50")))
        for pharmacy in (self.pharmacy, unrelated):
            pharmacy.refresh_from_db()
            self.assertEqual((pharmacy.default_rate_type, pharmacy.default_fixed_rate, pharmacy.rate_weekday),
                             originals[pharmacy.pk])

    def test_move_to_unrelated_pharmacy_cannot_update_its_rates(self):
        _, destination = make_owner_with_pharmacy("Unrelated destination")
        original = (destination.default_rate_type, destination.default_fixed_rate, destination.rate_weekday)
        response, _ = self.post_shift()
        shift = Shift.objects.get(pk=response.data["id"])
        with queued_emails():
            refused = client_for(self.owner).patch(f"{API}shifts/{shift.id}/", {
                "pharmacy": destination.pk, "role_needed": "PHARMACIST", "rate_type": "FIXED",
                "fixed_rate": "90.00", "rate_weekday": "71.50", "apply_rates_to_pharmacy": True,
            }, format="json")
        self.assertEqual(refused.status_code, 400, refused.data)
        self.assertIn("pharmacy", refused.data)
        shift.refresh_from_db()
        destination.refresh_from_db()
        self.assertEqual(shift.pharmacy_id, self.pharmacy.pk)
        self.assertEqual((destination.default_rate_type, destination.default_fixed_rate, destination.rate_weekday), original)

    def test_edit_recalculates_escalation_replaces_slots_and_announces(self):
        response, _ = self.post_shift(visibility="FULL_PART_TIME", employment_type="LOCUM")
        shift = Shift.objects.get(pk=response.data["id"])
        interested = self.member("LOCUM")
        ShiftInterest.objects.create(shift=shift, slot=None, user=interested)

        with queued_emails() as sent, self.captureOnCommitCallbacks(execute=True):
            edited = client_for(self.owner).patch(f"{API}shifts/{shift.id}/", {
                "visibility": "PLATFORM",
                "slots": [{"date": str(DAY + timedelta(days=3)), "start_time": "07:00", "end_time": "15:00"}],
                "notify_pharmacy_staff": True,
            }, format="json")
        self.assertEqual(edited.status_code, 200, edited.data)
        shift.refresh_from_db()
        self.assertEqual((shift.visibility, shift.escalation_level), ("PLATFORM", 2))
        self.assertIsNotNone(shift.escalate_to_platform)
        self.assertIsNotNone(shift.escalate_to_locum_casual)
        self.assertEqual([(s.date, s.start_time) for s in shift.slots.all()], [(DAY + timedelta(days=3), time(7, 0))])
        # the update is announced to workers with interest, counter offers or live offers (not as a new posting)
        self.assertEqual([(e["template"], e["to"]) for e in sent], [("emails/shift_updated.html", (interested.email,))])
        self.assertEqual(Notification.objects.filter(user=interested, title="Shift updated: Posting Pharmacy").count(), 1)

    def test_an_invalid_slot_in_an_edit_changes_nothing(self):
        # Regression: the edit used to save the shift's fields before validating the new slots, so a 400 for a bad
        # slot still left the other fields changed.
        response, _ = self.post_shift()
        shift = Shift.objects.get(pk=response.data["id"])
        with queued_emails() as sent, self.captureOnCommitCallbacks(execute=True):
            refused = client_for(self.owner).patch(f"{API}shifts/{shift.id}/", {
                "description": "Changed",
                "slots": [{"date": str(DAY), "start_time": "09:00", "end_time": "17:00", "rate": "abc"}],
            }, format="json")
        self.assertEqual((refused.status_code, str(refused.data["slots"][0])), (400, "Slot #1 has an invalid rate."))
        shift.refresh_from_db()
        self.assertEqual(shift.description, "Cover")
        self.assertEqual(ShiftSlot.objects.filter(shift=shift).count(), 2)
        self.assertEqual(sent, [])

    def test_edit_without_slots_keeps_them_and_rejects_bad_visibility(self):
        response, _ = self.post_shift()
        shift = Shift.objects.get(pk=response.data["id"])
        with queued_emails(), self.captureOnCommitCallbacks(execute=True):
            edited = client_for(self.owner).patch(f"{API}shifts/{shift.id}/", {"description": "New"}, format="json")
            refused = client_for(self.owner).patch(f"{API}shifts/{shift.id}/", {"visibility": "ORG_CHAIN"},
                                                   format="json")
        self.assertEqual(edited.status_code, 200)
        self.assertEqual(ShiftSlot.objects.filter(shift=shift).count(), 2)
        self.assertEqual(refused.status_code, 400)
        shift.refresh_from_db()
        self.assertEqual((shift.description, shift.visibility), ("New", "LOCUM_CASUAL"))
