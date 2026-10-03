from django.test import SimpleTestCase
from django.urls import reverse

from memberships.urls import intake_router, membership_router, self_router, router


class MembershipUrlOwnershipTests(SimpleTestCase):
    def test_router_groups_preserve_legacy_membership_contract(self):
        self.assertEqual(
            [(prefix, basename) for prefix, _viewset, basename in membership_router.registry],
            [("memberships", "membership")],
        )
        self.assertEqual(
            [(prefix, basename) for prefix, _viewset, basename in intake_router.registry],
            [
                ("membership-invite-links", "membership-invite-link"),
                ("membership-applications", "membership-application"),
            ],
        )
        self.assertEqual(
            [(prefix, basename) for prefix, _viewset, basename in self_router.registry],
            [("my-memberships", "my-memberships")],
        )
        self.assertEqual(len(router.registry), 4)

    def test_magic_paths_keep_client_profile_namespace(self):
        self.assertEqual(
            reverse("client_profile:magic-membership-detail", kwargs={"token": "abc"}),
            "/api/client-profile/magic/memberships/abc/",
        )
        self.assertEqual(
            reverse("client_profile:magic-membership-apply", kwargs={"token": "abc"}),
            "/api/client-profile/magic/memberships/abc/apply/",
        )
