"""Who sees which shift on every shift listing endpoint, and the assigned-profile view.

One fixture of shifts in different states (open, confirmed, past, public, anonymous, dedicated, salaried) and users in
different relationships to the pharmacy. Each listing endpoint is called as each user and the visible shifts are
compared to the expected matrix. The matrix was recorded from the code before the browse module was split, so it pins
the visibility rules exactly while the views move.
"""
from datetime import date, time, timedelta
from unittest import mock

from django.test import TestCase

from client_profile.characterization_support import client_for, make_owner_with_pharmacy, make_user
from memberships.models import Membership
from onboarding.models import PharmacistOnboarding
from organizations.models import PharmacyAdmin
from shifts.models import Shift, ShiftProfileAccessAudit, ShiftSlot, ShiftSlotAssignment

API = "/api/client-profile/"
SOON = date.today() + timedelta(days=7)
PAST = date.today() - timedelta(days=7)

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
        with mock.patch("celery.app.base.Celery.send_task"):
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
                self.assertEqual(set(response.data), {"id", "first_name", "last_name", "email", "phone_number",
                                                      "short_bio", "resume", "rate_preference"})
                self.assertEqual(response.data["id"], staff.id)
                self.assertTrue(ShiftProfileAccessAudit.objects.filter(
                    shift=shift, target_user=staff, action=ShiftProfileAccessAudit.Action.VIEW_ASSIGNED_PROFILE,
                ).exists())

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
