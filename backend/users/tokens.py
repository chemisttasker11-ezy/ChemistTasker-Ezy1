"""JWT session id (`sid`) survives refresh rotation so logout closes only its own sockets."""
import logging
from typing import Self, cast

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.conf import settings
from rest_framework_simplejwt.settings import api_settings
from rest_framework_simplejwt.token_blacklist.models import OutstandingToken
from rest_framework_simplejwt.tokens import RefreshToken as BaseRefreshToken
from rest_framework_simplejwt.utils import datetime_from_epoch, get_md5_hash_password


class RefreshToken(BaseRefreshToken):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.payload.setdefault('sid', self['jti'])

    @classmethod
    def for_user(cls, user) -> Self:
        token = cast(Self, super().for_user(user))
        # Password fingerprint: CookieJWTAuthentication refuses tokens minted before a password change.
        token[api_settings.REVOKE_TOKEN_CLAIM] = get_md5_hash_password(user.password)
        return token

    @property
    def access_token(self):
        access = super().access_token
        access['exp'] = min(access['exp'], self['exp'])
        access['session_exp'] = self['exp']
        return access

    def session_pair(self, *, session_kind: str, remember_me: bool = False, deadline: int | None = None):
        self['session_kind'] = session_kind
        if session_kind == 'native':
            self.payload.pop('remember_me', None)
            lifetime = settings.JWT_NATIVE_REFRESH_TOKEN_LIFETIME
        else:
            self['remember_me'] = remember_me
            lifetime = settings.JWT_REMEMBER_ME_REFRESH_TOKEN_LIFETIME if remember_me else self.lifetime

        if session_kind == 'web' and deadline is not None:
            self['exp'] = deadline
        else:
            self.set_exp(from_time=datetime_from_epoch(int(self['iat'])), lifetime=lifetime)
        encoded = str(self)
        # Simple JWT records the token before the flow applies its session policy.
        OutstandingToken.objects.filter(jti=self['jti']).update(
            token=encoded, expires_at=datetime_from_epoch(int(self['exp'])),
        )
        return {'refresh': encoded, 'access': str(self.access_token)}


def notify_auth_changed(user_id, sid=None):
    from notifications.services import _broadcast
    from infrastructure.channel_groups import USER_GROUP_FMT

    try:
        _broadcast(user_id, 'auth.changed', {'sid': sid})
        layer = get_channel_layer()
        if layer:
            async_to_sync(layer.group_send)(
                USER_GROUP_FMT.format(user_id=user_id), {'type': 'auth.changed', 'sid': sid},
            )
    except Exception:
        # Sockets still re-check durable logout/password/active state before every delivery.
        logging.getLogger('users.views').exception('Failed notifying sockets for user %s', user_id)
