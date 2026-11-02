"""The timesheet state machine: submit, approve, reopen, check decisions, comments and locking a period.

Reuses the projection tests' fixture (a pharmacist rostered and clocked in a published roster week, with a timesheet
period). The transitions are called through workforce.timesheets, their historical import path.
"""
from django.contrib.auth import get_user_model
from django.core.exceptions import PermissionDenied, ValidationError
from django.test import TestCase
from unittest import mock
from rest_framework.test import APIRequestFactory, force_authenticate

from workforce.models import (
    Timesheet,
    TimesheetApproval,
    TimesheetCheck,
    TimesheetCheckDecision,
    TimesheetComment,
    TimesheetManifest,
    TimesheetPeriod,
)
from workforce.tests import test_timesheets as projection
from workforce.views import TimesheetDetailView
from workforce.timesheets import (
    add_comment,
    approve_timesheet,
    build_timesheet,
    correct_locked_period,
    decide_check,
    ensure_period_timesheets,
    lock_period,
    reopen_timesheet,
    submit_timesheet,
)


class TimesheetStateMachineTests(TestCase):
    setUp = projection.TimesheetProjectionTests.setUp  # reuse the fixture without collecting those tests here

    def built(self):
        revision = build_timesheet(self.timesheet.pk, actor=self.owner)
        self.timesheet.refresh_from_db()
        return revision

    def test_payroll_manifest_uses_frozen_assignment_settlement(self):
        from shifts.models import ShiftSlotAssignment

        self.pharmacy.use_chemisttasker_payroll = True
        self.pharmacy.save(update_fields=["use_chemisttasker_payroll"])
        ShiftSlotAssignment.objects.filter(pk=self.assignment.pk).update(settlement_channel="PAYROLL")
        self.built()
        manifest = self.lock_all()
        self.assertEqual(manifest.snapshot["payroll_export"][0]["assignment_ids"], [self.assignment.pk])
        self.assertEqual(manifest.snapshot["payroll_export"][0]["days"][0]["assignment_id"], self.assignment.pk)
        # Later source edits cannot rewrite an already locked manifest.
        ShiftSlotAssignment.objects.filter(pk=self.assignment.pk).update(settlement_channel="INVOICE")
        self.assertEqual(lock_period(self.period, self.owner).manifest_hash, manifest.manifest_hash)

    def test_invoice_assignments_stay_out_of_payroll_export(self):
        from shifts.models import ShiftSlotAssignment

        self.pharmacy.use_chemisttasker_payroll = True
        self.pharmacy.save(update_fields=["use_chemisttasker_payroll"])
        ShiftSlotAssignment.objects.filter(pk=self.assignment.pk).update(settlement_channel="INVOICE")
        self.built()
        manifest = self.lock_all()
        routing = manifest.snapshot["timesheets"][0]["settlement_routing"]
        self.assertEqual(routing["invoice_assignment_ids"], [self.assignment.pk])
        self.assertEqual(routing["payroll_assignment_ids"], [])
        self.assertEqual(manifest.snapshot["payroll_export"], [])

    def test_timesheet_only_assignments_stay_out_of_payroll_export(self):
        from shifts.models import ShiftSlotAssignment

        self.pharmacy.use_chemisttasker_payroll = True
        self.pharmacy.save(update_fields=["use_chemisttasker_payroll"])
        ShiftSlotAssignment.objects.filter(pk=self.assignment.pk).update(settlement_channel="TIMESHEET_ONLY")
        self.built()
        manifest = self.lock_all()
        routing = manifest.snapshot["timesheets"][0]["settlement_routing"]
        self.assertEqual(routing["timesheet_only_assignment_ids"], [self.assignment.pk])
        self.assertEqual(routing["payroll_assignment_ids"], [])
        self.assertEqual(manifest.snapshot["payroll_export"], [])

    def test_legacy_payroll_revision_requires_rebuild_and_review_before_lock(self):
        self.pharmacy.use_chemisttasker_payroll = True
        self.pharmacy.save(update_fields=["use_chemisttasker_payroll"])
        revision = self.built()
        approve_timesheet(self.timesheet, self.owner, revision.revision_number)
        legacy = dict(revision.snapshot)
        legacy.pop("roster", None)
        type(revision).objects.filter(pk=revision.pk).update(snapshot=legacy)
        with self.assertRaisesMessage(ValidationError, "Recalculate and review"):
            lock_period(self.period, self.owner)
        replacement = self.built()
        self.assertGreater(replacement.revision_number, revision.revision_number)
        self.assertIn("roster", replacement.snapshot)
        self.timesheet.refresh_from_db()
        self.assertNotEqual(self.timesheet.status, Timesheet.Status.APPROVED)
        approve_timesheet(self.timesheet, self.owner, replacement.revision_number)
        self.assertEqual(lock_period(self.period, self.owner).period_id, self.period.pk)

    def test_submit_is_the_workers_own_and_revision_checked(self):
        revision = self.built()
        with self.assertRaisesMessage(PermissionDenied, "Workers can only submit their own timesheets."):
            submit_timesheet(self.timesheet, self.owner, revision.revision_number)
        with self.assertRaisesMessage(ValidationError, "Timesheet changed. Refresh before submitting."):
            submit_timesheet(self.timesheet, self.worker, revision.revision_number + 1)
        Timesheet.objects.filter(pk=self.timesheet.pk).update(needs_rebuild=True)
        self.timesheet.refresh_from_db()
        with self.assertRaisesMessage(ValidationError, "Timesheet needs recalculation before submission."):
            submit_timesheet(self.timesheet, self.worker, revision.revision_number)
        Timesheet.objects.filter(pk=self.timesheet.pk).update(needs_rebuild=False)
        self.timesheet.refresh_from_db()
        self.assertEqual(submit_timesheet(self.timesheet, self.worker, revision.revision_number), revision)
        self.timesheet.refresh_from_db()
        self.assertEqual(self.timesheet.status, Timesheet.Status.SUBMITTED)
        self.assertTrue(TimesheetApproval.objects.filter(revision=revision, actor=self.worker,
                                                        kind=TimesheetApproval.Kind.EMPLOYEE_SUBMIT).exists())

    def test_approve_records_reviewed_minutes_and_does_not_require_a_submission(self):
        revision = self.built()
        with self.assertRaises(PermissionDenied):
            approve_timesheet(self.timesheet, self.worker, revision.revision_number)
        with self.assertRaisesMessage(ValidationError, "Timesheet changed. Refresh and review the current revision."):
            approve_timesheet(self.timesheet, self.owner, revision.revision_number + 1)
        # CURRENT BEHAVIOUR: a manager can approve a timesheet the worker has not submitted
        self.assertNotEqual(self.timesheet.status, Timesheet.Status.SUBMITTED)
        approve_timesheet(self.timesheet, self.owner, revision.revision_number, reason="  ok  ")
        self.timesheet.refresh_from_db()
        self.assertEqual((self.timesheet.status, self.timesheet.reviewed_minutes),
                         (Timesheet.Status.APPROVED, revision.worked_minutes))
        approval = TimesheetApproval.objects.get(revision=revision, kind=TimesheetApproval.Kind.TIME_APPROVAL)
        self.assertEqual((approval.actor_id, approval.reason), (self.owner.pk, "ok"))

    def test_open_blockers_prevent_approval(self):
        revision = self.built()
        blocker = TimesheetCheck.objects.create(revision=revision, identity_key="test-blocker", code="TEST_BLOCKER",
                                                severity=TimesheetCheck.Severity.BLOCKER, message="Blocked")
        with self.assertRaises(ValidationError) as caught:
            approve_timesheet(self.timesheet, self.owner, revision.revision_number)
        self.assertEqual(caught.exception.message_dict["code"], ["TIMESHEET_BLOCKERS"])
        self.assertIn(str(blocker.pk), str(caught.exception.message_dict["check_ids"]))
        decide_check(blocker, self.owner, TimesheetCheckDecision.Decision.WAIVED, "Agreed with worker")
        approve_timesheet(self.timesheet, self.owner, revision.revision_number)
        self.timesheet.refresh_from_db()
        self.assertEqual(self.timesheet.status, Timesheet.Status.APPROVED)

    def test_check_decision_rules(self):
        revision = self.built()
        source = TimesheetCheck.objects.create(revision=revision, identity_key="missing-out", code="MISSING_CLOCK_OUT",
                                               severity=TimesheetCheck.Severity.BLOCKER, message="Missing")
        with self.assertRaisesMessage(ValidationError, "must be corrected at the attendance source"):
            decide_check(source, self.owner, TimesheetCheckDecision.Decision.WAIVED, "x")
        check = revision.checks.exclude(pk=source.pk).first()
        with self.assertRaisesMessage(ValidationError, "Invalid check decision."):
            decide_check(check, self.owner, "IGNORED", "x")
        with self.assertRaisesMessage(ValidationError, "A reason is required to resolve or waive a timesheet check."):
            decide_check(check, self.owner, TimesheetCheckDecision.Decision.RESOLVED, "  ")
        with self.assertRaises(PermissionDenied):
            decide_check(check, self.worker, TimesheetCheckDecision.Decision.RESOLVED, "x")
        decision = decide_check(check, self.owner, TimesheetCheckDecision.Decision.REOPENED, "")
        self.assertEqual((decision.decision, decision.reason), (TimesheetCheckDecision.Decision.REOPENED, ""))

    def test_reopen_and_comments(self):
        revision = self.built()
        approve_timesheet(self.timesheet, self.owner, revision.revision_number)
        with self.assertRaisesMessage(ValidationError, "A reason is required to reopen a timesheet."):
            reopen_timesheet(self.timesheet, self.owner, " ")
        reopen_timesheet(self.timesheet, self.owner, "Wrong break")
        self.timesheet.refresh_from_db()
        self.assertEqual(self.timesheet.status, Timesheet.Status.REOPENED)

        with self.assertRaisesMessage(ValidationError, "Comment cannot be empty."):
            add_comment(self.timesheet, self.worker, "  ")
        worker_comment = add_comment(self.timesheet, self.worker, " Please check ", worker_visible=False)
        manager_note = add_comment(self.timesheet, self.owner, "Internal", worker_visible=False)
        self.assertEqual((worker_comment.body, worker_comment.worker_visible, manager_note.worker_visible),
                         ("Please check", True, False))
        self.assertEqual(TimesheetComment.objects.filter(timesheet=self.timesheet).count(), 2)

    def lock_all(self):
        for timesheet in self.period.timesheets.all():
            current = build_timesheet(timesheet.pk, actor=self.owner)
            timesheet.refresh_from_db()
            approve_timesheet(timesheet, self.owner, current.revision_number)
        return lock_period(self.period, self.owner)

    def test_a_locked_period_can_be_corrected_on_purpose_and_relocked_as_an_adjustment(self):
        self.built()
        original = self.lock_all()
        original_hash, original_content = original.manifest_hash, dict(original.snapshot)

        with self.assertRaises(PermissionDenied):
            correct_locked_period(self.period, self.worker, "Wrong hours")
        with self.assertRaisesMessage(ValidationError, "A reason is required to correct a locked period."):
            correct_locked_period(self.period, self.owner, "  ")

        correction = correct_locked_period(self.period, self.owner, "Break entered twice")
        self.period.refresh_from_db()
        self.assertEqual((self.period.status, self.period.locked_at), (TimesheetPeriod.Status.OPEN, None))
        manifest = TimesheetManifest.objects.get(period=self.period)
        self.assertEqual(manifest.manifest_hash, original_hash, "the manifest is kept until the period is locked again")
        self.assertEqual(
            (correction["superseded_manifest_hash"], correction["superseded_manifest"]),
            (original_hash, original_content),
            "the superseded manifest content is kept for audit",
        )
        with self.assertRaisesMessage(ValidationError, "Only a locked period can be corrected."):
            correct_locked_period(self.period, self.owner, "again")

        # The mistake can now be fixed: reopen, recalculate, approve and lock again.
        self.timesheet.refresh_from_db()
        reopen_timesheet(self.timesheet, self.owner, "Break entered twice")
        adjustment = self.lock_all()
        self.assertEqual(adjustment.pk, manifest.pk, "the existing manifest row becomes the adjustment")
        self.assertNotEqual(adjustment.manifest_hash, original_hash)
        self.assertEqual(adjustment.snapshot["adjustment"]["supersedes_manifest_hash"], original_hash)
        history = adjustment.snapshot["corrections"]
        self.assertEqual(len(history), 1)
        self.assertEqual(history[0]["adjustment_manifest_hash"], adjustment.manifest_hash)
        self.assertIsNotNone(history[0]["closed_at"])
        self.assertEqual(lock_period(self.period, self.owner).manifest_hash, adjustment.manifest_hash,
                         "locking an adjusted period again is idempotent")
        self.assertEqual(TimesheetManifest.objects.filter(period=self.period).count(), 1)

    def test_locking_requires_every_timesheet_approved_and_freezes_the_period(self):
        revision = self.built()
        with self.assertRaises(ValidationError) as caught:
            lock_period(self.period, self.owner)
        self.assertEqual(caught.exception.message_dict["code"], ["UNAPPROVED_TIMESHEETS"])
        for timesheet in self.period.timesheets.all():
            current = build_timesheet(timesheet.pk, actor=self.owner)
            timesheet.refresh_from_db()
            approve_timesheet(timesheet, self.owner, current.revision_number)
        manifest = lock_period(self.period, self.owner)
        self.period.refresh_from_db()
        self.assertEqual((self.period.status, self.period.locked_by_id), (TimesheetPeriod.Status.LOCKED, self.owner.pk))
        self.assertEqual(manifest.snapshot["period_id"], self.period.pk)
        self.assertIn(self.timesheet.pk, [row["timesheet_id"] for row in manifest.snapshot["timesheets"]])
        self.assertEqual(manifest.snapshot["payroll_export"], [])
        self.assertEqual(lock_period(self.period, self.owner).pk, manifest.pk)
        self.assertEqual(TimesheetManifest.objects.filter(period=self.period).count(), 1)
        self.timesheet.refresh_from_db()
        with self.assertRaisesMessage(ValidationError, "Locked periods cannot be approved again."):
            approve_timesheet(self.timesheet, self.owner, revision.revision_number)
        with self.assertRaisesMessage(ValidationError, "Locked periods cannot be submitted again."):
            submit_timesheet(self.timesheet, self.worker, revision.revision_number)
        self.timesheet.refresh_from_db()
        self.assertEqual(
            self.timesheet.status,
            Timesheet.Status.APPROVED,
            "a locked manifest must not be invalidated by a later worker submission",
        )
        with self.assertRaisesMessage(ValidationError, "cannot be reopened in place"):
            reopen_timesheet(self.timesheet, self.owner, "late fix")

        revision_count = self.timesheet.revisions.count()
        with self.assertRaisesMessage(
            ValidationError,
            "Locked timesheet periods cannot be recalculated in place.",
        ):
            build_timesheet(self.timesheet.pk, actor=self.owner)
        self.timesheet.refresh_from_db()
        self.assertEqual(self.timesheet.status, Timesheet.Status.APPROVED)
        self.assertEqual(self.timesheet.revisions.count(), revision_count)

    def test_locked_period_directory_sync_does_not_create_new_timesheets(self):
        revision = self.built()
        for timesheet in self.period.timesheets.all():
            current = build_timesheet(timesheet.pk, actor=self.owner)
            timesheet.refresh_from_db()
            approve_timesheet(timesheet, self.owner, current.revision_number)
        lock_period(self.period, self.owner)
        self.period.refresh_from_db()

        extra_worker = get_user_model().objects.create_user(
            email="locked-extra-worker@example.com",
            password="test-pass",
            role="PHARMACIST",
        )
        with mock.patch(
            "workforce.timesheet_builder._worker_ids_for_period",
            return_value=[extra_worker.pk],
        ):
            ensure_period_timesheets(self.period)

        self.assertFalse(
            Timesheet.objects.filter(period=self.period, user=extra_worker).exists(),
            "a locked manifest must not gain a new timesheet through a read/list synchronization path",
        )

    def test_locked_timesheet_detail_is_read_only_with_stale_rebuild_flag(self):
        for timesheet in self.period.timesheets.all():
            current = build_timesheet(timesheet.pk, actor=self.owner)
            timesheet.refresh_from_db()
            approve_timesheet(timesheet, self.owner, current.revision_number)
        lock_period(self.period, self.owner)

        Timesheet.objects.filter(pk=self.timesheet.pk).update(needs_rebuild=True)
        revision_count = self.timesheet.revisions.count()
        request = APIRequestFactory().get(f"/api/v1/workforce/timesheets/{self.timesheet.pk}/")
        force_authenticate(request, user=self.owner)

        response = TimesheetDetailView.as_view()(request, pk=self.timesheet.pk)

        self.assertEqual(response.status_code, 200, response.data)
        self.timesheet.refresh_from_db()
        self.assertTrue(self.timesheet.needs_rebuild)
        self.assertEqual(self.timesheet.status, Timesheet.Status.APPROVED)
        self.assertEqual(self.timesheet.revisions.count(), revision_count)

    def test_overnight_correction_marks_every_touched_period_stale(self):
        """C028-N4: correcting Monday's clock-out of a Sunday night session invalidates Monday's period too."""
        from datetime import datetime, time, timedelta
        from zoneinfo import ZoneInfo

        from attendance.models import AttendanceCorrection, AttendanceEvent, AttendanceSession

        tz = ZoneInfo("Australia/Brisbane")
        sunday = self.period.end_date
        next_period = TimesheetPeriod.objects.create(
            pharmacy=self.pharmacy, start_date=sunday + timedelta(days=1), end_date=sunday + timedelta(days=7),
            timezone="Australia/Brisbane", created_by=self.owner,
        )
        next_timesheet = Timesheet.objects.create(period=next_period, user=self.worker, membership=self.membership)
        start = datetime.combine(sunday, time(22, 0), tzinfo=tz)
        end = start + timedelta(hours=8)
        session = AttendanceSession.objects.create(
            pharmacy=self.pharmacy, user=self.worker, source_membership=self.membership,
            started_at=start, ended_at=end,
        )
        AttendanceEvent.objects.create(
            session=session, event_type=AttendanceEvent.EventType.CLOCK_IN, occurred_at=start,
            source=AttendanceEvent.Source.QR_KIOSK,
        )
        clock_out = AttendanceEvent.objects.create(
            session=session, event_type=AttendanceEvent.EventType.CLOCK_OUT, occurred_at=end,
            source=AttendanceEvent.Source.QR_KIOSK,
        )
        for timesheet in (self.timesheet, next_timesheet):
            revision = build_timesheet(timesheet.pk, actor=self.owner, force=True)
            timesheet.refresh_from_db()
            approve_timesheet(timesheet, self.owner, revision.revision_number)
        next_timesheet.refresh_from_db()
        before_minutes = next_timesheet.worked_minutes

        AttendanceCorrection.objects.create(
            original_event=clock_out, corrected_timestamp=end + timedelta(hours=1),
            reason="Worker stayed for delivery", corrected_by=self.owner,
        )

        next_timesheet.refresh_from_db()
        self.timesheet.refresh_from_db()
        self.assertTrue(next_timesheet.needs_rebuild)
        self.assertTrue(self.timesheet.needs_rebuild)
        with self.assertRaisesMessage(ValidationError, "Recalculate all timesheets"):
            lock_period(next_period, self.owner)
        current = build_timesheet(next_timesheet.pk, actor=self.owner)
        next_timesheet.refresh_from_db()
        self.assertEqual(next_timesheet.worked_minutes, before_minutes + 60)
        self.assertEqual(next_timesheet.status, Timesheet.Status.REOPENED)
        approve_timesheet(next_timesheet, self.owner, current.revision_number)
        self.assertEqual(lock_period(next_period, self.owner).period_id, next_period.pk)

    def test_corrections_across_raw_session_bounds_are_projected(self):
        """C028-N4: both corrected bounds can extend attendance into another week."""
        from datetime import datetime, time, timedelta
        from zoneinfo import ZoneInfo

        from attendance.models import AttendanceCorrection, AttendanceEvent, AttendanceSession

        tz = ZoneInfo(self.period.timezone)
        monday = self.period.end_date + timedelta(days=1)
        next_period = TimesheetPeriod.objects.create(
            pharmacy=self.pharmacy, start_date=monday, end_date=monday + timedelta(days=6),
            timezone=self.period.timezone, created_by=self.owner,
        )
        next_timesheet = Timesheet.objects.create(period=next_period, user=self.worker, membership=self.membership)
        for event_type, start, end, corrected, target in [
            (AttendanceEvent.EventType.CLOCK_OUT,
             datetime.combine(monday - timedelta(days=1), time(22), tzinfo=tz),
             datetime.combine(monday - timedelta(days=1), time(23, 30), tzinfo=tz),
             datetime.combine(monday, time(0, 30), tzinfo=tz), next_timesheet),
            (AttendanceEvent.EventType.CLOCK_IN,
             datetime.combine(monday, time(0, 30), tzinfo=tz),
             datetime.combine(monday, time(1, 30), tzinfo=tz),
             datetime.combine(monday - timedelta(days=1), time(23, 30), tzinfo=tz), self.timesheet),
        ]:
            with self.subTest(event_type=event_type):
                session = AttendanceSession.objects.create(
                    pharmacy=self.pharmacy, user=self.worker, source_membership=self.membership,
                    started_at=start, ended_at=end,
                )
                for kind, occurred_at in [(AttendanceEvent.EventType.CLOCK_IN, start),
                                          (AttendanceEvent.EventType.CLOCK_OUT, end)]:
                    event = AttendanceEvent.objects.create(
                        session=session, event_type=kind, occurred_at=occurred_at,
                        source=AttendanceEvent.Source.QR_KIOSK,
                    )
                    if kind == event_type:
                        original_event = event
                before = build_timesheet(target.pk, actor=self.owner, force=True)
                target.refresh_from_db()
                self.assertFalse(target.needs_rebuild)
                AttendanceCorrection.objects.create(
                    original_event=original_event, corrected_timestamp=corrected,
                    reason="Correct the recorded boundary", corrected_by=self.owner,
                )
                target.refresh_from_db()
                self.assertTrue(target.needs_rebuild)
                after = build_timesheet(target.pk, actor=self.owner)
                self.assertEqual(after.worked_minutes, before.worked_minutes + 30)

    def test_moving_engagement_start_invalidates_old_and_new_ranges_only(self):
        """C029-N2: moving either way includes the old range and preserves reviewed sheets."""
        from datetime import timedelta

        from workforce.models import EmploymentEngagement

        old_start = self.period.start_date + timedelta(days=14)
        new_start = old_start + timedelta(days=14)
        terms = EmploymentEngagement.objects.create(
            membership=self.membership, effective_from=old_start, role="PHARMACIST",
            employment_type="FULL_TIME", pay_basis=EmploymentEngagement.PayBasis.AWARD,
            rate_weekday="41.74", rate_saturday="52.18", rate_sunday="62.61", rate_public_holiday="93.92",
            created_by=self.owner, updated_by=self.owner,
        )
        sheets = []
        for offset, status, locked in [
            (-7, Timesheet.Status.OPEN, False),
            (0, Timesheet.Status.OPEN, False),
            (7, Timesheet.Status.APPROVED, False),
            (14, Timesheet.Status.OPEN, True),
            (21, Timesheet.Status.OPEN, False),
        ]:
            start = old_start + timedelta(days=offset)
            period = TimesheetPeriod.objects.create(
                pharmacy=self.pharmacy, start_date=start, end_date=start + timedelta(days=6),
                timezone=self.period.timezone, created_by=self.owner,
                status=TimesheetPeriod.Status.LOCKED if locked else TimesheetPeriod.Status.OPEN,
            )
            sheets.append(Timesheet.objects.create(
                period=period, user=self.worker, membership=self.membership, status=status, needs_rebuild=False,
            ))
        for start in (new_start, old_start):
            with self.subTest(start=start), mock.patch("workforce.signals.rebuild_timesheet_task.delay") as task:
                Timesheet.objects.filter(pk__in=[sheet.pk for sheet in sheets]).update(needs_rebuild=False)
                terms.effective_from = start
                with self.captureOnCommitCallbacks(execute=True):
                    terms.save(update_fields=["effective_from"])
                for sheet, expected in zip(sheets, [False, True, False, False, True]):
                    sheet.refresh_from_db()
                    self.assertEqual(sheet.needs_rebuild, expected, sheet.period.start_date)
                self.assertCountEqual(task.call_args_list, [
                    mock.call(sheets[1].period_id, self.worker.pk),
                    mock.call(sheets[4].period_id, self.worker.pk),
                ])

    def test_rejected_provisional_attendance_does_not_block_the_period(self):
        """F06-N2: a rejected provisional session is not payable and must not leave an unresolvable blocker."""
        from datetime import datetime, time
        from zoneinfo import ZoneInfo

        from attendance.approvals import reject_provisional_attendance
        from attendance.models import AttendanceEvent, AttendanceSession, ProvisionalAttendance

        tz = ZoneInfo("Australia/Brisbane")
        start = datetime.combine(self.work_date, time(17, 0), tzinfo=tz)
        end = datetime.combine(self.work_date, time(18, 0), tzinfo=tz)
        session = AttendanceSession.objects.create(
            pharmacy=self.pharmacy, user=self.worker, source_membership=self.membership,
            started_at=start, ended_at=end, is_provisional=True,
        )
        for event_type, occurred_at in [
            (AttendanceEvent.EventType.CLOCK_IN, start), (AttendanceEvent.EventType.CLOCK_OUT, end),
        ]:
            AttendanceEvent.objects.create(
                session=session, event_type=event_type, occurred_at=occurred_at,
                source=AttendanceEvent.Source.QR_KIOSK,
            )
        review = ProvisionalAttendance.objects.create(
            session=session, cover_type=ProvisionalAttendance.CoverType.UNROSTERED_LOCAL,
        )
        pending = build_timesheet(self.timesheet.pk, actor=self.owner, force=True)
        self.assertTrue(pending.checks.filter(code="UNRESOLVED_PROVISIONAL_ATTENDANCE").exists())
        with self.assertRaises(ValidationError):
            approve_timesheet(self.timesheet, self.owner, pending.revision_number)

        reject_provisional_attendance(self.owner, review.pk, reason="Not authorised")
        current = build_timesheet(self.timesheet.pk, actor=self.owner, force=True)
        self.timesheet.refresh_from_db()
        self.assertFalse(current.checks.filter(code="UNRESOLVED_PROVISIONAL_ATTENDANCE").exists())
        self.assertEqual(self.timesheet.worked_minutes, 441)
        self.assertTrue(AttendanceEvent.objects.filter(session=session).exists())
        review.refresh_from_db()
        self.assertEqual(review.status, ProvisionalAttendance.Status.REJECTED)
        approve_timesheet(self.timesheet, self.owner, current.revision_number)
        self.assertEqual(lock_period(self.period, self.owner).period_id, self.period.pk)

    def test_new_employment_terms_mark_only_unapproved_timesheets_stale(self):
        """C029-N2: open timesheets re-snapshot new terms; approved ones keep their reviewed snapshot."""
        from datetime import timedelta

        from workforce.models import EmploymentEngagement

        self.pharmacy.use_chemisttasker_payroll = True
        self.pharmacy.save(update_fields=["use_chemisttasker_payroll"])

        def engagement(effective_from):
            return EmploymentEngagement.objects.create(
                membership=self.membership, effective_from=effective_from, role="PHARMACIST",
                employment_type="FULL_TIME", pay_basis=EmploymentEngagement.PayBasis.AWARD,
                award_classification="PHARMACIST", award_rate_snapshot={}, ordinary_hours_pattern={},
                rate_weekday="41.74", rate_saturday="52.18", rate_sunday="62.61", rate_public_holiday="93.92",
                created_by=self.owner, updated_by=self.owner,
            )

        self.built()
        self.assertFalse(self.timesheet.needs_rebuild)
        terms = engagement(self.work_date)
        self.timesheet.refresh_from_db()
        self.assertTrue(self.timesheet.needs_rebuild)
        revision = self.built()
        self.assertEqual(revision.snapshot["employment_engagements"][0]["public_id"], str(terms.public_id))
        self.assertEqual(revision.snapshot["employment_engagements"][0]["rates"]["weekday"], "41.74")

        terms.rate_weekday = "45.00"
        terms.save(update_fields=["rate_weekday"])
        self.timesheet.refresh_from_db()
        self.assertTrue(self.timesheet.needs_rebuild)
        revision = self.built()
        self.assertEqual(revision.snapshot["employment_engagements"][0]["rates"]["weekday"], "45.00")

        approve_timesheet(self.timesheet, self.owner, revision.revision_number)
        terms.effective_to = self.period.end_date - timedelta(days=1)
        terms.save(update_fields=["effective_to"])
        engagement(self.period.end_date)
        self.timesheet.refresh_from_db()
        self.assertEqual((self.timesheet.status, self.timesheet.needs_rebuild), (Timesheet.Status.APPROVED, False))
        self.assertEqual(self.timesheet.revisions.latest("revision_number").pk, revision.pk)

        lock_period(self.period, self.owner)
        terms.rate_weekday = "50.00"
        terms.save(update_fields=["rate_weekday"])
        self.timesheet.refresh_from_db()
        self.assertFalse(self.timesheet.needs_rebuild)
        self.assertEqual(self.timesheet.revisions.latest("revision_number").snapshot, revision.snapshot)
