"""Isolated unit tests for Central Attendance Eligibility Service.

Runs strictly in-memory using disposable SQLite under attendance_tests.settings.
Does not touch core.settings, unapplied migrations, or the configured database.
"""

import os
import unittest
from datetime import time, timedelta
import zoneinfo

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "attendance_tests.settings")

import django
django.setup()

from django.contrib.auth import get_user_model
from django.db import connection
from django.utils import timezone

from client_profile.attendance_eligibility import (
    EligibilityType,
    resolve_attendance_eligibility,
)
from client_profile.models import (
    Chain,
    Membership,
    Organization,
    OwnerOnboarding,
    Pharmacy,
    ProvisionalAttendance,
    Shift,
    ShiftSlot,
    ShiftSlotAssignment,
)

User = get_user_model()

ELIGIBILITY_SCHEMA_MODELS = (
    User,
    Organization,
    OwnerOnboarding,
    Pharmacy,
    Chain,
    Membership,
    Shift,
    ShiftSlot,
    ShiftSlotAssignment,
)


class AttendanceEligibilityMatrixTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        with connection.schema_editor() as editor:
            for model in ELIGIBILITY_SCHEMA_MODELS:
                editor.create_model(model)
        connection.disable_constraint_checking()

    @classmethod
    def tearDownClass(cls):
        connection.disable_constraint_checking()
        with connection.schema_editor() as editor:
            for model in reversed(ELIGIBILITY_SCHEMA_MODELS):
                editor.delete_model(model)
        connection.enable_constraint_checking()
        super().tearDownClass()

    def setUp(self):
        # Create users
        self.user_locum = User.objects.create(id=101, username="locum1@test.com", email="locum1@test.com")
        self.user_staff = User.objects.create(id=102, username="staff1@test.com", email="staff1@test.com")
        self.user_cross = User.objects.create(id=103, username="cross1@test.com", email="cross1@test.com")
        self.user_unrelated = User.objects.create(id=104, username="unrelated@test.com", email="unrelated@test.com")
        self.user_fav = User.objects.create(id=105, username="fav@test.com", email="fav@test.com")

        # Create organizations and owners
        self.org1 = Organization.objects.create(id=10, name="Org Alpha")
        self.org2 = Organization.objects.create(id=20, name="Org Beta")
        self.user_owner1 = User.objects.create(id=201, username="owner1@test.com", email="owner1@test.com")
        self.user_owner2 = User.objects.create(id=202, username="owner2@test.com", email="owner2@test.com")
        self.owner1 = OwnerOnboarding.objects.create(id=1, user=self.user_owner1, phone_number="0400000001", role="PHARMACIST")
        self.owner2 = OwnerOnboarding.objects.create(id=2, user=self.user_owner2, phone_number="0400000002", role="PHARMACIST")

        # Create target pharmacy (owner_id=1, org_id=10)
        self.pharmacy_a = Pharmacy.objects.create(
            id=1,
            name="Pharmacy Alpha",
            owner=self.owner1,
            organization=self.org1,
            timezone="Australia/Sydney",
        )

        # Sister pharmacy same owner (owner_id=1, org_id=20)
        self.pharmacy_same_owner = Pharmacy.objects.create(
            id=2,
            name="Pharmacy Beta (Same Owner)",
            owner=self.owner1,
            organization=self.org2,
            timezone="Australia/Sydney",
        )

        # Sister pharmacy same org (owner_id=2, org_id=10)
        self.pharmacy_same_org = Pharmacy.objects.create(
            id=3,
            name="Pharmacy Gamma (Same Org)",
            owner=self.owner2,
            organization=self.org1,
            timezone="Australia/Sydney",
        )

        # Independent pharmacy (null owner, null org)
        self.pharmacy_null_owner_org = Pharmacy.objects.create(
            id=4,
            name="Pharmacy Delta (No Owner/Org)",
            owner=None,
            organization=None,
            timezone="Australia/Sydney",
        )

        # Another independent pharmacy (null owner, null org)
        self.pharmacy_null_sister = Pharmacy.objects.create(
            id=5,
            name="Pharmacy Epsilon (No Owner/Org)",
            owner=None,
            organization=None,
            timezone="Australia/Sydney",
        )

        # Pharmacy linked only by active Chain
        self.user_owner99 = User.objects.create(id=299, username="owner99@test.com", email="owner99@test.com")
        self.owner99 = OwnerOnboarding.objects.create(id=99, user=self.user_owner99, phone_number="0400000099", role="PHARMACIST")
        self.org99 = Organization.objects.create(id=99, name="Org 99")
        self.pharmacy_chain_sister = Pharmacy.objects.create(
            id=6,
            name="Pharmacy Zeta (Chain Sister)",
            owner=self.owner99,
            organization=self.org99,
            timezone="Australia/Sydney",
        )
        self.active_chain = Chain.objects.create(
            id=1,
            name="Community Care Chain",
            is_active=True,
            primary_contact_email="chain@test.com",
        )
        self.active_chain.pharmacies.add(self.pharmacy_a, self.pharmacy_chain_sister)

    def tearDown(self):
        with connection.cursor() as cursor:
            for table in (
                "client_profile_shiftslotassignment",
                "client_profile_shiftslot",
                "client_profile_shift",
                "client_profile_membership",
                "client_profile_chain_pharmacies",
                "client_profile_chain",
                "client_profile_pharmacy",
                "client_profile_owneronboarding",
                "client_profile_organization",
                "users_user",
            ):
                cursor.execute(f"DELETE FROM {table};")

    # -------------------------------------------------------------------------
    # Tier 1: Confirmed Assignment
    # -------------------------------------------------------------------------
    def test_confirmed_locum_without_membership_is_eligible_normal(self):
        """Confirmed marketplace locum clocks normally without pharmacy membership."""
        shift = Shift.objects.create(
            id=1,
            pharmacy=self.pharmacy_a,
            role_needed="PHARMACIST",
        )
        tz = zoneinfo.ZoneInfo("Australia/Sydney")
        now_local = timezone.now().astimezone(tz)
        today = now_local.date()

        slot = ShiftSlot.objects.create(
            id=1,
            shift=shift,
            date=today,
            start_time=time(9, 0),
            end_time=time(17, 0),
        )
        assignment = ShiftSlotAssignment.objects.create(
            id=1,
            shift=shift,
            slot=slot,
            slot_date=today,
            user=self.user_locum,
        )

        eval_time = now_local.replace(
            year=today.year, month=today.month, day=today.day,
            hour=9, minute=15, second=0, microsecond=0,
        )

        result = resolve_attendance_eligibility(
            user=self.user_locum,
            pharmacy=self.pharmacy_a,
            target_time=eval_time,
        )

        self.assertTrue(result.is_eligible)
        self.assertEqual(result.eligibility_type, EligibilityType.CONFIRMED_ASSIGNMENT)
        self.assertFalse(result.is_provisional)
        self.assertEqual(result.assignment.id, assignment.id)
        self.assertIsNone(result.cover_type)
        self.assertIsNone(result.source_membership)

    def test_rostered_permanent_staff_with_assignment_records_local_membership(self):
        """Rostered staff member with scheduled assignment records local membership."""
        local_mem = Membership.objects.create(
            user=self.user_staff,
            pharmacy=self.pharmacy_a,
            role="PHARMACIST",
            employment_type="FULL_TIME",
            status=Membership.Status.ACCEPTED,
            is_active=True,
        )
        shift = Shift.objects.create(
            id=2,
            pharmacy=self.pharmacy_a,
            role_needed="PHARMACIST",
        )
        tz = zoneinfo.ZoneInfo("Australia/Sydney")
        now_local = timezone.now().astimezone(tz)
        today = now_local.date()

        slot = ShiftSlot.objects.create(
            id=2,
            shift=shift,
            date=today,
            start_time=time(8, 0),
            end_time=time(16, 0),
        )
        assignment = ShiftSlotAssignment.objects.create(
            id=2,
            shift=shift,
            slot=slot,
            slot_date=today,
            user=self.user_staff,
        )

        eval_time = now_local.replace(
            year=today.year, month=today.month, day=today.day,
            hour=8, minute=5, second=0, microsecond=0,
        )

        result = resolve_attendance_eligibility(
            user=self.user_staff,
            pharmacy=self.pharmacy_a,
            target_time=eval_time,
        )

        self.assertTrue(result.is_eligible)
        self.assertEqual(result.eligibility_type, EligibilityType.CONFIRMED_ASSIGNMENT)
        self.assertFalse(result.is_provisional)
        self.assertEqual(result.assignment.id, assignment.id)
        self.assertEqual(result.source_membership.id, local_mem.id)

    # -------------------------------------------------------------------------
    # Tier 2: Unscheduled Local Staff Cover
    # -------------------------------------------------------------------------
    def test_unscheduled_local_staff_is_provisional(self):
        """Unscheduled local staff clocks in provisionally pending manager approval."""
        local_mem = Membership.objects.create(
            user=self.user_staff,
            pharmacy=self.pharmacy_a,
            role="ASSISTANT",
            employment_type="PART_TIME",
            status=Membership.Status.ACCEPTED,
            is_active=True,
        )

        result = resolve_attendance_eligibility(
            user=self.user_staff,
            pharmacy=self.pharmacy_a,
        )

        self.assertTrue(result.is_eligible)
        self.assertEqual(result.eligibility_type, EligibilityType.UNROSTERED_LOCAL)
        self.assertTrue(result.is_provisional)
        self.assertEqual(result.cover_type, ProvisionalAttendance.CoverType.UNROSTERED_LOCAL)
        self.assertIsNone(result.assignment)
        self.assertEqual(result.source_membership.id, local_mem.id)

    # -------------------------------------------------------------------------
    # Tier 3: Cross-Site Staff Cover
    # -------------------------------------------------------------------------
    def test_cross_site_staff_same_owner(self):
        """Cross-site staff from sister pharmacy under same owner is eligible provisionally."""
        remote_mem = Membership.objects.create(
            user=self.user_cross,
            pharmacy=self.pharmacy_same_owner,
            role="PHARMACIST",
            employment_type="FULL_TIME",
            status=Membership.Status.ACCEPTED,
            is_active=True,
        )

        result = resolve_attendance_eligibility(
            user=self.user_cross,
            pharmacy=self.pharmacy_a,
        )

        self.assertTrue(result.is_eligible)
        self.assertEqual(result.eligibility_type, EligibilityType.CROSS_SITE_CHAIN)
        self.assertTrue(result.is_provisional)
        self.assertEqual(result.cover_type, ProvisionalAttendance.CoverType.CROSS_SITE_CHAIN)
        self.assertIsNone(result.assignment)
        self.assertEqual(result.source_membership.id, remote_mem.id)

    def test_cross_site_staff_shared_active_chain(self):
        """Cross-site staff from pharmacy in same active Chain is eligible provisionally."""
        remote_mem = Membership.objects.create(
            user=self.user_cross,
            pharmacy=self.pharmacy_chain_sister,
            role="TECHNICIAN",
            employment_type="CASUAL",
            status=Membership.Status.ACCEPTED,
            is_active=True,
        )

        result = resolve_attendance_eligibility(
            user=self.user_cross,
            pharmacy=self.pharmacy_a,
        )

        self.assertTrue(result.is_eligible)
        self.assertEqual(result.eligibility_type, EligibilityType.CROSS_SITE_CHAIN)
        self.assertTrue(result.is_provisional)
        self.assertEqual(result.cover_type, ProvisionalAttendance.CoverType.CROSS_SITE_CHAIN)
        self.assertEqual(result.source_membership.id, remote_mem.id)

    def test_cross_site_staff_same_organization(self):
        """Cross-site staff from pharmacy in same Organization is eligible provisionally."""
        remote_mem = Membership.objects.create(
            user=self.user_cross,
            pharmacy=self.pharmacy_same_org,
            role="PHARMACIST",
            employment_type="FULL_TIME",
            status=Membership.Status.ACCEPTED,
            is_active=True,
        )

        result = resolve_attendance_eligibility(
            user=self.user_cross,
            pharmacy=self.pharmacy_a,
        )

        self.assertTrue(result.is_eligible)
        self.assertEqual(result.eligibility_type, EligibilityType.CROSS_SITE_ORG)
        self.assertTrue(result.is_provisional)
        self.assertEqual(result.cover_type, ProvisionalAttendance.CoverType.CROSS_SITE_ORG)
        self.assertEqual(result.source_membership.id, remote_mem.id)

    # -------------------------------------------------------------------------
    # Rejections & Negative Rules
    # -------------------------------------------------------------------------
    def test_reject_inactive_local_membership(self):
        Membership.objects.create(
            user=self.user_staff,
            pharmacy=self.pharmacy_a,
            role="PHARMACIST",
            employment_type="FULL_TIME",
            status=Membership.Status.ACCEPTED,
            is_active=False,
        )
        result = resolve_attendance_eligibility(
            user=self.user_staff,
            pharmacy=self.pharmacy_a,
        )
        self.assertFalse(result.is_eligible)
        self.assertEqual(result.eligibility_type, EligibilityType.REJECTED)
        self.assertEqual(result.rejection_reason, "LOCAL_MEMBERSHIP_INACTIVE")

    def test_reject_pending_local_membership(self):
        Membership.objects.create(
            user=self.user_staff,
            pharmacy=self.pharmacy_a,
            role="PHARMACIST",
            employment_type="FULL_TIME",
            status=Membership.Status.PENDING,
            is_active=True,
        )
        result = resolve_attendance_eligibility(
            user=self.user_staff,
            pharmacy=self.pharmacy_a,
        )
        self.assertFalse(result.is_eligible)
        self.assertEqual(result.rejection_reason, "LOCAL_MEMBERSHIP_PENDING")

    def test_reject_rejected_or_left_membership(self):
        Membership.objects.create(
            user=self.user_staff,
            pharmacy=self.pharmacy_a,
            role="PHARMACIST",
            employment_type="FULL_TIME",
            status=Membership.Status.REJECTED,
            is_active=True,
        )
        result = resolve_attendance_eligibility(
            user=self.user_staff,
            pharmacy=self.pharmacy_a,
        )
        self.assertFalse(result.is_eligible)
        self.assertEqual(result.rejection_reason, "LOCAL_MEMBERSHIP_REJECTED")

    def test_reject_favourite_contact_without_assignment(self):
        """Favourite contacts / directory locums cannot clock in unscheduled."""
        Membership.objects.create(
            user=self.user_fav,
            pharmacy=self.pharmacy_a,
            role="CONTACT",
            employment_type="LOCUM",
            status=Membership.Status.ACCEPTED,
            is_active=True,
        )
        result = resolve_attendance_eligibility(
            user=self.user_fav,
            pharmacy=self.pharmacy_a,
        )
        self.assertFalse(result.is_eligible)
        self.assertEqual(result.rejection_reason, "FAVORITE_CONTACT_WITHOUT_ASSIGNMENT")

    def test_reject_null_to_null_owner_or_org_match(self):
        """Pharmacies with null owner/org must NEVER match each other."""
        Membership.objects.create(
            user=self.user_cross,
            pharmacy=self.pharmacy_null_sister,
            role="PHARMACIST",
            employment_type="FULL_TIME",
            status=Membership.Status.ACCEPTED,
            is_active=True,
        )
        result = resolve_attendance_eligibility(
            user=self.user_cross,
            pharmacy=self.pharmacy_null_owner_org,
        )
        self.assertFalse(result.is_eligible)
        self.assertEqual(result.rejection_reason, "REMOTE_MEMBERSHIP_NO_CHAIN_OR_ORG_MATCH")

    def test_reject_inactive_chain(self):
        """Inactive chain does not grant cross-site cover."""
        self.active_chain.is_active = False
        self.active_chain.save()

        Membership.objects.create(
            user=self.user_cross,
            pharmacy=self.pharmacy_chain_sister,
            role="PHARMACIST",
            employment_type="FULL_TIME",
            status=Membership.Status.ACCEPTED,
            is_active=True,
        )
        result = resolve_attendance_eligibility(
            user=self.user_cross,
            pharmacy=self.pharmacy_a,
        )
        self.assertFalse(result.is_eligible)

    def test_reject_unrelated_pharmacy_staff(self):
        """Staff from completely unrelated pharmacy cannot clock in."""
        unrelated_user = User.objects.create(id=288, username="unrelated_owner@test.com", email="unrelated_owner@test.com")
        unrelated_owner = OwnerOnboarding.objects.create(id=888, user=unrelated_user, phone_number="0400000888", role="PHARMACIST")
        unrelated_org = Organization.objects.create(id=777, name="Unrelated Org")
        unrelated_pharmacy = Pharmacy.objects.create(
            id=999,
            name="Unrelated Pharmacy",
            owner=unrelated_owner,
            organization=unrelated_org,
        )
        Membership.objects.create(
            user=self.user_unrelated,
            pharmacy=unrelated_pharmacy,
            role="PHARMACIST",
            employment_type="FULL_TIME",
            status=Membership.Status.ACCEPTED,
            is_active=True,
        )
        result = resolve_attendance_eligibility(
            user=self.user_unrelated,
            pharmacy=self.pharmacy_a,
        )
        self.assertFalse(result.is_eligible)
        self.assertEqual(result.rejection_reason, "REMOTE_MEMBERSHIP_NO_CHAIN_OR_ORG_MATCH")

    def test_no_shifts_or_memberships_created_by_evaluation(self):
        """Eligibility service is strictly read-only and has zero DB side-effects."""
        initial_shift_count = Shift.objects.count()
        initial_mem_count = Membership.objects.count()
        initial_assignment_count = ShiftSlotAssignment.objects.count()

        resolve_attendance_eligibility(
            user=self.user_staff,
            pharmacy=self.pharmacy_a,
        )

        self.assertEqual(Shift.objects.count(), initial_shift_count)
        self.assertEqual(Membership.objects.count(), initial_mem_count)
        self.assertEqual(ShiftSlotAssignment.objects.count(), initial_assignment_count)


if __name__ == "__main__":
    unittest.main()
