from django.test import SimpleTestCase
from django.urls import resolve

from client_profile import urls as kernel_urls


class ApiV1RouterContractTests(SimpleTestCase):
    """Canonical domain routes exist without a client_profile public router."""

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

    def test_domain_routes_resolve_under_api_v1(self):
        for prefix in self.expected_public_prefixes:
            with self.subTest(prefix=prefix):
                self.assertIsNotNone(resolve(f"/api/v1/{prefix}/"))

    def test_client_profile_urlconf_is_intentionally_empty(self):
        self.assertEqual(kernel_urls.urlpatterns, [])
