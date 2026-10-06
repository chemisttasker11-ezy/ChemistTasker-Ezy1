from django.test import SimpleTestCase
from django.urls import reverse

from client_profile.models import Membership, MembershipApplication, MembershipInviteLink
from memberships.urls import router


class MembershipDomainExtractionContractTests(SimpleTestCase):
    expected_tables = {
        Membership: "client_profile_membership",
        MembershipInviteLink: "client_profile_membershipinvitelink",
        MembershipApplication: "client_profile_membershipapplication",
    }

    expected_router_contracts = {
        "memberships": "membership",
        "membership-invite-links": "membership-invite-link",
        "membership-applications": "membership-application",
        "my-memberships": "my-memberships",
    }

    def test_physical_membership_tables_are_stable(self):
        for model, expected_table in self.expected_tables.items():
            self.assertEqual(model._meta.db_table, expected_table)

    def test_public_membership_router_contract_is_stable(self):
        actual = {
            prefix: basename
            for prefix, _viewset, basename in router.registry
            if prefix in self.expected_router_contracts
        }
        self.assertEqual(actual, self.expected_router_contracts)

    def test_magic_link_paths_keep_api_v1_namespace(self):
        self.assertEqual(
            reverse("api_v1:magic-membership-detail", kwargs={"token": "abc"}),
            "/api/v1/magic/memberships/abc/",
        )
        self.assertEqual(
            reverse("api_v1:magic-membership-apply", kwargs={"token": "abc"}),
            "/api/v1/magic/memberships/abc/apply/",
        )
