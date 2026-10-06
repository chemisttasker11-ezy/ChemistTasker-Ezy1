from django.test import SimpleTestCase
from django.urls import Resolver404, resolve, reverse

from core.api_v1_urls import router
from worker_finance import legacy as finance_legacy


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

    def test_namespace_and_representative_reverse_paths_are_canonical(self):
        self.assertEqual(reverse("api_v1:organization-list"), "/api/v1/organizations/")
        self.assertEqual(reverse("api_v1:conversation-list"), "/api/v1/rooms/")
        self.assertEqual(reverse("api_v1:message-list"), "/api/v1/messages/")
        self.assertEqual(reverse("api_v1:calendar-feed-list"), "/api/v1/calendar-feed/")
        self.assertEqual(reverse("api_v1:owner-onboarding-me"), "/api/v1/owner/onboarding/me/")

    def test_removed_application_namespaces_do_not_resolve(self):
        for path in (
            "/api/client-profile/pharmacies/",
            "/api/users/me/",
            "/api/public-hub/articles/",
            "/api/marketplace/categories/",
            "/api/ethical/me/access/",
            "/api/content/documents/",
            "/api/billing/plans/",
            "/api/account/",
        ):
            with self.subTest(path=path), self.assertRaises(Resolver404):
                resolve(path)

    def test_finance_compatibility_guard_precedes_canonical_invoice_editor(self):
        self.assertIs(resolve("/api/v1/invoices/7/").func, finance_legacy.detail)
        self.assertIs(resolve("/api/v1/invoices/7/pdf/").func, finance_legacy.pdf)
        self.assertIs(resolve("/api/v1/invoices/7/send/").func, finance_legacy.send)
