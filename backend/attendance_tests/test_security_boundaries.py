"""Focused non-database regressions for security boundaries."""

import os
import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock, Mock, patch

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "attendance_tests.settings")
import django
django.setup()

from django.core.cache import caches
from django.core.exceptions import ValidationError
from django.test import override_settings

from client_profile.attendance_credentials import _count_security_attempt
from client_profile.models import Conversation, ExplorerPost, Message
from client_profile.serializers import (
    ExplorerPostReadSerializer,
    MessageSerializer,
    PublicExplorerPostReadSerializer,
)
from client_profile.views import MessageViewSet
from users.models import User
from users.jwt_ws import JWTAuthMiddleware


class SecurityBoundaryTests(unittest.TestCase):
    def test_cookie_websocket_requires_allowed_origin(self):
        middleware = JWTAuthMiddleware(lambda *_: None)
        cookie = (b"cookie", b"ct_access=secret")
        with override_settings(CORS_ALLOWED_ORIGINS=["https://chemisttasker.com.au"]):
            self.assertIsNone(middleware._get_token_from_scope({"headers": [cookie]}, {}))
            self.assertIsNone(middleware._get_token_from_scope({"headers": [cookie, (b"origin", b"https://evil.example")]}, {}))
            self.assertEqual(middleware._get_token_from_scope({"headers": [cookie, (b"origin", b"https://chemisttasker.com.au")]}, {}), "secret")
            self.assertEqual(middleware._get_token_from_scope({"headers": [(b"authorization", b"Bearer native-token")]}, {}), "native-token")

    def test_shared_attempt_counter_stops_brute_force(self):
        caches["security"].clear()
        _count_security_attempt("security-test-limit", limit=2, window=60)
        _count_security_attempt("security-test-limit", limit=2, window=60)
        with self.assertRaises(ValidationError):
            _count_security_attempt("security-test-limit", limit=2, window=60)

    def test_public_anonymous_post_hides_identity_without_changing_authenticated_feed(self):
        author = User(id=7, first_name="Jane", last_name="Doe")
        post = ExplorerPost(id=3, author_user=author, headline="Available", is_anonymous=True)
        public = PublicExplorerPostReadSerializer(post).data
        authenticated = ExplorerPostReadSerializer(post).data
        self.assertEqual(public["explorer_name"], "Anonymous candidate")
        self.assertIsNone(public["author_user_id"])
        self.assertIsNone(public["explorer_user_id"])
        self.assertEqual(authenticated["author_user_id"], 7)

    def test_deleted_chat_serializer_masks_legacy_original_body(self):
        message = Message(
            id=1, conversation=Conversation(id=2), body="secret",
            original_body="older secret", is_deleted=True,
        )
        message._prefetched_objects_cache = {"reactions": []}
        data = MessageSerializer(message).data
        self.assertEqual(data["body"], "")
        self.assertIsNone(data["original_body"])
        self.assertIsNone(data["attachment_url"])

    def test_chat_delete_removes_attachment_after_save_and_broadcasts(self):
        storage = Mock()
        membership = object()
        participant = SimpleNamespace(membership=membership)
        conversation = MagicMock()
        conversation.participants.filter.return_value.first.return_value = participant
        message = MagicMock()
        message.conversation = conversation
        message.conversation_id = 42
        message.id = 9
        message.sender = membership
        message.attachment.name = "chat/private.txt"
        message.attachment.storage = storage
        view = MessageViewSet()
        view.get_object = Mock(return_value=message)
        with patch("client_profile.views.get_channel_layer") as get_layer, patch("client_profile.views.async_to_sync") as as_sync:
            response = view.destroy(SimpleNamespace(user=object()))
        self.assertEqual(response.status_code, 204)
        self.assertTrue(message.is_deleted)
        self.assertEqual(message.body, "")
        self.assertIsNone(message.original_body)
        self.assertIsNone(message.attachment)
        message.save.assert_called_once()
        storage.delete.assert_called_once_with("chat/private.txt")
        as_sync.assert_called_once_with(get_layer.return_value.group_send)
        as_sync.return_value.assert_called_once_with(
            "room.42", {"type": "message.deleted", "message_id": 9}
        )
