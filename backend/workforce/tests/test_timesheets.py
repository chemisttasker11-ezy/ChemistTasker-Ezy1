from datetime import datetime, time, timedelta
from importlib import import_module
from zoneinfo import ZoneInfo

from django.apps import apps
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.test import TestCase
from rest_framework.test import APIRequestFactory, force_authenticate

from client_profile.models import (
    AttendanceEvent,
    AttendanceSession,
    LeaveRequest,
    Membership,
    Organization,
    OwnerOnboarding,
    Pharmacy,
    PharmacyAdmin,
    RosterPeriod,
    Shift,
    ShiftSlot,
    ShiftSlotAssignment,
)
from workforce.attendance_edits import append_missing_punch
from workforce.leave_service import create_leave, decide_leave
from workforce.models import (
    ManagerAttendanceEventAudit, Timesheet, TimesheetCheckDecision, TimesheetPeriod, WorkforceLeaveRequest
)
from workforce.timesheets import build_timesheet, decide_check
from workforce.views import WorkforceLeaveListCreateView
from client_profile.views import LeaveRequestViewSet
from client_profile.roster_validation import worker_issues
from users.models import OrganizationMembership


class TimesheetProjectionTests(TestCase):
    def setUp(self):
        User = get_user_model()
        self.owner = User.objects.create(username="wf_owner", email="wf-owner@example.invalid", role="OWNER")
        self.worker = User.objects.create(username="wf_worker", email="wf-worker@example.invalid", role="PHARMACIST", first_name="Test", last_name="Pharmacist")
        org = Organization.objects.create(name="WF Test Org")
        profile = OwnerOnboarding.objects.create(user=self.owner, role="PHARMACIST", phone_number="0400000000", organization=org)
        self.pharmacy = Pharmacy.objects.create(name="WF Test Pharmacy", owner=profile, organization=org, timezone="Australia/Brisbane")
        self.membership = Membership.objects.create(
            user=self.worker, pharmacy=self.pharmacy, role="PHARMACIST",
            employment_type="FULL_TIME", status=Membership.Status.ACCEPTED, is_active=True,
        )
        self.work_date = datetime.now(ZoneInfo("Australia/Brisbane")).date()
        monday = self.work_date - timedelta(days=self.work_date.weekday())
        self.roster_period = RosterPeriod.objects.create(
            pharmacy=self.pharmacy, week_start=monday, status=RosterPeriod.Status.DRAFT, created_by=self.owner,
        )
        shift = Shift.objects.create(
            pharmacy=self.pharmacy, created_by=self.owner, dedicated_user=self.worker,
            role_needed="PHARMACIST", employment_type="FULL_TIME", min_hourly_rate=50, max_hourly_rate=50,
        )
        slot = ShiftSlot.objects.create(
            shift=shift, date=self.work_date, start_time=time(8, 0), end_time=time(16, 0), planned_break_minutes=30,
            roster_period=self.roster_period,
        )
        self.assignment = ShiftSlotAssignment.objects.create(
            shift=shift, slot=slot, slot_date=self.work_date, user=self.worker, is_rostered=True,
        )
        self.roster_period.status = RosterPeriod.Status.PUBLISHED
        self.roster_period.save(update_fields=["status"])
        tz = ZoneInfo("Australia/Brisbane")
        start = datetime.combine(self.work_date, time(8, 9), tzinfo=tz)
        break_start = datetime.combine(self.work_date, time(12, 0), tzinfo=tz)
        break_end = datetime.combine(self.work_date, time(12, 30), tzinfo=tz)
        end = datetime.combine(self.work_date, time(16, 0), tzinfo=tz)
        self.session = AttendanceSession.objects.create(
            pharmacy=self.pharmacy, user=self.worker, assignment=self.assignment,
            source_membership=self.membership, started_at=start, ended_at=end,
        )
        for event_type, occurred_at in [
            (AttendanceEvent.EventType.CLOCK_IN, start),
            (AttendanceEvent.EventType.BREAK_START, break_start),
            (AttendanceEvent.EventType.BREAK_END, break_end),
            (AttendanceEvent.EventType.CLOCK_OUT, end),
        ]:
            AttendanceEvent.objects.create(
                session=self.session,
                event_type=event_type,
                occurred_at=occurred_at,
                source=AttendanceEvent.Source.QR_KIOSK,
            )
        self.period = TimesheetPeriod.objects.create(
            pharmacy=self.pharmacy, start_date=monday, end_date=monday + timedelta(days=6),
            timezone="Australia/Brisbane", created_by=self.owner,
        )
        self.timesheet = Timesheet.objects.create(period=self.period, user=self.worker, membership=self.membership)

    def test_shift_linked_leave_writes_only_canonical_workforce_record(self):
        row = create_leave(
            self.worker,
            {
                "slot_assignment": self.assignment.pk,
                "leave_type": "ANNUAL",
                "note": "Roster leave",
            },
        )
        self.assertEqual(row.slot_assignment_id, self.assignment.pk)
        self.assertEqual(row.membership_id, self.membership.pk)
        self.assertEqual(row.pharmacy_id, self.pharmacy.pk)
        self.assertEqual(row.user_id, self.worker.pk)
        self.assertEqual(row.start_at.astimezone(ZoneInfo("Australia/Brisbane")).time(), time(8, 0))
        self.assertEqual(row.end_at.astimezone(ZoneInfo("Australia/Brisbane")).time(), time(16, 0))
        self.assertEqual(LeaveRequest.objects.count(), 0)

    def test_compatibility_leave_list_honours_admin_scope(self):
        leave = create_leave(self.worker, {
            "slot_assignment": self.assignment.pk, "leave_type": "ANNUAL",
        })
        manager = get_user_model().objects.create(
            username="wf_scoped_admin", email="wf-scoped-admin@example.invalid", role="EXPLORER",
        )
        assignment = PharmacyAdmin.objects.create(
            user=manager, pharmacy=self.pharmacy,
            admin_level=PharmacyAdmin.AdminLevel.COMMUNICATION_MANAGER,
        )
        view = LeaveRequestViewSet.as_view({"get": "list"})
        request = APIRequestFactory().get("/api/client-profile/leave-requests/")
        force_authenticate(request, user=manager)
        self.assertEqual(view(request).data, [])

        assignment.is_active = False
        assignment.save(update_fields=["is_active"])
        scoped = OrganizationMembership.objects.create(
            user=manager, organization=self.pharmacy.organization,
            role="REGION_ADMIN", admin_level="COMMUNICATION_MANAGER",
            region="Brisbane", job_title="Regional Lead",
        )
        scoped.pharmacies.add(self.pharmacy)
        request = APIRequestFactory().get("/api/client-profile/leave-requests/")
        force_authenticate(request, user=manager)
        self.assertEqual([row["id"] for row in view(request).data], [leave.pk])

        scoped.pharmacies.clear()
        request = APIRequestFactory().get("/api/client-profile/leave-requests/")
        force_authenticate(request, user=manager)
        self.assertEqual(view(request).data, [])

    def test_canonical_approved_leave_blocks_roster_eligibility(self):
        leave = create_leave(self.worker, {
            "slot_assignment": self.assignment.pk, "leave_type": "ANNUAL",
        })
        decide_leave(self.owner, leave.pk, "APPROVED")
        errors, _warnings = worker_issues(
            self.pharmacy, self.worker, self.work_date,
            time(8, 0), time(16, 0), "PHARMACIST",
            exclude_assignment_id=self.assignment.pk,
        )
        self.assertIn("APPROVED_LEAVE_CONFLICT", {error["type"] for error in errors})

    def test_legacy_backfill_preserves_overnight_window_without_membership(self):
        self.roster_period.status = RosterPeriod.Status.DRAFT
        self.roster_period.save(update_fields=["status"])
        self.assignment.slot.start_time = time(22, 0)
        self.assignment.slot.end_time = time(6, 0)
        self.assignment.slot.save(update_fields=["start_time", "end_time"])
        self.membership.delete()
        legacy = LeaveRequest.objects.create(
            slot_assignment=self.assignment, user=self.worker,
            leave_type="SICK", status="APPROVED", note="Overnight shift",
        )
        backfill = import_module("workforce.migrations.0005_consolidate_legacy_leave").backfill_legacy_leave
        backfill(apps, None)
        row = WorkforceLeaveRequest.objects.get(legacy_leave_id=legacy.pk)
        self.assertIsNone(row.membership_id)
        self.assertEqual(row.slot_assignment_id, self.assignment.pk)
        self.assertEqual(row.end_at - row.start_at, timedelta(hours=8))

    def test_legacy_backfill_links_matching_canonical_row_once(self):
        legacy = LeaveRequest.objects.create(
            slot_assignment=self.assignment, user=self.worker,
            leave_type="ANNUAL", status="PENDING", note="Original request",
        )
        start = datetime.combine(self.work_date, time(8, 0), tzinfo=ZoneInfo("Australia/Brisbane"))
        existing = WorkforceLeaveRequest.objects.create(
            pharmacy=self.pharmacy, membership=self.membership, user=self.worker,
            leave_type="ANNUAL", status="PENDING", start_at=start,
            end_at=start + timedelta(hours=8),
        )
        backfill = import_module("workforce.migrations.0005_consolidate_legacy_leave").backfill_legacy_leave
        backfill(apps, None)
        backfill(apps, None)
        existing.refresh_from_db()
        self.assertEqual(existing.legacy_leave_id, legacy.pk)
        self.assertEqual(existing.slot_assignment_id, self.assignment.pk)
        self.assertEqual(WorkforceLeaveRequest.objects.count(), 1)

    def test_shift_leave_cannot_be_approved_after_assignment_transfer(self):
        leave = create_leave(
            self.worker,
            {
                "slot_assignment": self.assignment.pk,
                "leave_type": "ANNUAL",
                "note": "Pending leave",
            },
        )
        self.roster_period.status = RosterPeriod.Status.DRAFT
        self.roster_period.save(update_fields=["status"])
        replacement = get_user_model().objects.create(
            username="wf_replacement",
            email="wf-replacement@example.invalid",
            role="PHARMACIST",
        )
        self.assignment.user = replacement
        self.assignment.save(update_fields=["user"])

        with self.assertRaises(ValidationError):
            decide_leave(self.owner, leave.pk, "APPROVED")

    def test_worker_can_read_manager_rejection_reason(self):
        leave = create_leave(self.worker, {
            "slot_assignment": self.assignment.pk,
            "leave_type": "ANNUAL",
            "note": "Family appointment",
        })
        decide_leave(self.owner, leave.pk, "REJECTED", "Please choose another date.")

        request = APIRequestFactory().get("/api/client-profile/workforce/leave/")
        force_authenticate(request, user=self.worker)
        response = WorkforceLeaveListCreateView.as_view()(request)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data[0]["id"], leave.pk)
        self.assertEqual(response.data[0]["manager_note"], "Please choose another date.")

    def test_shift_linked_leave_does_not_require_fake_membership(self):
        self.roster_period.status = RosterPeriod.Status.DRAFT
        self.roster_period.save(update_fields=["status"])
        User = get_user_model()
        public_worker = User.objects.create(
            username="wf_public_leave",
            email="wf-public-leave@example.invalid",
            role="PHARMACIST",
        )
        shift = Shift.objects.create(
            pharmacy=self.pharmacy,
            created_by=self.owner,
            dedicated_user=public_worker,
            role_needed="PHARMACIST",
            employment_type="LOCUM",
            min_hourly_rate=50,
            max_hourly_rate=50,
        )
        slot = ShiftSlot.objects.create(
            shift=shift,
            date=self.work_date,
            start_time=time(17, 0),
            end_time=time(22, 0),
            roster_period=self.roster_period,
        )
        assignment = ShiftSlotAssignment.objects.create(
            shift=shift,
            slot=slot,
            slot_date=self.work_date,
            user=public_worker,
            is_rostered=True,
        )

        row = create_leave(
            public_worker,
            {
                "slot_assignment": assignment.pk,
                "leave_type": "SICK",
                "note": "Unable to work",
            },
        )
        self.assertIsNone(row.membership_id)
        self.assertEqual(row.slot_assignment_id, assignment.pk)
        self.assertEqual(row.pharmacy_id, self.pharmacy.pk)

    def test_projection_keeps_roster_actual_and_checks_separate(self):
        revision = build_timesheet(self.timesheet.pk, actor=self.owner)
        self.timesheet.refresh_from_db()
        self.assertEqual(self.timesheet.rostered_minutes, 480)
        self.assertEqual(self.timesheet.planned_break_minutes, 30)
        self.assertEqual(self.timesheet.worked_minutes, 441)
        self.assertTrue(revision.checks.filter(code="START_DIFFERS_FROM_ROSTER").exists())
        self.assertFalse(revision.checks.filter(code="MISSING_CLOCK_OUT").exists())
        day = revision.snapshot["days"][0]
        self.assertIsNotNone(day["actual_start"])
        self.assertIsNotNone(day["rostered_start"])

    def test_published_roster_rows_cannot_be_changed(self):
        slot = self.assignment.slot
        slot.start_time = time(9, 0)
        with self.assertRaises(ValidationError):
            slot.save()

        self.assignment.user = self.owner
        with self.assertRaises(ValidationError):
            self.assignment.save()

        self.assignment.shift.description = "Changed after publication"
        with self.assertRaises(ValidationError):
            self.assignment.shift.save()

    def test_projection_is_idempotent_when_sources_unchanged(self):
        first = build_timesheet(self.timesheet.pk, actor=self.owner)
        second = build_timesheet(self.timesheet.pk, actor=self.owner)
        self.assertEqual(first.pk, second.pk)
        self.assertEqual(self.timesheet.revisions.count(), 1)

    def test_missing_clock_out_must_be_fixed_at_source(self):
        # Create a second open session in the same period with a clock-in only.
        self.roster_period.status = RosterPeriod.Status.DRAFT
        self.roster_period.save(update_fields=["status"])
        tz = ZoneInfo("Australia/Brisbane")
        next_day = self.period.start_date + timedelta(days=1)
        shift = Shift.objects.create(
            pharmacy=self.pharmacy, created_by=self.owner, dedicated_user=self.worker,
            role_needed="PHARMACIST", employment_type="FULL_TIME", min_hourly_rate=50, max_hourly_rate=50,
        )
        slot = ShiftSlot.objects.create(
            shift=shift, date=next_day, start_time=time(9, 0), end_time=time(17, 0), roster_period=self.roster_period,
        )
        assignment = ShiftSlotAssignment.objects.create(
            shift=shift, slot=slot, slot_date=next_day, user=self.worker, is_rostered=True,
        )
        self.roster_period.status = RosterPeriod.Status.PUBLISHED
        self.roster_period.save(update_fields=["status"])
        started = datetime.combine(next_day, time(9, 0), tzinfo=tz)
        open_session = AttendanceSession.objects.create(
            pharmacy=self.pharmacy, user=self.worker, assignment=assignment, source_membership=self.membership,
            started_at=started, ended_at=None,
        )
        AttendanceEvent.objects.create(
            session=open_session, event_type=AttendanceEvent.EventType.CLOCK_IN, occurred_at=started,
            source=AttendanceEvent.Source.QR_KIOSK,
        )
        revision = build_timesheet(self.timesheet.pk, actor=self.owner, force=True)
        blocker = revision.checks.get(code="MISSING_CLOCK_OUT")
        with self.assertRaises(ValidationError):
            decide_check(blocker, self.owner, TimesheetCheckDecision.Decision.WAIVED, "Ignore it")

        event = append_missing_punch(
            timesheet=self.timesheet, manager=self.owner, session_id=open_session.pk,
            event_type=AttendanceEvent.EventType.CLOCK_OUT,
            occurred_at=datetime.combine(next_day, time(17, 5), tzinfo=tz),
            reason="Worker confirmed finish; manager verified closing duties.",
        )
        self.assertEqual(event.source, AttendanceEvent.Source.MANAGER)
        self.assertTrue(ManagerAttendanceEventAudit.objects.filter(event=event, created_by=self.owner).exists())
        updated = build_timesheet(self.timesheet.pk, actor=self.owner, force=True)
        self.assertFalse(updated.checks.filter(code="MISSING_CLOCK_OUT").exists())

    def test_full_day_leave_counts_only_published_roster_overlap(self):
        self.roster_period.status = RosterPeriod.Status.DRAFT
        self.roster_period.save(update_fields=["status"])
        User = get_user_model()
        worker = User.objects.create(
            username="wf_leave_worker", email="wf-leave@example.invalid", role="PHARMACIST",
            first_name="Leave", last_name="Worker",
        )
        membership = Membership.objects.create(
            user=worker, pharmacy=self.pharmacy, role="PHARMACIST",
            employment_type="FULL_TIME", status=Membership.Status.ACCEPTED, is_active=True,
        )
        shift = Shift.objects.create(
            pharmacy=self.pharmacy, created_by=self.owner, dedicated_user=worker,
            role_needed="PHARMACIST", employment_type="FULL_TIME", min_hourly_rate=50, max_hourly_rate=50,
        )
        slot = ShiftSlot.objects.create(
            shift=shift, date=self.work_date, start_time=time(8, 0), end_time=time(16, 0),
            roster_period=self.roster_period,
        )
        ShiftSlotAssignment.objects.create(
            shift=shift, slot=slot, slot_date=self.work_date, user=worker, is_rostered=True,
        )
        self.roster_period.status = RosterPeriod.Status.PUBLISHED
        self.roster_period.save(update_fields=["status"])
        tz = ZoneInfo("Australia/Brisbane")
        WorkforceLeaveRequest.objects.create(
            pharmacy=self.pharmacy, membership=membership, user=worker, leave_type="ANNUAL",
            start_at=datetime.combine(self.work_date, time.min, tzinfo=tz),
            end_at=datetime.combine(self.work_date + timedelta(days=1), time.min, tzinfo=tz),
            status=WorkforceLeaveRequest.Status.APPROVED,
        )
        timesheet = Timesheet.objects.create(period=self.period, user=worker, membership=membership)
        revision = build_timesheet(timesheet.pk, actor=self.owner, force=True)
        timesheet.refresh_from_db()
        self.assertEqual(timesheet.approved_leave_minutes, 480)
        self.assertFalse(revision.checks.filter(code="ROSTER_WITHOUT_ATTENDANCE").exists())
