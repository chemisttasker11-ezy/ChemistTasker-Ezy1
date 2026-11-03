"""Dates affected by deferred payroll activation, using accepted booking selection."""
from datetime import timedelta

from shifts.pricing import expand_shift_slots
from shifts.occurrences import accepted_occurrences


def activation_work_dates(offer, assignments, *, include_pending):
    work = [(row.slot_date or row.slot.date, row.slot) for row in assignments]
    if include_pending:
        work.extend((entry["date"], entry["slot"])
                    for entry in accepted_occurrences(offer, expand_shift_slots(offer.shift)))
    dates = set()
    for day, slot in work:
        dates.add(day)
        # Match ordinary assignment writes: a midnight end touches the next date too.
        start, end = getattr(slot, "start_time", None), getattr(slot, "end_time", None)
        if start is not None and end is not None and end <= start:
            dates.add(day + timedelta(days=1))
    return tuple(sorted(dates))
