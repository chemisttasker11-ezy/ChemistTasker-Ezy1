from datetime import datetime, time, timezone as dt_timezone
from unittest import mock
from django.test import TestCase
from client_profile.characterization_support import BASE, client_for, make_user
from notifications.models import Notification, NotificationPushPreference
from notifications.services import notify_users, push_allowed_for_notification
from users.models import DeviceToken

PREFERENCES = BASE + "notification-push-preferences/"

class NotificationPushPreferenceTests(TestCase):
    def setUp(self):
        self.user = make_user("PHARMACIST")
        self.other = make_user("PHARMACIST")
        DeviceToken.objects.create(user=self.user, platform="android", token="ExponentPushToken[pref-test]")

    def test_get_patch_scoped_and_default_is_read_only(self):
        self.assertIn(client_for().get(PREFERENCES).status_code, (401,403))
        self.assertIn(client_for().patch(PREFERENCES, {"push_tasks":False}, format="json").status_code, (401,403))
        self.assertTrue(client_for(self.user).get(PREFERENCES).json()["push_messages"])
        self.assertFalse(NotificationPushPreference.objects.filter(user=self.user).exists())
        response=client_for(self.user).patch(PREFERENCES, {"push_messages":False,"quiet_hours_enabled":True}, format="json")
        self.assertEqual(response.status_code,200)
        self.assertFalse(response.json()["push_messages"])
        self.assertTrue(client_for(self.other).get(PREFERENCES).json()["push_messages"])

    def test_rejects_invalid_time_zone_and_zero_length(self):
        client=client_for(self.user)
        self.assertEqual(client.patch(PREFERENCES, {"time_zone":"Europe/London"},format="json").status_code,400)
        self.assertEqual(client.patch(PREFERENCES, {"quiet_start":"23:00","quiet_end":"23:00","quiet_hours_enabled":True},format="json").status_code,400)

    def test_disabling_push_retains_notification_and_unread_counter(self):
        NotificationPushPreference.objects.create(user=self.user,push_messages=False)
        with mock.patch("notifications.services._broadcast") as broadcast, mock.patch("notifications.services._send_expo_push") as push:
            notify_users([self.user.pk],title="Hello",notification_type=Notification.Type.MESSAGE)
        self.assertEqual(Notification.objects.filter(user=self.user).count(),1)
        self.assertEqual(broadcast.call_count,2)
        push.assert_not_called()

    def test_queensland_quiet_hours_and_alert_override(self):
        NotificationPushPreference.objects.create(user=self.user,quiet_hours_enabled=True,quiet_start=time(22),quiet_end=time(7),time_zone="Australia/Brisbane")
        message=Notification.objects.create(user=self.user,title="Message",type=Notification.Type.MESSAGE)
        alert=Notification.objects.create(user=self.user,title="Urgent",type=Notification.Type.ALERT)
        night=datetime(2026,11,4,13,30,tzinfo=dt_timezone.utc)
        day=datetime(2026,11,4,2,0,tzinfo=dt_timezone.utc)
        self.assertFalse(push_allowed_for_notification(message,now=night))
        self.assertTrue(push_allowed_for_notification(message,now=day))
        self.assertTrue(push_allowed_for_notification(alert,now=night))
        NotificationPushPreference.objects.filter(user=self.user).update(push_alerts=False)
        self.assertFalse(push_allowed_for_notification(alert,now=night))

    def test_sydney_dst_uses_australian_zone(self):
        NotificationPushPreference.objects.create(user=self.user,quiet_hours_enabled=True,quiet_start=time(22),quiet_end=time(7),time_zone="Australia/Sydney")
        note=Notification.objects.create(user=self.user,title="Shift",type=Notification.Type.TASK)
        self.assertFalse(push_allowed_for_notification(note,now=datetime(2027,1,7,12,tzinfo=dt_timezone.utc)))
        self.assertTrue(push_allowed_for_notification(note,now=datetime(2027,1,7,2,tzinfo=dt_timezone.utc)))
