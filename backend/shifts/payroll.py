"""Dates affected by deferred payroll activation, using accepted booking selection."""
from shifts.pricing import expand_shift_slots
from shifts.occurrences import accepted_occurrences


def activation_work_dates(offer, assignments, *, include_pending):
    dates = {row.slot_date or row.slot.date for row in assignments}
    if include_pending:
        for entry in accepted_occurrences(offer, expand_shift_slots(offer.shift)):
            dates.add(entry["date"])
    return tuple(sorted(dates))
