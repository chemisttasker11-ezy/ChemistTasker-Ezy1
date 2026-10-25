"""Characterization of the chat WebSocket: the RoomConsumer (membership check, messages, typing).

Routes are the ones mounted by core/asgi.py: JWTAuthMiddlewareStack(URLRouter(core.routing...)).
Tests are async and use TransactionTestCase because the consumer touches the DB from worker threads."""
from channels.db import database_sync_to_async
from django.test import SimpleTestCase, TransactionTestCase, override_settings
from django.utils import timezone
from unittest.mock import AsyncMock, patch

from chat.models import Conversation, Message, Participant
from memberships.models import Membership
from core.websocket_testing import TIMEOUT, connect, make_actors, new_ticket
from onboarding.models import AhpraCheck, OtherStaffOnboarding
from onboarding.test_ahpra_desktop import NUMBER, TEST_CACHES, result
from onboarding.verification.desktop import apply_ahpra_result


class RoomDeliveryRecheckTests(SimpleTestCase):
    async def test_outgoing_burst_reuses_check_then_rechecks_revocation(self):
        from chat.consumers import RoomConsumer
        consumer = RoomConsumer()
        consumer._ahpra_checked_at = 100.0
        consumer._membership_still_authorized = AsyncMock(side_effect=[True, False])
        consumer._ahpra_suspended = AsyncMock(return_value=False)
        consumer.scope = {"user": None}
        consumer.close = AsyncMock()
        with patch("chat.consumers.time") as clock, patch(
            "channels.generic.websocket.AsyncJsonWebsocketConsumer.send_json", new_callable=AsyncMock,
        ) as send:
            clock.monotonic.return_value = 101.0
            for _ in range(20):
                await consumer.send_json({"type": "typing"})
            consumer._membership_still_authorized.assert_not_awaited()
            self.assertEqual(send.await_count, 20)
            clock.monotonic.return_value = 110.0
            await consumer.send_json({"type": "typing"})
            clock.monotonic.return_value = 115.0
            await consumer.send_json({"type": "typing"})
            consumer.close.assert_not_awaited()
            self.assertEqual(consumer._membership_still_authorized.await_count, 1)
            clock.monotonic.return_value = 120.0
            await consumer.send_json({"type": "typing"})
            consumer.close.assert_awaited_once_with(code=4403)
            self.assertEqual(send.await_count, 22)


@database_sync_to_async
def suspend_chat_user(user, transition=False):
    profile = OtherStaffOnboarding.objects.get(user=user)
    profile.role_type, profile.ahpra_number = 'INTERN', NUMBER
    profile.save(update_fields=['role_type', 'ahpra_number'])
    # Members keep internal chat; the freeze applies to users with no active accepted membership.
    Membership.objects.filter(user=user).update(is_active=False)
    check = AhpraCheck.objects.create(model_name='OtherStaffOnboarding', object_pk=profile.pk,
                                     registration_number=NUMBER, reason='onboarding')
    if transition:
        # The register record must name this worker, or the name mismatch makes it a review, not a suspension.
        apply_ahpra_result(check, result(check.pk, name=f'{user.first_name} {user.last_name}',
                                         registration_status='Suspended'))
    else:
        # Bypass the transition event to prove receive checks the current DB state itself.
        check.status, check.outcome, check.completed_at = 'done', 'rejected', timezone.now()
        check.register_data = {'registration_status': 'Suspended'}
        check.save()


@database_sync_to_async
def message_count():
    return Message.objects.count()


@database_sync_to_async
def make_room_with(users_memberships):
    conv = Conversation.objects.create(type="GROUP", title="room")
    for _, m in users_memberships:
        Participant.objects.create(conversation=conv, membership=m)
    return conv.id


class RoomSocketTests(TransactionTestCase):
    async def test_inactive_contact_can_still_receive_their_direct_messages(self):
        alice, alice_m, bob, bob_m, _ = await make_actors()
        room = await make_room_with([(alice, alice_m), (bob, bob_m)])
        @database_sync_to_async
        def make_contact():
            Conversation.objects.filter(pk=room).update(type='DM')
            Membership.objects.filter(pk=alice_m.pk).update(is_active=False, employment_type='CONTACT')
        await make_contact()
        await new_ticket(alice, 'contact-still-valid')
        a, ok, _ = await connect(f'/ws/chat/rooms/{room}/', '?ticket=contact-still-valid')
        self.assertTrue(ok)
        await a.receive_json_from(timeout=TIMEOUT)
        await a.send_json_to({'type': 'typing', 'is_typing': True})
        self.assertEqual((await a.receive_json_from(timeout=TIMEOUT))['type'], 'typing')
        await a.disconnect()

    async def test_revoked_connections_close_before_receive_or_delivery(self):
        for revocation in ('membership_deleted', 'membership_inactive', 'participant_removed', 'user_inactive'):
            for direction in ('receive', 'deliver'):
                with self.subTest(revocation=revocation, direction=direction):
                    alice, alice_m, bob, bob_m, _ = await make_actors()
                    room = await make_room_with([(alice, alice_m), (bob, bob_m)])
                    await new_ticket(alice, f'revoked-{revocation}-{direction}')
                    a, ok, _ = await connect(f'/ws/chat/rooms/{room}/', f'?ticket=revoked-{revocation}-{direction}')
                    self.assertTrue(ok)
                    await a.receive_json_from(timeout=TIMEOUT)
                    await new_ticket(bob, f'legitimate-{revocation}-{direction}')
                    b, ok, _ = await connect(f'/ws/chat/rooms/{room}/', f'?ticket=legitimate-{revocation}-{direction}')
                    self.assertTrue(ok)
                    await b.receive_json_from(timeout=TIMEOUT)
                    @database_sync_to_async
                    def revoke():
                        if revocation == 'membership_deleted':
                            Membership.objects.filter(pk=alice_m.pk).delete()
                        elif revocation == 'membership_inactive':
                            Membership.objects.filter(pk=alice_m.pk).update(is_active=False)
                        elif revocation == 'participant_removed':
                            Participant.objects.filter(conversation_id=room, membership=alice_m).delete()
                        else:
                            type(alice).objects.filter(pk=alice.pk).update(is_active=False)
                    await revoke()
                    if direction == 'receive':
                        await a.send_json_to({'type': 'message', 'body': 'must not persist'})
                    else:
                        await b.send_json_to({'type': 'typing', 'is_typing': True})
                        self.assertEqual((await b.receive_json_from(timeout=TIMEOUT))['type'], 'typing')
                    self.assertEqual(await a.receive_output(timeout=TIMEOUT), {'type': 'websocket.close', 'code': 4403})
                    self.assertEqual(await message_count(), 0)
                    await a.disconnect()
                    await b.disconnect()

    async def test_anonymous_is_refused_with_4401(self):
        _, ok, code = await connect("/ws/chat/rooms/1/")
        self.assertFalse(ok)
        self.assertEqual(code, 4401)

    async def test_participant_is_accepted_and_told_their_membership(self):
        alice, alice_m, bob, bob_m, _ = await make_actors()
        room = await make_room_with([(alice, alice_m), (bob, bob_m)])
        await new_ticket(alice, "ticket-room-1")
        comm, ok, _ = await connect(f"/ws/chat/rooms/{room}/", "?ticket=ticket-room-1")
        self.assertTrue(ok)
        self.assertEqual(await comm.receive_json_from(timeout=TIMEOUT), {"type": "ready", "membership": alice_m.id})
        await comm.disconnect()

    async def test_non_participant_is_refused_with_4403(self):
        alice, alice_m, bob, bob_m, outsider = await make_actors()
        room = await make_room_with([(alice, alice_m), (bob, bob_m)])
        await new_ticket(outsider, "ticket-room-out")
        _, ok, code = await connect(f"/ws/chat/rooms/{room}/", "?ticket=ticket-room-out")
        self.assertFalse(ok)
        self.assertEqual(code, 4403)

    async def test_sending_a_message_over_the_socket_persists_it_and_fans_out(self):
        alice, alice_m, bob, bob_m, _ = await make_actors()
        room = await make_room_with([(alice, alice_m), (bob, bob_m)])
        await new_ticket(alice, "ticket-a")
        await new_ticket(bob, "ticket-b")
        a, ok_a, _ = await connect(f"/ws/chat/rooms/{room}/", "?ticket=ticket-a")
        b, ok_b, _ = await connect(f"/ws/chat/rooms/{room}/", "?ticket=ticket-b")
        self.assertTrue(ok_a and ok_b)
        await a.receive_json_from(timeout=TIMEOUT)  # ready
        await b.receive_json_from(timeout=TIMEOUT)  # ready
        await a.send_json_to({"type": "message", "body": "hello over ws"})
        got = await b.receive_json_from(timeout=TIMEOUT)
        self.assertEqual(got["type"], "message.created")
        self.assertEqual(got["message"]["body"], "hello over ws")
        self.assertEqual(await message_count(), 1)
        await a.disconnect()
        await b.disconnect()

    async def test_blank_message_is_ignored(self):
        alice, alice_m, bob, bob_m, _ = await make_actors()
        room = await make_room_with([(alice, alice_m), (bob, bob_m)])
        await new_ticket(alice, "ticket-blank")
        a, ok, _ = await connect(f"/ws/chat/rooms/{room}/", "?ticket=ticket-blank")
        self.assertTrue(ok)
        await a.receive_json_from(timeout=TIMEOUT)
        await a.send_json_to({"type": "message", "body": "   "})
        self.assertTrue(await a.receive_nothing(timeout=0.5))
        self.assertEqual(await message_count(), 0)
        await a.disconnect()

    async def test_typing_event_is_broadcast_to_the_room(self):
        alice, alice_m, bob, bob_m, _ = await make_actors()
        room = await make_room_with([(alice, alice_m), (bob, bob_m)])
        await new_ticket(alice, "ticket-ta")
        await new_ticket(bob, "ticket-tb")
        a, _, _ = await connect(f"/ws/chat/rooms/{room}/", "?ticket=ticket-ta")
        b, _, _ = await connect(f"/ws/chat/rooms/{room}/", "?ticket=ticket-tb")
        await a.receive_json_from(timeout=TIMEOUT)
        await b.receive_json_from(timeout=TIMEOUT)
        await a.send_json_to({"type": "typing", "is_typing": True})
        got = await b.receive_json_from(timeout=TIMEOUT)
        self.assertEqual((got["type"], got["membership"], got["is_typing"], got["conversation_id"]),
                         ("typing", alice_m.id, True, room))
        await a.disconnect()
        await b.disconnect()


@override_settings(AHPRA_SOURCE='desktop', CACHES=TEST_CACHES,
                   CHANNEL_LAYERS={'default': {'BACKEND': 'channels.layers.InMemoryChannelLayer'}})
class AhpraRoomSocketTests(TransactionTestCase):
    async def test_receive_rechecks_suspension_before_messages_and_typing(self):
        for kind in ('message', 'typing'):
            with self.subTest(kind=kind):
                alice, alice_m, bob, bob_m, _ = await make_actors()
                room = await make_room_with([(alice, alice_m), (bob, bob_m)])
                await new_ticket(alice, f'ahpra-receive-{kind}')
                comm, ok, _ = await connect(f'/ws/chat/rooms/{room}/', f'?ticket=ahpra-receive-{kind}')
                self.assertTrue(ok)
                await comm.receive_json_from(timeout=TIMEOUT)
                await suspend_chat_user(alice)
                await comm.send_json_to({'type': kind, 'body': 'must not persist', 'is_typing': True})
                event = await comm.receive_output(timeout=TIMEOUT)
                self.assertEqual(event, {'type': 'websocket.close', 'code': 4403})
                self.assertEqual(await message_count(), 0)
                await comm.disconnect()

    async def test_outbound_event_to_frozen_user_closes_socket_without_delivery(self):
        alice, alice_m, bob, bob_m, _ = await make_actors()
        room = await make_room_with([(alice, alice_m), (bob, bob_m)])
        await new_ticket(alice, 'ahpra-send-a')
        await new_ticket(bob, 'ahpra-send-b')
        a, _, _ = await connect(f'/ws/chat/rooms/{room}/', '?ticket=ahpra-send-a')
        b, _, _ = await connect(f'/ws/chat/rooms/{room}/', '?ticket=ahpra-send-b')
        await a.receive_json_from(timeout=TIMEOUT)
        await b.receive_json_from(timeout=TIMEOUT)
        await suspend_chat_user(alice)  # no ahpra.suspended event: only the send-side check can catch it
        with patch('chat.consumers.RoomConsumer.AHPRA_RECHECK_SECONDS', 0):
            await b.send_json_to({'type': 'typing', 'is_typing': True})
            self.assertEqual(await a.receive_output(timeout=TIMEOUT), {'type': 'websocket.close', 'code': 4403})
            self.assertEqual((await b.receive_json_from(timeout=TIMEOUT))['type'], 'typing')
        await a.disconnect()
        await b.disconnect()

    async def test_suspension_transition_closes_all_user_rooms_only_after_commit(self):
        alice, alice_m, bob, bob_m, _ = await make_actors()
        rooms = [await make_room_with([(alice, alice_m), (bob, bob_m)]) for _ in range(2)]
        sockets = []
        for index, room in enumerate(rooms):
            await new_ticket(alice, f'ahpra-close-{index}')
            comm, ok, _ = await connect(f'/ws/chat/rooms/{room}/', f'?ticket=ahpra-close-{index}')
            self.assertTrue(ok)
            await comm.receive_json_from(timeout=TIMEOUT)
            sockets.append(comm)
        await new_ticket(bob, 'ahpra-unaffected')
        other, ok, _ = await connect(f'/ws/chat/rooms/{rooms[0]}/', '?ticket=ahpra-unaffected')
        self.assertTrue(ok)
        await other.receive_json_from(timeout=TIMEOUT)
        with patch('onboarding.verification.state.announce_suspension'):
            await suspend_chat_user(alice, transition=True)
        for comm in sockets:
            self.assertEqual(await comm.receive_output(timeout=TIMEOUT),
                             {'type': 'websocket.close', 'code': 4403})
            await comm.disconnect()
        self.assertTrue(await other.receive_nothing(timeout=0.1))
        await other.send_json_to({'type': 'typing', 'is_typing': True})
        self.assertEqual((await other.receive_json_from(timeout=TIMEOUT))['type'], 'typing')  # still connected
        await other.disconnect()
