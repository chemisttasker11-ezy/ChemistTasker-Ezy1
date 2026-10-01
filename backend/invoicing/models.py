"""Invoices raised for completed shifts and in the finance workspace, with their line items."""
from django.db import models
from datetime import date


## Invoice model
class Invoice(models.Model):
    STATUS_CHOICES = [
        ('draft', 'Draft'),
        ('sent',  'Sent'),
        ('paid',  'Paid'),
    ]

    # Who issues the invoice
    user = models.ForeignKey(
        'users.User',
        on_delete=models.CASCADE,
        related_name='invoices'
    )

    # Optional link to a ChemistTasker pharmacy
    pharmacy = models.ForeignKey(
        'client_profile.Pharmacy',
        on_delete=models.CASCADE,
        related_name='invoices',
        null=True,
        blank=True
    )
    pharmacy_name_snapshot    = models.CharField(max_length=255, blank=True, default="")
    pharmacy_address_snapshot = models.TextField(blank=True, default="")
    pharmacy_abn_snapshot     = models.CharField(max_length=20, blank=True, default="")

    # External-invoice fields
    external                = models.BooleanField(default=False)
    custom_bill_to_name     = models.CharField(max_length=255, blank=True)
    custom_bill_to_address  = models.TextField(blank=True)

    # —────────── Issuer snapshot (the one creating the invoice) ──────────—
    issuer_first_name        = models.CharField(max_length=150, blank=True, default="")
    issuer_last_name         = models.CharField(max_length=150, blank=True, default="")
    issuer_abn           = models.CharField(max_length=20, blank=True, default="")
    issuer_email = models.EmailField(blank=True, default="")
    gst_registered       = models.BooleanField(default=False)
    super_rate_snapshot  = models.DecimalField(max_digits=5, decimal_places=2, default=12.0)

    # —────────── Recipient snapshot (who’s billed) ──────────—
    bill_to_first_name       = models.CharField(max_length=150, blank=True, default="")
    bill_to_last_name        = models.CharField(max_length=150, blank=True, default="")
    bill_to_abn              = models.CharField(max_length=20,  blank=True, default="")

    bank_account_name    = models.CharField(max_length=255, blank=True, default="")
    bsb                  = models.CharField(max_length=6,   blank=True, default="")
    account_number       = models.CharField(max_length=20,  blank=True, default="")

    super_fund_name      = models.CharField(max_length=255, blank=True, default="")
    super_usi            = models.CharField(max_length=50,  blank=True, default="")
    super_member_number  = models.CharField(max_length=50,  blank=True, default="")

    bill_to_email        = models.EmailField(blank=True, default="")
    cc_emails            = models.TextField(blank=True, default="", help_text="Comma-separated emails for CC")

    invoice_date = models.DateField(default=date.today)

    due_date     = models.DateField(null=True, blank=True)

    subtotal   = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    gst_amount = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    super_amount = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    total      = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    source_snapshot = models.JSONField(default=dict, blank=True)

    # Finance workspace state lives on the canonical invoice. Older invoices
    # legitimately leave request_key/customer unset and remain fully readable.
    customer = models.ForeignKey(
        'worker_finance.Customer', on_delete=models.RESTRICT,
        related_name='invoices', null=True, blank=True,
    )
    parent = models.OneToOneField(
        'self', on_delete=models.RESTRICT, related_name='super_document',
        null=True, blank=True,
    )
    kind = models.CharField(max_length=16, default='invoice')
    source = models.CharField(max_length=16, default='external')
    version = models.PositiveIntegerField(default=1)
    request_key = models.UUIDField(null=True, blank=True)
    payload = models.JSONField(default=dict, blank=True)
    calculation = models.JSONField(default=dict, blank=True)
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
    legacy_snapshot = models.BooleanField(default=False)
    updated_at = models.DateTimeField(auto_now=True)

    status     = models.CharField(max_length=10, choices=STATUS_CHOICES, default='draft')
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        ordering = ['-created_at', '-id']
        indexes = [
            models.Index(fields=['user']),
            models.Index(fields=['pharmacy']),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=['user', 'request_key'],
                condition=models.Q(request_key__isnull=False),
                name='invoice_user_request_key',
            ),
        ]

    def __str__(self):
        client = self.custom_bill_to_name if self.external else self.pharmacy_name_snapshot
        return f"Invoice {self.id} to {client}"


class InvoiceLineItem(models.Model):
    CATEGORY_CHOICES = [
        ('ProfessionalServices', 'Professional services'),
        ('Superannuation', 'Superannuation'),
        ('Transportation', 'Travel expenses'),
        ('Accommodation', 'Accommodation'),
        ('Miscellaneous', 'Miscellaneous reimbursements'),
    ]
    UNIT_CHOICES = [
        ('Hours', 'Hours'),
        ('Lump Sum', 'Lump Sum'),
    ]

    invoice = models.ForeignKey(
        Invoice,
        on_delete=models.CASCADE,
        related_name='line_items'
    )
    description      = models.CharField(max_length=255)
    category_code    = models.CharField(
        max_length=20,
        choices=CATEGORY_CHOICES,
        default='ProfessionalServices',
        help_text='ATO category code'
    )
    unit             = models.CharField(
        max_length=50,
        choices=UNIT_CHOICES,
        default='Hours',
        help_text='Unit of measure'
    )
    quantity         = models.DecimalField(max_digits=6, decimal_places=2)
    unit_price       = models.DecimalField(max_digits=10, decimal_places=2)
    discount         = models.DecimalField(
        max_digits=5, decimal_places=2,
        default=0,
        help_text='Discount percentage'
    )
    total            = models.DecimalField(max_digits=10, decimal_places=2)

    gst_applicable   = models.BooleanField(default=True)
    super_applicable = models.BooleanField(default=True)
    is_manual        = models.BooleanField(default=False)
    was_modified     = models.BooleanField(default=False)  # ✅ New field

    shift = models.ForeignKey(
        'client_profile.Shift',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='invoice_items'
    )
    source_assignment = models.ForeignKey(
        'client_profile.ShiftSlotAssignment',
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='invoice_line_items',
    )
    class Meta:
        indexes = [
            models.Index(fields=['invoice']),
            models.Index(fields=['shift']),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=['source_assignment'],
                condition=models.Q(
                    source_assignment__isnull=False,
                    category_code='ProfessionalServices',
                ),
                name='uniq_professional_invoice_assignment',
            )
        ]

    def __str__(self):
        return f"{self.description} – {self.quantity} {self.unit} @ {self.unit_price}"
