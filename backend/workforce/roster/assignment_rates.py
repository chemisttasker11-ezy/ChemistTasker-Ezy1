"""Roster assignment pricing: refreshing an assignment's locked rate and validating and pricing a period's slots."""
from django.core.exceptions import ValidationError
from django.db import transaction
from shifts.models import ShiftSlotAssignment
from workforce.roster.periods import get_roster_period_assignments, validate_roster_period
from django.contrib.auth import get_user_model

User = get_user_model()


def refresh_assignment_rate(assignment):
    with transaction.atomic():
        # Reprice the locked current row: a stale copy must not reprice terms the worker accepted meanwhile.
        assignment.refresh_from_db(from_queryset=ShiftSlotAssignment.objects.select_for_update(of=("self",)))
        _refresh_locked_rate(assignment)


def _refresh_locked_rate(assignment):
    from shifts.pricing import get_locked_rate_for_slot
    terms = assignment.engagement_terms_snapshot or {}
    staff_terms = None
    if assignment.engagement_kind == 'STAFF_EMPLOYMENT':
        # Legacy incomplete snapshots retain their locked rate until terms are reviewed.
        if not terms.get('rates') and terms.get('settlement_channel') != 'TIMESHEET_ONLY':
            return
        staff_terms = terms
    elif assignment.source_offer_id or (assignment.engagement_kind == 'INDEPENDENT_CONTRACTOR' and assignment.engagement_terms_accepted_at):
        # An accepted worker offer remains authoritative when roster dates are edited.
        return
    assignment.unit_rate, assignment.rate_reason = get_locked_rate_for_slot(
        assignment.slot, assignment.shift, assignment.user,
        override_date=assignment.slot_date or assignment.slot.date,
        staff_terms=staff_terms,
    )
    assignment.save(update_fields=["unit_rate", "rate_reason"])


def _validate_and_price(roster_period, slot_ids=None):
    assignments = get_roster_period_assignments(roster_period)
    list(User.objects.select_for_update().filter(pk__in=assignments.values_list("user_id", flat=True)).order_by("pk"))
    validation = validate_roster_period(roster_period)
    if validation["errors"]:
        raise ValidationError([item["message"] for item in validation["errors"]])
    if slot_ids is not None:
        assignments = assignments.filter(slot_id__in=slot_ids)
    for assignment in assignments:
        refresh_assignment_rate(assignment)
