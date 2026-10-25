"""Characterization of the chat REST API (/rooms/, /messages/, /messages/<id>/react/, /chat-participants/)."""
from django.test import TestCase

from client_profile.models import Membership
from chat.models import Conversation, Message, MessageReaction, Participant
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

    def test_contact_can_list_read_and_reply_to_dm_but_cannot_join_group(self):
        from chat.realtime import participant_can_receive_chat_updates
        room = self.dm(self.alice, self.no_role).json()["id"]
        contact = Membership.objects.get(user=self.no_role)
        self.assertEqual(contact.role, "STUDENT")
        api = client_for(self.no_role)
        self.assertEqual([row["id"] for row in self.rows(api.get(ROOMS))], [room])
        self.assertEqual(api.get(f"{ROOMS}{room}/messages/").status_code, 200)
        reply = api.post(f"{ROOMS}{room}/messages/", {"body": "Contact reply"}, format="json")
        self.assertEqual(reply.status_code, 201, reply.data)
        group = Conversation.objects.create(type="GROUP", pharmacy=self.pharmacy)
        participant = Participant.objects.create(conversation=group, membership=contact)
        self.assertFalse(participant_can_receive_chat_updates(participant))
        self.assertEqual(api.get(f"{ROOMS}{group.pk}/").status_code, 404)

    def test_rest_and_socket_choose_valid_participant_after_legacy_revoked_row(self):
        from asgiref.sync import async_to_sync
        from chat.consumers import RoomConsumer
        from chat.realtime import authorized_participant
        _, other_pharmacy = make_owner_with_pharmacy("Revoked legacy pharmacy")
        Membership.objects.filter(pk=self.alice_m.pk).update(is_active=False)
        valid = Membership.objects.create(
            user=self.alice, pharmacy=other_pharmacy, role="PHARMACIST",
            employment_type="FULL_TIME", status="ACCEPTED", is_active=True,
        )
        room = Conversation.objects.create(type="DM").pk
        Participant.objects.create(conversation_id=room, membership=self.alice_m)
        Participant.objects.create(conversation_id=room, membership=valid)
        Participant.objects.create(conversation_id=room, membership=self.bob_m)
        self.assertEqual(authorized_participant(room, self.alice.pk).membership_id, valid.pk)
        consumer = RoomConsumer()
        self.assertEqual(async_to_sync(consumer._get_membership)(room, self.alice.pk).pk, valid.pk)
        sent = client_for(self.alice).post(MESSAGES, {"conversation": room, "body": "Still authorized"}, format="json")
        self.assertEqual(sent.status_code, 201, sent.data)
        self.assertEqual(Message.objects.get(pk=sent.data["id"]).sender_id, valid.pk)

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

    def test_removing_staff_keeps_their_messages_visible_to_other_participants(self):
        sent = client_for(self.alice).post(
            f"{ROOMS}{self.room}/messages/", {"body": "Keep this history"}, format="json")
        self.assertEqual(sent.status_code, 201, sent.data)
        removed = client_for(self.owner).delete(f"{BASE}memberships/{self.alice_m.pk}/")
        self.assertEqual(removed.status_code, 204)
        self.assertFalse(Membership.objects.filter(pk=self.alice_m.pk).exists())
        self.assertTrue(Message.objects.filter(pk=sent.data["id"]).exists())
        self.assertIsNone(Message.objects.get(pk=sent.data["id"]).sender_id)
        listing = client_for(self.bob).get(f"{ROOMS}{self.room}/messages/")
        self.assertEqual(listing.status_code, 200, listing.data)
        self.assertEqual([(m["id"], m["body"], m["sender"]) for m in self.rows(listing)],
                         [(sent.data["id"], "Keep this history", None)])

    def test_removing_staff_revokes_their_conversation_access(self):
        self.assertEqual(client_for(self.alice).get(f"{ROOMS}{self.room}/").status_code, 200)
        removed = client_for(self.owner).delete(f"{BASE}memberships/{self.alice_m.pk}/")
        self.assertEqual(removed.status_code, 204)
        self.assertFalse(Participant.objects.filter(membership_id=self.alice_m.pk).exists())
        self.assertEqual(client_for(self.alice).get(f"{ROOMS}{self.room}/").status_code, 404)
        self.assertEqual(client_for(self.alice).get(f"{ROOMS}{self.room}/messages/").status_code, 404)
        self.assertEqual(client_for(self.alice).post(
            f"{ROOMS}{self.room}/messages/", {"body": "No access"}, format="json").status_code, 404)
        self.assertEqual(client_for(self.bob).get(f"{ROOMS}{self.room}/").status_code, 200)

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

    def test_edit_to_empty_is_rejected_and_keeps_the_message(self):
        res = client_for(self.alice).patch(f"{MESSAGES}{self.msg_id}/", {"body": ""}, format="json")
        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.json(), {"body": "Message body cannot be empty."})
        m = Message.objects.get(pk=self.msg_id)
        self.assertEqual((m.body, m.is_edited), ("original", False))

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
    def test_custom_group_participants_must_be_visible_on_create_and_update(self):
        _, foreign_pharmacy = make_owner_with_pharmacy("Foreign")
        _, foreign_member = make_staff_member(foreign_pharmacy)
        c = client_for(self.alice)
        for url, field in ((ROOMS, "participants"), (ROOMS + "get-or-create-group/", "participant_ids")):
            denied = c.post(url, {"title": "Foreign", field: [foreign_member.id]}, format="json")
            self.assertEqual(denied.status_code, 400, denied.content)
            self.assertFalse(Participant.objects.filter(membership=foreign_member).exists())
            allowed = c.post(url, {"title": "Team", field: [self.bob_m.id]}, format="json")
            self.assertEqual(allowed.status_code, 201, allowed.content)
            room_id = allowed.json()["id"]
            denied = c.patch(f"{ROOMS}{room_id}/", {"participants": [foreign_member.id]}, format="json")
            self.assertEqual(denied.status_code, 400, denied.content)
            self.assertTrue(Participant.objects.filter(conversation_id=room_id, membership=self.bob_m).exists())

    def test_group_edit_may_resend_existing_members_the_editor_cannot_see(self):
        _, foreign_pharmacy = make_owner_with_pharmacy("Foreign")
        _, foreign_member = make_staff_member(foreign_pharmacy)
        room = Conversation.objects.create(type="GROUP", title="Team", created_by=self.alice)
        Participant.objects.create(conversation=room, membership=self.alice_m, is_admin=True)
        Participant.objects.create(conversation=room, membership=foreign_member)
        res = client_for(self.alice).post(ROOMS + "get-or-create-group/", {"room_id": room.id, "title": "Team", "participant_ids": [foreign_member.id, self.bob_m.id]}, format="json")
        self.assertEqual(res.status_code, 200, res.content)
        self.assertEqual(room.participants.count(), 3)

    def test_plain_room_update_requires_custom_group_creator_or_admin(self):
        room = Conversation.objects.create(type="GROUP", title="Team", created_by=self.alice)
        Participant.objects.create(conversation=room, membership=self.alice_m, is_admin=True)
        Participant.objects.create(conversation=room, membership=self.bob_m)
        for method in ("put", "patch"):
            denied = getattr(client_for(self.bob), method)(f"{ROOMS}{room.id}/", {"title": "Hijack", "participants": [self.bob_m.id]}, format="json")
            self.assertEqual(denied.status_code, 403, denied.content)
            self.assertEqual(room.participants.count(), 2)
        allowed = client_for(self.alice).patch(f"{ROOMS}{room.id}/", {"title": "Renamed", "participants": [self.bob_m.id]}, format="json")
        self.assertEqual(allowed.status_code, 200, allowed.content)
        Membership.objects.filter(pk=self.alice_m.pk).update(employment_type="FULL_TIME")
        room.pharmacy = self.pharmacy
        room.save(update_fields=["pharmacy"])
        denied = client_for(self.alice).patch(f"{ROOMS}{room.id}/", {"participants": [self.alice_m.id]}, format="json")
        self.assertEqual(denied.status_code, 403, denied.content)
        self.assertEqual(room.participants.count(), 2)

    def test_rename_without_participants_preserves_members_but_explicit_list_updates_them(self):
        room = client_for(self.alice).post(ROOMS + "get-or-create-group/", {"title": "Team", "participant_ids": [self.bob_m.id]}, format="json").json()["id"]
        c = client_for(self.alice)
        renamed = c.post(ROOMS + "get-or-create-group/", {"room_id": room, "title": "New title"}, format="json")
        self.assertEqual(renamed.status_code, 200, renamed.content)
        self.assertEqual(Conversation.objects.get(pk=room).title, "New title")
        self.assertSetEqual(set(Participant.objects.filter(conversation_id=room).values_list("membership_id", flat=True)), {self.alice_m.id, self.bob_m.id})
        changed = c.post(ROOMS + "get-or-create-group/", {"room_id": room, "participant_ids": []}, format="json")
        self.assertEqual(changed.status_code, 200, changed.content)
        self.assertEqual(Participant.objects.filter(conversation_id=room).count(), 1)

    def test_deleted_last_message_preview_is_scrubbed_even_for_legacy_body(self):
        room_id = self.dm(self.alice, self.bob).json()["id"]
        msg = Message.objects.create(conversation_id=room_id, sender=self.alice_m, body="Private preview")
        url = f"{ROOMS}{room_id}/"
        self.assertEqual(client_for(self.bob).get(url).json()["last_message"]["body"], "Private preview")
        Message.objects.filter(pk=msg.pk).update(is_deleted=True)
        preview = client_for(self.bob).get(url).json()["last_message"]
        self.assertEqual(preview["body"], "")
        self.assertTrue(preview["is_deleted"])

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
