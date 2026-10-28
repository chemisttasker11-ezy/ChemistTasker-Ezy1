"""PR200 Phase 5: tenant-authorisation red contracts for Hub and chat.

Only isolated Django SQLite test fixtures. All negative safety assertions
are expected to FAIL against vulnerable frozen main. Positive acceptance
controls must pass for these to count as runtime evidence.
No application code is modified by this test module.
"""
from unittest.mock import patch

from django.test import TestCase

from client_profile.characterization_support import (
    client_for, make_owner_with_pharmacy, make_staff_member,
)
from memberships.models import Membership
from pharmacy_hub.models import PharmacyHubPost
from notifications.models import Notification
from chat.models import Conversation, Participant, Message


class Phase5HubMembershipAcceptance(TestCase):
    def setUp(self):
        self.owner, self.pharmacy = make_owner_with_pharmacy("P5 Hub Tenant")
        self.author, self.author_member = make_staff_member(self.pharmacy)
        self.pending, self.pending_member = make_staff_member(
            self.pharmacy, status=Membership.Status.PENDING,
        )
        self.eligible_recipient, self.eligible_member = make_staff_member(self.pharmacy)
        self.locum, self.locum_member = make_staff_member(self.pharmacy)
        Membership.objects.filter(
            pk__in=[self.author_member.pk, self.pending_member.pk, self.eligible_member.pk]
        ).update(employment_type="FULL_TIME")
        Membership.objects.filter(pk=self.locum_member.pk).update(employment_type="LOCUM")
        self.private_scope = {"scope": "pharmacy", "pharmacy_id": self.pharmacy.pk}
        self.private_body = "P5_CONFIDENTIAL_PHARMACY_ONLY"
        made = client_for(self.author).post(
            "/api/v1/hub/posts/",
            {**self.private_scope, "body": self.private_body},
            format="json",
        )
        self.assertEqual(made.status_code, 201, made.data)

    def test_b46_pending_staff_cannot_read_private_pharmacy_post(self):
        good = client_for(self.eligible_recipient).get(
            f"/api/v1/hub/posts/?scope=pharmacy&pharmacy_id={self.pharmacy.pk}"
        )
        self.assertEqual(good.status_code, 200, good.data)
        self.assertIn(self.private_body, str(good.data))
        pending = client_for(self.pending).get(
            f"/api/v1/hub/posts/?scope=pharmacy&pharmacy_id={self.pharmacy.pk}"
        )
        self.assertEqual(pending.status_code, 403, pending.data)
        self.assertNotIn(self.private_body, str(pending.data))

    def test_b46_pending_staff_cannot_publish_private_hub_posts(self):
        before = PharmacyHubPost.objects.count()
        good = client_for(self.eligible_recipient).post(
            "/api/v1/hub/posts/",
            {**self.private_scope, "body": "P5_ELIGIBLE_CONTROL"},
            format="json",
        )
        self.assertEqual(good.status_code, 201, good.data)
        denied = client_for(self.pending).post(
            "/api/v1/hub/posts/",
            {**self.private_scope, "body": "P5_PENDING_MUST_NOT_PUBLISH"},
            format="json",
        )
        self.assertEqual(denied.status_code, 403, denied.data)
        self.assertEqual(PharmacyHubPost.objects.count(), before + 1)
        self.assertFalse(PharmacyHubPost.objects.filter(
            body="P5_PENDING_MUST_NOT_PUBLISH",
        ).exists())

    def test_b48_private_mention_cannot_notify_ineligible_locum(self):
        # A real active LOCUM is correctly refused the confidential Hub.
        blocked = client_for(self.locum).get(
            f"/api/v1/hub/posts/?scope=pharmacy&pharmacy_id={self.pharmacy.pk}"
        )
        self.assertEqual(blocked.status_code, 403, blocked.data)
        with (
            patch("pharmacy_hub.posts.async_task"),
            patch("notifications.services._broadcast"),
            patch("notifications.services._send_expo_push"),
        ):
            legitimate = client_for(self.author).post(
                "/api/v1/hub/posts/",
                {
                    **self.private_scope,
                    "body": "P5_ACCEPTED_STAFF_MENTION",
                    "tagged_member_ids": [self.eligible_member.pk],
                },
                format="json",
            )
            self.assertEqual(legitimate.status_code, 201, legitimate.data)
            self.assertTrue(Notification.objects.filter(
                user=self.eligible_recipient, body__contains="P5_ACCEPTED_STAFF_MENTION",
            ).exists())
            attempted = client_for(self.author).post(
                "/api/v1/hub/posts/",
                {
                    **self.private_scope,
                    "body": "P5_SECRET_LEAK_THROUGH_MENTION",
                    "tagged_member_ids": [self.locum_member.pk],
                },
                format="json",
            )
        self.assertIn(attempted.status_code, (400, 403), attempted.data)
        self.assertFalse(Notification.objects.filter(
            user=self.locum, body__contains="P5_SECRET_LEAK_THROUGH_MENTION",
        ).exists())
        self.assertFalse(PharmacyHubPost.objects.filter(
            body="P5_SECRET_LEAK_THROUGH_MENTION",
        ).exists())


class Phase5RevokedChatMembership(TestCase):
    def test_b51_revoked_group_participant_cannot_post_new_message(self):
        owner, pharmacy = make_owner_with_pharmacy("P5 Chat Revocation")
        former_user, former_m = make_staff_member(pharmacy)
        eligible_user, eligible_m = make_staff_member(pharmacy)
        Membership.objects.filter(pk__in=[former_m.pk, eligible_m.pk]).update(
            employment_type="FULL_TIME",
        )
        room = Conversation.objects.create(
            type=Conversation.Type.GROUP,
            pharmacy=pharmacy,
            title="Pharmacy community",
            created_by=owner,
        )
        Participant.objects.create(conversation=room, membership=former_m)
        Participant.objects.create(conversation=room, membership=eligible_m)
        url = "/api/v1/messages/"
        active = client_for(former_user).post(
            url, {"conversation": room.pk, "body": "P5_ACTIVE_CONTROL"}, format="json",
        )
        self.assertEqual(active.status_code, 201, active.data)
        self.assertTrue(Message.objects.filter(
            conversation=room, sender=former_m, body="P5_ACTIVE_CONTROL",
        ).exists())
        Membership.objects.filter(pk=former_m.pk).update(
            is_active=False, status=Membership.Status.LEFT,
        )
        before = Message.objects.filter(conversation=room).count()
        revoked = client_for(former_user).post(
            url, {"conversation": room.pk, "body": "P5_FORBIDDEN_AFTER_LEAVING"},
            format="json",
        )
        self.assertEqual(revoked.status_code, 403, revoked.data)
        self.assertEqual(Message.objects.filter(conversation=room).count(), before)
        self.assertFalse(Message.objects.filter(
            conversation=room, sender=former_m, body="P5_FORBIDDEN_AFTER_LEAVING",
        ).exists())
        still_eligible = client_for(eligible_user).post(
            url, {"conversation": room.pk, "body": "P5_ELIGIBLE_STILL_POSTS"},
            format="json",
        )
        self.assertEqual(still_eligible.status_code, 201, still_eligible.data)
