"""Characterization of the chat REST API (/rooms/, /messages/, /messages/<id>/react/, /chat-participants/)."""
from django.test import TestCase

from client_profile.models import (
    Conversation, Membership, Message, MessageReaction, Participant,
)
from client_profile.characterization_support import (
    BASE, client_for, make_owner_with_pharmacy, make_staff_member, make_user,
)

ROOMS = BASE + "rooms/"
MESSAGES = BASE + "messages/"
PARTICIPANTS = BASE + "chat-participants/"


class ChatBase(TestCase):
    def setUp(self):
        self.owner, self.pharmacy = make_owner_with_pharmacy()
        self.alice, self.alice_m = make_staff_member(self.pharmacy)
        self.bob, self.bob_m = make_staff_member(self.pharmacy)
        self.no_role = make_user("PHARMACIST")

    @staticmethod
    def rows(res):
        body = res.json()
        return body["results"] if isinstance(body, dict) and "results" in body else body

    def dm(self, a, b):
        res = client_for(a).post(ROOMS + "get-or-create-dm-by-user/", {"partner_user_id": b.id}, format="json")
        return res


class ChatAuthTests(ChatBase):
    def test_all_chat_endpoints_require_authentication(self):
        c = client_for()
        for url in (ROOMS, MESSAGES, PARTICIPANTS, ROOMS + "shift-contacts/"):
            self.assertIn(c.get(url).status_code, (401, 403), url)
        self.assertIn(c.post(ROOMS + "get-or-create-dm-by-user/", {}, format="json").status_code, (401, 403))
        self.assertIn(c.post(f"{MESSAGES}1/react/", {}, format="json").status_code, (401, 403))


class DirectMessageTests(ChatBase):
    def test_first_call_creates_second_returns_same_room(self):
        first = self.dm(self.alice, self.bob)
        second = self.dm(self.alice, self.bob)
        self.assertEqual((first.status_code, second.status_code), (201, 200))
        self.assertEqual(first.json()["id"], second.json()["id"])
        self.assertEqual(Conversation.objects.filter(type="DM").count(), 1)
        self.assertEqual(Participant.objects.count(), 2)

    def test_reverse_direction_reuses_the_same_room(self):
        a = self.dm(self.alice, self.bob)
        b = self.dm(self.bob, self.alice)
        self.assertEqual(a.json()["id"], b.json()["id"])
        self.assertEqual(b.status_code, 200)

    def test_cannot_dm_yourself(self):
        self.assertEqual(self.dm(self.alice, self.alice).status_code, 400)

    def test_sender_needs_an_active_membership(self):
        res = self.dm(self.no_role, self.bob)
        self.assertEqual(res.status_code, 403)
        self.assertIn("active role", res.json()["detail"])

    def test_partner_id_validation(self):
        c = client_for(self.alice)
        self.assertEqual(c.post(ROOMS + "get-or-create-dm-by-user/", {}, format="json").status_code, 400)
        self.assertEqual(
            c.post(ROOMS + "get-or-create-dm-by-user/", {"partner_user_id": 999999}, format="json").status_code, 404)

    def test_partner_without_membership_gets_an_inactive_contact_membership(self):
        # SIDE EFFECT pinned deliberately: starting a chat writes a Membership row for the recipient.
        res = self.dm(self.alice, self.no_role)
        self.assertEqual(res.status_code, 201)
        contact = Membership.objects.get(user=self.no_role)
        self.assertEqual(
            (contact.employment_type, contact.is_active, contact.pharmacy_id, contact.invited_by_id),
            ("CONTACT", False, self.pharmacy.id, self.alice.id))

    def test_room_visibility_is_limited_to_participants(self):
        room = self.dm(self.alice, self.bob).json()["id"]
        self.assertEqual([r["id"] for r in self.rows(client_for(self.alice).get(ROOMS))], [room])
        self.assertEqual([r["id"] for r in self.rows(client_for(self.bob).get(ROOMS))], [room])
        self.assertEqual(self.rows(client_for(self.no_role).get(ROOMS)), [])
        self.assertEqual(client_for(self.no_role).get(f"{ROOMS}{room}/").status_code, 404)


class RoomMessageTests(ChatBase):
    def setUp(self):
        super().setUp()
        self.room = self.dm(self.alice, self.bob).json()["id"]

    def test_post_and_list_messages_in_a_room(self):
        res = client_for(self.alice).post(f"{ROOMS}{self.room}/messages/", {"body": "hello"}, format="json")
        self.assertEqual(res.status_code, 201)
        self.assertEqual(res.json()["body"], "hello")
        listing = client_for(self.bob).get(f"{ROOMS}{self.room}/messages/")
        self.assertEqual(listing.status_code, 200)
        self.assertEqual([m["body"] for m in self.rows(listing)], ["hello"])

    def test_empty_message_is_400(self):
        res = client_for(self.alice).post(f"{ROOMS}{self.room}/messages/", {"body": "   "}, format="json")
        self.assertEqual(res.status_code, 400)
        self.assertEqual(Message.objects.count(), 0)

    def test_non_participant_cannot_read_or_post(self):
        self.assertEqual(client_for(self.no_role).get(f"{ROOMS}{self.room}/messages/").status_code, 404)
        self.assertEqual(
            client_for(self.no_role).post(f"{ROOMS}{self.room}/messages/", {"body": "x"}, format="json").status_code, 404)

    def test_read_updates_participant_position(self):
        res = client_for(self.bob).post(f"{ROOMS}{self.room}/read/")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()["detail"], "Read position updated.")
        self.assertIsNotNone(Participant.objects.get(membership=self.bob_m, conversation_id=self.room).last_read_at)

    def test_sender_message_marks_their_own_read_position(self):
        client_for(self.alice).post(f"{ROOMS}{self.room}/messages/", {"body": "hi"}, format="json")
        self.assertIsNotNone(Participant.objects.get(membership=self.alice_m, conversation_id=self.room).last_read_at)
        self.assertIsNone(Participant.objects.get(membership=self.bob_m, conversation_id=self.room).last_read_at)


class MessageEndpointTests(ChatBase):
    def setUp(self):
        super().setUp()
        self.room = self.dm(self.alice, self.bob).json()["id"]
        self.msg_id = client_for(self.alice).post(
            MESSAGES, {"conversation": self.room, "body": "original"}, format="json").json()["id"]

    def test_create_requires_participation(self):
        res = client_for(self.no_role).post(MESSAGES, {"conversation": self.room, "body": "x"}, format="json")
        self.assertEqual(res.status_code, 403)
        self.assertEqual(
            client_for(self.alice).post(MESSAGES, {"conversation": 999999, "body": "x"}, format="json").status_code, 404)
        self.assertEqual(client_for(self.alice).post(MESSAGES, {"conversation": self.room}, format="json").status_code, 400)

    def test_only_the_sender_can_edit_and_edit_keeps_the_original(self):
        self.assertEqual(client_for(self.bob).patch(f"{MESSAGES}{self.msg_id}/", {"body": "hijack"}, format="json").status_code, 403)
        res = client_for(self.alice).patch(f"{MESSAGES}{self.msg_id}/", {"body": "edited"}, format="json")
        self.assertEqual(res.status_code, 200)
        m = Message.objects.get(pk=self.msg_id)
        self.assertEqual((m.body, m.original_body, m.is_edited), ("edited", "original", True))

    def test_edit_to_empty_currently_returns_500(self):
        # KNOWN QUIRK, pinned deliberately: MessageViewSet.update raises the shadowed (django) ValidationError.
        c = client_for(self.alice)
        c.raise_request_exception = False
        self.assertEqual(c.patch(f"{MESSAGES}{self.msg_id}/", {"body": ""}, format="json").status_code, 500)

    def test_delete_is_a_soft_delete_by_the_sender_only(self):
        self.assertEqual(client_for(self.bob).delete(f"{MESSAGES}{self.msg_id}/").status_code, 403)
        self.assertEqual(client_for(self.alice).delete(f"{MESSAGES}{self.msg_id}/").status_code, 204)
        m = Message.objects.get(pk=self.msg_id)
        self.assertEqual((m.is_deleted, m.body), (True, ""))

    def test_reaction_toggle_change_and_validation(self):
        url = f"{MESSAGES}{self.msg_id}/react/"
        bob = client_for(self.bob)
        self.assertEqual(bob.post(url, {"reaction": "👍"}, format="json").status_code, 201)
        self.assertEqual(bob.post(url, {"reaction": "🔥"}, format="json").status_code, 201)
        self.assertEqual(MessageReaction.objects.get().reaction, "🔥")
        self.assertEqual(bob.post(url, {"reaction": "🔥"}, format="json").status_code, 204)
        self.assertEqual(MessageReaction.objects.count(), 0)
        self.assertEqual(bob.post(url, {"reaction": "x"}, format="json").status_code, 400)

    def test_reaction_requires_participation(self):
        res = client_for(self.no_role).post(f"{MESSAGES}{self.msg_id}/react/", {"reaction": "👍"}, format="json")
        self.assertEqual(res.status_code, 403)

    def test_message_list_is_limited_to_own_conversations(self):
        self.assertEqual(len(self.rows(client_for(self.bob).get(MESSAGES))), 1)
        self.assertEqual(self.rows(client_for(self.no_role).get(MESSAGES)), [])


class CommunityGroupTests(ChatBase):
    def test_staff_member_can_get_or_create_the_pharmacy_community_chat(self):
        Membership.objects.filter(pk=self.alice_m.pk).update(employment_type="FULL_TIME")
        c = client_for(self.alice)
        first = c.post(ROOMS + "get-or-create-group/", {"pharmacy_id": self.pharmacy.id}, format="json")
        second = c.post(ROOMS + "get-or-create-group/", {"pharmacy_id": self.pharmacy.id}, format="json")
        self.assertEqual((first.status_code, second.status_code), (201, 200))
        self.assertEqual(first.json()["id"], second.json()["id"])
        self.assertEqual(Conversation.objects.filter(pharmacy=self.pharmacy, type="GROUP").count(), 1)

    def test_member_without_a_staff_employment_type_is_refused(self):
        # PHARMACY_STAFF_EMPLOYMENT_TYPES = FULL_TIME / PART_TIME / CASUAL; locums etc. are not "staff" here.
        Membership.objects.filter(pk=self.alice_m.pk).update(employment_type="LOCUM")
        res = client_for(self.alice).post(
            ROOMS + "get-or-create-group/", {"pharmacy_id": self.pharmacy.id}, format="json")
        self.assertEqual(res.status_code, 403)

    def test_outsider_cannot_open_the_community_chat(self):
        res = client_for(self.no_role).post(
            ROOMS + "get-or-create-group/", {"pharmacy_id": self.pharmacy.id}, format="json")
        self.assertEqual(res.status_code, 403)

    def test_owner_can_open_the_community_chat(self):
        res = client_for(self.owner).post(
            ROOMS + "get-or-create-group/", {"pharmacy_id": self.pharmacy.id}, format="json")
        self.assertIn(res.status_code, (200, 201))

    def test_chat_participants_lists_memberships_sharing_my_rooms(self):
        self.dm(self.alice, self.bob)
        ids = sorted(r["id"] for r in self.rows(client_for(self.alice).get(PARTICIPANTS)))
        self.assertEqual(ids, sorted([self.alice_m.id, self.bob_m.id]))
        self.assertEqual(self.rows(client_for(self.no_role).get(PARTICIPANTS)), [])
