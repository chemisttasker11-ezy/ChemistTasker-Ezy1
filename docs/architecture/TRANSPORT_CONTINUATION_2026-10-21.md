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
