"""Reusable task defaults and server-only planner receipts."""
from django.conf import settings
from django.db import models


class SavedTask(models.Model):
    pharmacy = models.ForeignKey('client_profile.Pharmacy', on_delete=models.CASCADE, related_name='saved_tasks')
    title = models.CharField(max_length=255)
    details = models.TextField(blank=True)
    start_time = models.TimeField(null=True, blank=True)
    end_time = models.TimeField(null=True, blank=True)
    is_clinical = models.BooleanField(default=False)

    class Meta:
        ordering = ['title', 'id']


class OperationAudit(models.Model):
    pharmacy = models.ForeignKey('client_profile.Pharmacy', on_delete=models.CASCADE)
    work_note = models.ForeignKey('team_calendar.WorkNote', on_delete=models.SET_NULL, null=True, blank=True)
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True)
    action = models.CharField(max_length=20)
    details = models.JSONField(default=dict)
    request_key = models.CharField(max_length=128, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=['pharmacy', 'request_key'], name='planner_copy_request_key'),
        ]
