# Mobile/web parity matrix

Baseline: `feat/mobile-web-mirror`, supplied base `c2f1615d`. Reviewed on 3 November 2026.

Read-only source review. No builds, tests, installs, browser sessions, or device checks were run. No files were changed.

## Scope and notation

The inventory comes from `frontend_web/src/main.tsx`, `frontend_web/src/navigation.tsx`, `frontend_mobile/app/**`, and their implementation files. Sidebar headings and dividers are not destinations; navigable parent items are included.

| Prefix | Repository-relative path |
|---|---|
| `W/` | `frontend_web/src/` |
| `D/` | `frontend_web/src/pages/dashboard/sidebar/` |
| `A/` | `frontend_web/src/pages/dashboard/admin/` |
| `G/` | `frontend_web/src/pages/dashboard/organization/` |
| `WF/` | `frontend_web/src/features/workforce/` |
| `E/` | `frontend_mobile/app/` |
| `R/` | `frontend_mobile/roles/` |
| `P/` | `frontend_mobile/features/parity/` |
| `M/` | `frontend_mobile/` |

All abbreviated citations expand using this table. Mobile file columns name the implementation after following route re-exports. Unless stated otherwise, `/persona/foo` is routed by `E/persona/foo.tsx`, and `/persona/shifts` by `E/persona/shifts/index.tsx`.

Status meanings:

- **match**: the inspected behavior matches; platform-specific presentation or sharing is acceptable.
- **visual drift**: inspected job and operations align, with the older mobile presentation.
- **logic drift**: a confirmed difference in operations, branches, permissions, state handling, or the shared-core boundary.
- **missing**: no implemented mobile destination was found for the job.
- **mobile-only**: no corresponding route in the scoped Vite router; this does not mean the feature is absent from other products.
- **unverified**: a counterpart exists, but a complete handler/branch comparison was not established. This is not a parity pass.

Shared visual evidence: web loads Inter/Outfit in `W/main.tsx:4`; web tokens include the strong violet and 20px cards in `W/theme/sleekTheme.tsx:97`. Mobile still uses indigo in `M/constants/theme.ts:13` and Paper’s MD3 light theme in `M/constants/theme.ts:57`. “Visual drift” below is source-backed, not a rendered visual assessment.

### Shared-core operation sets

The following sets expand the operation references in the matrix. `X → X` means both sides call the named functions, through their respective screens, children, or hooks. UI-only helpers are omitted unless they affect a noted difference.

| Set | Web operations | Mobile operations |
|---|---|---|
| `POST` | `fetchPharmaciesService`, `fetchWorkerShiftDetailService`, `createOwnerShiftService`, `updateOwnerShiftService`; posting validation/payload helpers | Same principal read/write operations and posting helpers; mobile additionally exposes description-template and pharmacy-default actions. Full branch parity unverified. |
| `ACTIVE` | `fetchActiveShifts`, `fetchPosterShiftDetailService`, `fetchShiftInterests`, `fetchShiftMemberStatus`, `fetchShiftCounterOffersService`, `acceptShiftCounterOfferService`, `rejectShiftCounterOfferService`, `revealShiftInterestService`, `escalateShiftService`, `deleteActiveShiftService`, `acceptShiftCandidateService`, `buzzShiftOffer`, `chargeShiftFulfillment`, `resumeFulfillmentCheckout`, `expireFulfillmentCheckout`, `payShiftWithPills`, `generateShiftShareLinkService`, `createShiftPillReferralService`, ratings fetches | Same principal operations across `R/shared/shifts/ActiveShiftsPage/**`; complete candidate/payment state parity unverified. |
| `PUBLIC` | `fetchPublicShifts`, `fetchSavedShifts`, `fetchShiftInterests`, `fetchShiftOffersService`, `expressInterestInPublicShiftService`, `acceptShiftOfferService`, `activateShiftOfferPayrollService`, `declineShiftOfferService`, `saveShift`, `deleteSavedShift`, `getOnboardingDetail`, `createShiftCounterOffer` through `submitCounterOfferDirect` | Corresponding operations; counter-offers use `submitShiftCounterOfferService`. Shared-core builds the same counter-offer payload; different function names alone are not evidence of drift. |
| `COMMUNITY` | `fetchCommunityShifts`, `fetchSavedShifts`, `fetchShiftInterests`, `fetchShiftRejections`, `fetchShiftOffersService`, `expressInterestInCommunityShiftService`, `acceptShiftOfferService`, `declineShiftOfferService`, `rejectCommunityShiftService`, `saveShift`, `deleteSavedShift`, `createShiftCounterOffer` | Corresponding operations; counter-offers use `submitShiftCounterOfferService`. |
| `CONFIRMED` | `fetchConfirmedShifts`, `fetchShiftOffersService`, `activateShiftOfferPayrollService`, `viewAssignedShiftProfileService` | Same. |
| `HISTORY` | `fetchHistoryShifts`, `createRatingService`, `fetchMyRatingForTargetService`, `viewAssignedShiftProfileService` | Same. |
| `WORKER-CONFIRMED` | `fetchMyConfirmedShifts`, `fetchRatingsPageService`, `fetchRatingsSummaryService`; shared booked-shift display helpers | Same. |
| `WORKER-HISTORY` | `fetchMyHistoryShifts`, `createRatingService`, `fetchMyRatingForTargetService`, `fetchRatingsSummaryService` | Same. |
| `WORKER-DETAIL` | `fetchWorkerShiftDetailService`, `fetchShiftInterests`, `fetchShiftRejections`, `expressInterestInShiftService`, `rejectShiftService`, `createShiftCounterOffer` | Corresponding operations; `submitShiftCounterOfferService` for counter-offers. Slot submission differs; see L12. |
| `CALENDAR` | `getCalendarFeed`, `fetchMyMemberships`, `fetchMembershipsByPharmacy`, `createCalendarEvent`, `updateCalendarEvent`, `deleteCalendarEvent`, `createWorkNote`, `updateWorkNote`, `deleteWorkNote`, `actOnWorkNote` | Same. |
| `AVAILABILITY` | `fetchUserAvailabilityService`, `createUserAvailabilityService`, `deleteUserAvailabilityService`, `getOnboarding`, `updateOnboardingForm` | Same. |
| `MEMBERSHIPS` | `getMyMemberships`, `getCurrentUser`, `respondToMyMembership`, `getPendingPharmacyAdminInvitations`, `respondToPharmacyAdminInvitation`, `getMembershipErrorMessage` | Same membership/invitation operations; mobile takes current-user state from its auth context. |
| `TALENT` | `getExplorerPostFeed`, `getOnboarding`, `fetchUserAvailabilityService`, `getExplorerPostForEditing`, `createExplorerPost`, `updateExplorerPost`, `deleteExplorerPost`, `likeExplorerPost`, `unlikeExplorerPost`, `updateOnboardingForm`, `getRatingsSummary`; shared publishing/skill helpers | Corresponding operations; mobile also uses shared `loadAllTalentPages`. |
| `LEARNING` | `chemistTaskerApi.publicContent.listArticles`, `chemistTaskerApi.marketplace.getListingOptions` | Pharmacist/other-staff placeholder: none. Owner/organization/explorer: no learning route. |
| `PILLS` | `fetchPillBalanceService`, `fetchPillHistoryService`, `fetchPillReferralsService` | Same persona implementation. Root rewards implementation additionally calls `fetchPillReferralCodeService`. |
| `FINANCE` | `finance.receivedInvoices` in recipient mode; otherwise `finance.customers`, `finance.items`, `finance.invoices`, `finance.expenses`; customer/item/expense saves, `lookupAbn`, `seedItems`, `uploadReceipt`, `receipt`, `worksheet`, invoice send/duplicate/payment/super/review/PDF/revision operations | Full workspace exists and calls the corresponding families. Revision inspection and approval controls differ; see L8. |
| `INVOICE-NEW` | `getOnboarding`, `getMyHistoryShifts`, `previewInvoice`, `generateInvoice` | Same principal operations; also `previewGeneratedInvoice` and shared super calculation constants. |
| `INVOICE-DETAIL` | First `finance.receivedInvoice` or `finance.invoice`; redirects managed invoices to the finance workspace. Legacy fallback: `getInvoiceDetail`, `updateInvoice`, `reportInvoiceIssue`, `downloadInvoicePdf` | Direct legacy `getInvoiceDetail`, `updateInvoice`, `reportInvoiceIssue`, `sendInvoiceEmail`, `getInvoicePdfUrl`; no managed-invoice dispatch. |
| `CHAT` | `fetchRooms`, `fetchRoom`, `fetchShiftContacts`, `fetchRoomMessagesService`, `fetchRoomMessagesByUrl`, `sendRoomMessageService`, `markRoomAsReadService`, direct/group creation, participant/membership fetches, `deleteRoomService`, `toggleRoomPinService`, `updateMessageService`, `deleteMessageService`, `reactToMessageService` | Room list through `getRooms`; shared message screen calls `getRoomMessages`, `sendRoomMessageService`, `markRoomAsRead`, participant/contact fetches and edit/delete/react/pin operations. No older-message pagination found; ticket transport is direct. |
| `HUB` | `fetchHubContext`, group/member fetch/create/update/delete operations; post/poll/comment/reaction/vote operations | Corresponding shared-core hub operations; complete permissions and state parity unverified. |
| `ATTENDANCE` | `attendance.getWorkerStatus`, `getWorkerCoverTerms`, `acceptWorkerCoverTerms`, `clockIn`, `clockOut`, `breakStart`, `breakEnd`; `rosterV2.getWorkerRoster`, `rosterV2.acknowledge` | Attendance operations exist; published-roster fetch/acknowledgement is absent from the mobile attendance flow. |
| `ATTENDANCE-REVIEW` | `attendance.getManagerPending`, `getManagerTimeline`, `approve`, `reject`, `correct`; `fetchPharmaciesService` | Same attendance operation family split into mobile subroutes; correction context/time conversion differs. |
| `MANAGER-ROSTER` | `fetchRosterOwnerAssignments`, `fetchWorkerShiftRequestsService`, `fetchOwnerOpenShifts`, `fetchRosterOwnerMembersService`, `createShiftAndAssignService`, delete/update/escalate operations, legacy leave/cover decisions; `rosterV2` planning/publication operations | `rosterV2.getPeriod`, `initializePeriod`, `bulkEdit`, validation/publication, templates/copy/audit/acknowledgement operations; member/request fetches, `updateRosterShiftService`, coverage operations. Web’s legacy assignment/leave/cover actions are not all represented. |
| `WORKER-ROSTER` | `fetchRosterWorkerPharmaciesService`, `fetchRosterWorkerAssignments`, `fetchCommunityShifts`, `fetchWorkerShiftRequestsService`, `claimShiftService`, leave create/update/delete, worker-shift-request create/update/delete | Same principal operations in `/my-roster`. |
| `TIMESHEETS` | `workforce.listTimesheetPeriods`, `openTimesheetPeriod`, `getTimesheetPeriodSummary`, `listTimesheets`, period/individual recalculation, period lock/correction, `approveTimesheet`; detail operations listed in L5 | Same summary/period operations; detail/check/comment/reopen and contextual time adjustment are absent. |
| `SETTINGS` | `workforce.getPayrollConfiguration`, `updatePayrollConfiguration`, `listWorkSettings`, `saveWorkSettings`, coverage list/create/delete, employment-engagement operations; kiosk device list/revoke | Mobile root settings implements payroll/hours/current terms. Other operations live in separate roster, workforce and attendance routes. |
| `MANAGER-LEAVE` | `workforce.listLeave`, `workforce.decideLeave`; `fetchPharmaciesService` | Same leave operations; mobile uses selected workspace pharmacy. |
| `MY-HOURS` | `workforce.getMyHours`, `workforce.submitTimesheet`; shared detail drawer operations | Summary/submission operations only. |
| `MY-LEAVE` | `workforce.listLeave`, `workforce.createLeave`, `workforce.decideLeave`; `leaveRequestMemberships`, `WORKFORCE_LEAVE_TYPE_OPTIONS` | Same. |

Operation evidence includes `D/ActiveShiftsPage/hooks/**`, `R/shared/shifts/ActiveShiftsPage/hooks/**`, `WF/api.ts:3`, `R/shared/invoices/FinanceWorkspace.tsx:31`, `W/pages/finance/useFinanceData.ts:20`, and the specific citations below.

## Owner

Web prefix `O = /dashboard/owner`. Mobile prefix `/owner`.

| Web route / nav item | Web file | Mobile route | Mobile file | Status | Operations: web → mobile | Note |
|---|---|---|---|---|---|---|
| `O` — index | `D/owner/OwnerOverviewContainer.tsx:2` | `/owner/dashboard` | `R/owner/dashboard.tsx:68` | logic drift | `getOwnerDashboard`, pharmacy/admin fetches → scoped `getOwnerDashboard`, `fetchPillBalanceService` | Activity-link translation is incomplete; L13. |
| `O/overview` — Overview | `D/owner/OwnerOverviewContainer.tsx:2` | `/owner/dashboard` | `R/owner/dashboard.tsx:68` | logic drift | Same as preceding row | L13; full overview data-shape parity remains unverified. |
| `O/pills` | `D/rewards/PillsPage.tsx:1` | `/owner/pills` | `R/shared/pills/PillsScreen.tsx:7` | visual drift | `PILLS → PILLS` | Same balance/history/referral job. |
| `O/onboarding` — Profile | `W/pages/onboarding/OwnerOnboarding.tsx:188` | `/owner/profile`, `/owner/profile-detail` | `R/owner/profile.tsx:9`; `R/owner/profile-detail.tsx:149` | unverified | `getOnboardingDetail`, `updateOnboardingForm`, subscription/referral calls → `getOnboarding`, `updateOnboardingForm`, subscription/referral calls | Profile is split; full field and submission-state comparison is outstanding. |
| `O/manage-pharmacies` — Manage Pharmacies/index | `D/PharmacyPage.tsx:51` | `/owner/pharmacies` | `R/owner/pharmacies/index.tsx:66` | unverified | pharmacy CRUD/read, claims → pharmacy reads/delete/claims; create/update in `PharmacyForm` | Same family exists; full permission/editor parity not established. |
| `O/manage-pharmacies/my-pharmacies` — My Pharmacies | `D/PharmacyPage.tsx:51` | `/owner/pharmacies` | `R/owner/pharmacies/index.tsx:66` | unverified | Same as preceding row | Mobile owner claim acceptance/rejection exists at lines 158–168. |
| `O/manage-pharmacies/my-chain` — My Chain | `D/ChainPage.tsx:3` | — | — | missing | `fetchChainsService`, chain CRUD, chain pharmacy/membership reads, `addPharmacyToChain`, `removePharmacyFromChain` → none | No mobile chain route or use of those chain operations found. |
| `O/manage-pharmacies/roster` — Internal Roster | `D/RosterOwnerPage.tsx:326` | `/manager/roster` | `P/roster.tsx:125` | logic drift | `MANAGER-ROSTER → MANAGER-ROSTER` | Existing mobile manager workflow; web assignment/leave/cover actions differ, L4. |
| `O/manage-pharmacies/attendance-reviews` — Attendance Approvals | `W/pages/attendance/ManagerAttendanceReviewPage.tsx:156` | `/attendance/reviews` | `P/attendance.tsx:70` | logic drift | `ATTENDANCE-REVIEW → ATTENDANCE-REVIEW` | L6: corrections lose contextual event/timezone handling. |
| `O/attendance-reviews` | `W/pages/attendance/ManagerAttendanceReviewPage.tsx:156` | `/attendance/reviews` | `P/attendance.tsx:70` | logic drift | Same | Alias of preceding web workflow. |
| `O/attendance` | `W/pages/attendance/WorkerAttendancePage.tsx:191` | `/attendance` | `P/attendance.tsx:69` | logic drift | `ATTENDANCE → ATTENDANCE` | Published-roster acknowledgement absent, L3. |
| `O/post-shift` — Post Shift | `D/PostShiftPage.tsx:16` → `frontend_web/shared/postShift/PostShiftForm.tsx:158` | `/owner/post-shift` | `R/shared/shifts/PostShiftScreen.tsx:347` | unverified | `POST → POST` | Shared draft/payload helpers align; entire wizard branches unverified. |
| `O/shift-center` — Shift Centre | `W/main.tsx:435` | `/owner/shifts` | `R/owner/shifts/index.tsx:10` | visual drift | redirect to active → local active default; `ACTIVE` | Native segmented screen implements the destination. |
| `O/shift-center/:section` | `W/pages/dashboard/shiftCenter/ShiftCenterPage.tsx:26` | `/owner/shifts` | `R/owner/shifts/index.tsx:10` | unverified | section selects `ACTIVE`, `CONFIRMED`, `HISTORY` → same views | Mobile does not consume a section parameter; routing/deep-link parity unverified. |
| `O/shift-center/active` — Active Shifts | `W/pages/dashboard/shiftCenter/ShiftCenterPage.tsx:61` | `/owner/shifts` → Active | `R/owner/shifts/index.tsx:46` | unverified | `ACTIVE → ACTIVE` | Complete candidate/payment branch parity unverified. |
| `O/shift-center/confirmed` — Confirmed Shifts | `W/pages/dashboard/shiftCenter/ShiftCenterPage.tsx:58` | `/owner/shifts` → Confirmed | `R/owner/shifts/index.tsx:48` | visual drift | `CONFIRMED → CONFIRMED` | Native tab performs the same assigned-worker/payroll job. |
| `O/shift-center/history` — Shifts History | `W/pages/dashboard/shiftCenter/ShiftCenterPage.tsx:60` | `/owner/shifts` → History | `R/owner/shifts/index.tsx:50` | visual drift | `HISTORY → HISTORY` | History/rating counterpart exists. |
| `O/invoice` — Invoices/index | `D/Invoices/InvoiceManagePage.tsx:14` | `/owner/invoice` | `R/shared/invoices/InvoiceList.tsx:48` | logic drift | `FINANCE → FINANCE` | Full workspace is routed; review-state differences remain, L8. |
| `O/invoice/new` | `D/InvoiceGeneratePage.tsx:105` | `/owner/invoice/new` | `R/shared/invoices/InvoiceGenerate.tsx:60` | unverified | `INVOICE-NEW → INVOICE-NEW` | Full legacy invoice generation validation unverified. |
| `O/invoice/:id` | `D/InvoiceDetailPage.tsx:154` | `/owner/invoice/[id]` | `R/shared/invoices/InvoiceDetail.tsx:105` | logic drift | `INVOICE-DETAIL → INVOICE-DETAIL` | Managed invoices are not dispatched to modern finance; L7. |
| `O/shifts` — index | `D/PublicShiftsPage.tsx:185` | No public-board counterpart in owner Shift Centre | `R/owner/shifts/index.tsx:25` | missing | `PUBLIC → none` | Owner mobile selector only has active/confirmed/history. |
| `O/shifts/public` | `D/PublicShiftsPage.tsx:185` | — | `R/owner/shifts/index.tsx:25` | missing | `PUBLIC → none` | Shared public component exists, but no owner route mounts it. |
| `O/shifts/community` | `D/CommunityShiftsPage.tsx:217` | — | `R/owner/shifts/index.tsx:25` | missing | `COMMUNITY → none` | Shared community component exists, but no owner route mounts it. |
| `O/shifts/active` | `D/ActiveShiftsPage/index.tsx:1` | `/owner/shifts` → Active | `R/owner/shifts/index.tsx:46` | unverified | `ACTIVE → ACTIVE` | Same implementation family as Shift Centre. |
| `O/shifts/confirmed` | `D/ConfirmedShiftsPage.tsx:1` | `/owner/shifts` → Confirmed | `R/owner/shifts/index.tsx:48` | visual drift | `CONFIRMED → CONFIRMED` | Native tab counterpart. |
| `O/shifts/history` | `D/HistoryShiftsPage.tsx:1` | `/owner/shifts` → History | `R/owner/shifts/index.tsx:50` | visual drift | `HISTORY → HISTORY` | Native tab counterpart. |
| `O/shifts/:id` | `D/PosterShiftDetailPage.tsx:18` | `/owner/shifts/[id]` | `R/owner/shifts/[id].tsx:22` | unverified | `ACTIVE`, detail mode → same | Both mount active-shift detail; inner branch parity unverified. |
| `O/interests` — Talent Hub | `D/TalentBoard/index.tsx:1` | `/owner/talent-board` | `R/owner/talent-board.tsx:6` → `R/shared/talent-board/index.tsx:10` | unverified | `TALENT → TALENT` | Booking/posting overrides exist; full authority parity unverified. |
| `O/learning` — Learning Materials | `D/LearningMaterialsPage.tsx:211` | — | — | missing | `LEARNING → none` | No owner learning route. |
| `O/chat` — Chat | `D/chat/ChatPage.tsx:302` | `/owner/chat`, `/owner/messages/[id]` | `R/shared/chat/ChatPage.tsx:28`; `R/shared/messages/[id].tsx:249` | logic drift | `CHAT → CHAT` | Older messages and direct ticket call, L9/L14. |
| `O/pharmacy-hub` | `W/main.tsx:461` | `/owner/hub` | `R/shared/hub/HubScreen.tsx:173` | unverified | redirect to shared hub → `HUB` | Alias; complete hub parity unverified. |
| `/dashboard/pharmacy-hub` — Pharmacy Hub | `D/hub/HubPage.tsx:148` | `/owner/hub` | `R/shared/hub/HubScreen.tsx:173` | unverified | `HUB → HUB` | Same group/feed family; full permissions/states unverified. |
| `O/calendar` — Calendar | `D/PharmacyCalendarPage.tsx:210` | `/owner/calendar` | `R/shared/calendar/index.tsx:202` | visual drift | `CALENDAR → CALENDAR` | Feed, events, work notes and actions have native counterparts. |
| `O/logout` — Logout | `D/LogoutPage.tsx:1` | Owner menu/Profile sign-out | `R/owner/dashboard.tsx:342` | match | auth logout → auth logout | Native action replaces a logout page. |
| `/dashboard/workforce/timesheets` — Timesheets | `WF/TimesheetsPage.tsx:415` | `/workforce-timesheets` | `E/workforce-timesheets.tsx:198` | logic drift | `TIMESHEETS → TIMESHEETS` | Summary/lock exist; detail workflow missing, L5. |
| `/dashboard/workforce/settings` — Workforce & Payroll | `WF/WorkforceSettingsPage.tsx:85` | `/workforce-settings` plus related subroutes | `E/workforce-settings.tsx:47` | logic drift | `SETTINGS → SETTINGS` | Root settings omits web coverage/kiosk/edit integrations; L11. |

## Organization

Web prefix `G = /dashboard/organization`. Mobile prefix `/organization`.

Web navigation is capability-dependent (`W/navigation.tsx:100`). Mobile’s organization sidebar is unconditional (`E/organization/_layout.tsx:33`); affected destinations carry L10 below.

| Web route / nav item | Web file | Mobile route | Mobile file | Status | Operations: web → mobile | Note |
|---|---|---|---|---|---|---|
| `G` — index | `G/OrganizationOverviewPage.tsx:53` | `/organization/dashboard`, `/organization` | `R/organization/dashboard.tsx:1` | logic drift | `getOrganizationDashboard`, `fetchPillBalanceService` → same via scope hook | Capability-dependent actions and translated links differ, L10/L13. |
| `G/overview` — Overview | `G/OrganizationOverviewPage.tsx:53` | `/organization/dashboard` | `R/organization/dashboard.tsx:100` | logic drift | Same | Mobile quick actions are unconditional; web builds them by capability. |
| `G/pills` | `D/rewards/PillsPage.tsx:1` | `/organization/pills` | `R/shared/pills/PillsScreen.tsx:7` | visual drift | `PILLS → PILLS` | Balance/history/referral counterpart. |
| `G/invite` — Invite Staff | `G/InviteStaffPage.tsx:3` | `/organization/invite` | `R/organization/invite.tsx:193` | logic drift | organization membership/role/pharmacy fetches; `inviteOrgUser`, `updateOrganizationMembership`, `deleteOrganizationMembership` → same | Core member operations align; nav capability exposure differs, L10. |
| `G/manage-pharmacies` — Manage Pharmacies/index | `D/PharmacyPage.tsx:1264` | `/organization/pharmacies` | `E/organization/pharmacies/index.tsx:16` | logic drift | pharmacy operations, `getPharmacyClaims`, `claimOnboarding` → pharmacy reads/delete, editor operations elsewhere | Organization claim submission/history absent, L2. |
| `G/manage-pharmacies/my-pharmacies` — My Pharmacies | `D/PharmacyPage.tsx:1310` | `/organization/pharmacies` | `E/organization/pharmacies/index.tsx:60` | logic drift | Same | No claim panel or claim service calls; L2/L10. |
| `G/manage-pharmacies/my-chain` — My Chain | `D/ChainPage.tsx:3` | — | — | missing | chain CRUD/membership operations → none | Web nav only exposes this with `view_all_pharmacies`; `W/navigation.tsx:143`. |
| `G/manage-pharmacies/roster` — Internal Roster | `D/RosterOwnerPage.tsx:326` | `/manager/roster` | `P/roster.tsx:125` | logic drift | `MANAGER-ROSTER → MANAGER-ROSTER` | Existing workflow; missing sibling actions, L4. |
| `G/manage-pharmacies/attendance-reviews` — Attendance Approvals | `W/pages/attendance/ManagerAttendanceReviewPage.tsx:156` | `/attendance/reviews` | `P/attendance.tsx:70` | logic drift | `ATTENDANCE-REVIEW → ATTENDANCE-REVIEW` | L6. |
| `G/attendance-reviews` | `W/pages/attendance/ManagerAttendanceReviewPage.tsx:156` | `/attendance/reviews` | `P/attendance.tsx:70` | logic drift | Same | Direct alias; L6. |
| `G/post-shift` — Post Shift | `D/PostShiftPage.tsx:16` | `/organization/post-shift` | `R/shared/shifts/PostShiftScreen.tsx:347` | logic drift | `POST → POST` | Confirmed nav capability mismatch, L10; wizard parity otherwise unverified. |
| `G/shift-center` — Shift Centre | `W/main.tsx:268` | `/organization/shifts` | `R/organization/shifts/index.tsx:10` | logic drift | redirect/`ACTIVE` → local active default | Capability exposure differs, L10. |
| `G/shift-center/:section` | `W/pages/dashboard/shiftCenter/ShiftCenterPage.tsx:26` | `/organization/shifts` | `R/organization/shifts/index.tsx:10` | unverified | selected `ACTIVE`/`CONFIRMED`/`HISTORY` → same views | Native section/deep-link selection not established. |
| `G/shift-center/active` — Active Shifts | `W/pages/dashboard/shiftCenter/ShiftCenterPage.tsx:61` | `/organization/shifts` → Active | `R/organization/shifts/index.tsx:5` | unverified | `ACTIVE → ACTIVE` | Candidate/payment branches unverified. |
| `G/shift-center/confirmed` — Confirmed Shifts | `W/pages/dashboard/shiftCenter/ShiftCenterPage.tsx:58` | `/organization/shifts` → Confirmed | `R/organization/shifts/index.tsx:6` | visual drift | `CONFIRMED → CONFIRMED` | Native counterpart. |
| `G/shift-center/history` — Shifts History | `W/pages/dashboard/shiftCenter/ShiftCenterPage.tsx:60` | `/organization/shifts` → History | `R/organization/shifts/index.tsx:7` | visual drift | `HISTORY → HISTORY` | Native counterpart. |
| `G/invoice` — index | `D/Invoices/InvoiceManagePage.tsx:14` | `/organization/invoice` | `R/shared/invoices/InvoiceList.tsx:48` | logic drift | `FINANCE → FINANCE` | Workspace routed; L8. |
| `G/invoice/new` | `D/InvoiceGeneratePage.tsx:105` | `/organization/invoice/new` | `R/shared/invoices/InvoiceGenerate.tsx:60` | unverified | `INVOICE-NEW → INVOICE-NEW` | Complete legacy generation branch parity unverified. |
| `G/invoice/:id` | `D/InvoiceDetailPage.tsx:154` | `/organization/invoice/[id]` | `R/shared/invoices/InvoiceDetail.tsx:95` | logic drift | `INVOICE-DETAIL → INVOICE-DETAIL` | No modern dispatch; recipient predicate only recognizes owner, L7. |
| `G/shifts` — index | `D/PublicShiftsPage.tsx:185` | No equivalent organization public board | `R/organization/shifts/index.tsx:5` | missing | `PUBLIC → none` | Organization native screen is the poster Shift Centre. |
| `G/shifts/public` | `D/PublicShiftsPage.tsx:185` | — | `R/organization/shifts/index.tsx:5` | missing | `PUBLIC → none` | Shared public board not mounted for organization. |
| `G/shifts/community` | `D/CommunityShiftsPage.tsx:217` | — | `R/organization/shifts/index.tsx:5` | missing | `COMMUNITY → none` | Shared community board not mounted for organization. |
| `G/shifts/active` | `D/ActiveShiftsPage/index.tsx:1` | `/organization/shifts` → Active | `R/organization/shifts/index.tsx:5` | unverified | `ACTIVE → ACTIVE` | Same family; complete branch parity unverified. |
| `G/shifts/confirmed` | `D/ConfirmedShiftsPage.tsx:1` | `/organization/shifts` → Confirmed | `R/organization/shifts/index.tsx:6` | visual drift | `CONFIRMED → CONFIRMED` | Native counterpart. |
| `G/shifts/history` | `D/HistoryShiftsPage.tsx:1` | `/organization/shifts` → History | `R/organization/shifts/index.tsx:7` | visual drift | `HISTORY → HISTORY` | Native counterpart. |
| `G/shifts/:id` | `D/PosterShiftDetailPage.tsx:18` | `/organization/shifts/[id]` | `E/organization/shifts/[id].tsx:1` → `R/owner/shifts/[id].tsx:22` | unverified | `ACTIVE`, detail mode → same | Reuses owner detail; assignment/scope branch parity unverified. |
| `G/interests` — Talent Hub | `D/TalentBoard/index.tsx:1` | `/organization/talent-board` | `R/organization/talent-board.tsx:6` | unverified | `TALENT → TALENT` | Organization booking overrides exist. |
| `G/learning` — Learning Materials | `D/LearningMaterialsPage.tsx:211` | — | — | missing | `LEARNING → none` | No organization learning route. |
| `G/chat` — Chat | `D/chat/ChatPage.tsx:302` | `/organization/chat`, `/organization/messages/[id]` | `R/shared/messages/[id].tsx:249` | logic drift | `CHAT → CHAT` | L9/L10/L14. |
| `G/pharmacy-hub` | `W/main.tsx:295` | `/organization/hub` | `R/shared/hub/HubScreen.tsx:173` | logic drift | shared hub redirect → `HUB` | Capability discoverability differs, L10; feed parity unverified. |
| `/dashboard/pharmacy-hub` — Pharmacy Hub | `D/hub/HubPage.tsx:148` | `/organization/hub` | `R/shared/hub/HubScreen.tsx:173` | logic drift | `HUB → HUB` | L10; complete group/feed parity unverified. |
| `G/calendar` — Calendar | `D/PharmacyCalendarPage.tsx:210` | `/organization/calendar` | `R/shared/calendar/index.tsx:202` | logic drift | `CALENDAR → CALENDAR` | Operations align; web hides this without communications capability, L10. |
| `G/logout` — Logout | `D/LogoutPage.tsx:1` | Organization menu sign-out | `E/organization/_layout.tsx:60` | match | auth logout → auth logout | Native action. |
| `/dashboard/workforce/timesheets` — Timesheets | `WF/TimesheetsPage.tsx:415` | `/workforce-timesheets` | `E/workforce-timesheets.tsx:198` | logic drift | `TIMESHEETS → TIMESHEETS` | L5; root route has a roster-capability guard. |
| `/dashboard/workforce/settings` — Workforce & Payroll | `WF/WorkforceSettingsPage.tsx:85` | `/workforce-settings` and related routes | `E/workforce-settings.tsx:47` | logic drift | `SETTINGS → SETTINGS` | L11; sidebar exposure also differs, L10. |

## Admin

Web prefix `A = /dashboard/admin/:pharmacyId`. Mobile normally uses the stored admin assignment rather than a pharmacy ID in every URL.

| Web route / nav item | Web file | Mobile route | Mobile file | Status | Operations: web → mobile | Note |
|---|---|---|---|---|---|---|
| `A` — index | `A/AdminOverview.tsx:47` | `/admin` | `E/admin/index.tsx:21` | logic drift | `getOwnerDashboard`, `fetchPillBalanceService` → same | Operations align; admin menu/capability presentation differs, L10. |
| `A/overview` — Overview | `A/AdminOverview.tsx:47` | `/admin` | `E/admin/index.tsx:21` | logic drift | Same | Same overview implementation as preceding row. |
| `A/pills` | `D/rewards/PillsPage.tsx:1` | `/admin/pills`, `/admin/[pharmacyId]/pills` | `R/shared/pills/PillsScreen.tsx:7` | visual drift | `PILLS → PILLS` | Both mobile aliases route to shared pills. |
| `A/manage-pharmacies` — Manage Pharmacies | `A/AdminManagePharmaciesPage.tsx:66` | `/admin/pharmacies`, `/admin/pharmacies/[id]` | `R/shared/pharmacies/PharmacyOverviewContainer.tsx:10`; `E/admin/pharmacies/[id].tsx:9` | unverified | scoped `getPharmacyById`, membership/admin reads → pharmacy overview/detail reads | Web opens the assigned pharmacy; native opens list/detail. Scope preservation needs full verification. |
| `A/manage-pharmacies/my-pharmacies` — My Pharmacies | `A/AdminManagePharmaciesPage.tsx:85` | `/admin/pharmacies/[id]` | `E/admin/pharmacies/[id].tsx:9` | unverified | `getPharmacyById`, `fetchPharmacyAdminsService`, `fetchMembershipsByPharmacy` → same family | Capability route guard exists at `E/_layout.tsx:346`. |
| `A/manage-pharmacies/roster` — Internal Roster | `A/AdminRosterPage.tsx:5` → `D/RosterOwnerPage.tsx:326` | `/manager/roster` | `P/roster.tsx:125` | logic drift | `MANAGER-ROSTER → MANAGER-ROSTER` | L4; mobile admin menu incorrectly calls `/admin/shifts` “Roster,” L10. |
| `A/manage-pharmacies/attendance-reviews` — Attendance Approvals nav item | `W/navigation.tsx:331`; router only declares `W/main.tsx:328` | `/attendance/reviews` | `P/attendance.tsx:70` | logic drift | No matching web route at the nav URL; intended `ATTENDANCE-REVIEW` → mobile review | Web sidebar target is broken; L15. |
| `A/attendance-reviews` | `W/pages/attendance/ManagerAttendanceReviewPage.tsx:156` | `/attendance/reviews` | `P/attendance.tsx:70` | logic drift | `ATTENDANCE-REVIEW → ATTENDANCE-REVIEW` | Correct web direct route; mobile correction gap L6. |
| `A/post-shift` — Post Shift | `A/AdminPostShiftPage.tsx:1` | `/admin/[pharmacyId]/post-shift`, `/admin/post-shift` | `R/admin/post-shift.tsx:1` → `R/shared/shifts/PostShiftScreen.tsx:347` | unverified | `POST → POST` | Shared implementation exists; assignment-scoping branches unverified. |
| `A/shift-center` — Shift Centre | `W/main.tsx:330` | `/admin/shifts` | `R/admin/shifts/index.tsx:10` | visual drift | redirect to active → local active default | Native segmented screen. |
| `A/shift-center/:section` | `W/pages/dashboard/shiftCenter/ShiftCenterPage.tsx:126` | `/admin/shifts` | `R/admin/shifts/index.tsx:10` | unverified | selected `ACTIVE`/`CONFIRMED`/`HISTORY` → same views | Stored assignment replaces URL scope; deep-link section handling unverified. |
| `A/shift-center/active` — Active Shifts | `A/AdminActiveShiftsPage.tsx:1` | `/admin/shifts` → Active | `R/admin/shifts/index.tsx:40` | unverified | `ACTIVE → ACTIVE` | Complete scope/candidate/payment parity unverified. |
| `A/shift-center/confirmed` — Confirmed Shifts | `A/AdminConfirmedShiftsPage.tsx:1` | `/admin/shifts` → Confirmed | `R/admin/shifts/index.tsx:42` | visual drift | `CONFIRMED → CONFIRMED` | Native counterpart. |
| `A/shift-center/history` — Shifts History | `A/AdminHistoryShiftsPage.tsx:1` | `/admin/shifts` → History | `R/admin/shifts/index.tsx:44` | visual drift | `HISTORY → HISTORY` | Native counterpart. |
| `A/invoice` — index | `D/Invoices/InvoiceManagePage.tsx:14` | `/admin/invoice` | `R/shared/invoices/InvoiceList.tsx:48` | logic drift | `FINANCE → FINANCE` | Correct recipient workspace selection at list level; L8. |
| `A/invoice/new` | `D/InvoiceGeneratePage.tsx:105` | `/admin/invoice/new` | `R/shared/invoices/InvoiceGenerate.tsx:60` | unverified | `INVOICE-NEW → INVOICE-NEW` | Full validation/scoping comparison outstanding. |
| `A/invoice/:id` | `D/InvoiceDetailPage.tsx:154` | `/admin/invoice/[id]` | `R/shared/invoices/InvoiceDetail.tsx:95` | logic drift | `INVOICE-DETAIL → INVOICE-DETAIL` | Modern dispatch and recipient mode differ, L7. |
| `A/shifts` — index | `A/AdminActiveShiftsPage.tsx:1` | `/admin/shifts` → Active | `R/admin/shifts/index.tsx:40` | unverified | `ACTIVE → ACTIVE` | Existing active implementation. |
| `A/shifts/active` | `A/AdminActiveShiftsPage.tsx:1` | `/admin/shifts` → Active | `R/admin/shifts/index.tsx:40` | unverified | `ACTIVE → ACTIVE` | Same as preceding row. |
| `A/shifts/confirmed` | `A/AdminConfirmedShiftsPage.tsx:1` | `/admin/shifts` → Confirmed | `R/admin/shifts/index.tsx:42` | visual drift | `CONFIRMED → CONFIRMED` | Native counterpart. |
| `A/shifts/history` | `A/AdminHistoryShiftsPage.tsx:1` | `/admin/shifts` → History | `R/admin/shifts/index.tsx:44` | visual drift | `HISTORY → HISTORY` | Native counterpart. |
| `A/shifts/:id` | `A/AdminPosterShiftDetailPage.tsx:5` | `/admin/shifts/[id]` | `E/admin/shifts/[id].tsx:1` → `R/owner/shifts/[id].tsx:22` | unverified | `ACTIVE`, detail mode → same | Web explicitly enters admin scope; mobile relies on provider/transport scope. |
| `A/chat` — Chat | `D/chat/ChatPage.tsx:302` | `/admin/chat`, `/admin/messages/[id]` | `R/shared/messages/[id].tsx:249` | logic drift | `CHAT → CHAT` | L9/L14. |
| `/dashboard/pharmacy-hub` — Pharmacy Hub | `D/hub/HubPage.tsx:148` | `/admin/hub` | `R/shared/hub/HubScreen.tsx:173` | logic drift | `HUB → HUB` | Mobile menu lacks web’s staff/roster capability fallback, L10. |
| `A/calendar` — Calendar | `D/PharmacyCalendarPage.tsx:210` | `/admin/calendar` | `R/shared/calendar/index.tsx:202` | logic drift | `CALENDAR → CALENDAR` | Calls align; capability discoverability differs, L10. |
| `A/logout` — Logout | `D/LogoutPage.tsx:1` | Admin menu sign-out | `E/admin/_layout.tsx:54` | match | auth logout → auth logout | Native action. |
| `/dashboard/workforce/timesheets` — Timesheets | `WF/TimesheetsPage.tsx:415` | `/workforce-timesheets` | `E/workforce-timesheets.tsx:198` | logic drift | `TIMESHEETS → TIMESHEETS` | L5; existing guarded route. |
| `/dashboard/workforce/settings` — Workforce & Payroll | `WF/WorkforceSettingsPage.tsx:85` | `/workforce-settings` and related routes | `E/workforce-settings.tsx:47` | logic drift | `SETTINGS → SETTINGS` | L11; menu visibility differs, L10. |

## Pharmacist

Web prefix `P = /dashboard/pharmacist`. Mobile prefix `/pharmacist`.

| Web route / nav item | Web file | Mobile route | Mobile file | Status | Operations: web → mobile | Note |
|---|---|---|---|---|---|---|
| `P` — index | `D/OverviewPageStaff.tsx:106` | `/pharmacist/dashboard` | `R/pharmacist/dashboard.tsx:67` | logic drift | `getPharmacistDashboard`; 403 fallback `getExplorerDashboard` → scoped `getPharmacistDashboard` | Mobile changes scope/rethrows rather than loading Explorer fallback, L1. |
| `P/overview` — Overview | `D/OverviewPageStaff.tsx:106` | `/pharmacist/dashboard` | `R/pharmacist/dashboard.tsx:67` | logic drift | Same | L1/L13. |
| `P/onboarding` — Profile | `W/pages/onboarding/onboarding_pharmacist/PharmacistOnboardingV2Layout.tsx:1` | `/pharmacist/profile`, `/pharmacist/profile-*` | `R/pharmacist/profile.tsx:10`; `R/pharmacist/profile-tabs/BasicInfoScreen.tsx:59` | unverified | `getOnboardingDetail`, `updateOnboardingForm`, mobile OTP operations → profile calls; OTP through `/mobile-verify` | Modern profile exists; full field/verification branch parity unverified. |
| `P/shifts` — Shift Centre/index | `D/PublicShiftsPage.tsx:185`; `W/navigation.tsx:451` | `/pharmacist/shifts` | `R/pharmacist/shifts/index.tsx:15` | visual drift | workspace-selected `PUBLIC`/`COMMUNITY`, booked/history → same | My Roster is a separate mobile screen. |
| `P/shifts/public` — Public Shifts | `D/PublicShiftsPage.tsx:185` | `/pharmacist/shifts` → Public | `R/shared/shifts/PublicShiftsView.tsx:8` | unverified | `PUBLIC → PUBLIC` | Calls align; all offer/filter/pagination branches not exhausted. |
| `P/shifts/community` — Community Shifts | `D/CommunityShiftsPage.tsx:217` | `/pharmacist/shifts` → Community | `R/shared/shifts/CommunityShiftsView.tsx:7` | unverified | `COMMUNITY → COMMUNITY` | Existing internal-workspace counterpart. |
| `P/shifts/confirmed` — Confirmed Shifts | `D/MyConfirmedShiftsPage.tsx:2` | `/pharmacist/shifts` → Confirmed | `R/shared/shifts/WorkerConfirmedShiftsView.tsx:5` | visual drift | `WORKER-CONFIRMED → WORKER-CONFIRMED` | Booked-shift display/rating fetch family aligns. |
| `P/shifts/history` — Shifts History | `D/MyHistoryShiftsPage.tsx:2` | `/pharmacist/shifts` → History | `R/shared/shifts/WorkerHistoryShiftsView.tsx:8` | visual drift | `WORKER-HISTORY → WORKER-HISTORY` | Rating and invoice-entry counterpart. |
| `P/shifts/:id` | `D/WorkerShiftDetailPage.tsx:106` | `/pharmacist/shifts/[id]` | `R/pharmacist/shifts/[id].tsx:136` | logic drift | `WORKER-DETAIL → WORKER-DETAIL` | All-slot interest uses different request grouping, L12. |
| `P/shifts/roster` — My Roster | `D/RosterWorkerPage.tsx:1` | `/my-roster` | `E/my-roster.tsx:106` | unverified | `WORKER-ROSTER → WORKER-ROSTER` | Implemented and linked from Profile; complete dialogs/edge cases unverified. |
| `P/attendance` — My Attendance | `W/pages/attendance/WorkerAttendancePage.tsx:191` | `/attendance` | `P/attendance.tsx:69` | logic drift | `ATTENDANCE → ATTENDANCE` | Published-roster acknowledgement absent, L3. |
| `P/availability` — Set Availability | `D/SetAvailabilityPage.tsx:235` | `/pharmacist/availability` | `R/shared/availability/SetAvailabilityScreen.tsx:358` | visual drift | `AVAILABILITY → AVAILABILITY` | Availability CRUD/location counterpart. |
| `P/memberships` — Manage Memberships | `D/ManageMembershipsPage.tsx:1` | `/pharmacist/memberships` | `R/shared/ManageMembershipsScreen.tsx:5` | unverified | `MEMBERSHIPS → MEMBERSHIPS` | Invitations exist; auth/context freshness and every response branch unverified. |
| `P/invoice` — Manage Invoices/index | `D/Invoices/InvoiceManagePage.tsx:14` | `/pharmacist/invoice` | `R/shared/invoices/InvoiceList.tsx:48` | logic drift | `FINANCE → FINANCE` | Expanded finance is integrated; revision inspection differs, L8. |
| `P/invoice/new` | `D/InvoiceGeneratePage.tsx:105` | `/pharmacist/invoice/new` | `R/shared/invoices/InvoiceGenerate.tsx:60` | unverified | `INVOICE-NEW → INVOICE-NEW` | Shared generation path exists. |
| `P/invoice/:id` | `D/InvoiceDetailPage.tsx:154` | `/pharmacist/invoice/[id]` | `R/shared/invoices/InvoiceDetail.tsx:105` | logic drift | `INVOICE-DETAIL → INVOICE-DETAIL` | Modern finance dispatch absent, L7. |
| `P/interests` — Talent Hub | `D/TalentBoard/index.tsx:1` | `/pharmacist/talent-board` | `R/pharmacist/talent-board.tsx:5` | unverified | `TALENT → TALENT` | Use this route; `/pharmacist/interests` remains an old placeholder. |
| `P/interests?publish_availability=1` — Publish Availability | `D/TalentBoard/index.tsx:621` | `/pharmacist/publish-availability` | `R/pharmacist/publish-availability.tsx:5` | visual drift | `TALENT`, open publish dialog → same with `openPitchOnMount` | Native dedicated entry performs the same job. |
| `P/learning` — Learning Materials | `D/LearningMaterialsPage.tsx:211` | `/pharmacist/learning` | `R/pharmacist/learning.tsx:20` | logic drift | `LEARNING → none` | Static “Coming Soon”; L16. |
| `P/chat` — Chat | `D/chat/ChatPage.tsx:302` | `/pharmacist/chat`, `/pharmacist/messages/[id]` | `R/shared/messages/[id].tsx:249` | logic drift | `CHAT → CHAT` | Routed messages use shared implementation, not the old pharmacist message file; L9/L14. |
| `P/pharmacy-hub` | `W/main.tsx:511` | `/pharmacist/hub` | `R/shared/hub/HubScreen.tsx:173` | unverified | redirect to hub → `HUB` | Alias. |
| `/dashboard/pharmacy-hub` — Pharmacy Hub | `D/hub/HubPage.tsx:148` | `/pharmacist/hub` | `R/shared/hub/HubScreen.tsx:173` | unverified | `HUB → HUB` | Complete group/feed authority parity unverified. |
| `P/calendar` — Calendar | `D/PharmacyCalendarPage.tsx:210` | `/pharmacist/calendar` | `R/shared/calendar/index.tsx:202` | visual drift | `CALENDAR → CALENDAR` | Native event/note counterpart. |
| `P/logout` — Logout | `D/LogoutPage.tsx:1` | Profile/menu sign-out | `R/pharmacist/profile.tsx:10` | match | auth logout → auth logout | Native action. |
| `/dashboard/my-hours` — My Hours | `WF/MyHoursPage.tsx:80` | `/my-hours` | `E/my-hours.tsx:91` | logic drift | `MY-HOURS → MY-HOURS` | Summary/submission exist; detailed review/comments absent, L5. |

## Other Staff

Web prefix `S = /dashboard/otherstaff`. Mobile prefix `/otherstaff`.

| Web route / nav item | Web file | Mobile route | Mobile file | Status | Operations: web → mobile | Note |
|---|---|---|---|---|---|---|
| `S` — index | `D/OverviewPageStaff.tsx:78` | `/otherstaff/dashboard` | `R/otherstaff/dashboard.tsx:65` | logic drift | `getOnboardingDetail`, `getOtherStaffDashboard`, 403 `getExplorerDashboard` fallback → scoped `getOtherStaffDashboard` | Fallback/role-type branches differ, L1. |
| `S/overview` — Overview | `D/OverviewPageStaff.tsx:78` | `/otherstaff/dashboard` | `R/otherstaff/dashboard.tsx:65` | logic drift | Same | L1/L13. |
| `S/onboarding` — Profile | `W/pages/onboarding/onboarding_staff/OtherStaffOnboardingV2Layout.tsx:1` | `/otherstaff/profile`, `/otherstaff/profile-*` | `R/otherstaff/profile.tsx:20`; `R/otherstaff/profile-tabs/BasicInfoScreen.tsx:53` | unverified | onboarding/profile/OTP operations → corresponding profile and verification routes | Full role/regulatory/verification branch parity unverified. |
| `S/shifts` — Shift Centre/index | `D/PublicShiftsPage.tsx:185`; `W/navigation.tsx:372` | `/otherstaff/shifts` | `R/otherstaff/shifts.tsx:15` | visual drift | workspace-selected board/booked/history → same | Separate My Roster route exists. |
| `S/shifts/public` — Public Shifts | `D/PublicShiftsPage.tsx:185` | `/otherstaff/shifts` → Public | `R/shared/shifts/PublicShiftsView.tsx:8` | unverified | `PUBLIC → PUBLIC` | Complete offer/filter branches unverified. |
| `S/shifts/community` — Community Shifts | `D/CommunityShiftsPage.tsx:217` | `/otherstaff/shifts` → Community | `R/shared/shifts/CommunityShiftsView.tsx:7` | unverified | `COMMUNITY → COMMUNITY` | Internal-workspace counterpart. |
| `S/shifts/confirmed` — Confirmed Shifts | `D/MyConfirmedShiftsPage.tsx:2` | `/otherstaff/shifts` → Confirmed | `R/shared/shifts/WorkerConfirmedShiftsView.tsx:5` | visual drift | `WORKER-CONFIRMED → WORKER-CONFIRMED` | Native counterpart. |
| `S/shifts/history` — Shifts History | `D/MyHistoryShiftsPage.tsx:2` | `/otherstaff/shifts` → History | `R/shared/shifts/WorkerHistoryShiftsView.tsx:8` | visual drift | `WORKER-HISTORY → WORKER-HISTORY` | Native rating/invoice-entry counterpart. |
| `S/shifts/:id` | `D/WorkerShiftDetailPage.tsx:106` | `/otherstaff/shifts/[id]` | `E/otherstaff/shifts/[id].tsx:1` → `R/pharmacist/shifts/[id].tsx:136` | logic drift | `WORKER-DETAIL → WORKER-DETAIL` | Reuses worker detail; request grouping differs, L12. |
| `S/shifts/roster` — My Roster | `D/RosterWorkerPage.tsx:1` | `/my-roster` | `E/my-roster.tsx:106` | unverified | `WORKER-ROSTER → WORKER-ROSTER` | Linked from `R/otherstaff/profile.tsx:39`; full branch parity unverified. |
| `S/attendance` — My Attendance | `W/pages/attendance/WorkerAttendancePage.tsx:191` | `/attendance` | `P/attendance.tsx:69` | logic drift | `ATTENDANCE → ATTENDANCE` | Acknowledgement missing, L3. |
| `S/availability` — Set Availability | `D/SetAvailabilityPage.tsx:235` | `/otherstaff/availability` | `R/shared/availability/SetAvailabilityScreen.tsx:358` | visual drift | `AVAILABILITY → AVAILABILITY` | Native availability/location counterpart. |
| `S/memberships` — Manage Memberships | `D/ManageMembershipsPage.tsx:1` | `/otherstaff/memberships` | `R/shared/ManageMembershipsScreen.tsx:5` | unverified | `MEMBERSHIPS → MEMBERSHIPS` | Complete response/auth freshness parity unverified. |
| `S/invoice` — Manage Invoices/index | `D/Invoices/InvoiceManagePage.tsx:14` | `/otherstaff/invoice` | `R/shared/invoices/InvoiceList.tsx:48` | logic drift | `FINANCE → FINANCE` | Full workspace integrated; L8. |
| `S/invoice/new` | `D/InvoiceGeneratePage.tsx:105` | `/otherstaff/invoice/new` | `R/shared/invoices/InvoiceGenerate.tsx:60` | unverified | `INVOICE-NEW → INVOICE-NEW` | Full validation comparison outstanding. |
| `S/invoice/:id` | `D/InvoiceDetailPage.tsx:154` | `/otherstaff/invoice/[id]` | `R/shared/invoices/InvoiceDetail.tsx:105` | logic drift | `INVOICE-DETAIL → INVOICE-DETAIL` | Modern dispatch absent, L7. |
| `S/interests` — Talent Hub | `D/TalentBoard/index.tsx:1` | `/otherstaff/talent-board` | `R/otherstaff/talent-board.tsx:5` | unverified | `TALENT → TALENT` | `/otherstaff/interests` instead points at the old placeholder; avoid that alias. |
| `S/interests?publish_availability=1` — Publish Availability | `D/TalentBoard/index.tsx:621` | `/otherstaff/publish-availability` | `R/otherstaff/publish-availability.tsx:1` → pharmacist publisher | visual drift | `TALENT`, open publishing → same | Dedicated native entry exists. |
| `S/learning` — Learning Materials | `D/LearningMaterialsPage.tsx:211` | `/otherstaff/learning` | `E/otherstaff/learning.tsx:1` → `R/pharmacist/learning.tsx:20` | logic drift | `LEARNING → none` | Reuses “Coming Soon,” L16. |
| `S/chat` — Chat | `D/chat/ChatPage.tsx:302` | `/otherstaff/chat`, `/otherstaff/messages/[id]` | `R/shared/messages/[id].tsx:249` | logic drift | `CHAT → CHAT` | L9/L14. |
| `S/pharmacy-hub` | `W/main.tsx:556` | `/otherstaff/hub` | `R/shared/hub/HubScreen.tsx:173` | unverified | shared hub redirect → `HUB` | Alias. |
| `/dashboard/pharmacy-hub` — Pharmacy Hub | `D/hub/HubPage.tsx:148` | `/otherstaff/hub` | `R/shared/hub/HubScreen.tsx:173` | unverified | `HUB → HUB` | Full group/feed state parity unverified. |
| `S/calendar` — Calendar | `D/PharmacyCalendarPage.tsx:210` | `/otherstaff/calendar` | `R/shared/calendar/index.tsx:202` | visual drift | `CALENDAR → CALENDAR` | Native event/note counterpart. |
| `S/logout` — Logout | `D/LogoutPage.tsx:1` | Profile/menu sign-out | `R/otherstaff/profile.tsx:20` | match | auth logout → auth logout | Native action. |
| `/dashboard/my-hours` — My Hours | `WF/MyHoursPage.tsx:80` | `/my-hours` | `E/my-hours.tsx:91` | logic drift | `MY-HOURS → MY-HOURS` | Detailed review/comments absent, L5. |

## Explorer

Web prefix `X = /dashboard/explorer`. Mobile prefix `/explorer`.

| Web route / nav item | Web file | Mobile route | Mobile file | Status | Operations: web → mobile | Note |
|---|---|---|---|---|---|---|
| `X` — index | `D/OverviewPageStaff.tsx:110` | `/explorer/dashboard` | `R/explorer/dashboard.tsx:21` | logic drift | `getExplorerDashboard` → none | Refresh only starts animation; no dashboard request, L1. |
| `X/overview` — Overview | `D/OverviewPageStaff.tsx:110` | `/explorer/dashboard` | `R/explorer/dashboard.tsx:21` | logic drift | Same | Dashboard metrics/recommendations/activity are not loaded. |
| `X/onboarding` — Profile | `W/pages/onboarding/onboarding_explorer/ExplorerOnboardingV2Layout.tsx:1` | `/explorer/profile`, `/explorer/profile-*` | `R/explorer/profile.tsx:20`; `R/explorer/profile-tabs/BasicInfoScreen.tsx:5` | unverified | onboarding read/update, OTP, account upgrade → corresponding mobile profile/verification/upgrade operations | Full newcomer/identity/upgrade branch comparison outstanding. |
| `X/shifts` — Shifts/index | `D/PublicShiftsPage.tsx:185` | `/explorer/shifts` | `R/explorer/shifts.tsx:3` | logic drift | `PUBLIC → none` | Static “Shifts” text; L17. |
| `X/shifts/public` — Public Shifts | `D/PublicShiftsPage.tsx:185` | `/explorer/shifts` | `R/explorer/shifts.tsx:3` | logic drift | `PUBLIC → none` | No public browsing/filter/interest workflow; L17. |
| `X/shifts/community` — Community Shifts | `D/CommunityShiftsPage.tsx:217` | `/explorer/shifts` | `R/explorer/shifts.tsx:3` | logic drift | `COMMUNITY → none` | No community board; L17. |
| `X/shifts/confirmed` | `D/MyConfirmedShiftsPage.tsx:2` | — | `R/explorer/shifts.tsx:3` | missing | `WORKER-CONFIRMED → none` | Web route exists even though Explorer nav omits it. |
| `X/shifts/history` | `D/MyHistoryShiftsPage.tsx:2` | — | `R/explorer/shifts.tsx:3` | missing | `WORKER-HISTORY → none` | Web route exists; no native booked/history selector. |
| `X/shifts/:id` | `D/WorkerShiftDetailPage.tsx:106` | `/explorer/shifts/[id]` | `E/explorer/shifts/[id].tsx:1` → `R/pharmacist/shifts/[id].tsx:136` | logic drift | `WORKER-DETAIL → WORKER-DETAIL` | Detail exists despite missing board; L12. |
| `X/availability` | `D/SetAvailabilityPage.tsx:235` | `/explorer/availability` | `R/explorer/availability.tsx:1` → shared availability | visual drift | `AVAILABILITY → AVAILABILITY` | Routed native availability screen. |
| `X/interests` — Talent Hub | `D/TalentBoard/index.tsx:1` | `/explorer/talent-board` | `E/explorer/talent-board.tsx:1` → `R/shared/talent-board/index.tsx:10` | unverified | `TALENT → TALENT` | Shared talent implementation; full Explorer publishing permissions unverified. |
| `X/chat` — Chat | `D/chat/ChatPage.tsx:302` | `/explorer/chat`, `/explorer/messages/[id]` | `R/shared/messages/[id].tsx:249` | logic drift | `CHAT → CHAT` | L9/L14. |
| `X/learning` — Learning Materials | `D/LearningMaterialsPage.tsx:211` | — | — | missing | `LEARNING → none` | No Explorer learning route. |
| `X/calendar` — Calendar | `D/PharmacyCalendarPage.tsx:210` | `/explorer/calendar` | `R/shared/calendar/index.tsx:202` | visual drift | `CALENDAR → CALENDAR` | Native event/note counterpart. |
| `X/logout` — Logout | `D/LogoutPage.tsx:1` | Dashboard/Profile sign-out | `R/explorer/dashboard.tsx:11` | match | auth logout → auth logout | Native action. |

## Shared web routes

These rows also cover direct routes absent from persona sidebars.

| Web route | Web file | Mobile route | Mobile file | Status | Operations: web → mobile | Note |
|---|---|---|---|---|---|---|
| `/` | `W/pages/LandingPage.tsx:16` | `/`, `/welcome`, `/contact` | `E/index.tsx:11`; `E/welcome.tsx:7`; `E/contact.tsx:7` | unverified | landing contact `contactSupport` → `/contact` `contactSupport` | Native entry/welcome is not the marketing page; full public-content equivalence unverified. |
| `/pricing` | `W/main.tsx:141`; `W/pages/PricingPage.tsx:1` | — | — | missing | Page content; billing operations not traced → none identified | No native pricing destination found. |
| `/pricing/organization` | `W/main.tsx:142`; `W/pages/OrganizationPricingPage.tsx:1` | — | — | missing | Page content; billing operations not traced → none identified | No native organization pricing destination. |
| `/login` | `W/pages/login.tsx:58` | `/login` | `E/login.tsx:1`; `M/context/AuthContext.tsx:288` | logic drift | `browserLoginSession` → direct native transport, fallback shared `login` | API ownership differs, L14; host session protocol differences need preservation. |
| `/otp-verify` | `W/pages/OTPVerify.tsx:35` | `/verify-otp` | `E/verify-otp.tsx:8`; `M/context/AuthContext.tsx:422` | logic drift | `browserVerifyEmailOtp`, `browserResendEmailOtp` → direct native transport | L14. |
| `/mobile-verify` | `W/pages/MobileOTPVerify.tsx:59` | `/mobile-verify` | `E/mobile-verify.tsx:60` | unverified | `mobileRequestOtp`, browser compatibility adapter verify, `mobileResendOtp`, `skipMobileOverseas` → `mobileRequestOtp`, `mobileVerifyOtp`, `mobileResendOtp`, `skipMobileOverseas` | Web also has a compatibility transport; entire state/session comparison unverified. |
| `/mobile-checkout-return` | `W/pages/MobileCheckoutReturnPage.tsx:1` | External browser return/deep link | — | unverified | Return/redirect behavior | No same-named Expo route; callback handling not fully traced. |
| `/register` | `W/pages/register.tsx:96` | `/register` | `E/register.tsx:37`; `M/context/AuthContext.tsx:377` | logic drift | `browserRegisterAccount` → direct native transport | L14; newcomer validation exists on mobile. |
| `/password-reset` | `W/pages/PasswordResetRequestPage.tsx:26` | `/forgot-password` | `E/forgot-password.tsx:5` | unverified | `browserRequestPasswordReset` → `passwordReset` | Corresponding job exists; complete request/error/session parity unverified. |
| `/terms-of-service` | `W/main.tsx:149`; `W/pages/TermsOfServicePage.tsx:1` | Profile → external terms page | `R/organization/profile.tsx:211`; `R/otherstaff/profile.tsx:240` | match | none → `Linking.openURL` | Browser handoff provides the legal document; not a native duplicate. |
| `/privacy-policy` | `W/main.tsx:150`; `W/pages/PrivacyPolicyPage.tsx:1` | Profile → external privacy page | `R/organization/profile.tsx:218`; `R/otherstaff/profile.tsx:247` | match | none → `Linking.openURL` | Browser handoff. |
| `/account-deletion` | `W/main.tsx:151`; `W/pages/AccountDeletionPage.tsx:1` | Persona Profile deletion actions | `R/pharmacist/profile.tsx:10`; `R/explorer/profile.tsx:20` | unverified | Public deletion guidance → authenticated `deleteAccount` | Related job exists; public guidance and deletion action are different scopes. |
| `/shifts/public-board` | `W/pages/PublicJobBoardPage.tsx:212` | Worker persona boards after authentication | `R/shared/shifts/PublicShiftsView.tsx:8` | missing | `getPublicJobBoard`, interest/counter-offer operations → no anonymous native board | Authenticated boards do not establish anonymous public-board parity. |
| `/talent/public-board` | `W/pages/PublicTalentBoardPage.tsx:47` | Authenticated `/…/talent-board` | `R/shared/talent-board/index.tsx:10` | missing | `getPublicTalentFeed` → no routed anonymous counterpart | Shared talent implementation alone does not supply a public entry. |
| `/shifts/link` | `W/pages/SharedShiftLandingPage.tsx:240` | — | — | missing | `getViewSharedShift` → none found | Mobile can generate/share links, but no token landing screen found. |
| `/organization/:slug` | `W/pages/PublicOrganizationPage.tsx:42` | — | — | missing | `getPublicOrganization` → none found | No public organization screen. |
| `/membership/apply/:token` | `W/pages/MembershipApplyPage.tsx:169` | — | — | missing | `browserMagicMembershipInfo`, `browserSubmitMagicMembership` → none found | Membership management is not token-based application parity. |
| `/referee/questionnaire/:token` | `W/pages/onboarding/RefereeQuestionnairePage.tsx:2` | — | — | missing | `browserSubmitReferee` → none found | Profile referee editing serves a different user/job. |
| `/onboarding/referee-reject/:token` | `W/pages/onboarding/RefereeRejectPage.tsx:3` | — | — | missing | `browserRejectReferee` → none found | No native token rejection flow. |
| `/reset-password/:uid/:token` | `W/pages/ResetPasswordPage.tsx:43` | `/reset-password` with params | `E/reset-password.tsx:9` | unverified | `passwordResetConfirm → passwordResetConfirm` | Same operation; email/deep-link parameter conversion not fully traced. |
| `/kiosk` | `W/pages/attendance/KioskPage.tsx:36` | `/kiosk-link`, `/attendance-pin`, `/attendance/clock` are companion tools | `E/kiosk-link.tsx:27`; `E/attendance-pin.tsx:23`; `P/attendance.tsx:237` | missing | Terminal setup/capture/desktop bridge → pairing/PIN/worker clock operations | No Expo terminal-host equivalent; companion functions are not the kiosk itself. |
| `/dashboard/admin-invitations` | `D/ManageMembershipsPage.tsx:1` | `/admin-invitations` | `E/admin-invitations.tsx:1` → `R/shared/ManageMembershipsScreen.tsx:5` | unverified | `MEMBERSHIPS → MEMBERSHIPS` | Shared invitation screen is routed. |
| `/dashboard/attendance` | `W/pages/attendance/WorkerAttendancePage.tsx:191` | `/attendance` | `P/attendance.tsx:69` | logic drift | `ATTENDANCE → ATTENDANCE` | L3. |
| `/dashboard/attendance/reviews` | `W/pages/attendance/ManagerAttendanceReviewPage.tsx:156` | `/attendance/reviews` | `P/attendance.tsx:70` | logic drift | `ATTENDANCE-REVIEW → ATTENDANCE-REVIEW` | L6; both have roster-capability route guards. |
| `/dashboard/workforce/timesheets` | `WF/TimesheetsPage.tsx:415` | `/workforce-timesheets` | `E/workforce-timesheets.tsx:198` | logic drift | `TIMESHEETS → TIMESHEETS` | L5. |
| `/dashboard/workforce/leave` | `WF/ManagerLeavePage.tsx:13` | `/workforce/leave-requests` | `E/workforce/leave-requests.tsx:50` | visual drift | `MANAGER-LEAVE → MANAGER-LEAVE` | List/status filter and approve/reject-with-note workflow exists. |
| `/dashboard/workforce/settings` | `WF/WorkforceSettingsPage.tsx:85` | `/workforce-settings` and related routes | `E/workforce-settings.tsx:47` | logic drift | `SETTINGS → SETTINGS` | L11. |
| `/dashboard/my-hours` | `WF/MyHoursPage.tsx:80` | `/my-hours` | `E/my-hours.tsx:91` | logic drift | `MY-HOURS → MY-HOURS` | L5. |
| `/dashboard/my-leave` | `WF/MyLeavePage.tsx:10` | `/my-leave` | `E/my-leave.tsx:63` | visual drift | `MY-LEAVE → MY-LEAVE` | Membership-scoped request/list/cancel exists. |
| `/onboarding/owner` | `W/main.tsx:359`; `W/pages/onboarding/OwnerOnboarding.tsx:188` | `/owner/profile-detail`, legacy `/owner/onboarding/*` | `R/owner/profile-detail.tsx:149`; `R/owner/onboarding/review.tsx:8` | unverified | `getOnboardingDetail`, `updateOnboardingForm` → `getOnboarding`, `updateOnboardingForm`; legacy `updateOnboarding` | Multiple mobile implementations; intended canonical path needs reconciliation. |
| `/setup/owner/onboarding` | `W/pages/setup/OwnerSetupOnboardingPage.tsx:16` | `/setup/owner/onboarding` | `R/owner/setup-onboarding.tsx:16` | unverified | owner setup checks/profile operations → corresponding native setup/profile operations | Similar gate structure; complete profile field parity unverified. |
| `/setup/owner/pharmacies` | `W/pages/setup/OwnerSetupPharmaciesPage.tsx:17` | `/setup/owner/pharmacies` | `R/owner/setup-pharmacy.tsx:20` | unverified | setup checks + pharmacy creation → same family | Target-count/create-another flow exists; all skip/error branches unverified. |
| `/onboarding/pharmacist` | `W/main.tsx:383` | `/pharmacist/profile` and profile tabs | `R/pharmacist/profile.tsx:10` | unverified | onboarding read/update/verification operations → corresponding mobile profile routes | Same counterpart as persona Profile. |
| `/onboarding/otherstaff` | `W/main.tsx:391` | `/otherstaff/profile` and profile tabs | `R/otherstaff/profile.tsx:20` | unverified | onboarding read/update/verification operations → corresponding mobile profile routes | Same counterpart as persona Profile. |
| `/onboarding/explorer` | `W/main.tsx:399` | `/explorer/profile` and profile tabs | `R/explorer/profile.tsx:20` | unverified | onboarding read/update/upgrade operations → corresponding mobile profile routes | Same counterpart as persona Profile. |
| `/dashboard/pharmacy-hub` | `W/main.tsx:304`; `D/hub/HubPage.tsx:148` | Owner/org/admin/pharmacist/other-staff `/hub` | `R/shared/hub/HubScreen.tsx:173` | unverified | `HUB → HUB` | Shared route, also enumerated for each sidebar that exposes it. |
| `*` | `W/main.tsx:594`; `W/pages/NotFoundPage.tsx:1` | `+not-found` | `E/+not-found.tsx:15` | logic drift | none → role/auth-based redirect helpers | Web renders Not Found; mobile redirects. Broken destinations can be concealed instead of identified. |

## Shared/mobile-only areas

Multiple URLs are listed together only where they have no separate web router rows. Native subroutes for a web page’s dialogs are identified as such, rather than treating every extra URL as a new feature.

| Web route / job | Web file | Mobile route(s) | Mobile file | Status | Operations: web → mobile | Note |
|---|---|---|---|---|---|---|
| No Vite marketplace route | `W/main.tsx:135` | `/marketplace`, `/marketplace/filters` | `P/marketplace.tsx:22` | mobile-only | — → `marketplace.listListings`, `listCategories` | Browse/filter; shared-core facade. |
| No Vite marketplace route | `W/main.tsx:135` | `/marketplace/items/[id]`, `/marketplace/items/[id]/report` | `P/marketplace.tsx:23`; `P/marketplace.tsx:180` | mobile-only | — → `getListing`, `createEnquiry`, `reportListing` | Detail/enquiry/report. |
| No Vite marketplace route | `W/main.tsx:135` | `/marketplace/new/seller`, `category`, `details`, `photos`, `audience`, `review` | `P/marketplace.tsx:24`; `P/marketplace.tsx:104` | mobile-only | — → `getListingOptions`, `lookupCatalogue`, `createListing`, `updateListing`, `updateAudience`, `uploadImage`, `actOnListing` | Persisted listing wizard. |
| No Vite marketplace route | `W/main.tsx:135` | `/marketplace/mine`, `/marketplace/mine/[id]` | `P/marketplace.tsx:25`; `P/marketplace.tsx:134` | mobile-only | — → `getDashboard`, `actOnListing`, `updateAudience` | Seller management. |
| No Vite marketplace route | `W/main.tsx:135` | `/marketplace/exchanges`, `/marketplace/exchanges/[id]` | `P/marketplace.tsx:26`; `P/marketplace.tsx:179` | mobile-only | — → `listExchanges`, `getExchange`, `listExchangeMessages`, `sendExchangeMessage`, `actOnExchange` | Exchange workflow. |
| No Vite ethical marketplace route | `W/main.tsx:135` | `/marketplace/ethical/access`, `pharmacy`, `grants`, `requests` | `P/ethicalMarketplace.tsx:21`; `P/ethicalMarketplace.tsx:54` | mobile-only | — → `getAccess`, `getPharmacyApproval`, `submitPharmacyApproval`, `getPharmacyGrants`, `createPharmacyGrant`, `revokePharmacyGrant` | Approval/delegated access. |
| No Vite ethical inventory route | `W/main.tsx:135` | `/marketplace/ethical/inventory`, `inventory/scan`, `inventory/lots/[id]` | `P/ethicalMarketplace.tsx:26`; `P/ethicalMarketplace.tsx:66` | mobile-only | — → `getLots`, `lookupCatalogue`, `createLot`, `reconcileLot` | Inventory/lot workflow. |
| No Vite ethical import route | `W/main.tsx:135` | `/marketplace/ethical/inventory/import`, `import/review` | `P/ethicalMarketplace.tsx:67` | mobile-only | — → `uploadImport`, `getImport`, `commitImport` | Upload then review/commit. |
| No Vite ethical listings route | `W/main.tsx:135` | `/marketplace/ethical/listings`, `listings/new`, `listings/new/s8` | `P/ethicalMarketplace.tsx:27`; `P/ethicalMarketplace.tsx:74` | mobile-only | — → `getMyListings`, `listListings`, `createListing`, `actOnListing` | Listing/S8 paths retained. |
| No Vite ethical transfer route | `W/main.tsx:135` | `/marketplace/ethical/transfers`, `transfers/[id]`, `documents`, `complete` | `P/ethicalMarketplace.tsx:28`; `P/ethicalMarketplace.tsx:83` | mobile-only | — → `listTransfers`, `getTransfer`, `listTransferMessages`, `sendTransferMessage`, `uploadTransferDocument`, `actOnTransfer` | Transfer communications/evidence/state actions. |
| Kiosk pairing companion | `W/pages/attendance/KioskPage.tsx:36` | `/kiosk-link` | `E/kiosk-link.tsx:27` | mobile-only | Terminal pairing → `attendance.getKioskPairingOptions`, `createKioskPairingCode` | Native companion job; not a terminal replacement. |
| Worker PIN setup | `W/pages/attendance/WorkerAttendancePage.tsx:22` | `/attendance-pin` | `E/attendance-pin.tsx:23` | mobile-only | Related web attendance/PIN UI → `attendance.getPinPharmacies`, `updatePin` | Dedicated native route. |
| Worker clock/break UI | `W/pages/attendance/WorkerAttendancePage.tsx:285` | `/attendance/clock` | `P/attendance.tsx:237` | unverified | `clockIn`, `clockOut`, `breakStart`, `breakEnd` → same | Native scanner/opposite-action confirmation exists; exhaustive error parity unverified. |
| Attendance detail/correction/kiosk management | `W/pages/attendance/ManagerAttendanceReviewPage.tsx:232`; `WF/WorkforceSettingsPage.tsx:89` | `/attendance/exceptions/[id]`, `/attendance/corrections/new`, `/attendance/reviews/[id]`, `/decision`, `/attendance/kiosk-status` | `P/attendance.tsx:95`; `P/attendance.tsx:373`; `P/attendance.tsx:405` | logic drift | review/correction/device operations → corresponding native operations | Web subflows split into routes; correction gap L6. |
| Manager roster dialogs/tools | `W/components/roster/RosterPlanningToolbar.tsx:110` | `/manager/roster/calendar`, `staff`, `shift-editor`, `validate`, `publish`, `coverage`, `copy-week`, `templates`, `approvals`, `acknowledgements`, `audit` | `P/roster.tsx:125` | logic drift | `MANAGER-ROSTER → MANAGER-ROSTER` | Native subroute expansion; L4, not “missing manager roster.” |
| Workforce settings/engagement subflows | `WF/EmploymentEngagementsPanel.tsx:1` | `/workforce/work-settings`, `payroll-configuration`, `award-preview`, `employment-engagements`, `/new`, `/[id]`, `/rates`, `/history` | `P/workforce.tsx:111`; `P/workforce.tsx:392`; `P/workforce.tsx:647` | unverified | workforce settings/engagement/award operations → corresponding shared workforce operations | Native subroutes exist; full editor/history/rate parity unverified. |
| No standalone Vite payroll-export route | `W/main.tsx:201` | `/workforce/payroll-export` | `P/workforce.tsx:198` | mobile-only | — → `workforce.listTimesheetPeriods`, `listTimesheets`; local CSV/file sharing | Preserve; export semantics not fully audited here. |
| Finance workspace subtools | `W/pages/finance/FinanceWorkspace.tsx:281` | `/finance`, `/finance/customers`, `/new`, `/finance/items`, `/new`, `/finance/expenses`, `/new`, `/[id]/receipt`, `/finance/receipts/[id]` | `P/finance.tsx:63` | unverified | `FINANCE` → `finance` customer/item/expense/receipt operations | Native routes supplement the integrated persona workspace. |
| Finance received/payment/history | `W/pages/finance/FinanceWorkspace.tsx:141` | `/finance/received`, `/[id]`, `/finance/invoices/[id]/history`, `/payment` | `P/finance.tsx:66`; `P/finance.tsx:245` | unverified | finance review/revision/payment operations → corresponding native operations | Root variants coexist with persona workspace; full consistency unverified. |
| GST/BAS worksheet | `W/pages/finance/FinanceWorkspace.tsx:325` | `/finance/bas` | `P/finance.tsx:234` | visual drift | `finance.worksheet → finance.worksheet` | Dedicated mobile URL; the worksheet job also exists on web. |
| Ratings UI outside shift history | `D/shiftCenter/WorkerBookedShifts.tsx:4`¹ | `/profile/ratings`, `/history`, `/[id]/report` | `P/trustRewards.tsx:15`; `P/trustRewards.tsx:55` | mobile-only | related rating fetches → `fetchRatingsSummaryService`, `fetchRatingsPageService`, `reportRatingService` | No equivalent standalone Vite route; preserve reporting. |
| Rewards root | `D/rewards/PillsPage.tsx:1` | `/rewards/pills` | `P/trustRewards.tsx:16` | mobile-only | persona rewards → balance/history/referral-code/referral fetches | Extra native entry, not an absent web rewards feature. |
| Notifications | `W/layouts/TopBarActions.tsx:28` | `/notifications`, persona `/notifications` | `M/features/notifications/NotificationsScreen.tsx:60` | unverified | top-bar notification services → `getNotifications`, `markNotificationsAsRead` | No dedicated Vite route; notification-navigation parity unverified. |
| Owner subscription seats | `D/owner/OwnerBillingPage.tsx:1` | `/owner/subscription-seats` | `R/owner/subscription-seats.tsx:5` | unverified | `getCurrentSubscription`, `createSubscriptionCheckout`, `updateSubscriptionSeats` → same | Web component exists inside other flows; not a standalone router row. |
| Legacy worker Interests routes | `D/TalentBoard/index.tsx:1` | `/pharmacist/interests`, `/otherstaff/interests` | `R/pharmacist/interests.tsx:20`; `E/otherstaff/interests.tsx:1` | logic drift | `TALENT → none` | Both native aliases show “Coming Soon”; working counterpart is `/…/talent-board`. |
| Legacy pharmacist onboarding | `W/pages/onboarding/onboarding_pharmacist/PharmacistOnboardingV2Layout.tsx:1` | `/pharmacist/onboarding` | `R/pharmacist/onboarding.tsx:6` | unverified | V2 profile operations → legacy `getOnboarding`, `updateOnboarding` | Exists alongside modern profile routes; do not assume it is the canonical profile. |
| Owner standalone staff/locum/pharmacy editors | `D/owner/StaffManager.tsx:1`; `D/owner/LocumManager.tsx:1` | `/owner/staff`, `/owner/locums`, persona `/pharmacies/[id]`, `/edit`, `/staff`, `/locums`, `/add` | `R/shared/pharmacies/StaffManager.tsx:23`; `R/shared/pharmacies/PharmacyForm.tsx:36` | unverified | pharmacy/member/invite/admin operations → corresponding shared-core operations | Native decomposition of web pharmacy views; complete authority parity unverified. |
| Native message routes | `D/chat/ChatPage.tsx:302` | Persona `/messages/[id]`, `/shared/chat`, `/shared/messages/[id]` | `R/shared/messages/[id].tsx:249` | logic drift | `CHAT → CHAT` | Native decomposition of web chat; L9/L14. |

¹ Correct expanded file for this citation is `frontend_web/src/pages/dashboard/shiftCenter/WorkerBookedShifts.tsx:4` rather than the sidebar directory.

## Logic drift — fix before visual work

These are static findings. They are not runtime reproductions.

### L1 — Dashboard data and fallback branches differ

**Rule:** each persona loads its dashboard and receives the same supported fallback behavior.

- **Explorer:** web calls `getExplorerDashboard` at `D/OverviewPageStaff.tsx:110`; mobile `R/explorer/dashboard.tsx:21` only starts animations. No dashboard request or response-backed metrics/activity are loaded.
- **Pharmacist and Other Staff:** web handles a dashboard 403 by calling `getExplorerDashboard` at `D/OverviewPageStaff.tsx:115`. Mobile catches 403, changes pharmacy/platform selection where possible, and rethrows at `R/shared/dashboard/dashboardScope.tsx:205`; it never calls the Explorer fallback.
- **Other Staff:** web separately reads onboarding role type at `D/OverviewPageStaff.tsx:78`. That read is absent from `R/otherstaff/dashboard.tsx:65` and its scoped dashboard fetcher.

Affected siblings: pharmacist/other-staff overview and index; Explorer overview/index. Preserve successful scoped dashboard loads while reconciling the fallback and role-type branches.

### L2 — Organization pharmacy claims are absent

**Rule:** authorized organization users can request a pharmacy claim and review their claim history.

- Web loads organization claims at `D/PharmacyPage.tsx:1271` and submits `claimOnboarding({ pharmacy_email })` at `D/PharmacyPage.tsx:1318`.
- Mobile organization pharmacy list at `E/organization/pharmacies/index.tsx:16` loads pharmacies and member counts; its rendered actions at line 60 only open/edit/delete/add pharmacies.
- No mobile `claimOnboarding` usage was found. Mobile `getPharmacyClaims` usages are owner-side `owned_by_me` requests, including `R/owner/pharmacies/index.tsx:100`.

Affected siblings: organization Manage Pharmacies parent/index and My Pharmacies. Owner claim response is a positive control that already exists; retain it.

### L3 — Published-roster acknowledgement is missing from worker attendance

**Rule:** a worker can see and acknowledge the published roster from the attendance workflow.

- Web fetches `rosterV2.getWorkerRoster({})` at `W/pages/attendance/WorkerAttendancePage.tsx:191` and calls `rosterV2.acknowledge` at line 242.
- Mobile attendance loads worker clock status at `P/attendance.tsx:69`; its tools at line 134 contain clock/correction/PIN/review/hours links, but no published-roster read or acknowledgement.
- `/my-roster` implements the legacy roster/request family; no replacement acknowledgement call was found there.

Affected siblings: shared attendance and owner/pharmacist/other-staff attendance aliases. Clock, breaks and approved-cover terms already exist and must remain.

### L4 — Manager roster is implemented, but does not cover all web actions

**Rule:** managers retain web’s assignment, escalation, leave and cover-review actions.

- Web loads assignments/open shifts/requests at `D/RosterOwnerPage.tsx:326`.
- Web creates an assigned shift at line 369; deletes shift/assignment at lines 397/402; escalates at line 510; approves/rejects legacy leave at lines 527/542; approves/rejects worker cover requests at lines 608/623.
- Mobile loads a V2 period at `P/roster.tsx:125`, creates using `roster.bulkEdit` at line 538, and decides request types through `approveSwap`, `approveReplacement`, `releaseWorker`, `rejectRequest` at lines 638–645.
- Mobile usages of `deleteRosterAssignmentService`, `deleteRosterShiftService`, `escalateRosterShiftService`, `approveLeaveRequestService`, `rejectLeaveRequestService`, and `createShiftAndAssignService` were not found.

This is a workflow/operation difference, not evidence that V2 publication is broken. Web also uses V2 planning through `W/components/roster/RosterPlanningToolbar.tsx:110`.

Affected siblings: owner/org/admin roster routes; native manager calendar/editor/approvals. Separate `/workforce/leave-requests` does not establish parity for the legacy roster leave requests.

### L5 — Timesheet detail review is absent for managers and workers

**Rule:** users can inspect the same checks, evidence, comments and available corrections before submission or approval.

- Web manager list mounts `TimesheetDetailDrawer` at `WF/TimesheetsPage.tsx:415`; worker My Hours opens it at `WF/MyHoursPage.tsx:80` and line 87.
- Drawer loads detail at `WF/TimesheetDetailDrawer.tsx:157`, decides checks at line 75, adds comments at line 329, reopens approved timesheets at line 343, adds missing punches at line 392, and opens contextual time adjustment at line 407.
- Mobile manager cards at `E/workforce-timesheets.tsx:198` expose approval/recalculation, but no detail destination or equivalent checks/comments/reopen flow.
- Mobile worker cards end with submission at `E/my-hours.tsx:91`; no detail review action exists.
- Mobile manager approval at `E/workforce-timesheets.tsx:206` does not disable for blocking checks as web’s drawer does at `WF/TimesheetDetailDrawer.tsx:198`.

Missing operation families include `workforce.getTimesheet`, `decideTimesheetCheck`, `addTimesheetComment`, `reopenTimesheet`, and the contextual source-correction flow. Generic attendance correction is not an equivalent detail review.

Affected siblings: all manager personas’ Timesheets and pharmacist/other-staff My Hours.

### L6 — Attendance correction loses event context and pharmacy timezone

**Rule:** changing a clock time preserves the pharmacy’s local time interpretation and original audit context.

- Web resolves the original effective timestamp and pharmacy timezone at `W/pages/attendance/ManagerAttendanceReviewPage.tsx:243`, then uses `correctionTimestamp` at line 250.
- `W/pages/attendance/correctionTimestamp.ts:8` preserves an unchanged original instant and handles timezone/DST ambiguity.
- Mobile `P/attendance.tsx:405` presents manually entered event/session IDs; line 420 sends `new Date(timestamp).toISOString()`. It does not use the pharmacy timezone or original event timestamp.
- Mobile review chronology at `P/attendance.tsx:394` does not offer web’s contextual event edit action.
- Approval notes also differ: web supplies a default explanation at `W/pages/attendance/ManagerAttendanceReviewPage.tsx:183`; mobile passes an empty trimmed note at `P/attendance.tsx:381`.

Affected siblings: all review aliases and `/attendance/corrections/new`. Existing audited API writes should be reused; do not replace them with destructive edits.

### L7 — Persona invoice detail bypasses modern finance dispatch

**Rule:** a managed invoice opens the finance workflow and recipient controls appropriate to the active persona.

- Web first calls `finance.receivedInvoice` or `finance.invoice` at `D/InvoiceDetailPage.tsx:157`. Success redirects to the workspace’s `?invoice=` selection at line 161; only failure falls back to legacy detail.
- Mobile always calls legacy `getInvoiceDetail` at `R/shared/invoices/InvoiceDetail.tsx:109`.
- Mobile’s detail recipient predicate is only `role === 'owner'` at line 95. Organization/admin do not receive the same recipient treatment as the persona list wrapper, which explicitly recognizes all three at `R/shared/invoices/InvoiceList.tsx:50`.

Affected siblings: owner/organization/admin/pharmacist/other-staff `invoice/[id]`, including links from activity and messages. Legacy fallback must remain available for actual legacy invoices.

### L8 — Finance workspace has narrower revision review and approval guards

**Rule:** invoice review observes revision/state rules consistently and lets users inspect the same historical document.

- Web loads historical documents through `finance.receivedRevision`/`finance.invoiceRevision` at `W/pages/finance/FinanceWorkspace.tsx:141`.
- Mobile revision rows at `R/shared/invoices/FinanceWorkspace.tsx:137` expose revision summary and PDF sharing; no equivalent historical document fetch/view is present.
- Web disables received approval for historical review, already-approved and paid states at `W/pages/finance/InvoiceReviewDrawer.tsx:71`.
- Mobile approval at `R/shared/invoices/FinanceWorkspace.tsx:146` only checks `selected.is_current === false`; it does not apply the same approved/paid guard.

Affected siblings: all persona invoice lists using `InvoiceList`/`FinanceWorkspace`. The full workspace already exists; this is not a request to build another finance system.

### L9 — Chat cannot load older message pages

**Rule:** a conversation’s accessible history is not truncated to its first fetched page.

- Web retains pagination state at `D/chat/ChatPage.tsx:325` and calls `fetchRoomMessagesByUrl` at line 606.
- Mobile `R/shared/messages/[id].tsx:253` calls `getRoomMessages`, extracts `results`, and does not retain/follow the response’s `next` URL.
- Shared-core `getRoomMessages` is a single request, not an all-pages loader: `shared-core/src/domains/chat/api.ts:16`.

Affected siblings: all six persona message routes plus `/shared/messages/[id]`. Current send/edit/delete/react/live-message functionality must remain.

### L10 — Organization/admin navigation does not mirror capability rules

**Rule:** authorized users keep access and unauthorized controls are not presented as usable destinations.

- Web organization nav filters invite/comms/pharmacy/roster/settings entries at `W/navigation.tsx:100`.
- Mobile organization sidebar lists them unconditionally at `E/organization/_layout.tsx:33`; dashboard quick actions are likewise unconditional at `R/organization/dashboard.tsx:100`.
- Mobile root allows organization persona routes based on organization access at `E/_layout.tsx:361`, without corresponding per-destination capability filtering there. This is a client navigation difference; backend access was not audited.
- Web admin communications visibility includes staff/roster capability fallback at `W/navigation.tsx:291`. Mobile menu computes only `MANAGE_COMMUNICATIONS` at `E/admin/_layout.tsx:133`, hiding Hub/Calendar from some users web permits.
- Mobile admin menu lists Pharmacies/Post/Timesheets/Settings without staff/roster visibility filters at `E/admin/_layout.tsx:40`, although root route guards exist at `E/_layout.tsx:335`.
- Admin “Roster” points to `/admin/shifts` at `E/admin/_layout.tsx:43`, which is the Shift Centre, rather than `/manager/roster`.

Positive controls: retain the existing root staff/roster guards at `E/_layout.tsx:320` and line 346, and retain successful member delegation checks in the invite implementation.

### L11 — Workforce settings is split without equivalent integration

**Rule:** a manager can reach payroll, contracted hours, coverage, employment editing and kiosk management from the same settings job.

- Web settings loads coverage, work settings, payroll and kiosk devices at `WF/WorkforceSettingsPage.tsx:85`; includes coverage create/delete at lines 181/289 and kiosk revoke at line 265.
- Mobile root settings loads payroll/work settings/engagements at `E/workforce-settings.tsx:47` and renders current terms at line 179.
- Coverage exists separately at `P/roster.tsx:577`; kiosk management exists under attendance at `P/attendance.tsx:454`; employment editing exists at `P/workforce.tsx:647`.
- The root settings screen ends at `E/workforce-settings.tsx:192` without those integrations or links.

The operations exist elsewhere; the gap is the complete settings flow and reachability, not wholly missing implementations.

### L12 — Worker-detail “all slots” interest uses different request grouping

**Rule:** accepting interest in multiple slots has consistent payload/partial-failure behavior.

- Web sends one request per slot using `Promise.all` at `D/WorkerShiftDetailPage.tsx:110`.
- Mobile sends one `{ slotIds: [...] }` request at `R/pharmacist/shifts/[id].tsx:140`.
- Both use shared-core `expressInterestInShiftService`, which supports the batch payload at `shared-core/src/domains/shifts/api.ts:457`.

This is a confirmed request-shape/atomicity difference; whether both behaviors are acceptable requires a targeted contract decision. It is not evidence that mobile’s batch request fails.

Affected siblings: pharmacist, other-staff and Explorer detail re-exports. Counter-offer naming differences are excluded: web’s helper and shared-core service construct equivalent bodies.

### L13 — Dashboard activity URL conversion does not map renamed native routes

**Rule:** activity links open the corresponding native job.

- Mobile converter at `R/shared/dashboard/dashboardScope.tsx:512` mostly strips `/dashboard/<persona>` at lines 518–521.
- Consequently, a supplied `/dashboard/owner/shift-center/history` becomes `/owner/shift-center/history`, rather than the native `/owner/shifts` history selection. Likewise `manage-pharmacies` is not translated to `pharmacies`.
- Admin conversion only special-cases invoice paths at line 516; other scoped admin paths can remain web paths.
- `E/owner/shifts/index.tsx:1` and `E/owner/pharmacies/index.tsx:1` show the actual native destinations.

The mismatch is conditional on those activity URL forms being supplied; production payload frequencies were not verified.

Affected siblings: owner/organization/worker/admin dashboard activity. Preserve working invoice links and add explicit mappings for renamed jobs.

### L14 — API transport ownership remains outside shared-core

**Rule:** shared-core owns API requests/contracts; native storage/lifecycle stays mobile-owned.

- Web login/register/email OTP screens use shared operations at `W/pages/login.tsx:58`, `W/pages/register.tsx:96`, `W/pages/OTPVerify.tsx:35`.
- Mobile uses direct Axios requests in `M/utils/nativeIdentityTransport.ts:11`, line 13, line 14, line 16 and line 18, invoked by `M/context/AuthContext.tsx:288`, line 377 and line 422.
- Additional direct requests remain for refresh, CSRF, WebSocket ticket and app config; full inventory follows.
- Endpoint constants coming from shared-core do not make a locally executed Axios request a shared-core operation.

These adapters document transport compatibility requirements. Consolidation must preserve cookies, bearer refresh, timeout/interceptor behavior and native session invalidation; this audit does not authorize changing those contracts.

### L15 — Admin Attendance Approvals web nav target is unrouted

**Rule:** every sidebar destination resolves to the intended page.

- Web builds the child under `manage-pharmacies` at `W/navigation.tsx:331`.
- Router declares `/dashboard/admin/:pharmacyId/attendance-reviews` at `W/main.tsx:328`, but no matching `manage-pharmacies/attendance-reviews` route.
- Mobile review implementation exists at `P/attendance.tsx:70`.

This is a web baseline defect, not a missing native review screen.

### L16 — Pharmacist/Other Staff learning remains a placeholder

**Rule:** the learning destination loads the current resource library and its states.

- Web loads learning articles at `D/LearningMaterialsPage.tsx:211`, loads more at line 245, renders retry at line 340, empty-library guidance at line 353, search/type filtering at line 368 and pagination at line 424.
- Mobile `R/pharmacist/learning.tsx:20` renders “Coming Soon” and performs no shared-core calls.
- Other Staff re-exports it at `E/otherstaff/learning.tsx:1`.

Owner/organization/Explorer lack the route entirely and are listed as missing below.

### L17 — Explorer shifts is a placeholder despite routed detail

**Rule:** Explorer can browse the public/community opportunities web exposes.

- Web registers public/community/confirmed/history/detail at `W/main.tsx:578`.
- Mobile `R/explorer/shifts.tsx:3` only renders “Shifts.”
- Detail separately re-exports the worker implementation at `E/explorer/shifts/[id].tsx:1`.

Public/community browsing is a logic gap in an existing destination; confirmed/history have no mobile destination.

### Additional state difference — unknown routes

Web’s fallback route renders `NotFoundPage` at `W/main.tsx:594`; mobile `E/+not-found.tsx:15` redirects according to session/persona. This can hide a stale native link behind a home redirect. Keep this on the navigation hardening checklist.

## Missing destinations and proposed placement

Placement is a proposal for the native shell, not an authorization to alter permissions or remove existing workflows.

| Missing job | Evidence | Persona / proposed tab or More location |
|---|---|---|
| My Chain | `D/ChainPage.tsx:3`; nav `W/navigation.tsx:143`, line 224; no mobile chain route/operation usage found | Owner and permitted organization users: **More → Manage Pharmacies → My Chain**. |
| Owner public/community boards, including `/shifts` index alias | `W/main.tsx:449`; mobile selector `R/owner/shifts/index.tsx:25` | Owner: **Shifts → Browse shifts**, with Public/Community entries. Preserve poster Active/Confirmed/History. |
| Organization public/community boards, including `/shifts` index alias | `W/main.tsx:282`; `R/organization/shifts/index.tsx:5` | Organization: **Shifts → Browse shifts**, applying existing permissions. |
| Owner learning | `W/main.tsx:459`; no `E/owner/learning.tsx` | **More → Learning & Explorer Hub → Learning Materials**. |
| Organization learning | `W/main.tsx:293`; no organization learning route | **More → Learning & Explorer Hub → Learning Materials**. |
| Explorer learning | `W/main.tsx:589`; no Explorer learning route | **More → Learning & Community → Learning Materials**. |
| Explorer confirmed/history | `W/main.tsx:581`; placeholder `R/explorer/shifts.tsx:3` | Explorer: **Shifts → Confirmed / History**; retain the web’s access behavior. |
| Anonymous public shift board | `W/main.tsx:154`; `W/pages/PublicJobBoardPage.tsx:212` | Pre-auth **Welcome → Browse shifts**, with authenticated actions routed through sign-in. |
| Anonymous public talent board | `W/main.tsx:155`; `W/pages/PublicTalentBoardPage.tsx:47` | Pre-auth **Welcome → Browse talent**, or an explicit browser handoff. |
| Shared shift-token landing | `W/main.tsx:156`; `W/pages/SharedShiftLandingPage.tsx:240` | Shared deep-link destination; no tab. Link onward to the appropriate persona shift view. |
| Public organization page | `W/main.tsx:157`; `W/pages/PublicOrganizationPage.tsx:42` | Shared deep-link destination; optional **More → Organization** where relevant. |
| Membership application token flow | `W/main.tsx:159`; `W/pages/MembershipApplyPage.tsx:169` | Shared deep-link destination; surface accepted memberships under **More → Manage Memberships**. |
| Referee questionnaire/rejection token flows | `W/main.tsx:162`; `W/main.tsx:163` | Shared deep links/browser handoff; no persona tab. Referees are not necessarily signed-in app users. |
| Pricing/organization pricing | `W/main.tsx:141`; `W/main.tsx:142` | **More → Account & Billing → Plans**, or explicit browser handoff. |
| Terminal-host kiosk | `W/main.tsx:169`; `W/pages/attendance/KioskPage.tsx:36` | Keep terminal host in the kiosk product; mobile **More → Attendance → Pair kiosk** already exists. A native terminal-host requirement needs an explicit product decision. |

Also required within existing screens: organization claims, worker roster acknowledgement, timesheet detail/review, implemented learning for pharmacist/other-staff, and Explorer public/community browsing. These are listed under logic drift rather than counted again as wholly absent routes.

## Direct API calls outside shared-core

Search used the requested `apiClient`, `axios`, and `fetch(` patterns across `frontend_mobile`. A textual hit is not automatically an API boundary violation.

### Actual backend requests executed by mobile code

| File:line | Call | Classification |
|---|---|---|
| `M/utils/nativeIdentityTransport.ts:11` | `apiClient.get(NATIVE_IDENTITY_ROUTES.me)` | Direct current-user request. |
| `M/utils/nativeIdentityTransport.ts:13` | `apiClient.post(NATIVE_IDENTITY_ROUTES.login, …)` | Direct login request; Axios credentials/interceptor compatibility adapter. |
| `M/utils/nativeIdentityTransport.ts:14` | `apiClient.post(NATIVE_IDENTITY_ROUTES.register, payload)` | Direct registration. |
| `M/utils/nativeIdentityTransport.ts:16` | `apiClient.post(NATIVE_IDENTITY_ROUTES.verifyEmailOtp, …)` | Direct email verification. |
| `M/utils/nativeIdentityTransport.ts:18` | `apiClient.post(NATIVE_IDENTITY_ROUTES.resendEmailOtp, …)` | Direct OTP resend. |
| `M/utils/browserAuth.ts:3` | `fetch(baseURL + '/users/csrf/', …)` | Direct CSRF request for browser-mode session support. |
| `M/utils/authSession.ts:274` | `fetch(baseURL + TOKEN_REFRESH_PATH, …)` | Direct token refresh; path declared at line 19. |
| `M/utils/apiClient.ts:140` | `apiClient.post('/users/ws-ticket/')` | Direct WebSocket ticket request. |
| `M/utils/appUpdates.ts:69` | `fetch(API_BASE_URL + '/users/mobile/app-config/', …)` | Direct app-configuration request. |

### Transport plumbing, local asset reads and other grep hits

| File:line | Hit | Interpretation |
|---|---|---|
| `M/utils/apiClient.ts:3`, line 24 | Axios import / `axios.create` | Local transport construction, not a separate endpoint call. |
| `M/utils/apiClient.ts:35`, line 80 | Request/response interceptors | Transport plumbing. |
| `M/utils/apiClient.ts:39`, line 57, line 111 | `axios.CanceledError` | Cancellation handling; not a network request. |
| `M/utils/apiClient.ts:99`, line 118 | `apiClient(originalRequest)` | Replays the original request after auth handling. |
| `M/config/api.ts:32` | Injected `fetchImpl: … fetch(input, …)` | Fetch adapter passed to shared-core `createChemistTaskerApi`; endpoint ownership remains shared-core. |
| `P/marketplace.tsx:107` | `fetch(uri).blob()` | Selected-image URI read; upload uses `marketplace.uploadImage`. |
| `P/finance.tsx:214` | `fetch(asset.uri).blob()` | Selected receipt asset read; upload uses `finance.uploadReceipt`. |
| `P/ethicalMarketplace.tsx:67` | `fetch(asset.uri).blob()` | Selected CSV asset read; upload uses `ethicalMarketplace.uploadImport`. |
| `P/ethicalMarketplace.tsx:84` | `fetch(a.uri).blob()` | Selected document asset read; upload uses `uploadTransferDocument`. |
| `R/shared/hub/PostComposer.tsx:193` | `fetch(uri)` | Composer asset read; not evidence of a copied backend endpoint. |
| `R/shared/messages/useLiveMessages.ts:3`, line 29 | Imports/calls `fetchWsTicket` | Indirect caller of direct request at `M/utils/apiClient.ts:140`. |
| `R/pharmacist/messages/[id].tsx:8` | Imports `fetchWsTicket` | Legacy implementation; routed persona message files re-export `R/shared/messages/[id].tsx`. |
| `R/owner/dashboard.tsx:10` | `apiClient` import | No `apiClient` invocation found in this file. |
| `R/organization/dashboard.tsx:9` | `apiClient` import | No invocation found. |
| `R/owner/profile.tsx:12` | `apiClient` import | No invocation found. |
| `R/organization/profile.tsx:25` | `apiClient` import | No invocation found. |
| `R/shared/shifts/ActiveShiftsPage/hooks/useShareShift.ts:5` | `apiClient` import | Unused for the inspected share flow; actual calls are shared `generateShiftShareLinkService` and `createShiftPillReferralService`. |
| `M/context/AuthContext.tsx:304` | `'login-axios-error'` diagnostic text | String match; request executes in native identity transport. |
| `M/package.json:31` | Axios dependency | Dependency declaration, not an API call. |
| `M/scripts/prepare-native-share-acceptance.rb:7` | `ARGV.fetch(0)` | Ruby argument access; not JavaScript/browser fetch. |

The `chemistTaskerApi.marketplace` and `.ethicalMarketplace` aliases in parity screens are shared-core facades, not direct copied endpoint implementations (`P/marketplace.tsx:15`, `P/ethicalMarketplace.tsx:13`, `M/config/api.ts:30`).

## Stale backlog rows

Compared against `docs/architecture/FRONTEND_PARITY_AND_REFACTOR_BACKLOG.md`.

| Backlog row | Current evidence | Correction |
|---|---|---|
| Line 35: web Learning Materials is a title-only placeholder | `D/LearningMaterialsPage.tsx:211`, line 245, line 340, line 368 | **Stale.** Web has resource loading, pagination, search/type filtering, retry and empty states. |
| Line 50: expanded mobile finance exists but persona InvoiceList does not open it | `R/shared/invoices/InvoiceList.tsx:48` wraps `FinanceWorkspace`; recipient mode at line 50 | **Stale.** Persona invoice routes reach the expanded workspace. Retain narrower L7/L8 findings. |
| Line 51: pharmacist learning “Built” | `R/pharmacist/learning.tsx:20` | **Misleading.** Routed placeholder only; Other Staff reuses it. Mark logic parity missing/placeholder, not built learning. |
| Line 53: manager internal roster missing | `E/manager/roster/index.tsx:3`; `P/roster.tsx:125`, line 392, line 538 | **Stale.** Dedicated roster workflow exists. Replace with L4 action/operation differences. |
| Line 54: manager attendance approvals missing | `E/attendance/reviews/index.tsx:3`; `P/attendance.tsx:381` | **Stale.** Pending review, chronology and decisions exist. Track L6 corrections. |
| Line 55: manager timesheets/review/lock not surfaced | `E/workforce-timesheets.tsx:59`, line 139, line 206; `E/owner/_layout.tsx:32`; organization line 38; admin line 44 | **Stale.** List, approve, recalculate, lock and correction-period flow exist and are linked. Detailed review remains missing, L5. |
| Line 56: manager leave review web-only | `E/workforce/leave-requests.tsx:50`, line 84 | **Stale.** Manager status filtering and approve/reject workflow exists. Navigation integration still needs checking. |
| Line 57: workforce settings absent | `E/workforce-settings.tsx:47`, line 87, line 103; `P/workforce.tsx:647` | **Stale.** Payroll/hours/settings and separate engagement editors exist. Track integration gaps, L11. |
| Line 58: My Hours/My Leave navigation pending | `R/pharmacist/profile.tsx:119`; `R/otherstaff/profile.tsx:39`; `P/attendance.tsx:140` | **Partly stale.** My Leave is linked from worker Profiles; My Hours is linked through attendance. Consistent shell discoverability remains outstanding. |
| Line 52: owner/org/Explorer learning missing | No corresponding mobile routes; web routes `W/main.tsx:293`, line 459, line 589 | **Still accurate.** |
| Line 36: workforce sidebar discoverability pending | `W/navigation.tsx:230`, line 231, line 347`; direct leave routes remain in `W/main.tsx:209` | **Partly accurate.** Timesheets/settings are in current persona nav; do not describe all workforce tools as undiscoverable. |
| Line 43: mobile shift browsing/Shift Centre “Built” | Shared worker/poster implementations exist, but `R/explorer/shifts.tsx:3` is a placeholder | **Needs qualification by persona.** Explorer browsing is not built; owner/org public/community route parity also remains absent. |

The refactor-hotspot lists were not treated as product-parity claims. No code-size or maintainability reassessment was performed.

## Summary for the orchestrator

- Static route/nav matrix covers all six personas and shared Vite routes; no files changed.
- Confirmed drift includes dashboards, organization claims, roster actions/acknowledgement, timesheet detail, attendance timezone, finance dispatch/revisions, chat history and capability navigation.
- Explorer shifts and worker learning remain placeholders; owner/org/Explorer learning and chain management are absent.
- Manager roster, attendance approvals, timesheets, leave review, settings and expanded finance already exist; backlog claims are stale.
- Direct backend calls remain in identity/session, WebSocket-ticket and app-config adapters.
- `unverified` rows require fuller branch review; no runtime parity or visual acceptance is claimed.

## Notes for the next agent

- Changed: Nothing; this reply is the proposed `docs/mobile/PARITY_MATRIX.md` content.
- Decided: Native dialogs/subroutes count as counterparts when they perform the web job.
- Decided: Shared-core facade calls and local asset `fetch` reads are distinguished from copied backend requests.
- Left: Resolve L1–L17 before visual waves; retain all working positive controls and mobile-only workflows.
- Left: Complete handler/state comparison for rows marked unverified, then run authorized targeted verification.
- Trap: `InvoiceList` already wraps `FinanceWorkspace`; do not rebuild that integration.
- Trap: Routed message screens use the shared implementation; legacy pharmacist message code is not the routed source.
- Trap: Builds, tests, installs and device/browser checks were intentionally not run; static findings still need runtime proof.