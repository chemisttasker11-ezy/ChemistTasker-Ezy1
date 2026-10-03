"""Public URL ownership for organizations, pharmacies and claims.

Routers are split so core can preserve the historical membership interleaving:
organization/pharmacy routes, membership, pharmacy-admins, then membership
invite/application routes.
"""
from django.urls import path
from rest_framework.routers import DefaultRouter

from organizations.claims import OwnerOnboardingClaim, PharmacyClaimViewSet
from organizations.views import (
    ChainViewSet,
    OrganizationViewSet,
    PharmacyAdminViewSet,
    PharmacyViewSet,
    PublicOrganizationDetailView,
)


primary_router = DefaultRouter()
primary_router.include_root_view = False
primary_router.register(r"organizations", OrganizationViewSet, basename="organization")
primary_router.register(r"chains", ChainViewSet, basename="chain")
primary_router.register(r"pharmacies", PharmacyViewSet)
primary_router.register(r"pharmacy-claims", PharmacyClaimViewSet, basename="pharmacy-claim")

admin_router = DefaultRouter()
admin_router.include_root_view = False
admin_router.register(r"pharmacy-admins", PharmacyAdminViewSet, basename="pharmacy-admin")

router = DefaultRouter()
router.include_root_view = False
router.registry.extend(primary_router.registry)
router.registry.extend(admin_router.registry)

urlpatterns = [
    path(
        "organizations/public/<slug:slug>/",
        PublicOrganizationDetailView.as_view(),
        name="organization-public-detail",
    ),
    path(
        "owner-onboarding/claim/",
        OwnerOnboardingClaim.as_view(),
        name="owneronboarding-claim",
    ),
]
