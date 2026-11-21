"""In-app notifications delivered to users (task, message, alert, work-note), with read state."""
from django.db import models
from datetime import time
from django.conf import settings
from django.utils import timezone


class NotificationQuerySet(models.QuerySet):
    def unread(self):
        return self.filter(read_at__isnull=True)


class Notification(models.Model):
    class Type(models.TextChoices):
        TASK = "task", "Task"
        MESSAGE = "message", "Message"
        ALERT = "alert", "Alert"
        WORK_NOTE = "work_note", "Work Note"


    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="notifications",
    )
    type = models.CharField(max_length=32, choices=Type.choices, default=Type.TASK)
    title = models.CharField(max_length=255)
    body = models.TextField(blank=True)
    action_url = models.CharField(max_length=512, blank=True)
    payload = models.JSONField(default=dict, blank=True)
    read_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    objects = NotificationQuerySet.as_manager()

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["user", "read_at"]),
            models.Index(fields=["user", "created_at"]),
        ]

    def mark_read(self, commit: bool = True):
        if self.read_at:
            return False
        self.read_at = timezone.now()
        if commit:
            self.save(update_fields=["read_at"])
        return True

    def __str__(self):
        return f"Notification #{self.pk} to user {self.user_id} ({self.type})"


class NotificationPushPreference(models.Model):
    """User-scoped push transport preferences. Durable in-app notifications are never removed."""
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="push_preference")
    push_messages = models.BooleanField(default=True)
    push_tasks = models.BooleanField(default=True)
    push_work_notes = models.BooleanField(default=True)
    push_alerts = models.BooleanField(default=True)
    quiet_hours_enabled = models.BooleanField(default=False)
    quiet_start = models.TimeField(default=time(22, 0))
    quiet_end = models.TimeField(default=time(7, 0))
    time_zone = models.CharField(max_length=64, default="Australia/Brisbane")
    updated_at = models.DateTimeField(auto_now=True)
