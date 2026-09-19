"""Authenticated, owner-scoped API. No public receipts or client-supplied totals."""
import hashlib
import logging
from datetime import date, datetime
from decimal import Decimal
from pathlib import Path
from uuid import UUID
from django.conf import settings
from django.core.mail import EmailMessage, get_connection
from django.db import transaction, IntegrityError
from django.db.models import Sum
from django.db import models
from django.http import HttpResponse, Http404
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.utils.cache import patch_vary_headers
from django.utils.http import content_disposition_header
from django.views.decorators.cache import never_cache
from rest_framework import serializers, status, viewsets
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import UserRateThrottle
from django.apps import apps
Invoice = apps.get_model('client_profile', 'Invoice')
Notification = apps.get_model('client_profile', 'Notification')
from .calculations import CalculationError, expense_gst_credit, shift_hours, ZERO
from .models import Customer, CatalogueItem, InvoiceRecord, InvoiceReviewRequest, Expense, Receipt, Delivery, Payment
from .serializers import CustomerSerializer, ItemSerializer, InvoiceInput, ExpenseSerializer, MoneyField
from .services import (
    save_draft, snapshot_lines, calculate, serialize_record, duplicate,
    make_super_document, record_payment, check_version, json_safe,
    invoice_defaults, internal_invoice_sources, internal_invoice_prefill,
    record_revision_state, serialize_revision, serialize_owner_revision, owner_visible_document,
)

logger = logging.getLogger(__name__)


class LookupThrottle(UserRateThrottle):
    rate = '10/min'


class PrivateFinanceMixin:
    """Do not leave bank details, receipts or accounting records in shared caches."""
    def finalize_response(self, request, response, *args, **kwargs):
        response = super().finalize_response(request, response, *args, **kwargs)
        response['Cache-Control'] = 'private, no-store'
        response['X-Content-Type-Options'] = 'nosniff'
        patch_vary_headers(response, ('Authorization', 'Cookie'))
        return response


class OwnedViewSet(PrivateFinanceMixin, viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    http_method_names = ['get', 'post', 'patch', 'head', 'options']

    def get_queryset(self):
        return self.queryset.filter(owner=self.request.user)

    def perform_create(self, serializer):
        try:
            with transaction.atomic():
                serializer.save(owner=self.request.user)
        except IntegrityError as exc:
            raise ValidationError('A record with this identifier already exists.') from exc


    def perform_update(self, serializer):
        try:
            with transaction.atomic():
                serializer.save()
        except IntegrityError as exc:
            raise ValidationError('A record with this identifier already exists.') from exc


class CustomerViewSet(OwnedViewSet):
    queryset = Customer.objects.all()
    serializer_class = CustomerSerializer

    @action(detail=True, methods=['post'], throttle_classes=[LookupThrottle])
    def lookup_abn(self, request, pk=None):
        customer = self.get_object()
        if not customer.abn:
            raise ValidationError('Save a valid ABN first.')
        # Reuse the existing ABR checker; do not build a second lookup service.
        from client_profile.tasks import abn_lookup, _parse_abn_html_fields
        try:
            legal_name, html = abn_lookup(customer.abn)
            parsed = _parse_abn_html_fields(html or '')
        except Exception:
            logger.exception('Finance ABN lookup unavailable')
            return Response({'detail': 'ABR is unavailable. No verification was recorded.'}, status=503)
        if not (legal_name or parsed.get('entity_name')):
            return Response({'detail': 'No matching ABR entity was returned.'}, status=422)
        allowed = ('entity_name', 'entity_type', 'abn_status', 'abn_gst_registered', 'abn_gst_from', 'abn_gst_to')
        result = json_safe({key: parsed.get(key) for key in allowed})
        result['entity_name'] = result.get('entity_name') or legal_name
        # An in-flight lookup must not verify a subsequently edited ABN.
        changed = Customer.objects.filter(pk=customer.pk, owner=request.user, abn=customer.abn).update(
            abn_result=result, abn_checked_at=timezone.now())
        if not changed:
            raise ValidationError('The ABN changed during lookup. Run the check again.')
        customer.refresh_from_db()
        return Response(self.get_serializer(customer).data)


class ItemViewSet(OwnedViewSet):
    queryset = CatalogueItem.objects.all()
    serializer_class = ItemSerializer

    @action(detail=False, methods=['post'])
    def seed(self, request):
        defaults = [('LABOUR', 'Professional services', 'ProfessionalServices', 'Hours', True),
                    ('TRAVEL', 'Transportation', 'Transportation', 'Kilometres', False),
                    ('STAY', 'Accommodation', 'Accommodation', 'Nights', False),
                    ('SUPER', 'Superannuation contribution', 'Superannuation', 'Lump Sum', False),
                    ('OTHER', 'Other agreed charge', 'Miscellaneous', 'Item', False)]
        with transaction.atomic():
            request.user.__class__.objects.select_for_update().get(pk=request.user.pk)
            for code, name, category, unit, eligible in defaults:
                CatalogueItem.objects.get_or_create(owner=request.user, code=code, defaults={
                    'name': name, 'category': category, 'unit': unit, 'super_eligible': eligible,
                    'unit_price': '0.00', 'tax_code': 'OUT_OF_SCOPE'})
        return Response({'detail': 'Saved starter items. Review prices, GST and super eligibility before use.'})


class PaymentInput(serializers.Serializer):
    request_key = serializers.UUIDField()
    date = serializers.DateField()
    amount = MoneyField(min_value=Decimal('0.01'))
    reference = serializers.CharField(max_length=120, allow_blank=True, default='')
    fund_payment_confirmed = serializers.BooleanField(default=False)


def pdf_response(record, document=None):
    from .documents import render_pdf, render_document_pdf
    serialized = document or serialize_record(record)
    pdf = render_document_pdf(serialized) if document is not None else render_pdf(record)
    response = HttpResponse(pdf, content_type='application/pdf')
    suffix = f'-v{serialized["version"]}' if not serialized.get("is_current", True) else ''
    response['Content-Disposition'] = f'attachment; filename="{serialized["number"]}{suffix}.pdf"'
    response['Cache-Control'] = 'no-store'
    response['X-Content-Type-Options'] = 'nosniff'
    return response


class InvoiceViewSet(PrivateFinanceMixin, viewsets.ViewSet):
    permission_classes = [IsAuthenticated]

    def owned(self, request, pk, lock=False):
        qs = InvoiceRecord.objects.select_related('invoice', 'customer', 'owner').filter(owner=request.user)
        if lock:
            qs = qs.select_for_update(of=('self',))
        return get_object_or_404(qs, pk=pk)

    def list(self, request):
        from rest_framework.pagination import PageNumberPagination
        pager = PageNumberPagination()
        records = (InvoiceRecord.objects.filter(owner=request.user)
                   .select_related('invoice', 'owner', 'customer')
                   .prefetch_related('payments', 'deliveries', 'super_document', 'revisions', 'review_requests__requested_by'))
        page = pager.paginate_queryset(records, request)
        return pager.get_paginated_response([serialize_record(record) for record in page])

    def retrieve(self, request, pk=None):
        return Response(serialize_record(self.owned(request, pk)))

    @action(detail=True, methods=['get'], url_path=r'revisions/(?P<version>\d+)')
    def revision(self, request, pk=None, version=None):
        record = self.owned(request, pk)
        revision = get_object_or_404(record.revisions.all(), version=int(version))
        return Response(serialize_revision(record, revision))

    @action(detail=True, methods=['get'], url_path=r'revisions/(?P<version>\d+)/pdf')
    def revision_pdf(self, request, pk=None, version=None):
        record = self.owned(request, pk)
        revision = get_object_or_404(record.revisions.all(), version=int(version))
        return pdf_response(record, serialize_revision(record, revision))

    @action(detail=False, methods=['get'], url_path='defaults')
    def defaults(self, request):
        return Response(invoice_defaults(request.user))

    @action(detail=False, methods=['get'], url_path='internal-sources')
    def internal_sources(self, request):
        return Response(internal_invoice_sources(request.user))

    @action(detail=False, methods=['post'], url_path='internal-prefill')
    def internal_prefill(self, request):
        assignment_ids = request.data.get('assignment_ids')
        if not isinstance(assignment_ids, list) or not assignment_ids:
            raise ValidationError({'assignment_ids': 'Choose at least one accepted ABN shift assignment.'})
        return Response(internal_invoice_prefill(request.user, assignment_ids))

    def create(self, request):
        schema = InvoiceInput(data=request.data)
        schema.is_valid(raise_exception=True)
        record = save_draft(request.user, schema.validated_data)
        return Response(serialize_record(record), status=status.HTTP_201_CREATED)

    def partial_update(self, request, pk=None):
        # Full draft input intentionally required: partial nested line replacement
        # is ambiguous and risks accidentally retaining old tax or recipient fields.
        schema = InvoiceInput(data=request.data)
        schema.is_valid(raise_exception=True)
        return Response(serialize_record(save_draft(request.user, schema.validated_data, int(pk))))

    @action(detail=False, methods=['post'])
    def preview(self, request):
        schema = InvoiceInput(data=request.data)
        schema.is_valid(raise_exception=True)
        data = schema.validated_data
        get_object_or_404(Customer, pk=data['customer_id'], owner=request.user, active=True)
        return Response(calculate(data, snapshot_lines(request.user, data)))

    @action(detail=True, methods=['post'])
    def duplicate(self, request, pk=None):
        try:
            key = UUID(str(request.data.get('request_key')))
        except (ValueError, TypeError, AttributeError) as exc:
            raise ValidationError('A UUID request_key is required.') from exc
        return Response(serialize_record(duplicate(request.user, pk, key)), status=201)

    @action(detail=True, methods=['post'], url_path='super-document')
    def super_document(self, request, pk=None):
        return Response(serialize_record(make_super_document(request.user, pk, request.data.get('version'))), status=201)

    @action(detail=True, methods=['post'])
    def issue(self, request, pk=None):
        # Backward-compatible review action. Issuing no longer makes an invoice
        # immutable; Save creates the next audited revision instead.
        record = self.owned(request, pk, lock=True)
        check_version(record, request.data.get('version'))
        if request.data.get('confirmed') is not True or record.voided_at:
            raise ValidationError('Confirm the reviewed document.')
        if date.fromisoformat(record.payload['invoice_date']) > timezone.localdate():
            raise ValidationError('A future-dated invoice cannot be issued yet.')
        return Response(serialize_record(record))

    @action(detail=True, methods=['post'], url_path='mark-paid')
    def mark_paid(self, request, pk=None):
        with transaction.atomic():
            record = self.owned(request, pk, lock=True)
            version = request.data.get('version')
            if version is not None:
                check_version(record, version)
            if record.voided_at:
                raise ValidationError('A void invoice cannot be marked paid.')
            record.invoice.status = 'paid'
            record.invoice.save(update_fields=['status'])
            record.invoice.refresh_from_db()
            record_revision_state(record)
        return Response(serialize_record(record))

    @action(detail=True, methods=['post'])
    def payments(self, request, pk=None):
        schema = PaymentInput(data=request.data)
        schema.is_valid(raise_exception=True)
        record = self.owned(request, pk)
        if not date.fromisoformat(record.payload['invoice_date']) <= schema.validated_data['date'] <= timezone.localdate():
            raise ValidationError('Payment date must be between the invoice date and today. Prepayments require review.')
        return Response(serialize_record(record_payment(request.user, pk, schema.validated_data)))

    @action(detail=True, methods=['get'])
    def pdf(self, request, pk=None):
        return pdf_response(self.owned(request, pk))

    @action(detail=True, methods=['post'])
    def send(self, request, pk=None):
        with transaction.atomic():
            record = self.owned(request, pk, lock=True)
            check_version(record, request.data.get('version'))
            if request.data.get('confirmed') is not True or record.voided_at:
                raise ValidationError('Confirm sending this saved invoice.')
            recipient = record.payload['customer']['email']
            serializers.EmailField().run_validation(recipient)
            delivery, created = Delivery.objects.get_or_create(record=record, version=record.version,
                                                               defaults={'recipient': recipient})
            if not created:
                if delivery.status == 'failed':
                    # A preparation failure occurred before any SMTP attempt;
                    # it is safe to try rendering again while holding this lock.
                    delivery.status = 'preparing'
                    delivery.save(update_fields=['status'])
                else:
                    return Response({'detail': 'This send has already been attempted. Check delivery status before retrying.',
                                     'document': serialize_record(record)}, status=200)
        # Persist the attempt before external IO. Never automatically resend after
        # SMTP timeout: acceptance may have occurred even when the response was lost.
        from .documents import render_pdf
        try:
            attachment = render_pdf(record)
        except Exception:
            Delivery.objects.filter(pk=delivery.pk).update(status='failed')
            logger.exception('Finance document rendering failed')
            return Response({'detail': 'PDF preparation failed. No email was attempted.'}, status=503)
        Delivery.objects.filter(pk=delivery.pk).update(status='sending')
        number = serialize_record(record)['number']
        message = EmailMessage(subject=f'{number} from {record.payload["issuer_name"]}',
                               body=f'Please find attached {number}.\nPayment instructions are in the document.',
                               to=[recipient], reply_to=[request.user.email],
                               connection=get_connection(timeout=getattr(settings, 'EMAIL_TIMEOUT', 30) or 30))
        message.attach(f'{number}.pdf', attachment, 'application/pdf')
        try:
            accepted = message.send(fail_silently=False)
            if accepted != 1:
                raise RuntimeError('Mail backend did not confirm acceptance')
        except Exception:
            Delivery.objects.filter(pk=delivery.pk).update(status='uncertain')
            logger.exception('Finance email acceptance is uncertain')
            return Response({'detail': 'Email acceptance is uncertain. Do not resend until checked with your mail provider.'}, status=503)
        with transaction.atomic():
            Delivery.objects.filter(pk=delivery.pk).update(status='sent', sent_at=timezone.now())
            Invoice.objects.filter(pk=record.invoice_id).update(status='sent')
        record.invoice.refresh_from_db()
        record_revision_state(record)
        return Response({'detail': 'Accepted by the email provider; inbox delivery is not guaranteed.',
                         'document': serialize_record(record)})


class ReceivedInvoiceViewSet(PrivateFinanceMixin, viewsets.ViewSet):
    """Owner/admin view of internal invoices sent by workers."""

    permission_classes = [IsAuthenticated]

    def _managed_pharmacies(self, user):
        # Local import avoids a module import cycle while reusing the same
        # pharmacy object-level authorization boundary as roster/shift tools.
        from client_profile.views import BaseShiftViewSet
        return BaseShiftViewSet._managed_pharmacies(user)

    def queryset(self, request):
        managed = self._managed_pharmacies(request.user)
        return (
            InvoiceRecord.objects.filter(source='internal', invoice__pharmacy__in=managed)
            .filter(
                models.Q(deliveries__status__in=['sent', 'legacy_queued'])
                | models.Q(invoice__status__in=['sent', 'paid'])
                | ~models.Q(review_status='NONE')
            )
            .select_related('invoice', 'customer', 'owner')
            .prefetch_related('payments', 'deliveries', 'revisions', 'review_requests__requested_by')
            .distinct()
        )

    def _get(self, request, pk, lock=False):
        allowed = self.queryset(request).filter(pk=pk).values_list('pk', flat=True).first()
        if allowed is None:
            raise Http404
        qs = InvoiceRecord.objects.select_related('invoice', 'customer', 'owner')
        if lock:
            qs = qs.select_for_update(of=('self',))
        return get_object_or_404(qs, pk=allowed)

    @staticmethod
    def _require_current_delivered(record):
        delivered = record.deliveries.filter(
            version=record.version,
            status__in=['sent', 'legacy_queued'],
        ).exists()
        current_visible = (
            delivered
            or record.invoice.status in {'sent', 'paid'}
            or record.review_status != 'NONE'
        )
        if not current_visible:
            raise ValidationError({
                'version': (
                    'The contractor has a newer saved revision that has not been sent yet. '
                    'Review actions remain attached to the last delivered revision until the new version is sent.'
                )
            })

    def list(self, request):
        from rest_framework.pagination import PageNumberPagination
        pager = PageNumberPagination()
        page = pager.paginate_queryset(self.queryset(request), request)
        documents = [owner_visible_document(record) for record in page]
        return pager.get_paginated_response([document for document in documents if document is not None])

    def retrieve(self, request, pk=None):
        record = self._get(request, pk)
        document = owner_visible_document(record)
        if document is None:
            raise Http404
        return Response(document)

    @action(detail=True, methods=['get'])
    def pdf(self, request, pk=None):
        record = self._get(request, pk)
        document = owner_visible_document(record)
        if document is None:
            raise Http404
        return pdf_response(record, document if document.get('version') != record.version else None)

    @action(detail=True, methods=['get'], url_path=r'revisions/(?P<version>\d+)')
    def revision(self, request, pk=None, version=None):
        record = self._get(request, pk)
        revision = get_object_or_404(record.revisions.all(), version=int(version))
        delivered = record.deliveries.filter(
            version=revision.version,
            status__in=['sent', 'legacy_queued'],
        ).exists()
        if not delivered:
            visible = owner_visible_document(record)
            if visible is None or visible.get('version') != revision.version:
                raise Http404
        return Response(serialize_owner_revision(record, revision))

    @action(detail=True, methods=['get'], url_path=r'revisions/(?P<version>\d+)/pdf')
    def revision_pdf(self, request, pk=None, version=None):
        record = self._get(request, pk)
        revision = get_object_or_404(record.revisions.all(), version=int(version))
        delivered = record.deliveries.filter(
            version=revision.version,
            status__in=['sent', 'legacy_queued'],
        ).exists()
        if not delivered:
            raise Http404
        return pdf_response(record, serialize_revision(record, revision))

    @action(detail=True, methods=['post'], url_path='request-revision')
    def request_revision(self, request, pk=None):
        note = str(request.data.get('note') or '').strip()
        if not note:
            raise ValidationError({'note': 'Add a note explaining what needs to be revised.'})
        if len(note) > 3000:
            raise ValidationError({'note': 'Revision notes are limited to 3000 characters.'})
        with transaction.atomic():
            record = self._get(request, pk, lock=True)
            self._require_current_delivered(record)
            check_version(record, request.data.get('version'))
            InvoiceReviewRequest.objects.create(
                record=record,
                requested_by=request.user,
                requested_version=record.version,
                note=note,
            )
            record.review_status = 'REVISION_REQUESTED'
            record.last_review_note = note
            record.last_reviewed_at = timezone.now()
            record.save(update_fields=['review_status', 'last_review_note', 'last_reviewed_at', 'updated_at'])
            record_revision_state(record)
            Notification.objects.create(
                user=record.owner,
                type='alert',
                title=f'Revision requested for INV-{record.invoice_id:06d}',
                body=note,
                action_url='/dashboard/invoices',
                payload={
                    'kind': 'invoice_revision_requested',
                    'finance_invoice_id': record.id,
                    'invoice_id': record.invoice_id,
                    'requested_version': record.version,
                },
            )
        return Response(serialize_record(record))

    @action(detail=True, methods=['post'], url_path='approve-payment')
    def approve_payment(self, request, pk=None):
        note = str(request.data.get('note') or '').strip()
        if len(note) > 3000:
            raise ValidationError({'note': 'Notes are limited to 3000 characters.'})
        with transaction.atomic():
            record = self._get(request, pk, lock=True)
            self._require_current_delivered(record)
            check_version(record, request.data.get('version'))
            record.review_status = 'APPROVED_FOR_PAYMENT'
            record.last_review_note = note
            record.last_reviewed_at = timezone.now()
            record.save(update_fields=['review_status', 'last_review_note', 'last_reviewed_at', 'updated_at'])
            InvoiceReviewRequest.objects.filter(record=record, resolved_at__isnull=True).update(
                resolved_at=timezone.now(),
                resolved_by_version=record.version,
            )
            record_revision_state(record)
            Notification.objects.create(
                user=record.owner,
                type='alert',
                title=f'Invoice INV-{record.invoice_id:06d} approved for payment',
                body=note or 'The pharmacy approved this invoice for payment.',
                action_url='/dashboard/invoices',
                payload={
                    'kind': 'invoice_approved_for_payment',
                    'finance_invoice_id': record.id,
                    'invoice_id': record.invoice_id,
                    'version': record.version,
                },
            )
        return Response(serialize_record(record))

    @action(detail=True, methods=['post'], url_path='mark-paid')
    def mark_paid(self, request, pk=None):
        note = str(request.data.get('note') or '').strip()
        if len(note) > 3000:
            raise ValidationError({'note': 'Notes are limited to 3000 characters.'})
        with transaction.atomic():
            record = self._get(request, pk, lock=True)
            self._require_current_delivered(record)
            check_version(record, request.data.get('version'))
            record.invoice.status = 'paid'
            record.invoice.save(update_fields=['status'])
            record.invoice.refresh_from_db()
            record.review_status = 'APPROVED_FOR_PAYMENT'
            record.last_review_note = note
            record.last_reviewed_at = timezone.now()
            record.save(update_fields=['review_status', 'last_review_note', 'last_reviewed_at', 'updated_at'])
            InvoiceReviewRequest.objects.filter(record=record, resolved_at__isnull=True).update(
                resolved_at=timezone.now(),
                resolved_by_version=record.version,
            )
            record_revision_state(record)
            Notification.objects.create(
                user=record.owner,
                type='alert',
                title=f'Invoice INV-{record.invoice_id:06d} marked paid',
                body=note or 'The pharmacy marked this invoice as paid.',
                action_url='/dashboard/invoices',
                payload={
                    'kind': 'invoice_paid',
                    'finance_invoice_id': record.id,
                    'invoice_id': record.invoice_id,
                    'version': record.version,
                },
            )
        return Response(serialize_record(record))


class ExpenseViewSet(OwnedViewSet):
    queryset = Expense.objects.filter(archived_at__isnull=True)
    serializer_class = ExpenseSerializer

    def create(self, request, *args, **kwargs):
        schema = self.get_serializer(data=request.data)
        schema.is_valid(raise_exception=True)
        with transaction.atomic():
            request.user.__class__.objects.select_for_update().get(pk=request.user.pk)
            previous = Expense.objects.filter(owner=request.user, request_key=schema.validated_data['request_key']).first()
            if previous:
                return Response(self.get_serializer(previous).data)
            expense = schema.save(owner=request.user, version=1)
        return Response(self.get_serializer(expense).data, status=201)

    def partial_update(self, request, *args, **kwargs):
        with transaction.atomic():
            expense = get_object_or_404(Expense.objects.select_for_update(), pk=kwargs['pk'], owner=request.user)
            check_version(expense, request.data.get('version'))
            if str(request.data.get('request_key', expense.request_key)) != str(expense.request_key):
                raise ValidationError('The expense request key cannot change.')
            schema = self.get_serializer(expense, data=request.data, partial=True)
            schema.is_valid(raise_exception=True)
            schema.save(version=expense.version + 1)
        return Response(schema.data)

    @action(detail=True, methods=['post'])
    def receipts(self, request, pk=None):
        expense = self.get_object()
        upload = request.FILES.get('file')
        if not upload or not 0 < upload.size <= 5 * 1024 * 1024:
            raise ValidationError('Choose a PDF, PNG or JPEG receipt of at most 5 MB.')
        content = upload.read(5 * 1024 * 1024 + 1)
        if len(content) > 5 * 1024 * 1024:
            raise ValidationError('Receipt is too large.')
        types = [(b'%PDF-', 'application/pdf', '.pdf'), (b'\x89PNG\r\n\x1a\n', 'image/png', '.png'),
                 (b'\xff\xd8\xff', 'image/jpeg', '.jpg')]
        match = next((entry for entry in types if content.startswith(entry[0])), None)
        if not match:
            raise ValidationError('The file signature is not a supported receipt type.')
        digest = hashlib.sha256(content).hexdigest()
        with transaction.atomic():
            request.user.__class__.objects.select_for_update().get(pk=request.user.pk)
            previous = Receipt.objects.filter(expense__owner=request.user, sha256=digest).first()
            if previous:
                raise ValidationError(f'This receipt is already attached to expense #{previous.expense_id}.')
            total = Receipt.objects.filter(expense__owner=request.user).aggregate(value=Sum('size'))['value'] or 0
            if total + len(content) > 50 * 1024 * 1024:
                raise ValidationError('The 50 MB receipt allowance is full. Contact support for private-storage expansion.')
            filename = Path(upload.name.replace('\\', '/')).stem[:100]
            filename = ''.join(ch for ch in filename if ch.isalnum() or ch in ' -_') or 'receipt'
            Receipt.objects.create(expense=expense, filename=filename + match[2], media_type=match[1],
                                   size=len(content), sha256=digest, content=content)
        return Response(self.get_serializer(expense).data, status=201)


@never_cache
@api_view(['GET'])
@permission_classes([IsAuthenticated])
def receipt_download(request, pk):
    receipt = get_object_or_404(Receipt, pk=pk, expense__owner=request.user)
    response = HttpResponse(bytes(receipt.content), content_type='application/octet-stream')
    response['Content-Disposition'] = content_disposition_header(True, receipt.filename)
    response['Cache-Control'] = 'private, no-store'
    response['X-Content-Type-Options'] = 'nosniff'
    return response


@never_cache
@api_view(['POST'])
@permission_classes([IsAuthenticated])
def calculate_hours(request):
    try:
        start = datetime.fromisoformat(str(request.data.get('start')))
        end = datetime.fromisoformat(str(request.data.get('end')))
        hours = shift_hours(start, end, request.data.get('break_minutes', 0))
    except (ValueError, TypeError, CalculationError) as exc:
        raise ValidationError(str(exc)) from exc
    return Response({'hours': str(hours)})


@never_cache
@api_view(['GET'])
@permission_classes([IsAuthenticated])
def bas_worksheet(request):
    try:
        start, end = (date.fromisoformat(request.query_params[key]) for key in ('start', 'end'))
    except (ValueError, KeyError) as exc:
        raise ValidationError('Supply ISO start and end dates.') from exc
    basis = request.query_params.get('basis', 'cash')
    if end < start or (end - start).days > 366 or basis not in ('cash', 'accrual'):
        raise ValidationError('Choose cash/accrual and a period of at most 366 days.')
    records = InvoiceRecord.objects.filter(
        owner=request.user,
        kind='invoice',
        voided_at__isnull=True,
        invoice__status__in=['sent', 'paid'],
    )
    sales = gst = credit = ZERO
    if basis == 'cash':
        totals = Payment.objects.filter(record__in=records, date__range=(start, end)).aggregate(sales=Sum('sales'), gst=Sum('gst'))
        sales, gst = totals['sales'] or ZERO, totals['gst'] or ZERO
    else:
        for record in records.filter(invoice__invoice_date__range=(start, end)):
            sales += Decimal(record.calculation['sales_gross'])
            gst += Decimal(record.calculation['gst'])
    expenses = Expense.objects.filter(owner=request.user, archived_at__isnull=True)
    expenses = expenses.filter(**{f'{"paid_on" if basis == "cash" else "incurred_on"}__range': (start, end)})
    review = []
    for expense in expenses:
        credit += expense_gst_credit(amount=expense.amount, gst_amount=expense.gst_amount,
                                     business_use_percent=expense.business_use_percent, tax_code=expense.tax_code,
                                     evidence_confirmed=expense.evidence_confirmed, gst_registered=expense.gst_registered)
        if expense.tax_code == 'GST' and expense.amount > Decimal('82.50') and not expense.evidence_confirmed:
            review.append(expense.pk)
    legacy = Invoice.objects.filter(user=request.user, finance_record__isnull=True).count()
    return Response({'start': start, 'end': end, 'basis': basis, 'G1': str(sales), '1A': str(gst), '1B': str(credit),
                     'estimated_gst_net': str(gst - credit), 'expenses_needing_evidence': review,
                     'excluded_legacy_invoice_count': legacy, 'lodgement_ready': False,
                     'warnings': ['GST worksheet only, not a complete BAS or tax advice.',
                                  'Only issued workspace invoices and recorded expenses/payments are included.',
                                  'Legacy invoices, bank feeds, credit notes, prepayments, PAYG, WET, LCT and adjustments are not included.',
                                  'Review GST registration dates, tax coding, evidence and business-use allocation with your adviser.',
                                  'Cash-basis expenses currently require one full-payment date; partial supplier payments need manual review.']})
