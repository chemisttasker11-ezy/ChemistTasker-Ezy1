from django.test import SimpleTestCase

from client_profile.urls import router


class ClientProfileKernelRouterContractTests(SimpleTestCase):
    """client_profile declares only the routes for domains it still owns."""

    expected_prefixes = [
        "organizations",
        "chains",
        "pharmacies",
        "pharmacy-claims",
        "memberships",
        "pharmacy-admins",
        "membership-invite-links",
        "membership-applications",
        "community-shifts",
        "public-shifts",
        "shift-description-templates",
        "shifts/active",
        "shifts/confirmed",
        "shifts/history",
        "shifts",
        "shift-interests",
        "shift-rejections",
        "shift-saved",
        "shift-offers",
        "my-confirmed-shifts",
        "my-history-shifts",
        "leave-requests",
        "worker-shift-requests",
        "my-memberships",
    ]

    def test_kernel_router_contains_only_kernel_owned_routes(self):
        self.assertEqual(
            [prefix for prefix, _viewset, _basename in router.registry],
            self.expected_prefixes,
        )
