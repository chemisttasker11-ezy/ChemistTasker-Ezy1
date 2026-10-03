"""The effective eligibility rule of the community claim-shift endpoint.

The community queryset decides who can see (and therefore claim) a shift: a FULL_PART_TIME shift is visible to active
full-time / part-time / casual members of its pharmacy; a LOCUM_CASUAL shift to active locum / shift-hero members and,
unless it is posted anonymously, to active staff members. Membership is unique per (user, pharmacy), so the claim sees
the same membership row the queryset matched. Locum and shift-hero members are refused with 400 before any tier check
(they must express interest and accept an offer). These tests drive the real endpoint through every combination.
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

    def test_the_claim_tier_sets_are_the_visibility_tier_sets(self):
        self.assertEqual(set(PHARMACY_STAFF_EMPLOYMENT_TYPES), {"FULL_TIME", "PART_TIME", "CASUAL"})
        self.assertEqual(set(FAVORITE_STAFF_EMPLOYMENT_TYPES), {"LOCUM", "SHIFT_HERO"})

    def test_every_membership_and_visibility_combination(self):
        expected = {
            # (employment, visibility, anonymous): (status, code or None, claimed)
            ("FULL_TIME", "FULL_PART_TIME", False): (201, None, True),
            ("CASUAL", "FULL_PART_TIME", True): (201, None, True),
            ("LOCUM", "FULL_PART_TIME", False): (403, "shift_not_accessible", False),
            ("SHIFT_HERO", "FULL_PART_TIME", True): (403, "shift_not_accessible", False),
            ("PART_TIME", "LOCUM_CASUAL", False): (201, None, True),
            ("PART_TIME", "LOCUM_CASUAL", True): (403, "shift_not_accessible", False),
            ("LOCUM", "LOCUM_CASUAL", False): (400, None, False),
            ("SHIFT_HERO", "LOCUM_CASUAL", True): (400, None, False),
        }
        for (employment, visibility, anonymous), (status, code, claimed) in expected.items():
            with self.subTest(employment=employment, visibility=visibility, anonymous=anonymous):
                response, was_claimed = self.claim(employment, visibility, anonymous)
                self.assertEqual(response.status_code, status, response.data)
                self.assertEqual(was_claimed, claimed)
                if code:
                    self.assertEqual(response.data["code"], code)
                self.assertNotEqual(response.data.get("code"), "shift_claim_tier_mismatch")
