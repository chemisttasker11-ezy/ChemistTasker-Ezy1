"""M4-07: exercise real anonymous community feeds and the isolated public poll vote boundary."""
from django.test import TestCase, override_settings
from django.utils import timezone
from datetime import timedelta

from client_profile.characterization_support import BASE, client_for, make_owner_with_pharmacy, make_user
from organizations.models import Organization
from pharmacy_hub.models import PharmacyHubPost, PharmacyHubPoll, PharmacyHubPollOption, PharmacyHubPollVote


@override_settings(PUBLIC_COMMUNITY_ENABLED=True)
class PublicHubM4Tests(TestCase):
    def setUp(self):
        self.owner, self.pharmacy = make_owner_with_pharmacy("M4 private hub")
        self.group = Organization.objects.create(name="M4 private group")
        self.member = make_user("PHARMACIST", is_otp_verified=True)
        self.outsider = make_user("EXPLORER", is_otp_verified=True)
        self.private_post = PharmacyHubPost.objects.create(
            pharmacy=self.pharmacy, author_user=self.owner, body="SECRET private post"
        )
        self.org_post = PharmacyHubPost.objects.create(
            organization=self.group, author_user=self.owner, body="SECRET org post"
        )
        self.private_poll = PharmacyHubPoll.objects.create(
            pharmacy=self.pharmacy, question="SECRET private poll"
        )
        self.org_poll = PharmacyHubPoll.objects.create(
            organization=self.group, question="SECRET org poll"
        )
        self.public_posts = [PharmacyHubPost.objects.create(
            platform_hub="public", author_user=self.owner,
            body="MATCH community discussion " + str(i) if i % 2 == 0 else "unrelated thread " + str(i)
        ) for i in range(27)]
        self.public_polls = [PharmacyHubPoll.objects.create(
            platform_hub="public", question="Public poll " + str(i), created_by=self.owner
        ) for i in range(26)]
        for poll in self.public_polls:
            PharmacyHubPollOption.objects.create(poll=poll, label="Yes")

    def test_anon_every_role_reads_bounded_pages_without_private_leakage(self):
        for user in (None, self.owner, self.member, self.outsider):
            client = client_for(user)
            for kind in ("posts", "polls"):
                first = client.get(BASE + "public-hub/community/public/" + kind + "/")
                second = client.get(BASE + "public-hub/community/public/" + kind + "/?page=2")
                with self.subTest(role=getattr(user,"role","anonymous"),kind=kind):
                    self.assertEqual(first.status_code,200,first.data)
                    self.assertEqual(second.status_code,200,second.data)
                    self.assertEqual(first.data["count"],27 if kind=="posts" else 26)
                    self.assertEqual(len(first.data["results"]),12)
                    self.assertEqual(len(second.data["results"]),12)
                    self.assertTrue(first.data["next"])
                    self.assertTrue(second.data["next"])
                    self.assertNotIn("SECRET",str(first.data)+str(second.data))
            for kind in ("posts","polls"):
                self.assertEqual(client.get(BASE+"public-hub/community/not-real/"+kind+"/").status_code,404)

    def test_q_trim_200_and_paginate_matches_without_filtering_polls(self):
        client=client_for()
        url=BASE+"public-hub/community/public/posts/"
        response=client.get(url,{"q":" MATCH "})
        self.assertEqual(response.status_code,200,response.data)
        self.assertEqual(response.data["count"],14)
        self.assertTrue(all("MATCH" in row["body"] for row in response.data["results"]))
        nxt=client.get(url,{"q":" MATCH ","page":2})
        self.assertEqual(nxt.data["count"],14)
        self.assertEqual(len(nxt.data["results"]),2)
        self.assertEqual(client.get(url,{"q":"   "}).data["count"],27)
        self.assertEqual(client.get(BASE+"public-hub/community/public/polls/").data["count"],26)

    def test_poll_can_interact_flags_match_role_and_closed_state(self):
        closed=self.public_polls[0]
        closed.is_closed=True
        closed.save(update_fields=["is_closed"])
        for user,eligible in ((None,False),(self.member,True),(self.outsider,True)):
            data=client_for(user).get(BASE+"public-hub/community/public/polls/").data["results"]
            self.assertTrue(data)
            self.assertEqual(data[0]["can_interact"],eligible)
            if data[0]["id"]==closed.pk:self.assertTrue(data[0]["is_closed"])
        outsider_hub=client_for(self.outsider).get(BASE+"public-hub/community/pharmacist/polls/")
        self.assertEqual(outsider_hub.status_code,200)
        self.assertTrue(all(not p["can_interact"] for p in outsider_hub.data["results"]))

    def test_voting_requires_member_and_keeps_one_vote_per_user(self):
        poll=self.public_polls[0]
        option=poll.options.first()
        target=BASE+f"hub/polls/{poll.pk}/vote/"
        self.assertIn(client_for().post(target,{"option_id":option.pk},format="json").status_code,(401,403))
        self.assertEqual(client_for(self.member).post(target,{"option_id":option.pk},format="json").status_code,200)
        self.assertEqual(client_for(self.member).post(target,{"option_id":option.pk},format="json").status_code,200)
        self.assertEqual(PharmacyHubPollVote.objects.filter(poll=poll).count(),1)
        self.assertEqual(client_for(self.member).post(target,{"option_id":-1},format="json").status_code,400)
        self.assertEqual(PharmacyHubPollVote.objects.filter(poll=poll).count(),1)

    def test_vote_collapses_legacy_user_and_membership_rows_for_one_person(self):
        """Positive control: two real pharmacy memberships cannot create two identities."""
        from memberships.models import Membership

        _, second_pharmacy = make_owner_with_pharmacy("M4 second membership pharmacy")
        first = Membership.objects.create(
            user=self.member, pharmacy=self.pharmacy, role="PHARMACIST",
            employment_type="FULL_TIME", status=Membership.Status.ACCEPTED, is_active=True,
        )
        second = Membership.objects.create(
            user=self.member, pharmacy=second_pharmacy, role="PHARMACIST",
            employment_type="CASUAL", status=Membership.Status.ACCEPTED, is_active=True,
        )
        poll = self.public_polls[0]
        yes = poll.options.first()
        no = PharmacyHubPollOption.objects.create(poll=poll,label="No")
        PharmacyHubPollVote.objects.create(poll=poll, option=yes, user=self.member)
        PharmacyHubPollVote.objects.create(poll=poll, option=yes, membership=second)
        yes.vote_count = 2
        yes.save(update_fields=["vote_count"])
        response = client_for(self.member).post(
            BASE+f"hub/polls/{poll.pk}/vote/",{"option_id":no.pk},format="json"
        )
        self.assertEqual(response.status_code,200,getattr(response,"data",None))
        votes = PharmacyHubPollVote.objects.filter(poll=poll)
        self.assertEqual(votes.count(),1)
        self.assertEqual(votes.get().option_id,no.pk)
        yes.refresh_from_db()
        no.refresh_from_db()
        self.assertEqual((yes.vote_count,no.vote_count),(0,1))
        self.assertEqual(first.user_id,second.user_id)
