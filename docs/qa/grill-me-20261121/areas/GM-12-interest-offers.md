# GM-12 Interest / Offers — Grill Me trace (read-only, docs only)

> **Corrections against current code (21 Nov 2026 review).** 12 claims checked at `main` `8ccf8f77` and `pr257` `21add924`; 9 hold, 3 below need the correction shown. Where a question below says otherwise, this table wins. Full evidence: [`../followup/claim-check-2026-11-21.md`](../followup/claim-check-2026-11-21.md).

| Where | Claim in this file | Verdict | Correct statement | Evidence |
|---|---|---|---|---|
| Q02 / CG-01 | onboarding helper “appears unused” | WRONG | Composition binds this helper into the verification port, and the public guard calls it. Do not delete it as dead code. | binding: `main:backend/composition/foundation_services.py:62`; call: `pr257:backend/onboarding/verification/state.py:176`; implementation: `pr257:backend/shifts/interest.py:40` |
| Q17 / Q19 | withdrawing interest never permits escalation to resume | WRONG | Withdrawal sends no notice, but deleting the last interest can permit automatic escalation on a later queryset access. Offer decline alone does not remove interest. | DELETE route: `pr257:backend/shifts/offers.py:55`; current-interest filter: `pr257:backend/shifts/escalation.py:91` |
| Q25 | acceptance requires current `terms_version` | MAIN-ONLY, reversed: candidate protection | pr257 returns `TERMS_CHANGED` when required terms differ from those shown. main does not perform this version comparison, so the protection must be labelled candidate-only. | main acceptance: `main:backend/shifts/offers.py:386`; candidate comparison: `pr257:backend/shifts/offers.py:387`; fingerprint: `pr257:backend/shifts/engagement.py:739` |

**Repo:** `chemisttasker11-ezy/ChemistTasker-Ezy1`
**Issue:** #250 — Grill Me, one consolidated backend + Web + Expo sign-off before launch
**Method source:** PR #184 (`docs/qa/launch-grill/questions.json`, `AUDIT.md`, `LAUNCH_GRILL.html`), head `c786a4b8182ebf9b505d47cd81980eb3b9851ce3`
**Revalidation target:** active PR #249, stacked on #248
**Status of this document:** DOCUMENTATION ONLY. No code was changed, no PR/issue/comment created. No implementation is decided here. Progress label: **CURRENT FLOW TRACED** (backend fully traced at head + shared-core API layer; screen-level Web/Expo parity still UNKNOWN — see §6).

## Web and Expo today, side by side (pr257 `21add924`)

Source for both web and Expo is `origin/agent/pr257-int` `21add924` (what merges to main). Read-only code check by agy, 21 Nov 2026; every cited file:line was checked to exist at that commit. "Parity question" = a choice for the owner, asked in this area's rounds. "Possible defect (to verify)" = drift that looks unintended; it is confirmed in code before it goes to the engineering backlog, never asked as a question. The Platforms table says which platforms each question applies to.

| Flow | Web (Vite + Next) | Expo | Same? | If different |
|---|---|---|---|---|
| Express interest in shift slots | Worker submits interest via `expressInterestInPublicShiftService` (`frontend_web/src/pages/dashboard/sidebar/PublicShiftsPage.tsx:284`). | Worker submits interest via `expressInterestInShiftService` (`frontend_mobile/roles/pharmacist/shifts/[id].tsx:234`). | Yes | - |
| View applicants & reveal candidates | Manager reviews applicants in candidates drawer (`frontend_web/src/pages/dashboard/sidebar/ActiveShiftsPage/index.tsx:157`). | Manager reviews applicants on candidates screen (`frontend_mobile/roles/shared/shifts/ActiveShiftsPage/index.tsx:285`). | Yes | - |
| Send shift offer with 48h expiry | Manager dispatches offer to candidate (`frontend_web/src/pages/dashboard/sidebar/ShiftsBoard/hooks/useCounterOffers.ts:418`). | Manager dispatches offer to candidate (`frontend_mobile/roles/shared/shifts/ShiftsBoard/hooks/useCounterOffers.ts:434`). | Yes | - |
| Accept pending offer | Worker reviews terms dialog and accepts offer (`frontend_web/src/pages/dashboard/sidebar/PublicShiftsPage.tsx:468`). | Worker reviews terms dialog and accepts offer (`frontend_mobile/roles/pharmacist/shifts/[id].tsx:356`). | Yes | - |
| Decline pending offer | Worker declines offer via `declineShiftOfferService` (`frontend_web/src/pages/dashboard/sidebar/PublicShiftsPage.tsx:529`). | Worker declines offer via `declineWorkerShiftOfferService` (`frontend_mobile/roles/pharmacist/shifts/[id].tsx:393`). | Yes | - |
| Remind worker with buzz | Manager triggers buzz reminder subject to 1h cooldown (`frontend_web/src/pages/dashboard/sidebar/ActiveShiftsPage/index.tsx:167`). | Manager triggers buzz reminder subject to 1h cooldown (`frontend_mobile/roles/shared/shifts/ActiveShiftsPage/index.tsx:775`). | Yes | - |
| Counter-offer workflow | Worker submits proposed terms and manager can accept or reject (`frontend_web/src/pages/dashboard/sidebar/ShiftsBoard/hooks/useCounterOffers.ts:111`). | Worker submits proposed terms and manager can accept or reject (`frontend_mobile/roles/shared/shifts/ActiveShiftsPage/components/Candidates/StatusCard.tsx:126`). | Yes | - |

### Platforms per question
| Question id | Platforms |
|---|---|
| GM-12-Q01 | Web + Expo |
| GM-12-Q02 | Web + Expo |
| GM-12-Q03 | Web + Expo |
| GM-12-Q04 | Web + Expo |
| GM-12-Q05 | Web + Expo (asked in GM-02: ON-Q05) |
| GM-12-Q06 | Web + Expo |
| GM-12-Q07 | Web + Expo |
| GM-12-Q08 | Web + Expo |
| GM-12-Q09 | Web + Expo |
| GM-12-Q10 | Web + Expo (also covers GM13-Q05, GM-18-Q22) |
| GM-12-Q11 | Web + Expo (asked in GM-11: GM-11-Q10) |
| GM-12-Q12 | Web + Expo (also covers GM13-Q07) |
| GM-12-Q13 | Web + Expo |
| GM-12-Q14 | Web + Expo |
| GM-12-Q15 | Web + Expo |
| GM-12-Q16 | Web + Expo |
| GM-12-Q17 | Web + Expo |
| GM-12-Q18 | Web + Expo (asked in GM-18: GM-18-Q07) |
| GM-12-Q19 | Web + Expo (asked in GM-11: GM-11-Q01) |
| GM-12-Q20 | Web + Expo (also covers GM13-Q04, GM15-40) |
| GM-12-Q21 | Web + Expo |
| GM-12-Q22 | Web + Expo |
| GM-12-Q23 | Web + Expo |
| GM-12-Q24 | Web + Expo (also covers GM13-Q03, GM25-C18) |
| GM-12-Q25 | Web + Expo (also covers GM14-Q02, GM14-Q03) |
| GM-12-Q26 | Web + Expo |

## Bases (exact SHAs verified 2026-11-21)

| Base | SHA / ref | Verified |
|---|---|---|
| PR #249 head (traced) | `97c4543e051b43fe30ec7e2e61ad3d69957a918e` | `pull_request_read` get, 2026-11-21. Open draft, branch `fix/pr248-expo-production-waves-20261104`, 458 commits, 314 files, base `feat/mobile-merge-sdk` (`c98cf2ef74c6de356cceb8dee3a61dad47b6b843`). Unchanged from Issue #250 snapshot. |
| PR #249 body "working head `26cae2d6`" | — | **Resolved:** that is the short SHA of the last *implementation commit listed in the PR body*, not the branch head. Trace at the API head above and record this resolution. Do not re-open it. |
| PR #184 (format source) | `c786a4b8182ebf9b505d47cd81980eb3b9851ce3`, branch `docs/launch-grill-20261020`, draft, 3 commits, 8 files | `questions.json` (142 questions) + `AUDIT.md` (35 gaps) fetched from `refs/pull/184/head`. |
| Issue #250 | open | 26 areas GM-01–GM-26; reuse 142 legacy questions + 30 carried decisions from #184; revalidate against active #249. |

**Rate limit:** no HTTP 429 was encountered in this re-run. GitHub calls were made strictly one at a time with ≥8 s between calls. Every file below was fetched at `refs/pull/249/head` unless marked "search-only (default branch)".

## Files verified at head `97c4543e`

| File | Lines | What it proves |
|---|---|---|
| `backend/shifts/interest.py` | 300 | `express_interest`, `reject_shift`, member-access bypass, interest/rejection announce, unused `_require_public_shift_onboarding` |
| `backend/shifts/offers.py` | 726 | `ShiftInterestViewSet`, `ShiftRejectionViewSet`, `ShiftSavedViewSet`, `ShiftOfferViewSet` (list/buzz/accept/decline/activate-payroll) |
| `backend/shifts/counter_offers.py` | 286 | Counter-offer visibility, announce, accept, reject |
| `backend/shifts/escalation.py` | 154 | Tiers, `auto_escalate_due_shifts`, `escalate_shift`, share token (GM-11 overlap) |
| `backend/shifts/urls.py` | 68 | Router registration for interests/offers/rejections/saved |
| `backend/shifts/assignment.py` | 320 | `OFFER_EXPIRY_HOURS = 48`, `offer_shift`, `slot_locked_for_shift_offer`, `offer_dedicated_shift`, `roster_direct_staff` |
| `backend/shifts/engagement.py` | 758 | ABN/TFN readiness, Award terms build, terms snapshot/freeze, acceptance payload |
| `backend/shifts/base.py` | 431 | Offer creation, reveal, claim exemptions, buzz cooldown value, escalation trigger, `accept_user` |
| `backend/shifts/models.py` | 889 | Shift/ShiftOffer/ShiftSlot fields, statuses, `clean()` rules |
| `backend/shifts/finalize.py` | 143 | `finalize_shift_offer`, `expire_competing_offers`, no overlap handling |
| `backend/shifts/candidates.py` | 527 | `reveal_candidate` (quota/audit/notify), `revealed_profile`, `member_status`, `assigned_profile` |
| `backend/shifts/lifecycle.py` | 424 | `calculate_rates` preview; no reservation-expiry logic |
| `backend/onboarding/verification/state.py` | 363 | `require_public_ahpra` inner gating, `lock_public_ahpra`, re-check queue, adverse transitions, `ahpra_frozen` |
| `backend/shifts/browse.py` | 731 | `claim_shift`, community/public visibility querysets (GM-11 overlap) |
| `backend/core/settings.py` + `backend/core/celery.py` | 723 + 19 | Beat schedule — no offer-expiry / reservation-expiry job |
| `shared-core/src/domains/shifts/api.ts` | 513 | Single client API for web + Expo: interests/offers/counters/buzz/claim/escalate/reveal |
| `backend/shifts/serialization/shifts.py` | 500 | `ShiftSerializer`, `project_published_rates` (GM-10 overlap) |

**Adopted, not re-traced:** GM-01 sessions, GM-02 AHPRA/Verified gates, GM-05 roles, GM-18 identity leak (LA-Q12 STILL VALID), GM-25 structural trace, GM-11 audience/escalation (SH-05/SH-06/AV-04). GM-08 covers attendance→timesheet handover.

**Notable absence:** there is **no `backend/shifts/reservations.py`** (directory listing at head confirms: no `reservations.py`, no `visibility.py`). The reservation-expiry implementation the Oct 2026 audit described ("every 60 s") was NOT found in `settings.py`/`celery.py` either. Reservation behaviour is GM-13 (billing) territory — see GM-12-Q20/Q24 and §6.

---

# 1. The GM-12 traced flow — ACTUAL TODAY (verified at head)

Plain English first: a worker says "I'm interested" in a shift; the pharmacy sees the interested workers and sends one (or several) of them a formal offer; the worker can accept it, decline it, or counter it (ask for different pay/times); if the pharmacy accepts the counter, the worker gets a fresh offer to confirm; accepting an offer either books the shift straight away (if no payment is needed) or holds it as "accepted, waiting for payment" until the pharmacy pays. There IS an instant "claim it now" step, but only for the pharmacy's own direct staff (see §1.11). There is no way for the pharmacy to withdraw an offer once sent.

## 1.1 Expressing interest in a shift

- **Trigger:** worker expresses interest (per shift, or per slot/date).
- **Backend authority:** `express_interest()` — `backend/shifts/interest.py:79`.
  - Role first: `_user_can_perform_shift_role(user, shift.role_needed)` — wrong role is refused before anything else.
  - Verification gate, **public shifts only**: if `shift.visibility == PLATFORM` and the worker is NOT a staff/favourite member reaching that public named shift (`is_public_shift_member_access`, `interest.py:21` — needs active ACCEPTED staff/favourite membership at that pharmacy, shift not anonymous, role must cover it), then `require_public_ahpra(user, shift)` runs (`interest.py:84-89`). **Non-public tiers (staff / favourites / owner-chain / org-chain) have NO verification check at interest in this file.**
  - **The gate's inner rule (now proven — GM-12-Q01 resolution):** `require_public_ahpra` (`onboarding/verification/state.py`) gates **ONLY if `is_public_shift(shift)` AND NOT member access — for non-public shifts it is a NO-OP.** The unconditional accept call in `offers.py:349` is therefore also a no-op for non-public shifts. The chain/org/favourite bypass hole is real and proven end-to-end. ON-01 / LA-P03 STILL VALID.
  - **Dead-looking helper:** `_require_public_shift_onboarding()` (`interest.py:40` — EXPLORER Verified check, PHARMACIST/OTHER_STAFF `verified` check, AHPRA-enforcement-off fallback) is defined in the same file but `express_interest` does NOT call it; it calls `require_public_ahpra` from `onboarding.verification.state` instead. Whether `verification_features().require_public_shift_onboarding` is the same function, and whether anything else calls the helper, is UNKNOWN (`onboarding/feature_port.py` not fetched). See code gap CG-01.
  - Idempotent: `ShiftInterest.objects.get_or_create(shift, slot, user)` — re-expressing interest creates nothing new. Single-user shifts store one interest with `slot=None`; multi-slot shifts store one row per slot (or one row with `slot=None` if no slots named). Bad `slot_id` / empty `slot_ids` payload → refused.
  - **No must-have / requirements gate** is visible in this function: must-have vs nice-to-have fields do not block interest here.
- **Persisted state:** `ShiftInterest` rows (shift + slot + user).
- **Side effects (only when newly created):** `_announce_interest` (`interest.py:144`) — in-app notification to shift managers (`notify_shift_managers`, kind `shift_interest`) + ONE email to the shift creator (or first manager), template `shift_interest.html` / `shift_member_interest.html`. On public shifts the worker is named only as "A candidate"; on member shifts their real name is used.
- **Denial / recovery:** wrong role → refused; unverified on a public shift → refused; invalid slot → refused. Re-trying interest after a refusal is safe (get_or_create); re-trying after success is a no-op and sends no second notification.
- **Withdrawing interest:** there is NO withdraw function in `interest.py`. The only route is `ShiftInterestViewSet` (`offers.py:48`): `http_method_names = ['get','delete',...]` — i.e. **DELETE the interest row**. No notification is sent on delete (no destroy override), and nothing re-checks escalation. The manager is NOT told. See GM-12-Q17.
- **Web / Expo:** screen-level parity NOT INSPECTED (see §1.15). Both clients call the same shared-core service (`expressInterestInShiftService` / community / public variants in `shared-core/src/domains/shifts/api.ts`).

## 1.2 Declining / rejecting a shift (worker says no to the shift itself)

- **Backend:** `reject_shift()` — `interest.py:192`. Records `ShiftRejection` rows (per slot, or whole shift; recurring slots can carry a `slot_date`). **This function has NO role check and NO verification check** — declining is open to any caller the view allows.
- **Side effect:** `_prompt_escalation` (`interest.py:249`) emails + notifies ONLY the shift creator: "X declined N slot(s)… you can escalate the shift to the platform with a single click". No other manager, no worker follow-up, no automatic escalation, no re-offer.
- **Web / Expo:** screen-level NOT INSPECTED.

## 1.3 Who sees the applicants (interest list + reveal)

- **Backend:** `ShiftInterestViewSet.get_queryset` (`offers.py:48-101`). A manager of the pharmacy sees ALL interests for `?shift=`; anyone else sees only their OWN interests. `?user=` other than self is silently forced back to self. Average rating is annotated per applicant (`Avg('user__ratings_received_as_worker__stars')`) — the ordering/rating data exists, but **no ranking rule** is in this file.
- **Reveal (now verified — was NOT RE-VALIDATED in the prior run):** `reveal_candidate` (`candidates.py:83`) — reveal an interested candidate to the shift's managers: counts against the reveal quota (`shift.reveal_quota`; if `reveal_count >= reveal_quota` and not already revealed → 403 "Reveal quota exceeded"); an already-revealed user does not double-count; `interest.revealed = True`; the access is audit-logged (`ShiftProfileAccessAudit`, action REVEAL_PROFILE); the worker is notified (in-app `shift_profile_revealed` + email `shift_reveal.html`) **only the first time** this interest/profile is revealed. No AHPRA/Verified gate in reveal itself.
- **What the manager sees:** `revealed_profile` (`candidates.py:199`) — name and work profile, **no contact details or CV** ("owner decision"). `work_profile` (`candidates.py:143`) includes `verified`, `gov_id_verified`, `abn_verified`, the AHPRA summary (`ahpra`, `ahpra_registration_status`, `ahpra_verified`), `verified_skills`, dispensary qualification. `assigned_profile` (`candidates.py:479`): no quota, no email. `member_status` (`candidates.py:209`): rich pending/awaiting-payment counter-offer data for the worker's own view.
- **Web / Expo:** screen-level NOT INSPECTED (ActiveShiftsPage Candidates components exist on web — see §1.15 — contents not read at head).

## 1.4 Offers — creation (pharmacy → worker)

- **Backend:** offer creation lives in `base.py` / `assignment.py` (now verified — was NOT RE-VALIDATED in the prior run). `ShiftOfferViewSet` (`offers.py:163`) is list/retrieve/update only — "Offers are made by the shift's offer actions (every serializer field is read-only), so there is no create here."
- **`offer_shift`** (`assignment.py`): role check; auto-pick slot (single unassigned preferred); slot-lock check; existing PENDING offer **REFRESHED** (rate/times updated, `expires_at` NOT refreshed — a re-offer does **not** extend the deadline); new offer `expires_at = now + 48h`; NO start-cap; NO AHPRA check in this function (gating is at the `accept_user`/`accept` callers).
- **`offer_dedicated_shift`** (`assignment.py`): dedicated shift → firm offers immediately, 48h expiry, one email — **TB-Q07 firm offer CONFIRMED at head (STILL VALID)**. Dedicated posting forces visibility LOCUM_CASUAL, `post_anonymously=False`, clears escalation timestamps (`posting.py:protect_direct_booking`).
- **`accept_user`** (`base.py`): `lock_public_ahpra(candidate, shift, manager=True)` then `offer_shift`. `lock_public_ahpra` raises `candidate_ahpra_ineligible` 403 **only for public shifts** (state.py — see §1.1).
- **Who may send one:** manager of the pharmacy (offer actions are manager-gated in `base.py:check_permissions`); exact role set per GM-05 (adopted).
- **Persisted state:** `ShiftOffer` rows with `status`, `slot`, `offered_slot_date`, `offered_start_time`, `offered_end_time`, `offered_rate`, `counter_offer` link, `expires_at`, `last_buzzed_at`, engagement-terms snapshot fields. Statuses (`models.py`): PENDING, ACCEPTED_AWAITING_PAYMENT, ACCEPTED, DECLINED, EXPIRED.
- **Web / Expo:** screen-level NOT INSPECTED.

## 1.5 Offer list / expiry (lazy, not scheduled)

- **Backend:** `ShiftOfferViewSet.list` (`offers.py:182-186`) — on EVERY list call, PENDING offers past `expires_at` are bulk-updated to EXPIRED. Expiry is therefore **lazy**: an offer can sit "pending" past its deadline until someone lists offers or tries to accept it. `accept()` also marks it EXPIRED on attempt (`offers.py:355-359`).
- **Expiry length: `OFFER_EXPIRY_HOURS = 48` confirmed at head** (`assignment.py`) — the Oct 2026 value is STILL VALID. **No cap at shift start is visible in any inspected file** — an offer made 2h before start can stay pending past start until a list/accept touches it. No offer-expiry beat job exists (`settings.py`/`celery.py` — GM-11). Old BK-Q05 / SH-07: still valid as a question, value now confirmed.
- **Visibility:** workers (PHARMACIST / OTHER_STAFF / EXPLORER) see only their OWN offers; managers see offers for pharmacies they manage (`offers.py:169-180`).

## 1.6 Accepting an offer (worker → booked / reserved)

- **Backend:** `ShiftOfferViewSet.accept` (`offers.py:336-563`), `@transaction.atomic`, row locks on shift, slots and offer (`select_for_update`) — concurrent accepts are serialised at the DB.
  1. `require_public_ahpra(request.user, offer.shift)` is called **unconditionally** (`offers.py:349`) — unlike interest, there is NO visibility check around it in this function. **Now proven:** the function itself no-ops for non-public shifts (`state.py`), so the unconditional call does NOT close the bypass hole. This is the single most important finding in GM-12 — see GM-12-Q01.
  2. Only the offer's own worker may accept (403 otherwise). Status must be PENDING (400 otherwise); expired → marked EXPIRED, 400.
  3. Role re-checked (`_user_can_perform_shift_role`); slot-lock checked via `slot_locked_for_shift_offer` (now verified — see step 6 and Q12/Q15). Single-user shifts: blocked if any assignment exists for another user, or any other ACCEPTED_AWAITING_PAYMENT offer exists. Non-single-user offer with no slot → 400 "Offer is missing slot selection".
  4. Terms: `build_shift_engagement_terms` → if `acceptance_required`, the worker's `terms_version` must equal the current version or the call fails **409 TERMS_CHANGED** ("These terms changed since you reviewed them"); `require_acceptance_payload` validates the acceptance payload; `freeze_accepted_terms` snapshots the terms + acceptance time onto the offer (`payment_preference_snapshot`, `settlement_channel`, `engagement_kind`, `engagement_terms_snapshot`). **Terms contents now verified** (`engagement.py:build_shift_engagement_terms`): snapshot `version: 1`, **NO cancellation table, NO platform terms version, NO pharmacy-side acceptance** — SH-09 / LA-Q10 STILL VALID. **Pay readiness now verified** (`engagement.py:_external_payment_profile`): ABN path **RAISES if ABN missing/unverified/entity-unconfirmed** (ABN workers ARE blocked at accept); TFN path does NOT block — readiness computed, `payroll_ready=False` → settlement TIMESHEET_ONLY, "TFN/super setup may be completed after shift acceptance". `validate_tfn_payroll_profile` requires TFN + super fund name/USI/member number. See GM-12-Q04.
  5. `lock_public_ahpra(request.user, shift)` runs inside the transaction (`offers.py:410-411`) — raises `candidate_ahpra_ineligible` 403 only for public shifts (state.py).
  6. **Two outcomes:**
     - Payment required (`get_billing_state_for_pharmacy` → PAYMENT_REQUIRED): offer → `ACCEPTED_AWAITING_PAYMENT`, `shift.payment_status = 'PENDING'`. **No assignment is created yet; the worker is NOT booked.** (Carried decision D01: acceptance creates a time-limited reservation; only verified payment confirms it.)
     - Payment NOT required: `shift.payment_status = 'PAID'` and `finalize_shift_offer(offer)` creates the assignment(s) immediately.
  7. **Rival offers — REFINED (was the Q15 gap):** rivals are expired ONLY in the no-payment branch, and only for the SAME slot + same `offered_slot_date` (or same slot-null for single-user shifts) (`offers.py:437-448`). In the payment-required branch rivals are NOT expired at accept time. **But the slot lock now resolves the double-accept question:** `slot_locked_for_shift_offer` (`assignment.py`) locks a slot if any assignment exists for slot/date OR any ACCEPTED_AWAITING_PAYMENT offer exists for the same slot/date (a whole-shift offer holds every slot). So a second worker's accept IS blocked by the lock in the payment branch even though rivals are not expired there. What remains: rivals stay PENDING (stale, confusing) until they expire lazily; if the reservation expires unpaid, a rival can still accept. See GM-12-Q15.
  8. **Notifications (on commit):** worker gets in-app (`shift_confirmed`) + email (`shift_accept.html`): "owner payment pending" wording when payment is required, "You are confirmed" otherwise. Owner/creator gets in-app (`shift_worker_confirmed`) + email (`owner_worker_confirmed.html`), with rate label and billing state. If payment is not required, `send_shift_payment_finalized_notifications(..., payment_method="free")` also runs.
- **Edge / retry / concurrency:** double-accept → second call sees non-PENDING → 400. Accept-after-expiry → EXPIRED + 400. Terms changed mid-review → 409, worker must re-review. Wrong tenant / wrong user → 403. Anonymous pharmacy: owner/worker emails use suburb ("Shift in {suburb}") not the pharmacy name.
- **Web / Expo:** accept screen, countdown display, terms screen — screen-level NOT INSPECTED.

## 1.7 Declining an offer (worker says no to an offer)

- **Backend:** `ShiftOfferViewSet.decline` (`offers.py:676-726`). Only the offer's worker (403 otherwise); only PENDING (400 otherwise) → status `DECLINED`. Owner/creator gets in-app (`shift_worker_rejected`) + email (`owner_worker_rejected.html`). **No fallback happens in this file:** no re-offer to the next interested worker, no escalation resume, no release back to a wider audience. The shift simply keeps its remaining interests/offers.
- **Web / Expo:** NOT INSPECTED.

## 1.8 Reminding the worker (buzz / nudge)

- **Backend:** `ShiftOfferViewSet.buzz` (`offers.py:253-335`). Manager of the pharmacy only (403 otherwise); PENDING only (400 otherwise). Row-locked. Cooldown: `SHIFT_OFFER_BUZZ_COOLDOWN = timedelta(hours=1)` — **value confirmed at head** (`base.py`); too soon → **429** with `next_buzz_at` + `seconds_remaining` and a "about N minutes / about 1 hour" label. On success: `last_buzzed_at = now`, in-app (`shift_offer_buzz`) + email (`shift_offer_buzz.html`) to the worker including `expires_at` and a link to the offer.
- **Web / Expo:** NOT INSPECTED (incl. whether Expo exposes buzz at all). Shared-core exposes `buzzShiftOfferService` to both clients.

## 1.9 Counter-offers

- **What a worker can counter (verified):** a counter-offer has per-slot rows with `proposed_rate`, `proposed_start_time`, `proposed_end_time`, `slot_date` (`counter_offers.py:165-170`) — so **rate and times (and date) can be countered**. Submit endpoint (`base.py:counter_offers` POST): `require_public_ahpra` UNCONDITIONAL then role check — same no-op-for-non-public behaviour as accept (state.py). Whether a counter rate must stay above the Award floor is NOT verified at submit time (the Award floor IS enforced at accept for pharmacists via `_build_tfn_award_terms`: pharmacist must be ABOVE Award floor, else ValidationError; bonus forced 0; other staff `agreed_rate = max(posted, floor+bonus)`).
- **Visibility:** `visible_counter_offers_for_shift` (`counter_offers.py:24`) — only PENDING counters with at least one slot; non-managers see only their own.
- **On submit:** `announce_counter_offer` (`counter_offers.py:40`) silently creates `ShiftInterest` rows for the countered slots (via `ensure_interest_for_counter_offer`, `:90` — deliberately WITHOUT the interest email/notification path), notifies managers in-app (`shift_counter_offer_received`) + ONE email to the creator. Public shifts anonymise the sender as "A candidate".
- **Pharmacy accepts a counter:** `accept_counter_offer` (`counter_offers.py:112`) — manager decision. Role re-checked. Per-slot acceptance is allowed even if the counter was already accepted for another slot. For each slot it creates a NEW `ShiftOffer` (or updates an existing PENDING one) with the proposed rate/times/date, `counter_offer` linked, `expires_at = now + OFFER_EXPIRY_HOURS` (48h, confirmed). **The worker is NOT booked by this step** — the response says `worker_confirmation_required: True`, `assignment_ids: []`; the worker is notified in-app (`shift_counter_offer_accepted`) + email and must still accept the generated offer (→ §1.6). Counter status becomes ACCEPTED only when offers exist for ALL its slots; otherwise it stays PENDING (partial acceptance). Slots already assigned/locked → refused ("One or more slots are no longer available").
- **Pharmacy rejects a counter:** `reject_counter_offer` (`counter_offers.py:252`) — PENDING only → REJECTED, worker notified in-app + email. No counter-counter, no fallback.
- **Web / Expo:** NOT INSPECTED. PR #249 mentions W3 Shift Centre candidate/counter-offer failure + Retry work (`a7ad728e`) — not inspected.

## 1.10 Multiple workers interested / offered at once

- **Proven:** several interests per shift/slot can coexist (one row per worker). Several offers per slot can coexist (accept expires rivals only as described in §1.6 step 7). First acceptance wins the slot via the lock check; later acceptances fail with "already locked or awaiting payment" (400) — now proven via `slot_locked_for_shift_offer`, including the payment branch.
- **Proven (new):** applicant ranking — no ranking rule in backend; the interest list annotates average rating only (`offers.py:58-60`). What the pharmacy sees per applicant / reveal — now verified (§1.3). Whether overlapping applications are withdrawn on booking — **no** (see §1.13). Whether a reservation blocks other bookings — the slot lock blocks the same slot/date; cross-shift overlap is NOT blocked (see §1.13).

## 1.11 Claiming a shift / instant book (now verified — was NOT RE-VALIDATED)

- **Backend:** `claim_shift` (`browse.py:249`). **BK-Q01/BK-Q02: instant claim exists for own direct staff only — Oct 2026 "employees only" STILL VALID with precise mechanics:**
  - `require_public_ahpra` unconditional (no-op for non-public shifts — same hole).
  - Must be an **active member of THIS pharmacy** (chain/org members at other pharmacies CANNOT claim).
  - Favourites/locums refused 400: "must express interest and accept the final shift offer so ABN/TFN engagement terms are recorded".
  - Role + `staff_membership_can_claim_role` checks.
  - Single-user shifts: any existing assignment blocks.
  - **Taken slots are silently skipped** (partial claim possible — a worker can claim the remaining slots of a multi-slot shift without being told some were taken).
  - Deletes the worker's own interest/rejection; emails + in-app notifies the creator.
- **No auto-accept / reliability-score path** was found; no opt-in instant book for favourites exists in the traced code.

## 1.12 Dedicated offers / Talent Board "Request booking" (now verified)

- **Backend:** `offer_dedicated_shift` (`assignment.py`) — dedicated shift → firm offers immediately, 48h expiry, one email. **TB-Q07 firm offer CONFIRMED at head (STILL VALID).** Worker cannot ask questions first through this path; there is no enquiry step in the traced code. `protect_direct_booking` (`posting.py`): dedicated_user forces visibility LOCUM_CASUAL, `post_anonymously=False`, clears escalation timestamps.
- **Talent Board UI** (`TalentBoard/index.tsx`, mobile talent-board): NOT inspected at head — screen-level parity UNKNOWN.

## 1.13 Escalation vs interest/offers (GM-11 boundary) + overlap handling (now verified)

- **Validated in `escalation.py:81-92`:** `auto_escalate_due_shifts` only considers shifts with NO interest at all (`interests__isnull=True`). **Any interest ever — even if that worker later declined, rejected, or their offer expired — stops auto-escalation permanently** (no "interest withdrawn/declined → resume" path in this file). This confirms Oct 2026 SH-06's stop rule is still present in current code.
- **Validated:** `escalation.py` sends NO notification to the newly eligible audience. Manual `escalate_shift` (`:122`) also sends none here. Caller side now verified: `base.py:get_queryset` calls `_auto_escalate_shifts(now)` on every list/detail request (SH-05 STILL VALID — lazy, no beat job).
- **Overlap handling — NEW, verified:** `finalize_shift_offer` (`finalize.py:143` lines) is idempotent per slot; raises if an occurrence is assigned to another offer; rate from the accepted-terms snapshot → offered_rate; `locked_payroll_period` can refuse finalization; `expire_competing_offers` exists (expires PENDING + ACCEPTED_AWAITING_PAYMENT for same slot/date). **NO overlap handling: nothing withdraws the worker's other pending interests/offers on other shifts, nothing blocks overlapping bookings across shifts.** BK-Q10/BK-Q11: no auto-withdraw, no cross-shift overlap block in finalize (the slot-lock check is per-shift only).
- **Engagement terms (now verified — `engagement.py`):** staff path `acceptance_required=False`, settlement PAYROLL iff `pharmacy.use_chemisttasker_payroll` else TIMESHEET_ONLY; external TFN/ABN paths as in §1.6 step 4; snapshot `version: 1`, **NO cancellation table, NO platform terms version, NO pharmacy-side acceptance** — SH-09 / LA-Q10 STILL VALID. `require_acceptance_payload`: `engagement_terms_accepted is True` + separate `independent_contractor_status_confirmed` for ABN. `freeze_accepted_terms` stamps accepted_at/by. `_build_tfn_award_terms`: pharmacist must be ABOVE Award floor (`posted_rate > floor`, else ValidationError; bonus forced 0); other staff `agreed_rate = max(posted, floor+bonus)`; Award code MA000012; >12h shift → payroll review required; pre-7am weekday/Saturday → overtime review required (overtime NOT auto-computed — flags review). `worker_payment_profile_status` exists (safe summary, no secret identifiers).
- **Verification state machine (`state.py` — now verified):** `require_ahpra_application` blocks states not_found/suspended/unreadable/rejected/type_not_accepted/review; Owner non-pharmacist cannot apply as pharmacist; Owner without `ahpra_verified` blocked. `queue_public_recheck`: re-check queued on commit when gate runs; expiry drives recheck due (expiry < today and checked <= expiry → recheck; else annual Dec 1 rule) — expiry triggers a re-check, not a direct block (ON-02 PARTLY). `apply_state_transition`: adverse transition cancels upcoming assignments, revokes verified, Owner switched to MANAGER role; rejected keeps bookings (manual resolution). `ahpra_frozen`: suspended + non-owner + no memberships + no org membership → account paused, chat sockets closed. `ADVERSE_STATUSES = {suspended, cancelled, surrendered}`.

## 1.14 Saved shifts

- `ShiftSavedViewSet` (`offers.py:143-161`): worker saves/unsaves a shift (own rows only). No GM-12 decision rides on it; noted for completeness.

## 1.15 Web vs Expo parity (verified at the API layer; screens NOT inspected)

- **Shared client:** `shared-core/src/domains/shifts/api.ts` (513 lines) is the single API client for web + Expo. It exposes the full surface both clients use: `getShiftInterests`, `getShiftCounterOffers` (+ batch, which returns `{}` when no ids — a stub fallback), `createShiftCounterOffer`, `acceptShiftCounterOffer`, `rejectShiftCounterOffer`, `fetchShiftOffers`, `acceptShiftOffer`, `declineShiftOffer`, `buzzShiftOffer`, `activateShiftOfferPayroll`, `claimShift`, `expressInterestInShift` / community / public variants, `revealProfile`, `acceptUserToShift`, `escalateCommunityShift`, `generateShareLink`, `fetchDeferredPayrollOffersService` (comment: "Owner shift centre must exhaust both accepted-offer pages through public SDK ownership"), `revealShiftInterestService`, `escalateShiftService`, `acceptShiftCandidateService`. Both clients therefore call the same endpoints with the same payloads — **API-layer parity is confirmed; screen-level parity is not.**
- **Web screens found (search-only, default branch — contents NOT read at head):** `frontend_web/src/pages/dashboard/sidebar/ActiveShiftsPage/` (with `components/Candidates/` — `StatusCard`, `CommunityLevelView`, `PublicLevelView`, `SlotSelector` — and `components/Escalation/EscalationStepper`), `frontend_web/src/pages/dashboard/shiftCenter/StaffShiftCentreTabs.tsx`, `CommunityShiftsPage.tsx`, `PublicShiftsPage.tsx`, `MyHistoryShiftsPage.tsx`, `MyConfirmedShiftsPage.tsx`, `OwnerAssignedShiftBoard.tsx`.
- **Expo screens:** `frontend_mobile/roles/shared/shifts/ShiftsBoard/components/ShiftEngagementTermsDialog.tsx` found in the timesheet search; the Expo shift-centre screen inventory was NOT enumerated in this trace. Expo parity for Shift Centre / offer accept / counter screens is UNKNOWN.
- **Next web:** no Next shift-centre/offer pages were searched in this trace; Next parity UNKNOWN.
- **PR #249's own description** notes commit `a7ad728e` ("W3 Shift Centre candidate/counter-offer failures and Retry") — not inspected here.

---

# 2. Current-flow matrix

| # | Trigger | Actor | Backend / API (validated at 97c4543e) | Vite / Next | Expo | Persisted state | Event / side effect | Recovery / denial path |
|---|---|---|---|---|---|---|---|---|
| F1 | Express interest | Worker (any signed-in role that covers the shift role) | `express_interest` `interest.py:79`; `require_public_ahpra` if PLATFORM & not member (no-op otherwise, `state.py`); `POST shift-interests` (router `urls.py`) | Screen NOT INSPECTED; shared-core service exists | Screen NOT INSPECTED; same service | `ShiftInterest` (shift+slot+user), get_or_create | Managers in-app `shift_interest` + email to creator; "A candidate" if public | Wrong role → refused; unverified (public) → refused; bad slot → refused; repeat = no-op, no 2nd notice |
| F2 | Withdraw interest | Worker | `ShiftInterestViewSet` DELETE `offers.py:48` (get/delete only) | NOT INSPECTED | NOT INSPECTED | `ShiftInterest` row deleted | NONE — no notification | N/A (silent delete) |
| F3 | Decline the shift | Worker | `reject_shift` `interest.py:192` (no role/Verified check in fn) | NOT INSPECTED | NOT INSPECTED | `ShiftRejection` rows | Creator email + in-app w/ escalation prompt | None; no auto-escalation, no re-offer |
| F4 | View applicants | Manager | `ShiftInterestViewSet.get_queryset` `offers.py:57` (managers all; others own only); `reveal_candidate` `candidates.py:83` (quota, audit, first-reveal notify) | Candidates components exist (paths only) | NOT INSPECTED | Read-only (+ avg rating annotation) | Reveal: audit row + worker notified on first reveal only | Non-manager asking for others' rows silently scoped to self; quota exceeded → 403 |
| F5 | Send offer | Manager | `offer_shift` / `accept_user` (`assignment.py` / `base.py`); PENDING offer refreshed (no expiry extension); 48h expiry | NOT INSPECTED | NOT INSPECTED | `ShiftOffer` PENDING + `expires_at` | Offer email + in-app to worker (via announce paths) | Role check; slot-lock check; AHPRA gate only for public shifts |
| F6 | List offers / lazy expiry | Worker (own) / Manager (managed) | `ShiftOfferViewSet.list` `offers.py:182` — bulk-expires PENDING past `expires_at` | NOT INSPECTED | NOT INSPECTED | PENDING → EXPIRED | None | Offer can sit stale-pending until a list/accept touches it |
| F7 | Accept offer | Offer's worker only | `accept` `offers.py:336`; `require_public_ahpra` unconditional `:349` (no-op non-public, `state.py`); role + slot-lock; terms version 409 / payload / freeze; `lock_public_ahpra` | NOT INSPECTED | NOT INSPECTED | → `ACCEPTED_AWAITING_PAYMENT` (+ `shift.payment_status PENDING`) OR → `ACCEPTED` + assignments via `finalize_shift_offer` | Worker + owner in-app + email; rivals expired ONLY in no-payment branch, same slot+date; slot lock blocks 2nd accept in both branches | Not own offer → 403; not PENDING → 400; expired → EXPIRED + 400; slot locked → 400; terms changed → 409 re-review |
| F8 | Decline offer | Offer's worker only | `decline` `offers.py:676` → DECLINED | NOT INSPECTED | NOT INSPECTED | `ShiftOffer` DECLINED | Owner in-app + email | Not own / not PENDING → 403/400; no fallback, no re-offer |
| F9 | Remind worker (buzz) | Manager | `buzz` `offers.py:253`; cooldown **1h** (`base.py:SHIFT_OFFER_BUZZ_COOLDOWN`) | NOT INSPECTED | NOT INSPECTED (whether Expo exposes buzz unknown) | `last_buzzed_at = now` | Worker in-app `shift_offer_buzz` + email w/ `expires_at` | Not manager → 403; not PENDING → 400; too soon → 429 w/ `next_buzz_at` |
| F10 | Counter-offer submit | Worker | Submit endpoint `base.py` (`require_public_ahpra` unconditional + role check); `announce_counter_offer` `counter_offers.py:40` | NOT INSPECTED | NOT INSPECTED | `ShiftCounterOffer` PENDING + silent `ShiftInterest` rows | Managers in-app + creator email | Award-floor check at submit NOT verified (enforced at accept for pharmacists) |
| F11 | Accept counter-offer | Manager | `accept_counter_offer` `counter_offers.py:112` → new/updated `ShiftOffer`(s), `expires_at = now + 48h` | NOT INSPECTED | NOT INSPECTED | Counter ACCEPTED only if ALL slots generated, else stays PENDING | Worker in-app + email, `worker_confirmation_required: True` | Wrong role → refused; slot locked → refused; rejected counter → refused; worker must still accept (§F7) |
| F12 | Reject counter-offer | Manager | `reject_counter_offer` `counter_offers.py:252` → REJECTED | NOT INSPECTED | NOT INSPECTED | `ShiftCounterOffer` REJECTED (+ decided_by/at) | Worker in-app + email | Not PENDING → refused |
| F13 | Auto-escalate | System (schedule TBD) | `auto_escalate_due_shifts` `escalation.py:81` — only if NO interest ever; called lazily from `base.py:get_queryset` | NOT INSPECTED | NOT INSPECTED | `visibility` / `escalation_level` + tier timestamps | NONE in this file | Any past interest blocks it forever; PLATFORM step skipped at daily public-shift limit |
| F14 | Manual escalate | Manager | `escalate_shift` `escalation.py:122` | NOT INSPECTED | NOT INSPECTED | `visibility` up one tier / to target | NONE in this file | Already at/above target → refused; PLATFORM counts vs daily limit |
| F15 | Dedicated offer / Request booking | Pharmacy (Talent Board) | `offer_dedicated_shift` `assignment.py` — firm offers immediately, 48h expiry, one email | TalentBoard UI NOT INSPECTED | Talent-board UI NOT INSPECTED | `ShiftOffer` PENDING (firm) | Worker notified | Worker cannot ask questions first via this path |
| F16 | Claim / instant book | Worker (own direct staff only) | `claim_shift` `browse.py:249` — active member of THIS pharmacy only; favourites/locums refused 400; taken slots silently skipped | NOT INSPECTED | NOT INSPECTED | Assignment(s) created; own interest/rejection deleted | Creator emailed + in-app notified | Not staff → 400; wrong role → refused; existing assignment (single-user) → blocked |

---

# 3. Validated question queue (PR #184 format)

Status key: **VALIDATED** = re-checked in current code at 97c4543e · **PARTLY** = one half checked, the other not · **NOT RE-VALIDATED** = Oct 2026 evidence only, do not present as current · **NEW** = arises from this trace. "Keep current logic" is offered only where the inspected code actually shows current logic.

## GM-12-Q01 — Verification on outside bookings
- **Status:** Answered: B, check every outside booking, launch grill, 23 Oct 2026 - see VERIFY-GATE-01. Engineering: see BL-01.
- **Actual today:** Public booking actions use the verification guard, but it skips non-public shifts. Public counter-offer submission and acceptance are covered. Dedicated offer creation follows a separate path (`pr257:backend/shifts/base.py:348`, `:400`, `:462`, `pr257:backend/onboarding/verification/state.py:174`).

## GM-12-Q02 — Browse access before full verification
- **Status:** Answered: KEEP, launch grill, 23 Oct 2026 - see GM01-Q04 for the single re-confirmation.
- **Actual today:** Workers need email and mobile verification to reach the dashboard. Anonymous users can read public boards (`main:frontend_web/src/components/ProtectedRoute.tsx:26`).

## GM-12-Q03 — AHPRA exemption
- **Status:** Answered: A, employees are exempt and favourites are checked, launch grill, 23 Oct 2026 - see AHPRA-FAV-01. Engineering: see BL-02.
- **Actual today:** Eligible employed staff and favourites can bypass the public gate on named shifts at that pharmacy (`pr257:backend/shifts/interest.py:21`).

## GM-12-Q04 — When pay details are ready
- **Status:** Answered: B, tell the worker early and require pay details before acceptance, launch grill, 23 Oct 2026 - see ON-Q04. Engineering: see BL-03.
- **Actual today:** Missing or unverified ABN blocks acceptance. Missing TFN/super permits assignment and defers payroll (`pr257:backend/shifts/engagement.py:265`, `:716`).

## GM-12-Q05 — What can Explorers (new to pharmacy) do with shifts?

> **Merged 22 Nov: asked once, as ON-Q05 in GM-02.** Answer it there; this copy stays for its own evidence and is not asked again.
- **Old ID:** ON-Q05. **Status: PARTLY VALIDATED.** Explorer branch exists in `_require_public_shift_onboarding` (`interest.py:40-46`: Verified ExplorerOnboarding required for public shifts) but that helper is apparently not called by `express_interest`; `require_public_ahpra`'s Explorer handling is not separately traced. Accept path for Explorers UNKNOWN. Explorer shifts tab state not inspected.
- **RECOMMENDED:** Decide explicitly (see options in #184): A) no shifts — hide boards/apply; B) unpaid shadowing/volunteer posts only; C) paid shifts only after upgrading to a staff role. Provisional recommendation: C, with the upgrade path shown where apply is blocked. Severity: MEDIUM. **ALTERNATIVE A/B/C** as in #184 + Other / defer. Re-validate `state.py` Explorer handling before deciding.

## GM-12-Q06 — Which ways can a worker get a shift at launch?
- **Old ID:** BK-Q01. **Status: VALIDATED — CHANGED (claim now proven).**
- **ACTUAL TODAY:** Apply-and-offer for outsiders; **instant claim for own direct staff only** (`claim_shift`, `browse.py:249` — active member of THIS pharmacy; favourites/locums refused 400 with "must express interest and accept the final shift offer so ABN/TFN engagement terms are recorded"; role + `staff_membership_can_claim_role` checks; single-user: any existing assignment blocks; taken slots silently skipped — partial claim possible; deletes own interest/rejection; emails + in-app notifies creator). No instant book for anyone else; no auto-accept path found.
- **RECOMMENDED (provisional, #184):** B — A plus opt-in instant book per shift. Severity: MEDIUM. **ALTERNATIVE A — Keep current logic** (staff-only claim). **ALTERNATIVE B — Opt-in instant book.** Other / defer.

## GM-12-Q07 — Who may instant-book or be auto-accepted?
- **Old ID:** BK-Q02. **Status: VALIDATED — CHANGED (claim scope proven).**
- **ACTUAL TODAY:** Instant claim = own direct staff only (Q06). No reliability score exists in inspected files; no auto-accept for favourites.
- **RECOMMENDED (provisional, #184):** A — favourites only (for any future opt-in instant book). **ALTERNATIVE A — Keep current logic** (employees only). **ALTERNATIVE B — Favourites plus rule-based workers (e.g. 5+ completed shifts, no incidents).** Other / defer.

## GM-12-Q08 — How should applicants be ordered for the pharmacy?
- **Old ID:** BK-Q03. **Status: NOT RE-VALIDATED** (ordering lives in the frontend Candidates components — contents not read at head; backend annotates average rating only, `offers.py:58-60`, no ranking rule).
- **ACTUAL TODAY (backend only):** interest list annotates `Avg('user__ratings_received_as_worker__stars')`; no ordering rule in backend. Frontend ordering UNKNOWN.
- **RECOMMENDED (provisional):** Order by fit — Verified + role match first, then favourites/staff, then rating, then earliest interest — and show the rule on screen. **ALTERNATIVE A — Earliest interest first.** **ALTERNATIVE B — Highest rated first.** **ALTERNATIVE C — Pharmacy chooses per shift.** Other / defer. Read the Candidates components before deciding.

## GM-12-Q09 — What should the pharmacy see on each applicant? (incl. reveal)
- **Old ID:** BK-Q04. **Status: VALIDATED — CHANGED (reveal now proven).**
- **ACTUAL TODAY:** Public interest announce says "A candidate" (`interest.py:145-147`). Reveal is explicit and audited: `reveal_candidate` (`candidates.py:83`) — quota-enforced (`reveal_count >= reveal_quota` → 403 unless already revealed), already-revealed does not double-count, `interest.revealed = True`, audit-logged, worker notified (in-app + email) only on first reveal. `revealed_profile` shows name + work profile — **no contact details or CV** ("owner decision"). `work_profile` includes `verified`, `gov_id_verified`, `abn_verified`, AHPRA summary, `verified_skills`, dispensary qualification. `assigned_profile`: no quota, no email. Quota *value/default* (`shift.reveal_quota`) was not traced — UNKNOWN (see §6).
- **RECOMMENDED:** Show role, Verified/AHPRA badge, rating, distance/rate if the worker opts in; reveal full identity on offer, not on interest — for public shifts. The current reveal-on-manager-action shape already matches this; the decision is whether the quota and the no-contact-details rule stay. Severity: MEDIUM. **ALTERNATIVE A — Keep current logic** (reveal with quota, no contact details/CV). **ALTERNATIVE B — Reveal on interest.** **ALTERNATIVE C — Reveal only on accept.** Other / defer.

## GM-12-Q10 — How long does an offer stay open?

> **Also covers (22 Nov):** GM13-Q05 (GM-13), GM-18-Q22 (GM-18). Asked once, here.
- **Old ID:** BK-Q05 (gap SH-07). **Status: VALIDATED — CHANGED (value now confirmed).**
- **ACTUAL TODAY (validated):** `OFFER_EXPIRY_HOURS = 48` (`assignment.py`) — flat 48h, confirmed at head. Expiry is lazy (list + accept paths mark EXPIRED, `offers.py:182-186, :355-359`); **NO start-cap** is visible in any inspected file. Re-offering an existing PENDING offer refreshes rate/times but does **not** refresh `expires_at` — a re-offer does not extend the deadline. No offer-expiry beat job exists.
- **RECOMMENDED:** Cap expiry at shift start (never past start), shorten for urgent shifts, and expire eagerly (scheduled job) rather than lazily. Severity: HIGH (an offer accepted after start, or a shift that looks staffed while its offer silently lapsed, breaks week-one operations). **ALTERNATIVE A — Keep current logic** (flat 48h, lazy). **ALTERNATIVE B — Cap at start, keep lazy expiry.** **ALTERNATIVE C — Per-shift expiry chosen by the pharmacy at offer time, capped at start.** Other / defer. Normal: 48h-style offer well before start. Edge: offer made 2h before start. Retry: accept-after-expiry → EXPIRED + 400 (validated). Payment: an expired offer never reaches payment. Web/Expo: UNKNOWN (countdown display not inspected).

## GM-12-Q11 — When an offer is declined or expires, what happens to the shift?

> **Merged 22 Nov: asked once, as GM-11-Q10 in GM-11.** Answer it there; this copy stays for its own evidence and is not asked again.
- **Old ID:** BK-Q06 (fallback D06). **Status: VALIDATED — STILL VALID.**
- **ACTUAL TODAY:** Decline (`offers.py:676`) only notifies the owner; expiry only flips status. No fallback, re-offer, or escalation-resume exists in the inspected files. Auto-escalation is ALSO permanently stopped by any past interest (`escalation.py:92`) — so a shift whose only interested worker declines is stuck: not escalated, not re-offered, unless a manager acts manually.
- **RECOMMENDED:** On decline/expiry, offer the next interested worker (in the Q08 order) OR resume escalation if no live interest/offers remain — manager chooses per shift, defaulting to "offer next". Severity: HIGH. **ALTERNATIVE A — Keep current logic** (manager must notice and act). **ALTERNATIVE B — Auto-offer next interested worker.** **ALTERNATIVE C — Resume escalation only (no auto-offer).** Other / defer.

## GM-12-Q12 — Can a pharmacy offer one shift to several workers at once?

> **Also covers (22 Nov):** GM13-Q07 (GM-13). Asked once, here.
- **Old ID:** BK-Q07. **Status: VALIDATED — CHANGED (payment-branch ambiguity resolved).**
- **ACTUAL TODAY:** Multiple offers per slot can coexist. First acceptance wins via the slot lock — **in both branches now proven:** `slot_locked_for_shift_offer` (`assignment.py`) locks a slot if any assignment exists for slot/date OR any ACCEPTED_AWAITING_PAYMENT offer exists for the same slot/date (a whole-shift offer holds every slot). So a second accept IS blocked in the payment branch even though rivals are not expired there (Q15 refined). Rivals are expired at accept ONLY in the no-payment branch, same slot+date (`offers.py:437-448`); in the payment branch rivals stay PENDING (stale) until lazy expiry — and can still accept if the reservation expires unpaid.
- **RECOMMENDED:** Allow parallel offers, but hold the slot from the FIRST acceptance (awaiting payment included — the lock already does this) and tell later workers "this shift is on hold pending payment" instead of leaving them with a live-looking PENDING offer. Severity: HIGH (stale PENDING offers + a rival accept after an unpaid reservation expires is confusing, even if the lock prevents a true double-booking). **ALTERNATIVE A — Keep current logic** (lock holds the slot; rivals left stale-PENDING). **ALTERNATIVE B — One offer at a time (serial).** **ALTERNATIVE C — Parallel offers, first PAID wins, others auto-expired at payment.** Other / defer.

## GM-12-Q13 — What can a worker counter?
- **Old ID:** BK-Q08. **Status: PARTLY VALIDATED.**
- **ACTUAL TODAY (validated):** counter slots carry `proposed_rate`, `proposed_start_time`, `proposed_end_time`, `slot_date` (`counter_offers.py:165-170`) — rate and times are counterable. Submit-side validation (`base.py`): `require_public_ahpra` unconditional + role check (same no-op-for-non-public behaviour). Whether a counter rate must stay above the Award floor at submit is NOT verified; the floor IS enforced at accept for pharmacists (`engagement.py:_build_tfn_award_terms`: pharmacist must be ABOVE Award floor, else ValidationError; bonus forced 0; other staff `agreed_rate = max(posted, floor+bonus)`).
- **RECOMMENDED:** Rate + start/end times only; dates only by choosing different slots; no counter on role, pharmacy, or payment type. Severity: MEDIUM. **ALTERNATIVE A — Keep current logic** (rate + times, as inspected). **ALTERNATIVE B — Rate only.** **ALTERNATIVE C — Rate + times + dates.** Other / defer.

## GM-12-Q14 — If the pharmacy accepts a counter-offer, is the worker booked?
- **Old ID:** BK-Q09. **Status: VALIDATED — STILL VALID (wording sharpened).**
- **ACTUAL TODAY:** NO — accepting a counter creates fresh `ShiftOffer`(s) the worker must still confirm (`counter_offers.py:112-247`; `worker_confirmation_required: True`, `assignment_ids: []`). The worker then goes through §1.6 (terms + payment-or-finalize).
- **RECOMMENDED:** Keep this two-step (pharmacy accepts counter → worker confirms offer). It protects the worker from being booked at terms they proposed but never re-confirmed. Severity: LOW (keep). **ALTERNATIVE A — Keep current logic (recommended).** **ALTERNATIVE B — Counter-accept books immediately** (faster, but the worker never re-confirms the final terms — legal risk). Other / defer. Edge: partial acceptance — counter stays PENDING until ALL slots have generated offers.

## GM-12-Q15 — NEW: When payment is required, should the first acceptance hold the slot against rival offers?
- **Old ID:** NEW (found in the prior trace; now refined). **Status: VALIDATED — CHANGED (refined by the slot lock).**
- **ACTUAL TODAY:** `accept()` expires rival PENDING/ACCEPTED_AWAITING_PAYMENT offers for the same slot+date ONLY in the no-payment branch (`offers.py:437-448`). In the payment-required branch rivals are left PENDING. **But the slot lock closes the double-booking hole:** `slot_locked_for_shift_offer` (`assignment.py`) blocks a second accept while an ACCEPTED_AWAITING_PAYMENT offer holds the slot/date. What remains is a UX/state gap, not a double-booking gap: rivals sit PENDING (live-looking) until lazy expiry, and if the reservation expires unpaid a rival can still accept.
- **RECOMMENDED:** Expire — or visibly mark "on hold" — rivals at FIRST acceptance in both branches; if the reservation then expires unpaid (D03), release back to the same audience. Severity: HIGH (as a state/UX gap; the double-booking itself is now proven blocked). **ALTERNATIVE A — Keep current logic** (lock holds the slot; rivals stale-PENDING). **ALTERNATIVE B — Allow parallel awaiting-payment accepts, first paid wins.** **ALTERNATIVE C — Block second accepts with "on hold" (no expiry until payment/expiry).** Other / defer.

## GM-12-Q16 — NEW: Can the pharmacy withdraw a pending offer? What is the worker told?
- **Old ID:** NEW. **Status: VALIDATED (absence in inspected code).**
- **ACTUAL TODAY:** `ShiftOfferViewSet` has NO withdraw/cancel action (`offers.py:163-726`: list, retrieve, update, buzz, accept, decline, activate-payroll only). No withdraw path exists in `base.py` either (actions traced: escalate, counter_offers, accept_user, reveal_profile, manual_assign, generate_share_link). A pharmacy that changes its mind can only wait ~48h for expiry while the worker waits.
- **RECOMMENDED:** Add manager withdraw of PENDING offers with a reason + worker notice (in-app + email), and log it. Severity: MEDIUM-HIGH. **ALTERNATIVE A — No withdraw (wait for expiry).** **ALTERNATIVE B — Withdraw with notice (recommended).** **ALTERNATIVE C — Withdraw silently.** Other / defer.

## GM-12-Q17 — NEW: Should withdrawing interest tell the pharmacy?
- **Old ID:** NEW. **Status: VALIDATED.**
- **ACTUAL TODAY:** Withdrawing interest is a silent DELETE (`offers.py:48`, no destroy override) — no notification, and escalation does NOT resume (any past interest blocks it, `escalation.py:92`).
- **RECOMMENDED:** Notify the shift creator/managers on withdraw (in-app only, no email), and treat "no live interest/offers" as resuming escalation eligibility. Severity: MEDIUM. **ALTERNATIVE A — Keep current logic (silent).** **ALTERNATIVE B — Notify + resume escalation (recommended).** **ALTERNATIVE C — Notify only.** Other / defer.

## GM-12-Q18 — Is "Request booking" (Talent Board) a firm offer or an enquiry?

> **Merged 22 Nov: asked once, as GM-18-Q07 in GM-18.** Answer it there; this copy stays for its own evidence and is not asked again.
- **Old ID:** TB-Q07 (gap TB-06). **Status: VALIDATED — CHANGED (firm offer confirmed).**
- **ACTUAL TODAY:** `offer_dedicated_shift` (`assignment.py`) posts a dedicated shift and immediately creates firm offers with 48h expiry; one email. Worker cannot ask questions first through this path. Dedicated posting forces visibility LOCUM_CASUAL, `post_anonymously=False`, clears escalation timestamps. Talent Board UI not inspected at head.
- **RECOMMENDED (provisional, #184):** B — enquiry/chat first, then an offer — OR owner chooses each time (C). Severity: HIGH (a firm offer creates payment/terms consequences). **ALTERNATIVE A — Firm offer (today, confirmed).** **ALTERNATIVE B — Enquiry/chat first.** **ALTERNATIVE C — Owner chooses each time.** Other / defer.

## GM-12-Q19 — When a shift escalates, who is told, and does a pending offer pause it?

> **Merged 22 Nov: asked once, as GM-11-Q01 in GM-11.** Answer it there; this copy stays for its own evidence and is not asked again.
- **Old ID:** PO-Q08 + PO-Q09 (gap SH-06). **Status: VALIDATED — CHANGED (caller side now verified).**
- **ACTUAL TODAY:** `escalation.py` sends NO notification on escalation, and auto-escalation stops permanently on ANY interest ever (`:92`). Caller side now verified: escalation runs lazily from `base.py:get_queryset` on every list/detail request (SH-05); no beat job. No pause-on-pending-offer rule exists anywhere traced; escalation is already stopped by the first interest, so a pending offer never gets the chance to pause it.
- **RECOMMENDED:** Notify each newly eligible tier (and availability matches) on escalation; keep escalating until reserved; pause (don't cancel) escalation while a live offer/counter is pending. Severity: MEDIUM-HIGH. **ALTERNATIVE A — Keep current logic** (silent, stops on first interest). **ALTERNATIVE B — Notify only on reaching PLATFORM; stop on first interest.** **ALTERNATIVE C — Owner chooses per shift.** Other / defer. **Decide jointly with GM-11-Q01/Q02.**

## GM-12-Q20 — Can a worker drop a reservation before payment without an incident?

> **Also covers (22 Nov):** GM13-Q04 (GM-13), GM15-40 (GM-15). Asked once, here.
- **Old ID:** BK-Q14. **Status: NOT RE-VALIDATED — BLOCKED (no reservations module).**
- **ACTUAL TODAY:** No `reservations.py` exists in `backend/shifts/` at head; no reservation-expiry beat job was found in `settings.py`/`celery.py`. The Oct 2026 claim (unpaid reservations expire under D03) has no implementation traced in this area. The accept path proves the reservation *state* (`ACCEPTED_AWAITING_PAYMENT`, `shift.payment_status = 'PENDING'`), but withdrawal-before-payment has no rule and no endpoint in the files traced. This is GM-13 (billing) territory.
- **RECOMMENDED (provisional):** Worker may withdraw an unpaid reservation freely (no incident, no fee) — it is not yet a confirmed booking; notify the pharmacy at once so the shift re-opens. **ALTERNATIVE A — Withdraw freely (recommended).** **ALTERNATIVE B — Withdraw counts as a decline (affects re-offer only).** **ALTERNATIVE C — No withdraw; wait for expiry.** Other / defer. Re-validate against GM-13 before deciding.

## GM-12-Q21 — When a worker is booked, what happens to their overlapping applications?
- **Old ID:** BK-Q10. **Status: VALIDATED — CHANGED (no handling proven).**
- **ACTUAL TODAY:** `finalize_shift_offer` (`finalize.py`) has NO overlap handling: nothing withdraws the worker's other pending interests/offers on other shifts, and nothing blocks overlapping bookings across shifts. A worker booked 09:00–17:00 on shift A keeps live interests/offers for overlapping shift B.
- **RECOMMENDED:** Auto-withdraw the worker's other PENDING interests/offers that overlap the booked time, and tell the affected pharmacies "worker booked elsewhere". Severity: MEDIUM-HIGH. **ALTERNATIVE A — Keep current logic** (no withdrawal). **ALTERNATIVE B — Withdraw overlapping offers only, keep interests.** **ALTERNATIVE C — Leave everything; let the worker decline.** Other / defer.

## GM-12-Q22 — Can a worker hold a reservation that overlaps another booking or roster shift?
- **Old ID:** BK-Q11. **Status: VALIDATED — CHANGED (no block proven).**
- **ACTUAL TODAY:** No cross-shift overlap block exists in `finalize.py` or the accept path; the slot lock is per-shift only. A worker can hold a reservation overlapping another confirmed booking or roster shift.
- **RECOMMENDED:** No — block acceptance where the time overlaps a confirmed booking or roster shift (same check as the slot lock, extended across shifts). Severity: MEDIUM-HIGH. **ALTERNATIVE A — Allow, warn only.** **ALTERNATIVE B — Block (recommended).** Other / defer.

## GM-12-Q23 — Should must-have requirements block applying?
- **Old ID:** BK-Q12. **Status: PARTLY VALIDATED.**
- **ACTUAL TODAY:** No must-have gate in `express_interest` (role only, `interest.py:79`). Posting-side fields exist (`must_have`/`nice_to_have` on Shift; serializer normalises them and forbids overlap between the two lists — `serialization/shifts.py`). Whether the frontend shows must-haves on the apply screen is NOT inspected.
- **RECOMMENDED (provisional):** Must-haves block interest with a clear reason; nice-to-haves never block. **ALTERNATIVE A — Never block (show only).** **ALTERNATIVE B — Block on must-haves (recommended).** Other / defer.

## GM-12-Q24 — Should reservations show a live payment countdown? / What happens after booking payment fails?

> **Also covers (22 Nov):** GM13-Q03 (GM-13), GM25-C18 (GM-25). Asked once, here.
- **Old ID:** BK-Q13 + BK-R01 (gap SH-13). **Status: NOT RE-VALIDATED** (frontend + billing not inspected; reservation-expiry implementation not found — see Q20).
- **ACTUAL TODAY (Oct 2026 only):** both sides see reserved-not-confirmed wording + pay-by time, no live countdown; on payment failure the reservation lives until its deadline with no retry/extension rule. The shared-core API exposes `acceptShiftOffer` / `activateShiftOfferPayroll` but no countdown logic was seen in `api.ts`. Do not present Oct 2026 as current.
- **RECOMMENDED (provisional):** Live countdown on web + Expo; on payment failure, one automatic retry window + immediate release if the pharmacy chooses, else release at deadline (D03). **ALTERNATIVE A — Keep current logic.** **ALTERNATIVE B — Countdown + auto-release on first failure.** **ALTERNATIVE C — Countdown + extend once by 30 min.** Other / defer. Re-validate against GM-13 + the offer screens before deciding.

## GM-12-Q25 — What must the worker see before accepting? Does the pharmacy accept the same agreement?

> **Also covers (22 Nov):** GM14-Q02 (GM-14), GM14-Q03 (GM-14). Asked once, here.
- **Old ID:** AG-Q01 + AG-Q02 (gap SH-09). **Status: VALIDATED — CHANGED (terms contents now proven).**
- **ACTUAL TODAY:** Accept enforces a terms version match (409 TERMS_CHANGED) and freezes the accepted terms snapshot (`offers.py:392-408`; `engagement.py:freeze_accepted_terms`). The snapshot is `version: 1` and contains **NO cancellation table, NO platform terms version, and NO pharmacy-side acceptance** (`engagement.py:build_shift_engagement_terms`). Only the WORKER accepts in the traced code; staff path has `acceptance_required=False`. Award terms are computed (`_build_tfn_award_terms`: pharmacist above Award floor else ValidationError; >12h shift → payroll review; pre-7am weekday/Saturday → overtime review; overtime NOT auto-computed).
- **RECOMMENDED:** Show pay, times, breaks, duties, site, cancellation table + platform terms version before accept; record pharmacy acceptance of the same terms. Severity: HIGH (P09 fees cannot be charged without pre-acceptance disclosure). **ALTERNATIVE A — Keep current logic** (pay/times/legal notices only — Oct 2026). **ALTERNATIVE B — Full disclosure + dual acceptance (recommended).** Other / defer. **Decide jointly with GM-13 (agreement/terms) and GM-14 (Award).**

## GM-12-Q26 — Code-gap timing questions (LAUNCH area, GM-12 slice)
- **LA-Q05** (payment readiness surfaced late): ON-Q04 is answered. Engineering: see BL-03 for the early notice and acceptance gate. Launch timing is in LAUNCH-01.
- **LA-Q09** (pending offers can outlive the shift — SH-07): **VALIDATED.** Lazy expiry + no start-cap confirmed; 48h value confirmed. Fix before launch? A/B/C — cap at start + eager expiry.
- **LA-P03** (chain/org shifts skip the shared AHPRA gate): answered in ON-Q03. Engineering: see BL-01. Launch scope: see LAUNCH-01.
- **LA-Q15** (web/mobile disagree on Talent Board booking permissions — TB-07): **NOT RE-VALIDATED** (no frontend inspected). Narrowed: both clients share one API client (`shared-core/api.ts`), so the *endpoint* behaviour cannot disagree; whether both UIs expose the same actions is NOT verified. Fix before launch? A/B/C.

---

# 4. Owner interview order

The verification, exemption and pay-readiness policies are recorded in GM-12-Q01 to Q04. Start the remaining offer questions at GM-12-Q06 (instant booking). Explorer access is owned by GM-24.

---

# 5. Code gaps vs decision gaps

## Code gaps (no owner decision needed — just build / fix; timing only)
- **CG-01** — `_require_public_shift_onboarding` (`interest.py:40`) appears unused; `express_interest` uses `require_public_ahpra` instead. Delete it or wire it — and confirm whether `verification_features().require_public_shift_onboarding` is the same function and whether any other caller depends on it. (Needs a repo-wide caller check + `onboarding/feature_port.py` read.)
- **CG-02** — Offer expiry is lazy only (`offers.py:182`, `:355`); no scheduled expiry job visible in inspected files; no cap at shift start anywhere inspected. (SH-07; LA-Q09.)
- **CG-03** — Rival offers are not expired in the payment-required accept branch (`offers.py:437-448` — expiry only in the no-payment branch). The slot lock prevents a true double-booking, so this is now a state/UX gap (stale PENDING rivals), not a double-booking gap — needs the decision in Q15, then a fix.
- **CG-04** — Auto-escalation has no notification and never resumes after any interest (`escalation.py:81-92`). Notification part is a build; resume rule needs Q11/Q19 (GM-11-Q01).
- **CG-05** — `reject_shift` has no role/verification check (`interest.py:192`). Almost certainly fine (declining is harmless) — confirm and leave, or add the check for symmetry.
- **CG-06** — No pharmacy withdraw-offer action in `ShiftOfferViewSet` (`offers.py:163-726`) or `base.py`. Build after Q16 is answered.
- **CG-07** — RESOLVED: buzz cooldown `SHIFT_OFFER_BUZZ_COOLDOWN` = 1 hour (`base.py`); `OFFER_EXPIRY_HOURS` = 48 (`assignment.py`). Do not quote other values.
- **CG-08** — Interest withdraw is a silent DELETE with no notification (`offers.py:48`). Build after Q17.
- **CG-09** — `finalize_shift_offer` has no overlap handling: nothing withdraws the worker's other pending interests/offers on other shifts, nothing blocks cross-shift overlapping bookings (`finalize.py`). Build after Q21/Q22.
- **CG-10** — Re-offering an existing PENDING offer refreshes rate/times but does NOT refresh `expires_at` (`assignment.py:offer_shift`) — a re-offer silently shortens the worker's remaining time. Confirm deliberate or fix after Q10.
- **CG-11** — `claim_shift` silently skips taken slots (partial claim possible without telling the worker, `browse.py:249`). Confirm deliberate or surface it after Q06/Q07.
- **CG-12** — `getShiftCounterOffersBatch` returns `{}` when no ids are passed (`shared-core/api.ts:66-71`) — a stub fallback; confirm it cannot mask a real empty result.
- **CG-13** — No `reservations.py` module and no reservation-expiry job found; D03 reservation-expiry implementation untraced (GM-13 territory). Confirm where reservations expire, or build it.

## Decision gaps (owner must choose first — do not build until answered)
- **Verification and member exemption (Q01/Q03):** answered. Engineering: see BL-01 and BL-02.
- **DG-03** Q10/Q24 — offer-expiry length, start-cap, eager vs lazy, countdown.
- **DG-04** Q11/Q19 — decline/expiry fallback: re-offer next vs resume escalation vs manual only.
- **DG-05** Q12/Q15 — parallel offers: serial vs parallel, first-accept-hold vs first-paid-wins (lock now proven; stale-rival handling still open).
- **DG-06** Q06/Q07 — instant book / auto-accept: who, and opt-in per shift?
- **DG-07** Q14 — counter-accept = booked, or worker must still confirm? (Recommended: keep two-step.)
- **DG-08** Q18 — "Request booking": firm offer vs enquiry/chat first.
- **DG-09** Q08/Q09 — applicant ordering + what the pharmacy sees / when identity is revealed (quota value still UNKNOWN).
- **DG-10** Q20/Q21/Q22 — reservation withdrawal, overlapping applications/bookings.
- **DG-11** Q25 — pre-acceptance disclosure (cancellation table, terms version, dual acceptance).
- **DG-12** Q05 — Explorer shift access (owned by GM-24). Q04 pay readiness is answered.

---

# 6. Documentation matrix & per-question source links

| Q | Old ID | Status | Current-code source (97c4543e) or Oct 2026 source |
|---|---|---|---|
| Q01 | ON-Q03 | Answered: B, check every outside booking, launch grill, 23 Oct 2026 - see VERIFY-GATE-01 | `pr257:backend/onboarding/verification/state.py:174` |
| Q02 | ON-Q02 | Answered: KEEP, launch grill, 23 Oct 2026 - see GM01-Q04 for the single re-confirmation | `main:frontend_web/src/components/ProtectedRoute.tsx:26` |
| Q03 | ON-P01 | Answered: A, employees are exempt and favourites are checked, launch grill, 23 Oct 2026 - see AHPRA-FAV-01 | `pr257:backend/shifts/interest.py:21` |
| Q04 | ON-Q04 | Answered: B, tell the worker early and require pay details before acceptance, launch grill, 23 Oct 2026 - see ON-Q04 | `pr257:backend/shifts/engagement.py:265`, `:716` |
| Q05 | ON-Q05 | PARTLY | `interest.py:40-46` (Explorer branch in unused helper) |
| Q06 | BK-Q01 | VALIDATED — CHANGED | `backend/shifts/browse.py:249` (`claim_shift`, staff-only) |
| Q07 | BK-Q02 | VALIDATED — CHANGED | Same as Q06; no reliability score in inspected files |
| Q08 | BK-Q03 | NOT RE-VALIDATED | #184 BK-Q03; `offers.py:58-60` (rating annotation only); Candidates components not read |
| Q09 | BK-Q04 | VALIDATED — CHANGED | `backend/shifts/candidates.py:83-140` (reveal quota/audit/notify), `:199-208` (revealed profile, no contact/CV) |
| Q10 | BK-Q05 | VALIDATED — CHANGED | `offers.py:182-186`, `:355-359` (lazy expiry); `assignment.py:OFFER_EXPIRY_HOURS = 48`; no start-cap |
| Q11 | BK-Q06 | VALIDATED — STILL VALID | `offers.py:676-726` (decline = notify only); `escalation.py:92` (any interest blocks escalation) |
| Q12 | BK-Q07 | VALIDATED — CHANGED | `offers.py:437-448` (rivals expired only in no-payment branch); `assignment.py:slot_locked_for_shift_offer` (lock holds slot in both branches) |
| Q13 | BK-Q08 | PARTLY | `counter_offers.py:165-170` (proposed rate/times/date); `engagement.py:_build_tfn_award_terms` (floor at accept) |
| Q14 | BK-Q09 | VALIDATED — STILL VALID | `counter_offers.py:112-247` (`worker_confirmation_required: True`) |
| Q15 | NEW | VALIDATED — CHANGED (refined) | `offers.py:437-448` vs payment branch `:419-435`; `assignment.py:slot_locked_for_shift_offer` |
| Q16 | NEW | VALIDATED (absence) | `offers.py:163-726` (no withdraw action); `base.py` actions traced (no withdraw) |
| Q17 | NEW | VALIDATED | `offers.py:48` (DELETE, no destroy override); `escalation.py:92` |
| Q18 | TB-Q07 | VALIDATED — CHANGED | `assignment.py:offer_dedicated_shift` (firm offers, 48h, one email); TalentBoard UI not inspected |
| Q19 | PO-Q08/Q09 | VALIDATED — CHANGED | `escalation.py:81-92` (no notify; stops on any interest); `base.py:get_queryset` (lazy trigger, SH-05) |
| Q20 | BK-Q14 | NOT RE-VALIDATED | #184 BK-Q14; no `reservations.py` at head; no expiry beat job — GM-13 territory |
| Q21 | BK-Q10 | VALIDATED — CHANGED | `backend/shifts/finalize.py` (no overlap handling) |
| Q22 | BK-Q11 | VALIDATED — CHANGED | `finalize.py` + accept path (slot lock is per-shift only) |
| Q23 | BK-Q12 | PARTLY | No must-have gate in `express_interest` (`interest.py:79`); `must_have` fields in `serialization/shifts.py` |
| Q24 | BK-Q13/BK-R01 | NOT RE-VALIDATED | #184 BK-Q13/BK-R01; frontend + billing NOT inspected |
| Q25 | AG-Q01/Q02 | VALIDATED — CHANGED | `offers.py:392-408` (terms version 409 + freeze); `engagement.py:build_shift_engagement_terms` (snapshot v1, no cancellation table / terms version / pharmacy acceptance) |
| Q26 | LA-Q05/Q09/P03/Q15 | MIXED | LA-Q05 answered (Q04); LA-Q09 validated; LA-P03 validated (Q01); LA-Q15 NOT RE-VALIDATED (shared-core narrows it) |

**Decision status per question:** ALL 26 are **NOT VERIFIED → CURRENT FLOW TRACED** where validated, else **NOT VERIFIED**. NONE is OWNER DECIDED. No implementation is decided.

## What still needs verification (not done in this trace — do NOT treat as done)
1. Screen-level Web (Vite + Next) and Expo parity: Shift Centre, Talent Board "Request booking", offer accept/decline/counter screens, countdown, buzz — contents not read at head (only paths via default-branch search + the shared-core API layer).
2. `onboarding/feature_port.py` — whether `verification_features().require_public_shift_onboarding` is the `_require_public_shift_onboarding` helper (CG-01).
3. Reveal quota value/default (`shift.reveal_quota` — `models.py` field default not traced).
4. Reservation behaviour (Q20/Q24) — GM-13 billing: where reservations expire, payment-failure handling, countdown.
5. Tests covering interest/offers/counters at 97c4543e (none inspected).
6. Applicant ordering (Q08) — read the ActiveShiftsPage Candidates components.
7. Member treatment inside `lock_public_ahpra` for public shifts (Q03 caveat).

---

# 7. Implementation backlog (SEPARATE — only after the owner answers; nothing here is decided)

| # | Item | Depends on | Severity / launch impact |
|---|---|---|---|
| B1 | Settle + implement one verification rule at every external acceptance; document `require_public_ahpra` inner gating; remove or wire `_require_public_shift_onboarding` | Q01, Q03 (CG-01) | HIGH — launch-gating |
| B2 | Cap offer expiry at shift start; add eager expiry (scheduled job); decide re-offer expiry refresh | Q10 (CG-02, CG-10) | HIGH |
| B3 | Mark/expire rival offers at first acceptance in BOTH payment branches (or implement first-paid-wins explicitly) | Q12, Q15 (CG-03) | HIGH |
| B4 | Decline/expiry fallback: auto-offer next and/or resume escalation | Q11, Q19 | HIGH |
| B5 | Manager withdraw-offer with reason + worker notice; withdraw-interest notice | Q16, Q17 (CG-06, CG-08) | MEDIUM-HIGH |
| B6 | "Request booking": firm offer vs enquiry flow (backend + web + Expo) | Q18 | HIGH |
| B7 | Instant book / auto-accept (opt-in per shift, favourites) | Q06, Q07 | MEDIUM |
| B8 | Applicant ordering + reveal rules (web + Expo); confirm reveal quota value | Q08, Q09 | MEDIUM |
| B9 | Pre-acceptance disclosure pack (cancellation table, terms version, dual acceptance) | Q25 | HIGH (legal) |
| B10 | Live payment countdown (web + Expo) + payment-failure retry/release rule | Q24 | MEDIUM |
| B11 | Overlap handling: auto-withdraw overlapping applications; block overlapping reservations | Q21, Q22 (CG-09) | MEDIUM |
| B12 | Pay-readiness surfaced on apply/offer screens (worker + pharmacy) | Q04 | MEDIUM |
| B13 | Counter-offer field limits (rate floor? times only?) + per-slot partial-accept UX | Q13, Q14 | MEDIUM |
| B14 | Escalation notifications to newly eligible tiers; pause (not cancel) on live offers | Q19 (GM-11-Q01) | MEDIUM |
| B15 | Explorer shift-access rule + upgrade path in UI | Q05 | MEDIUM |
| B16 | Cross-client positive/negative tests for every row of the §2 matrix (web + Expo, incl. concurrent accept, expired accept, wrong-user accept, double buzz) | All above | HIGH — verification, not a feature |

*No code changes were made in this trace. No PR/issue/comment/branch created. No owner was notified.*
