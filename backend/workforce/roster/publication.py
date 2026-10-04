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


def publish_roster_period(roster_period, published_by, force_warnings=False):
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
        if period.status == RosterPeriod.Status.PUBLISHED:
            return period, validate_roster_period(period)

        worker_ids = get_roster_period_assignments(period).values_list("user_id", flat=True)
        list(User.objects.select_for_update().filter(pk__in=worker_ids).order_by("pk"))
        validation = validate_roster_period(period)
        if not validation["is_valid"]:
            error_msgs = [e["message"] for e in validation["errors"]]
            raise ValidationError(f"Cannot publish roster with blocking errors: {'; '.join(error_msgs)}")

        if validation["warnings"] and not force_warnings:
            warning_msgs = [w["message"] for w in validation["warnings"]]
            raise ValidationError(f"Roster has warnings: {'; '.join(warning_msgs)}")

        # Update period
        period.status = RosterPeriod.Status.PUBLISHED
        period.published_at = timezone.now()
        period.published_by = published_by
        period.save(update_fields=["status", "published_at", "published_by", "updated_at"])

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
        period.status = RosterPeriod.Status.DRAFT
        period.save(update_fields=["status", "updated_at"])
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
        if period and period.status in (RosterPeriod.Status.PUBLISHED, RosterPeriod.Status.ARCHIVED):
            published_assignments.append(a)

    return published_assignments
