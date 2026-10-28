"""Phase 5 adversarial RED tests. Frozen main only; no production-code changes.

These explicit negative cases exercise the actual user-facing URLs on a
disposable SQLite test database. A failing assertion is evidence of a
source-supported defect, not a deployment or a completed attacker exploit.
"""
import json

from django.test import TestCase
from client_profile.characterization_support import (
    client_for, make_owner_with_pharmacy, make_staff_member, make_user,
)
from client_profile.models import Membership, PharmacyAdmin
from chat.models import Conversation, Participant, Message
from pharmacy_hub.models import (
    PharmacyCommunityGroup, PharmacyCommunityGroupMembership, PharmacyHubPost,
)
from shifts.models import Shift


class Phase5P0AuthorizationContracts(TestCase):
    def setUp(self):
        self.owner, self.pharmacy = make_owner_with_pharmacy("Phase5 P0 Pharmacy")
        self.worker, self.staff_m = make_staff_member(self.pharmacy, role="ASSISTANT")
        self.admin = PharmacyAdmin.objects.create(
            user=self.worker, pharmacy=self.pharmacy, membership=self.staff_m,
            admin_level="MANAGER", staff_role="ASSISTANT", is_active=True,
        )

    def remove_admin(self):
        result = client_for(self.owner).delete(
            f"/api/v1/pharmacy-admins/{self.admin.pk}/"
        )
        self.assertEqual(result.status_code, 204, result.content)
        self.admin.refresh_from_db()
        self.staff_m.refresh_from_db()
        self.assertFalse(self.admin.is_active)
        self.assertTrue(self.staff_m.is_active)
        self.assertEqual(self.staff_m.status, Membership.Status.ACCEPTED)

    def test_f03_revoked_admin_not_listed_as_pending_invitation(self):
        self.remove_admin()
        resp = client_for(self.worker).get(
            "/api/v1/pharmacy-admins/my-pending-invitations/"
        )
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertNotIn(self.admin.pk, [x["id"] for x in resp.data])

    def test_f03_revoked_admin_cannot_accept_old_role(self):
        self.remove_admin()
        resp = client_for(self.worker).post(
            f"/api/v1/pharmacy-admins/{self.admin.pk}/accept-invitation/"
        )
        self.assertEqual(resp.status_code, 404, resp.data)
        self.admin.refresh_from_db()
        self.assertFalse(self.admin.is_active)

    def test_f04_member_status_hidden_from_external_platform_shift_worker(self):
        outsider = make_user("PHARMACIST")
        member, membership = make_staff_member(
            self.pharmacy, role="PHARMACIST"
        )
        membership.employment_type = "FULL_TIME"
        membership.save(update_fields=["employment_type"])
        shift = Shift.objects.create(
            pharmacy=self.pharmacy, created_by=self.owner,
            role_needed="PHARMACIST", employment_type="LOCUM",
            visibility="PLATFORM", single_user_only=True,
        )
        client = client_for(outsider)
        # A non-manager must be able to view the ordinary platform shift.
        visible = client.get(f"/api/v1/shifts/{shift.pk}/")
        self.assertEqual(visible.status_code, 200, visible.data)
        result = client.get(
            f"/api/v1/shifts/{shift.pk}/member_status/?visibility=FULL_PART_TIME"
        )
        self.assertIn(result.status_code, (403, 404), result.data)
        authorized = client_for(self.owner).get(
            f"/api/v1/shifts/{shift.pk}/member_status/?visibility=FULL_PART_TIME"
        )
        self.assertEqual(authorized.status_code, 200, authorized.data)


class Phase5PrivacyAndRetentionContracts(TestCase):
    def setUp(self):
        self.owner, self.pharmacy = make_owner_with_pharmacy("Phase5 Privacy")
        self.member, self.membership = make_staff_member(self.pharmacy)
        self.outsider, self.outsider_membership = make_staff_member(self.pharmacy)
        for m in (self.membership, self.outsider_membership):
            m.employment_type = "FULL_TIME"
            m.save(update_fields=["employment_type"])

    def test_f09_group_delete_must_not_promote_restricted_post_to_pharmacy_feed(self):
        group = PharmacyCommunityGroup.objects.create(
            pharmacy=self.pharmacy, created_by=self.owner,
            name="Private phase5 group",
        )
        PharmacyCommunityGroupMembership.objects.create(
            group=group, membership=self.membership,
        )
        post = PharmacyHubPost.objects.create(
            pharmacy=self.pharmacy, community_group=group,
            author_membership=self.membership, author_user=self.member,
            body="PRIVATE_GROUP_ONLY_PHASE5",
        )
        outsider_client = client_for(self.outsider)
        pharmacy_url = (
            f"/api/v1/hub/posts/?scope=pharmacy&pharmacy_id={self.pharmacy.pk}"
        )
        before = outsider_client.get(pharmacy_url)
        self.assertEqual(before.status_code, 200, before.data)
        self.assertNotIn("PRIVATE_GROUP_ONLY_PHASE5", json.dumps(before.json()))
        positive = client_for(self.member).get(
            f"/api/v1/hub/posts/?scope=group&group_id={group.pk}"
        )
        self.assertEqual(positive.status_code, 200, positive.data)
        self.assertIn("PRIVATE_GROUP_ONLY_PHASE5", json.dumps(positive.json()))
        deleted = client_for(self.owner).delete(f"/api/v1/hub/groups/{group.pk}/")
        self.assertEqual(deleted.status_code, 204, deleted.content)
        post.refresh_from_db()
        after = outsider_client.get(pharmacy_url)
        self.assertEqual(after.status_code, 200, after.data)
        self.assertNotIn("PRIVATE_GROUP_ONLY_PHASE5", json.dumps(after.json()))

    def test_b03_staff_removal_must_preserve_historical_chat_messages(self):
        room = Conversation.objects.create(
            type=Conversation.Type.GROUP, title="Phase5 history",
            created_by=self.owner,
        )
        Participant.objects.create(
            conversation=room, membership=self.membership,
        )
        Participant.objects.create(
            conversation=room, membership=self.outsider_membership,
        )
        former_message = Message.objects.create(
            conversation=room, sender=self.membership, body="historical work chat",
        )
        retained_message = Message.objects.create(
            conversation=room, sender=self.outsider_membership,
            body="remaining coworker message",
        )
        deleted = client_for(self.owner).delete(
            f"/api/v1/memberships/{self.membership.pk}/"
        )
        self.assertEqual(deleted.status_code, 204, deleted.content)
        self.assertTrue(Message.objects.filter(pk=retained_message.pk).exists())
        self.assertTrue(
            Message.objects.filter(pk=former_message.pk).exists(),
            "Removing staff must not erase their messages from coworkers' history.",
        )
