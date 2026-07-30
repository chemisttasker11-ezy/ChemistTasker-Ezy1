"""
Calendar-related scheduled tasks.
- Birthday event generation (daily)
- Shift-start work note notifications (hourly or 9 AM fallback)
"""
from __future__ import annotations

import logging
from datetime import date, timedelta

from django.apps import apps
from django.db.models import Q
from django.utils import timezone

from .notifications import notify_users
from .timezone_utils import get_pharmacy_timezone
from .utils import get_frontend_dashboard_url
from .models import (
    CalendarEvent,
    Membership,
    Notification,
    Pharmacy,
    ShiftSlotAssignment,
    WorkNote,
    WorkNoteAssignee,
)

logger = logging.getLogger(__name__)


# ============================================================
# Birthday Event Generation
# ============================================================

def generate_birthday_events_for_pharmacy(pharmacy_id: int, target_date: date | None = None) -> int:
    """
    Generate birthday events for all active staff at a pharmacy.
    Uses idempotent get_or_create based on (source_membership, date, source).

    Returns the number of birthday events created.
    """
    if target_date is None:
        target_date = timezone.now().date()

    pharmacy = Pharmacy.objects.filter(id=pharmacy_id).first()
    if not pharmacy:
        return 0

    created_count = 0

    memberships = Membership.objects.filter(pharmacy_id=pharmacy_id, is_active=True).select_related("user")

    for membership in memberships:
        dob = _get_dob_for_membership(membership)
        if not dob:
            continue

        birthday_this_year = dob.replace(year=target_date.year)
        days_until = (birthday_this_year - target_date).days
        if days_until < 0 or days_until > 30:
            continue

        user = membership.user
        title = f"Birthday: {user.get_full_name() or user.email}"

        event, created = CalendarEvent.objects.get_or_create(
            source_membership=membership,
            date=birthday_this_year,
            source=CalendarEvent.Source.BIRTHDAY,
            defaults={
                "pharmacy": pharmacy,
                "title": title,
                "description": f"Happy Birthday to {user.get_full_name()}!",
                "all_day": True,
            },
        )

        if created:
            created_count += 1
            logger.info(f"Created birthday event for membership {membership.id} on {birthday_this_year}")

    return created_count


def _get_dob_for_membership(membership: Membership) -> date | None:
    """
    Get date of birth for a membership by checking linked onboarding records.
    DOB lives on PharmacistOnboarding and OtherStaffOnboarding, not on Membership.
    """
    user = membership.user
    if not user:
        return None

    PharmacistOnboarding = apps.get_model("client_profile", "PharmacistOnboarding")
    pharmacist_onboarding = PharmacistOnboarding.objects.filter(user=user).first()
    if pharmacist_onboarding and pharmacist_onboarding.date_of_birth:
        return pharmacist_onboarding.date_of_birth

    OtherStaffOnboarding = apps.get_model("client_profile", "OtherStaffOnboarding")
    other_onboarding = OtherStaffOnboarding.objects.filter(user=user).first()
    if other_onboarding and other_onboarding.date_of_birth:
        return other_onboarding.date_of_birth

    return None


def generate_all_birthday_events():
    """
    Daily scheduled task to generate birthday events for all pharmacies.
    Run this once per day (e.g., at midnight or early morning).
    """
    logger.info("[generate_all_birthday_events] Starting...")

    today = timezone.now().date()
    total_created = 0

    pharmacy_ids = Pharmacy.objects.values_list("id", flat=True)

    for pharmacy_id in pharmacy_ids:
        try:
            created = generate_birthday_events_for_pharmacy(pharmacy_id, today)
            total_created += created
        except Exception as e:
            logger.error(f"[generate_all_birthday_events] Error for pharmacy {pharmacy_id}: {e}")

    logger.info(f"[generate_all_birthday_events] Completed. Created {total_created} events.")
    return total_created


# ============================================================
# Work Note Notifications
# ============================================================

def _users_already_notified(note_id, user_ids, day_str):
    """
    Return subset of user_ids that already have a WORK_NOTE notification for this note and day.
    """
    if not user_ids:
        return set()
    return set(
        Notification.objects.filter(
            type=Notification.Type.WORK_NOTE,
            user_id__in=user_ids,
            payload__work_note_id=str(note_id),
            payload__date=day_str,
        ).values_list("user_id", flat=True)
    )


def _build_work_note_calendar_url(user, *, pharmacy_id: int, target_date: date, note_id: int) -> str:
    dashboard_url = get_frontend_dashboard_url(user).rstrip("/")
    return f"{dashboard_url}/calendar?pharmacy_id={pharmacy_id}&date={target_date}&note_id={note_id}"


def _send_work_note_notifications(*, user_ids, note, pharmacy_id: int, target_date: date, extra_payload=None) -> int:
    User = apps.get_model("users", "User")
    users = list(User.objects.filter(id__in=set(user_ids), is_active=True).only("id", "role"))
    sent = 0

    for user in users:
        action_url = _build_work_note_calendar_url(
            user,
            pharmacy_id=pharmacy_id,
            target_date=target_date,
            note_id=note.id,
        )
        payload = {
            "work_note_id": note.id,
            "pharmacy_id": pharmacy_id,
            "date": str(target_date),
            "action_url": action_url,
        }
        if extra_payload:
            payload.update(extra_payload)

        notify_users(
            user_ids=[user.id],
            title=f"Work Note: {note.title}",
            body=(note.body or "")[:200],
            notification_type=Notification.Type.WORK_NOTE,
            action_url=action_url,
            payload=payload,
        )
        sent += 1

    return sent


def send_shift_start_work_note_notifications():
    """
    Hourly scheduled task to send work note notifications when shifts start.
    Uses pharmacy timezone to determine the current hour/day locally.
    """
    logger.info("[send_shift_start_work_note_notifications] Starting...")

    now_utc = timezone.now()
    today_utc = now_utc.date()
    date_window = [today_utc + timedelta(days=delta) for delta in (-1, 0, 1)]

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

    notifications_sent = 0

    for pharmacy_id, entry in pharmacy_assignment_map.items():
        pharmacy = entry["pharmacy"]
        tz = get_pharmacy_timezone(pharmacy)
        local_now = now_utc.astimezone(tz)
        local_today = local_now.date()
        local_hour = local_now.hour

        users_starting_now = set()
        for assignment in entry["assignments"]:
            slot_date = assignment.slot_date or getattr(assignment.slot, "date", None)
            if slot_date != local_today:
                continue
            start_time = getattr(assignment.slot, "start_time", None)
            if start_time and start_time.hour == local_hour:
                users_starting_now.add(assignment.user_id)

        if not users_starting_now:
            continue

        work_notes = (
            WorkNote.objects.filter(
                pharmacy_id=pharmacy_id,
                date=local_today,
                notify_on_shift_start=True,
            ).prefetch_related("assignees__membership")
        )

        for note in work_notes:
            recipient_user_ids = set()

            if note.is_general:
                recipient_user_ids = set(users_starting_now)
            else:
                for assignee in note.assignees.all():
                    assignee_user_id = assignee.membership.user_id
                    if assignee_user_id in users_starting_now and assignee.notified_at is None:
                        recipient_user_ids.add(assignee_user_id)

            if not recipient_user_ids:
                continue

            already = _users_already_notified(note.id, recipient_user_ids, str(local_today))
            to_notify = recipient_user_ids - already
            if not to_notify:
                continue

            sent_count = _send_work_note_notifications(
                user_ids=to_notify,
                note=note,
                pharmacy_id=pharmacy_id,
                target_date=local_today,
            )

            WorkNoteAssignee.objects.filter(
                work_note=note,
                membership__user_id__in=to_notify,
                notified_at__isnull=True,
            ).update(notified_at=local_now)

            notifications_sent += sent_count
            logger.info(
                f"Sent work note notification for note {note.id} to {sent_count} users (pharmacy {pharmacy_id})"
            )

    logger.info(f"[send_shift_start_work_note_notifications] Completed. Sent {notifications_sent} notifications.")
    return notifications_sent


def send_9am_work_note_fallback():
    """
    9 AM (pharmacy local) scheduled task as fallback for work note notifications.
    Sends notifications for all work notes for today that haven't been notified yet.
    """
    logger.info("[send_9am_work_note_fallback] Starting...")

    now_utc = timezone.now()
    notifications_sent = 0

    pharmacies = Pharmacy.objects.in_bulk(list(Pharmacy.objects.values_list("id", flat=True)))

    for pharmacy_id, pharmacy in pharmacies.items():
        tz = get_pharmacy_timezone(pharmacy)
        local_now = now_utc.astimezone(tz)
        if local_now.hour != 9:
            continue
        local_today = local_now.date()

        work_notes = (
            WorkNote.objects.filter(
                pharmacy_id=pharmacy_id,
                date=local_today,
                notify_on_shift_start=True,
            ).prefetch_related("assignees__membership__user")
        )

        for note in work_notes:
            recipient_user_ids = set()

            if note.is_general:
                memberships = Membership.objects.filter(pharmacy_id=note.pharmacy_id, is_active=True)
                recipient_user_ids = set(memberships.values_list("user_id", flat=True))
            else:
                for assignee in note.assignees.filter(notified_at__isnull=True):
                    recipient_user_ids.add(assignee.membership.user_id)

            if not recipient_user_ids:
                continue

            already = _users_already_notified(note.id, recipient_user_ids, str(local_today))
            to_notify = recipient_user_ids - already
            if not to_notify:
                continue

            sent_count = _send_work_note_notifications(
                user_ids=to_notify,
                note=note,
                pharmacy_id=note.pharmacy_id,
                target_date=local_today,
                extra_payload={"fallback": True},
            )

            WorkNoteAssignee.objects.filter(
                work_note=note,
                membership__user_id__in=to_notify,
                notified_at__isnull=True,
            ).update(notified_at=local_now)

            notifications_sent += sent_count

    logger.info(f"[send_9am_work_note_fallback] Completed. Sent {notifications_sent} notifications.")
    return notifications_sent
