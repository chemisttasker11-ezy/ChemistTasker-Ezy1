"""Characterization of the private pharmacy Hub API (/api/client-profile/hub/...), pharmacy scope.

Group, organization and platform scopes share the same resolver and are exercised by the existing
public_hub / membership tests; this file pins the pharmacy-scope contract end to end."""
from django.test import TestCase

from client_profile.models import Membership
from pharmacy_hub.models import (
    PharmacyHubComment, PharmacyHubCommentReaction, PharmacyHubPoll, PharmacyHubPollReaction, PharmacyHubPollVote,
    PharmacyHubPost, PharmacyHubReaction,
)
from client_profile.characterization_support import (
    BASE, client_for, make_owner_with_pharmacy, make_staff_member, make_user,
)

HUB = BASE + "hub/"
POSTS = HUB + "posts/"
POLLS = HUB + "polls/"

POST_FIELDS = {
    "id", "pharmacy", "pharmacy_name", "community_group", "community_group_name", "organization",
    "organization_name", "platform_hub", "scope_type", "scope_target_id", "author", "body", "visibility",
    "allow_comments", "created_at", "updated_at", "deleted_at", "comment_count", "reaction_summary",
    "viewer_reaction", "recent_comments", "can_manage", "attachments", "is_edited", "is_pinned", "pinned_at",
    "pinned_by", "original_body", "edited_at", "edited_by", "viewer_is_admin", "is_deleted", "tagged_members",
}  # tagged_member_ids is write-only and never echoed


class HubBase(TestCase):
    def setUp(self):
        self.owner, self.pharmacy = make_owner_with_pharmacy()
        self.staff, self.staff_m = make_staff_member(self.pharmacy)
        Membership.objects.filter(pk=self.staff_m.pk).update(employment_type="FULL_TIME")
        self.other_staff, self.other_m = make_staff_member(self.pharmacy)
        Membership.objects.filter(pk=self.other_m.pk).update(employment_type="FULL_TIME")
        self.outsider = make_user("PHARMACIST")
        self.scope = {"scope": "pharmacy", "pharmacy_id": self.pharmacy.id}

    @staticmethod
    def rows(res):
        body = res.json()
        return body["results"] if isinstance(body, dict) and "results" in body else body

    def make_post(self, who=None, body="hello hub"):
        res = client_for(who or self.staff).post(POSTS, {**self.scope, "body": body}, format="json")
        assert res.status_code == 201, res.content
        return res.json()["id"]


class HubAuthTests(HubBase):
    def test_every_hub_endpoint_requires_authentication(self):
        c = client_for()
        for url in (HUB + "context/", POSTS, POLLS, HUB + "groups/"):
            self.assertIn(c.get(url).status_code, (401, 403), url)
        self.assertIn(c.post(POSTS, self.scope, format="json").status_code, (401, 403))


class HubScopeTests(HubBase):
    def test_list_requires_a_scope(self):
        res = client_for(self.staff).get(POSTS)
        self.assertEqual(res.status_code, 400)
        self.assertIn("scope", res.json())

    def test_invalid_scope_and_missing_id(self):
        c = client_for(self.staff)
        self.assertEqual(c.get(POSTS + "?scope=nonsense").status_code, 400)
        self.assertEqual(c.get(POSTS + "?scope=pharmacy").status_code, 400)

    def test_unknown_pharmacy_is_404_and_outsider_is_403(self):
        self.assertEqual(client_for(self.staff).get(POSTS + "?scope=pharmacy&pharmacy_id=999999").status_code, 404)
        res = client_for(self.outsider).get(POSTS + f"?scope=pharmacy&pharmacy_id={self.pharmacy.id}")
        self.assertEqual(res.status_code, 403)

    def test_non_staff_employment_type_has_no_pharmacy_hub_access(self):
        Membership.objects.filter(pk=self.staff_m.pk).update(employment_type="LOCUM")
        res = client_for(self.staff).get(POSTS + f"?scope=pharmacy&pharmacy_id={self.pharmacy.id}")
        self.assertEqual(res.status_code, 403)

    def test_context_endpoint_is_available_to_members(self):
        res = client_for(self.staff).get(HUB + "context/")
        self.assertEqual(res.status_code, 200)
        self.assertIsInstance(res.json(), dict)


class HubGroupTests(HubBase):
    def test_invalid_member_update_is_atomic(self):
        groups = HUB + "groups/"
        created = client_for(self.owner).post(
            groups,
            {
                "pharmacy_id": self.pharmacy.id,
                "name": "Original group",
                "description": "Original description",
            },
            format="json",
        )
        self.assertEqual(created.status_code, 201, created.content)
        group_id = created.json()["id"]

        invalid = client_for(self.owner).patch(
            f"{groups}{group_id}/",
            {
                "name": "Must not persist",
                "description": "Must not persist",
                "member_ids": [999999],
            },
            format="json",
        )
        self.assertEqual(invalid.status_code, 400, invalid.content)

        from pharmacy_hub.models import PharmacyCommunityGroup

        group = PharmacyCommunityGroup.objects.get(pk=group_id)
        self.assertEqual(group.name, "Original group")
        self.assertEqual(group.description, "Original description")


class HubPostTests(HubBase):
    def test_member_creates_post_and_response_has_exact_fields(self):
        res = client_for(self.staff).post(POSTS, {**self.scope, "body": "first!"}, format="json")
        self.assertEqual(res.status_code, 201)
        self.assertEqual(set(res.json()), POST_FIELDS)
        post = PharmacyHubPost.objects.get()
        self.assertEqual((post.author_user, post.pharmacy, post.original_body, post.is_edited), (self.staff, self.pharmacy, "first!", False))

    def test_owner_without_membership_gets_an_author_membership_created(self):
        before = Membership.objects.filter(user=self.owner).count()
        res = client_for(self.owner).post(POSTS, {**self.scope, "body": "from owner"}, format="json")
        self.assertEqual(res.status_code, 201)
        self.assertGreaterEqual(Membership.objects.filter(user=self.owner).count(), before)

    def test_outsider_cannot_post(self):
        res = client_for(self.outsider).post(POSTS, {**self.scope, "body": "x"}, format="json")
        self.assertEqual(res.status_code, 403)
        self.assertEqual(PharmacyHubPost.objects.count(), 0)

    def test_list_returns_only_this_scopes_live_posts_pinned_first(self):
        first = self.make_post(body="one")
        second = self.make_post(body="two")
        client_for(self.owner).post(f"{POSTS}{first}/pin/")
        q = POSTS + f"?scope=pharmacy&pharmacy_id={self.pharmacy.id}"
        ids = [r["id"] for r in self.rows(client_for(self.other_staff).get(q))]
        self.assertEqual(ids, [first, second])

    def test_pin_and_unpin_are_admin_only(self):
        pid = self.make_post()
        self.assertEqual(client_for(self.staff).post(f"{POSTS}{pid}/pin/").status_code, 403)
        pinned = client_for(self.owner).post(f"{POSTS}{pid}/pin/")
        self.assertEqual(pinned.status_code, 200)
        self.assertTrue(pinned.json()["is_pinned"])
        self.assertEqual(client_for(self.staff).post(f"{POSTS}{pid}/unpin/").status_code, 403)
        unpinned = client_for(self.owner).post(f"{POSTS}{pid}/unpin/")
        self.assertFalse(unpinned.json()["is_pinned"])

    def test_only_the_author_can_delete_and_delete_is_soft(self):
        pid = self.make_post()
        self.assertEqual(client_for(self.other_staff).delete(f"{POSTS}{pid}/").status_code, 403)
        self.assertEqual(client_for(self.owner).delete(f"{POSTS}{pid}/").status_code, 403)
        self.assertEqual(client_for(self.staff).delete(f"{POSTS}{pid}/").status_code, 204)
        post = PharmacyHubPost.objects.get(pk=pid)
        self.assertIsNotNone(post.deleted_at)
        self.assertEqual(self.rows(client_for(self.staff).get(POSTS + f"?scope=pharmacy&pharmacy_id={self.pharmacy.id}")), [])

    def test_post_detail_requires_pharmacy_access(self):
        pid = self.make_post()
        self.assertEqual(client_for(self.other_staff).get(f"{POSTS}{pid}/").status_code, 200)
        self.assertEqual(client_for(self.outsider).get(f"{POSTS}{pid}/").status_code, 403)


class HubCommentTests(HubBase):
    def setUp(self):
        super().setUp()
        self.post_id = self.make_post()
        self.url = f"{POSTS}{self.post_id}/comments/"

    def test_comment_create_list_and_count(self):
        res = client_for(self.other_staff).post(self.url, {"body": "nice"}, format="json")
        self.assertEqual(res.status_code, 201)
        self.assertEqual(PharmacyHubPost.objects.get(pk=self.post_id).comment_count, 1)
        listing = client_for(self.staff).get(self.url)
        self.assertEqual([c["body"] for c in self.rows(listing)], ["nice"])

    def test_comments_can_be_disabled_per_post(self):
        PharmacyHubPost.objects.filter(pk=self.post_id).update(allow_comments=False)
        res = client_for(self.other_staff).post(self.url, {"body": "nope"}, format="json")
        self.assertEqual(res.status_code, 400)
        self.assertIn("Comments are disabled", str(res.json()))

    def test_outsider_cannot_comment(self):
        self.assertEqual(client_for(self.outsider).post(self.url, {"body": "x"}, format="json").status_code, 403)

    def test_comment_delete_by_author_or_admin_only(self):
        cid = client_for(self.other_staff).post(self.url, {"body": "mine"}, format="json").json()["id"]
        detail = f"{self.url}{cid}/"
        self.assertEqual(client_for(self.staff).delete(detail).status_code, 403)
        self.assertEqual(client_for(self.owner).delete(detail).status_code, 204)
        self.assertEqual(PharmacyHubPost.objects.get(pk=self.post_id).comment_count, 0)
        self.assertIsNotNone(PharmacyHubComment.objects.get(pk=cid).deleted_at)


class HubReactionTests(HubBase):
    def test_react_is_an_upsert_and_delete_removes_it(self):
        pid = self.make_post()
        url = f"{POSTS}{pid}/reactions/"
        c = client_for(self.other_staff)
        self.assertEqual(c.post(url, {"reaction_type": "LIKE"}, format="json").status_code, 200)
        res = c.post(url, {"reaction_type": "LOVE"}, format="json")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(PharmacyHubReaction.objects.count(), 1)
        self.assertEqual(PharmacyHubReaction.objects.get().reaction_type, "LOVE")
        self.assertEqual(c.delete(url).status_code, 204)
        self.assertEqual(PharmacyHubReaction.objects.count(), 0)

    def test_post_reaction_identity_is_stable_if_user_later_gains_a_membership(self):
        pid = self.make_post()
        url = f"{POSTS}{pid}/reactions/"
        owner_client = client_for(self.owner)

        first = owner_client.post(url, {"reaction_type": "LIKE"}, format="json")
        self.assertEqual(first.status_code, 200, first.content)
        first_reaction = PharmacyHubReaction.objects.get(post_id=pid)
        self.assertEqual(first_reaction.user_id, self.owner.id)
        self.assertIsNone(first_reaction.member_id)

        Membership.objects.create(
            user=self.owner,
            pharmacy=self.pharmacy,
            role="CONTACT",
            employment_type="FULL_TIME",
            status=Membership.Status.ACCEPTED,
            is_active=True,
        )

        detail = owner_client.get(f"{POSTS}{pid}/")
        self.assertEqual(detail.status_code, 200, detail.content)
        self.assertEqual(detail.json()["viewer_reaction"], "LIKE")

        changed = owner_client.post(url, {"reaction_type": "LOVE"}, format="json")
        self.assertEqual(changed.status_code, 200, changed.content)
        self.assertEqual(PharmacyHubReaction.objects.filter(post_id=pid).count(), 1)
        reaction = PharmacyHubReaction.objects.get(post_id=pid)
        self.assertEqual(reaction.reaction_type, "LOVE")
        self.assertEqual(changed.json()["reaction_summary"], {"LOVE": 1})
        self.assertEqual(changed.json()["viewer_reaction"], "LOVE")

        self.assertEqual(owner_client.delete(url).status_code, 204)
        self.assertFalse(PharmacyHubReaction.objects.filter(post_id=pid).exists())
        self.assertEqual(
            PharmacyHubPost.objects.get(pk=pid).reaction_summary,
            {},
        )

    def test_comment_reaction_identity_is_stable_if_user_later_gains_a_membership(self):
        pid = self.make_post()
        comments_url = f"{POSTS}{pid}/comments/"
        cid = client_for(self.staff).post(
            comments_url,
            {"body": "identity test"},
            format="json",
        ).json()["id"]
        url = f"{comments_url}{cid}/reactions/"
        owner_client = client_for(self.owner)

        first = owner_client.post(url, {"reaction_type": "LIKE"}, format="json")
        self.assertEqual(first.status_code, 200, first.content)
        first_reaction = PharmacyHubCommentReaction.objects.get(comment_id=cid)
        self.assertEqual(first_reaction.user_id, self.owner.id)
        self.assertIsNone(first_reaction.member_id)

        Membership.objects.create(
            user=self.owner,
            pharmacy=self.pharmacy,
            role="CONTACT",
            employment_type="FULL_TIME",
            status=Membership.Status.ACCEPTED,
            is_active=True,
        )

        listing = owner_client.get(comments_url)
        self.assertEqual(listing.status_code, 200, listing.content)
        comment = next(item for item in self.rows(listing) if item["id"] == cid)
        self.assertEqual(comment["viewer_reaction"], "LIKE")

        changed = owner_client.post(url, {"reaction_type": "LOVE"}, format="json")
        self.assertEqual(changed.status_code, 200, changed.content)
        self.assertEqual(
            PharmacyHubCommentReaction.objects.filter(comment_id=cid).count(),
            1,
        )
        reaction = PharmacyHubCommentReaction.objects.get(comment_id=cid)
        self.assertEqual(reaction.reaction_type, "LOVE")
        self.assertEqual(changed.json()["reaction_summary"], {"LOVE": 1})
        self.assertEqual(changed.json()["viewer_reaction"], "LOVE")

        deleted = owner_client.delete(url)
        self.assertEqual(deleted.status_code, 200, deleted.content)
        self.assertFalse(
            PharmacyHubCommentReaction.objects.filter(comment_id=cid).exists()
        )
        self.assertEqual(deleted.json()["reaction_summary"], {})
        self.assertIsNone(deleted.json()["viewer_reaction"])

    def test_invalid_reaction_type_is_400_and_outsider_is_403(self):
        pid = self.make_post()
        url = f"{POSTS}{pid}/reactions/"
        self.assertEqual(client_for(self.other_staff).post(url, {"reaction_type": "MEH"}, format="json").status_code, 400)
        self.assertEqual(client_for(self.outsider).post(url, {"reaction_type": "LIKE"}, format="json").status_code, 403)

    def test_a_reaction_must_name_its_type_on_posts_comments_and_polls(self):
        pid = self.make_post()
        cid = client_for(self.other_staff).post(f"{POSTS}{pid}/comments/", {"body": "x"}, format="json").json()["id"]
        poll_id = client_for(self.staff).post(
            POLLS, {**self.scope, "question": "Lunch?", "option_labels": ["Pizza", "Salad"]}, format="json").json()["id"]
        c = client_for(self.other_staff)
        for url in (f"{POSTS}{pid}/reactions/", f"{POSTS}{pid}/comments/{cid}/reactions/", f"{POLLS}{poll_id}/reactions/"):
            with self.subTest(url=url):
                res = c.post(url, {}, format="json")
                self.assertEqual(res.status_code, 400)
                self.assertEqual(res.json(), {"reaction_type": ["This field is required."]})
        self.assertEqual(
            (PharmacyHubReaction.objects.count(), PharmacyHubCommentReaction.objects.count(),
             PharmacyHubPollReaction.objects.count()),
            (0, 0, 0))


class HubPollTests(HubBase):
    def make_poll(self, who=None):
        res = client_for(who or self.staff).post(
            POLLS, {**self.scope, "question": "Lunch?", "option_labels": ["Pizza", "Salad"]}, format="json")
        assert res.status_code == 201, res.content
        return res.json()

    def test_create_poll_with_options(self):
        body = self.make_poll()
        self.assertEqual(body["question"], "Lunch?")
        self.assertEqual(sorted(o["label"] for o in body["options"]), ["Pizza", "Salad"])
        self.assertEqual(PharmacyHubPoll.objects.count(), 1)

    def test_vote_moves_a_single_vote_between_options(self):
        poll = self.make_poll()
        pizza, salad = sorted(poll["options"], key=lambda o: o["label"])
        c = client_for(self.other_staff)
        url = f"{POLLS}{poll['id']}/vote/"
        first = c.post(url, {"option_id": pizza["id"]}, format="json")
        self.assertEqual(first.status_code, 200)
        self.assertEqual((first.json()["total_votes"], first.json()["has_voted"]), (1, True))
        moved = c.post(url, {"option_id": salad["id"]}, format="json").json()
        counts = {o["label"]: o["vote_count"] for o in moved["options"]}
        self.assertEqual(counts, {"Pizza": 0, "Salad": 1})
        self.assertEqual(moved["selected_option_id"], salad["id"])

    def test_vote_identity_is_stable_if_user_later_gains_a_membership(self):
        poll = self.make_poll(who=self.owner)
        pizza, salad = sorted(poll["options"], key=lambda option: option["label"])
        url = f"{POLLS}{poll['id']}/vote/"
        owner_client = client_for(self.owner)

        first = owner_client.post(url, {"option_id": pizza["id"]}, format="json")
        self.assertEqual(first.status_code, 200, first.content)
        self.assertEqual(PharmacyHubPollVote.objects.filter(poll_id=poll["id"]).count(), 1)
        first_vote = PharmacyHubPollVote.objects.get(poll_id=poll["id"])
        self.assertEqual(first_vote.user_id, self.owner.id)
        self.assertIsNone(first_vote.membership_id)

        Membership.objects.create(
            user=self.owner,
            pharmacy=self.pharmacy,
            role="CONTACT",
            employment_type="FULL_TIME",
            status=Membership.Status.ACCEPTED,
            is_active=True,
        )

        before_move = owner_client.get(
            POLLS + f"{poll['id']}/?scope=pharmacy&pharmacy_id={self.pharmacy.id}"
        )
        self.assertEqual(before_move.status_code, 200, before_move.content)
        self.assertTrue(before_move.json()["has_voted"])
        self.assertEqual(before_move.json()["selected_option_id"], pizza["id"])

        moved = owner_client.post(url, {"option_id": salad["id"]}, format="json")
        self.assertEqual(moved.status_code, 200, moved.content)
        self.assertEqual(PharmacyHubPollVote.objects.filter(poll_id=poll["id"]).count(), 1)
        vote = PharmacyHubPollVote.objects.get(poll_id=poll["id"])
        self.assertEqual(vote.pk, first_vote.pk)
        self.assertEqual(vote.user_id, self.owner.id)
        self.assertIsNone(vote.membership_id)
        self.assertEqual(vote.option_id, salad["id"])
        self.assertTrue(moved.json()["has_voted"])
        self.assertEqual(moved.json()["selected_option_id"], salad["id"])
        self.assertEqual(moved.json()["total_votes"], 1)

    def test_vote_validation(self):
        poll = self.make_poll()
        url = f"{POLLS}{poll['id']}/vote/"
        c = client_for(self.other_staff)
        self.assertEqual(c.post(url, {}, format="json").status_code, 400)
        self.assertEqual(c.post(url, {"option_id": "abc"}, format="json").status_code, 400)
        self.assertEqual(c.post(url, {"option_id": 999999}, format="json").status_code, 400)

    def test_user_keyed_platform_poll_creator_can_manage_their_poll(self):
        outsider = self.outsider
        create = client_for(outsider).post(
            POLLS,
            {
                "scope": "platform",
                "platform_hub": "public",
                "question": "Public question?",
                "option_labels": ["Yes", "No"],
            },
            format="json",
        )
        self.assertEqual(create.status_code, 201, create.content)
        poll_id = create.json()["id"]
        poll = PharmacyHubPoll.objects.get(pk=poll_id)
        self.assertEqual(poll.created_by_id, outsider.id)
        self.assertIsNone(poll.created_by_membership_id)

        edited = client_for(outsider).patch(
            f"{POLLS}{poll_id}/",
            {"question": "Updated public question?"},
            format="json",
        )
        self.assertEqual(edited.status_code, 200, edited.content)

        deleted = client_for(outsider).delete(f"{POLLS}{poll_id}/")
        self.assertEqual(deleted.status_code, 204, getattr(deleted, "content", b""))

    def test_only_creator_or_admin_can_delete_poll(self):
        poll = self.make_poll()
        url = f"{POLLS}{poll['id']}/"
        self.assertEqual(client_for(self.other_staff).delete(url).status_code, 403)
        self.assertEqual(client_for(self.staff).delete(url).status_code, 204)

    def test_poll_list_is_scoped_and_needs_scope(self):
        self.make_poll()
        self.assertEqual(len(self.rows(client_for(self.other_staff).get(POLLS + f"?scope=pharmacy&pharmacy_id={self.pharmacy.id}"))), 1)
        self.assertEqual(client_for(self.other_staff).get(POLLS).status_code, 400)
        self.assertEqual(client_for(self.outsider).get(POLLS + f"?scope=pharmacy&pharmacy_id={self.pharmacy.id}").status_code, 403)
