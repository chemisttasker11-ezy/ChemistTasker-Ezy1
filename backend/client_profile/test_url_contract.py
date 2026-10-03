from django.test import SimpleTestCase

from client_profile.urls import router


class ClientProfileRouterContractTests(SimpleTestCase):
    """The DRF API-root registration order is a compatibility contract inherited from main."""

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

    def test_router_registration_order_matches_main(self):
        self.assertEqual([prefix for prefix, _viewset, _basename in router.registry], self.expected_prefixes)
