"""Transactional worker invoice operations over the canonical Invoice tables."""
import json
from datetime import datetime, time, timedelta
from decimal import Decimal
from uuid import uuid4

from django.apps import apps
from django.core.serializers.json import DjangoJSONEncoder
from django.db import transaction
from django.db.models import Sum
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from .calculations import calculate_invoice, CalculationError, allocate_payment, ZERO
from .models import (
    Customer,
    CatalogueItem,
    InvoiceRecord,
    InvoiceRevision,
    InvoiceReviewRequest,
    Payment,
)

Invoice = apps.get_model("client_profile", "Invoice")
InvoiceLineItem = apps.get_model("client_profile", "InvoiceLineItem")
ShiftSlotAssignment = apps.get_model("client_profile", "ShiftSlotAssignment")
PharmacistOnboarding = apps.get_model("client_profile", "PharmacistOnboarding")
OtherStaffOnboarding = apps.get_model("client_profile", "OtherStaffOnboarding")


def json_safe(value):
    return json.loads(json.dumps(value, cls=DjangoJSONEncoder))


def check_version(record, version):
    if type(version) is not int or version != record.version:
        raise ValidationError({"version": "This record changed. Reload before saving."})


def snapshot_lines(owner, data):
    """Snapshot invoice lines while allowing saved-item or free-entry rows."""
    raw_lines = list(data.get("lines") or [])
    ids = {line.get("item_id") for line in raw_lines if line.get("item_id")}
    items = {
        item.pk: item
        for item in CatalogueItem.objects.filter(owner=owner, pk__in=ids, active=True)
    }
    if ids != set(items):
        raise ValidationError({"lines": "A selected saved item is no longer available in your catalogue."})

    lines = []
    for raw in raw_lines:
        line = json_safe(raw)
        item = items.get(line.get("item_id"))
        description = str(line.get("description") or (item.name if item else "")).strip()
        if not description:
            raise ValidationError({"lines": "Every invoice row needs a description."})
        line["description"] = description
        line["category_code"] = line.get("category_code") or (item.category if item else "ProfessionalServices")
        line["unit"] = str(line.get("unit") or (item.unit if item else "Item")).strip() or "Item"
        line["tax_code"] = line.get("tax_code") or (item.tax_code if item else "OUT_OF_SCOPE")
        if "super_eligible" not in line:
            line["super_eligible"] = bool(item.super_eligible) if item else False
        lines.append(line)
    return lines


def calculate(data, lines):
    try:
        return calculate_invoice(
            lines,
            gst_registered=data["gst_registered"],
            price_mode=data["price_mode"],
            super_mode=data["super_mode"],
            super_rate=data["super_rate"],
        )
    except CalculationError as exc:
        raise ValidationError({"lines": str(exc)}) from exc


def _system_item(owner, category):
    defaults = {
        "ProfessionalServices": ("LABOUR", "Professional services", "Hours", True),
        "Transportation": ("TRAVEL", "Transportation", "Kilometres", False),
        "Accommodation": ("STAY", "Accommodation", "Nights", False),
        "Superannuation": ("SUPER", "Superannuation contribution", "Lump Sum", False),
        "Miscellaneous": ("OTHER", "Other agreed charge", "Item", False),
    }
    code, name, unit, super_eligible = defaults.get(
        category, ("OTHER", "Other agreed charge", "Item", False)
    )
    item = CatalogueItem.objects.filter(owner=owner, code=code, active=True).first()
    if item:
        return item
    return CatalogueItem.objects.create(
        owner=owner,
        code=code,
        name=name,
        category=category if category in defaults else "Miscellaneous",
        unit=unit,
        super_eligible=super_eligible,
        unit_price="0.00",
        tax_code="OUT_OF_SCOPE",
    )


def _worker_onboarding(owner):
    if str(getattr(owner, "role", "") or "").upper() == "PHARMACIST":
        return PharmacistOnboarding.objects.filter(user=owner).first()
    return OtherStaffOnboarding.objects.filter(user=owner).first()


def invoice_defaults(owner):
    onboarding = _worker_onboarding(owner)
    return {
        "issuer_name": (
            owner.get_full_name()
            or getattr(onboarding, "full_name", "")
            or owner.email
        ),
        "issuer_abn": str(getattr(onboarding, "abn", "") or ""),
        "issuer_address": str(getattr(onboarding, "address", "") or ""),
        "gst_registered": bool(
            getattr(onboarding, "gst_registered", False)
            or getattr(onboarding, "abn_gst_registered", False)
        ),
        "bank_account_name": str(getattr(onboarding, "bank_account_name", "") or ""),
        "bsb": str(getattr(onboarding, "bsb", "") or ""),
        "account_number": str(getattr(onboarding, "account_number", "") or ""),
        "super_fund_name": str(getattr(onboarding, "super_fund_name", "") or ""),
        "super_usi": str(getattr(onboarding, "super_usi", "") or ""),
        "super_member_number": str(getattr(onboarding, "super_member_number", "") or ""),
        "super_rate": "12.00",
    }


def _pharmacy_address(pharmacy):
    return ", ".join(
        str(value).strip()
        for value in (
            getattr(pharmacy, "street_address", None),
            getattr(pharmacy, "suburb", None),
            getattr(pharmacy, "state", None),
            getattr(pharmacy, "postcode", None),
        )
        if value
    )


def _customer_for_pharmacy(owner, pharmacy):
    abn = "".join(ch for ch in str(getattr(pharmacy, "abn", "") or "") if ch.isdigit())
    name = pharmacy.name
    query = Customer.objects.filter(owner=owner)
    customer = query.filter(abn=abn).first() if abn else query.filter(name=name).first()
    contact = getattr(getattr(pharmacy, "owner", None), "user", None)
    email = getattr(pharmacy, "email", None) or getattr(contact, "email", "") or ""
    defaults = {
        "name": name,
        "legal_name": getattr(pharmacy, "abn_entity_name", "") or name,
        "abn": abn,
        "contact_name": contact.get_full_name() if contact else "",
        "email": email,
        "address": _pharmacy_address(pharmacy),
        "payment_terms_days": 14,
    }
    if customer:
        changed = []
        for field, value in defaults.items():
            if value and not getattr(customer, field, None):
                setattr(customer, field, value)
                changed.append(field)
        if changed:
            customer.save(update_fields=changed + ["updated_at"])
        return customer
    return Customer.objects.create(owner=owner, **defaults)


def _customer_for_internal_invoice(owner, invoice):
    if invoice.pharmacy_id:
        return _customer_for_pharmacy(owner, invoice.pharmacy)
    abn = "".join(ch for ch in str(invoice.pharmacy_abn_snapshot or "") if ch.isdigit())
    name = invoice.pharmacy_name_snapshot or invoice.custom_bill_to_name or "Pharmacy"
    customer = (
        Customer.objects.filter(owner=owner, abn=abn).first()
        if abn
        else Customer.objects.filter(owner=owner, name=name).first()
    )
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


def _assignment_queryset(owner, assignment_ids=None, lock=False):
    qs = (
        ShiftSlotAssignment.objects.filter(
            user=owner,
            settlement_channel="INVOICE",
            engagement_kind="INDEPENDENT_CONTRACTOR",
            engagement_terms_accepted_at__isnull=False,
        )
        .select_related("shift__pharmacy", "shift__pharmacy__owner__user", "slot", "source_offer")
        .order_by("slot_date", "slot_id", "id")
    )
    if assignment_ids is not None:
        qs = qs.filter(id__in=assignment_ids)
    if lock:
        # Clear the eager joins before locking. ``source_offer`` is optional,
        # and PostgreSQL rejects FOR UPDATE when a nullable outer join is in
        # the lock query. The related rows are fetched lazily after the
        # assignment row is locked.
        qs = qs.select_related(None).select_for_update()
    return qs


def _hours_for_assignment(assignment):
    start = assignment.slot.start_time
    end = assignment.slot.end_time
    start_dt = datetime.combine(assignment.slot_date, start)
    end_dt = datetime.combine(assignment.slot_date, end)
    if end_dt <= start_dt:
        end_dt += timedelta(days=1)
    return (Decimal(str((end_dt - start_dt).total_seconds())) / Decimal("3600")).quantize(Decimal("0.01"))


def _accepted_rate(assignment):
    snapshot = assignment.engagement_terms_snapshot or {}
    for occurrence in snapshot.get("occurrences") or []:
        if str(occurrence.get("slot_id") or "") != str(assignment.slot_id):
            continue
        if str(occurrence.get("date") or "") != str(assignment.slot_date):
            continue
        if occurrence.get("agreed_rate") not in (None, ""):
            return Decimal(str(occurrence["agreed_rate"]))
    if assignment.unit_rate is not None:
        return Decimal(str(assignment.unit_rate))
    raise ValidationError({"rate": f"Assignment {assignment.pk} is missing an agreed invoice rate."})


def internal_invoice_sources(owner):
    billed = set(
        InvoiceLineItem.objects.filter(source_assignment__isnull=False)
        .values_list("source_assignment_id", flat=True)
    )
    result = []
    for assignment in _assignment_queryset(owner):
        if assignment.id in billed:
            continue
        pharmacy = assignment.shift.pharmacy
        result.append(
            {
                "assignment_id": assignment.id,
                "shift_id": assignment.shift_id,
                "slot_id": assignment.slot_id,
                "date": str(assignment.slot_date),
                "start_time": assignment.slot.start_time.strftime("%H:%M"),
                "end_time": assignment.slot.end_time.strftime("%H:%M"),
                "hours": str(_hours_for_assignment(assignment)),
                "rate": str(_accepted_rate(assignment).quantize(Decimal("0.01"))),
                "pharmacy": {
                    "id": pharmacy.id,
                    "name": pharmacy.name,
                    "abn": getattr(pharmacy, "abn", "") or "",
                    "legal_name": getattr(pharmacy, "abn_entity_name", "") or pharmacy.name,
                    "email": getattr(pharmacy, "email", "") or getattr(getattr(pharmacy.owner, "user", None), "email", "") or "",
                    "address": _pharmacy_address(pharmacy),
                },
            }
        )
    return result


def _source_snapshot(assignments):
    pharmacy = assignments[0].shift.pharmacy if assignments else None
    owner_user = getattr(getattr(pharmacy, "owner", None), "user", None) if pharmacy else None
    return {
        "version": 3,
        "source": "INTERNAL_ABN_SHIFT_ASSIGNMENTS",
        "assignment_ids": [a.id for a in assignments],
        "shift_ids": sorted({a.shift_id for a in assignments}),
        "pharmacy": {
            "id": pharmacy.id,
            "name": pharmacy.name,
            "legal_name": getattr(pharmacy, "abn_entity_name", "") or pharmacy.name,
            "abn": getattr(pharmacy, "abn", "") or "",
            "email": getattr(pharmacy, "email", "") or getattr(owner_user, "email", "") or "",
            "address": _pharmacy_address(pharmacy),
        } if pharmacy else {},
        "accepted_terms": [
            {
                "assignment_id": a.id,
                "source_offer_id": a.source_offer_id,
                "settlement_channel": a.settlement_channel,
                "engagement_kind": a.engagement_kind,
                "accepted_at": a.engagement_terms_accepted_at.isoformat() if a.engagement_terms_accepted_at else None,
                "terms": a.engagement_terms_snapshot or {},
                "original_hours": str(_hours_for_assignment(a)),
                "original_rate": str(_accepted_rate(a).quantize(Decimal("0.01"))),
            }
            for a in assignments
        ],
    }


def internal_invoice_prefill(owner, assignment_ids):
    ids = [int(value) for value in assignment_ids]
    assignments = list(_assignment_queryset(owner, ids))
    if len(assignments) != len(set(ids)):
        raise ValidationError({"assignment_ids": "One or more selected shifts are not available for ABN invoicing."})
    if InvoiceLineItem.objects.filter(source_assignment_id__in=ids).exists():
        raise ValidationError({"assignment_ids": "One or more selected shift assignments have already been invoiced."})
    pharmacy_ids = {a.shift.pharmacy_id for a in assignments}
    if len(pharmacy_ids) != 1:
        raise ValidationError({"assignment_ids": "One invoice can only contain shifts for the same pharmacy."})

    pharmacy = assignments[0].shift.pharmacy
    owner_user = getattr(getattr(pharmacy, "owner", None), "user", None)
    customer_snapshot = {
        "name": pharmacy.name,
        "legal_name": getattr(pharmacy, "abn_entity_name", "") or pharmacy.name,
        "abn": getattr(pharmacy, "abn", "") or "",
        "contact_name": owner_user.get_full_name() if owner_user else "",
        "email": getattr(pharmacy, "email", "") or getattr(owner_user, "email", "") or "",
        "address": _pharmacy_address(pharmacy),
    }
    defaults = invoice_defaults(owner)
    today = timezone.localdate()
    onboarding = _worker_onboarding(owner)
    gst_registered = bool(defaults["gst_registered"])
    lines = []
    for assignment in assignments:
        lines.append(
            {
                "item_id": None,
                "description": (
                    f"{assignment.shift.get_role_needed_display() if hasattr(assignment.shift, 'get_role_needed_display') else assignment.shift.role_needed} "
                    f"services — {assignment.slot_date} "
                    f"{assignment.slot.start_time.strftime('%H:%M')}-{assignment.slot.end_time.strftime('%H:%M')}"
                ),
                "category_code": "ProfessionalServices",
                "unit": "Hours",
                "quantity": str(_hours_for_assignment(assignment)),
                "unit_price": str(_accepted_rate(assignment).quantize(Decimal("0.01"))),
                "discount": "0.00",
                "tax_code": "GST" if gst_registered else "OUT_OF_SCOPE",
                "super_eligible": bool((assignment.engagement_terms_snapshot or {}).get("super_payable_confirmed", False)),
                "worked_on": str(assignment.slot_date),
                "source_assignment_id": assignment.id,
                "shift_id": assignment.shift_id,
            }
        )
    draft = {
        "request_key": str(uuid4()),
        "customer_id": 0,
        "source_assignment_ids": ids,
        "invoice_date": str(today),
        "due_date": str(today + timedelta(days=14)),
        "issuer_name": defaults["issuer_name"],
        "issuer_entity_type": "sole_trader",
        "issuer_abn": defaults["issuer_abn"],
        "issuer_address": defaults["issuer_address"],
        "gst_registered": gst_registered,
        "price_mode": "exclusive",
        "super_mode": "none",
        "super_rate": defaults["super_rate"],
        "super_confirmed": False,
        "bank_account_name": defaults["bank_account_name"],
        "bsb": defaults["bsb"],
        "account_number": defaults["account_number"],
        "super_fund_name": defaults["super_fund_name"],
        "super_usi": defaults["super_usi"],
        "super_member_number": defaults["super_member_number"],
        "reference": f"ChemistTasker shift {assignments[0].shift_id}",
        "notes": "",
        "lines": lines,
        "customer": customer_snapshot,
    }
    return json_safe(draft)


def _record_revision(record):
    InvoiceRevision.objects.update_or_create(
        record=record,
        version=record.version,
        defaults={
            "payload": json_safe(record.payload),
            "calculation": json_safe(record.calculation),
            "invoice_status": record.invoice.status,
            "review_status": record.review_status,
            "source_snapshot": json_safe(record.invoice.source_snapshot or {}),
        },
    )


def record_revision_state(record):
    _record_revision(record)


def write_canonical(record):
    """Write the current editable invoice while preserving source identity."""
    invoice, data, calc = record.invoice, record.payload, record.calculation
    for field in (
        "invoice_date", "due_date", "issuer_abn", "gst_registered", "bank_account_name",
        "bsb", "account_number", "super_fund_name", "super_usi", "super_member_number",
    ):
        setattr(invoice, field, data.get(field, ""))
    invoice.issuer_first_name = data["issuer_name"]
    invoice.issuer_last_name = ""
    invoice.issuer_email = record.owner.email
    invoice.external = record.source == "external"
    invoice.custom_bill_to_name = data["customer"]["name"]
    invoice.custom_bill_to_address = data["customer"]["address"]
    invoice.bill_to_email = data["customer"]["email"]
    invoice.bill_to_abn = data["customer"]["abn"]
    if record.source == "internal" and record.customer_id:
        invoice.pharmacy_name_snapshot = data["customer"]["name"]
        invoice.pharmacy_address_snapshot = data["customer"]["address"]
        invoice.pharmacy_abn_snapshot = data["customer"]["abn"]
    invoice.super_rate_snapshot = data["super_rate"]
    invoice.subtotal = calc["subtotal"]
    invoice.gst_amount = calc["gst"]
    invoice.super_amount = calc["super"]
    invoice.total = calc["payable"]
    invoice.save()

    if record.source == "internal":
        existing = {
            line.source_assignment_id: line
            for line in invoice.line_items.filter(source_assignment__isnull=False)
        }
        manual_ids = list(invoice.line_items.filter(source_assignment__isnull=True).values_list("id", flat=True))
        if manual_ids:
            InvoiceLineItem.objects.filter(id__in=manual_ids).delete()
        manual_rows = []
        seen_sources = set()
        for line in calc["lines"]:
            source_assignment_id = line.get("source_assignment_id")
            values = {
                "description": line["description"],
                "category_code": line["category_code"],
                "unit": line["unit"],
                "quantity": line["quantity"],
                "unit_price": line["unit_price"],
                "discount": line["discount"],
                "total": line["net"],
                "gst_applicable": line["tax_code"] == "GST",
                "super_applicable": line["super_eligible"],
                "is_manual": not bool(source_assignment_id),
                "was_modified": True,
                "shift_id": line.get("shift_id"),
            }
            if source_assignment_id:
                seen_sources.add(int(source_assignment_id))
                row = existing.get(int(source_assignment_id))
                if not row:
                    row = InvoiceLineItem(invoice=invoice, source_assignment_id=source_assignment_id)
                for field, value in values.items():
                    setattr(row, field, value)
                row.save()
            else:
                manual_rows.append(InvoiceLineItem(invoice=invoice, **values))
        required_sources = set((invoice.source_snapshot or {}).get("assignment_ids") or [])
        if seen_sources != required_sources:
            raise ValidationError(
                "Internal invoice shift rows cannot be removed. Adjust the date, hours, rate, description or tax treatment instead."
            )
        InvoiceLineItem.objects.bulk_create(manual_rows)
    else:
        invoice.line_items.all().delete()
        InvoiceLineItem.objects.bulk_create(
            [
                InvoiceLineItem(
                    invoice=invoice,
                    description=line["description"],
                    category_code=line["category_code"],
                    unit=line["unit"],
                    quantity=line["quantity"],
                    unit_price=line["unit_price"],
                    discount=line["discount"],
                    total=line["net"],
                    gst_applicable=line["tax_code"] == "GST",
                    super_applicable=line["super_eligible"],
                    is_manual=True,
                    was_modified=True,
                )
                for line in calc["lines"]
            ]
        )


@transaction.atomic
def adopt_internal_invoice(owner, invoice):
    owner.__class__.objects.select_for_update().get(pk=owner.pk)
    # The pharmacy link is nullable for external invoices. Keep the lock query
    # on the invoice row so PostgreSQL does not reject a nullable outer join.
    invoice = Invoice.objects.select_related(None).select_for_update().get(pk=invoice.pk)
    existing = InvoiceRecord.objects.filter(invoice=invoice).first()
    if existing:
        return existing
    source_snapshot = invoice.source_snapshot or {}
    if source_snapshot.get("source") != "INTERNAL_ABN_SHIFT_ASSIGNMENTS":
        raise ValidationError("Only accepted-shift internal invoices can be adopted into this workspace.")
    customer = _customer_for_internal_invoice(owner, invoice)
    payload_lines = []
    for line in invoice.line_items.select_related("source_assignment").order_by("id"):
        payload_lines.append(
            {
                "item_id": None,
                "description": line.description,
                "quantity": str(line.quantity),
                "unit_price": str(line.unit_price),
                "discount": str(line.discount),
                "tax_code": "GST" if invoice.gst_registered and line.gst_applicable else "OUT_OF_SCOPE",
                "super_eligible": bool(line.super_applicable),
                "worked_on": str(line.source_assignment.slot_date) if line.source_assignment_id else None,
                "category_code": line.category_code,
                "unit": line.unit,
                "source_assignment_id": line.source_assignment_id,
                "shift_id": line.shift_id,
            }
        )
    payload = {
        "request_key": str(uuid4()),
        "customer_id": customer.pk,
        "source_assignment_ids": source_snapshot.get("assignment_ids") or [],
        "invoice_date": str(invoice.invoice_date),
        "due_date": str(invoice.due_date or invoice.invoice_date),
        "issuer_name": (f"{invoice.issuer_first_name} {invoice.issuer_last_name}").strip() or owner.get_full_name() or owner.email,
        "issuer_entity_type": "sole_trader",
        "issuer_abn": "".join(ch for ch in str(invoice.issuer_abn or "") if ch.isdigit()),
        "issuer_address": "",
        "gst_registered": bool(invoice.gst_registered),
        "price_mode": "exclusive",
        "super_mode": "summary" if invoice.super_amount > 0 else "none",
        "super_rate": str(invoice.super_rate_snapshot),
        "super_confirmed": bool(invoice.super_amount > 0),
        "bank_account_name": invoice.bank_account_name,
        "bsb": invoice.bsb,
        "account_number": invoice.account_number,
        "super_fund_name": invoice.super_fund_name,
        "super_usi": invoice.super_usi,
        "super_member_number": invoice.super_member_number,
        "reference": "Accepted ChemistTasker shift",
        "notes": "",
        "lines": payload_lines,
        "customer": {
            key: getattr(customer, key)
            for key in ("name", "legal_name", "address", "abn", "email", "contact_name")
        },
    }
    calc = calculate_invoice(
        payload_lines,
        gst_registered=payload["gst_registered"],
        price_mode=payload["price_mode"],
        super_mode=payload["super_mode"],
        super_rate=payload["super_rate"],
    )
    record = InvoiceRecord.objects.create(
        owner=owner,
        invoice=invoice,
        customer=customer,
        kind="invoice",
        source="internal",
        request_key=payload["request_key"],
        payload=json_safe(payload),
        calculation=json_safe(calc),
    )
    _record_revision(record)
    return record


@transaction.atomic
def save_draft(owner, data, record_id=None, source="external"):
    """Save a new invoice or the next editable revision.

    Before Save there is no InvoiceRecord. Once saved, every later Save creates a
    new immutable InvoiceRevision, even when the live invoice had been sent/paid.
    """
    owner.__class__.objects.select_for_update().get(pk=owner.pk)
    data = dict(data)
    submitted_customer = json_safe(data.pop("customer", {}) or {})
    source_assignment_ids = [int(v) for v in data.pop("source_assignment_ids", [])]
    existing = InvoiceRecord.objects.filter(owner=owner, request_key=data["request_key"]).first()
    if record_id is None and existing:
        return existing

    assignments = []
    source_snapshot = {}
    if record_id is not None:
        record = get_object_or_404(
            InvoiceRecord.objects.select_for_update().select_related("invoice", "customer"),
            pk=record_id,
            owner=owner,
        )
        check_version(record, data.get("version"))
        # Capture the outgoing live state before creating the next revision.
        _record_revision(record)
        if record.voided_at or record.kind != "invoice":
            raise ValidationError("Only active service invoices can be edited.")
        if str(record.request_key) != str(data["request_key"]):
            raise ValidationError("The invoice request key cannot change.")
        source = record.source
        if source == "internal":
            required_ids = [int(v) for v in (record.invoice.source_snapshot or {}).get("assignment_ids", [])]
            submitted_ids = [int(line.get("source_assignment_id")) for line in data.get("lines", []) if line.get("source_assignment_id")]
            if set(submitted_ids) != set(required_ids) or len(submitted_ids) != len(required_ids):
                raise ValidationError(
                    "Internal shift rows cannot be removed or replaced. Their values can be corrected and saved as a new revision."
                )
            if int(data["customer_id"]) != record.customer_id:
                raise ValidationError("The pharmacy/customer is fixed by the internal shift engagement.")
        elif any(line.get("source_assignment_id") for line in data.get("lines", [])):
            raise ValidationError("Shift source identities are server-managed.")
    elif source_assignment_ids:
        assignments = list(_assignment_queryset(owner, source_assignment_ids, lock=True))
        if len(assignments) != len(set(source_assignment_ids)):
            raise ValidationError({"source_assignment_ids": "One or more assignments are not available for ABN invoicing."})
        if InvoiceLineItem.objects.filter(source_assignment_id__in=source_assignment_ids).exists():
            raise ValidationError({"source_assignment_ids": "One or more selected assignments have already been invoiced."})
        pharmacy_ids = {a.shift.pharmacy_id for a in assignments}
        if len(pharmacy_ids) != 1:
            raise ValidationError({"source_assignment_ids": "One invoice can only contain assignments for one pharmacy."})
        customer = _customer_for_pharmacy(owner, assignments[0].shift.pharmacy)
        if int(data.get("customer_id") or 0) not in {0, customer.id}:
            raise ValidationError({"customer_id": "The internal invoice customer must be the pharmacy from the selected shifts."})
        data["customer_id"] = customer.id
        submitted_ids = [int(line.get("source_assignment_id")) for line in data.get("lines", []) if line.get("source_assignment_id")]
        if set(submitted_ids) != set(source_assignment_ids) or len(submitted_ids) != len(source_assignment_ids):
            raise ValidationError({"lines": "Keep one editable source row for every selected shift assignment."})
        source = "internal"
        source_snapshot = _source_snapshot(assignments)
    elif any(line.get("source_assignment_id") for line in data.get("lines", [])):
        raise ValidationError("Shift source identities are server-managed.")

    customer = get_object_or_404(Customer, pk=data["customer_id"], owner=owner, active=True)
    lines = snapshot_lines(owner, data)
    calc = calculate(data, lines)
    if Decimal(calc["payable"]) <= 0:
        raise ValidationError("An invoice needs a positive worker-payable amount.")
    payload = json_safe(data)
    if source == "internal":
        payload["source_assignment_ids"] = (
            source_assignment_ids
            if source_assignment_ids
            else list((record.invoice.source_snapshot or {}).get("assignment_ids") or [])
        )
    payload["lines"] = lines
    customer_snapshot = {
        key: getattr(customer, key)
        for key in ("name", "legal_name", "address", "abn", "email", "contact_name")
    }
    for key in customer_snapshot:
        if key in submitted_customer:
            customer_snapshot[key] = submitted_customer[key]
    if not str(customer_snapshot.get("name") or "").strip():
        customer_snapshot["name"] = customer.name
    payload["customer"] = customer_snapshot

    if record_id is None:
        invoice = Invoice.objects.create(
            user=owner,
            external=source == "external",
            pharmacy=assignments[0].shift.pharmacy if assignments else None,
            source_snapshot=source_snapshot,
        )
        if assignments:
            pharmacy = assignments[0].shift.pharmacy
            invoice.pharmacy_name_snapshot = pharmacy.name
            invoice.pharmacy_address_snapshot = _pharmacy_address(pharmacy)
            invoice.pharmacy_abn_snapshot = getattr(pharmacy, "abn", "") or ""
            invoice.save(update_fields=[
                "pharmacy_name_snapshot",
                "pharmacy_address_snapshot",
                "pharmacy_abn_snapshot",
            ])
        record = InvoiceRecord.objects.create(
            owner=owner,
            invoice=invoice,
            customer=customer,
            source=source,
            request_key=data["request_key"],
            payload=payload,
            calculation=calc,
        )
    else:
        record.customer = customer
        record.payload = payload
        record.calculation = calc
        record.version += 1
        record.review_status = "NONE"
        record.last_review_note = ""
        record.last_reviewed_at = None
        record.locked_at = None
        record.save(update_fields=[
            "customer", "payload", "calculation", "version", "review_status",
            "last_review_note", "last_reviewed_at", "locked_at", "updated_at",
        ])
        record.invoice.status = "draft"
        record.invoice.save(update_fields=["status"])
        InvoiceReviewRequest.objects.filter(record=record, resolved_at__isnull=True).update(
            resolved_at=timezone.now(),
            resolved_by_version=record.version,
        )

    write_canonical(record)
    _record_revision(record)
    return record


def serialize_revision(record, revision):
    """Read-only historical invoice view for an exact audited revision."""
    document = serialize_record(record)
    payments = list(record.payments.all())
    paid = sum((payment.amount for payment in payments), ZERO)
    delivery = record.deliveries.filter(version=revision.version).first()
    payable = Decimal(str(revision.calculation.get("payable") or "0.00"))
    document.update({
        "version": revision.version,
        "current_version": record.version,
        "is_current": revision.version == record.version,
        "payload": revision.payload,
        "calculation": revision.calculation,
        "source_snapshot": revision.source_snapshot or {},
        "locked": True,
        "editable": False,
        "status": "void" if record.voided_at else revision.invoice_status,
        "review_status": revision.review_status,
        "delivery_status": delivery.status if delivery else None,
        "balance": str(payable - paid),
    })
    return document


def owner_visible_document(record):
    """Return the current delivered revision, or the last successfully delivered revision.

    Saving a newer worker revision must not expose that unsent draft to the pharmacy,
    but it also must not make the previously sent invoice disappear from history.
    """
    current_delivery = record.deliveries.filter(
        version=record.version,
        status__in=["sent", "legacy_queued"],
    ).first()
    current_is_visible = (
        current_delivery is not None
        or record.invoice.status in {"sent", "paid"}
        or record.review_status != "NONE"
    )
    if current_is_visible:
        return serialize_record(record)

    delivered = (
        record.deliveries
        .filter(status__in=["sent", "legacy_queued"])
        .order_by("-version")
        .first()
    )
    if delivered is None:
        return None
    revision = record.revisions.filter(version=delivered.version).first()
    if revision is None:
        return None
    return serialize_revision(record, revision)


def serialize_record(record):
    payments = list(record.payments.all())
    paid = sum((payment.amount for payment in payments), ZERO)
    invoice = record.invoice
    delivery = next((item for item in record.deliveries.all() if item.version == record.version), None)
    companion = getattr(record, "super_document", None)
    revisions = list(record.revisions.all()[:20])
    requests = list(record.review_requests.all()[:20])
    return {
        "id": record.pk,
        "invoice_id": invoice.pk,
        "number": f"{'SUP' if record.kind == 'super_request' else 'INV'}-{invoice.pk:06d}",
        "version": record.version,
        "request_key": str(record.request_key),
        "kind": record.kind,
        "source": record.source,
        "payload": record.payload,
        "calculation": record.calculation,
        "source_snapshot": invoice.source_snapshot or {},
        "locked": False,
        "editable": not bool(record.voided_at) and record.kind == "invoice",
        "voided": bool(record.voided_at),
        "status": "void" if record.voided_at else invoice.status,
        "review_status": record.review_status,
        "last_review_note": record.last_review_note,
        "last_reviewed_at": record.last_reviewed_at.isoformat() if record.last_reviewed_at else None,
        "delivery_status": delivery.status if delivery else None,
        "paid": str(paid),
        "balance": str(Decimal(record.calculation["payable"]) - paid),
        "super_document_id": companion.pk if companion else None,
        "payments": json_safe([
            {key: getattr(payment, key) for key in ("id", "date", "amount", "reference")}
            for payment in payments
        ]),
        "revisions": [
            {
                "version": rev.version,
                "invoice_status": rev.invoice_status,
                "review_status": rev.review_status,
                "created_at": rev.created_at.isoformat(),
                "calculation": rev.calculation,
            }
            for rev in revisions
        ],
        "review_requests": [
            {
                "id": req.id,
                "requested_version": req.requested_version,
                "note": req.note,
                "requested_by_name": req.requested_by.get_full_name() or req.requested_by.email,
                "created_at": req.created_at.isoformat(),
                "resolved_at": req.resolved_at.isoformat() if req.resolved_at else None,
                "resolved_by_version": req.resolved_by_version,
            }
            for req in requests
        ],
    }


@transaction.atomic
def duplicate(owner, record_id, request_key):
    source_record = get_object_or_404(InvoiceRecord, pk=record_id, owner=owner, kind="invoice")
    data = dict(source_record.payload)
    data["request_key"] = request_key
    data.pop("version", None)
    data.pop("source_assignment_ids", None)
    today = timezone.localdate()
    data["invoice_date"] = today
    data["due_date"] = today + timedelta(days=source_record.customer.payment_terms_days)
    data["lines"] = [
        {
            key: value
            for key, value in {**line, "worked_on": None}.items()
            if key not in {"source_assignment_id", "shift_id"}
        }
        for line in data["lines"]
    ]
    return save_draft(owner, data, source="external")


@transaction.atomic
def make_super_document(owner, record_id, version):
    record = get_object_or_404(
        InvoiceRecord.objects.select_for_update(), pk=record_id, owner=owner, kind="invoice"
    )
    check_version(record, version)
    existing = InvoiceRecord.objects.filter(parent=record, voided_at__isnull=True).first()
    if existing:
        return existing
    if record.voided_at or Decimal(record.calculation["super"]) <= 0 or record.payload["super_mode"] != "separate":
        raise ValidationError("Select separate super on a non-void service invoice with a positive contribution.")
    if not all(record.payload.get(key) for key in ("super_fund_name", "super_usi", "super_member_number")):
        raise ValidationError("Enter the fund, USI and member number before creating the super request.")
    item = _system_item(owner, "Superannuation")
    amount = record.calculation["super"]
    line = {
        "item_id": item.pk,
        "description": f"Super contribution for INV-{record.invoice_id:06d}",
        "category_code": "Superannuation",
        "unit": "Lump Sum",
        "quantity": "1.00",
        "unit_price": amount,
        "discount": "0.00",
        "tax_code": "OUT_OF_SCOPE",
        "super_eligible": False,
        "net": amount,
        "gst": "0.00",
        "gross": amount,
    }
    calc = {
        "lines": [line],
        "subtotal": "0.00",
        "gst": "0.00",
        "payable": amount,
        "sales_gross": "0.00",
        "super": amount,
        "automatic_super": "0.00",
    }
    request_key = uuid4()
    payload = {
        **record.payload,
        "lines": [line],
        "request_key": str(request_key),
        "notes": f"Separate contribution request linked to INV-{record.invoice_id:06d}. Pay the fund, not the worker.",
    }
    invoice = Invoice.objects.create(user=owner, external=record.invoice.external)
    companion = InvoiceRecord.objects.create(
        owner=owner,
        invoice=invoice,
        customer=record.customer,
        parent=record,
        kind="super_request",
        source=record.source,
        request_key=request_key,
        payload=payload,
        calculation=calc,
    )
    write_canonical(companion)
    _record_revision(companion)
    return companion


@transaction.atomic
def record_payment(owner, record_id, data):
    record = get_object_or_404(InvoiceRecord.objects.select_for_update(), pk=record_id, owner=owner)
    if record.voided_at:
        raise ValidationError("Payments cannot be recorded against a void document.")
    if record.kind == "super_request" and not data.get("fund_payment_confirmed"):
        raise ValidationError("Confirm the payment went to the super fund, not to the worker.")
    existing = record.payments.filter(request_key=data["request_key"]).first()
    if existing:
        if (
            existing.amount != data["amount"]
            or existing.date != data["date"]
            or existing.reference != data.get("reference", "")
        ):
            raise ValidationError("This payment request key was already used for different payment details.")
        return record
    paid = record.payments.aggregate(value=Sum("amount"))["value"] or ZERO
    amount = Decimal(data["amount"])
    try:
        gst = allocate_payment(
            amount=amount,
            previously_paid=paid,
            total=record.calculation["payable"],
            component=record.calculation["gst"],
        )
        sales = allocate_payment(
            amount=amount,
            previously_paid=paid,
            total=record.calculation["payable"],
            component=record.calculation["sales_gross"],
        )
    except CalculationError as exc:
        raise ValidationError(str(exc)) from exc
    Payment.objects.create(
        record=record,
        request_key=data["request_key"],
        date=data["date"],
        amount=amount,
        gst=gst,
        sales=sales,
        reference=data.get("reference", ""),
    )
    if paid + amount == Decimal(record.calculation["payable"]):
        record.invoice.status = "paid"
        record.invoice.save(update_fields=["status"])
    return record
