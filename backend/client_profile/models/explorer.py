"""client_profile models: explorer (split verbatim from client_profile/models.py)."""
from django.db import models
from django.conf import settings
from datetime import date
from django.utils import timezone


def explorer_post_upload_path(instance, filename):
    """
    Legacy upload path kept for historical migrations (e.g. 0002_initial).
    Do not remove unless those migrations are rewritten.
    """
    post_id = getattr(instance, "post_id", "unknown")
    return f"explorer_posts/{post_id}/{filename}"


class ExplorerPost(models.Model):
    ROLE_CATEGORY_CHOICES = [
        ("EXPLORER", "Explorer"),
        ("PHARMACIST", "Pharmacist"),
        ("OTHER_STAFF", "Other Staff"),
    ]
    WORK_TYPE_CHOICES = [
        ("FULL_TIME", "Full Time"),
        ("PART_TIME", "Part Time"),
        ("CASUAL", "Casual"),
    ]
    AVAILABILITY_MODE_CHOICES = [
        ("FULL_TIME_NOTICE", "Full Time Notice"),
        ("PART_TIME_DAYS", "Part Time Days"),
        ("CASUAL_CALENDAR", "Casual/Locum Calendar"),
    ]
    POST_KIND_CHOICES = [
        ("FULL_TIME_APPLICATION", "Full Time Application"),
        ("AVAILABILITY", "Availability Post"),
    ]

    explorer_profile = models.ForeignKey(
        'ExplorerOnboarding',
        on_delete=models.CASCADE,
        related_name='posts',
        null=True,
        blank=True,
    )
    author_user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="talent_posts",
        null=True,
        blank=True,
    )
    headline    = models.CharField(max_length=255)
    body        = models.TextField(blank=True)

    # Talent board fields (used across Explorer/Pharmacist/Other Staff)
    role_category = models.CharField(max_length=20, choices=ROLE_CATEGORY_CHOICES, blank=True, null=True)
    role_title = models.CharField(max_length=120, blank=True, null=True)
    work_types = models.JSONField(default=list, blank=True)  # multi-select support
    post_kind = models.CharField(max_length=30, choices=POST_KIND_CHOICES, default="AVAILABILITY")
    coverage_radius_km = models.PositiveSmallIntegerField(blank=True, null=True)
    open_to_travel = models.BooleanField(default=False)
    availability_mode = models.CharField(max_length=30, choices=AVAILABILITY_MODE_CHOICES, blank=True, null=True)
    availability_summary = models.CharField(max_length=255, blank=True, null=True)
    availability_days = models.JSONField(default=list, blank=True)
    availability_notice = models.CharField(max_length=50, blank=True, null=True)
    location_suburb = models.CharField(max_length=100, blank=True, null=True)
    location_state = models.CharField(max_length=50, blank=True, null=True)
    location_postcode = models.CharField(max_length=10, blank=True, null=True)
    skills = models.JSONField(default=list, blank=True)
    software = models.JSONField(default=list, blank=True)
    reference_code = models.CharField(max_length=20, unique=True, blank=True, null=True)
    is_anonymous = models.BooleanField(default=True)

    # Denormalized counters (kept in sync in views)
    view_count  = models.PositiveIntegerField(default=0)
    like_count  = models.PositiveIntegerField(default=0)
    reply_count = models.PositiveIntegerField(default=0)  # future-ready (comments)
    created_at  = models.DateTimeField(auto_now_add=True)
    updated_at  = models.DateTimeField(auto_now=True)

    class Meta:
        indexes = [
            models.Index(fields=['-created_at']),
            models.Index(fields=['explorer_profile', '-created_at']),
        ]

    def __str__(self):
        if self.author_user:
            return f"{self.headline} - {self.author_user.get_full_name()}"
        if self.explorer_profile and getattr(self.explorer_profile, "user", None):
            return f"{self.headline} - {self.explorer_profile.user.get_full_name()}"
        return self.headline

    def parsed_availability_dates(self):
        dates = []
        for entry in self.availability_days or []:
            raw_date = None
            if isinstance(entry, str):
                raw_date = entry
            elif isinstance(entry, dict):
                raw_date = entry.get("date")
            if not raw_date:
                continue
            try:
                dates.append(date.fromisoformat(str(raw_date)))
            except (TypeError, ValueError):
                continue
        return dates

    def latest_availability_date(self):
        dates = self.parsed_availability_dates()
        if not dates:
            return None
        return max(dates)

    def is_talent_board_visible(self, today=None):
        if self.post_kind == "FULL_TIME_APPLICATION":
            return True
        latest_date = self.latest_availability_date()
        if latest_date is None:
            return True
        return latest_date >= (today or timezone.localdate())


class ExplorerPostReaction(models.Model):
    """
    Simple 'like' for now (one per user per post).
    Extend later for emojis by adding a 'type' field.
    """
    post   = models.ForeignKey(ExplorerPost, on_delete=models.CASCADE, related_name='reactions')
    user   = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='explorer_post_reactions')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = [('post', 'user')]
        indexes = [
            models.Index(fields=['post']),
            models.Index(fields=['user']),
        ]

    def __str__(self):
        return f"❤️ u#{self.user_id} → p#{self.post_id}"
