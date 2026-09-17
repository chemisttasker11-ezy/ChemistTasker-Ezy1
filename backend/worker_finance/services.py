"""Transactional invoice operations over the existing Invoice/InvoiceLineItem tables."""
import json
from datetime import timedelta
from decimal import Decimal
from uuid import uuid4
from django.core.serializers.json import DjangoJSONEncoder
from django.db import transaction
from django.db.models import Sum
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.exceptions import ValidationError
from django.apps import apps
Invoice = apps.get_model('client_profile', 'Invoice')
InvoiceLineItem = apps.get_model('client_profile', 'InvoiceLineItem')
from .calculations import calculate_invoice, CalculationError, allocate_payment, ZERO
from .models import Customer, CatalogueItem, InvoiceRecord, Payment


def json_safe(value):
    return json.loads(json.dumps(value, cls=DjangoJSONEncoder))


def check_version(record, version):
    if type(version) is not int or version != record.version:
        raise ValidationError({'version': 'This record changed. Reload before saving.'})


def snapshot_lines(owner, data):
    ids = {line['item_id'] for line in data['lines']}
    items = {item.pk: item for item in CatalogueItem.objects.filter(owner=owner, pk__in=ids, active=True)}
    if ids != items.keys():
        raise ValidationError({'lines': 'Every line must use an active item from your own catalogue.'})
    lines = []
    for line in data['lines']:
        item = items[line['item_id']]
        lines.append({**json_safe(line), 'description': line.get('description') or item.name,
                      'category_code': item.category, 'unit': item.unit,
                      'tax_code': line.get('tax_code', item.tax_code),
                      'super_eligible': line.get('super_eligible', item.super_eligible)})
    return lines


def calculate(data, lines):
    try:
        return calculate_invoice(lines, gst_registered=data['gst_registered'],
                                 price_mode=data['price_mode'], super_mode=data['super_mode'],
                                 super_rate=data['super_rate'])
    except CalculationError as exc:
        raise ValidationError({'lines': str(exc)}) from exc


def write_canonical(record):
    """Snapshot amounts once. The new PDF and email use these same amounts."""
    invoice, data, calc = record.invoice, record.payload, record.calculation
    for field in ('invoice_date', 'due_date', 'issuer_abn', 'gst_registered', 'bank_account_name',
                  'bsb', 'account_number', 'super_fund_name', 'super_usi', 'super_member_number'):
        setattr(invoice, field, data.get(field, ''))
    invoice.issuer_first_name = data['issuer_name']
    invoice.issuer_last_name = ''
    invoice.issuer_email = record.owner.email
    invoice.external = record.source == 'external'
    invoice.custom_bill_to_name = data['customer']['name']
    invoice.custom_bill_to_address = data['customer']['address']
    invoice.bill_to_email = data['customer']['email']
    invoice.bill_to_abn = data['customer']['abn']
    invoice.super_rate_snapshot = data['super_rate']
    invoice.subtotal = calc['subtotal']
    invoice.gst_amount = calc['gst']
    invoice.super_amount = calc['super']
    invoice.total = calc['payable']
    invoice.save()
    invoice.line_items.all().delete()
    InvoiceLineItem.objects.bulk_create([
        InvoiceLineItem(invoice=invoice, description=line['description'], category_code=line['category_code'],
                        unit=line['unit'], quantity=line['quantity'], unit_price=line['unit_price'],
                        discount=line['discount'], total=line['net'], gst_applicable=line['tax_code'] == 'GST',
                        super_applicable=line['super_eligible'], is_manual=True, was_modified=True)
        for line in calc['lines']
    ])


@transaction.atomic
def save_draft(owner, data, record_id=None, source='external'):
    # Serialize creates and catalogue seeding for a single issuer. This also makes
    # idempotent retries safe under concurrent requests on PostgreSQL.
    owner.__class__.objects.select_for_update().get(pk=owner.pk)
    existing = InvoiceRecord.objects.filter(owner=owner, request_key=data['request_key']).first()
    if record_id is None and existing:
        return existing
    if record_id is not None:
        record = get_object_or_404(InvoiceRecord.objects.select_for_update(), pk=record_id, owner=owner)
        check_version(record, data.get('version'))
        if record.locked_at or record.voided_at or record.kind != 'invoice':
            raise ValidationError('Only unissued service-invoice drafts can be edited.')
        if str(record.request_key) != str(data['request_key']):
            raise ValidationError('The draft request key cannot change.')
    customer = get_object_or_404(Customer, pk=data['customer_id'], owner=owner, active=True)
    lines = snapshot_lines(owner, data)
    calc = calculate(data, lines)
    if Decimal(calc['payable']) <= 0:
        raise ValidationError('A service invoice needs a positive worker-payable amount.')
    payload = json_safe(data)
    payload['lines'] = lines
    payload['customer'] = {key: getattr(customer, key) for key in ('name', 'legal_name', 'address', 'abn', 'email', 'contact_name')}
    if record_id is None:
        invoice = Invoice.objects.create(user=owner, external=source == 'external')
        record = InvoiceRecord.objects.create(owner=owner, invoice=invoice, customer=customer, source=source,
                                              request_key=data['request_key'], payload=payload, calculation=calc)
    else:
        record.customer, record.payload, record.calculation = customer, payload, calc
        record.version += 1
        record.save()
    write_canonical(record)
    return record


def serialize_record(record):
    payments = list(record.payments.all())
    paid = sum((payment.amount for payment in payments), ZERO)
    invoice = record.invoice
    delivery = next(iter(record.deliveries.all()), None)
    companion = getattr(record, 'super_document', None)
    return {'id': record.pk, 'invoice_id': invoice.pk, 'number': f"{'SUP' if record.kind == 'super_request' else 'INV'}-{invoice.pk:06d}",
            'version': record.version, 'request_key': str(record.request_key), 'kind': record.kind,
            'source': record.source, 'payload': record.payload, 'calculation': record.calculation,
            'locked': bool(record.locked_at), 'voided': bool(record.voided_at),
            'status': 'void' if record.voided_at else invoice.status,
            'delivery_status': delivery.status if delivery else None,
            'paid': str(paid), 'balance': str(Decimal(record.calculation['payable']) - paid),
            'super_document_id': companion.pk if companion else None,
            'payments': json_safe([{key: getattr(payment, key) for key in ('id', 'date', 'amount', 'reference')} for payment in payments])}


@transaction.atomic
def duplicate(owner, record_id, request_key):
    source = get_object_or_404(InvoiceRecord, pk=record_id, owner=owner, kind='invoice')
    data = dict(source.payload)
    data['request_key'] = request_key
    data.pop('version', None)
    today = timezone.localdate()
    data['invoice_date'] = today
    data['due_date'] = today + timedelta(days=source.customer.payment_terms_days)
    # Duplicate is always a new, editable external draft. Never copy shift links,
    # delivery/payment history or a claim that new work was already performed.
    data['lines'] = [{**line, 'worked_on': None} for line in data['lines']]
    return save_draft(owner, data)


@transaction.atomic
def make_super_document(owner, record_id, version):
    record = get_object_or_404(InvoiceRecord.objects.select_for_update(), pk=record_id, owner=owner, kind='invoice')
    check_version(record, version)
    if not record.locked_at:
        raise ValidationError('Issue the service invoice before creating its separate super request.')
    existing = InvoiceRecord.objects.filter(parent=record).first()
    if existing:
        return existing
    if record.voided_at or Decimal(record.calculation['super']) <= 0 or record.payload['super_mode'] != 'separate':
        raise ValidationError('Select separate super on a non-void service invoice with a positive contribution.')
    if not all(record.payload.get(key) for key in ('super_fund_name', 'super_usi', 'super_member_number')):
        raise ValidationError('Enter the fund, USI and member number before creating the super request.')
    item = CatalogueItem.objects.filter(owner=owner, category='Superannuation', active=True).first()
    if not item:
        raise ValidationError('Save a Superannuation item in your catalogue first.')
    amount = record.calculation['super']
    line = {'item_id': item.pk, 'description': f'Super contribution for INV-{record.invoice_id:06d}',
            'category_code': 'Superannuation', 'unit': 'Lump Sum', 'quantity': '1.00',
            'unit_price': amount, 'discount': '0.00', 'tax_code': 'OUT_OF_SCOPE',
            'super_eligible': False, 'net': amount, 'gst': '0.00', 'gross': amount}
    calc = {'lines': [line], 'subtotal': '0.00', 'gst': '0.00', 'payable': amount,
            'sales_gross': '0.00', 'super': amount, 'automatic_super': '0.00'}
    request_key = uuid4()
    payload = {**record.payload, 'lines': [line], 'request_key': str(request_key),
               'notes': f'Separate contribution request linked to INV-{record.invoice_id:06d}. Pay the fund, not the worker. This is not a tax invoice.'}
    invoice = Invoice.objects.create(user=owner, external=record.invoice.external)
    companion = InvoiceRecord.objects.create(owner=owner, invoice=invoice, customer=record.customer,
                                             parent=record, kind='super_request', source=record.source, request_key=request_key,
                                             payload=payload, calculation=calc)
    write_canonical(companion)
    # Freeze the parent to prevent its contribution changing after a linked request.
    record.locked_at = timezone.now()
    record.save(update_fields=['locked_at', 'updated_at'])
    return companion


@transaction.atomic
def record_payment(owner, record_id, data):
    record = get_object_or_404(InvoiceRecord.objects.select_for_update(), pk=record_id, owner=owner)
    if not record.locked_at or record.voided_at:
        raise ValidationError('Payments require an issued, non-void document.')
    if record.kind == 'super_request' and not data.get('fund_payment_confirmed'):
        raise ValidationError('Confirm the payment went to the super fund, not to the worker.')
    existing = record.payments.filter(request_key=data['request_key']).first()
    if existing:
        if (existing.amount != data['amount'] or existing.date != data['date']
                or existing.reference != data.get('reference', '')):
            raise ValidationError('This payment request key was already used for different payment details.')
        return record
    paid = record.payments.aggregate(value=Sum('amount'))['value'] or ZERO
    amount = Decimal(data['amount'])
    try:
        gst = allocate_payment(amount=amount, previously_paid=paid, total=record.calculation['payable'], component=record.calculation['gst'])
        sales = allocate_payment(amount=amount, previously_paid=paid, total=record.calculation['payable'], component=record.calculation['sales_gross'])
    except CalculationError as exc:
        raise ValidationError(str(exc)) from exc
    Payment.objects.create(record=record, request_key=data['request_key'], date=data['date'], amount=amount,
                           gst=gst, sales=sales, reference=data.get('reference', ''))
    if paid + amount == Decimal(record.calculation['payable']):
        record.invoice.status = 'paid'
        record.invoice.save(update_fields=['status'])
    return record
