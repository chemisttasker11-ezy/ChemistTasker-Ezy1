from django.test import SimpleTestCase
from django.urls import reverse

from shifts.urls import discovery_router, engagement_router, lifecycle_router, router


class ShiftUrlOwnershipTests(SimpleTestCase):
    def test_shift_router_groups_preserve_legacy_prefixes(self):
        self.assertEqual(
            [prefix for prefix, _viewset, _basename in discovery_router.registry],
            ["community-shifts", "public-shifts", "shift-description-templates"],
        )
        self.assertEqual(
            [prefix for prefix, _viewset, _basename in lifecycle_router.registry],
            ["shifts/active", "shifts/confirmed", "shifts/history", "shifts"],
        )
        self.assertEqual(
            [prefix for prefix, _viewset, _basename in engagement_router.registry],
            [
                "shift-interests",
                "shift-rejections",
                "shift-saved",
                "shift-offers",
                "my-confirmed-shifts",
                "my-history-shifts",
                "leave-requests",
                "worker-shift-requests",
            ],
        )
        self.assertEqual(len(router.registry), 15)

    def test_fixed_shift_paths_keep_client_profile_namespace(self):
        self.assertEqual(reverse("client_profile:public-job-board"), "/api/client-profile/public-job-board/")
        self.assertEqual(reverse("client_profile:view-shared-shift"), "/api/client-profile/view-shared-shift/")
