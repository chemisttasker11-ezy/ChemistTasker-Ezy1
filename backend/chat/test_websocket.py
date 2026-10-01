"""Characterization of the chat WebSocket: the RoomConsumer (membership check, messages, typing).

Routes are the ones mounted by core/asgi.py: JWTAuthMiddlewareStack(URLRouter(core.routing...)).
Tests are async and use TransactionTestCase because the consumer touches the DB from worker threads."""
from channels.db import database_sync_to_async
from django.test import TransactionTestCase

from chat.models import Conversation, Message, Participant
from core.websocket_testing import TIMEOUT, connect, make_actors, new_ticket


@database_sync_to_async
def message_count():
    return Message.objects.count()


@database_sync_to_async
def make_room_with(users_memberships):
    conv = Conversation.objects.create(type="GROUP", title="room")
    for _, m in users_memberships:
        Participant.objects.create(conversation=conv, membership=m)
    return conv.id


class RoomSocketTests(TransactionTestCase):
    async def test_anonymous_is_refused_with_4401(self):
        _, ok, code = await connect("/ws/chat/rooms/1/")
        self.assertFalse(ok)
        self.assertEqual(code, 4401)

    async def test_participant_is_accepted_and_told_their_membership(self):
        alice, alice_m, bob, bob_m, _ = await make_actors()
        room = await make_room_with([(alice, alice_m), (bob, bob_m)])
        await new_ticket(alice, "ticket-room-1")
        comm, ok, _ = await connect(f"/ws/chat/rooms/{room}/", "?ticket=ticket-room-1")
        self.assertTrue(ok)
        self.assertEqual(await comm.receive_json_from(timeout=TIMEOUT), {"type": "ready", "membership": alice_m.id})
        await comm.disconnect()

    async def test_non_participant_is_refused_with_4403(self):
        alice, alice_m, bob, bob_m, outsider = await make_actors()
        room = await make_room_with([(alice, alice_m), (bob, bob_m)])
        await new_ticket(outsider, "ticket-room-out")
        _, ok, code = await connect(f"/ws/chat/rooms/{room}/", "?ticket=ticket-room-out")
        self.assertFalse(ok)
        self.assertEqual(code, 4403)

    async def test_sending_a_message_over_the_socket_persists_it_and_fans_out(self):
        alice, alice_m, bob, bob_m, _ = await make_actors()
        room = await make_room_with([(alice, alice_m), (bob, bob_m)])
        await new_ticket(alice, "ticket-a")
        await new_ticket(bob, "ticket-b")
        a, ok_a, _ = await connect(f"/ws/chat/rooms/{room}/", "?ticket=ticket-a")
        b, ok_b, _ = await connect(f"/ws/chat/rooms/{room}/", "?ticket=ticket-b")
        self.assertTrue(ok_a and ok_b)
        await a.receive_json_from(timeout=TIMEOUT)  # ready
        await b.receive_json_from(timeout=TIMEOUT)  # ready
        await a.send_json_to({"type": "message", "body": "hello over ws"})
        got = await b.receive_json_from(timeout=TIMEOUT)
        self.assertEqual(got["type"], "message.created")
        self.assertEqual(got["message"]["body"], "hello over ws")
        self.assertEqual(await message_count(), 1)
        await a.disconnect()
        await b.disconnect()

    async def test_blank_message_is_ignored(self):
        alice, alice_m, bob, bob_m, _ = await make_actors()
        room = await make_room_with([(alice, alice_m), (bob, bob_m)])
        await new_ticket(alice, "ticket-blank")
        a, ok, _ = await connect(f"/ws/chat/rooms/{room}/", "?ticket=ticket-blank")
        self.assertTrue(ok)
        await a.receive_json_from(timeout=TIMEOUT)
        await a.send_json_to({"type": "message", "body": "   "})
        self.assertTrue(await a.receive_nothing(timeout=0.5))
        self.assertEqual(await message_count(), 0)
        await a.disconnect()

    async def test_typing_event_is_broadcast_to_the_room(self):
        alice, alice_m, bob, bob_m, _ = await make_actors()
        room = await make_room_with([(alice, alice_m), (bob, bob_m)])
        await new_ticket(alice, "ticket-ta")
        await new_ticket(bob, "ticket-tb")
        a, _, _ = await connect(f"/ws/chat/rooms/{room}/", "?ticket=ticket-ta")
        b, _, _ = await connect(f"/ws/chat/rooms/{room}/", "?ticket=ticket-tb")
        await a.receive_json_from(timeout=TIMEOUT)
        await b.receive_json_from(timeout=TIMEOUT)
        await a.send_json_to({"type": "typing", "is_typing": True})
        got = await b.receive_json_from(timeout=TIMEOUT)
        self.assertEqual((got["type"], got["membership"], got["is_typing"], got["conversation_id"]),
                         ("typing", alice_m.id, True, room))
        await a.disconnect()
        await b.disconnect()
