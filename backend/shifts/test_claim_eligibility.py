"""The effective eligibility rule of the community claim-shift endpoint.

The community queryset owns who can see (and therefore claim) a shift: a FULL_PART_TIME shift is visible to active
full-time / part-time / casual members of its pharmacy; a LOCUM_CASUAL shift to active locum / shift-hero members and,
unless it is posted anonymously, to active staff members. Membership is unique per (user, pharmacy). The claim locks the current direct membership row, re-runs the canonical
queryset under that lock, and keeps the lock through assignment, so visibility and tier handling use one stable
membership snapshot. Locum and shift-hero members are then refused with 400 because they must express interest and
accept an offer. These tests drive the real endpoint through every tier/visibility/anonymity combination.
"""
from datetime import date, time, timedelta
from unittest import mock

from django.test import TestCase

from client_profile.characterization_support import client_for, make_owner_with_pharmacy, make_user
from memberships.models import FAVORITE_STAFF_EMPLOYMENT_TYPES, PHARMACY_STAFF_EMPLOYMENT_TYPES, Membership
from shifts.models import Shift, ShiftSlot, ShiftSlotAssignment

API = "/api/v1/"


class ClaimEligibilityTests(TestCase):
    def test_c020_n2_other_free_slots_can_be_claimed_but_taken_slot_cannot(self):
        worker = make_user('PHARMACIST')
        Membership.objects.create(user=worker, pharmacy=self.pharmacy, role='PHARMACIST', employment_type='FULL_TIME',
                                  status=Membership.Status.ACCEPTED, is_active=True)
        shift = Shift.objects.create(pharmacy=self.pharmacy, created_by=self.owner, role_needed='PHARMACIST',
                                     employment_type='LOCUM', visibility='FULL_PART_TIME', single_user_only=False)
        slots = [ShiftSlot.objects.create(shift=shift, date=date.today() + timedelta(days=7 + i),
                                          start_time=time(9), end_time=time(17)) for i in range(2)]
        ShiftSlotAssignment.objects.create(shift=shift, slot=slots[0], slot_date=slots[0].date, user=make_user('PHARMACIST'))
        with mock.patch('shifts.browse.async_task'):
            refused = client_for(worker).post(f'{API}community-shifts/{shift.id}/claim-shift/', {'slot_id': slots[0].id}, format='json')
            allowed = client_for(worker).post(f'{API}community-shifts/{shift.id}/claim-shift/', {'slot_id': slots[1].id}, format='json')
        self.assertEqual(refused.status_code, 400, refused.data)
        self.assertEqual(allowed.status_code, 201, allowed.data)
        self.assertEqual(shift.slot_assignments.count(), 2)

    def test_payment_pending_whole_shift_offer_blocks_a_staff_claim(self):
        from shifts.models import ShiftOffer
        worker = make_user('PHARMACIST')
        Membership.objects.create(user=worker, pharmacy=self.pharmacy, role='PHARMACIST', employment_type='FULL_TIME',
                                  status=Membership.Status.ACCEPTED, is_active=True)
        shift = Shift.objects.create(pharmacy=self.pharmacy, created_by=self.owner, role_needed='PHARMACIST',
                                     employment_type='LOCUM', visibility='FULL_PART_TIME', single_user_only=True)
        ShiftSlot.objects.create(shift=shift, date=date.today() + timedelta(days=7), start_time=time(9), end_time=time(17))
        offer = ShiftOffer.objects.create(shift=shift, slot=None, user=make_user('PHARMACIST'),
                                          status=ShiftOffer.Status.ACCEPTED_AWAITING_PAYMENT)
        with mock.patch('shifts.browse.async_task'):
            refused = client_for(worker).post(f'{API}community-shifts/{shift.id}/claim-shift/', {}, format='json')
        self.assertEqual(refused.status_code, 400, refused.data)
        self.assertFalse(shift.slot_assignments.exists())
        offer.status = ShiftOffer.Status.EXPIRED
        offer.save(update_fields=['status'])
        with mock.patch('shifts.browse.async_task'):
            allowed = client_for(worker).post(f'{API}community-shifts/{shift.id}/claim-shift/', {}, format='json')
        self.assertEqual(allowed.status_code, 201, allowed.data)

    def test_assistant_claim_does_not_replace_pharmacy_approved_technician_employment_role(self):
        from onboarding.models import OtherStaffOnboarding
        worker = make_user('OTHER_STAFF')
        OtherStaffOnboarding.objects.create(user=worker,role_type='ASSISTANT',skills=['PRESCRIPTION_DISPENSING'],dispensary_qualification='LEVEL_3')
        membership = Membership.objects.create(user=worker,pharmacy=self.pharmacy,role='ASSISTANT',employment_type='FULL_TIME',status=Membership.Status.ACCEPTED,is_active=True)
        shift = Shift.objects.create(pharmacy=self.pharmacy,created_by=self.owner,role_needed='TECHNICIAN',employment_type='CASUAL',visibility='FULL_PART_TIME')
        ShiftSlot.objects.create(shift=shift,date=date.today()+timedelta(days=7),start_time=time(9),end_time=time(17))
        with mock.patch('shifts.browse.async_task'):
            response = client_for(worker).post(f'{API}community-shifts/{shift.id}/claim-shift/',{},format='json')
        self.assertEqual(response.status_code,403,response.data)
        self.assertEqual(response.data['code'],'shift_claim_employment_role_mismatch')
        self.assertFalse(ShiftSlotAssignment.objects.filter(shift=shift).exists())
        # Owner approval of the employment role allows assignment without inventing a verified skill badge.
        membership.role='TECHNICIAN';membership.save(update_fields=['role'])
        with mock.patch('shifts.browse.async_task'):
            accepted = client_for(worker).post(f'{API}community-shifts/{shift.id}/claim-shift/',{},format='json')
        self.assertEqual(accepted.status_code,201,accepted.data)

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

    def test_claim_locks_the_direct_membership_through_authorization(self):
        worker = make_user("PHARMACIST")
        Membership.objects.create(
            user=worker, pharmacy=self.pharmacy, role="PHARMACIST", employment_type="FULL_TIME",
            status=Membership.Status.ACCEPTED, is_active=True,
        )
        shift = Shift.objects.create(
            pharmacy=self.pharmacy, created_by=self.owner, role_needed="PHARMACIST", employment_type="LOCUM",
            visibility="FULL_PART_TIME", post_anonymously=False,
        )
        ShiftSlot.objects.create(
            shift=shift, date=date.today() + timedelta(days=7), start_time=time(9, 0), end_time=time(17, 0)
        )

        with mock.patch.object(
            Membership.objects, "select_for_update", wraps=Membership.objects.select_for_update
        ) as locked, mock.patch("shifts.browse.async_task"):
            response = client_for(worker).post(
                f"{API}community-shifts/{shift.id}/claim-shift/", {}, format="json"
            )

        self.assertEqual(response.status_code, 201, response.data)
        locked.assert_called_once_with()

    def test_tier_change_after_initial_object_lookup_is_rechecked_before_claim(self):
        from shifts.browse import CommunityShiftViewSet

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

        original_get_object = CommunityShiftViewSet.get_object
        changed = False

        def get_object_then_change(view):
            nonlocal changed
            obj = original_get_object(view)
            Membership._base_manager.filter(pk=membership.pk).update(employment_type="PART_TIME")
            changed = True
            return obj

        with mock.patch.object(CommunityShiftViewSet, "get_object", get_object_then_change), \
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
