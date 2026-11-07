# PR #257 — Exact-head acceptance and release evidence ledger

**Evidence captured:** 7 November 2026 (Australia/Brisbane). This is a *point-in-time* ledger, not release approval.
**Candidate:** `420e3ea120f6d9c095a66a812bbfd727be78b664`; draft PR #257 (`agent/pr249-m5-combined-candidate`).
**Related draft PRs:** #259 test-only chat, #260 chat fix, #261 native CI fix. None is merged into #257.
**Statuses:** CODE_PRESENT, TESTED, STAGING_ACCEPTED, DEVICE_ACCEPTED, BLOCKED, DEFERRED. A successful CI job proves only the specific suite and environment named.

## A0/A1 — exact-head GitHub evidence

| Workflow | Run | Exact-head result and limitation |
| --- | --- | --- |
| Shared Core Consolidation (backend, PG-concurrency, Shared Core, boundary, architecture, kiosk, Web Vite/Next, mobile, release gate) | [42373312196](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/actions/runs/42373312196) | **SUCCESS** for all listed jobs on original candidate; mobile **236 + 44 + 42 = 322 passing** |
| Full Isolated QA | [42373536398](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/actions/runs/42373536398) | **SUCCESS**; not staging/payment-provider certification |
| Frontend E2E manual verification | [42373312200](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/actions/runs/42373312200) | **SUCCESS**; device-independent browser checks |
| E2E runner smoke | [42373312207](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/actions/runs/42373312207) | **SUCCESS** |
| Static/mobile lint | [42373312181](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/actions/runs/42373312181) | **SUCCESS** |
| Public repository security | [42373312172](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/actions/runs/42373312172) | **SUCCESS** |
| Backend finalization | [42373312177](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/actions/runs/42373312177) | **SUCCESS**, including roster HTTP PostgreSQL and SQLite jobs |
| Serializer decomposition | [42373312689](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/actions/runs/42373312689) | **SUCCESS** |
| Android+iOS native simulator | [42373536389](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/actions/runs/42373536389) | **FAILURE** in both jobs. Android UI automation looked for `Work email` although actual `frontend_mobile/app/login.tsx` has `label="Email"`. iOS failed compiling `expo-modules-jsi/.../JavaScriptObject.swift:946` due to Swift actor isolation under Xcode 26.2. Android launch and sign-in screen reached; neither platform accepted. |
| Fixed candidate recovery acceptance | [42373536380](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/actions/runs/42373536380) | **SKIPPED** by workflow condition, NOT PASSED |

Native corrections: [draft PR #261](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/pull/261), test-only `b615e99b`, fix `cd5c2bfe`, addresses both labels and selects macOS 26 / Xcode 26.6. Its tests and native CI must pass before promoting into #257. The Xcode change is a hypothesis until a successful build proves compatibility.

## Protected business invariants — implementation/test versus external acceptance

| ID | Protected business invariant | Existing evidence and source | Code/test status | Staging | Android | iOS | Defect / next acceptance |
| --- | --- | --- | --- | --- | --- | --- | --- |
| AUTH-01 | New-account login does not inherit stale redirect, current persona correctly selected | `frontend_mobile/app/login.tsx`; existing login-return regressions; browser/auth CI above | TESTED (CI scope) | BLOCKED | BLOCKED | BLOCKED | PR #261 fixes stale Maestro field selector; authenticate both native devices |
| SCOPE-01 | Selected pharmacy/capability guards all management and posting operations | `docs/mobile/PR249_W3_W8_FIELD_PERMISSION_CONCURRENCY_ACCEPTANCE_2026-11-05.md`; Shared Core and backend suite above | TESTED (covered suites only) | BLOCKED | BLOCKED | BLOCKED | Full real-HTTP role-by-role W3–W8 matrix not independently reproduced here |
| SHIFT-01 | Two candidates cannot book same slot or create orphan payment | `backend/shifts/test_offer_terms_version_postgres.py`; PG-concurrency job above | TESTED (existing PG suites) | BLOCKED | BLOCKED | BLOCKED | Independent two-connection provider/HTTP replay remains |
| SHIFT-02 | Counteroffer/acceptance binds approved, current slot terms; changed terms require re-review | Fingerprint/version server logic and existing tests; native `useShiftActions`; Shared Core CI | TESTED (code/CI scope) | BLOCKED | BLOCKED | BLOCKED | Confirm cross-device terms 409 and renewed consent in staging |
| SHIFT-03 | Offer double-taps for same slot suppressed, distinct dates independent | Original red tests at `45c267c8`; fix `a948944d` + UI `420e3ea1`; mobile job 322 passing | TESTED | BLOCKED | BLOCKED | BLOCKED | Verify installed-device interaction |
| POST-01 | Post Shift saves allowed fields and templates without server draft invention | M5 Job Pack §G; mobile 322 and browser suites; existing parity register | TESTED (covered suites) | BLOCKED | BLOCKED | BLOCKED | Selected-pharmacy/keyboard/footer/date rollover acceptance on devices |
| FIN-01 | Booked history, payroll freeze, invoice revision and payment obligations immutable except authorised corrections | Backend PG-concurrency, backend-finalization and shared-core CI | TESTED (existing suites) | BLOCKED | BLOCKED | BLOCKED | Two-session invoice, Stripe/Pills, webhook replay and storage require authorised staging |
| MARKET-01 | Listing/ethical transitions, visibility, image metadata writes, stock/lot isolation | Existing W7–W8 register; marketplace retained-photo draft-settling regression and Shared Core CI | TESTED (covered suites) | BLOCKED | BLOCKED | BLOCKED | End-to-end storage, jurisdiction, concurrency and denied moves still require independent HTTP/staging proof |
| CHAT-01 | Current authorized participant can read/send and revoked legacy participant cannot interfere | [#259](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/pull/259) red-only `feb87da2`; [#260](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/pull/260) green fix `ad01356e`; its Shared Core Consolidation [42374118095](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/actions/runs/42374118095) succeeded | TESTED **on #260 only; not #257** | BLOCKED | BLOCKED | BLOCKED | Review and integrate fix; verify private Azure blob policy and legacy SAS expiry |
| UX-01 | W1–W8 match web business tasks, 10 core UI states cover recovery | `docs/mobile/PR249_W3_W8_FIELD_PERMISSION_CONCURRENCY_ACCEPTANCE_2026-11-05.md`; component suites | CODE_PRESENT / selected tests | BLOCKED | BLOCKED | BLOCKED | Do not claim full field-state parity without executed per-task matrix |
| DEV-01 | Installed native app handles login, scopes, deep links, camera, sharing, accessibility | Failed original native CI [42373536389](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/actions/runs/42373536389); #261 pending verification | BLOCKED | BLOCKED | BLOCKED | BLOCKED | No device sign-off until Android and iOS rerun green and manual accessibility |
| PROVIDER-01 | Test-mode Stripe/Pills, email/push and private Azure policy enforced | No credentialed staging/provider run evidenced here | CODE_PRESENT (not provider accepted) | BLOCKED | N/A | N/A | Explicit staging authorization and test credentials needed |

**Status caveat:** “TESTED” refers to the named automated suites and their protected claims, not a blanket assertion that every negative HTTP/DB role permutation was run. Every missing independent acceptance is recorded as BLOCKED rather than silently assumed PASS.

## A5 — web/mobile and 10 core UI states

Continue from the **canonical** `docs/mobile/PR249_W3_W8_FIELD_PERMISSION_CONCURRENCY_ACCEPTANCE_2026-11-05.md`, not a replacement parity document. For each high-risk task record source, mounted/native test, role-positive, foreign-store-negative, empty/loading/actionable-error/offline/slow-network/zero-result/permission/session-expiry+draft/field-validation/success, and actual device outcome. Current overall status: **NOT EXECUTED end-to-end**. This ledger's passing JS and browser suites do not certify 10-state matrix or six-persona native journeys.

## A3/A4/A6 — controlled acceptance runbook

- **Isolated backend:** create synthetic owner of A/A2, foreign owner B, org manager, MANAGE_ROSTER delegated admin, delegated staff-only admin, verified pharmacist, technician, unverified Explorer and anonymous identity. Run authenticated HTTP for W3–W8, write down URL/status/DB before-after. Repeat wrong-scope, revoked, logged-out and concurrent same-slot tests in two PostgreSQL sessions; require exactly one assignment, no duplicate obligation, no unauthorised transfer/stock movement.
- **Finance and storage:** under expressly authorised test-mode staging, replay signed Stripe success/expiry/refund webhooks, compete Pills and checkout, attempt stale invoice revision 409 and repeated payment, assert no duplicate charged activity. Verify Azure blob container private and legacy SAS/direct media access denied/expired; use no live accounts or actual customer notifications.
- **Native:** install exact-SHA embedded-bundle Android APK and iOS simulator/physical-device builds; run login + manager/store switch, restart, cold deep links, QR/camera, file share, invoice PDFs, keyboard-aware Post Shift, 1.0x/1.6x font, TalkBack/VoiceOver, offline/auth-expiry, six personas and denied paths. Record build ID, OS/screen, actual screenshot and per-step result.
- **Recovery:** isolate a test database and provider sandbox; never mutate production. On failed acceptance, revoke sandbox sessions/test keys as appropriate, remove generated fixtures, keep immutable CI logs/artifacts; retain prior known-good deploy/runtime and release HOLD.
- **Exit:** certify exact one combined SHA only after code/PG/HTTP, full automated CI, staging providers, Android/iOS and independent review, with explicit owner approval for promotion/merge.

## A7 — safe branch reconciliation

At this checkpoint #257 contains #249 head `97c4543e` (218 ahead/0 behind). #248 `25939534` vs #249 diverged by one base commit; PR #257 discussion identifies this as public-auth token lookup, with equivalent code already present. Review equivalence and regression before rehearsal; do not force-push, automatically cherry-pick or merge original draft branches. Keep #257 and separate fix PRs as audit trail. Promotion into #249 is distinct from merging `main`.

**Release decision:** CODE PRESENT with substantial exact-head CI evidence; repository acceptance incomplete; staging acceptance BLOCKED; device acceptance BLOCKED; **MERGE READY = NO**.
