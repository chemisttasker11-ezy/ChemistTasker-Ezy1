# client_profile/urls.py
from django.urls import path, include
from .domains.roster.views import (
    CreateShiftAndAssignView,
    RosterOwnerViewSet,
    RosterShiftManageViewSet,
    RosterWorkerViewSet,
)
from .domains.dashboards.views import (
    ExplorerDashboard,
    OrganizationDashboardView,
    OtherStaffDashboard,
    OwnerDashboard,
    PharmacistDashboard,
)
from .domains.shifts.browse import (
    ActiveShiftViewSet,
    CommunityShiftViewSet,
    ConfirmedShiftViewSet,
    HistoryShiftViewSet,
    MyConfirmedShiftsViewSet,
    MyHistoryShiftsViewSet,
    PublicJobBoardView,
    PublicShiftViewSet,
    SharedShiftDetailView,
    ShiftDescriptionTemplateViewSet,
    ShiftDetailViewSet,
)
from .domains.shifts.leave import LeaveRequestViewSet
from .domains.shifts.offers import (
    ShiftInterestViewSet,
    ShiftOfferViewSet,
    ShiftRejectionViewSet,
    ShiftSavedViewSet,
)
from .domains.shifts.worker_requests import WorkerShiftRequestViewSet
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
from rest_framework.routers import DefaultRouter
from rewards.urls import router as rewards_router
from ratings.urls import router as ratings_router
from talent.urls import router as talent_router
from team_calendar.urls import router as team_calendar_router
from notifications.urls import router as notifications_router
from chat.urls import router as chat_router


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
router.registry.extend(talent_router.registry)   # talent routes, declared in talent/urls.py
router.registry.extend(rewards_router.registry)   # rewards routes, declared in rewards/urls.py
# My shifts by status for posters
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
router.registry.extend(ratings_router.registry)   # ratings routes, declared in ratings/urls.py

router.registry.extend(chat_router.registry)   # chat routes, declared in chat/urls.py
router.register(r'my-memberships', MyMembershipsViewSet, basename='my-memberships')
router.registry.extend(notifications_router.registry)   # notifications routes, declared in notifications/urls.py

router.registry.extend(team_calendar_router.registry)   # team_calendar routes, declared in team_calendar/urls.py


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

    # Routes of the apps split out of this kernel (each declares its own paths), then the router
    path('', include('chat.urls')),
    path('', include('pharmacy_hub.urls')),
    path('', include('invoicing.urls')),
    path('', include('attendance.urls')),
    path('', include(router.urls)),
]
