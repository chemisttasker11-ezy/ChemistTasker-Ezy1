"""Frozen-main Phase 5 P1 red-first HTTP scenarios, with legitimate controls.

These are synthetic Django TestCase fixtures. Failure of a NEGATIVE assertion
demonstrates behavior in isolated SQLite, not successful production exploitation.
A fixture/positive-control error is TEST_INVALID until repaired.
"""
from datetime import date, timedelta
from unittest.mock import patch

from django.test import TestCase
from django.utils import timezone

from client_profile.characterization_support import (
    client_for, make_owner_with_pharmacy, make_staff_member, make_user,
)
from client_profile.models import OtherStaffOnboarding
from chat.models import Conversation, Participant
from memberships.models import MembershipApplication, MembershipInviteLink
from notifications.models import Notification
from pharmacy_hub.models import PharmacyHubPoll, PharmacyHubPollOption


class Phase5HubPollAuthorization(TestCase):
    def setUp(self):
        self.author = make_user("PHARMACIST", is_otp_verified=True)
        self.stranger = make_user("PHARMACIST", is_otp_verified=True)
        self.poll = PharmacyHubPoll.objects.create(
            platform_hub="public",
            question="Original phase5 question",
            created_by=self.author,
            created_by_membership=None,
        )
        PharmacyHubPollOption.objects.create(
            poll=self.poll, label="First", position=0,
        )
        PharmacyHubPollOption.objects.create(
            poll=self.poll, label="Second", position=1,
        )

    def test_f09_n4_unrelated_verified_user_cannot_patch_other_public_poll(self):
        url = f"/api/v1/hub/polls/{self.poll.pk}/"
        positive = client_for(self.author).patch(
            url, {"question": "My own amended poll"}, format="json",
        )
        self.assertEqual(positive.status_code, 200, positive.data)
        foreign = client_for(self.stranger).patch(
            url, {
                "question": "Unauthorized rewrite",
                "option_labels": ["One", "Two"],
            }, format="json",
        )
        self.assertEqual(foreign.status_code, 403, foreign.data)
        self.poll.refresh_from_db()
        self.assertEqual(self.poll.question, "My own amended poll")

    def test_f09_n4_unrelated_user_cannot_delete_other_public_poll(self):
        result = client_for(self.stranger).delete(
            f"/api/v1/hub/polls/{self.poll.pk}/"
        )
        self.assertEqual(result.status_code, 403, result.content)
        self.assertTrue(PharmacyHubPoll.objects.filter(pk=self.poll.pk).exists())


class Phase5ChatTenantAndRoomAuthority(TestCase):
    def setUp(self):
        self.creator, self.pharmacy_a = make_owner_with_pharmacy("Phase5 Group A")
        self.colleague, self.m_a = make_staff_member(self.pharmacy_a)
        self.creator_m = make_staff_member(self.pharmacy_a)[1]
        self.creator_m.user = self.creator
        # Do not reassign a unique Membership to a different user after
        # creation; use an explicit accepted owner membership instead.
        self.creator_m.user = self.creator
        self.creator_m.save(update_fields=["user"])
        _, pharmacy_b = make_owner_with_pharmacy("Phase5 Group B")
        self.foreign_user, self.m_b = make_staff_member(pharmacy_b)
        self.room = Conversation.objects.create(
            type=Conversation.Type.GROUP, title="A team-only room",
            created_by=self.creator,
        )
        Participant.objects.create(
            conversation=self.room, membership=self.creator_m, is_admin=True,
        )
        Participant.objects.create(
            conversation=self.room, membership=self.m_a, is_admin=False,
        )

    def test_c005_n1_ordinary_member_cannot_change_room_membership(self):
        url = f"/api/v1/rooms/{self.room.pk}/"
        # Room creator can rename a custom room (legitimate control).
        positive = client_for(self.creator).patch(
            url, {"title": "Owner's team room"}, format="json",
        )
        self.assertEqual(positive.status_code, 200, positive.data)
        attempt = client_for(self.colleague).patch(
            url, {"participants": [self.m_a.pk, self.m_b.pk]},
            format="json",
        )
        self.assertEqual(attempt.status_code, 403, attempt.data)
        self.assertFalse(Participant.objects.filter(
            conversation=self.room, membership=self.m_b,
        ).exists())
        self.assertTrue(Participant.objects.filter(
            conversation=self.room, membership=self.creator_m,
        ).exists())

    def test_c004_n1_cross_pharmacy_group_invite_requires_consent_or_authority(self):
        attempt = client_for(self.colleague).post(
            "/api/v1/rooms/",
            {"title": "Cross-tenant employee list", "participants": [self.m_b.pk]},
            format="json",
        )
        self.assertIn(attempt.status_code, (400, 403), attempt.data)
        self.assertFalse(Participant.objects.filter(
            membership=self.m_b, conversation__title="Cross-tenant employee list",
        ).exists())


class Phase5ApplicationProtection(TestCase):
    def setUp(self):
        self.owner, self.pharmacy = make_owner_with_pharmacy("Phase5 Applications")
        self.link = MembershipInviteLink.objects.create(
            pharmacy=self.pharmacy, created_by=self.owner,
            category="FULL_PART_TIME",
            expires_at=timezone.now() + timedelta(days=7),
        )

    def _valid_payload(self, user, link):
        return {
            "invite_link": link.pk,
            "role": "ASSISTANT",
            "first_name": user.first_name,
            "last_name": user.last_name,
            "username": user.username or "phase5user",
            "mobile_number": "0400000000",
            "date_of_birth": "1998-01-04",
            "job_title": "Assistant",
            "email": user.email,
        }

    def _new_applicant(self):
        worker = make_user("OTHER_STAFF")
        OtherStaffOnboarding.objects.create(user=worker, role_type="ASSISTANT")
        return worker

    def test_c012_n1_generic_create_rejects_expired_numeric_link(self):
        valid_worker = self._new_applicant()
        allowed = client_for(valid_worker).post(
            f"/api/v1/magic/memberships/{self.link.token}/apply/",
            self._valid_payload(valid_worker, self.link), format="json",
        )
        self.assertEqual(allowed.status_code, 201, allowed.data)
        expired = MembershipInviteLink.objects.create(
            pharmacy=self.pharmacy, created_by=self.owner,
            category="FULL_PART_TIME", is_active=False,
            expires_at=timezone.now() - timedelta(days=1),
        )
        invalid_worker = self._new_applicant()
        response = client_for(invalid_worker).post(
            "/api/v1/membership-applications/",
            self._valid_payload(invalid_worker, expired), format="json",
        )
        self.assertIn(response.status_code, (400, 403, 410), response.data)
        self.assertFalse(MembershipApplication.objects.filter(
            email=invalid_worker.email, invite_link=expired,
        ).exists())

    def test_c012_n2_decided_application_history_cannot_be_deleted(self):
        application = MembershipApplication.objects.create(
            invite_link=self.link,
            pharmacy=self.pharmacy,
            category="FULL_PART_TIME", status="APPROVED",
            role="ASSISTANT", first_name="Former",
            last_name="Applicant", username="former",
            mobile_number="0400000001",
            date_of_birth=date(1993, 2, 2),
            job_title="Assistant",
            email="former-applicant-phase5@example.test",
        )
        positive = client_for(self.owner).get(
            f"/api/v1/membership-applications/{application.pk}/"
        )
        self.assertEqual(positive.status_code, 200, positive.data)
        attempted_delete = client_for(self.owner).delete(
            f"/api/v1/membership-applications/{application.pk}/"
        )
        self.assertIn(attempted_delete.status_code, (403, 405))
        self.assertTrue(
            MembershipApplication.objects.filter(pk=application.pk).exists()
        )


class Phase5PasswordResetConfidentiality(TestCase):
    def test_c024_n1_password_reset_token_not_in_signed_in_bell(self):
        user = make_user("PHARMACIST")
        with (
            patch("users.tasks.send_email_now"),
            patch("users.tasks.send_email_task.apply_async"),
            patch("notifications.services._broadcast"),
            patch("notifications.services._send_expo_push"),
            self.captureOnCommitCallbacks(execute=True),
        ):
            response = client_for().post(
                "/api/v1/users/password-reset/",
                {"email": user.email}, format="json",
            )
        self.assertEqual(response.status_code, 200, response.data)
        leaked = Notification.objects.filter(user=user).filter(
            action_url__contains="/reset-password/"
        )
        self.assertFalse(leaked.exists(), "An active password reset credential must be email-only.")

    def test_c024_n1_unknown_email_keeps_non_enumerating_response(self):
        before = Notification.objects.count()
        response = client_for().post(
            "/api/v1/users/password-reset/",
            {"email": "unknown-phase5@example.test"}, format="json",
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(Notification.objects.count(), before)
