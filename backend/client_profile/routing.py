from django.urls import path
from client_profile.consumers import NotificationConsumer
from client_profile.domains.chat.consumers import RoomConsumer

websocket_urlpatterns = [
    path("ws/chat/rooms/<int:room_id>/", RoomConsumer.as_asgi()),
    path("ws/notifications/", NotificationConsumer.as_asgi()),
]
