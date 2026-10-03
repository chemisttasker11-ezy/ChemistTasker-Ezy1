from django.test import SimpleTestCase

from client_profile.domains.memberships import views as legacy_views
from memberships import views


class MembershipViewOwnershipTests(SimpleTestCase):
    def test_legacy_views_reexport_membership_implementations(self):
        for name in (
            "MembershipViewSet",
            "MembershipInviteLinkViewSet",
            "MagicLinkInfoView",
            "SubmitMembershipApplication",
            "MembershipApplicationViewSet",
            "MyMembershipsViewSet",
        ):
            self.assertIs(getattr(legacy_views, name), getattr(views, name))

    def test_notification_helpers_are_owned_by_memberships(self):
        self.assertIs(
            legacy_views._notify_membership_invitation_sent,
            views._notify_membership_invitation_sent,
        )
        self.assertIs(
            legacy_views._notify_membership_response,
            views._notify_membership_response,
        )
