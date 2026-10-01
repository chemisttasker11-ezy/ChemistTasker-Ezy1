"""Shared helpers of the WebSocket tests: the project's WebSocket stack, one-time tickets, actors and a connect shortcut."""
from datetime import timedelta

from channels.db import database_sync_to_async
from channels.routing import URLRouter
from channels.testing import WebsocketCommunicator
from django.utils import timezone

import core.routing
from client_profile.characterization_support import make_owner_with_pharmacy, make_staff_member, make_user
from users.jwt_ws import JWTAuthMiddlewareStack
from users.models import WebSocketTicket

APP = JWTAuthMiddlewareStack(URLRouter(core.routing.websocket_urlpatterns))
TIMEOUT = 3


@database_sync_to_async
def new_ticket(user, value, age_seconds=0):
    t = WebSocketTicket.objects.create(user=user, ticket=value)
    if age_seconds:
        WebSocketTicket.objects.filter(pk=t.pk).update(created_at=timezone.now() - timedelta(seconds=age_seconds))
    return t


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
