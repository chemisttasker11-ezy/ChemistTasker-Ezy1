from django.conf import settings
from django.test import SimpleTestCase
from django.urls import Resolver404, get_resolver, resolve, reverse
from rest_framework.permissions import IsAuthenticated

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

    def test_composition_preserves_all_historical_route_objects(self):
        from composition.urls import urlpatterns as composed_patterns
        from core.urls import urlpatterns as historical_patterns

        self.assertEqual(settings.ROOT_URLCONF, "composition.urls")
        self.assertIs(composed_patterns, historical_patterns)
        self.assertIs(get_resolver().url_patterns, historical_patterns)
        for path in ["/health/", *[f"/api/v1/{prefix}/" for prefix in self.expected_prefixes]]:
            with self.subTest(path=path):
                historical = resolve(path, urlconf="core.urls")
                composed = resolve(path)
                self.assertIs(composed.func, historical.func)
                self.assertEqual(composed.view_name, historical.view_name)
                self.assertEqual(composed.kwargs, historical.kwargs)

    def test_protected_routes_keep_canonical_handlers_and_authentication(self):
        from chat.views import ConversationViewSet, MessageViewSet
        from organizations.views import PharmacyViewSet

        for path, view_class in (
            ("/api/v1/pharmacies/", PharmacyViewSet),
            ("/api/v1/rooms/", ConversationViewSet),
            ("/api/v1/messages/", MessageViewSet),
        ):
            with self.subTest(path=path):
                self.assertIs(resolve(path).func.cls, view_class)
                self.assertIn(IsAuthenticated, view_class.permission_classes)

    def test_domain_owned_router_paths_are_composed_under_api_v1(self):
        for prefix in self.expected_prefixes:
            with self.subTest(prefix=prefix):
                self.assertIsNotNone(resolve(f"/api/v1/{prefix}/"))

    def test_action_only_reward_route_is_composed_under_api_v1(self):
        self.assertIsNotNone(resolve("/api/v1/pill-rewards/balance/"))

    def test_namespace_and_representative_reverse_paths_are_canonical(self):
        self.assertEqual(reverse("api_v1:organization-list"), "/api/v1/organizations/")
        self.assertEqual(reverse("api_v1:conversation-list"), "/api/v1/rooms/")
        self.assertEqual(reverse("api_v1:message-list"), "/api/v1/messages/")
        self.assertEqual(reverse("api_v1:calendar-feed-list"), "/api/v1/calendar-feed/")
        self.assertEqual(reverse("api_v1:owner-onboarding-me"), "/api/v1/owner/onboarding/me/")

    def test_removed_application_namespaces_do_not_resolve(self):
        legacy_root = "/api/"
        for path in (
            legacy_root + "client-profile/pharmacies/",
            legacy_root + "users/me/",
            legacy_root + "public-hub/articles/",
            legacy_root + "marketplace/categories/",
            legacy_root + "ethical/me/access/",
            legacy_root + "content/documents/",
            legacy_root + "billing/plans/",
            legacy_root + "account/",
        ):
            with self.subTest(path=path), self.assertRaises(Resolver404):
                resolve(path)

    def test_finance_compatibility_guard_precedes_canonical_invoice_editor(self):
        self.assertIs(resolve("/api/v1/invoices/7/").func, finance_legacy.detail)
        self.assertIs(resolve("/api/v1/invoices/7/pdf/").func, finance_legacy.pdf)
        self.assertIs(resolve("/api/v1/invoices/7/send/").func, finance_legacy.send)
