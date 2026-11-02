from datetime import date, datetime, time, timedelta, timezone as datetime_timezone
from unittest.mock import patch
from zoneinfo import ZoneInfo

from django.core.exceptions import ValidationError
from django.test import TestCase, override_settings
from rest_framework.test import APIRequestFactory, force_authenticate

from attendance.approvals import approve_provisional_attendance, create_attendance_correction
from attendance.models import AttendanceEvent, AttendanceSession, ProvisionalAttendance
from client_profile.characterization_support import make_owner_with_pharmacy, make_user
from memberships.models import Membership
from shifts.models import Shift, ShiftSlot, ShiftSlotAssignment
from workforce.models import RosterPeriod, Timesheet, TimesheetApproval, TimesheetPeriod
from workforce.timesheet_transitions import approve_timesheet
from workforce.timesheets import (
    build_timesheet,
    rebuild_period,
)
from workforce.views import TimesheetPeriodListCreateView


@override_settings(TIME_ZONE="UTC")
class WorkforceTimezoneResolutionTests(TestCase):
    def setUp(self):
        self.owner, self.pharmacy = make_owner_with_pharmacy("Timezone timesheets")
        self.pharmacy.state = "NSW"
        self.pharmacy.timezone = None
        self.pharmacy.save(update_fields=["state", "timezone"])
        self.worker = make_user("PHARMACIST")
        self.membership = Membership.objects.create(
            user=self.worker, pharmacy=self.pharmacy, role="PHARMACIST",
            employment_type="CASUAL", status=Membership.Status.ACCEPTED, is_active=True,
        )
        self.period = TimesheetPeriod.objects.create(
            pharmacy=self.pharmacy, start_date=date(2026, 1, 5), end_date=date(2026, 1, 11),
            timezone="Australia/Brisbane", created_by=self.owner,
        )
        self.timesheet = Timesheet.objects.create(
            period=self.period, user=self.worker, membership=self.membership,
        )

    def test_period_creation_uses_resolved_timezone_without_updating_existing_periods(self):
        for explicit, state, postcode, expected in (
            (None, " qld ", None, "Australia/Brisbane"),
            ("invalid-zone", "NSW", "2880", "Australia/Broken_Hill"),
            ("Australia/Perth", "NSW", "2880", "Australia/Perth"),
            (None, None, None, "UTC"),
        ):
            with self.subTest(explicit=explicit, state=state, postcode=postcode):
                self.pharmacy.timezone, self.pharmacy.state, self.pharmacy.postcode = explicit, state, postcode
                self.pharmacy.save(update_fields=["timezone", "state", "postcode"])
                start = self.period.end_date + timedelta(days=1)
                request = APIRequestFactory().post("/api/v1/workforce/timesheet-periods/", {
                    "pharmacy_id": self.pharmacy.pk, "start_date": str(start), "end_date": str(start),
                }, format="json")
                force_authenticate(request, user=self.owner)
                response = TimesheetPeriodListCreateView.as_view()(request)
                self.assertEqual(response.status_code, 201, response.data)
                created = TimesheetPeriod.objects.get(pk=response.data["id"])
                self.assertEqual(created.timezone, expected)
                # A repeated create is a read of the existing period, not a rebuild.
                TimesheetPeriod.objects.filter(pk=created.pk).update(timezone="Australia/Darwin")
                request = APIRequestFactory().post("/api/v1/workforce/timesheet-periods/", {
                    "pharmacy_id": self.pharmacy.pk, "start_date": str(start), "end_date": str(start),
                }, format="json")
                force_authenticate(request, user=self.owner)
                self.assertEqual(TimesheetPeriodListCreateView.as_view()(request).status_code, 200)
                created.refresh_from_db()
                self.assertEqual(created.timezone, "Australia/Darwin")
                created.delete()
                self.pharmacy.refresh_from_db()
                self.assertEqual(self.pharmacy.timezone, explicit)

    def test_utc_attendance_uses_local_period_bounds_and_work_date(self):
        start = datetime(2026, 1, 4, 13, 30, tzinfo=datetime_timezone.utc)
        end = start + timedelta(hours=1)
        session = AttendanceSession.objects.create(
            pharmacy=self.pharmacy, user=self.worker, source_membership=self.membership,
            started_at=start, ended_at=end,
        )
        for kind, occurred_at in ((AttendanceEvent.EventType.CLOCK_IN, start), (AttendanceEvent.EventType.CLOCK_OUT, end)):
            AttendanceEvent.objects.create(
                session=session, event_type=kind, occurred_at=occurred_at,
                source=AttendanceEvent.Source.QR_KIOSK,
            )
        revision = build_timesheet(self.timesheet.pk)
        self.assertEqual(revision.worked_minutes, 60)
        self.assertEqual(revision.snapshot["days"][0]["date"], "2026-01-05")
        self.assertEqual(revision.snapshot["period"]["timezone"], "Australia/Sydney")
        self.period.refresh_from_db()
        self.assertEqual(self.period.timezone, "Australia/Sydney")
        self.pharmacy.refresh_from_db()
        self.assertIsNone(self.pharmacy.timezone)

    def test_timezone_change_aligns_period_metadata_without_changing_fingerprint(self):
        first = build_timesheet(self.timesheet.pk)
        self.assertEqual(build_timesheet(self.timesheet.pk).pk, first.pk)
        self.pharmacy.state = "QLD"
        self.pharmacy.save(update_fields=["state"])
        revisions = rebuild_period(self.period.pk)
        self.assertEqual(len(revisions), 1)
        self.assertEqual(revisions[0].pk, first.pk)
        self.assertEqual(revisions[0].source_fingerprint, first.source_fingerprint)
        self.period.refresh_from_db()
        self.assertEqual(self.period.timezone, "Australia/Brisbane")

    def test_review_period_metadata_aligns_even_when_revision_inputs_are_unchanged(self):
        first = build_timesheet(self.timesheet.pk)
        TimesheetPeriod.objects.filter(pk=self.period.pk).update(
            timezone="Australia/Darwin", status=TimesheetPeriod.Status.REVIEW,
        )
        self.assertEqual(build_timesheet(self.timesheet.pk).pk, first.pk)
        self.period.refresh_from_db()
        self.assertEqual(self.period.timezone, "Australia/Sydney")

    def test_approved_and_locked_periods_do_not_align_timezone(self):
        first = build_timesheet(self.timesheet.pk)
        self.assertEqual(first.snapshot["period"]["timezone"], "Australia/Sydney")
        self.period.refresh_from_db()
        self.assertEqual(self.period.timezone, "Australia/Sydney")

        self.pharmacy.state = "QLD"
        self.pharmacy.save(update_fields=["state"])

        self.period.status = TimesheetPeriod.Status.APPROVED
        self.period.save(update_fields=["status"])
        build_timesheet(self.timesheet.pk)
        self.period.refresh_from_db()
        self.assertEqual(self.period.timezone, "Australia/Sydney")

        self.period.status = TimesheetPeriod.Status.LOCKED
        self.period.save(update_fields=["status"])
        self.assertEqual(rebuild_period(self.period.pk), [])
        with self.assertRaisesMessage(ValidationError, "cannot be recalculated"):
            build_timesheet(self.timesheet.pk)
        self.period.refresh_from_db()
        self.assertEqual(self.period.timezone, "Australia/Sydney")

    def _approved_summer_roster_before_timezone_fix(self):
        self.pharmacy.state = "QLD"
        self.pharmacy.save(update_fields=["state"])
        roster = RosterPeriod.objects.create(
            pharmacy=self.pharmacy, week_start=self.period.start_date,
            status=RosterPeriod.Status.DRAFT, created_by=self.owner,
        )
        shift = Shift.objects.create(
            pharmacy=self.pharmacy, created_by=self.owner, role_needed="PHARMACIST",
            employment_type="CASUAL", dedicated_user=self.worker,
        )
        slot = ShiftSlot.objects.create(
            shift=shift, date=self.period.start_date, start_time=time(8), end_time=time(16),
            roster_period=roster,
        )
        assignment = ShiftSlotAssignment.objects.create(
            shift=shift, slot=slot, slot_date=slot.date, user=self.worker, is_rostered=True,
        )
        roster.status = RosterPeriod.Status.PUBLISHED
        roster.save(update_fields=["status"])
        old_zone = ZoneInfo("Australia/Sydney")
        start = datetime.combine(slot.date, time(8), tzinfo=old_zone)
        end = datetime.combine(slot.date, time(16), tzinfo=old_zone)
        session = AttendanceSession.objects.create(
            pharmacy=self.pharmacy, user=self.worker, source_membership=self.membership,
            assignment=assignment, started_at=start, ended_at=end,
        )
        AttendanceEvent.objects.create(
            session=session, event_type=AttendanceEvent.EventType.CLOCK_IN,
            occurred_at=start, source=AttendanceEvent.Source.QR_KIOSK,
        )
        clock_out = AttendanceEvent.objects.create(
            session=session, event_type=AttendanceEvent.EventType.CLOCK_OUT,
            occurred_at=end, source=AttendanceEvent.Source.QR_KIOSK,
        )
        # Simulate the pre-deployment Sydney fallback for a QLD store with no explicit zone.
        with patch("workforce.timesheet_core.get_pharmacy_timezone", return_value=old_zone), patch(
            "workforce.roster.validation.get_pharmacy_timezone", return_value=old_zone,
        ):
            first = build_timesheet(self.timesheet.pk)
        approve_timesheet(self.timesheet, self.owner, first.revision_number)
        self.timesheet.refresh_from_db()
        self.assertEqual(self.timesheet.status, Timesheet.Status.APPROVED)
        self.assertEqual(self.timesheet.reviewed_minutes, 480)
        return first, slot, clock_out

    def test_timezone_only_projection_preserves_approved_rostered_revision(self):
        first, _, _ = self._approved_summer_roster_before_timezone_fix()
        for _ in range(2):
            self.assertEqual(rebuild_period(self.period.pk)[0].pk, first.pk)
        self.timesheet.refresh_from_db()
        self.assertEqual(self.timesheet.status, Timesheet.Status.APPROVED)
        self.assertEqual(self.timesheet.reviewed_minutes, 480)
        self.assertEqual(self.timesheet.source_fingerprint, first.source_fingerprint)
        self.assertEqual(self.timesheet.revisions.count(), 1)
        self.assertTrue(TimesheetApproval.objects.filter(
            revision=first, kind=TimesheetApproval.Kind.TIME_APPROVAL,
        ).exists())
        self.pharmacy.refresh_from_db()
        self.assertIsNone(self.pharmacy.timezone)

    def test_attendance_correction_still_reopens_after_timezone_projection_change(self):
        first, _, clock_out = self._approved_summer_roster_before_timezone_fix()
        create_attendance_correction(
            self.owner, clock_out.pk, corrected_timestamp=clock_out.occurred_at + timedelta(hours=1),
            reason="Approved overtime",
        )
        updated = build_timesheet(self.timesheet.pk)
        self.timesheet.refresh_from_db()
        self.assertNotEqual(updated.pk, first.pk)
        self.assertEqual(self.timesheet.status, Timesheet.Status.REOPENED)
        self.assertEqual(self.timesheet.reviewed_minutes, 0)
        self.assertEqual(updated.worked_minutes, 540)
        self.assertEqual(updated.snapshot["period"]["timezone"], "Australia/Brisbane")

    def _boundary_attendance(self, *, provisional=False, start_time=time(23, 10)):
        start = datetime.combine(self.period.end_date, start_time, tzinfo=ZoneInfo("Australia/Brisbane"))
        end = start + timedelta(minutes=40)
        session = AttendanceSession.objects.create(
            pharmacy=self.pharmacy, user=self.worker, source_membership=self.membership,
            started_at=start, ended_at=end, is_provisional=provisional,
        )
        if provisional:
            ProvisionalAttendance.objects.create(
                session=session, cover_type=ProvisionalAttendance.CoverType.UNROSTERED_LOCAL,
            )
        AttendanceEvent.objects.create(
            session=session, event_type=AttendanceEvent.EventType.CLOCK_IN,
            occurred_at=start, source=AttendanceEvent.Source.QR_KIOSK,
        )
        return AttendanceEvent.objects.create(
            session=session, event_type=AttendanceEvent.EventType.CLOCK_OUT,
            occurred_at=end, source=AttendanceEvent.Source.QR_KIOSK,
        )

    def test_new_boundary_attendance_reopens_after_timezone_projection_change(self):
        first, _, _ = self._approved_summer_roster_before_timezone_fix()
        self._boundary_attendance()
        updated = rebuild_period(self.period.pk)[0]
        self.timesheet.refresh_from_db()
        self.assertNotEqual(updated.pk, first.pk)
        self.assertEqual(self.timesheet.status, Timesheet.Status.REOPENED)
        self.assertEqual(self.timesheet.reviewed_minutes, 0)
        self.assertEqual(updated.worked_minutes, 520)
        self.assertEqual(updated.snapshot["period"]["timezone"], "Australia/Brisbane")

    def test_boundary_correction_reopens_after_timezone_projection_change(self):
        clock_out = self._boundary_attendance()
        first, _, _ = self._approved_summer_roster_before_timezone_fix()
        # Both the original and corrected interval are outside the old Sydney bounds.
        create_attendance_correction(
            self.owner, clock_out.pk, corrected_timestamp=clock_out.occurred_at + timedelta(minutes=5),
            reason="Correct boundary finish",
        )
        updated = build_timesheet(self.timesheet.pk)
        self.timesheet.refresh_from_db()
        self.assertNotEqual(updated.pk, first.pk)
        self.assertEqual(self.timesheet.status, Timesheet.Status.REOPENED)
        self.assertEqual(self.timesheet.reviewed_minutes, 0)
        self.assertEqual(updated.worked_minutes, 525)
        self.assertEqual(updated.snapshot["period"]["timezone"], "Australia/Brisbane")

    def test_unchanged_boundary_attendance_preserves_timezone_only_approval(self):
        self._boundary_attendance()
        first, _, _ = self._approved_summer_roster_before_timezone_fix()
        for _ in range(2):
            self.assertEqual(build_timesheet(self.timesheet.pk).pk, first.pk)
        self.timesheet.refresh_from_db()
        self.assertEqual(self.timesheet.status, Timesheet.Status.APPROVED)
        self.assertEqual(self.timesheet.reviewed_minutes, 480)
        self.assertEqual(self.timesheet.revisions.count(), 1)
        self.assertEqual(self.timesheet.source_fingerprint, first.source_fingerprint)

    def test_boundary_provisional_approval_reopens_after_timezone_projection_change(self):
        clock_out = self._boundary_attendance(provisional=True)
        first, _, _ = self._approved_summer_roster_before_timezone_fix()
        session = clock_out.session
        self.assertLess(session.updated_at, first.created_at)
        self.assertLess(clock_out.recorded_at, first.created_at)

        decision = approve_provisional_attendance(self.owner, session.provisional_review.pk)
        session.refresh_from_db()
        self.assertGreater(session.updated_at, first.created_at)
        self.assertGreater(decision.decided_at, first.created_at)
        self.assertFalse(session.is_provisional)
        self.assertEqual(session.assignment_id, decision.backfill_assignment_id)
        self.assertFalse(decision.backfill_assignment.is_rostered)
        self.timesheet.refresh_from_db()
        self.assertTrue(self.timesheet.needs_rebuild)

        updated = rebuild_period(self.period.pk)[0]
        self.timesheet.refresh_from_db()
        self.assertEqual(updated.revision_number, first.revision_number + 1)
        self.assertEqual(self.timesheet.status, Timesheet.Status.REOPENED)
        self.assertEqual(self.timesheet.reviewed_minutes, 0)
        self.assertEqual(updated.worked_minutes, 520)
        self.assertEqual(updated.snapshot["period"]["timezone"], "Australia/Brisbane")

    def test_normal_provisional_approval_remains_approvable(self):
        first, _, _ = self._approved_summer_roster_before_timezone_fix()
        clock_out = self._boundary_attendance(provisional=True, start_time=time(18, 10))
        approve_provisional_attendance(self.owner, clock_out.session.provisional_review.pk)
        updated = build_timesheet(self.timesheet.pk)
        self.assertEqual(updated.revision_number, first.revision_number + 1)
        self.assertEqual(updated.worked_minutes, 520)
        self.assertFalse(updated.checks.filter(code="UNRESOLVED_PROVISIONAL_ATTENDANCE").exists())
        approve_timesheet(self.timesheet, self.owner, updated.revision_number)
        self.timesheet.refresh_from_db()
        self.assertEqual(self.timesheet.status, Timesheet.Status.APPROVED)
        self.assertEqual(self.timesheet.reviewed_minutes, 520)

    def test_changed_roster_still_reopens_after_timezone_projection_change(self):
        first, slot, _ = self._approved_summer_roster_before_timezone_fix()
        roster = slot.roster_period
        roster.status = RosterPeriod.Status.DRAFT
        roster.save(update_fields=["status"])
        slot.end_time = time(17)
        slot.save(update_fields=["end_time"])
        roster.status = RosterPeriod.Status.PUBLISHED
        roster.save(update_fields=["status"])
        updated = build_timesheet(self.timesheet.pk)
        self.timesheet.refresh_from_db()
        self.assertNotEqual(updated.pk, first.pk)
        self.assertEqual(self.timesheet.status, Timesheet.Status.REOPENED)
        self.assertEqual(self.timesheet.reviewed_minutes, 0)
        self.assertEqual(updated.rostered_minutes, 540)
