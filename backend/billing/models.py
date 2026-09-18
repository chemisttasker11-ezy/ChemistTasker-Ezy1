from django.db import models
from django.contrib.auth import get_user_model

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
        ('failed', 'Failed'),
    )

    owner = models.ForeignKey(User, on_delete=models.CASCADE, related_name='payments')
    shift = models.ForeignKey('client_profile.Shift', on_delete=models.SET_NULL, null=True, blank=True, related_name='payments')
    
    stripe_payment_intent_id = models.CharField(max_length=255, blank=True, null=True)
    stripe_invoice_id = models.CharField(max_length=255, blank=True, null=True)
    stripe_event_id = models.CharField(max_length=255, blank=True, null=True, unique=True)
    
    payment_type = models.CharField(max_length=50, choices=PAYMENT_TYPE_CHOICES)
    payment_method = models.CharField(max_length=50, choices=PAYMENT_METHOD_CHOICES)
    status = models.CharField(max_length=50, choices=STATUS_CHOICES, default='pending')
    
    amount_aud = models.DecimalField(max_digits=10, decimal_places=2)
    
    created_at = models.DateTimeField(auto_now_add=True)
    paid_at = models.DateTimeField(blank=True, null=True)

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


class StripeWebhookEvent(models.Model):
    STATUS_PROCESSING = 'processing'
    STATUS_PROCESSED = 'processed'
    STATUS_FAILED = 'failed'
    STATUS_CHOICES = (
        (STATUS_PROCESSING, 'Processing'),
        (STATUS_PROCESSED, 'Processed'),
        (STATUS_FAILED, 'Failed'),
    )

    event_id = models.CharField(max_length=255, unique=True)
    event_type = models.CharField(max_length=120)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_PROCESSING)
    received_at = models.DateTimeField(auto_now_add=True)
    processed_at = models.DateTimeField(blank=True, null=True)
    last_error = models.CharField(max_length=255, blank=True)

    class Meta:
        ordering = ['-received_at']

    def __str__(self):
        return f"{self.event_type} ({self.event_id}) - {self.status}"
