"""Notifications WebSocket consumer: one group per user, announces new/updated notifications."""
import logging

from channels.generic.websocket import AsyncJsonWebsocketConsumer

log = logging.getLogger("client_profile.ws")

USER_GROUP_FMT = "user.{user_id}"


class NotificationConsumer(AsyncJsonWebsocketConsumer):
    async def connect(self):
        user = self.scope.get("user")
        if not user or user.is_anonymous:
            await self.close(code=4401)
            return
        self.user_id = user.id
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
