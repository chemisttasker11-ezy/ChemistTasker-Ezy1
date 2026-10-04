"""The timesheet state machine: submit, approve, reopen, check decisions, comments and locking a period.

Reuses the projection tests' fixture (a pharmacist rostered and clocked in a published roster week, with a timesheet
period). The transitions are called through workforce.timesheets, their historical import path.
"""
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

        extra_worker = projection.User.objects.create_user(
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
        request = APIRequestFactory().get(f"/api/workforce/timesheets/{self.timesheet.pk}/")
        force_authenticate(request, user=self.owner)

        response = TimesheetDetailView.as_view()(request, pk=self.timesheet.pk)

        self.assertEqual(response.status_code, 200, response.data)
        self.timesheet.refresh_from_db()
        self.assertTrue(self.timesheet.needs_rebuild)
        self.assertEqual(self.timesheet.status, Timesheet.Status.APPROVED)
        self.assertEqual(self.timesheet.revisions.count(), revision_count)
