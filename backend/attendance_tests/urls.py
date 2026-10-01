"""The attendance and roster endpoints exercised by the isolated SQLite suites (same paths as production)."""

from django.urls import include, path
from rest_framework.routers import DefaultRouter

from attendance.views import (
    KioskActivateView,
    KioskActiveStaffView,
    KioskOfflineSyncView,
    KioskPairWithCodeView,
    KioskPinClockView,
    KioskQRView,
    KioskRequestPairingCodeView,
    KioskSelfRevokeView,
    KioskStaffBreakActionView,
    KioskWorkerEnrolView,
    KioskWorkerPinStatusView,
    KioskWorkerSetupPinView,
    ManagerApproveAttendanceView,
    ManagerCreateCorrectionView,
    ManagerKioskDevicesView,
    ManagerPendingAttendancesView,
    ManagerRejectAttendanceView,
    ManagerSessionTimelineView,
    WorkerAttendanceStatusView,
    WorkerBreakEndView,
    WorkerBreakStartView,
    WorkerClockInView,
    WorkerClockOutView,
    WorkerUpdatePinView,
)

from client_profile.domains.roster.views import RosterOwnerViewSet, RosterShiftManageViewSet, RosterWorkerViewSet
from client_profile.domains.roster.v2_views import (
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

router = DefaultRouter()
router.include_root_view = False
router.register(r"roster-owner", RosterOwnerViewSet, basename="roster-owner")
router.register(r"roster-worker", RosterWorkerViewSet, basename="roster-worker")
router.register(r"roster-shifts", RosterShiftManageViewSet, basename="roster-shift")

urlpatterns = [
    path("attendance/kiosk/activate/", KioskActivateView.as_view()),
    path("attendance/kiosk/pairing/request/", KioskRequestPairingCodeView.as_view()),
    path("attendance/kiosk/pairing/pair/", KioskPairWithCodeView.as_view()),
    path("attendance/kiosk/qr/", KioskQRView.as_view()),
    path("attendance/kiosk/pin-clock/", KioskPinClockView.as_view()),
    path("attendance/kiosk/sync/batch/", KioskOfflineSyncView.as_view()),
    path("attendance/kiosk/revoke-self/", KioskSelfRevokeView.as_view()),
    path("attendance/kiosk/workers/enrol/", KioskWorkerEnrolView.as_view()),
    path("attendance/kiosk/worker-pin/status/", KioskWorkerPinStatusView.as_view()),
    path("attendance/kiosk/worker-pin/setup/", KioskWorkerSetupPinView.as_view()),
    path("attendance/kiosk/active-staff/", KioskActiveStaffView.as_view()),
    path("attendance/kiosk/break/", KioskStaffBreakActionView.as_view()),
    path("attendance/worker/status/", WorkerAttendanceStatusView.as_view()),
    path("attendance/worker/clock-in/", WorkerClockInView.as_view()),
    path("attendance/worker/break-start/", WorkerBreakStartView.as_view()),
    path("attendance/worker/break-end/", WorkerBreakEndView.as_view()),
    path("attendance/worker/clock-out/", WorkerClockOutView.as_view()),
    path("attendance/worker/pin/update/", WorkerUpdatePinView.as_view()),
    path("attendance/manager/pending/", ManagerPendingAttendancesView.as_view()),
    path("attendance/manager/approve/", ManagerApproveAttendanceView.as_view()),
    path("attendance/manager/reject/", ManagerRejectAttendanceView.as_view()),
    path("attendance/manager/correct/", ManagerCreateCorrectionView.as_view()),
    path("attendance/manager/timeline/<int:session_id>/", ManagerSessionTimelineView.as_view()),
    path("attendance/manager/kiosk-devices/", ManagerKioskDevicesView.as_view()),
    # Roster V2
    path("attendance/roster/period/", RosterPeriodDetailView.as_view(), name="roster-period-detail"),
    path("attendance/roster/validate/", RosterValidateView.as_view(), name="roster-validate"),
    path("attendance/roster/publish/", RosterPublishView.as_view(), name="roster-publish"),
    path("attendance/roster/unpublish/", RosterUnpublishView.as_view(), name="roster-unpublish"),
    path("attendance/roster/archive/", RosterArchiveView.as_view(), name="roster-archive"),
    path("attendance/roster/worker/", WorkerPublishedRosterView.as_view(), name="roster-worker-published"),
    path("attendance/roster/acknowledge/", WorkerAcknowledgeRosterView.as_view(), name="roster-worker-acknowledge"),
    path("attendance/roster/acknowledgements/<int:period_id>/", RosterAcknowledgementStatusView.as_view(), name="roster-acknowledgement-status"),
    path("attendance/roster/copy-week/", RosterCopyWeekView.as_view(), name="roster-copy-week"),
    path("attendance/roster/templates/", RosterTemplateView.as_view(), name="roster-templates"),
    path("attendance/roster/templates/apply/", RosterTemplateApplyView.as_view(), name="roster-templates-apply"),
    path("attendance/roster/bulk-edit/", RosterBulkEditView.as_view(), name="roster-bulk-edit"),
    path("attendance/roster/worker/swap-request/", RosterWorkerSwapRequestView.as_view(), name="roster-worker-swap-request"),
    path("attendance/roster/worker/cover-request/", RosterWorkerCoverRequestView.as_view(), name="roster-worker-cover-request"),
    path("attendance/roster/manager/approve-swap/", RosterManagerApproveSwapView.as_view(), name="roster-manager-approve-swap"),
    path("attendance/roster/manager/approve-replacement/", RosterManagerApproveReplacementView.as_view(), name="roster-manager-approve-replacement"),
    path("attendance/roster/manager/release-worker/", RosterManagerReleaseWorkerView.as_view(), name="roster-manager-release-worker"),
    path("attendance/roster/manager/reject-request/", RosterManagerRejectRequestView.as_view(), name="roster-manager-reject-request"),
    path("attendance/roster/audits/", RosterActionAuditListView.as_view(), name="roster-action-audits"),
    # Roster V1 (router)
    path("", include(router.urls)),
]
