"""Characterization of notifications and device tokens (/notifications/, /device-tokens/)."""
from django.test import TestCase

from notifications.models import Notification
from client_profile.characterization_support import BASE, client_for, make_user
from users.models import DeviceToken

URL = BASE + "notifications/"
TOKENS = BASE + "device-tokens/"
FIELDS = {"id", "type", "title", "body", "payload", "action_url", "created_at", "read_at"}


def note(user, title, **kw):
    return Notification.objects.create(user=user, title=title, **kw)


class NotificationTests(TestCase):
    def setUp(self):
        self.user = make_user("PHARMACIST")
        self.other = make_user("PHARMACIST")

    def test_requires_authentication(self):
        self.assertIn(client_for().get(URL).status_code, (401, 403))
        self.assertIn(client_for().post(URL + "mark-read/", {}, format="json").status_code, (401, 403))

    def test_list_is_paginated_own_only_newest_first_with_exact_fields(self):
        first = note(self.user, "first")
        second = note(self.user, "second")
        note(self.other, "theirs")
        body = client_for(self.user).get(URL).json()
        self.assertEqual(set(body), {"count", "next", "previous", "results"})
        self.assertEqual(body["count"], 2)
        self.assertEqual([r["id"] for r in body["results"]], [second.id, first.id])
        self.assertEqual(set(body["results"][0]), FIELDS)

    def test_notifications_are_read_only(self):
        n = note(self.user, "x")
        c = client_for(self.user)
        self.assertEqual(c.post(URL, {"title": "y"}, format="json").status_code, 405)
        self.assertEqual(c.delete(f"{URL}{n.id}/").status_code, 405)

    def test_other_users_notification_detail_is_404(self):
        n = note(self.other, "theirs")
        self.assertEqual(client_for(self.user).get(f"{URL}{n.id}/").status_code, 404)

    def test_mark_read_all_then_unread_count(self):
        note(self.user, "a")
        note(self.user, "b")
        note(self.other, "theirs")
        res = client_for(self.user).post(URL + "mark-read/", {}, format="json")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json(), {"marked": 2, "unread": 0})
        self.assertTrue(Notification.objects.filter(user=self.other, read_at__isnull=True).exists())

    def test_mark_read_selected_ids_only(self):
        a = note(self.user, "a")
        b = note(self.user, "b")
        res = client_for(self.user).post(URL + "mark-read/", {"ids": [a.id]}, format="json")
        self.assertEqual(res.json(), {"marked": 1, "unread": 1})
        b.refresh_from_db()
        self.assertIsNone(b.read_at)

    def test_mark_read_cannot_touch_other_users_notifications(self):
        theirs = note(self.other, "theirs")
        res = client_for(self.user).post(URL + "mark-read/", {"ids": [theirs.id]}, format="json")
        self.assertEqual(res.json()["marked"], 0)
        theirs.refresh_from_db()
        self.assertIsNone(theirs.read_at)

    def test_mark_read_non_list_ids_currently_returns_500(self):
        # KNOWN QUIRK, pinned deliberately: same shadowed-ValidationError cause as pills/claim
        # (django's ValidationError is raised instead of DRF's), so this is a 500, not a 400.
        c = client_for(self.user)
        c.raise_request_exception = False
        res = c.post(URL + "mark-read/", {"ids": "1"}, format="json")
        self.assertEqual(res.status_code, 500)


class DeviceTokenTests(TestCase):
    def setUp(self):
        self.user = make_user("PHARMACIST")
        self.other = make_user("PHARMACIST")

    def test_requires_authentication(self):
        res = client_for().post(TOKENS, {"token": "t", "platform": "ios"}, format="json")
        self.assertIn(res.status_code, (401, 403))

    def test_register_creates_active_token_for_caller(self):
        res = client_for(self.user).post(TOKENS, {"token": "tok-1", "platform": "ios"}, format="json")
        self.assertEqual(res.status_code, 201)
        dt = DeviceToken.objects.get(token="tok-1")
        self.assertEqual((dt.user, dt.platform, dt.active), (self.user, "ios", True))

    def test_same_token_registered_by_another_user_is_reassigned_not_duplicated(self):
        client_for(self.user).post(TOKENS, {"token": "tok-2", "platform": "ios"}, format="json")
        client_for(self.other).post(TOKENS, {"token": "tok-2", "platform": "android"}, format="json")
        self.assertEqual(DeviceToken.objects.filter(token="tok-2").count(), 1)
        dt = DeviceToken.objects.get(token="tok-2")
        self.assertEqual((dt.user, dt.platform), (self.other, "android"))

    def test_missing_fields_is_400(self):
        self.assertEqual(client_for(self.user).post(TOKENS, {"token": "only"}, format="json").status_code, 400)

    def test_cannot_delete_other_users_token(self):
        client_for(self.other).post(TOKENS, {"token": "tok-3", "platform": "ios"}, format="json")
        pk = DeviceToken.objects.get(token="tok-3").pk
        self.assertEqual(client_for(self.user).delete(f"{TOKENS}{pk}/").status_code, 404)
        self.assertTrue(DeviceToken.objects.filter(pk=pk).exists())
