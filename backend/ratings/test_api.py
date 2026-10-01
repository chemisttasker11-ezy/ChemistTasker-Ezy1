"""Characterization of the Ratings API (/api/client-profile/ratings/)."""
from django.test import TestCase

from ratings.models import Rating, RatingReport
from client_profile.characterization_support import (
    BASE, client_for, make_assignment, make_owner_with_pharmacy, make_staff_member, make_user,
)

URL = BASE + "ratings/"
O2W, W2P = "OWNER_TO_WORKER", "WORKER_TO_PHARMACY"


class RatingsBase(TestCase):
    def setUp(self):
        self.owner, self.pharmacy = make_owner_with_pharmacy()
        self.worker = make_user("PHARMACIST")
        self.stranger = make_user("PHARMACIST")
        make_assignment(self.pharmacy, self.owner, self.worker)


class RatingsAuthTests(RatingsBase):
    def test_requires_authentication(self):
        c = client_for()
        self.assertIn(c.get(URL + "summary/?target_type=worker&target_id=1").status_code, (401, 403))
        self.assertIn(c.post(URL, {}, format="json").status_code, (401, 403))
        self.assertIn(c.get(URL + "pending/").status_code, (401, 403))


class RatingsCreateTests(RatingsBase):
    def test_owner_rates_worker_who_worked_at_their_pharmacy(self):
        res = client_for(self.owner).post(
            URL, {"direction": O2W, "ratee_user": self.worker.id, "stars": 4, "comment": "good"}, format="json")
        self.assertEqual(res.status_code, 201)
        body = res.json()
        self.assertEqual(
            set(body),
            {"id", "direction", "stars", "comment", "rater_user_id", "ratee_user_id", "created_at", "updated_at"})
        # ratee_pharmacy_id is absent (not null) for worker ratings: DRF skips a dotted source whose value is None.
        self.assertEqual((body["stars"], body["ratee_user_id"], body["rater_user_id"]), (4, self.worker.id, self.owner.id))

    def test_rating_again_updates_in_place_with_200(self):
        c = client_for(self.owner)
        c.post(URL, {"direction": O2W, "ratee_user": self.worker.id, "stars": 4}, format="json")
        res = c.post(URL, {"direction": O2W, "ratee_user": self.worker.id, "stars": 2, "comment": "changed"}, format="json")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(Rating.objects.count(), 1)
        self.assertEqual(Rating.objects.get().stars, 2)

    def test_owner_cannot_rate_worker_without_relationship(self):
        res = client_for(self.owner).post(
            URL, {"direction": O2W, "ratee_user": self.stranger.id, "stars": 5}, format="json")
        self.assertEqual(res.status_code, 403)
        self.assertEqual(Rating.objects.count(), 0)

    def test_worker_rates_pharmacy_they_worked_at(self):
        res = client_for(self.worker).post(
            URL, {"direction": W2P, "ratee_pharmacy": self.pharmacy.id, "stars": 5}, format="json")
        self.assertEqual(res.status_code, 201)
        self.assertEqual(res.json()["ratee_pharmacy_id"], self.pharmacy.id)
        self.assertNotIn("ratee_user_id", res.json())

    def test_stranger_cannot_rate_pharmacy(self):
        res = client_for(self.stranger).post(
            URL, {"direction": W2P, "ratee_pharmacy": self.pharmacy.id, "stars": 5}, format="json")
        self.assertEqual(res.status_code, 403)

    def test_validation_rejects_bad_stars_and_wrong_target_shape(self):
        c = client_for(self.owner)
        self.assertEqual(c.post(URL, {"direction": O2W, "ratee_user": self.worker.id, "stars": 6}, format="json").status_code, 400)
        self.assertEqual(c.post(URL, {"direction": O2W, "ratee_pharmacy": self.pharmacy.id, "stars": 3}, format="json").status_code, 400)


class RatingsReadTests(RatingsBase):
    def setUp(self):
        super().setUp()
        client_for(self.owner).post(URL, {"direction": O2W, "ratee_user": self.worker.id, "stars": 4}, format="json")
        client_for(self.worker).post(URL, {"direction": W2P, "ratee_pharmacy": self.pharmacy.id, "stars": 2}, format="json")

    def test_list_requires_target_params(self):
        self.assertEqual(client_for(self.owner).get(URL).status_code, 400)

    def test_list_by_worker_and_pharmacy(self):
        c = client_for(self.stranger)
        for q, expected in ((f"target_type=worker&target_id={self.worker.id}", 4), (f"target_type=pharmacy&target_id={self.pharmacy.id}", 2)):
            body = c.get(URL + "?" + q).json()
            rows = body["results"] if isinstance(body, dict) else body
            self.assertEqual([r["stars"] for r in rows], [expected], q)

    def test_summary_aggregate_and_validation(self):
        c = client_for(self.stranger)
        body = c.get(URL + f"summary/?target_type=worker&target_id={self.worker.id}").json()
        self.assertEqual((body["average"], body["count"]), (4.0, 1))
        self.assertEqual(c.get(URL + "summary/?target_type=nope&target_id=1").status_code, 400)
        self.assertEqual(c.get(URL + "summary/").status_code, 400)

    def test_mine_requires_params(self):
        self.assertEqual(client_for(self.owner).get(URL + "mine/").status_code, 400)

    def test_pending_currently_returns_500(self):
        # KNOWN QUIRK, pinned deliberately: the view filters on `organization__organization_memberships__...`,
        # which is not a valid lookup, so it raises FieldError for every authenticated user.
        # A fix changes behaviour and belongs in its own reviewed change, not in a refactor.
        from django.core.exceptions import FieldError
        c = client_for(self.owner)
        c.raise_request_exception = False
        self.assertEqual(c.get(URL + "pending/").status_code, 500)


class RatingReportTests(RatingsBase):
    def setUp(self):
        super().setUp()
        client_for(self.owner).post(URL, {"direction": O2W, "ratee_user": self.worker.id, "stars": 1}, format="json")
        self.rating = Rating.objects.get()

    def test_only_ratee_can_report(self):
        res = client_for(self.stranger).post(URL + f"{self.rating.id}/report/", {"reason": "a long enough reason"}, format="json")
        self.assertEqual(res.status_code, 403)

    def test_reason_length_rules(self):
        c = client_for(self.worker)
        self.assertEqual(c.post(URL + f"{self.rating.id}/report/", {"reason": "short"}, format="json").status_code, 400)
        self.assertEqual(c.post(URL + f"{self.rating.id}/report/", {"reason": "x" * 2001}, format="json").status_code, 400)

    def test_report_is_created_then_updated_not_duplicated(self):
        c = client_for(self.worker)
        first = c.post(URL + f"{self.rating.id}/report/", {"reason": "this is unfair feedback"}, format="json")
        self.assertEqual(first.status_code, 201)
        self.assertTrue(first.json()["created"])
        self.assertEqual(first.json()["reference"], f"RAT-{first.json()['id']:06d}")
        second = c.post(URL + f"{self.rating.id}/report/", {"reason": "this is still unfair feedback"}, format="json")
        self.assertEqual(second.status_code, 200)
        self.assertFalse(second.json()["created"])
        self.assertEqual(RatingReport.objects.count(), 1)
        self.assertEqual(RatingReport.objects.get().reason, "this is still unfair feedback")
