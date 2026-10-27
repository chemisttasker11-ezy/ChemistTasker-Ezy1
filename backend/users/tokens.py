"""JWT session id (`sid`) survives refresh rotation so logout closes only its own sockets."""
import logging

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from rest_framework_simplejwt.settings import api_settings
from rest_framework_simplejwt.tokens import RefreshToken as BaseRefreshToken
from rest_framework_simplejwt.utils import get_md5_hash_password


class RefreshToken(BaseRefreshToken):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.payload.setdefault('sid', self['jti'])

    @classmethod
    def for_user(cls, user):
        token = super().for_user(user)
        # Password fingerprint: CookieJWTAuthentication refuses tokens minted before a password change.
        token[api_settings.REVOKE_TOKEN_CLAIM] = get_md5_hash_password(user.password)
        return token


def notify_auth_changed(user_id, sid=None):
    from notifications.services import _broadcast
    from chat.realtime import USER_GROUP_FMT

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
