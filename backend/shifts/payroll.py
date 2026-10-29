"""Dates affected by deferred payroll activation, using accepted booking selection."""
from shifts.pricing import expand_shift_slots


def activation_work_dates(offer, assignments, *, include_pending):
    dates = {row.slot_date or row.slot.date for row in assignments}
    if include_pending:
        # Match finalization's whole-shift/slot/accepted-occurrence selection.
        occurrences = ((offer.engagement_terms_snapshot or {}).get("occurrences") or []) if offer.slot_id else []
        accepted = {(str(row.get("slot_id")), str(row.get("date"))) for row in occurrences}
        for entry in expand_shift_slots(offer.shift):
            if offer.slot_id and entry["slot"].pk != offer.slot_id:
                continue
            if accepted and (str(entry["slot"].pk), str(entry["date"])) not in accepted:
                continue
            if offer.slot_id and offer.offered_slot_date and entry["date"] != offer.offered_slot_date:
                continue
            dates.add(entry["date"])
    return tuple(sorted(dates))
