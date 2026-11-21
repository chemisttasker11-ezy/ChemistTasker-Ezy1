# GM-26 — Admin / Privacy / Security / Release — Grill Me trace (read-only)

> **Corrections against current code (21 Nov 2026 review).** 24 claims checked at `main` `8ccf8f77` and `pr257` `21add924`; 15 hold, 9 below need the correction shown. Where a question below says otherwise, this table wins. Full evidence: [`../followup/claim-check-2026-11-21.md`](../followup/claim-check-2026-11-21.md).

| Where | Claim in this file | Verdict | Correct statement | Evidence |
|---|---|---|---|---|
| Q12 / Q13 | Every adverse result leaves bookings, or every suspension cancels everything | WRONG — both formulations are too broad | Adverse stored states block relevant new public actions. Cancellation is limited to eligible future public bookings, respects member exemptions and retains history-protected assignments. | `pr257:backend/onboarding/verification/state.py:162`; `pr257:backend/shifts/cancellation.py:33`; `pr257:backend/shifts/cancellation.py:37`; `pr257:backend/shifts/cancellation.py:47` |
| Q15 / Q16 / Q39 | Anonymous pharmacy identity remains hidden until later notices | WRONG | An offered worker can receive the pharmacy name before acceptance through terms preview. Other applicant notices also disclose it, so the existing anonymity behaviour is inconsistent across routes. | `pr257:backend/shifts/engagement.py:640`; `pr257:backend/shifts/serialization/offers.py:235`; `pr257:backend/shifts/emails.py:434` |
| Q27 | Any future assignment can be rated | WRONG | Both directions require an assignment dated before today. That still does not prove attendance, completion or approved hours. | `main:backend/ratings/views.py:82`; `pr257:backend/ratings/views.py:92` |
| Q38 / CG-16 | “No app-level audit-logging code … anywhere” | WRONG | Roster, marketplace, content and Django-admin reconciliation have audit records. The open question is coverage and operational access, not whether all application auditing is absent. | `main:backend/workforce/models.py:747`; `pr257:backend/marketplace/models.py:309`; `pr257:backend/public_hub/models.py:185`; `pr257:backend/billing/admin.py:110` |
| Q41 | Acceptance logging absent; Expo legal links unknown | WRONG — partially | Registration records acceptance and its timestamp, but not a legal-document version. Expo links to Terms of Service and Privacy Policy; actual deployed document equivalence remains a runtime/content check. | `pr257:backend/users/serializers.py:173`; `pr257:backend/users/models.py:81`; `pr257:frontend_mobile/app/register.tsx:433` |
| Q42 / Q43 / Q46 | Production settings, pentest and rollback readiness | UNVERIFIABLE | Code defaults and environment guards are inspectable; production values, external security work and migration/rollback rehearsal are not. Keep those assertions explicitly unverified by this review. | `pr257:backend/core/settings.py:24`; `pr257:backend/core/settings.py:27`; `pr257:backend/core/settings.py:90`; `pr257:backend/core/settings.py:660` |
| Q45 B62 | Region-admin M2M assignment alone grants roster authority | WRONG as a current hole | Roster authority requires owner/superuser status, pharmacy roster capability or an organisation capability covering that pharmacy. An assignment alone does not grant the broad authority described by the old finding. | `pr257:backend/organizations/access.py:164`; `pr257:backend/workforce/permissions.py:13`; `pr257:backend/workforce/permissions.py:37`; `pr257:backend/shifts/base.py:223` |
| Q45 B65 | Any authenticated user can probe another pharmacy’s pricing | WRONG | The action itself checks pharmacy-management permission before calculating rates. The base-class exemption does not bypass that action-level guard. | `main:backend/shifts/lifecycle.py:213`; `pr257:backend/shifts/lifecycle.py:213` |
| Q47 / Q48 | Pharmacist mobile add-profile remains broken | STALE | PR257 redirects the pharmacist onboarding route to the supported basic-profile form. Reassess any remaining progress/readiness concerns independently of the retired route. | `pr257:frontend_mobile/app/pharmacist/onboarding.tsx:5` |

**Repo:** `chemisttasker11-ezy/ChemistTasker-Ezy1`
**Issue:** #250 — Grill Me, one consolidated backend + web + Expo sign-off before launch
**Method:** PR #184 / Issue #250 (each question: ACTUAL TODAY, Keep-current-logic option,
Other/describe, recommendation; Web and Expo traced together, side by side)
**Date traced:** 2026-11-21 (AEST) — re-run of the blocked trace from earlier the same day.
**Status: TRACED — re-run complete for the genuinely new GM-26 ground (Q36–Q46) and the
adopted-verdict overlaps; 15 old questions remain NOT RE-VALIDATED (listed in §0).**

## §0 — Verification status (read this first)

### Head

**HEAD VERIFIED (my own call, this re-run).** PR #249 head is still
`97c4543e051b43fe30ec7e2e61ad3d69957a918e` — identical to the Issue #250
snapshot. PR #249: DRAFT, NOT MERGE-READY, NOT DEPLOYED; stacked on #248
(`feat/mobile-merge-sdk`). PR #184 head
`c786a4b8182ebf9b505d47cd81980eb3b9851ce3`.

**Head-resolution note (recorded, per task).** The PR #249 body text names a
"working head `26cae2d6`" — short SHA of the last listed implementation
commit, not the branch head. All tracing here is at the API head
`97c4543e…`. The API reports PR #249's base SHA as
`c98cf2ef74c6de356cceb8dee3a61dad47b6b843`, matching the mobile ledger's
"original head `c98cf2ef`" for PR #248; the earlier GM-26 trace recorded a
PR #248 head of `25939534a1c5…` (a different read — PR #248's own head at
that time vs PR #249's base SHA). The difference was not adjudicated; it
does not affect any GM-26 verdict, because every file below was read at
the pinned head `97c4543e…`.

### Rate limit

**No real HTTP 429 in this re-run.** ~80 GitHub calls were made sequentially
(one at a time, 9–12 s apart) with zero real HTTP 429 responses. One false
stop occurred in the phase-1 script: it halted on the bare substring `429`
inside a blob SHA (`0429a0e8…`, the SHA of
`frontend_web/landing_next/app/sitemap.ts`) in an otherwise successful
directory listing (`ok: true`). That call had NOT returned HTTP 429. The
detector was corrected to match only `HTTP 429` / `too many requests` and
fetching resumed; no further stop occurred.

### What WAS verified this re-run (fresh, file contents read at `refs/pull/249/head`)

- **PR #249 head SHA, Issue #250 body, PR #184 metadata + file list, PR #249
  file list (all 4 pages — 314 files confirmed by my own fetch).**
- **`docs/qa/launch-grill/AUDIT.md` at `refs/pull/184/head`, in full** (201
  lines) — the Oct 2026 audit text quoted in §3 is now verified as the
  actual #184 document.
- **`docs/qa/MAIN_RELEASE_DISCOVERY_WAVE_13.md` at `refs/pull/200/head`, in
  full** — B62–B65 with file:line citations at frozen main `b77e9fd2…`.
- **`docs/qa/RELEASE_DECISIONS_20261102.md`** (owner decision list for the
  stack #211–#240).
- **Settings/secrets (Q42):** `backend/core/settings.py` (723 lines) —
  `SECRET_KEY = env('SECRET_KEY')` (env-only, no committed default),
  `DEBUG = env.bool("DEBUG", default=False)`, `ALLOWED_HOSTS` env list
  default localhost **but `ALLOWED_HOSTS = ["*"]` when `DEBUG` is true**
  (`:86–89`), `AHPRA_SOURCE = env('AHPRA_SOURCE', default='scrapingbee')`
  (`:642`), `STRIPE_SECRET_KEY = env(..., default='')`,
  `MOBILE_OTP_DISPLAY_IN_APP` code-gated to local/dev/test/staging
  (`:655–657`), `BILLING_LIVE_DATE = _date(2025, 6, 1)` with the comment
  "June 1, 2026".
- **Admin role/powers (Q37):** `backend/users/models.py`,
  `backend/memberships/access.py`, `backend/workforce/permissions.py`,
  `backend/attendance/kiosk_api.py`, `backend/attendance/credentials.py`,
  `backend/billing/admin.py` — read in full. **`platform_admin`: 0 hits in
  every permission/access file read directly at head** (not just the search
  index) — the 0-hit claim is now confirmed by direct reads. Admin power is
  Django `is_staff`/`is_superuser` only.
- **B62/B63/B64/B65 mechanism (Q44/Q45):** `backend/organizations/access.py`
  (`user_can_manage_pharmacy`, `managed_pharmacies`),
  `backend/shifts/base.py` (`check_permissions`, `calculate_rates`
  exemption), `backend/attendance/credentials.py` (pairing-code + PIN-OTP
  notification code, OTP region) — read at head.
- **Account deletion (Q40):** `backend/users/api_account.py`
  (`DeleteAccountView`), `backend/users/account_deletion.py`
  (`_anonymize_user`, `_delete_verification_docs_for_user`,
  `_revoke_user_sessions`, `_revoke_user_tokens`),
  `backend/talent/account_cleanup.py` — read at head.
- **Policy/terms/deletion pages (Q41):** Vite `PrivacyPolicyPage.tsx`
  (299 lines), `TermsOfServicePage.tsx`, `AccountDeletionPage.tsx`;
  Next app-router privacy page (thin wrapper) and Next migrated
  `PrivacyPolicyPage.tsx` (diffed against the Vite copy — body identical,
  shell differs).
- **Admin audit trail (Q38):** repo-scoped searches `audit_log` (0 hits),
  `suspend` (35 hits, all AHPRA/contextual — no incident-ladder workflow),
  `kiosk_code` (0 hits), `platform_admin` (0 hits).
- **Adopted verdicts (not re-traced):** GM-18 senior-reviewed (PASS)
  verdicts for Q01–Q04 (identity leak — STILL VALID), Q05 (hidden/stale —
  CHANGED partial), Q27 (ratings — CHANGED partial), Q29 (booking-permission
  drift — persists in a new shape), Q30 (full download — STILL VALID), Q31
  (legacy penalty route — STILL VALID), Q34 (subscriber discount — CHANGED
  partial), Q35 (AHPRA refresh — CHANGED partial); GM-01 verdicts for the
  Q08/Q09 gate slice (mobile-verification gate already implements option B);
  GM-17 verdicts for Q21/Q28 (no credit notes, no refunds in-app, no void
  action); GM-25 re-trace for Q47/Q48 (onboarding parity).

### What remains NOT RE-VALIDATED (Oct 2026 text carried, do not quote as current)

Q07 (ID scope), Q12/Q13 (unconfirmed/suspended registration outcomes —
state machine exists per GM-18, Q-specific outcomes not re-checked), Q14
(indemnity), Q15/Q16 (pharmacy anonymity), Q17 (availability visibility),
Q18 (urgent alerts), Q19 (block list), Q20 (direct-hire rule), Q22–Q26
(disputes/appeals/suspension/incidents — no sanction workflow found by
search, but the workflows were not opened), Q33 (GST treatment). Q08/Q09
are CHANGED (partial) by adoption; their remaining halves are noted in §3.
Q43 (pentest) is UNKNOWN — no pentest, security review, or
vulnerability-disclosure process was evidenced in any fetched material.

### Already-published release evidence (fetched fresh this session, PR bodies — not re-traced)
- **PR #200 — PRODUCTION NO-GO (25 Oct 2026, frozen main `b77e9fd296bc2710350ef6f3cd402ce2529ffc06`):**
  DRAFT / AUDIT ONLY / NOT RELEASE READY. 226 finding IDs (71 B-series + 155 C/F); 45 exercised
  with targeted negative tests; 53 cumulative expected-red negative safety assertions.
  99% independent semantic S2 acceptance **NOT CERTIFIED** (needs ≥2,128/2,149 whole-file reviews).
  14 F12 source comparisons have **not proved Vite/Next/Expo authenticated parity**.
  Still-blocking gates: S2 minimum, PG two-connection concurrency, 226-ID root adjudication,
  F12 executable client parity, final cross-domain acceptance. Finish pass: 139 new candidates
  (3 P0, 95 P1, 41 P2), all unconfirmed; 1,134/2,151 paths read in full (52.7%).
- **PR #200 waves most relevant to GM-26 (from the PR body + WAVE_13 doc, read in full this re-run):**
  - B58 (cond. P1): worker-controlled `mark-paid` shortcut can surface a never-delivered
    internal invoice in a pharmacy's received/approval workflow.
  - B62–B65 (wave 13): cross-tenant role/capability mismatch for communication-only
    Region Admin shift actions; conditional native pairing-code downgrade; **persistent
    notification exposure of kiosk codes / worker PIN OTP**; caller-scoped pricing-preview leakage.
  - B66–B71 (wave 14): overnight cancellation penalty negative wages; generic accepted-offer
    deletion; fallback to customer for unknown Stripe subscription invoice; repeated
    cancellation penalty checkouts; duplicate recurring base/addon sessions; committed offer
    acceptance followed by notification error.
  - `.github/workflows/pr200_readonly_static_audit.yml` (`contents: write`,
    `workflow_dispatch`) must not reach main as-is.
- **PR #249 body (4–5 Nov 2026) + mobile ledger at head:** shared-core suite on `a7ad728e` was **445 passed / 1 failed**
  (test-harness mock gap, addressed by `db5b4e51`); ledger 4 Nov 2026 W3 closeout: **447 passed / 1 failed**
  on the handover head (test-only import typo, fixed test-only by `0384a3d5`); **exact-head CI must still pass
  before W3b closes**; **reverification on latest head required**, all latest CI conclusions must be checked.
  **Not performed:** native emulator/device screenshots, real iOS/Android SDK 58 builds, authenticated
  real-backend acceptance, full isolated QA, independent Codex/Claude review, store readiness.
  **No merge/deploy/Stripe/email/OTA or live service changes authorized or performed.**

## §1 — GM-26 traced flow

Scope: platform admin tools and permissions; privacy (what personal data is shown to whom,
anonymity, retention/deletion, Australian Privacy Principles); security (auth, permissions,
secrets, DEBUG/ALLOWED_HOSTS, pentesting); release readiness (launch gates, CI, staging deploy,
migration rehearsal, PR #200 NO-GO, Issue #250 launch gate).

Actors: anonymous visitor · signed-in worker (pharmacist / other staff / Explorer) · pharmacy
owner · pharmacy/organisation manager · Region Admin · platform admin/support/finance (Django
staff/superuser) · kiosk (unattended device) · system (scheduled jobs, Stripe/email webhooks).

### 1A — What the file reads establish (at `refs/pull/249/head`)

| Area | Evidence (file:line at head) | What it proves |
|---|---|---|
| No `platform_admin` role | 0 hits for `platform_admin` in `backend/users/models.py`, `backend/memberships/access.py`, `backend/workforce/permissions.py`, `backend/attendance/kiosk_api.py`, `backend/attendance/credentials.py` (direct reads); repo-scoped search 0 hits | **CONFIRMED:** no dedicated platform-admin role/symbol. Platform administration is Django `is_staff`/`is_superuser` only. |
| Staff/superuser gates | `backend/memberships/access.py:17` — `is_staff` or `is_superuser` bypass; `backend/workforce/permissions.py:6` — superuser bypass (`_is_owner_or_superuser`); `backend/attendance/kiosk_api.py:112` — `if not request.user.is_superuser:` gate; `backend/attendance/credentials.py:88` — `if user.is_superuser:` branch; `backend/users/models.py:19–29` — superuser creation sets both flags | Backend gates reference Django staff/superuser in users, workforce, memberships, attendance/kiosk. Exact rules per endpoint: the cited lines are the rules for those call sites; a full per-endpoint matrix was not built. |
| Django admin | `backend/billing/admin.py` (read): `OwnerSubscriptionAdmin`, `ShiftPaymentAdmin`, `FulfillmentCheckoutAdmin` with a `mark_expired_after_reconciliation` action (permission `reconcile`); admin registrations in 10 apps + billing (path-level, blocked trace) | Admin *registrations* exist per app. Billing admin can reconcile checkouts. No in-product platform-admin console exists in Vite/Next/Expo — `/admin` on both clients is the **pharmacy-admin persona**, not platform administration (see PARITY_MATRIX Admin section; GM-25). |
| Audit trail | Repo-scoped search `audit_log`: **0 hits**. No app-level audit-logging code found. (Django admin's built-in `LogEntry` was not verified in this repo.) | **No audit-trail mechanism evidenced.** Refunds/sanctions/disputes have no workflow at all (Oct 2026), so there is currently nothing to audit — and no log to prove it with. |
| Privacy/terms pages | Vite `PrivacyPolicyPage.tsx` (eff. 15 Jan 2026), `TermsOfServicePage.tsx` (eff. 15 June 2025); Next `(public)/privacy-policy/page.tsx` is a thin wrapper rendering the migrated copy; Vite vs migrated privacy bodies are **identical** (diff is shell/SEO only: `PublicLogoTopBar`+`Container` vs `LegalDocumentShell`) | Policy substance is in sync across Vite/Next. No version numbers (effective dates only); no APP citations in the text; retention section is vague (see Q06/Q41); acceptance logging not evidenced (D2 terms snapshot open per ledger). Expo parity UNKNOWN. |
| Account deletion | `DeleteAccountView.delete` (`backend/users/api_account.py`): immediate soft-delete in one transaction — `_anonymize_user` (sets `is_active=False`, `deleted_at`, unusable password, email → `deleted+{id}@chemisttasker.invalid`, clears names/mobile/OTP flags), deletes device tokens + WS tickets, revokes sessions/tokens, deletes verification-doc files, sends `account_deleted` email. `_anonymize_user` calls `user_features().delete_talent_posts(user)` (talent posts deleted). `backend/talent/account_cleanup.py` holds `delete_user_posts` / `remove_newcomer_posts` helpers. Deletion page (Vite): immediate deactivation, verification documents removed within 7 days, shift history/invoices/audit logs retained "without personal identifiers where possible". | A deletion flow exists and its scope is now traced. **No grace period** — anonymization is immediate. NOT traced: availability rows, chat messages, ratings, memberships on deletion; admin-initiated deletion; re-registration with the same email. |
| Retention schedule | Privacy policy §6 Data Retention: retain "for as long as necessary … unless a longer retention period is required by law or for legitimate business needs" — no per-class schedule. No dedicated retention/deletion-schedule file. | Consistent with Oct 2026 ON-R01 ("no evidence-specific retention or deletion schedule is defined"). **STILL VALID.** |
| Secrets/settings | `backend/core/settings.py` (see §0). `SECRET_KEY` env-only; `DEBUG` default False; `ALLOWED_HOSTS=["*"]` iff DEBUG; `AHPRA_SOURCE` default `scrapingbee`; `MOBILE_OTP_DISPLAY_IN_APP` code-gated. | Repo-side configuration is env-based with safe defaults. **Production env values are UNKNOWN** — the repo cannot show them; a deploy-time check is still required (Q42). |
| B64 notification secrets | `backend/attendance/credentials.py:345–362` (pairing code in notification **body and payload**, plus `kiosk_link_route` containing the code) and `:881–889` (PIN OTP in notification **body and payload `{"otp": otp_code}`**), via `notify_users` (Expo push + WebSocket + DB in-app notification). | **B64 CONFIRMED PRESENT at head** — no longer an audit candidate only. Code expiry still guards redemption; the secret remains readable in notification history after expiry. |
| B63 pairing downgrade | `backend/attendance/credentials.py:370–468` (`redeem_kiosk_pairing_code`): `native` is decided solely by the caller-supplied `platform` string (`windows/macos/linux`); `allowed_client_kind` is checked **only if native**; non-native redemption stores `client_kind="WEB_ONLINE"`. | **B63 CONFIRMED PRESENT at head** — the conditional downgrade path exists. Threat caveat (WAVE_13): the six-digit code is still required, single-use, rate-limited; legacy/web redemption is expected by existing tests. It is a policy mismatch only if native-offline authorizations are meant to be native-only. |
| B62 Region Admin | `backend/organizations/access.py:163–173` (`user_can_manage_pharmacy`): "A Region Admin's M2M assignment alone cannot grant roster authority. Workforce remains the sole capability/organization boundary." — delegates to `pharmacy_features().can_manage_roster_pharmacy`. `managed_pharmacies` (`:175–219`): REGION_ADMIN included **only if `OrgCapability.MANAGE_ROSTER in membership_capabilities(membership)`**. | **B62 CHANGED at head vs frozen main** — the broad boolean grant WAVE_13 described is gone from this function. The docstring ("a chief/region admin assigned to it") is now stale vs the code comment. **Not runtime-proved:** no negative test has been run; `can_manage_roster_pharmacy`'s implementation was not read. |
| B65 pricing preview | `backend/shifts/base.py:115` permission is `IsAuthenticated` only; `check_permissions` (`:129–138`) explicitly exempts `calculate_rates` (and `express_interest`/`reject`/`claim_shift`/`counter_offers`) from the manage-pharmacy requirement: "Allow these actions for authenticated users without requiring 'manage pharmacy'". `user_can_manage_pharmacy` is used for create/update/delete (16 repo callers incl. `offers.py`, `lifecycle.py`, `description_templates.py`). | **B65 permission half CONFIRMED at head.** Pricing-derivation half (calculator loads real pharmacy guide rates) rests on WAVE_13 citations (`lifecycle.py:190–287`, `pricing.py`) — **not re-read at head**. Whether guide rates are private is a policy question (Q45). |
| Release decisions | `docs/qa/RELEASE_DECISIONS_20261102.md` (read): 9 decisions; live shift fulfilment + penalty collection are **closed by default** through server-side capability guards; staging steps listed (back up DB, apply migrations attendance 0007 / billing 0005, record SHA + rollback artefact, test-mode provider acceptance). `PUBLIC-CONTENT-IMPLEMENTATION.md`: outstanding gates include restoring deployed migration source + rehearsing clean/staging migrations. | No migration rehearsal or rollback test is evidenced as done. Staging boards failing / NXDOMAIN in Nov 2026 checks (memory, not re-checked). |

### 1B — Current-flow matrix (trigger → actor → backend/API → Vite/Next → Expo → persisted state → event/side effect → recovery/denial)
Status key: **V** = verified at head in this re-run · **A18/A17/A01** = adopted senior-reviewed verdicts ·
**O** = October 2026 evidence only, NOT re-validated · **U** = unknown, not inspected ·
**A** = published audit evidence (PR #200/#249 bodies, WAVE_13).

| # | Trigger | Actor | Backend / API | Vite / Next | Expo | Persisted state / side effect | Recovery / denial | Status |
|---|---|---|---|---|---|---|---|---|
| F-01 | Platform admin opens Django admin | Platform admin (`is_staff`/`is_superuser`) | Django admin per-app `admin.py` (10 apps + billing); billing admin has reconcile action (V) | None — `/admin` is the pharmacy-admin persona, not platform admin | None — same | Django admin edits rows directly; audit trail? None evidenced (V) | Wrong role → Django login/403 (assumed, not verified) | V/U |
| F-02 | Support sanctions a worker (P04/P10 ladder) | Platform only (carried D: P04) | **Not built (Oct 2026).** No incident ledger, no sanction workflow; `suspend` search (35 hits) found only AHPRA/contextual uses, no ladder | No UI (Oct 2026) | No UI (Oct 2026) | No persisted incident/sanction state (Oct 2026) | Appeal: no workflow (CX-Q23/24/25, Oct 2026) | O |
| F-03 | Permanent suspension (5th incident) | Platform admin + human review + legal (P10/CX-Q30) | **Not built (Oct 2026).** Digital Labour Platform Deactivation Code process not designed | — | — | — | No notice/appeal flow (Oct 2026) | O |
| F-04 | Worker / pharmacy views talent board | Any signed-in user (Oct 2026) | Authenticated talent feed/list/detail return anonymous authors' names + user IDs; only public API redacts (LA-Q12) | Vite consumes leaking authenticated API | Expo consumes same API | Anonymous flag on post; identity disclosed pre-consent | No denial — leak is the bug | A18 |
| F-05 | Anonymous pharmacy posts publicly | Owner/manager | Public redaction hides name/street/software/services; shows suburb, rate (PO-Q11, Oct 2026) | Anonymous card | Anonymous card | Post `anonymous` flag | Worker learns name only via 12h reminder email (PO-Q12, Oct 2026) | O |
| F-06 | Worker requests account deletion | Worker (any role) | **V:** `DeleteAccountView.delete` — immediate soft-delete: `_anonymize_user` (is_active=False, deleted_at, unusable password, email → deleted+id@chemisttasker.invalid, names/mobile cleared; talent posts deleted via feature port), device tokens + WS tickets deleted, sessions/tokens revoked, verification-doc files deleted, `account_deleted` email sent. Idempotent if already `deleted_at`. | `AccountDeletionPage.tsx` / `AccountDeletionSection.tsx`; deletion page states timeline + retained classes | `profile.tsx` × 5 roles (paths only — functional parity NOT verified) | Anonymized user row; deleted docs; revoked tokens/sessions | No grace period; availability/chat/ratings/membership rows on deletion UNKNOWN; admin-initiated deletion UNKNOWN; re-registration UNKNOWN | V/U |
| F-07 | AHPRA Suspended/Cancelled | System (PR #183 desktop verifier, Oct 2026) | Auto-cancel future public bookings, pause non-members, email pharmacies + admins (ON-P02, Oct 2026); state machine exists per GM-18 (`verification/state.py`) | — | — | Bookings cancelled; owner demoted to Pharmacy Manager | No fee/refund rule runs (Oct 2026) | A18/O |
| F-08 | Kiosk code / worker PIN OTP sent | System → notification | **V: B64 CONFIRMED at head** — pairing code in notification body + `payload.pairing_code` + `kiosk_link_route` with code (`credentials.py:345–362`); PIN OTP in body + `payload.otp` (`:881–889`); via `notify_users` (Expo push + WebSocket + DB) | — | Push/local notification surface receives the secret | Notification record retains secret indefinitely (no expiry in `Notification` model per WAVE_13) | Rotation/revocation? Code expiry guards redemption, not readability | V |
| F-09 | Region Admin acts on shifts | Region Admin (communication-only) | **V: B62 CHANGED at head** — `user_can_manage_pharmacy` now delegates to `can_manage_roster_pharmacy`; M2M assignment alone cannot grant roster authority; `managed_pharmacies` requires `MANAGE_ROSTER` capability | — | — | — | Denied-role path **not runtime-proved** (no negative test run) | V/A |
| F-10 | Native pairing | Expo native client | **V: B63 CONFIRMED at head** — `native` from caller-supplied `platform`; `allowed_client_kind` checked only if native; else `WEB_ONLINE` | — | Expo pairing flow | Pairing code; `KioskDevice.client_kind` | Downgrade path exists; legacy/web redemption expected by tests | V |
| F-11 | Pricing preview | Caller (any scoped role) | **V: B65 permission half CONFIRMED** — `calculate_rates` exempted from manage-pharmacy check, `IsAuthenticated` only (`shifts/base.py:129–138`); pricing derivation per WAVE_13 (not re-read) | Post Shift calculator forwards pharmacyId/rate inputs (WAVE_13) | Same via shared-core | — | — | V/A |
| F-12 | Release / deploy | Maintainer/owner | CI on PR #249 head: **reverification required** (PR #249 body); ledger: 447/1 on handover head, test-only fix since, W3b exact-head CI gate open; PR #200 NO-GO open; staging deploy state | Staging `staging.chemistasker.com.au` — boards failing / NXDOMAIN in Nov 2026 checks (memory) | No real SDK 58 device build verified | No merge/deploy performed from #249 | Rollback / migration rehearsal: **no rehearsal evidenced** (V — docs list it as outstanding) | A/V |
| F-13 | Secrets / settings | Deploy env | **V:** `SECRET_KEY` env-only; `DEBUG` default False; `ALLOWED_HOSTS=["*"]` iff DEBUG; `AHPRA_SOURCE` default `scrapingbee`; `MOBILE_OTP_DISPLAY_IN_APP` code-gated | — | — | Env config | Production env values UNKNOWN (repo cannot show them) | V/U |
| F-14 | Pentest / security review | External/owner | None evidenced in fetched material | — | — | — | — | U |

**Parity gaps (Web vs Expo) that are evidenced, not assumed:**
- Talent-board booking permissions disagree: mobile allows any non-worker role; web uses a
  narrower allow-list; backend must be authority (LA-Q15/TB-07 — A18, persists in new shape).
- Account deletion UI exists in Expo profiles for all 5 roles and in both web stacks (paths
  only — functional parity NOT verified; backend scope now traced, V).
- Privacy policy substance is identical Vite vs Next-migrated (V); Expo parity UNKNOWN.
- No admin tooling was found in either client; admin is Django-admin-only as far as this
  trace shows — **confirmed at head by direct file reads** (no `platform_admin` symbol;
  no in-product platform console; `/admin` is the pharmacy-admin persona).

## §2 — Decision status per question
- **Re-validated in this re-run (verdict in §3):** Q01–Q04 (A18 STILL VALID), Q05 (A18 CHANGED partial),
  Q06 (V STILL VALID), Q08/Q09 (A01/A18 CHANGED partial), Q10/Q11 (A18 CHANGED partial — Q35),
  Q21/Q28 (A17 adopted), Q27 (A18 CHANGED partial), Q29 (A18 CHANGED new shape), Q30 (A18 STILL VALID),
  Q31 (A18 STILL VALID), Q32 (V STILL VALID — D2 open), Q34 (A18 CHANGED partial), Q35 (A18 CHANGED partial),
  Q36–Q46 (V, first traced to completion here), Q47/Q48 (V, via GM-25 re-trace).
- **NOT RE-VALIDATED (Oct 2026 text carried, §3):** Q07, Q12, Q13, Q14, Q15, Q16, Q17, Q18, Q19, Q20,
  Q22, Q23, Q24, Q25, Q26, Q33. Q43 is UNKNOWN (no pentest evidenced).
- **Carried decisions that touch GM-26 (from #184 `carried`, Oct 2026 — also NOT re-validated):**
  P04 (platform-only sanctions, case by case, scaled by notice; managers only report),
  P10 (worker incident ladder: 1st warning; 2nd 14 days no applying; 3rd 28 days + badge;
  4th 56 days; 5th permanent after human review; cap 6 months), P05/P06 (chain/org + public
  late-cancel/no-show handling), NOPEN (no money penalties for workers, ever),
  E01 (audience order; owner may post anonymously to public).
- **PR #200 NO-GO and PR #249 DRAFT/NOT MERGE-READY are the governing release facts** until
  a fresh CI/staging check clears them; they are not owner decisions, they are audit verdicts.

## §3 — Full question queue (#184 format, numbered)
Conventions per question: **ACTUAL TODAY** = Oct 2026 `questions.json` text unless marked
otherwise — **NOT RE-VALIDATED** where so marked. **RECOMMENDED** = #184 recommendation (Oct 2026)
unless a re-validation note says otherwise. **ALTERNATIVE A** = Keep-current-logic where it exists.
**ALTERNATIVE B/C** = realistic alternatives with worker/pharmacy/platform scenarios. **Other / defer** on every question.
Plain English first. Normal case, edge case, retry/concurrency, denied role / wrong tenant,
payment/notification side effects, and Web/Expo difference are called out per question where
the Oct 2026 text supports them; where they were never traced they are marked UNKNOWN.
Severity: P0 = launch-blocking privacy/safety/legal · P1 = launch-blocking or high-risk ·
P2 = should-fix soon after launch.
Verdict key: **V** = re-validated at head in this re-run · **A18/A17/A01** = adopted senior-reviewed verdicts ·
**O** = Oct 2026 only, NOT re-validated · **U** = unknown.

### GM-26 old questions (from #184)

#### GM26-Q01 — [P0 · decision] Who can see the talent board, and are anonymous candidates really anonymous?
- **Verdict: STILL VALID — A18 (adopted GM-18, senior PASS, verified at head `97c4543e…`).**
  `backend/talent/serializers/explorer.py`: `ExplorerPostReadSerializer` exposes `explorer_name` (via
  `get_full_name()`, first name only if `under_18`), `author_user_id`, `explorer_user_id`,
  `explorer_profile`, plus skills/software/travel/AHPRA years. `PublicExplorerPostReadSerializer`
  redacts those fields only when `is_anonymous` is true. The write serializer's `validate()` contains
  **no scrubbing** of free text — the "don't add contact details" warning is UI-only.
- **ACTUAL TODAY:** Any signed-in account can read talent posts, including other workers. Logged-out visitors can read public cards; anonymous posts have identity redacted only on the public API, not authenticated reads used by both apps. (TB-Q01, gap TB-02)
- **RECOMMENDED:** B — Restrict authenticated discovery to authorised hiring roles and each author; keep public discovery only if masking is enforced server-side.
- **ALTERNATIVE A (Keep current logic):** All accounts see identities; public sees masked cards. *Scenario:* a competing pharmacist signs in, opens the talent board, and reads a colleague's anonymous post with full name — anonymity is a promise the product breaks. Trade-off: maximum discovery, zero privacy.
- **ALTERNATIVE B:** A — Employers and own post only (owners, managers, organisations; authors see their post). No public board at all. *Scenario:* a small pharmacy chain finds candidates without public exposure, but loses public discovery.
- **ALTERNATIVE C / Other / defer:** Defer the public board; launch talent discovery to hiring roles only.
- **Edge / denial / side effects:** Wrong tenant — a worker from pharmacy A must never see pharmacy B's hiring notes. Retry/concurrency — n/a. Web/Expo — both apps consume the same leaking authenticated API; fix must be server-side, not per-client. Payment/notification — none directly; a booking request sent to a wrongly-identified candidate is a privacy incident.
- **Status:** STILL VALID (adopted GM-18). **Source:** `questions.json` TB-Q01; PR #184 AUDIT gap TB-02; GM-18 senior review §1.

#### GM26-Q02 — [P0 · decision] When is an anonymous candidate's identity revealed?
- **Verdict: STILL VALID — A18 (same leak as Q01; adopted GM-18).**
- **ACTUAL TODAY:** For anonymous posts, public reads redact identity, but any signed-in user receives names and user IDs immediately. Neither app waits for chat, a booking request or offer acceptance. (TB-Q02, gap TB-02)
- **RECOMMENDED:** A — When they accept a booking request (worker chooses to engage).
- **ALTERNATIVE A (Keep current logic):** Reveal to any signed-in user immediately. *Scenario:* as Q01 — identity disclosed before consent.
- **ALTERNATIVE B:** When they reply in chat (earlier). **ALTERNATIVE C:** Only when an offer is accepted (latest — safest, slowest hiring).
- **Other / defer:** Defer reveal until offer acceptance for launch; revisit after first hires.
- **Edge / denial:** A pharmacy that was blocked by the worker (see Q09) must never trigger reveal. Web/Expo — same API, same fix. Notification — the reveal notice itself must not leak identity to the wrong party.
- **Status:** STILL VALID (adopted GM-18). **Source:** TB-Q02.

#### GM26-Q03 — [P0 · decision] What stays hidden before identity reveal?
- **Verdict: STILL VALID — A18 (adopted GM-18; free-text scrubbing absent).**
- **ACTUAL TODAY:** Structured cards omit contact details, street addresses and documents, but authenticated APIs return adults' full names; under-18s get first names. Free-text pitches are not scrubbed. (TB-Q03)
- **RECOMMENDED:** A — Hide identity and contact details: surname, contacts, address, documents — until the reveal point. Scan free text so the rule cannot be bypassed.
- **ALTERNATIVE A (Keep current logic):** Expose adult full names to signed-in users. **ALTERNATIVE B:** Contact details only — show full name before a booking request.
- **Other / defer:** Hide everything except role/rate/availability until reveal.
- **Edge:** A pitch saying "call me on 04xx" bypasses structured masking — free-text scan or manual review needed. Under-18 workers get extra protection (first name only today — confirmed still holds per GM-18).
- **Status:** STILL VALID (adopted GM-18). **Source:** TB-Q03.

#### GM26-Q04 — [P0 · code gap, timing decision] Fix before launch? Anonymous talent posts expose full names to any signed-in account.
- **Verdict: STILL VALID — A18 (adopted GM-18).**
- **ACTUAL TODAY:** Authenticated talent feed, list and detail serializers return anonymous authors' names and user IDs. Only public reads mask them; both apps consume the leaking authenticated API. (LA-Q12, gap TB-01)
- **RECOMMENDED:** A — Before launch, with server-side masking and a consent-based reveal.
- **ALTERNATIVE A:** Before launch (must be done before the first real booking). **ALTERNATIVE B:** Soon after launch (within the first month). **ALTERNATIVE C:** Not needed (accept the risk / drop anonymous posting).
- **Why P0:** This is the same leak as Q01–Q03 stated as a fix-timing decision; launching with it means launching a privacy promise the product breaks, with APP 6 (use/disclosure) and APP 11 (security) exposure.
- **Status:** STILL VALID (adopted GM-18). **Source:** LA-Q12.

#### GM26-Q05 — [P1 · code gap, timing decision] Fix before launch? Hidden, stale and lapsed-credential posts can still be read.
- **Verdict: CHANGED (partial) — A18 (adopted GM-18).** At the #184 head there was NO `get_queryset` override — `_visible_posts` ran only inside `feed` / `public_feed` / `by_profile`, so default `list`/`retrieve` really did bypass the filter (old claim true in Oct 2026). On `main` and PR #249 head, `get_queryset` filters every non-write action through `_visible_posts` → `post.is_talent_board_visible(today)` (`backend/talent/models.py`: `hidden_at` → invisible; past latest-availability date → invisible). **Hidden/stale part is now fixed.** The lapsed-credential part is still open: `is_talent_board_visible` checks nothing about Verified/AHPRA status, so a post whose author lost Verified / lapsed AHPRA stays readable.
- **ACTUAL TODAY (Oct 2026, superseded in part):** Feed visibility hides moderated or past-dated posts, but list/detail reads bypass it. Revoked Verified or lapsed AHPRA doesn't hide posts. Cards show register status, and paused workers' posts stay listed. (LA-Q13, gap TB-03)
- **RECOMMENDED:** A — Before launch. Enforce visibility and current eligibility consistently. (Now: the remaining half is the lapsed-credential re-check.)
- **ALTERNATIVES:** A before launch / B soon after / C not needed.
- **Edge:** A worker suspended mid-booking keeps a live post that pharmacies can still open and request — the exact case ON-P02 was meant to stop.
- **Status:** CHANGED (partial — adopted GM-18). **Source:** LA-Q13.

#### GM26-Q06 — [P1 · decision] How long should verification evidence be kept? (retention / APP 11)
- **Verdict: STILL VALID — V (re-validated at head).** Privacy policy §6 Data Retention (Vite `PrivacyPolicyPage.tsx`, read at head): retain "for as long as necessary to provide the services … unless a longer retention period is required by law or for legitimate business needs" — **no per-class schedule, no deletion dates**. No dedicated retention/deletion-schedule file exists. Deletion-page text adds only that verification documents are removed within 7 days of account deletion. The Oct 2026 claim stands.
- **ACTUAL TODAY (Oct 2026):** Verification files are stored, but no evidence-specific retention or deletion schedule is defined. Each AHPRA lookup also keeps a register snapshot with no deletion date. (ON-R01, gap ON-12)
- **RECOMMENDED:** A — Delete after verification; keep result, source and audit dates only. APP 11 requires destruction or de-identification when information is no longer needed.
- **ALTERNATIVE A (Keep current logic):** Retain files without a defined deletion trigger. *Scenario:* a data breach exposes years of ID documents the platform no longer needed — breach impact multiplied, APP 11 breach. **ALTERNATIVE B:** Keep seven years (higher breach impact; needs legal basis — e.g. tax/employment records genuinely require it; ID photos generally do not).
- **Other / defer:** Set evidence-class schedules (ID docs vs AHPRA snapshots vs payroll records) after legal advice; do not launch with "keep everything forever" as the silent default.
- **Edge:** A worker deletes their account — does the AHPRA snapshot survive for audit? Who decides? Web/Expo — same backend schedule.
- **Status:** STILL VALID (re-validated). **Source:** ON-R01.

#### GM26-Q07 — [P1 · decision] Who must pass an ID check?
- **ACTUAL TODAY (Oct 2026, NOT re-validated):** ID is only required for overseas Explorers who skip the mobile check. A setting can add ID to Verified for everyone, but it is off by default; OCR works for all. (ON-Q08)
- **RECOMMENDED:** A — Every worker before first booking (one check, reused for every pharmacy).
- **ALTERNATIVE A (Keep current logic):** ID only for overseas Explorers. **ALTERNATIVE C:** Pharmacists and ABN workers only.
- **Scenario:** Without ID checks, a person can work shifts under another pharmacist's credentials; the pharmacy discovers it only after a patient-safety incident. With universal ID, onboarding is slower but impersonation risk falls sharply.
- **Status:** NOT RE-VALIDATED. **Source:** ON-Q08. (GM-02 owns the credential mechanics.)

#### GM26-Q08 — Browse access before full verification
- **Status:** Answered: KEEP, launch grill, 23 Oct 2026 - see GM01-Q04 for the single re-confirmation.
- **Actual today:** The worker dashboard requires email and mobile verification. Anonymous browsing stays open on public boards (`main:frontend_web/src/components/ProtectedRoute.tsx:26`).

#### GM26-Q09 — Verification on outside bookings
- **Status:** Answered: B, check every outside booking, launch grill, 23 Oct 2026 - see VERIFY-GATE-01. Engineering: see BL-01.
- **Actual today:** The shared verification guard skips non-public shifts (`pr257:backend/onboarding/verification/state.py:174`).

#### GM26-Q10 — [P1 · decision] How should AHPRA be re-checked after sign-up?
- **Verdict: CHANGED (partial) — A18 (adopted GM-18; see Q35).** The new `verification/state.py` state machine exists; default source is still `scrapingbee` (confirmed by me at head, `backend/core/settings.py:642`); no synchronous fresh lookup runs before booking; `queue_public_recheck` returns early unless source is `desktop`.
- **ACTUAL TODAY (Oct 2026):** One lookup at sign-up stores status, type and expiry. Workers can press Re-check hourly; a public apply/accept after the stored expiry queues a recheck afterwards. No scheduled scan. (ON-Q06, gap ON-02)
- **RECOMMENDED:** A — Daily scan plus acceptance: rescan workers with upcoming bookings daily; check again at acceptance.
- **ALTERNATIVE A (Keep current logic):** Re-check button + recheck after expiry. **B:** Acceptance check only. **C:** Weekly register scan.
- **Status:** CHANGED (partial — adopted GM-18). **Source:** ON-Q06. See also Q11/Q35.

#### GM26-Q11 — [P1 · decision] Which AHPRA lookup should run at launch? (ScrapingBee vs desktop verifier)
- **Verdict: CHANGED (partial) — A18 (adopted GM-18; see Q35).** The desktop-verifier state machine now exists, but the default source is still `scrapingbee` (`settings.py:643–644` at head, confirmed by GM-18 and by me at `:642`).
- **ACTUAL TODAY (Oct 2026):** ScrapingBee looks up the register once at sign-up. Setting the desktop source enables Re-check, suspension and not-found handling; checks wait for the office PC, and admins are emailed after 15 minutes. (ON-P03)
- **RECOMMENDED:** A — Desktop verifier (only the desktop source feeds PR #183's suspension, not-found and Re-check handling; under ScrapingBee those gates stay inert). Run it on staging first.
- **ALTERNATIVE A (Keep current logic):** ScrapingBee, one lookup at sign-up; PR #183's suspension handling stays inactive.
- **Risk:** Desktop verifier = a single office PC that must stay on; if it is off, new sign-ups wait and suspension handling stalls. That is an operational single point of failure the owner must accept explicitly.
- **Status:** CHANGED (partial — adopted GM-18). **Source:** ON-P03.

#### GM26-Q12 — [P1 · decision] If current registration cannot be confirmed, what happens to future bookings?
- **ACTUAL TODAY (Oct 2026, NOT re-validated):** Not-found, unreadable or rejected AHPRA results revoke Verified and block new public applications; existing bookings stay and the pharmacy is not told. Suspended/non-General results cancel future public bookings. (ON-Q07, gap ON-02)
- **RECOMMENDED:** C — Block new; review booked: support verifies status and helps both sides.
- **ALTERNATIVE A (Keep current logic):** Block new public applications; keep bookings; warn nobody. **B:** Cancel automatically (fast, risks cancelling during renewal). **A:** Keep bookings, warn both.
- **Scenario:** A pharmacist renewing late shows "not found" for 48 hours; auto-cancel strands a pharmacy, while silence leaves a possibly-unregistered pharmacist on shift.
- **Status:** NOT RE-VALIDATED. (The `verification/state.py` state machine exists per GM-18, but the Q12-specific outcomes — keep bookings, warn nobody — were not re-checked.) **Source:** ON-Q07.

#### GM26-Q13 — [P1 · decision] When the register shows Suspended or Cancelled, what happens?
- **ACTUAL TODAY (Oct 2026, NOT re-validated):** Future public bookings are cancelled and pharmacies told; non-member workers are paused account-wide; admins are emailed. Owners become Pharmacy Managers. A non-General result cancels bookings without pausing. No fee or refund rule runs. (ON-P02)
- **RECOMMENDED:** KEEP — Working while suspended is unlawful; fast cancellation gives pharmacies time to refill. Settle any paid booking fee under CX-Q20.
- **ALTERNATIVE A (Keep current logic):** as above. **B:** Admin confirms, then cancel (block new bookings at once; cancel only after a person checks).
- **Edge:** Paid booking cancelled by the platform — who refunds the pharmacy, and does the worker get cancellation pay? Unanswered in Oct 2026 text.
- **Status:** NOT RE-VALIDATED. **Source:** ON-P02.

#### GM26-Q14 — [P1 · decision] Which workers must prove professional indemnity cover?
- **ACTUAL TODAY (Oct 2026, NOT re-validated):** No insurance field, evidence, expiry or booking gate exists. (ON-Q09, gap ON-03)
- **RECOMMENDED:** B — All practising pharmacists (general, limited or provisional; own or third-party cover).
- **ALTERNATIVE A (Keep current logic):** Collect no insurance evidence. **A:** ABN pharmacists only. **C:** Badge only (show cover, never gate bookings).
- **Scenario:** An uninsured locum makes a dispensing error; the pharmacy and the platform face the claim with no cover evidenced.
- **Status:** NOT RE-VALIDATED. **Source:** ON-Q09.

#### GM26-Q15 — [P1 · decision] On an anonymous public post, what is hidden? (pharmacy anonymity)
- **ACTUAL TODAY (Oct 2026, NOT re-validated):** Anonymous posts show 'Anonymous Pharmacy', suburb, state, postcode, script volume and the rate. Name, street, software and services are hidden from everyone except the pharmacy's managers. (PO-Q11)
- **RECOMMENDED:** KEEP — hides what matters and keeps the suburb workers need to judge travel.
- **ALTERNATIVE A (Keep current logic):** as above. **B:** Also hide suburb (region only).
- **Edge:** In a small suburb, suburb + script volume + rate can identify the pharmacy anyway.
- **Status:** NOT RE-VALIDATED. **Source:** PO-Q11.

#### GM26-Q16 — [P1 · decision] When does an anonymous pharmacy's name reach the worker?
- **ACTUAL TODAY (Oct 2026, NOT re-validated):** The worker never sees the name before accepting: the terms dialog omits it and accept notices say 'Shift in <suburb>'. Cards stay anonymous after booking; the 12-hour reminder email names it. (PO-Q12)
- **RECOMMENDED:** A — In the agreement preview, before the worker accepts.
- **ALTERNATIVE A (Keep current logic):** Worker accepts blind; name surfaces only in the reminder email. **B:** After reservation. **C:** After payment confirms.
- **Scenario:** A worker accepts a shift, travels, and only learns at the door — via an email — which business they agreed to work for. That is not informed consent to the engagement.
- **Status:** NOT RE-VALIDATED. **Source:** PO-Q12.

#### GM26-Q17 — [P1 · decision] Who can see a worker's availability?
- **ACTUAL TODAY (Oct 2026, NOT re-validated):** Only workers can read or edit their raw availability through the API; it drives alerts, recommendations and roster warnings. Pharmacies see copied talent-post dates rather than a live calendar on either app. (AV-Q04, gap AV-06)
- **RECOMMENDED:** B — Opt-in trusted pharmacies: worker chooses staff and favourite visibility.
- **ALTERNATIVE A (Keep current logic):** Raw calendar private; posts hold copied dates. **C:** Opt-in talent card (broader employer visibility).
- **Status:** NOT RE-VALIDATED. **Source:** AV-Q04. (GM-19 owns availability mechanics.)

#### GM26-Q18 — [P2 · decision] Should urgent-shift alerts need a separate opt-in?
- **ACTUAL TODAY (Oct 2026, NOT re-validated):** Both apps show one matching-public-shift notification switch saved on availability rows. No separate urgent-shift consent. (AV-Q08)
- **RECOMMENDED:** KEEP — one matching-shift consent at launch; label urgent messages clearly.
- **ALTERNATIVE A (Keep current logic):** same consent for urgent and ordinary. **B:** Yes, separate urgent opt-in (shifts starting within 24h).
- **Status:** NOT RE-VALIDATED. **Source:** AV-Q08. (GM-22 owns notifications.)

#### GM26-Q19 — [P1 · decision] Can a pharmacy block a worker?
- **ACTUAL TODAY (Oct 2026, NOT re-validated):** Not built yet. (TB-Q09)
- **RECOMMENDED:** A — Yes, private block: worker stops seeing that pharmacy's shifts; never shown publicly.
- **ALTERNATIVE A:** Yes, private block. **B:** No blocking (pharmacy declines each time).
- **Edge:** A blocked worker must not be able to infer the block from a tell-tale empty board; the block must also not leak via talent-board visibility or ratings.
- **Status:** NOT RE-VALIDATED. **Source:** TB-Q09.

#### GM26-Q20 — [P1 · decision] What is the rule for hiring a worker directly, off the platform?
- **ACTUAL TODAY (Oct 2026, NOT re-validated):** Not built yet. (TB-Q10)
- **RECOMMENDED:** A — Permanent hire free; booked shifts stay (shifts found here are booked here).
- **ALTERNATIVE A:** as above. **B:** Conversion fee (like Upwork/Sidekicker). **C:** No rule.
- **Legal/financial:** A conversion fee changes the commercial model and needs terms + GST treatment; "no rule" invites disintermediation disputes.
- **Status:** NOT RE-VALIDATED. **Source:** TB-Q10.

#### GM26-Q21 — [P1 · decision] Who approves refunds and credits? (platform admin finance role)
- **Verdict: adopted GM-17 — no refunds in-app, no credit notes, no void action; no approver exists because no workflow exists.**
- **ACTUAL TODAY (Oct 2026):** Not built yet. Payments can be flagged for reconciliation, but there is no cancellation refund/credit approval workflow. (CX-Q21)
- **RECOMMENDED:** A — Platform finance/support admin, every case, with reason logged.
- **ALTERNATIVE A:** as above. **B:** Automatic by rule, admin for exceptions.
- **Admin gap:** This is the clearest GM-26 admin-tool gap — money cannot move without a named approver, a logged reason, and a permission that is not "any staff member". Note: `backend/billing/admin.py` (read at head) does give Django admin a `mark_expired_after_reconciliation` action on `FulfillmentCheckout` (permission `reconcile`) — reconciliation exists; refund/credit approval does not.
- **Status:** Adopted GM-17 (two-money-systems picture). **Source:** CX-Q21. See also PR #200 B58/B59 (invoice mark-paid / negative-balance candidates).

#### GM26-Q22 — [P1 · decision] Who reviews disputes and appeals?
- **ACTUAL TODAY (Oct 2026, NOT re-validated):** Not built yet. No dispute or appeal workflow exists. Only the platform may sanction (P04). (CX-Q23)
- **RECOMMENDED:** A — Support reviews; a second person appeals (appeal never goes to the first reviewer).
- **ALTERNATIVE A:** as above. **B:** One reviewer does both (simpler, less fair).
- **Status:** NOT RE-VALIDATED. **Source:** CX-Q23.

#### GM26-Q23 — [P2 · decision] How long to appeal, and how fast must support answer?
- **ACTUAL TODAY (Oct 2026, NOT re-validated):** No timings exist. (CX-Q24)
- **RECOMMENDED:** A — 14 days to appeal; answer in 5 (first review within 2 business days).
- **ALTERNATIVE A:** as above. **B:** 30 days to appeal; answer in 10.
- **Status:** NOT RE-VALIDATED. **Source:** CX-Q24.

#### GM26-Q24 — [P1 · decision] Who can see each part of a dispute?
- **ACTUAL TODAY (Oct 2026, NOT re-validated):** No dispute case, evidence classes or access policy exists. (CX-Q25)
- **RECOMMENDED:** A — Summary to both sides; support alone sees sensitive evidence.
- **ALTERNATIVE A:** as above. **B:** Everything to both sides (exposes medical and identity evidence). **C:** Platform only (parties cannot answer the case).
- **Privacy:** Medical certificates and ID evidence in a dispute are the most sensitive data the platform will hold; B would breach APP 6/APP 11 expectations.
- **Status:** NOT RE-VALIDATED. **Source:** CX-Q25.

#### GM26-Q25 — [P1 · decision] What process applies before permanent suspension?
- **ACTUAL TODAY (Oct 2026, NOT re-validated):** Not built yet. P10 requires human review, notice, appeal and legal review, but no workflow exists. (CX-Q30)
- **RECOMMENDED:** A — Code-compliant process: reasons, notice, review, response and appeal (Digital Labour Platform Deactivation Code, where the worker is protected).
- **ALTERNATIVE A:** as above. **B:** Two reviewers plus legal. **C:** One platform admin (fast, one-sided, high risk).
- **Legal:** Deactivation without a fair process is the highest legal-risk admin action in the product; C risks a Deactivation Code breach and reputational harm.
- **Status:** NOT RE-VALIDATED. **Source:** CX-Q30.

#### GM26-Q26 — [P2 · decision] Which events count as an incident? / How far back does the ladder count? / When does the reliability badge disappear?
- **ACTUAL TODAY (Oct 2026, NOT re-validated):** Not built yet — no reviewed incident ledger, no qualifying-cancellation cutoff, no lookback/reset, no badge-clear rule. (CX-Q26, CX-Q28, CX-Q29)
- **RECOMMENDED:** Incidents = no-shows and cancels inside 72h (CX-Q26 A); rolling 12-month lookback (CX-Q28 A); badge clears when fewer than three active incidents remain (CX-Q29 B).
- **ALTERNATIVES:** 24h cutoff (more forgiving) / any cancel after confirmation (strictest); 6-month or lifetime lookback; badge clears after three clear months, or permanent.
- **Admin gap:** Without an incident ledger there is nothing for a platform admin to review, so P04/P10 cannot operate at all — this is a code gap wearing a decision's clothes until the owner picks the cutoffs. A repo-scoped `suspend` search in this re-run (35 hits) found only AHPRA/contextual uses — no incident-ladder workflow.
- **Status:** NOT RE-VALIDATED. **Source:** CX-Q26/Q28/Q29.

#### GM26-Q27 — [P1 · decision] Who can rate, and when? / Should internal roster ratings appear on the public talent board?
- **Verdict: CHANGED (partial) — A18 (adopted GM-18).** Eligibility now requires a past-dated assignment; internal-roster ratings still feed the public talent-board average.
- **ACTUAL TODAY (Oct 2026, superseded in part):** Owners, organisation admins and pharmacy admins can rate assigned workers; workers can rate pharmacies. The write API accepts any assignment, including future, internal or unworked ones. Talent cards average all owner-to-worker ratings, including internal roster assignments; web and mobile show the same aggregate. (CX-Q34, CX-Q35, gap SH-10)
- **RECOMMENDED:** A — After approved timesheet only (no rating when no work happened); keep internal ratings private, separate from marketplace reviews.
- **ALTERNATIVE A (Keep current logic):** Allow relationship ratings after any assignment; continue including internal ratings in the talent-card average. **B (Q34):** After the shift's end time.
- **Privacy/fairness:** An internal employer's private feedback currently shapes a worker's public hireability — that is a disclosure the worker never consented to.
- **Status:** CHANGED (partial — adopted GM-18). **Source:** CX-Q34/Q35.

#### GM26-Q28 — [P2 · decision] Do cancelled, expired and no-show shifts stay in both sides' history?
- **Verdict: adopted GM-17 — history is assignment-based; cancelled/no-show states do not exist as such; expired unpaid offers without assignments do not appear.**
- **ACTUAL TODAY (Oct 2026):** Both sides have assignment-based history filtered by scheduled time. Cancelled and no-show states do not exist; expired unpaid offers without assignments do not appear. (CX-Q36)
- **RECOMMENDED:** A — Yes, both see them with status; reason visible only to the two parties.
- **ALTERNATIVE A (Keep current logic):** Keep assignment-and-time history without complete cancellation/expiry records. **B:** Hidden once cancelled (loses the audit trail).
- **Admin/audit:** Hiding cancellations destroys the evidence base for disputes (Q22–Q24) and sanctions (Q25–Q26).
- **Status:** Adopted GM-17. **Source:** CX-Q36.

#### GM26-Q29 — [P1 · code gap, timing decision] Fix before launch? Web and mobile disagree on Talent Board booking permissions.
- **Verdict: CHANGED (persists in a new shape) — A18 (adopted GM-18, senior-verified at head).** Mobile permits every non-worker role to request bookings; web limits roles and admin status. The shared backend must enforce the final policy regardless of client gates. Web `TalentBoard/index.tsx:313` = fixed 9-role allow-list + `isAdminUser`; mobile `talent-board/index.tsx:313` = any role except EXPLORER / PHARMACIST / OTHER_STAFF, with `canRequestBookingOverride` fallback.
- **ACTUAL TODAY (Oct 2026):** Mobile permits every non-worker role to request bookings; web limits roles and admin status. The shared backend must enforce the final policy regardless of client gates. (LA-Q15, gap TB-07)
- **RECOMMENDED:** A — Before launch. Set one backend hiring-role policy and mirror it in both clients.
- **ALTERNATIVES:** A before launch / B soon after / C not needed.
- **Parity:** This is the cleanest Web-vs-Expo GM-26 parity gap in the queue: two clients, two policies, one backend that must decide.
- **Status:** CHANGED (new shape — adopted GM-18). **Source:** LA-Q15.

#### GM26-Q30 — [P1 · code gap, timing decision] Fix before launch? The talent board downloads every post and filters in the app.
- **Verdict: STILL VALID — A18 (adopted GM-18).**
- **ACTUAL TODAY (Oct 2026):** Both apps fetch every feed page through shared-core, then filter locally; the backend checks post visibility in a Python loop before pagination. No server-side pharmacy-distance or rate filters. (LA-Q14, gap TB-04)
- **RECOMMENDED:** B — Soon after launch is reasonable only for a deliberately small, monitored board; set a measured migration trigger.
- **ALTERNATIVES:** A before launch / B soon after / C not needed.
- **Privacy angle:** Full-feed download means every client receives posts it should never have seen; server-side filtering is a privacy control, not just performance.
- **Status:** STILL VALID (adopted GM-18). **Source:** LA-Q14.

#### GM26-Q31 — [P0 · decision] May cancellation charges launch before Australian legal review?
- **Verdict: STILL VALID — A18 (adopted GM-18).** Legacy penalty route still live (`backend/billing/urls.py:15` routes `charge-penalty/<int:shift_id>/`, GM-18 senior-verified at head). `docs/qa/RELEASE_DECISIONS_20261102.md` #8 (read at head): cancellation charging (`billing/shift_payments.py` `charge_penalty`) is "inherited behaviour: ambient timezone, every assignment on the shift, the submitted slot selection ignored, and no persisted obligation or idempotency key" — before enabling: real cancellation payments. Live fulfilment + penalty collection are closed by default through server-side capability guards.
- **ACTUAL TODAY (Oct 2026):** The approved charge table is not implemented. A separate legacy 10% or 20% checkout remains callable, without evidence of Australian legal review. (LA-R02, gap SH-16)
- **RECOMMENDED:** A — Legal review before launch: review every charge and remedy before enforcement.
- **ALTERNATIVE A:** as above. **B:** Disclosure is enough (launch after showing the table). **C:** Never charge (non-money reliability controls only).
- **Legal:** Since November 2023, proposing, using or relying on unfair standard-form terms can attract major penalties. Clear wording alone does not cure unfairness.
- **Status:** STILL VALID (adopted GM-18 + release decisions). **Source:** LA-R02.

#### GM26-Q32 — [P1 · code gap, timing decision] Fix before launch? Accepted terms don't include the cancellation table or terms version.
- **Verdict: STILL VALID — V (D2 open per mobile ledger at head).** `backend/shifts/engagement.py:739` checks consent booleans but does not validate a reviewed snapshot identifier; `backend/shifts/offers.py:386` rebuilds terms on acceptance, while shared-core sends consent booleans only. D2 remains OPEN; W3 remains OPEN.
- **ACTUAL TODAY (Oct 2026):** Accepted engagement snapshots include a schema version and worker acceptance, but omit the cancellation matrix, platform terms version and pharmacy-side policy acceptance. Both apps use this shared backend record. (LA-Q10, gap SH-09)
- **RECOMMENDED:** A — Before launch. Record versioned, pre-contract acceptance by both sides and obtain Australian legal review.
- **ALTERNATIVES:** A before launch / B soon after / C not needed.
- **Status:** STILL VALID (re-validated via ledger). **Source:** LA-Q10.

#### GM26-Q33 — [P1 · code gap, timing decision] Fix before launch? Booking fees lack explicit GST and tax-invoice treatment.
- **ACTUAL TODAY (Oct 2026, NOT re-validated):** Checkout selects fixed Stripe prices and stores the amount, but no reviewed field or flow states GST treatment or creates a platform tax invoice. (LA-R01, gap SH-15)
- **RECOMMENDED:** A — Before launch: confirm tax treatment, display it and issue compliant records.
- **ALTERNATIVES:** A before launch / B soon after (take payments while tax treatment is unclear) / C not needed.
- **Status:** NOT RE-VALIDATED. **Source:** LA-R01.

#### GM26-Q34 — [P1 · code gap, timing decision] Fix before launch? Subscribers are charged full price, and Stripe price IDs are hard-coded.
- **Verdict: CHANGED (partial) — A18 (adopted GM-18/GM-16).** The subscriber discount is **now applied** ($30/$15, $80/$40); Stripe price IDs are **still hard-coded**. The Oct 2026 "computed but never applied" claim must NOT be carried as current.
- **ACTUAL TODAY (Oct 2026, superseded in part):** Checkout computes subscriber status but always selects the standard locum or permanent Stripe price ID. Those IDs are hard-coded; web and mobile use the same billing endpoint. (LA-Q07, gap SH-03)
- **RECOMMENDED:** A — Before launch (paying subscribers must not be charged the standard tier; environments cannot select independent prices). (Now: the remaining half is environment-independent price IDs.)
- **ALTERNATIVES:** A before launch / B soon after / C not needed.
- **Status:** CHANGED (partial — adopted GM-18). **Source:** LA-Q07.

#### GM26-Q35 — [P1 · code gap, timing decision] Fix before launch? Booking never refreshes AHPRA registration from the public register.
- **Verdict: CHANGED (partial) — A18 (adopted GM-18) + V.** The new `verification/state.py` state machine exists; default source is still `scrapingbee` (`backend/core/settings.py:642`, confirmed by me at head); no synchronous fresh lookup before booking.
- **ACTUAL TODAY (Oct 2026, superseded in part):** A saved AHPRA flag drives Verified. Public gates read the latest stored register check and queue a recheck after expiry; nothing looks up the register before booking. Default source still ScrapingBee. (LA-Q01, gap ON-02)
- **RECOMMENDED:** A — Before launch (desktop source + fresh check before registered-role bookings).
- **ALTERNATIVES:** A before launch / B soon after / C not needed.
- **Status:** CHANGED (partial — adopted GM-18). **Source:** LA-Q01.

### GM-26 new questions (no #184 predecessor — first traced to completion here)

#### GM26-Q36 — [P0 · decision] What is the launch cut for GM-26 — which release blockers must close before the first real user?
- **ACTUAL TODAY (V, at head):** PR #200 verdict is PRODUCTION NO-GO (25 Oct 2026, frozen main `b77e9fd2…`); PR #249 is DRAFT / NOT MERGE-READY / NOT DEPLOYED; shared-core reverification on the latest head is still required (ledger: 447 passed / 1 failed on the handover head, test-only fix since; W3b exact-head CI gate open); no real SDK 58 device build, authenticated real-backend acceptance, or store readiness has been performed. Staging boards were failing / NXDOMAIN in Nov 2026 checks. **New in this re-run:** B64 (kiosk/PIN secrets in notifications) is CONFIRMED PRESENT at head, not a candidate; B63 (pairing downgrade) is CONFIRMED PRESENT; B62's mechanism has changed (see Q45) but has no negative test; B65's permission exemption is CONFIRMED. The P0 talent identity leak (Q04) is STILL VALID. No migration rehearsal or rollback test is evidenced.
- **RECOMMENDED:** No launch (not even limited/early-access) until: (a) the P0 privacy leak (Q04) is fixed server-side and negatively tested; (b) B64 is fixed (no secrets in notifications) and B62/B63/B65 are adjudicated with negative tests, not merely listed; (c) CI is green on the exact launch head; (d) staging boards load reliably; (e) a migration rehearsal and a rollback plan exist. Legal review (Q31) and GST treatment (Q33) close before the first payment, not before the first browse.
- **ALTERNATIVE A:** Launch browse-only (no bookings, no payments) with the NO-GO open — discovery only, talent board masked. **ALTERNATIVE B:** Launch with bookings but no cancellation charges and no sanctions (admin actions stay support-only, manual). **ALTERNATIVE C:** Hold all launch until the full S2/F12 gates in PR #200 are cleared.
- **Other / defer:** Owner names the cut in writing; anything deferred gets a date and an owner, not a shrug.
- **This is the SINGLE FIRST question to ask the owner (see §4).**
- **Launch-cut cross-reference (do NOT write a competing recommendation):** this same launch-cut question is also asked in GM-25 (GM25-Q01) and GM-21 (Q01). Record the question identically in each area and flag it for the parent's single-launch-decision consolidation. GM-26's recommendation (A — no launch until the NO-GO is cleared) is the admin/privacy/security view of the same decision; GM-25's recommendation (B — Vite web + Next public first, Expo after Senior Package Testing) is the parity view. The owner answers once; the areas do not re-decide it separately.

#### GM26-Q37 — [P0 · decision] Who is a platform admin, how do they get the power, and what can they do that nobody else can?
- **ACTUAL TODAY (V, at head):** There is **no `platform_admin` role** — 0 hits in every permission/access file read directly at head, and 0 hits repo-wide. Platform administration = Django `is_staff` / `is_superuser`, granted through Django's user management (creation sets both flags, `backend/users/models.py:19–29`). Powers evidenced: staff/superuser bypass in membership access (`memberships/access.py:17`); superuser bypass in workforce permissions (`workforce/permissions.py:6`); superuser-only kiosk gate (`attendance/kiosk_api.py:112`); superuser branch in attendance credentials (`credentials.py:88`); Django admin per-app registrations (10 apps + billing), including billing reconciliation (`FulfillmentCheckoutAdmin.mark_expired_after_reconciliation`, permission `reconcile`). **No in-product platform-admin console exists** in Vite/Next/Expo — `/admin` on both clients is the pharmacy-admin persona, not platform administration. How a person *gets* staff/superuser (who grants it, two-person rule, shared accounts) is **not documented anywhere found** — no grant process was evidenced.
- **RECOMMENDED:** Name the role explicitly: platform admin = a named person granted Django staff/superuser through a documented, two-person process; list every power (refund/credit approval, sanction, suspension, dispute review, data deletion, AHPRA override) in one permission matrix; no shared admin accounts; every admin action logged with actor, time, reason and before/after.
- **ALTERNATIVE A:** Keep Django-admin-only (no in-product admin screens at launch; support works in Django admin). **ALTERNATIVE B:** Build a minimal in-product admin console (users, disputes, refunds, sanctions) before launch. **ALTERNATIVE C:** Outsource first-line support/admin to a named external party with scoped access.
- **Edge / denial:** A pharmacy manager must never gain admin powers by role confusion (cf. PR #200 B62 Region Admin mismatch); a staff account that is deactivated must lose access immediately; concurrent admin edits to the same dispute must not overwrite each other.
- **Status:** TRACED (V). **Re-validated at:** `backend/users/models.py`, `backend/memberships/access.py`, `backend/workforce/permissions.py`, `backend/attendance/kiosk_api.py`, `backend/attendance/credentials.py`, `backend/billing/admin.py` at refs/pull/249/head.

#### GM26-Q38 — [P1 · decision] What is the audit trail for admin actions, and who can read it?
- **ACTUAL TODAY (V, absence confirmed):** Repo-scoped search `audit_log`: **0 hits**. No app-level audit-logging code was found anywhere in the repo. Django admin's built-in `LogEntry` was not verified in this repo. Oct 2026 text implies refunds/sanctions/disputes have no workflow at all, so there is currently nothing to audit — and no log to prove anything with. The deletion flow does write `deleted_at` and revokes sessions/tokens, but that is a state change, not an audit trail (no actor/reason/before-after record).
- **RECOMMENDED:** Every admin action (sanction, suspension, refund, credit, dispute decision, deletion, AHPRA override, terms change) writes an immutable log entry (actor, target, reason, timestamp, before/after); the log is readable by platform admins and, on request, by the affected user for their own case.
- **ALTERNATIVES:** A — Django admin history only. B — Dedicated append-only audit table + admin viewer. C — No audit log at launch (accept the risk; disputes become unprovable).
- **Status:** TRACED (absence — V).

#### GM26-Q39 — [P1 · decision] What personal data is shown to whom — the full data-sharing map?
- **ACTUAL TODAY (partly traced, V + A18):** Known leaks/exposures now evidenced at head: talent names leak to any signed-in user (Q01–Q04, A18); pricing preview lets any authenticated caller derive a pharmacy's guide rates (Q45/B65, permission half confirmed); kiosk codes and PIN OTPs persist in notifications readable via the per-user notification API, WebSocket and push (Q44/B64, V); internal-roster ratings feed the public talent-board average (Q27, A18); availability is private to the worker, pharmacies see copied talent-post dates (O). **Never traced end to end:** chat, hubs, kiosk, emails, invoices, payroll exports — the full field × viewer-role × client map does not exist.
- **RECOMMENDED:** Publish one data-sharing map (field × viewer role × client) as a launch document; every new field added later must state its viewers before it ships.
- **ALTERNATIVES:** A — Map it now, fix leaks before launch. B — Fix the known talent leak only; map the rest after launch. C — No map; rely on per-screen judgement.
- **Status:** PARTLY TRACED — full map UNKNOWN; needs a field-by-field trace of serializers + clients.

#### GM26-Q40 — [P1 · decision] Account deletion: what is deleted, what is kept (and why), and how long does it take?
- **ACTUAL TODAY (V, traced at head):** `DeleteAccountView.delete` (`backend/users/api_account.py`): authenticated user, idempotent if already `deleted_at`. In one transaction: `_anonymize_user` (sets `is_active=False`, `deleted_at=now`, unusable password, email → `deleted+{id}@chemisttasker.invalid`, clears first/last name, mobile number, OTP code/timestamps, `is_mobile_verified=False`; **deletes talent posts via `user_features().delete_talent_posts(user)`**), deletes device tokens + WS tickets, revokes sessions/tokens, deletes verification-doc files (`_delete_verification_docs_for_user`: clears `government_id`, `identity_secondary_file`, `government_id_type`, `identity_meta` on all four onboarding models and deletes the stored objects on commit). Then sends the `account_deleted` email. The Vite deletion page states: immediate deactivation and sign-in blocked; verification documents removed within 7 days; shift history, invoices and audit logs retained "without personal identifiers where possible". **No grace period exists** — anonymization is immediate. **NOT traced:** availability rows, chat messages, ratings, memberships on deletion; admin-initiated deletion; re-registration with the same email; whether `delete_user_posts` in `talent/account_cleanup.py` is the function the feature port calls (likely path, not confirmed).
- **RECOMMENDED:** Soft-delete with a stated grace period (e.g. 30 days), then hard-delete personal data; retain only what law requires (tax/invoice records, AHPRA audit result — not ID images) with a named retention per class (see Q06); confirm by email; deletion must cascade to talent posts, availability, chat history handling, and notification records — or state explicitly what survives and why. (Note: the code currently deletes immediately with no grace — the recommendation is a change, not a description.)
- **ALTERNATIVE A:** Immediate hard delete (simplest; destroys dispute/audit evidence). **B:** Soft-delete only, never hard-delete (APP 11 risk). **C:** Manual support-handled deletion at launch.
- **Edge:** A worker with a live booking or an open dispute deletes their account mid-case; a pharmacy deletes while owing a booking fee; a deleted user re-registers with the same email.
- **Status:** TRACED (V). **Re-validated at:** `backend/users/api_account.py`, `backend/users/account_deletion.py`, `backend/talent/account_cleanup.py`, `frontend_web/src/pages/AccountDeletionPage.tsx` at refs/pull/249/head.

#### GM26-Q41 — [P1 · decision] Privacy policy / terms: are they APP-compliant, versioned, and shown on Expo as well as web?
- **ACTUAL TODAY (V, traced at head):** Pages exist on Vite and Next (`PrivacyPolicyPage.tsx` eff. 15 Jan 2026; `TermsOfServicePage.tsx` eff. 15 June 2025; Next app-router pages are thin wrappers rendering the migrated copies via `PublicEntry`). **Vite vs Next-migrated privacy bodies are byte-identical in substance** (diff is shell/SEO only: `PublicLogoTopBar`+`Container` vs `LegalDocumentShell`, different social image) — the twin-drift doc correctly lists the file as divergent, but the divergence is presentation, not policy text. **Gaps:** no version numbers (effective dates only); **no APP citations** in the policy text (grep found no "APP" references); retention section is vague (see Q06); policy changes are announced only by "a revised effective date"; **acceptance logging not evidenced** — the register flow requires `accepted_terms` (GM-01), but versioned acceptance (which terms version, when, by whom) is not evidenced, and D2 (immutable terms snapshot) is OPEN per the ledger. **Expo parity UNKNOWN** — whether Expo links/shows the same documents was not verified (Expo `welcome.tsx` / `register.tsx` matched the `privacy` search in the blocked trace; content not inspected).
- **RECOMMENDED:** One versioned policy + terms set, identical substance on Vite, Next and Expo; acceptance logged with version + timestamp for both sides (worker and pharmacy — see Q32); material changes trigger re-acceptance; the collection notice (APP 5) is shown at sign-up, not buried.
- **ALTERNATIVES:** A — Web only at launch; Expo links out to web. B — Same documents in-app on all three clients. C — Launch with the current pages as-is (content unreviewed).
- **Status:** TRACED (V, web) — Expo UNKNOWN; APP-compliance review NOT done (needs qualified review, not a code trace).

#### GM26-Q42 — [P0 · security, decision + code gap] Secrets, DEBUG and ALLOWED_HOSTS: what is the production configuration, and who can see it?
- **ACTUAL TODAY (V, `backend/core/settings.py` at head, 723 lines):** `SECRET_KEY = env('SECRET_KEY')` (`:23`) — env-only, no committed default. `DEBUG = env.bool("DEBUG", default=False)` (`:26`) — safe default. `ALLOWED_HOSTS = env.list("ALLOWED_HOSTS", default=["localhost", "127.0.0.1"])` (`:28`) — **but `if DEBUG: … ALLOWED_HOSTS = ["*"]`** (`:86–89`), with dev CORS/CSRF origins widened alongside. `STRIPE_SECRET_KEY = env('STRIPE_SECRET_KEY', default='')` (`:671`). `MOBILE_OTP_DISPLAY_IN_APP` is code-gated (`:655–657`): `env.bool(...) and APP_ENV in {local, dev, development, test, staging}` — cannot be on in production via the default (GM-01 senior-review correction). `AHPRA_SOURCE` default `scrapingbee` (`:642`). Non-production `APP_ENV` values raise unless `DJANGO_CACHE_URL` is set (`:197`). **What the repo cannot show:** the actual production env values — whether production really runs `DEBUG=False` with a real `SECRET_KEY` and a host allow-list is UNKNOWN and needs a deploy-time check, not a code read. No committed secrets were found in the files read (no `.env` was read; none was sought — see Q43 note).
- **RECOMMENDED:** `SECRET_KEY`, Stripe keys, email credentials and AHPRA lookup credentials come from the deployment environment / secret store only — never committed; `DEBUG=False` in production; `ALLOWED_HOSTS` lists only the real hosts; a pre-deploy checklist asserts all three and fails the deploy otherwise.
- **ALTERNATIVES:** A — Env/secret-store only (recommended). B — Committed defaults with production overrides (risky; one missed override exposes DEBUG). C — Defer to first deploy review (not recommended for a product handling ID documents).
- **Status:** TRACED (V — repo side). Production values UNKNOWN.

#### GM26-Q43 — [P1 · security, decision] Has anyone pentested this, and what is the vulnerability-handling process?
- **ACTUAL TODAY:** UNKNOWN — no pentest, security review, or vulnerability-disclosure process evidenced in fetched material. PR #200 is a code audit (not a pentest) and is explicitly NOT a production exploit proof. WAVE_13 is semantic source review with no HTTP execution. No dependency-scanning evidence was found in the fetched material (CI workflows were not read in this re-run).
- **RECOMMENDED:** Before handling real ID/bank/AHPRA data at scale: an authenticated security review of the public API surface (auth, tenant isolation, IDOR on talent/shift/invoice reads, Stripe webhook verification); a named security contact and a 90-day fix SLA for critical findings; dependency scanning in CI.
- **ALTERNATIVES:** A — Full external pentest before launch. B — Internal authenticated review + dependency scanning at launch; external pentest within 3 months. C — No security review (accept the risk).
- **Status:** UNKNOWN.

#### GM26-Q44 — [P1 · security, code gap] Kiosk codes and worker PIN OTPs in notifications (PR #200 B64)
- **ACTUAL TODAY (V — CONFIRMED PRESENT at head, upgraded from audit candidate):** `backend/attendance/credentials.py:345–362` — the manager pairing code is placed verbatim in the notification **body** ("Your single-use pairing code for {pharmacy} is {code}. Valid for 15 minutes.") **and** `payload.pairing_code`, plus a `kiosk_link_route` containing the code (`/kiosk-link?source=kiosk&pharmacy_id=…&pairing_code={code}`). `credentials.py:881–889` — the worker PIN setup OTP is likewise placed in the notification **body** ("Your verification code to set your counter PIN is {otp_code}.") **and** `payload={"otp": otp_code, "pharmacy_id": …}`. Both go through `notify_users` (Expo push + WebSocket + durable DB in-app notification). Per WAVE_13, `Notification` stores body and JSON payload without expiry, the serializer exposes both through the per-user authenticated REST endpoint, WebSocket consumers forward them unchanged, and the Expo notification screen consumes that content. Code expiry still guards redemption — the code cannot be *used* after expiry — but it remains *readable* in notification history, on previously registered devices, and on existing sockets. Existing test `test_kiosk_pairing_code.py:143–170` explicitly asserts the raw pairing code in a durable notification, so fixing this is an intentional test change requiring product policy.
- **RECOMMENDED:** Secrets must never persist in notification records or logs; kiosk codes and PIN OTPs are single-use, short-lived, and shown only on the device/session that requested them; rotation on suspected exposure.
- **ALTERNATIVES:** A — Remove secrets from notifications entirely (show "code ready — open the app"). B — Keep, but expire notification records within minutes and exclude them from history APIs. C — Defer (accept the exposure).
- **Edge:** A shared tablet shows a notification with a live kiosk code; a worker's phone is lost with notification history intact.
- **Status:** CONFIRMED PRESENT (V). **Source:** PR #200 B64; WAVE_13; `backend/attendance/credentials.py:345–362, 881–889` at refs/pull/249/head.

#### GM26-Q45 — [P1 · security, code gap] Region Admin cross-tenant shift actions; native pairing-code downgrade; pricing-preview leakage (PR #200 B62/B63/B65)
- **ACTUAL TODAY (V — adjudicated at source level at head; no runtime tests run):**
  - **B62 — CHANGED.** At frozen main `b77e9fd2…` (WAVE_13), `organizations.access.user_can_manage_pharmacy` granted any assigned `REGION_ADMIN` regardless of `admin_level`, while `managed_pharmacies` omitted all region-admin scopes. At head `97c4543e…` the function has been rewritten: "A Region Admin's M2M assignment alone cannot grant roster authority. Workforce remains the sole capability/organization boundary." — it delegates to `pharmacy_features().can_manage_roster_pharmacy(user, pharmacy)` (`organizations/access.py:163–173`); `managed_pharmacies` (`:175–219`) now includes a REGION_ADMIN only if `OrgCapability.MANAGE_ROSTER in membership_capabilities(membership)`. The broad grant is gone from this function. **Residual:** the docstring ("a chief/region admin assigned to it") is stale; `can_manage_roster_pharmacy`'s implementation was NOT read; **no negative test has been run** — the WAVE_13 negative test (communication-only Region Admin must be denied POST `/api/v1/shifts/`, accept-user, manual-assign, templates, PATCH) still needs executing.
  - **B63 — CONFIRMED PRESENT.** `redeem_kiosk_pairing_code` (`credentials.py:370–468` at head): `native` is decided solely by the caller-supplied `platform` string; Ed25519 proof is required only when native; `allowed_client_kind` is checked **only if native**; a non-native redemption stores `client_kind="WEB_ONLINE"`. A caller with a valid code may redeem a NATIVE_OFFLINE authorization as WEB_ONLINE without proof. Caveat (WAVE_13): the six-digit code is still required, securely generated, single-use and globally rate-limited; legacy/web redemption is explicitly expected by `test_kiosk_pairing_code.py:186–213`. Conditional policy mismatch only if native-offline authorizations are intended to be native-only.
  - **B65 — CONFIRMED (permission half); pricing half per WAVE_13.** `BaseShiftViewSet.check_permissions` (`shifts/base.py:129–138` at head) explicitly exempts `calculate_rates` from the manage-pharmacy requirement (only `IsAuthenticated`, `:115`). Per WAVE_13, the calculator accepts arbitrary `pharmacyId`, loads the real `Pharmacy`, and returns computed rates from its persisted defaults — a signed-in unrelated account may probe guide rates. `lifecycle.py` / `pricing.py` were NOT re-read at head. Caveat: whether pharmacy default guide rates are private is product policy; if public, record an accepted-design verdict.
- **RECOMMENDED:** Each candidate gets a yes/no adjudication with a negative test (wrong-tenant Region Admin denied; downgraded pairing rejected; pricing preview returns only the caller's scope) before launch; any confirmed one is a launch blocker. (B62's negative test is still required despite the mechanism change; B63/B64 are confirmed present and need the policy decision + fix.)
- **ALTERNATIVES:** A — Adjudicate all three before launch (recommended). B — Adjudicate B62 only; defer B63/B65. C — Accept as candidates without testing.
- **Status:** B62 CHANGED (V, mechanism) / B63 CONFIRMED (V) / B65 CONFIRMED permission-half (V), pricing-half WAVE_13 only.

#### GM26-Q46 — [P1 · release, decision] Staging, migration rehearsal and rollback: what is the deploy path to production?
- **ACTUAL TODAY (V, docs at head):** PR #249: no merge/deploy performed; staging boards failing / NXDOMAIN in Nov 2026 checks (from memory — not re-checked this session). `PUBLIC-CONTENT-IMPLEMENTATION.md` lists as **outstanding rollout gates**: restore deployed migration source files, rehearse clean/staging migrations, verify end-to-end authentication/payment/mobile regressions and actual email delivery, then enable production routing and public reads. `docs/qa/RELEASE_DECISIONS_20261102.md` (read at head) lists staging steps: back up the database first, then apply migrations (attendance 0007, billing 0005); record the deployed SHA and rollback artefact; run test-mode provider acceptance for checkout recovery, replay and refunds. **No evidence was found that any rehearsal, rollback test, or staging deploy from the exact launch head has happened.** The mobile ledger: Senior Package Testing (exact-head Docker/PG/web/mobile acceptance, native physical devices, staging-only provider proof, EAS binary and rollback) not done. Migration baseline: `backend/users/migrations/0001_squashed_baseline.py` exists (referenced in blocked trace; not re-read).
- **RECOMMENDED:** Before launch: a staging deploy from the exact launch head with boards loading; a migration rehearsal on a staging copy (including the squashed baseline); a tested rollback (code + migration) and a named deploy owner; no production data touched by Grill work (per Issue #250 scope freeze).
- **ALTERNATIVES:** A — Full rehearsal before launch. B — Deploy to staging only; rehearse migration the week before launch. C — No rehearsal (deploy and hope).
- **Status:** TRACED (V — docs); live staging check still needed by an agent with browser/deploy access (this subagent cannot do it).

#### GM26-Q47 — [P2 · code gap, timing decision] Fix before launch? Mobile 'add personal profile' drops pharmacist data / sends other staff to not-found; profile progress % doesn't match Verified; payment readiness only visible at acceptance.
- **Verdict (V, via GM-25 re-trace at head):** Pharmacist data-loss **STILL VALID** — `roles/pharmacist/onboarding.tsx` still posts `preferred_hourly_rate`, `minimum_rate`, `overtime_multiplier`, `weekend_premium` (repo-wide: 1 hit each — this file only — plus `overtime_multiplier` in an award table, not a worker profile); bank fields uncertain (see GM25-C08). Other-staff dead-end **CHANGED** — the card now routes to the existing `/otherstaff/profile-basic-info`; the 404 is gone. Progress % **NOT RE-VALIDATED** (`progress.py` not re-read; the % UI still renders on the mobile screen). Payment-readiness visibility **NOT RE-VALIDATED**.
- **ACTUAL TODAY (Oct 2026, superseded in part):** Mobile manager upgrades send pharmacists to a legacy form posting unsupported bank/rate fields; other staff go to a missing onboarding route. Profile progress % doesn't match what Verified needs. Workers only see payment readiness at the moment of accepting. (LA-Q02, LA-Q04, LA-Q05; gaps ON-04/ON-10/ON-11)
- **RECOMMENDED:** A — Before launch for the data-loss/dead-end (LA-Q02); A for progress-vs-Verified mismatch; A for payment-readiness visibility.
- **ALTERNATIVES:** A before launch / B soon after / C not needed (per item).
- **Status:** Mixed — see verdict. **Source:** LA-Q02/Q04/Q05. PR #249 W1/W-AUTH redesign did not remove the legacy pharmacist form.

#### GM26-Q48 — [P2 · decision] Must every onboarding step work on mobile at launch? (parity gate for GM-26-adjacent onboarding)
- **Verdict: CHANGED (partial) — V, via GM-25 re-trace.** Pharmacist add-profile still broken (see Q47); other-staff route now works via `profile-basic-info`; auth steps exist on Expo per GM-01.
- **ACTUAL TODAY (Oct 2026):** Profile tabs match, but mobile 'add personal profile' for managers is broken (see Q47). (ON-Q15, gap ON-04)
- **RECOMMENDED:** A — Full parity on web and mobile.
- **ALTERNATIVE A (Keep current logic):** Mobile manager add-profile stays broken. **B:** Mobile basics, rest links to web.
- **Status:** CHANGED (partial). **Source:** ON-Q15.

## §4 — The SINGLE first decision question to ask the owner first

### GM26-Q36 — What is the launch cut for GM-26: which release blockers must close before the first real user?
**Why this one first:** Every other GM-26 question is a "fix before launch / soon after / not needed" timing call, and none of those timings means anything until the owner defines what "launch" is. The published facts are stark — PR #200 says PRODUCTION NO-GO, PR #249 is DRAFT / NOT MERGE-READY / NOT DEPLOYED, CI on the latest head still needs reverification, and no real device build or authenticated backend acceptance has been done. This re-run strengthens the case: the B64 notification-secret exposure is confirmed present in code at head, the P0 talent identity leak is still valid, and no migration rehearsal or rollback test is evidenced. Asking about anonymity wording or badge windows before settling the launch cut would be deciding the curtains before deciding whether the house is safe to enter.

**Plain-English version for the owner:** "Right now the independent audit says do not launch, and the mobile work isn't merged or tested on a real phone. Before we argue about any single fix, tell me what 'launch' means to you — a browse-only preview, real bookings with no charges, or full launch — and which of the blockers below must be gone before that day."

**Options:**
- **A — No launch until the NO-GO is cleared (recommended).** Close, in order: (1) the anonymous-talent identity leak fixed server-side and negatively tested (GM26-Q04); (2) B64 fixed (no secrets in notifications) and the PR #200 P0/P1 candidates touching GM-26 adjudicated with tests (GM26-Q44/Q45 — B62's negative test still required despite the mechanism change; B63/B65 decided); (3) CI green on the exact launch head; (4) staging boards loading reliably; (5) migration rehearsal + rollback plan; (6) legal review of cancellation charges and GST treatment before the first payment. *Consequence:* slowest to market; safest legally and for privacy; the 22-account testing (Issue #250 order: Grill Me → testing → production) runs on a build that can actually be trusted.
- **B — Browse-only early access.** Public can browse masked boards; no bookings, no payments, no sanctions. Talent board masked server-side; account creation allowed but Verified-gated actions disabled. *Consequence:* marketing and waitlist can start; zero payment/legal exposure; but every "coming soon" promise must be honoured, and the masked board must genuinely be masked (Q01–Q04 still apply).
- **C — Bookings live, but charges and sanctions stay manual/off.** Real bookings with support-only cancellation (no fees charged), no suspensions, refunds by named finance admin only. *Consequence:* real learning fastest; but every cancellation/dispute becomes a manual support case, and the platform carries the operational load with no automated safety net.
- **D — Full launch once CI is green, NO-GO notwithstanding.** *Consequence:* fastest; the owner explicitly accepts the PR #200 audit risk, including unadjudicated P0/P1 candidates — this should be recorded as an explicit risk acceptance, not a silent default.
- **Other (describe) / Defer:** Owner defines a different cut (e.g. one-pharmacy pilot, staff-only pilot), or defers the decision to a named date.

**What the answer unblocks:** the timing (A/B/C) on every LA-* question (Q04, Q05, Q29–Q35, Q47), the admin build order (Q37/Q38), and whether the 22-account testing can start on the current stack at all.

**Launch-cut cross-reference (do NOT write a competing recommendation):** the launch-cut question is also asked in GM-25 (GM25-Q01) and GM-21 (Q01). Record the question identically in each area and flag it for the parent's single-launch-decision consolidation. GM-26's recommendation (A) is the admin/privacy/security view; GM-25's recommendation (B — Vite web + Next public first, Expo after Senior Package Testing) is the parity view. The owner answers once.

## §5 — Code gaps vs decision gaps

### Code gaps (no owner decision needed to describe the fix — just build/fix; owner decides TIMING only)
| ID | Gap | Evidence (this re-run) | Verdict |
|---|---|---|---|
| CG-01 | Authenticated talent API leaks anonymous names + user IDs | LA-Q12 / TB-01; A18 | STILL VALID |
| CG-02 | List/detail reads bypass visibility filter; lapsed Verified/AHPRA doesn't hide posts | LA-Q13 / TB-03; A18 | CHANGED (partial) — hidden/stale fixed; lapsed-credential check still missing |
| CG-03 | Talent board downloads every post, filters in-app; no server filters | LA-Q14 / TB-04; A18 | STILL VALID |
| CG-04 | Web and mobile disagree on Talent Board booking permissions | LA-Q15 / TB-07; A18 | CHANGED (new shape) |
| CG-05 | No fresh AHPRA lookup before booking | LA-Q01 / ON-02; A18 + `settings.py:642` (V) | CHANGED (partial) — state machine exists; default still `scrapingbee`; no sync lookup |
| CG-06 | Subscriber discount computed but never applied; hard-coded Stripe price IDs | LA-Q07 / SH-03; A18 | CHANGED (partial) — discount now applied; IDs still hard-coded |
| CG-07 | No GST / tax-invoice treatment on booking fees | LA-R01 / SH-15 | NOT RE-VALIDATED |
| CG-08 | Accepted terms omit cancellation table, terms version, pharmacy acceptance | LA-Q10 / SH-09; ledger D2 OPEN (V) | STILL VALID |
| CG-09 | Mobile add-profile drops data / dead-ends; progress % ≠ Verified; payment readiness late | LA-Q02/Q04/Q05; GM-25 re-trace (V) | Mixed — pharmacist data-loss STILL VALID; other-staff reroute CHANGED; progress/payment NOT RE-VALIDATED |
| CG-10 | Legacy 10%/20% penalty route still callable | LA-R02 / SH-16; A18 (`billing/urls.py:15`) | STILL VALID |
| CG-11 | **Kiosk/PIN OTP in persistent notifications** | PR #200 B64; `credentials.py:345–362, 881–889` (V) | **CONFIRMED PRESENT at head** (was candidate) |
| CG-12 | Region Admin cross-tenant shift actions | PR #200 B62; `organizations/access.py:163–219` (V) | **CHANGED** — mechanism rewritten; negative test still required |
| CG-13 | Native pairing-code downgrade | PR #200 B63; `credentials.py:370–468` (V) | **CONFIRMED PRESENT at head** (was candidate) |
| CG-14 | Pricing-preview leakage | PR #200 B65; `shifts/base.py:129–138` (V) | **CONFIRMED permission-half**; pricing half per WAVE_13 |
| CG-15 | (Candidate) Worker `mark-paid` surfacing undelivered invoice; negative balance on revised paid invoice | PR #200 B58/B59 | NOT re-traced (audit candidates) |
| CG-16 | No admin audit trail evidenced | `audit_log` search 0 hits (V) | **CONFIRMED ABSENT** (no app-level audit log found) |
| CG-17 | No in-product admin console evidenced (Django admin only) | Direct file reads (V) — no `platform_admin`; `/admin` is pharmacy-admin persona | **CONFIRMED** — Django admin only |
| CG-18 | No incident ledger / sanction workflow | `suspend` search (V) — no ladder workflow found | NOT RE-VALIDATED (absence noted) |
| CG-19 | Secrets in notifications: pairing code in `kiosk_link_route` URL | B64 (V) | CONFIRMED PRESENT (part of CG-11) |

### Decision gaps (owner must choose first — building before the decision wastes the build)
| ID | Gap | Question |
|---|---|---|
| DG-01 | Launch cut / what "launch" means | GM26-Q36 (§4 — ask first) |
| DG-02 | Who is a platform admin and what powers exist | GM26-Q37 |
| DG-03 | Identity reveal trigger + what stays hidden | GM26-Q01–Q03 |
| DG-04 | Verification-evidence retention schedule (APP 11) | GM26-Q06 |
| DG-05 | ID-check scope | GM26-Q07 |
| DG-06 | Gate scope answered. Browse policy has one re-confirmation at GM01-Q04. | GM26-Q08/Q09; VERIFY-GATE-01 |
| DG-07 | AHPRA re-check cadence + lookup source (ScrapingBee vs desktop) | GM26-Q10/Q11 |
| DG-08 | Unconfirmed/suspended registration: warn vs cancel vs review | GM26-Q12/Q13 |
| DG-09 | Indemnity cover scope | GM26-Q14 |
| DG-10 | Anonymous pharmacy: what is hidden, when is the name revealed | GM26-Q15/Q16 |
| DG-11 | Availability visibility (opt-in trusted pharmacies?) | GM26-Q17 |
| DG-12 | Pharmacy block list | GM26-Q19 |
| DG-13 | Direct-hire / off-platform rule | GM26-Q20 |
| DG-14 | Refund/credit approver | GM26-Q21 |
| DG-15 | Dispute/appeal reviewer, timings, visibility | GM26-Q22–Q24 |
| DG-16 | Suspension process (Deactivation Code) + incident cutoffs/lookback/badge | GM26-Q25/Q26 |
| DG-17 | Ratings: gate + internal-vs-marketplace separation | GM26-Q27 |
| DG-18 | History retention of cancelled/expired/no-show shifts | GM26-Q28 |
| DG-19 | Cancellation charges before legal review? | GM26-Q31 |
| DG-20 | Account deletion scope + retained classes + grace period | GM26-Q40 |
| DG-21 | Policy/terms versioning + Expo parity + acceptance logging | GM26-Q41 |
| DG-22 | Secrets/DEBUG/ALLOWED_HOSTS production standard | GM26-Q42 |
| DG-23 | Pentest / vulnerability handling | GM26-Q43 |
| DG-24 | Staging / migration rehearsal / rollback | GM26-Q46 |

## §6 — Documentation matrix and backlog

### Per-question source links
- **Issue #250:** https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/issues/250
- **PR #184 (question source, Oct 2026):** https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/pull/184 —
  `docs/qa/launch-grill/questions.json` @ `c786a4b8182ebf9b505d47cd81980eb3b9851ce3`,
  `docs/qa/launch-grill/AUDIT.md` (35 gaps: 18 code, 17 decision — **re-fetched in full at refs/pull/184/head in this re-run**, 201 lines).
- **PR #249 (re-validation target):** https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/pull/249 —
  head `97c4543e051b43fe30ec7e2e61ad3d69957a918e`. File links below use this SHA; **paths below were read at this SHA in this re-run** (see §0):
  - `backend/core/settings.py`, `backend/users/models.py`, `backend/users/api_account.py`, `backend/users/account_deletion.py`
  - `backend/memberships/access.py`, `backend/workforce/permissions.py`
  - `backend/organizations/access.py`, `backend/shifts/base.py`
  - `backend/attendance/kiosk_api.py`, `backend/attendance/credentials.py`
  - `backend/talent/account_cleanup.py`, `backend/billing/admin.py`
  - `frontend_web/src/pages/PrivacyPolicyPage.tsx`, `frontend_web/src/pages/TermsOfServicePage.tsx`,
    `frontend_web/src/pages/AccountDeletionPage.tsx`
  - `frontend_web/landing_next/app/(public)/privacy-policy/page.tsx`,
    `frontend_web/landing_next/migrated/pages/PrivacyPolicyPage.tsx`
  - `docs/qa/RELEASE_DECISIONS_20261102.md`, `docs/qa/MAIN_RELEASE_DISCOVERY_WAVE_13.md` (at refs/pull/200/head)
- **PR #200 (PRODUCTION NO-GO):** https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/pull/200 —
  frozen main `b77e9fd296bc2710350ef6f3cd402ce2529ffc06`; audit files under `docs/qa/`
  (`MAIN_RELEASE_AUDIT_TRACKER.md`, `MAIN_RELEASE_AUDIT_EVIDENCE.md`,
  `MAIN_RELEASE_PHASE5_FINAL_VERDICT.md`, `MAIN_RELEASE_DISCOVERY_WAVE_12/13/14.md`).
- **PR #248 (Expo base):** https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/pull/248 —
  base SHA at PR #249 read: `c98cf2ef74c6de356cceb8dee3a61dad47b6b843`; handover `docs/mobile/HANDOVER_2026-11-04.md`.
- **Release decisions (main):** `docs/qa/RELEASE_DECISIONS_20261102.md` (read at head in this re-run).
- **Adopted verdicts:** GM-18 senior review (PASS, 2026-11-21); GM-01 (`~/workspace/proactivity/chemisttasker-grill-gm01.md`); GM-17 (refunds/history); GM-25 re-run (this session, Q47/Q48).

### Decision status table
| Question | Status | Severity |
|---|---|---|
| GM26-Q01 – Q04 | STILL VALID (adopted GM-18) | P0 |
| GM26-Q05 | CHANGED (partial — adopted GM-18) | P1 |
| GM26-Q06 | STILL VALID (re-validated) | P1 |
| GM26-Q07 | NOT RE-VALIDATED | P1 |
| GM26-Q08/Q09 | Answered references to GM01-Q04 and VERIFY-GATE-01 | P1 |
| GM26-Q10/Q11 | CHANGED (partial — adopted GM-18) | P1 |
| GM26-Q12/Q13 | NOT RE-VALIDATED | P1 |
| GM26-Q14 – Q20 | NOT RE-VALIDATED (Q14 P1, Q15/Q16 P1, Q17 P1, Q18 P2, Q19 P1, Q20 P1) | — |
| GM26-Q21 | Adopted GM-17 (no refunds in-app) | P1 |
| GM26-Q22 – Q26 | NOT RE-VALIDATED | P1/P2 |
| GM26-Q27 | CHANGED (partial — adopted GM-18) | P1 |
| GM26-Q28 | Adopted GM-17 | P2 |
| GM26-Q29 | CHANGED (new shape — adopted GM-18) | P1 |
| GM26-Q30 | STILL VALID (adopted GM-18) | P1 |
| GM26-Q31 | STILL VALID (adopted GM-18 + release decisions) | P0 |
| GM26-Q32 | STILL VALID (D2 open, ledger) | P1 |
| GM26-Q33 | NOT RE-VALIDATED | P1 |
| GM26-Q34 | CHANGED (partial — adopted GM-18) | P1 |
| GM26-Q35 | CHANGED (partial — adopted GM-18) | P1 |
| GM26-Q36 | TRACED — OPEN, ask first | P0 |
| GM26-Q37 | TRACED (V) — OPEN | P0 |
| GM26-Q38 | TRACED (absence — V) — OPEN | P1 |
| GM26-Q39 | PARTLY TRACED — OPEN | P1 |
| GM26-Q40 | TRACED (V) — OPEN | P1 |
| GM26-Q41 | TRACED (V, web) / Expo UNKNOWN — OPEN | P1 |
| GM26-Q42 | TRACED (V, repo side) / production values UNKNOWN — OPEN | P0 |
| GM26-Q43 | UNKNOWN (no pentest evidenced) — OPEN | P1 |
| GM26-Q44 | CONFIRMED PRESENT (V) — OPEN | P1 |
| GM26-Q45 | B62 CHANGED / B63 CONFIRMED / B65 CONFIRMED (permission half) — OPEN | P1 |
| GM26-Q46 | TRACED (V, docs) — OPEN | P1 |
| GM26-Q47 | Mixed (V via GM-25) — OPEN | P2 |
| GM26-Q48 | CHANGED (partial — V via GM-25) — OPEN | P2 |
| All | OWNER DECISION: none recorded yet | — |

### Implementation backlog — PROPOSED ONLY, after owner answers (nothing here is decided)
Do not start this work until the owner answers §4 (GM26-Q36) and the questions each item depends on.
1. **P0 — Server-side talent masking + consent-based reveal** (depends on Q01–Q04). Negative tests: anonymous author invisible to worker/other-pharmacy/admin roles; reveal only at the chosen trigger; free-text scan. Web + Expo verified separately.
2. **P0 — Remove secrets from notifications (B64)** (depends on Q44): no pairing code / PIN OTP in notification body, payload, or `kiosk_link_route`; update the asserting test (`test_kiosk_pairing_code.py:143–170`) as an intentional policy change; verify no secret persists after expiry/rotation/device removal.
3. **P0 — Launch-gate checklist execution** (depends on Q36): exact-head CI green; staging boards loading; migration rehearsal + rollback rehearsed; B62–B65 adjudication recorded with negative tests.
4. **P0 — Secrets/settings hardening** (depends on Q42): env-only secrets; DEBUG/ALLOWED_HOSTS deploy assertions; rotate any secret ever committed; verify production env values at deploy time.
5. **P1 — Visibility/eligibility enforcement on list/detail, lapsed-credential re-check** (depends on Q05).
6. **P1 — Single backend hiring-role policy, mirrored in Vite/Next/Expo** (depends on Q29).
7. **P1 — Admin permission matrix + audit log** (depends on Q37/Q38): named roles, two-person grant, immutable log, dispute/refund/sanction screens or Django-admin procedure.
8. **P1 — Dispute/appeal workflow + incident ledger + suspension process** (depends on Q22–Q26): second reviewer on appeal, evidence classes, Deactivation Code steps.
9. **P1 — Refund/credit approval workflow** (depends on Q21): named finance approver, reason log, Stripe reversal handling.
10. **P1 — Account deletion: grace period, cascade scope, retained classes** (depends on Q06/Q40): implement per-class retention; deletion email already exists; Expo/web parity check.
11. **P1 — AHPRA re-check (daily scan + acceptance check) + lookup source decision** (depends on Q10/Q11/Q35).
12. **P1 — Terms snapshot: cancellation table + terms version + both-side acceptance** (depends on Q31/Q32/Q41; D2).
13. **P1 — Pairing/pricing candidates** (depends on Q45): B63 policy decision (native-only vs web-allowed) + negative test; B65 caller-scope check + negative test; B62 negative test despite mechanism change.
14. **P1 — GST/tax-invoice + subscriber pricing** (depends on Q31/Q33/Q34): tax advice, correct Stripe price selection per environment.
15. **P2 — Ratings gate (approved timesheet) + internal/marketplace separation** (depends on Q27).
16. **P2 — Availability opt-in visibility; urgent-alert labelling** (depends on Q17/Q18).
17. **P2 — Block list, direct-hire rule, history retention** (depends on Q19/Q20/Q28).
18. **P2 — Security review / pentest** (depends on Q43): authenticated API review; dependency scanning in CI.
19. **P2 — Expo onboarding repair (data loss / dead-ends / progress %)** (depends on Q47/Q48).

### What remains to finish GM-26 (for the parent agent)
1. **Re-validate the 16 NOT RE-VALIDATED questions** (Q07, Q12–Q20, Q22–Q26, Q33) against current code at the then-current head — each needs its owning file opened (see §3 sources). Q43 needs a pentest/security-review check outside the repo.
2. **Runtime proof this subagent could not do:** B62/B63/B65 negative tests (two-tenant/roles matrix, HTTP execution); B64 fix verification (notification DB/serializer/WebSocket/push inspection after the fix); exact-head CI conclusions; staging board load from the owner's network; real SDK 58 device build; production env/secret verification at deploy time; Expo privacy/terms parity check.
3. **Only after (1)–(2) as far as possible:** ask the owner GM26-Q36 first, then the queue in §3 order, one question at a time per Issue #250.

---
*Read-only trace. No code, PRs, issues, comments or branches were created or modified.
~80 sequential GitHub calls, no real HTTP 429 in this re-run (one false detector stop on a blob SHA
containing "429", corrected and resumed). All §3 "ACTUAL TODAY" text marked NOT RE-VALIDATED is
October 2026 evidence from PR #184 `questions.json`, explicitly not re-validated against current code.*


---

## Added 2026-11-21: waiting owner decisions (review of PR #267)

Evidence refs: `pr257:` = `origin/agent/pr257-int` at `21add924` (Expo app + newest backend), `main:` = `origin/main` at `8ccf8f77` (web as deployed). Each question is asked once, recommendation first. Source: the orchestrator's waiting-decision list of 21 Nov (items W-01 to W-17, mapped in [`../OWNER_GRILL.md`](../OWNER_GRILL.md) section 3).

### GM-26-W01: Production reCAPTCHA keys (W-05, D167): owner action, not a choice
**Scenario:** Sara registers on the web on launch day; Jack registers in the phone app.
**What happens today:** Vite, Next and Expo registration use reCAPTCHA. O4 row A15 was skipped because the local rig had no keys.
**Owner action:** Set `VITE_RECAPTCHA_SITE_KEY` for Vite, `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` for Next, `EXPO_PUBLIC_RECAPTCHA_SITE_KEY` for Expo, and `RECAPTCHA_SECRET_KEY` on the backend. Run staging registration on all three clients. See GM01-Q14 for the separate sign-in choice. Evidence: `pr257:frontend_web/src/pages/register.tsx:58`, `main:frontend_web/landing_next/migrated/pages/register.tsx:58`, `pr257:frontend_mobile/app/register.tsx:108`, `pr257:backend/core/settings.py:641`.
**Status:** OWNER ACTION (production checklist)

### GM-26-W02: Dependabot pull requests (W-09, D11)
**Scenario:** Tom chooses which dependency updates to merge before launch.
**What happens today:** The 21 Nov 2026 inventory recorded 30 open Dependabot PRs. The 11 Nov D11 review recommends merging #243 first, then #244 after lint and visual checks, and merging #265. It recommends holding #263 and #264 for a combined CodeQL change and closing #266 because SDK 58 supersedes it. #212 is in the waiting list with no recorded D11 verdict. #207, #206, #178, #177, #174, #90 and the older #60–#78 group also still need triage.
**Recommendation first: A.** Follow D11. Review #212 and the remaining action bumps in one batch. Confirm which older updates SDK 58 supersedes before closing them.
- **A (recommended):** Tom merges the D11 updates in order and keeps #212 pending until reviewed with the remaining dependency changes.
- **B:** Tom gets a separate review for every remaining PR, including #212, before launch.
- **DEFER:** Tom decides after launch.

**Status:** OPEN (the owner merges; agents merge nothing)

### GM-26-W03: Keep the node-forge 1.4.1 RSA patch? (W-14, register item 6)
**What happens today:** The patch and its regression are present (`pr257:frontend_mobile/scripts/dependency-security.test.cjs:486`). Release register item 6 reports that clean, unpatched node-forge 1.4.1 passed the regression and that the patch was kept as defence in depth (`main:docs/qa/RELEASE_DECISIONS_20261102.md:14`).
**Recommendation first: KEEP** until the next node-forge release, then drop it. Technical sign-off, low risk either way.
**Status:** OPEN (technical sign-off)

### GM-26-W04: When does the minimatch 3.1.5 exception (GHSA-g3hv-75wg-m249) end? (W-14, register item 9)
**What happens today:** the gate accepts only the fingerprinted root copy, which lacks the vulnerable function.
**Recommendation first:** remove it when Expo / React Native leave glob 7 or the advisory range is corrected; re-check at every Expo SDK upgrade. Technical sign-off.
**Status:** OPEN (technical sign-off)
