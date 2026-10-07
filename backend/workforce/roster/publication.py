"""Publishing rosters: publish (with warnings), unpublish, archive, the workers' notification, and the published
roster a worker sees."""
from datetime import timedelta
from django.core.exceptions import ValidationError
from django.db import transaction
from django.utils import timezone
from shifts.models import ShiftSlotAssignment
from workforce.models import RosterPeriod, RosterPublicationAudit
from workforce.roster.permissions import is_authorized_attendance_manager
from workforce.roster.periods import get_roster_period_assignments, validate_roster_period
from workforce.roster.slot_locking import locked_roster_slots, week_start
from workforce.roster.publication_contract import reviewed_validation
from django.contrib.auth import get_user_model

User = get_user_model()


def _notify_roster_publication(period_id, worker_ids, revision):
    from notifications.services import notify_users
    period = RosterPeriod.objects.select_related("pharmacy").get(pk=period_id)
    for worker in User.objects.filter(pk__in=worker_ids):
        role_path = {"PHARMACIST": "pharmacist", "OTHER_STAFF": "otherstaff", "EXPLORER": "explorer"}.get(worker.role, "owner")
        notify_users([worker.pk], title="Roster published",
                     body=f"Your roster at {period.pharmacy.name} for {period.week_start} is ready for acknowledgement.",
                     action_url=f"/dashboard/{role_path}/roster",
                     payload={"roster_period_id": period.pk, "revision_number": revision,
                              "notification_kind": "roster_published"})


def publish_roster_period(roster_period, published_by, force_warnings=False, *, acknowledged_warning_keys=None):
    """
    Atomically validates and publishes a roster period:
    - Verifies published_by is authorized manager for roster_period.pharmacy.
    - Locks RosterPeriod row using select_for_update.
    - Runs validation; blocks publication if errors exist.
    - Updates status to PUBLISHED, sets published_at and published_by.
    - Logs publication audit revision.
    - Marks all assigned slots is_rostered = True.
    """
    if not is_authorized_attendance_manager(published_by, roster_period.pharmacy):
        raise ValidationError("User is not authorized to publish roster for this pharmacy.")

    with transaction.atomic():
        period = RosterPeriod.objects.select_for_update().get(pk=roster_period.pk)

        if period.status == RosterPeriod.Status.ARCHIVED:
            raise ValidationError("Cannot publish an archived roster period.")
        if period.status == RosterPeriod.Status.PUBLISHED and acknowledged_warning_keys is None:
            return period, validate_roster_period(period)

        worker_ids = get_roster_period_assignments(period).values_list("user_id", flat=True)
        list(User.objects.select_for_update().filter(pk__in=worker_ids).order_by("pk"))
        validation = validate_roster_period(period)
        if acknowledged_warning_keys is not None:
            validation = reviewed_validation(validation, acknowledged_warning_keys)
        if not validation["is_valid"]:
            error_msgs = [e["message"] for e in validation["errors"]]
            raise ValidationError(f"Cannot publish roster with blocking errors: {'; '.join(error_msgs)}")

        if validation["warnings"] and not force_warnings and acknowledged_warning_keys is None:
            warning_msgs = [w["message"] for w in validation["warnings"]]
            raise ValidationError(f"Roster has warnings: {'; '.join(warning_msgs)}")

        if period.status == RosterPeriod.Status.PUBLISHED:
            return period, validation

        # Update period
        period.status = RosterPeriod.Status.PUBLISHED
        period.published_at = timezone.now()
        period.published_by = published_by
        period.save(update_fields=["status", "published_at", "published_by", "updated_at"])

        # Whole-week publication explicitly restores the entire validated week.
        # Keep individual withdrawals while the week is draft, then clear them
        # atomically with publication so worker visibility never changes early.
        period.planned_slots.filter(unpublished_at__isnull=False).update(unpublished_at=None)

        # Determine revision number
        last_audit = period.publication_audits.order_by("-revision_number").first()
        rev = (last_audit.revision_number + 1) if last_audit else 1

        # Audit publication
        RosterPublicationAudit.objects.create(
            roster_period=period,
            published_by=published_by,
            revision_number=rev,
            total_assignments=validation["total_assignments"],
            validation_snapshot=validation,
        )

        # Mark assignments as is_rostered
        assignments = get_roster_period_assignments(period)
        assignments.filter(is_rostered=False).update(is_rostered=True)

        worker_ids = list(assignments.values_list("user_id", flat=True).distinct())
        transaction.on_commit(lambda: _notify_roster_publication(period.pk, worker_ids, rev), robust=True)

        return period, validation


def unpublish_roster_period(roster_period, unpublished_by):
    """
    Reverts a published roster period to DRAFT.
    Draft shifts will immediately be hidden from worker views.
    """
    if not is_authorized_attendance_manager(unpublished_by, roster_period.pharmacy):
        raise ValidationError("User is not authorized to unpublish roster for this pharmacy.")

    with transaction.atomic():
        period = RosterPeriod.objects.select_for_update().get(pk=roster_period.pk)
        if period.status == RosterPeriod.Status.ARCHIVED:
            raise ValidationError("Cannot unpublish an archived roster period.")
        if period.status == RosterPeriod.Status.DRAFT:
            return period
        period.status = RosterPeriod.Status.DRAFT
        period.save(update_fields=["status", "updated_at"])
        # A previous review must not silently undo another manager's withdrawal.
        from workforce.roster.revisions import bump_roster_revision
        bump_roster_revision(period.pk)
        return period


def archive_roster_period(roster_period, user):
    if not is_authorized_attendance_manager(user, roster_period.pharmacy):
        raise ValidationError("User is not authorized to archive this roster.")
    with transaction.atomic():
        period = RosterPeriod.objects.select_for_update().get(pk=roster_period.pk)
        if period.status == RosterPeriod.Status.DRAFT:
            raise ValidationError("Publish the roster before archiving it.")
        period.status = RosterPeriod.Status.ARCHIVED
        period.save(update_fields=["status", "updated_at"])
        return period


def get_worker_published_roster(user, start_date=None, end_date=None):
    """
    Retrieves published roster assignments for a worker.
    CRITICAL: DRAFT assignments are NEVER returned. Only shifts whose
    pharmacy's RosterPeriod for that week is in PUBLISHED status are returned.
    """
    qs = ShiftSlotAssignment.objects.filter(
        user=user,
        is_rostered=True,
    ).select_related("slot", "shift", "shift__pharmacy")

    if start_date:
        qs = qs.filter(slot_date__gte=start_date)
    if end_date:
        qs = qs.filter(slot_date__lte=end_date)

    assignments = list(qs.order_by("slot_date", "slot__start_time"))
    if not assignments:
        return []

    # Filter to only those whose pharmacy week is PUBLISHED
    published_assignments = []
    # Cache periods lookup
    period_cache = {}

    for a in assignments:
        if not a.slot_date:
            continue
        # Find Monday of that week
        monday = a.slot_date - timedelta(days=a.slot_date.weekday())
        key = (a.shift.pharmacy_id, monday)

        if key not in period_cache:
            period = RosterPeriod.objects.filter(
                pharmacy_id=a.shift.pharmacy_id,
                week_start=monday,
            ).first()
            period_cache[key] = period

        period = period_cache[key]
        if a.slot.unpublished_at:
            continue  # taken back to draft for editing; shown again once republished
        if period and period.status in (RosterPeriod.Status.PUBLISHED, RosterPeriod.Status.ARCHIVED):
            published_assignments.append(a)

    return published_assignments


# ---- One shift in a published week: unpublish, edit, republish (owner decision 2026-10-04) ----

REPUBLISH_NOTIFY_CHOICES = ("worker", "team", "none")


def _authorize_shift_change(user, slot):
    from django.core.exceptions import PermissionDenied

    if not is_authorized_attendance_manager(user, slot.shift.pharmacy):
        raise PermissionDenied("You are not authorized to change rosters for this pharmacy.")


def _slot_worker_ids(slot):
    return list(
        ShiftSlotAssignment.objects.filter(slot=slot, is_rostered=True)
        .values_list("user_id", flat=True)
        .distinct()
    )


def _slot_audit_snapshot(slot):
    return {
        "date": str(slot.date),
        "start_time": str(slot.start_time),
        "end_time": str(slot.end_time),
        "roster_period_id": slot.roster_period_id,
        "planned_break_minutes": slot.planned_break_minutes,
        "role_needed": slot.shift.role_needed,
    }


def unpublish_roster_shift(slot, user):
    """Take one shift back to editable draft while leaving the week published."""
    from shifts.models import ShiftSlot, _published_period_for_slot
    from workforce.models import RosterActionAudit
    from workforce.roster.revisions import bump_roster_revision

    _authorize_shift_change(user, slot)
    with locked_roster_slots(slot.shift_id, user, target_dates={slot.pk: None}) as graph:
        _shift, slots, _assignments, periods, _workers = graph
        locked = slots[slot.pk]
        _authorize_shift_change(user, locked)
        if locked.unpublished_at:
            return locked
        candidate = _published_period_for_slot(locked)
        period = periods.get(candidate.pk) if candidate else None
        if period is None or period.status != RosterPeriod.Status.PUBLISHED:
            raise ValidationError("Only a shift in a published roster week needs unpublishing; edit it directly.")
        before = _slot_audit_snapshot(locked)
        now = timezone.now()
        ShiftSlot.objects.filter(pk=locked.pk).update(unpublished_at=now, roster_period=period)
        locked.unpublished_at = now
        locked.roster_period = period
        RosterActionAudit.objects.create(
            pharmacy=locked.shift.pharmacy,
            action_type=RosterActionAudit.ActionType.SHIFT_UNPUBLISHED,
            performed_by=user,
            details={"slot_id": locked.pk, "period_id": period.pk,
                     "worker_ids": _slot_worker_ids(locked), "slot_before": before},
        )
        bump_roster_revision(period.pk)
        return locked


def republish_roster_shift(slot, user, notify="worker"):
    """Republish the locked current slot, optionally notifying worker/team."""
    from notifications.services import notify_users
    from shifts.models import ShiftSlot
    from workforce.models import RosterActionAudit
    from workforce.roster.revisions import bump_roster_revision
    from workforce.roster.validation import worker_issues

    if notify not in REPUBLISH_NOTIFY_CHOICES:
        raise ValidationError("notify must be one of: worker, team, none.")
    _authorize_shift_change(user, slot)
    with locked_roster_slots(slot.shift_id, user, target_dates={slot.pk: None}) as graph:
        _shift, slots, assignments, periods, _workers = graph
        locked = slots[slot.pk]
        _authorize_shift_change(user, locked)
        if not locked.unpublished_at:
            raise ValidationError("This shift is not unpublished.")
        pharmacy = locked.shift.pharmacy
        period = next((item for item in periods.values()
                       if item.pharmacy_id == pharmacy.pk
                       and item.week_start == week_start(locked.date)
                       and item.status == RosterPeriod.Status.PUBLISHED), None)
        if period is None:
            raise ValidationError(
                "This shift must belong to a published roster week before it can be republished."
            )
        source_period = periods.get(locked.roster_period_id)
        if source_period and source_period.status == RosterPeriod.Status.ARCHIVED:
            raise ValidationError("Archived roster slots cannot be republished through the edit workflow.")
        for assignment in assignments:
            if assignment.slot_id != locked.pk or not assignment.is_rostered:
                continue
            if assignment.slot_date != locked.date:
                raise ValidationError("Assignment dates do not match this slot. Save the roster edit before republishing.")
            errors, _warnings = worker_issues(
                pharmacy, assignment.user, locked.date, locked.start_time, locked.end_time,
                locked.shift.role_needed, exclude_assignment_id=assignment.pk,
            )
            if errors:
                raise ValidationError({"slots": [issue["message"] for issue in errors]})
        # The period row is locked before the slot, shared with whole-week
        # publication/unpublication and in-place edits. Preserve explicit ownership.
        ShiftSlot.objects.filter(pk=locked.pk).update(unpublished_at=None, roster_period=period)
        locked.unpublished_at = None
        locked.roster_period = period
        slot_workers = _slot_worker_ids(locked)
        if notify == "worker":
            recipients = slot_workers
        elif notify == "team":
            recipients = list(get_roster_period_assignments(period).values_list("user_id", flat=True).distinct())
        else:
            recipients = []
        RosterActionAudit.objects.create(
            pharmacy=pharmacy,
            action_type=RosterActionAudit.ActionType.SHIFT_REPUBLISHED,
            performed_by=user,
            details={
                "slot_id": locked.pk,
                "period_id": period.pk,
                "notify": notify,
                "notified_user_ids": recipients,
                "slot_after": _slot_audit_snapshot(locked),
            },
        )
        affected_period_ids = {period.pk}
        if source_period:
            affected_period_ids.add(source_period.pk)
        for period_id in sorted(affected_period_ids):
            bump_roster_revision(period_id)

        def _notify():
            for worker in User.objects.filter(pk__in=recipients):
                role_path = {"PHARMACIST": "pharmacist", "OTHER_STAFF": "otherstaff", "EXPLORER": "explorer"}.get(
                    worker.role, "owner"
                )
                body = (
                    f"Your shift at {pharmacy.name} on {locked.date} was updated."
                    if worker.pk in slot_workers
                    else f"The roster at {pharmacy.name} for the week of {period.week_start} was updated."
                )
                notify_users(
                    [worker.pk],
                    title="Roster updated",
                    body=body,
                    action_url=f"/dashboard/{role_path}/roster",
                    payload={"slot_id": locked.pk, "notification_kind": "roster_shift_republished"},
                )

        if recipients:
            transaction.on_commit(_notify, robust=True)
        return locked
