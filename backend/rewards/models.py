"""Pill rewards: reward rules, referral codes and events, and the append-only pill ledger."""
from django.db import models
from django.conf import settings
from django.utils import timezone


class PillRewardRule(models.Model):
    class EventType(models.TextChoices):
        EARN = "EARN", "Earn"
        SPEND = "SPEND", "Spend"

    class Audience(models.TextChoices):
        ANY = "ANY", "Any authenticated user"
        SHIFT_POSTER = "SHIFT_POSTER", "Shift posters"
        WORKER = "WORKER", "Workers"

    code = models.SlugField(max_length=80, unique=True)
    name = models.CharField(max_length=160)
    description = models.TextField(blank=True, default="")
    event_type = models.CharField(max_length=12, choices=EventType.choices)
    audience = models.CharField(max_length=24, choices=Audience.choices, default=Audience.ANY)
    pill_amount = models.PositiveIntegerField(
        help_text="Readable configurable pill amount for this rule. Spend rules deduct this many pills."
    )
    is_active = models.BooleanField(default=True)
    starts_at = models.DateTimeField(blank=True, null=True)
    ends_at = models.DateTimeField(blank=True, null=True)
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        indexes = [
            models.Index(fields=["code"]),
            models.Index(fields=["event_type", "is_active"]),
            models.Index(fields=["audience", "is_active"]),
        ]
        ordering = ["code"]

    def __str__(self):
        return f"{self.name} ({self.pill_amount} pills)"

    def is_current(self, at=None):
        at = at or timezone.now()
        if not self.is_active:
            return False
        if self.starts_at and self.starts_at > at:
            return False
        if self.ends_at and self.ends_at <= at:
            return False
        return True


class PillReferralCode(models.Model):
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="pill_referral_code",
    )
    code = models.CharField(max_length=32, unique=True, db_index=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        indexes = [
            models.Index(fields=["user"]),
            models.Index(fields=["code", "is_active"]),
        ]

    def __str__(self):
        return f"{self.code} -> {self.user.email}"


class PillReferralEvent(models.Model):
    class ReferralType(models.TextChoices):
        FRIEND = "FRIEND", "Friend referral"
        SHIFT = "SHIFT", "Shift referral"

    class Status(models.TextChoices):
        PENDING = "PENDING", "Pending"
        CLAIMED = "CLAIMED", "Claimed"
        AWARDED = "AWARDED", "Awarded"
        CANCELLED = "CANCELLED", "Cancelled"

    referrer = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="pill_referrals_sent",
    )
    referred_user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="pill_referrals_received",
    )
    referral_code = models.ForeignKey(
        PillReferralCode,
        on_delete=models.PROTECT,
        related_name="events",
    )
    referral_type = models.CharField(max_length=16, choices=ReferralType.choices)
    shift = models.ForeignKey(
        "client_profile.Shift",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="pill_referral_events",
    )
    referred_email = models.EmailField(blank=True, default="")
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.PENDING)
    claimed_at = models.DateTimeField(blank=True, null=True)
    awarded_at = models.DateTimeField(blank=True, null=True)
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        indexes = [
            models.Index(fields=["referrer", "referral_type"]),
            models.Index(fields=["referred_user", "status"]),
            models.Index(fields=["shift", "referral_type"]),
            models.Index(fields=["status", "created_at"]),
        ]

    def __str__(self):
        target = self.referred_user.email if self.referred_user_id else self.referred_email or "unclaimed"
        return f"{self.referral_type} referral {self.referrer.email} -> {target}"


class PillLedgerEntry(models.Model):
    class EntryType(models.TextChoices):
        EARN = "EARN", "Earn"
        SPEND = "SPEND", "Spend"
        ADJUSTMENT = "ADJUSTMENT", "Adjustment"
        REVERSAL = "REVERSAL", "Reversal"

    class Source(models.TextChoices):
        FRIEND_REFERRAL = "FRIEND_REFERRAL", "Friend referral"
        SHIFT_REFERRAL = "SHIFT_REFERRAL", "Shift referral"
        SHIFT_POST = "SHIFT_POST", "Shift post"
        PAYMENT_CREDIT = "PAYMENT_CREDIT", "Payment credit"
        MANUAL = "MANUAL", "Manual"

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="pill_ledger_entries",
    )
    rule = models.ForeignKey(
        PillRewardRule,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="ledger_entries",
    )
    referral_event = models.ForeignKey(
        PillReferralEvent,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="ledger_entries",
    )
    shift = models.ForeignKey(
        "client_profile.Shift",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="pill_ledger_entries",
    )
    entry_type = models.CharField(max_length=16, choices=EntryType.choices)
    source = models.CharField(max_length=32, choices=Source.choices)
    delta = models.IntegerField(help_text="Signed pill delta. Earn is positive, spend is negative.")
    balance_after = models.IntegerField()
    description = models.CharField(max_length=255, blank=True, default="")
    idempotency_key = models.CharField(max_length=160, unique=True, db_index=True)
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [
            models.Index(fields=["user", "created_at"]),
            models.Index(fields=["source", "created_at"]),
            models.Index(fields=["entry_type", "created_at"]),
        ]
        ordering = ["-created_at", "-id"]

    def __str__(self):
        return f"{self.user.email}: {self.delta:+d} pills ({self.source})"
