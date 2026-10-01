"""URL routes of the chat app. Mounted inside client_profile.urls, so public paths and the `client_profile:` route names are unchanged."""
from django.urls import path
from rest_framework.routers import DefaultRouter
from chat.views import ChatParticipantView, ConversationViewSet, MessageReactionView, MessageViewSet


router = DefaultRouter()
router.include_root_view = False   # the API root view is provided once, by client_profile's router
router.register(r'rooms', ConversationViewSet, basename='conversation')
router.register(r'messages', MessageViewSet, basename='message')

urlpatterns = [
    path('messages/<int:message_id>/react/', MessageReactionView.as_view(), name='message-react'),
    path('chat-participants/', ChatParticipantView.as_view(), name='chat-participants-list'),
]
