"""Original accepted assignment facts shared by invoice source adapters.

Callers retain ownership, invoice eligibility and row-lock checks. This reader
does not reprice work, decide invoice tax defaults or overwrite editable lines.
It deliberately imports no models so isolated finance contracts can use it.
"""
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP


class InvalidAssignmentTerms(ValueError):
    def __init__(self, field, message):
        self.field = field
        super().__init__(message)


@dataclass(frozen=True)
class InvoiceAssignmentFacts:
    assignment_id: int
    shift_id: int
    slot_id: int
    source_offer_id: int | None
    occurrence_date: date
    start_time: time
    end_time: time
    hours: Decimal
    rate: Decimal
    gst_registered: bool
    super_review_required: bool
    super_payable_confirmed: bool
    accepted_at: datetime | None
    accepted_by_user_id: int | None
    terms_source: str | None
    provisional_id: int | None
    cover_type: str | None
    start_time_source: str
    end_time_source: str
    rate_source: str


def _rate_value(value, assignment_id):
    if value in (None, ""):
        return None
    try:
        rate = Decimal(str(value))
    except (InvalidOperation, ValueError, TypeError) as exc:
        raise InvalidAssignmentTerms(
            "rate", f"Accepted invoice terms for assignment {assignment_id} contain an invalid agreed rate."
        ) from exc
    if not rate.is_finite():
        raise InvalidAssignmentTerms(
            "rate", f"Accepted invoice terms for assignment {assignment_id} contain an invalid agreed rate."
        )
    return rate


def resolve_invoice_assignment_facts(assignment) -> InvoiceAssignmentFacts:
    snapshot = assignment.engagement_terms_snapshot or {}
    occurrences = [
        row for row in snapshot.get("occurrences") or []
        if str(row.get("slot_id") or "") == str(assignment.slot_id)
        and str(row.get("date") or "") == str(assignment.slot_date)
    ]
    # Preserve the existing first matching time window and per-field fallback.
    occurrence = occurrences[0] if occurrences else {}
    start_raw, end_raw = occurrence.get("start_time"), occurrence.get("end_time")
    try:
        start = time.fromisoformat(start_raw) if start_raw else assignment.slot.start_time
        end = time.fromisoformat(end_raw) if end_raw else assignment.slot.end_time
        start_dt = datetime.combine(assignment.slot_date, start)
        end_dt = datetime.combine(assignment.slot_date, end)
        if end_dt <= start_dt:
            end_dt += timedelta(days=1)
        seconds = Decimal(str((end_dt - start_dt).total_seconds()))
    except (TypeError, ValueError) as exc:
        raise InvalidAssignmentTerms(
            "time", f"Accepted invoice terms for assignment {assignment.pk} contain an invalid time window."
        ) from exc
    # Keep canonical invoicing's existing four-decimal duration, then the
    # two-decimal billed quantity persisted by InvoiceLineItem.
    hours = (seconds / Decimal("3600")).quantize(Decimal("0.0001"))
    hours = hours.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

    rate = None
    rate_source = "accepted_occurrence"
    for row in occurrences:
        candidate = _rate_value(row.get("agreed_rate"), assignment.pk)
        if candidate is not None and candidate > 0:
            rate = candidate
            break
    if rate is None:
        rate = _rate_value(assignment.unit_rate, assignment.pk)
        rate_source = "assignment_fallback"
    if rate is None or rate <= 0:
        raise InvalidAssignmentTerms(
            "rate",
            f"Accepted invoice terms for assignment {assignment.pk} do not contain a positive agreed rate. "
            "Resolve the shift terms before invoicing.",
        )

    return InvoiceAssignmentFacts(
        assignment_id=assignment.pk,
        shift_id=assignment.shift_id,
        slot_id=assignment.slot_id,
        source_offer_id=assignment.source_offer_id,
        occurrence_date=assignment.slot_date,
        start_time=start,
        end_time=end,
        hours=hours,
        rate=rate,
        gst_registered=bool(snapshot.get("gst_registered", False)),
        super_review_required=bool(snapshot.get("super_review_required", False)),
        super_payable_confirmed=bool(snapshot.get("super_payable_confirmed", False)),
        accepted_at=assignment.engagement_terms_accepted_at,
        accepted_by_user_id=snapshot.get("accepted_by_user_id"),
        terms_source=snapshot.get("source"),
        provisional_id=snapshot.get("provisional_id"),
        cover_type=snapshot.get("cover_type"),
        start_time_source="accepted_occurrence" if start_raw else "slot_fallback",
        end_time_source="accepted_occurrence" if end_raw else "slot_fallback",
        rate_source=rate_source,
    )
