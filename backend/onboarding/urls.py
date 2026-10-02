"""Public URL ownership for onboarding and referee workflows."""
from django.urls import path

from onboarding.views import (
    ExplorerOnboardingV2MeView,
    OtherStaffOnboardingV2MeView,
    OwnerOnboardingV2MeView,
    PharmacistOnboardingV2MeView,
    RefereeRejectView,
    RefereeSubmitResponseView,
)


urlpatterns = [
    path("owner/onboarding/me/", OwnerOnboardingV2MeView.as_view(), name="owner-onboarding-me"),
    path(
        "pharmacist/onboarding/me/",
        PharmacistOnboardingV2MeView.as_view(),
        name="pharmacist-onboarding-me",
    ),
    path(
        "otherstaff/onboarding/me/",
        OtherStaffOnboardingV2MeView.as_view(),
        name="otherstaff-onboarding-me",
    ),
    path(
        "explorer/onboarding/me/",
        ExplorerOnboardingV2MeView.as_view(),
        name="explorer-onboarding-me",
    ),
    path(
        "onboarding/submit-reference/<str:token>/",
        RefereeSubmitResponseView.as_view(),
        name="submit-referee-response",
    ),
    path(
        "onboarding/referee-reject/<str:token>/",
        RefereeRejectView.as_view(),
        name="referee-reject",
    ),
]
