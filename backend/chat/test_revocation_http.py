"""Active versus revoked chat participants: HTTP API protection."""
from django.test import TestCase
from rest_framework.test import APIRequestFactory, force_authenticate
from client_profile.characterization_support import (
    make_owner_with_pharmacy, make_staff_member,
)
from chat.models import Conversation, Participant, Message, MessageReaction
from chat.views import ChatParticipantView, MessageReactionView, MessageViewSet
from memberships.models import Membership


class ChatHttpRevocationContracts(TestCase):
    def setUp(self):
        _, pharmacy = make_owner_with_pharmacy("P6 chat tenants")
        self.alice, self.alice_membership = make_staff_member(pharmacy)
        self.bob, self.bob_membership = make_staff_member(pharmacy)
        self.room = Conversation.objects.create(
            type=Conversation.Type.GROUP, title="P6 custom chat",
        )
        Participant.objects.create(
            conversation=self.room, membership=self.alice_membership,
        )
        Participant.objects.create(
            conversation=self.room, membership=self.bob_membership,
        )
        self.message = Message.objects.create(
            conversation=self.room, sender=self.bob_membership, body="hello",
        )
        self.factory = APIRequestFactory()

    def request(self, view, method, url, user, *, kwargs=None, data=None):
        builder = getattr(self.factory, method.lower())
        req = builder(url, data or {}, format="json")
        force_authenticate(req, user=user)
        return view.as_view()(req, **(kwargs or {}))

    def test_active_member_can_access_participants(self):
        result = self.request(
            ChatParticipantView, "get", "/api/v1/chat-participants/", self.alice,
        )
        self.assertEqual(result.status_code, 200, result.data)
        self.assertTrue(any(row["id"] == self.bob_membership.pk for row in result.data["results"]))

    def test_revoked_member_cannot_list_conversation_participants(self):
        Membership.objects.filter(pk=self.alice_membership.pk).update(is_active=False)
        result = self.request(
            ChatParticipantView, "get", "/api/v1/chat-participants/", self.alice,
        )
        self.assertEqual(result.status_code, 200, result.data)
        self.assertEqual(list(result.data['results']), [])

    def test_revoked_member_cannot_react_to_old_messages(self):
        Membership.objects.filter(pk=self.alice_membership.pk).update(is_active=False)
        response = self.request(
            MessageReactionView, "post",
            f"/api/v1/messages/{self.message.pk}/react/", self.alice,
            kwargs={"message_id": self.message.pk}, data={"reaction": "👍"},
        )
        self.assertEqual(response.status_code, 403, response.data)
        self.assertFalse(MessageReaction.objects.exists())

    def test_revoked_member_cannot_send_message_via_http(self):
        Membership.objects.filter(pk=self.alice_membership.pk).update(is_active=False)
        req = self.factory.post(
            "/api/v1/messages/",
            {"conversation": self.room.pk, "body": "stale room should reject"},
            format="json",
        )
        force_authenticate(req, user=self.alice)
        result = MessageViewSet.as_view({"post": "create"})(req)
        self.assertEqual(result.status_code, 403, result.data)
        self.assertEqual(Message.objects.count(), 1)
