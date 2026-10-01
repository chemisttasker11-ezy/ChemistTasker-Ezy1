"""Chat WebSocket consumer: one group per conversation (typing, messages, read receipts, reactions)."""
import logging
import time

from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncJsonWebsocketConsumer

from client_profile.domains.chat.realtime import participant_can_receive_chat_updates
from client_profile.models import Conversation, Membership, Message, Participant
from client_profile.utils import sanitize_chat_text

log = logging.getLogger("client_profile.ws")

# Keep group naming consistent so HTTP + WS clients share the same Redis keys.
ROOM_GROUP_FMT = "room.{room_id}"


class RoomConsumer(AsyncJsonWebsocketConsumer):
    TYPING_COOLDOWN_SECONDS = 1.0

    async def connect(self):
        try:
            self.room_id = int(self.scope["url_route"]["kwargs"]["room_id"])
        except Exception:
            await self.close(code=4000)
            return

        self.group_name = ROOM_GROUP_FMT.format(room_id=self.room_id)
        user = self.scope.get("user")
        log.debug("CONNECT: room=%s user=%s layer=%s", self.room_id, getattr(user, "id", None), bool(self.channel_layer))
        print(f"[WS] CONNECT room={self.room_id} user={getattr(user,'id',None)}", flush=True)

        if not user or user.is_anonymous:
            log.warning("CONNECT denied: anonymous")
            await self.close(code=4401)
            return

        self.membership = await self._get_membership(self.room_id, user.id)
        if not self.membership:
            log.warning("CONNECT denied: no membership for user=%s in room=%s", user.id, self.room_id)
            await self.close(code=4403)
            return

        if self.channel_layer:
            await self.channel_layer.group_add(self.group_name, self.channel_name)
        else:
            log.error("No channel_layer on consumer!")

        self._last_typing_emit = 0.0
        self._last_typing_state = None

        await self.accept()
        await self.send_json({"type": "ready", "membership": self.membership.id})
        print(f"[WS] JOINED group={self.group_name} membership={self.membership.id}", flush=True)
        log.info("ACCEPTED: room=%s membership=%s", self.room_id, self.membership.id)

    async def disconnect(self, code):
        print(f"[WS] DISCONNECT code={code} room={getattr(self,'room_id',None)}", flush=True)
        log.info("DISCONNECT: code=%s room=%s", code, getattr(self,'room_id',None))
        if self.channel_layer and hasattr(self, "group_name"):
            await self.channel_layer.group_discard(self.group_name, self.channel_name)

    async def receive_json(self, content, **kwargs):
        if content.get("type") == "typing":
            if not getattr(self, "membership", None):
                return
            is_typing = bool(content.get("is_typing"))
            if not self.channel_layer:
                return
            now = time.monotonic()
            last_emit = getattr(self, "_last_typing_emit", 0.0)
            last_state = getattr(self, "_last_typing_state", None)
            if last_state == is_typing and (now - last_emit) < self.TYPING_COOLDOWN_SECONDS:
                return
            self._last_typing_emit = now
            self._last_typing_state = is_typing
            user = getattr(self.membership, "user", None)
            name = ""
            if user:
                name = user.get_full_name() or user.email or ""
            await self.channel_layer.group_send(
                self.group_name,
                {
                    "type": "typing.update",
                    "membership_id": self.membership.id,
                    "user_id": getattr(user, "id", None),
                    "name": name,
                    "is_typing": is_typing,
                    "conversation_id": self.room_id,
                },
            )
            return
        if content.get("type") != "message":
            return
        body = sanitize_chat_text(content.get("body") or "")
        if not body:
            return
        if not getattr(self, "membership", None):
            log.warning("RECEIVE without membership")
            return

        msg = await self._create_message(self.room_id, self.membership, body)
        log.debug("Created message id=%s", msg.id)
        print(f"[WS] CREATED message id={msg.id}", flush=True)
        # No immediate send here; signal will broadcast on commit

    # ---- channel-layer events ----
    async def message_created(self, event):
        payload = event.get("message") or event
        log.debug("EVENT message.created id=%s", payload.get("id"))
        await self.send_json({"type": "message.created", "message": payload})

    async def read_updated(self, event):
        print(f"[WS] EVENT read.updated -> membership={event.get('membership')}", flush=True)
        await self.send_json({
            "type": "read.updated",
            "membership": event.get("membership"),
            "last_read_at": event.get("last_read_at"),
        })


    async def message_updated(self, event):
        await self.send_json({
            "type": "message.updated",
            "message": event.get("message"),
        })

    # ✨ FIX: Add a handler for the 'message.deleted' event
    async def message_deleted(self, event):
        await self.send_json({
            "type": "message.deleted",
            "message_id": event.get("message_id"),
        })


    async def reaction_updated(self, event):
        await self.send_json({
            "type": "reaction.updated",
            "message_id": event.get("message_id"),
            "reactions": event.get("reactions"),
        })

    async def typing_update(self, event):
        await self.send_json({
            "type": "typing",
            "membership": event.get("membership_id"),
            "user_id": event.get("user_id"),
            "name": event.get("name"),
            "is_typing": event.get("is_typing", False),
            "conversation_id": event.get("conversation_id"),
        })

    # ---- DB helpers ----
    @database_sync_to_async
    def _get_membership(self, conversation_id: int, user_id: int):
        participant = (
            Participant.objects
            .filter(
                conversation_id=conversation_id,
                membership__user_id=user_id,
            )
            .select_related("membership__user", "conversation")
            .first()
        )
        if participant and not participant_can_receive_chat_updates(participant):
            return None
        return participant.membership if participant else None

    @database_sync_to_async
    def _create_message(self, conversation_id: int, membership: Membership, body: str):
        msg = Message.objects.create(
            conversation_id=conversation_id,
            sender=membership,
            body=body,
        )
        Conversation.objects.filter(pk=conversation_id).update(updated_at=msg.created_at)
        return msg
