"""Preserve legacy invoices; prevent legacy editors from changing managed snapshots.

These routes precede the old client-profile include. Authentication and object
permissions are performed by the selected DRF view, not by the routing lookup.
The delegates preserve DRF's CSRF exemption at the outer URL callback; session
CSRF enforcement remains the responsibility of the selected DRF authenticator.
"""
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from django.shortcuts import get_object_or_404
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.cache import never_cache
from django.apps import apps
from .views import pdf_response

Invoice = apps.get_model('client_profile', 'Invoice')


@never_cache
@api_view(['GET', 'PATCH', 'PUT', 'DELETE', 'POST'])
@permission_classes([IsAuthenticated])
def managed_legacy(request, invoice_id, operation='detail'):
    record = get_object_or_404(Invoice, pk=invoice_id, user=request.user, request_key__isnull=False)
    if operation == 'pdf' and request.method == 'GET':
        return pdf_response(record)
    return Response({'detail': 'This invoice belongs to the finance workspace. Open it there to preserve its tax and payment history.',
                     'finance_record_id': record.pk}, status=409)


@csrf_exempt
def detail(request, pk):
    if Invoice.objects.filter(pk=pk, request_key__isnull=False).exists():
        return managed_legacy(request, invoice_id=pk)
    from client_profile.views import InvoiceDetailView
    return InvoiceDetailView.as_view()(request, pk=pk)


@csrf_exempt
def pdf(request, invoice_id):
    if Invoice.objects.filter(pk=invoice_id, request_key__isnull=False).exists():
        return managed_legacy(request, invoice_id=invoice_id, operation='pdf')
    from client_profile.views import invoice_pdf_view
    return invoice_pdf_view(request, invoice_id=invoice_id)


@csrf_exempt
def send(request, invoice_id):
    if Invoice.objects.filter(pk=invoice_id, request_key__isnull=False).exists():
        return managed_legacy(request, invoice_id=invoice_id, operation='send')
    from client_profile.views import send_invoice_email
    return send_invoice_email(request, invoice_id=invoice_id)
