"""Django admin for the invoicing app (moved from client_profile/admin.py)."""
from django.contrib import admin
from invoicing.models import Invoice, InvoiceLineItem


class InvoiceLineItemInline(admin.TabularInline):
    model = InvoiceLineItem
    extra = 0
    fields = (
        'category_code','unit','description',
        'quantity','unit_price','discount','total',
        'gst_applicable','super_applicable','is_manual'
    )
    readonly_fields = ('total',)


@admin.register(Invoice)
class InvoiceAdmin(admin.ModelAdmin):
    list_display = (
        'id','user','status','invoice_date',
        'due_date','total'
    )
    list_filter  = ('status','gst_registered')
    inlines      = [InvoiceLineItemInline]
    readonly_fields = ('subtotal','gst_amount','super_amount','total')
