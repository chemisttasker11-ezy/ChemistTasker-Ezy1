from __future__ import annotations

import uuid
from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models
from django.db.models import Q


class RosterRevisionState(models.Model):
    """Optimistic-concurrency state layered over the existing RosterPeriod."""

    period = models.OneToOneField(
        "client_profile.RosterPeriod",
        on_delete=models.CASCADE,
        related_name="workforce_revision_state",
    )
    draft_revision = models.PositiveBigIntegerField(default=1)
    published_revision = models.PositiveBigIntegerField(default=0)
    validated_revision = models.PositiveBigIntegerField(null=True, blank=True)
    validation_snapshot = models.JSONField(default=dict, blank=True)
    changed_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["period_id"]


class RosterOperation(models.Model):
    """Idempotency ledger for revision-sensitive roster commands."""

    operation_id = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)
    period = models.ForeignKey(
        "client_profile.RosterPeriod",
        on_delete=models.CASCADE,
        related_name="workforce_operations",
    )
    operation_type = models.CharField(max_length=40)
    request_hash = models.CharField(max_length=64)
    result_json = models.JSONField(default=dict, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="workforce_roster_operations",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [models.Index(fields=["period", "created_at"])]


class MembershipWorkSettings(models.Model):
    """Non-payroll work-pattern settings used for roster/timesheet comparisons."""

    membership = models.OneToOneField(
        "client_profile.Membership",
        on_delete=models.CASCADE,
        related_name="workforce_settings",
    )
    contracted_weekly_minutes = models.PositiveIntegerField(null=True, blank=True)
    work_pattern = models.JSONField(default=dict, blank=True)
    effective_from = models.DateField(null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)


class EmploymentEngagement(models.Model):
    """Dated employment/pay agreement for one pharmacy membership.

    Membership remains the stable worker-at-pharmacy identity. Engagements are
    immutable historical periods whose pay snapshot can be used by timesheets
    and payroll without rewriting prior terms when award rates change.
    """

    class PayBasis(models.TextChoices):
        AWARD = "AWARD", "Award"
        ABOVE_AWARD = "ABOVE_AWARD", "Above award"

    public_id = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)
    membership = models.ForeignKey(
        "client_profile.Membership",
        on_delete=models.PROTECT,
        related_name="employment_engagements",
    )
    effective_from = models.DateField()
    effective_to = models.DateField(null=True, blank=True)

    role = models.CharField(max_length=50)
    employment_type = models.CharField(max_length=20)
    job_title = models.CharField(max_length=255, blank=True)

    pay_basis = models.CharField(max_length=20, choices=PayBasis.choices)
    award_code = models.CharField(max_length=32, default="MA000012")
    award_classification = models.CharField(max_length=80, blank=True)
    award_source_label = models.CharField(
        max_length=255,
        default="Pharmacy Industry Award 2020",
    )
    award_source_url = models.URLField(
        max_length=500,
        default="https://calculate.fairwork.gov.au/payguides/fairwork/ma000012/pdf",
    )
    award_effective_from = models.DateField(null=True, blank=True)

    rate_weekday = models.DecimalField(max_digits=8, decimal_places=2)
    rate_saturday = models.DecimalField(max_digits=8, decimal_places=2)
    rate_sunday = models.DecimalField(max_digits=8, decimal_places=2)
    rate_public_holiday = models.DecimalField(max_digits=8, decimal_places=2)
    rate_early_morning = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True)
    rate_late_night = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True)
    early_morning_applicable = models.BooleanField(default=False)
    late_night_applicable = models.BooleanField(default=False)

    notes = models.TextField(blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="created_employment_engagements",
    )
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="updated_employment_engagements",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["membership_id", "-effective_from", "-id"]
        constraints = [
            models.UniqueConstraint(
                fields=["membership", "effective_from"],
                name="wf_engagement_membership_start_unique",
            ),
            models.CheckConstraint(
                condition=Q(effective_to__isnull=True) | Q(effective_to__gte=models.F("effective_from")),
                name="wf_engagement_valid_date_range",
            ),
        ]
        indexes = [
            models.Index(fields=["membership", "effective_from", "effective_to"]),
        ]

    def clean(self):
        super().clean()
        if self.membership_id and not self.membership.pharmacy_id:
            raise ValidationError("Employment engagement requires a pharmacy membership.")
        if self.effective_to and self.effective_to < self.effective_from:
            raise ValidationError({"effective_to": "Must be on or after effective_from."})
        for field in ("rate_weekday", "rate_saturday", "rate_sunday", "rate_public_holiday"):
            value = getattr(self, field, None)
            if value is None or value < 0:
                raise ValidationError({field: "A non-negative agreed rate is required."})
        if self.early_morning_applicable and self.rate_early_morning is None:
            raise ValidationError({"rate_early_morning": "Required when early-morning rates apply."})
        if self.late_night_applicable and self.rate_late_night is None:
            raise ValidationError({"rate_late_night": "Required when late-night rates apply."})

        if self.membership_id and self.effective_from:
            overlap = EmploymentEngagement.objects.filter(membership_id=self.membership_id)
            if self.pk:
                overlap = overlap.exclude(pk=self.pk)
            overlap = overlap.filter(
                Q(effective_to__isnull=True) | Q(effective_to__gte=self.effective_from)
            )
            if self.effective_to:
                overlap = overlap.filter(effective_from__lte=self.effective_to)
            if overlap.exists():
                raise ValidationError("Employment engagement dates overlap an existing engagement.")

    @property
    def pharmacy_id(self):
        return self.membership.pharmacy_id


class CoverageRequirement(models.Model):
    pharmacy = models.ForeignKey(
        "client_profile.Pharmacy",
        on_delete=models.CASCADE,
        related_name="coverage_requirements",
    )
    weekday = models.PositiveSmallIntegerField(help_text="Monday=0 ... Sunday=6")
    start_time = models.TimeField()
    end_time = models.TimeField()
    role = models.CharField(max_length=30)
    minimum_staff = models.PositiveSmallIntegerField(default=1)
    active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.CheckConstraint(condition=Q(weekday__gte=0) & Q(weekday__lte=6), name="wf_coverage_valid_weekday"),
            models.CheckConstraint(condition=Q(minimum_staff__gte=1), name="wf_coverage_min_staff_positive"),
        ]
        indexes = [models.Index(fields=["pharmacy", "weekday", "role"])]


class WorkforceLeaveRequest(models.Model):
    class Status(models.TextChoices):
        PENDING = "PENDING", "Pending"
        APPROVED = "APPROVED", "Approved"
        REJECTED = "REJECTED", "Rejected"
        CANCELLED = "CANCELLED", "Cancelled"

    LEAVE_TYPES = [
        ("SICK", "Sick Leave"),
        ("ANNUAL", "Annual Leave"),
        ("COMPASSIONATE", "Compassionate Leave"),
        ("STUDY", "Study Leave"),
        ("CARER", "Carer's Leave"),
        ("UNPAID", "Unpaid Leave"),
        ("OTHER", "Other"),
    ]

    pharmacy = models.ForeignKey(
        "client_profile.Pharmacy",
        on_delete=models.CASCADE,
        related_name="workforce_leave_requests",
    )
    membership = models.ForeignKey(
        "client_profile.Membership",
        on_delete=models.PROTECT,
        related_name="workforce_leave_requests",
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="workforce_leave_requests",
    )
    leave_type = models.CharField(max_length=24, choices=LEAVE_TYPES)
    start_at = models.DateTimeField()
    end_at = models.DateTimeField()
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.PENDING)
    note = models.TextField(blank=True)
    manager_note = models.TextField(blank=True)
    decided_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="workforce_leave_decisions",
    )
    decided_at = models.DateTimeField(null=True, blank=True)
    legacy_leave = models.OneToOneField(
        "client_profile.LeaveRequest",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="workforce_window",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-start_at", "-id"]
        constraints = [
            models.CheckConstraint(condition=Q(end_at__gt=models.F("start_at")), name="wf_leave_end_after_start")
        ]
        indexes = [
            models.Index(fields=["pharmacy", "start_at", "end_at"]),
            models.Index(fields=["user", "status", "start_at"]),
        ]

    def clean(self):
        super().clean()
        if self.membership_id and self.user_id and self.membership.user_id != self.user_id:
            raise ValidationError("Leave membership does not belong to the selected worker.")
        if self.membership_id and self.pharmacy_id and self.membership.pharmacy_id != self.pharmacy_id:
            raise ValidationError("Leave membership does not belong to the selected pharmacy.")


class TimesheetPeriod(models.Model):
    class Status(models.TextChoices):
        OPEN = "OPEN", "Open"
        REVIEW = "REVIEW", "Review"
        APPROVED = "APPROVED", "Approved"
        LOCKED = "LOCKED", "Locked"

    pharmacy = models.ForeignKey(
        "client_profile.Pharmacy",
        on_delete=models.PROTECT,
        related_name="timesheet_periods",
    )
    start_date = models.DateField()
    end_date = models.DateField()
    timezone = models.CharField(max_length=64, default="Australia/Brisbane")
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.OPEN)
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="approved_timesheet_periods",
    )
    approved_at = models.DateTimeField(null=True, blank=True)
    locked_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="locked_timesheet_periods",
    )
    locked_at = models.DateTimeField(null=True, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="created_timesheet_periods",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-start_date", "-id"]
        constraints = [
            models.UniqueConstraint(fields=["pharmacy", "start_date", "end_date"], name="wf_timesheet_period_unique"),
            models.CheckConstraint(condition=Q(end_date__gte=models.F("start_date")), name="wf_timesheet_period_valid_range"),
        ]
        indexes = [models.Index(fields=["pharmacy", "start_date", "end_date", "status"])]


class Timesheet(models.Model):
    class Status(models.TextChoices):
        OPEN = "OPEN", "Open"
        NEEDS_REVIEW = "NEEDS_REVIEW", "Needs review"
        READY = "READY", "Ready"
        SUBMITTED = "SUBMITTED", "Submitted"
        APPROVED = "APPROVED", "Approved"
        REOPENED = "REOPENED", "Reopened"

    period = models.ForeignKey(TimesheetPeriod, on_delete=models.CASCADE, related_name="timesheets")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="workforce_timesheets")
    membership = models.ForeignKey(
        "client_profile.Membership",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="workforce_timesheets",
    )
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.OPEN)
    needs_rebuild = models.BooleanField(default=True)
    rostered_minutes = models.PositiveIntegerField(default=0, help_text="Gross roster span; not payroll-authoritative.")
    planned_break_minutes = models.PositiveIntegerField(default=0)
    contracted_minutes = models.PositiveIntegerField(null=True, blank=True)
    worked_minutes = models.PositiveIntegerField(default=0)
    approved_leave_minutes = models.PositiveIntegerField(default=0)
    reviewed_minutes = models.PositiveIntegerField(default=0)
    blocking_checks = models.PositiveIntegerField(default=0)
    warning_checks = models.PositiveIntegerField(default=0)
    source_fingerprint = models.CharField(max_length=64, blank=True, default="")
    last_built_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["period", "user"], name="wf_timesheet_period_user_unique")]
        indexes = [
            models.Index(fields=["period", "status"]),
            models.Index(fields=["user", "period"]),
            models.Index(fields=["needs_rebuild"]),
        ]


class TimesheetRevision(models.Model):
    timesheet = models.ForeignKey(Timesheet, on_delete=models.CASCADE, related_name="revisions")
    revision_number = models.PositiveIntegerField()
    source_fingerprint = models.CharField(max_length=64)
    snapshot = models.JSONField(default=dict)
    rostered_minutes = models.PositiveIntegerField(default=0)
    planned_break_minutes = models.PositiveIntegerField(default=0)
    contracted_minutes = models.PositiveIntegerField(null=True, blank=True)
    worked_minutes = models.PositiveIntegerField(default=0)
    approved_leave_minutes = models.PositiveIntegerField(default=0)
    reviewed_minutes = models.PositiveIntegerField(default=0)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="created_timesheet_revisions",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["timesheet", "revision_number"], name="wf_timesheet_revision_unique")
        ]
        ordering = ["timesheet_id", "revision_number"]


class TimesheetSegment(models.Model):
    class SegmentType(models.TextChoices):
        WORK = "WORK", "Work"
        BREAK = "BREAK", "Break"
        LEAVE = "LEAVE", "Leave"

    revision = models.ForeignKey(TimesheetRevision, on_delete=models.CASCADE, related_name="segments")
    segment_type = models.CharField(max_length=12, choices=SegmentType.choices)
    started_at = models.DateTimeField()
    ended_at = models.DateTimeField()
    minutes = models.PositiveIntegerField()
    source_type = models.CharField(max_length=40)
    source_id = models.CharField(max_length=64, blank=True)
    metadata = models.JSONField(default=dict, blank=True)

    class Meta:
        ordering = ["started_at", "id"]
        indexes = [models.Index(fields=["revision", "segment_type", "started_at"])]


class TimesheetCheck(models.Model):
    class Severity(models.TextChoices):
        BLOCKER = "BLOCKER", "Blocker"
        WARNING = "WARNING", "Warning"
        INFO = "INFO", "Info"

    revision = models.ForeignKey(TimesheetRevision, on_delete=models.CASCADE, related_name="checks")
    identity_key = models.CharField(max_length=160)
    code = models.CharField(max_length=50)
    severity = models.CharField(max_length=12, choices=Severity.choices)
    work_date = models.DateField(null=True, blank=True)
    message = models.CharField(max_length=500)
    details = models.JSONField(default=dict, blank=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["revision", "identity_key"], name="wf_timesheet_check_unique")
        ]
        indexes = [models.Index(fields=["revision", "severity", "code"])]


class TimesheetCheckDecision(models.Model):
    class Decision(models.TextChoices):
        RESOLVED = "RESOLVED", "Resolved"
        WAIVED = "WAIVED", "Waived"
        REOPENED = "REOPENED", "Reopened"

    timesheet_check = models.ForeignKey(TimesheetCheck, on_delete=models.CASCADE, related_name="decisions")
    decision = models.CharField(max_length=12, choices=Decision.choices)
    reason = models.TextField()
    decided_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at", "id"]


class TimesheetComment(models.Model):
    timesheet = models.ForeignKey(Timesheet, on_delete=models.CASCADE, related_name="comments")
    revision = models.ForeignKey(
        TimesheetRevision,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="comments",
    )
    author = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    body = models.TextField()
    worker_visible = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at", "id"]


class TimesheetCorrectionRequest(models.Model):
    class Kind(models.TextChoices):
        GENERAL = "GENERAL", "General"
        MISSING_PUNCH = "MISSING_PUNCH", "Missing punch"
        ROSTER_MISMATCH = "ROSTER_MISMATCH", "Roster mismatch"
        BREAK = "BREAK", "Break"
        LEAVE = "LEAVE", "Leave"
        OTHER = "OTHER", "Other"

    class Status(models.TextChoices):
        OPEN = "OPEN", "Open"
        RESOLVED = "RESOLVED", "Resolved"
        DECLINED = "DECLINED", "Declined"

    timesheet = models.ForeignKey(Timesheet, on_delete=models.CASCADE, related_name="correction_requests")
    revision = models.ForeignKey(TimesheetRevision, on_delete=models.PROTECT, related_name="correction_requests")
    requested_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="timesheet_correction_requests"
    )
    kind = models.CharField(max_length=24, choices=Kind.choices, default=Kind.GENERAL)
    body = models.TextField()
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.OPEN)
    manager_response = models.TextField(blank=True)
    decided_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, null=True, blank=True,
        related_name="decided_timesheet_correction_requests",
    )
    decided_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at", "-id"]
        indexes = [models.Index(fields=["timesheet", "status", "created_at"])]


class TimesheetApproval(models.Model):
    class Kind(models.TextChoices):
        EMPLOYEE_SUBMIT = "EMPLOYEE_SUBMIT", "Employee submit"
        TIME_APPROVAL = "TIME_APPROVAL", "Time approval"
        REOPEN = "REOPEN", "Reopen"

    revision = models.ForeignKey(TimesheetRevision, on_delete=models.PROTECT, related_name="approvals")
    kind = models.CharField(max_length=24, choices=Kind.choices)
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    reason = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at", "id"]




class ManagerAttendanceEventAudit(models.Model):
    """Reason/actor for an append-only manager-created missing punch."""

    event = models.OneToOneField(
        "client_profile.AttendanceEvent",
        on_delete=models.PROTECT,
        related_name="manager_creation_audit",
    )
    reason = models.TextField()
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="created_manager_attendance_events",
    )
    created_at = models.DateTimeField(auto_now_add=True)

class TimesheetManifest(models.Model):
    """Future payroll/integration boundary. No payroll execution lives here."""

    period = models.OneToOneField(TimesheetPeriod, on_delete=models.PROTECT, related_name="manifest")
    manifest_hash = models.CharField(max_length=64, unique=True)
    snapshot = models.JSONField(default=dict)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    created_at = models.DateTimeField(auto_now_add=True)
