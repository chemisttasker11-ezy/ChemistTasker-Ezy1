# GM-10 — Shift posting / rates — Grill Me trace (read-only, documentation only)

> **Corrections against current code (21 Nov 2026 review).** 10 claims checked at `main` `8ccf8f77` and `pr257` `21add924`; 6 hold, 4 below need the correction shown. Where a question below says otherwise, this table wins. Full evidence: [`../followup/claim-check-2026-11-21.md`](../followup/claim-check-2026-11-21.md).

| Where | Claim in this file | Verdict | Correct statement | Evidence |
|---|---|---|---|---|
| Q01, retry case | “no server guard” against duplicate posting | STALE for keyed retries | pr257 supports per-user idempotency receipts for keyed create requests. Independently submitted requests with different keys are still separate postings. | `pr257:backend/shifts/base.py:123`; `:177`; `pr257:shared-core/src/domains/shifts/api.ts:217` |
| Q05 | no past-date guard or recurrence horizon cap | STALE for backend posting | pr257 accepts posting dates from pharmacy-local today through the end of the fourth following calendar month, including recurring end dates. main lacks this backend guard. | main entry: `main:backend/shifts/posting.py:78`; candidate guard: `pr257:backend/shifts/posting.py:66`; create: `:100`; edit: `:228` |
| Q06 / Q11 | “Interested/accepted workers are NOT re-notified” | WRONG | Shift edits notify active interest holders, counter-offer holders and workers with pending or accepted offers. Notification does not mean existing accepted terms are re-confirmed. | `main:backend/shifts/posting.py:215`; `pr257:backend/shifts/posting.py:257`; recipients: `pr257:backend/shifts/emails.py:406` |
| Q09 | “draft … in-memory … only” | STALE for submitted-request recovery | There is still no server posting-draft state. Expo now persists submitted intents and recovery edits, so an uncertain submitted post is not merely disposable in-memory form state. | `pr257:frontend_mobile/roles/shared/shifts/PostShiftScreen.tsx:685`; `:1328`; `:1393`; `:1426` |

- **Repo:** `chemisttasker11-ezy/ChemistTasker-Ezy1`
- **Issue:** [#250 — Grill Me, one consolidated backend, web & Expo business-logic sign-off before launch](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/issues/250)
- **Revalidation base:** active PR [#249](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/pull/249) (stacked on [#248](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/pull/248))
- **Example format source:** PR [#184](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/pull/184), `docs/qa/launch-grill/AUDIT.md` + `questions.json` on `refs/pull/184/head` — 142 questions, 30 carried decisions
- **Status of this document:** DOCUMENTATION ONLY. No code was changed, no PR/issue/comment created. No implementation is decided here. Progress label: **CURRENT FLOW TRACED** (backend + shared-core + Vite web + Expo wizard traced at head; Next parity and a few details still UNKNOWN — see §6).

## Web and Expo today, side by side (pr257 `21add924`)

Source for both web and Expo is `origin/agent/pr257-int` `21add924` (what merges to main). Read-only code check by agy, 21 Nov 2026; every cited file:line was checked to exist at that commit. "Parity question" = a choice for the owner, asked in this area's rounds. "Possible defect (to verify)" = drift that looks unintended; it is confirmed in code before it goes to the engineering backlog, never asked as a question. The Platforms table says which platforms each question applies to.

| Flow | Web (Vite + Next) | Expo | Same? | If different |
|---|---|---|---|---|
| Start posting wizard | Multi-step wizard opens in Vite (`frontend_web/src/pages/dashboard/sidebar/PostShiftPage.tsx:16`; Next has no wizard route, only a navigation helper at `frontend_web/landing_next/migrated/pages/dashboard/sidebar/TalentBoard/index.tsx:307`). | Multi-step posting screen opens in Expo (`frontend_mobile/roles/shared/shifts/PostShiftScreen.tsx:79`, mounted at `frontend_mobile/roles/owner/post-shift.tsx:1`). | Yes | - |
| Submit shift with required fields | Validates draft and submits payload via `buildShiftPostingPayload` (`frontend_web/shared/postShift/PostShiftForm.tsx:493`). | Validates draft and submits payload via `buildShiftPostingPayload` (`frontend_mobile/roles/shared/shifts/PostShiftScreen.tsx:1372`). | Yes | - |
| Submit with missing or invalid fields | Shared validation intercepts invalid draft returning inline field errors (`frontend_web/shared/postShift/PostShiftForm.tsx:499`). | Shared validation intercepts invalid draft returning inline field errors (`frontend_mobile/roles/shared/shifts/PostShiftScreen.tsx:532`). | Yes | - |
| Hourly rate and loading preview | Renders rate inputs and preview calculations in pay step (`frontend_web/shared/postShift/PostShiftPayStep.tsx:64`). | Renders mobile pay rate step sending identical rate configuration (`frontend_mobile/roles/shared/shifts/PostShiftPayRateStep.tsx:92`). | Yes | - |
| Edit published shift | Re-enters wizard loading existing shift data under `editingShiftId` (`frontend_web/shared/postShift/PostShiftForm.tsx:210`). | Reuses mobile wizard passing `editingShiftId` to update payload (`frontend_mobile/roles/shared/shifts/PostShiftScreen.tsx:1340`). | Yes | - |
| Withdraw / delete unfilled shift | Deletes unfilled shift via `deleteShift` action without candidate notifications (`frontend_web/src/pages/dashboard/sidebar/RosterOwnerPage.tsx:595`). | Deletes unfilled shift via `deleteShift` without candidate notifications (`frontend_mobile/roles/shared/shifts/ActiveShiftsPage/index.tsx:265`). | Yes | - |
| Save draft / leave wizard | In-memory draft state only; closing the page discards unsubmitted data (`frontend_web/shared/postShift/PostShiftForm.tsx:135`). | In-memory draft state only; navigating away discards form progress (`frontend_mobile/roles/shared/shifts/PostShiftScreen.tsx:241`). | Yes | - |

### Platforms per question
| Question id | Platforms |
|---|---|
| GM-10-Q01 | Web + Expo |
| GM-10-Q02 | Web + Expo |
| GM-10-Q03 | Web + Expo |
| GM-10-Q04 | Web + Expo |
| GM-10-Q05 | Web + Expo |
| GM-10-Q06 | Web + Expo |
| GM-10-Q07 | Web + Expo |
| GM-10-Q08 | Web + Expo |
| GM-10-Q09 | Web + Expo |
| GM-10-Q10 | Web + Expo |
| GM-10-Q11 | Web + Expo |
| GM-10-Q12 | Web + Expo |
| GM-10-OD-09 — The server refuses shift dates before today or more than 4 months ahead | Web + Expo |
| GM-10-OD-10 — Reminder of your own decision: Expo Post shift has no separate draft/publish | Expo only |

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
| `backend/shifts/posting.py` | 290 | `post_shift` (no verified/ABN gate, FIXED defaults, PLATFORM daily limit), `revise_shift` (SH-08 partly fixed), `protect_direct_booking`, `sync_pharmacy_rate_defaults` |
| `backend/shifts/pricing.py` | 512 | Segmented rate calculation (day windows, day types, Award windows, PHARMACIST_PROVIDED, silent $0 fallback) |
| `backend/shifts/serialization/shifts.py` | 500 | `ShiftSerializer` (no draft field, FT/PT pay-band rules, `project_published_rates`, `get_ui_is_negotiable`) |
| `backend/shifts/serialization/slots.py` | 69 | Slot fields; NO date/time validation |
| `backend/shifts/rate_visibility.py` | 47 | PO-Q03 — published pay HIDDEN from the pharmacy's own staff |
| `backend/shifts/deletion.py` | 34 | DELETE rules; deletion IS the withdraw mechanism; no notice on delete |
| `backend/shifts/models.py` | 889 | Shift/ShiftSlot fields, `RATE_TYPE_CHOICES`, `clean()` rules, `Shift.save` rate inheritance |
| `backend/shifts/base.py` | 431 | `check_permissions` (create requires `user_can_manage_pharmacy`), `calculate_rates` preview |
| `backend/shifts/announcements.py` | 581 | Posting-time notices + availability-match emails (GM-11 overlap) |
| `backend/shifts/browse.py` | 731 | Visibility querysets, filters incl. `negotiable_only`, `only_urgent` (GM-11 overlap) |
| `backend/shifts/engagement.py` | 758 | Award terms at accept, ABN/TFN readiness (GM-09/GM-12 overlap) |
| `backend/memberships/models.py` | 340 | `PHARMACY_STAFF_EMPLOYMENT_TYPES`, `FAVORITE_STAFF_EMPLOYMENT_TYPES` |
| `shared-core/src/domains/shifts/postingDraft.ts` | 105 | Shared validation + payload builder (web + Expo): required fields, no past-date check, escalation timestamps, super 12% |
| `frontend_web/shared/postShift/PostShiftForm.tsx` | 779 | Wizard shell: in-memory draft only, urgent toggle, submit |
| `frontend_web/shared/postShift/PostShiftPayStep.tsx` | 269 | Rate entry: rate types, per-day pharmacy rates, per-slot rates, Award section |
| `frontend_web/shared/postShift/PostShiftVisibilityStep.tsx` | 204 | Audience picker, escalation modes, notify switches, anonymous toggle |
| `frontend_mobile/roles/shared/shifts/PostShiftVisibilityStep.tsx` | 238 | Expo audience picker — mirrors web |

**Adopted, not re-traced:** GM-01 sessions, GM-02 AHPRA/Verified gates, GM-05 roles, GM-18 identity leak (LA-Q12 STILL VALID), GM-25 structural trace, GM-11 audience/escalation, GM-12 interest/offers.

## How to read this document

- **Plain English first.** A *shift post* = a pharmacy owner/manager publishing a vacant shift (date, times, role, rate) so workers can see it and express interest. A *rate* = what the pharmacy will pay for that shift — hourly, plus any overtime/weekend loading. *Draft vs published* = a shift saved but not yet visible to workers, versus one live on the board. **There is no server-side draft state in current code** — see GM-10-Q09.
- **Core product rule (owner-stated, from the task — not a code finding):** everybody posts from both sides — owners post shifts on the shifts board AND workers post their availability/talent posts on the talent board; neither side waits for the other. GM-10 covers the owner side of that rule; the worker side is GM-18/GM-19.
- **Code gap** = no owner choice needed; just build/fix it. **Decision gap** = the owner must choose first; building before the choice risks building the wrong thing.

---

## 1. GM-10 traced flow — ACTUAL TODAY (verified at head)

### 1.1 Current-flow matrix

| # | Trigger | Actor | Backend / API (verified at 97c4543e) | Vite web | Next web | Expo | Persisted state | Event / side effect | Recovery / denial path |
|---|---|---|---|---|---|---|---|---|---|
| F-01 | Owner starts the posting wizard | Owner / authorised manager | Create requires `user_can_manage_pharmacy` (`base.py:check_permissions`); exact role set per GM-05 (adopted) | Post Shift wizard: `frontend_web/shared/postShift/` — `PostShiftForm`, `PostShiftWizardShell`, Details/Timetable/Pay/Visibility/Skills steps, helpers; entry pages `PostShiftPage.tsx` + `AdminPostShiftPage.tsx` | **No post-shift page found** under `frontend_web/landing_next` (search returned only a TalentBoard hit) — Next parity UNKNOWN-to-negative | `frontend_mobile/roles/shared/shifts/PostShift*` — `PostShiftScreen`, Details/Visibility/PayRate/Timetable/Skills steps, `PostShiftProgress`; routes `roles/owner/post-shift.tsx`, `roles/admin/post-shift.tsx`, `roles/organization/post-shift.tsx` | None yet (in-memory form state only) | None | Wrong role / wrong tenant: denied by `user_can_manage_pharmacy` (manager check); worker cannot start a post |
| F-02 | Owner submits a shift with all required fields | Owner / manager | `post_shift` (`posting.py`): **NO `Pharmacy.verified` / `abn_verified` check → ON-06 STILL VALID**. `payment_preference` defaults: LOCUM → 'ABN', FT/PT → 'TFN'. PLATFORM at posting: daily limit enforced, `escalate_to_platform` stamped now. `escalation_level` = index of chosen visibility. `announce_posted_shift` + `announce_availability_matches` on commit; dedicated → `offer_dedicated_shift`. **No draft state anywhere in `posting.py`.** | `PostShiftForm.tsx` (779 lines): `postingDraft()` builds the draft, `validateShiftPostingDraft` runs, `buildShiftPostingPayload` sends it; Review step shows a job-board card preview (`buildShiftPostingPreview`); `submitting` flag guards double-submit at UI level; submit posts immediately | NOT FOUND (see F-01) | `PostShiftScreen.tsx` uses the same shared-core `postingDraft` validation/payload — same required-field rules, same immediate post | Shift + slots + rates + visibility + escalation timestamps + notify flags | Posting-time notices per flags; availability-match emails only if PLATFORM (GM-11); dedicated → firm offers immediately (GM-12-Q18) | Validation failure → inline error, no post; server 400 → wizard shows error (retry path per PR #249 W3b handover: prefills/retry unfinished) |
| F-03 | Owner submits with a missing/invalid field or rate | Owner / manager | Serializer `validate()` (`serialization/shifts.py`): FT/PT pay-band rules; Explorer shifts cannot require professional skills; must_have/nice_to_have normalised, cannot overlap. `create`: slots required; chosen visibility must be in `allowed_tiers`. `models.py:clean()`: PHARMACIST+FIXED → `fixed_rate` required; non-pharmacist → rate fields forbidden; FT/PT slotless must carry pay band (hourly min+max or annual min+max + super_percent); locum/casual annual/hourly inputs ignored. | Shared validation (`postingDraft.ts:validateShiftPostingDraft`): pharmacy + role + employment type required; locum needs ≥1 slot; slot start/end must be valid HH:MM and not equal (midnight-crossing valid — end<start = overnight); FT/PT HOURLY needs min+max hourly; ANNUAL needs min+max annual + super%. **NO past-date check anywhere in shared validation.** | NOT FOUND | Same shared validation as web | — | Error message returned to the wizard; nothing persisted | Fix the field and re-submit; no server-side draft to resume from (Q09) |
| F-04 | Owner sets hourly rate + overtime/weekend loading | Owner / manager | **Pricing is segmented** (`pricing.py`): overnight split across days (`end<=start` → +1 day); day windows early-morning (before 08:00) / daytime / late-night (from 19:00); day types weekday/Saturday/Sunday/public holiday from pharmacy state/region holiday calendar; Award windows from 1 July 2026 Schedule B (07:00/08:00/18:00/19:00/21:00 boundaries; part-day holiday boundaries data-driven). Pharmacist: FIXED/FLEXIBLE → pharmacy day-rate; PHARMACIST_PROVIDED → worker's own rate preference per day-type/time-bucket (missing → KeyError). Non-pharmacist: Award casual rates per segment + `owner_adjusted_rate` bonus. `get_locked_rate_for_slot`: owner-posted slot rate authoritative when >0; otherwise segmented calc; **on error returns `DECIMAL_ZERO` with error (silent $0 fallback)**. `calculate_shift_rates`: Post Shift page preview, same logic. `expand_shift_slots`: recurring expansion by weekday. **Overtime NOT computed here** ("overtime eligibility must be evaluated separately" — at accept it only flags payroll review, `engagement.py`). | Pay step (`PostShiftPayStep.tsx`, 269 lines): rate types FLEXIBLE ("Open to offers") / FIXED / PHARMACIST_PROVIDED; per-day pharmacy rates (weekday/Sat/Sun/public holiday/early morning/late night) with "Save as this pharmacy's usual rates"; per-slot rate rows with preview totals; FT/PT pay mode hourly/annual; "Superannuation is added to the hourly rate"; Award rate section with owner bonus on top; link to government Award pay guide (published 6 February 2026). `SUPER_GUARANTEE_PERCENT = 12` (`postingDraft.ts`). | NOT FOUND | `PostShiftPayRateStep.tsx` exists (path verified by search; contents NOT read at head) — shared-core payload sends the same rate fields | `rate_type`, `fixed_rate`, `owner_adjusted_rate`, `rate_weekday/saturday/sunday/public_holiday/early_morning/late_night`, per-slot `rate`, `min/max_hourly_rate`, `min/max_annual_salary`, `super_percent` | Rates stored on shift + pharmacy defaults (`sync_pharmacy_rate_defaults`: pharmacy `rate_*` + `default_fixed_rate`); new PHARMACIST shift inherits `pharmacy.default_rate_type`/`default_fixed_rate` (`models.py:Shift.save`) | FIXED rate defaults cascade: pharmacy `default_fixed_rate` → `rate_weekday` → first slot rate → `Decimal('0.00')` — **a FIXED shift can be created at $0.00 if no defaults exist** (Q12) |
| F-05 | Owner posts a past, overnight or DST-boundary shift | Owner / manager | **NO past-date guard, NO end>start guard (end<=start = overnight by convention), NO recurring horizon cap** — in `serialization/slots.py` (69 lines: no date/time validation at all), in `models.py:ShiftSlot.clean` (recurring rules only + break < shift length), and in shared validation (`postingDraft.ts`). Recurring: `recurring_days` 0–6, `recurring_end_date` with no cap. Timezone handling in pricing is pharmacy state/region based (holiday calendar); storage/display timezone rules were not traced to a single statement — see Q05. | Date/time pickers per step (Timetable step; contents not read at head beyond the shared validation). Equal start/end times refused client-side ("they cannot be the same"). | NOT FOUND | Date/time pickers (Expo step contents not read at head) | Slots as entered, including past dates | A past-date shift can be posted and will be filtered out of browse (future-or-current slots only, `browse.py`) — silently invisible, not refused | No guard to trigger; a past shift is postable and then invisible. DST handling: UNKNOWN (see Q05) |
| F-06 | Owner edits a published shift (before/after interest, before/after acceptance) | Owner / manager | `revise_shift` (`posting.py`) — **SH-08 PARTLY fixed:** if any ACCEPTED_AWAITING_PAYMENT offer exists, any non-description edit or slots change is refused ("Complete payment before editing"). **But with only ACCEPTED (paid/confirmed) or PENDING offers, rate/role/payment edits are still allowed** (frozen terms keep old values, shift card shows new). Pharmacy change blocked when assignments or accepted offers exist. Slots replacement blocked if roster container / rostered slots / assignments exist. `update` → `revise_shift` (`serialization/shifts.py`). On edit, slots are included only if `slotsModified`, rates only if `ratesModified` (`postingDraft.ts:buildShiftPostingPayload`); notify flags are NOT re-sent on edit. | Edit flow reuses the wizard (`editingShiftId` in the draft; `PostShiftForm` loads existing detail incl. `is_urgent`) | NOT FOUND | Edit flow reuses the mobile wizard (same shared-core payload) | Revised shift; accepted terms snapshot unchanged (frozen) | Interested/accepted workers are NOT re-notified and NOT asked to re-confirm in the traced code (no re-confirmation path found) | Edit refused with "Complete payment before editing" while payment is pending; otherwise allowed |
| F-07 | Owner withdraws a published shift | Owner / manager | **No "withdraw" state — deletion IS the withdraw mechanism for unfilled shifts.** `deletion.py`: DELETE allowed unless assignments exist (409) or pending payment (409, incl. PENDING payment_status / non-expired fulfillment checkouts / ACCEPTED_AWAITING_PAYMENT offers / pending payments). **Deleting a shift with PENDING interests/offers is allowed and sends no notice** (no delete hook). Oct 2026 SH-01 (no cancelled state/endpoint for a confirmed external booking) is a separate, still-open question — GM-15 territory. | Delete action on the shift (endpoint `deleteShift` in shared-core `api.ts`) | NOT FOUND | Same shared-core delete | Shift row deleted | No notification to interested workers, no escalation resume | Delete refused (409) once assigned or payment-pending; otherwise silent delete |
| F-08 | Unverified pharmacy posts (own staff / chain/org / public) | Owner / manager | **No gate:** `post_shift` checks neither `Pharmacy.verified` nor `abn_verified` (ON-06 STILL VALID — same finding as Oct 2026, now re-confirmed at head). `Pharmacy.verified` is only read by the ethical marketplace (Oct 2026; not re-traced here). No audience-dependent gating: the same ungated post can go to staff, chain, org or public. | Wizard does not show a verification gate | NOT FOUND | Same (no gate in shared payload) | Shift live at chosen tier | None | None — an unverified site can post publicly and a locum can accept (see GM-12-Q01 for the accept-side hole) |
| F-09 | Owner saves a draft, returns later, publishes or deletes it | Owner / manager | **No draft state exists at API level:** `ShiftSerializer` has no `draft`/`is_draft` field; `posting.py` has no draft functions; `ShiftSlot.unpublished_at` means "taken back to draft inside a published roster week" (roster draft, NOT a posting draft). "Roster deletion of plain draft staff" in `deletion.py` is roster drafts, not posting drafts. | The wizard's "draft" is **in-memory form state only** (`postingDraft()`, `buildShiftPostingPreview` — "Review card for an unsaved draft"). Leaving the page loses it. No save/publish split: submit = publish. | NOT FOUND | Same in-memory draft (shared-core) | Nothing persisted until submit | None | Session drop / navigation away loses the half-finished post (PR #249 W3b notes draft/publish as unfinished handover work) |
| F-10 | Owner reposts a cancelled/expired/unfilled shift | Owner / manager | **No repost endpoint or flag was found** in the traced files. The only paths are: create a new shift (new notifications, new source-freeze) or edit the existing one (F-06). Whether reposting counts as new for fees is GM-16 territory. | No repost button traced in the wizard files read | NOT FOUND | No repost traced | New shift row if re-created | Fresh posting-time notices; old interest does NOT carry over (new shift id) | N/A — manual re-creation only |
| F-11 | Worker / wrong-tenant / denied-role user attempts to post | Worker / other | Create requires `user_can_manage_pharmacy`; `check_permissions` exempts `express_interest`/`reject`/`claim_shift`/`calculate_rates`/`counter_offers` from the manager check (those are worker actions, not posting). Cross-pharmacy posting is denied by the same check. | Wizard entry pages are manager/owner/admin routes | NOT FOUND | Owner/admin/organization post-shift routes | — | 403 | — |
| F-12 | Duplicate / concurrent post of the same slot | Owner / manager (x2) | No idempotency key, no duplicate-post guard, no unique constraint on (pharmacy, slot, date) was found in the traced files. Two managers can post the same slot; the result is two live shifts. (The accept path IS serialised — `select_for_update` in `offers.py:accept` — but posting is not.) | `submitting` flag guards double-click double-submit on one client only | NOT FOUND | Same client-side guard only | Two shift rows | Two sets of posting notices | None server-side |

### 1.2 Rates — what the worker sees (PO-Q03, resolved)

**Published pay is HIDDEN from staff members of the pharmacy (and chain staff); visible to anonymous, managers, outsiders** (`rate_visibility.py:project_published_rates`, 47 lines). For staff viewers it strips `rate_type` / `fixed_rate` / `owner_adjusted_rate` / `min/max_hourly` / `min/max_annual` / `super_percent` / `payment_preference` + slot `rate` + pharmacy `rate_*` / `default_*`, and sets `ui_is_negotiable=False`. This is a deliberate-looking rule (staff are paid under their employment terms, not the posted locum rate) but it was never an owner decision in #184 — see GM-10-Q03/Q11 and the decision gap on whether staff should see the posted rate.

### 1.3 Web vs Expo parity

- **Posting wizard — PARITY for the traced steps.** Web (`frontend_web/shared/postShift/`) and Expo (`frontend_mobile/roles/shared/shifts/PostShift*`) share the same validation and payload builder (`shared-core/.../postingDraft.ts`), the same rate types and per-day rates, and the same Visibility step (identical tiers/labels/modes — GM-11). The Expo PayRate step exists but its contents were NOT read at head (path verified by search only); the shared-core payload guarantees the same fields are sent, but screen-level parity of the pay step is not fully verified.
- **Next web — NOT FOUND.** No post-shift page under `frontend_web/landing_next` (search for `post-shift` returned only a TalentBoard hit). Next parity for posting is UNKNOWN-to-negative; needs GM-25 confirmation. Do not assume a Next wizard exists.
- **PR #249 W3b handover** lists Post Shift prefills/retry, templates, draft/publish as unfinished work — consistent with the traced state (in-memory draft only, no server draft, retry not traced).

### 1.4 Old-question mapping (from #184)

GM-10 has almost no direct #184 material. The closest old questions, and their status now:

| Old ID | Question | Status at head |
|---|---|---|
| ON-Q11 / ON-06 | Posting checks `Pharmacy.verified` / `abn_verified` | **STILL VALID** — `post_shift` checks neither (GM-10-Q08) |
| PO-Q03 | Published pay visibility | **RESOLVED as a finding** — hidden from own staff/chain staff, visible to others (`rate_visibility.py`) — but never an owner decision; see Q03/Q11 |
| PO-R01 | Award checks before posting | **PARTLY** — Award rates are computed in `pricing.py` and the floor is enforced at *accept* (`engagement.py`), not at posting; no posting-time Award check was found |
| SH-08 | Edits allowed after acceptance | **PARTLY FIXED** — blocked while payment is pending ("Complete payment before editing"); still allowed with only ACCEPTED or PENDING offers (GM-10-Q06) |
| SH-01 | No cancelled state / endpoint for a confirmed external booking | **STILL VALID** (GM-15 territory; withdraw of an *unfilled* post is deletion, F-07) |
| E01/E01A/E03 | Audience order, cumulative visibility, owner-picked intervals | **Confirmed** (GM-11) |
| CX-Q32/Q33, CX-R01 | Completion / disputed hours / early finishes | GM-09 territory |

---

## 2. Question queue — #184 format (GM-10)

**Validation key:** every question below is traced against current code at `97c4543e`. **STILL VALID** = Oct 2026 behaviour confirmed in current code. **CHANGED** = behaviour differs from the Oct 2026 wording. **PARTLY** = one half checked. **NEW** = arises from this trace. Severity: 🔴 launch-gating · 🟠 high · 🟡 medium.

### GM-10-Q01 — Who can post a shift, and from where?
- **#184 ID:** none established (topic inventory from Issue #250). **Status: VALIDATED (permission rule traced; role detail adopted from GM-05).**
- **ACTUAL TODAY:** Creating a shift requires `user_can_manage_pharmacy` (`base.py:check_permissions`) — owner or authorised manager. Workers cannot post; a manager of pharmacy A cannot post for pharmacy B. Entry points: web `PostShiftPage.tsx` / `AdminPostShiftPage.tsx`; Expo `roles/owner/post-shift.tsx`, `roles/admin/post-shift.tsx`, `roles/organization/post-shift.tsx`. No Next entry point found. The exact role set (which manager roles count as "can manage") is GM-05's trace — adopted here, not re-derived.
- **RECOMMENDED:** Keep the manager check, and confirm the GM-05 role list covers org admins for multi-site groups. Severity: MEDIUM.
- **ALTERNATIVE A — Keep current logic:** owner + authorised managers post; workers denied. *Scenario:* an authorised manager posts while the owner is away. Trade-off: works; delegation is per GM-05.
- **ALTERNATIVE B — Owner-only posting:** only the pharmacy owner posts; managers request. *Scenario:* owner on leave, urgent cover needed, no manager can post — shift goes unfilled. Trade-off: tightest control, slowest cover.
- **ALTERNATIVE C — Owner + named authorised managers, per pharmacy:** *Scenario:* a multi-site owner delegates posting to each site's manager, with an audit trail. Trade-off: faster cover, needs a per-pharmacy authorisation list.
- **Other / defer:** Defer until GM-05 (roles/membership/invites) is decided, since posting permission depends on it.
- **Normal case:** owner posts from their own pharmacy. **Edge case:** manager posts for a pharmacy they just left / were removed from — the manager check is evaluated at request time, so a removed manager is denied. **Retry/concurrency:** two managers posting the same slot at once — no server guard (F-12). **Denied role / wrong tenant:** worker, or a manager of pharmacy A posting for pharmacy B — denied by `user_can_manage_pharmacy`. **Payment/notification side effects:** none at permission time. **Web/Expo difference:** entry routes differ; permission rule is shared backend.

### GM-10-Q02 — What fields are required to post a shift, and what happens when one is missing?
- **#184 ID:** none established. **Status: VALIDATED.**
- **ACTUAL TODAY:** Required (shared validation, `postingDraft.ts`): pharmacy, role, employment type; locum needs ≥1 slot; slot start/end valid HH:MM and not equal; FT/PT HOURLY needs min+max hourly; ANNUAL needs min+max annual + super%. Backend adds: slots required; chosen visibility must be in `allowed_tiers`; FT/PT pay-band rules; Explorer shifts cannot require professional skills; must_have/nice_to_have cannot overlap. **A rate is NOT required for a locum shift** (see Q03) — a FIXED shift can even be created at $0.00 (Q12). Missing/invalid → inline error in the wizard, nothing persisted; no server draft to resume from.
- **RECOMMENDED:** Keep the required set, but add the two missing guards (past date — Q05; rate floor — Q03/Q12). Severity: MEDIUM-HIGH.
- **ALTERNATIVE A — Keep current logic:** required set as traced. *Scenario:* owner posts a locum shift with dates/times/role but no rate. Trade-off: fastest posting; rate disputes later.
- **ALTERNATIVE B — Minimal required set (date, times, role, site) with rate optional/negotiable:** *Scenario:* an owner posts urgently without fixing a rate; workers express interest and the rate is negotiated in the offer. Trade-off: faster posting, slower matching, possible rate disputes.
- **ALTERNATIVE C — Strict required set including a fixed rate:** *Scenario:* every posted shift shows a firm rate, so workers only apply to shifts they accept. Trade-off: clearer matching, slower posting, owners may post a low rate just to get the shift live.
- **Other / defer:** Defer the rate-required choice to GM-10-Q03.
- **Normal/edge/retry/denied/payment/Web-Expo:** shared validation is identical on web + Expo (same `postingDraft.ts`); Next unknown.

### GM-10-Q03 — Must a shift carry a fixed hourly rate at posting, or can the rate be open/negotiable? [FIRST — see §3]
- **#184 ID:** none established (PO-Q03 is the visibility half, not the rate rule). **Status: VALIDATED.**
- **ACTUAL TODAY:** Three rate types exist — FIXED, FLEXIBLE ("Open to offers"), PHARMACIST_PROVIDED ("Pharmacist's own rate") (`models.py:RATE_TYPE_CHOICES`; wizard radio "How is the rate set?"). A locum shift can be posted with NO rate at all: FIXED defaults cascade (pharmacy `default_fixed_rate` → `rate_weekday` → first slot rate → **$0.00**). The Award floor is enforced at *accept* for pharmacists (`engagement.py`: pharmacist must be above Award floor, else ValidationError), not at posting. Workers can filter by `negotiable_only` (FLEXIBLE) in browse. Published pay is hidden from the pharmacy's own staff/chain staff and shown to everyone else (`rate_visibility.py` — PO-Q03 finding, never an owner decision).
- **RECOMMENDED:** B — Fixed rate required for pharmacist locum shifts, shown to workers, frozen at posting; FLEXIBLE allowed only with a stated minimum (the Award floor). Rationale: the current code lets a FIXED shift exist at $0.00 and lets the rate be settled only at accept, which is exactly where GM-12's counter-offer and GM-14's Award disputes start. Severity: 🔴 launch-gating — it shapes matching (GM-19), offers (GM-12), terms/Award (GM-14) and fees (GM-16).
- **ALTERNATIVE A — Keep current logic:** FIXED/FLEXIBLE/PHARMACIST_PROVIDED as traced, rate optional, $0.00 FIXED possible, floor enforced only at accept. *Scenario:* an owner posts a FIXED shift with no defaults anywhere — it goes live at $0.00 and a worker applies before anyone notices. Trade-off: maximum flexibility, real underpayment/trust risk.
- **ALTERNATIVE B — Fixed rate required, shown to workers, frozen at posting (recommended):** *Scenario:* a locum sees "$65/hr, Saturday" and applies knowing the pay; the owner cannot lower it after interest. Trade-off: trust and fast matching; owners lose flexibility if the market moves.
- **ALTERNATIVE C — Rate range or "negotiable", settled in the offer:** *Scenario:* an owner posts "$60–$70/hr negotiable" for a hard-to-fill Sunday; workers counter-offer. Trade-off: flexible, but slower matching and more disputes; Award-minimum floor still needs a rule (see GM-14).
- **Other / defer:** Defer until GM-14 (Award/GST/super) confirms the minimum-pay floor — but note that deferring leaves the $0.00 path live at launch.
- **Normal case:** owner posts a Saturday pharmacist shift at a fixed rate. **Edge case:** PHARMACIST_PROVIDED with a worker who has no rate preference stored → `KeyError` in pricing (CG-10-06). **Retry/concurrency:** rate preview (`calculate_shift_rates`) can return "0.00" on error with no hard failure. **Denied role / wrong tenant:** n/a. **Payment/notification:** the posted rate becomes the frozen terms rate at accept (`finalize.py` uses the accepted-terms snapshot). **Web/Expo difference:** same rate types and fields on both (shared-core); Next unknown.

### GM-10-Q04 — How are overtime, weekend and public-holiday loadings handled?
- **#184 ID:** none established (PO-R01 is the Award-check half). **Status: VALIDATED.**
- **ACTUAL TODAY:** Loadings are **computed, not entered**: `pricing.py` segments every shift by day type (weekday/Saturday/Sunday/public holiday from the pharmacy's state/region holiday calendar) and time window (early-morning before 08:00 / daytime / late-night from 19:00), using Award windows from 1 July 2026 Schedule B (07:00/08:00/18:00/19:00/21:00 boundaries; part-day holiday boundaries data-driven). Pharmacist FIXED/FLEXIBLE → pharmacy day-rate per segment; non-pharmacist → Award casual rates per segment + `owner_adjusted_rate` bonus. **Overtime is NOT computed anywhere in pricing** — it is only flagged for payroll review at accept (>12h shift, pre-7am weekday/Saturday — `engagement.py`). The owner enters per-day rates + an optional bonus on top of the Award rate; there is no separate "overtime rate" field.
- **RECOMMENDED:** Keep computed loadings, and decide explicitly that overtime is a payroll-review flag (not an automatic loading) until GM-14 says otherwise. Severity: MEDIUM-HIGH.
- **ALTERNATIVE A — Keep current logic:** segmented day/time rates + bonus; overtime flagged, not computed. *Scenario:* a 14-hour Saturday shift prices the Saturday rate for all hours; the >12h flag sends it to payroll review. Trade-off: simple; overtime pay depends on a human review step.
- **ALTERNATIVE B — Automatic loadings from the Award (GM-14):** *Scenario:* a Saturday shift automatically shows the weekend loading; the owner cannot underpay by forgetting it. Trade-off: correct by default, needs the Award rules encoded and kept current.
- **ALTERNATIVE C — Owner enters a single all-in rate, no separate loadings:** *Scenario:* an owner posts "$80/hr Sunday" as one number. Trade-off: simple, but the payslip/terms must still break out base vs loading, or payroll (GM-09) inherits an unexplained number.
- **Other / defer:** Defer the calculation method to GM-14; GM-10 decides only what the poster enters and what the worker sees.
- **Normal/edge:** overnight shifts split across days (end<=start → +1 day); shifts crossing into a public holiday are segmented per day. **Web/Expo:** same pay step fields (shared-core).

### GM-10-Q05 — Dates, times and timezones: what guards exist, and what time does the worker see?
- **#184 ID:** none established. **Status: VALIDATED (absence proven).**
- **ACTUAL TODAY:** **No past-date guard, no end>start guard, no recurring-end cap** — in shared validation, in the slot serializer, and in `ShiftSlot.clean`. Equal start/end times are refused client-side only. Overnight is a convention: end<=start means +1 day (`pricing.py`). Recurring expansion is by weekday with `recurring_end_date` and no horizon cap. Timezone: pricing uses the pharmacy's state/region (holiday calendar); **no single storage/display timezone rule was traced** — whether times are stored as UTC and displayed pharmacy-local, or stored naïve, was not established from the files read. DST handling: UNKNOWN.
- **RECOMMENDED:** Add a past-date guard (refuse slots in the past) and a recurring horizon cap (e.g. 12 weeks), and state the timezone rule explicitly (pharmacy-local time everywhere, stored as UTC — or whatever the code actually does once confirmed). Severity: 🟠 high — a past-date shift is postable today and then silently invisible in browse (future-or-current filter), which looks like a lost post, not a refused one.
- **ALTERNATIVE A — Keep current logic:** no guards; overnight by convention. *Scenario:* an owner fat-fingers last month's date; the shift posts, nobody sees it, the owner assumes the board is broken. Trade-off: zero build, silent failure mode.
- **ALTERNATIVE B — Pharmacy-local time everywhere, stored as UTC:** *Scenario:* a Gold Coast pharmacy posts 08:00–16:00; a worker in Sydney sees 08:00–16:00 Gold Coast time labelled as such. Trade-off: one truth, needs clear labelling on every screen.
- **ALTERNATIVE C — Device-local display with explicit timezone label:** *Scenario:* same shift shown converted to the worker's timezone. Trade-off: friendlier for travellers, risk of a worker turning up an hour early/late if the label is missed.
- **Other / defer:** Defer DST specifics to implementation once the storage rule is decided.
- **Normal case:** same-day day shift. **Edge cases:** overnight shift crossing midnight; shift spanning the DST change; past date; end before start; zero-length shift (refused client-side only). **Retry/concurrency:** n/a. **Denied role / wrong tenant:** n/a. **Payment/notification:** a wrong-time shift that is worked becomes a pay dispute (GM-09/GM-15). **Web/Expo difference:** date/time pickers commonly differ between web and mobile — the Expo Timetable step contents were not read at head; the validation is shared, the pickers are not.

### GM-10-Q06 — Can a posted shift be edited, and what changes after interest or acceptance?
- **#184 ID:** SH-08 (partly). **Status: VALIDATED — CHANGED (partly fixed since Oct 2026).**
- **ACTUAL TODAY:** `revise_shift` (`posting.py`): if any ACCEPTED_AWAITING_PAYMENT offer exists, any non-description edit or slots change is refused ("Complete payment before editing"). **But with only ACCEPTED (paid/confirmed) or PENDING offers, rate/role/payment edits are still allowed** — the accepted terms snapshot is frozen (old values kept for the booked worker) while the shift card shows the new values. Pharmacy change is blocked when assignments or accepted offers exist. Slots replacement is blocked if a roster container / rostered slots / assignments exist. On edit, slots are sent only if `slotsModified`, rates only if `ratesModified`; notify flags are NOT re-sent on edit. **Interested/accepted workers are NOT re-notified and NOT asked to re-confirm** in the traced code.
- **RECOMMENDED:** Freeze rate/role/payment/dates once ANY interest or offer exists (not just while payment is pending); allow description-only edits freely; any other change requires withdrawing and reposting (or a re-confirmation from affected workers). Severity: 🟠 high — today an owner can change the rate on a shift with three PENDING offers and the workers are never told.
- **ALTERNATIVE A — Keep current logic:** blocked only while payment is pending; otherwise editable. *Scenario:* owner fixes a typo in the rate after three workers applied — each worker still sees the old offer; the shift card shows the new rate. Trade-off: flexible; silent divergence between offers and the card.
- **ALTERNATIVE B — Free edit before any interest; re-confirmation required after interest:** *Scenario:* owner changes the rate after three workers applied — each worker is asked to confirm they still want it at the new rate. Trade-off: fair, but adds a re-confirmation step that may lose workers.
- **ALTERNATIVE C — No edit after publishing; withdraw and repost instead:** *Scenario:* owner changes the date by withdrawing and reposting; old interest is discarded and workers must re-apply. Trade-off: simplest to reason about, most friction for workers.
- **Other / defer:** Defer the re-confirmation mechanism to GM-12 (interest/offers).
- **Normal/edge/retry/denied/payment/Web-Expo:** edit reuses the wizard on web + Expo (same shared-core payload); Next unknown.

### GM-10-Q07 — Can a posted shift be withdrawn, and what happens to workers who already saw it or applied?
- **#184 ID:** none established (SH-01 is the confirmed-booking half — GM-15). **Status: VALIDATED.**
- **ACTUAL TODAY:** There is **no withdraw state and no withdraw endpoint**. Deletion IS the withdraw mechanism for unfilled shifts: DELETE is allowed unless assignments exist (409) or payment is pending (409). **Deleting a shift with PENDING interests/offers is allowed and sends no notice** (no delete hook in `deletion.py`). A confirmed external booking has no cancelled state/endpoint (SH-01 STILL VALID — GM-15).
- **RECOMMENDED:** Add a real withdraw (not delete): mark the shift withdrawn, notify interested/offered workers, keep the record for audit, and let escalation/offer state resolve cleanly. Severity: 🟠 high — today three interested locums are left waiting on a shift that no longer exists.
- **ALTERNATIVE A — Keep current logic:** delete = withdraw; silent for interested workers. *Scenario:* owner finds internal cover and deletes; three interested locums get no "shift withdrawn" notice and keep waiting. Trade-off: zero build, poor worker experience.
- **ALTERNATIVE B — Withdraw any time before acceptance; interested workers are notified:** *Scenario:* owner finds internal cover and withdraws; three interested locums get a "shift withdrawn" notice. Trade-off: clean, needs a notification rule (GM-22).
- **ALTERNATIVE C — Withdraw allowed after acceptance only via cancellation (GM-15):** *Scenario:* withdrawing a filled shift is a cancellation with policy/fees, not a free withdraw. Trade-off: protects the accepted worker; the owner cannot silently drop them.
- **Other / defer:** Defer post-acceptance withdrawal to GM-15.
- **Normal/edge/retry/denied/payment/Web-Expo:** delete is a shared-core call on both clients; Next unknown.

### GM-10-Q08 — Must a pharmacy pass any verification check before posting, and does it differ by audience?
- **#184 ID:** ON-Q11 / ON-06 (cf. GM-04-Q03). **Status: VALIDATED — STILL VALID.**
- **ACTUAL TODAY:** `post_shift` checks **neither** `Pharmacy.verified` **nor** `abn_verified` — re-confirmed at head (same finding as Oct 2026). No audience-dependent gating: the same ungated post can go to own staff, chain, org or public. Do not decide here in isolation — decide jointly with GM-04-Q03 to avoid two conflicting answers.
- **RECOMMENDED:** C — ABN-verified for chain/org, ABN + admin-verified before public; no gate for own staff. Rationale: chain/org workers already know the site, public workers don't — the risk is asymmetric. Severity: 🟠 high (trust).
- **ALTERNATIVE A — Keep current logic:** no gate at any audience. *Scenario (today):* an unverified site posts publicly and a locum accepts. Trade-off: fastest onboarding, all trust risk on the worker.
- **ALTERNATIVE B — ABN-verified for any outside post (chain/org/public), no gate for own staff:** *Scenario:* a real site with an ABN typo is blocked from posting to its own staff until fixed. Trade-off: uniform, but blocks internal-adjacent posting.
- **ALTERNATIVE C — ABN-verified for chain/org, ABN + admin-verified before public (recommended):** *Scenario:* chain/org workers already know the site, public workers get a real trust signal; admin verification becomes a bottleneck for public posting. Trade-off: public workers protected; slower public onboarding.
- **Other / defer:** Defer until GM-03 (pharmacy/owner setup) defines what "verified" means.
- **Normal/edge/retry/denied/payment/Web-Expo:** no gate on any client (shared backend).

### GM-10-Q09 — Do drafts exist, and what does publishing a draft do?
- **#184 ID:** none established. **Status: VALIDATED (absence proven).**
- **ACTUAL TODAY:** **No drafts exist.** `ShiftSerializer` has no `draft`/`is_draft` field; `posting.py` has no draft functions; `ShiftSlot.unpublished_at` is a roster-draft marker, not a posting draft. The wizard's "draft" is in-memory form state only (`PostShiftForm.tsx:postingDraft()`, `buildShiftPostingPreview` — "Review card for an unsaved draft"). Leaving the page loses the half-finished post. Submit = publish: the shift is immediately live at its chosen visibility tier, with escalation timestamps and posting-time notices. PR #249's W3b handover lists draft/publish as unfinished work.
- **RECOMMENDED:** B — Drafts exist, visible only to the poster, no expiry (server-side, with a list/resume/delete). Rationale: owners plan rosters days ahead; losing a half-finished post on navigation is the failure the W3b handover already flags. Severity: MEDIUM.
- **ALTERNATIVE A — Keep current logic:** no drafts; posting is publishing. *Scenario:* an owner must finish the wizard in one go. Trade-off: simplest state machine; a half-finished post is lost if the session drops.
- **ALTERNATIVE B — Drafts exist, visible only to the poster, no expiry (recommended):** *Scenario:* an owner drafts Friday's shifts on Monday and publishes Thursday. Trade-off: flexible planning; stale drafts may pile up and confuse the poster.
- **ALTERNATIVE C — Drafts exist with expiry (e.g. 7 days) and auto-cleanup:** *Scenario:* same as B, but stale drafts disappear. Trade-off: tidy; an owner who drafts early loses work silently if they miss the window.
- **Other / defer:** Defer draft expiry/cleanup to implementation once drafts are confirmed to exist.
- **Normal/edge/retry/denied/payment/Web-Expo:** in-memory draft is shared-core (same on web + Expo); a server draft would need both clients to use it.

### GM-10-Q10 — How does reposting work, and what carries over?
- **#184 ID:** none established. **Status: VALIDATED (absence proven).**
- **ACTUAL TODAY:** **No repost endpoint or flag was found** in the traced files. The only paths are creating a brand-new shift (new id, new notifications, new source-freeze, old interest does NOT carry over) or editing the existing one (Q06). Whether reposting counts as new for fees is GM-16 territory.
- **RECOMMENDED:** B — Repost creates a new shift copying rate/audience, old interest discarded. Rationale: clean history; the old shift's interest belonged to the old dates. Severity: MEDIUM.
- **ALTERNATIVE A — Keep current logic:** no repost; manual re-creation only. *Scenario:* an unfilled Saturday shift is re-created by hand for next Saturday. Trade-off: works, but every field must be re-entered and nothing carries over.
- **ALTERNATIVE B — Repost creates a new shift copying rate/audience, old interest discarded (recommended):** *Scenario:* an unfilled Saturday shift is reposted for next Saturday; last week's interested workers must re-apply. Trade-off: clean history, workers may miss the repost.
- **ALTERNATIVE C — Repost revives the same shift and re-notifies prior interested workers:** *Scenario:* the same workers are told the shift is live again. Trade-off: best fill rate, risks spamming workers if reposted repeatedly.
- **Other / defer:** Defer the notification rule to GM-22.
- **Normal/edge/retry/denied/payment/Web-Expo:** no repost UI traced on either client.

### GM-10-Q11 — What does posting trigger (notifications, fees, matching), and what do edit/withdraw/repost trigger?
- **#184 ID:** none established (AV-04 / SH-06 are the escalation halves — GM-11). **Status: VALIDATED.**
- **ACTUAL TODAY:** Posting triggers: posting-time notices per the wizard's notify flags (`announce_posted_shift` — staff/favourites/chain; no org broadcast; PLATFORM anonymous → no notices at all; cap 50 recipients) + availability-match emails ONLY if posted straight to PLATFORM (`announce_availability_matches` — no Verified filter; any-overlap). Escalation triggers NOTHING (GM-11-Q01). Editing triggers nothing (no re-notify, no re-confirmation — Q06). Withdrawing (deleting) triggers nothing (no delete hook — Q07). No fee is charged at posting in the traced code (fees are GM-16; `BILLING_LIVE_SHIFT_FULFILLMENT_ENABLED` defaults False, `settings.py`).
- **RECOMMENDED:** Post notifies matching available workers immediately, at every tier (not just PLATFORM-at-posting) — and edit/withdraw notify the workers they affect. Severity: 🟠 high — this is the core rule ("neither side waits for the other") made concrete: a worker who posted availability (GM-19) should be told the moment a matching shift appears.
- **ALTERNATIVE A — Keep current logic:** posting-time notices per flags + PLATFORM-only match emails; edit/withdraw silent. *Scenario:* a matching shift is posted to favourites; an available favourite who set alerts never hears about it. Trade-off: quiet, slow fills.
- **ALTERNATIVE B — Post notifies matching available workers immediately, at every tier (recommended):** *Scenario:* a worker who posted availability (talent board, GM-19) is notified the moment a matching shift appears. Trade-off: fastest matching, notification volume risk.
- **ALTERNATIVE C — Post notifies nobody; workers find shifts by browsing:** *Scenario:* matching depends entirely on workers checking the board. Trade-off: quiet, slow fills — conflicts with the core rule that neither side waits for the other.
- **Other / defer:** Defer the exact recipient list to GM-22 (notifications) and any fee trigger to GM-16.
- **Normal/edge/retry/denied/payment/Web-Expo:** notices are backend (client-independent); the flags are set in the wizard on web + Expo.

### GM-10-Q12 — NEW: Can a shift ever be posted, displayed or paid at $0.00?
- **#184 ID:** NEW (found in this trace). **Status: VALIDATED (gap in current code).**
- **ACTUAL TODAY:** Yes, by three paths: (1) a FIXED shift with no pharmacy `default_fixed_rate`, no `rate_weekday`, and no slot rate is created at `Decimal('0.00')` (`posting.py` default cascade); (2) `get_locked_rate_for_slot` returns `DECIMAL_ZERO` with an error on any pricing failure (`pricing.py` — silent $0 fallback); (3) `calculate_shift_rates` returns rate `"0.00"` on error for the Post Shift preview (`lifecycle.py`). A pharmacist's PHARMACIST_PROVIDED rate that is missing raises `KeyError` instead (loud, but a different failure). No $0 guard exists at posting, at preview, or at accept — the Award floor is only enforced at accept for pharmacists, and only for TFN engagements (`engagement.py`).
- **RECOMMENDED:** Refuse to post (or at least to publish) any shift whose computed rate is $0.00, and surface the pricing error to the poster instead of silently substituting zero. Severity: 🟠 high — a $0.00 shift that reaches a worker is an underpayment/trust incident waiting to happen.
- **ALTERNATIVE A — Keep current logic:** $0.00 possible via defaults/fallback. *Scenario:* an owner posts a FIXED shift with no defaults; it goes live at $0.00 and a worker applies before anyone notices. Trade-off: zero build, real risk.
- **ALTERNATIVE B — Refuse $0.00 at posting (recommended):** *Scenario:* same owner gets "Add a rate before posting" and the shift never goes live. Trade-off: one guard; owners with genuinely unpaid/volunteer shifts (if those exist) need an explicit $0 path — see GM-19/Explorer.
- **ALTERNATIVE C — Allow $0.00 only as an explicit, labelled "unpaid/volunteer" post:** *Scenario:* a shadowing shift is posted at $0 with a clear label. Trade-off: preserves a legitimate use if one exists; needs the label everywhere the rate appears.
- **Other / defer:** e.g. warn but allow, with the $0 shown prominently to the worker. **Edge cases:** FT/PT pay-band shifts (min/max rates, not a single rate); slot rate 0 with a valid pharmacy default (the cascade saves it). **Decide jointly with Q03 (rate rule) and GM-14 (Award floor).**

---

## 3. SINGLE first decision question to ask the owner first

**GM-10-Q03 — Must a shift carry a fixed hourly rate at posting, or can the rate be open/negotiable?**

Why first: the rate rule shapes every downstream GM-10 question (what is required, how loadings work, what an edit means, whether $0 is possible) and gates GM-12 (offers), GM-14 (Award floor) and GM-16 (fees). It is also the question most likely to change the posting wizard's design if answered late. The code is now traced, so this can be asked as "actual today" — unlike the provisional version in the prior skeleton, which had to be asked as a fresh product choice with current behaviour unknown.

**Plain-English version for the owner:** "Today a shift can be posted with no rate at all — fixed, open to offers, or the pharmacist's own rate — and if no default rate exists anywhere, a fixed-rate shift can go live at $0.00. The Award minimum is only checked later, when a worker accepts. Should every shift carry a firm rate from the moment it is posted, or should the rate stay negotiable until the offer?"

Options (as in §2, GM-10-Q03):
- **A — Keep current logic:** FIXED / FLEXIBLE / PHARMACIST_PROVIDED as traced; rate optional; $0.00 FIXED possible; Award floor enforced only at accept.
- **B — Fixed rate required, shown to workers, frozen at posting (recommended).**
- **C — Rate range or "negotiable", settled in the offer.**
- **Other / defer:** defer until GM-14 confirms the minimum-pay floor — but note that deferring leaves the $0.00 path live at launch.

**What happens after the owner answers Q03:** Q02 (required fields) and Q12 ($0 handling) become answerable in one follow-up; Q04 (loadings) and Q06 (edits) follow from the same rate rule; GM-12 (offers) and GM-14 (Award) can then be asked without re-litigating the rate.

---

## 4. Code gaps vs decision gaps

### Code gaps (no owner decision needed — just build/fix; the *bound* in Q03/Q05 is the only decision)
| ID | Gap (verified at 97c4543e) | Fix |
|---|---|---|
| CG-10-01 | No past-date guard anywhere (shared validation, slot serializer, `ShiftSlot.clean`) | Refuse slots in the past (after Q05) |
| CG-10-02 | No end>start guard (overnight by convention only); equal times refused client-side only | Server-side guard (after Q05) |
| CG-10-03 | No recurring-end cap (`recurring_end_date` unbounded) | Horizon cap, e.g. 12 weeks (after Q05) |
| CG-10-04 | FIXED shift can be created at $0.00 (default cascade ends at `Decimal('0.00')`) | $0 guard (after Q03/Q12) |
| CG-10-05 | Silent $0 fallback on pricing error (`get_locked_rate_for_slot` returns `DECIMAL_ZERO`; preview returns `"0.00"`) | Surface the error to the poster (after Q12) |
| CG-10-06 | PHARMACIST_PROVIDED with a missing worker rate preference raises `KeyError` (`pricing.py`) | Default/fallback + clear error (after Q03) |
| CG-10-07 | No server-side draft state (in-memory only; session drop loses the post) | Server drafts (after Q09) |
| CG-10-08 | Rate/role/payment edits allowed with PENDING or ACCEPTED offers; no re-notify / re-confirmation (`revise_shift`) | Freeze or re-confirm (after Q06) |
| CG-10-09 | Deleting a shift with PENDING interests/offers sends no notice (no delete hook) | Withdraw with notice (after Q07) |
| CG-10-10 | No duplicate-post / idempotency guard; two managers can post the same slot | Idempotency or duplicate warning |
| CG-10-11 | Overtime not computed (flagged for payroll review only) | Decide in GM-14, then compute or keep flagging |
| CG-10-12 | No Next post-shift page found (search-only) | Confirm with GM-25 whether a Next wizard should exist |

### Decision gaps (owner must choose first — do not build until answered)
| ID | Question | Blocks |
|---|---|---|
| Q03 | Fixed vs negotiable rate (FIRST) | Q02, Q04, Q06, Q12; GM-12, GM-14, GM-16 |
| Q01 | Who may post (owner vs authorised managers) | GM-05 roles |
| Q02 | Required fields | Wizard design |
| Q04 | Overtime/weekend/public-holiday loadings | GM-14 Award |
| Q05 | Dates/times/timezones + guards | CG-10-01/02/03 |
| Q06 | Editing after interest/acceptance | GM-12 re-confirmation |
| Q07 | Withdrawing (delete vs real withdraw + notice) | GM-15 (confirmed bookings), GM-22 |
| Q08 | Verification gating by audience | GM-04-Q03, GM-03 |
| Q09 | Drafts (exist? expiry?) | CG-10-07 |
| Q10 | Reposting (new shift vs revive + re-notify) | GM-22 |
| Q11 | Posting side effects (notify matching workers at every tier?) | GM-19 matching, GM-22 |
| Q12 | $0.00 shifts (refuse / allow-labelled / warn) | Q03, GM-14 |

**Cross-area dependencies (decide jointly, not in isolation):** GM-04-Q03 (verification gating), GM-05 (who is an authorised manager), GM-11 (audience/escalation/notices), GM-12 (offers/counter-offers), GM-14 (Award/GST/super floor), GM-15 (cancellation of filled shifts), GM-16 (fees), GM-19 (availability matching), GM-22 (notifications).

---

## 5. Documentation matrix and implementation backlog

### 5.1 Documentation matrix (status per question)

| Question | #184 predecessor | Status | ACTUAL TODAY | Source links (97c4543e) |
|---|---|---|---|---|
| GM-10-Q01 Who can post | none established | VALIDATED | Manager check; roles per GM-05 | `base.py:check_permissions` |
| GM-10-Q02 Required fields | none established | VALIDATED | Shared + backend rules traced | `postingDraft.ts:validateShiftPostingDraft`; `serialization/shifts.py:validate`; `models.py:clean` |
| GM-10-Q03 Fixed vs negotiable rate | none (PO-Q03 is visibility) | VALIDATED | 3 rate types; rate optional; $0.00 possible | `models.py:RATE_TYPE_CHOICES`; `posting.py` defaults; `rate_visibility.py` |
| GM-10-Q04 Loadings | none (PO-R01 half) | VALIDATED | Segmented computed rates; overtime flagged only | `pricing.py`; `engagement.py:_build_tfn_award_terms` |
| GM-10-Q05 Dates/times/timezones | none established | VALIDATED (absence) | No guards; overnight by convention; TZ rule untraced | `slots.py`; `models.py:ShiftSlot.clean`; `postingDraft.ts` |
| GM-10-Q06 Editing after posting | SH-08 | VALIDATED — CHANGED (partly fixed) | Blocked only while payment pending | `posting.py:revise_shift` |
| GM-10-Q07 Withdrawing | none (SH-01 is confirmed half) | VALIDATED | Deletion = withdraw; silent | `deletion.py` |
| GM-10-Q08 Verification gating | ON-Q11 / ON-06 | VALIDATED — STILL VALID | No gate at any audience | `posting.py:post_shift` |
| GM-10-Q09 Drafts | none established | VALIDATED (absence) | No server draft; in-memory only | `serialization/shifts.py` (no draft field); `PostShiftForm.tsx` |
| GM-10-Q10 Reposting | none established | VALIDATED (absence) | No repost path | (absence across traced files) |
| GM-10-Q11 Posting side effects | none (AV-04/SH-06 halves) | VALIDATED | Notices per flags + PLATFORM-only match emails; edit/delete silent | `announcements.py`; `posting.py` |
| GM-10-Q12 $0.00 shifts | NEW | VALIDATED (gap) | 3 paths to $0.00 | `posting.py` cascade; `pricing.py:get_locked_rate_for_slot`; `lifecycle.py:calculate_rates` |

Progress label (per Issue #250): **CURRENT FLOW TRACED**. It advances to OWNER DECIDED only when the owner answers, starting with Q03.

### 5.2 Implementation backlog — ONLY after owner answers (nothing here is decided now)
1. **After Q03 + Q12:** rate rule (fixed-required vs negotiable-with-minimum), $0 guard, PHARMACIST_PROVIDED fallback; tests: $0 post refused, missing worker rate, preview error surfaced.
2. **After Q05:** past-date guard, end>start server guard, recurring horizon cap, timezone rule stated + labelled on every screen; tests: past slot, overnight, DST boundary.
3. **After Q06:** edit freeze / re-confirmation flow for shifts with interest/offers; tests: edit with PENDING offers, edit with ACCEPTED offers, edit while payment pending (already refused).
4. **After Q07:** real withdraw with notice + audit record (not silent delete); tests: withdraw with pending interests, withdraw blocked once assigned.
5. **After Q08 / GM-04-Q03:** verification gating by audience (if any); tests: unverified pharmacy posting to staff vs chain vs public.
6. **After Q09:** server-side drafts (save/resume/delete/list) on web + Expo; tests: resume after session drop, draft expiry if chosen.
7. **After Q10/Q11:** repost (copy rate/audience) + posting/edit/withdraw notifications to affected workers; tests: repost carries rate, prior interest notified on withdraw.
8. **After Q04 / GM-14:** overtime computation (if decided) or keep the payroll-review flag with a clear owner statement.
9. **Cross-client verification (after implementation):** Web (Vite + Next) verified, Expo verified, launch signed off — per Issue #250 progress labels. No step is "done" from a green typecheck alone. Next wizard existence to be confirmed with GM-25 first.

### 5.3 What is still UNKNOWN (do not present as decided)
1. **Timezone storage/display rule (Q05):** pricing uses pharmacy state/region; no single storage/display rule was traced. DST handling unknown.
2. **Next web posting wizard:** no post-shift page found under `frontend_web/landing_next` (search-only) — unknown whether a Next wizard should exist (GM-25).
3. **Expo PayRate / Timetable / Details step contents:** paths verified by search; contents NOT read at head (shared-core payload guarantees the same fields, not the same screens).
4. **Wizard retry/prefill behaviour:** PR #249 W3b notes prefills/retry as unfinished; the submit error/retry path was not traced beyond the `submitting` flag.
5. **Duplicate-post behaviour:** no guard found; whether two identical posts are a real operational problem (vs a theoretical one) is unobserved.
6. **Tests:** no posting/pricing tests were inspected in this trace; test coverage for the §1 matrix is unverified.

*No code changes were made in this trace. No PR/issue/comment/branch created. No owner was notified.*

## Added 2026-11-22: decisions the orchestrator made for you
From the orchestrator's decision logs (`DECISIONS_FOR_OWNER.md`, `DECISIONS_2026-11-11.md`, `DECISIONS_2026-11-12.md`). Code: `origin/agent/pr257-int` `47506e67`. "Yes" keeps the recommendation. Nothing is built from your answer until the whole grill ends.

### GM-10-OD-09: The server refuses shift dates before today or more than 4 months ahead (OD-09, D64/D147)
**Platforms:** Web + Expo
**What happens today:** New posts, recurring end dates and date edits are refused unless the date is between today and the end of the 4th month ahead, in the pharmacy's time zone. Before, only the screens checked this. (Roster planning is W-01, asked separately.)
**Already implemented:** pr257, `backend/shifts/posting.py:66`, `:228`
**Recommendation:** Keep.
**Other option:** A different window, or past dates allowed for record-keeping.
**Status:** OPEN, confirm or change.

### GM-10-OD-10: Reminder of your own decision: Expo Post shift has no separate draft/publish (OD-10, your D36 (4 Nov))
**Platforms:** Expo only
**What happens today:** Web lets an owner save a draft and publish later (GM-10-Q09). Expo posts straight away. Templates are on Expo now. You decided on 4 Nov that the Shifts, Shift Centre and Post shift redesign (web look plus every web feature) happens in a separate pass at the end.
**Code:** not built yet
**Recommendation:** Keep your D36: do it in the end pass, after the grill.
**Other option:** Build draft/publish on Expo before launch.
**Status:** OPEN, confirm or change.
