"""Chat WebSocket consumer: one group per conversation (typing, messages, read receipts, reactions)."""
import logging
import time

from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncJsonWebsocketConsumer

from chat.models import Conversation, Message, Participant
from chat.realtime import ROOM_GROUP_FMT, USER_GROUP_FMT, participant_can_receive_chat_updates
from memberships.models import Membership
from chat.text import sanitize_chat_text

log = logging.getLogger(__name__)


class RoomConsumer(AsyncJsonWebsocketConsumer):
    TYPING_COOLDOWN_SECONDS = 1.0
    AHPRA_RECHECK_SECONDS = 10.0

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

        if await self._ahpra_suspended(user):
            await self.close(code=4403)
            return

        self.membership = await self._get_membership(self.room_id, user.id)
        if not self.membership:
            log.warning("CONNECT denied: no membership for user=%s in room=%s", user.id, self.room_id)
            await self.close(code=4403)
            return

        if self.channel_layer:
            self.user_group_name = USER_GROUP_FMT.format(user_id=user.id)
            await self.channel_layer.group_add(self.user_group_name, self.channel_name)
            await self.channel_layer.group_add(self.group_name, self.channel_name)
        else:
            log.error("No channel_layer on consumer!")

        # Catch a suspension or revocation committed after joining a group.
        if not await self._membership_still_authorized() or await self._ahpra_suspended(user):
            await self.close(code=4403)
            return
        self._last_typing_emit = 0.0
        self._last_typing_state = None
        self._ahpra_checked_at = time.monotonic()

        await self.accept()
        await self.send_json({"type": "ready", "membership": self.membership.id})
        print(f"[WS] JOINED group={self.group_name} membership={self.membership.id}", flush=True)
        log.info("ACCEPTED: room=%s membership=%s", self.room_id, self.membership.id)

    async def disconnect(self, code):
        print(f"[WS] DISCONNECT code={code} room={getattr(self,'room_id',None)}", flush=True)
        log.info("DISCONNECT: code=%s room=%s", code, getattr(self,'room_id',None))
        if self.channel_layer and hasattr(self, "group_name"):
            await self.channel_layer.group_discard(self.group_name, self.channel_name)
        if self.channel_layer and hasattr(self, "user_group_name"):
            await self.channel_layer.group_discard(self.user_group_name, self.channel_name)

    async def receive_json(self, content, **kwargs):
        if getattr(self, '_ahpra_frozen', False) or await self._ahpra_suspended(self.scope['user']):
            await self.ahpra_suspended({})
            return
        if not await self._membership_still_authorized():
            await self.close(code=4403)
            return
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
        if msg is None:
            # Revocation won the race after the receive-side check.
            await self.close(code=4403)
            return
        log.debug("Created message id=%s", msg.id)
        print(f"[WS] CREATED message id={msg.id}", flush=True)
        # No immediate send here; signal will broadcast on commit

    async def send_json(self, content, close=False):
        # Group membership can outlive a revoked participant, membership or user.
        if not await self._membership_still_authorized():
            await self.close(code=4403)
            return
        now = time.monotonic()
        # Keep the separate AHPRA backstop bounded; access is checked on every delivery.
        if now - getattr(self, '_ahpra_checked_at', 0.0) >= self.AHPRA_RECHECK_SECONDS:
            self._ahpra_checked_at = now
            if await self._ahpra_suspended(self.scope['user']):
                self._ahpra_frozen = True
        if getattr(self, '_ahpra_frozen', False):
            await self.close(code=4403)
            return
        await super().send_json(content, close)

    # ---- channel-layer events ----
    async def ahpra_suspended(self, event):
        if not await self._ahpra_suspended(self.scope['user']):
            return
        self._ahpra_frozen = True
        await self.close(code=4403)

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
    def _ahpra_suspended(self, user):
        # The HTTP freeze (onboarding.middleware) never sees WebSocket handshakes.
        from onboarding.verification.state import ahpra_frozen
        return not user.is_staff and ahpra_frozen(user)

    @database_sync_to_async
    def _get_membership(self, conversation_id: int, user_id: int):
        # A legacy room can contain multiple memberships for the same user.
        # Never choose a revoked row ahead of a valid membership.
        for participant in (
            Participant.objects.filter(
                conversation_id=conversation_id,
                membership__user_id=user_id,
            ).select_related("membership__user", "conversation")
        ):
            if participant_can_receive_chat_updates(participant):
                return participant.membership
        return None

    @database_sync_to_async
    def _membership_still_authorized(self):
        if not getattr(self, "membership", None):
            return False
        participant = Participant.objects.filter(
            conversation_id=self.room_id,
            membership_id=self.membership.pk,
        ).select_related("membership__user", "conversation").only(
            "membership__user__is_active", "membership__status", "membership__is_active",
            "membership__employment_type", "membership__pharmacy_id",
            "conversation__type", "conversation__pharmacy_id",
        ).first()
        return bool(participant and participant_can_receive_chat_updates(participant))

    @database_sync_to_async
    def _create_message(self, conversation_id: int, membership: Membership, body: str):
        from django.db import transaction
        with transaction.atomic():
            # Serialize against an ordinary membership.save() revocation.
            locked = Membership.objects.select_for_update().filter(pk=membership.pk).first()
            participant = (
                Participant.objects.select_related("membership__user", "conversation")
                .filter(conversation_id=conversation_id, membership_id=membership.pk)
                .first()
            )
            if not locked or not participant or not participant_can_receive_chat_updates(participant):
                return None
            msg = Message.objects.create(
                conversation_id=conversation_id,
                sender=locked,
                body=body,
            )
            Conversation.objects.filter(pk=conversation_id).update(updated_at=msg.created_at)
            return msg
