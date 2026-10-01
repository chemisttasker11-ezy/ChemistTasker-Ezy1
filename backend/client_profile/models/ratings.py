"""client_profile models: ratings (split verbatim from client_profile/models.py)."""
from django.db import models
from django.conf import settings
from django.core.exceptions import ValidationError


# Rating model
class Rating(models.Model):
    """
    Global, relationship-level rating (not per shift/slot).
    - OWNER_TO_WORKER: owner/org admin/pharmacy admin rates a worker (pharmacist/other staff)
    - WORKER_TO_PHARMACY: worker rates a pharmacy
    Exactly one rating per relationship per direction; editable later.
    """

    class Direction(models.TextChoices):
        OWNER_TO_WORKER = "OWNER_TO_WORKER", "Owner/Org/PharmacyAdmin → Worker"
        WORKER_TO_PHARMACY = "WORKER_TO_PHARMACY", "Worker → Pharmacy"

    # Who is submitting the rating
    rater_user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="ratings_given",
        db_index=True,
    )

    # Target (exactly one of these will be set depending on direction)
    ratee_user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="ratings_received_as_worker",
        null=True, blank=True,
        db_index=True,
    )
    ratee_pharmacy = models.ForeignKey(
        "Pharmacy",
        on_delete=models.CASCADE,
        related_name="ratings_received",
        null=True, blank=True,
        db_index=True,
    )

    direction = models.CharField(max_length=32, choices=Direction.choices, db_index=True)

    # The rating itself
    stars = models.PositiveSmallIntegerField()  # enforce 1..5 in clean()
    comment = models.TextField(blank=True, null=True, max_length=1000)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        # One rating per relationship, per direction
        constraints = [
            # OWNER_TO_WORKER uniqueness
            models.UniqueConstraint(
                fields=["rater_user", "ratee_user", "direction"],
                name="uniq_owner_to_worker_per_pair",
                condition=models.Q(direction="OWNER_TO_WORKER"),
            ),
            # WORKER_TO_PHARMACY uniqueness
            models.UniqueConstraint(
                fields=["rater_user", "ratee_pharmacy", "direction"],
                name="uniq_worker_to_pharmacy_per_pair",
                condition=models.Q(direction="WORKER_TO_PHARMACY"),
            ),
        ]
        indexes = [
            models.Index(fields=["direction", "rater_user"]),
            models.Index(fields=["direction", "ratee_user"]),
            models.Index(fields=["direction", "ratee_pharmacy"]),
        ]

    def clean(self):
        # stars must be 1..5
        if not (1 <= int(self.stars) <= 5):
            raise ValidationError({"stars": "Stars must be between 1 and 5."})

        if self.direction == self.Direction.OWNER_TO_WORKER:
            # must target a user; must NOT target a pharmacy
            if not self.rater_user_id or not self.ratee_user_id:
                raise ValidationError("OWNER_TO_WORKER requires rater_user and ratee_user.")
            if self.ratee_pharmacy_id is not None:
                raise ValidationError("OWNER_TO_WORKER must not set ratee_pharmacy.")
        elif self.direction == self.Direction.WORKER_TO_PHARMACY:
            # must target a pharmacy; must NOT target a user
            if not self.rater_user_id or not self.ratee_pharmacy_id:
                raise ValidationError("WORKER_TO_PHARMACY requires rater_user and ratee_pharmacy.")
            if self.ratee_user_id is not None:
                raise ValidationError("WORKER_TO_PHARMACY must not set ratee_user.")
        else:
            raise ValidationError({"direction": "Unknown direction."})

    def save(self, *args, **kwargs):
        self.full_clean()
        return super().save(*args, **kwargs)

    def __str__(self):
        target = self.ratee_user_id or self.ratee_pharmacy_id
        return f"{self.direction} by {self.rater_user_id} → {target}: {self.stars}★"


class RatingReport(models.Model):
    class Status(models.TextChoices):
        OPEN = "OPEN", "Open"
        REVIEWED = "REVIEWED", "Reviewed"
        CLOSED = "CLOSED", "Closed"

    rating = models.ForeignKey(
        "Rating",
        on_delete=models.CASCADE,
        related_name="reports",
    )
    reporter = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="rating_reports_submitted",
    )
    reason = models.TextField(max_length=2000)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.OPEN, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["rating", "reporter"],
                condition=models.Q(status="OPEN"),
                name="uniq_open_rating_report_per_reporter",
            ),
        ]
        ordering = ["-created_at"]

    def __str__(self):
        return f"Rating report #{self.pk} for rating #{self.rating_id}"
