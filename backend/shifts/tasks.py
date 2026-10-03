"""Celery entry points of the shift domain.

send_shift_reminders keeps its deployed name `client_profile.tasks.send_shift_reminders`: the hourly beat entry and
queued messages address it by that name. `client_profile.tasks` re-exports this object; it does not register it again.
"""
import logging
from datetime import timedelta

from celery import shared_task
from django.db.models import Q
from django.utils import timezone

from core.task_queue import async_task
from organizations.timezone import get_pharmacy_timezone
from shifts.emails import build_shift_email_context
from shifts.models import ShiftSlotAssignment

logger = logging.getLogger(__name__)


@shared_task(name="client_profile.tasks.send_shift_reminders", queue="notifications")
def send_shift_reminders():
    now_utc = timezone.now()
    today_utc = now_utc.date()
    date_window = [today_utc + timedelta(days=delta) for delta in (-1, 0, 1, 2)]

    assignments = (
        ShiftSlotAssignment.objects.select_related("shift", "shift__pharmacy", "slot", "user")
        .filter(Q(slot_date__in=date_window) | Q(slot_date__isnull=True))
    )

    pharmacy_assignment_map = {}
    for assignment in assignments:
        pharmacy = assignment.shift.pharmacy
        if pharmacy is None:
            continue
        pharmacy_assignment_map.setdefault(pharmacy.id, {"pharmacy": pharmacy, "assignments": []})[
            "assignments"
        ].append(assignment)

    total_sent = 0
    for entry in pharmacy_assignment_map.values():
        pharmacy = entry["pharmacy"]
        tz = get_pharmacy_timezone(pharmacy)
        local_now = now_utc.astimezone(tz)
        window_start = local_now + timedelta(hours=12)
        window_end = local_now + timedelta(hours=13)

        def _in_window(slot_date, start_time):
            if window_start.date() == window_end.date():
                return slot_date == window_start.date() and window_start.time() <= start_time < window_end.time()
            if slot_date == window_start.date():
                return start_time >= window_start.time()
            if slot_date == window_end.date():
                return start_time < window_end.time()
            return False

        for assignment in entry["assignments"]:
            slot_date = assignment.slot_date or getattr(assignment.slot, "date", None)
            start_time = getattr(assignment.slot, "start_time", None)
            if not slot_date or not start_time:
                continue
            if not _in_window(slot_date, start_time):
                continue

            shift = assignment.shift
            candidate = assignment.user
            slot = assignment.slot
            slot_time = f"{slot_date} {slot.start_time.strftime('%H:%M')}–{slot.end_time.strftime('%H:%M')}"

            async_task(
                'users.tasks.send_async_email',
                subject=f"Reminder: Your upcoming shift at {shift.pharmacy.name}",
                recipient_list=[candidate.email],
                template_name="emails/shift_reminder.html",
                context=build_shift_email_context(
                    shift,
                    user=candidate,
                    role=getattr(candidate, "role", "pharmacist").lower() if hasattr(candidate, "role") else "pharmacist",
                    extra={"slot_time": slot_time}
                ),
                text_template="emails/shift_reminder.txt"
            )
            total_sent += 1

    logger.info(f"[send_shift_reminders] Completed sending reminders. Sent {total_sent} emails.")
