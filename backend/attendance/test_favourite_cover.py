"""Favourite-list emergency cover (owner decision 2026-10-04).

A locum or Shift Hero on a pharmacy's favourites list who turns up in an emergency may clock in without an assignment.
The attendance is provisional until the owner reviews it; on approval the backfilled assignment is settled the way the
worker chose in onboarding (ABN invoice or TFN shift employment), exactly as if they had accepted an offer.
"""
from datetime import timedelta

from django.test import TestCase
from django.utils import timezone

from attendance.approvals import approve_provisional_attendance
from attendance.eligibility import EligibilityType, resolve_attendance_eligibility
from attendance.models import AttendanceSession, ProvisionalAttendance
from client_profile.characterization_support import make_owner_with_pharmacy, make_user
from memberships.models import Membership
from onboarding.models import PharmacistOnboarding


class FavouriteCoverTests(TestCase):
    def setUp(self):
        self.owner, self.pharmacy = make_owner_with_pharmacy("Emergency Pharmacy")
        self.locum = make_user("PHARMACIST")
        self.favourite = Membership.objects.create(
            user=self.locum,
            pharmacy=self.pharmacy,
            role="PHARMACIST",
            employment_type="LOCUM",
            status=Membership.Status.ACCEPTED,
            is_active=True,
        )

    def covered_session(self):
        result = resolve_attendance_eligibility(user=self.locum, pharmacy=self.pharmacy)
        self.assertTrue(result.is_eligible)
        self.assertEqual(result.eligibility_type, EligibilityType.FAVOURITE_COVER)
        self.assertTrue(result.is_provisional)
        now = timezone.now()
        session = AttendanceSession.objects.create(
            pharmacy=self.pharmacy,
            user=self.locum,
            source_membership=result.source_membership,
            started_at=now - timedelta(hours=4),
            ended_at=now - timedelta(minutes=5),
            is_provisional=True,
        )
        return ProvisionalAttendance.objects.create(session=session, cover_type=result.cover_type)

    def test_favourite_locum_clocks_in_pending_review(self):
        provisional = self.covered_session()
        self.assertEqual(provisional.cover_type, ProvisionalAttendance.CoverType.FAVOURITE_COVER)
        self.assertEqual(provisional.status, ProvisionalAttendance.Status.PENDING)

    def test_plain_contacts_still_need_an_assignment(self):
        self.favourite.role = "CONTACT"
        self.favourite.save(update_fields=["role"])
        result = resolve_attendance_eligibility(user=self.locum, pharmacy=self.pharmacy)
        self.assertFalse(result.is_eligible)
        self.assertEqual(result.rejection_reason, "FAVORITE_CONTACT_WITHOUT_ASSIGNMENT")

    def test_approval_settles_by_the_workers_invoice_preference(self):
        PharmacistOnboarding.objects.create(
            user=self.locum,
            payment_preference="ABN",
            abn="51824753556",
            abn_verified=True,
            abn_entity_confirmed=True,
            abn_entity_name="Locum Services Pty Ltd",
            abn_details_for="51824753556",
        )
        provisional = approve_provisional_attendance(self.owner, self.covered_session().pk)
        assignment = provisional.backfill_assignment
        self.assertEqual(provisional.status, ProvisionalAttendance.Status.APPROVED)
        self.assertEqual(assignment.settlement_channel, "INVOICE")
        self.assertEqual(assignment.payment_preference_snapshot, "ABN")
        self.assertEqual(assignment.engagement_terms_snapshot["source"], "FAVOURITE_COVER_APPROVAL")
        self.assertFalse(
            Membership.objects.filter(user=self.locum, pharmacy=self.pharmacy, employment_type="FULL_TIME").exists(),
            "approval never creates a permanent membership",
        )

    def test_incomplete_payment_details_do_not_block_approval(self):
        provisional = approve_provisional_attendance(self.owner, self.covered_session().pk)
        assignment = provisional.backfill_assignment
        self.assertEqual(provisional.status, ProvisionalAttendance.Status.APPROVED)
        self.assertEqual(assignment.settlement_channel, "TIMESHEET_ONLY")
        self.assertTrue(assignment.engagement_terms_snapshot["payment_profile_incomplete"])
