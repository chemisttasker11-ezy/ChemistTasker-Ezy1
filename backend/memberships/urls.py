"""Public URL ownership for membership lifecycle APIs.

Routers are intentionally split so core can preserve the historical API-root
ordering around the organization-owned pharmacy-admin route.
"""
from django.urls import path
from rest_framework.routers import DefaultRouter

from memberships.views import (
    MagicLinkInfoView,
    MembershipApplicationViewSet,
    MembershipInviteLinkViewSet,
    MembershipViewSet,
    MyMembershipsViewSet,
    SubmitMembershipApplication,
)


membership_router = DefaultRouter()
membership_router.include_root_view = False
membership_router.register(r"memberships", MembershipViewSet, basename="membership")

intake_router = DefaultRouter()
intake_router.include_root_view = False
intake_router.register(
    r"membership-invite-links",
    MembershipInviteLinkViewSet,
    basename="membership-invite-link",
)
intake_router.register(
    r"membership-applications",
    MembershipApplicationViewSet,
    basename="membership-application",
)

self_router = DefaultRouter()
self_router.include_root_view = False
self_router.register(r"my-memberships", MyMembershipsViewSet, basename="my-memberships")

router = DefaultRouter()
router.include_root_view = False
router.registry.extend(membership_router.registry)
router.registry.extend(intake_router.registry)
router.registry.extend(self_router.registry)

urlpatterns = [
    path("magic/memberships/<str:token>/", MagicLinkInfoView.as_view(), name="magic-membership-detail"),
    path(
        "magic/memberships/<str:token>/apply/",
        SubmitMembershipApplication.as_view(),
        name="magic-membership-apply",
    ),
]
