"""Characterization of the Talent/Explorer posts API (/api/v1/explorer-posts/)."""
from uuid import uuid4
from datetime import timedelta

from django.test import TestCase
from django.utils import timezone

from client_profile.models import ExplorerOnboarding, OtherStaffOnboarding
from organizations.models import PharmacyAdmin
from talent.models import ExplorerPost, ExplorerPostReaction
from client_profile.characterization_support import (
    BASE, client_for, make_owner_with_pharmacy, make_user,
)

URL = BASE + "explorer-posts/"
PUBLIC_KEYS = ['ahpra_years_since_first_registration', 'author_user_id', 'availability_days', 'availability_mode', 'availability_notice', 'availability_summary', 'body', 'coverage_radius_km', 'created_at', 'explorer_name', 'explorer_profile', 'explorer_role_type', 'explorer_user_id', 'headline', 'id', 'is_anonymous', 'is_liked_by_me', 'like_count', 'location_postcode', 'location_state', 'location_suburb', 'open_to_travel', 'post_kind', 'rating_average', 'rating_count', 'reference_code', 'reply_count', 'role_category', 'role_title', 'skills', 'software', 'travel_states', 'updated_at', 'verification', 'view_count', 'work_types', 'years_experience']


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
        self.assertIsNone(rows[0]["explorer_profile"])
        self.assertIsNone(rows[0]["explorer_user_id"])
        self.assertIsNone(rows[0]["author_user_id"])


class ExplorerAnonymityTests(TestCase):
    def setUp(self):
        self.author = make_user("EXPLORER")
        self.profile = ExplorerOnboarding.objects.create(user=self.author, verified=True)
        self.anonymous = post_for(self.author, "Anonymous pitch", explorer_profile=self.profile)
        self.named = post_for(self.author, "Named pitch", explorer_profile=self.profile, is_anonymous=False)
        owner, pharmacy = make_owner_with_pharmacy()
        admin = make_user("PHARMACY_MANAGER")
        PharmacyAdmin.objects.create(user=admin, pharmacy=pharmacy)
        self.readers = (make_user("PHARMACIST"), owner, admin)

    def assert_identity(self, row, *, masked=False, legacy=False):
        self.assertEqual(row["explorer_profile"], None if masked else self.profile.pk)
        self.assertEqual(row.get("author_user_id"), None if masked or legacy else self.author.pk)
        self.assertEqual(row["explorer_user_id"], None if masked else self.author.pk)
        self.assertEqual(row["explorer_name"], "Anonymous candidate" if masked else self.author.get_full_name())
        if masked:
            self.assertIn("author_user_id", row)

    def test_read_routes_mask_anonymous_posts_for_other_readers(self):
        for reader in (*self.readers, self.author):
            client = client_for(reader)
            for path in ("", "feed/", "public-feed/"):
                with self.subTest(reader=reader.role, path=path):
                    response = client.get(URL + path)
                    self.assertEqual(response.status_code, 200)
                    rows = {row["id"]: row for row in response.json()["results"]}
                    self.assert_identity(rows[self.anonymous.pk], masked=reader != self.author or path == "public-feed/")
                    self.assert_identity(rows[self.named.pk])
                    self.assertIn("no-store", response["Cache-Control"])
            for post in (self.anonymous, self.named):
                with self.subTest(reader=reader.role, post=post.headline):
                    response = client.get(f"{URL}{post.pk}/")
                    self.assertEqual(response.status_code, 200)
                    self.assert_identity(response.json(), masked=post.is_anonymous and reader != self.author)

    def test_profile_lookup_omits_other_readers_anonymous_posts_from_results_and_count(self):
        for reader in (*self.readers, self.author):
            with self.subTest(reader=reader.role):
                response = client_for(reader).get(f"{URL}by-profile/{self.profile.pk}/")
                self.assertEqual(response.status_code, 200)
                data = response.json()
                expected = {self.named.pk, self.anonymous.pk} if reader == self.author else {self.named.pk}
                self.assertEqual(data["count"], len(expected))
                self.assertEqual({row["id"] for row in data["results"]}, expected)
                for row in data["results"]:
                    self.assert_identity(row)

    def test_legacy_anonymous_post_uses_profile_owner_as_author(self):
        legacy = post_for(None, "Legacy pitch", explorer_profile=self.profile)
        for reader in (self.readers[0], self.author):
            with self.subTest(reader=reader.role):
                client = client_for(reader)
                response = client.get(f"{URL}{legacy.pk}/")
                self.assertEqual(response.status_code, 200)
                self.assert_identity(response.json(), masked=reader != self.author, legacy=True)
                response = client.get(f"{URL}by-profile/{self.profile.pk}/")
                self.assertEqual(response.status_code, 200)
                self.assertEqual(legacy.pk in {row["id"] for row in response.json()["results"]}, reader == self.author)


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

    def test_public_qr_reference_lookup_excludes_hidden_and_expired(self):
        self.live.reference_code = "PUBLICLIVE12"
        self.live.save(update_fields=['reference_code'])
        self.expired.reference_code = "EXPIREDWORK12"
        self.expired.save(update_fields=['reference_code'])
        hidden = post_for(self.author, "hidden", reference_code="HIDDENWORK12", hidden_at=timezone.now())
        for code, expected in (
            ("PUBLICLIVE12", ["live"]),
            ("EXPIREDWORK12", []),
            ("HIDDENWORK12", []),
            ("UNKNOWNWORK12", []),
        ):
            with self.subTest(code=code):
                response = client_for().get(URL + "public-feed/", {'reference_code': code})
                self.assertEqual(response.status_code, 200, response.data)
                body = response.data
                rows = body['results'] if isinstance(body, dict) else body
                self.assertEqual([row['headline'] for row in rows], expected)
        self.assertEqual(client_for().get(URL + "public-feed/", {'reference_code': "A" * 101}).status_code, 400)

    def test_plain_list_uses_the_feed_visibility_rule(self):
        self.assertEqual(self._headlines(""), ["fulltime", "live", "undated"])

    def test_hidden_and_expired_posts_cannot_be_read_or_reacted_to(self):
        profile = ExplorerOnboarding.objects.create(user=self.author, verified=True)
        hidden = post_for(self.author, "hidden", explorer_profile=profile, hidden_at=timezone.now())
        self.expired.explorer_profile = profile
        self.expired.save(update_fields=["explorer_profile"])
        for post in (hidden, self.expired):
            for suffix in ("", "view/", "like/", "unlike/"):
                with self.subTest(post=post.headline, suffix=suffix):
                    client = client_for(self.viewer)
                    request = client.post if suffix else client.get
                    self.assertEqual(request(f"{URL}{post.pk}/{suffix}").status_code, 404)
        self.assertEqual(self._headlines(""), ["fulltime", "live", "undated"])
        self.assertEqual(self._headlines(f"by-profile/{profile.pk}/"), [])
        for viewer, path in ((None, "public-feed/"), (self.viewer, "feed/")):
            response = client_for(viewer).get(URL + path, {"mine": "true"})
            self.assertEqual({row["headline"] for row in response.data["results"]}, {"fulltime", "live", "undated"})
        self.assertEqual(client_for(self.viewer).get(f"{URL}{self.live.pk}/").status_code, 200)
        self.assertEqual(client_for(self.viewer).post(f"{URL}{self.live.pk}/like/").status_code, 200)
        self.assertEqual(client_for(self.viewer).post(f"{URL}{self.live.pk}/view/").status_code, 200)

    def test_mine_keeps_expired_posts_available_only_to_their_owner(self):
        profile = ExplorerOnboarding.objects.create(user=self.author, verified=True)
        legacy = ExplorerPost.objects.create(explorer_profile=profile, headline="legacy", hidden_at=timezone.now())
        for user, expected in ((self.author, {self.live.pk, self.expired.pk, self.undated.pk, self.fulltime_old.pk, legacy.pk}),
                               (self.viewer, set())):
            response = client_for(user).get(URL + "?mine=true")
            self.assertEqual(response.status_code, 200)
            self.assertEqual({row["id"] for row in response.data["results"]}, expected)
        response = client_for(self.author).patch(
            f"{URL}{self.expired.pk}/", {"availability_days": [str(timezone.localdate() + timedelta(days=7))]}, format="json")
        self.assertEqual(response.status_code, 200, response.data)
        self.assertIn("expired", self._headlines("feed/"))



class ExplorerCreatePermissionTests(TestCase):
    PAYLOAD = {"headline": "Open to work", "body": "Hello", "post_kind": "AVAILABILITY"}

    def test_owner_role_cannot_create(self):
        owner, _ = make_owner_with_pharmacy()
        res = client_for(owner).post(URL, self.PAYLOAD, format="json", HTTP_IDEMPOTENCY_KEY=str(uuid4()))
        self.assertEqual(res.status_code, 403)
        self.assertIn("Only pharmacists, the pharmacy team and people new to pharmacy", str(res.json()))

    def test_explorer_can_create_and_is_stamped_as_author_with_reference_code(self):
        user = make_user("EXPLORER")
        ExplorerOnboarding.objects.create(user=user, verified=True)
        res = client_for(user).post(URL, self.PAYLOAD, format="json", HTTP_IDEMPOTENCY_KEY=str(uuid4()))
        self.assertEqual(res.status_code, 201)
        post = ExplorerPost.objects.get()
        self.assertEqual(post.author_user, user)
        self.assertEqual(len(post.reference_code), 8)

    def test_unverified_other_staff_cannot_publish(self):
        user = make_user("OTHER_STAFF")
        OtherStaffOnboarding.objects.create(user=user, role_type="ASSISTANT")
        res = client_for(user).post(URL, self.PAYLOAD, format="json", HTTP_IDEMPOTENCY_KEY=str(uuid4()))
        self.assertEqual(res.status_code, 403)
        self.assertIn("Verify your public-platform onboarding", str(res.json()))
        self.assertEqual(ExplorerPost.objects.count(), 0)

    def test_other_staff_without_any_profile_cannot_publish(self):
        res = client_for(make_user("OTHER_STAFF")).post(URL, self.PAYLOAD, format="json", HTTP_IDEMPOTENCY_KEY=str(uuid4()))
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
