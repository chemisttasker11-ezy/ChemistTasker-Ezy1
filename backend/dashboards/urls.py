"""Public URL ownership for dashboard read-model endpoints."""
from django.urls import path

from dashboards.views import (
    ExplorerDashboard,
    OrganizationDashboardView,
    OtherStaffDashboard,
    OwnerDashboard,
    PharmacistDashboard,
)


urlpatterns = [
    path("dashboard/organization/", OrganizationDashboardView.as_view(), name="organization-dashboard"),
    path(
        "dashboard/organization/<int:organization_pk>/",
        OrganizationDashboardView.as_view(),
        name="organization-dashboard-detail",
    ),
    path("dashboard/owner/", OwnerDashboard.as_view()),
    path("dashboard/pharmacist/", PharmacistDashboard.as_view()),
    path("dashboard/otherstaff/", OtherStaffDashboard.as_view()),
    path("dashboard/explorer/", ExplorerDashboard.as_view()),
]
