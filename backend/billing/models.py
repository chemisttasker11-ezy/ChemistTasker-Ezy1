from django.db import models
from django.contrib.auth import get_user_model
import uuid

User = get_user_model()


class OwnerSubscription(models.Model):
    STATUS_CHOICES = (
        ('active', 'Active'),
        ('inactive', 'Inactive'),
        ('canceled', 'Canceled'),
    )

    owner = models.OneToOneField(
        User,
        on_delete=models.CASCADE,
        related_name='subscription',
        blank=True,
        null=True,
    )
    organization = models.OneToOneField(
        'client_profile.Organization',
        on_delete=models.CASCADE,
        related_name='subscription',
        blank=True,
        null=True,
    )
    billing_contact = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        related_name='billing_contacts',
        blank=True,
        null=True,
    )
    stripe_customer_id = models.CharField(max_length=255, blank=True, null=True)
    stripe_subscription_id = models.CharField(max_length=255, blank=True, null=True)
    stripe_extra_seat_subscription_id = models.CharField(max_length=255, blank=True, null=True)
    status = models.CharField(max_length=50, choices=STATUS_CHOICES, default='inactive')
    staff_count = models.IntegerField(default=5)
    current_period_end = models.DateTimeField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.CheckConstraint(
                check=(
                    (models.Q(owner__isnull=False) & models.Q(organization__isnull=True))
                    | (models.Q(owner__isnull=True) & models.Q(organization__isnull=False))
                ),
                name='billing_subscription_single_account_owner_or_org',
            ),
        ]

    @property
    def account_label(self):
        if self.organization_id:
            return self.organization.name
        if self.owner_id:
            return self.owner.email
        return 'Unknown billing account'

    def __str__(self):
        return f"{self.account_label} - {self.status} ({self.staff_count} staff)"

class ShiftPayment(models.Model):
    PAYMENT_TYPE_CHOICES = (
        ('fulfillment', 'Shift Fulfillment Fee'),
        ('cancellation', 'Cancellation Penalty'),
        ('subscription', 'Subscription'),
    )
    
    PAYMENT_METHOD_CHOICES = (
        ('card', 'Credit Card'),
        ('invoice', 'Invoice / Bank Transfer'),
    )
    
    STATUS_CHOICES = (
        ('pending', 'Pending'),
        ('paid', 'Paid'),
        ('partially_refunded', 'Partially refunded'),
        ('refunded', 'Refunded'),
        ('failed', 'Failed'),
    )

    owner = models.ForeignKey(User, on_delete=models.CASCADE, related_name='payments')
    shift = models.ForeignKey('client_profile.Shift', on_delete=models.SET_NULL, null=True, blank=True, related_name='payments')
    
    stripe_payment_intent_id = models.CharField(max_length=255, blank=True, null=True)
    stripe_invoice_id = models.CharField(max_length=255, blank=True, null=True)
    
    payment_type = models.CharField(max_length=50, choices=PAYMENT_TYPE_CHOICES)
    payment_method = models.CharField(max_length=50, choices=PAYMENT_METHOD_CHOICES)
    status = models.CharField(max_length=50, choices=STATUS_CHOICES, default='pending')
    
    amount_aud = models.DecimalField(max_digits=10, decimal_places=2)
    refunded_amount_aud = models.DecimalField(
        max_digits=10, decimal_places=2, default=0,
        help_text="Cumulative refund confirmed by Stripe for this payment.",
    )
    
    created_at = models.DateTimeField(auto_now_add=True)
    paid_at = models.DateTimeField(blank=True, null=True)
    reconciliation_required = models.BooleanField(default=False)
    reconciliation_reason = models.CharField(max_length=160, blank=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=("stripe_payment_intent_id",),
                condition=models.Q(stripe_payment_intent_id__isnull=False)
                & ~models.Q(stripe_payment_intent_id=""),
                name="billing_unique_nonempty_payment_intent",
            ),
        ]

    def __str__(self):
        return f"{self.get_payment_type_display()} - {self.owner.email} - ${self.amount_aud} ({self.status})"


class StripeWebhookEvent(models.Model):
    class Status(models.TextChoices):
        PROCESSING = 'processing', 'Processing'
        PROCESSED = 'processed', 'Processed'
        FAILED = 'failed', 'Failed'

    event_id = models.CharField(max_length=255, unique=True)
    event_type = models.CharField(max_length=120)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PROCESSING)
    received_at = models.DateTimeField(auto_now_add=True)
    processed_at = models.DateTimeField(blank=True, null=True)
    failed_at = models.DateTimeField(blank=True, null=True)

    class Meta:
        ordering = ['-received_at']
        indexes = [
            models.Index(fields=['event_type', 'received_at'], name='billing_event_type_received'),
        ]

    def __str__(self):
        return f"{self.event_type} {self.event_id} ({self.status})"


class FulfillmentCheckout(models.Model):
    """Durable provider attempt; reservations survive ambiguous network outcomes."""
    class State(models.TextChoices):
        PREPARED = "prepared", "Prepared"
        OPEN = "open", "Open"
        UNKNOWN = "unknown", "Provider outcome unknown"
        COMPLETE = "complete", "Paid"
        EXPIRED = "expired", "Confirmed expired and unpaid"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    shift = models.ForeignKey("client_profile.Shift", on_delete=models.SET_NULL, null=True,
                              related_name="fulfillment_checkouts")
    original_shift_id = models.PositiveBigIntegerField()
    actor = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, related_name="fulfillment_checkouts")
    offer_ids = models.JSONField(default=list)
    parameters = models.JSONField(default=dict)
    parameter_hash = models.CharField(max_length=64)
    expected_amount_cents = models.PositiveIntegerField()
    state = models.CharField(max_length=16, choices=State.choices, default=State.PREPARED)
    stripe_session_id = models.CharField(max_length=255, null=True, blank=True, unique=True)
    checkout_url = models.TextField(blank=True)
    provider_expires_at = models.DateTimeField(null=True, blank=True)
    payment = models.OneToOneField(ShiftPayment, on_delete=models.PROTECT, null=True, blank=True,
                                  related_name="fulfillment_checkout")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        indexes = [models.Index(fields=["original_shift_id", "state"], name="billing_checkout_shift_state")]


class FulfillmentReservation(models.Model):
    checkout = models.ForeignKey(FulfillmentCheckout, on_delete=models.PROTECT, related_name="reservations")
    occurrence_key = models.CharField(max_length=160)
    active = models.BooleanField(default=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["occurrence_key"], condition=models.Q(active=True),
                                                name="billing_one_active_fulfillment")]
