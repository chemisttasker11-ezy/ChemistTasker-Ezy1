# ChemistTasker Expo PR #249 — Senior implementation continuation

**Date:** 5 November 2026 (Australia/Brisbane)  
**Base:** PR #248 (`feat/mobile-merge-sdk`); **working PR:** #249 (`fix/pr248-expo-production-waves-20261104`)  
**Review/implementation checkpoint:** `388c1ae68a75738c1555508ee11a81c144dec221`  
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

Tests have been **authored but not executed** as instructed. All conclusions are source-level implementation only.

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
