# ChemistTasker Expo PR #249 — Senior implementation continuation

**Date:** 5 November 2026 (Australia/Brisbane)  
**Base:** PR #248 (`feat/mobile-merge-sdk`); **working PR:** #249 (`fix/pr248-expo-production-waves-20261104`)  
**Review/implementation checkpoint:** `dfb9cfd54d0e3c01a5990f975cccff4ea3660afd`  
**State:** draft, unmerged, undeployed, native release **not** accepted.

## Binding operating rules

- Match the web's *business actions, data, role permissions, states and outcomes*, using professional native layouts rather than compressed web pages.
- Keep `shared-core` as API/contract owner; backend is the final authority for permissions, financial transitions and shift booking.
- Preserve owner/organization/admin/pharmacist/other-staff/Explorer positive cases and separately scoped pharmacy data.
- Use existing `frontend_mobile/constants/tokens.ts`, Outfit/Inter and Lucide. No second theme or kit.
- No merge, deploy, live-provider action, EAS update or store distribution without owner approval.
- Owner explicitly requested **defer consolidated gate checks until the implementation pass is complete**. The source-level checks embedded in this wave are *not executed/accepted* in this connector-only review.

## Implementation commits in this continuation (all stacked on #249)

| SHA | Scope and protected invariant |
|---|---|
| `7bc28e23` | Finance detail checks modern received/issued invoices before legacy fallback; separate received-invoice policy with historical/approved/paid action safeguards and tests |
| `13ca5b4d` | Correct finance deep-link template interpolation |
| `61fa4bba` | Map dashboard web activity paths to real native jobs (pharmacies, chain, roster, timesheets, attendance) and keep admin shell; tests |
| `1cae9e79` | Worker 403 dashboard fallback to read-only Explorer response as web, preserving request-generation and error behaviour; tests |
| `fbc20a24` | Owner/organization Shift Centre includes Public/Community discovery alongside Active/Confirmed/History; no admin/worker-role mutation; policy tests |
| `28c52ec3` | Canonical finance tokens, review touch targets, retry rather than false empty states; tests |
| `aae6dc42` | Managed invoice deep-link waits through failed list loads/retries |
| `d9c6a2a1` | Wrap five shift sections to preserve label/touch readability |
| `61515242` | Workforce settings connects existing coverage, employment, kiosk and payroll-export jobs; branding and tests |
| `0695ed6f` | Generation-guard pharmacy-scoped payroll/staff settings, stale-response blocking and in-flight save switching protection; tests |
| `1c841cd5` | Active Shift Centre branded typography/cards, less elevation and amber financial attention cue; visual contract test |
| `0d3d8718` | Complete stat/action control token/low-elevation refinements |
| `388c1ae6` | Clarify QR worker-public-listing handoff makes a reusable, non-worker-targeted invite link; consent/approval disclosure test |
| `9c2ec4af` | Write source-grounded senior continuation handover and deferred release acceptance register |
| `dfb9cfd5` | Gate roster, kiosk and payroll shortcuts to selected-pharmacy capabilities; retain actual backend permissions and add regression contract |

Tests have been **authored but not executed** as instructed. All conclusions are source-level implementation only.

## Continuation after the QR scope freeze (5 Nov 2026)

Owner direction: **Leave the QR profile scanner as implemented.** No further scanner, QR identity, favourites-by-scan, or membership invite workflow changes in this continuation. These are deferred product opportunities, not work blocking unrelated Expo parity.

New staged commits:

| SHA | Implementation |
|---|---|
| `2e9d35d9` | Worker Basic Info parity: photo-management entry, mobile verification, legal-name/phone lock derived from verified status, DRF field error formatting, explicit retry state; pharmacist and other-staff source contracts |
| `bbf07508` | Post Shift template and pharmacy rate mutations ignore stale success/failure/finally callbacks after a pharmacy/role switch; confirm-time template delete scope check |
| `65380643` | Profile-initiated mobile verification returns to the worker Basic Info task after success; initial registration continues to use the original dashboard transition |

**Important limits:** Photo selection/upload uses the existing worker Profile screens, and OTP uses the existing `/mobile-verify` service; no parallel upload or verification state machine was created. Tests added to the repository have not undergone the deferred consolidated gate. Source review does not establish Android/iOS runtime behaviour, real permissions, backend provider delivery or release readiness.

**Next unclosed parity priorities (QR excluded):** full user-facing field and workflow comparison for Post Shift and worker onboarding, invoice revision and finance acceptance, subscription/checkout and roster freeze, notifications and marketplace, source-level navigation for all personas, then native visual/device acceptance and final exact-SHA gates. Maintain backend semantics and authorisation at every step.

## Continued W3–W8 parity fixes — second implementation pass

**Owner direction confirmed:** QR profile scanning and its present invitations are **frozen/unchanged**. No merge, deployment, native update, provider action or store submission has been authorized.

| Commit | Scope | Contract preserved |
|---|---|---|
| `917d8e1c` | Legacy invoice list: complete paginated fetch, recoverable network errors, managed `finance_record_id` deep links | Managed invoices continue through revision-aware finance; legacy edit/send/PDF remain available |
| `0be534a1` | Finance invoice defaults: pure merge and source tests protect manual GST-off, typed super rate and accepted-shift source | Server still validates tax and money values |
| `7cfb369e` | Finance preview errors: explicit unavailable/retry/loading totals | Saving remains server-authoritative, draft remains editable |
| `734966cb` | Post Shift saved-description lookup: failed versus absent state and retry without dropping draft | Template creation blocked while the current lookup is uncertain |
| `d708978a` | Native notification inbox: server 20-row pages, load-more, explicit error and confirmed read writes | Server remains source of truth for read receipts |
| `fc798a40` | Correct design-token reference in native inbox | No change to delivery semantics |
| `944c38b7` | Pharmacist/other-staff/Explorer verification-card recovery, loading and styling | Existing onboarding verification remains authoritative |
| `dda5ca20` | User/persona generation-scoped finance loading with data and drawer isolation | Discards old account data on a scope change |
| `1a3d518c` | Organization and delegated Admin Hub notification routes | Current admin pharmacy's communications capability is checked |
| `cf1b9a0d` | Inbox native typography, contrast, touch targets and design tokens | Presentation only |

### Findings and deliberate exclusions

- **Draft/publish Post Shift:** the existing **web** Post Shift also invokes `createOwnerShiftService` directly. A separate persisted shift draft/publish operation was not identified in that contract; avoid inventing one or falsely labelling a public shift as saved privately. The native Post Shift uses the same authorisation and posting payload, with web-like template/save behaviours.
- **Finance pagination:** shared-core `getInvoices` now accepts an optional positive page while preserving the unchanged no-argument web API. Legacy client fetches every server page; finance workspace already uses paginated finance-domain operations.
- **Notifications:** server `NotificationPagination` uses 20 rows per page; the native screen now requests subsequent pages and only updates local read state after `markNotificationsAsRead` confirms success.
- **QR:** do not implement worker-targeted invites, scan-to-add staff/favourites, QR persistence or QR scanner UI in this pass.
- **QA:** source-level implementation and regression test authoring only. **Tests are not claimed passing.** The owner requested consolidated gates only after implementation. CI may run automatically from pushes; its status is not release acceptance.

### Remaining non-QR source and operational work

- Reconcile all W3 Post Shift/Shift Centre/worker offer edge cases with web including server-side immutable terms snapshot, manager approvals, public holiday locality, recurring slots and concurrent checkout.
- Review finance revisions/received invoice conflicts and PDF delivery across five personas; native actual auth/scope and real staging payments remain unverified.
- Finish per-persona W4–W8 field/function matrix, including organization/admin navigation, permissions, marketplace, accessibility, communications and subscription availability.
- Verify authenticated staging, native SDK 58 Android/iOS signed builds and large text/device screenshots, Expo deep linking and stores, server-configured notification delivery/email/Stripe (only when separately authorised), startup/crash/OTA rollback.
- Then conduct exact-head full Senior Package Testing, fix any failures, review the entire diff independently, and obtain owner approval before merge/release.

## Continued native safety and marketplace wave — checkpoint 5 November 2026

**Working source SHA before this handover:** `c8685dd3f636c28f3baad670f2ef50e11996a860`. PR #249 remains draft, stacked on #248, unmerged and undeployed.

| Commit | Changes |
|---|---|
| `fb167a0a` | Delegated Admin membership notification routes honor current pharmacy's `MANAGE_STAFF`, with base-role fallback |
| `9af4216c` | Ordinary Marketplace review synchronous submit mutex; prevent repeated create/update/upload/submit |
| `e422ab73` | Notification inbox resets paginated rows, read cache, spinner and read alerts on account switch |
| `37e87264` | Marketplace review attempt-generation guard: refuse later server write stages or local draft deletion after account switch; do not let stale attempt release a newer one |
| `c8685dd3` | Public rich-content links surface an actionable error and retry instead of swallowing system open failure |

### Senior safety/preservation notes

- **QR scanner frozen:** no files in QR, public profile identity, scan-to-add, or QR invitation were changed. Leave the current behaviour until separately requested.
- **Marketplace policy frozen:** only the current authorized listing create/update and private draft / submit-for-review APIs are used; no additional permission, product-category, S8, medicines, pharmacy escalation or payment rules were implemented.
- **Marketplace synchronization:** the client stops additional network stages after a recognized account switch. An already-sent server request cannot be withdrawn by the UI; persistent server transactions and permission checks remain authoritative.
- **Notification scope:** old read-state is not carried into a different signed-in account. Current role-shell guards still apply to all routed detail pages.
- **Published Post Shift vs local draft:** these are different business concepts. Do not introduce new server-level draft status without the matching web and backend contract.
- **QA evidence:** new regression source tests authored for each wave. **Do not report them as passing** until executed on one frozen final head. CI might run automatically with new pushes, but its results must be evaluated against that exact SHA.

### Outstanding release blockers and continued work (QR excluded)

1. **Functional acceptance:** Post Shift/shift centre and offers, roster/publication, payroll locks, approved finance revisions, state-specific holiday rates, marketplace state transitions, push, chat, permission matrix and session switching across owner, organization, admin, pharmacist, other staff, Explorer.
2. **Mobile visual acceptance:** all six personas, small/large phones, Android/iOS, 1.6x font, keyboard, screen reader, slow/offline connection, error/recovery, native deep linking and back navigation.
3. **Provider/staging:** with owner authorization only, signed binary SDK 58 iOS/Android, actual configured SMTP/Expo Push/Stripe test-mode callbacks, payment replay and rollback.
4. **Consolidated exact-head Senior Package Testing and independent review** deferred at owner's instruction until source implementation is complete; preserve legitimate existing business logic.

**Status:** substantive source gaps closed in reviewable commits; full Expo parity and production readiness are **not yet proven**. No merge, deploy, store release, EAS update or live service action performed.

## Explicit scope decisions

1. **Multi-slot interest:** retain the mobile single batch `slot_ids` request for Apply All/Selected. The backend `backend/shifts/interest.py` validates the requested slot IDs before writing and the contract test in `backend/shifts/test_shift_actions_contract.py` proves two-slot creation and one manager notification. The web's per-slot `Promise.all` has different partial-failure behaviour; duplicating that is *not* a safe visual parity fix.
2. **QR membership:** `InviteFromWorkerQr` only creates an authorised **generic reusable 14-day membership invitation**. It does not bind the recipient to the scanned worker, grant favourites, bypass pharmacy approval, or create membership. QR bookmarks of public listings sync through the existing authenticated saved-professional-contacts API; sensitive invitation tokens remain in SecureStore.
3. **Financial safety:** invoice revision review is separate from legacy invoice editing; the backend must continue to validate authorization and `version` on approve/pay/revise. No finance or Stripe business rules were changed.

## OPEN: independent source and end-to-end verification

- **Finance**: managed/legacy invoice deep links across five recipient/issuer persona types; 401/403/404 and permission denial; revision list, approval/paid concurrency, server-version conflicts, PDF share/export; verify route query is consumed once and correctly clears.
- **Dashboard**: 403 Explorer fallback data semantics for pharmacist and Other Staff; role-specific onboarding/title; Owner/Organization/Admin scopes, activity links, payment pending state, stale on-switch requests.
- **Shifts W3**: Post Shift full web field/effect comparison, rates and site-specific award/holiday calculation, candidate/reveal/counteroffer, stale terms and consent, 2-client booking/payment concurrency, Stripe/Pills, pending checkout, payroll and roster freeze, native long-list scroll and deep-links.
- **Workforce W4–W5**: multi-pharmacy roles and permission matrix, calendar/roster, published acknowledgement, time-zone/DST corrections, timesheet detail/approval/lock, employment and payroll-frozen assignments; source improvements still require real-worker/manager acceptance.
- **Finance/communications W6**: authenticated 500+ message page threads, group isolation, notifications/push delivery, invoice status/revision/receipt and finance calculator context.
- **Marketplace/public W7–W8**: public browse vs private ethical inventory, cross-tenant switch, payment/terms access, published/unpublished profiles, content/editorial access, legal-site URLs.
- **QR product gap**: implement explicit server-backed opt-in/revocable public worker/pharmacy identity and **worker-targeted** scan-to-invite/apply with chosen pharmacy, membership eligibility and review; cross-device unsubmitted draft actions. Do not confuse current public bookmark sync with unsubmitted staff-application sync.
- **Universal links/stores**: verify Android assetlinks.json signing fingerprints, iOS apple-app-site-association with real Apple Team ID, store availability, deep links after install, update/OTA runtime and rollback; currently no physical proof.
- **UI/UX**: review remaining legacy hard-coded components; source styling is not an approved rendered screenshot. Run on small/large iOS/Android, normal/1.6x font, 44pt/48dp touch, reduced-motion, VoiceOver/TalkBack, keyboard, offline and empty/error paths.
- **Clinical calculator**: keep web-only and native clinical algorithm hidden until clinical governance/approved data/fixtures.

## Final Senior Package Testing — intentionally deferred

On **one frozen final SHA**, run `npm ci`, Expo SDK dependency integrity, TypeScript, lint, all source/unit contracts, shared-core, strict boundary, navigation and architecture audits, SQLite and PostgreSQL backend/concurrency, Vite/Next, authenticated browser E2E, Android/iOS native acceptance, actual device screenshots, authorized staging providers/Stripe/e-mail/push, production privacy/security, restore/rollback and independent code/design review.

Do not mark a test as passed because it was written or because an older-head GitHub Action passed. CI started automatically by branch pushes, but its status is *not* release signoff.

### Current senior verdict

These targeted source changes close several previously demonstrated implementation gaps. **The programme is not complete and PR #249 is not merge-/release-ready.** Keep this work on the existing stack; finish high-risk backend QR product workflows and per-persona functional/device acceptance without changing established backend authorization or payment rules.


## Continued W6 communications account-isolation implementation — 5 November 2026

**Baseline:** `237bf313`. **Working head following these edits:** `c6f3812d`. The existing PR #249 remains draft and stacked on #248. QR scanning and invitation implementations were not modified.

| Commit | Source correction | What remains unproven |
|---|---|---|
| `27342461` | Chat room list and shift-contact hooks now scope displayed data by authenticated user ID, discard stale response generations, and clear old data on account changes. Refresh and initial-load failure states remain recoverable. | Multi-account device switching, rapid refresh and backend permission checks |
| `8cbd32a7` | Pharmacy team membership chips, participant admin permissions, and related edit/dialog state reset with the account. Awaited team/shift-contact navigation is suppressed after account changes, and initial chat-list failure exposes Retry. | Real authorized team chat entry and group-management permissions on iOS/Android |
| `7dbe776c` | Authenticated room socket reconnects on access-token/session change, suppressing post-cleanup WebSocket events/reconnects. | Actual account-switch socket handoff and reconnect delivery |
| `c6f3812d` | Conversation history is displayed only when both room and authenticated user match the loaded snapshot. Participant/shift identity caches reload per account; paginated histories and read receipts reject stale account responses. | Rapid account/room switching, long-history scroll position, server read receipts |

### Follow-up senior review priorities

1. Finish a focused W6 review of pending chat mutations (send, edit, delete, pin, attachment) during account and room changes. An already-issued server request cannot be retracted; guard subsequent local transitions without weakening server permissions.
2. Validate multi-pharmacy and six-persona communication permissions, unread counts, room deletion, team/group management and push-to-room navigation with the actual backend. Verify the same room ID cannot expose prior-account text while switching.
3. Continue the existing W3–W8 cross-persona job matrix, particularly shift/paid-checkout concurrent state, marketplace submit authorization, invoice revision/PDF delivery and access control.
4. Perform accessibility/large-text and signed Android/iOS QA, then the consolidated exact-head Senior Package Testing only once implementation is frozen and authorized staging resources are available.

**Evidence limitation:** All four commits are connector-mediated source changes. No local repository checkout, compiled TypeScript, targeted tests, emulator/device screenshots, runtime provider proof, or consolidated release gates were performed in this pass. These implementations must not be described as passing or production-ready. No merge, deployment, EAS update, live provider mutation or QR modifications were performed.

### Subsequent W6 send and composer safety

- `2101fe02`: a synchronous per-screen send mutex prevents duplicate message/attachment submissions. Account/room switches suppress stale send responses, errors and draft clearing, while retaining already-issued server operations under backend authority.
- `d0e7f027`: text drafts, message-edit state and ephemeral menu/typing/pin presentation are reset or hidden when room/account scope changes. Other-account drafts must not remain displayed in a reused screen.
- **Remaining:** source-level regression tests and actual runtime validation of rapid room/account switches, duplicate taps, attachment picker cancellation, reconnect semantics and late server acknowledgements. Do not infer that a submitted request is cancelled when the UI changes account.

**Latest source checkpoint:** `d0e7f027ac51f6adefb62bd574587a6a5d7cfeb8`. No local runtime gate was run.

## Continued senior source remediation — W6 finance and communications (5 November 2026)

**Starting head:** `c2188a86`; **latest implementation head before this handover:** `e56e580f`. This pass did not touch the QR code or scanner implementation, change financial business rules, merge, release or deploy.

| Commit | Change | Invariant / QA needed |
|---|---|---|
| `26cf546b` | Shift-contact chat launches by backend user ID rather than matching the title/email of an existing DM | Avoid similarly named contacts opening a different person's conversation; validate with multiple identical display names |
| `cfba2649` | Read-confirmed reactions and account/room generation guards for late edit, delete and pin results | Prevent rejected optimistic reactions and previous-account mutation responses appearing in the new room; backend is authority |
| `c76000db` | Scoped historical finance revisions, account-scoped invoice deep-link keys, PDF-share cancellation after account switch, sanitized temporary filename and best-effort cache cleanup | No previous-account invoice share sheet after a credential switch; verify Expo file sharing on both platforms |
| `9a7d7837`, `96f41fa7`, `9762af8c` | Extend existing finance and team-chat source regression tests | Source assertions only; no passing test claim until executed |
| `72fcd7d3`, `e56e580f` | Hide pin actions in the chat list if the current persona cannot pin | UI role consistency; backend continues to decide authorization |

### Verification and remaining risk

- GitHub access is available through the connected repository, but the container has **no network DNS path to GitHub**, so a complete local checkout and runtime/typecheck/device build could not be performed here.
- PR #249 is still draft on PR #248. CI checks start automatically on commits; only completed checks on the final immutable head can support acceptance.
- Remaining work exceeds source review: all six personas on real authenticated backend; shift booking/paid checkout and payroll/roster lock concurrency; finance revision and PDF device acceptance; marketplace role and tenant permissions; app links, push notifications and real iOS/Android SDK 58 builds; accessibility and native visual review; authorised provider/staging proof; exact-head Senior Package Testing.
- Do not state **fully finished**, **merge ready** or **production ready** based on this implementation wave. QR identity/product work remains explicitly out of scope at the owner's direction.

### Further W3 and W6 implementation after checkpoint

| Commit | Confirmed source change |
|---|---|
| `6c0e8187`, `ea154d80` | Invoice editor protects a manually modified draft against a delayed internal shift prefill. Customer/item changes increment edit generation and imported shift values cannot be replaced by later default fetches. |
| `bc205610` | Added invoice prefill source-regression contract to the existing finance revision test file. |
| `e62a131e` | Invoice editor close/save and historical revision callbacks are guarded against previous-account or previous-selection results. |
| `3d5ece3c`, `bd0704ac` | Post Shift manager-edited rate fields are preserved when pharmacy defaults refresh late; switching pharmacies establishes a new default scope. React setter signature retained. |
| `60d726cf` | Added Post Shift source contract for late defaults and custom rates. |

**Scope:** no change to paid checkout, Award/holiday rules, payroll locking, invoice financial calculations, QR scanning or server authorization. Do not claim end-to-end acceptance of these corrections without native and backend regression execution.

**Current exact-head caveat:** source changes are committed, but the full CI/check-run suite is not yet confirmed complete on the latest SHA. The container cannot clone the repository from GitHub due unavailable DNS; source inspection and commits used the connected GitHub repository API. Android/iOS simulator, authenticated end-to-end testing, staging Stripe/SMTP/push providers, accessibility screenshots, app signing and store preparation remain unverified. The PR must stay draft and unmerged until those requirements are addressed.

### Continued group-chat mutation safety

- `6b92340a`: stale callbacks for chat room rename, deletion, pin changes and group creation can no longer close dialogs, navigate or display completion messages in a newly signed-in account. The account-change effect resets the rename spinner. Previously issued requests remain backend-authoritative and cannot be cancelled retroactively.
- CI workflows for the working PR are auto-triggered by pushes. The new head requires a completed exact-head check; previous intermittent results and pending/skipped checks do not establish release acceptance.
- This change does **not** implement any QR scan-to-add, membership invitation identity binding, live provider payment, server permissions override, or app release action.

## W5 workforce source-isolation continuation — 5 November 2026

| Commit | Implementation |
|---|---|
| `4db8e824`, `b6cf5fb3` | Timesheet detail now clears prior-account records, outstanding correction fields and stale read/write callbacks. The audited attendance and manager approval backend flows remain unchanged. |
| `1fb49941` | Added timesheet detail source isolation contract. |
| `ee9ba9d8` | Worker My Hours now holds account-tagged rows, discards stale loads and guards duplicate/stale timesheet submissions. |
| `3470e971`, `64e55e3f` | Manager timesheet workspace and pharmacy period operations now hide previous-account data, reload authenticated pharmacies and reject stale account/pharmacy completion callbacks. |
| `9f62d6c3`, `308bd45c` | Added manager and worker account/pharmacy scope tests in existing scripts. |

**Source boundary:** fixes are scoped to mobile UI requests and state. They do not grant new permissions or alter payroll, roster freeze, attendance corrections, award rates or booking/Stripe rules. In-flight server writes cannot be retracted by client generation guards.

**Still required for actual W5 acceptance:** authenticated multiple-account and multiple-pharmacy transitions, manager/worker positive and denial tests, concurrent period correction/locking, real device font/keyboard QA, backend PostgreSQL evidence and full frozen-head CI. QR remains unchanged. **Not release ready without this evidence.**
