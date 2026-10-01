"""client_profile models: calendar (split verbatim from client_profile/models.py)."""
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
        'Pharmacy',
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='calendar_events',
    )
    organization = models.ForeignKey(
        'Organization',
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
        'Membership',
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
        'Pharmacy',
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
        'Membership',
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
        "Membership",
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
