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
    organizations: '/organizations/',

    // organizationDashboard: '/dashboard/organization/',
    organizationDashboard: (orgId: number | string) => `/dashboard/organization/${orgId}/`,
    ownerDashboard: '/dashboard/owner/',
    pharmacistDashboard: '/dashboard/pharmacist/',
    otherStaffDashboard: '/dashboard/otherstaff/',
    explorerDashboard: '/dashboard/explorer/',

    // Onboarding
    onboardingDetail: (role: string) => {
        const safeRole = role === 'other_staff' ? 'otherstaff' : role;
        return `/${safeRole}/onboarding/me/`;
    },

    // refereeConfirm: (pk: string | number, refIndex: string | number) =>
    //   `/onboarding/referee-confirm/${pk}/${refIndex}/`,

    submitRefereeResponse: (token: string) =>
        `/onboarding/submit-reference/${token}/`,

    refereeRejectByToken: (token: string) =>
        `/onboarding/referee-reject/${token}/`,

    // invite & claim
    inviteOrgUser: '/users/invite-org-user/',
    organizationMemberships: '/users/organization-memberships/',
    organizationRoleDefinitions: '/users/organization-role-definitions/',
    passwordReset: '/users/password-reset/',
    passwordResetConfirm: '/users/password-reset-confirm/',
    claimOnboarding: '/owner-onboarding/claim/',
    pharmacyClaims: '/pharmacy-claims/',
    pharmacyClaimDetail: (claimId: number | string) => `/pharmacy-claims/${claimId}/`,

    // Pharmacies
    pharmacies: '/pharmacies/',
    pharmacyDetail: (pharmacyId: string) => `/pharmacies/${pharmacyId}/`,

    // **User Availability**  ← updated to include client-profile
    userAvailabilityList: '/user-availability/',
    userAvailabilityDetail: (id: number | string) => `/user-availability/${id}/`,

    // Chains
    chains: '/chains/',
    chainDetail: (chainId: string) => `/chains/${chainId}/`,
    addPharmacyToChain: (chainId: string) => `/chains/${chainId}/add_pharmacy/`,
    removePharmacyFromChain: (chainId: string) => `/chains/${chainId}/remove_pharmacy/`,
    addUserToChain: (chainId: string) => `/chains/${chainId}/add_user/`,

    // Users (for invitations/search)
    users: '/users/',

    // Memberships (chain users)
    membershipList: '/memberships/',
    membershipCreate: '/memberships/',
    membershipBulkInvite: '/memberships/bulk_invite/',
    membershipDelete: (membershipId: string) => `/memberships/${membershipId}/`,
    // Magic membership links & applications
    membershipInviteLinks: '/membership-invite-links/',              // POST to create link, GET to list (with ?pharmacy=)
    membershipApplications: '/membership-applications/',             // GET (list), actions below
    magicMembershipInfo: (token: string) => `/magic/memberships/${token}/`,          // GET (public) – validate/show link info
    magicMembershipApply: (token: string) => `/magic/memberships/${token}/apply/`,   // POST (public) – submit application

    // Shifts
    // Create & marketplace
    createShift: '/community-shifts/',
    getCommunityShifts: '/community-shifts/',
    claimShift: (shiftId: number | string) => `/community-shifts/${shiftId}/claim-shift/`,
    getPublicShifts: '/public-shifts/',

    // My-Shifts by status
    getActiveShifts: '/shifts/active/',
    getConfirmedShifts: '/shifts/confirmed/',
    getHistoryShifts: '/shifts/history/',
    getMyConfirmedShifts: '/my-confirmed-shifts/',
    getMyHistoryShifts: '/my-history-shifts/',
    // list interest and rejections records separately
    getShiftInterests: '/shift-interests/',
    getShiftRejections: '/shift-rejections/',
    getShiftSaved: '/shift-saved/',

    // Actions on individual shifts
    expressInterestInShift: (shiftId: string | number) => `/shifts/${shiftId}/express_interest/`,
    revealProfile: (shiftId: string | number) => `/shifts/${shiftId}/reveal_profile/`,
    acceptUserToShift: (shiftId: string | number) => `/shifts/${shiftId}/accept_user/`,
    getCommunityShiftDetail: (id: string | number) => `/community-shifts/${id}/`,
    getPublicShiftDetail: (id: string | number) => `/public-shifts/${id}/`,
    getActiveShiftDetail: (id: string | number) => `/shifts/active/${id}/`,
    getConfirmedShiftDetail: (id: string | number) => `/shifts/confirmed/${id}/`,
    escalateCommunityShift: (shiftId: string | number) => `/community-shifts/${shiftId}/escalate/`,
    getCommunityShiftMemberStatus: (shiftId: string | number) => `/community-shifts/${shiftId}/member_status/`,
    rejectCommunityShift: (shiftId: string | number) => `/community-shifts/${shiftId}/reject/`,
    getWorkerShiftDetail: (id: string | number) => `/shifts/${id}/`,
    viewAssignedShiftProfile: (type: 'confirmed' | 'history', shiftId: string | number) => `/shifts/${type}/${shiftId}/view_assigned_profile/`,
    getActiveShiftMemberStatus: (shiftId: string | number) => `/shifts/active/${shiftId}/member_status/`,

    // Publicshifts
    generateShareLink: (shiftId: string | number) => `/shifts/${shiftId}/generate-share-link/`,
    getPublicJobBoard: '/public-job-board/',
    getViewSharedShift: '/view-shared-shift/',

    // Roster
    getRosterOwner: '/roster-owner/',
    getRosterWorker: '/roster-worker/',
    createShiftAndAssign: '/roster/create-and-assign-shift/',

    // Leave Requests
    leaveRequests: '/leave-requests/',
    createLeaveRequest: '/leave-requests/',
    approveLeaveRequest: (leaveId: number | string) => `/leave-requests/${leaveId}/approve/`,
    rejectLeaveRequest: (leaveId: number | string) => `/leave-requests/${leaveId}/reject/`,

    // Swap Requests
    workerShiftRequests: '/worker-shift-requests/',
    approveWorkerShiftRequest: (id: number | string) => `/worker-shift-requests/${id}/approve/`,
    rejectWorkerShiftRequest: (id: number | string) => `/worker-shift-requests/${id}/reject/`,

    // NEW: Endpoints for managing a SHIFT from the roster view
    rosterManageShift: (shiftId: number | string) => `/roster-shifts/${shiftId}/`, // For EDIT (PATCH) and DELETE
    rosterEscalateShift: (shiftId: number | string) => `/roster-shifts/${shiftId}/escalate/`,
    ownerOpenShifts: '/roster-shifts/list-open-shifts/', // NEW: For owners to list their open shifts
    createOpenShift: `/roster-shifts/create-open-shift/`,

    // NOTE: Deleting an ASSIGNMENT still uses getRosterOwner
    rosterDeleteAssignment: (assignmentId: number | string) => `/roster-owner/${assignmentId}/`,

    // invoice
    // Create (manual or shift-based) & list invoices
    invoices: '/invoices/',
    // Retrieve / update / delete a specific invoice
    invoiceDetail: (id: number | string) => `/invoices/${id}/`,
    // Shortcut to generate from shifts
    generateInvoice: '/invoices/generate/',
    invoicePreview: (id: number | string) => `/invoices/preview/${id}/`,
    invoicePdf: (id: number | string) => `/invoices/${id}/pdf/`,
    sendInvoice: (id: number | string) => `/invoices/${id}/send/`,


    // Chat app
    rooms: '/rooms/',
    chatParticipants: '/chat-participants/', // <-- THIS IS CORRECT
    roomDetail: (id: number | string) => `/rooms/${id}/`,
    roomMessages: (id: number | string) => `/rooms/${id}/messages/`,
    roomMarkRead: (id: number | string) => `/rooms/${id}/read/`,
    notifications: '/notifications/',
    notificationsMarkRead: '/notifications/mark-read/',
    startDm: '/rooms/get-or-create-dm/',
    myMemberships: '/my-memberships/',
    memberships: '/memberships/',
    getOrCreategroup: () => `/rooms/get-or-create-group/`,
    getOrCreateDmByUser: '/rooms/get-or-create-dm-by-user/',


    // --- Explorer Posts ---
    explorerPosts: '/explorer-posts/',
    explorerPostDetail: (id: number | string) => `/explorer-posts/${id}/`,
    explorerPostFeed: '/explorer-posts/feed/',
    explorerPostByProfile: (profileId: number | string) => `/explorer-posts/by-profile/${profileId}/`,
    explorerPostAddView: (id: number | string) => `/explorer-posts/${id}/view/`,
    explorerPostLike: (id: number | string) => `/explorer-posts/${id}/like/`,
    explorerPostUnlike: (id: number | string) => `/explorer-posts/${id}/unlike/`,


    // Ratings
    ratings: '/ratings/',
    ratingsSummary: '/ratings/summary/',
    ratingsMine: '/ratings/mine/',
    ratingsPending: '/ratings/pending/',


    pharmacyAdmins: "/pharmacy-admins/",
    pharmacyAdminDetail: (adminId: string | number) => `/pharmacy-admins/${adminId}/`,

    // --- Hub ---
    hubContext: '/hub/context/',
    hubPosts: '/hub/posts/',
    hubPolls: '/hub/polls/',
    hubPollDetail: (pollId: number | string) => `/hub/polls/${pollId}/`,
    hubPollVote: (pollId: number | string) => `/hub/polls/${pollId}/vote/`,
    hubPostDetail: (postId: number | string) => `/hub/posts/${postId}/`,
    hubPostPin: (postId: number | string) => `/hub/posts/${postId}/pin/`,
    hubPostUnpin: (postId: number | string) => `/hub/posts/${postId}/unpin/`,
    hubPostComments: (postId: number | string) => `/hub/posts/${postId}/comments/`,
    hubCommentDetail: (postId: number | string, commentId: number | string) => `/hub/posts/${postId}/comments/${commentId}/`,
    hubCommentReactions: (postId: number | string, commentId: number | string) =>
        `/hub/posts/${postId}/comments/${commentId}/reactions/`,
    hubPostReactions: (postId: number | string) => `/hub/posts/${postId}/reactions/`,
    hubGroups: '/hub/groups/',
    hubGroupDetail: (groupId: number | string) => `/hub/groups/${groupId}/`,
    hubPharmacyProfile: (pharmacyId: number | string) => `/hub/pharmacies/${pharmacyId}/profile/`,
    hubOrganizationProfile: (orgId: number | string) => `/hub/organizations/${orgId}/profile/`,

    // --- Authenticated Attendance / Roster V2 ---
    attendance: {
        workerStatus: '/attendance/worker/status/',
        workerClockIn: '/attendance/worker/clock-in/',
        workerBreakStart: '/attendance/worker/break-start/',
        workerBreakEnd: '/attendance/worker/break-end/',
        workerClockOut: '/attendance/worker/clock-out/',
        workerPinUpdate: '/attendance/worker/pin/update/',
        managerPending: '/attendance/manager/pending/',
        managerApprove: '/attendance/manager/approve/',
        managerReject: '/attendance/manager/reject/',
        managerCorrect: '/attendance/manager/correct/',
        managerTimeline: (sessionId: number | string) => `/attendance/manager/timeline/${sessionId}/`,
        managerKioskDevices: '/attendance/manager/kiosk-devices/',
    },
    rosterV2: {
        period: '/attendance/roster/period/',
        validate: '/attendance/roster/validate/',
        publish: '/attendance/roster/publish/',
        unpublish: '/attendance/roster/unpublish/',
        archive: '/attendance/roster/archive/',
        worker: '/attendance/roster/worker/',
        acknowledge: '/attendance/roster/acknowledge/',
        acknowledgements: (periodId: number | string) => `/attendance/roster/acknowledgements/${periodId}/`,
        copyWeek: '/attendance/roster/copy-week/',
        templates: '/attendance/roster/templates/',
        templateApply: '/attendance/roster/templates/apply/',
        bulkEdit: '/attendance/roster/bulk-edit/',
        shiftUnpublish: '/attendance/roster/shift/unpublish/',
        shiftRepublish: '/attendance/roster/shift/republish/',
        workerSwapRequest: '/attendance/roster/worker/swap-request/',
        workerCoverRequest: '/attendance/roster/worker/cover-request/',
        managerApproveSwap: '/attendance/roster/manager/approve-swap/',
        managerApproveReplacement: '/attendance/roster/manager/approve-replacement/',
        managerReleaseWorker: '/attendance/roster/manager/release-worker/',
        managerRejectRequest: '/attendance/roster/manager/reject-request/',
        audits: '/attendance/roster/audits/',
    },

    // --- Authenticated Workforce / Employment / Timesheets ---
    finance: {
        root: '/finance/',
        customers: '/finance/customers/',
        customer: (id: number | string) => `/finance/customers/${id}/`,
        customerLookupAbn: (id: number | string) => `/finance/customers/${id}/lookup_abn/`,
        items: '/finance/items/',
        item: (id: number | string) => `/finance/items/${id}/`,
        seedItems: '/finance/items/seed/',
        invoices: '/finance/invoices/',
        invoice: (id: number | string) => `/finance/invoices/${id}/`,
        invoiceDefaults: '/finance/invoices/defaults/',
        internalSources: '/finance/invoices/internal-sources/',
        internalPrefill: '/finance/invoices/internal-prefill/',
        invoicePreview: '/finance/invoices/preview/',
        invoiceDuplicate: (id: number | string) => `/finance/invoices/${id}/duplicate/`,
        invoiceIssue: (id: number | string) => `/finance/invoices/${id}/issue/`,
        invoiceSuperDocument: (id: number | string) => `/finance/invoices/${id}/super-document/`,
        invoiceSend: (id: number | string) => `/finance/invoices/${id}/send/`,
        invoiceMarkPaid: (id: number | string) => `/finance/invoices/${id}/mark-paid/`,
        invoicePayments: (id: number | string) => `/finance/invoices/${id}/payments/`,
        invoicePdf: (id: number | string) => `/finance/invoices/${id}/pdf/`,
        invoiceRevision: (id: number | string, version: number) => `/finance/invoices/${id}/revisions/${version}/`,
        invoiceRevisionPdf: (id: number | string, version: number) => `/finance/invoices/${id}/revisions/${version}/pdf/`,
        receivedInvoices: '/finance/received-invoices/',
        receivedInvoice: (id: number | string) => `/finance/received-invoices/${id}/`,
        receivedRevision: (id: number | string, version: number) => `/finance/received-invoices/${id}/revisions/${version}/`,
        receivedRevisionPdf: (id: number | string, version: number) => `/finance/received-invoices/${id}/revisions/${version}/pdf/`,
        receivedRequestRevision: (id: number | string) => `/finance/received-invoices/${id}/request-revision/`,
        receivedApprovePayment: (id: number | string) => `/finance/received-invoices/${id}/approve-payment/`,
        receivedMarkPaid: (id: number | string) => `/finance/received-invoices/${id}/mark-paid/`,
        receivedPdf: (id: number | string) => `/finance/received-invoices/${id}/pdf/`,
        expenses: '/finance/expenses/',
        expense: (id: number | string) => `/finance/expenses/${id}/`,
        expenseReceipts: (id: number | string) => `/finance/expenses/${id}/receipts/`,
        receiptDownload: (id: number | string) => `/finance/receipts/${id}/download/`,
        shiftHours: '/finance/shift-hours/',
        basWorksheet: '/finance/bas-worksheet/',
    },

    workforce: {
        rosterWorkspace: '/workforce/roster/workspace/',
        rosterValidate: '/workforce/roster/validate/',
        rosterPublish: '/workforce/roster/publish/',
        workSettings: '/workforce/work-settings/',
        payrollConfiguration: '/workforce/payroll-configuration/',
        employmentEngagements: '/workforce/employment-engagements/',
        employmentEngagement: (publicId: string) => `/workforce/employment-engagements/${publicId}/`,
        employmentEngagementAwardPreview: '/workforce/employment-engagements/award-preview/',
        coverageRequirements: '/workforce/coverage-requirements/',
        coverageRequirement: (id: number | string) => `/workforce/coverage-requirements/${id}/`,
        leave: '/workforce/leave/',
        leaveDecision: (id: number | string) => `/workforce/leave/${id}/decision/`,
        timesheetPeriods: '/workforce/timesheet-periods/',
        timesheetPeriodSummary: (id: number | string) => `/workforce/timesheet-periods/${id}/summary/`,
        timesheetPeriodRecalculate: (id: number | string) => `/workforce/timesheet-periods/${id}/recalculate/`,
        timesheetPeriodLock: (id: number | string) => `/workforce/timesheet-periods/${id}/lock/`,
        timesheetPeriodCorrect: (id: number | string) => `/workforce/timesheet-periods/${id}/correct/`,
        timesheets: '/workforce/timesheets/',
        timesheet: (id: number | string) => `/workforce/timesheets/${id}/`,
        timesheetRecalculate: (id: number | string) => `/workforce/timesheets/${id}/recalculate/`,
        timesheetMissingPunch: (id: number | string) => `/workforce/timesheets/${id}/missing-punch/`,
        timesheetSubmit: (id: number | string) => `/workforce/timesheets/${id}/submit/`,
        timesheetApprove: (id: number | string) => `/workforce/timesheets/${id}/approve-time/`,
        timesheetReopen: (id: number | string) => `/workforce/timesheets/${id}/reopen/`,
        timesheetComments: (id: number | string) => `/workforce/timesheets/${id}/comments/`,
        timesheetCheckDecision: (id: number | string) => `/workforce/timesheet-checks/${id}/decision/`,
        myHours: '/workforce/my-hours/',
    },
};
