"""The effective eligibility rule of the community claim-shift endpoint.

The community queryset owns who can see (and therefore claim) a shift: a FULL_PART_TIME shift is visible to active
full-time / part-time / casual members of its pharmacy; a LOCUM_CASUAL shift to active locum / shift-hero members and,
unless it is posted anonymously, to active staff members. Membership is unique per (user, pharmacy). The claim fetches
the current direct membership and then re-runs the canonical queryset before mutation, so a concurrent tier change
cannot rely on stale visibility. Locum and shift-hero members are then refused with 400 because they must express
interest and accept an offer. These tests drive the real endpoint through every tier/visibility/anonymity combination.
"""
from datetime import date, time, timedelta
from unittest import mock

from django.test import TestCase

from client_profile.characterization_support import client_for, make_owner_with_pharmacy, make_user
from memberships.models import FAVORITE_STAFF_EMPLOYMENT_TYPES, PHARMACY_STAFF_EMPLOYMENT_TYPES, Membership
from shifts.models import Shift, ShiftSlot, ShiftSlotAssignment

API = "/api/client-profile/"


class ClaimEligibilityTests(TestCase):
    def setUp(self):
        self.owner, self.pharmacy = make_owner_with_pharmacy()

    def claim(self, employment_type, visibility, anonymous):
        worker = make_user("PHARMACIST")
        Membership.objects.create(
            user=worker, pharmacy=self.pharmacy, role="PHARMACIST", employment_type=employment_type,
            status=Membership.Status.ACCEPTED, is_active=True,
        )
        shift = Shift.objects.create(
            pharmacy=self.pharmacy, created_by=self.owner, role_needed="PHARMACIST", employment_type="LOCUM",
            visibility=visibility, post_anonymously=anonymous,
        )
        ShiftSlot.objects.create(shift=shift, date=date.today() + timedelta(days=7), start_time=time(9, 0),
                                 end_time=time(17, 0))
        with mock.patch("shifts.browse.async_task"):  # the claim notification is not part of eligibility
            response = client_for(worker).post(f"{API}community-shifts/{shift.id}/claim-shift/", {}, format="json")
        claimed = ShiftSlotAssignment.objects.filter(shift=shift, user=worker).exists()
        return response, claimed

    def test_tier_change_after_initial_visibility_is_rechecked_before_claim(self):
        worker = make_user("PHARMACIST")
        membership = Membership.objects.create(
            user=worker, pharmacy=self.pharmacy, role="PHARMACIST", employment_type="LOCUM",
            status=Membership.Status.ACCEPTED, is_active=True,
        )
        shift = Shift.objects.create(
            pharmacy=self.pharmacy, created_by=self.owner, role_needed="PHARMACIST", employment_type="LOCUM",
            visibility="LOCUM_CASUAL", post_anonymously=True,
        )
        ShiftSlot.objects.create(
            shift=shift, date=date.today() + timedelta(days=7), start_time=time(9, 0), end_time=time(17, 0)
        )

        real_filter = Membership.objects.filter
        changed = False

        def filter_after_visibility(*args, **kwargs):
            nonlocal changed
            if (
                not changed
                and kwargs.get("user") == worker
                and kwargs.get("pharmacy") == self.pharmacy
                and kwargs.get("is_active") is True
            ):
                Membership._base_manager.filter(pk=membership.pk).update(employment_type="PART_TIME")
                changed = True
            return real_filter(*args, **kwargs)

        with mock.patch.object(Membership.objects, "filter", side_effect=filter_after_visibility), \
                mock.patch("shifts.browse.async_task"):
            response = client_for(worker).post(
                f"{API}community-shifts/{shift.id}/claim-shift/", {}, format="json"
            )

        self.assertTrue(changed)
        self.assertEqual(response.status_code, 403, response.data)
        self.assertEqual(response.data["code"], "shift_not_visible")
        self.assertFalse(ShiftSlotAssignment.objects.filter(shift=shift, user=worker).exists())

    def test_the_claim_tier_sets_are_the_visibility_tier_sets(self):
        self.assertEqual(set(PHARMACY_STAFF_EMPLOYMENT_TYPES), {"FULL_TIME", "PART_TIME", "CASUAL"})
        self.assertEqual(set(FAVORITE_STAFF_EMPLOYMENT_TYPES), {"LOCUM", "SHIFT_HERO"})

    def test_every_membership_and_visibility_combination(self):
        staff = set(PHARMACY_STAFF_EMPLOYMENT_TYPES)
        favorites = set(FAVORITE_STAFF_EMPLOYMENT_TYPES)
        employment_types = tuple(PHARMACY_STAFF_EMPLOYMENT_TYPES + FAVORITE_STAFF_EMPLOYMENT_TYPES)

        for employment in employment_types:
            for visibility in ("FULL_PART_TIME", "LOCUM_CASUAL"):
                for anonymous in (False, True):
                    with self.subTest(employment=employment, visibility=visibility, anonymous=anonymous):
                        response, was_claimed = self.claim(employment, visibility, anonymous)

                        if visibility == "FULL_PART_TIME":
                            expected = (201, None, True) if employment in staff else (
                                403, "shift_not_accessible", False
                            )
                        elif employment in favorites:
                            expected = (400, None, False)
                        elif anonymous:
                            expected = (403, "shift_not_accessible", False)
                        else:
                            expected = (201, None, True)

                        expected_status, expected_code, expected_claimed = expected
                        self.assertEqual(response.status_code, expected_status, response.data)
                        self.assertEqual(was_claimed, expected_claimed)
                        if expected_code:
                            self.assertEqual(response.data["code"], expected_code)
                        self.assertNotEqual(response.data.get("code"), "shift_claim_tier_mismatch")
