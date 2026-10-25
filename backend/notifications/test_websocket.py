"""Characterization of the notifications WebSocket: ticket/JWT handshake auth and the NotificationConsumer.

Routes are the ones mounted by core/asgi.py: JWTAuthMiddlewareStack(URLRouter(core.routing...)).
Tests are async and use TransactionTestCase because the consumer touches the DB from worker threads."""
from channels.db import database_sync_to_async
from channels.testing import WebsocketCommunicator
from django.test import TransactionTestCase, override_settings

from core.websocket_testing import APP, TIMEOUT, connect, make_actors, new_ticket
from users.models import WebSocketTicket
from notifications.services import USER_GROUP_FMT


@database_sync_to_async
def ticket_count():
    return WebSocketTicket.objects.count()


class NotificationSocketTests(TransactionTestCase):
    async def test_events_stop_after_deactivation_or_password_change_but_survive_token_rotation(self):
        from channels.layers import get_channel_layer
        from users.models import User
        from rest_framework_simplejwt.tokens import RefreshToken
        for change in ("inactive", "password", "rotation"):
            for event_type in ("notification.created", "notification.updated", "notification.counter", "message.badge", "message.read"):
                alice, *_ = await make_actors()
                refresh = await database_sync_to_async(RefreshToken.for_user)(alice)
                ticket = f"revoke-{alice.pk}"
                await new_ticket(alice, ticket)
                comm, ok, _ = await connect("/ws/notifications/", f"?ticket={ticket}")
                self.assertTrue(ok)
                await comm.receive_json_from(timeout=TIMEOUT)
                layer = get_channel_layer()
                group = USER_GROUP_FMT.format(user_id=alice.pk)
                await layer.group_send(group, {"type": event_type})
                self.assertEqual((await comm.receive_json_from(timeout=TIMEOUT))["type"], event_type)
                if change == "inactive":
                    await database_sync_to_async(User.objects.filter(pk=alice.pk).update)(is_active=False)
                elif change == "password":
                    await database_sync_to_async(User.objects.filter(pk=alice.pk).update)(password="revoked-password")
                else:
                    # Routine refresh rotation blacklists a token; the active user keeps receiving events.
                    await database_sync_to_async(refresh.blacklist)()
                    await layer.group_send(group, {"type": event_type})
                    self.assertEqual((await comm.receive_json_from(timeout=TIMEOUT))["type"], event_type)
                    await comm.disconnect()
                    continue
                await layer.group_send(group, {"type": event_type})
                closed = await comm.receive_output(timeout=TIMEOUT)
                self.assertEqual(closed["type"], "websocket.close")
                self.assertEqual(closed["code"], 4403 if change == "inactive" else 4401)
                await comm.disconnect()

    async def test_established_bearer_socket_closes_when_access_token_expires(self):
        from datetime import timedelta
        from unittest.mock import patch
        from django.utils import timezone
        from channels.layers import get_channel_layer
        from rest_framework_simplejwt.tokens import AccessToken
        alice, *_ = await make_actors()
        token = str(await database_sync_to_async(AccessToken.for_user)(alice))
        comm = WebsocketCommunicator(APP, "/ws/notifications/", headers=[(b"authorization", f"Bearer {token}".encode())])
        ok, _ = await comm.connect(timeout=TIMEOUT)
        self.assertTrue(ok)
        await comm.receive_json_from(timeout=TIMEOUT)
        with patch("users.jwt_ws.timezone.now", return_value=timezone.now() + timedelta(days=1)):
            await get_channel_layer().group_send(USER_GROUP_FMT.format(user_id=alice.pk), {"type": "message.badge"})
            self.assertEqual((await comm.receive_output(timeout=TIMEOUT))["type"], "websocket.close")
        await comm.disconnect()

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
