# client_profile/urls.py
from django.urls import path, include
from .views import *
from .calendar_views import (
    CalendarEventViewSet,
    CalendarFeedView,
    WorkNoteViewSet,
)
from .hub.api import (
    HubCommentViewSet,
    HubCommunityGroupViewSet,
    HubContextView,
    HubOrganizationProfileView,
    HubPharmacyProfileView,
    HubPostViewSet,
    HubCommentReactionView,
    HubReactionView,
    HubPollViewSet,
    HubPollCommentViewSet,
    HubPollReactionView,
)
from .attendance_views import (
    KioskActiveStaffView,
    KioskActivateView,
    KioskPairWithCodeView,
    KioskPinClockView,
    KioskOfflineSyncView,
    KioskConfigView,
    KioskQRView,
    KioskRequestPairingCodeView,
    KioskStaffBreakActionView,
    KioskWorkerPinStatusView,
    KioskWorkerEnrolView,
    KioskWorkerSetupPinView,
    WorkerAttendanceStatusView,
    WorkerClockInView,
    WorkerBreakStartView,
    WorkerBreakEndView,
    WorkerClockOutView,
    WorkerUpdatePinView,
    ManagerPendingAttendancesView,
    ManagerApproveAttendanceView,
    ManagerRejectAttendanceView,
    ManagerCreateCorrectionView,
    ManagerSessionTimelineView,
    RosterPeriodDetailView,
    RosterValidateView,
    RosterPublishView,
    RosterUnpublishView,
    RosterArchiveView,
    WorkerPublishedRosterView,
    WorkerAcknowledgeRosterView,
    RosterAcknowledgementStatusView,
    RosterCopyWeekView,
    RosterTemplateView,
    RosterTemplateApplyView,
    RosterBulkEditView,
    RosterWorkerSwapRequestView,
    RosterWorkerCoverRequestView,
    RosterManagerApproveSwapView,
    RosterManagerApproveReplacementView,
    RosterManagerReleaseWorkerView,
    RosterManagerRejectRequestView,
    RosterActionAuditListView,
)
from rest_framework.routers import DefaultRouter


router = DefaultRouter()

router.register(r'organizations', OrganizationViewSet, basename='organization')

# Register the views with appropriate routes
router.register(r'chains', ChainViewSet, basename='chain')
router.register(r'pharmacies', PharmacyViewSet)
router.register(r'pharmacy-claims', PharmacyClaimViewSet, basename='pharmacy-claim')
router.register(r'memberships', MembershipViewSet, basename='membership')
router.register(r'pharmacy-admins', PharmacyAdminViewSet, basename='pharmacy-admin')
router.register(r'membership-invite-links', MembershipInviteLinkViewSet, basename='membership-invite-link')
router.register(r'membership-applications', MembershipApplicationViewSet, basename='membership-application')

router.register(r'community-shifts', CommunityShiftViewSet, basename='community-shifts')
router.register(r'public-shifts',    PublicShiftViewSet,    basename='public-shifts')
router.register(r'shift-description-templates', ShiftDescriptionTemplateViewSet, basename='shift-description-template')
# My shifts by status for posters
router.register(r'user-availability', UserAvailabilityViewSet, basename='user-availability')
router.register(r'pill-rewards', PillRewardsViewSet, basename='pill-rewards')
router.register(r'shifts/active',    ActiveShiftViewSet,    basename='active-shifts')
router.register(r'shifts/confirmed', ConfirmedShiftViewSet, basename='confirmed-shifts')
router.register(r'shifts/history',   HistoryShiftViewSet,   basename='history-shifts')
router.register(r'shifts', ShiftDetailViewSet, basename='shift')

# Roster endpoints
router.register(r'roster-owner', RosterOwnerViewSet, basename='roster-owner')
router.register(r'roster-worker', RosterWorkerViewSet, basename='roster-worker')
router.register(r'roster-shifts', RosterShiftManageViewSet, basename='roster-shift')
# Interest endpoint
router.register(r'shift-interests', ShiftInterestViewSet,  basename='shift-interests')
router.register(r'shift-rejections', ShiftRejectionViewSet, basename='shift-rejections')
router.register(r'shift-saved', ShiftSavedViewSet, basename='shift-saved')
router.register(r'shift-offers', ShiftOfferViewSet, basename='shift-offers')

router.register(r'my-confirmed-shifts',MyConfirmedShiftsViewSet,basename='my-confirmed-shifts')
router.register(r'my-history-shifts',MyHistoryShiftsViewSet,basename='my-history-shifts')
router.register(r'leave-requests', LeaveRequestViewSet, basename='leaverequest')
router.register(r"worker-shift-requests",WorkerShiftRequestViewSet,basename="worker-shift-requests")
router.register(r'ratings', RatingViewSet, basename='rating')

#chat app
router.register(r'rooms', ConversationViewSet, basename='conversation')
router.register(r'my-memberships', MyMembershipsViewSet, basename='my-memberships')
router.register(r'messages', MessageViewSet, basename='message')
router.register(r'notifications', NotificationViewSet, basename='notification')
router.register(r'device-tokens', DeviceTokenViewSet, basename='device-token')


# explorer post
router.register(r'explorer-posts', ExplorerPostViewSet, basename='explorer-post')

# Calendar & Work Notes
router.register(r'calendar-events', CalendarEventViewSet, basename='calendar-event')
router.register(r'work-notes', WorkNoteViewSet, basename='work-note')
router.register(r'calendar-feed', CalendarFeedView, basename='calendar-feed')


hub_group_list = HubCommunityGroupViewSet.as_view({"get": "list", "post": "create"})
hub_group_detail = HubCommunityGroupViewSet.as_view(
    {"get": "retrieve", "patch": "partial_update", "delete": "destroy"}
)
hub_post_list = HubPostViewSet.as_view({"get": "list", "post": "create"})
hub_post_detail = HubPostViewSet.as_view(
    {"get": "retrieve", "patch": "partial_update", "delete": "destroy"}
)
hub_post_pin = HubPostViewSet.as_view({"post": "pin"})
hub_post_unpin = HubPostViewSet.as_view({"post": "unpin"})
hub_comment_list = HubCommentViewSet.as_view({"get": "list", "post": "create"})
hub_comment_detail = HubCommentViewSet.as_view(
    {"patch": "partial_update", "delete": "destroy"}
)
hub_poll_list = HubPollViewSet.as_view({"get": "list", "post": "create"})
hub_poll_detail = HubPollViewSet.as_view(
    {"get": "retrieve", "patch": "partial_update", "put": "update", "delete": "destroy"}
)
hub_poll_vote = HubPollViewSet.as_view({"post": "vote"})
hub_poll_comment_list = HubPollCommentViewSet.as_view({"get": "list", "post": "create"})
hub_poll_comment_detail = HubPollCommentViewSet.as_view(
    {"patch": "partial_update", "delete": "destroy"}
)

urlpatterns = [
    path('workforce/', include('workforce.urls')),
    path('owner/onboarding/me/', OwnerOnboardingV2MeView.as_view(), name='owner-onboarding-me'),
    path('pharmacist/onboarding/me/', PharmacistOnboardingV2MeView.as_view(), name='pharmacist-onboarding-me'),
    path('otherstaff/onboarding/me/', OtherStaffOnboardingV2MeView.as_view(), name='otherstaff-onboarding-me'),
    path('explorer/onboarding/me/', ExplorerOnboardingV2MeView.as_view(), name='explorer-onboarding-me'),

    # path('onboarding/referee-confirm/<int:profile_pk>/<int:ref_idx>/', RefereeConfirmView.as_view(), name='referee-confirm'),
    path('onboarding/submit-reference/<str:token>/', RefereeSubmitResponseView.as_view(), name='submit-referee-response'),
    path('onboarding/referee-reject/<str:token>/', RefereeRejectView.as_view(), name='referee-reject'),

    path('magic/memberships/<str:token>/', MagicLinkInfoView.as_view(), name='magic-membership-detail'),
    path('magic/memberships/<str:token>/apply/', SubmitMembershipApplication.as_view(), name='magic-membership-apply'),

    # Public organization profile
    path('organizations/public/<slug:slug>/', PublicOrganizationDetailView.as_view(), name='organization-public-detail'),

    path('dashboard/organization/', OrganizationDashboardView.as_view(), name='organization-dashboard'),
    path('dashboard/organization/<int:organization_pk>/',OrganizationDashboardView.as_view(), name='organization-dashboard-detail'),
    path('dashboard/owner/', OwnerDashboard.as_view()),
    path('dashboard/pharmacist/', PharmacistDashboard.as_view()),
    path('dashboard/otherstaff/', OtherStaffDashboard.as_view()),
    path('dashboard/explorer/', ExplorerDashboard.as_view()),
    
    # Claim endpoint for OwnerOnboarding
    path('owner-onboarding/claim/',  OwnerOnboardingClaim.as_view(), name='owneronboarding-claim' ),

    path('public-job-board/', PublicJobBoardView.as_view(), name='public-job-board'),
    path('view-shared-shift/', SharedShiftDetailView.as_view(), name='view-shared-shift'),


    path('roster/create-and-assign-shift/', CreateShiftAndAssignView.as_view(), name='create-shift-and-assign'),

    # Invoice
    # list and create (manual or via shifts)
    path('invoices/', InvoiceListView.as_view(), name='invoice-list'),
    path('invoices/preview/<int:shift_id>/', preview_invoice_lines, name='invoice-preview'),
    # retrieve/update/delete
    path('invoices/<int:pk>/', InvoiceDetailView.as_view(), name='invoice-detail'),
    # alternate generate endpoint (optional—your front end can use POST to /invoices/ directly)
    path('invoices/generate/', GenerateInvoiceView.as_view(), name='generate-invoice'),
    path('invoices/<int:invoice_id>/pdf/', invoice_pdf_view, name='invoice_pdf'),
    path('invoices/<int:invoice_id>/send/', send_invoice_email, name='send-invoice-email'),
    path('invoices/<int:invoice_id>/report-issue/', report_invoice_issue, name='report-invoice-issue'),


    path('messages/<int:message_id>/react/', MessageReactionView.as_view(), name='message-react'),
    path('chat-participants/', ChatParticipantView.as_view(), name='chat-participants-list'),




    path('hub/context/', HubContextView.as_view(), name='hub-context'),
    path('hub/groups/', hub_group_list, name='hub-group-list'),
    path('hub/groups/<int:pk>/', hub_group_detail, name='hub-group-detail'),
    path('hub/posts/', hub_post_list, name='hub-post-list'),
    path('hub/posts/<int:pk>/', hub_post_detail, name='hub-post-detail'),
    path('hub/posts/<int:pk>/pin/', hub_post_pin, name='hub-post-pin'),
    path('hub/posts/<int:pk>/unpin/', hub_post_unpin, name='hub-post-unpin'),
    path('hub/polls/', hub_poll_list, name='hub-poll-list'),
    path('hub/polls/<int:pk>/', hub_poll_detail, name='hub-poll-detail'),
    path('hub/polls/<int:pk>/vote/', hub_poll_vote, name='hub-poll-vote'),
    path('hub/polls/<int:poll_pk>/comments/', hub_poll_comment_list, name='hub-poll-comment-list'),
    path('hub/polls/<int:poll_pk>/comments/<int:pk>/', hub_poll_comment_detail, name='hub-poll-comment-detail'),
    path('hub/polls/<int:poll_pk>/reactions/', HubPollReactionView.as_view(), name='hub-poll-reaction'),
    path('hub/posts/<int:post_pk>/comments/', hub_comment_list, name='hub-comment-list'),
    path(
        'hub/posts/<int:post_pk>/comments/<int:pk>/',
        hub_comment_detail,
        name='hub-comment-detail',
    ),
    path(
        'hub/posts/<int:post_pk>/comments/<int:comment_pk>/reactions/',
        HubCommentReactionView.as_view(),
        name='hub-comment-reaction',
    ),
    path(
        'hub/posts/<int:post_pk>/reactions/',
        HubReactionView.as_view(),
        name='hub-reaction',
    ),
    path(
        'hub/pharmacies/<int:pharmacy_pk>/profile/',
        HubPharmacyProfileView.as_view(),
        name='hub-pharmacy-profile',
    ),
    path(
        'hub/organizations/<int:organization_pk>/profile/',
        HubOrganizationProfileView.as_view(),
        name='hub-organization-profile',
    ),

    # Attendance V1 Endpoints
    # Kiosk
    path('attendance/kiosk/activate/', KioskActivateView.as_view(), name='attendance-kiosk-activate'),
    path('attendance/kiosk/pairing/request/', KioskRequestPairingCodeView.as_view(), name='attendance-kiosk-pairing-request'),
    path('attendance/kiosk/pairing/pair/', KioskPairWithCodeView.as_view(), name='attendance-kiosk-pairing-pair'),
    path('attendance/kiosk/qr/', KioskQRView.as_view(), name='attendance-kiosk-qr'),
    path('attendance/kiosk/pin-clock/', KioskPinClockView.as_view(), name='attendance-kiosk-pin-clock'),
    path('attendance/kiosk/sync/batch/', KioskOfflineSyncView.as_view(), name='attendance-kiosk-sync-batch'),
    path('attendance/kiosk/config/', KioskConfigView.as_view(), name='attendance-kiosk-config'),
    path('attendance/kiosk/workers/enrol/', KioskWorkerEnrolView.as_view(), name='attendance-kiosk-worker-enrol'),
    path('attendance/kiosk/worker-pin/status/', KioskWorkerPinStatusView.as_view(), name='attendance-kiosk-worker-pin-status'),
    path('attendance/kiosk/worker-pin/setup/', KioskWorkerSetupPinView.as_view(), name='attendance-kiosk-worker-pin-setup'),
    path('attendance/kiosk/active-staff/', KioskActiveStaffView.as_view(), name='attendance-kiosk-active-staff'),
    path('attendance/kiosk/break/', KioskStaffBreakActionView.as_view(), name='attendance-kiosk-break'),

    # Worker
    path('attendance/worker/status/', WorkerAttendanceStatusView.as_view(), name='attendance-worker-status'),
    path('attendance/worker/clock-in/', WorkerClockInView.as_view(), name='attendance-worker-clock-in'),
    path('attendance/worker/break-start/', WorkerBreakStartView.as_view(), name='attendance-worker-break-start'),
    path('attendance/worker/break-end/', WorkerBreakEndView.as_view(), name='attendance-worker-break-end'),
    path('attendance/worker/clock-out/', WorkerClockOutView.as_view(), name='attendance-worker-clock-out'),
    path('attendance/worker/pin/update/', WorkerUpdatePinView.as_view(), name='attendance-worker-pin-update'),

    # Manager
    path('attendance/manager/pending/', ManagerPendingAttendancesView.as_view(), name='attendance-manager-pending'),
    path('attendance/manager/approve/', ManagerApproveAttendanceView.as_view(), name='attendance-manager-approve'),
    path('attendance/manager/reject/', ManagerRejectAttendanceView.as_view(), name='attendance-manager-reject'),
    path('attendance/manager/correct/', ManagerCreateCorrectionView.as_view(), name='attendance-manager-correct'),
    path('attendance/manager/timeline/<int:session_id>/', ManagerSessionTimelineView.as_view(), name='attendance-manager-timeline'),

    # Roster V2 Endpoints
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

    # Worker Actions & Escalation (Checkpoint 12)
    path('attendance/roster/worker/swap-request/', RosterWorkerSwapRequestView.as_view(), name='roster-worker-swap-request'),
    path('attendance/roster/worker/cover-request/', RosterWorkerCoverRequestView.as_view(), name='roster-worker-cover-request'),
    path('attendance/roster/manager/approve-swap/', RosterManagerApproveSwapView.as_view(), name='roster-manager-approve-swap'),
    path('attendance/roster/manager/approve-replacement/', RosterManagerApproveReplacementView.as_view(), name='roster-manager-approve-replacement'),
    path('attendance/roster/manager/release-worker/', RosterManagerReleaseWorkerView.as_view(), name='roster-manager-release-worker'),
    path('attendance/roster/manager/reject-request/', RosterManagerRejectRequestView.as_view(), name='roster-manager-reject-request'),
    path('attendance/roster/audits/', RosterActionAuditListView.as_view(), name='roster-action-audits'),

    # Include the API routes for CRUD operations
    path('', include(router.urls)),
]
