"""Shared roster eligibility and dated-interval validation."""
from datetime import datetime, timedelta

from django.db.models import Q

from .models import Membership, ShiftSlotAssignment, UserAvailability
from .timezone_utils import get_pharmacy_timezone


def work_interval(pharmacy, work_date, start_time, end_time):
    tz = get_pharmacy_timezone(pharmacy)
    start = datetime.combine(work_date, start_time, tzinfo=tz)
    end = datetime.combine(work_date, end_time, tzinfo=tz)
    if end <= start:
        end += timedelta(days=1)
    return start, end


def worker_issues(pharmacy, worker, work_date, start_time, end_time, role, exclude_assignment_id=None):
    """Validate planning/replacement eligibility; attendance has its own locum exception."""
    errors, warnings = [], []
    name = worker.get_full_name() or worker.username

    def error(kind, message, **details):
        errors.append({"type": kind, "message": message, "user_id": worker.pk,
                       "date": str(work_date), **details})

    memberships = list(Membership.objects.filter(
        user=worker, pharmacy=pharmacy, is_active=True, status=Membership.Status.ACCEPTED,
    ).exclude(role="CONTACT"))
    if not worker.is_active or not memberships:
        error("INACTIVE_MEMBERSHIP", f"Worker {name} requires an active accepted membership at this pharmacy.")

    # Membership roles are the existing pharmacy-specific specialties. Other
    # staff retain ChemistTasker's non-intern cross-role compatibility.
    roles = {m.role for m in memberships}
    matches = role in roles or getattr(worker, "role", "") == role
    if not matches and getattr(worker, "role", "") == "OTHER_STAFF":
        from .views import NON_INTERN_OTHER_STAFF_SHIFT_ROLES
        matches = role in NON_INTERN_OTHER_STAFF_SHIFT_ROLES and bool(roles.intersection(NON_INTERN_OTHER_STAFF_SHIFT_ROLES))
    if not matches:
        error("ROLE_MISMATCH", f"Worker {name} role does not match required role {role}.", required_role=role)

    start, end = work_interval(pharmacy, work_date, start_time, end_time)
    nearby = ShiftSlotAssignment.objects.filter(user=worker).filter(
        Q(slot_date__range=(work_date - timedelta(days=2), work_date + timedelta(days=2)))
        | Q(slot_date__isnull=True, slot__date__range=(work_date - timedelta(days=2), work_date + timedelta(days=2)))
    ).exclude(pk=exclude_assignment_id).select_related("slot", "shift__pharmacy")
    for other in nearby:
        other_start, other_end = work_interval(other.shift.pharmacy, other.slot_date or other.slot.date,
                                               other.slot.start_time, other.slot.end_time)
        if start < other_end and other_start < end:
            error("SHIFT_OVERLAP", f"Worker {name} has an overlapping shift at {other.shift.pharmacy.name}.",
                  conflicting_assignment_id=other.pk)

    from workforce.models import WorkforceLeaveRequest
    if WorkforceLeaveRequest.objects.filter(
        user=worker,
        pharmacy=pharmacy,
        status=WorkforceLeaveRequest.Status.APPROVED,
        start_at__lt=end,
        end_at__gt=start,
    ).exists():
        error("APPROVED_LEAVE_CONFLICT", f"Worker {name} has approved leave overlapping this shift.")

    availabilities = UserAvailability.objects.filter(user=worker).filter(
        Q(date=work_date) | Q(is_recurring=True, date__lte=work_date)
    )
    applicable = []
    for av in availabilities:
        if av.date == work_date or (av.is_recurring
                and (av.recurring_end_date is None or av.recurring_end_date >= work_date)
                and (work_date.weekday() + 1) % 7 in av.recurring_days):
            applicable.append(av)
    if applicable and not any(av.is_all_day or (
        work_interval(pharmacy, work_date, av.start_time, av.end_time)[0] <= start
        and end <= work_interval(pharmacy, work_date, av.start_time, av.end_time)[1]
    ) for av in applicable):
        warnings.append({"type": "AVAILABILITY_CONFLICT", "user_id": worker.pk, "date": str(work_date),
                         "message": f"Shift is outside worker {name}'s declared availability."})
    return errors, warnings
