"""Notification services: create/deliver notifications (database, WebSocket, Expo push) and mark them read."""
from __future__ import annotations

from typing import Iterable, Optional, Sequence
import logging
import requests
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.contrib.auth import get_user_model
from django.db import transaction
from django.utils import timezone

from notifications.models import Notification, NotificationPushPreference
from users.models import DeviceToken

USER_GROUP_FMT = "user.{user_id}"
logger = logging.getLogger(__name__)


def _serialize_notification(notification: Notification) -> dict:
    return {
        "id": notification.id,
        "type": notification.type,
        "title": notification.title,
        "body": notification.body,
        "payload": notification.payload or {},
        "action_url": notification.action_url or "",
        "created_at": notification.created_at.isoformat(),
        "read_at": notification.read_at.isoformat() if notification.read_at else None,
    }


def _broadcast(user_id: int, event_type: str, payload: dict):
    try:
        layer = get_channel_layer()
        if layer:
            async_to_sync(layer.group_send)(
                USER_GROUP_FMT.format(user_id=user_id),
                {"type": event_type, **payload},
            )
    except Exception:
        # Socket delivery is disposable; durable writes and counters are not.
        logger.exception("WebSocket event %s unavailable for user %s", event_type, user_id)



def _send_expo_push(tokens: Sequence[str], title: str, body: str, data: Optional[dict] = None) -> None:
    if not tokens:
        return
    payloads = []
    for token in tokens:
        payloads.append({
            "to": token,
            "title": title,
            "body": body,
            "data": data or {},
            "sound": "default",
        })
    try:
        response = requests.post(
            "https://exp.host/--/api/v2/push/send",
            json=payloads,
            timeout=5,
        )
        # Push is a disposable transport; record failure without exposing tokens or
        # changing durable in-app notifications, and without automatic duplicate retries.
        if not (200 <= response.status_code < 300):
            logger.warning("Expo push transport returned HTTP %s for %d devices",
                           response.status_code, len(payloads))
            return
        try:
            tickets = response.json()
        except ValueError:
            logger.warning("Expo push transport returned invalid ticket JSON for %d devices", len(payloads))
            return
        rows = tickets.get("data") if isinstance(tickets, dict) else None
        if isinstance(rows, list):
            rejected = sum(isinstance(item, dict) and item.get("status") == "error" for item in rows)
            if rejected:
                logger.warning("Expo push transport rejected %d of %d tickets", rejected, len(payloads))
    except Exception:
        # An outbound push failure cannot roll back notification state or another recipient.
        logger.warning("Expo push transport unavailable for %d devices", len(payloads))


def notify_users(
    user_ids: Iterable[int],
    *,
    title: str,
    body: str = "",
    notification_type: str = Notification.Type.TASK,
    action_url: Optional[str] = None,
    payload: Optional[dict] = None,
    deliver_on_commit: bool = False,
    ) -> None:
    payload = payload or {}
    users = list(
        get_user_model()
        .objects.filter(id__in=set(user_ids), is_active=True)
        .only("id")
    )
    for user in users:
        notification = Notification.objects.create(
            user=user,
            type=notification_type,
            title=title,
            body=body,
            action_url=action_url or "",
            payload=payload,
        )
        if deliver_on_commit:
            transaction.on_commit(lambda notification=notification: _deliver_notification(notification), robust=True)
        else:
            _deliver_notification(notification)


def push_allowed_for_notification(notification: Notification, now=None) -> bool:
    """Push-only policy: durable in-app notification and counters never change."""
    pref = NotificationPushPreference.objects.filter(user_id=notification.user_id).first()
    if pref is None:
        return True
    field = {
        Notification.Type.MESSAGE: "push_messages",
        Notification.Type.TASK: "push_tasks",
        Notification.Type.WORK_NOTE: "push_work_notes",
        Notification.Type.ALERT: "push_alerts",
    }.get(notification.type)
    if field and not getattr(pref, field):
        return False
    # Alerts bypass quiet hours, but an explicit alert-category opt-out is honoured.
    if notification.type == Notification.Type.ALERT or not pref.quiet_hours_enabled:
        return True
    try:
        local = timezone.localtime(now or timezone.now(), ZoneInfo(pref.time_zone)).time()
    except (ZoneInfoNotFoundError, ValueError):
        logger.warning("Invalid push preference timezone for user %s", notification.user_id)
        return False
    start, end = pref.quiet_start, pref.quiet_end
    if start == end:
        return True
    inside = (start <= local < end) if start < end else (local >= start or local < end)
    return not inside


def _deliver_notification(notification: Notification) -> None:
    user = get_user_model().objects.get(pk=notification.user_id)
    if not Notification.objects.visible_to(user).filter(pk=notification.pk).exists():
        return
    payload = {"notification": _serialize_notification(notification)}
    try:
        _broadcast(notification.user_id, "notification.created", payload)
    except Exception:
        logger.exception("Notification %s WebSocket delivery failed", notification.pk)
    # Read durable state outside the transport catch, including for a PostgreSQL-backed channel layer.
    unread = Notification.objects.visible_to(user).unread().count()
    try:
        _broadcast(notification.user_id, "notification.counter", {"unread": unread})
    except Exception:
        logger.exception("Notification %s counter delivery failed", notification.pk)
    if push_allowed_for_notification(notification):
        tokens = list(
            DeviceToken.objects.filter(user_id=notification.user_id, active=True).values_list("token", flat=True)
        )
        _send_expo_push(tokens, title=notification.title, body=notification.body, data=notification.payload or {})


def mark_notifications_read(user, notification_ids: Optional[Sequence[int]] = None) -> int:
    qs = Notification.objects.visible_to(user).unread()
    if notification_ids:
        qs = qs.filter(id__in=notification_ids)
    notifications = list(qs)
    if not notifications:
        return 0
    now = timezone.now()
    for n in notifications:
        n.read_at = now
    Notification.objects.bulk_update(notifications, ["read_at"])
    for n in notifications:
        _broadcast(n.user_id, "notification.updated", {"notification": _serialize_notification(n)})
    _broadcast_notification_counter(user)
    return len(notifications)


def _broadcast_notification_counter(user) -> None:
    unread = Notification.objects.visible_to(user).unread().count()
    _broadcast(user.id, "notification.counter", {"unread": unread})
