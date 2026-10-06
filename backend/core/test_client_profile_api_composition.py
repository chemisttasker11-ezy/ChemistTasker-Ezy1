from django.test import SimpleTestCase
from django.urls import reverse

from core.api_v1_urls import router


class ApiV1CompositionContractTests(SimpleTestCase):
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

    def test_composed_router_order_is_legacy_order(self):
        self.assertEqual(
            [prefix for prefix, _viewset, _basename in router.registry],
            self.expected_prefixes,
        )

    def test_namespace_and_representative_reverse_paths_are_unchanged(self):
        self.assertEqual(reverse("api_v1:organization-list"), "/api/v1/organizations/")
        self.assertEqual(reverse("api_v1:conversation-list"), "/api/v1/rooms/")
        self.assertEqual(reverse("api_v1:message-list"), "/api/v1/messages/")
        self.assertEqual(reverse("api_v1:calendar-feed-list"), "/api/v1/calendar-feed/")
        self.assertEqual(reverse("api_v1:owner-onboarding-me"), "/api/v1/owner/onboarding/me/")
