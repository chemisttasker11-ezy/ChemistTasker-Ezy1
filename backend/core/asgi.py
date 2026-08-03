# core/asgi.py
import os

# 1) Set the settings module first. Production is env-driven from core.settings.
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "core.settings")

# 2) Initialize Django before importing anything that uses Django
import django
django.setup()

# 3) Now it's safe to import Channels, DRF/Django stuff, and your middleware
from channels.routing import ProtocolTypeRouter, URLRouter
from django.core.asgi import get_asgi_application
from users.jwt_ws import JWTAuthMiddlewareStack
import client_profile.routing

# 4) Build the ASGI application
application = ProtocolTypeRouter({
    "http": get_asgi_application(),
    "websocket": JWTAuthMiddlewareStack(
        URLRouter(client_profile.routing.websocket_urlpatterns)
    ),
})
