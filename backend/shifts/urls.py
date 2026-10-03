"""URL ownership for the shift domain.

The three routers are composed separately by core.client_profile_api_urls so
the historical API-root registration order remains byte-for-byte compatible.
"""
from django.urls import path
from rest_framework.routers import DefaultRouter

from shifts.browse import (
    CommunityShiftViewSet,
    PublicJobBoardView,
    PublicShiftViewSet,
    SharedShiftDetailView,
)
from shifts.description_templates import ShiftDescriptionTemplateViewSet
from shifts.lifecycle import ActiveShiftViewSet, ConfirmedShiftViewSet, HistoryShiftViewSet, ShiftDetailViewSet
from shifts.my_shifts import MyConfirmedShiftsViewSet, MyHistoryShiftsViewSet
from shifts.leave import LeaveRequestViewSet
from shifts.offers import (
    ShiftInterestViewSet,
    ShiftOfferViewSet,
    ShiftRejectionViewSet,
    ShiftSavedViewSet,
)
from shifts.worker_requests import WorkerShiftRequestViewSet


discovery_router = DefaultRouter()
discovery_router.include_root_view = False
discovery_router.register(r"community-shifts", CommunityShiftViewSet, basename="community-shifts")
discovery_router.register(r"public-shifts", PublicShiftViewSet, basename="public-shifts")
discovery_router.register(
    r"shift-description-templates",
    ShiftDescriptionTemplateViewSet,
    basename="shift-description-template",
)

lifecycle_router = DefaultRouter()
lifecycle_router.include_root_view = False
lifecycle_router.register(r"shifts/active", ActiveShiftViewSet, basename="active-shifts")
lifecycle_router.register(r"shifts/confirmed", ConfirmedShiftViewSet, basename="confirmed-shifts")
lifecycle_router.register(r"shifts/history", HistoryShiftViewSet, basename="history-shifts")
lifecycle_router.register(r"shifts", ShiftDetailViewSet, basename="shift")

engagement_router = DefaultRouter()
engagement_router.include_root_view = False
engagement_router.register(r"shift-interests", ShiftInterestViewSet, basename="shift-interests")
engagement_router.register(r"shift-rejections", ShiftRejectionViewSet, basename="shift-rejections")
engagement_router.register(r"shift-saved", ShiftSavedViewSet, basename="shift-saved")
engagement_router.register(r"shift-offers", ShiftOfferViewSet, basename="shift-offers")
engagement_router.register(r"my-confirmed-shifts", MyConfirmedShiftsViewSet, basename="my-confirmed-shifts")
engagement_router.register(r"my-history-shifts", MyHistoryShiftsViewSet, basename="my-history-shifts")
engagement_router.register(r"leave-requests", LeaveRequestViewSet, basename="leaverequest")
engagement_router.register(r"worker-shift-requests", WorkerShiftRequestViewSet, basename="worker-shift-requests")

router = DefaultRouter()
router.include_root_view = False
router.registry.extend(discovery_router.registry)
router.registry.extend(lifecycle_router.registry)
router.registry.extend(engagement_router.registry)

urlpatterns = [
    path("public-job-board/", PublicJobBoardView.as_view(), name="public-job-board"),
    path("view-shared-shift/", SharedShiftDetailView.as_view(), name="view-shared-shift"),
]
