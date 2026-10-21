# Senior Package Testing — independent main-based architecture PR

21 October 2026 (Australia/Brisbane). Source PR #191: `a69aa06f0443f5f5511264a5f3be42abba181c72`.
Actual parent: remote main `a1b6931a8fdef718b5a9aee22e03c486c5c043dd`. Branch: `refactor/architecture-mainline-no-drift-20261021`.
Handbook: `docs/qa/SENIOR_PACKAGE_TESTING.md` + Library `Senior-package-testing-handbook.md`.
Release status: **DRAFT / NOT MERGE-READY** until exact-head evidence is obtained.

## Transfer isolation

- Ported source PR #191 changes without importing draft PR #181's calendar/planner work, or PR #182's shift lifecycle. Neither original PR was modified.
- `shared-core/src/api.ts` and `.github/workflows/shared_core_consolidation_ci.yml` were deliberately rebuilt from remote main and contain only the #191 architecture additions.
- Dropped PR-number-191-only native CI wrapper; substituted a generic mainline full-qa wrapper.
- Preserved `scripts/run-staging-qa.sh` original executable permissions and exact content; the accidental mode change was not imported.
- Windows Tauri/Rust kiosk and browser shell remain independent. No DB migration, authorization rewrite, pricing/cancellation policy, or staging/production changes.

## No-drift corrective changes

1. Native pharmacy save verification: saved POST/PATCH is not repeated after a failed GET; retry control now enables after request resolves. Added targeted source-level regression check; Android/iOS runtime still required.
2. Kept the cross-client brand identity domain tokens but preserved all six **existing Expo persona appearance accents**. No auto-approved visual redesign.
3. Corrected invalid JavaScript regex syntax in strict boundary CLI test.
4. Preserved generated skill icon mapping integrity but now collect mismatched regenerated images as separately reviewable **candidates**, leaving all approved tracked PNGs unchanged. Existing Windows actual screenshot gate stays unmodified.

## Exact-head mandatory acceptance evidence

| Gate | Status (initial) | How verified |
| --- | --- | --- |
| Main ancestry and no unfinished PR features | PENDING | compare main...head and inspect overlap |
| Shared-core/TypeScript/Vitest/build/package | PENDING | exact-head CI job |
| Vite/Next/Expo typecheck/build/static/mobile/security | PENDING | exact-head CI jobs |
| Django SQLite/domain/permission/multipart | PENDING | CI tests with counts |
| PostgreSQL fresh schema and concurrency | PENDING | isolated synthetic database |
| Full Docker PostgreSQL acceptance | PENDING | `full_isolated_qa.yml` with `full-qa` label |
| Django import graph / boundary debt and ratchet | PENDING | architecture audit jobs |
| Live Vite/Next and authenticated real-browser E2E | PENDING | exact-head Playwright workflow |
| Windows 390/1440 light/dark screenshots | PENDING | current baseline screenshot evidence |
| Generated native icons rasterisation review | PENDING VISUAL APPROVAL | candidate artifact, no tracked artwork changed |
| Android emulator + iOS simulator | PENDING individually | native acceptance reusable workflow |
| Physical-device parity | BLOCKED (no device runner proven) | independent device evidence |
| Backup-restored populated staging migration | NOT EXECUTED | no destructive/staging authorization |
| Staging / production deployment | NOT AUTHORISED | none |
| Merge authorization | NOT AUTHORISED | PR remains draft |

CI success does not imply approved manual native visuals or physical-device parity. Report each result with exact SHA and workflow/job IDs. Do not count inherited PR #191 results.

## 21 October transport review continuation

Resolved 10 direct domain transport callsites with named cross-platform SDK operations; classified five device/media local-URI fetches as false positives, recording their evidence. The manifest now has **56** entries (15 approved adapters, five evidence-backed false positives, 36 unfinished legacy calls). Added charge fulfillment, pill settlement, reminder and binary invoice wire tests. See `docs/architecture/TRANSPORT_CONTINUATION_2026-10-21.md`.

Every previous workflow success is for the prior head `f717bf4f` and must be rerun on the new head. Native PDF/Stripe return and auth/error/CSRF acceptance remain open. The backend dependency cycles and intentionally divergent Next/Vite twins are not auto-approved for code rewrites.

## Mainline third-pass: explicit browser identity and public transport (21 Oct 2026)

Eliminated **14** additional whole-tree direct legacy transport callsites (14 expected): two registration, two password-reset, four referee invitation/rejection, three signed public membership GET/POST branches, one Next public talent feed, one Next websocket ticket and one Vite onboarding multipart location update. The canonical shared-core `browserOperations.ts` now owns these endpoint paths and browser wire DTOs while callers still own navigation, loading indicators and error presentation. The existing onboarding role-normalization and FormData encoding remain in `updateOnboardingForm`. Browser operations have seven wire tests asserting anti-leakage, CSRF, cookies, password-reset, referee, WS-ticket, magic membership, public paging and current-user semantics. No direct auth session logic was migrated without an approved full browser and Expo acceptance contract.

**Manifest after this pass:** 42 known findings; 22 still legacy candidates, 15 accepted platform adapters and 5 locally sourced non-network media blobs. The current success criteria include asserting the full scanner reclassifies exactly those removed callsites: the manifest count is a *hypothesis* until exact-head `node scripts/inventory-client-api-boundaries.mjs --json` succeeds. Re-run all exact-head workflows after this commit; previous heads are not release proof.

Preserve Vite and Next separate route navigation, Next CSRF BFF, Expo native secure token store, owner role/verification policy, permissions and backend migration compatibility. Legacy login/OTP/session refresh remain a separate high-risk authentication batch; avoid flattening them into generic `fetchApi` requests.

### Identity public browser transport consolidation — next 10 callsites

The Vite/Next login and email-OTP verify/resend screens now invoke browser-specific named shared-core operations. They retain the explicit **GET CSRF then POST** handshake for login and verification, `X-Client-Platform: web`, cookie-backed authentication, remember-me payload, exact status handling for unverified email, and existing Vite/Next-specific routing, 30-second Next resend cooldown, and Next session announcement. The shared-core wire tests assert these cookies/headers/payloads. Client error interpretation now uses the shared-core structured status/payload without losing verification-specific redirects.

Removed 10 resolved callsite identities. Full-tree manifest: 32 findings, **12 remaining legacy**, 15 approved platform, 5 non-network local URI. Browser login session and native Expo session refresh are intentionally separate. Physical device and fresh current-head E2E acceptance still required; previous head job results cannot sign off this commit.

### Current-user browser identity binding

Both Vite and Next `AuthContext` now call the shared browser-current-user operation. Vite's cookie-only bootstrap, bearer identity mismatch check, no-token early return and fallback refresh remain in their original order; Next's prior bearer-or-cookie user request is likewise unchanged. Shared operation returns `null` only on explicit 401, never refreshes silently, and retains the exact user-unavailable message for other failures. Its wire-contract tests cover bearer and cookie-only credentials. Two more scanner findings retired after the code change. **10 remaining legacy candidates**. No changes to React role switching or Next SSR request ownership.
