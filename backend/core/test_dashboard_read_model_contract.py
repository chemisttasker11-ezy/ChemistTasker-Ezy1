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
            reverse("api_v1:organization-dashboard"),
            "/api/v1/dashboard/organization/",
        )
        self.assertEqual(
            reverse("api_v1:organization-dashboard-detail", kwargs={"organization_pk": 7}),
            "/api/v1/dashboard/organization/7/",
        )

    def test_role_dashboard_paths_resolve_to_existing_views(self):
        expected = {
            "/api/v1/dashboard/organization/": OrganizationDashboardView,
            "/api/v1/dashboard/organization/7/": OrganizationDashboardView,
            "/api/v1/dashboard/owner/": OwnerDashboard,
            "/api/v1/dashboard/pharmacist/": PharmacistDashboard,
            "/api/v1/dashboard/otherstaff/": OtherStaffDashboard,
            "/api/v1/dashboard/explorer/": ExplorerDashboard,
        }
        for path, view_class in expected.items():
            self.assertIs(resolve(path).func.view_class, view_class)
