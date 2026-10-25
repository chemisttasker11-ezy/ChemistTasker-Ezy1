"""Notifications WebSocket consumer: one group per user, announces new/updated notifications."""
import logging

from channels.generic.websocket import AsyncJsonWebsocketConsumer
from channels.db import database_sync_to_async
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework_simplejwt.exceptions import TokenError

from notifications.services import USER_GROUP_FMT

log = logging.getLogger(__name__)


class NotificationConsumer(AsyncJsonWebsocketConsumer):
    async def connect(self):
        user = self.scope.get("user")
        if not user or user.is_anonymous or not user.is_active:
            await self.close(code=4401)
            return
        self.user_id = user.id
        self.password = user.password
        self.session_id = self.scope.get('session_id', '')
        self.group_name = USER_GROUP_FMT.format(user_id=self.user_id)
        if self.channel_layer:
            try:
                await self.channel_layer.group_add(self.group_name, self.channel_name)
            except Exception:
                # Keep the socket alive in local/dev even if Redis is unavailable.
                # The client can still poll REST endpoints for unread counts.
                log.exception("Notification websocket group_add failed for user=%s", self.user_id)
                self.channel_layer = None
        await self.accept()
        await self.send_json({"type": "ready"})

    @database_sync_to_async
    def _still_authorized(self):
        user = get_user_model().objects.filter(pk=self.user_id, is_active=True, deleted_at__isnull=True).first()
        if not user or user.password != self.password:
            return False
        token = self.scope.get("auth")
        if token:
            try:
                token.check_exp(current_time=timezone.now())
            except TokenError:
                return False
        # Not the blacklist: routine refresh rotation blacklists tokens too; reset/deletion change password or is_active.
        return True

    async def auth_changed(self, event):
        # `sid` set = one session logged out; unset = account-wide change (password reset, deletion).
        if event.get('sid') == self.session_id or not await self._still_authorized():
            await self.disconnect(4401)
            await self.close(code=4401)

    async def send_json(self, content, close=False):
        if not await self._still_authorized():
            await self.disconnect(4401)
            await self.close(code=4401)
            return
        await super().send_json(content, close=close)

    async def disconnect(self, code):
        if self.channel_layer and hasattr(self, "group_name"):
            await self.channel_layer.group_discard(self.group_name, self.channel_name)

    async def notification_created(self, event):
        await self.send_json({
            "type": "notification.created",
            "notification": event.get("notification"),
        })

    async def notification_updated(self, event):
        await self.send_json({
            "type": "notification.updated",
            "notification": event.get("notification"),
        })

    async def notification_counter(self, event):
        await self.send_json({
            "type": "notification.counter",
            "unread": event.get("unread", 0),
        })

    async def message_badge(self, event):
        await self.send_json({
            "type": "message.badge",
            "conversation_id": event.get("conversation_id"),
            "unread": event.get("unread", 0),
        })

    async def message_read(self, event):
        await self.send_json({
            "type": "message.read",
            "conversation_id": event.get("conversation_id"),
        })
