"""Moved verbatim from client_profile/views.py (Stage 2 domain split). Behaviour is unchanged; client_profile/views.py re-exports these names."""
from rest_framework import generics, permissions, status
from client_profile.models import Invoice, Notification, Pharmacy, Shift
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.exceptions import PermissionDenied
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework.decorators import api_view, permission_classes
from client_profile.admin_helpers import pharmacies_user_admins
from django.shortcuts import get_object_or_404
import json
from django.db.models import F, Q
from client_profile.services import (
    generate_invoice_from_shifts,
    generate_preview_invoice_lines,
    render_invoice_to_pdf,
)
from client_profile.notifications import notify_users
from core.task_queue import async_task
from django.db import transaction
from django.http import HttpResponse
from client_profile.domains.invoices.serializers import InvoiceSerializer
# Shared helpers that still live in the legacy module until their own domain is extracted:
from client_profile.domains.common.access import _get_org_pharmacies_queryset
from client_profile.domains.dashboards.views import _dashboard_invoice_action_url


# Invoices
def _invoice_queryset_for_user(user):
    if not user or not getattr(user, "is_authenticated", False):
        return Invoice.objects.none()

    owned_pharmacy_ids = Pharmacy.objects.filter(owner__user=user).values_list("id", flat=True)
    admin_pharmacy_ids = pharmacies_user_admins(user).values_list("id", flat=True)
    org_pharmacy_ids = _get_org_pharmacies_queryset(user).values_list("id", flat=True)

    managed_pharmacy_invoice = (
        Q(pharmacy_id__in=owned_pharmacy_ids)
        | Q(pharmacy_id__in=admin_pharmacy_ids)
        | Q(pharmacy_id__in=org_pharmacy_ids)
    )
    manager_visible_state = (
        Q(request_key__isnull=True)
        | Q(
            deliveries__version=F("version"),
            deliveries__status__in=["sent", "legacy_queued"],
        )
        | Q(status__in=["sent", "paid"])
        | ~Q(review_status="NONE")
    )

    return Invoice.objects.filter(
        Q(user=user) | (managed_pharmacy_invoice & manager_visible_state)
    ).distinct()


class InvoiceListView(generics.ListCreateAPIView):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = InvoiceSerializer

    def get_queryset(self):
        return _invoice_queryset_for_user(self.request.user)

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)


class InvoiceDetailView(generics.RetrieveUpdateDestroyAPIView):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = InvoiceSerializer
    lookup_field = 'pk'

    def get_queryset(self):
        return _invoice_queryset_for_user(self.request.user)

    def perform_update(self, serializer):
        invoice = self.get_object()
        user = self.request.user
        requested_fields = set(self.request.data.keys())

        if invoice.user_id == user.id:
            if invoice.request_key is not None:
                raise PermissionDenied(
                    "This invoice is managed by the new Invoices & finances workspace. "
                    "Use its Save, Send/Resend and Mark paid actions so revision and delivery history are preserved."
                )
            serializer.save()
            return

        if invoice.request_key is not None:
            raise PermissionDenied(
                "This invoice is managed by the Received invoices workspace. "
                "Use Approve, Request revision or Mark paid there so the decision is bound to the correct revision."
            )

        if requested_fields != {"status"}:
            raise PermissionDenied("Received invoices can only have their payment status updated.")

        next_status = self.request.data.get("status")
        if next_status not in {"sent", "paid"}:
            raise PermissionDenied("Received invoices can only be marked as paid or unpaid.")

        serializer.save(status=next_status)

    def perform_destroy(self, instance):
        if instance.user_id != self.request.user.id:
            raise PermissionDenied("Only the invoice issuer can delete this invoice.")
        if instance.request_key is not None:
            raise PermissionDenied("Finance-workspace invoices keep their revision history and cannot be deleted through the legacy editor.")
        instance.delete()


class GenerateInvoiceView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        data = request.data

        required = [
            'issuer_abn', 'gst_registered', 'super_rate_snapshot',
            'bank_account_name', 'bsb', 'account_number', 'bill_to_email', 'cc_emails',
        ]
        missing = [f for f in required if f not in data]
        if missing:
            return Response(
                {'error': f"Missing fields: {', '.join(missing)}"},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Parse custom line items
        line_items_raw = data.get('line_items')
        custom_lines = []
        if line_items_raw:
            if isinstance(line_items_raw, str):
                try:
                    custom_lines = json.loads(line_items_raw)
                except Exception as ex:
                    return Response({'error': f'Invalid line_items: {ex}'}, status=status.HTTP_400_BAD_REQUEST)
            else:
                custom_lines = line_items_raw

        # Parse shift_ids
        shift_ids_raw = data.get('shift_ids')
        shift_ids = []
        if shift_ids_raw:
            if isinstance(shift_ids_raw, str):
                try:
                    shift_ids = json.loads(shift_ids_raw)
                except Exception as ex:
                    return Response({'error': f'Invalid shift_ids: {ex}'}, status=status.HTTP_400_BAD_REQUEST)
            else:
                shift_ids = shift_ids_raw
        else:
            shift_ids = []

        try:
            invoice = generate_invoice_from_shifts(
                user=request.user,
                pharmacy_id=data.get('pharmacy'),
                shift_ids=shift_ids,
                custom_lines=custom_lines,
                external=data.get('external', False),
                billing_data=data,
                due_date=data.get('due_date')
            )
        except DjangoValidationError as exc:
            payload = exc.message_dict if hasattr(exc, "message_dict") else {
                "error": exc.messages[0] if getattr(exc, "messages", None) else str(exc)
            }
            return Response(payload, status=status.HTTP_400_BAD_REQUEST)

        return Response(InvoiceSerializer(invoice).data, status=status.HTTP_201_CREATED)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def preview_invoice_lines(request, shift_id):
    try:
        shift = Shift.objects.get(id=shift_id)
    except Shift.DoesNotExist:
        return Response({"error": "Shift not found"}, status=404)

    try:
        line_items = generate_preview_invoice_lines(shift, request.user)
    except DjangoValidationError as exc:
        payload = exc.message_dict if hasattr(exc, "message_dict") else {
            "error": exc.messages[0] if getattr(exc, "messages", None) else str(exc)
        }
        return Response(payload, status=status.HTTP_400_BAD_REQUEST)
    return Response(line_items)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def invoice_pdf_view(request, invoice_id):
    invoice = get_object_or_404(_invoice_queryset_for_user(request.user), pk=invoice_id)

    pdf_bytes = render_invoice_to_pdf(invoice)
    response = HttpResponse(pdf_bytes, content_type="application/pdf")
    response['Content-Disposition'] = f'inline; filename="invoice_{invoice.id}.pdf"'
    return response


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def send_invoice_email(request, invoice_id):
    # Serialize send attempts so the legacy screen and the newer finance
    # workspace cannot send the same canonical document twice concurrently.
    with transaction.atomic():
        invoice = get_object_or_404(
            Invoice.objects.select_for_update(),
            pk=invoice_id,
            user=request.user,
        )
        if invoice.status != 'draft':
            return Response(
                {"status": invoice.status, "detail": "This invoice has already been issued."},
                status=status.HTTP_409_CONFLICT,
            )

        to_email = (invoice.bill_to_email or "").strip()
        if not to_email:
            return Response({"detail": "Missing bill_to_email on invoice."}, status=400)

        cc_list = []
        if invoice.cc_emails:
            cc_list = [e.strip() for e in invoice.cc_emails.split(",") if e.strip()]

        pdf_bytes = render_invoice_to_pdf(invoice)
        filename = f"invoice_{invoice.id}.pdf"
        full_bill_to_name = f"{(invoice.bill_to_first_name or '').strip()} {(invoice.bill_to_last_name or '').strip()}".strip()
        context = {
            "invoice": invoice,
            "client_name": (
                (invoice.custom_bill_to_name or "").strip()
                or full_bill_to_name
                or (invoice.pharmacy_name_snapshot or "").strip()
            ),
            "issuer_name": f"{invoice.issuer_first_name} {invoice.issuer_last_name}".strip(),
            "subtotal": str(invoice.subtotal),
            "gst_amount": str(invoice.gst_amount),
            "super_amount": str(invoice.super_amount),
            "total": str(invoice.total),
            "invoice_date": str(invoice.invoice_date),
            "due_date": str(invoice.due_date or ""),
        }

        # Preserve the existing async email path. The DB row lock prevents a
        # second request from queuing the same canonical invoice concurrently.
        async_task(
            'users.tasks.send_async_email',
            subject=f"Invoice #{invoice.id} from ChemistTasker",
            recipient_list=[to_email],
            template_name="emails/invoice_sent.html",
            context=context,
            text_template=None,
            cc=cc_list,
            attachments=[(filename, pdf_bytes, "application/pdf")],
        )

        invoice.status = 'sent'
        invoice.save(update_fields=['status'])

        # If this invoice belongs to the new finance workspace, record the
        # legacy send against the current revision without locking future edits.
        from worker_finance.models import Delivery
        record = Invoice.objects.select_for_update().get(pk=invoice.pk)
        if record.request_key is not None:
            Delivery.objects.get_or_create(
                invoice=record,
                version=record.version,
                defaults={
                    'recipient': to_email,
                    'status': 'legacy_queued',
                },
            )
            from worker_finance.services import record_revision_state
            record.refresh_from_db()
            record_revision_state(record)

    return Response({"status": "sent"})


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def report_invoice_issue(request, invoice_id):
    invoice = get_object_or_404(_invoice_queryset_for_user(request.user), pk=invoice_id)
    if invoice.user_id == request.user.id:
        return Response({"detail": "You cannot report an issue on your own invoice."}, status=400)
    if invoice.request_key is not None:
        raise PermissionDenied(
            "This invoice is managed by the Received invoices workspace. "
            "Use Request revision with a note so the request is attached to the exact invoice revision."
        )

    reporter_name = (
        f"{getattr(request.user, 'first_name', '')} {getattr(request.user, 'last_name', '')}".strip()
        or getattr(request.user, "email", "")
        or "The invoice recipient"
    )
    note = str(request.data.get("message") or "").strip()
    body = f"{reporter_name} reported an issue with invoice #{invoice.id}."
    if note:
        body = f"{body} {note}"

    notify_users(
        [invoice.user_id],
        title=f"Issue reported on invoice #{invoice.id}",
        body=body,
        notification_type=Notification.Type.ALERT,
        action_url=_dashboard_invoice_action_url(invoice, None),
        payload={
            "kind": "invoice_issue",
            "invoice_id": invoice.id,
            "reported_by_user_id": request.user.id,
        },
    )

    return Response({"status": "reported"})
