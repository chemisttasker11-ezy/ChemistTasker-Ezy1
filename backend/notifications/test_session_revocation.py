"""Session-specific logout and account-wide password revocation across WS auth transports."""
from channels.db import database_sync_to_async
from channels.layers import get_channel_layer
from channels.testing import WebsocketCommunicator
from django.conf import settings
from django.contrib.auth.tokens import default_token_generator
from django.core.cache import cache
from django.test import TransactionTestCase, override_settings
from django.utils import timezone
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_encode
from rest_framework.test import APIClient
from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken
from rest_framework_simplejwt.tokens import UntypedToken

from core.websocket_testing import APP, TIMEOUT
from notifications.services import USER_GROUP_FMT
from users.models import User
from users.tokens import RefreshToken


@override_settings(AXES_ENABLED=False, CORS_ALLOWED_ORIGINS=['https://app.example.test'])
class SessionRevocationTests(TransactionTestCase):
    def setUp(self):
        self.sockets = []

    async def disconnect_sockets(self):
        for comm in self.sockets:
            await comm.disconnect()

    @database_sync_to_async
    def login(self, user=None):
        if user is None:
            user = User.objects.create_user(
                email='ws-session@example.test', password='SessionPassword123!',
                role='PHARMACIST', is_otp_verified=True,
            )
        cache.clear()
        response = APIClient().post('/api/v1/users/login/', {
            'email': user.email, 'password': 'SessionPassword123!',
        }, format='json', HTTP_X_CLIENT_PLATFORM='mobile')
        self.assertEqual(response.status_code, 200)
        return user, response.data

    @database_sync_to_async
    def post(self, path, data=None, access=None, refresh_cookie=None):
        cache.clear()
        client = APIClient()
        if access:
            client.credentials(HTTP_AUTHORIZATION=f'Bearer {access}')
        if refresh_cookie:
            client.cookies[settings.JWT_REFRESH_COOKIE] = refresh_cookie
        return client.post(f'/api/v1/users/{path}/', data or {}, format='json')

    async def socket(self, access=None, ticket=None, cookie=False, accepted=True):
        if ticket:
            path, headers = f'/ws/notifications/?ticket={ticket}', []
        else:
            path = '/ws/notifications/'
            headers = ([(b'origin', b'https://app.example.test'),
                        (b'cookie', f'{settings.JWT_AUTH_COOKIE}={access}'.encode())]
                       if cookie else [(b'authorization', f'Bearer {access}'.encode())])
        comm = WebsocketCommunicator(APP, path, headers=headers)
        ok, code = await comm.connect(timeout=TIMEOUT)
        self.assertEqual(ok, accepted)
        if accepted:
            self.assertEqual(await comm.receive_json_from(timeout=TIMEOUT), {'type': 'ready'})
        else:
            self.assertEqual(code, 4401)
        self.sockets.append(comm)
        return comm

    async def ticket(self, access):
        response = await self.post('ws-ticket', access=access)
        self.assertEqual(response.status_code, 200)
        return response.data['ticket']

    async def closed(self, comm, code=4401):
        self.assertEqual(await comm.receive_output(timeout=TIMEOUT), {'type': 'websocket.close', 'code': code})

    async def event(self, user, *comms):
        await get_channel_layer().group_send(USER_GROUP_FMT.format(user_id=user.pk),
                                             {'type': 'notification.counter', 'unread': 7})
        for comm in comms:
            self.assertEqual(await comm.receive_json_from(timeout=TIMEOUT),
                             {'type': 'notification.counter', 'unread': 7})

    async def test_cookie_and_expo_logout_close_own_bearer_cookie_and_ticket_sockets(self):
        user, first = await self.login()
        survivor = await self.socket(access=first['access'])
        for mode in ('cookie', 'expo'):
            with self.subTest(mode=mode):
                _, session = await self.login(user)
                access, refresh = session['access'], session['refresh']
                bearer = await self.socket(access=access)
                cookie = await self.socket(access=access, cookie=True)
                ticket_socket = await self.socket(ticket=await self.ticket(access))
                unused_ticket = await self.ticket(access)
                if mode == 'cookie':
                    response = await self.post('logout', refresh_cookie=refresh)
                else:  # shared-core logoutSession: refresh in body, no Authorization header
                    response = await self.post('logout', {'refresh': refresh})
                self.assertEqual(response.status_code, 200)
                for comm in (bearer, cookie, ticket_socket):
                    await self.closed(comm)
                await self.socket(ticket=unused_ticket, accepted=False)
                self.assertEqual((await self.post('token/refresh', {'refresh': refresh})).status_code, 401)
        await self.event(user, survivor)
        await self.disconnect_sockets()

    async def test_rotation_and_other_device_logout_preserve_socket_then_own_logout_closes_it(self):
        user, session = await self.login()
        access, old_refresh = session['access'], session['refresh']
        bearer = await self.socket(access=access)
        ticket_socket = await self.socket(ticket=await self.ticket(access))
        pending = await self.ticket(access)
        old_sid = UntypedToken(old_refresh)['sid']
        rotated = await self.post('token/refresh', {'refresh': old_refresh})
        self.assertEqual(rotated.status_code, 200)
        self.assertEqual(UntypedToken(rotated.data['refresh'])['sid'], old_sid)
        self.assertNotEqual(UntypedToken(rotated.data['refresh'])['jti'], old_sid)
        self.assertTrue(await database_sync_to_async(BlacklistedToken.objects.filter(token__jti=old_sid).exists)())
        _, other = await self.login(user)
        await self.post('logout', {'refresh': other['refresh']})
        await self.event(user, bearer, ticket_socket)
        await self.socket(ticket=pending)
        await self.post('logout', {'refresh': rotated.data['refresh']})
        for comm in (bearer, ticket_socket):
            await self.closed(comm)
        self.assertEqual((await self.post('token/refresh', {'refresh': rotated.data['refresh']})).status_code, 401)
        await self.disconnect_sockets()

    @database_sync_to_async
    def password_change(self, user, mode):
        if mode == 'direct':
            user.set_password('ReplacementPassword123!')
            user.save(update_fields=['password'])
            return
        token = default_token_generator.make_token(user)
        uid = urlsafe_base64_encode(force_bytes(user.pk))
        client = APIClient()
        if mode == 'api':
            response = client.post('/api/v1/users/password-reset-confirm/', {
                'uid': uid, 'token': token, 'new_password1': 'ReplacementPassword123!',
                'new_password2': 'ReplacementPassword123!',
            }, format='json')
            self.assertEqual(response.status_code, 200)
        else:
            from django.urls import reverse
            url = reverse('api_v1:password_reset_confirm', kwargs={'uidb64': uid, 'token': token})
            redirect = client.get(url)
            self.assertEqual(redirect.status_code, 302)
            response = client.post(redirect.url, {
                'new_password1': 'ReplacementPassword123!', 'new_password2': 'ReplacementPassword123!',
            })
            self.assertEqual(response.status_code, 302)

    async def test_password_change_and_both_reset_routes_revoke_all_sockets_and_old_credentials(self):
        for mode in ('direct', 'api', 'form'):
            with self.subTest(mode=mode):
                user = await database_sync_to_async(User.objects.create_user)(
                    email=f'{mode}@example.test', password='SessionPassword123!',
                    role='PHARMACIST', is_otp_verified=True,
                )
                _, first = await self.login(user)
                _, second = await self.login(user)
                sockets = [await self.socket(access=first['access']),
                           await self.socket(access=second['access'], cookie=True),
                           await self.socket(ticket=await self.ticket(first['access']))]
                pending = await self.ticket(second['access'])
                await self.password_change(user, mode)
                if mode == 'direct':
                    await get_channel_layer().group_send(USER_GROUP_FMT.format(user_id=user.pk),
                                                         {'type': 'notification.created'})
                for comm in sockets:
                    await self.closed(comm)
                for session in (first, second):
                    await self.socket(access=session['access'], accepted=False)
                    await self.socket(access=session['access'], cookie=True, accepted=False)
                    self.assertEqual((await self.post('ws-ticket', access=session['access'])).status_code, 401)
                    self.assertEqual((await self.post('token/refresh', {'refresh': session['refresh']})).status_code, 401)
                if mode != 'direct':  # shortcut: only the reset routes purge pending (<5 min) tickets
                    await self.socket(ticket=pending, accepted=False)
                await database_sync_to_async(user.refresh_from_db)()
                fresh = await database_sync_to_async(RefreshToken.for_user)(user)
                await self.socket(access=str(fresh.access_token))
                await self.socket(ticket=await self.ticket(str(fresh.access_token)))
        await self.disconnect_sockets()

    async def test_deactivation_and_soft_or_hard_deletion_close_and_refuse_reconnect(self):
        for index, change in enumerate(({'is_active': False}, {'deleted_at': timezone.now()}, None)):
            user = await database_sync_to_async(User.objects.create_user)(
                email=f'state-{index}@example.test',
                password='SessionPassword123!', role='PHARMACIST', is_otp_verified=True,
            )
            _, session = await self.login(user)
            bearer = await self.socket(access=session['access'])
            ticket_socket = await self.socket(ticket=await self.ticket(session['access']))
            pending = await self.ticket(session['access'])
            user_id = user.pk  # Model.delete() clears pk
            if change is None:
                await database_sync_to_async(user.delete)()
            else:
                await database_sync_to_async(User.objects.filter(pk=user.pk).update)(**change)
            await get_channel_layer().group_send(USER_GROUP_FMT.format(user_id=user_id),
                                                 {'type': 'notification.created'})
            await self.closed(bearer, code=4403)
            await self.closed(ticket_socket, code=4403)
            await self.socket(access=session['access'], accepted=False)
            await self.socket(ticket=pending, accepted=False)
        await self.disconnect_sockets()

    async def test_tokens_minted_before_fingerprint_keep_working_and_get_upgraded(self):
        user, _ = await self.login()
        legacy = await database_sync_to_async(RefreshToken.for_user)(user)
        for claim in ('hash_password', 'sid'):
            del legacy[claim]
        await self.socket(access=str(legacy.access_token))
        rotated = await self.post('token/refresh', {'refresh': str(legacy)})
        self.assertEqual(rotated.status_code, 200)
        upgraded = UntypedToken(rotated.data['access'])
        self.assertEqual(upgraded['sid'], legacy['jti'])
        self.assertIn('hash_password', upgraded.payload)
        await self.disconnect_sockets()
