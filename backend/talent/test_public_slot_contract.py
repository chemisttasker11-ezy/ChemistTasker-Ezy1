"""API regressions for legacy private schedules and the public slot boundary."""
import json
from datetime import timedelta, time

from django.test import TestCase
from django.utils import timezone

from client_profile.characterization_support import BASE, client_for, make_user
from onboarding.models import ExplorerOnboarding, OtherStaffOnboarding, PharmacistOnboarding
from talent.models import ExplorerPost, UserAvailability


PRIVATE_URL = BASE + "user-availability/"
PUBLIC_URL = BASE + "explorer-posts/"


class AvailabilityBoundaryContractTests(TestCase):
    def setUp(self):
        self.workers = []
        for role in ("PHARMACIST", "OTHER_STAFF"):
            user = make_user(role, is_mobile_verified=True)
            if role == "PHARMACIST":
                PharmacistOnboarding.objects.create(user=user, verified=True, ahpra_verified=True)
            else:
                OtherStaffOnboarding.objects.create(user=user, verified=True, role_type="ASSISTANT")
            self.workers.append(user)
        self.day = timezone.localdate() + timedelta(days=7)
        # Both spellings are sent by web/mobile; notes are deliberately authored on mobile.
        self.slot = {
            "date": str(self.day), "start_time": "09:00", "end_time": "17:00",
            "startTime": "09:00", "endTime": "17:00", "is_all_day": False,
            "isAllDay": False, "notes": "After school only",
        }

    def payload(self, slots):
        return {"headline": "Available", "body": "Public pitch", "post_kind": "AVAILABILITY",
                "availability_days": slots}

    def test_legacy_open_ended_metadata_patch_preserves_schedule_for_both_roles(self):
        for user in self.workers:
            for payload in ({"notes": "Updated private note"}, {"notify_new_shifts": True},
                            {"notes": "Same schedule", "is_recurring": True}):
                with self.subTest(role=user.role, payload=payload):
                    row = UserAvailability.objects.create(
                        user=user, date=self.day, start_time=time(9), end_time=time(17),
                        is_recurring=True, recurring_days=[(self.day.weekday() + 1) % 7])
                    response = client_for(user).patch(f"{PRIVATE_URL}{row.pk}/", payload, format="json")
                    self.assertEqual(response.status_code, 200, response.data)
                    row.refresh_from_db()
                    self.assertIsNone(row.recurring_end_date)
                    self.assertTrue(row.is_recurring)
                    for key, value in payload.items():
                        self.assertEqual(getattr(row, key), value)

    def test_schedule_create_put_and_changed_patch_stay_strict_for_both_roles(self):
        for user in self.workers:
            client = client_for(user)
            payload = {"date": str(self.day), "start_time": "09:00", "end_time": "17:00",
                       "is_recurring": True, "recurring_days": [1]}
            for bad_fields in ({}, {"recurring_end_date": str(self.day), "recurring_days": [True]},
                               {"recurring_end_date": str(self.day - timedelta(days=1))},
                               {"recurring_end_date": str(self.day), "end_time": "08:00"}):
                with self.subTest(role=user.role, bad_fields=bad_fields):
                    response = client.post(PRIVATE_URL, {**payload, **bad_fields}, format="json")
                    self.assertEqual(response.status_code, 400, response.data)
            row = UserAvailability.objects.create(user=user, date=self.day, start_time=time(9),
                                                  end_time=time(17), is_recurring=True, recurring_days=[1])
            url = f"{PRIVATE_URL}{row.pk}/"
            self.assertEqual(client.patch(url, {"start_time": "10:00"}, format="json").status_code, 400)
            self.assertEqual(client.put(url, payload, format="json").status_code, 400)
            response = client.patch(url, {"recurring_end_date": str(self.day)}, format="json")
            self.assertEqual(response.status_code, 200, response.data)
            self.assertEqual(client.post(PRIVATE_URL, {**payload, "recurring_end_date": str(self.day)},
                                         format="json").status_code, 201)

    def test_weekday_types_on_create_put_and_unchanged_patch_for_both_roles(self):
        for user in self.workers:
            client = client_for(user)
            payload = {"date": str(self.day), "start_time": "09:00", "end_time": "17:00",
                       "is_recurring": True, "recurring_days": [1], "recurring_end_date": str(self.day)}
            response = client.post(PRIVATE_URL, payload, format="json")
            self.assertEqual(response.status_code, 201, response.data)
            row = UserAvailability.objects.get(pk=response.data["id"])
            url = f"{PRIVATE_URL}{row.pk}/"
            self.assertEqual(client.patch(url, {"recurring_days": [1]}, format="json").status_code, 200)
            for value in (True, False, 1.0):
                with self.subTest(role=user.role, value=value):
                    row.recurring_days = [0 if value is False else 1]
                    row.save(update_fields=["recurring_days"])
                    for method, target, body in (
                        ("post", PRIVATE_URL, {**payload, "recurring_days": [value]}),
                        ("put", url, {**payload, "recurring_days": [value]}),
                        ("patch", url, {"recurring_days": [value]}),
                    ):
                        response = getattr(client, method)(target, body, format="json")
                        self.assertEqual(response.status_code, 400, (method, response.data))
                    row.refresh_from_db()
                    self.assertEqual(row.recurring_days, [0 if value is False else 1])

    def test_public_legacy_slots_survive_editor_round_trip_for_both_roles(self):
        for user in self.workers:
            second = {**self.slot, "date": str(self.day + timedelta(days=1)),
                      "isAllDay": "invalid", "notes": "Keep this note"}
            first = {**self.slot, "notes": None, "private_notes": "Secret"}
            post = ExplorerPost.objects.create(author_user=user, role_category=user.role,
                                               **self.payload([first, second]))
            client = client_for(user)
            response = client.get(f"{PUBLIC_URL}{post.pk}/")
            self.assertEqual(response.status_code, 200, response.data)
            expected_first = {k: v for k, v in first.items() if k not in ("notes", "private_notes")}
            expected_second = {k: v for k, v in second.items() if k != "isAllDay"}
            projected = [expected_first, expected_second]
            self.assertEqual(response.data["availability_days"], projected)
            response = client.patch(f"{PUBLIC_URL}{post.pk}/", {"availability_days": projected}, format="json")
            self.assertEqual(response.status_code, 200, response.data)
            post.refresh_from_db()
            self.assertEqual(post.availability_days, projected)

    def test_private_foreign_legacy_rows_remain_inaccessible_for_both_roles(self):
        for user, other in (self.workers, self.workers[::-1]):
            row = UserAvailability.objects.create(user=other, date=self.day, start_time=time(9),
                                                  end_time=time(17), is_recurring=True, recurring_days=[1])
            client = client_for(user)
            url = f"{PRIVATE_URL}{row.pk}/"
            self.assertEqual(client.get(url).status_code, 404)
            self.assertEqual(client.patch(url, {"notes": "foreign"}, format="json").status_code, 404)
            self.assertEqual(client.delete(url).status_code, 404)
            self.assertNotIn(row.pk, [item["id"] for item in client.get(PRIVATE_URL).data["results"]])
            row.refresh_from_db()
            self.assertEqual(row.notes, "")

    def test_public_post_put_patch_drop_unknown_keys_and_keep_public_notes_for_both_roles(self):
        dirty_slot = {**self.slot, "private_notes": "Secret", "user": 999,
                      "internal": {"notes": "Secret"}, "notify_new_shifts": True}
        for user in self.workers:
            client = client_for(user)
            response = client.post(PUBLIC_URL, self.payload([dirty_slot]), format="json")
            with self.subTest(role=user.role, method="POST"):
                self.assertEqual(response.status_code, 201, response.data)
                self.assertEqual(response.data["availability_days"], [self.slot])
            post = ExplorerPost.objects.get(pk=response.data["id"])
            for method in ("put", "patch"):
                with self.subTest(role=user.role, method=method):
                    response = getattr(client, method)(f"{PUBLIC_URL}{post.pk}/",
                                                       self.payload([dirty_slot]), format="json")
                    self.assertEqual(response.status_code, 200, response.data)
                    self.assertEqual(response.data["availability_days"], [self.slot])
                    post.refresh_from_db()
                    self.assertEqual(post.availability_days, [self.slot])

    def test_public_slot_types_are_validated_for_both_roles(self):
        bad_values = ({"private_notes": "not a list"}, [None], [[self.slot]], [True],
                      [{"notes": "missing date"}], [{**self.slot, "notes": {"private": "secret"}}],
                      [{**self.slot, "notes": 42}], [{**self.slot, "date": "not-a-date"}],
                      [{**self.slot, "start_time": ["09:00"]}],
                      [{**self.slot, "endTime": "not-a-time"}], [{**self.slot, "isAllDay": "false"}])
        for user in self.workers:
            for slots in bad_values:
                with self.subTest(role=user.role, slots=slots):
                    response = client_for(user).post(PUBLIC_URL, self.payload(slots), format="json")
                    self.assertEqual(response.status_code, 400, response.data)
                    self.assertIn("availability_days", response.data)

    def test_public_legacy_date_strings_nullable_times_and_multipart_keep_working(self):
        slots = [str(self.day), {**self.slot, "start_time": None, "end_time": None,
                                "startTime": None, "endTime": None, "is_all_day": True, "isAllDay": True}]
        for user in self.workers:
            for format in ("json", "multipart"):
                with self.subTest(role=user.role, format=format):
                    payload = self.payload(slots if format == "json" else json.dumps(slots))
                    response = client_for(user).post(PUBLIC_URL, payload, format=format)
                    self.assertEqual(response.status_code, 201, response.data)
                    self.assertEqual(response.data["availability_days"], slots)

    def test_public_metadata_patch_keeps_authored_slots_and_notes_for_both_roles(self):
        for user in self.workers:
            post = ExplorerPost.objects.create(author_user=user, role_category=user.role,
                                               **self.payload([self.slot]))
            response = client_for(user).patch(f"{PUBLIC_URL}{post.pk}/", {"headline": "Updated"}, format="json")
            with self.subTest(role=user.role):
                self.assertEqual(response.status_code, 200, response.data)
                self.assertEqual(response.data["availability_days"], [self.slot])
                post.refresh_from_db()
                self.assertEqual(post.availability_days, [self.slot])

    def test_every_public_read_projects_legacy_stored_slots_without_rewriting_for_both_roles(self):
        dirty = [{**self.slot, "private_notes": "Secret", "internal": {"notes": "Secret"}}]
        for user in self.workers:
            # Legacy posts can retain an Explorer profile link after a worker role transition.
            profile = ExplorerOnboarding.objects.create(user=user, verified=True)
            post = ExplorerPost.objects.create(author_user=user, explorer_profile=profile,
                                               role_category=user.role, **self.payload(dirty))
            for path in ("", f"{post.pk}/", "feed/", f"by-profile/{profile.pk}/", "public-feed/", "?mine=true"):
                with self.subTest(role=user.role, path=path):
                    response = client_for(None if path == "public-feed/" else user).get(PUBLIC_URL + path)
                    self.assertEqual(response.status_code, 200, response.data)
                    data = response.data
                    item = data if path == f"{post.pk}/" else next(r for r in data["results"] if r["id"] == post.pk)
                    self.assertEqual(item["availability_days"], [self.slot])
            post.refresh_from_db()
            self.assertEqual(post.availability_days, dirty)

    def test_public_reads_omit_malformed_legacy_values_for_both_roles(self):
        for user in self.workers:
            for stored in ({"private_notes": "Secret"}, [None, ["Secret"],
                           {**self.slot, "notes": {"private": "Secret"}}, self.slot, str(self.day)]):
                with self.subTest(role=user.role, stored=stored):
                    post = ExplorerPost.objects.create(author_user=user, role_category=user.role,
                                                       **self.payload(stored))
                    response = client_for(user).get(f"{PUBLIC_URL}{post.pk}/")
                    self.assertEqual(response.status_code, 200, response.data)
                    self.assertEqual(response.data["availability_days"],
                                     [{k: v for k, v in self.slot.items() if k != "notes"}, self.slot, str(self.day)]
                                     if isinstance(stored, list) else [])

    def test_public_foreign_post_writes_remain_denied_for_both_roles(self):
        for user in self.workers:
            other = make_user(user.role)
            post = ExplorerPost.objects.create(author_user=other, role_category=other.role,
                                               **self.payload([self.slot]))
            client = client_for(user)
            for method in ("put", "patch"):
                response = getattr(client, method)(f"{PUBLIC_URL}{post.pk}/", self.payload([]), format="json")
                self.assertEqual(response.status_code, 403, response.data)
            self.assertEqual(client.delete(f"{PUBLIC_URL}{post.pk}/").status_code, 403)
            post.refresh_from_db()
            self.assertEqual(post.availability_days, [self.slot])
