"""Characterization of the WebSocket surface: ticket/JWT handshake auth and the two consumers.

Routes are the ones mounted by core/asgi.py: JWTAuthMiddlewareStack(URLRouter(client_profile.routing...)).
Tests are async and use TransactionTestCase because the consumers touch the DB from worker threads."""
from datetime import timedelta

from channels.routing import URLRouter
from channels.testing import WebsocketCommunicator
from django.test import TransactionTestCase, override_settings
from django.utils import timezone
from channels.db import database_sync_to_async

import client_profile.routing
from client_profile.models import Message
from client_profile.characterization_support import (
    make_owner_with_pharmacy, make_staff_member, make_user,
)
from client_profile.models import Conversation, Participant
from users.jwt_ws import JWTAuthMiddlewareStack
from users.models import WebSocketTicket

APP = JWTAuthMiddlewareStack(URLRouter(client_profile.routing.websocket_urlpatterns))
TIMEOUT = 3


@database_sync_to_async
def new_ticket(user, value, age_seconds=0):
    t = WebSocketTicket.objects.create(user=user, ticket=value)
    if age_seconds:
        WebSocketTicket.objects.filter(pk=t.pk).update(created_at=timezone.now() - timedelta(seconds=age_seconds))
    return t


@database_sync_to_async
def ticket_count():
    return WebSocketTicket.objects.count()


@database_sync_to_async
def message_count():
    return Message.objects.count()


@database_sync_to_async
def make_room_with(users_memberships):
    conv = Conversation.objects.create(type="GROUP", title="room")
    for _, m in users_memberships:
        Participant.objects.create(conversation=conv, membership=m)
    return conv.id


@database_sync_to_async
def make_actors():
    owner, pharmacy = make_owner_with_pharmacy()
    alice, alice_m = make_staff_member(pharmacy)
    bob, bob_m = make_staff_member(pharmacy)
    outsider = make_user("PHARMACIST")
    return alice, alice_m, bob, bob_m, outsider


async def connect(path, query=""):
    comm = WebsocketCommunicator(APP, f"{path}{query}")
    ok, code = await comm.connect(timeout=TIMEOUT)
    return comm, ok, code


class NotificationSocketTests(TransactionTestCase):
    async def test_anonymous_is_refused_with_4401(self):
        comm, ok, code = await connect("/ws/notifications/")
        self.assertFalse(ok)
        self.assertEqual(code, 4401)

    async def test_valid_ticket_is_accepted_and_announces_ready(self):
        alice, *_ = await make_actors()
        await new_ticket(alice, "ticket-notif-1")
        comm, ok, _ = await connect("/ws/notifications/", "?ticket=ticket-notif-1")
        self.assertTrue(ok)
        self.assertEqual(await comm.receive_json_from(timeout=TIMEOUT), {"type": "ready"})
        await comm.disconnect()

    async def test_ticket_is_single_use(self):
        alice, *_ = await make_actors()
        await new_ticket(alice, "ticket-once")
        first, ok1, _ = await connect("/ws/notifications/", "?ticket=ticket-once")
        self.assertTrue(ok1)
        await first.disconnect()
        self.assertEqual(await ticket_count(), 0)
        _, ok2, code2 = await connect("/ws/notifications/", "?ticket=ticket-once")
        self.assertFalse(ok2)
        self.assertEqual(code2, 4401)

    async def test_ticket_older_than_five_minutes_is_rejected(self):
        alice, *_ = await make_actors()
        await new_ticket(alice, "ticket-old", age_seconds=6 * 60)
        _, ok, code = await connect("/ws/notifications/", "?ticket=ticket-old")
        self.assertFalse(ok)
        self.assertEqual(code, 4401)

    async def test_unknown_ticket_is_rejected(self):
        _, ok, code = await connect("/ws/notifications/", "?ticket=does-not-exist")
        self.assertFalse(ok)
        self.assertEqual(code, 4401)

    async def test_query_string_jwt_is_ignored_despite_the_deprecation_note(self):
        # users/jwt_ws.py documents ?token= as "deprecated" but never reads it: it is NOT honoured today.
        # Making it work (or removing the note) is a behaviour/doc change, not a refactor result.
        from rest_framework_simplejwt.tokens import AccessToken
        alice, *_ = await make_actors()
        token = str(await database_sync_to_async(AccessToken.for_user)(alice))
        _, ok, code = await connect("/ws/notifications/", f"?token={token}")
        self.assertFalse(ok)
        self.assertEqual(code, 4401)

    async def test_bearer_header_authenticates(self):
        from rest_framework_simplejwt.tokens import AccessToken
        alice, *_ = await make_actors()
        token = str(await database_sync_to_async(AccessToken.for_user)(alice))
        comm = WebsocketCommunicator(APP, "/ws/notifications/", headers=[(b"authorization", f"Bearer {token}".encode())])
        ok, _ = await comm.connect(timeout=TIMEOUT)
        self.assertTrue(ok)
        await comm.disconnect()

    @override_settings(CORS_ALLOWED_ORIGINS=["https://app.example.test"])
    async def test_cookie_authenticates_only_from_an_allowed_origin(self):
        from django.conf import settings
        from rest_framework_simplejwt.tokens import AccessToken
        origins = ["https://app.example.test"]
        alice, *_ = await make_actors()
        token = str(await database_sync_to_async(AccessToken.for_user)(alice))
        cookie = f"{settings.JWT_AUTH_COOKIE}={token}".encode()
        good = WebsocketCommunicator(APP, "/ws/notifications/", headers=[(b"origin", origins[0].encode()), (b"cookie", cookie)])
        ok, _ = await good.connect(timeout=TIMEOUT)
        self.assertTrue(ok)
        await good.disconnect()
        for headers in ([(b"origin", b"https://evil.example"), (b"cookie", cookie)], [(b"cookie", cookie)]):
            bad = WebsocketCommunicator(APP, "/ws/notifications/", headers=headers)
            ok, code = await bad.connect(timeout=TIMEOUT)
            self.assertFalse(ok)
            self.assertEqual(code, 4401)

    async def test_garbage_token_is_rejected(self):
        _, ok, code = await connect("/ws/notifications/", "?token=not-a-jwt")
        self.assertFalse(ok)
        self.assertEqual(code, 4401)


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
