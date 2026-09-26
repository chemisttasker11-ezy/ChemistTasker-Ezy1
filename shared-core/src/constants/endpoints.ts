/**
 * API Endpoints - copied from frontend_web/src/constants/api.ts
 * Source of truth for all backend routes
 */
export const API_ENDPOINTS = {
    // Auth
    login: '/users/login/',
    register: '/users/register/',
    refresh: '/users/token/refresh/',
    verifyOtp: "/users/verify-otp/",
    resendOtp: "/users/resend-otp/",
    deleteAccount: "/account/",
    contactSupport: '/users/contact/',


    // --- Mobile OTP (users app) ---
    mobileRequestOtp: '/users/mobile/request-otp/',
    mobileVerifyOtp: '/users/mobile/verify-otp/',
    mobileResendOtp: '/users/mobile/resend-otp/',

    // Dashboards
    organizations: '/client-profile/organizations/',

    // organizationDashboard: '/client-profile/dashboard/organization/',
    organizationDashboard: (orgId: number) => `/client-profile/dashboard/organization/${orgId}/`,
    ownerDashboard: '/client-profile/dashboard/owner/',
    pharmacistDashboard: '/client-profile/dashboard/pharmacist/',
    otherStaffDashboard: '/client-profile/dashboard/otherstaff/',
    explorerDashboard: '/client-profile/dashboard/explorer/',

    // Onboarding
    onboardingDetail: (role: string) => {
        const safeRole = role === 'other_staff' ? 'otherstaff' : role;
        return `/client-profile/${safeRole}/onboarding/me/`;
    },
    onboardingCreate: (role: string) => {
        const safeRole = role === 'other_staff' ? 'otherstaff' : role;
        return `/client-profile/${safeRole}/onboarding/`;
    },


    // refereeConfirm: (pk: string | number, refIndex: string | number) =>
    //   `/client-profile/onboarding/referee-confirm/${pk}/${refIndex}/`,

    submitRefereeResponse: (token: string) =>
        `/client-profile/onboarding/submit-reference/${token}/`,

    refereeRejectByToken: (token: string) =>
        `/client-profile/onboarding/referee-reject/${token}/`,

    /** @deprecated Django now exposes the token route above. Kept until legacy links are migrated. */
    refereeReject: (pk: string | number, refIndex: string | number) =>
        `/client-profile/onboarding/referee-reject/${pk}/${refIndex}/`,

    // invite & claim
    inviteOrgUser: '/users/invite-org-user/',
    organizationMemberships: '/users/organization-memberships/',
    organizationRoleDefinitions: '/users/organization-role-definitions/',
    passwordReset: '/users/password-reset/',
    passwordResetConfirm: '/users/password-reset-confirm/',
    claimOnboarding: '/client-profile/owner-onboarding/claim/',
    pharmacyClaims: '/client-profile/pharmacy-claims/',
    pharmacyClaimDetail: (claimId: number | string) => `/client-profile/pharmacy-claims/${claimId}/`,

    // Pharmacies
    pharmacies: '/client-profile/pharmacies/',
    pharmacyDetail: (pharmacyId: string) => `/client-profile/pharmacies/${pharmacyId}/`,

    // **User Availability**  ← updated to include client-profile
    userAvailabilityList: '/client-profile/user-availability/',
    userAvailabilityDetail: (id: number) => `/client-profile/user-availability/${id}/`,

    // Chains
    chains: '/client-profile/chains/',
    chainDetail: (chainId: string) => `/client-profile/chains/${chainId}/`,
    addPharmacyToChain: (chainId: string) => `/client-profile/chains/${chainId}/add_pharmacy/`,
    removePharmacyFromChain: (chainId: string) => `/client-profile/chains/${chainId}/remove_pharmacy/`,
    addUserToChain: (chainId: string) => `/client-profile/chains/${chainId}/add_user/`,

    // Users (for invitations/search)
    users: '/users/',

    // Memberships (chain users)
    membershipList: '/client-profile/memberships/',
    membershipCreate: '/client-profile/memberships/',
    membershipBulkInvite: '/client-profile/memberships/bulk_invite/',
    membershipDelete: (membershipId: string) => `/client-profile/memberships/${membershipId}/`,
    // Magic membership links & applications
    membershipInviteLinks: '/client-profile/membership-invite-links/',              // POST to create link, GET to list (with ?pharmacy=)
    membershipApplications: '/client-profile/membership-applications/',             // GET (list), actions below
    magicMembershipInfo: (token: string) => `/client-profile/magic/memberships/${token}/`,          // GET (public) – validate/show link info
    magicMembershipApply: (token: string) => `/client-profile/magic/memberships/${token}/apply/`,   // POST (public) – submit application

    // Shifts
    // Create & marketplace
    createShift: '/client-profile/community-shifts/',
    getCommunityShifts: '/client-profile/community-shifts/',
    claimShift: (shiftId: number | string) => `/client-profile/community-shifts/${shiftId}/claim-shift/`,
    getPublicShifts: '/client-profile/public-shifts/',

    // My-Shifts by status
    getActiveShifts: '/client-profile/shifts/active/',
    getConfirmedShifts: '/client-profile/shifts/confirmed/',
    getHistoryShifts: '/client-profile/shifts/history/',
    getMyConfirmedShifts: '/client-profile/my-confirmed-shifts/',
    getMyHistoryShifts: '/client-profile/my-history-shifts/',
    // list interest and rejections records separately
    getShiftInterests: '/client-profile/shift-interests/',
    getShiftRejections: '/client-profile/shift-rejections/',
    getShiftSaved: '/client-profile/shift-saved/',

    // Actions on individual shifts
    expressInterestInShift: (shiftId: string | number) => `/client-profile/shifts/${shiftId}/express_interest/`,
    revealProfile: (shiftId: string | number) => `/client-profile/shifts/${shiftId}/reveal_profile/`,
    acceptUserToShift: (shiftId: string | number) => `/client-profile/shifts/${shiftId}/accept_user/`,
    getCommunityShiftDetail: (id: string | number) => `/client-profile/community-shifts/${id}/`,
    getPublicShiftDetail: (id: string | number) => `/client-profile/public-shifts/${id}/`,
    getActiveShiftDetail: (id: string | number) => `/client-profile/shifts/active/${id}/`,
    getConfirmedShiftDetail: (id: string | number) => `/client-profile/shifts/confirmed/${id}/`,
    escalateCommunityShift: (shiftId: string | number) => `/client-profile/community-shifts/${shiftId}/escalate/`,
    getCommunityShiftMemberStatus: (shiftId: string | number) => `/client-profile/community-shifts/${shiftId}/member_status/`,
    rejectCommunityShift: (shiftId: string | number) => `/client-profile/community-shifts/${shiftId}/reject/`,
    getWorkerShiftDetail: (id: string | number) => `/client-profile/shifts/${id}/`,
    viewAssignedShiftProfile: (type: 'confirmed' | 'history', shiftId: string | number) => `/client-profile/shifts/${type}/${shiftId}/view_assigned_profile/`,
    getActiveShiftMemberStatus: (shiftId: string | number) => `/client-profile/shifts/active/${shiftId}/member_status/`,

    // Publicshifts
    generateShareLink: (shiftId: string | number) => `/client-profile/shifts/${shiftId}/generate-share-link/`,
    getPublicJobBoard: '/client-profile/public-job-board/',
    getViewSharedShift: '/client-profile/view-shared-shift/',

    // Roster
    getRosterOwner: '/client-profile/roster-owner/',
    getRosterWorker: '/client-profile/roster-worker/',
    createShiftAndAssign: '/client-profile/roster/create-and-assign-shift/',

    // Leave Requests
    leaveRequests: '/client-profile/leave-requests/',
    createLeaveRequest: '/client-profile/leave-requests/',
    approveLeaveRequest: (leaveId: number) => `/client-profile/leave-requests/${leaveId}/approve/`,
    rejectLeaveRequest: (leaveId: number) => `/client-profile/leave-requests/${leaveId}/reject/`,

    // Swap Requests
    workerShiftRequests: '/client-profile/worker-shift-requests/',
    approveWorkerShiftRequest: (id: number) => `/client-profile/worker-shift-requests/${id}/approve/`,
    rejectWorkerShiftRequest: (id: number) => `/client-profile/worker-shift-requests/${id}/reject/`,

    // NEW: Endpoints for managing a SHIFT from the roster view
    rosterManageShift: (shiftId: number) => `/client-profile/roster-shifts/${shiftId}/`, // For EDIT (PATCH) and DELETE
    rosterEscalateShift: (shiftId: number) => `/client-profile/roster-shifts/${shiftId}/escalate/`,
    ownerOpenShifts: '/client-profile/roster-shifts/list-open-shifts/', // NEW: For owners to list their open shifts
    createOpenShift: `/client-profile/roster-shifts/create-open-shift/`,

    // NOTE: Deleting an ASSIGNMENT still uses getRosterOwner
    rosterDeleteAssignment: (assignmentId: number) => `/client-profile/roster-owner/${assignmentId}/`,

    // invoice
    // Create (manual or shift-based) & list invoices
    invoices: '/client-profile/invoices/',
    // Retrieve / update / delete a specific invoice
    invoiceDetail: (id: number) => `/client-profile/invoices/${id}/`,
    // Shortcut to generate from shifts
    generateInvoice: '/client-profile/invoices/generate/',
    invoicePreview: (id: number) => `/client-profile/invoices/preview/${id}/`,
    invoicePdf: (id: number) => `/client-profile/invoices/${id}/pdf/`,
    sendInvoice: (id: number) => `/client-profile/invoices/${id}/send/`,


    // Chat app
    rooms: '/client-profile/rooms/',
    chatParticipants: '/client-profile/chat-participants/', // <-- THIS IS CORRECT
    roomDetail: (id: number) => `/client-profile/rooms/${id}/`,
    roomMessages: (id: number) => `/client-profile/rooms/${id}/messages/`,
    roomMarkRead: (id: number) => `/client-profile/rooms/${id}/read/`,
    notifications: '/client-profile/notifications/',
    notificationsMarkRead: '/client-profile/notifications/mark-read/',
    startDm: '/client-profile/rooms/get-or-create-dm/',
    myMemberships: '/client-profile/my-memberships/',
    memberships: '/client-profile/memberships/',
    getOrCreategroup: () => `/client-profile/rooms/get-or-create-group/`,
    getOrCreateDmByUser: '/client-profile/rooms/get-or-create-dm-by-user/',


    // --- Explorer Posts ---
    explorerPosts: '/client-profile/explorer-posts/',
    explorerPostDetail: (id: number) => `/client-profile/explorer-posts/${id}/`,
    explorerPostFeed: '/client-profile/explorer-posts/feed/',
    explorerPostByProfile: (profileId: number) => `/client-profile/explorer-posts/by-profile/${profileId}/`,
    explorerPostAddView: (id: number) => `/client-profile/explorer-posts/${id}/view/`,
    explorerPostLike: (id: number) => `/client-profile/explorer-posts/${id}/like/`,
    explorerPostUnlike: (id: number) => `/client-profile/explorer-posts/${id}/unlike/`,


    // Ratings
    ratings: '/client-profile/ratings/',
    ratingsSummary: '/client-profile/ratings/summary/',
    ratingsMine: '/client-profile/ratings/mine/',
    ratingsPending: '/client-profile/ratings/pending/',


    pharmacyAdmins: "/client-profile/pharmacy-admins/",
    pharmacyAdminDetail: (adminId: string | number) => `/client-profile/pharmacy-admins/${adminId}/`,

    // --- Hub ---
    hubContext: '/client-profile/hub/context/',
    hubPosts: '/client-profile/hub/posts/',
    hubPolls: '/client-profile/hub/polls/',
    hubPollDetail: (pollId: number) => `/client-profile/hub/polls/${pollId}/`,
    hubPollVote: (pollId: number) => `/client-profile/hub/polls/${pollId}/vote/`,
    hubPostDetail: (postId: number) => `/client-profile/hub/posts/${postId}/`,
    hubPostPin: (postId: number) => `/client-profile/hub/posts/${postId}/pin/`,
    hubPostUnpin: (postId: number) => `/client-profile/hub/posts/${postId}/unpin/`,
    hubPostComments: (postId: number) => `/client-profile/hub/posts/${postId}/comments/`,
    hubCommentDetail: (postId: number, commentId: number) => `/client-profile/hub/posts/${postId}/comments/${commentId}/`,
    hubCommentReactions: (postId: number, commentId: number) =>
        `/client-profile/hub/posts/${postId}/comments/${commentId}/reactions/`,
    hubPostReactions: (postId: number) => `/client-profile/hub/posts/${postId}/reactions/`,
    hubGroups: '/client-profile/hub/groups/',
    hubGroupDetail: (groupId: number) => `/client-profile/hub/groups/${groupId}/`,
    hubPharmacyProfile: (pharmacyId: number) => `/client-profile/hub/pharmacies/${pharmacyId}/profile/`,
    hubOrganizationProfile: (orgId: number) => `/client-profile/hub/organizations/${orgId}/profile/`,

    // --- Authenticated Attendance / Roster V2 ---
    attendance: {
        workerStatus: '/client-profile/attendance/worker/status/',
        workerClockIn: '/client-profile/attendance/worker/clock-in/',
        workerBreakStart: '/client-profile/attendance/worker/break-start/',
        workerBreakEnd: '/client-profile/attendance/worker/break-end/',
        workerClockOut: '/client-profile/attendance/worker/clock-out/',
        workerPinUpdate: '/client-profile/attendance/worker/pin/update/',
        managerPending: '/client-profile/attendance/manager/pending/',
        managerApprove: '/client-profile/attendance/manager/approve/',
        managerReject: '/client-profile/attendance/manager/reject/',
        managerCorrect: '/client-profile/attendance/manager/correct/',
        managerTimeline: (sessionId: number) => `/client-profile/attendance/manager/timeline/${sessionId}/`,
        managerKioskDevices: '/client-profile/attendance/manager/kiosk-devices/',
    },
    rosterV2: {
        period: '/client-profile/attendance/roster/period/',
        validate: '/client-profile/attendance/roster/validate/',
        publish: '/client-profile/attendance/roster/publish/',
        unpublish: '/client-profile/attendance/roster/unpublish/',
        archive: '/client-profile/attendance/roster/archive/',
        worker: '/client-profile/attendance/roster/worker/',
        acknowledge: '/client-profile/attendance/roster/acknowledge/',
        acknowledgements: (periodId: number) => `/client-profile/attendance/roster/acknowledgements/${periodId}/`,
        copyWeek: '/client-profile/attendance/roster/copy-week/',
        templates: '/client-profile/attendance/roster/templates/',
        templateApply: '/client-profile/attendance/roster/templates/apply/',
        bulkEdit: '/client-profile/attendance/roster/bulk-edit/',
        workerSwapRequest: '/client-profile/attendance/roster/worker/swap-request/',
        workerCoverRequest: '/client-profile/attendance/roster/worker/cover-request/',
        managerApproveSwap: '/client-profile/attendance/roster/manager/approve-swap/',
        managerApproveReplacement: '/client-profile/attendance/roster/manager/approve-replacement/',
        managerReleaseWorker: '/client-profile/attendance/roster/manager/release-worker/',
        managerRejectRequest: '/client-profile/attendance/roster/manager/reject-request/',
        audits: '/client-profile/attendance/roster/audits/',
    },

    // --- Authenticated Workforce / Employment / Timesheets ---
    finance: {
        root: '/client-profile/finance/',
        customers: '/client-profile/finance/customers/',
        customer: (id: number) => `/client-profile/finance/customers/${id}/`,
        customerLookupAbn: (id: number) => `/client-profile/finance/customers/${id}/lookup_abn/`,
        items: '/client-profile/finance/items/',
        item: (id: number) => `/client-profile/finance/items/${id}/`,
        seedItems: '/client-profile/finance/items/seed/',
        invoices: '/client-profile/finance/invoices/',
        invoice: (id: number) => `/client-profile/finance/invoices/${id}/`,
        invoiceDefaults: '/client-profile/finance/invoices/defaults/',
        internalSources: '/client-profile/finance/invoices/internal-sources/',
        internalPrefill: '/client-profile/finance/invoices/internal-prefill/',
        invoicePreview: '/client-profile/finance/invoices/preview/',
        invoiceDuplicate: (id: number) => `/client-profile/finance/invoices/${id}/duplicate/`,
        invoiceIssue: (id: number) => `/client-profile/finance/invoices/${id}/issue/`,
        invoiceSuperDocument: (id: number) => `/client-profile/finance/invoices/${id}/super-document/`,
        invoiceSend: (id: number) => `/client-profile/finance/invoices/${id}/send/`,
        invoiceMarkPaid: (id: number) => `/client-profile/finance/invoices/${id}/mark-paid/`,
        invoicePayments: (id: number) => `/client-profile/finance/invoices/${id}/payments/`,
        invoicePdf: (id: number) => `/client-profile/finance/invoices/${id}/pdf/`,
        invoiceRevision: (id: number, version: number) => `/client-profile/finance/invoices/${id}/revisions/${version}/`,
        invoiceRevisionPdf: (id: number, version: number) => `/client-profile/finance/invoices/${id}/revisions/${version}/pdf/`,
        receivedInvoices: '/client-profile/finance/received-invoices/',
        receivedInvoice: (id: number) => `/client-profile/finance/received-invoices/${id}/`,
        receivedRevision: (id: number, version: number) => `/client-profile/finance/received-invoices/${id}/revisions/${version}/`,
        receivedRevisionPdf: (id: number, version: number) => `/client-profile/finance/received-invoices/${id}/revisions/${version}/pdf/`,
        receivedRequestRevision: (id: number) => `/client-profile/finance/received-invoices/${id}/request-revision/`,
        receivedApprovePayment: (id: number) => `/client-profile/finance/received-invoices/${id}/approve-payment/`,
        receivedMarkPaid: (id: number) => `/client-profile/finance/received-invoices/${id}/mark-paid/`,
        receivedPdf: (id: number) => `/client-profile/finance/received-invoices/${id}/pdf/`,
        expenses: '/client-profile/finance/expenses/',
        expense: (id: number) => `/client-profile/finance/expenses/${id}/`,
        expenseReceipts: (id: number) => `/client-profile/finance/expenses/${id}/receipts/`,
        receiptDownload: (id: number) => `/client-profile/finance/receipts/${id}/download/`,
        shiftHours: '/client-profile/finance/shift-hours/',
        basWorksheet: '/client-profile/finance/bas-worksheet/',
    },

    workforce: {
        rosterWorkspace: '/client-profile/workforce/roster/workspace/',
        rosterValidate: '/client-profile/workforce/roster/validate/',
        rosterPublish: '/client-profile/workforce/roster/publish/',
        workSettings: '/client-profile/workforce/work-settings/',
        payrollConfiguration: '/client-profile/workforce/payroll-configuration/',
        employmentEngagements: '/client-profile/workforce/employment-engagements/',
        employmentEngagement: (publicId: string) => `/client-profile/workforce/employment-engagements/${publicId}/`,
        employmentEngagementAwardPreview: '/client-profile/workforce/employment-engagements/award-preview/',
        coverageRequirements: '/client-profile/workforce/coverage-requirements/',
        coverageRequirement: (id: number) => `/client-profile/workforce/coverage-requirements/${id}/`,
        leave: '/client-profile/workforce/leave/',
        leaveDecision: (id: number) => `/client-profile/workforce/leave/${id}/decision/`,
        timesheetPeriods: '/client-profile/workforce/timesheet-periods/',
        timesheetPeriodSummary: (id: number) => `/client-profile/workforce/timesheet-periods/${id}/summary/`,
        timesheetPeriodRecalculate: (id: number) => `/client-profile/workforce/timesheet-periods/${id}/recalculate/`,
        timesheetPeriodLock: (id: number) => `/client-profile/workforce/timesheet-periods/${id}/lock/`,
        timesheets: '/client-profile/workforce/timesheets/',
        timesheet: (id: number) => `/client-profile/workforce/timesheets/${id}/`,
        timesheetRecalculate: (id: number) => `/client-profile/workforce/timesheets/${id}/recalculate/`,
        timesheetMissingPunch: (id: number) => `/client-profile/workforce/timesheets/${id}/missing-punch/`,
        timesheetSubmit: (id: number) => `/client-profile/workforce/timesheets/${id}/submit/`,
        timesheetApprove: (id: number) => `/client-profile/workforce/timesheets/${id}/approve-time/`,
        timesheetReopen: (id: number) => `/client-profile/workforce/timesheets/${id}/reopen/`,
        timesheetComments: (id: number) => `/client-profile/workforce/timesheets/${id}/comments/`,
        timesheetCheckDecision: (id: number) => `/client-profile/workforce/timesheet-checks/${id}/decision/`,
        myHours: '/client-profile/workforce/my-hours/',
    },
};
