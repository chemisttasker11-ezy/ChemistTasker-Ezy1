from django.test import SimpleTestCase
from django.urls import reverse

from organizations.urls import admin_router, primary_router, router


class OrganizationUrlOwnershipTests(SimpleTestCase):
    def test_router_groups_preserve_legacy_organization_contract(self):
        self.assertEqual(
            [(prefix, basename) for prefix, _viewset, basename in primary_router.registry],
            [
                ("organizations", "organization"),
                ("chains", "chain"),
                ("pharmacies", "pharmacy"),
                ("pharmacy-claims", "pharmacy-claim"),
            ],
        )
        self.assertEqual(
            [(prefix, basename) for prefix, _viewset, basename in admin_router.registry],
            [("pharmacy-admins", "pharmacy-admin")],
        )
        self.assertEqual(len(router.registry), 5)

    def test_fixed_paths_keep_client_profile_namespace(self):
        self.assertEqual(
            reverse("client_profile:organization-public-detail", kwargs={"slug": "demo-org"}),
            "/api/client-profile/organizations/public/demo-org/",
        )
        self.assertEqual(
            reverse("client_profile:owneronboarding-claim"),
            "/api/client-profile/owner-onboarding/claim/",
        )
