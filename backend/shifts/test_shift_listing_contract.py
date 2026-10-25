"""Who sees which shift on every shift listing endpoint, and the assigned-profile view.

One fixture of shifts in different states (open, confirmed, past, public, anonymous, dedicated, salaried) and users in
different relationships to the pharmacy. Each listing endpoint is called as each user and the visible shifts are
compared to the expected matrix. The matrix was recorded from the code before the browse module was split, so it pins
the visibility rules exactly while the views move.
"""
from datetime import date, time, timedelta
from unittest import mock

from django.test import TestCase, override_settings

from client_profile.characterization_support import client_for, make_owner_with_pharmacy, make_user
from memberships.models import Membership
from onboarding.models import PharmacistOnboarding, OtherStaffOnboarding
from organizations.models import PharmacyAdmin
from shifts.models import Shift, ShiftProfileAccessAudit, ShiftSlot, ShiftSlotAssignment

API = "/api/v1/"
SOON = date.today() + timedelta(days=7)
PAST = date.today() - timedelta(days=7)


class ShiftVisibilitySafetyTests(TestCase):
    def setUp(self):
        self.owner, self.pharmacy = make_owner_with_pharmacy('Visibility safety')
        self.worker = make_user('PHARMACIST')
        PharmacistOnboarding.objects.create(user=self.worker, verified=True)
        self.shift = Shift.objects.create(pharmacy=self.pharmacy, created_by=self.owner, role_needed='PHARMACIST',
                                          employment_type='LOCUM', visibility='PLATFORM', single_user_only=False)
        self.slot = ShiftSlot.objects.create(shift=self.shift, date=SOON, start_time=time(9), end_time=time(17))

    def rows(self, user, endpoint):
        response = client_for(user).get(f'{API}{endpoint}')
        self.assertEqual(response.status_code, 200, response.data)
        return response.data.get('results', []) if isinstance(response.data, dict) else response.data

    def test_f01_n1_only_manager_and_the_worker_see_booking_identities(self):
        from shifts.models import ShiftOffer
        booked = make_user('PHARMACIST')
        pending = make_user('PHARMACIST')
        ShiftSlotAssignment.objects.create(shift=self.shift, slot=self.slot, slot_date=SOON, user=booked)
        ShiftOffer.objects.create(shift=self.shift, slot=self.slot, user=pending,
                                  status=ShiftOffer.Status.ACCEPTED_AWAITING_PAYMENT)
        for viewer, assigned, awaiting in [(self.worker, [], []), (booked, [booked.id], []),
                                           (pending, [], [pending.id]), (self.owner, [booked.id], [pending.id])]:
            response = client_for(viewer).get(f'{API}shifts/{self.shift.id}/')
            self.assertEqual(response.status_code, 200, response.data)
            self.assertEqual([row['user_id'] for row in response.data['slot_assignments']], assigned)
            self.assertEqual([row['candidate_user_id'] for row in response.data['payment_options']], awaiting)

    def test_c021_n6_public_detail_hides_internal_documents_from_browsers(self):
        self.pharmacy.sops = 'private/sop.pdf'
        self.pharmacy.induction_guides = 'private/induction.pdf'
        self.pharmacy.save(update_fields=['sops', 'induction_guides'])
        for viewer, visible in [(self.worker, False), (self.owner, True)]:
            response = client_for(viewer).get(f'{API}shifts/{self.shift.id}/')
            self.assertEqual(response.status_code, 200, response.data)
            detail = response.data['pharmacy_detail']
            if visible:
                self.assertIn('private/sop.pdf', detail['sops'])
            else:
                self.assertFalse({'sops', 'induction_guides', 'qld_sump_docs', 'methadone_s8_protocols'} & detail.keys())

    def test_b41_pending_and_rejected_members_cannot_browse_private_shifts(self):
        self.shift.visibility = 'FULL_PART_TIME'
        self.shift.save(update_fields=['visibility'])
        membership = Membership.objects.create(user=self.worker, pharmacy=self.pharmacy, role='PHARMACIST',
                                               employment_type='FULL_TIME', is_active=True)
        for state in (Membership.Status.PENDING, Membership.Status.REJECTED, Membership.Status.ACCEPTED):
            membership.status = state
            membership.save(update_fields=['status'])
            response = client_for(self.worker).get(f'{API}shifts/{self.shift.id}/')
            self.assertEqual(response.status_code, 200 if state == Membership.Status.ACCEPTED else 404)
            rows = self.rows(self.worker, 'community-shifts/')
            self.assertEqual([row['id'] for row in rows], [self.shift.id] if state == Membership.Status.ACCEPTED else [])

    def test_b65_pricing_preview_requires_pharmacy_management(self):
        for user, expected in ((self.worker, 403), (self.owner, 200)):
            response = client_for(user).post(f'{API}shifts/calculate-rates/',
                                             {'pharmacyId': self.pharmacy.id, 'role': 'PHARMACIST', 'slots': []}, format='json')
            self.assertEqual(response.status_code, expected, response.data)

    def test_c020_n3_recurring_vacancy_remains_on_all_boards_after_start_date(self):
        self.slot.date = PAST - timedelta(days=7)
        self.slot.is_recurring = True
        self.slot.recurring_days = list(range(7))
        self.slot.recurring_end_date = SOON
        self.slot.save()
        Membership.objects.create(user=self.worker, pharmacy=self.pharmacy, role='PHARMACIST',
                                  employment_type='FULL_TIME', status=Membership.Status.ACCEPTED, is_active=True)
        for endpoint in ('community-shifts/', 'public-shifts/', 'public-job-board/'):
            self.assertIn(self.shift.id, [row['id'] for row in self.rows(self.worker, endpoint)])
            dated = f'{endpoint}?start_date={SOON - timedelta(days=1)}&end_date={SOON}'
            self.assertIn(self.shift.id, [row['id'] for row in self.rows(self.worker, dated)])
        self.slot.recurring_end_date = PAST
        self.slot.save(update_fields=['recurring_end_date'])
        for endpoint in ('community-shifts/', 'public-shifts/', 'public-job-board/'):
            self.assertNotIn(self.shift.id, [row['id'] for row in self.rows(self.worker, endpoint)])

    def test_c021_n5_boards_and_lifecycle_use_each_pharmacy_clock(self):
        from datetime import datetime, timezone as dt_timezone
        stamp = datetime(2026, 10, 26, 9, 0, tzinfo=dt_timezone.utc)
        self.pharmacy.timezone = 'Australia/Sydney'
        self.pharmacy.save(update_fields=['timezone'])
        self.slot.date = stamp.date()
        self.slot.save(update_fields=['date'])
        with mock.patch('django.utils.timezone.now', return_value=stamp):
            for endpoint in ('public-shifts/', 'public-job-board/', 'shifts/active/'):
                viewer = self.owner if endpoint == 'shifts/active/' else self.worker
                self.assertNotIn(self.shift.id, [row['id'] for row in self.rows(viewer, endpoint)])
            assignment = ShiftSlotAssignment.objects.create(shift=self.shift, slot=self.slot,
                                                             slot_date=self.slot.date, user=self.worker)
            for endpoint, viewer in (('shifts/confirmed/', self.owner), ('my-confirmed-shifts/', self.worker)):
                self.assertNotIn(self.shift.id, [row['id'] for row in self.rows(viewer, endpoint)])
            assignment.delete()
            self.pharmacy.timezone = 'Australia/Perth'
            self.pharmacy.save(update_fields=['timezone'])
            self.slot.end_time = time(18)
            self.slot.save(update_fields=['end_time'])
            for endpoint in ('public-shifts/', 'public-job-board/', 'shifts/active/'):
                viewer = self.owner if endpoint == 'shifts/active/' else self.worker
                self.assertIn(self.shift.id, [row['id'] for row in self.rows(viewer, endpoint)])

ENDPOINTS = [
    "community-shifts/",
    "public-shifts/",
    "shifts/active/",
    "shifts/confirmed/",
    "shifts/history/",
    "shifts/",
    "my-confirmed-shifts/",
    "my-history-shifts/",
    "public-job-board/",
]

EXPECTED = {
    "community-shifts/": {
        "owner": [],
        "roster_admin": [],
        "comms_admin": [],
        "staff": ["confirmed", "ft_salaried", "member_only", "open_locum", "public"],
        "locum": ["dedicated", "open_locum", "public"],
        "outsider": [],
        "anonymous": None,
    },
    "public-shifts/": {
        "owner": ["anonymous_public", "public"],
        "roster_admin": ["anonymous_public", "public"],
        "comms_admin": ["anonymous_public", "public"],
        "staff": ["anonymous_public", "public"],
        "locum": ["anonymous_public", "public"],
        "outsider": ["anonymous_public", "public"],
        "anonymous": None,
    },
    "shifts/active/": {
        "owner": ["anonymous_public", "dedicated", "ft_salaried", "member_only", "open_locum", "public"],
        "roster_admin": ["anonymous_public", "dedicated", "ft_salaried", "member_only", "open_locum", "public"],
        "comms_admin": [],
        "staff": [],
        "locum": [],
        "outsider": [],
        "anonymous": None,
    },
    "shifts/confirmed/": {
        "owner": ["confirmed"],
        "roster_admin": ["confirmed"],
        "comms_admin": [],
        "staff": [],
        "locum": [],
        "outsider": [],
        "anonymous": None,
    },
    "shifts/history/": {
        "owner": ["confirmed", "past"],
        "roster_admin": ["confirmed", "past"],
        "comms_admin": [],
        "staff": [],
        "locum": [],
        "outsider": [],
        "anonymous": None,
    },
    "shifts/": {
        "owner": ["anonymous_public", "confirmed", "dedicated", "ft_salaried", "member_only", "open_locum", "past", "public"],
        "roster_admin": ["anonymous_public", "confirmed", "dedicated", "ft_salaried", "member_only", "open_locum", "past", "public"],
        "comms_admin": ["anonymous_public", "public"],
        "staff": ["anonymous_public", "confirmed", "ft_salaried", "member_only", "open_locum", "past", "public"],
        "locum": ["anonymous_public", "dedicated", "open_locum", "public"],
        "outsider": ["anonymous_public", "public"],
        "anonymous": None,
    },
    "my-confirmed-shifts/": {
        "owner": None,
        "roster_admin": None,
        "comms_admin": None,
        "staff": ["confirmed"],
        "locum": [],
        "outsider": [],
        "anonymous": None,
    },
    "my-history-shifts/": {
        "owner": None,
        "roster_admin": None,
        "comms_admin": None,
        "staff": ["confirmed", "past"],
        "locum": [],
        "outsider": [],
        "anonymous": None,
    },
    "public-job-board/": {
        "owner": ["anonymous_public", "public"],
        "roster_admin": ["anonymous_public", "public"],
        "comms_admin": ["anonymous_public", "public"],
        "staff": ["anonymous_public", "public"],
        "locum": ["anonymous_public", "public"],
        "outsider": ["anonymous_public", "public"],
        "anonymous": ["anonymous_public", "public"],
    },
}


class ShiftListingFixture(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.owner, cls.pharmacy = make_owner_with_pharmacy("Listing Pharmacy")
        cls.users = {"owner": cls.owner, "anonymous": None}
        cls.users["roster_admin"] = make_user("OWNER")
        PharmacyAdmin.objects.create(user=cls.users["roster_admin"], pharmacy=cls.pharmacy,
                                     admin_level=PharmacyAdmin.AdminLevel.ROSTER_MANAGER, is_active=True)
        cls.users["comms_admin"] = make_user("OWNER")
        PharmacyAdmin.objects.create(user=cls.users["comms_admin"], pharmacy=cls.pharmacy,
                                     admin_level=PharmacyAdmin.AdminLevel.COMMUNICATION_MANAGER, is_active=True)
        for label, employment in (("staff", "FULL_TIME"), ("locum", "LOCUM")):
            user = make_user("PHARMACIST")
            PharmacistOnboarding.objects.create(user=user, verified=True)
            Membership.objects.create(user=user, pharmacy=cls.pharmacy, role="PHARMACIST", employment_type=employment,
                                      status=Membership.Status.ACCEPTED, is_active=True)
            cls.users[label] = user
        cls.users["outsider"] = make_user("PHARMACIST")
        PharmacistOnboarding.objects.create(user=cls.users["outsider"], verified=True)

        def shift(label, *, visibility="LOCUM_CASUAL", day=SOON, employment_type="LOCUM", slots=True, **extra):
            created = Shift.objects.create(
                pharmacy=cls.pharmacy, created_by=cls.owner, role_needed="PHARMACIST", employment_type=employment_type,
                visibility=visibility, description=label, **extra,
            )
            if slots:
                ShiftSlot.objects.create(shift=created, date=day, start_time=time(9, 0), end_time=time(17, 0))
            return created

        cls.shifts = {
            "open_locum": shift("open_locum"),
            "member_only": shift("member_only", visibility="FULL_PART_TIME"),
            "confirmed": shift("confirmed", visibility="FULL_PART_TIME"),
            "past": shift("past", visibility="FULL_PART_TIME", day=PAST),
            "public": shift("public", visibility="PLATFORM"),
            "anonymous_public": shift("anonymous_public", visibility="PLATFORM", post_anonymously=True),
            "dedicated": shift("dedicated", dedicated_user=cls.users["locum"]),
            "ft_salaried": shift("ft_salaried", visibility="FULL_PART_TIME", employment_type="FULL_TIME", slots=False,
                                 min_hourly_rate=40, max_hourly_rate=50),
        }
        for label in ("confirmed", "past"):
            target = cls.shifts[label]
            slot = target.slots.get()
            ShiftSlotAssignment.objects.create(shift=target, slot=slot, slot_date=slot.date, user=cls.users["staff"])
        cls.labels = {shift.id: label for label, shift in cls.shifts.items()}

    def visible(self, endpoint, user):
        with override_settings(CELERY_TASK_ALWAYS_EAGER=False), mock.patch("celery.app.base.Celery.send_task"):
            response = client_for(user).get(f"{API}{endpoint}")
        if response.status_code != 200:
            return None
        rows = response.data["results"] if isinstance(response.data, dict) else response.data
        return sorted(self.labels.get(row["id"], f"unknown:{row['id']}") for row in rows)


class ShiftListingMatrixTests(ShiftListingFixture):
    def test_every_endpoint_and_user(self):
        actual = {
            endpoint: {name: self.visible(endpoint, user) for name, user in self.users.items()}
            for endpoint in ENDPOINTS
        }
        for endpoint in ENDPOINTS:
            with self.subTest(endpoint=endpoint):
                self.assertEqual(actual[endpoint], EXPECTED[endpoint])

    def test_rate_preview_invalid_date_uses_stable_public_error(self):
        response = client_for(self.owner).post(
            f"{API}shifts/calculate-rates/",
            {
                "pharmacy_id": self.pharmacy.id,
                "role": "PHARMACIST",
                "slots": [{
                    "date": "definitely-not-a-date",
                    "start_time": "09:00",
                    "end_time": "17:00",
                }],
            },
            format="json",
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(
            response.data,
            [{"error": "Invalid date format, use YYYY-MM-DD", "rate": "0.00"}],
        )
        self.assertNotIn("time data", str(response.data))

    def test_shared_shift_link(self):
        public = self.shifts["public"]
        response = client_for(None).get(f"{API}view-shared-shift/?token={public.share_token}")
        self.assertEqual((response.status_code, response.data["id"]), (200, public.id))
        unknown = client_for(None).get(f"{API}view-shared-shift/?token=00000000-0000-0000-0000-000000000000")
        self.assertEqual(unknown.status_code, 404)
        no_token = client_for(None).get(f"{API}view-shared-shift/?id={public.id}")
        self.assertEqual(no_token.status_code, 400)


class AssignedProfileTests(ShiftListingFixture):
    def test_confirmed_and_history_assigned_profile_is_audited(self):
        staff = self.users["staff"]
        for endpoint, label in (("shifts/confirmed/", "confirmed"), ("shifts/history/", "past")):
            with self.subTest(endpoint=endpoint):
                shift = self.shifts[label]
                response = client_for(self.owner).post(f"{API}{endpoint}{shift.id}/view_assigned_profile/",
                                                       {"user_id": staff.id}, format="json")
                self.assertEqual(response.status_code, 200, response.data)
                # Both show the work profile; contact details and the CV only for upcoming booked work (owner
                # decision 2026-10-14), not in History.
                self.assertTrue({"id", "first_name", "last_name", "short_bio", "rate_preference", "skills",
                                 "profile_photo", "verification"} <= set(response.data))
                contact = {"email", "phone_number", "resume"}
                if label == "confirmed":
                    self.assertTrue(contact <= set(response.data))
                else:
                    self.assertFalse(contact & set(response.data))
                self.assertEqual(response.data["id"], staff.id)
                self.assertTrue(ShiftProfileAccessAudit.objects.filter(
                    shift=shift, target_user=staff, action=ShiftProfileAccessAudit.Action.VIEW_ASSIGNED_PROFILE,
                ).exists())

    def test_history_list_does_not_disclose_assigned_worker_email(self):
        # Detail redaction is insufficient if the list serializer still exposes contacts.
        staff = self.users['staff']
        for endpoint, label, should_expose in (
            ('shifts/confirmed/', 'confirmed', True),
            ('shifts/history/', 'past', False),
        ):
            with self.subTest(endpoint=endpoint):
                response = client_for(self.owner).get(f'{API}{endpoint}')
                self.assertEqual(response.status_code, 200, response.data)
                rows = response.data.get('results', response.data) if isinstance(response.data, dict) else response.data
                shift = next(row for row in rows if row['id'] == self.shifts[label].id)
                assignments = shift['slot_assignments']
                self.assertTrue(assignments)
                assigned = next(row['user'] for row in assignments if row['user_id'] == staff.id)
                self.assertEqual('email' in assigned, should_expose)
                self.assertNotIn(staff.email, str(shift) if not should_expose else '')

    def test_booked_profile_contact_and_cv_follow_the_current_worker_role(self):
        staff = self.users['staff']
        old = PharmacistOnboarding.objects.get(user=staff)
        old.short_bio = 'Historical pharmacist biography'
        old.resume = 'profiles/historical-pharmacist.pdf'
        old.save()
        staff.role = 'OTHER_STAFF'
        staff.save(update_fields=['role'])
        OtherStaffOnboarding.objects.create(user=staff, role_type='STUDENT',
            short_bio='Current student biography', resume='profiles/current-student.pdf',
            skills=['PRESCRIPTION_DISPENSING', 'CORUM_LOTS'])
        shift = self.shifts['confirmed']
        response = client_for(self.owner).post(
            f'{API}shifts/confirmed/{shift.id}/view_assigned_profile/',
            {'user_id': staff.id}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['role_label'], 'Pharmacy Student')
        self.assertEqual(response.data['short_bio'], 'Current student biography')
        from urllib.parse import urlsplit
        self.assertTrue(urlsplit(response.data['resume']).path.endswith('/profiles/current-student.pdf'))
        self.assertEqual(response.data['email'], staff.email)
        self.assertNotIn('Historical pharmacist', str(response.data))

    def test_assigned_profile_refusals(self):
        shift = self.shifts["confirmed"]
        url = f"{API}shifts/confirmed/{shift.id}/view_assigned_profile/"
        missing = client_for(self.owner).post(url, {}, format="json")
        self.assertEqual((missing.status_code, missing.data["detail"]), (400, "user_id is required."))
        stranger = client_for(self.owner).post(url, {"user_id": self.users["locum"].id}, format="json")
        self.assertEqual((stranger.status_code, stranger.data["detail"]), (404, "User is not assigned to any slot in this shift."))
        slot = shift.slots.get()
        wrong_slot = client_for(self.owner).post(url, {"user_id": self.users["locum"].id, "slot_id": slot.id},
                                                 format="json")
        self.assertEqual(wrong_slot.data["detail"], "User is not assigned to this specific slot.")
        history_url = f"{API}shifts/history/{self.shifts['past'].id}/view_assigned_profile/"
        no_onboarding = client_for(self.owner).post(history_url, {"user_id": self.users["outsider"].id}, format="json")
        self.assertEqual(no_onboarding.status_code, 404)

    def test_active_member_status_still_answers(self):
        shift = self.shifts["member_only"]
        response = client_for(self.owner).get(
            f"{API}shifts/active/{shift.id}/member_status/?slot_id={shift.slots.get().id}"
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual({row["user_id"] for row in response.data}, {self.users["staff"].id})
