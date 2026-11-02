"""Accepted occurrence selection shared by booking, checkout and payroll.

Callers keep their expansion lookup and their own empty-selection/history policy.
Whole-shift snapshots record only first dates, so only slot offers narrow by them.
"""


def accepted_occurrence_pairs(offer):
    rows = ((offer.engagement_terms_snapshot or {}).get('occurrences') or []) if offer.slot_id else []
    return {(str(row.get('slot_id')), str(row.get('date'))) for row in rows}


def accepted_occurrences(offer, expanded):
    accepted = accepted_occurrence_pairs(offer)
    for row in expanded:
        slot_id, work_date = row['slot'].pk, row['date']
        if offer.slot_id and slot_id != offer.slot_id:
            continue
        if accepted and (str(slot_id), str(work_date)) not in accepted:
            continue
        if offer.slot_id and offer.offered_slot_date and work_date != offer.offered_slot_date:
            continue
        yield row
