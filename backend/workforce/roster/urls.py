"""Roster API routes (V1 viewsets and V2 period, publication and worker-request endpoints). Mounted inside client_profile.urls, so public paths and the `client_profile:` route names are unchanged."""
from django.urls import path
from rest_framework.routers import DefaultRouter
from workforce.roster.v2_views import (
    RosterAcknowledgementStatusView,
    RosterActionAuditListView,
    RosterArchiveView,
    RosterBulkEditView,
    RosterCopyWeekView,
    RosterManagerApproveReplacementView,
    RosterManagerApproveSwapView,
    RosterManagerRejectRequestView,
    RosterManagerReleaseWorkerView,
    RosterPeriodDetailView,
    RosterPublishView,
    RosterTemplateApplyView,
    RosterTemplateView,
    RosterUnpublishView,
    RosterValidateView,
    RosterWorkerCoverRequestView,
    RosterWorkerSwapRequestView,
    WorkerAcknowledgeRosterView,
    WorkerPublishedRosterView,
)
from workforce.roster.views import (
    CreateShiftAndAssignView,
    RosterOwnerViewSet,
    RosterShiftManageViewSet,
    RosterWorkerViewSet,
)


router = DefaultRouter()
router.include_root_view = False   # the API root view is provided once, by client_profile's router
router.register(r'roster-owner', RosterOwnerViewSet, basename='roster-owner')
router.register(r'roster-worker', RosterWorkerViewSet, basename='roster-worker')
router.register(r'roster-shifts', RosterShiftManageViewSet, basename='roster-shift')

urlpatterns = [
    path('roster/create-and-assign-shift/', CreateShiftAndAssignView.as_view(), name='create-shift-and-assign'),
    path('attendance/roster/period/', RosterPeriodDetailView.as_view(), name='roster-period-detail'),
    path('attendance/roster/validate/', RosterValidateView.as_view(), name='roster-validate'),
    path('attendance/roster/publish/', RosterPublishView.as_view(), name='roster-publish'),
    path('attendance/roster/unpublish/', RosterUnpublishView.as_view(), name='roster-unpublish'),
    path('attendance/roster/archive/', RosterArchiveView.as_view(), name='roster-archive'),
    path('attendance/roster/worker/', WorkerPublishedRosterView.as_view(), name='roster-worker-published'),
    path('attendance/roster/acknowledge/', WorkerAcknowledgeRosterView.as_view(), name='roster-worker-acknowledge'),
    path('attendance/roster/acknowledgements/<int:period_id>/', RosterAcknowledgementStatusView.as_view(), name='roster-acknowledgement-status'),
    path('attendance/roster/copy-week/', RosterCopyWeekView.as_view(), name='roster-copy-week'),
    path('attendance/roster/templates/', RosterTemplateView.as_view(), name='roster-templates'),
    path('attendance/roster/templates/apply/', RosterTemplateApplyView.as_view(), name='roster-templates-apply'),
    path('attendance/roster/bulk-edit/', RosterBulkEditView.as_view(), name='roster-bulk-edit'),
    path('attendance/roster/worker/swap-request/', RosterWorkerSwapRequestView.as_view(), name='roster-worker-swap-request'),
    path('attendance/roster/worker/cover-request/', RosterWorkerCoverRequestView.as_view(), name='roster-worker-cover-request'),
    path('attendance/roster/manager/approve-swap/', RosterManagerApproveSwapView.as_view(), name='roster-manager-approve-swap'),
    path('attendance/roster/manager/approve-replacement/', RosterManagerApproveReplacementView.as_view(), name='roster-manager-approve-replacement'),
    path('attendance/roster/manager/release-worker/', RosterManagerReleaseWorkerView.as_view(), name='roster-manager-release-worker'),
    path('attendance/roster/manager/reject-request/', RosterManagerRejectRequestView.as_view(), name='roster-manager-reject-request'),
    path('attendance/roster/audits/', RosterActionAuditListView.as_view(), name='roster-action-audits'),
]
