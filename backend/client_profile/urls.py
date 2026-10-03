# client_profile/urls.py
"""Routes owned by the client_profile kernel.

Project-level composition of promoted domain apps lives in
`core.client_profile_api_urls`. Keeping this module domain-local prevents
client_profile from becoming the owner of unrelated apps while preserving the
public `client_profile:` namespace at the project composition layer.
"""
from django.urls import path
from rest_framework.routers import DefaultRouter

from .domains.dashboards.views import (
    ExplorerDashboard,
    OrganizationDashboardView,
    OtherStaffDashboard,
    OwnerDashboard,
    PharmacistDashboard,
)

router = DefaultRouter()
router.include_root_view = False



urlpatterns = [
    path('dashboard/organization/', OrganizationDashboardView.as_view(), name='organization-dashboard'),
    path('dashboard/organization/<int:organization_pk>/', OrganizationDashboardView.as_view(), name='organization-dashboard-detail'),
    path('dashboard/owner/', OwnerDashboard.as_view()),
    path('dashboard/pharmacist/', PharmacistDashboard.as_view()),
    path('dashboard/otherstaff/', OtherStaffDashboard.as_view()),
    path('dashboard/explorer/', ExplorerDashboard.as_view()),
]
