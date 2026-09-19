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


def _system_item(owner, category):
    defaults = {
        "ProfessionalServices": ("LABOUR", "Professional services", "Hours", True),
        "Transportation": ("TRAVEL", "Transportation", "Kilometres", False),
        "Accommodation": ("STAY", "Accommodation", "Nights", False),
        "Superannuation": ("SUPER", "Superannuation contribution", "Lump Sum", False),
        "Miscellaneous": ("OTHER", "Other agreed charge", "Item", False),
    }
    code, name, unit, super_eligible = defaults.get(
        category,
        ("OTHER", "Other agreed charge", "Item", False),
    )
    item, _ = CatalogueItem.objects.get_or_create(
        owner=owner,
        code=code,
        defaults={
            "name": name,
            "category": category if category in defaults else "Miscellaneous",
            "unit": unit,
            "super_eligible": super_eligible,
            "unit_price": "0.00",
            "tax_code": "OUT_OF_SCOPE",
        },
    )
    return item


def _customer_for_internal_invoice(owner, invoice):
    abn = "".join(ch for ch in str(invoice.pharmacy_abn_snapshot or "") if ch.isdigit())
    name = invoice.pharmacy_name_snapshot or invoice.custom_bill_to_name or "Pharmacy"
    query = Customer.objects.filter(owner=owner)
    customer = query.filter(abn=abn).first() if abn else query.filter(name=name).first()
    if customer:
        return customer
    return Customer.objects.create(
        owner=owner,
        name=name,
        legal_name=name,
        abn=abn,
        contact_name=(f"{invoice.bill_to_first_name} {invoice.bill_to_last_name}").strip(),
        email=invoice.bill_to_email or "",
        address=invoice.pharmacy_address_snapshot or invoice.custom_bill_to_address or "",
        payment_terms_days=14,
    )


@transaction.atomic
def adopt_internal_invoice(owner, invoice):
    """Expose a canonical accepted-shift invoice in the newer finance workspace.

    The existing client_profile Invoice/InvoiceLineItem rows remain authoritative.
    Locked professional-service rows retain their source_assignment links; this
    wrapper only adds finance workspace metadata, delivery/payment history and UI.
    """
    Invoice.objects.select_for_update().get(pk=invoice.pk)
    existing = InvoiceRecord.objects.filter(invoice=invoice).first()
    if existing:
        return existing

    source_snapshot = invoice.source_snapshot or {}
    if source_snapshot.get("source") != "INTERNAL_ABN_SHIFT_ASSIGNMENTS":
        raise ValidationError("Only accepted-shift internal invoices can be adopted into this internal workspace flow.")

    customer = _customer_for_internal_invoice(owner, invoice)
    request_key = uuid4()
    payload_lines = []
    for line in invoice.line_items.select_related("source_assignment").order_by("id"):
        item = _system_item(owner, line.category_code)
        worked_on = (
            str(line.source_assignment.slot_date)
            if line.source_assignment_id and line.source_assignment
            else None
        )
        payload_lines.append({
            "item_id": item.pk,
            "description": line.description,
            "quantity": str(line.quantity),
            "unit_price": str(line.unit_price),
            "discount": str(line.discount),
            "tax_code": "GST" if invoice.gst_registered and line.gst_applicable else "OUT_OF_SCOPE",
            "super_eligible": bool(line.super_applicable),
            "worked_on": worked_on,
            "category_code": line.category_code,
            "unit": line.unit,
            "locked": bool(line.source_assignment_id and line.category_code == "ProfessionalServices"),
            "source_assignment_id": line.source_assignment_id,
            "shift_id": line.shift_id,
        })

    super_mode = "summary" if invoice.super_amount > 0 else "none"
    payload = {
        "request_key": str(request_key),
        "customer_id": customer.pk,
        "invoice_date": str(invoice.invoice_date),
        "due_date": str(invoice.due_date or invoice.invoice_date),
        "issuer_name": (f"{invoice.issuer_first_name} {invoice.issuer_last_name}").strip() or owner.get_full_name() or owner.email,
        "issuer_entity_type": "sole_trader",
        "issuer_abn": "".join(ch for ch in str(invoice.issuer_abn or "") if ch.isdigit()),
        "issuer_address": "",
        "gst_registered": bool(invoice.gst_registered),
        "price_mode": "exclusive",
        "super_mode": super_mode,
        "super_rate": str(invoice.super_rate_snapshot),
        "super_confirmed": bool(invoice.super_amount > 0),
        "bank_account_name": invoice.bank_account_name,
        "bsb": invoice.bsb,
        "account_number": invoice.account_number,
        "super_fund_name": invoice.super_fund_name,
        "super_usi": invoice.super_usi,
        "super_member_number": invoice.super_member_number,
        "reference": "Accepted ChemistTasker shift",
        "notes": "Created from accepted ChemistTasker ABN shift terms. Locked labour rows preserve the accepted dates, hours and rates.",
        "lines": payload_lines,
        "customer": {
            key: getattr(customer, key)
            for key in ("name", "legal_name", "address", "abn", "email", "contact_name")
        },
        "source_snapshot": source_snapshot,
    }
    calc = calculate_invoice(
        payload_lines,
        gst_registered=payload["gst_registered"],
        price_mode=payload["price_mode"],
        super_mode=payload["super_mode"],
        super_rate=payload["super_rate"],
    )
    if (
        Decimal(calc["payable"]) != invoice.total
        or Decimal(calc["gst"]) != invoice.gst_amount
        or Decimal(calc["super"]) != invoice.super_amount
    ):
        raise ValidationError(
            "The canonical invoice totals do not match the finance workspace calculation. "
            "Resolve the invoice before exposing it in the workspace."
        )

    return InvoiceRecord.objects.create(
        owner=owner,
        invoice=invoice,
        customer=customer,
        kind="invoice",
        source="internal",
        request_key=request_key,
        payload=json_safe(payload),
        calculation=json_safe(calc),
    )


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
    if record.source == "internal":
        protected = {
            line.source_assignment_id: line
            for line in invoice.line_items.filter(
                category_code="ProfessionalServices",
                source_assignment__isnull=False,
            )
        }
        invoice.line_items.filter(source_assignment__isnull=True).delete()
        manual_rows = []
        for line in calc['lines']:
            source_assignment_id = line.get("source_assignment_id")
            if source_assignment_id:
                if source_assignment_id not in protected:
                    raise ValidationError("Internal invoice source assignment no longer matches the canonical invoice.")
                continue
            manual_rows.append(
                InvoiceLineItem(
                    invoice=invoice,
                    description=line['description'],
                    category_code=line['category_code'],
                    unit=line['unit'],
                    quantity=line['quantity'],
                    unit_price=line['unit_price'],
                    discount=line['discount'],
                    total=line['net'],
                    gst_applicable=line['tax_code'] == 'GST',
                    super_applicable=line['super_eligible'],
                    is_manual=True,
                    was_modified=True,
                    shift_id=line.get("shift_id"),
                )
            )
        InvoiceLineItem.objects.bulk_create(manual_rows)
    else:
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
        if (
            record.locked_at
            or record.voided_at
            or record.kind != 'invoice'
            or record.invoice.status != 'draft'
        ):
            raise ValidationError('Only unissued service-invoice drafts can be edited.')
        if str(record.request_key) != str(data['request_key']):
            raise ValidationError('The draft request key cannot change.')
    internal_frozen_lines = None
    internal_manual_lines = None
    if record_id is not None and record.source == "internal":
        frozen = {
            int(line["source_assignment_id"]): line
            for line in record.payload.get("lines", [])
            if line.get("source_assignment_id")
        }
        submitted_manual = []
        for line in data.get("lines", []):
            source_assignment_id = line.get("source_assignment_id")
            if source_assignment_id:
                source_assignment_id = int(source_assignment_id)
                if source_assignment_id not in frozen:
                    raise ValidationError("Internal shift source lines cannot be added or replaced.")
                continue
            submitted_manual.append(line)
        internal_frozen_lines = list(frozen.values())
        internal_manual_lines = submitted_manual
    elif any(line.get("source_assignment_id") or line.get("locked") for line in data.get("lines", [])):
        raise ValidationError("Shift source identities are server-managed and cannot be supplied for an external invoice.")

    if record_id is not None and record.source == "internal" and int(data["customer_id"]) != record.customer_id:
        raise ValidationError("The pharmacy/customer on an accepted-shift invoice is locked to the original engagement.")

    customer = get_object_or_404(Customer, pk=data['customer_id'], owner=owner, active=True)
    if internal_frozen_lines is not None:
        manual_snapshot = (
            snapshot_lines(owner, {"lines": internal_manual_lines})
            if internal_manual_lines
            else []
        )
        lines = [*internal_frozen_lines, *manual_snapshot]
        data = {**data, "lines": lines}
    else:
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
            'source_snapshot': invoice.source_snapshot or {},
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
    data['lines'] = [
        {
            key: value
            for key, value in {**line, 'worked_on': None}.items()
            if key not in {'locked', 'source_assignment_id', 'shift_id'}
        }
        for line in data['lines']
    ]
    data.pop('source_snapshot', None)
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
