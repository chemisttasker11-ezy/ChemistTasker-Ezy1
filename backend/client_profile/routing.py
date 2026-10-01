from django.urls import path

from client_profile.domains.chat.consumers import RoomConsumer
from notifications.routing import websocket_urlpatterns as notification_websocket_urlpatterns

websocket_urlpatterns = [
    path("ws/chat/rooms/<int:room_id>/", RoomConsumer.as_asgi()),
] + notification_websocket_urlpatterns
