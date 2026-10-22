"""Role- and roster-aware pharmacy operations publication.

Published plan items are WorkNotes, never a shadow task calendar. Validation
and writes take place inside a single row-locked database transaction.
"""
from datetime import date, time, datetime, timedelta
from calendar import monthrange

from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from memberships.models import Membership
from organizations.access import managed_pharmacies
from shifts.models import ShiftSlotAssignment
from team_calendar.models import WorkNote, WorkNoteAssignee
from team_calendar.operations_models import OperationAudit, OperationTask, OperationPlan

VALID_AUDIENCES = {"NAMED", "ON_DUTY", "ROLE_ON_DUTY", "TEAM_POOL", "EVERY_ON_DUTY"}
ROLES = {"PHARMACIST", "INTERN", "TECHNICIAN", "ASSISTANT", "STUDENT"}
PERIODS = {"daily", "weekly", "monthly", "training", "campaign", "other"}
TARGET_KINDS = {"operational", "clinical", "safety"}
MAX_WINDOW_DAYS = 93
MAX_ITEMS = 400


def check_window(start, end):
    if end < start or (end - start).days > MAX_WINDOW_DAYS:
        raise ValidationError({"ends_on": "End must follow start and span at most 94 days."})


def validate_checklist(steps):
    if not isinstance(steps, list) or len(steps) > 50:
        raise ValidationError({"checklist": "Provide up to 50 checklist steps."})
    ids = set()
    for step in steps:
        if (not isinstance(step, dict) or not isinstance(step.get("id"), str)
                or not (1 <= len(step["id"]) <= 64)
                or not isinstance(step.get("label"), str)
                or not step["label"].strip() or len(step["label"]) > 255
                or step["id"] in ids or not isinstance(step.get("required", True), bool)):
            raise ValidationError({"checklist": "Steps need unique IDs, labels and a required flag."})
        ids.add(step["id"])
    return steps


def check_item(item):
    plan = item.plan
    if not plan.starts_on <= item.date <= plan.ends_on:
        raise ValidationError({"date": "Task date is outside the plan."})
    if item.audience not in VALID_AUDIENCES:
        raise ValidationError({"audience": "Unknown audience mode."})
    if not isinstance(item.role_codes, list) or any(r not in ROLES for r in item.role_codes):
        raise ValidationError({"role_codes": "Use supported pharmacy membership roles."})
    if not isinstance(item.membership_ids, list) or any(type(i) is not int or i < 1 for i in item.membership_ids):
        raise ValidationError({"membership_ids": "Use valid membership IDs."})
    if len(set(item.membership_ids)) != len(item.membership_ids):
        raise ValidationError({"membership_ids": "Duplicate memberships are not allowed."})
    if item.start_time and item.end_time and item.start_time >= item.end_time:
        raise ValidationError({"end_time": "End time must follow start time."})
    if item.target_kind not in TARGET_KINDS:
        raise ValidationError({"target_kind": "Invalid KPI classification."})
    if item.target_kind == "clinical" and item.role_codes and item.role_codes != ["PHARMACIST"]:
        raise ValidationError({"role_codes": "Clinical-service duties must require a pharmacist."})
    validate_checklist(item.checklist)


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
        shift__pharmacy_id=item.plan.pharmacy_id, is_rostered=True,
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


def resolve_memberships(item):
    """Use pharmacy-scoped Membership IDs, never direct global user IDs."""
    check_item(item)
    eligible = Membership.objects.filter(
        pharmacy_id=item.plan.pharmacy_id, is_active=True, status=Membership.Status.ACCEPTED,
    ).exclude(role="CONTACT").select_related("user")
    if item.role_codes:
        eligible = eligible.filter(role__in=item.role_codes)
    if item.target_kind == "clinical":
        # Identity-only role is insufficient for clinical services. Require the
        # existing manual AHPRA verification and a non-expired known registration.
        # Vaccination and other service-specific credentials remain supervisor SOP checks.
        eligible = eligible.filter(
            role="PHARMACIST",
            user__pharmacistonboarding__ahpra_verified=True,
            user__pharmacistonboarding__ahpra_expiry_date__gte=max(item.date, timezone.localdate()),
        )
    if item.audience == "NAMED":
        if not item.membership_ids:
            return [], ["Select at least one staff member."]
        selected = set(item.membership_ids)
        chosen = list(eligible.filter(id__in=selected))
        if len(chosen) != len(selected):
            return [], ["A nominated member is inactive, outside this pharmacy, or lacks required eligibility or current registration."]
        if item.target_kind == "clinical":
            rostered = _rostered_user_ids(item)
            if not {member.user_id for member in chosen}.issubset(rostered):
                return [], ["Clinical service work must be covered by a published on-duty pharmacist roster."]
        return chosen, []
    rostered = _rostered_user_ids(item)
    if not rostered:
        return [], ["No matching staff are assigned to a published roster at the selected date and time."]
    matched = list(eligible.filter(user_id__in=rostered))
    if not matched:
        return [], ["No eligible, currently authorised staff with a published roster match."]
    return matched, []


def preflight(plan):
    if plan.items.count() > MAX_ITEMS:
        raise ValidationError({"items": "A plan supports up to 400 dated tasks."})
    if not plan.items.exists():
        raise ValidationError({"items": "Add at least one task before publishing."})
    check_window(plan.starts_on, plan.ends_on)
    resolved, blockers = {}, []
    for item in plan.items.order_by("date", "id"):
        try:
            chosen, problems = resolve_memberships(item)
        except ValidationError as exc:
            chosen, problems = [], [str(exc.detail)]
        if problems:
            blockers.extend({"task_id": item.id, "date": str(item.date), "message": message}
                            for message in problems)
        resolved[item.id] = chosen
    return {"ready": not blockers, "blockers": blockers, "assignments": [
        {"task_id": task_id, "membership_ids": [member.id for member in members]}
        for task_id, members in resolved.items()
    ]}, resolved


@transaction.atomic
def publish_plan(plan_id, actor, *, revision):
    plan = OperationPlan.objects.select_for_update().get(pk=plan_id)
    if plan.status == "PUBLISHED":
        return plan, {"ready": True, "already_published": True, "blockers": [], "assignments": []}
    if plan.revision != revision:
        raise ValidationError({"revision": "Plan changed; reload and review before publishing."})
    review, resolved = preflight(plan)
    if not review["ready"]:
        raise ValidationError({"preflight": review})
    for item in plan.items.select_for_update().order_by("date", "id"):
        if item.calendar_note_id:
            raise ValidationError({"items": "Draft already contains published calendar work."})
        note = WorkNote.objects.create(
            pharmacy_id=plan.pharmacy_id, date=item.date,
            title=item.title, body=item.description, status=WorkNote.Status.OPEN,
            notify_on_shift_start=True, is_general=False, created_by=actor,
        )
        WorkNoteAssignee.objects.bulk_create([
            WorkNoteAssignee(work_note=note, membership=membership)
            for membership in resolved[item.id]
        ])
        item.calendar_note = note
        item.save(update_fields=["calendar_note"])
    plan.status = "PUBLISHED"
    plan.published_at = timezone.now()
    plan.published_by = actor
    plan.save(update_fields=["status", "published_at", "published_by", "updated_at"])
    OperationAudit.objects.create(plan=plan, actor=actor, action="PUBLISHED",
                                  details={"revision": revision, "task_count": plan.items.count()})
    return plan, review


def _first_weekday(year, month):
    d = date(year, month, 1)
    while d.weekday() > 4:
        d += timedelta(days=1)
    return d


def _last_weekday(year, month):
    d = date(year, month, monthrange(year, month)[1])
    while d.weekday() > 4:
        d -= timedelta(days=1)
    return d


def template_dates(recurrence, start, end):
    """Apply a recurring template only inside a bounded explicit plan period.

    Weekday-of-month is intentional: Australian public holidays require a
    state-specific calendar, so we do not pretend Mon-Fri means business day.
    """
    check_window(start, end)
    freq = str((recurrence or {}).get("freq", "ONCE")).upper()
    allowed = {"ONCE", "DAILY", "WEEKLY", "MONTHLY", "FIRST_DAY_MONTH", "MONTHLY_28",
               "FIRST_WEEKDAY_MONTH", "LAST_WEEKDAY_MONTH", "FIRST_BUSINESS_DAY",
               "LAST_BUSINESS_DAY", "YEARLY"}
    if freq not in allowed:
        raise ValidationError({"recurrence": "Unsupported schedule."})
    weekdays = (recurrence or {}).get("byweekday", [start.weekday()])
    if not isinstance(weekdays, list) or any(type(d) is not int or d not in range(7) for d in weekdays):
        raise ValidationError({"recurrence": "Weekdays must be 0 through 6."})
    out = []
    current = start
    while current <= end:
        last = monthrange(current.year, current.month)[1]
        is_date = (
            (freq == "ONCE" and current == start)
            or freq == "DAILY"
            or (freq == "WEEKLY" and current.weekday() in weekdays)
            or (freq == "MONTHLY" and current.day == min(start.day, last))
            or (freq == "FIRST_DAY_MONTH" and current.day == 1)
            or (freq == "MONTHLY_28" and current.day == min(28, last))
            or (freq in {"FIRST_WEEKDAY_MONTH", "FIRST_BUSINESS_DAY"}
                and current == _first_weekday(current.year, current.month))
            or (freq in {"LAST_WEEKDAY_MONTH", "LAST_BUSINESS_DAY"}
                and current == _last_weekday(current.year, current.month))
            or (freq == "YEARLY" and (current.month, current.day) == (start.month, start.day))
        )
        if is_date:
            out.append(current)
        current += timedelta(days=1)
    return out


@transaction.atomic
def apply_template(plan, template, actor):
    if plan.status != "DRAFT":
        raise ValidationError("Published plans cannot be modified.")
    if not (template.pharmacy_id == plan.pharmacy_id or (
        template.organization_id is not None and template.organization_id == plan.pharmacy.organization_id
    )):
        raise ValidationError("This template is not available to the pharmacy.")
    dates = template_dates(template.recurrence, plan.starts_on, plan.ends_on)
    if plan.items.count() + len(dates) > MAX_ITEMS:
        raise ValidationError("Plan would exceed the task limit.")
    created = []
    for day in dates:
        task, inserted = OperationTask.objects.get_or_create(
            plan=plan, template=template, date=day,
            defaults={
                "title": template.name, "description": template.description, "area": template.area,
                "audience": template.audience, "role_codes": template.role_codes,
                "checklist": template.checklist, "requires_verification": template.requires_verification,
                "target_value": template.target_value, "target_unit": template.target_unit,
                "target_kind": template.target_kind, "training_url": template.training_url,
            },
        )
        if inserted:
            created.append(task)
    if created:
        plan.revision += 1
        plan.save(update_fields=["revision", "updated_at"])
        OperationAudit.objects.create(
            plan=plan, actor=actor, action="TEMPLATE_APPLIED",
            details={"template_id": template.id, "dates": [str(x.date) for x in created]},
        )
    return created
