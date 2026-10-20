"""WebSocket routes of the project: every app declares its own, this module mounts them in the original order."""
from chat.routing import websocket_urlpatterns as chat_websocket_urlpatterns
from notifications.routing import websocket_urlpatterns as notifications_websocket_urlpatterns

def websocket_routes():
    from onboarding.routing import websocket_urlpatterns as onboarding_websocket_urlpatterns
    return chat_websocket_urlpatterns + notifications_websocket_urlpatterns + onboarding_websocket_urlpatterns


websocket_urlpatterns = websocket_routes()
