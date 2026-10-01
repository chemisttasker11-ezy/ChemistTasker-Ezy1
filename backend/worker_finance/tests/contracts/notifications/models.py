"""Fields consumed from the canonical notifications.Notification model; kept deliberately explicit."""
from django.conf import settings
from django.db import models


class Notification(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    type = models.CharField(max_length=32, default='task')
    title = models.CharField(max_length=255)
    body = models.TextField(blank=True)
    action_url = models.CharField(max_length=512, blank=True)
    payload = models.JSONField(default=dict, blank=True)
