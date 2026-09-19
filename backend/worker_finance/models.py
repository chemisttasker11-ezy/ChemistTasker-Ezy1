"""Private worker records; Invoice remains the existing canonical invoice model."""
import uuid
from django.conf import settings
from django.db import models


class OwnedRecord(models.Model):
    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True


class Customer(OwnedRecord):
    name = models.CharField(max_length=255)
    legal_name = models.CharField(max_length=255, blank=True)
    abn = models.CharField(max_length=11, blank=True)
    contact_name = models.CharField(max_length=150, blank=True)
    email = models.EmailField(blank=True)
    phone = models.CharField(max_length=40, blank=True)
    address = models.TextField(blank=True)
    payment_terms_days = models.PositiveSmallIntegerField(default=14)
    notes = models.TextField(blank=True)
    active = models.BooleanField(default=True)
    abn_result = models.JSONField(default=dict, blank=True)
    abn_checked_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['name', 'id']
        indexes = [models.Index(fields=['owner', 'active'], name='wf_customer_owner_active')]


class CatalogueItem(OwnedRecord):
    code = models.CharField(max_length=40, blank=True, default="")
    name = models.CharField(max_length=255)
    category = models.CharField(max_length=20, default='ProfessionalServices')
    unit = models.CharField(max_length=30, default='Hours')
    unit_price = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    tax_code = models.CharField(max_length=16, default='OUT_OF_SCOPE')
    super_eligible = models.BooleanField(default=False)
    active = models.BooleanField(default=True)

    class Meta:
        ordering = ['name', 'id']
        indexes = [models.Index(fields=['owner', 'active'], name='finance_item_owner_active')]


class InvoiceRecord(OwnedRecord):
    invoice = models.OneToOneField('client_profile.Invoice', on_delete=models.RESTRICT,
                                  related_name='finance_record')
    customer = models.ForeignKey(Customer, on_delete=models.RESTRICT)
    parent = models.OneToOneField('self', null=True, blank=True, on_delete=models.RESTRICT,
                                 related_name='super_document')
    kind = models.CharField(max_length=16, default='invoice')
    source = models.CharField(max_length=16, default='external')
    version = models.PositiveIntegerField(default=1)
    request_key = models.UUIDField(default=uuid.uuid4)
    payload = models.JSONField(default=dict)
    calculation = models.JSONField(default=dict)
    locked_at = models.DateTimeField(null=True, blank=True)
    voided_at = models.DateTimeField(null=True, blank=True)
    review_status = models.CharField(
        max_length=32,
        default='NONE',
        choices=[
            ('NONE', 'No owner review decision'),
            ('APPROVED_FOR_PAYMENT', 'Approved for payment'),
            ('REVISION_REQUESTED', 'Revision requested'),
        ],
    )
    last_review_note = models.TextField(blank=True, default='')
    last_reviewed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-created_at', '-id']
        constraints = [models.UniqueConstraint(fields=['owner', 'request_key'], name='finance_invoice_request')]


class InvoiceRevision(models.Model):
    record = models.ForeignKey(InvoiceRecord, on_delete=models.CASCADE, related_name='revisions')
    version = models.PositiveIntegerField()
    payload = models.JSONField(default=dict)
    calculation = models.JSONField(default=dict)
    invoice_status = models.CharField(max_length=16, default='draft')
    review_status = models.CharField(max_length=32, default='NONE')
    source_snapshot = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-version']
        constraints = [
            models.UniqueConstraint(fields=['record', 'version'], name='finance_invoice_revision_version')
        ]


class InvoiceReviewRequest(models.Model):
    record = models.ForeignKey(InvoiceRecord, on_delete=models.CASCADE, related_name='review_requests')
    requested_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='invoice_revision_requests')
    requested_version = models.PositiveIntegerField()
    note = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)
    resolved_at = models.DateTimeField(null=True, blank=True)
    resolved_by_version = models.PositiveIntegerField(null=True, blank=True)

    class Meta:
        ordering = ['-created_at', '-id']


class Payment(models.Model):
    record = models.ForeignKey(InvoiceRecord, on_delete=models.CASCADE, related_name='payments')
    request_key = models.UUIDField()
    date = models.DateField()
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    gst = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    sales = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    reference = models.CharField(max_length=120, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=['record', 'request_key'], name='finance_payment_request')]
        ordering = ['date', 'id']


class Delivery(models.Model):
    record = models.ForeignKey(InvoiceRecord, on_delete=models.CASCADE, related_name='deliveries')
    version = models.PositiveIntegerField()
    status = models.CharField(max_length=16, default='preparing')
    recipient = models.EmailField()
    created_at = models.DateTimeField(auto_now_add=True)
    sent_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=['record', 'version'], name='finance_delivery_version')]
        ordering = ['-created_at']


class Expense(OwnedRecord):
    request_key = models.UUIDField(default=uuid.uuid4)
    version = models.PositiveIntegerField(default=1)
    supplier = models.CharField(max_length=255)
    description = models.CharField(max_length=255)
    category = models.CharField(max_length=40, default='Other')
    incurred_on = models.DateField()
    paid_on = models.DateField(null=True, blank=True)
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    gst_amount = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    tax_code = models.CharField(max_length=16, default='OUT_OF_SCOPE')
    business_use_percent = models.DecimalField(max_digits=5, decimal_places=2, default=100)
    gst_registered = models.BooleanField(default=False)
    evidence_confirmed = models.BooleanField(default=False)
    reimbursable = models.BooleanField(default=False)
    reference = models.CharField(max_length=120, blank=True)
    notes = models.TextField(blank=True)
    archived_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-incurred_on', '-id']
        constraints = [models.UniqueConstraint(fields=['owner', 'request_key'], name='finance_expense_request')]


class Receipt(models.Model):
    """Bounded DB-backed storage: never served through public MEDIA_URL.

    Deliberately small first-release implementation. Move bytes to a private
    storage alias when volume warrants it, preserving authenticated downloads.
    """
    expense = models.ForeignKey(Expense, on_delete=models.CASCADE, related_name='receipts')
    filename = models.CharField(max_length=160)
    media_type = models.CharField(max_length=40)
    sha256 = models.CharField(max_length=64)
    size = models.PositiveIntegerField()
    content = models.BinaryField(editable=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=['expense', 'sha256'], name='finance_receipt_checksum')]
