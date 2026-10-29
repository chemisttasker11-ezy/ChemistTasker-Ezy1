from __future__ import annotations

import logging
from datetime import timedelta

from django.core.exceptions import ValidationError
from django.db import transaction
from django.db.models.signals import post_delete, post_save, pre_delete, pre_save
from django.dispatch import receiver

from shifts.models import Shift, ShiftSlot, ShiftSlotAssignment
from shifts.events import payroll_activated
from workforce.models import RosterPeriod
from attendance.models import AttendanceCorrection, AttendanceEvent, AttendanceSession, ProvisionalAttendance

from .models import EmploymentEngagement, MembershipWorkSettings, Timesheet, TimesheetPeriod, WorkforceLeaveRequest
from workforce.roster.revisions import bump_for_assignment, bump_roster_revision
from .tasks import rebuild_timesheet_task

log = logging.getLogger("workforce.signals")


def _enqueue(pharmacy_id, user_id, work_date, last_date=None):
    if not pharmacy_id or not user_id or not work_date:
        return
    period_ids = list(
        TimesheetPeriod.objects.filter(
            pharmacy_id=pharmacy_id,
            start_date__lte=last_date or work_date,
            end_date__gte=work_date,
        ).exclude(status=TimesheetPeriod.Status.LOCKED).values_list("pk", flat=True)
    )
    if not period_ids:
        return
    Timesheet.objects.filter(period_id__in=period_ids, user_id=user_id).update(needs_rebuild=True)
    for period_id in period_ids:
        transaction.on_commit(
            lambda pid=period_id, uid=user_id: rebuild_timesheet_task.delay(pid, uid),
            robust=True,
        )


def _session_dates(session):
    from organizations.timezone import get_pharmacy_timezone
    # Timesheets clip a session into every period it touches, so invalidate its whole raw and corrected span.
    moments = [session.started_at, session.ended_at, *AttendanceCorrection.objects.filter(
        original_event__session=session,
    ).values_list("corrected_timestamp", flat=True)]
    moments = [moment for moment in moments if moment]
    try:
        tz = get_pharmacy_timezone(session.pharmacy)
        dates = [moment.astimezone(tz).date() for moment in moments]
    except Exception:
        dates = [moment.date() for moment in moments]
    return min(dates), max(dates)


@receiver(payroll_activated)
def payroll_settlement_changed(sender, pharmacy_id, user_id, work_dates, **kwargs):
    # This receiver participates in the activation transaction: a failed durable
    # invalidation must roll it back. Queue dispatch is already robust/on-commit.
    if not work_dates:
        return
    # Freeze, correction and settlement changes take the same period locks.
    # NO KEY UPDATE still permits the FK checks made by projection invalidation.
    periods = list(TimesheetPeriod.objects.select_for_update(of=("self",), no_key=True).filter(
        pharmacy_id=pharmacy_id, start_date__lte=max(work_dates), end_date__gte=min(work_dates),
    ).order_by("pk"))
    locked = [period.pk for period in periods if (
        period.status == TimesheetPeriod.Status.LOCKED
        and any(period.start_date <= work_date <= period.end_date for work_date in work_dates)
    )]
    if locked:
        raise ValidationError(
            "Correct the locked timesheet period with an audit reason before activating payroll, then recalculate and review it.",
            code="locked_payroll_period", params={"period_ids": locked},
        )
    for work_date in work_dates:
        _enqueue(pharmacy_id, user_id, work_date)


@receiver(post_save, sender=AttendanceSession)
def attendance_session_changed(sender, instance, **kwargs):
    _enqueue(instance.pharmacy_id, instance.user_id, *_session_dates(instance))


@receiver(post_save, sender=AttendanceEvent)
def attendance_event_changed(sender, instance, **kwargs):
    session = instance.session
    _enqueue(session.pharmacy_id, session.user_id, *_session_dates(session))


@receiver(post_save, sender=AttendanceCorrection)
def attendance_correction_changed(sender, instance, **kwargs):
    session = instance.original_event.session
    _enqueue(session.pharmacy_id, session.user_id, *_session_dates(session))


@receiver(post_save, sender=ProvisionalAttendance)
def provisional_attendance_changed(sender, instance, **kwargs):
    session = instance.session
    _enqueue(session.pharmacy_id, session.user_id, *_session_dates(session))


def _assignment_changed(instance):
    try:
        if instance.is_rostered:
            bump_for_assignment(instance)
        work_date = instance.slot_date or instance.slot.date
        _enqueue(instance.shift.pharmacy_id, instance.user_id, work_date)
    except Exception:
        log.exception("Failed to invalidate workforce projections for assignment %s", getattr(instance, "pk", None))


@receiver(pre_delete, sender=ShiftSlotAssignment)
def assignment_before_delete(sender, instance, **kwargs):
    try:
        if instance.is_rostered:
            work_date = instance.slot_date or instance.slot.date
            period = _period_for_assignment = RosterPeriod.objects.filter(
                pharmacy_id=instance.shift.pharmacy_id,
                week_start=work_date - timedelta(days=work_date.weekday()),
            ).first()
            instance._workforce_period_id = _period_for_assignment.pk if _period_for_assignment else None
    except Exception:
        instance._workforce_period_id = None


@receiver(post_save, sender=ShiftSlotAssignment)
def assignment_saved(sender, instance, **kwargs):
    _assignment_changed(instance)


@receiver(post_delete, sender=ShiftSlotAssignment)
def assignment_deleted(sender, instance, **kwargs):
    period_id = getattr(instance, "_workforce_period_id", None)
    if period_id:
        try:
            bump_roster_revision(period_id)
        except Exception:
            log.exception("Failed to bump deleted assignment roster period %s", period_id)
    try:
        work_date = instance.slot_date or instance.slot.date
        _enqueue(instance.shift.pharmacy_id, instance.user_id, work_date)
    except Exception:
        log.exception("Failed to invalidate deleted assignment %s", getattr(instance, "pk", None))




def _bump_period_for_slot(slot):
    try:
        work_date = slot.date
        pharmacy_id = slot.shift.pharmacy_id
        period = RosterPeriod.objects.filter(
            pharmacy_id=pharmacy_id,
            week_start=work_date - timedelta(days=work_date.weekday()),
        ).first()
        if period and ShiftSlotAssignment.objects.filter(slot=slot, is_rostered=True).exists():
            bump_roster_revision(period.pk)
    except Exception:
        log.exception("Failed to bump roster revision for slot %s", getattr(slot, "pk", None))


@receiver(post_save, sender=ShiftSlot)
@receiver(post_delete, sender=ShiftSlot)
def roster_slot_changed(sender, instance, **kwargs):
    _bump_period_for_slot(instance)


@receiver(post_save, sender=Shift)
def roster_shift_changed(sender, instance, **kwargs):
    try:
        period_ids = set()
        for assignment in ShiftSlotAssignment.objects.filter(shift=instance, is_rostered=True).select_related("slot"):
            work_date = assignment.slot_date or assignment.slot.date
            period = RosterPeriod.objects.filter(
                pharmacy_id=instance.pharmacy_id,
                week_start=work_date - timedelta(days=work_date.weekday()),
            ).first()
            if period:
                period_ids.add(period.pk)
        for period_id in period_ids:
            bump_roster_revision(period_id)
    except Exception:
        log.exception("Failed to bump roster revision for shift %s", getattr(instance, "pk", None))


@receiver(post_save, sender=WorkforceLeaveRequest)
@receiver(post_delete, sender=WorkforceLeaveRequest)
def workforce_leave_changed(sender, instance, **kwargs):
    from organizations.timezone import get_pharmacy_timezone

    try:
        tz = get_pharmacy_timezone(instance.pharmacy)
        current = instance.start_at.astimezone(tz).date()
        end = instance.end_at.astimezone(tz).date()
    except Exception:
        current = instance.start_at.date()
        end = instance.end_at.date()

    while current <= end:
        _enqueue(instance.pharmacy_id, instance.user_id, current)
        current += timedelta(days=1)

    if instance.slot_assignment_id:
        try:
            assignment = instance.slot_assignment
            if assignment and assignment.is_rostered:
                bump_for_assignment(assignment)
        except Exception:
            log.exception(
                "Failed to bump roster revision for leave %s",
                getattr(instance, "pk", None),
            )


@receiver(post_save, sender=MembershipWorkSettings)
def work_settings_changed(sender, instance, **kwargs):
    membership = instance.membership
    for period_id in TimesheetPeriod.objects.filter(
        pharmacy_id=membership.pharmacy_id,
    ).exclude(status=TimesheetPeriod.Status.LOCKED).values_list("pk", flat=True):
        Timesheet.objects.filter(period_id=period_id, user_id=membership.user_id).update(needs_rebuild=True)
        transaction.on_commit(
            lambda pid=period_id, uid=membership.user_id: rebuild_timesheet_task.delay(pid, uid),
            robust=True,
        )


@receiver(pre_save, sender=EmploymentEngagement)
def employment_engagement_before_save(sender, instance, using, **kwargs):
    instance._previous_effective_from = (
        sender.objects.using(using).filter(pk=instance.pk).values_list("effective_from", flat=True).first()
        if instance.pk else None
    )


@receiver(post_save, sender=EmploymentEngagement)
def employment_engagement_changed(sender, instance, **kwargs):
    membership = instance.membership
    affected_from = min(instance.effective_from, getattr(instance, "_previous_effective_from", None) or instance.effective_from)
    for period_id in TimesheetPeriod.objects.filter(
        pharmacy_id=membership.pharmacy_id,
        end_date__gte=affected_from,
    ).exclude(status=TimesheetPeriod.Status.LOCKED).values_list("pk", flat=True):
        # Approved timesheets keep the terms that were reviewed; locked periods are excluded above.
        if Timesheet.objects.filter(period_id=period_id, user_id=membership.user_id).exclude(
            status=Timesheet.Status.APPROVED,
        ).update(needs_rebuild=True):
            transaction.on_commit(
                lambda pid=period_id, uid=membership.user_id: rebuild_timesheet_task.delay(pid, uid),
                robust=True,
            )


@receiver(post_save, sender=RosterPeriod)
def roster_period_changed(sender, instance, **kwargs):
    # Publication/unpublication changes which roster is authoritative for comparison.
    for period in TimesheetPeriod.objects.filter(
        pharmacy_id=instance.pharmacy_id,
        start_date__lte=instance.week_end,
        end_date__gte=instance.week_start,
    ).exclude(status=TimesheetPeriod.Status.LOCKED):
        Timesheet.objects.filter(period=period).update(needs_rebuild=True)
        for user_id in period.timesheets.values_list("user_id", flat=True):
            transaction.on_commit(
                lambda pid=period.pk, uid=user_id: rebuild_timesheet_task.delay(pid, uid),
                robust=True,
            )
