from unittest.mock import patch
from uuid import uuid4
from asgiref.sync import async_to_sync
from django.test import TransactionTestCase
from client_profile.characterization_support import client_for, make_user


class Claim5TicketSocketAfterLogout(TransactionTestCase):  # Channels closes connections: no per-test atomic
    def setUp(self):
        from users.models import WebSocketTicket
        from users.tokens import RefreshToken
        self.user = make_user("PHARMACIST")
        self.refresh = RefreshToken.for_user(self.user)
        self.sid = self.refresh["sid"]
        self.ticket = uuid4().hex
        # Same row WsTicketView.post creates for a session.
        WebSocketTicket.objects.create(user=self.user, ticket=self.ticket, session_id=self.sid)

    def run_socket(self, between):
        from channels.layers import get_channel_layer
        from channels.testing import WebsocketCommunicator
        from notifications.consumers import NotificationConsumer
        from notifications.services import USER_GROUP_FMT
        from users.jwt_ws import JWTAuthMiddleware

        async def flow():
            comm = WebsocketCommunicator(JWTAuthMiddleware(NotificationConsumer.as_asgi()),
                                         f"/ws/notifications/?ticket={self.ticket}")
            connected, _ = await comm.connect()
            assert connected
            assert (await comm.receive_json_from())["type"] == "ready"
            await between()
            await get_channel_layer().group_send(USER_GROUP_FMT.format(user_id=self.user.pk),
                                                 {"type": "notification.created", "notification": {"id": 204}})
            out = await comm.receive_output(timeout=2)
            await comm.disconnect()
            return out

        return async_to_sync(flow)()

    def test_claim5_logged_out_ticket_socket_stops_receiving_bug(self):
        from channels.db import database_sync_to_async

        @database_sync_to_async
        def logout():
            with patch("users.api_auth.notify_auth_changed") as missed:  # autocommit: on_commit runs inside
                r =client_for().post("/api/v1/users/logout/", {"refresh": str(self.refresh)}, format="json")
            assert r.status_code == 200 and missed.called, (r.status_code, missed.called)

        out = self.run_socket(logout)
        self.assertEqual(out["type"], "websocket.close",
                         f"logged-out session's ticket socket still received: {out}")

    def test_claim5_password_change_closes_control(self):
        from channels.db import database_sync_to_async

        @database_sync_to_async
        def change_password():
            self.user.set_password("new-pass-204")
            self.user.save(update_fields=["password"])

        self.assertEqual(self.run_socket(change_password)["type"], "websocket.close")
