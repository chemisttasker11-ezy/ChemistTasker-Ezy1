from django.test import SimpleTestCase

from client_profile.urls import router as kernel_router
from core.client_profile_api_urls import router as public_router


class ClientProfileRouterContractTests(SimpleTestCase):
    """Public API ordering remains a compatibility contract inherited from main."""

    expected_public_prefixes = [
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
        "user-availability",
        "pill-rewards",
        "shifts/active",
        "shifts/confirmed",
        "shifts/history",
        "shifts",
        "roster-owner",
        "roster-worker",
        "roster-shifts",
        "shift-interests",
        "shift-rejections",
        "shift-saved",
        "shift-offers",
        "my-confirmed-shifts",
        "my-history-shifts",
        "leave-requests",
        "worker-shift-requests",
        "ratings",
        "rooms",
        "my-memberships",
        "messages",
        "notifications",
        "device-tokens",
        "explorer-posts",
        "calendar-events",
        "work-notes",
        "calendar-feed",
    ]

    expected_kernel_prefixes = [
        "organizations",
        "chains",
        "pharmacies",
        "pharmacy-claims",
        "pharmacy-admins",
    ]

    def test_public_router_registration_order_matches_main(self):
        self.assertEqual(
            [prefix for prefix, _viewset, _basename in public_router.registry],
            self.expected_public_prefixes,
        )

    def test_client_profile_router_contains_only_kernel_owned_routes(self):
        self.assertEqual(
            [prefix for prefix, _viewset, _basename in kernel_router.registry],
            self.expected_kernel_prefixes,
        )
