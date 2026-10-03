from django.test import SimpleTestCase

from client_profile.domains.memberships import serializers as legacy_serializers
from memberships import serializers


class MembershipSerializerOwnershipTests(SimpleTestCase):
    def test_legacy_serializers_reexport_membership_implementations(self):
        for name in (
            "MembershipSerializer",
            "MembershipInviteLinkSerializer",
            "MembershipApplicationSerializer",
            "MembershipApplicationReviewSerializer",
        ):
            self.assertIs(getattr(legacy_serializers, name), getattr(serializers, name))

    def test_helper_contracts_are_owned_by_memberships(self):
        self.assertIs(
            legacy_serializers.required_user_role_for_membership,
            serializers.required_user_role_for_membership,
        )
        self.assertIs(
            legacy_serializers._application_payment_profile_status,
            serializers._application_payment_profile_status,
        )
