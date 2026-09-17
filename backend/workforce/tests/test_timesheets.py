from datetime import datetime, time, timedelta
from zoneinfo import ZoneInfo

from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.test import TestCase

from client_profile.models import (
    AttendanceEvent,
    AttendanceSession,
    Membership,
    Organization,
    OwnerOnboarding,
    Pharmacy,
    RosterPeriod,
    Shift,
    ShiftSlot,
    ShiftSlotAssignment,
)
from workforce.attendance_edits import append_missing_punch
from workforce.models import (
    ManagerAttendanceEventAudit, Timesheet, TimesheetCheckDecision, TimesheetPeriod, WorkforceLeaveRequest
)
from workforce.timesheets import build_timesheet, decide_check


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
            pharmacy=self.pharmacy, week_start=monday, status=RosterPeriod.Status.PUBLISHED, created_by=self.owner,
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

    def test_projection_is_idempotent_when_sources_unchanged(self):
        first = build_timesheet(self.timesheet.pk, actor=self.owner)
        second = build_timesheet(self.timesheet.pk, actor=self.owner)
        self.assertEqual(first.pk, second.pk)
        self.assertEqual(self.timesheet.revisions.count(), 1)

    def test_missing_clock_out_must_be_fixed_at_source(self):
        # Create a second open session in the same period with a clock-in only.
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
