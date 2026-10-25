"""Writes reject revocation immediately; delivery rechecks at the bounded interval.

These tests intentionally use database QuerySet.update() to bypass model
signals and prove that stale websocket group membership is insufficient.
"""
from channels.db import database_sync_to_async
from channels.layers import get_channel_layer
from django.test import TransactionTestCase
from unittest.mock import patch

from chat.models import Conversation, Message, Participant
from core.websocket_testing import TIMEOUT, connect, make_actors, new_ticket
from memberships.models import Membership


@database_sync_to_async
def room_for(users):
    room = Conversation.objects.create(type="GROUP", title="Revocation test")
    for membership in users:
        Participant.objects.create(conversation=room, membership=membership)
    return room.pk


@database_sync_to_async
def disable_membership(pk):
    Membership.objects.filter(pk=pk).update(is_active=False)


@database_sync_to_async
def count_messages():
    return Message.objects.count()


@database_sync_to_async
def disable_user(pk):
    from django.contrib.auth import get_user_model
    get_user_model().objects.filter(pk=pk).update(is_active=False)


class RevokedSocketContracts(TransactionTestCase):
    async def test_revoked_member_cannot_send_messages_even_with_live_socket(self):
        alice, alice_m, bob, bob_m, _ = await make_actors()
        room = await room_for([alice_m, bob_m])
        await new_ticket(alice, "p6-revoked-send")
        a, accepted, _ = await connect(f"/ws/chat/rooms/{room}/", "?ticket=p6-revoked-send")
        self.assertTrue(accepted)
        await a.receive_json_from(timeout=TIMEOUT)
        await disable_membership(alice_m.pk)
        await a.send_json_to({"type":"message", "body":"revoked should never write"})
        self.assertEqual(await a.receive_output(timeout=TIMEOUT), {"type":"websocket.close", "code":4403})
        self.assertEqual(await count_messages(), 0)
        await a.disconnect()

    @patch("chat.consumers.time")
    async def test_revoked_member_cannot_receive_typing_after_recheck_interval(self, clock):
        clock.monotonic.return_value = 100.0
        alice, alice_m, bob, bob_m, _ = await make_actors()
        room = await room_for([alice_m, bob_m])
        await new_ticket(alice, "p6-revoked-receive-a")
        await new_ticket(bob, "p6-revoked-receive-b")
        a, ok1, _ = await connect(f"/ws/chat/rooms/{room}/", "?ticket=p6-revoked-receive-a")
        b, ok2, _ = await connect(f"/ws/chat/rooms/{room}/", "?ticket=p6-revoked-receive-b")
        self.assertTrue(ok1 and ok2)
        await a.receive_json_from(timeout=TIMEOUT)
        await b.receive_json_from(timeout=TIMEOUT)
        await disable_membership(alice_m.pk)
        clock.monotonic.return_value = 111.0
        await b.send_json_to({"type":"typing", "is_typing":True})
        self.assertEqual(await a.receive_output(timeout=TIMEOUT), {"type":"websocket.close", "code":4403})
        self.assertEqual((await b.receive_json_from(timeout=TIMEOUT))["type"], "typing")
        await a.disconnect()
        await b.disconnect()

    async def test_inactive_user_notification_socket_is_closed_before_delivery(self):
        alice, _, _, _, _ = await make_actors()
        await new_ticket(alice, "p6-notify-revoke")
        socket, connected, _ = await connect("/ws/notifications/", "?ticket=p6-notify-revoke")
        self.assertTrue(connected)
        await socket.receive_json_from(timeout=TIMEOUT)
        await disable_user(alice.pk)
        layer = get_channel_layer()
        await layer.group_send(f"user.{alice.pk}", {
            "type": "notification.created",
            "notification": {"body":"must not be delivered"},
        })
        self.assertEqual(await socket.receive_output(timeout=TIMEOUT), {"type":"websocket.close", "code":4403})
        await socket.disconnect()
