from __future__ import annotations

from typing import Iterable, Optional, Sequence
import requests

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.contrib.auth import get_user_model
from django.utils import timezone

from client_profile.models import (
    Membership,
    Notification,
    Participant,
    Message,
    PHARMACY_STAFF_EMPLOYMENT_TYPES,
)
from users.models import DeviceToken

USER_GROUP_FMT = "user.{user_id}"


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
    layer = get_channel_layer()
    if not layer:
        return
    async_to_sync(layer.group_send)(
        USER_GROUP_FMT.format(user_id=user_id),
        {"type": event_type, **payload},
    )


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
        requests.post(
            "https://exp.host/--/api/v2/push/send",
            json=payloads,
            timeout=5,
        )
    except Exception:
        # Fail silently; do not break main notification flow
        pass


def notify_users(
    user_ids: Iterable[int],
    *,
    title: str,
    body: str = "",
    notification_type: str = Notification.Type.TASK,
    action_url: Optional[str] = None,
    payload: Optional[dict] = None,
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
        _broadcast(notification.user_id, "notification.created", {"notification": _serialize_notification(notification)})
        _broadcast_notification_counter(notification.user_id)
        # Push via Expo tokens for this user
        tokens = list(
            DeviceToken.objects.filter(user_id=notification.user_id, active=True).values_list("token", flat=True)
        )
        _send_expo_push(tokens, title=notification.title, body=notification.body, data=notification.payload or {})


def mark_notifications_read(user, notification_ids: Optional[Sequence[int]] = None) -> int:
    qs = Notification.objects.filter(user=user, read_at__isnull=True)
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
    _broadcast_notification_counter(user.id)
    return len(notifications)


def _broadcast_notification_counter(user_id: int) -> None:
    unread = Notification.objects.filter(user_id=user_id, read_at__isnull=True).count()
    _broadcast(user_id, "notification.counter", {"unread": unread})
