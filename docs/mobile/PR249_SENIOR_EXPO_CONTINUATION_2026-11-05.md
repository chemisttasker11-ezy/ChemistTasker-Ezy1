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
