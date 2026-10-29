"""URL ownership for the invoicing domain under the canonical API-v1 composition."""
from django.urls import path
from invoicing.views import (
    GenerateInvoiceView,
    InvoiceDetailView,
    InvoiceListView,
    invoice_pdf_view,
    preview_invoice_lines,
    preview_generated_invoice,
    report_invoice_issue,
    send_invoice_email,
)


urlpatterns = [
    path('invoices/', InvoiceListView.as_view(), name='invoice-list'),
    path('invoices/preview/<int:shift_id>/', preview_invoice_lines, name='invoice-preview'),
    path('invoices/<int:pk>/', InvoiceDetailView.as_view(), name='invoice-detail'),
    path('invoices/generate/', GenerateInvoiceView.as_view(), name='generate-invoice'),
    path('invoices/generate/preview/', preview_generated_invoice, name='generate-invoice-preview'),
    path('invoices/<int:invoice_id>/pdf/', invoice_pdf_view, name='invoice_pdf'),
    path('invoices/<int:invoice_id>/send/', send_invoice_email, name='send-invoice-email'),
    path('invoices/<int:invoice_id>/report-issue/', report_invoice_issue, name='report-invoice-issue'),
]
