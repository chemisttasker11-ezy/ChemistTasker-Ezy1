"""client_profile models: availability (split verbatim from client_profile/models.py)."""
from django.db import models
from django.conf import settings


class UserAvailability(models.Model):
    """
    Timeslot model representing when a user is available to work.
    """
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='user_availabilities'
    )
    date = models.DateField()
    start_time = models.TimeField()
    end_time = models.TimeField()
    is_all_day = models.BooleanField(default=False)
    is_recurring = models.BooleanField(default=False)
    recurring_days = models.JSONField(default=list, blank=True)  # list of ints [0=Sun..6=Sat]
    recurring_end_date = models.DateField(null=True, blank=True)
    notify_new_shifts = models.BooleanField(
        default=False,
        help_text="Notify this user when a public shift matches this availability."
    )
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        indexes = [
            models.Index(fields=['user']),
        ]

    def __str__(self):
        times = "All Day" if self.is_all_day else f"{self.start_time}-{self.end_time}"
        return f"{self.user.username} available {times} on {self.date}"
