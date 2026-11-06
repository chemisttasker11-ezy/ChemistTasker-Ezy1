"""Contract tests for worker availability ordering, boundary validation and isolation across roles."""
from unittest.mock import patch
from django.test import TestCase
from rest_framework.pagination import PageNumberPagination

from client_profile.characterization_support import BASE, client_for, make_user
from talent.models import UserAvailability
from talent.views.availability import UserAvailabilityViewSet

URL = BASE + "user-availability/"


class TestPagination(PageNumberPagination):
    page_size = 5


class WorkerAvailabilityOrderingAndIsolationContractTests(TestCase):
    def setUp(self):
        self.pharmacist = make_user("PHARMACIST")
        self.other_staff = make_user("OTHER_STAFF")

    @patch.object(UserAvailabilityViewSet, 'pagination_class', TestPagination)
    def test_multi_page_unsorted_insertion_and_equal_datetime_tiebreak_for_both_roles(self):
        for user in [self.pharmacist, self.other_staff]:
            c = client_for(user)
            raw_slots = [
                ("2026-04-10", "14:00:00", "18:00:00"),
                ("2026-04-01", "09:00:00", "17:00:00"),
                ("2026-04-05", "12:00:00", "16:00:00"),
                ("2026-04-05", "08:00:00", "12:00:00"),
                ("2026-04-05", "08:00:00", "12:00:00"),
                ("2026-04-02", "10:00:00", "15:00:00"),
                ("2026-04-12", "09:00:00", "17:00:00"),
                ("2026-04-03", "07:00:00", "11:00:00"),
                ("2026-04-08", "13:00:00", "17:00:00"),
                ("2026-04-07", "09:00:00", "17:00:00"),
                ("2026-04-06", "09:00:00", "17:00:00"),
                ("2026-04-04", "09:00:00", "17:00:00"),
            ]
            created_ids = []
            for d, st, et in raw_slots:
                res = c.post(URL, {"date": d, "start_time": st, "end_time": et}, format="json")
                self.assertEqual(res.status_code, 201)
                created_ids.append(res.json()["id"])

            first_page = c.get(URL).json()
            self.assertIsNotNone(first_page.get("next"))

            results, next_url = [], URL
            for _ in range(5):
                page_data = c.get(next_url).json()
                results.extend(page_data.get("results", []))
                next_url = page_data.get("next")
                if not next_url:
                    break

            self.assertEqual(len(results), 12)
            self.assertEqual({r["id"] for r in results}, set(created_ids))
            tuples = [(r["date"], r["start_time"], r["id"]) for r in results]
            self.assertEqual(tuples, sorted(tuples))

    def test_no_cross_account_data_leak_update_or_delete_between_roles(self):
        c_pharm = client_for(self.pharmacist)
        c_other = client_for(self.other_staff)

        pharm_row = c_pharm.post(URL, {"date": "2026-05-01", "start_time": "09:00:00", "end_time": "17:00:00"}, format="json").json()
        other_row = c_other.post(URL, {"date": "2026-05-02", "start_time": "10:00:00", "end_time": "18:00:00"}, format="json").json()

        pharm_list = c_pharm.get(URL).json()
        pharm_ids = [r["id"] for r in (pharm_list.get("results") if isinstance(pharm_list, dict) else pharm_list)]
        self.assertIn(pharm_row["id"], pharm_ids)
        self.assertNotIn(other_row["id"], pharm_ids)

        self.assertEqual(c_pharm.get(f"{URL}{other_row['id']}/").status_code, 404)
        self.assertEqual(c_pharm.patch(f"{URL}{other_row['id']}/", {"notes": "hack"}, format="json").status_code, 404)
        self.assertEqual(c_pharm.delete(f"{URL}{other_row['id']}/").status_code, 404)

        self.assertEqual(c_other.get(f"{URL}{pharm_row['id']}/").status_code, 404)
        self.assertEqual(c_other.patch(f"{URL}{pharm_row['id']}/", {"notes": "hack"}, format="json").status_code, 404)
        self.assertEqual(c_other.delete(f"{URL}{pharm_row['id']}/").status_code, 404)


class WorkerAvailabilitySerializerValidationContractTests(TestCase):
    def setUp(self):
        self.pharmacist = make_user("PHARMACIST")
        self.other_staff = make_user("OTHER_STAFF")

    def test_positive_controls_and_owner_patch_delete_for_both_roles(self):
        for user in [self.pharmacist, self.other_staff]:
            c = client_for(user)
            r1 = c.post(URL, {"date": "2026-06-01", "start_time": "09:00:00", "end_time": "17:00:00"}, format="json")
            self.assertEqual(r1.status_code, 201)
            pk = r1.json()["id"]

            r_patch = c.patch(f"{URL}{pk}/", {"notes": "changed"}, format="json")
            self.assertEqual(r_patch.status_code, 200)
            self.assertEqual(r_patch.json()["notes"], "changed")

            self.assertEqual(c.delete(f"{URL}{pk}/").status_code, 204)

            r2 = c.post(URL, {"date": "2026-06-02", "start_time": "00:00:00", "end_time": "23:59:59", "is_all_day": True}, format="json")
            self.assertEqual(r2.status_code, 201)

            r3 = c.post(URL, {
                "date": "2026-06-03", "start_time": "08:30:00", "end_time": "16:30:00",
                "is_recurring": True, "recurring_days": [0, 1, 2], "recurring_end_date": "2026-07-03"
            }, format="json")
            self.assertEqual(r3.status_code, 201)

    def test_rejects_end_time_not_after_start_time(self):
        c = client_for(self.pharmacist)
        r1 = c.post(URL, {"date": "2026-06-01", "start_time": "17:00:00", "end_time": "09:00:00"}, format="json")
        self.assertEqual(r1.status_code, 400)
        self.assertIn("end_time", r1.json())

        r2 = c.post(URL, {"date": "2026-06-01", "start_time": "09:00:00", "end_time": "09:00:00"}, format="json")
        self.assertEqual(r2.status_code, 400)
        self.assertIn("end_time", r2.json())

    def test_rejects_invalid_recurring_weekdays_and_ranges(self):
        c = client_for(self.other_staff)
        # weekday > 6
        r1 = c.post(URL, {"date": "2026-06-01", "start_time": "09:00:00", "end_time": "17:00:00", "is_recurring": True, "recurring_days": [7], "recurring_end_date": "2026-06-10"}, format="json")
        self.assertEqual(r1.status_code, 400)
        self.assertIn("recurring_days", r1.json())

        # recurring true with empty weekdays
        r2 = c.post(URL, {"date": "2026-06-01", "start_time": "09:00:00", "end_time": "17:00:00", "is_recurring": True, "recurring_days": [], "recurring_end_date": "2026-06-10"}, format="json")
        self.assertEqual(r2.status_code, 400)
        self.assertIn("recurring_days", r2.json())

        # recurring true missing end date
        r3 = c.post(URL, {"date": "2026-06-01", "start_time": "09:00:00", "end_time": "17:00:00", "is_recurring": True, "recurring_days": [1]}, format="json")
        self.assertEqual(r3.status_code, 400)
        self.assertIn("recurring_end_date", r3.json())

        # recurring end date < start date
        r4 = c.post(URL, {"date": "2026-06-05", "start_time": "09:00:00", "end_time": "17:00:00", "is_recurring": True, "recurring_days": [1], "recurring_end_date": "2026-06-04"}, format="json")
        self.assertEqual(r4.status_code, 400)
        self.assertIn("recurring_end_date", r4.json())

    def test_patch_validation_uses_unchanged_instance_fields(self):
        c = client_for(self.pharmacist)
        created = c.post(URL, {
            "date": "2026-06-10", "start_time": "09:00:00", "end_time": "17:00:00",
            "is_recurring": True, "recurring_days": [1, 2], "recurring_end_date": "2026-06-20"
        }, format="json").json()
        pk = created["id"]

        r_bad_time = c.patch(f"{URL}{pk}/", {"start_time": "18:00:00"}, format="json")
        self.assertEqual(r_bad_time.status_code, 400)
        self.assertIn("end_time", r_bad_time.json())

        r_bad_date = c.patch(f"{URL}{pk}/", {"recurring_end_date": "2026-06-05"}, format="json")
        self.assertEqual(r_bad_date.status_code, 400)
        self.assertIn("recurring_end_date", r_bad_date.json())

    def test_missing_required_fields_rejects_on_create(self):
        c = client_for(self.other_staff)
        r1 = c.post(URL, {"start_time": "09:00:00", "end_time": "17:00:00"}, format="json")
        self.assertEqual(r1.status_code, 400)
        self.assertIn("date", r1.json())
