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
from .domains.memberships.views import (
    MagicLinkInfoView,
    MembershipApplicationViewSet,
    MembershipInviteLinkViewSet,
    MembershipViewSet,
    MyMembershipsViewSet,
    SubmitMembershipApplication,
)
from .domains.orgs.claims import OwnerOnboardingClaim, PharmacyClaimViewSet
from .domains.orgs.views import (
    ChainViewSet,
    OrganizationViewSet,
    PharmacyAdminViewSet,
    PharmacyViewSet,
    PublicOrganizationDetailView,
)
from .domains.onboarding.views import (
    ExplorerOnboardingV2MeView,
    OtherStaffOnboardingV2MeView,
    OwnerOnboardingV2MeView,
    PharmacistOnboardingV2MeView,
    RefereeRejectView,
    RefereeSubmitResponseView,
)


router = DefaultRouter()
router.include_root_view = False

router.register(r'organizations', OrganizationViewSet, basename='organization')
router.register(r'chains', ChainViewSet, basename='chain')
router.register(r'pharmacies', PharmacyViewSet)
router.register(r'pharmacy-claims', PharmacyClaimViewSet, basename='pharmacy-claim')
router.register(r'memberships', MembershipViewSet, basename='membership')
router.register(r'pharmacy-admins', PharmacyAdminViewSet, basename='pharmacy-admin')
router.register(r'membership-invite-links', MembershipInviteLinkViewSet, basename='membership-invite-link')
router.register(r'membership-applications', MembershipApplicationViewSet, basename='membership-application')

router.register(r'my-memberships', MyMembershipsViewSet, basename='my-memberships')


urlpatterns = [
    path('owner/onboarding/me/', OwnerOnboardingV2MeView.as_view(), name='owner-onboarding-me'),
    path('pharmacist/onboarding/me/', PharmacistOnboardingV2MeView.as_view(), name='pharmacist-onboarding-me'),
    path('otherstaff/onboarding/me/', OtherStaffOnboardingV2MeView.as_view(), name='otherstaff-onboarding-me'),
    path('explorer/onboarding/me/', ExplorerOnboardingV2MeView.as_view(), name='explorer-onboarding-me'),
    path('onboarding/submit-reference/<str:token>/', RefereeSubmitResponseView.as_view(), name='submit-referee-response'),
    path('onboarding/referee-reject/<str:token>/', RefereeRejectView.as_view(), name='referee-reject'),
    path('magic/memberships/<str:token>/', MagicLinkInfoView.as_view(), name='magic-membership-detail'),
    path('magic/memberships/<str:token>/apply/', SubmitMembershipApplication.as_view(), name='magic-membership-apply'),
    path('organizations/public/<slug:slug>/', PublicOrganizationDetailView.as_view(), name='organization-public-detail'),
    path('dashboard/organization/', OrganizationDashboardView.as_view(), name='organization-dashboard'),
    path('dashboard/organization/<int:organization_pk>/', OrganizationDashboardView.as_view(), name='organization-dashboard-detail'),
    path('dashboard/owner/', OwnerDashboard.as_view()),
    path('dashboard/pharmacist/', PharmacistDashboard.as_view()),
    path('dashboard/otherstaff/', OtherStaffDashboard.as_view()),
    path('dashboard/explorer/', ExplorerDashboard.as_view()),
    path('owner-onboarding/claim/', OwnerOnboardingClaim.as_view(), name='owneronboarding-claim'),
]
