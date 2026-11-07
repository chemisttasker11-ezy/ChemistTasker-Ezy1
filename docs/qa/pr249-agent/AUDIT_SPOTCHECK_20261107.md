# AUDIT_SPOTCHECK_20261107

Saved 2026-11-07. This is the full report from the preceding read-only spot-check, now saved at the newly authorised scratch destination. No product code or git state was changed.

Audit branch: `origin/agent/pr249-audits` = `42b461abd9da7d4e8b37d95069f67bae442eae39`.
Original source: `97c4543e051b43fe30ec7e2e61ad3d69957a918e`.
Integration source: `2a83a90ea958a6b5b746acf36eaa74346613948f`, `local/pr249-int`.

Method: `git show` of the original cited files/ranges; `git show/diff/blame` on integration; route/caller tracing; independent `rg` of every tracked file plus a hidden/no-ignore working-tree sweep. The actual CI log and its pinned runner inventory were retrieved through the connected GitHub tool. No subagents, builds, tests, database operations or CI reruns were used.

CONFIRMED means supported source behavior at both commits, not runtime acceptance. WRONG includes fictitious routes and a MATCH that omits a concrete web action/field/rule. The audits explicitly limit MATCH to selected API wiring: the functional-parity corrections below do not dispute those narrower wiring observations. STALE-ON-INT means the baseline observation is supported but the exact gap/record no longer applies on integration. Uncovered scope is not automatically a defect.

| Job | Confirmed | Wrong | Stale-on-int | Missed |
|---|---:|---:|---:|---:|
| J1 | 7 | 3 | 0 | 1 |
| J2 | 17 | 0 | 0 | 1 |
| J3 | 13 | 4 | 0 | 5 |
| J4 | 9 | 4 | 2 | 5 |
| J5 | 482 | 1 | 18 | 30 |
| J6 | 15 | 0 | 0 | 1 |
| J7 | 6 | 0 | 1 | 0 |
| J8 | 0 | 0 | 12 | 5 |

Counting units: J1-J4 original ledger rows; J5 its 500 assertion records plus the completeness claim; J6 its 15 caller/policy rows; J7 six log-evidence rows plus the build-gap finding; J8 its 12 create-call rows. A missed issue can expose an incorrect MATCH in an existing row. J1/J2 share one permission omission. J8's extra graph areas include four additions after baseline; they are not five live bugs. Counts must not be summed as unique product vulnerabilities.

## J1 — W4 pharmacy, chain, people, memberships, calendar, roster

Original rows, in order:

| Row | Verdict | Evidence/status |
|---|---|---|
| 1 chain | CONFIRMED | Web `ChainPage.tsx:77,120,166-169,185,215-216`; native `ChainScreen.tsx:67,76,141-142,158,170-171` implement the cited reads, CRUD and pharmacy attachment/removal at baseline. Same operations remain on integration. |
| 2 owner pharmacies | CONFIRMED, limited wiring | Native owner index re-export and `roles/shared/pharmacies/PharmacyForm.tsx` exist. Web `PharmacyPage.tsx:51` is an import, not a full mutation/field proof. |
| 3 organisation pharmacies/claims | CONFIRMED, limited wiring | Native organisation pharmacy index `:4,25,35`, claims `:5,57,87,126` perform scoped reads/claim and deny unauthorised claim UI. Web `PharmacyPage.tsx:1264` starts claim loading. Complete server claim outcomes were not established. |
| 4 staff manager | WRONG route; operations CONFIRMED | The purported `/pharmacy/:id/staff` web route does not exist. Web/native `StaffManager.tsx:333,492` / `:493,525` support link/removal operations. |
| 5 locum manager | WRONG route; operations CONFIRMED | The purported `/pharmacy/:id/locums` web route does not exist. Web `LocumManager.tsx:421,442`; native `:405,439` support removal/link generation. |
| 6 memberships/admin invitations | CONFIRMED | Web `ManageMembershipsPage.tsx:21-28`; native `ManageMembershipsScreen.tsx:5-11,86-92` use the membership/admin invitation operations. |
| 7 organisation invitations | CONFIRMED | Web `InviteStaffPage.tsx:450,530,569`; native `roles/organization/invite.tsx:141-159,317,384,406` implement the cited mutations and manageable-member checks. |
| 8 calendar | CONFIRMED wiring | Web `PharmacyCalendarPage.tsx:46-57,131-155`; native calendar `index.tsx:38-49,144-155` use the same calendar/work-note/membership API family. Correct admin prefix includes `:pharmacyId`. |
| 9 manager roster | WRONG as permission parity | The quoted native AND condition is present, but is stricter than the roster authority. The cited API wiring remains present. |
| 10 worker roster | CONFIRMED surface/wiring | Web `RosterWorkerPage.tsx:31-43`; native `app/my-roster.tsx` and `app/attendance/published-roster.tsx` provide corresponding workflows. Not a complete cover/swap acceptance matrix. |

Correct web staff/locum navigation, at both commits: `frontend_web/src/pages/dashboard/sidebar/PharmacyPage.tsx:1188-1234` reads `view=detail` and `pharmacyId`; `owner/OwnerPharmacyDetailPage.tsx:100-107` reads/writes `tab`, and `:197/:209` mounts StaffManager/LocumManager. Use manage-pharmacies/my-pharmacies plus view/pharmacyId/tab parameters. The actual admin prefix is `/dashboard/admin/:pharmacyId` (`frontend_web/src/main.tsx:318`).

MATCH spot-checks:

- Chain CRUD, contact email/logo and add/remove pharmacy exist in both implementations. No missing native chain-create finding.
- Staff bulk invites were also checked: web StaffManager `:360-441`, native `:364-441`. They are not limited to invitation links.
- Roster unpublish/republish/edit are in `frontend_mobile/features/parity/roster.tsx:226,246,527` at baseline and `:227,247,528` on integration. Their absence from `rosterLegacy.tsx` is not evidence of missing features.

Missed live rule: native `frontend_mobile/app/admin/_layout.tsx:135-136` at baseline, `:136-137` on integration, hides Attendance approvals and Roster unless both canManageStaff and canManageRoster are true. Backend `backend/workforce/permissions.py:37-48` and `backend/workforce/roster/permissions.py:5-10` require roster authority, not both grants. The web generic attendance route requires only MANAGE_ROSTER (`main.tsx:190`). A roster-only delegated admin loses mobile entry points. This is also J2's missed positive-control case.

Uncovered W4 scope:

- `/dashboard/{pharmacist,otherstaff,explorer}/availability` (`main.tsx:499,545,589`).
- Worker `/memberships` aliases (`:500,:546`) beyond the generic invitation entry.
- Admin pharmacy list/manage aliases (`:328-329`).
- Worker/explorer calendars (`:515,:560,:593`).
- Organisation roster alias (`:265`), owner pharmacy setup (`:378`), pharmacy admin/settings/owner-claim detail tabs.
- Complete pharmacy form file/verification/rate fields, admin assignment CRUD, worker cover/swap matrix and calendar work-note decisions. Imports establish presence, not those acceptance outcomes.

## J2 — W5 attendance, employment, workforce, payroll

All 17 rows are CONFIRMED at the stated limited wiring/companion/GAP level. The two reported gaps remain on integration.

G1 — broad manager classification:

- Baseline `frontend_mobile/features/parity/attendance.tsx:36-40` accepts any nonempty admin_assignments; `:71` calls getManagerPending for the selected pharmacy.
- Integration retains `:36-40`, uses it at `:86`, and calls getManagerPending at `:128`. Timeline at `:170` is another sibling requiring the same capability rule.
- Backend is GUARDED: `backend/attendance/views.py:87-89` calls is_authorized_attendance_manager for the target pharmacy; `workforce/roster/permissions.py:5-10` delegates to roster authority. No server data exposure was proved.
- Fix all home links, pending/detail/timeline, decision and correction entry points; changing only the list condition leaves siblings inconsistent. Retain canManageKioskDevices for kiosk-only actions.

G2 — correction timestamp interpretation:

- Baseline native `attendance.tsx:411` initializes zone-less input from UTC; `:421,:425` use `new Date(timestamp).toISOString()`.
- Integration still does this at `:534,:538`.
- Web `ManagerAttendanceReviewPage.tsx:114,244-250,559-562` uses pharmacy_timezone, original event instant and `correctionTimestamp.ts:8-20`.
- A Perth pharmacy's `2026-07-10T09:00` entered on a Brisbane device becomes `2026-07-09T23:00Z`, rather than `2026-07-10T01:00Z`. The UTC-derived default is another instance of the same error.
- Use a shared pharmacy-local conversion contract, preserving unchanged original instants and web DST behavior. Generic missing-punch requests must follow the local-time contract already used by TimesheetDetailScreen.

MATCH spot-checks:

- Worker clock/break actions and opposite-action confirmation payload are real at baseline `attendance.tsx:234-259`; camera is not a placeholder. Shared attendance API `:19-48` supports them.
- Native PIN `attendance-pin.tsx:23-35` and web WorkerAttendancePage `:121-159` use backend pharmacy choices/update; native validates matching numeric 4-6 digit PINs.
- Period lock/recalculate already exist at baseline `app/workforce-timesheets.tsx:227,260`, retained at integration `:319,420`. The ledger's sparse citations must not become a fabricated missing-period-action task.
- TimesheetDetailScreen `:114-135,205-247` exposes source correction/check/comment operations, filters manager-private comments, and blocks source-check waiver. Employment preview/create/update and historical-field locking are implemented in the cited workforce module.
- Kiosk device management uses canManageKioskDevices; payroll configuration, leave, own hours and engagement APIs cited by the ledger are present. Their entire authorization/transition matrices were not executed.

Missed: J1's roster-only admin entry denial, the positive counterpart of G1.

Uncovered W5 routes: generic `/dashboard/attendance` (`main.tsx:180`), owner attendance (`:436`), owner/org/admin review aliases (`:266,:269,:331,:432,:435`). Inline engagement/coverage/payroll/kiosk rows do not fully compare all fields/transitions. The web kiosk terminal and native pairing companion are intentionally different jobs; no second full native terminal is implied.

## J3 — W6/W7 finance, people, communications, marketplace

Rows 1,2,4,7 are WRONG as full feature MATCHes; the API calls cited are present. Other 13 rows remain CONFIRMED at their explicitly limited level.

Original G1 remains CONFIRMED: native `roles/shared/invoices/InvoiceDetail.tsx:120-145` catches any managed lookup failure, invokes getInvoiceDetail at `:129` and can display a different legacy editor. This is unchanged apart from branding on integration. Restrict fallback to explicit 404; preserve 401/403/network errors as errors.

Missed sibling: web has the SAME catch-all fallback in `frontend_web/src/pages/dashboard/sidebar/InvoiceDetailPage.tsx:157-171`. The audit compared a different FinanceWorkspace revision flow and proposed a native-only change. This is a cross-client correctness problem, not proof of a mobile/web behavioral difference or a backend authorization bypass.

False MATCH details, present at both commits:

1. Customers: web FinanceWorkspace `:277` displays checked entity name and ABN status. Native `features/parity/finance.tsx:144` displays only check date; neither native finance copy renders abn_result. A lookup call without its result does not complete the verification job. The purported `/dashboard/workforce/finance` route is also undeclared: live finance is under persona invoice routes (`main.tsx:274,336,441,502,548`).
2. Expenses: web FinanceWorkspace `:184-185,300` exports CSV; both native copies omit it.
4. Invoice lists: web FinanceWorkspace `:181-183,232` exports filtered issued invoices as CSV; native PDF sharing does not perform that action.
7. Worksheet: web FinanceWorkspace `:336` downloads DRAFT-labelled CSV; both native copies omit it. Native parity worksheet `:283-292` also omits excluded-legacy/evidence count presentation. Full native workspace displays excluded legacy count at `:250`.

MATCH spot-checks:

- Pills: web PillsPage `:16,75,91,109` and native PillsScreen `:7,76-78` share balance/history/referrals operations.
- Protected attachments: native messages/[id] baseline `:731-759` validates canonical protected route and invokes authenticated downloadChatAttachment, matching web MessageBubble `:107-114`. No unauthenticated OS-open replacement was found.
- Chat older-message history and notification read-state use shared contracts. They are wiring checks, not membership revocation, push-delivery or 500-message execution evidence.
- Ordinary marketplace catalogue genuinely calls listListings (`landing_next/app/(public)/marketplace/marketplace-catalogue.tsx:25`); ethical wrappers mount EthicalWorkspaceV2. Wrapper existence does not certify transfer/S8 flows.
- Native ratings/report API wiring exists in `features/parity/trustRewards.tsx:4,15,55`. Web MyHistoryShiftsPage `:36-56` supports summary/existing-rating lookup; its actual createRatingService invocation is `:71`, outside the cited range.

Missed: ABN result fields, expense CSV, issued-invoice CSV, worksheet CSV and web legacy fallback sibling (five).

Uncovered W6/W7:

- Persona onboarding/profile/payment/verification and organisation/owner profile fields (`main.tsx:362-402,424,484,531,577`); a ratings row is not a profile audit.
- Explicit invoice/new and invoice/:id aliases, especially admin/:pharmacyId, have no independent caller/permission rows.
- Next marketplace mine/exchanges/items/:id/:slug/new and ethical access/listings/listings/new/transfers have no separate state/permission rows.
- Full hub member/group/moderation actions, chat participant administration, rating-history pagination, notification settings and profile field parity remain unverified.

## J4 — W8 public content, hubs, public talent, learning

Original row dispositions:

| Row | Verdict |
|---|---|
| 1 blog/news feeds | WRONG: topic filters omitted |
| 2 article detail | CONFIRMED |
| 3 root discussion | CONFIRMED within explicit root-page limit |
| 4 nested replies | STALE-ON-INT |
| 5 hub directory | CONFIRMED |
| 6 hub feed | WRONG: group search and poll pagination omitted |
| 7 post detail | CONFIRMED within stated limited comparison |
| 8 comment pagination | STALE-ON-INT |
| 9 public organisation | CONFIRMED |
| 10 public talent | WRONG: discovery filters omitted |
| 11 authenticated pitch presence | CONFIRMED; separate create-key concern stale under J8 |
| 12 learning | WRONG as complete role-guidance parity |
| 13 legal links | CONFIRMED navigation intent |
| 14 calculator | CONFIRMED intended browser handoff |
| 15 contact | CONFIRMED operation; weak web citation |

G1 replies: CONFIRMED at baseline. Next discussion `:48-50,61,69` loads parent-specific replies; original native ArticleDetail `:45-52,100-113,174-182` only requests/pages roots. STALE-ON-INT by `e454e82b`: native ArticleDetail now has parent/page fetches at `:205,:231`, thread controls at `:399-417`, paging/retry/reactions and discussionModel scope handling. Source fix, not device sign-off.

G2 hub comments: CONFIRMED at baseline: native post detail `:38-49` ignored next while web community-client `:117-120,127-138` paged comments. STALE-ON-INT by `e454e82b`: current post/[id] `:124-135` requests/merges page 2+, with scope and retry handling. Do not reassign these old gaps unchanged.

False MATCH spot-checks:

- Web blog/news topic controls: Next components/listing `:10-12,30`. Native ArticleFeed `:36-37,55,80` derives kind/topic from section and only adds q/page; there is no selectable topic.
- Hub search: web community-client `:46,79` sends q; native hubs/[hub] `:53,77,133-168` only pages posts and has no search UI.
- Poll pages: web community-client `:48,109` has pollPage/Paging; native `:54,:60,:126,:147-153` drops pollResult.next.
- Public talent: web PublicTalentBoardPage `:47,73,115` loads feed/reference selection and mounts filtered public TalentBoard. Native explore/talent-board `:48,68,83-95` is cards/pagination without search, role/state/skill/work-type/availability filters. Anonymous discovery is materially reduced.
- Learning: the actual signed-in re-export is app/owner/learning -> roles/pharmacist/learning, not just ArticleFeed. That screen DOES have search/kind/pathway UI. However native learning `:108-109` indexes rolePath by account user.role. Its map has INTERN/STUDENT/TECHNICIAN/ASSISTANT but no OTHER_STAFF. Web LearningMaterialsPage `:227-233,279` and Next learning/page `:65-70` obtain marketplace.getListingOptions().role_code. Ali's OTHER_STAFF account loses the technician pathway on native.
- Public organisation lookup/about and organisation-filtered job-board navigation match: native organization/[slug] integration `:27,48-53`, web PublicOrganizationPage `:41,101,165-187`.
- LandingPage `:1` does not prove the /contact handler. Cite Next /contact and its Contact/public form implementation; native contactSupport/source=mobile is present.

Missed: topic filters, group search, poll pagination, public talent filters and OTHER_STAFF subtype pathway (five).

Uncovered W8 routes: pricing, organisation pricing; `/content` and `/content/invite/:token` including currentUser areas visibility/browser sign-in disclosure; community/sign-in return-to; invitation/external-destination acceptance. The native dev-only calculator/golden engine validation is outside the external-handoff row. Email-only referee links intentionally stay web under the W8 plan.

## J5 — source-text test inventory

All 500 cited baseline file/line records exist and contain the asserted source-presence forms. The table really spans 52 files, with 89 .test.cjs/.test.mjs mobile files at the baseline. Source operands were distinguished from transpile-and-execute tests.

WRONG completeness claim: at least 30 additional source assertion sites across eight files were omitted, including three whole test files absent from the inventory. Corrected baseline lower bound: **530 sites in 55 files**.

Missed baseline checks (all under frontend_mobile):

- features/parity/marketplaceReviewAccountRace.test.mjs:7-9,12-14 — six.
- features/parity/marketplaceReviewSubmission.test.mjs:7-9,12-14,17-19 — nine.
- roles/shared/dashboard/workerFallback.test.mjs:10 — one, source slice.
- roles/shared/shifts/shiftSurface.test.mjs:236,238-239 — three, source-derived matched call strings.
- roles/shared/shifts/workerShiftPermissions.test.mjs:9,11-12 — three, loop-bound source alias.
- scripts/mobile-settings.test.cjs:13 — one.
- scripts/next-shifts-access.test.cjs:7 — one.
- scripts/notification-push-preferences.test.cjs:3-8 — six.

Separately shiftSurface.test.mjs:235 asserts a source-match count with assert.ok, outside the report's narrower match/includes predicate family; it also merits replacement.

Integration: 482 original exact assertion lines still appear in their respective files; 18 exact records changed/removed in `e454e82b` and are STALE-ON-INT:

- notificationsInboxPaging.test.mjs:9,13,14.
- legacyInvoiceListParity.test.mjs:32.
- public-articles.test.cjs:33.
- public-worker-qr.test.cjs:27.
- timesheet-workspace-scope.test.cjs:9,10,19.
- w8-account-scope.test.cjs:10,14.
- workforce-scope-safety.test.cjs:14-16.
- utils/appLock.test.mjs:23-26.

These are stale inventory records, NOT eighteen fixed product bugs. Some became rewritten source checks; AppLock records were replaced by behavioral execution. Integration has 119 .test.cjs/.test.mjs mobile files, so baseline inventory is not its current suite inventory.

The zero literal external absolute-path-prefix result was independently confirmed across all 89 baseline and 119 integration files for the named patterns. Computed paths and fixture provenance remain outside that claim.

The 113 RT rows are proposed replacements, not implemented/executed tests. Their text is not PASS evidence. Scope omitted: thirty listed sites, broader source-derived assertions, integration additions, backend/shared-core/web test quality and runtime adequacy. No tests were modified, weakened or run.

## J6 — Explorer History/Confirmed 403

All fifteen caller/policy rows are CONFIRMED; the mismatch remains on integration.

- `backend/shifts/my_shifts.py:11,16` MyConfirmedShiftsViewSet; `:41,46` MyHistoryShiftsViewSet. Both permission_classes use IsPharmacistOrOtherStaff.
- `backend/shifts/access.py:67-73` accepts PHARMACIST/OTHER_STAFF only; registrations are `shifts/urls.py:52-53`.
- Their assigned-user filters are my_shifts `:23-27,53-56`; manager History is a different view/route (`lifecycle.py:170-191`, urls `:43`).
- Shared-core `domains/shifts/api.ts:51-53,314-315` is personal history; `:45-46,308-309` is manager history. Do not substitute the manager endpoint for Explorer.
- Web `main.tsx:584-585`, PublicShiftsPage `:690-691`, StaffShiftCentreTabs `:16-30`, MyHistoryShiftsPage `:41-50` expose/invoke forbidden personal APIs.
- Native shiftSurface `:16-18,135-144`, ShiftsScreen `:32-57`, WorkerHistoryShiftsView original `:68-84`, WorkerConfirmedShiftsView `:17-37` route Explorer into worker APIs. Manager HistoryShiftsView remains separate.
- Web navigation `:505-530` lists only Public and Community for Explorer. Listing contract test `:160-169,227-244` documents endpoint/role groups, but is not by itself an Explorer-specific 403 assertion.

Correct policy: HIDE/redirect worker Confirmed and History for Explorer; do not grant backend access.

Native shiftSurface `:143` must return public/community; retain pickShiftSection `:148-150` and verify stale section requests cannot mount worker panels. Web must filter BOTH mounts of StaffShiftCentreTabs: PublicShiftsPage `:691` and CommunityShiftsPage `:506`. The latter is J6's missed sibling. Redirect/remove Explorer direct routes `main.tsx:584-585`; keep pharmacist/other-staff routes.

Both web products were searched. Next migrated contains public-board copies but no independently implemented Explorer history router or StaffShiftCentreTabs. Do not invent migrated/main.tsx or a migrated StaffShiftCentreTabs patch. Test both web board entries and Next-to-dashboard handoffs; every actual shared/copy control must follow the Explorer policy.

Positive controls: pharmacist/other staff retain personal upcoming/history; owner/org/delegated managers retain separate manager history within pharmacy scope; Explorer keeps public/community browsing. Backend Explorer 403 tests protect existing behavior and should already pass; client regressions should fail on base.

Uncovered: native aliases, notification/dashboard shortcuts and live role fixtures. Tests must cover both stale sections, both web mounts and direct URLs. Backend permission changes are not M4 work.

## J7 — iOS native acceptance

Six log rows CONFIRMED against actual job log: run 41947345249/job 126982719455, tested source 97c4543e. Failing step is prebuild/compile, not merely UI after a successful compile.

- Log 48091/48093: Xcode_16.4 / 1640.
- 48104/48106: ExpoModulesJSI, source-built RN/static frameworks, simulator framework slice.
- 48108-48109: package apple needs Swift tools 6.2.0; installed version is 6.1.0.
- 49495/50900: BUILD FAILED / exit 65.
- The architecture workflow calls reusable native_mobile_acceptance.yml. Android fails separately at a different stage.

Baseline workflow `:516-519` uses macos-15 without Xcode selection; `:754-790` prebuilds/compiles on that default. The exact logged image inventory includes Xcode 16.4 as default AND `/Applications/Xcode_26.2.app`; no runner-label change is needed for that image.

Exact change: before native share runner and app prebuild/compile, `sudo xcode-select -s /Applications/Xcode_26.2.app/Contents/Developer`, export DEVELOPER_DIR, persist through GITHUB_ENV, and fail fast unless xcodebuild reports 26.2 and swift --version reports 6.2. Retain all native compile/acceptance assertions.

STALE-ON-INT by `e454e82b`: the exact step already exists at workflow `:726-750`, before share runner `:770` and prebuild/compile `:780`. Do not duplicate it in M4. No successful rerun on integration was observed; iOS acceptance remains unproven.

Sources: https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/actions/runs/41947345249/job/126982719455 and https://github.com/actions/runner-images/blob/macos-15-arm64/20261028.0489/images/macos/macos-15-arm64-Readme.md .

Uncovered: new successful build, downstream Maestro/system-share acceptance, later image changes. iOS store/native acceptance policy remains owner O3, outside M4.

## J8 — independent pitch-create sweep

All twelve baseline call-site observations are supported and STALE-ON-INT:

- Shared create boundary `shared-core/src/domains/talent/api.ts:65-67`: `fbd9ed43` adds the key/header contract at integration `:65-69`.
- Four Vite/Next migrated create branches (baseline src index `:707,:731`; migrated `:761,:785`) route through persisted pending key handling after `fbd9ed43` and client follow-ups.
- Native baseline talent-board/index `:580`: `38b20b1b`, with `b46f4052/a37389d9/6809707c` follow-ups, implements keyed create/retry.
- Four test_explorer_api POSTs (baseline `:131,:138,:147,:153`), newcomer helper (`test_newcomer_rules.py:66-67`) and onboarding re-post (`test_verification_transitions.py:337`) receive UUID headers in `fbd9ed43`. Role-negative outcomes are retained.

Executed sweep: `rg -n --hidden --no-ignore -e 'explorer-posts|explorerPosts|createExplorerPost|ExplorerPostViewSet|sendPendingPitch|submitPendingPitch' -- <all git ls-files paths>` in batches only for Windows argument limits. Searched all 3,864 tracked files; followed 93 matching lines. Also searched hidden/no-ignore working tree excluding dependencies/generated native/build/git directories, and corroborated baseline sites with git grep at 97c4543e.

No additional unkeyed successful production collection-create caller was found on integration.

Five extra graph areas:

1. Shared pendingPitch.ts `:100-110` invokes createExplorerPost(intent.exactPayload,intent.key,signal); its test `:59` directly sends a keyed boundary request. Added after baseline.
2. Native roles/shared/talent-board/pendingPitch.ts `:21-23` and index `:766,:817` implement create/retry. Added after baseline.
3. Next `landing_next/lib/platform-proxy.ts:13` forwards idempotency-key; platform-proxy.test.mjs `:16-30` exercises it. The proxy existed at baseline and dropped this header: a missed necessary remediation hop, fixed by `fbd9ed43`.
4. Backend test_public_slot_contract `:138-139,162-163,174-175` has three PUBLIC_URL POST sites with UUID headers; new after baseline, finalized in `00d09f1d`.
5. Backend test_pitch_idempotency `:33-37` is a generic HTTP helper. Its `:48-51` deliberately omits/invalidates keys to assert 400. Necessary negative controls, not accidental unkeyed calls; added after baseline.

Six web sendPendingPitch sites: src index `:790,855,884`, migrated index `:844,909,938` (retry plus two create branches each). The sole production createExplorerPost invocation is the keyed shared pendingPitch `:110`. api.ts keeps an optional argument, so signature alone is not proof about unknown external consumers; no remaining repository caller omits the key. Backend requires UUID in `talent/views/explorer.py:129-132`.

Definitions/exports, GET feeds, per-post view/like/unlike POSTs and objects.create fixtures were correctly excluded. No additional seed/management/E2E collection POST was found. No current unkeyed-pitch M4 product gap remains.

## M4 candidates

Ranked live gaps on 2a83a90e. Proposed tests below execute production components/helpers and observe calls/results; they were NOT written/run in the spot-check. Another agent must prove red before implementation; preserve allowed-user positive controls.

1. **Attendance corrections use device timezone.** Files: native features/parity/attendance.tsx:534,538; web pages/attendance/correctionTimestamp.ts:8. Mount real form with Brisbane device, Perth pharmacy, original event context; enter 2026-07-10T09:00 and expect 2026-07-10T01:00Z (current sends previous-day 23:00Z). Cover unchanged instant, DST gap/overlap and generic worker missing-punch local contract.
2. **Managed invoice failure opens legacy source.** Files: native roles/shared/invoices/InvoiceDetail.tsx:125-129; web sidebar/InvoiceDetailPage.tsx:157-171. Managed lookup rejects 403/network error while legacy lookup for same number succeeds: assert no legacy call/editor and visible error on both real routes. Controls: 404 still falls back, managed success redirects. No unproved server auth-bypass claim.
3. **Attendance/roster capability false denials and forbidden calls.** Files: native app/admin/_layout.tsx:136-137 and parity/attendance.tsx:38-40,86,128,170; backend roster/permissions.py:5. Roster-only admin at A sees approvals/roster; selected B without grant causes no pending/timeline/decision/correction call. Include owners, scoped org/region admin, worker/foreign-pharmacy negatives and kiosk-specific rules.
4. **Explorer History/Confirmed 403.** Files: native shiftSurface.ts:143; web StaffShiftCentreTabs.tsx:16, PublicShiftsPage.tsx:691, CommunityShiftsPage.tsx:506, main.tsx:584-585. Mount Explorer pages and stale direct links: only public/community, no personal worker fetch. Workers/managers retain existing paths; backend Explorer denial stays.
5. **Public talent filters missing.** Files: native app/explore/talent-board.tsx:48,68,83-95; web PublicTalentBoardPage.tsx:47,73,115 and TalentBoard filter controls. Mixed role/state/skill/availability records across pages; apply equivalent public filters, reach page-two match, clear correctly, expose no private mutation/contact anonymously. Current screen has no filter controls.
6. **Hub polls truncate.** Files: native hubs/[hub].tsx:54,60,126,147-153; web community-client.tsx:48,109. Page one next+A, load page two B, preserve A/B and retry without losing A; maintain closed/ineligible voting rules. Current screen discards next.
7. **Hub search absent.** Files: native hubs/[hub].tsx:53,77,133-168; web community-client.tsx:46,79. Submit q, assert page-one q request, q retained on page two, clear resets pagination, stale old responses ignored; anonymous read/write policy unchanged. Current screen lacks search and q.
8. **ABN result fields omitted.** Files: native parity/finance.tsx:128-144, invoices/FinanceWorkspace.tsx:247; web FinanceWorkspace.tsx:277. Real lookup/save refresh returns entity_name/abn_status; assert displayed result including inactive/cancelled status on both customer entry surfaces (or one shared complete view). Preserve lookup-does-not-prove-ownership copy.
9. **Finance CSV exports absent.** Web FinanceWorkspace.tsx:181-185,232,300,336; both native finance copies. Exercise real issued-invoice/expense/DRAFT worksheet export controls and inspect file bytes, filters, escaping, draft label. PDF sharing is not CSV proof.
10. **Blog/news topic filters absent.** Native ArticleFeed.tsx:36-37,55,80 versus Next listing.tsx:10-12,30. Select topic, assert topic+q+page contract, page reset, retry and clear.
11. **OTHER_STAFF learning pathway absent.** Native learning.tsx:108-109 versus web LearningMaterialsPage.tsx:227-233,279. Account role OTHER_STAFF, options subtype TECHNICIAN/INTERN/ASSISTANT/STUDENT: correct pathway; owner/pharmacist/explorer controls retained.

Do not rebuild implemented article replies, hub-comment pagination, Xcode selection, chain create or keyed-pitch work. Source-test debt is not itself proof of a product defect. The job pack may group these ranked items into whole-area jobs, but must not manufacture red tests for already-correct behavior.

### Endpoint-trace addendum for the job pack

Further source tracing for the requested pack found three additional missed product gaps. These are additional to the ledger-record counts above, not extra assertions by the online agent. All remain on integration; no runtime reproduction was performed.

12. **Worker correction invokes a manager-only write (additional J2 miss).** Base native `features/parity/attendance.tsx:425`, integration `:538`, calls `workforce.addMissingPunch` and promises a worker request was recorded (`:426` / `:539`). In BOTH revisions `backend/workforce/attendance_edits.py:17-19` requires `require_manage_pharmacy`; integration `workforce/permissions.py:71-73,86-87` requires roster management. `TimesheetMissingPunchView` is `workforce/views.py:818-856`, URL `workforce/urls.py:56`. Ordinary workers receive 403 even for their own timesheet. Preserve this server policy. The already-existing worker-owned comment flow (`TimesheetCommentView:934-952`, `attendance_edits.py:127-139`) can record a clearly labelled correction request without claiming an attendance event was created. Mount the real worker route, submit a request for an owned timesheet, assert the comment request and no missing-punch call; foreign timesheet remains 403. This corrects candidate 1's phrase "generic worker missing-punch local contract": the local wall-clock contract belongs to MANAGER missing-punch entry, not worker authority.

13. **Same-account inbox refocus loses cached rows on fetch failure (additional J5 miss).** Base `NotificationsScreen.tsx:53-72,61`; integration `:54-73,62` clears rows on every focus although the comment describes account isolation. Mount, load rows, blur/refocus SAME user, reject refresh: expect previous rows plus retry error. Distinguish from account change, which must clear immediately. Base `:153-164` / integration `:154-165` also has no generation guard after an individual mark-read await: defer it, change account, resolve/reject, assert no new-account read receipt/error/event mutation. Server `notifications/views.py:27-42` remains user scoped; do not claim a server authorization bypass.

14. **Marketplace account switch during local image read can still initiate upload (additional J5 miss).** Base AND integration `features/parity/marketplace.tsx:245` check `current()` before `await (await fetch(uri)).blob()` and only after `api.uploadImage`. Defer the local read, change account, resolve: expect no upload/audience/submit/draft-clear/navigation from the old attempt. The current code calls upload before its next guard. Integration's public wrapper `:23-25` keys its subtree by account: an account switch unmounts ReviewStep, whose scope effect `:235` has no cleanup. Thus an old unmounted closure can retain a matching scopeRef even past its later checks. Test the REAL keyed wrapper/unmount and invalidate the captured attempt on cleanup, not merely an artificial same-instance context change. `backend/marketplace/views.py:231-258`, `services.py:11-18` still enforce listing ownership and trading eligibility. This is stale client work, not evidence of cross-account server data access. Test both fetch and blob await boundaries and positive same-account resume/double-tap controls.

Additional backlog gap, outside the eight agent ledgers: **overnight calendar preview** is wrong in BOTH revisions at `frontend_web/shared/postShift/useShiftTimetable.ts:64-65`: 22:00-06:00 produces same-date end before start. It is ONE shared hook used by the actual Vite PostShift wrapper (`src/pages/dashboard/sidebar/PostShiftPage.tsx:6,16`); there is no independent migrated PostShiftPage in either tracked tree. Verify actual host ownership rather than inventing a second file. Execute the production hook with dated recurring/manual slots and assert next-calendar-day end while retaining payload semantics. Additional string weekday cases at `backend/talent/test_public_slot_contract.py:87` are qualification coverage for the already-correct strict validator (`serializers/availability.py:22-26`), not a new product bug and not a legitimate red claim.

The additional product-miss counts are J2 +1 and J5 +2 (two areas; the two inbox transitions form one area). Thus expanded counts including pack tracing are J2 missed 2 and J5 missed 32; the ledger-record counts elsewhere deliberately retain the original audit accounting unit. New async defects rank behind attendance and invoice correctness but ahead of optional discovery filters for M4 scheduling. Public hub read endpoints are `/api/v1/public-hub/...` (canonical `core/api_v1_urls.py:17`, `public_hub/urls.py:11-15`), not the legacy embedded attachment URL `/api/hub/...`.
