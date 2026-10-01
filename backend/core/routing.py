"""WebSocket routes of the project: every app declares its own, this module mounts them in the original order."""
from chat.routing import websocket_urlpatterns as chat_websocket_urlpatterns
from notifications.routing import websocket_urlpatterns as notifications_websocket_urlpatterns

websocket_urlpatterns = chat_websocket_urlpatterns + notifications_websocket_urlpatterns
