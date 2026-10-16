"""Calendar-owned pharmacy operation templates, drafts and execution records.

Published tasks link to WorkNote as the canonical calendar task. There is no
second task-completion ledger: staff completion uses WorkNoteCompletion.
"""
from django.conf import settings
from django.db import models


class OperationTemplate(models.Model):
    pharmacy = models.ForeignKey("client_profile.Pharmacy", on_delete=models.CASCADE, null=True, blank=True,
                                 related_name="operation_templates")
    organization = models.ForeignKey("client_profile.Organization", on_delete=models.CASCADE, null=True, blank=True,
                                     related_name="operation_templates")
    name = models.CharField(max_length=180)
    category = models.CharField(max_length=32, default="daily")
    area = models.CharField(max_length=60, default="general")
    description = models.TextField(blank=True)
    recurrence = models.JSONField(default=dict, blank=True)
    audience = models.CharField(max_length=20, default="ROLE_ON_DUTY")
    role_codes = models.JSONField(default=list, blank=True)
    checklist = models.JSONField(default=list, blank=True)
    requires_verification = models.BooleanField(default=False)
    target_value = models.PositiveIntegerField(null=True, blank=True)
    target_unit = models.CharField(max_length=40, blank=True)
    target_kind = models.CharField(max_length=20, default="operational")
    training_url = models.URLField(blank=True)
    active = models.BooleanField(default=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True,
                                   related_name="created_operation_templates")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("category", "name", "id")


class OperationPlan(models.Model):
    pharmacy = models.ForeignKey("client_profile.Pharmacy", on_delete=models.CASCADE, related_name="operation_plans")
    name = models.CharField(max_length=180)
    period = models.CharField(max_length=24, default="daily")
    starts_on = models.DateField()
    ends_on = models.DateField()
    notes = models.TextField(blank=True)
    status = models.CharField(max_length=16, default="DRAFT")
    revision = models.PositiveIntegerField(default=1)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True,
                                   related_name="created_operation_plans")
    published_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
                                     related_name="published_operation_plans")
    published_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("-starts_on", "-id")


class OperationTask(models.Model):
    plan = models.ForeignKey(OperationPlan, on_delete=models.CASCADE, related_name="items")
    template = models.ForeignKey(OperationTemplate, on_delete=models.SET_NULL, null=True, blank=True)
    calendar_note = models.OneToOneField("team_calendar.WorkNote", on_delete=models.PROTECT, null=True, blank=True,
                                        related_name="operation_item")
    date = models.DateField()
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    area = models.CharField(max_length=60, default="general")
    start_time = models.TimeField(null=True, blank=True)
    end_time = models.TimeField(null=True, blank=True)
    audience = models.CharField(max_length=20, default="ROLE_ON_DUTY")
    membership_ids = models.JSONField(default=list, blank=True)
    role_codes = models.JSONField(default=list, blank=True)
    checklist = models.JSONField(default=list, blank=True)
    requires_verification = models.BooleanField(default=False)
    target_value = models.PositiveIntegerField(null=True, blank=True)
    target_unit = models.CharField(max_length=40, blank=True)
    target_kind = models.CharField(max_length=20, default="operational")
    training_url = models.URLField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("date", "start_time", "id")
        constraints = [
            models.UniqueConstraint(fields=("plan", "template", "date"), name="operation_template_date_unique"),
        ]


class OperationStep(models.Model):
    task = models.ForeignKey(OperationTask, on_delete=models.CASCADE, related_name="step_completions")
    membership = models.ForeignKey("client_profile.Membership", on_delete=models.CASCADE)
    step_id = models.CharField(max_length=64)
    evidence_note = models.TextField(blank=True)
    completed_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    completed_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=("task", "membership", "step_id"), name="operation_step_member_unique"),
        ]


class OperationKpiRecord(models.Model):
    task = models.ForeignKey(OperationTask, on_delete=models.CASCADE, related_name="kpi_records")
    membership = models.ForeignKey("client_profile.Membership", on_delete=models.SET_NULL, null=True, blank=True)
    value = models.PositiveIntegerField()
    key = models.CharField(max_length=64)
    note = models.CharField(max_length=255, blank=True)
    recorded_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    recorded_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=("task", "key"), name="operation_kpi_entry_unique"),
        ]


class OperationVerification(models.Model):
    task = models.OneToOneField(OperationTask, on_delete=models.CASCADE, related_name="verification")
    verified_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    note = models.TextField(blank=True)
    verified_at = models.DateTimeField(auto_now_add=True)


class OperationAudit(models.Model):
    plan = models.ForeignKey(OperationPlan, on_delete=models.CASCADE, related_name="audit_entries")
    task = models.ForeignKey(OperationTask, on_delete=models.SET_NULL, null=True, blank=True)
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True)
    action = models.CharField(max_length=50)
    details = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("-created_at", "-id")
