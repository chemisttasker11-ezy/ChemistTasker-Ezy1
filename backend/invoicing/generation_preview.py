"""Read-only preview of the existing internal/external generation workflow.

Only finite, field-representable two-decimal inputs are previewed. Legacy
generation's raw-input acceptance is unchanged; no database-specific rounding
of overprecision inputs is guessed here. Save still locks and revalidates sources.
"""
import json
from collections.abc import Mapping
from decimal import Decimal, DecimalException

from django.core.exceptions import ValidationError

from invoicing.models import Invoice, InvoiceLineItem
from invoicing.services import (
    _generated_super_values,
    _generation_line_values,
    _invoice_issuer_profile,
    _invoice_routed_assignments,
    _legacy_invoice_amounts,
    _validate_unbilled_assignments,
    validate_internal_invoice_shifts,
)
from worker_finance.invoice_bridge import preview_generated_internal_invoice


def _list_input(data, name):
    value = data.get(name) or []
    if isinstance(value, str):
        try:
            value = json.loads(value)
        except ValueError as exc:
            raise ValidationError({name: "Enter a valid JSON list."}) from exc
    if not isinstance(value, list):
        raise ValidationError({name: "Expected a list."})
    return value


def _header_boolean(data, name):
    value = data.get(name, False)
    if isinstance(value, str):
        value = value.lower() in ["true", "1", "yes"]
    try:
        return Invoice._meta.get_field(name).to_python(value)
    except ValidationError as exc:
        raise ValidationError({name: exc.messages}) from exc


def _decimal_input(value, model, field_name):
    field = model._meta.get_field(field_name)
    try:
        if isinstance(value, bool):
            raise ValueError
        number = Decimal(str(value))
        if not number.is_finite():
            raise ValueError
        rounded = number.quantize(Decimal("0.01"))
        if number != rounded:
            raise ValueError
        # Removing equivalent trailing zeroes does not round the input. The
        # model validator then enforces this field's actual storage bounds.
        return field.clean(rounded, None)
    except (DecimalException, ValueError, TypeError, ValidationError) as exc:
        raise ValidationError({
            field_name: "Enter a finite amount within this field's limit, with at most two decimal places."
        }) from exc


def _custom_inputs(raw_lines, *, external):
    lines = []
    for index, raw in enumerate(raw_lines):
        if not isinstance(raw, dict):
            raise ValidationError({"line_items": "Every invoice line must be an object."})
        line = dict(raw)
        category = line.get("category_code") or line.get("category") or "ProfessionalServices"
        # Generation ignores these submitted rows completely. Their values
        # cannot override, or prevent use of, the accepted assignment facts.
        if external or category != "ProfessionalServices":
            try:
                for name in ("quantity", "unit_price", "discount"):
                    line[name] = _decimal_input(line.get(name, 0), InvoiceLineItem, name)
            except ValidationError as exc:
                raise ValidationError({"line_items": f"Row {index + 1}: {' '.join(exc.messages)}"}) from exc
        lines.append(line)
    return lines


def _preview_row(values):
    row = InvoiceLineItem(**values)
    for name in ("quantity", "unit_price", "discount", "total"):
        setattr(row, name, _decimal_input(getattr(row, name), InvoiceLineItem, name))
    for name in ("gst_applicable", "super_applicable"):
        # Match a persisted/reloaded BooleanField, including legacy 'False'
        # and '0' inputs; bool('False') would reverse the worker's choice.
        setattr(row, name, InvoiceLineItem._meta.get_field(name).to_python(getattr(row, name)))
    for name in ("description", "category_code", "unit"):
        field = InvoiceLineItem._meta.get_field(name)
        value = field.to_python(getattr(row, name))
        if value is None or len(value) > field.max_length:
            raise ValidationError({name: f"Enter text of at most {field.max_length} characters."})
        setattr(row, name, value)
    return row


def _line_response(row, source):
    result = {key: source[key] for key in (
        "id", "date", "start_time", "end_time", "shiftSlotId", "rate_reason",
    ) if key in source}
    result.update({
        "origin": source["origin"],
        "description": row.description, "category_code": row.category_code, "unit": row.unit,
        "quantity": str(row.quantity), "unit_price": str(row.unit_price),
        "discount": str(row.discount), "total": str(row.total),
        "gst_applicable": row.gst_applicable, "super_applicable": row.super_applicable,
        "is_manual": row.is_manual, "was_modified": row.was_modified,
        "locked": source["origin"] != "custom",
    })
    for name, value in (
        ("custom_index", source.get("custom_index")),
        ("assignmentId", row.source_assignment_id), ("shiftId", row.shift_id),
    ):
        if value is not None:
            result[name] = value
    return result


def preview_invoice_generation(user, data):
    if not isinstance(data, Mapping):
        raise ValidationError({"error": "Expected an invoice object."})
    _invoice_issuer_profile(user)
    external = _header_boolean(data, "external")
    gst_registered = _header_boolean(data, "gst_registered")
    super_rate = _decimal_input(data.get("super_rate_snapshot"), Invoice, "super_rate_snapshot")
    shift_ids = _list_input(data, "shift_ids")
    custom_lines = _custom_inputs(_list_input(data, "line_items"), external=external)

    assignments = []
    if not external:
        try:
            if any(isinstance(value, bool) or not isinstance(value, (int, str)) for value in shift_ids):
                raise ValueError
            shift_ids = [int(value) for value in shift_ids]
            pharmacy_id = int(data.get("pharmacy"))
            if pharmacy_id <= 0 or any(value <= 0 for value in shift_ids):
                raise ValueError
        except (TypeError, ValueError, OverflowError) as exc:
            raise ValidationError({"shift_ids": "Select a pharmacy and its accepted assignments."}) from exc
        assignments = list(_invoice_routed_assignments(user, shift_ids=shift_ids).order_by(
            "shift_id", "slot_date", "slot_id", "id",
        ))
        validate_internal_invoice_shifts(user, shift_ids, pharmacy_id=pharmacy_id, assignments=assignments)
        _validate_unbilled_assignments(assignments)

    try:
        prepared = [(_preview_row(values), source) for values, source in _generation_line_values(
            assignments, custom_lines, external=external,
        )]
        rows = [row for row, _ in prepared]
        amounts, manual_super, _ = _legacy_invoice_amounts(
            rows, gst_registered=gst_registered, super_rate_snapshot=super_rate,
        )
        if not manual_super and amounts["super_amount"] > 0:
            generated = _preview_row(_generated_super_values(amounts["super_amount"]))
            rows.append(generated)
            prepared.append((generated, {"origin": "generated_super"}))
        if not external:
            invoice = Invoice(gst_registered=gst_registered, super_rate_snapshot=super_rate, **amounts)
            calc = preview_generated_internal_invoice(invoice, rows)
            for row, calculated in zip(rows, calc["lines"], strict=True):
                row.total = Decimal(calculated["net"])
            amounts = {name: Decimal(calc[key]) for name, key in (
                ("subtotal", "subtotal"), ("gst_amount", "gst"),
                ("super_amount", "super"), ("total", "payable"),
            )}
        return {
            "line_items": [_line_response(row, source) for row, source in prepared],
            **{name: str(_decimal_input(amount, Invoice, name)) for name, amount in amounts.items()},
        }
    except (DecimalException, ValueError, TypeError) as exc:
        raise ValidationError({"line_items": str(exc) or "Enter valid invoice line values."}) from exc
