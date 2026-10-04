from django.test import SimpleTestCase
from django.urls import resolve, reverse

from dashboards.views import (
    ExplorerDashboard,
    OrganizationDashboardView,
    OtherStaffDashboard,
    OwnerDashboard,
    PharmacistDashboard,
)


class DashboardReadModelExtractionContractTests(SimpleTestCase):
    def test_named_organization_dashboard_paths_are_stable(self):
        self.assertEqual(
            reverse("client_profile:organization-dashboard"),
            "/api/client-profile/dashboard/organization/",
        )
        self.assertEqual(
            reverse("client_profile:organization-dashboard-detail", kwargs={"organization_pk": 7}),
            "/api/client-profile/dashboard/organization/7/",
        )

    def test_role_dashboard_paths_resolve_to_existing_views(self):
        expected = {
            "/api/client-profile/dashboard/organization/": OrganizationDashboardView,
            "/api/client-profile/dashboard/organization/7/": OrganizationDashboardView,
            "/api/client-profile/dashboard/owner/": OwnerDashboard,
            "/api/client-profile/dashboard/pharmacist/": PharmacistDashboard,
            "/api/client-profile/dashboard/otherstaff/": OtherStaffDashboard,
            "/api/client-profile/dashboard/explorer/": ExplorerDashboard,
        }
        for path, view_class in expected.items():
            self.assertIs(resolve(path).func.view_class, view_class)
