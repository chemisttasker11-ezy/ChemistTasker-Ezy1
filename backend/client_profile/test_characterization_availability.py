"""Characterization of the availability API (/api/client-profile/user-availability/)."""
from django.test import TestCase

from client_profile.models import UserAvailability
from client_profile.characterization_support import BASE, client_for, make_user

URL = BASE + "user-availability/"
FIELDS = {"id", "date", "start_time", "end_time", "is_all_day", "is_recurring", "recurring_days",
          "recurring_end_date", "notify_new_shifts", "notes"}


class AvailabilityTests(TestCase):
    def setUp(self):
        self.user = make_user("PHARMACIST")
        self.other = make_user("PHARMACIST")
        self.payload = {"date": "2026-03-02", "start_time": "09:00:00", "end_time": "17:00:00", "notes": "free"}

    def test_requires_authentication(self):
        self.assertIn(client_for().get(URL).status_code, (401, 403))
        self.assertIn(client_for().post(URL, self.payload, format="json").status_code, (401, 403))

    def test_create_binds_to_request_user_and_returns_exact_fields(self):
        res = client_for(self.user).post(URL, self.payload, format="json")
        self.assertEqual(res.status_code, 201)
        self.assertEqual(set(res.json()), FIELDS)
        self.assertEqual(UserAvailability.objects.get().user, self.user)

    def test_user_cannot_set_another_user_via_payload(self):
        client_for(self.user).post(URL, {**self.payload, "user": self.other.id}, format="json")
        self.assertEqual(UserAvailability.objects.get().user, self.user)

    def test_list_is_scoped_to_own_rows(self):
        client_for(self.user).post(URL, self.payload, format="json")
        client_for(self.other).post(URL, {**self.payload, "notes": "theirs"}, format="json")
        body = client_for(self.user).get(URL).json()
        rows = body["results"] if isinstance(body, dict) else body
        self.assertEqual([r["notes"] for r in rows], ["free"])

    def test_other_users_row_is_404_for_read_update_delete(self):
        client_for(self.other).post(URL, self.payload, format="json")
        pk = UserAvailability.objects.get().pk
        c = client_for(self.user)
        self.assertEqual(c.get(f"{URL}{pk}/").status_code, 404)
        self.assertEqual(c.patch(f"{URL}{pk}/", {"notes": "x"}, format="json").status_code, 404)
        self.assertEqual(c.delete(f"{URL}{pk}/").status_code, 404)
        self.assertEqual(UserAvailability.objects.count(), 1)

    def test_owner_can_update_and_delete(self):
        c = client_for(self.user)
        pk = c.post(URL, self.payload, format="json").json()["id"]
        self.assertEqual(c.patch(f"{URL}{pk}/", {"notes": "changed"}, format="json").json()["notes"], "changed")
        self.assertEqual(c.delete(f"{URL}{pk}/").status_code, 204)
        self.assertEqual(UserAvailability.objects.count(), 0)

    def test_missing_required_fields_is_400(self):
        self.assertEqual(client_for(self.user).post(URL, {"notes": "x"}, format="json").status_code, 400)
