import os
import unittest
from datetime import date, datetime, time, timedelta

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "attendance_tests.settings")
import django

django.setup()

from django.contrib.auth import get_user_model
from django.db import connection
from django.utils import timezone
from rest_framework.test import APIClient

from client_profile.models import (
    LeaveRequest,
    Membership,
    OwnerOnboarding,
    Pharmacy,
    PharmacyAdmin,
    RosterAcknowledgement,
    RosterActionAudit,
    RosterPeriod,
    RosterPublicationAudit,
    RosterTemplate,
    Shift,
    ShiftSlot,
    ShiftSlotAssignment,
    UserAvailability,
    WorkerShiftRequest,
)
from client_profile.roster_services import (
    get_or_create_roster_period,
    publish_roster_period,
)

User = get_user_model()


class RosterV2AcceptanceTests(unittest.TestCase):
    """
    Checkpoint 6 Acceptance Test Suite: Complete verification of Roster V2 backend contracts:
    - Side-effect-free draft reads and grid generation (assignments, vacant slots, staff_view, stacked_view).
    - Validation engine: role mismatch, time overlaps, approved leave conflicts.
    - Atomic publication, audit recording, and worker visibility boundaries.
    - Worker acknowledgement lifecycle and manager metrics breakdown.
    - Week copying with delta date calculations and marketplace protection.
    - Template creation, listing, and application.
    - Reversion to DRAFT on unpublish.
    - Transactional bulk-editing rollback safety.
    - Strict manager authorization enforcement.
    """

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
        self.client = APIClient()

        # 1. Setup Pharmacy & Owner
        self.owner_user = User.objects.create(
            username="roster_owner",
            email="roster_owner@test.com",
            first_name="Alice",
            last_name="Owner",
            role="OWNER",
        )
        self.owner_profile = OwnerOnboarding.objects.create(
            user=self.owner_user,
            phone_number="0411000111",
            role="PHARMACIST",
        )
        self.pharmacy = Pharmacy.objects.create(
            name="St. Jude Wellness Pharmacy",
            owner=self.owner_profile,
        )

        # 2. Setup Workers
        self.pharmacist = User.objects.create(
            username="worker_pharma",
            email="pharma@test.com",
            first_name="Bob",
            last_name="Pillman",
            role="PHARMACIST",
        )
        Membership.objects.create(
            user=self.pharmacist,
            pharmacy=self.pharmacy,
            role="PHARMACIST",
            status=Membership.Status.ACCEPTED,
            is_active=True,
        )

        self.assistant = User.objects.create(
            username="worker_assistant",
            email="assistant@test.com",
            first_name="Charlie",
            last_name="Packer",
            role="OTHER_STAFF",
        )
        Membership.objects.create(
            user=self.assistant,
            pharmacy=self.pharmacy,
            role="ASSISTANT",
            status=Membership.Status.ACCEPTED,
            is_active=True,
        )

        # Unauthorized user (no membership / owner relationship)
        self.stranger = User.objects.create(
            username="stranger_user",
            email="stranger@test.com",
            role="PHARMACIST",
        )

        self.monday = date(2026, 9, 21)
        self.sunday = date(2026, 9, 27)

    def test_roster_period_draft_and_grid_views(self):
        """
        Scenario: Manager views and creates draft roster period, verifies structured grid.
        - GET is completely read-only (side-effect free)
        - POST initializes draft
        - Grid accurately returns assignments, vacant_slots, staff_view, and stacked_view
        """
        self.client.force_authenticate(user=self.owner_user)

        # 1. Side-effect free GET before creation
        get_res = self.client.get(
            f"/attendance/roster/period/?pharmacy_id={self.pharmacy.id}&week_start={self.monday.isoformat()}"
        )
        self.assertEqual(get_res.status_code, 200)
        get_data = get_res.json()
        self.assertIsNone(get_data["period_id"])
        self.assertEqual(get_data["status"], "DRAFT")
        self.assertEqual(get_data["total_assignments"], 0)
        self.assertEqual(len(get_data["assignments"]), 0)
        self.assertEqual(len(get_data["vacant_slots"]), 0)
        self.assertEqual(len(get_data["staff_view"]), 2)
        self.assertEqual(len(get_data["stacked_view"]), 7)  # 7 days represented
        self.assertEqual(RosterPeriod.objects.count(), 0)   # No rows created

        # 2. Explicit POST to create draft
        post_res = self.client.post(
            "/attendance/roster/period/",
            {"pharmacy_id": self.pharmacy.id, "week_start": self.monday.isoformat()},
            format="json",
        )
        self.assertEqual(post_res.status_code, 201)
        post_data = post_res.json()
        self.assertIsNotNone(post_data["period_id"])
        self.assertTrue(post_data["created"])
        self.assertEqual(RosterPeriod.objects.count(), 1)
        period_id = post_data["period_id"]

        # 3. Add 1 assigned shift and 1 vacant slot
        shift_assigned = Shift.objects.create(pharmacy=self.pharmacy, role_needed="PHARMACIST")
        slot_assigned = ShiftSlot.objects.create(
            shift=shift_assigned,
            date=self.monday,
            start_time=time(9, 0),
            end_time=time(17, 0),
        )
        assignment = ShiftSlotAssignment.objects.create(
            shift=shift_assigned,
            slot=slot_assigned,
            slot_date=self.monday,
            user=self.pharmacist,
            is_rostered=True,
        )

        shift_vacant = Shift.objects.create(pharmacy=self.pharmacy, role_needed="ASSISTANT")
        slot_vacant = ShiftSlot.objects.create(
            shift=shift_vacant,
            date=self.monday,
            start_time=time(10, 0),
            end_time=time(16, 0),
        )

        # 4. Query GET again: check rich grid views
        grid_res = self.client.get(
            f"/attendance/roster/period/?pharmacy_id={self.pharmacy.id}&week_start={self.monday.isoformat()}"
        )
        self.assertEqual(grid_res.status_code, 200)
        grid_data = grid_res.json()
        self.assertEqual(grid_data["period_id"], period_id)
        self.assertEqual(grid_data["total_assignments"], 1)

        # Check assignments
        self.assertEqual(len(grid_data["assignments"]), 1)
        self.assertEqual(grid_data["assignments"][0]["id"], assignment.id)
        self.assertEqual(grid_data["assignments"][0]["worker_id"], self.pharmacist.id)

        # Check vacant slots
        self.assertEqual(len(grid_data["vacant_slots"]), 1)
        self.assertEqual(grid_data["vacant_slots"][0]["slot_id"], slot_vacant.id)
        self.assertEqual(grid_data["vacant_slots"][0]["role_needed"], "ASSISTANT")

        # Check staff_view
        self.assertEqual(len(grid_data["staff_view"]), 2)
        worker_summary = grid_data["staff_view"][0]
        self.assertEqual(worker_summary["worker_id"], self.pharmacist.id)
        self.assertEqual(worker_summary["total_shifts"], 1)
        self.assertEqual(worker_summary["total_hours"], 8.0)

        # Check stacked_view
        monday_bucket = next(b for b in grid_data["stacked_view"] if b["date"] == self.monday.isoformat())
        self.assertEqual(monday_bucket["total_shifts"], 1)
        self.assertEqual(monday_bucket["vacant_count"], 1)
        self.assertEqual(len(monday_bucket["shifts"]), 2)
        # Chronological sort: 09:00 assigned before 10:00 vacant
        self.assertEqual(monday_bucket["shifts"][0]["type"], "ASSIGNED")
        self.assertEqual(monday_bucket["shifts"][1]["type"], "VACANT")

    def test_pre_publish_validation_rules(self):
        """
        Scenario: Roster validation engine prevents illegal schedule publishing:
        - Role mismatch (e.g. Assistant assigned to Pharmacist shift)
        - Overlapping shifts on the same worker
        - Approved leave conflicts
        - Clean schedule passes validation
        """
        self.client.force_authenticate(user=self.owner_user)
        period, _ = get_or_create_roster_period(self.pharmacy, self.monday, self.owner_user)

        # Case A: Role mismatch
        # Shift requires PHARMACIST, but worker is ASSISTANT
        shift_mismatch = Shift.objects.create(pharmacy=self.pharmacy, role_needed="PHARMACIST")
        slot_mismatch = ShiftSlot.objects.create(
            shift=shift_mismatch,
            date=self.monday,
            start_time=time(9, 0),
            end_time=time(13, 0),
        )
        asgn_mismatch = ShiftSlotAssignment.objects.create(
            shift=shift_mismatch,
            slot=slot_mismatch,
            slot_date=self.monday,
            user=self.assistant,  # Role mismatch!
            is_rostered=True,
        )

        val_res = self.client.post("/attendance/roster/validate/", {"period_id": period.id}, format="json")
        self.assertEqual(val_res.status_code, 200)
        self.assertFalse(val_res.json()["is_valid"])
        self.assertTrue(any(err.get("type") == "ROLE_MISMATCH" for err in val_res.json()["errors"]))

        # Fix role mismatch: assign correct worker (pharmacist)
        asgn_mismatch.user = self.pharmacist
        asgn_mismatch.save()

        # Case B: Overlapping shifts
        # Same worker scheduled on another slot from 12:00 to 17:00 (overlaps 12:00 - 13:00)
        shift_overlap = Shift.objects.create(pharmacy=self.pharmacy, role_needed="PHARMACIST")
        slot_overlap = ShiftSlot.objects.create(
            shift=shift_overlap,
            date=self.monday,
            start_time=time(12, 0),
            end_time=time(17, 0),
        )
        asgn_overlap = ShiftSlotAssignment.objects.create(
            shift=shift_overlap,
            slot=slot_overlap,
            slot_date=self.monday,
            user=self.pharmacist,  # Overlaps!
            is_rostered=True,
        )

        val_res = self.client.post("/attendance/roster/validate/", {"period_id": period.id}, format="json")
        self.assertFalse(val_res.json()["is_valid"])
        self.assertTrue(any(err.get("type") == "SHIFT_OVERLAP" for err in val_res.json()["errors"]))

        # Fix overlap: move second slot to Tuesday
        tuesday = self.monday + timedelta(days=1)
        slot_overlap.date = tuesday
        slot_overlap.save()
        asgn_overlap.slot_date = tuesday
        asgn_overlap.save()

        # Case C: Approved leave conflict
        leave = LeaveRequest.objects.create(
            user=self.pharmacist,
            slot_assignment=asgn_mismatch,
            status="APPROVED",
            leave_type="ANNUAL",
        )

        val_res = self.client.post("/attendance/roster/validate/", {"period_id": period.id}, format="json")
        self.assertFalse(val_res.json()["is_valid"])
        self.assertTrue(any(err.get("type") == "APPROVED_LEAVE_CONFLICT" for err in val_res.json()["errors"]))

        # Remove leave: now roster should be completely valid
        leave.delete()
        val_res = self.client.post("/attendance/roster/validate/", {"period_id": period.id}, format="json")
        self.assertTrue(val_res.json()["is_valid"])
        self.assertEqual(len(val_res.json()["errors"]), 0)

    def test_atomic_publication_and_worker_visibility(self):
        """
        Scenario: Atomic publication updates period status, creates publication audit,
        and makes shifts visible to assigned workers while hiding drafts.
        """
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

        # 1. While DRAFT: Worker sees 0 shifts
        self.client.force_authenticate(user=self.pharmacist)
        w_res = self.client.get("/attendance/roster/worker/")
        self.assertEqual(w_res.status_code, 200)
        self.assertEqual(w_res.json()["total_shifts"], 0)

        # 2. Manager publishes period
        self.client.force_authenticate(user=self.owner_user)
        pub_res = self.client.post(
            "/attendance/roster/publish/",
            {"period_id": period.id, "force_warnings": True},
            format="json",
        )
        self.assertEqual(pub_res.status_code, 200)
        self.assertEqual(pub_res.json()["status"], "PUBLISHED")

        # 3. Verify audit record
        audit = RosterPublicationAudit.objects.filter(roster_period=period).first()
        self.assertIsNotNone(audit)
        self.assertEqual(audit.published_by, self.owner_user)
        self.assertEqual(audit.total_assignments, 1)

        # 4. Worker now sees their published shift
        self.client.force_authenticate(user=self.pharmacist)
        w_res = self.client.get("/attendance/roster/worker/")
        self.assertEqual(w_res.status_code, 200)
        self.assertEqual(w_res.json()["total_shifts"], 1)
        self.assertEqual(w_res.json()["shifts"][0]["assignment_id"], assignment.id)

        # Other worker sees 0
        self.client.force_authenticate(user=self.assistant)
        d_res = self.client.get("/attendance/roster/worker/")
        self.assertEqual(d_res.json()["total_shifts"], 0)

    def test_worker_acknowledgement_metrics(self):
        """
        Scenario: Assigned workers acknowledge published schedule;
        Manager verifies acknowledgement progress metrics.
        """
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
        publish_roster_period(period, self.owner_user)

        # Check acknowledgement status before worker response
        self.client.force_authenticate(user=self.owner_user)
        status_res = self.client.get(f"/attendance/roster/acknowledgements/{period.id}/")
        self.assertEqual(status_res.status_code, 200)
        self.assertEqual(status_res.json()["total_workers"], 1)
        self.assertEqual(status_res.json()["acknowledged_count"], 0)
        self.assertEqual(status_res.json()["pending_count"], 1)

        # Worker acknowledges with note
        self.client.force_authenticate(user=self.pharmacist)
        ack_res = self.client.post(
            "/attendance/roster/acknowledge/",
            {"period_id": period.id, "notes": "Confirmed and ready."},
            format="json",
        )
        self.assertEqual(ack_res.status_code, 200)
        self.assertEqual(ack_res.json()["status"], "ACKNOWLEDGED")

        # Manager checks status again
        self.client.force_authenticate(user=self.owner_user)
        status_res = self.client.get(f"/attendance/roster/acknowledgements/{period.id}/")
        self.assertEqual(status_res.json()["acknowledged_count"], 1)
        self.assertEqual(status_res.json()["pending_count"], 0)
        ack_entry = status_res.json()["workers"][0]
        self.assertEqual(ack_entry["id"], self.pharmacist.id)
        self.assertTrue(ack_entry["is_acknowledged"])
        self.assertEqual(ack_entry["notes"], "Confirmed and ready.")

    def test_copy_roster_week_and_marketplace_protection(self):
        """
        Scenario: Manager copies week N to week N+1.
        - Shifts and slots copy with accurate delta
        - Open marketplace shifts are safely ignored/protected
        - Target period created in DRAFT status
        """
        self.client.force_authenticate(user=self.owner_user)
        source_period, _ = get_or_create_roster_period(self.pharmacy, self.monday, self.owner_user)

        # Roster shift (is_rostered=True)
        r_shift = Shift.objects.create(pharmacy=self.pharmacy, role_needed="PHARMACIST")
        r_slot = ShiftSlot.objects.create(shift=r_shift, date=self.monday, start_time=time(9, 0), end_time=time(17, 0))
        ShiftSlotAssignment.objects.create(
            shift=r_shift,
            slot=r_slot,
            slot_date=self.monday,
            user=self.pharmacist,
            is_rostered=True,
        )

        # Marketplace open shift (is_rostered=False, visibility=PLATFORM)
        m_shift = Shift.objects.create(pharmacy=self.pharmacy, role_needed="ASSISTANT", visibility="PLATFORM")
        ShiftSlot.objects.create(shift=m_shift, date=self.monday, start_time=time(10, 0), end_time=time(18, 0))

        target_monday = self.monday + timedelta(days=7)

        copy_res = self.client.post(
            "/attendance/roster/copy-week/",
            {
                "source_period_id": source_period.id,
                "target_week_start": target_monday.isoformat(),
                "include_assignments": True,
                "overwrite": False,
            },
            format="json",
        )
        self.assertEqual(copy_res.status_code, 200)
        copy_data = copy_res.json()
        self.assertEqual(copy_data["status"], "DRAFT")
        self.assertEqual(copy_data["counts"]["shifts_copied"], 1)  # Only roster shift copied
        self.assertEqual(copy_data["counts"]["assignments_copied"], 1)

        # Verify target week assignments
        target_assignments = ShiftSlotAssignment.objects.filter(
            shift__pharmacy=self.pharmacy,
            slot_date=target_monday,
            is_rostered=True,
        )
        self.assertEqual(target_assignments.count(), 1)
        self.assertEqual(target_assignments.first().user, self.pharmacist)

    def test_roster_templates_lifecycle(self):
        """
        Scenario: Save existing roster period as a reusable template,
        then apply it to a future target week.
        """
        self.client.force_authenticate(user=self.owner_user)
        source_period, _ = get_or_create_roster_period(self.pharmacy, self.monday, self.owner_user)

        shift = Shift.objects.create(pharmacy=self.pharmacy, role_needed="PHARMACIST")
        slot = ShiftSlot.objects.create(shift=shift, date=self.monday, start_time=time(8, 30), end_time=time(16, 30))
        ShiftSlotAssignment.objects.create(
            shift=shift,
            slot=slot,
            slot_date=self.monday,
            user=self.pharmacist,
            is_rostered=True,
        )

        # 1. Save as template
        tmpl_res = self.client.post(
            "/attendance/roster/templates/",
            {
                "from_period_id": source_period.id,
                "name": "Standard Monday Solo Pharmacist",
                "include_users": True,
            },
            format="json",
        )
        self.assertEqual(tmpl_res.status_code, 201)
        tmpl_id = tmpl_res.json()["id"]

        # 2. List templates
        list_res = self.client.get(f"/attendance/roster/templates/?pharmacy_id={self.pharmacy.id}")
        self.assertEqual(list_res.status_code, 200)
        self.assertEqual(len(list_res.json()), 1)
        self.assertEqual(list_res.json()[0]["name"], "Standard Monday Solo Pharmacist")

        # 3. Apply template to week + 14 days
        future_monday = self.monday + timedelta(days=14)
        apply_res = self.client.post(
            "/attendance/roster/templates/apply/",
            {
                "template_id": tmpl_id,
                "target_week_start": future_monday.isoformat(),
                "include_assignments": True,
                "overwrite": False,
            },
            format="json",
        )
        self.assertEqual(apply_res.status_code, 200)
        self.assertEqual(apply_res.json()["status"], "DRAFT")
        self.assertEqual(apply_res.json()["counts"]["slots_created"], 1)

        # Verify applied assignment exists
        future_asgn = ShiftSlotAssignment.objects.filter(
            shift__pharmacy=self.pharmacy,
            slot_date=future_monday,
            is_rostered=True,
        )
        self.assertEqual(future_asgn.count(), 1)
        self.assertEqual(future_asgn.first().user, self.pharmacist)

    def test_unpublish_reverts_to_draft_and_hides_worker_shifts(self):
        """
        Scenario: Manager unpublishes a published period.
        - Status changes back to DRAFT
        - Worker can no longer view the shifts
        """
        self.client.force_authenticate(user=self.owner_user)
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
        publish_roster_period(period, self.owner_user)

        # Unpublish
        unpub_res = self.client.post(
            "/attendance/roster/unpublish/",
            {"period_id": period.id},
            format="json",
        )
        self.assertEqual(unpub_res.status_code, 200)
        self.assertEqual(unpub_res.json()["status"], "DRAFT")

        period.refresh_from_db()
        self.assertEqual(period.status, RosterPeriod.Status.DRAFT)

        # Worker queries published shifts -> 0
        self.client.force_authenticate(user=self.pharmacist)
        w_res = self.client.get("/attendance/roster/worker/")
        self.assertEqual(w_res.json()["total_shifts"], 0)

    def test_bulk_edit_transactional_safety(self):
        """
        Scenario: Bulk edit operations are atomic: if one operation in the batch fails,
        the entire batch is rolled back and no partial records persist.
        """
        self.client.force_authenticate(user=self.owner_user)
        period, _ = get_or_create_roster_period(self.pharmacy, self.monday, self.owner_user)

        initial_shift_count = Shift.objects.count()

        # Batch containing 1 valid operation and 1 invalid operation (unknown action)
        operations = [
            {
                "action": "create_shift",
                "role_needed": "PHARMACIST",
                "date": self.monday.isoformat(),
                "start_time": "09:00",
                "end_time": "17:00",
            },
            {
                "action": "non_existent_action_that_will_fail",
            },
        ]

        bulk_res = self.client.post(
            "/attendance/roster/bulk-edit/",
            {"period_id": period.id, "operations": operations},
            format="json",
        )
        self.assertEqual(bulk_res.status_code, 400)

        # Transaction rolled back: zero shifts created
        self.assertEqual(Shift.objects.count(), initial_shift_count)

    def test_authorization_enforcement(self):
        """
        Scenario: Non-manager / non-owner users are strictly denied (HTTP 403)
        from managing, validating, publishing, or editing roster periods.
        """
        period, _ = get_or_create_roster_period(self.pharmacy, self.monday, self.owner_user)

        # Pharmacist worker attempts manager actions
        self.client.force_authenticate(user=self.pharmacist)

        # 1. Validate
        res = self.client.post("/attendance/roster/validate/", {"period_id": period.id}, format="json")
        self.assertEqual(res.status_code, 403)

        # 2. Publish
        res = self.client.post("/attendance/roster/publish/", {"period_id": period.id}, format="json")
        self.assertEqual(res.status_code, 403)

        # 3. Unpublish
        res = self.client.post("/attendance/roster/unpublish/", {"period_id": period.id}, format="json")
        self.assertEqual(res.status_code, 403)

        # 4. View period
        res = self.client.get(
            f"/attendance/roster/period/?pharmacy_id={self.pharmacy.id}&week_start={self.monday.isoformat()}"
        )
        self.assertEqual(res.status_code, 403)

        # 5. Stranger attempts
        self.client.force_authenticate(user=self.stranger)
        res = self.client.get(
            f"/attendance/roster/period/?pharmacy_id={self.pharmacy.id}&week_start={self.monday.isoformat()}"
        )
        self.assertEqual(res.status_code, 403)
