# API transport and platform-boundary continuation — senior review

**Date:** 21 October 2026 (Brisbane). **PR:** #193, branch `refactor/architecture-mainline-no-drift-20261021`, parent remote `main`. All feature and architecture contracts remain subject to exact-head CI.

## Source-grounded A04 resolution

Original scanner: 66 callsites (15 approved platform adapters, 51 legacy candidates). Following a review of actual route/body/caller semantics:

- **10 direct domain client calls consolidated** into canonical named shared-core operations, with typed payloads and wire tests. These are no longer manifest callsites: Expo/Vite pills shift payment (2), Expo Stripe fulfillment with `platform: 'mobile'` preserved (1), Expo/Vite reminder buzz (2), authenticated binary PDF downloads (2), Expo owner/pharmacist/staff dashboard (1), and Vite/Next pharmacy rating summaries (2). Native `Linking.openURL` and browser redirect behaviour remain platform-owned.
- **5 parser findings classified as false positives**, with individually recorded rationale in the manifest: Expo file imports read a local picker/media URI to Blob (`ethicalMarketplace` twice, `finance`, `marketplace`, `PostComposer`). They are not HTTP domain calls. Uploads remain through named domain SDKs, not a bypass.
- **Remaining 36 legacy candidates** are not auto-approved and cannot yet pass the whole-tree strict audit. Exact scanner results and manifest must remain in sync; do not remove findings just to make CI green.
- **15 accepted platform adapters** remain necessary: Android/iOS auth storage and CSRF bootstrap, Next request-scoped browser BFF sessions and origin verification, websocket/device transport, app-update native checks. The source `frontend_mobile/utils/apiClient.ts` is still an adapter and not an alternate rule/permission authority.

### Remaining candidate categories and controlling constraints

| Category | Status | Reason / safest next gate |
| --- | --- | --- |
| Vite/Next registration, login, OTP, token and cookie-only `/users/me/` | Preserve until dedicated auth journey parity | Their Axios/raw cookie and CSRF semantics differ from general SDK `fetchApi`. Next public/SSR has a BFF and explicit `X-Client-Platform`; Expo device refresh must not lose credentials or an existing accepted session |
| Expo `AuthContext` login, registration and OTP | Preserve until native test-backed adapter migration | Requires session write order, token storage, role switching and Android/iOS secure-store tests; a generic JSON operation replacing Axios could change refresh/error shapes |
| Magic membership public invitation and Vite onboarding multipart | Preserve until public/anonymous and auth contracts | Public signed-token and authenticated branches must not share implicit credentials; FormData must remain multipart with correct CSRF/bearer behaviour |
| Next CMS `contentApi` wrapper | Preserve as reviewed work item, not approved | Generic request is consumed by active invite/workspace/editor; replacing blindly could change ACL, moderation and request-scoped session handling |
| Public talent read, websocket ticket, device-token registration | Preserve pending platform boundary tests | Public unauthenticated feed and websocket/native registration must keep their separate privacy/transport semantics |
| Vite/Next auth/referee/publishing twins | Review each import and request lifecycle before extraction | Avoid browser token leakage, losing anonymous entry, breaking OTP or stale proxy paths |

## A05 zero-drift wire behaviour added

| Operation | Original client contract | Canonical domain action |
| --- | --- | --- |
| Pills shift settlement | `POST /pill-rewards/pay-shift/`, `shift_id`, optional `offer_ids` | `payShiftWithPills`; preserves insufficient-pills balance/required error details |
| Stripe fulfillment | `POST /billing/charge-fulfillment/{id}/`; native includes `platform: mobile` | `chargeShiftFulfillment` retains previous Vite bodyless/empty contracts and Expo platform return |
| Candidate reminder | `POST /shift-offers/{offerId}/buzz/` bodyless | Existing `buzzShiftOffer`; UI-specific dialog/message preserved |
| Invoice PDF | `GET /invoices/{id}/pdf/` binary Blob via auth | `downloadInvoicePdf`, raw response `.blob()`, no JSON decoding, no cross-origin auth redirects |
| Scoped dashboard | `GET /dashboard/{role}/` with workspace and pharmacy filters | Existing `getOwnerDashboard`, `getPharmacistDashboard`, `getOtherStaffDashboard`; native 403 fallback retains current logic |
| Pharmacy rating | `GET /ratings/summary/?target_type=pharmacy&target_id={id}` | Existing `getRatingsSummary`, same public token guard and absent-on-error behaviour |

Wire tests assert method, path, body, bearer token and PDF content type. **Manual real-session CSRF/refresh/error parity and native Stripe app return are required separately.** Nothing here authorises pricing changes or the PR #182 shift-cancellation/penalty work.

## A06 / A09 policy

The 43 divergent Vite/Next twins are **not 43 verified bugs**. Do not byte-copy Vite over Next: Next-specific navigation, SSR transport, public availability and authenticated origin must survive. The previously identical pure helpers and contracts remain candidates for extraction only after import/time, DTO and visual checks. See `VITE_NEXT_TWIN_DRIFT.md`.

The module graph includes two older SCCs: `attendance ↔ workforce` and a 13-app dependency SCC with 35 directed cyclic edges (37 total baseline). Their existing import graph is protected by exact-head no-new-SCC/edge CI. Removing Django model, migration or app import compatibility in an architecture PR can break migrations. Scope-level diagnosis and future safe lazy-import moves require focused Django test/proxy evidence; no baseline suppression added.

## Non-negotiable final release gates

- Full-tree scanner `--strict` must remain red until every non-asset remaining legacy item is migrated or individually proven as an appropriate platform adapter.
- Named SDK migrations must pass shared-core wire unit tests, Vite/Next/Expo TypeScript builds, both browser suites, and manual/native device acceptance.
- No PR #181 planner, #182 shift policies, Windows kiosk transport or production/staging data mutation. No automatic screenshot approval.

## Mainline third-pass: explicit browser identity and public transport (21 Oct 2026)

Eliminated **14** additional whole-tree direct legacy transport callsites (14 expected): two registration, two password-reset, four referee invitation/rejection, three signed public membership GET/POST branches, one Next public talent feed, one Next websocket ticket and one Vite onboarding multipart location update. The canonical shared-core `browserOperations.ts` now owns these endpoint paths and browser wire DTOs while callers still own navigation, loading indicators and error presentation. The existing onboarding role-normalization and FormData encoding remain in `updateOnboardingForm`. Browser operations have seven wire tests asserting anti-leakage, CSRF, cookies, password-reset, referee, WS-ticket, magic membership, public paging and current-user semantics. No direct auth session logic was migrated without an approved full browser and Expo acceptance contract.

**Manifest after this pass:** 42 known findings; 22 still legacy candidates, 15 accepted platform adapters and 5 locally sourced non-network media blobs. The current success criteria include asserting the full scanner reclassifies exactly those removed callsites: the manifest count is a *hypothesis* until exact-head `node scripts/inventory-client-api-boundaries.mjs --json` succeeds. Re-run all exact-head workflows after this commit; previous heads are not release proof.

Preserve Vite and Next separate route navigation, Next CSRF BFF, Expo native secure token store, owner role/verification policy, permissions and backend migration compatibility. Legacy login/OTP/session refresh remain a separate high-risk authentication batch; avoid flattening them into generic `fetchApi` requests.

### Identity public browser transport consolidation — next 10 callsites

The Vite/Next login and email-OTP verify/resend screens now invoke browser-specific named shared-core operations. They retain the explicit **GET CSRF then POST** handshake for login and verification, `X-Client-Platform: web`, cookie-backed authentication, remember-me payload, exact status handling for unverified email, and existing Vite/Next-specific routing, 30-second Next resend cooldown, and Next session announcement. The shared-core wire tests assert these cookies/headers/payloads. Client error interpretation now uses the shared-core structured status/payload without losing verification-specific redirects.

Removed 10 resolved callsite identities. Full-tree manifest: 32 findings, **12 remaining legacy**, 15 approved platform, 5 non-network local URI. Browser login session and native Expo session refresh are intentionally separate. Physical device and fresh current-head E2E acceptance still required; previous head job results cannot sign off this commit.

### Current-user browser identity binding

Both Vite and Next `AuthContext` now call the shared browser-current-user operation. Vite's cookie-only bootstrap, bearer identity mismatch check, no-token early return and fallback refresh remain in their original order; Next's prior bearer-or-cookie user request is likewise unchanged. Shared operation returns `null` only on explicit 401, never refreshes silently, and retains the exact user-unavailable message for other failures. Its wire-contract tests cover bearer and cookie-only credentials. Two more scanner findings retired after the code change. **10 remaining legacy candidates**. No changes to React role switching or Next SSR request ownership.

### Expo push device-token transport

`registerDeviceTokenWithBackend` now forwards the exact native token/platform request to a named `registerPushDeviceToken` domain operation, maintaining `POST /device-tokens/`, `token`, `platform`, and **best-effort** error handling without clearing authenticated state from notification failure. Wire test explicitly asserts the native bearer and `credentials: omit`. This removes one direct mobile transport call without changing Expo permission prompts or notification listeners. **Nine** legacy transport candidates remain. Validate on native simulators and physical devices before sign-off.

### Native Expo auth transport — six feature bypasses removed without changing session semantics

All **6** direct auth request callsites from `frontend_mobile/context/AuthContext.tsx` now invoke five named operations in the isolated `frontend_mobile/utils/nativeIdentityTransport.ts` (two `me` reads share one operation). Auth routes are owned by the new canonical shared-core `NATIVE_IDENTITY_ROUTES` and checked by a unit test. The platform-specific Axios interceptor is **retained** in the single Expo transport adapter so native secure token and fallback refresh, platform headers, Expo-web CSRF, timeout and structured validation error behaviour do not drift. The AST manifest explicitly approves its five new adapter callsites; this is **not** an approval to duplicate policies or move Next SSR state into mobile.

Remaining legacy transport **3** (two browser mobile OTP and one dynamic Next CMS escape hatch). Full manifest **28**. Native login/logout/OTP replay tests and physical emulator evidence are still required; whole-tree parser and exact-head CI must confirm adapter key signatures.

### Browser mobile OTP authentication adapters

Vite and Next mobile OTP pages no longer construct direct `/users/mobile/verify-otp/` requests. Their separately named browser-only adapters preserve the established Axios cookie/CSRF and token-refresh interceptors; route identity is the shared `API_ENDPOINTS.mobileVerifyOtp`. The `login`, `setUser`, Next cross-app `announceSession`, Vite dashboard reload, Next remembered return destination and UI error handling remain unchanged. Two legacy feature callsites become two individually justified transport adapters. This is *not* an exemption for new feature HTTP endpoints. Remaining full-tree legacy: **1** (Next Content API generic escape hatch). Android/iOS native auth remains isolated in its approved native gateway.

### Content Workspace domain ownership (A04 final generic request migration)

Replaced the last active Next CMS `contentApi(path, method, body)` feature escape hatch with **15 named typed content operations** in `shared-core/src/domains/content/operations.ts`: current permissions, documents and revisions, publish/return/archive state transitions, media, invitations, contributor scope grants, moderation, and invitation acceptance. Existing `chemistTaskerApi.contentManagement` remains the *transport* passed to the domain factory by `landing_next/lib/browser-api.ts`, retaining Next cookie/CSRF and BFF request handling; frontend feature pages no longer construct arbitrary `/content/` API paths. Shared-core wire tests assert the original 15 routes, HTTP methods, bodies and FormData without creating new Django permissions, approval routes or billing policy. The UI still owns its prior error, status, validation and navigation behaviour.

**Full-tree AST legacy inventory now has 0 legacy candidates**, 22 explicitly approved platform-transport callsites and 5 annotated local-media false positives. This is only a static transport-ownership claim until exact-head scanner strict and full Senior Package Testing pass. It is **not** a claim that Django's 37 cyclic import edges or 43 Vite/Next divergent twins were eliminated. No silent merge or deployment.

### Attendance / workforce module import cycle reduction

Attendance and workforce previously formed a two-app import-time strongly connected component. `attendance.approvals` and `attendance.views` used to import `workforce.roster.permissions.is_authorized_attendance_manager` at module load while workforce attendance edits import `attendance.approvals`. The permission lookup now resolves inside the identical-name `attendance.approvals.is_authorized_attendance_manager` callable. Attendance views import the local facade. Authorization **still delegates to the same workforce predicate** (owners, organisation scopes, manager capabilities unchanged); no migration, serialized output, shift, pricing, stored records or system behaviour changed. Added a pure AST no-database test to confirm module import timing and function delegate identity, plus its CI gate. `scripts/module_import_graph.py --check --check-baseline` and both SQLite/PostgreSQL acceptance must confirm the cycle reduction at the exact commit. The long-lived 13-app SCC is not automatically touched, and the old baseline is deliberately kept unchanged to preserve no-regression ratchet.
