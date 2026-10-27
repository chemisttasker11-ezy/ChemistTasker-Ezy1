"""Chat uses the same session revocation contract as notification sockets."""
from unittest.mock import patch
from channels.db import database_sync_to_async
from channels.layers import get_channel_layer
from channels.testing import WebsocketCommunicator
from django.test import TransactionTestCase, override_settings

from chat.models import Message
from chat.realtime import ROOM_GROUP_FMT
from chat.test_websocket import make_room_with
from core.websocket_testing import APP, TIMEOUT, make_actors
from notifications import test_session_revocation as sessions


@override_settings(AXES_ENABLED=False, CHANNEL_LAYERS={
    'default': {'BACKEND': 'channels.layers.InMemoryChannelLayer'},
})
class RoomSessionRevocationTests(TransactionTestCase):
    # Reuse the DB helper descriptors without binding them to the other test class.
    login = sessions.SessionRevocationTests.__dict__['login']
    post = sessions.SessionRevocationTests.__dict__['post']
    password_change = sessions.SessionRevocationTests.__dict__['password_change']
    ticket = sessions.SessionRevocationTests.ticket
    closed = sessions.SessionRevocationTests.closed
    disconnect_sockets = sessions.SessionRevocationTests.disconnect_sockets

    def setUp(self):
        self.sockets = []

    async def actors(self):
        alice, alice_m, bob, bob_m, _ = await make_actors()
        # The shared login helper uses this password for real login/refresh/logout requests.
        await self.set_password(alice)
        self.room = await make_room_with([(alice, alice_m), (bob, bob_m)])
        _, session = await self.login(alice)
        return alice, session

    @database_sync_to_async
    def set_password(self, user):
        user.set_password('SessionPassword123!')
        user.is_otp_verified = True
        user.save(update_fields=['password', 'is_otp_verified'])

    async def socket(self, access, ticket=False):
        path = f'/ws/chat/rooms/{self.room}/'
        headers = [(b'authorization', f'Bearer {access}'.encode())]
        if ticket:
            path += f'?ticket={await self.ticket(access)}'
            headers = []
        comm = WebsocketCommunicator(APP, path, headers=headers)
        self.sockets.append(comm)
        ok, _ = await comm.connect(timeout=TIMEOUT)
        self.assertTrue(ok)
        self.assertEqual((await comm.receive_json_from(timeout=TIMEOUT))['type'], 'ready')
        return comm

    async def typing(self, *comms):
        await comms[0].send_json_to({'type': 'typing', 'is_typing': True})
        for comm in comms:
            self.assertEqual((await comm.receive_json_from(timeout=TIMEOUT))['type'], 'typing')

    async def test_rotation_and_other_device_logout_preserve_chat_then_own_logout_closes(self):
        user, first = await self.actors()
        bearer = await self.socket(first['access'])
        ticket = await self.socket(first['access'], ticket=True)
        rotated = await self.post('token/refresh', {'refresh': first['refresh']})
        self.assertEqual(rotated.status_code, 200)
        _, other = await self.login(user)
        self.assertEqual((await self.post('logout', {'refresh': other['refresh']})).status_code, 200)
        await self.typing(bearer, ticket)  # positive controls: rotation and another session's logout
        self.assertEqual((await self.post('logout', {'refresh': rotated.data['refresh']})).status_code, 200)
        for comm in (bearer, ticket):
            await self.closed(comm)
        await self.disconnect_sockets()

    async def test_missed_logout_broadcast_closes_on_receive_and_delivery_only_for_own_session(self):
        for direction in ('receive', 'deliver'):
            with self.subTest(direction=direction):
                user, first = await self.actors()
                _, other = await self.login(user)
                comm = await self.socket(first['access'], ticket=direction == 'deliver')
                survivor = await self.socket(other['access'])
                rotated = await self.post('token/refresh', {'refresh': first['refresh']})
                self.assertEqual(rotated.status_code, 200)
                await self.typing(comm, survivor)
                with patch('users.api_auth.notify_auth_changed') as missed:
                    self.assertEqual((await self.post('logout', {'refresh': first['refresh']})).status_code, 200)
                    missed.assert_called_once()
                if direction == 'receive':
                    await comm.send_json_to({'type': 'message', 'body': 'revoked credentials'})
                else:
                    await get_channel_layer().group_send(ROOM_GROUP_FMT.format(room_id=self.room),
                                                         {'type': 'typing.update'})
                    self.assertEqual((await survivor.receive_json_from(timeout=TIMEOUT))['type'], 'typing')
                await self.closed(comm)
                await self.typing(survivor)
                self.assertFalse(await database_sync_to_async(Message.objects.exists)())
        await self.disconnect_sockets()

    async def test_both_password_reset_routes_close_all_chat_sessions(self):
        for mode in ('api', 'form'):
            with self.subTest(mode=mode):
                user, first = await self.actors()
                _, second = await self.login(user)
                bearer = await self.socket(first['access'])
                ticket = await self.socket(second['access'], ticket=True)
                await self.typing(bearer, ticket)
                await self.password_change(user, mode)
                for comm in (bearer, ticket):
                    await self.closed(comm)
        await self.disconnect_sockets()

    async def test_password_change_is_rechecked_on_receive_and_delivery_without_broadcast(self):
        for direction in ('receive', 'deliver'):
            with self.subTest(direction=direction):
                user, first = await self.actors()
                comm = await self.socket(first['access'], ticket=direction == 'deliver')
                await self.typing(comm)
                await self.password_change(user, 'direct')
                if direction == 'receive':
                    await comm.send_json_to({'type': 'message', 'body': 'revoked credentials'})
                else:
                    await get_channel_layer().group_send(ROOM_GROUP_FMT.format(room_id=self.room),
                                                         {'type': 'typing.update'})
                await self.closed(comm)
                self.assertFalse(await database_sync_to_async(Message.objects.exists)())
        await self.disconnect_sockets()
