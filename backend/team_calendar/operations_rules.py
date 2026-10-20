"""Planner assignment validation and atomic, retry-safe copying."""
from datetime import time, datetime, timedelta

from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from memberships.models import Membership
from organizations.models import Pharmacy
from shifts.models import ShiftSlotAssignment
from team_calendar.models import WorkNote, WorkNoteAssignee
from team_calendar.operations_models import OperationAudit
from team_calendar.recurrence import expand_recurrence_dates

MAX_ITEMS = 400


def validate_times(start, end):
    if start and end and end <= start:
        raise ValidationError({"end_time": "End time must follow start time; tasks cannot cross midnight."})


def _rostered_user_ids(item):
    """Published roster presence, including midnight-crossing shifts.

    Times are pharmacy-local wall-clock schedule values. Actual break windows
    are not tracked by roster slot; task-level assignment must not be interpreted
    as evidence that a worker was available through a break.
    """
    yesterday = item.date - timedelta(days=1)
    assignments = ShiftSlotAssignment.objects.filter(
        Q(slot_date__in=(yesterday, item.date))
        | Q(slot_date__isnull=True, slot__date__in=(yesterday, item.date)),
        shift__pharmacy_id=item.pharmacy_id, is_rostered=True,
        slot__roster_period__status="PUBLISHED",
        slot__unpublished_at__isnull=True,
    ).select_related("slot")
    task_start = datetime.combine(item.date, item.start_time or time.min)
    task_end = datetime.combine(item.date, item.end_time or time.max)
    matched = set()
    for assignment in assignments:
        slot = assignment.slot
        slot_day = assignment.slot_date or slot.date
        shift_start = datetime.combine(slot_day, slot.start_time)
        shift_end = datetime.combine(slot_day, slot.end_time)
        if shift_end <= shift_start:
            shift_end += timedelta(days=1)
        if shift_start < task_end and task_start < shift_end:
            matched.add(assignment.user_id)
    return matched


def eligible_memberships(note, *, from_roster=False, role=None):
    # shortcut: eligibility is checked at save/copy only; recheck each occurrence if future staffing must be guaranteed.
    eligible = Membership.objects.filter(
        pharmacy_id=note.pharmacy_id, is_active=True, status=Membership.Status.ACCEPTED,
    ).exclude(role="CONTACT").select_related("user")
    if role:
        eligible = eligible.filter(role=role)
    if note.is_clinical:
        eligible = eligible.filter(
            role="PHARMACIST", user__pharmacistonboarding__ahpra_verified=True,
            user__pharmacistonboarding__ahpra_expiry_date__gte=max(note.date, timezone.localdate()),
        )
    if from_roster or note.is_clinical:
        eligible = eligible.filter(user_id__in=_rostered_user_ids(note))
    return eligible


def validate_assignees(note, ids, check_ids=None):
    validate_times(note.start_time, note.end_time)
    if len(ids) != len(set(ids)):
        raise ValidationError({"assignee_membership_ids": "Duplicate assignees are not allowed."})
    check_ids = ids if check_ids is None else check_ids
    valid = set(eligible_memberships(note).filter(pk__in=check_ids).values_list("id", flat=True))
    if set(check_ids) != valid:
        raise ValidationError({"assignee_membership_ids": "Assignees must be active accepted pharmacy members; clinical tasks require verified, unexpired, on-duty pharmacists."})


@transaction.atomic
def copy_tasks(*, pharmacy_id, actor, source_from, source_to, day_offset, request_key, task_id=None):
    # A pharmacy lock serializes even the first request, before a receipt exists.
    Pharmacy.objects.select_for_update().get(pk=pharmacy_id)
    inputs = {"source_from": source_from.isoformat(), "source_to": source_to.isoformat(),
              "day_offset": day_offset, "task_id": task_id}
    receipt = OperationAudit.objects.filter(pharmacy_id=pharmacy_id, request_key=request_key).first()
    if receipt:
        if receipt.details["input"] != inputs:
            raise ValidationError({"request_key": "This key was already used with different input."})
        return receipt.details["result"]

    notes = WorkNote.objects.select_for_update().filter(pharmacy_id=pharmacy_id, is_planner_task=True)
    if task_id is not None:
        notes = notes.filter(pk=task_id)
    else:
        notes = notes.filter(Q(date__range=(source_from, source_to)) | Q(recurrence__isnull=False, date__lte=source_to))
    selected = []
    skipped = 0
    for note in notes.order_by("pk"):
        if note.recurrence:
            if not expand_recurrence_dates(note.date, note.recurrence, source_from, source_to):
                continue
            if task_id is None:
                skipped += 1
                continue
        elif not source_from <= note.date <= source_to:
            continue
        selected.append(note)
        if len(selected) > MAX_ITEMS:
            raise ValidationError({"source_from": "Copy supports at most 400 tasks per call."})
    if task_id is not None and not selected:
        raise ValidationError({"task_id": "No planner task occurrence in this pharmacy and source range."})

    created_ids, dropped = [], []
    for note in selected:
        source_date = source_from if note.recurrence else note.date
        try:
            target_date = source_date + timedelta(days=day_offset)
        except OverflowError:
            raise ValidationError({"day_offset": "Destination date is outside the supported range."})
        replica = WorkNote(
            pharmacy_id=pharmacy_id, date=target_date, title=note.title, body=note.body,
            is_planner_task=True, is_clinical=note.is_clinical,
            start_time=note.start_time, end_time=note.end_time,
            notify_on_shift_start=note.notify_on_shift_start, created_by=actor,
        )
        original = list(note.assignees.select_related("membership__user"))
        eligible_ids = set(eligible_memberships(replica).filter(
            pk__in=[a.membership_id for a in original],
        ).values_list("pk", flat=True))
        for assignee in original:
            if assignee.membership_id not in eligible_ids:
                member = assignee.membership
                dropped.append({"task_id": note.pk, "membership_id": member.pk,
                                "name": member.user.get_full_name() or member.user.email})
        replica.save()
        WorkNoteAssignee.objects.bulk_create([
            WorkNoteAssignee(work_note=replica, membership_id=mid) for mid in sorted(eligible_ids)
        ])
        created_ids.append(replica.pk)
    result = {"created": len(created_ids), "task_ids": created_ids,
              "skipped_series": skipped, "dropped_assignees": dropped}
    OperationAudit.objects.create(
        pharmacy_id=pharmacy_id, actor=actor, action="COPIED", request_key=request_key,
        details={"input": inputs, "result": result},
    )
    return result


def validate_completed_task_edit(note, attrs):
    if note.is_planner_task and note.completions.exists():
        if (attrs.get('date', note.date) != note.date
                or attrs.get('recurrence', note.recurrence) != note.recurrence
                or set(attrs.get('assignee_membership_ids', note.assignees.values_list('membership_id', flat=True)))
                != set(note.assignees.values_list('membership_id', flat=True))):
            raise ValidationError('Date, recurrence and assignees cannot change after completion.')


def validate_task_occurrence(note, occurrence_date):
    dates = expand_recurrence_dates(note.date, note.recurrence, occurrence_date, occurrence_date)
    if (note.recurrence and occurrence_date not in dates) or (not note.recurrence and occurrence_date != note.date):
        raise ValidationError({'occurrence_date': 'This date is not an occurrence of the task.'})
