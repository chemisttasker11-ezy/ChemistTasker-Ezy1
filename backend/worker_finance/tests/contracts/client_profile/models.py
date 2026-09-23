"""Fields consumed from the existing canonical models; kept deliberately explicit."""
from datetime import date
from django.conf import settings
from django.db import models


class Pharmacy(models.Model):
    name = models.CharField(max_length=255)


class Notification(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    type = models.CharField(max_length=32, default='task')
    title = models.CharField(max_length=255)
    body = models.TextField(blank=True)
    action_url = models.CharField(max_length=512, blank=True)
    payload = models.JSONField(default=dict, blank=True)


class ShiftSlotAssignment(models.Model):
    slot_date = models.DateField(default=date.today)


class PharmacistOnboarding(models.Model):
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)


class OtherStaffOnboarding(models.Model):
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)


class Invoice(models.Model):
    pharmacy = models.ForeignKey(Pharmacy, null=True, on_delete=models.SET_NULL)
    source_snapshot = models.JSONField(default=dict, blank=True)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    external = models.BooleanField(default=False)
    custom_bill_to_name = models.CharField(max_length=255, blank=True)
    custom_bill_to_address = models.TextField(blank=True)
    issuer_first_name = models.CharField(max_length=150, blank=True)
    issuer_last_name = models.CharField(max_length=150, blank=True)
    issuer_abn = models.CharField(max_length=20, blank=True)
    issuer_email = models.EmailField(blank=True)
    bill_to_email = models.EmailField(blank=True)
    bill_to_abn = models.CharField(max_length=20, blank=True)
    bank_account_name = models.CharField(max_length=255, blank=True)
    bsb = models.CharField(max_length=6, blank=True)
    account_number = models.CharField(max_length=20, blank=True)
    super_fund_name = models.CharField(max_length=255, blank=True)
    super_usi = models.CharField(max_length=50, blank=True)
    super_member_number = models.CharField(max_length=50, blank=True)
    super_rate_snapshot = models.DecimalField(max_digits=5, decimal_places=2, default=12)
    gst_registered = models.BooleanField(default=False)
    invoice_date = models.DateField(default=date.today)
    due_date = models.DateField(null=True)
    subtotal = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    gst_amount = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    super_amount = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    total = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    status = models.CharField(max_length=10, default='draft')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    customer = models.ForeignKey('worker_finance.Customer', null=True, on_delete=models.RESTRICT, related_name='invoices')
    parent = models.OneToOneField('self', null=True, on_delete=models.RESTRICT, related_name='super_document')
    kind = models.CharField(max_length=16, default='invoice')
    source = models.CharField(max_length=16, default='external')
    version = models.PositiveIntegerField(default=1)
    request_key = models.UUIDField(null=True)
    payload = models.JSONField(default=dict)
    calculation = models.JSONField(default=dict)
    locked_at = models.DateTimeField(null=True)
    voided_at = models.DateTimeField(null=True)
    review_status = models.CharField(max_length=32, default='NONE')
    last_review_note = models.TextField(blank=True, default='')
    last_reviewed_at = models.DateTimeField(null=True)
    legacy_snapshot = models.BooleanField(default=False)

    class Meta:
        ordering = ['-created_at', '-id']


class InvoiceLineItem(models.Model):
    source_assignment = models.ForeignKey(ShiftSlotAssignment, null=True, on_delete=models.PROTECT)
    invoice = models.ForeignKey(Invoice, on_delete=models.CASCADE, related_name='line_items')
    description = models.CharField(max_length=255)
    category_code = models.CharField(max_length=20)
    unit = models.CharField(max_length=50)
    quantity = models.DecimalField(max_digits=6, decimal_places=2)
    unit_price = models.DecimalField(max_digits=10, decimal_places=2)
    discount = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    total = models.DecimalField(max_digits=10, decimal_places=2)
    gst_applicable = models.BooleanField(default=True)
    super_applicable = models.BooleanField(default=True)
    is_manual = models.BooleanField(default=False)
    was_modified = models.BooleanField(default=False)
