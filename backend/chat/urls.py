"""URL ownership for the chat domain under the canonical API-v1 composition."""
from django.urls import include, path
from rest_framework.routers import DefaultRouter
from chat.views import ChatParticipantView, ConversationViewSet, MessageReactionView, MessageViewSet


rooms_router = DefaultRouter()
rooms_router.include_root_view = False
rooms_router.register(r'rooms', ConversationViewSet, basename='conversation')

messages_router = DefaultRouter()
messages_router.include_root_view = False
messages_router.register(r'messages', MessageViewSet, basename='message')

# Combined router remains available for app-local consumers; client_profile mounts the
# two registries separately to preserve the legacy API-root ordering exactly.
router = DefaultRouter()
router.include_root_view = False
router.registry.extend(rooms_router.registry)
router.registry.extend(messages_router.registry)

urlpatterns = [
    path('messages/<int:message_id>/react/', MessageReactionView.as_view(), name='message-react'),
    path('chat-participants/', ChatParticipantView.as_view(), name='chat-participants-list'),
    path('', include(router.urls)),
]
