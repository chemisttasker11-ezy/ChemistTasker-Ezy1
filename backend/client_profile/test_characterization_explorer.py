"""Characterization of the Talent/Explorer posts API (/api/client-profile/explorer-posts/)."""
from datetime import timedelta

from django.test import TestCase
from django.utils import timezone

from client_profile.models import ExplorerPost, ExplorerPostReaction, OtherStaffOnboarding
from client_profile.characterization_support import (
    BASE, client_for, make_owner_with_pharmacy, make_user,
)

URL = BASE + "explorer-posts/"
PUBLIC_KEYS = ['ahpra_years_since_first_registration', 'author_user_id', 'availability_days', 'availability_mode', 'availability_notice', 'availability_summary', 'body', 'coverage_radius_km', 'created_at', 'explorer_name', 'explorer_profile', 'explorer_role_type', 'explorer_user_id', 'headline', 'id', 'is_anonymous', 'is_liked_by_me', 'like_count', 'location_postcode', 'location_state', 'location_suburb', 'open_to_travel', 'post_kind', 'rating_average', 'rating_count', 'reference_code', 'reply_count', 'role_category', 'role_title', 'skills', 'software', 'travel_states', 'updated_at', 'view_count', 'work_types', 'years_experience']


def post_for(user, headline="Available", **kw):
    return ExplorerPost.objects.create(author_user=user, headline=headline, body="b", **kw)


class ExplorerAuthTests(TestCase):
    def test_authenticated_endpoints_reject_anonymous(self):
        c = client_for()
        for path in ("", "feed/", "by-profile/1/"):
            self.assertIn(c.get(URL + path).status_code, (401, 403), path)

    def test_public_feed_is_open_and_uses_public_shape(self):
        author = make_user("EXPLORER")
        post_for(author)
        res = client_for().get(URL + "public-feed/")
        self.assertEqual(res.status_code, 200)
        body = res.json()
        rows = body["results"] if isinstance(body, dict) else body
        self.assertEqual(len(rows), 1)
        self.assertEqual(sorted(rows[0]), PUBLIC_KEYS)
        # privacy: an anonymous post (the default) must not reveal the author on the public feed
        self.assertTrue(rows[0]["is_anonymous"])
        self.assertEqual(rows[0]["explorer_name"], "Anonymous candidate")
        self.assertIsNone(rows[0]["explorer_user_id"])
        self.assertIsNone(rows[0]["author_user_id"])


class ExplorerVisibilityTests(TestCase):
    def setUp(self):
        self.author = make_user("EXPLORER")
        self.viewer = make_user("PHARMACIST")
        today = timezone.localdate()
        self.live = post_for(self.author, "live", availability_days=[str(today + timedelta(days=3))])
        self.expired = post_for(self.author, "expired", availability_days=[str(today - timedelta(days=3))])
        self.undated = post_for(self.author, "undated")
        self.fulltime_old = post_for(
            self.author, "fulltime", post_kind="FULL_TIME_APPLICATION",
            availability_days=[str(today - timedelta(days=30))])

    def _headlines(self, path):
        body = client_for(self.viewer).get(URL + path).json()
        rows = body["results"] if isinstance(body, dict) else body
        return sorted(r["headline"] for r in rows)

    def test_feed_hides_expired_availability_but_keeps_undated_and_fulltime(self):
        self.assertEqual(self._headlines("feed/"), ["fulltime", "live", "undated"])

    def test_public_feed_applies_same_visibility_rule(self):
        body = client_for().get(URL + "public-feed/").json()
        rows = body["results"] if isinstance(body, dict) else body
        self.assertEqual(sorted(r["headline"] for r in rows), ["fulltime", "live", "undated"])

    def test_plain_list_is_not_filtered_by_visibility(self):
        self.assertEqual(len(self._headlines("")), 4)


class ExplorerCreatePermissionTests(TestCase):
    PAYLOAD = {"headline": "Open to work", "body": "Hello", "post_kind": "AVAILABILITY"}

    def test_owner_role_cannot_create(self):
        owner, _ = make_owner_with_pharmacy()
        res = client_for(owner).post(URL, self.PAYLOAD, format="json")
        self.assertEqual(res.status_code, 403)
        self.assertIn("Only Explorer, Pharmacist, or Other Staff", str(res.json()))

    def test_explorer_can_create_and_is_stamped_as_author_with_reference_code(self):
        user = make_user("EXPLORER")
        res = client_for(user).post(URL, self.PAYLOAD, format="json")
        self.assertEqual(res.status_code, 201)
        post = ExplorerPost.objects.get()
        self.assertEqual(post.author_user, user)
        self.assertEqual(len(post.reference_code), 8)

    def test_unverified_other_staff_cannot_publish(self):
        user = make_user("OTHER_STAFF")
        OtherStaffOnboarding.objects.create(user=user, role_type="ASSISTANT")
        res = client_for(user).post(URL, self.PAYLOAD, format="json")
        self.assertEqual(res.status_code, 403)
        self.assertIn("Verify your public-platform onboarding", str(res.json()))
        self.assertEqual(ExplorerPost.objects.count(), 0)

    def test_other_staff_without_any_profile_cannot_publish(self):
        res = client_for(make_user("OTHER_STAFF")).post(URL, self.PAYLOAD, format="json")
        self.assertEqual(res.status_code, 403)


class ExplorerOwnershipTests(TestCase):
    def setUp(self):
        self.author = make_user("EXPLORER")
        self.other = make_user("EXPLORER")
        self.post = post_for(self.author)

    def test_only_owner_can_delete(self):
        self.assertEqual(client_for(self.other).delete(f"{URL}{self.post.id}/").status_code, 403)
        self.assertTrue(ExplorerPost.objects.filter(pk=self.post.pk).exists())
        self.assertEqual(client_for(self.author).delete(f"{URL}{self.post.id}/").status_code, 204)

    def test_only_owner_can_update(self):
        res = client_for(self.other).patch(f"{URL}{self.post.id}/", {"headline": "hijack"}, format="json")
        self.assertEqual(res.status_code, 403)
        self.post.refresh_from_db()
        self.assertEqual(self.post.headline, "Available")


class ExplorerCountersTests(TestCase):
    def setUp(self):
        self.author = make_user("EXPLORER")
        self.viewer = make_user("PHARMACIST")
        self.post = post_for(self.author)

    def test_view_counter_increments_for_any_authenticated_user(self):
        c = client_for(self.viewer)
        self.assertEqual(c.post(f"{URL}{self.post.id}/view/").json(), {"view_count": 1})
        self.assertEqual(c.post(f"{URL}{self.post.id}/view/").json(), {"view_count": 2})

    def test_like_is_idempotent_per_user_and_unlike_reverses_it(self):
        c = client_for(self.viewer)
        first = c.post(f"{URL}{self.post.id}/like/").json()
        second = c.post(f"{URL}{self.post.id}/like/").json()
        self.assertEqual((first["created"], first["like_count"]), (True, 1))
        self.assertEqual((second["created"], second["like_count"]), (False, 1))
        gone = c.post(f"{URL}{self.post.id}/unlike/").json()
        self.assertEqual((gone["deleted"], gone["like_count"]), (True, 0))
        again = c.post(f"{URL}{self.post.id}/unlike/").json()
        self.assertEqual((again["deleted"], again["like_count"]), (False, 0))
        self.assertEqual(ExplorerPostReaction.objects.count(), 0)

    def test_like_requires_authentication(self):
        self.assertIn(client_for().post(f"{URL}{self.post.id}/like/").status_code, (401, 403))
