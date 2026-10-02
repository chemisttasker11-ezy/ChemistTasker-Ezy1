from django.test import SimpleTestCase
from django.urls import reverse

from core.client_profile_api_urls import router


class ClientProfileApiCompositionContractTests(SimpleTestCase):
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
        self.assertEqual(reverse("client_profile:organization-list"), "/api/client-profile/organizations/")
        self.assertEqual(reverse("client_profile:conversation-list"), "/api/client-profile/rooms/")
        self.assertEqual(reverse("client_profile:message-list"), "/api/client-profile/messages/")
        self.assertEqual(reverse("client_profile:calendar-feed-list"), "/api/client-profile/calendar-feed/")
        self.assertEqual(reverse("client_profile:owner-onboarding-me"), "/api/client-profile/owner/onboarding/me/")
