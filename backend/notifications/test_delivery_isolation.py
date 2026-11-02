"""Independent transports must not suppress push, another recipient, or durable business state."""
from unittest import mock

from django.db import DatabaseError, transaction
from django.test import SimpleTestCase, TestCase

from client_profile.characterization_support import make_user
from notifications.models import Notification
from notifications.services import notify_users
from users.models import DeviceToken


class NotificationDeliveryIsolationTests(TestCase):
    def setUp(self):
        self.users = [make_user("PHARMACIST") for _ in range(2)]
        for i, user in enumerate(self.users):
            DeviceToken.objects.create(user=user, platform="android", token=f"ExponentPushToken[test-{i}]")

    def test_created_broadcast_failure_does_not_suppress_counter_push_or_next_recipient(self):
        def broadcast(user_id, event, payload):
            if event == "notification.created":
                raise RuntimeError("socket offline")
        with mock.patch("notifications.services._broadcast", side_effect=broadcast) as events, mock.patch(
            "notifications.services._send_expo_push",
        ) as push:
            notify_users([u.pk for u in self.users], title="Confirmed", payload={"shift_id": 7})
        self.assertEqual(Notification.objects.count(), 2)
        self.assertEqual(push.call_count, 2)
        self.assertEqual(sum(c.args[1] == "notification.counter" for c in events.call_args_list), 2)

    def test_counter_broadcast_failure_does_not_suppress_push(self):
        def broadcast(user_id, event, payload):
            if event == "notification.counter":
                raise RuntimeError("counter offline")
        with mock.patch("notifications.services._broadcast", side_effect=broadcast), mock.patch(
            "notifications.services._send_expo_push",
        ) as push:
            notify_users([self.users[0].pk], title="Confirmed")
        push.assert_called_once()
        self.assertEqual(Notification.objects.count(), 1)

    def test_push_network_failure_does_not_suppress_next_recipient(self):
        with mock.patch("notifications.services._broadcast") as events, mock.patch(
            "notifications.services.requests.post", side_effect=RuntimeError("push offline"),
        ) as push:
            notify_users([u.pk for u in self.users], title="Confirmed")
        self.assertEqual(push.call_count, 2)
        self.assertEqual(events.call_count, 4)
        self.assertEqual(Notification.objects.count(), 2)

    def test_success_retains_payload_active_tokens_and_active_recipient_filter(self):
        self.users[1].is_active = False
        self.users[1].save(update_fields=["is_active"])
        DeviceToken.objects.create(user=self.users[0], platform="ios", token="inactive", active=False)
        with mock.patch("notifications.services._broadcast") as events, mock.patch(
            "notifications.services._send_expo_push",
        ) as push:
            notify_users([u.pk for u in self.users] * 2, title="Confirmed", body="Body", payload={"shift_id": 7})
        row = Notification.objects.get()
        self.assertEqual(row.user_id, self.users[0].pk)
        self.assertEqual(events.call_count, 2)
        self.assertEqual(events.call_args_list[0].args[2]["notification"]["id"], row.pk)
        push.assert_called_once_with(["ExponentPushToken[test-0]"], title="Confirmed", body="Body", data={"shift_id": 7})

    def test_commit_delivery_waits_and_rollback_discards_row_and_callbacks(self):
        with mock.patch("notifications.services._broadcast") as events, mock.patch("notifications.services._send_expo_push"):
            with self.captureOnCommitCallbacks(execute=True):
                with transaction.atomic():
                    notify_users([self.users[0].pk], title="Committed", deliver_on_commit=True)
                    events.assert_not_called()
            self.assertEqual(events.call_count, 2)
            events.reset_mock()
            with self.captureOnCommitCallbacks(execute=True):
                with self.assertRaisesMessage(RuntimeError, "rollback"), transaction.atomic():
                    notify_users([self.users[0].pk], title="Rolled back", deliver_on_commit=True)
                    raise RuntimeError("rollback")
            events.assert_not_called()
        self.assertEqual(list(Notification.objects.values_list("title", flat=True)), ["Committed"])

    def test_channel_database_error_is_isolated_from_durable_database_reads(self):
        with mock.patch("notifications.services._broadcast", side_effect=DatabaseError("channel database offline")), mock.patch(
            "notifications.services._send_expo_push",
        ) as push:
            notify_users([self.users[0].pk], title="Confirmed")
        push.assert_called_once()
        self.assertEqual(Notification.objects.count(), 1)

    def test_notification_persistence_errors_still_propagate(self):
        with mock.patch("notifications.services.Notification.objects.create", side_effect=ValueError("invalid row")):
            with self.assertRaisesMessage(ValueError, "invalid row"):
                notify_users([self.users[0].pk], title="Invalid")


class NotificationDatabaseBoundaryTests(SimpleTestCase):
    def test_counter_database_failure_is_not_swallowed_as_transport_failure(self):
        from types import SimpleNamespace
        from notifications.services import _deliver_notification
        row = SimpleNamespace(pk=1, user_id=1)
        with mock.patch("notifications.services._serialize_notification", return_value={}), mock.patch(
            "notifications.services._broadcast",
        ), mock.patch("notifications.services.Notification.objects.filter", side_effect=DatabaseError("database offline")), mock.patch(
            "notifications.services._send_expo_push",
        ) as push:
            with self.assertRaisesMessage(DatabaseError, "database offline"):
                _deliver_notification(row)
        push.assert_not_called()
