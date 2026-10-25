"""PR200 isolated WebSocket tests: B05 revoked staff after successful connect.

Uses the repository's actual JWT WebSocket middleware, ASGI router, Channel
Layer and two distinct synthetic staff users. Intentional expected-red tests.
"""
from channels.db import database_sync_to_async
from django.test import TransactionTestCase, override_settings

from chat.models import Conversation, Message, Participant
from core.websocket_testing import TIMEOUT, connect, make_actors, new_ticket
from memberships.models import Membership


@database_sync_to_async
def _room(alice_m, bob_m):
    # Membership post_save may have already created this one-per-pharmacy
    # community room. Reuse it to respect uniq_community_chat_per_pharmacy.
    conversation, _ = Conversation.objects.get_or_create(
        pharmacy=alice_m.pharmacy,
        defaults={
            "type": Conversation.Type.GROUP,
            "title": "PR200 B05 synthetic room",
            "created_by": alice_m.user,
        },
    )
    Participant.objects.get_or_create(conversation=conversation, membership=alice_m)
    Participant.objects.get_or_create(conversation=conversation, membership=bob_m)
    return conversation.pk


@database_sync_to_async
def _activate_staff_memberships(*member_ids):
    # The generic characterization helper leaves employment_type blank;
    # a pharmacy community group admits only actual employed local staff.
    for member in Membership.objects.filter(pk__in=member_ids):
        member.employment_type = "FULL_TIME"
        member.is_active = True
        member.status = Membership.Status.ACCEPTED
        member.save(update_fields=["employment_type", "is_active", "status"])


@database_sync_to_async
def _revoke(membership_pk):
    member = Membership.objects.get(pk=membership_pk)
    member.is_active = False
    member.status = Membership.Status.LEFT
    member.save(update_fields=["is_active", "status"])


@database_sync_to_async
def _message_count():
    return Message.objects.count()


@database_sync_to_async
def _participant_exists(membership_pk):
    return Participant.objects.filter(membership_id=membership_pk).exists()


@override_settings(CHANNEL_LAYERS={"default": {"BACKEND": "channels.layers.InMemoryChannelLayer"}})
class B05RevokedWebsocketStillConnected(TransactionTestCase):
    async def _paired(self, prefix):
        alice, alice_m, bob, bob_m, outsider = await make_actors()
        await _activate_staff_memberships(alice_m.pk, bob_m.pk)
        room = await _room(alice_m, bob_m)
        await new_ticket(alice, f"b05-a-{prefix}")
        await new_ticket(bob, f"b05-b-{prefix}")
        a, ok_a, _ = await connect(f"/ws/chat/rooms/{room}/", f"?ticket=b05-a-{prefix}")
        b, ok_b, _ = await connect(f"/ws/chat/rooms/{room}/", f"?ticket=b05-b-{prefix}")
        self.assertTrue(ok_a and ok_b)
        self.assertEqual((await a.receive_json_from(timeout=TIMEOUT))["type"], "ready")
        self.assertEqual((await b.receive_json_from(timeout=TIMEOUT))["type"], "ready")
        return a, b, alice_m

    async def test_b05_active_peer_message_reaches_room_positive(self):
        a, b, member = await self._paired("positive")
        try:
            await a.send_json_to({"type": "message", "body": "permitted hello"})
            event = await b.receive_json_from(timeout=TIMEOUT)
            self.assertEqual(event["type"], "message.created")
            self.assertEqual(event["message"]["body"], "permitted hello")
            self.assertEqual(await _message_count(), 1)
        finally:
            await a.disconnect()
            await b.disconnect()

    async def test_b05_revoke_drops_participant_and_blocks_stale_sender(self):
        a, b, member = await self._paired("revoked-message")
        try:
            await _revoke(member.pk)
            self.assertFalse(await _participant_exists(member.pk))
            await a.send_json_to({"type": "message", "body": "revoked must not persist"})
            # The server must recheck effective membership and refuse a message
            # from a connected-but-no-longer-authorized worker.
            self.assertEqual(
                await _message_count(), 0,
                "Membership-revoked WebSocket must not create a message.",
            )
        finally:
            await a.disconnect()
            await b.disconnect()

    async def test_b05_revoke_prevents_typing_fanout_to_other_staff(self):
        a, b, member = await self._paired("revoked-typing")
        try:
            await _revoke(member.pk)
            self.assertFalse(await _participant_exists(member.pk))
            await a.send_json_to({"type": "typing", "is_typing": True})
            self.assertTrue(
                await b.receive_nothing(timeout=0.7),
                "Revoked staff socket must not broadcast typing to peers.",
            )
        finally:
            await a.disconnect()
            await b.disconnect()
