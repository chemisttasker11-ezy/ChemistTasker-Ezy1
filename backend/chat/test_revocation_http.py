"""Active versus revoked chat participants: HTTP API protection."""
from django.test import TestCase
from rest_framework.test import APIRequestFactory, force_authenticate
from client_profile.characterization_support import (
    BASE, client_for, make_owner_with_pharmacy, make_staff_member,
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


class GroupAdminRevocationContracts(TestCase):
    URL = BASE + "rooms/get-or-create-group/"

    def setUp(self):
        _, self.pharmacy = make_owner_with_pharmacy("F10 chat admins")
        self.alice, self.alice_membership = make_staff_member(self.pharmacy)
        self.bob, self.bob_membership = make_staff_member(self.pharmacy)
        self.room = Conversation.objects.create(type=Conversation.Type.GROUP, title="Team", created_by=self.alice)
        Participant.objects.create(conversation=self.room, membership=self.alice_membership, is_admin=True)
        Participant.objects.create(conversation=self.room, membership=self.bob_membership)

    def edit(self, participant_ids):
        return client_for(self.alice).post(
            self.URL, {"room_id": self.room.pk, "title": "Renamed", "participant_ids": participant_ids}, format="json",
        )

    def assert_unchanged(self):
        self.room.refresh_from_db()
        self.assertEqual(self.room.title, "Team")
        self.assertTrue(self.room.participants.filter(membership=self.bob_membership).exists())

    def test_revoked_creator_admin_cannot_rename_or_remove_members(self):
        Membership.objects.filter(pk=self.alice_membership.pk).update(is_active=False)
        self.assertEqual(self.edit([]).status_code, 404)
        self.assert_unchanged()

    def test_stale_admin_row_does_not_survive_revocation(self):
        _, other_pharmacy = make_owner_with_pharmacy("F10 second pharmacy")
        second = Membership.objects.create(user=self.alice, pharmacy=other_pharmacy, role="ASSISTANT")
        Participant.objects.create(conversation=self.room, membership=second)
        Membership.objects.filter(pk=self.alice_membership.pk).update(is_active=False)
        self.room.created_by = self.bob
        self.room.save(update_fields=["created_by"])
        self.assertEqual(self.edit([]).status_code, 403)
        self.assert_unchanged()

    def test_active_admin_can_still_rename_and_keep_members(self):
        response = self.edit([self.alice_membership.pk, self.bob_membership.pk])
        self.assertEqual(response.status_code, 200, response.data)
        self.room.refresh_from_db()
        self.assertEqual(self.room.title, "Renamed")
        self.assertTrue(self.room.participants.filter(membership=self.bob_membership).exists())

    def test_pending_invitee_cannot_join_community_chat(self):
        invitee, _ = make_staff_member(self.pharmacy, status=Membership.Status.PENDING)
        Membership.objects.filter(user=invitee).update(is_active=False, employment_type="FULL_TIME")
        response = client_for(invitee).post(self.URL, {"pharmacy_id": self.pharmacy.pk}, format="json")
        self.assertEqual(response.status_code, 403)
        self.assertFalse(Participant.objects.filter(membership__user=invitee).exists())
