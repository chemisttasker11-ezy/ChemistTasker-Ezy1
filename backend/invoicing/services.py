"""Invoice generation: preview and create invoices from accepted shifts, recalculate totals, render the PDF."""
import json
from client_profile.models import OtherStaffOnboarding, PharmacistOnboarding, Pharmacy, ShiftSlotAssignment
from invoicing.models import Invoice, InvoiceLineItem
from decimal import Decimal, ROUND_HALF_UP
from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from django.template.loader import render_to_string
from weasyprint import HTML
from client_profile.services import _decimal_hours, _resolve_shift_bounds


INVOICE_SETTLEMENT_CHANNEL = "INVOICE"
INDEPENDENT_CONTRACTOR_KIND = "INDEPENDENT_CONTRACTOR"


def _invoice_routed_assignments(user, *, shift_ids=None, shift=None, for_update=False):
    qs = ShiftSlotAssignment.objects.filter(
        user=user,
        settlement_channel=INVOICE_SETTLEMENT_CHANNEL,
        engagement_kind=INDEPENDENT_CONTRACTOR_KIND,
        engagement_terms_accepted_at__isnull=False,
    ).select_related("shift", "slot", "shift__pharmacy", "source_offer")
    if shift is not None:
        qs = qs.filter(shift=shift)
    if shift_ids is not None:
        qs = qs.filter(shift_id__in=shift_ids)
    if for_update:
        # ``source_offer`` is optional. Clear eager joins before locking so
        # PostgreSQL does not reject FOR UPDATE on the nullable outer join.
        qs = qs.select_related(None).select_for_update()
    return qs


def validate_internal_invoice_shifts(user, shift_ids, pharmacy_id=None, *, assignments=None):
    requested = {int(value) for value in (shift_ids or [])}
    if not requested:
        raise ValidationError("Select at least one accepted ABN shift to invoice.")

    assignments = list(assignments) if assignments is not None else list(
        _invoice_routed_assignments(user, shift_ids=requested)
    )
    routed_shift_ids = {assignment.shift_id for assignment in assignments}
    missing = sorted(requested - routed_shift_ids)
    if missing:
        raise ValidationError({
            "shift_ids": (
                "Only accepted assignments routed to invoicing can be billed. "
                f"Not invoice-routed for this worker: {missing}."
            )
        })

    if pharmacy_id not in (None, ""):
        pharmacy_id = int(pharmacy_id)
        wrong_pharmacy = sorted({
            assignment.shift_id
            for assignment in assignments
            if assignment.shift.pharmacy_id != pharmacy_id
        })
        if wrong_pharmacy:
            raise ValidationError({
                "pharmacy": f"The selected shifts do not all belong to pharmacy {pharmacy_id}: {wrong_pharmacy}."
            })
    return assignments


def _accepted_invoice_rate(assignment, slot_date):
    snapshot = assignment.engagement_terms_snapshot or {}
    for occurrence in snapshot.get("occurrences") or []:
        if str(occurrence.get("slot_id") or "") != str(assignment.slot_id):
            continue
        if str(occurrence.get("date") or "") != str(slot_date):
            continue
        agreed_rate = occurrence.get("agreed_rate")
        if agreed_rate not in (None, ""):
            rate = Decimal(str(agreed_rate))
            if rate > 0:
                return rate

    if assignment.unit_rate is not None and assignment.unit_rate > 0:
        return Decimal(str(assignment.unit_rate))

    raise ValidationError({
        "rate": (
            f"Accepted invoice terms for assignment {assignment.pk} do not contain a positive agreed rate. "
            "Resolve the shift terms before invoicing."
        )
    })


def _invoice_line_from_assignment(assignment):
    slot = assignment.slot
    slot_date = assignment.slot_date
    start_dt, end_dt = _resolve_shift_bounds(slot_date, slot.start_time, slot.end_time)
    # InvoiceLineItem.quantity is a 2-decimal field. Freeze the billed hours
    # at that precision before calculating money so DB, workspace and PDF agree.
    hours = _decimal_hours(start_dt, end_dt).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    rate = _accepted_invoice_rate(assignment, slot_date)
    total = (hours * rate).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    snapshot = assignment.engagement_terms_snapshot or {}
    return {
        "id": f"{assignment.shift_id}-{slot.id}-{slot_date}",
        "assignmentId": assignment.id,
        "shiftId": assignment.shift_id,
        "shiftSlotId": slot.id,
        "date": str(slot_date),
        "start_time": slot.start_time.strftime("%H:%M:%S"),
        "end_time": slot.end_time.strftime("%H:%M:%S"),
        "description": f"{str(slot_date)} {slot.start_time.strftime('%H:%M')}-{slot.end_time.strftime('%H:%M')}",
        "category": "ProfessionalServices",
        "category_code": "ProfessionalServices",
        "unit": "Hours",
        "quantity": float(hours),
        "unit_price": float(rate),
        "discount": 0,
        "total": float(total),
        "gst_applicable": bool(snapshot.get("gst_registered", False)),
        "super_applicable": bool(snapshot.get("super_payable_confirmed", False)),
        "was_modified": False,
        "locked": True,
        "rate_reason": {
            "source": "AcceptedShiftTerms",
            "assignment_id": assignment.id,
            "offer_id": assignment.source_offer_id,
            "settlement_channel": assignment.settlement_channel,
        },
    }


def generate_preview_invoice_lines(shift, user):
    assignments = list(
        _invoice_routed_assignments(user, shift=shift).order_by("slot_date", "slot_id", "id")
    )
    if not assignments:
        raise ValidationError(
            "This shift has no accepted ABN assignment routed to invoicing for the current worker."
        )
    return [_invoice_line_from_assignment(assignment) for assignment in assignments]


def recalculate_invoice_totals(invoice, *, ensure_generated_super_line=True):
    line_items = list(invoice.line_items.all().order_by("id"))
    non_super = [line for line in line_items if line.category_code != "Superannuation"]
    manual_super = [
        line for line in line_items
        if line.category_code == "Superannuation" and line.was_modified
    ]
    generated_super = [
        line for line in line_items
        if line.category_code == "Superannuation" and not line.was_modified
    ]

    subtotal = sum((line.total for line in non_super), Decimal("0.00")).quantize(Decimal("0.01"))
    gst_base = sum(
        (line.total for line in non_super if line.gst_applicable),
        Decimal("0.00"),
    )
    gst_amount = (
        (gst_base * Decimal("0.10")).quantize(Decimal("0.01"))
        if invoice.gst_registered
        else Decimal("0.00")
    )

    if manual_super:
        super_amount = sum((line.total for line in manual_super), Decimal("0.00")).quantize(Decimal("0.01"))
        for line in generated_super:
            line.delete()
    else:
        super_base = sum(
            (line.total for line in non_super if line.super_applicable),
            Decimal("0.00"),
        )
        super_amount = (
            super_base * (invoice.super_rate_snapshot / Decimal("100"))
        ).quantize(Decimal("0.01"))
        if ensure_generated_super_line:
            primary = generated_super[0] if generated_super else None
            for extra in generated_super[1:]:
                extra.delete()
            if super_amount > 0:
                if primary is None:
                    InvoiceLineItem.objects.create(
                        invoice=invoice,
                        description="Superannuation",
                        category_code="Superannuation",
                        unit="Lump Sum",
                        quantity=Decimal("1.00"),
                        unit_price=super_amount,
                        discount=Decimal("0.00"),
                        total=super_amount,
                        gst_applicable=False,
                        super_applicable=False,
                        is_manual=True,
                        was_modified=False,
                    )
                else:
                    primary.description = "Superannuation"
                    primary.quantity = Decimal("1.00")
                    primary.unit_price = super_amount
                    primary.discount = Decimal("0.00")
                    primary.total = super_amount
                    primary.gst_applicable = False
                    primary.super_applicable = False
                    primary.is_manual = True
                    primary.save(update_fields=[
                        "description", "quantity", "unit_price", "discount", "total",
                        "gst_applicable", "super_applicable", "is_manual",
                    ])
            elif primary is not None:
                primary.delete()

    invoice.subtotal = subtotal
    invoice.gst_amount = gst_amount
    invoice.super_amount = super_amount
    # Worker payable excludes super. Super is a separate contribution, matching
    # the worker_finance workspace and optional separate super document.
    invoice.total = (subtotal + gst_amount).quantize(Decimal("0.01"))
    invoice.save(update_fields=["subtotal", "gst_amount", "super_amount", "total"])
    return invoice


def _internal_invoice_source_snapshot(assignments):
    return {
        "version": 1,
        "source": "INTERNAL_ABN_SHIFT_ASSIGNMENTS",
        "assignment_ids": [assignment.id for assignment in assignments],
        "shift_ids": sorted({assignment.shift_id for assignment in assignments}),
        "accepted_terms": [
            {
                "assignment_id": assignment.id,
                "source_offer_id": assignment.source_offer_id,
                "settlement_channel": assignment.settlement_channel,
                "engagement_kind": assignment.engagement_kind,
                "accepted_at": (
                    assignment.engagement_terms_accepted_at.isoformat()
                    if assignment.engagement_terms_accepted_at
                    else None
                ),
                "terms": assignment.engagement_terms_snapshot or {},
            }
            for assignment in assignments
        ],
    }


def generate_invoice_from_shifts(
    user,
    pharmacy_id=None,
    shift_ids=None,
    custom_lines=None,
    external=False,
    billing_data=None,
    due_date=None,
):
    billing_data = billing_data or {}
    custom_lines = list(custom_lines or [])

    try:
        ob = PharmacistOnboarding.objects.get(user=user)
    except PharmacistOnboarding.DoesNotExist:
        ob = OtherStaffOnboarding.objects.get(user=user)

    gst_registered = billing_data.get("gst_registered", False)
    if isinstance(gst_registered, str):
        gst_registered = gst_registered.lower() in ["true", "1", "yes"]

    raw_shift_ids = billing_data.get("shift_ids", shift_ids)
    if raw_shift_ids:
        shift_ids = json.loads(raw_shift_ids) if isinstance(raw_shift_ids, str) else list(raw_shift_ids)
    else:
        shift_ids = []

    external = billing_data.get("external", external)
    if isinstance(external, str):
        external = external.lower() in ["true", "1", "yes"]

    try:
        with transaction.atomic():
            locked_assignments = []
            if not external:
                locked_assignments = list(
                    _invoice_routed_assignments(
                        user,
                        shift_ids=shift_ids,
                        for_update=True,
                    ).order_by("shift_id", "slot_date", "slot_id", "id")
                )
                validate_internal_invoice_shifts(
                    user,
                    shift_ids,
                    pharmacy_id=pharmacy_id,
                    assignments=locked_assignments,
                )
                assignment_ids = [assignment.id for assignment in locked_assignments]
                already_invoiced = (
                    InvoiceLineItem.objects
                    .filter(
                        source_assignment_id__in=assignment_ids,
                        category_code="ProfessionalServices",
                    )
                    .select_related("invoice", "source_assignment")
                    .first()
                )
                if already_invoiced:
                    raise ValidationError({
                        "shift_ids": (
                            f"Assignment {already_invoiced.source_assignment_id} is already billed "
                            f"on invoice #{already_invoiced.invoice_id}."
                        )
                    })

            invoice = Invoice.objects.create(
                user=user,
                external=external,
                issuer_first_name=user.first_name,
                issuer_last_name=user.last_name,
                issuer_abn=ob.abn or "",
                issuer_email=user.email,
                gst_registered=gst_registered,
                super_fund_name=billing_data.get("super_fund_name", ""),
                super_usi=billing_data.get("super_usi", ""),
                super_member_number=billing_data.get("super_member_number", ""),
                super_rate_snapshot=Decimal(str(billing_data["super_rate_snapshot"])),
                bank_account_name=billing_data["bank_account_name"],
                bsb=billing_data["bsb"],
                account_number=billing_data["account_number"],
                cc_emails=billing_data.get("cc_emails", ""),
                due_date=due_date,
                source_snapshot=(
                    _internal_invoice_source_snapshot(locked_assignments)
                    if not external
                    else {
                        "version": 1,
                        "source": "EXTERNAL_CUSTOMER",
                        "line_count": len(custom_lines),
                    }
                ),
            )

            if not external:
                pharmacy = Pharmacy.objects.get(pk=pharmacy_id)
                invoice.pharmacy = pharmacy
                invoice.pharmacy_name_snapshot = pharmacy.name
                parts = [
                    getattr(pharmacy, "street_address", None),
                    getattr(pharmacy, "suburb", None),
                    getattr(pharmacy, "state", None),
                    getattr(pharmacy, "postcode", None),
                ]
                invoice.pharmacy_address_snapshot = ", ".join([str(p).strip() for p in parts if p])
                invoice.pharmacy_abn_snapshot = pharmacy.abn

                first_shift = locked_assignments[0].shift
                if first_shift.created_by:
                    invoice.bill_to_first_name = first_shift.created_by.first_name
                    invoice.bill_to_last_name = first_shift.created_by.last_name
                    invoice.bill_to_email = first_shift.created_by.email
            else:
                invoice.custom_bill_to_name = billing_data.get("custom_bill_to_name", "")
                invoice.custom_bill_to_address = billing_data.get("custom_bill_to_address", "")
                invoice.bill_to_email = billing_data.get("bill_to_email", "")
                invoice.bill_to_abn = billing_data.get("bill_to_abn", "")
            invoice.save()

            effective_lines = []
            if not external:
                effective_lines.extend(
                    _invoice_line_from_assignment(assignment)
                    for assignment in locked_assignments
                )
                for line in custom_lines:
                    category_code = line.get("category_code") or line.get("category") or "ProfessionalServices"
                    if category_code == "ProfessionalServices":
                        continue
                    effective_lines.append(line)
            else:
                effective_lines = custom_lines

            assignment_by_id = {
                assignment.id: assignment for assignment in locked_assignments
            }
            for line in effective_lines:
                category_code = line.get("category_code") or line.get("category") or "ProfessionalServices"
                qty = Decimal(str(line.get("quantity", 0)))
                rate = Decimal(str(line.get("unit_price", 0)))
                discount = Decimal(str(line.get("discount", 0))) / Decimal("100")
                total = (qty * rate * (1 - discount)).quantize(Decimal("0.01"))
                shift_id = line.get("shiftId") or line.get("shift_id")
                assignment_id = line.get("assignmentId") or line.get("assignment_id")
                source_assignment = assignment_by_id.get(int(assignment_id)) if assignment_id else None

                InvoiceLineItem.objects.create(
                    invoice=invoice,
                    shift_id=shift_id if shift_id else None,
                    source_assignment=source_assignment,
                    description=line.get("description", ""),
                    category_code=category_code,
                    unit=line.get("unit", "Item"),
                    quantity=qty,
                    unit_price=rate,
                    discount=discount * Decimal("100"),
                    total=total,
                    gst_applicable=line.get("gst_applicable", True),
                    super_applicable=line.get("super_applicable", True),
                    is_manual=external or category_code != "ProfessionalServices",
                    was_modified=external or category_code != "ProfessionalServices",
                )

            recalculate_invoice_totals(invoice)
            if not external:
                # The newer finance workspace wraps the same canonical invoice;
                # it does not create a second invoice or duplicate the accepted work.
                from rest_framework.exceptions import ValidationError as DRFValidationError
                from worker_finance.services import adopt_internal_invoice
                try:
                    invoice = adopt_internal_invoice(user, invoice)
                except DRFValidationError as exc:
                    raise ValidationError({"finance_workspace": str(exc.detail)}) from exc
            return invoice
    except IntegrityError as exc:
        raise ValidationError({
            "shift_ids": "One or more accepted shift assignments were invoiced concurrently. Refresh the invoice list before trying again."
        }) from exc


def render_invoice_to_pdf(invoice):
    line_items = invoice.line_items.all().order_by("id")
    transportation = sum(
        (line.total for line in line_items if line.category_code == "Transportation"),
        Decimal("0.00"),
    )
    accommodation = sum(
        (line.total for line in line_items if line.category_code == "Accommodation"),
        Decimal("0.00"),
    )
    context = {
        "invoice": invoice,
        "line_items": line_items,
        "subtotal": invoice.subtotal,
        "transportation": transportation,
        "accommodation": accommodation,
        "gst": invoice.gst_amount,
        "super_amount": invoice.super_amount,
        "grand_total": invoice.total,
    }
    html_string = render_to_string("invoices/invoice_pdf.html", context)
    pdf_bytes = HTML(string=html_string, base_url=None).write_pdf()
    return pdf_bytes
