from django.test import SimpleTestCase

from memberships import models, serializers, views


class MembershipInternalOwnershipTests(SimpleTestCase):
    def test_views_and_serializers_use_membership_owned_models(self):
        self.assertIs(views.Membership, models.Membership)
        self.assertIs(views.MembershipInviteLink, models.MembershipInviteLink)
        self.assertIs(views.MembershipApplication, models.MembershipApplication)
        self.assertIs(serializers.Membership, models.Membership)
        self.assertIs(serializers.MembershipInviteLink, models.MembershipInviteLink)
        self.assertIs(serializers.MembershipApplication, models.MembershipApplication)
