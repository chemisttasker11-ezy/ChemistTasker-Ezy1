"""Roster periods, publication audits, acknowledgements, templates and action audits."""
from django.db import models
from django.conf import settings
from django.core.exceptions import ValidationError
from datetime import timedelta


class RosterPeriod(models.Model):
    """
    Groups a week's worth of ShiftSlotAssignment rows into a manageable
    period that can be drafted, validated, and published.
    """
    class Status(models.TextChoices):
        DRAFT = "DRAFT", "Draft"
        PUBLISHED = "PUBLISHED", "Published"
        ARCHIVED = "ARCHIVED", "Archived"

    pharmacy = models.ForeignKey(
        "client_profile.Pharmacy",
        on_delete=models.CASCADE,
        related_name="roster_periods",
    )
    week_start = models.DateField(
        help_text="Monday of the roster week (ISO weekday 1)."
    )
    status = models.CharField(
        max_length=12,
        choices=Status.choices,
        default=Status.DRAFT,
    )
    published_at = models.DateTimeField(null=True, blank=True)
    published_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="published_roster_periods",
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="created_roster_periods",
    )
    copied_from = models.ForeignKey(
        "self",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="copies",
        help_text="Source period when created via copy-week.",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ("pharmacy", "week_start")
        ordering = ["-week_start"]
        indexes = [
            models.Index(fields=["pharmacy", "week_start"]),
            models.Index(fields=["status"]),
        ]

    def clean(self):
        if self.week_start and self.week_start.weekday() != 0:
            raise ValidationError({"week_start": "week_start must be a Monday."})

    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)

    @property
    def week_end(self):
        """Return Sunday of the roster week."""
        return self.week_start + timedelta(days=6)

    def __str__(self):
        return f"Roster {self.pharmacy.name} w/c {self.week_start} [{self.status}]"


class RosterPublicationAudit(models.Model):
    """
    Append-only audit log of each publish action on a RosterPeriod.
    """
    roster_period = models.ForeignKey(
        RosterPeriod,
        on_delete=models.CASCADE,
        related_name="publication_audits",
    )
    published_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="roster_publication_audits",
    )
    published_at = models.DateTimeField(auto_now_add=True)
    revision_number = models.PositiveIntegerField(default=1)
    total_assignments = models.PositiveIntegerField(default=0)
    validation_snapshot = models.JSONField(default=dict, blank=True)

    class Meta:
        ordering = ["-published_at", "-id"]
        indexes = [
            models.Index(fields=["roster_period", "published_at"]),
        ]

    def __str__(self):
        return f"Rev {self.revision_number} for {self.roster_period} at {self.published_at}"


class RosterAcknowledgement(models.Model):
    """
    Records worker acknowledgement of their published shifts in a RosterPeriod.
    """
    roster_period = models.ForeignKey(
        RosterPeriod,
        on_delete=models.CASCADE,
        related_name="acknowledgements",
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="roster_acknowledgements",
    )
    acknowledged_at = models.DateTimeField(auto_now_add=True)
    notes = models.TextField(blank=True, default="")

    class Meta:
        unique_together = ("roster_period", "user")
        indexes = [
            models.Index(fields=["roster_period", "user"]),
        ]

    def __str__(self):
        return f"{self.user} acknowledged {self.roster_period} at {self.acknowledged_at}"


class RosterTemplate(models.Model):
    """
    Reusable weekly template that can be applied to generate draft
    ShiftSlotAssignment rows for a given week.
    """
    pharmacy = models.ForeignKey(
        "client_profile.Pharmacy",
        on_delete=models.CASCADE,
        related_name="roster_templates",
    )
    name = models.CharField(max_length=120)
    template_data = models.JSONField(
        default=list,
        help_text=(
            "Array of objects: "
            "[{day_of_week: 0-6, start_time, end_time, role, user_id?}, ...]"
        ),
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="created_roster_templates",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        indexes = [
            models.Index(fields=["pharmacy"]),
        ]

    def __str__(self):
        return f"RosterTemplate '{self.name}' @ {self.pharmacy.name}"


class RosterActionAudit(models.Model):
    """
    Audit log of worker/manager roster actions: swaps, covers, releases, and leave.
    Tracks state transitions and preserves audit history.
    """
    class ActionType(models.TextChoices):
        SWAP_REQUESTED = "SWAP_REQUESTED", "Swap Requested"
        SWAP_APPROVED = "SWAP_APPROVED", "Swap Approved"
        SWAP_REJECTED = "SWAP_REJECTED", "Swap Rejected"
        COVER_REQUESTED = "COVER_REQUESTED", "Cover Requested"
        COVER_APPROVED = "COVER_APPROVED", "Cover Approved"
        COVER_REJECTED = "COVER_REJECTED", "Cover Rejected"
        WORKER_RELEASED = "WORKER_RELEASED", "Worker Released"
        LEAVE_REQUESTED = "LEAVE_REQUESTED", "Leave Requested"
        LEAVE_APPROVED = "LEAVE_APPROVED", "Leave Approved"

    pharmacy = models.ForeignKey(
        "client_profile.Pharmacy",
        on_delete=models.CASCADE,
        related_name="roster_action_audits",
    )
    shift_assignment = models.ForeignKey(
        "client_profile.ShiftSlotAssignment",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="roster_action_audits",
    )
    action_type = models.CharField(
        max_length=32,
        choices=ActionType.choices,
    )
    performed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="roster_actions_performed",
    )
    target_user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="roster_actions_targeted",
        help_text="Target worker for swap or replacement cover.",
    )
    details = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["pharmacy", "action_type"]),
            models.Index(fields=["created_at"]),
        ]

    def __str__(self):
        return f"[{self.action_type}] at {self.pharmacy.name} by {self.performed_by} at {self.created_at}"
