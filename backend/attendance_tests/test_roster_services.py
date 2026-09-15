import os
import unittest
from datetime import date, time, timedelta

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "attendance_tests.settings")
import django

django.setup()

from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.db import connection
from django.utils import timezone

from client_profile.models import (
    LeaveRequest,
    Membership,
    OwnerOnboarding,
    Pharmacy,
    PharmacyAdmin,
    RosterAcknowledgement,
    RosterPeriod,
    RosterPublicationAudit,
    Shift,
    ShiftSlot,
    ShiftSlotAssignment,
    UserAvailability,
)
from client_profile.roster_services import (
    acknowledge_roster_period,
    get_or_create_roster_period,
    get_roster_acknowledgement_status,
    get_roster_period_assignments,
    get_worker_published_roster,
    publish_roster_period,
    unpublish_roster_period,
    validate_roster_period,
)

User = get_user_model()


class RosterServicesTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        from attendance_tests.roster_schema import create_schema
        create_schema()

    @classmethod
    def tearDownClass(cls):
        from attendance_tests.roster_schema import drop_schema
        drop_schema()

    def _clean_tables(self):
        from attendance_tests.roster_schema import clear_schema
        clear_schema()

    def tearDown(self):
        self._clean_tables()

    def setUp(self):
        self._clean_tables()
        self.owner_user = User.objects.create(username="owner_user", email="owner@pharmacy.com", role="OWNER")
        self.owner_profile = OwnerOnboarding.objects.create(user=self.owner_user, phone_number="0400000001", role="PHARMACIST")
        self.pharmacy = Pharmacy.objects.create(name="Central Pharmacy", owner=self.owner_profile)
        
        self.pharmacist = User.objects.create(username="pharma_alice", email="alice@pharmacy.com", role="PHARMACIST")
        self.membership_pharma = Membership.objects.create(
            user=self.pharmacist,
            pharmacy=self.pharmacy,
            role="PHARMACIST",
            status=Membership.Status.ACCEPTED,
            is_active=True,
        )

        self.assistant = User.objects.create(username="assist_bob", email="bob@pharmacy.com", role="ASSISTANT")
        self.membership_assist = Membership.objects.create(
            user=self.assistant,
            pharmacy=self.pharmacy,
            role="ASSISTANT",
            status=Membership.Status.ACCEPTED,
            is_active=True,
        )

        # A Monday date
        self.monday = date(2026, 9, 21)
        self.assertTrue(self.monday.weekday() == 0)

    def test_roster_period_creation_and_monday_validation(self):
        period, created = get_or_create_roster_period(self.pharmacy, self.monday, self.owner_user)
        self.assertTrue(created)
        self.assertEqual(period.pharmacy, self.pharmacy)
        self.assertEqual(period.week_start, self.monday)
        self.assertEqual(period.week_end, self.monday + timedelta(days=6))
        self.assertEqual(period.status, RosterPeriod.Status.DRAFT)

        # Sunday should fail
        tuesday = date(2026, 9, 22)
        with self.assertRaises(ValidationError):
            get_or_create_roster_period(self.pharmacy, tuesday, self.owner_user)

    def test_draft_assignments_invisible_to_worker(self):
        period, _ = get_or_create_roster_period(self.pharmacy, self.monday, self.owner_user)
        
        shift = Shift.objects.create(pharmacy=self.pharmacy, role_needed="PHARMACIST")
        slot = ShiftSlot.objects.create(shift=shift, date=self.monday, start_time=time(9, 0), end_time=time(17, 0))
        assignment = ShiftSlotAssignment.objects.create(
            shift=shift,
            slot=slot,
            slot_date=self.monday,
            user=self.pharmacist,
            is_rostered=True,
        )

        # Worker published roster should NOT contain this assignment because period is DRAFT
        worker_roster = get_worker_published_roster(self.pharmacist)
        self.assertEqual(len(worker_roster), 0)

    def test_published_assignments_visible_to_worker(self):
        period, _ = get_or_create_roster_period(self.pharmacy, self.monday, self.owner_user)
        
        shift = Shift.objects.create(pharmacy=self.pharmacy, role_needed="PHARMACIST")
        slot = ShiftSlot.objects.create(shift=shift, date=self.monday, start_time=time(9, 0), end_time=time(17, 0))
        assignment = ShiftSlotAssignment.objects.create(
            shift=shift,
            slot=slot,
            slot_date=self.monday,
            user=self.pharmacist,
            is_rostered=True,
        )

        # Publish the period
        publish_roster_period(period, self.owner_user)
        period.refresh_from_db()
        self.assertEqual(period.status, RosterPeriod.Status.PUBLISHED)

        # Now worker can see their assignment!
        worker_roster = get_worker_published_roster(self.pharmacist)
        self.assertEqual(len(worker_roster), 1)
        self.assertEqual(worker_roster[0].id, assignment.id)

    def test_validation_detects_role_mismatch(self):
        period, _ = get_or_create_roster_period(self.pharmacy, self.monday, self.owner_user)
        
        # Shift requires PHARMACIST, but assigned to assistant
        shift = Shift.objects.create(pharmacy=self.pharmacy, role_needed="PHARMACIST")
        slot = ShiftSlot.objects.create(shift=shift, date=self.monday, start_time=time(9, 0), end_time=time(17, 0))
        ShiftSlotAssignment.objects.create(
            shift=shift,
            slot=slot,
            slot_date=self.monday,
            user=self.assistant,
            is_rostered=True,
        )

        validation = validate_roster_period(period)
        self.assertFalse(validation["is_valid"])
        self.assertEqual(len(validation["errors"]), 1)
        self.assertEqual(validation["errors"][0]["type"], "ROLE_MISMATCH")

        # Publishing should be blocked
        with self.assertRaises(ValidationError) as ctx:
            publish_roster_period(period, self.owner_user)
        self.assertIn("does not match required role", str(ctx.exception))

    def test_validation_detects_overlapping_shifts(self):
        period, _ = get_or_create_roster_period(self.pharmacy, self.monday, self.owner_user)
        
        # Shift 1: 09:00 - 15:00
        shift1 = Shift.objects.create(pharmacy=self.pharmacy, role_needed="PHARMACIST")
        slot1 = ShiftSlot.objects.create(shift=shift1, date=self.monday, start_time=time(9, 0), end_time=time(15, 0))
        ShiftSlotAssignment.objects.create(shift=shift1, slot=slot1, slot_date=self.monday, user=self.pharmacist, is_rostered=True)

        # Shift 2: 13:00 - 18:00 (overlaps from 13:00 to 15:00)
        shift2 = Shift.objects.create(pharmacy=self.pharmacy, role_needed="PHARMACIST")
        slot2 = ShiftSlot.objects.create(shift=shift2, date=self.monday, start_time=time(13, 0), end_time=time(18, 0))
        ShiftSlotAssignment.objects.create(shift=shift2, slot=slot2, slot_date=self.monday, user=self.pharmacist, is_rostered=True)

        validation = validate_roster_period(period)
        self.assertFalse(validation["is_valid"])
        overlap_errors = [e for e in validation["errors"] if e["type"] == "SHIFT_OVERLAP"]
        self.assertTrue(len(overlap_errors) > 0)

    def test_validation_detects_approved_leave_conflict(self):
        period, _ = get_or_create_roster_period(self.pharmacy, self.monday, self.owner_user)
        
        shift = Shift.objects.create(pharmacy=self.pharmacy, role_needed="PHARMACIST")
        slot = ShiftSlot.objects.create(shift=shift, date=self.monday, start_time=time(9, 0), end_time=time(17, 0))
        assignment = ShiftSlotAssignment.objects.create(
            shift=shift,
            slot=slot,
            slot_date=self.monday,
            user=self.pharmacist,
            is_rostered=True,
        )

        # Approved leave on that day
        LeaveRequest.objects.create(
            slot_assignment=assignment,
            user=self.pharmacist,
            leave_type="ANNUAL",
            status="APPROVED",
        )

        validation = validate_roster_period(period)
        self.assertFalse(validation["is_valid"])
        leave_errors = [e for e in validation["errors"] if e["type"] == "APPROVED_LEAVE_CONFLICT"]
        self.assertEqual(len(leave_errors), 1)

    def test_validation_detects_availability_conflict(self):
        period, _ = get_or_create_roster_period(self.pharmacy, self.monday, self.owner_user)
        
        shift = Shift.objects.create(pharmacy=self.pharmacy, role_needed="PHARMACIST")
        # Shift: 09:00 - 18:00
        slot = ShiftSlot.objects.create(shift=shift, date=self.monday, start_time=time(9, 0), end_time=time(18, 0))
        ShiftSlotAssignment.objects.create(
            shift=shift,
            slot=slot,
            slot_date=self.monday,
            user=self.pharmacist,
            is_rostered=True,
        )

        # Worker is only available 09:00 - 13:00
        UserAvailability.objects.create(
            user=self.pharmacist,
            date=self.monday,
            start_time=time(9, 0),
            end_time=time(13, 0),
            is_all_day=False,
        )

        validation = validate_roster_period(period)
        # Availability is a warning, not a hard block
        self.assertTrue(validation["is_valid"])
        self.assertEqual(len(validation["warnings"]), 1)
        self.assertEqual(validation["warnings"][0]["type"], "AVAILABILITY_CONFLICT")

    def test_atomic_publish_and_audit_history(self):
        period, _ = get_or_create_roster_period(self.pharmacy, self.monday, self.owner_user)
        
        shift = Shift.objects.create(pharmacy=self.pharmacy, role_needed="PHARMACIST")
        slot = ShiftSlot.objects.create(shift=shift, date=self.monday, start_time=time(9, 0), end_time=time(17, 0))
        ShiftSlotAssignment.objects.create(
            shift=shift,
            slot=slot,
            slot_date=self.monday,
            user=self.pharmacist,
            is_rostered=True,
        )

        period, validation = publish_roster_period(period, self.owner_user)
        self.assertEqual(period.status, RosterPeriod.Status.PUBLISHED)
        self.assertIsNotNone(period.published_at)
        self.assertEqual(period.published_by, self.owner_user)

        # Check audit
        audits = period.publication_audits.all()
        self.assertEqual(audits.count(), 1)
        self.assertEqual(audits[0].revision_number, 1)
        self.assertEqual(audits[0].total_assignments, 1)

    def test_worker_acknowledgement_workflow(self):
        period, _ = get_or_create_roster_period(self.pharmacy, self.monday, self.owner_user)
        
        shift = Shift.objects.create(pharmacy=self.pharmacy, role_needed="PHARMACIST")
        slot = ShiftSlot.objects.create(shift=shift, date=self.monday, start_time=time(9, 0), end_time=time(17, 0))
        ShiftSlotAssignment.objects.create(shift=shift, slot=slot, slot_date=self.monday, user=self.pharmacist, is_rostered=True)

        # Cannot acknowledge while DRAFT
        with self.assertRaises(ValidationError):
            acknowledge_roster_period(period, self.pharmacist)

        period, _ = publish_roster_period(period, self.owner_user)

        # Worker acknowledges
        ack = acknowledge_roster_period(period, self.pharmacist, notes="All good, ready!")
        self.assertEqual(ack.roster_period, period)
        self.assertEqual(ack.user, self.pharmacist)
        self.assertEqual(ack.notes, "All good, ready!")

        # Manager status check
        status = get_roster_acknowledgement_status(period, self.owner_user)
        self.assertEqual(status["total_workers"], 1)
        self.assertEqual(status["acknowledged_count"], 1)
        self.assertEqual(status["pending_count"], 0)
        self.assertTrue(status["workers"][0]["is_acknowledged"])

    def test_unauthorized_manager_denied_publish(self):
        period, _ = get_or_create_roster_period(self.pharmacy, self.monday, self.owner_user)
        
        # Pharmacist is not an owner/manager
        with self.assertRaises(ValidationError) as ctx:
            publish_roster_period(period, self.pharmacist)
        self.assertIn("not authorized", str(ctx.exception))

    def test_unpublish_hides_shifts_from_worker(self):
        period, _ = get_or_create_roster_period(self.pharmacy, self.monday, self.owner_user)
        
        shift = Shift.objects.create(pharmacy=self.pharmacy, role_needed="PHARMACIST")
        slot = ShiftSlot.objects.create(shift=shift, date=self.monday, start_time=time(9, 0), end_time=time(17, 0))
        ShiftSlotAssignment.objects.create(shift=shift, slot=slot, slot_date=self.monday, user=self.pharmacist, is_rostered=True)

        publish_roster_period(period, self.owner_user)
        self.assertEqual(len(get_worker_published_roster(self.pharmacist)), 1)

        # Unpublish
        unpublish_roster_period(period, self.owner_user)
        self.assertEqual(len(get_worker_published_roster(self.pharmacist)), 0)

    def test_consecutive_publish_increments_revision(self):
        period, _ = get_or_create_roster_period(self.pharmacy, self.monday, self.owner_user)
        shift = Shift.objects.create(pharmacy=self.pharmacy, role_needed="PHARMACIST")
        slot = ShiftSlot.objects.create(shift=shift, date=self.monday, start_time=time(9, 0), end_time=time(17, 0))
        ShiftSlotAssignment.objects.create(shift=shift, slot=slot, slot_date=self.monday, user=self.pharmacist, is_rostered=True)

        period, _ = publish_roster_period(period, self.owner_user)
        self.assertEqual(period.publication_audits.count(), 1)
        self.assertEqual(period.publication_audits.first().revision_number, 1)

        # Unpublish and publish again
        unpublish_roster_period(period, self.owner_user)
        period, _ = publish_roster_period(period, self.owner_user)
        self.assertEqual(period.publication_audits.count(), 2)
        latest_audit = period.publication_audits.order_by("-revision_number").first()
        self.assertEqual(latest_audit.revision_number, 2)
