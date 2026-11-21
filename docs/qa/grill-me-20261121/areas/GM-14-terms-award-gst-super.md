# GM-14 — Terms / Award / GST / Super — Full Grill Documentation

**Area:** GM-14 Terms/Award/GST/super (Issue #250, area 14 of 26)
**Method:** Issue #250 interview rules + PR #184 format; Web (Vite + Next) and Expo traced together in every question, side by side, including parity gaps.
**Status:** TRACED + VALIDATED at PR #249 head. Decision status per question in Part C. No owner decision recorded yet. No code changed in this phase — documentation and decisions only. **No prior GM-14 trace file existed anywhere in `~/workspace`** (checked before tracing); this is the first full trace.

## Bases (exact SHAs verified 2026-11-21)

| Source | Ref | SHA / head |
|---|---|---|
| Active PR #249 (revalidation target) | `refs/pull/249/head` | `97c4543e051b43fe30ec7e2e61ad3d69957a918e`, branch `fix/pr248-expo-production-waves-20261104`, open draft, unchanged since first verified 2026-11-21 |
| Old grill PR #184 | `refs/pull/184/head` | `c786a4b8182ebf9b505d47cd81980eb3b9851ce3`, branch `docs/launch-grill-20261020` |
| PR #249 body text | — | Names a "working head `26cae2d6`" — the short SHA of the **last listed implementation commit**, **not** the branch head. The API head is `97c4543e…`. All tracing below is at the API head. |

**Rate-limit note (this re-run):** no HTTP 429 occurred. ~70 GitHub read calls were made strictly sequentially with ≥8 s between calls and all succeeded.

**Files verified at the PR #249 head in this trace:**
`backend/shifts/engagement.py` (33,914 B — terms build/freeze/snapshot, TFN/ABN paths, super), `backend/workforce/award_rates.py` (17,372 B — MA000012 schedule resolution), `backend/shifts/offers.py` (accept flow: terms version check, freeze, payment-profile gate), `backend/shifts/finalize.py` (rate locked from accepted terms), `backend/billing/checkout_prices.py` + `stripe_support.py` (fee prices — GST search), `backend/core/settings.py` (billing flags), `backend/shifts/cancellation_policy.py` — **not** fetched (P09 preview calculator; GM-15 senior review adopted: preview-only, not connected), `frontend_mobile/roles/shared/shifts/ShiftTermsSummary.tsx` (Expo pre-apply money terms), `docs/qa/launch-grill/questions.json` + `AUDIT.md` at `refs/pull/184/head`.
**Adopted, not re-fetched:** GM-02 senior-reviewed super-notice verdict (`engagement.py:734` verbatim — re-confirmed in this trace by direct read); GM-06 senior-reviewed Award engagement findings (`EmploymentEngagement`, `award_rate_snapshot`, junior birthday rule, `award_code MA000012`); GM-15/GM-17 senior-reviewed findings (P09 calculator, no refund/credit engine, GST/tax-invoice gap); GM-01 senior-reviewed mobile-OTP finding (unrelated).
**Not verified / still UNKNOWN:** which component renders the full frozen terms to the worker in the Vite accept dialog (the accept endpoint is verified; the dialog's terms rendering was not line-read); who sets `abn_verified` / `abn_entity_confirmed` on a worker's onboarding (which service/check); whether any screen shows the worker their payment-readiness state before accept (the backend status exists; the exposure half is the open half of ON-Q04); the GST treatment of worker invoices (GM-17 territory — adopted, not re-traced).

## Part A — Current-flow matrix

Columns: Trigger → Actor → Backend / API → Vite web → Next web → Expo mobile → Persisted state → Event / side effect → Recovery / denial path.

### F01 — Terms are built when a worker accepts an offer (TFN path)

| Trigger | Actor | Backend / API | Vite | Next | Expo | Persisted state | Event / side effect | Recovery / denial |
|---|---|---|---|---|---|---|---|---|
| Worker accepts an offer for a TFN-posted shift | Worker | `build_shift_engagement_terms(shift, user, offer)` (`backend/shifts/engagement.py:572`): `payment_preference` must match the shift's posted preference or 400 ("The pathways must match before acceptance"); `_external_payment_profile` requires a complete TFN profile (TFN number + super fund name + USI + member number) or 400; `_build_tfn_award_terms` resolves the Award schedule per occurrence (`resolve_award_schedule`, role/classification/CASUAL/DOB/date) and enforces the floor (see F03); terms dict: `version: 1`, `acceptance_required: True`, `engagement_kind: KIND_SHIFT_EMPLOYMENT`, `settlement_channel: PAYROLL` (if payroll ready) or `TIMESHEET_ONLY`, `employment_type: "CASUAL"`, `award_code: "MA000012"`, `award_classification`, `pay_basis`, `award_floor` (snapshot), `owner_bonus`, `super` (fund name/USI/member-number-present), `facilitator_notice`, `relationship_notice`, `payroll_setup_notice` | Accept dialog (terms shown — rendering not line-read; UNKNOWN which component) | Migrated copy of the same flow (not line-read; parity assumed — TO-CONFIRM) | Accept flow via shared-core; pre-apply money summary via `ShiftTermsSummary` ("Paid through payroll (TFN)", "+ 11.5% super" pill for casual/locum, "+ super" for full/part-time — display only, from `shift.superPercent`, not from the frozen terms) | Frozen on accept: `offer.engagement_terms_snapshot`, `engagement_terms_accepted_at`, `payment_preference_snapshot`, `settlement_channel`, `engagement_kind` (`offers.py:accept`) | None at build time; acceptance emails sent on commit | Posted pref ≠ worker pref → 400. Missing classification → 400 "Complete the worker's public-platform Award classification before accepting this TFN shift." Pharmacist rate at/below floor → 400 (F03). Payroll not ready → **acceptance is NOT blocked**: assignment proceeds as TIMESHEET_ONLY and payroll "may be activated after acceptance" (`payroll_activation_required`, `activate-payroll` endpoint in `offers.py:566`) |

### F02 — Terms are built when a worker accepts an offer (ABN path)

| Trigger | Actor | Backend / API | Vite | Next | Expo | Persisted state | Event / side effect | Recovery / denial |
|---|---|---|---|---|---|---|---|---|
| Worker accepts an offer for an ABN-posted shift | Worker | Same builder, ABN branch (`engagement.py:727`): `engagement_kind: KIND_INDEPENDENT_CONTRACTOR`, `settlement_channel: SETTLEMENT_INVOICE`, `provider_abn` (formatted), `provider_entity_name`, `gst_registered` (bool from onboarding), **`super_review_required: True`, `super_payable_confirmed: False`** (always), `super_notice` verbatim: "Invoice settlement does not by itself remove superannuation obligations. The pharmacy/principal must review whether super is payable for a labour-only contractor.", `facilitator_notice` ("ChemistTasker is not the employer or engaging principal"), `relationship_notice` ("An ABN or invoice does not by itself determine legal contractor status…"), `invoice_notice` (settlement routed to the existing invoicing system, not payroll) | Accept dialog + separate `independent_contractor_status_confirmed` checkbox (required — `require_acceptance_payload`) | Same (not line-read) | Same backend; `ShiftTermsSummary` shows "Paid by invoice (ABN)" pill | Same frozen fields as F01 | None at build time | ABN missing / not verified / entity not confirmed → 400 ("ABN is required for invoice settlement." / "ABN must be verified…" / "Confirm the ABN entity…"). Contractor status not separately confirmed → 400. **Nobody ever determines whether super is payable**: `super_payable_confirmed` is always `False`, there is no workflow, approver, or field that ever sets it `True` (code gap CG-3) |

### F03 — Award floor enforcement (TFN casual marketplace shifts)

| Trigger | Actor | Backend / API | Vite | Next | Expo | Persisted state | Event / side effect | Recovery / denial |
|---|---|---|---|---|---|---|---|---|
| Terms built for a TFN shift (F01) | System (per occurrence) | `_build_tfn_award_terms` (`engagement.py:488`): classification from role/onboarding (`_other_staff_classification`); per occurrence `resolve_award_schedule(role, classification, employment_type="CASUAL", date_of_birth, as_of=work_date)`; `_award_floor_for_occurrence` gives `rate` + `segments` + `review_required`/`review_reason`; **pharmacist: posted rate must be strictly above the floor** or 400 ("Marketplace TFN pharmacist shifts are above-Award engagements. The agreed rate must be above the applicable casual Pharmacist Award floor of $X/hr."); **other staff: agreed rate = max(posted rate, floor + owner bonus)**; `pay_basis` = `ABOVE_AWARD` (pharmacist) or `AWARD_PLUS_BONUS` / `AWARD_OR_HIGHER`; floor `review_required` (e.g. overtime/penalty uncertainty) → `payroll_review_required=True` + reasons listed, which blocks payroll activation (not acceptance) | Rate shown in accept dialog comes from the frozen terms (`agreed_rate` per occurrence) | Same | Same | `award_floor` snapshot (first occurrence) + per-occurrence `award_floor_rate` / `award_floor_segments` / `award_review_required` / `award_review_reason` frozen in the terms | None | Floor rate `None` (schedule cannot resolve) → posted rate is used, or 400 "The final agreed hourly rate must be recorded before accepting this shift." if none posted. Review-required → payroll deferred (timesheet-only) until reviewed |

### F04 — Award schedule itself (what MA000012 means in code)

| Trigger | Actor | Backend / API | Vite | Next | Expo | Persisted state | Event / side effect | Recovery / denial |
|---|---|---|---|---|---|---|---|---|
| Any Award resolution (terms build F03, employment engagements GM-06) | System | `backend/workforce/award_rates.py`: `AWARD_CODE = "MA000012"`, reference `https://awards.fairwork.gov.au/MA000012.html`; **Schedule B dollar amounts published by Fair Work, ppc 01Jul26**, stored as dollar values (not percentages) "so the frozen engagement snapshot matches the source"; classifications: PHARMACIST → PHARMACIST / EXPERIENCED_PHARMACIST / PHARMACIST_IN_CHARGE / PHARMACIST_MANAGER; ASSISTANT → LEVEL_1–4; TECHNICIAN → LEVEL_3–4 (dispensary work); STUDENT → YEAR_1–4; INTERN → FIRST_HALF / SECOND_HALF; junior schedules computed by age/birthday percentage of the adult base; weekday/weekend/overtime multipliers | Not applicable (no UI for the schedule itself) | Not applicable | Not applicable | Frozen `award_rate_snapshot` (employment engagements, GM-06) / `award_floor` snapshot (marketplace terms, F01) | None | Schedule staleness: rates are hard-coded dollar amounts dated 01Jul26 — there is no update mechanism, expiry, or Fair Work sync in the traced code (code gap CG-4; the owner must decide who updates them and when) |

### F05 — Terms freeze + version check (what "agreed" means in code)

| Trigger | Actor | Backend / API | Vite | Next | Expo | Persisted state | Event / side effect | Recovery / denial |
|---|---|---|---|---|---|---|---|---|
| Worker confirms acceptance | Worker | `offers.py:accept`: terms rebuilt server-side; if `request.data["terms_version"] != shift_engagement_terms_version(terms)` (SHA-256 fingerprint of the terms JSON) → 409 `TERMS_CHANGED` ("These terms changed since you reviewed them. Review the updated terms."); `require_acceptance_payload`: `engagement_terms_accepted` must be `True`, and for ABN `independent_contractor_status_confirmed` must be `True`; then `freeze_accepted_terms` stamps `accepted_at` + `accepted_by_user_id` and the snapshot is stored on the offer | Dialog sends `terms_version` + acceptance flags | Same | Same | `offer.engagement_terms_snapshot` (full dict incl. `version: 1`), `engagement_terms_accepted_at` | Acceptance emails (no PDF copy attached — AG-Q03) | Stale terms → 409, must re-review. Missing acceptance flag → 400. **The pharmacy never accepts anything**: no pharmacy-side acceptance, timestamp, or version is recorded anywhere in the traced code (AG-Q02) |

### F06 — Payment readiness (TFN/ABN profile status)

| Trigger | Actor | Backend / API | Vite | Next | Expo | Persisted state | Event / side effect | Recovery / denial |
|---|---|---|---|---|---|---|---|---|
| Any check of whether a worker can be paid (at accept, and wherever the status is surfaced) | System / manager | `worker_payment_profile_status(user)` (`engagement.py:199`): no onboarding → `ONBOARDING_INCOMPLETE`; TFN → READY or `TFN_SETUP_INCOMPLETE` (missing: tfn / super_fund_name / super_usi / super_member_number); ABN → READY or `ABN_SETUP_INCOMPLETE` (missing: abn / abn_verified / abn_entity_confirmed); no preference → `PAYMENT_PREFERENCE_REQUIRED`. The status **never exposes secret identifiers** (docstring). At accept, `_external_payment_profile` enforces it with field-level errors (F01/F02) | Where (if anywhere) this status is shown on apply/offer screens was **not re-traced** (Oct claim: managers only, `memberships/serializers.py:336` — NOT RE-VALIDATED) | Same UNKNOWN | Same UNKNOWN | Onboarding row fields only | None | Incomplete profile → accept blocked (400). Payroll activation blocked until ready (`activate-payroll`); the assignment itself is not blocked (timesheet-only, F01) |

### F07 — GST (what exists, and what does not)

| Trigger | Actor | Backend / API | Vite | Next | Expo | Persisted state | Event / side effect | Recovery / denial |
|---|---|---|---|---|---|---|---|---|
| Any fee, subscription, or invoice (GM-16/GM-17 money) | System | **Nothing**: no GST field, rate, or treatment exists in any traced billing file (`checkout_prices.py` is bare cents per offer; `stripe_support.py` has no tax settings; `OwnerBillingPage.tsx` shows no GST). The **only** GST fact in the traced code is the `gst_registered` boolean recorded on ABN terms (F02) — it is stored, never used in any calculation. No platform tax invoice is created anywhere (GM-17 adopted) | No GST shown on the billing page, the pay card (`$n × 30 AUD`, no tax line), or the subscription page | Same | Same | `gst_registered` flag on the frozen ABN terms | None | None — the gap is the absence (LA-R01/SH-15; GM-16-Q15/GM-17-Q06 own the decision; needs qualified tax advice) |

## Part B — Old questions re-validated (PR #184 / #204 / shift-lifecycle)

Method: every question in `questions.json` (130 questions + 30 carried decisions, re-read from `refs/pull/184/head` this session) was scanned for terms/Award/GST/super mechanics. Verdicts were re-checked against the PR #249 head `97c4543e`.

| Old ID | Old question | Verdict | Evidence (current code) |
|---|---|---|---|
| ON-Q10 | How should super show on ABN contractor terms? | **NO LONGER VALID as a question — premise false** | The Oct `current` said "ABN terms never mention super" while the `context` already said they do. Current code is unambiguous: ABN terms carry the super notice verbatim + `super_review_required: True` + `super_payable_confirmed: False` (`engagement.py:727-734`, re-read this trace; GM-02 senior review confirmed the same). The #184 recommendation (KEEP the notice) is already the code. What remains open is the **new** question: who ever decides whether super is payable (GM14-Q01) |
| ON-Q04 (ON-11) | When must worker pay details (ABN/TFN, bank, super) be ready? | **STILL VALID (gate verified; exposure not re-validated)** | Gate verified (F06): checked at accept, blocks acceptance. Exposure half (shown early on apply/offer screens, managers only) was not re-traced — do not decide the exposure half until it is. Carried forward as GM14-Q05 |
| AG-Q01 (SH-09) | What must the worker see before accepting? | **STILL VALID** | The frozen terms dict (F01/F02) contains pay type, Award basis, dates, times, final rate, legal notices — and **no** breaks, duties, site details, cancellation table, or platform terms version. `version: 1` is the schema version, not a platform terms version. Carried forward as GM14-Q02 |
| AG-Q02 (SH-09) | Does the pharmacy accept the same agreement? | **STILL VALID** | Only the worker accepts: `freeze_accepted_terms` stamps worker id + time; no pharmacy acceptance is recorded anywhere in the traced code. The pharmacy therefore never agrees the owner fee table (P09) or the subscription/fee terms that bind it. Carried forward as GM14-Q03 (first question) |
| AG-Q03 | Should both sides get a PDF copy of the agreement? | **STILL VALID** | No PDF copy exists: acceptance sends confirmation emails (`shift_accept.html`, `owner_worker_confirmed.html`) with no terms PDF attachment, and no download endpoint was found in the traced files. Carried forward as GM14-Q06 |
| AG-Q04 | How is employee vs contractor status decided? | **STILL VALID** | The pharmacy picks TFN or ABN per locum shift (`shift.payment_preference`); the worker must match or accept fails 400; the terms carry notices that an ABN "does not by itself determine legal contractor status" and that the record "is not a substitute for legal advice about employee/contractor classification". No relationship test exists. Carried forward as GM14-Q04 |
| AG-Q05 (SH-08) | Which changes after booking need the worker's new consent? | **NOT RE-VALIDATED** | The Oct claim (managers can change rate, role, payment type, description, travel after acceptance; only slots lock; frozen terms keep old values) was **not** re-traced — the shift-edit endpoints were not read in this trace. Carried as Oct evidence only; do not decide until re-traced. Listed as GM14-Q07 with status NOT RE-VALIDATED |
| AG-Q06 | Until the worker answers a change, which terms apply? | **NOT RE-VALIDATED** | No change-request flow was found in the traced files, which is consistent with the Oct "not built" — but the edit endpoints were not read, so this is not a verified verdict. GM14-Q08, NOT RE-VALIDATED |
| AG-Q07 | If the worker rejects the change, what happens? | **NOT RE-VALIDATED** | No rule was found in the traced files (consistent with Oct "not built"), but the edit endpoints were not read. GM14-Q09, NOT RE-VALIDATED |
| AG-Q08 (SH-08) | Until re-consent is built, lock key fields after the first acceptance? | **NOT RE-VALIDATED** | Slot locking after engagement is verified in the accept/finalise path (`slot_locked_for_shift_offer`, `finalize.py`); whether rate/role/payment/travel stay editable after acceptance was not re-traced. GM14-Q10, NOT RE-VALIDATED |
| AG-Q09–Q12 | Cancellation/cover notices, channels, reminders, late changes | **NOT GM-14 — route to GM-22/GM-23** | Notice recipients/channels/reminders are GM-22 (notifications) / GM-23 (calendars/operations). No GM-14 decision is carried from them. (One GM-14-relevant fact from the Oct text: reminders come from real assignments, so reservations get none — consistent with F01/F02, which create no assignment until payment) |
| PO-R01 | Must TFN shifts pass Pharmacy Award checks before posting? | **NOT GM-14 as asked — split** | GM-14 owns the *acceptance-time* Award check (F03, verified). The *posting-time* check is GM-10 (shift posting). No posting-time Award check was traced here — GM-10 to confirm |
| PO-Q15 / SH-04 | When should booking fees start? | **NOT GM-14 — route to GM-16** | Billing-state mechanism verified in GM-16 (`BILLING_LIVE_DATE` 2025-06-01 with "June 1, 2026" comment; `FREE_TRIAL_DAYS = 0`; `BILLING_LIVE_*_ENABLED` flags) |
| LA-R01 (SH-15) | Booking fees: GST and tax invoice? | **STILL VALID** | F07: no GST treatment anywhere; no platform tax invoice (GM-17 adopted). Carried forward as GM14-Q11 (owned jointly with GM-16-Q15 / GM-17-Q06) |
| LA-R02 (SH-16) | May cancellation charges launch before Australian legal review? | **NOT GM-14 — route to GM-16/GM-15** | Legal review of P09/penalties; GM-16-Q14 owns it |
| LA-Q10 (SH-09) | Accepted terms lack cancellation table / terms version | **STILL VALID** | Same as AG-Q01/AG-Q02 (F05): schema `version: 1` + SHA fingerprint + worker acceptance only |
| Carried D01–D03, F01, F04, P09 | Reservation/payment/fee decisions | **Adopted as boundary, not re-decided** | D01/D02/D03: GM-13 (D02/D03 not implemented — GM-13-Q01). F01/F04: GM-15/GM-17. P09: GM-15/GM-16 (preview-only calculator, not connected) |

**Old questions NOT carried forward unvalidated:** AG-Q05–Q08 are carried explicitly as NOT RE-VALIDATED (not as current fact); AG-Q09–Q12, PO-R01 (posting half), PO-Q15, LA-R02 are routed away with their GM destination recorded.

## Part C — GM-14 question queue (new + carried, #184 format)

Per-question format: plain-English explanation first, then ACTUAL TODAY with **Web** and **Expo** side by side, RECOMMENDED, ALTERNATIVE A (keep), ALTERNATIVE B/C, Other/defer. Decision status: **OPEN** for all — no owner answer recorded.

### GM14-Q01 — Who ever decides whether super is payable for an ABN contractor — and what happens until they do? (new, from verified code)

**Plain English:** every ABN shift's terms say "invoice settlement does not by itself remove super obligations — the pharmacy must review whether super is payable for a labour-only contractor." But nothing ever records the answer: the terms always say `super_payable_confirmed: False`, nobody is assigned to review it, and the worker still gets paid by invoice either way. The owner needs to decide who makes that call and whether anything waits for it.
**ACTUAL TODAY — Web and Expo (same backend):** the notice is shown at accept; `super_review_required: True` and `super_payable_confirmed: False` are frozen into every ABN terms snapshot; no field, endpoint, or workflow ever changes them; settlement proceeds by invoice regardless.
**Normal case:** labour-only locum on ABN, pharmacy never reviews, invoice paid, super question never answered. **Edge case:** the worker is later found to be owed super (ATO: labour-only contractors can be owed super) — no record exists of who reviewed it or when. **Payment/notification:** none — no reminder, no flag, no payroll hold. **Web/Expo difference:** none — the gap is backend-wide.
**RECOMMENDED:** B — support/finance reviews before the **first** ABN payout to a worker (one review per worker, recorded with date + reviewer), and the review outcome is stored on the terms/worker record; later ABN shifts reuse it unless the relationship changes. Severity: high (super is a legal obligation, not a preference; getting it wrong is a Fair Work/ATO problem). Benefit: a real answer exists before money moves. Risk: a review queue to build and staff; first payouts slow down.
**ALTERNATIVE A — Keep current logic:** notice only; the pharmacy is told to review and nobody checks. Trade-off: zero build; the obligation stays entirely on the pharmacy with no evidence anyone looked.
**ALTERNATIVE B — Pharmacy attests at accept:** the pharmacy ticks "I have reviewed super for this worker" when posting/accepting, logged with time. Trade-off: an answer exists per shift, but it is self-attestation with no verification.
**ALTERNATIVE C — Treat ABN as super-payable by default:** pay super unless the pharmacy records an exemption reason. Trade-off: safest for the worker, most expensive, and needs a super payment path that does not exist today.
**Other (describe) / Defer:** deferring keeps A by default — say so explicitly, do not let it drift.
**Sources:** `backend/shifts/engagement.py:727-734` (ABN terms), `backend/shifts/engagement.py:199` (profile status).
**Decision status:** OPEN.

### GM14-Q02 — What must the worker see before accepting? (carried AG-Q01 / SH-09)

**Plain English:** the worker sees pay type, Award basis, dates, times, the final rate and legal notices — but not breaks, duties, site details, the cancellation table, or which version of the platform terms they are agreeing to. The cancellation table matters most: without it, the P09 fees cannot fairly be charged.
**ACTUAL TODAY — Web:** accept dialog shows the frozen terms fields (exact rendering not line-read — UNKNOWN which component). **ACTUAL TODAY — Expo:** same backend terms; the pre-apply `ShiftTermsSummary` shows only super/payment/travel/accommodation pills. **Backend (both):** terms dict has no breaks, duties, site, cancellation, or platform terms version.
**RECOMMENDED:** A — pay, times, breaks, duties, site, cancellation (table + version). Severity: high — disclosure is what makes the cancellation fees enforceable (GM-15/GM-16). Benefit: the worker agrees to the real deal. Risk: needs the cancellation table decided first (GM-15) and the terms version defined.
**ALTERNATIVE A — Keep current logic:** pay, times and legal notices only.
**Other / Defer.**
**Sources:** `backend/shifts/engagement.py:572` (terms dict), `backend/shifts/engagement.py:641-652` (base fields).
**Decision status:** OPEN.

### GM14-Q03 — Does the pharmacy accept the same agreement? (carried AG-Q02 / SH-09 — FIRST QUESTION, see Part D)

**Plain English:** only the worker accepts the terms. The pharmacy never records acceptance of anything — not the shift terms, not the owner fee table, not the subscription terms. If a fee is ever disputed, there is no record the pharmacy agreed to it.
**ACTUAL TODAY — Web and Expo (same backend):** `freeze_accepted_terms` stamps worker id + time only; no pharmacy acceptance field, endpoint, or timestamp exists in the traced code.
**RECOMMENDED:** A — yes, when it sends or approves: the pharmacy's acceptance is logged with time and terms version (at offer-send for the shift terms, and at subscribe/booking for the fee table). Severity: high — this is what makes the fee table and the cancellation bands binding. Benefit: disputes have an answer. Risk: needs acceptance points added on both clients at offer-send and at payment.
**ALTERNATIVE A — Keep current logic:** worker-only acceptance; pharmacy never agrees the terms. Trade-off: no work; every fee and cancellation charge rests on terms the pharmacy never accepted.
**Other / Defer.**
**Sources:** `backend/shifts/engagement.py:747` (`freeze_accepted_terms`), `backend/shifts/offers.py:accept`.
**Decision status:** OPEN — **ask first (Part D)**.

### GM14-Q04 — How is employee vs contractor status decided? (carried AG-Q04)

**Plain English:** the pharmacy picks "TFN employee" or "ABN contractor" per shift, and the worker must match. The terms themselves warn that an ABN label does not decide status and that the record is not legal advice. There is no test of the real relationship — so a mislabelled contractor is a sham-contracting risk.
**ACTUAL TODAY — Web and Expo (same backend):** per-shift `payment_preference`; mismatch blocks accept (400); ABN path requires a separate contractor-status confirmation tick; notices as quoted in F01/F02.
**RECOMMENDED:** B — relationship test first: assess the real relationship (control, integration, tools, risk) before the label sticks; ABN never decides alone. Severity: high (sham contracting). Benefit: the label follows the facts. Risk: a test to build + someone must apply it; slows posting.
**ALTERNATIVE A — Keep current logic:** pharmacy chooses ABN or TFN. **ALTERNATIVE B — Both parties attest:** still risks choosing the wrong legal status.
**Other / Defer:** get legal advice before launch either way (this question and Q01/Q11 both need it — they can share one advice).
**Sources:** `backend/shifts/engagement.py:629-640` (preference match), `:747` (contractor confirmation).
**Decision status:** OPEN.

### GM14-Q05 — When must worker pay details be ready — and who sees the gap early? (carried ON-Q04 / ON-11)

**Plain English:** pay details are checked only at accept, and the accept is blocked until they are complete. The old grill said they should be shown early (on apply + offer screens) so nobody discovers the gap at the last minute — but whether any screen shows them early was not re-traced, so that half cannot be decided yet.
**ACTUAL TODAY — Web and Expo (same backend):** gate verified (F06). Exposure half: UNKNOWN.
**RECOMMENDED:** B — before accepting, shown early (apply + offer screens) — **after** the exposure half is re-traced. Severity: medium. Benefit: workers fix their profile before the accept, not during it.
**ALTERNATIVE A — Keep current logic:** at accept only. **ALTERNATIVE B — Before applying. ALTERNATIVE C — Before first payout only.**
**Other / Defer.**
**Sources:** `backend/shifts/engagement.py:199,265`.
**Decision status:** OPEN — **blocked on re-tracing the exposure half**.

### GM14-Q06 — Should both sides get a PDF copy of the agreement? (carried AG-Q03)

**Plain English:** today nobody gets a copy of what was agreed — the acceptance emails go out, but the terms themselves are only in the database. Both sides should be able to prove what they agreed to.
**ACTUAL TODAY — Web and Expo (same):** no PDF, no downloadable copy, no terms attachment on the acceptance emails.
**RECOMMENDED:** A — emailed PDF once confirmed, also downloadable in the app. Severity: medium. Benefit: disputes have a document; Relief Buddy / LocumCo do this. Risk: PDF generation + storage to build.
**ALTERNATIVE A — In-app view only:** less to build; no durable copy outside the app.
**Other / Defer.**
**Sources:** `backend/shifts/offers.py:accept` (notification templates `shift_accept.html`, `owner_worker_confirmed.html`).
**Decision status:** OPEN.

### GM14-Q07 — Which changes after booking need the worker's new consent? (carried AG-Q05 / SH-08 — NOT RE-VALIDATED)

**Plain English:** the old grill said managers can still change rate, role, payment type, description and travel after acceptance, with only slots locked — so the shift card and the frozen terms can disagree. That claim was not re-checked against current code in this trace.
**ACTUAL TODAY:** NOT RE-VALIDATED (Oct 2026 evidence only). Slot locking after engagement is verified in the accept/finalise path; the edit endpoints were not read.
**RECOMMENDED (carried from #184, rec A):** rate, date, times, role, site, travel need new consent; notes/parking are notice-only. Severity: high if the Oct claim is true (cards disagreeing with frozen terms). Do not decide until re-traced.
**ALTERNATIVE A — Keep current logic:** edits allowed with a notice only. **ALTERNATIVE B — Rate and date only.**
**Other / Defer.**
**Sources:** #184 Oct 2026 (SH-08); re-trace `backend/shifts/` edit endpoints before deciding.
**Decision status:** OPEN — **NOT RE-VALIDATED**.

### GM14-Q08 — Until the worker answers a change, which terms apply? (carried AG-Q06 — NOT RE-VALIDATED)

**Plain English:** if there is no change-request flow, nobody can tell which terms apply after an edit — the card shows new values, the frozen terms keep the old ones.
**ACTUAL TODAY:** NOT RE-VALIDATED. No change-request flow was found in the traced files (consistent with Oct "not built"), but the edit endpoints were not read.
**RECOMMENDED (carried, rec A):** old terms stay; new terms apply only after consent. **ALTERNATIVE A — Keep current logic. ALTERNATIVE B — New terms apply; worker can decline afterwards.**
**Other / Defer.**
**Decision status:** OPEN — **NOT RE-VALIDATED**.

### GM14-Q09 — If the worker rejects the change, what happens? (carried AG-Q07 — NOT RE-VALIDATED)

**Plain English:** no rule exists in the traced files for a worker rejecting a change.
**ACTUAL TODAY:** NOT RE-VALIDATED (Oct: "not built").
**RECOMMENDED (carried, rec A):** keep old terms, or pharmacy cancels (counts as pharmacy-initiated; owner fee bands apply). **ALTERNATIVE B — Mutual cancel, no fee.**
**Other / Defer.**
**Decision status:** OPEN — **NOT RE-VALIDATED**.

### GM14-Q10 — Until re-consent is built, lock key fields after the first acceptance? (carried AG-Q08 / SH-08 — NOT RE-VALIDATED)

**Plain English:** locking rate, role, payment and travel after the first acceptance is the smallest safe step until re-consent exists — but whether those fields are currently editable was not re-checked.
**ACTUAL TODAY:** NOT RE-VALIDATED (slot lock verified; the rest not re-traced).
**RECOMMENDED (carried, rec A):** lock rate, role, payment, travel; to change them, cancel and repost. **ALTERNATIVE A — Keep current logic. ALTERNATIVE B — Allow, with re-consent (needs Q07 built first).**
**Other / Defer.**
**Decision status:** OPEN — **NOT RE-VALIDATED**.

### GM14-Q11 — Booking fees: GST and tax invoice? (carried LA-R01 / SH-15; jointly GM-16-Q15 / GM-17-Q06)

**Plain English:** the platform charges $30/$80 (or $15/$40) per booking and $30/month for a subscription, and nothing anywhere says whether GST is included, who the supplier is for tax purposes, or what tax invoice the pharmacy gets. The only GST fact in the code is a yes/no flag on ABN worker terms.
**ACTUAL TODAY — Web and Expo (same):** no GST treatment in any traced billing file; no tax invoice created; the pay card shows `$n × 30 AUD` with no tax line; the subscription page shows `$30 + $5/seat` with no tax line.
**RECOMMENDED:** A — before launch: qualified tax advice, correct GST treatment, total shown before payment, invoice/receipt from the correct supplier. Severity: high (tax). This is not a question the owner can answer alone — it needs an adviser. **ALTERNATIVE A — Legal/tax review before launch. ALTERNATIVE B — Disclosure is enough. ALTERNATIVE C — Never charge GST (not a real option without advice).**
**Other / Defer.**
**Sources:** `backend/billing/checkout_prices.py`, `backend/billing/stripe_support.py`, `frontend_web/src/pages/dashboard/sidebar/ActiveShiftsPage/ActiveShiftCard.tsx`; GM-16/GM-17.
**Decision status:** OPEN — **needs qualified tax advice; owned jointly with GM-16-Q15 / GM-17-Q06**.

### GM14-Q12 — (new) Who updates the Award rates, and when? (from verified code)

**Plain English:** the Award rates in the code are hard-coded dollar amounts published by Fair Work for 1 July 2026. There is no update mechanism, no expiry, and no Fair Work sync — so after the next Fair Work update, the code will quietly enforce the old rates.
**ACTUAL TODAY — Web and Expo (same backend):** `award_rates.py` stores Schedule B dollar amounts "ppc 01Jul26"; nothing checks their age.
**RECOMMENDED:** A named owner + a calendar reminder each July (and on any Fair Work update): update the schedule, record the source + date, and confirm frozen snapshots are unaffected (they are — snapshots freeze the old values by design). Severity: medium-high (underpaying against the Award is a Fair Work breach; the frozen snapshot protects history but not new terms). Benefit: rates stay right.
**ALTERNATIVE A — Keep current logic:** hard-coded rates, updated when someone remembers.
**ALTERNATIVE B — Fetch from Fair Work at runtime:** no stable API exists for this — do not build it without a source.
**Other / Defer.**
**Sources:** `backend/workforce/award_rates.py:19-21`.
**Decision status:** OPEN.

## Part D — SINGLE first decision question to ask the owner

**GM14-Q03 — Does the pharmacy accept the same agreement?**

Plain English: only the worker accepts the terms. The pharmacy never records acceptance of anything — not the shift terms, not the owner fee table, not the subscription terms. If a fee is ever disputed, there is no record the pharmacy agreed to it.

- **Option A — RECOMMENDED — Yes, when it sends or approves:** the pharmacy's acceptance is logged with time and terms version — at offer-send for the shift terms, and at subscribe/booking for the fee table. *Scenario:* a pharmacy disputes a $80 fee; the record shows it accepted the fee table (version + time) when it subscribed and again at booking. *Benefit:* disputes have an answer; the fee table and cancellation bands become binding. *Risk:* acceptance points to add on both clients at offer-send and at payment.
- **Option B — Keep current logic:** worker-only acceptance; the pharmacy never agrees the terms. *Scenario:* a pharmacy disputes a cancellation charge; there is no acceptance to point to. *Trade-off:* no work; every fee and cancellation charge rests on terms the pharmacy never accepted.
- **Option Other (describe) / Defer:** deferring keeps option B by default.

*Ask this first because GM-15, GM-16 and GM-17 all need it: the cancellation fee (GM-15), the price table (GM-16) and the refund rule (GM-17) are only enforceable if the pharmacy agreed to them. The runner-up is GM14-Q01 (who decides ABN super) — ask it second, together with the legal advice for Q04/Q11.*

## Part E — Code gaps vs decision gaps

### Code gaps (no owner decision needed — just build/fix; timing is the only question)
1. **CG-1 — No pharmacy acceptance recorded** (Q03). Add acceptance logging at offer-send + subscribe/booking (needs the Q03 decision on *when*, then it is a build).
2. **CG-2 — Terms snapshot lacks cancellation table, platform terms version, breaks, duties, site details** (Q02 / SH-09). Add once GM-15 decides the table.
3. **CG-3 — `super_payable_confirmed` is always `False`** (Q01). No workflow ever sets it — build the review workflow once Q01 is decided.
4. **CG-4 — Award rates are hard-coded 01Jul26 dollars with no update mechanism** (Q12). Name an owner + a review date.
5. **CG-5 — No PDF/downloadable copy of the agreed terms** (Q06).
6. **CG-6 — No GST treatment or tax invoice anywhere** (Q11). Needs the tax decision first, then it is a build.
7. **CG-7 — Payroll deferral is silent**: a TFN worker can accept and work timesheet-only indefinitely with no reminder that payroll (and super) was never activated. A nudge/overdue flag is a build once the owner sets the rule.

### Decision gaps (owner must choose first — do not build until answered)
- DG-1 — Pharmacy acceptance of the agreement (Q03) ★ first. DG-2 — ABN super determination: who decides, and what waits for it (Q01). DG-3 — Terms disclosure contents (Q02). DG-4 — Employee vs contractor: relationship test (Q04). DG-5 — Payment-readiness exposure (Q05 — blocked on re-trace). DG-6 — PDF copy (Q06). DG-7 — Post-acceptance change consent/locking (Q07–Q10 — all NOT RE-VALIDATED; re-trace first). DG-8 — GST + tax invoice (Q11 — needs qualified tax advice). DG-9 — Award-rate update ownership (Q12).

## Part F — Documentation matrix (per-question source links, head `97c4543e`)

| Question | Status | Source |
|---|---|---|
| GM14-Q01 (super determination — new) | VERIFIED gap | `engagement.py:727-734` |
| GM14-Q02 (AG-Q01/SH-09) | STILL VALID | `engagement.py:572,641-652` |
| GM14-Q03 (AG-Q02/SH-09) | STILL VALID | `engagement.py:747`, `offers.py:accept` |
| GM14-Q04 (AG-Q04) | STILL VALID | `engagement.py:629-640,747` |
| GM14-Q05 (ON-Q04) | STILL VALID (gate); exposure UNKNOWN | `engagement.py:199,265` |
| GM14-Q06 (AG-Q03) | STILL VALID | `offers.py:accept` (email templates) |
| GM14-Q07 (AG-Q05/SH-08) | NOT RE-VALIDATED | #184 Oct 2026 only |
| GM14-Q08 (AG-Q06) | NOT RE-VALIDATED | #184 Oct 2026 only |
| GM14-Q09 (AG-Q07) | NOT RE-VALIDATED | #184 Oct 2026 only |
| GM14-Q10 (AG-Q08/SH-08) | NOT RE-VALIDATED | #184 Oct 2026 only |
| GM14-Q11 (LA-R01/SH-15) | STILL VALID | `checkout_prices.py`, `stripe_support.py`; GM-16/17 |
| GM14-Q12 (Award-rate updates — new) | VERIFIED gap | `award_rates.py:19-21` |
| ON-Q10 (super notice) | NO LONGER VALID as a question | `engagement.py:727-734` (GM-02 confirmed) |

Decision status per question: **all 12 questions are OWNER DECISION: NOT ASKED / NOT DECIDED.** No decision, no implementation, no PR.

### Implementation backlog — FROZEN until the owner answers (nothing here is decided)
1. Pharmacy acceptance logging (offer-send + subscribe/booking) with time + terms version, web + Expo. (After Q03.)
2. Terms snapshot: cancellation table + platform terms version + breaks/duties/site. (After Q02 + GM-15 table.)
3. ABN super review workflow (reviewer, date, outcome stored; reuse across shifts). (After Q01.)
4. PDF copy of agreed terms, emailed + downloadable. (After Q06.)
5. Payment-readiness shown early on apply/offer screens. (After Q05 + re-trace.)
6. Post-acceptance change consent flow / field locking. (After Q07–Q10 + re-trace.)
7. GST treatment + tax invoice on fees/subscription. (After Q11 + tax advice.)
8. Award-rate update process (owner + July review). (After Q12.)
9. Payroll-activation nudge for deferred TFN payroll. (After owner sets the rule.)
10. Cross-client tests per decision (TFN/ABN accept paths, floor enforcement, version-conflict 409, contractor-confirmation gate, super notice presence, GST display).

### Unknowns left (explicit)
- U-1: which Vite component renders the full frozen terms in the accept dialog (backend verified; dialog rendering not line-read).
- U-2: who sets `abn_verified` / `abn_entity_confirmed` on worker onboarding, and by which check/service.
- U-3: whether any screen shows `worker_payment_profile_status` before accept (ON-Q04 exposure half).
- U-4: AG-Q05–Q08 re-trace (shift-edit endpoints not read): do rate/role/payment/travel stay editable after acceptance?
- U-5: GST treatment of worker invoices (GM-17 territory — adopted, not re-traced here).
- U-6: whether a posting-time Award check exists (GM-10 territory — PO-R01 posting half).
