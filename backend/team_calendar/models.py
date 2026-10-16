"""Team calendar: pharmacy/organization calendar events and assignable, completable work notes."""
from django.db import models
from django.conf import settings


class CalendarEvent(models.Model):
    """
    Calendar events for pharmacies/organizations.
    Supports manual events, auto-generated birthdays, and shift-linked events.
    """
    class Source(models.TextChoices):
        MANUAL = 'manual', 'Manual'
        BIRTHDAY = 'birthday', 'Birthday'
        SHIFT = 'shift', 'Shift'
        ORG_EVENT = 'org_event', 'Organization Event'

    pharmacy = models.ForeignKey(
        'client_profile.Pharmacy',
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='calendar_events',
    )
    organization = models.ForeignKey(
        'client_profile.Organization',
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='calendar_events',
    )
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    date = models.DateField(db_index=True)
    start_time = models.TimeField(null=True, blank=True)
    end_time = models.TimeField(null=True, blank=True)
    all_day = models.BooleanField(default=True)
    source = models.CharField(max_length=20, choices=Source.choices, default=Source.MANUAL)
    recurrence = models.JSONField(null=True, blank=True, help_text="Recurrence rule: {'freq': 'DAILY|WEEKLY|MONTHLY', 'interval': int, 'until_date': 'YYYY-MM-DD', 'byweekday': [0-6]}")
    
    # For birthday idempotency: link to the membership whose birthday this represents
    source_membership = models.ForeignKey(
        'client_profile.Membership',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='birthday_events',
        help_text="For birthday events: the membership whose DOB generated this event"
    )
    
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='created_calendar_events',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        indexes = [
            models.Index(fields=['pharmacy', 'date']),
            models.Index(fields=['organization', 'date']),
            models.Index(fields=['source', 'date']),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=['source_membership', 'date', 'source'],
                name='unique_birthday_event',
                condition=models.Q(source='birthday'),
            ),
        ]

    def __str__(self):
        return f"CalendarEvent#{self.pk} '{self.title}' on {self.date}"


class WorkNote(models.Model):
    """
    Work notes/tasks that can be assigned to staff for a specific date.
    """
    class Status(models.TextChoices):
        OPEN = 'open', 'Open'
        IN_PROGRESS = 'in_progress', 'In Progress'
        DONE = 'done', 'Done'

    pharmacy = models.ForeignKey(
        'client_profile.Pharmacy',
        on_delete=models.CASCADE,
        related_name='work_notes',
    )
    date = models.DateField(db_index=True)
    title = models.CharField(max_length=255)
    body = models.TextField(blank=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.OPEN)
    
    # Notification settings
    notify_on_shift_start = models.BooleanField(
        default=False,
        help_text="Send notification when assigned staff's shift starts"
    )

    # Recurrence rule similar to CalendarEvent.recurrence
    recurrence = models.JSONField(
        null=True,
        blank=True,
        help_text="Recurrence rule: {'freq': 'DAILY|WEEKLY|MONTHLY', 'interval': int, 'until_date': 'YYYY-MM-DD', 'byweekday': [0-6]}"
    )
    
    # General note (tags all staff)
    is_general = models.BooleanField(
        default=False,
        help_text="If true, this note applies to all pharmacy staff"
    )
    
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='created_work_notes',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        indexes = [
            models.Index(fields=['pharmacy', 'date']),
            models.Index(fields=['pharmacy', 'status']),
            models.Index(fields=['date', 'notify_on_shift_start']),
        ]
        ordering = ['-date', '-created_at']

    def __str__(self):
        return f"WorkNote#{self.pk} '{self.title}' for {self.pharmacy_id} on {self.date}"


class WorkNoteAssignee(models.Model):
    """
    Links work notes to specific staff members via their Membership.
    Using Membership (not User) ensures tenant isolation.
    """
    work_note = models.ForeignKey(
        WorkNote,
        on_delete=models.CASCADE,
        related_name='assignees',
    )
    membership = models.ForeignKey(
        'client_profile.Membership',
        on_delete=models.CASCADE,
        related_name='assigned_work_notes',
    )
    notified_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="When shift-start notification was sent"
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('work_note', 'membership')
        indexes = [
            models.Index(fields=['membership']),
            models.Index(fields=['work_note']),
        ]

    def __str__(self):
        return f"WorkNoteAssignee#{self.pk} note={self.work_note_id} membership={self.membership_id}"


class WorkNoteCompletion(models.Model):
    """
    Per-user completion for a specific work note occurrence date.
    """
    work_note = models.ForeignKey(
        WorkNote,
        on_delete=models.CASCADE,
        related_name="completions",
    )
    membership = models.ForeignKey(
        "client_profile.Membership",
        on_delete=models.CASCADE,
        related_name="work_note_completions",
    )
    occurrence_date = models.DateField(db_index=True)
    completed_at = models.DateTimeField(auto_now_add=True)
    completed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="completed_work_notes",
    )

    class Meta:
        unique_together = ("work_note", "membership", "occurrence_date")
        indexes = [
            models.Index(fields=["work_note", "occurrence_date"]),
            models.Index(fields=["membership", "occurrence_date"]),
        ]

    def __str__(self):
        return (
            f"WorkNoteCompletion#{self.pk} note={self.work_note_id} "
            f"membership={self.membership_id} date={self.occurrence_date}"
        )


# Operations planning belongs to the team_calendar domain. Drafts never become
# visible work until publish creates their authoritative WorkNote records.
class OperationsTemplate(models.Model):
    pharmacy = models.ForeignKey(
        "client_profile.Pharmacy", on_delete=models.CASCADE, related_name="operations_templates")
    title = models.CharField(max_length=180)
    instructions = models.TextField(blank=True)
    area = models.CharField(max_length=40, default="dispensary")
    kind = models.CharField(max_length=20, default="routine")
    frequency = models.CharField(max_length=20, default="daily")
    target_role = models.CharField(max_length=30, blank=True)
    duration_minutes = models.PositiveSmallIntegerField(default=15)
    checklist = models.JSONField(default=list, blank=True)
    reference_url = models.URLField(blank=True)
    needs_verification = models.BooleanField(default=False)
    active = models.BooleanField(default=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["area", "title"]
        indexes = [models.Index(fields=["pharmacy", "area"])]


class OperationsPlan(models.Model):
    class Status(models.TextChoices):
        DRAFT = "DRAFT", "Draft"
        PUBLISHED = "PUBLISHED", "Published"

    pharmacy = models.ForeignKey(
        "client_profile.Pharmacy", on_delete=models.CASCADE, related_name="operations_plans")
    title = models.CharField(max_length=180)
    date_from = models.DateField()
    date_to = models.DateField()
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.DRAFT)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name="created_operations_plans")
    published_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="published_operations_plans")
    published_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-date_from", "-id"]
        indexes = [models.Index(fields=["pharmacy", "date_from", "date_to"])]


class OperationsItem(models.Model):
    class Audience(models.TextChoices):
        NAMED = "NAMED", "Named staff"
        ROSTER_ROLE = "ROSTER_ROLE", "Rostered role"
        ON_DUTY = "ON_DUTY", "All rostered staff"
        TEAM_POOL = "TEAM_POOL", "Rostered shared team pool"

    plan = models.ForeignKey(OperationsPlan, on_delete=models.CASCADE, related_name="items")
    template = models.ForeignKey(
        OperationsTemplate, on_delete=models.SET_NULL, null=True, blank=True)
    work_note = models.OneToOneField(
        WorkNote, on_delete=models.PROTECT, null=True, blank=True,
        related_name="operations_item")
    date = models.DateField()
    title = models.CharField(max_length=180)
    instructions = models.TextField(blank=True)
    area = models.CharField(max_length=40, default="dispensary")
    kind = models.CharField(max_length=20, default="routine")
    start_time = models.TimeField(null=True, blank=True)
    end_time = models.TimeField(null=True, blank=True)
    audience = models.CharField(
        max_length=20, choices=Audience.choices, default=Audience.ROSTER_ROLE)
    target_role = models.CharField(max_length=30, blank=True)
    named_membership_ids = models.JSONField(default=list, blank=True)
    checklist = models.JSONField(default=list, blank=True)
    target_value = models.PositiveIntegerField(null=True, blank=True)
    target_metric = models.CharField(max_length=90, blank=True)
    reference_url = models.URLField(blank=True)
    needs_verification = models.BooleanField(default=False)
    order = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ["date", "order", "id"]
        indexes = [models.Index(fields=["plan", "date"])]


class OperationsStepCheck(models.Model):
    """Evidence of individual steps; WorkNoteCompletion remains the final done record."""
    item = models.ForeignKey(
        OperationsItem, on_delete=models.CASCADE, related_name="step_checks")
    membership = models.ForeignKey(
        "client_profile.Membership", on_delete=models.CASCADE)
    step_index = models.PositiveSmallIntegerField()
    checked_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [models.UniqueConstraint(
            fields=["item", "membership", "step_index"], name="operations_step_unique")]
