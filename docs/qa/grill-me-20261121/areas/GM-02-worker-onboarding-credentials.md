# GM-02 — Worker onboarding / credentials (Grill Me)

> **Corrections against current code (21 Nov 2026 review).** 14 claims checked at `main` `8ccf8f77` and `pr257` `21add924`; 11 hold, 3 below need the correction shown. Where a question below says otherwise, this table wins. Full evidence: [`../followup/claim-check-2026-11-21.md`](../followup/claim-check-2026-11-21.md).

| Where | Claim in this file | Verdict | Correct statement | Evidence |
|---|---|---|---|---|
| ON-Q03 / GM02-Q20 / CG-04 | “counter-offer submission … no gate at all” | WRONG | Public counter-offer submission already invokes verification before serializer creation. The actual gap is that this guard deliberately does nothing for non-public shifts. | GUARDED main endpoint: `main:backend/shifts/base.py:325`; GUARDED pr257 endpoint/replay: `pr257:backend/shifts/base.py:400`, `:426`; shared rule: `pr257:backend/onboarding/verification/state.py:171` |
| ON-Q03 / GM02-Q21 | “manager-issued offers … NOT gated” | WRONG as a blanket claim | Ordinary manager offer creation and counter-offer acceptance call the public guard. Dedicated creation has a different path, and non-public bookings remain outside that guard. | GUARDED: `main:backend/shifts/base.py:273`; `pr257:backend/shifts/base.py:348`; counter acceptance: `pr257:backend/shifts/base.py:462`; dedicated creation: `pr257:backend/shifts/posting.py:159` |
| ON-Q15, mobile uncertainty | Explorer Shifts may be a placeholder | WRONG as a current premise | Explorer Shifts uses the shared Shift Centre. Current account-type choices route to the pharmacist or Other Staff basic-profile screen; the old missing-screen description must not be presented as current. | `pr257:frontend_mobile/roles/explorer/shifts.tsx:1`; `pr257:frontend_mobile/components/ChooseAccountTypeCard.tsx:14` |

**Area:** GM-02 Worker onboarding/credentials · **Issue:** #250 · **Method:** PR #184 format
**Code head verified:** PR #249 `97c4543e051b43fe30ec7e2e61ad3d69957a918e`
(PR #249 open draft, stacked on #248 `feat/mobile-merge-sdk`, base `c98cf2ef`;
PR body "working head `26cae2d6`" is stale — the live head SHA above was read from the PR on 2026-11-21 and matches the #250 snapshot.)
**Legacy source:** PR #184 `docs/qa/launch-grill/questions.json` (head `c786a4b8`) +
`docs/qa/launch-grill/AUDIT.md` (Oct 2026, PR #182 head).
**PR #183 status:** CLOSED / MERGED (`74cb177d`, "AHPRA desktop verification… members exempt").
So every "(with PR #183)" note in #184 is now baseline code, not a proposal.
**Phase:** documentation and decisions only. No code changes, no PRs/issues/comments.

## Web and Expo today, side by side (pr257 `21add924`)

Source for both web and Expo is `origin/agent/pr257-int` `21add924` (what merges to main). Read-only code check by agy, 21 Nov 2026; every cited file:line was checked to exist at that commit. "Parity question" = a choice for the owner, asked in this area's rounds. "Possible defect (to verify)" = drift that looks unintended; it is confirmed in code before it goes to the engineering backlog, never asked as a question. The Platforms table says which platforms each question applies to.

| Flow | Web (Vite + Next) | Expo | Same? | If different |
|---|---|---|---|---|
| Sign up role selection | Visitor selects from OWNER, PHARMACIST, OTHER_STAFF, or EXPLORER roles (`frontend_web/src/pages/register.tsx:26`). | Visitor selects from identical four role tracks (`frontend_mobile/app/register.tsx:37`). | Yes | — |
| Mobile OTP verification gate | Worker verifies Australian mobile or skips if overseas Explorer (`frontend_web/src/pages/MobileOTPVerify.tsx:43`). | Worker enters 6-digit SMS OTP or confirms overseas waiver (`frontend_mobile/app/mobile-verify.tsx:105`). | Yes | — |
| Enter AHPRA registration number | Staff onboarding collects AHPRA number for interns and pharmacists (`frontend_web/src/pages/onboarding/onboarding_staff/RegulatoryV2.tsx:100`). | Other-staff regulatory tab collects and validates AHPRA registration number (`frontend_mobile/roles/otherstaff/profile-tabs/RegulatoryScreen.tsx:111`). | Yes | — |
| Pharmacist onboarding profile | Pharmacist enters profile bio, qualifications, and work history (`frontend_web/src/pages/onboarding/onboarding_pharmacist/BasicInfoV2.tsx:84`). | Pharmacist enters personal and professional details in mobile onboarding (`frontend_mobile/roles/pharmacist/onboarding.tsx:64`). | Yes | — |
| Explorer basic info & Gov ID | Newcomer Explorer fills profile and submits government ID (`frontend_web/src/pages/onboarding/ExplorerOnboarding.tsx:98`). | Explorer completes identity verification on mobile profile screen (`frontend_mobile/app/explorer/profile-identity.tsx:1`). | Yes | — |
| Payment & banking setup | Worker enters bank account details and tax classification (`frontend_web/src/pages/onboarding/onboarding_pharmacist/PaymentV2.tsx:15`). | Worker enters bank and superannuation details in financial form (`frontend_mobile/roles/shared/invoices/InvoiceGenerate.tsx:134`). | Yes | — |
| Shift application verification check | Public shift board blocks unverified workers from applying (`frontend_web/src/pages/dashboard/sidebar/PublicShiftsPage.tsx:277`). | Worker home logic evaluates missing verification steps before allowing applications (`frontend_mobile/roles/shared/dashboard/workerHomeLogic.ts:169`). | Yes | — |

### Platforms per question
| Question id | Platforms |
|---|---|
| ON-Q01 | Web + Expo |
| ON-Q02 | Web + Expo |
| ON-Q03 | Web + Expo |
| ON-P01 | Web + Expo |
| ON-Q04 | Web + Expo |
| ON-Q05 | Web + Expo |
| ON-Q06 | Web + Expo |
| ON-P03 | Web + Expo |
| ON-Q07 | Web + Expo |
| ON-P02 | Web + Expo |
| ON-Q08 | Web + Expo |
| ON-R01 | Web + Expo |
| ON-Q09 | Web + Expo |
| ON-Q10 | Web + Expo |
| ON-Q11 | Web + Expo |
| ON-Q12 | Web + Expo |
| ON-Q13 | Web + Expo |
| ON-Q14 | Web + Expo |
| ON-Q15 | Expo only |
| GM02-Q20 | Web + Expo |
| GM02-Q21 | Web + Expo |
| GM02-Q22 | Web + Expo |
| GM02-Q23 | Web + Expo |
| GM02-Q24 | Web + Expo |

## How to read this document

- **ACTUAL TODAY** = what the code at the head SHA above does, with file/function citations.
  Anything I could not inspect is marked **NOT INSPECTED** — it is not carried forward as fact.
- **Validation status per old question:** STILL VALID (re-checked, still true) /
  STILL VALID — CORRECTION (true in substance, but #184's "current" text is wrong in a stated detail) /
  SETTLED — DO NOT RE-ASK (the premise is answered by code) / UNVERIFIED (could not re-check).
- **Decision status per question:** OPEN (needs the owner) / SETTLED / UNVERIFIED.
- **Code gap** = no decision needed, just build/fix. **Decision gap** = the owner must choose first.
- Plain English first; jargon second. Normal case, edge case, retry/concurrency,
  denied role / wrong tenant, payment/notification side effects, and web/Expo difference
  are covered per question where they apply.

## Read limit (honest caveat)

After ~30 GitHub reads, the GitHub MCP endpoint returned **HTTP 429 (too many requests)**
while fetching `frontend_mobile/components/ChooseAccountTypeCard.tsx` and listing
`frontend_mobile/app/`. Per the hard-stop rule I made **no further GitHub calls**.
Consequences:

- Backend re-validation is complete for the files listed in the evidence index.
- **Frontend re-validation is partial:** web `register.tsx` and web+mobile `ownerSetup.ts`
  were read; **mobile onboarding screens, the mobile profile-tab screens,
  ChooseAccountTypeCard, TalentBoard "Request booking", OrganizationCreate routing,
  and the whole Next web app were NOT inspected at this head.** ON-Q15 is therefore
  UNVERIFIED, and every other question's frontend claim is marked "frontend not re-inspected"
  where it relies on #184 alone.
- `search_code` results were used only to *locate* one file
  (`backend/shifts/serialization/offers.py`); that file was then read at the head SHA.
  The code-search index itself points at main (`8ccf8f77`), not the PR head.

---

## 1. Traced flow — what happens today

### 1.1 The one rule that governs everything

**Verified** is the trust gate. `backend/onboarding/verification/policy.py`
`requirements()` / `evaluate()` / `verification_summary()`:

- Everyone: **email verified** (`user.is_otp_verified`) + **mobile verified**
  (`user.is_mobile_verified`).
- Pharmacists and interns additionally: **AHPRA verified** (`profile.ahpra_verified`).
- Overseas Explorers who skipped the Australian mobile check: **photo ID verified**
  (`profile.gov_id_verified`) *instead of* mobile (`mobile_waived()`).
- Everything else — ID (for everyone else), referees, documents, skill certificates —
  is a **badge**: shown, never blocking, unless the owner sets
  `VERIFICATION_EXTRA_REQUIREMENTS` (`gov_id` / `referees`) in env
  (`backend/core/settings.py:245`). Default is empty, so badges do not block today.
- `evaluate()` **never auto-demotes** base requirements: a Verified profile stays
  Verified until the evidence itself changes (AHPRA number, photo ID, mobile number —
  `revoke_for_changed_evidence()`, owner decision 2026-10-14). The only automatic
  demotion is a *tightening* (new extra requirements) after `VERIFICATION_GRACE_UNTIL`.
- Exception: a fresh AHPRA lookup whose state is `suspended / unreadable / rejected /
  type_not_accepted / review` forces `verified = False` in `evaluate()`.

Roles at signup (`backend/users/models.py:40-54`):
`SELF_REGISTRATION_ROLES = (OWNER, PHARMACIST, OTHER_STAFF, EXPLORER)`.
`CHOOSABLE_ACCOUNT_TYPES = (PHARMACIST, OTHER_STAFF)` — senior-review correction: the code comment at `users/models.py:54` says this is the list of account types "a PHARMACY_MANAGER may switch to once", not what an Explorer can upgrade to. Whether Explorer upgrade reuses the same constant was not traced; GM-05's Q-11 owns the manager switch.
Intern / technician / assistant / student are **not** signup roles; they are
`role_type` values inside the single OTHER_STAFF track.

### 1.2 Current-flow matrix

Trigger → actor → backend/API → Vite web → Expo → persisted state → event/side effect → recovery/denial.

| # | Trigger | Actor | Backend / API (head SHA) | Vite web | Expo | Persisted state | Event / side effect | Recovery / denial path |
|---|---|---|---|---|---|---|---|---|
| F1 | Sign up, pick a role | New user | `users/models.py:40-54` roles; `frontend_web/src/pages/register.tsx:26` `ROLES = [OWNER, PHARMACIST, OTHER_STAFF, EXPLORER]` | Role picker; Explorer also sends `newcomer_type` + `date_of_birth` (`register.tsx:84-85`) | Same 4 roles (`frontend_mobile/app/register.tsx:37-39,211,246,358-367`); Explorer also sends newcomer data | `User.role`; Explorer `ExplorerOnboarding` row | Account created; onboarding profile row created by role | No role → `requirements()` adds `role: False`, Verified impossible (`policy.py`) |
| F2 | Email + mobile check | Worker | `policy.requirements()`: `is_otp_verified`, `is_mobile_verified`; overseas Explorer → `gov_id_verified` instead | NOT INSPECTED (screens not re-read) | NOT INSPECTED | `User.is_otp_verified`, `is_mobile_verified`, `mobile_check_skipped`; `profile.gov_id_verified` | `refresh_verified()` promotes to Verified when all met (`policy.py`) | Missing step appears in `verification_summary().missing`; apply blocked (F5) |
| F3 | Enter AHPRA number (pharmacist / intern / pharmacist-owner) | Worker | `onboarding/tasks.py:272 verify_ahpra_task` → `verification/ahpra.py:ahpra_lookup()` (ScrapingBee, 3 retries) **or** desktop queue (`verification/desktop.py:89 enqueue_check`, only when `AHPRA_SOURCE == 'desktop'`); `ahpra.py:evaluate_ahpra_record()` — name match, status, profession = Pharmacy, General (pharmacist) / Provisional-or-General (intern), conditions/undertakings/reprimands → review, expiry parse, expired → review | NOT INSPECTED | NOT INSPECTED | `ahpra_verified`, `ahpra_verification_note`, `ahpra_registration_type/status`, `ahpra_expiry_date` (`onboarding/models.py:198,322`); `AhpraCheck` rows incl. `register_data` snapshot | `refresh_verified()` on success; admin review queue on `review` outcome | Name mismatch / not-registered / wrong profession / suspended / cancelled / surrendered → `rejected`; unreadable page → `review`/`unreadable`; worker presses Re-check (F4) |
| F4 | Press Re-check (AHPRA) | Worker | `onboarding/recheck.py:AhpraRecheckView` — **desktop source only** (else 409 `ahpra_desktop_disabled`); 1-hour cooldown (429 `ahpra_recheck_cooldown`); if state is `unreadable`, 3 attempts per 24h then 24h cooldown | NOT INSPECTED | NOT INSPECTED | `AhpraCheck` row (`reason='recheck'`); Redis cooldown key `ahpra_recheck_requested_<user>` (`verification/state.py`) | Queued to desktop verifier (202); admin emailed if check overdue 15 min (`tasks.py:380 alert_overdue_ahpra_checks`, beat every 15 min, `settings.py:271`) | ScrapingBee default → Re-check button is dead (409); cooldown → 429 + `Retry-After` |
| F5 | Apply for a shift (express interest) | Worker | `shifts/interest.py:84 express_interest()` — role check first (`_user_can_perform_shift_role`); **only if `visibility == PLATFORM` and NOT a member** → `verification/state.py:171 require_public_ahpra()` (AHPRA state gate) + `_require_public_shift_onboarding()` (Verified flag gate). Members (staff + favourites, incl. anonymous=False only) skip both. Non-public tiers: **no gate at all** | NOT INSPECTED | NOT INSPECTED | `ShiftInterest` row (`get_or_create`, idempotent) | Manager notified (in-app + email, `interest.py:_announce_interest`); public applicants shown as "A candidate" | Denied: role mismatch; unverified → 403 "Verify your profile…"; AHPRA `suspended/not_found/unreadable/rejected/type_not_accepted/review` → 403 `ahpra_<state>`; Explorer without verified Explorer profile → 403 |
| F6 | Submit a counter-offer | Worker | `shifts/serialization/offers.py:155 ShiftCounterOfferSerializer.create()` — validates slots/rates only; **NO Verified/AHPRA gate** (correction to #184). `counter_offers.py:90 ensure_interest_for_counter_offer()` writes interest rows **bypassing** `express_interest()` deliberately | NOT INSPECTED | NOT INSPECTED | `ShiftCounterOffer` + `ShiftCounterOfferSlot` rows; `ShiftInterest` rows | Manager notified (`announce_counter_offer`) | Invalid slots/rates → 400. Unverified/suspended worker CAN counter-offer; the gate only bites later at F8 |
| F7 | Manager offers a shift / dedicated offer / Talent Board "Request booking" | Owner/manager | `shifts/assignment.py:25 offer_shift()` and `:259 offer_dedicated_shift()` — role check only; **NO Verified/AHPRA gate** on the candidate. `posting.py:post_shift()` creates dedicated offers automatically when `dedicated_user` set | NOT INSPECTED | NOT INSPECTED | `ShiftOffer` (PENDING, `expires_at` = now + `OFFER_EXPIRY_HOURS` = 48h) | Worker notified (in-app + email "Shift offer received") | Slot locked / already awaiting payment → refused. Unverified/suspended worker CAN be offered; gated only at F8 |
| F8 | Accept an offer | Worker | `shifts/offers.py:339 accept()` — `require_public_ahpra()` runs **before** the offer-ownership check; then inside the transaction `lock_public_ahpra()` re-checks under a row lock (so a suspension landing mid-accept cannot commit). Then `engagement.py:build_shift_engagement_terms()` + `require_acceptance_payload()` (terms hash must match, else 409 `TERMS_CHANGED`) + `freeze_accepted_terms()` | NOT INSPECTED | NOT INSPECTED | `ShiftOffer` → `ACCEPTED_AWAITING_PAYMENT` (if payment required) or `ACCEPTED` + `ShiftSlotAssignment`; frozen `engagement_terms_snapshot` | Payment checkout / reservation (D01/D02); other pending offers for the slot expire; notifications to both sides | AHPRA/Verified fail → 403; offer not pending / expired → 400; slot locked → 400; terms changed → 409; payment-preference mismatch (shift ABN vs worker TFN) → 400 |
| F9 | Roster a staff member directly (internal) | Owner/manager | `shifts/assignment.py:141 roster_direct_staff()` → `guard_roster_assignment()` — membership (FT/PT/casual) + role check only; **NO Verified/AHPRA gate**, even for pharmacist/intern roles | NOT INSPECTED | NOT INSPECTED | `ShiftSlotAssignment` (`is_rostered=True`) | Worker notified "Shift assigned" | Non-staff / wrong role → refused; occurrence already assigned/awaiting payment → refused |
| F10 | Payment readiness at accept | Worker | `shifts/engagement.py:265 _external_payment_profile()` — ABN: `abn` + `abn_verified` + `abn_entity_confirmed` all required, else 400 at accept. TFN: only the *preference* is required at accept; TFN number + super fund/USI/member number are **deferrable** (`build_shift_engagement_terms()`: `payroll_setup_status=DEFERRED`, "Assignment is not blocked"). Staff members: `acceptance_required=False`, no payment gate. Posted `payment_preference` must equal worker's, else 400 | NOT INSPECTED (whether the checklist shows on apply/offer screens) | NOT INSPECTED | `payment_preference`, `abn*`, `tfn_number` (encrypted), `super_*` (`onboarding/models.py:273-292`) | TFN-deferred assignment stays timesheet-only until payroll activated; ABN settlement routes to invoicing | ABN missing/unverified/unconfirmed → 400 at accept ("ABN must be verified before invoice settlement" etc.). Worker learns this only at accept unless the UI shows it earlier (ON-11, frontend NOT INSPECTED) |
| F11 | AHPRA lookup returns Suspended / Cancelled / type-not-accepted | System (lookup result) | `verification/state.py:apply_state_transition()` — sets `ahpra_verified=False`, `verified=False`; **owner** profile switches role to MANAGER (`ahpra_switched_to_manager`); **future public bookings auto-cancelled** and pharmacies + admins notified; **non-member** workers paused account-wide (`ahpra_frozen()`; chat sockets closed); **members keep internal access** (`member_suspension_note`) | NOT INSPECTED | NOT INSPECTED | Profile flags; cancelled assignments; `AhpraCheck` outcome | Emails + in-app notices to worker, affected pharmacies, admins (`announce_suspension`, `announce_member_suspension`) | `not_found / unreadable / rejected` → Verified revoked, new public applications blocked, **existing bookings kept**, pharmacies told only for `rejected` (`announce_rejected_bookings`); nothing auto-cancelled. No fee/refund rule runs (CX-Q20, other area) |
| F12 | Publish on the talent board | Worker (any of the 3 tracks) | `talent/views/explorer.py:118 perform_create()` → `_require_public_staff_access()` — Explorer: profile `verified`; pharmacist: `verified` + `is_mobile_verified` + `ahpra_verified` + `ahpra_expiry_date` not past; **interns (OTHER_STAFF): no AHPRA check here**. One post per newcomer, 7-day re-post rule (`_create_newcomer_post`). Reads: `get_queryset()` now filters through `_visible_posts()` (hidden + stale-date posts excluded — TB-03 fixed); but `ExplorerPostReadSerializer` still returns full `explorer_name`, `author_user_id`, `explorer_user_id` to any authenticated user (TB-01 still open; only `public_feed` redacts) | NOT INSPECTED | NOT INSPECTED | `ExplorerPost` (`is_anonymous=True` default, `reference_code`, `hidden_at`, `view_count`, `like_count`) | Post visible in feed; `add_view` counts every authenticated call with no limit | Unverified → 403; expired AHPRA (pharmacist) → 403; second newcomer post → 400 |
| F13 | Upload ID / certificate / referee details | Worker | Azure OCR helpers exist (`verification/documents.py`: `azure_ocr`, PDF first-page → PNG). Referee reminders: one-off Celery ETA per referee, 48h (`verification/reminders.py`, `tasks.py:402 run_referee_reminder`). **No professional-indemnity insurance field exists anywhere** in the inspected backend | NOT INSPECTED | NOT INSPECTED | `government_id`, `certificate`, `skill_certificates` (JSON), `referee1/2_*` incl. `*_confirmed/_rejected/_last_sent` | Badges in `verification_summary()` (`policy.badges()`); referees are badges only, never blocking (unless env extra) | OCR misread → `PENDING`/`FAILED` badge; referee never replies → reminders only, no block |
| F14 | Owner setup gate | Owner | `frontend_web/src/utils/ownerSetup.ts` and `frontend_mobile/utils/ownerSetup.ts` — same rule: if owner already has pharmacies → done; else onboarding (`/setup/owner/onboarding`) then pharmacies (`/setup/owner/pharmacies`); pharmacy step **skippable** (web: sessionStorage flag; mobile: AsyncStorage flag; mobile clears the flag once a pharmacy exists, web does not). "Complete" = `submitted_for_verification` OR name + username + phone + role present — no identity/ABN check | Web + mobile both implement the gate (files read) | Same as web, except skip-flag storage/clearing differs (see above) | `OwnerOnboarding`, `Pharmacy` rows | Owner can post shifts with zero pharmacies (gate is skippable and posting checks no pharmacy verification — F15) | 404 onboarding → treated as "not started", sent to onboarding |
| F15 | Post a shift (pharmacy side) | Owner/manager | `shifts/posting.py:62 post_shift()` — **checks neither `Pharmacy.verified` nor `abn_verified`**; only the PLATFORM daily limit and escalation stamps. `Pharmacy.verified` (`organizations/models.py:135`) and `abn_verified` (`:236`) exist but do not gate posting | NOT INSPECTED | NOT INSPECTED | `Shift` + `ShiftSlot` rows; `escalation_level` | Availability-match + posted-shift announcements; dedicated offer if `dedicated_user` | None on the pharmacy side — an unverified/fake site can post publicly today |
| F16 | Create an organisation (multi-site group) | Platform admin only | `organizations/views.py:59-63 OrganizationViewSet.get_permissions()` — `create` → `IsAdminUser()`; no ORGANIZATION signup role exists. Orgs then claim/invite pharmacies (`PharmacyClaim`, `organizations/models.py:261`) | Web create page exists but routing NOT INSPECTED | NOT INSPECTED | `Organization`, `PharmacyClaim` rows | Org admins invite/claim pharmacies by email | Non-admin create → 403 |

### 1.3 What the matrix shows at a glance

- The **only** hard gates are: Verified (+ AHPRA state) on **public** apply and public offer-accept;
  ABN readiness on **external** accept; Verified (+ AHPRA, pharmacist only) on talent publish.
- **Everything else is open:** non-public tiers, chain/org/favourites interest, manager-issued
  offers, dedicated/Talent-Board offers, counter-offer submission, and all internal rostering
  never check Verified or AHPRA.
- **AHPRA re-checking is event-driven, not scheduled:** signup lookup, worker Re-check button
  (desktop only), and a recheck queued on public apply/accept **only after the stored expiry
  passes and only when `AHPRA_SOURCE == 'desktop'`**. Under the default ScrapingBee source
  that queue never fires. The only beat task is a 15-minute admin *alert* about overdue
  desktop checks — it never re-reads the register.
- **Progress % ≠ Verified:** `onboarding/services/progress.py` counts username, name,
  mobile *presence* (not verification), photo, gov ID, AHPRA, referees, address, resume,
  bio, payment, rates. It does not count email/mobile *verification*, and it counts
  resume/bio/rates/referees that Verified never needs.

---

## 2. Validated question queue (PR #184 format)

Base for links: `https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/blob/97c4543e051b43fe30ec7e2e61ad3d69957a918e/`
("HEAD" below = that SHA.) Every option list ends with **Other (describe)** and **Defer**;
those two are omitted from the printed lists for brevity but are always available.
Severity: Critical / High / Medium / Low = launch impact if decided wrong or left open.

### ON-S1 · Worker tracks and gates

#### ON-Q01 — Worker sign-up tracks

- **Decision status:** Answered: KEEP the existing sign-up tracks, launch grill, 23 Oct 2026 - see ON-Q01.
- **Actual today:** Pharmacist, Other Staff and Explorer are the worker tracks. Owner has a separate sign-up track. The Other Staff form collects details by role. Evidence: `main:frontend_web/src/pages/register.tsx:26`, `pr257:frontend_mobile/app/register.tsx:37`.

#### ON-Q02 — Worker access before full verification

- **Decision status:** Answered: KEEP, launch grill, 23 Oct 2026 - see GM01-Q04 for the single re-confirmation.
- **Actual today:** Workers verify their email and mobile before entering the dashboard. Anonymous public browsing is still available. Booking checks apply separately. Evidence: `main:frontend_web/src/components/ProtectedRoute.tsx:26`, `pr257:frontend_mobile/app/login.tsx:71`.

#### ON-Q03 — Where verification is enforced

- **Decision status:** Answered: B, check every outside booking, launch grill, 23 Oct 2026 - see VERIFY-GATE-01. Engineering: see BL-01.
- **Actual today:** Public interest, ordinary offer creation and acceptance, and counter-offer submission and acceptance use the public gate. Several booking actions already call it for other tiers, but the shared guard skips non-public shifts. Dedicated offer creation follows a separate path. Evidence: `pr257:backend/shifts/interest.py:89`, `pr257:backend/shifts/base.py:348`, `:400`, `:462`, `pr257:backend/shifts/offers.py:339`, `pr257:backend/onboarding/verification/state.py:171`.

#### ON-P01 — Who skips the AHPRA check

- **Decision status:** Answered: A, employees are exempt and favourites are checked, launch grill, 23 Oct 2026 - see AHPRA-FAV-01. Engineering: see BL-02.
- **Actual today:** A favourite with an active accepted membership can bypass the check on a named public shift at that pharmacy, like eligible employed staff. Evidence: `pr257:backend/shifts/interest.py:21`.

#### ON-Q04 — When pay details are ready

- **Decision status:** Answered: B, tell the worker early and require pay details before acceptance, launch grill, 23 Oct 2026 - see ON-Q04. Engineering: see BL-03.
- **Actual today:** Missing or unverified ABN details block external acceptance. A TFN worker can accept and be assigned with TFN/super setup incomplete. The assignment stays timesheet-only until a manager activates payroll. Staff engagements use their own terms. Evidence: `pr257:backend/shifts/engagement.py:265`, `:716`, `pr257:backend/shifts/offers.py:566`.
- **Follow-up for engineering:** Check where the readiness checklist already appears on web and Expo. Add the early notice where missing and reconcile the deferred-payroll exception with the answer.

#### ON-Q05 — What can Explorers (new to pharmacy) do with shifts?
- **Validation: STILL VALID.** **Decision status: OPEN.**
- **Context:** Web shows Explorers the shift boards, but they get no verification check and
  can never accept. No Explorer payment tab exists (ON-09).
- **ACTUAL TODAY:** Confirmed, with one refinement. Explorers *can* express interest on
  public shifts if their Explorer profile is Verified (`interest.py:_require_public_shift_onboarding()`,
  EXPLORER branch) — but they can **never accept**: `engagement.py:25 worker_onboarding()`
  returns `OtherStaffOnboarding` for every non-pharmacist, so an Explorer has no row and
  `_external_payment_profile()` raises "Complete worker onboarding before accepting".
  There is no Explorer payment tab (no payment fields on `ExplorerOnboarding` in the
  inspected models). Mobile Explorer shifts tab NOT INSPECTED at this head.
- **Options:** **KEEP — Keep current logic:** Explorers see boards and can apply but never
  accept. | **A — No shifts; hide the boards:** Explorers use the Talent Board only. |
  **B — Unpaid shadowing posts only:** a new post type for observation days. |
  **C — Paid shifts after upgrading role:** the upgrade card exists; they then follow that
  role's checks.
- **RECOMMENDED: C. Severity: High.** Today Explorers can apply to shifts they can never
  accept, which wastes pharmacies' time and creates dead applicants on every public
  shift. Locumate and Locate a Locum tie shift access to role checks; the existing
  upgrade path moves Explorers into a real track. A is the fallback if upgrade is not
  ready; B is a new product, not a launch fix.
- **Normal case:** Explorer applies → manager offers → accept fails with "complete
  onboarding". **Edge case:** a verified Explorer's interest sits on a shift forever with
  no path to booking. **Notification side effect:** managers are emailed about interest
  from workers who cannot be booked. **Web/Expo difference:** web boards confirmed in
  #184; mobile tab NOT INSPECTED.
- **Sources:** [engagement.py](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/blob/97c4543e051b43fe30ec7e2e61ad3d69957a918e/backend/shifts/engagement.py#L25-L28),
  [interest.py](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/blob/97c4543e051b43fe30ec7e2e61ad3d69957a918e/backend/shifts/interest.py#L38-L62),
  [users/models.py](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/blob/97c4543e051b43fe30ec7e2e61ad3d69957a918e/backend/users/models.py#L54).

### ON-S2 · Credentials and expiry

#### ON-Q06 — How should AHPRA be re-checked after sign-up?
- **Validation: STILL VALID — WITH A CORRECTION.** **Decision status: OPEN.
  Severity: Critical** (the register is the core legal trust signal).
- **Context:** Workers can press Re-check, and a public apply or accept queues a check
  once the stored expiry passes. No scheduled scan (ON-02).
- **ACTUAL TODAY (corrected):** One lookup at sign-up stores status, type and expiry
  (`ahpra.py:evaluate_ahpra_record()` + `_update_ahpra_fields()`). Re-check exists with a
  1-hour cooldown (3 attempts/24h when unreadable) — **but only when
  `AHPRA_SOURCE == 'desktop'`** (`recheck.py`). The post-expiry recheck on public
  apply/accept (`state.py:197 queue_public_recheck()`) **also only fires on the desktop
  source**; under the default ScrapingBee source (`settings.py:643`) nothing is queued.
  So #184's KEEP text ("a recheck after expiry on public apply or accept") is **only
  true on desktop**. There is still no scheduled register scan: the only beat entry is
  `ahpra-overdue-alerts` every 15 min, which emails admins about *overdue desktop
  checks* — it never re-reads the register (`settings.py:271`, `tasks.py:380`).
  A mid-year suspension is therefore unseen until a lookup happens for another reason.
- **Options:** **KEEP — Keep current logic:** Re-check button, plus a recheck after expiry
  on public apply or accept (desktop only; inert on ScrapingBee). |
  **A — Daily scan plus acceptance:** rescan workers with upcoming bookings daily; check
  again at acceptance. | **B — Acceptance check only:** current when booked; no early
  warning. | **C — Weekly register scan:** cheaper, but changes may be a week late.
- **RECOMMENDED: A. Severity: Critical.** A daily scan of booked workers catches
  suspensions early; acceptance-time re-check is the backstop. AHPRA calls the public
  register the accurate source. B leaves pharmacies exposed between bookings; C leaves a
  week's exposure. Cost note: a scan needs a lookup source that can run unattended —
  see ON-P03 first (this is why P03 is asked before Q06 in the interview order).
- **Normal case:** pharmacist renews on time → expiry passes → next public apply queues
  a recheck (desktop) or nothing happens (ScrapingBee). **Edge case:** suspension
  mid-registration-year → invisible until next lookup; existing bookings are only
  cancelled when a lookup *does* run and returns Suspended. **Retry/concurrency:**
  desktop checks dedupe via the active-check queue; ScrapingBee lookups retry 3× with
  growing pauses (`ahpra.py`). **Notification:** admins emailed after 15 min overdue
  (desktop only).
- **Sources:** [state.py](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/blob/97c4543e051b43fe30ec7e2e61ad3d69957a918e/backend/onboarding/verification/state.py#L197-L224),
  [recheck.py](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/blob/97c4543e051b43fe30ec7e2e61ad3d69957a918e/backend/onboarding/recheck.py),
  [settings.py](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/blob/97c4543e051b43fe30ec7e2e61ad3d69957a918e/backend/core/settings.py#L271-L275),
  [settings.py (source)](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/blob/97c4543e051b43fe30ec7e2e61ad3d69957a918e/backend/core/settings.py#L643-L644),
  [tasks.py](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/blob/97c4543e051b43fe30ec7e2e61ad3d69957a918e/backend/onboarding/tasks.py#L380-L400).

#### ON-P03 — Which AHPRA lookup should run at launch?
- **Validation: STILL VALID.** **Decision status: OPEN. Severity: Critical** — it decides
  whether the Q03/Q06/Q07/P02 machinery works at all. **Ask this first (see §3).**
- **Context:** A desktop verifier exists: a Chrome extension on an office PC reads the
  register, with an AI repair fallback. The default and staging still use ScrapingBee.
- **ACTUAL TODAY:** `AHPRA_SOURCE` defaults to `'scrapingbee'` (`settings.py:643`);
  every desktop path is gated on `AHPRA_SOURCE == 'desktop'` (`desktop.py:90,125,131,159,171,246`;
  `recheck.py`; `state.py:queue_public_recheck()`). ScrapingBee lookup still runs at
  sign-up (`ahpra.py:ahpra_lookup()`, 3 retries) and sets `ahpra_verified` via
  `evaluate_ahpra_record()`, so the *base* Verified gate works on either source — but
  the fine-grained PR #183 handling (suspension auto-cancel, not-found/unreadable
  states, Re-check, admin overdue alerts) is written against `AhpraCheck` rows produced
  by the desktop flow. Whether the ScrapingBee path also writes usable `AhpraCheck`
  rows was **not fully traced** (the task body was only partly read); #184's claim that
  those gates stay inert under ScrapingBee is therefore carried as **unconfirmed**, not
  as verified fact. Staging env value NOT INSPECTED.
- **Options:** **KEEP — Keep current logic:** ScrapingBee, one lookup at sign-up; PR #183's
  suspension handling may stay inactive. | **A — Desktop verifier:** office PC must stay
  on; new sign-ups wait for it.
- **RECOMMENDED: A — after a staging trial. Severity: Critical.** Only the desktop
  source feeds the suspension, not-found and Re-check handling the other questions
  assume. Run it on staging first (the deploy guide still leaves staging on
  ScrapingBee, per #184 — not re-verified). If the office PC cannot stay on, the honest
  fallback is KEEP **plus** accepting that Q06/Q07/P02's automatic protections do not run.
- **Normal case:** sign-up → lookup → verified or review. **Edge case:** office PC off →
  checks sit `pending`/`sent`, admins alerted after 15 min, sign-ups wait. **Retry:**
  desktop checks have lease/claim/repair flows (`desktop.py`); ScrapingBee retries 3×.
  **Legal impact:** a suspended pharmacist working while the register is unread is the
  core liability this choice controls.
- **Sources:** [settings.py](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/blob/97c4543e051b43fe30ec7e2e61ad3d69957a918e/backend/core/settings.py#L643-L647),
  [desktop.py](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/blob/97c4543e051b43fe30ec7e2e61ad3d69957a918e/backend/onboarding/verification/desktop.py#L89-L106),
  [ahpra.py](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/blob/97c4543e051b43fe30ec7e2e61ad3d69957a918e/backend/onboarding/verification/ahpra.py#L18-L75).

#### ON-Q07 — If current registration cannot be confirmed, what happens to future bookings?
- **Validation: STILL VALID.** **Decision status: OPEN. Severity: High.**
- **Context:** Not-found or unreadable results block new public applications but keep
  existing bookings, and nobody else is told. Suspension is ON-P02 (ON-02).
- **ACTUAL TODAY:** Confirmed in `state.py:apply_state_transition()`. `not_found /
  unreadable / rejected` → `verified=False`, `ahpra_verified=False`, new public
  applications blocked; existing bookings **kept**. Pharmacies are told only for
  `rejected` (`announce_rejected_bookings()` — "needs immediate resolution"); for
  `not_found`/`unreadable` nobody is told. `suspended` / `type_not_accepted` →
  auto-cancel future public bookings + notify (ON-P02). A stored expiry alone does not
  block anything — it only (on desktop) queues a recheck at next public apply/accept.
- **Options:** **KEEP — Keep current logic:** block new public applications; keep
  bookings; warn nobody. | **A — Keep bookings, warn both:** worker must resolve it
  before starting. | **B — Cancel automatically:** fast, but risks cancelling during
  renewal. | **C — Block new; review booked:** support verifies status and helps both sides.
- **RECOMMENDED: C. Severity: High.** The code already blocks new commitments (the first
  half of C). A stored expiry or unreadable page alone is not a lapse, so review existing
  bookings and warn both sides rather than cancelling. B risks cancelling a pharmacist
  mid-renewal; A leaves the pharmacy uninformed.
- **Normal case:** renewal week → lookup unreadable → no new applications; booked shifts
  stand pending review. **Edge case:** AHPRA page format change → every lookup
  unreadable → all pharmacists blocked from *new* applications at once (support load).
  **Payment side effect:** kept bookings still run their D02 payment deadlines; a
  cancelled booking's fee/refund follows CX-Q20 (other area). **Notification:** only
  `rejected` notifies pharmacies today.
- **Sources:** [state.py](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/blob/97c4543e051b43fe30ec7e2e61ad3d69957a918e/backend/onboarding/verification/state.py#L239-L280).

#### ON-P02 — When the register shows Suspended or Cancelled, what happens?
- **Validation: STILL VALID.** **Decision status: OPEN. Severity: Critical.**
- **Context:** The register status acts automatically. Pharmacist owners become Pharmacy
  Managers; bookings with leave, attendance or invoice history are kept for admins.
- **ACTUAL TODAY:** Confirmed. `apply_state_transition()` (`state.py:239`) on a
  `suspended`/`type_not_accepted` transition: future public bookings cancelled and
  pharmacies told; non-member workers paused account-wide (`ahpra_frozen()`); admins
  emailed (`announce_suspension()`); owners switch to MANAGER (`ahpra_switched_to_manager`,
  restored if a later check is `ok`). A non-General pharmacist result cancels bookings
  without pausing (pause applies only to `suspended`). No fee or refund rule runs —
  settle under CX-Q20. Whether `cancel_upcoming_assignments()` covers only public
  bookings or also chain/org bookings was NOT traced (function lives in the feature
  port, not read); #184's "future public bookings" is carried, not re-verified.
- **Options:** **KEEP — Keep current logic:** auto-cancel future public bookings, pause
  non-members, notify pharmacies and admins. | **A — Admin confirms, then cancel:** block
  new bookings at once; cancel only after a person checks.
- **RECOMMENDED: KEEP. Severity: Critical.** Working while suspended is unlawful, and an
  exact register status rarely misreads; fast cancellation gives pharmacies time to
  refill. A adds a human delay to the highest-risk case.
- **Normal case:** suspension lands → bookings cancelled, pharmacy notified, refill starts.
  **Edge case:** suspension reversed on appeal → owner role restores automatically on
  an `ok` check; cancelled bookings are *not* restored (refill already happened).
  **Payment side effect:** cancelled confirmed bookings may carry fees/refunds — no rule
  runs today; that is CX-Q20's decision, not this one. **Wrong tenant:** a member's
  suspension notifies *their* pharmacies only (`announce_member_suspension()`).
- **Sources:** [state.py](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/blob/97c4543e051b43fe30ec7e2e61ad3d69957a918e/backend/onboarding/verification/state.py#L239-L330).

#### ON-Q08 — Who must pass an ID check?
- **Validation: STILL VALID.** **Decision status: OPEN. Severity: High.**
- **Context:** ID is only part of Verified for overseas Explorers. ID reading (OCR) already
  works for everyone.
- **ACTUAL TODAY:** Confirmed. `policy.py:mobile_waived()` + `requirements()` — ID is
  required only for overseas Explorers who skipped the mobile check. A setting can add
  ID to Verified for everyone (`VERIFICATION_EXTRA_REQUIREMENTS` containing `gov_id`,
  `settings.py:245`) but it is off by default (env empty). Azure OCR exists
  (`verification/documents.py:azure_ocr()`, PDF first-page → PNG) — the *utility* was
  read; the per-role wiring that calls it (in `tasks.py`) was only partly read, so "OCR
  works for all" is confirmed for the utility, not for every screen.
- **Options:** **KEEP — Keep current logic:** ID only for overseas Explorers who skip the
  mobile check. | **A — Every worker before first booking:** one check, reused for every
  pharmacy. | **C — Pharmacists and ABN workers only:** skips employed support staff.
- **RECOMMENDED: A. Severity: High.** Today most workers are never ID-checked. Clipboard,
  Hireup and Relief Buddy check government ID before work; the OCR and the on/off setting
  already exist, so this is a gate change, not new tooling. Note the interaction with
  ON-R01: turning ID on for everyone multiplies the retained evidence (set the retention
  rule in the same decision).
- **Normal case:** worker uploads ID once, verified, books anywhere. **Edge case:**
  overseas Explorer with no AU mobile → ID is the *only* identity check; a forged ID
  passes only if OCR + review miss it (review path NOT INSPECTED). **Web/Expo
  difference:** upload screens NOT INSPECTED.
- **Sources:** [policy.py](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/blob/97c4543e051b43fe30ec7e2e61ad3d69957a918e/backend/onboarding/verification/policy.py#L52-L78),
  [settings.py](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/blob/97c4543e051b43fe30ec7e2e61ad3d69957a918e/backend/core/settings.py#L245-L249),
  [documents.py](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/blob/97c4543e051b43fe30ec7e2e61ad3d69957a918e/backend/onboarding/verification/documents.py).

#### ON-R01 — How long should verification evidence be kept?
- **Validation: STILL VALID.** **Decision status: OPEN. Severity: Medium (legal/privacy).**
- **Context:** Identity and qualification files are collected, but no evidence-specific
  deletion schedule is documented.
- **ACTUAL TODAY:** Confirmed as far as inspected: no retention/deletion schedule for
  verification evidence was found in the inspected files (no retention constants in
  `onboarding/tasks.py`, `core/settings.py`, `talent/models.py`; `AhpraCheck` snapshots
  including `register_data` are kept with no deletion date seen). Wider retention policy
  may live in GM-26 docs — NOT INSPECTED. (Audit gap ON-12 was named in #184 but its
  text is not in the AUDIT.md file as retrieved; the question itself is the record.)
- **Options:** **KEEP — Keep current logic:** retain files without a defined deletion
  trigger. | **A — Delete after verification:** keep result, source and audit dates only.
  | **B — Keep seven years:** higher breach impact; needs legal basis.
- **RECOMMENDED: A. Severity: Medium.** APP 11 requires destruction or de-identification
  when information is no longer needed. Set evidence-class schedules and retain only the
  verification audit record unless law requires more. B needs a named legal basis before
  it can be chosen; get qualified privacy advice before picking B.
- **Normal case:** ID verified → file deleted on schedule, audit row kept. **Edge case:**
  a disputed verification needs the file after deletion → the audit row (result, source,
  dates) is the evidence. **Legal impact:** retaining ID documents indefinitely is the
  breach-exposure risk; deleting too early is the dispute-evidence risk.
- **Sources:** (negative finding — no schedule in inspected files) [tasks.py](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/blob/97c4543e051b43fe30ec7e2e61ad3d69957a918e/backend/onboarding/tasks.py),
  [settings.py](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/blob/97c4543e051b43fe30ec7e2e61ad3d69957a918e/backend/core/settings.py).

### ON-S3 · Insurance and super

#### ON-Q09 — Which workers must prove professional indemnity cover?
- **Validation: STILL VALID.** **Decision status: OPEN. Severity: High (legal).**
- **Context:** No insurance field, evidence or expiry gate exists (ON-03).
- **ACTUAL TODAY:** Confirmed. Zero matches for "insurance"/"indemnity" in the inspected
  backend (`onboarding/models.py`, `organizations/models.py`, `shifts/engagement.py`,
  fetched `onboarding/` tree). No field, no upload, no expiry, no gate, no badge.
  (#184 cited a comment in `onboarding/services/skills.py:61`; that file was not fetched
  at this head, so the comment is not re-verified — the *absence of any field* is
  verified from the models.)
- **Options:** **KEEP — Keep current logic:** collect no insurance evidence. |
  **A — ABN pharmacists only:** misses practising employee and provisional registrants. |
  **B — All practising pharmacists:** General, limited or provisional; own or third-party
  cover. | **C — Badge only:** show cover but never gate bookings.
- **RECOMMENDED: B. Severity: High.** The Pharmacy Board standard applies to practising
  pharmacists with general, limited or provisional registration, whether cover is
  personal or provided by an employer. ABN status is not the test — A misses employed
  pharmacists whose employer cover may not extend to locum work, and misses provisional
  (intern) registrants entirely. This needs qualified legal confirmation before launch;
  do not treat the recommendation as legal advice.
- **Normal case:** pharmacist uploads certificate of currency with expiry; expiry blocks
  new bookings. **Edge case:** employer-provided cover that does not extend to locum
  shifts → worker must hold own cover. **Payment/notification:** an expiry gate needs
  the same re-check machinery as AHPRA (see ON-Q06) or it goes stale the same way.
- **Sources:** [onboarding/models.py](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/blob/97c4543e051b43fe30ec7e2e61ad3d69957a918e/backend/onboarding/models.py) (no insurance field),
  [engagement.py](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/blob/97c4543e051b43fe30ec7e2e61ad3d69957a918e/backend/shifts/engagement.py) (no insurance in terms).

#### ON-Q10 — How should super show on ABN contractor terms?
- **Validation: SETTLED — DO NOT RE-ASK.** **Decision status: SETTLED (keep current logic).**
- **Context:** Engagement terms split TFN casual (Award floor) from ABN contractor. ABN
  terms were said never to mention super.
- **ACTUAL TODAY:** The premise is out of date (as #184 itself noted). ABN terms carry
  `super_notice`: "Invoice settlement does not by itself remove superannuation
  obligations. The pharmacy/principal must review whether super is payable for a
  labour-only contractor." (`engagement.py:734`), plus `super_review_required: True` and
  `super_payable_confirmed: False`. TFN terms carry the Award/super relationship
  notices (`engagement.py:697-716`).
- **Options (recorded, not re-asked):** **KEEP — Keep current logic:** keep the existing
  super warning in ABN terms. | B — Say contractor handles own super (simple, but may be
  wrong for some workers). | C — Ask counsel first; nothing at launch.
- **RECOMMENDED: KEEP.** Today's notice already says what B proposed and matches the ATO
  rule that labour-only contractors can be owed super. Re-open only if counsel advises
  different wording (GM-14 owns the wording).
- **Sources:** [engagement.py](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/blob/97c4543e051b43fe30ec7e2e61ad3d69957a918e/backend/shifts/engagement.py#L720-L737).

### ON-S4 · Pharmacy setup

#### ON-Q11 — What must a pharmacy pass before posting to outside workers?
- **Validation: STILL VALID.** **Decision status: OPEN. Severity: Critical.**
- **Context:** Pharmacy-verified and ABN-verified flags exist, but posting checks neither.
  Workers can accept shifts from unverified sites (ON-06).
- **ACTUAL TODAY:** Confirmed. `post_shift()` (`posting.py:62`) checks neither
  `Pharmacy.verified` (`organizations/models.py:135`) nor `abn_verified` (`:236`); any
  pharmacy can post to every tier including public. (Where `Pharmacy.verified` *is* read
  — #184 said only the ethical marketplace — was NOT re-verified; the flag's readers
  were not traced.)
- **Options:** **KEEP — Keep current logic:** no pharmacy checks before posting to any
  tier. | **B — ABN verified for any outside post:** automatic ABN check only. |
  **C — ABN plus admin check before public:** a person reviews the site before public
  posting. | **D — B for chain/org, C for public:** ABN for chain and organisation tiers;
  admin check too for public.
- **RECOMMENDED: D. Severity: Critical.** Today a fake site can post publicly and be
  accepted. Locumate activates pharmacy accounts only after review; chain and
  organisation workers already know the site, public workers do not. D is the
  proportionate split — automatic for known audiences, human for strangers.
- **Normal case:** real pharmacy, ABN verified → posts to chain/org at once; public after
  admin check. **Edge case:** new pharmacy, ABN check failing (name mismatch) → cannot
  post outside at all; needs a support path. **Payment side effect:** none until a
  booking is made; but an unverified pharmacy's bookings still open Stripe checkouts
  today. **Web/Expo difference:** posting screens NOT INSPECTED on either client.
- **Sources:** [posting.py](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/blob/97c4543e051b43fe30ec7e2e61ad3d69957a918e/backend/shifts/posting.py#L62-L120),
  [organizations/models.py](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/blob/97c4543e051b43fe30ec7e2e61ad3d69957a918e/backend/organizations/models.py#L135-L236).

#### ON-Q12 — Which site brief fields are required before the first post?
- **Validation: STILL VALID.** **Decision status: OPEN. Severity: Medium.**
- **Context:** The pharmacy record holds site details, hours, documents and rates.
  Software, staffing, parking and arrival steps are not structured fields.
- **ACTUAL TODAY:** Confirmed at model level. `Pharmacy` has optional `software` (JSON,
  skill-registry codes), `services` (JSON), `script_volume_weekday/weekend` (band codes)
  — all `blank=True` (`organizations/models.py:191-197`). No parking, arrival-steps or
  named-contact field exists (only email + address). Whether the web/mobile forms
  *require* any of these was NOT INSPECTED; nothing in the model enforces it.
- **Options:** **KEEP — Keep current logic:** all brief fields optional; parking and
  arrival have no field. | **A — Core: software, staffing, parking, contact:** each shift
  copies them and can override. | **C — Full brief incl. script volume:** also services
  and weekday/weekend script volumes.
- **RECOMMENDED: A. Severity: Medium.** Software and script volume exist but are optional,
  and parking, contact and arrival are missing. Locumate collects software, services and
  contacts at setup and Relief Buddy filters by software; core required fields stop most
  mismatches (wrong software is the classic first-shift failure).
- **Normal case:** locum arrives knowing software, parking, who to ask for. **Edge case:**
  multi-site owner — fields are per-pharmacy, so each site needs its own brief (correct).
  **Web/Expo difference:** NOT INSPECTED.
- **Sources:** [organizations/models.py](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/blob/97c4543e051b43fe30ec7e2e61ad3d69957a918e/backend/organizations/models.py#L191-L197).

#### ON-Q13 — Should pharmacies save a payment method during setup?
- **Validation: STILL VALID.** **Decision status: OPEN. Severity: High.**
- **Context:** Every booking opens a new Stripe Checkout; no card is stored. Under D02 a
  shift under 2 hours away leaves 30 minutes to pay (ON-08).
- **ACTUAL TODAY:** Confirmed as far as inspected. `billing/views.py` at this head
  (`charge_shift_fulfillment`, `charge_penalty` still present) opens a checkout per
  booking; **no saved-card / SetupIntent / Stripe Customer payment-method storage was
  found in the inspected billing files** — but the billing module has been split since
  #184 (`checkout_reservations.py` etc.) and was **not fully traced**; the full
  checkout flow is GM-16's to verify. Billing is live with no trial:
  `BILLING_LIVE_DATE = 2025-06-01` with the stale comment "June 1, 2026" and
  `FREE_TRIAL_DAYS = 0` (`settings.py:679-682`) — unchanged since the audit.
- **Options:** **KEEP — Keep current logic:** one Stripe checkout per booking; no stored
  card. | **B — Save card, charge on acceptance:** confirms in seconds; payment is still
  verified per D01. | **C — Saved card for subscribers only:** others keep one checkout
  per booking.
- **RECOMMENDED: B. Severity: High.** Today urgent shifts often expire unpaid inside the
  30-minute window. Sidekicker requires a card before the first hire and Mable needs
  payment details before booking. B needs a Stripe customer + off-session payment design
  (GM-16) and a clear refund path (GM-17); do not build it as part of GM-02.
- **Normal case:** owner saves card at setup → acceptance confirms in seconds. **Edge
  case:** card expired/declined at acceptance → reservation must fall back to a fresh
  checkout inside the D02 window, not silently fail. **Payment side effect:** stored
  cards change the chargeback/refund surface; keep the per-booking verification (D01).
- **Sources:** [billing/views.py](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/blob/97c4543e051b43fe30ec7e2e61ad3d69957a918e/backend/billing/views.py#L140-L240),
  [settings.py](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/blob/97c4543e051b43fe30ec7e2e61ad3d69957a918e/backend/core/settings.py#L679-L682).

### ON-S5 · Organisations and devices

#### ON-Q14 — How do organisations (multi-site groups) join?
- **Validation: STILL VALID.** **Decision status: OPEN. Severity: Medium.**
- **Context:** Only a platform admin can create an organisation. There is no organisation
  sign-up, and the web create page is not routed (ON-07).
- **ACTUAL TODAY:** Confirmed for the backend. `OrganizationViewSet.get_permissions()`
  (`organizations/views.py:59-63`) — `create` requires `IsAdminUser()`; there is no
  ORGANIZATION signup role (`users/models.py:50`). Organisations then claim or invite
  pharmacies by email (`PharmacyClaim`, `organizations/models.py:261`). The web create
  page's routing was NOT INSPECTED at this head.
- **Options:** **KEEP — Keep current logic:** platform admin creates every organisation;
  no self sign-up. | **B — Self-serve, waits for approval:** new sign-up role plus an
  admin review queue. | **C — Self-serve, instant access:** no review; highest risk.
- **RECOMMENDED: KEEP. Severity: Medium.** Sales-led setup is what Patchwork does and
  suits the few groups joining at launch. Only the unrouted create page needs deleting
  (a cleanup, ON-05 — NOT re-verified), not a logic change.
- **Normal case:** group admin emails sales → platform admin creates org → org invites
  its pharmacies. **Edge case:** a group tries to self-register → no role exists; they
  hit a dead end unless sales contact is shown. **Web/Expo difference:** NOT INSPECTED.
- **Sources:** [organizations/views.py](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/blob/97c4543e051b43fe30ec7e2e61ad3d69957a918e/backend/organizations/views.py#L59-L66),
  [users/models.py](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/blob/97c4543e051b43fe30ec7e2e61ad3d69957a918e/backend/users/models.py#L50).

#### ON-Q15 — Must every onboarding step work on mobile at launch?
- **Validation: UNVERIFIED — could not re-check at this head.** **Decision status:
  UNVERIFIED (do not ask on stale evidence).**
- **Context (#184, NOT re-validated):** Profile tabs match, but the mobile "add personal
  profile" flow is broken: pharmacist data is dropped and other staff land on not-found
  (ON-04).
- **ACTUAL TODAY:** **Not established.** The mobile files behind this claim
  (`frontend_mobile/components/ChooseAccountTypeCard.tsx`, `frontend_mobile/app/…`
  profile screens, `roles/owner/onboarding/*`, `roles/explorer/shifts.tsx`) were not
  read — GitHub reads were rate-limited (HTTP 429) before they were reached. What *was*
  established: web onboarding pages exist per track
  (`frontend_web/src/pages/onboarding/` — `onboarding_pharmacist/`,
  `onboarding_staff/`, `onboarding_explorer/` dirs, `OnboardingShell.tsx`); mobile
  register and ownerSetup parity were confirmed (F1, F14). **Do not carry #184's
  "current" text for Q15 forward as fact until the mobile screens are re-read.**
- **Options (from #184, pending re-validation):** **KEEP — Keep current logic:** mobile
  manager add-profile stays broken; other steps unchanged. | **A — Full parity on web
  and mobile:** every step works on both. | **B — Mobile basics, rest links to web:**
  less to build; phone users switch devices.
- **RECOMMENDED (from #184, pending re-validation): A.** Managers who upgrade on mobile
  must not lose data or hit a dead end. Florence and Staffy run onboarding inside the
  app with visible progress. **This recommendation is provisional until the mobile
  screens are re-read.**
- **Sources:** (web dir listing only) `frontend_web/src/pages/onboarding/` at HEAD.
  Mobile sources: NOT INSPECTED.

### New questions found during re-validation (not in #184)

#### GM02-Q20 — Counter-offer verification
- **Decision status:** Answered: B, check every outside booking, launch grill, 23 Oct 2026 - see VERIFY-GATE-01. Engineering: see BL-01.
- **Actual today:** Public counter-offer submission and acceptance already run the public verification gate. The shared guard skips non-public shifts (`pr257:backend/shifts/base.py:400`, `:462`, `pr257:backend/onboarding/verification/state.py:174`).

#### GM02-Q21 — Should a manager be warned or blocked from offering a shift to an unverified or suspended worker?
- **Type: decision. Severity: High. Decision status: OPEN.**
- **ACTUAL TODAY:** Ordinary offer creation checks public shifts. Dedicated offer creation uses a different path. The shared guard skips non-public shifts (`pr257:backend/shifts/base.py:348`, `pr257:backend/shifts/posting.py:159`, `pr257:backend/onboarding/verification/state.py:174`). The booking check is settled in ON-Q03. The open detail is what the manager sees or can send before an outside worker accepts where the creation path still permits the offer.
- **Options:** A — Show readiness and let the manager send the offer while the worker finishes checks. B — Stop the offer for a suspended or not-found worker and warn when verification is incomplete.
- **RECOMMENDED: B.** Blocking suspended workers stops the platform sending booking
  emails to people who cannot legally work; warning (not blocking) unverified workers
  preserves the case where verification completes before accept. A alone still lets
  managers book suspended workers by mistake.
- **Normal case:** manager offers to a verified locum → no friction. **Edge case:**
  favourite locum suspended yesterday → offer blocked, manager sees why, picks someone
  else. **Notification side effect:** fewer dead offer emails; suspended workers stop
  receiving offers they cannot accept. **Wrong tenant:** an offer to a worker from
  another pharmacy is unaffected by this question (audience rules are GM-11).
- **Sources:** [assignment.py](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/blob/97c4543e051b43fe30ec7e2e61ad3d69957a918e/backend/shifts/assignment.py#L25-L29).

#### GM02-Q22 — Should a passed AHPRA expiry date itself block new public applications, even without a fresh lookup?
- **Type: decision. Severity: High. Decision status: OPEN.**
- **ACTUAL TODAY:** `ahpra_expiry_date` is stored (`ahpra.py:_update_ahpra_fields()`)
  but is **not** enforced at apply or accept. The apply-time gate reads the latest
  `AhpraCheck.register_data` (`state.py:ahpra_state()`), not the stored date. The
  stored date only (a) triggers a desktop recheck queue *after* expiry on public
  apply/accept (`state.py:queue_public_recheck()`), and (b) blocks talent-board
  publishing for pharmacists (`talent/views/explorer.py:170`). Under ScrapingBee, (a)
  never fires. So a pharmacist whose registration expired last month can keep applying
  until some lookup happens to run.
- **Options:** **KEEP — Keep current logic:** expiry alone blocks nothing at apply/accept. |
  **A — Expiry blocks new public applications:** stored expiry past → same refusal as
  an unreadable result, until a fresh lookup confirms current registration; existing
  bookings kept, both sides warned. | **B — Expiry triggers a same-day lookup and a
  warning, but does not block:** worker must re-verify before the shift starts.
- **RECOMMENDED: A.** An expiry date is the register's own statement of currency; the
  platform already has it. A renewal in progress is handled by the fresh lookup, not by
  leaving the gate open. B leaves the same hole Q06 is trying to close.
- **Normal case:** registration renewed → fresh lookup → `ok`, no interruption. **Edge
  case:** pharmacist renews the day before a shift; lookup lags → blocked from *new*
  applications, existing booking kept and warned (per Q07/C). **Retry:** Re-check button
  (desktop) / next signup-style lookup is the recovery path.
- **Sources:** [state.py](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/blob/97c4543e051b43fe30ec7e2e61ad3d69957a918e/backend/onboarding/verification/state.py#L30-L80),
  [ahpra.py](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/blob/97c4543e051b43fe30ec7e2e61ad3d69957a918e/backend/onboarding/verification/ahpra.py#L280-L310),
  [explorer.py](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/blob/97c4543e051b43fe30ec7e2e61ad3d69957a918e/backend/talent/views/explorer.py#L156-L173).

#### GM02-Q23 — Should intern talent posts get the same AHPRA-expiry check pharmacist posts get?
- **Type: decision (small). Severity: Medium. Decision status: OPEN.**
- **ACTUAL TODAY:** Talent publish (`talent/views/explorer.py:156-173`) checks
  `ahpra_verified` + `ahpra_expiry_date` only when `user.role == "PHARMACIST"`.
  Interns are OTHER_STAFF: they need `verified` (which includes AHPRA via
  `policy.requirements()`), but no expiry check runs at publish — and interns store
  their expiry in the `AhpraCheck.register_data`, not on the profile
  (`state.py:queue_public_recheck()` comment: "Other-staff (intern) profiles have no
  expiry column"), so the profile-level check could not run as written anyway.
- **Options:** **KEEP — Keep current logic:** interns publish on Verified alone. |
  **A — Same expiry check for interns:** read expiry from the latest check; block
  publish when expired. | **B — Interns cannot publish availability posts:** pharmacist
  and Explorer posts only.
- **RECOMMENDED: A.** Interns practise under provisional registration; an expired
  provisional registration is the same trust problem as an expired general one. B is
  disproportionate — interns are a real locum pipeline.
- **Sources:** [explorer.py](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/blob/97c4543e051b43fe30ec7e2e61ad3d69957a918e/backend/talent/views/explorer.py#L156-L173),
  [policy.py](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/blob/97c4543e051b43fe30ec7e2e61ad3d69957a918e/backend/onboarding/verification/policy.py#L52-L78).

#### GM02-Q24 — Who may skip the Australian mobile check, and what must they prove instead?
- **Type: decision (small). Severity: Medium. Decision status: OPEN.**
- **ACTUAL TODAY:** `policy.py:mobile_waived()` — only EXPLORER + `user.mobile_check_skipped`
  may skip mobile, and then `gov_id_verified` is required instead. Who sets
  `mobile_check_skipped`, and what proof is needed to set it, was NOT traced (flag
  setter not found in inspected files). Onshore workers with no AU mobile number have
  no skip path in the inspected code.
- **Options:** **KEEP — Keep current logic:** overseas newcomers only; ID instead of
  mobile. | **A — Any worker may skip with verified ID:** onshore users without an AU
  mobile can verify by ID. | **B — No skip at all:** everyone verifies an AU mobile.
- **RECOMMENDED: KEEP**, provided the flag-setter is an admin/support action with a
  recorded reason (verify this when the flag is traced). A widens the ID-fraud surface
  without a need shown; B locks out genuine overseas newcomers.
- **Sources:** [policy.py](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/blob/97c4543e051b43fe30ec7e2e61ad3d69957a918e/backend/onboarding/verification/policy.py#L52-L60).

---

## 3. The single first decision question

### ON-P03 — Which AHPRA lookup should run at launch?

**Ask this first, before ON-Q06, ON-Q07 and ON-P02.**

**Why first:** every other AHPRA question assumes the enforcement machinery works.
It only fully works on the **desktop** source. On the default ScrapingBee source the
Re-check button returns 409, the post-expiry recheck queue never fires, the admin
overdue alerts never run, and (unconfirmed — see the question) the suspension /
not-found handling may stay inert. The outside-booking scope is settled in ON-Q03. Re-check frequency is a separate question (ON-Q06).
picture of what the code does.

**Plain English:** ChemistTasker checks a pharmacist's registration against AHPRA's
public register. There are two ways to do that check. One (ScrapingBee) is a paid
service that reads the register from the cloud, once, when the pharmacist signs up.
The other (desktop verifier) is a small program on an office computer that reads the
register, and it is the only way the system can re-check someone later, notice a
suspension, or let the pharmacist press "Re-check". The system is currently set to
the first way. The question is which way runs at launch.

**ACTUAL TODAY:** `AHPRA_SOURCE` defaults to `'scrapingbee'`
(`backend/core/settings.py:643`). Sign-up lookup runs through ScrapingBee with 3
retries and sets Verified. Every desktop path is gated on `AHPRA_SOURCE == 'desktop'`.

**Options:**

- **KEEP — Keep current logic:** ScrapingBee, one lookup at sign-up; the suspension /
  not-found / Re-check handling may stay inactive. *Scenario:* a pharmacist is
  suspended two months after signing up. Nothing notices until they happen to trigger
  another lookup. Their bookings stand. *Trade-off:* no office PC to keep on; weakest
  protection.
- **A — Desktop verifier:** the office PC must stay on; new sign-ups wait for it.
  *Scenario:* the same suspension is picked up by a re-check; future bookings are
  auto-cancelled, the pharmacy is told, the worker is paused. *Trade-off:* the PC is a
  single point of failure — if it is off, checks sit pending and admins are emailed
  after 15 minutes; sign-ups wait. Run it on staging first.
- **Other (describe)** / **Defer** — always available.

**RECOMMENDED: A — after a staging trial.** Only the desktop source feeds the
suspension, not-found and Re-check handling the rest of the Grill assumes. If the
office PC cannot stay on, the honest fallback is KEEP *plus* recording that the
automatic protections in ON-Q06/Q07/P02 do not run — not pretending they do.

**What this unblocks:** ON-Q06 (re-check cadence), ON-Q07 and ON-P02.

**Suggested second question:** ON-Q06 (re-check cadence).

---

## 4. Code gaps vs decision gaps

### 4.1 Decision status by question

| ID | Question | Severity | Status |
|---|---|---|---|
| ON-Q01 | Sign-up tracks | Low | Answered: KEEP the existing sign-up tracks, launch grill, 23 Oct 2026 - see ON-Q01 |
| ON-Q02 | What a worker can do before Verified | Medium | Answered: KEEP, launch grill, 23 Oct 2026 - see GM01-Q04 for the single re-confirmation |
| ON-Q03 | Where verification is enforced | Critical | Answered: B, check every outside booking, launch grill, 23 Oct 2026 - see VERIFY-GATE-01 |
| ON-P01 | Who is exempt from AHPRA gates | High | Answered: A, employees are exempt and favourites are checked, launch grill, 23 Oct 2026 - see AHPRA-FAV-01 |
| ON-Q04 | When pay details must be ready | Medium | Answered: B, tell the worker early and require pay details before acceptance, launch grill, 23 Oct 2026 - see ON-Q04 |
| ON-Q05 | What Explorers can do with shifts | High | OPEN |
| ON-Q06 | How AHPRA is re-checked | Critical | OPEN (current text corrected) |
| ON-P03 | Which AHPRA lookup runs at launch | Critical | OPEN — **ask first** |
| ON-Q07 | Unconfirmed registration → future bookings | High | OPEN |
| ON-P02 | Suspended/Cancelled → what happens | Critical | OPEN |
| ON-Q08 | Who must pass an ID check | High | OPEN |
| ON-R01 | How long verification evidence is kept | Medium | OPEN |
| ON-Q09 | Who must prove indemnity cover | High | OPEN |
| ON-Q11 | What a pharmacy must pass before posting | Critical | OPEN |
| ON-Q12 | Which site brief fields are required | Medium | OPEN |
| ON-Q13 | Save a payment method at setup | High | OPEN |
| ON-Q14 | How organisations join | Medium | OPEN |
| ON-Q15 | Must every step work on mobile | — | **UNVERIFIED — re-check mobile first** |
| GM02-Q20 | Counter-offer verification | High | Answered: B, check every outside booking, launch grill, 23 Oct 2026 - see VERIFY-GATE-01. Engineering: see BL-01. |
| GM02-Q21 | Warn/block offers to unverified workers? | High | OPEN (new) |
| GM02-Q22 | Stored AHPRA expiry as a block? | High | OPEN (new) |
| GM02-Q23 | Intern talent posts: same expiry check? | Medium | OPEN (new) |
| GM02-Q24 | Who may skip the mobile check? | Medium | OPEN (new) |

Settled, do not re-ask: **ON-Q10** (super on ABN terms — the notice already exists,
`engagement.py:734`).

### 4.2 Code gaps (no decision needed — build/fix once the owner has answered what depends on them)

| ID | Gap | Evidence | Depends on |
|---|---|---|---|
| CG-01 | No scheduled AHPRA register re-scan; only a 15-min admin alert about overdue desktop checks | `settings.py:271`, `tasks.py:380` | ON-P03, ON-Q06 |
| CG-02 | Progress % does not match Verified: counts resume/bio/rates/referees; ignores email/mobile *verification* | `services/progress.py` vs `policy.requirements()` | None (fix: drive UI from `verification_summary().missing`) — but confirm the UI actually uses `missing` (frontend NOT INSPECTED) |
| CG-03 | Stored `ahpra_expiry_date` not enforced at apply/accept | `state.py:ahpra_state()` reads `AhpraCheck.register_data`, not the stored date | GM02-Q22 |
| CG-04 | The shared verification guard skips non-public paths. Public counter-offer submission and acceptance and ordinary public offers already use it. | `pr257:backend/shifts/base.py:348`, `:400`, `:462`; `pr257:backend/onboarding/verification/state.py:174` | BL-01 |
| CG-05 | Internal employee rostering is outside the carried outside-booking check. | `assignment.py:141-237` | ON-Q03 / ON-P01 |
| CG-06 | Talent-board authenticated feed still leaks full names/user IDs (`ExplorerPostReadSerializer`); only `public_feed` redacts | `talent/serializers/explorer.py:13-17,187-195` | GM-18 (TB-01) — adjacent, listed here because it is a worker-identity issue |
| CG-07 | `add_view` counts every authenticated call, no limit | `talent/views/explorer.py:230` | GM-18 (TB-07) — adjacent |
| CG-08 | `offers.accept()` runs the AHPRA gate *before* checking the offer belongs to the caller | `offers.py:349` vs `:351` | None (ordering wart; fix when touching accept) |
| CG-09 | Intern AHPRA expiry lives only in `AhpraCheck.register_data`, not on the profile — no profile-level expiry check is possible for interns | `state.py:197` comment; `onboarding/models.py` (no expiry column on OtherStaff) | GM02-Q23 |
| CG-10 | Owner-setup skip flag: web uses sessionStorage; web exports `clearOwnerPharmacySetupSkipped()` but no call site was verified, so whether the flag is ever cleared in practice is unconfirmed (senior-review correction — was "never clears it"); mobile uses AsyncStorage and clears it once a pharmacy exists | `frontend_web/src/utils/ownerSetup.ts`, `frontend_mobile/utils/ownerSetup.ts` | None (tiny parity fix) |
| CG-11 | `BILLING_LIVE_DATE = 2025-06-01` with comment "June 1, 2026"; `FREE_TRIAL_DAYS = 0` | `settings.py:679-682` | GM-16 (SH-04) — adjacent |

**Fixed since #184 (do not re-raise as gaps):** TB-03 — `get_queryset()` now filters
through `_visible_posts()` (hidden/stale posts excluded from list/feed/retrieve,
`talent/views/explorer.py:62-76`); PR #183 merged (suspension/not-found handling,
member exemption, Re-check, desktop verifier exist in code).

### 4.3 Implementation backlog — SEPARATE, and NOT decided

> **Nothing in this section is approved work.** These items exist only so that, *after*
> the owner answers, the work is traceable to the decision that authorised it. Do not
> implement, schedule, or present any item here as decided. Each item needs an owner
> decision ID first, then cross-client positive/negative tests (web + Expo) before it
> counts as done.

| # | Backlog item (draft only) | Needs decision | Notes |
|---|---|---|---|
| B1/B2 | Engineering: see BL-01 | ON-Q03 | Keep public coverage and enforce the shared check for outside bookings across tiers |
| B3 | Offer-time verification display / block for suspended workers | GM02-Q21 | Manager offer screens (web + Expo); do not leak AHPRA detail beyond status |
| B4 | AHPRA re-check job (daily scan of booked workers, or the cadence the owner picks) + source selection | ON-P03, ON-Q06 | Needs a runnable lookup source; desktop PC on-call vs ScrapingBee cost; beat task + tests |
| B5 | Stored-expiry block at apply/accept (or the alternative the owner picks) | GM02-Q22 | Include intern expiry source (CG-09) |
| B6 | Intern AHPRA-expiry check on talent publish | GM02-Q23 | Read expiry from latest check |
| B7 | Engineering: see BL-02 | ON-P01 | Keep the employee exemption and check favourites |
| B8 | Engineering: see BL-03 | ON-Q04 | Early readiness notice and acceptance gate, including TFN/super |
| B9 | Explorer apply path: hide boards or block apply with upgrade prompt (per owner pick) | ON-Q05 | Web + Expo; dead-applicant cleanup |
| B10 | ID check for all workers (if owner picks A/C) | ON-Q08 | Gate change via `VERIFICATION_EXTRA_REQUIREMENTS` + grace; coordinate with ON-R01 retention |
| B11 | Evidence retention/deletion schedule + AhpraCheck snapshot deletion | ON-R01 | Legal review first; do not build B before the decision |
| B12 | Indemnity insurance field + upload + expiry + gate/badge | ON-Q09 | New model fields, OCR/review flow, expiry machinery (reuse AHPRA patterns); legal confirmation first |
| B13 | Pharmacy posting gate (ABN / admin check per tier) | ON-Q11 | `post_shift()` + pharmacy verification flow; support path for failed ABN checks |
| B14 | Required site-brief fields + parking/arrival/contact fields | ON-Q12 | Model + web/Expo pharmacy forms; per-pharmacy (multi-site safe) |
| B15 | Saved payment method at setup (Stripe customer / off-session) | ON-Q13 | GM-16/GM-17 own the design; fallback to fresh checkout inside D02 window |
| B16 | Progress % driven from `verification_summary().missing` | CG-02 | Web + Expo onboarding screens; verify current UI wiring first |
| B17 | Mobile onboarding parity repair (whatever re-inspection finds) | ON-Q15 | **Blocked on re-inspection** — do not scope until mobile screens are read at the current head |
| B18 | Talent-board identity redaction for authenticated feed | CG-06 (GM-18) | Serializer change; check what the UI needs (reference codes) |
| B19 | Mobile-skip flag: confirm setter is admin/support-only with a recorded reason | GM02-Q24 | Trace `mobile_check_skipped` setter (NOT INSPECTED) |

### 4.4 What this area does NOT decide (belongs to other areas)

- Cancellation fees/refunds for AHPRA-cancelled bookings → GM-15 / CX-Q20.
- Billing live date, trial, subscriber pricing, saved-card design → GM-16 / GM-17.
- Talent-board visibility/identity rules beyond the publish gate → GM-18.
- Availability matching/freshness → GM-19. Chat, notifications, admin, privacy → GM-20/22/26.
- Login/OTP/session behaviour → GM-01. Pharmacy/owner setup detail → GM-03.
  Organisations/chains → GM-04. Roles/memberships/invites → GM-05.

---

## Appendix A — Evidence index (all read at HEAD `97c4543e`)

Backend: `backend/onboarding/verification/policy.py` (Verified rule),
`ahpra.py` (ScrapingBee lookup + record evaluation), `state.py` (AHPRA state machine,
gates, suspension transitions), `desktop.py` (desktop verifier queue),
`documents.py` (Azure OCR), `recheck.py` (Re-check endpoint),
`reminders.py` (referee reminders), `orchestration.py`, `onboarding/recheck.py`,
`onboarding/tasks.py` (incl. `verify_ahpra_task`, `alert_overdue_ahpra_checks`,
`run_referee_reminder`), `onboarding/services/progress.py`,
`onboarding/models.py` (profile fields), `onboarding/verification/*` (dir),
`backend/shifts/interest.py`, `offers.py`, `assignment.py`, `engagement.py`,
`posting.py`, `access.py`, `counter_offers.py`, `serialization/offers.py`,
`backend/talent/views/explorer.py`, `talent/models.py`,
`talent/serializers/explorer.py`, `backend/organizations/models.py`,
`organizations/views.py`, `backend/memberships/serializers.py`,
`backend/billing/views.py` (partly — module split, not fully traced),
`backend/core/settings.py`, `backend/users/models.py`.

Frontend (read): `frontend_web/src/pages/register.tsx`,
`frontend_web/src/utils/ownerSetup.ts`, `frontend_mobile/app/register.tsx`,
`frontend_mobile/utils/ownerSetup.ts`, `frontend_web/src/pages/onboarding/` (dir listing only).

Tests seen but not read (existence only): `backend/shifts/test_ahpra_application_gates.py`,
`backend/onboarding/test_verification_policy.py`, `test_review_183_fixes.py`,
`test_role_tabs_contract.py`, `test_tab_capabilities_contract.py`.

## Appendix B — Decision-status summary

| Status | Questions |
|---|---|
| OPEN (16) | ON-Q05, ON-Q06, ON-P03, ON-Q07, ON-P02, ON-Q08, ON-R01, ON-Q09, ON-Q11, ON-Q12, ON-Q13, ON-Q14, GM02-Q21, GM02-Q22, GM02-Q23, GM02-Q24 |
| ANSWERED / REFERENCE (6) | ON-Q01, ON-Q02 (single re-confirmation at GM01-Q04), ON-Q03, ON-P01, ON-Q04, GM02-Q20 (covered by ON-Q03) |
| SETTLED — do not re-ask (1) | ON-Q10 |
| UNVERIFIED — re-check before asking (1) | ON-Q15 |

## Appendix C — What was NOT inspected (must be closed before the area is signed off)

1. All mobile onboarding/profile screens + `ChooseAccountTypeCard.tsx` (HTTP 429
   stopped the reads) — blocks ON-Q15 and the Expo half of most questions.
2. Web onboarding tab screens (`onboarding_pharmacist/`, `onboarding_staff/`,
   `onboarding_explorer/` contents) and the apply/offer/accept dialogs (ON-11 frontend half).
3. The Next web app (existence and parity — not confirmed at this head).
4. TalentBoard "Request booking" screens (web + mobile).
5. `OrganizationCreate.tsx` routing.
6. Full billing module (checkout flow split across files; GM-16 owns it).
7. `cancel_upcoming_assignments()` scope (public-only vs all tiers).
8. `mobile_check_skipped` flag setter (GM02-Q24).
9. Whether the ScrapingBee path writes usable `AhpraCheck` rows (ON-P03 caveat).
10. Staging env values (`AHPRA_SOURCE`, `VERIFICATION_EXTRA_REQUIREMENTS`).
11. `Pharmacy.verified` readers (audit said ethical marketplace only — not re-traced).
12. `onboarding/services/skills.py:61` insurance comment (file not fetched).

*End of GM-02 trace. Documentation only — no code was modified.*


---

## Added 2026-11-21: waiting owner decisions (review of PR #267)

Evidence refs: `pr257:` = `origin/agent/pr257-int` at `21add924` (Expo app + newest backend), `main:` = `origin/main` at `8ccf8f77` (web as deployed). Each question is asked once, recommendation first. Source: the orchestrator's waiting-decision list of 21 Nov (items W-01 to W-17, mapped in [`../OWNER_GRILL.md`](../OWNER_GRILL.md) section 3).

### Already answered by the owner: do not re-ask (launch grill, 23 Oct 2026)
The launch-grill artifact database `answers` records these five decisions on 23 Oct 2026.

| Question | Owner answer | Code today | What follows |
|---|---|---|---|
| ON-Q01 sign-up tracks | **KEEP** (three tracks; one "other staff" form that changes by role) | Unchanged | Closed |
| ON-Q02 what a worker can do before Verified | **KEEP**, given against the old description that signed-in workers browse every board | The dashboard already required mobile verification at #184 | Re-confirm once at GM01-Q04 |
| ON-Q03 where verification is enforced | **B**: Nadia and Sara are checked on every outside booking | Public apply and acceptance, ordinary public offers, and public counter-offer submission and acceptance already use the guard. That guard skips non-public bookings. | Engineering: see BL-01 |
| ON-P01 who skips the AHPRA check | **A**: Omar (employee) skips the check, Ben (favourite) is checked | Gap: favourites are treated as members and skip it (`is_public_shift_member_access`, `interest.py:22`) | Backlog BL-02. AHPRA-FAV-01 / GM-05 Q-01 are answered and drop out of the ask order |
| ON-Q04 when pay details must be ready | **B**: Sara is told early and must finish before accepting | Missing or unverified ABN blocks acceptance; missing TFN/super allows assignment and defers payroll. The early checklist is missing in the traced flow. | Engineering: see BL-03 for early notice and the acceptance change |
