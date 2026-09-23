from urllib.parse import parse_qs
from datetime import timedelta
from django.contrib.auth.models import AnonymousUser
from django.db import close_old_connections
from django.db import transaction
from django.conf import settings
from django.utils import timezone
from asgiref.sync import sync_to_async
from channels.db import database_sync_to_async

from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.exceptions import InvalidToken, AuthenticationFailed
from users.models import WebSocketTicket

class JWTAuthMiddleware:
    """
    ASGI middleware for Channels that authenticates WebSocket connections
    using SimpleJWT access tokens or ephemeral tickets.

      - Authorization: Bearer <token>
      - ?ticket=<ticket>
      - ?token=<token> (deprecated)
    """
    def __init__(self, inner):
        self.inner = inner
        self.jwt_auth = JWTAuthentication()

    async def __call__(self, scope, receive, send):
        scope = dict(scope)
        scope["user"] = AnonymousUser()

        query = parse_qs(scope.get("query_string", b"").decode())
        
        # 1. Try Ticket Auth First (New Secure Method)
        ticket_str = query.get("ticket", [None])[0]
        if ticket_str:
            user = await self._get_user_from_ticket(ticket_str)
            if user:
                scope["user"] = user
                return await self.inner(scope, receive, send)

        # 2. Fallback to standard token auth (for backwards compatibility just in case)
        token = self._get_token_from_scope(scope, query)
        if token:
            try:
                close_old_connections()
                validated = await sync_to_async(self.jwt_auth.get_validated_token, thread_sensitive=True)(token)
                user = await database_sync_to_async(self.jwt_auth.get_user)(validated)
                scope["user"] = user
            except (InvalidToken, AuthenticationFailed):
                pass

        return await self.inner(scope, receive, send)

    @database_sync_to_async
    def _get_user_from_ticket(self, ticket_str):
        close_old_connections()
        try:
            with transaction.atomic():
                ticket_obj = WebSocketTicket.objects.select_for_update().select_related('user').get(ticket=ticket_str)
                user = ticket_obj.user
                valid = (
                    ticket_obj.created_at >= timezone.now() - timedelta(minutes=5)
                    and user.is_active
                    and getattr(user, 'deleted_at', None) is None
                )
                ticket_obj.delete()
                return user if valid else None
        except WebSocketTicket.DoesNotExist:
            return None

    def _get_token_from_scope(self, scope, query):
        headers = dict(scope.get("headers", []))
        auth = headers.get(b"authorization", b"").decode()
        if auth.lower().startswith("bearer "):
            return auth.split(" ", 1)[1].strip()
        # Browsers send an Origin on WebSocket handshakes. Never authenticate a
        # cross-site (or origin-less) handshake using ambient cookies.
        origin = headers.get(b"origin", b"").decode("ascii", errors="ignore").rstrip("/")
        allowed = {value.rstrip("/") for value in getattr(settings, "CORS_ALLOWED_ORIGINS", [])}
        if origin not in allowed:
            return None
        raw_cookies = headers.get(b"cookie", b"").decode()
        cookie_name = getattr(settings, "JWT_AUTH_COOKIE", "ct_access")
        for part in raw_cookies.split(";"):
            item = part.strip()
            if item.startswith(f"{cookie_name}="):
                return item.split("=", 1)[1].strip()
        return None


def JWTAuthMiddlewareStack(inner):
    return JWTAuthMiddleware(inner)
