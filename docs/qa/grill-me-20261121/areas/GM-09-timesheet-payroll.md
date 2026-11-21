# GM-09 Timesheet / Payroll — Grill Trace (READ-ONLY)

> **Corrections against current code (21 Nov 2026 review).** 8 claims checked at `main` `8ccf8f77` and `pr257` `21add924`; 5 hold, 3 below need the correction shown. Where a question below says otherwise, this table wins. Full evidence: [`../followup/claim-check-2026-11-21.md`](../followup/claim-check-2026-11-21.md).

| Where | Claim in this file | Verdict | Correct statement | Evidence |
|---|---|---|---|---|
| Q1 / Q6 | “No export exists” | WRONG | Expo exports approved or locked timesheet hours to CSV and opens native sharing. This is a client-generated hours export, not wage execution or a server payroll-export endpoint. | `main:frontend_mobile/features/parity/workforce.tsx:192`; `:221`; `pr257:frontend_mobile/features/parity/workforce.tsx:208`; `:235` |
| Q3 | “worker submits their own first” before manager approval | WRONG as a mandatory sequence | Workers can submit only their own timesheets, but manager approval does not require a prior SUBMITTED state. It requires a current revision, no rebuild requirement and no open blockers. | worker-only submission: `main:backend/workforce/timesheet_transitions.py:43`; approval checks: `pr257:backend/workforce/timesheet_transitions.py:58` |
| Q10 / CG-09-09 | open sessions inflate time “instead of blocking” | WRONG | An open session can show estimated minutes, but it also creates an unwaivable missing-clock-out blocker. Do not describe those estimated minutes as silently approvable. | GUARDED: `main:backend/workforce/timesheet_data.py:252`; display estimate: `pr257:backend/workforce/timesheet_data.py:272`; unwaivable source check: `pr257:backend/workforce/timesheet_transitions.py:112` |

**Repo:** chemisttasker11-ezy/ChemistTasker-Ezy1
**Issue:** #250 — "Grill Me — one consolidated backend, web & Expo business-logic sign-off before launch"
**Method:** PR #184 format (each question: ACTUAL TODAY / RECOMMENDED / ALTERNATIVE A "Keep current logic" / ALTERNATIVE B/C / Other-defer)
**Date of trace:** 2026-11-21 (AEST)
**Status: ✅ CURRENT FLOW TRACED** — backend + Vite web traced at head; Expo screens located (contents not read at head); a few details still UNKNOWN (see §6). No code was changed, no PR/issue/comment created, no owner notified.

## Web and Expo today, side by side (pr257 `21add924`)

Source for both web and Expo is `origin/agent/pr257-int` `21add924` (what merges to main). Read-only code check by agy, 21 Nov 2026; every cited file:line was checked to exist at that commit. "Parity question" = a choice for the owner, asked in this area's rounds. "Possible defect (to verify)" = drift that looks unintended; it is confirmed in code before it goes to the engineering backlog, never asked as a question. The Platforms table says which platforms each question applies to.

| Flow | Web (Vite + Next) | Expo | Same? | If different |
|---|---|---|---|---|
| Fortnightly timesheet period generation | Manager opens new fortnightly period and inspects timesheet summaries (`frontend_web/src/features/workforce/TimesheetsPage.tsx:292`). | Manager creates current fortnight period from workforce timesheets screen (`frontend_mobile/app/workforce-timesheets.tsx:500`). | Yes | — |
| Recalculate timesheets from attendance | Recalculate rebuilds timesheets from attendance sessions and approved leave (`frontend_web/src/features/workforce/TimesheetsPage.tsx:44`). | Recalculate button updates timesheets and prompts to sync offline kiosks (`frontend_mobile/app/workforce-timesheets.tsx:367`). | Yes | — |
| Worker reviews and submits hours | Worker reviews worked hours and breaks in My Hours page (`frontend_web/src/features/workforce/MyHoursPage.tsx:20`). | Worker inspects daily entries and submits timesheet in mobile app (`frontend_mobile/app/my-hours.tsx:129`). | Yes | — |
| Manager resolves timesheet checks | Detail drawer reviews blocking checks and records resolutions (`frontend_web/src/features/workforce/TimesheetDetailDrawer.tsx:59`). | Detail screen inspects blocking checks and allows manager decisions (`frontend_mobile/roles/shared/timesheets/TimesheetDetailScreen.tsx:40`). | Yes | — |
| Timesheet time adjustments | Manager adjusts timesheet segment times with adjustment dialog (`frontend_web/src/features/workforce/TimesheetAdjustTimesDialog.tsx:85`). | Manager adjusts timesheet hours with mobile adjustment bottom sheet (`frontend_mobile/roles/shared/timesheets/TimesheetAdjustTimesSheet.tsx:28`). | Yes | — |
| Period lock and payroll handoff | Manager locks approved timesheet period to finalize payroll (`frontend_web/src/features/workforce/TimesheetsPage.tsx:44`). | Manager locks period or reopens locked period for corrections (`frontend_mobile/app/workforce-timesheets.tsx:300`). | Yes | — |
| ChemistTasker payroll toggle | Pharmacy settings toggles ChemistTasker payroll vs external processing (`frontend_web/src/pages/dashboard/sidebar/owner/PharmacySettings.tsx:54`). | Workforce settings toggles ChemistTasker payroll routing (`frontend_mobile/app/workforce-settings.tsx:302`). | Yes | — |

### Platforms per question
| Question id | Platforms |
|---|---|
| Q1 | Web + Expo |
| Q2 | Web + Expo |
| Q3 | Web + Expo |
| Q4 | Web + Expo |
| Q5 | Web + Expo (asked in GM-10: GM-10-Q04) |
| Q6 | Web + Expo |
| Q7 | Web + Expo |
| Q8 | Web + Expo (also covers GM15-33) |
| Q9 | Web + Expo |
| Q10 | Web + Expo |
| GM-09-OD-07 — A worker's correction request notifies the managers | Web + Expo |
| GM-09-OD-08 — May a removed worker still raise a correction on a past timesheet? | Web + Expo |
| GM-09-W01 — Re-grill: overnight deferred payroll activation into a locked period | Web + Expo |

## Bases (exact SHAs verified 2026-11-21)

| Base | SHA / ref | Verified |
|---|---|---|
| PR #249 head (traced) | `97c4543e051b43fe30ec7e2e61ad3d69957a918e` | `pull_request_read` get, 2026-11-21. Open draft, branch `fix/pr248-expo-production-waves-20261104`, 458 commits, 314 files, base `feat/mobile-merge-sdk` (`c98cf2ef74c6de356cceb8dee3a61dad47b6b843`). Unchanged from Issue #250 snapshot. |
| PR #249 body "working head `26cae2d6`" | — | **Resolved:** that is the short SHA of the last *implementation commit listed in the PR body*, not the branch head. Trace at the API head above and record this resolution. Do not re-open it. |
| PR #184 (format source) | `c786a4b8182ebf9b505d47cd81980eb3b9851ce3`, branch `docs/launch-grill-20261020`, draft, 3 commits, 8 files | `questions.json` (142 questions) + `AUDIT.md` (35 gaps) fetched from `refs/pull/184/head`. |
| Issue #250 | open | 26 areas GM-01–GM-26; reuse 142 legacy questions + 30 carried decisions from #184; revalidate against active #249. |

**Rate limit:** no HTTP 429 was encountered in this re-run. GitHub calls were made strictly one at a time with ≥8 s between calls. Every file below was fetched at `refs/pull/249/head` unless marked "search-only (default branch)".

**File note:** the prior GM-09 skeleton lived at this path but the path had become unreachable (visible only via `find -exec cat`; `stat`/`ls`/`touch` all failed with ENOENT). The directory was recreated with `mkdir -p` and this file written fresh at the same path on 2026-11-21. The skeleton's question framework (Q1–Q10) is preserved and completed below; nothing of substance was lost.

## Files verified at head `97c4543e`

| File | Lines | What it proves |
|---|---|---|
| `backend/workforce/timesheet_builder.py` | 318 | Timesheet build from roster + attendance + leave; segments; fingerprint/revision; NEEDS_REVIEW vs READY |
| `backend/workforce/timesheet_transitions.py` | 299 | Submit/approve/reopen/decide-check/comment; lock + manifest; correct-locked-period |
| `backend/workforce/timesheet_checks.py` | 136 | Check catalogue; 5-min tolerances; ROSTER_WITHOUT_ATTENDANCE blocker |
| `backend/workforce/timesheet_data.py` | 370 | Session rows; rejected provisionals excluded; open sessions count to now; append-only corrections |
| `backend/workforce/attendance_edits.py` | 74 | `append_missing_punch` (manager-only, reason required) |
| `backend/workforce/models.py` | 807 | TimesheetPeriod/Timesheet/TimesheetRevision/TimesheetCorrectionRequest/TimesheetManifest models |
| `backend/workforce/views.py` | 972 | Period/timesheet endpoints; payroll-config toggle; **no notify/export/CSV/Xero code at all** |
| `backend/workforce/urls.py` | 63 | Timesheet endpoints; **no CSV/payroll-export endpoint** |
| `backend/workforce/timesheet_serialization.py` | 119 | Timesheet API output — **time only, no money/rate/pay fields** |
| `backend/shifts/payroll.py` | 20 | Only `activation_work_dates` helper — no payroll execution |
| `backend/shifts/engagement.py` | 758 | ABN blocked at accept; TFN deferred; Award terms; overtime flags (GM-12 overlap) |
| `backend/shifts/tasks.py` | 86 | Only `send_shift_reminders` (12h window, hourly) |
| `frontend_web/src/features/workforce/TimesheetsPage.tsx` | 462 | Manager timesheet page: period picker, fortnight open, recalculate, lock, correct |
| `frontend_web/src/features/workforce/` (search-only) | — | `TimesheetDetailDrawer.tsx`, `TimesheetAdjustTimesDialog.tsx`, `TimesheetHealthBanners.tsx`, `MyHoursPage.tsx`, `WorkforceSettingsPage.tsx`, `timesheetDisplay.ts`, `api.ts`, `types.ts` — paths verified, contents NOT read at head |
| `frontend_mobile/app/` (search-only) | — | `workforce-timesheets.tsx`, `my-hours.tsx`, `workforce-settings.tsx` — paths verified, contents NOT read at head |

**Adopted, not re-traced:** GM-01 sessions, GM-02 AHPRA/Verified gates, GM-05 roles, GM-18 identity leak (LA-Q12 STILL VALID), GM-25 structural trace, GM-08 attendance/kiosk (provisional approval backfills Shift/Slot/Assignment; corrections append-only — the attendance→timesheet handover boundary), GM-10 shift rates, GM-12 interest/offers, GM-11 audience/escalation.

## Plain-English summary

A timesheet is the record of what a worker actually worked in a pay period, built from three sources: the roster (what was planned), attendance (clock-in/out, from GM-08), and approved leave. The pharmacy reviews it, the worker submits it, the pharmacy approves it, and then the whole period is **locked** — frozen for payroll. The lock produces a **manifest** (a signed record of what was locked), but the manifest is explicitly a "future payroll/integration boundary": **no payroll execution lives in the code**. There is no money anywhere in the timesheet system — no dollar amounts, no rates, no pay run, no export file, no notification on any state change. The platform can tell a pharmacy *how many minutes* each worker worked; it cannot pay them, and it cannot hand those minutes to a payroll system except by someone reading the screen. That is the single most important finding in GM-09, and it is why Q1 (who pays whom) is still the first question.

---

## §1 — GM-09 traced flow — ACTUAL TODAY (verified at head)

### 1a. Current-flow matrix

| # | Trigger | Actor | Backend / API (verified at 97c4543e) | Vite web | Next web | Expo | Persisted state | Event / side effect | Recovery / denial path |
|---|---|---|---|---|---|---|---|---|---|
| F1 | Shift ends / attendance clock-out (GM-08) → timesheet generated | System (build) + manager (period create) | Period created by manager (`views.py:PharmacyPayrollConfigurationView` area — period create: manager-only, max 31 days, end−start ≤ 30, get_or_create by pharmacy+dates, rebuild queued async via `rebuild_timesheet_period_task`). `build_timesheet` (`timesheet_builder.py`): one Timesheet per worker per TimesheetPeriod (per pharmacy), built from roster rows + attendance sessions + approved leave; segments WORK/LEAVE/BREAK; checks incl. MISSING_EMPLOYMENT_ENGAGEMENT, PENDING_LEAVE, WORK_OVERLAPS_APPROVED_LEAVE (warning; original records unchanged). Snapshot totals: rostered / planned break / contracted / worked / approved leave / reviewed minutes. Leave minutes count only overlap with published roster "in this non-payroll phase". New TimesheetRevision when source fingerprint changed; APPROVED/SUBMITTED rebuilt → REOPENED; blockers → NEEDS_REVIEW; else READY; locked periods cannot be recalculated. `ensure_period_timesheets` creates rows for all workers in period. | Timesheets page: "Open current fortnight" creates a 14-day Mon–Sun period (`TimesheetsPage.tsx:createCurrentFortnight`); "Recalculate" rebuilds from attendance/roster/corrections/leave (feedback: "Sync offline kiosks at the terminal to inc…" — offline kiosk sync exists in UI copy) | NOT FOUND (no workforce/timesheet page searched on Next) | `app/workforce-timesheets.tsx` exists (search-only; contents NOT read) | TimesheetPeriod (OPEN/REVIEW/APPROVED/LOCKED) + Timesheet + TimesheetRevision | None (no notification on build) | Period >31 days refused; rebuild of a locked period refused |
| F2 | Worker submits / confirms hours | Worker (own only) | `submit` (`timesheet_transitions.py`): worker, own only, revision must match, no rebuild needed → SUBMITTED. **No reject state, no auto-approval, no deadline, no notification in this file.** | Worker view is `MyHoursPage.tsx` (contents NOT read at head) | NOT FOUND | `app/my-hours.tsx` exists (search-only) | Timesheet SUBMITTED | None | Wrong revision → refused (must recalculate first); someone else's timesheet → denied |
| F3 | Pharmacy approves / rejects / corrects hours | Manager (`require_manage_pharmacy`) | `approve` (`timesheet_transitions.py`): manager, revision must match, blocked by open BLOCKER checks or needs-rebuild → APPROVED, `reviewed_minutes = revision.worked_minutes`. `reopen` (reason required, manager) → REOPENED. `decide_check` (resolve/waive/reopen, reason required; **MISSING_CLOCK_IN / MISSING_CLOCK_OUT / UNRESOLVED_PROVISIONAL_ATTENDANCE cannot be waived — must be corrected at attendance source**). `add_comment` (worker_visible). **No reject state.** | Timesheet cards show worked/rostered/contracted/leave/reviewed hours, blocking vs warning pills, comments count, "Needs recalculating" pill; detail drawer (`TimesheetDetailDrawer.tsx`, contents NOT read) handles approve/reopen/check decisions; `TimesheetAdjustTimesDialog.tsx` exists (contents NOT read) | NOT FOUND | Timesheet screens exist (search-only) | Timesheet APPROVED / REOPENED; check decisions; comments | None (no notification on approve/reopen/comment) | Open BLOCKER or stale revision → approve refused; unwaivable checks must be fixed at the attendance source (GM-08) |
| F4 | Rate applied: base / overtime / weekend / public-holiday premium | — (nobody) | **No rate is applied anywhere in the timesheet code.** `timesheet_serialization.py` has NO money/rate/pay fields — timesheets show time (minutes/hours) only. Rates live in GM-10 (`pricing.py` segmented rates; `engagement.py:_build_tfn_award_terms` Award floor at accept; >12h shift → payroll review required; pre-7am weekday/Saturday → overtime review required — **overtime NOT auto-computed, flags review only**). `models.py`: `rostered_minutes` help_text "Gross roster span; not payroll-authoritative." | Page subtitle: "Compare rostered with worked hours, clear exceptions, approve each timesheet and lock the period." — hours only, no money shown | NOT FOUND | NOT READ | Minutes only | None | N/A — there is no pay figure to dispute yet |
| F5 | Payroll run / export (CSV / Xero / MYOB / other) | — (nobody) | **No payroll run and no export exist.** `lock_period` (`timesheet_transitions.py`): ALL timesheets must be APPROVED; builds payroll manifest — PAYROLL assignments → `payroll_export`, INVOICE → invoice list, TIMESHEET_ONLY stays in audit snapshot only; manifest hash covers payroll content only. `TimesheetManifest` docstring: "Future payroll/integration boundary. **No payroll execution lives here.**" `backend/shifts/payroll.py` is 20 lines: only an `activation_work_dates` helper. **No CSV export endpoint, no payroll export endpoint in `workforce/urls.py`. No notify/email/export/CSV/Xero code anywhere in `workforce/views.py` (972 lines).** `PharmacyPayrollConfigurationView`: `use_chemisttasker_payroll` toggle (PATCH, manager-only); when disabled the text states "Roster, attendance and timesheets continue and can be handed to the pharmacy's own payroll system"; ABN assignees routed to invoicing. | Lock dialog: "Locked time is frozen for payroll. To change it later you'll need to correct the period, which keeps this locked record for audit." Lock feedback shows a manifest hash prefix ("Period locked. Record {hash}… saved for audit."). **No export/download button anywhere on the page.** | NOT FOUND | NOT READ | Period LOCKED + TimesheetManifest (+ adjustment manifest on re-lock) | Manifest hash recorded | Lock refused unless ALL timesheets APPROVED |
| F6 | ABN / TFN collected, validated, stored | Worker at offer accept (not in timesheets) | `engagement.py:_external_payment_profile`: ABN path **RAISES if ABN missing/unverified/entity-unconfirmed** (ABN workers ARE blocked at accept); TFN path does NOT block — readiness computed, `payroll_ready=False` → settlement TIMESHEET_ONLY, "TFN/super setup may be completed after shift acceptance". `validate_tfn_payroll_profile` requires TFN + super fund name/USI/member number. `worker_payment_profile_status` exists (safe summary, no secret identifiers). Storage/encryption/visibility of TFN/ABN values was NOT traced in this area (GM-26 privacy; GM-02 onboarding). | Not shown on the timesheet page (no pay fields) | NOT FOUND | NOT READ | Engagement terms snapshot on the offer (settlement channel, payment preference) | ABN worker blocked at accept; TFN worker deferred | ABN missing/unverified → accept refused |
| F7 | Payment: who pays whom, when, by what rail | — (undecided; no code) | **No payment rail exists in the traced code.** The fee schedule ($30/shift filled, $80/job, $30/mo owner subscription, 50% off fees) describes platform fees only (GM-16); it does not state the wage rail. `BILLING_LIVE_SHIFT_FULFILLMENT_ENABLED` defaults False, `BILLING_LIVE_SHIFT_PENALTY_ENABLED` defaults False (`settings.py`). Whether the platform ever moves wages, and by what rail, is Q1 — still open. | No pay status shown (time only) | NOT FOUND | NOT READ | None | None | N/A |
| F8 | Hours/pay dispute raised, escalated, resolved | Worker / manager (informal only) | **No dispute state machine exists.** `TimesheetCorrectionRequest` model EXISTS (`models.py`: Kind GENERAL/MISSING_PUNCH/ROSTER_MISMATCH/BREAK/LEAVE/OTHER; Status OPEN/RESOLVED/DECLINED; `manager_response`) — **but NO API endpoint references it** (no view/URL in workforce views/urls/transitions) — model-only, unreachable via API (code gap CG-09-01). What exists instead: `decide_check` (resolve/waive/reopen with reason), `add_comment` (worker_visible), `reopen` (reason required), and `correct_locked_period` (reason required — see F9). No resolver role, no timeline, no payment hold (there is no payment to hold). Links to GM-15 (cancellation/disputes/ratings). | Comments shown as a count pill on the timesheet card; health banners (`TimesheetHealthBanners.tsx`) summarise issues | NOT FOUND | NOT READ | Check decisions, comments | None (no notification on comment/decision) | Unwaivable checks must be corrected at the attendance source |
| F9 | Correction after approval / after payment | Manager | `correct_locked_period` (`timesheet_transitions.py`): reason required, returns period to OPEN, re-lock creates an **adjustment manifest naming superseded content**. Before lock: `reopen` (reason required) → REOPENED; rebuild creates a new revision when the fingerprint changed. Corrections to attendance itself are append-only (`attendance_edits.py:append_missing_punch` — manager-only, reason required, future times refused, must be within period ±1 day, ordering enforced, refuses if that event type already exists: "Correct the existing event instead"; GM-08 boundary). `timesheet_data.py`: corrections via effective timeline (append-only); rejected provisional sessions EXCLUDED from payable time ("Rejected hours are not payable; raw evidence stays in attendance for audit"). | "Correct period" button (locked periods only) with required reason; feedback: "Period reopened for correction. Fix the affected timesheets, approve them and lock the period again." | NOT FOUND | NOT READ | Period OPEN again + adjustment manifest on re-lock | Locked record kept for audit | No correction path after payment exists, because no payment exists |
| F10 | Notifications on each state change (worker / pharmacy / admin) | — (nobody) | **There are no notifications.** No notify/email/push calls in `timesheet_builder.py`, `timesheet_transitions.py`, `views.py`, or `tasks.py` for any timesheet event (build, submit, approve, reopen, lock, correct, comment, check decision). The only workforce task is `send_shift_reminders` (12h window, hourly beat — shift reminders, not timesheets). | No notification UI for timesheet events traced | NOT FOUND | NOT READ | None | None | N/A |

### 1b. The attendance → timesheet handover (GM-08 boundary)

- **Source of truth:** attendance sessions (GM-08) + roster rows + approved leave. `timesheet_data.py:_session_rows` — rejected provisional sessions are EXCLUDED from payable time; raw evidence stays in attendance for audit.
- **Open sessions:** an open session (no clock-out) counts worked minutes up to `min(now, period end)`, with metadata `open_session: true` — i.e. an un-closed session inflates worked time up to "now" rather than blocking the timesheet.
- **Breaks:** BREAK segments are excluded from worked minutes; unmatched break start/end = WARNING.
- **Who gets a row:** `_worker_ids_for_period` — members + rostered + attendance + leave. A worker with attendance but no membership still gets a timesheet row.
- **Checks (tolerances 5 min — start/finish/duration/break):** WORK_WITHOUT_ROSTER (WARNING), START/FINISH/DURATION/BREAK_DIFFERS_FROM_ROSTER (WARNING), **ROSTER_WITHOUT_ATTENDANCE (BLOCKER — a rostered shift with no attendance session or approved leave blocks approval)**. Consequence: a kiosk offline / missed punch blocks the whole timesheet until the attendance is corrected at source (GM-08 `append_missing_punch`, manager-only, reason required).
- **GM-08 handover (adopted):** provisional approval backfills Shift/Slot/Assignment; corrections append-only.

### 1c. Old-question mapping (from #184)

GM-09 has almost no direct #184 material. The closest old questions, and their status now:

| Old ID | Question | Status at head |
|---|---|---|
| CX-Q32 | What marks a shift complete? | **PARTLY** — completion is attendance-driven (GM-08) + period lock; no single "shift complete" flag was traced in the timesheet code. GM-15 territory for the booking side. |
| CX-Q33 | How are disputed hours settled? | **CHANGED** — no dispute state machine exists; the reachable tools are check decisions (resolve/waive/reopen + reason), comments, reopen, and correct-locked-period. The `TimesheetCorrectionRequest` model exists but is unreachable via API (CG-09-01). |
| CX-R01 | Early finishes / extra hours paid? | **PARTLY** — extra hours are visible as DURATION_DIFFERS_FROM_ROSTER (WARNING) and open sessions count to now; whether extra hours are *paid* is undecidable — there is no pay figure (Q5). |
| ON-Q04 | Pay-readiness (ABN/TFN) | **ANSWERED** — ABN blocked at accept; TFN deferred to TIMESHEET_ONLY (GM-09-Q7, GM-12-Q04). |
| PO-R01 | Award checks before posting | **PARTLY** — Award rates computed in GM-10 pricing; floor enforced at accept, not at posting; overtime flagged for payroll review only. |
| SH-10 | Ratings after approved timesheet / clock-out only | **PARTLY** — the approval state exists (Timesheet APPROVED; `reviewed_minutes` set); whether ratings are gated on it is GM-15 territory, not traced here. |

---

## §2 — How to read the question queue (§3)

- Each question follows the #184 format: **ACTUAL TODAY** (plain English first, traced at head), **RECOMMENDED** (with rationale/severity/benefits/risks), **ALTERNATIVE A — Keep current logic**, **ALTERNATIVE B/C** with concrete scenarios, plus **Other / defer**. Normal/edge/retry/denied/payment/Web-Expo cases are noted per question.
- **"Keep current logic" means what the code does today** — and for GM-09 that often means "nothing exists yet" (no pay run, no export, no notifications, no dispute flow). Keeping it is a real option with real consequences, not a placeholder.
- **Decision status values:** `VALIDATED` (traced at head) · `PARTLY` (one half traced) · `NOT RE-VALIDATED` (Oct 2026 only — none below; every question here is grounded in current code). No question is OWNER DECIDED.

---

## §3 — GM-09 question queue (VALIDATED at 97c4543e)

### Q1 — Who pays whom, and when? (payment ownership — ASK FIRST, see §4)
- **Plain English:** When a locum finishes a shift, who actually sends the worker their pay — ChemistTasker, or the pharmacy directly? And when — same day, weekly, fortnightly? What does the platform take, and from whom?
- **ACTUAL TODAY:** **Nobody pays anybody in the traced code.** Timesheets carry minutes only (no money fields); the lock produces a manifest that is explicitly a "future payroll/integration boundary" with "no payroll execution"; there is no pay run, no payout rail, no export. The fee schedule ($30/shift filled, $80/job, $30/mo owner subscription, 50% off fees) describes platform fees only; it does not state the wage rail. The `use_chemisttasker_payroll` toggle exists, but when it is off the UI says timesheets "can be handed to the pharmacy's own payroll system" — and there is no export to hand them over with. `BILLING_LIVE_SHIFT_FULFILLMENT_ENABLED` defaults False.
- **RECOMMENDED (unchanged from provisional):** Decide this before any other GM-09 question — every later answer (approval, export, ABN/TFN, disputes) depends on it. Severity: **launch-gating**.
- **ALTERNATIVE A — Pharmacy pays worker directly; platform charges its fee separately:** Pharmacy and worker settle wages off-platform (or via platform invoice as a pass-through record only). *Scenario:* a Saturday locum shift at $70/hr × 8 hrs = $560 wages pharmacy→worker; ChemistTasker charges the pharmacy $30 (or $15 on subscription). *Trade-offs:* simplest legally (platform is a marketplace, not employer/payer); but the platform cannot guarantee the worker gets paid, cannot enforce approval deadlines, and disputes become "he said / she said" with no money held. **This is the closest to what the code supports today** — the platform already computes the minutes and freezes them; the money moves elsewhere.
- **ALTERNATIVE B — Platform collects from pharmacy, then pays worker (platform as payer/escrow):** Pharmacy funds the shift (card / invoice) at confirmation; platform releases pay to the worker after approved timesheet. *Scenario:* same $560 shift; pharmacy pre-authorised at booking; worker paid Tuesday after Monday approval. *Trade-offs:* worker trust and dispute leverage are much stronger; but the platform holds other people's money (trust-account / AFSL / tax / reconciliation duties), needs payout rails, and bears failed-payment and refund complexity. **Nothing in the traced code supports this today** — it is a build, not a switch.
- **ALTERNATIVE C — Platform invoices pharmacy for wages + fee as one bill, worker paid by pharmacy on platform-generated payroll instruction:** Hybrid: platform computes and instructs, pharmacy executes. *Scenario:* platform issues a single $590 invoice; pharmacy pays worker $560 and platform $30 in one settlement run. *Trade-offs:* one bill is tidy for the pharmacy; but if the pharmacy pays late, the worker still waits and the platform has no lever. **Also a build** — the manifest exists, but there is no invoice generation from it in the traced code (GM-17).
- **Other / defer:** Deferring = launch without a stated payer. That is not a neutral option: workers will assume the platform pays them and pharmacies will assume the opposite. Record as deferred only with an explicit launch risk accepted by the owner.
- **Checks:** normal case (approved timesheet → payment — today there is no payment to trigger), edge (partial hours, no-show, late approval), retry/concurrency (double-pay on double-submit — no pay path to double), denied role / wrong tenant (pharmacy A approving pharmacy B's timesheet — approve requires `require_manage_pharmacy` for that pharmacy), payment/notification side effects (none exist), Web vs Expo difference (no pay status is shown on either client — time only).

### Q2 — How is a timesheet created, and from what source of truth?
- **Plain English:** After a shift, does the timesheet appear automatically from clock-in/out (GM-08 kiosk/attendance), from the booked shift times, or does someone type the hours in by hand?
- **ACTUAL TODAY:** Auto-built from roster + attendance + leave (`timesheet_builder.py`); one Timesheet per worker per TimesheetPeriod. Segments WORK/LEAVE/BREAK. A new TimesheetRevision is created when the source fingerprint changes; APPROVED/SUBMITTED timesheets rebuilt → REOPENED. Leave minutes count only overlap with published roster. A worker with attendance but no membership still gets a row. **Nobody types hours in by hand** — there is no manual hours entry in the traced code; corrections happen at the attendance source (append-only missing punch) or via check decisions.
- **RECOMMENDED:** Keep auto-generation from attendance where it exists; booked times as fallback is NOT what the code does — the code uses roster + attendance + leave, and a rostered shift with no attendance is a BLOCKER, not a fallback. Confirm that as the rule, and add a manual-entry path only with an audit note if the owner wants one. Severity: HIGH.
- **ALTERNATIVE A — Keep current logic:** auto-built from roster + attendance + leave; ROSTER_WITHOUT_ATTENDANCE blocks approval. *Scenario:* kiosk offline, worker did work, no attendance — timesheet sits NEEDS_REVIEW until a manager appends the missing punch with a reason. Trade-off: accurate; slow when the kiosk fails.
- **ALTERNATIVE B — Booked times are the timesheet; attendance is advisory only:** *Scenario:* locum booked 9–5, stayed till 5:30, kiosk shows 5:32 — paid to 5:00 unless pharmacy approves extra. Simple, predictable; risks underpaying real overtime and discouraging staying late. **This is NOT current logic** — it would be a change to the builder.
- **ALTERNATIVE C — Worker-entered hours, pharmacy-confirmed:** *Scenario:* worker submits 9:00–5:30 in Expo on the drive home; pharmacy taps approve. Flexible; risks inflated hours and slow approvals. **This is NOT current logic** — no manual entry exists.
- **Other / defer:** —
- **Checks:** normal/edge (no clock-out — open session counts to now; kiosk offline — BLOCKER; shift overruns midnight — segments handle it; split breaks — unmatched break = WARNING), retry/concurrency (rebuild is fingerprint-gated; double generation creates a revision, not a duplicate), denied role/wrong tenant (period create/recalculate are manager-only), notification side effects (none), Web vs Expo difference (manager page traced on web; Expo screen contents NOT read).

### Q3 — Who approves a timesheet, by when, and what happens if nobody does?
- **Plain English:** Does the pharmacy have to tap "approve" before anyone gets paid, and is there a deadline after which hours are auto-approved — or can a timesheet sit forever?
- **ACTUAL TODAY:** The pharmacy (manager, `require_manage_pharmacy`) must approve each timesheet; the worker submits their own first (SUBMITTED). **There is no deadline, no auto-approval, and no escalation.** A timesheet can sit in OPEN / NEEDS_REVIEW / READY / SUBMITTED forever. Approval is blocked by open BLOCKER checks or a stale revision. There is no reject state — the only "no" is reopening it or resolving/waiving checks with a reason. **No notification is sent on submit, approve, or reopen** — nobody is told a timesheet is waiting.
- **RECOMMENDED:** Named approver per pharmacy + a fixed approval window (e.g. 48 hours) after which the timesheet auto-approves with notice, so workers are never left unpaid by silence. Severity: HIGH (cash-flow trust) — and note the dependency: auto-approval only matters once Q1 creates a payment that approval gates.
- **ALTERNATIVE A — Keep current logic:** manual approval, no deadline, no auto-approval, no notifications. *Scenario:* pharmacy owner on leave, locum waits 10 days with no notice to anyone. Trade-off: protects pharmacies from paying wrong hours; destroys worker trust and creates support load.
- **ALTERNATIVE B — No auto-approval; unpaid until a human approves:** Same as A in practice (A already has no auto-approval); the difference is stating it as policy with a named approver and a visible "waiting" state. *Scenario:* same as A, but the worker can see who is holding it up.
- **ALTERNATIVE C — Auto-approve at the booked hours only; extra hours need approval:** *Scenario:* 9–5 booked auto-pays; the extra 30 min waits for approval. Middle ground; needs clear split in the UI — and a pay figure, which does not exist yet (Q5).
- **Other / defer:** —
- **Checks:** approver on leave / role change, pharmacy with several branches (which approver?), concurrent approve + correct (revision-must-match guards it), wrong-tenant approval attempt (denied by `require_manage_pharmacy`), reminders/notifications (none exist — a reminder would be new build), Web vs Expo difference (approve UI traced on web detail drawer path only; Expo NOT read).

### Q4 — How are corrections handled before and after approval?
- **Plain English:** If the hours are wrong, who can fix them, when, and does the worker get told? What if the mistake is found after the money has already gone out?
- **ACTUAL TODAY:** Before lock: manager reopens with a reason (→ REOPENED); rebuild creates a new revision when the fingerprint changes; check decisions resolve/waive/reopen with a reason — but MISSING_CLOCK_IN / MISSING_CLOCK_OUT / UNRESOLVED_PROVISIONAL_ATTENDANCE **cannot be waived** and must be corrected at the attendance source (append-only missing punch, manager-only, reason required, future times refused, within period ±1 day). After lock: `correct_locked_period` (reason required) returns the period to OPEN; re-lock creates an adjustment manifest naming superseded content; the locked record is kept for audit. **Nobody is notified at any step.** After payment: there is no payment, so no post-payment correction path exists. The `TimesheetCorrectionRequest` model (worker-raised correction requests) exists but has **no API endpoint — unreachable** (CG-09-01).
- **RECOMMENDED:** Keep the append-only + reason-required + adjustment-manifest shape; wire up the correction-request model (or delete it) so workers can raise corrections in-app; notify both sides on every correction; post-payment corrections become a credit/debit on the next run, never a silent edit — once Q1 creates a payment. Severity: HIGH (audit + Fair Work record-keeping).
- **ALTERNATIVE A — Keep current logic:** manager-only corrections, reason required, append-only, adjustment manifest on re-lock, no notifications, correction-request model unreachable. *Scenario:* worker flags 30 min missing by comment; manager appends the missing punch with a reason. Trade-off: auditable; slow and invisible to the worker (no notification).
- **ALTERNATIVE B — Only the pharmacy can correct, worker can only dispute:** *Scenario:* worker raises a correction request (once wired); pharmacy edits or rejects with a reason. Clean audit; slow if the pharmacy is unresponsive.
- **ALTERNATIVE C — Either side can correct before approval; after approval only admin can:** *Scenario:* typo fixed freely on day one; after payday only platform admin can adjust. Flexible early, controlled late; needs an admin path that exists (it does not today).
- **Other / defer:** —
- **Checks:** correction during a dispute, correction after export to payroll (no export exists), concurrent corrections by both sides (revision-must-match guards approve; attendance ordering guards punches), denied role, notification side effects (none), Web vs Expo difference (correction UI traced on web only).

### Q5 — Which rate applies: base, overtime, weekend and public-holiday premiums?

> **Merged 22 Nov: asked once, as GM-10-Q04 in GM-10.** Answer it there; this copy stays for its own evidence and is not asked again.
- **Plain English:** Is the worker paid one flat hourly rate, or more for nights, Saturdays, Sundays and public holidays — and who sets those rates, the worker, the pharmacy, or the Award?
- **ACTUAL TODAY:** **No rate is applied in the timesheet system at all** — timesheets show minutes only; there is no dollar figure to apply a premium to. Rates live upstream: GM-10 `pricing.py` segments shifts by day type (weekday/Saturday/Sunday/public holiday) and time window (early-morning/late-night) using Award windows from 1 July 2026 Schedule B; `engagement.py` enforces the Award floor at accept for pharmacists and flags >12h shifts and pre-7am weekday/Saturday shifts for payroll review — **overtime is NOT auto-computed, it only flags review**. What the worker is actually paid per minute is therefore undecided in code, not just in policy.
- **RECOMMENDED:** Rate agreed at shift posting/acceptance is the contract; premiums, if any, are explicit line items on the timesheet (not silently folded in), so both sides can see the maths — once Q1 creates a payment and the timesheet gains money fields. Severity: HIGH (underpayment risk).
- **ALTERNATIVE A — Keep current logic:** no rate on the timesheet; rates upstream only. *Scenario:* a Sunday shift is worked; the timesheet shows 8 hours; nobody can see what those hours are worth. Trade-off: zero build; the timesheet cannot answer the only question the worker cares about.
- **ALTERNATIVE B — Single flat rate, no premiums, set per shift:** *Scenario:* Sunday shift posted at $85/hr flat. Simple and transparent; may underpay vs the Pharmacy Industry Award and deter weekend cover.
- **ALTERNATIVE C — Award-based premiums computed automatically:** *Scenario:* base $60, Saturday ×1.25, Sunday ×1.5, public holiday ×2.5, overtime after 8 hrs. Fairest; needs correct Award interpretation (GM-14, qualified advice) and correct day/timezone handling.
- **Other / defer:** —
- **Checks:** shift crossing midnight / into a public holiday (pricing segments per day upstream; timesheet has no money to segment), daylight-saving change, rounding (15-min blocks vs exact minutes — tolerances are 5 min on checks; rounding rule for pay is undecided), rate changed after acceptance (frozen terms keep old values — GM-10-Q06), Web vs Expo difference (does Expo show the rate breakdown? — no money fields on either client today).
- **Decide jointly with GM-10-Q03/Q04 (rate rule + loadings) and GM-14 (Award).**

### Q6 — What does the payroll export contain, and where does it go?
- **Plain English:** Can a pharmacy (or the platform) download the week's timesheets as a file for their payroll system — and in what format, with whose details in it?
- **ACTUAL TODAY:** **No export exists.** No CSV export endpoint, no payroll export endpoint in `workforce/urls.py`; no export/download button on the manager timesheet page; no CSV/Xero/MYOB code anywhere in `workforce/views.py`. The lock manifest exists (`payroll_export` for PAYROLL assignments, invoice list for INVOICE, audit snapshot only for TIMESHEET_ONLY) but the manifest is a "future payroll/integration boundary" — nothing consumes it. The only way to get hours out of the system today is to read them off the screen. (PR #249 commit `d15304b0` "fail-closed selected-pharmacy shift and payroll filters" is a lead, not a finding — the commit itself was not read.)
- **RECOMMENDED:** CSV export as the minimum (one row per worker per shift, with hours, rate, premiums, totals, ABN/TFN status flag), scoped to the pharmacy's own data only; accounting integrations deferred until Q1 is decided. Severity: MEDIUM-HIGH.
- **ALTERNATIVE A — Keep current logic:** no export; hours are read off the screen. *Scenario:* a pharmacy with 12 locums re-types a fortnight of hours into MYOB by hand. Trade-off: zero build; error-prone, unscalable, and the `use_chemisttasker_payroll` toggle's promise ("handed to the pharmacy's own payroll system") cannot be kept.
- **ALTERNATIVE B — No export; payroll is done entirely inside ChemistTasker:** *Scenario:* pharmacy approves in-app and the platform pays (ties to Q1-B). Cleanest for the user; biggest build and compliance load.
- **ALTERNATIVE C — Export plus Xero/MYOB integration:** *Scenario:* approved timesheets push straight into Xero pay runs. Best for larger groups (e.g. Chempro); integration cost and credential handling.
- **Other / defer:** —
- **Checks:** export of unapproved timesheets (lock requires ALL approved — the manifest is the natural export boundary), re-export after correction (adjustment manifest exists), wrong-tenant export (pharmacy A exporting pharmacy B's staff — the period is per-pharmacy; access control to be enforced), PII in the file, Web vs Expo difference (export on mobile? — no export anywhere today).

### Q7 — ABN and TFN: what is collected, from whom, and how is it stored?
- **Plain English:** Does a locum need to give an ABN (contractor) or a TFN (employee), and where does that sensitive number live — and who can see it?
- **ACTUAL TODAY:** Collected/checked at offer acceptance, not in the timesheet flow (`engagement.py`): ABN path RAISES if ABN missing/unverified/entity-unconfirmed — ABN workers ARE blocked at accept. TFN path does NOT block — readiness computed, `payroll_ready=False` → settlement TIMESHEET_ONLY, "TFN/super setup may be completed after shift acceptance". `validate_tfn_payroll_profile` requires TFN + super fund name/USI/member number. `worker_payment_profile_status` returns a safe summary with no secret identifiers. **Storage/encryption/visibility of the TFN/ABN values themselves was NOT traced in this area** (GM-26 privacy; GM-02 onboarding). The timesheet shows no ABN/TFN status flag.
- **RECOMMENDED:** Collect the minimum the chosen payment/employment model needs, validate format at entry, store encrypted with strict role access (worker + their pharmacy's payroll approver + admin only), never in exports by default, and get qualified tax advice before launch. Severity: **launch-gating** (privacy + tax).
- **ALTERNATIVE A — Keep current logic:** ABN blocked at accept; TFN deferred; no status flag on the timesheet. *Scenario:* a TFN worker is booked, works, and only learns at payroll time that their super details were never completed. Trade-off: fastest booking; payroll stalls later.
- **ALTERNATIVE B — ABN-only, all locums treated as contractors:** *Scenario:* worker supplies ABN, invoices via the platform, no TFN, no PAYG. Simple; wrong if the working arrangement is really employment (sham-contracting risk, GM-14).
- **ALTERNATIVE C — TFN declaration for employed locums, ABN for genuine contractors, model chosen per engagement:** *Scenario:* regular weekly locum on TFN/PAYG; one-off cover on ABN. Matches reality; doubles the payroll paths and the advice needed.
- **Other / defer:** —
- **Checks:** worker with neither ABN nor TFN (ABN path raises; TFN path defers — asymmetric, see Q4/GM-12-Q04), expired/invalid ABN, TFN visible to the wrong pharmacy, data breach / retention, Web vs Expo difference (pay-readiness is not surfaced on either client today).
- **Decide jointly with GM-09-Q01 (payer model), GM-14 (employment status) and GM-26 (privacy/retention).**

### Q8 — How does a worker or pharmacy dispute hours or pay, and who decides?

> **Also covers (22 Nov):** GM15-33 (GM-15). Asked once, here.
- **Plain English:** If the worker says "I worked 8 hours, you paid 7", what button do they press, who looks at it, and how long until there is an answer — and does payment pause while it is argued?
- **ACTUAL TODAY:** **There is no dispute flow.** No dispute state, no dispute endpoint, no resolver role, no timeline, no payment hold (there is no payment to hold). What exists: comments on a timesheet (`add_comment`, worker_visible), check decisions (resolve/waive/reopen + reason), reopen (reason required), correct-locked-period (reason required), and the attendance evidence (raw sessions kept for audit; rejected provisionals excluded from payable time). The `TimesheetCorrectionRequest` model (worker-raised correction requests with manager response) exists but is **unreachable via API**. Links to GM-15 (cancellation/disputes/ratings).
- **RECOMMENDED:** In-app dispute on the timesheet itself (not email/chat), with the attendance record attached automatically, a named resolver (pharmacy first, platform admin on escalation), a stated response time, and disputed amounts held while undisputed amounts still pay — once Q1 creates a payment to hold. Severity: HIGH.
- **ALTERNATIVE A — Keep current logic:** comments + check decisions + reopen; no formal dispute. *Scenario:* worker comments "I stayed 30 min late"; manager resolves the DURATION_DIFFERS check or appends a missing punch. Trade-off: auditable pieces exist; no deadline, no escalation, no hold, and ratings (GM-15) become the only leverage.
- **ALTERNATIVE B — Dispute = chat message to the pharmacy, no formal state:** *Scenario:* worker messages "I stayed late"; pharmacy replies in Hub chat. Fast to build; no record, no deadline, no escalation, and ratings (GM-15) become the only leverage.
- **ALTERNATIVE C — Formal dispute with payment held in full until resolved:** *Scenario:* $560 held while 30 min ($35) is argued. Strong leverage for the worker; punishes the worker for the undisputed $525 and invites tactical disputes. (Only meaningful once Q1-B/C creates a payment.)
- **Other / defer:** —
- **Checks:** dispute after payment (no payment exists; post-payment correction would be a credit/debit — Q4), dispute by a pharmacy against a worker (no-show / early departure — see Q10), concurrent dispute + correction, retaliation via ratings (GM-15), notification side effects (none exist), Web vs Expo difference (comments exist on web; Expo NOT read).

### Q9 — What records are kept, for how long, and who can see a worker's pay history?
- **Plain English:** Can a worker see every shift they have ever been paid for, can a pharmacy see only its own staff, and how long does the platform keep these records?
- **ACTUAL TODAY:** Workers see their own timesheets via My Hours (`MyHoursView`: own timesheets, latest 100, filterable by pharmacy/period — web `MyHoursPage.tsx`, Expo `app/my-hours.tsx`, contents NOT read). Pharmacies see only their own periods (periods are per-pharmacy; approve requires `require_manage_pharmacy`). **There is no pay history to see** — timesheets show minutes, not money. Retention: no retention/deletion rule was traced in the timesheet code (GM-26 territory). The locked manifest + adjustment manifests are kept for audit (correct-locked-period keeps the superseded record). Admin access / audit logging of reads was not traced.
- **RECOMMENDED:** Worker sees their own full history; pharmacy sees only its own shifts; admin sees all with audit logging; retain per Australian record-keeping requirements (seek qualified advice; do not guess a number here). Severity: MEDIUM-HIGH.
- **ALTERNATIVE A — Keep current logic:** worker sees own minutes (latest 100); pharmacy sees own periods; manifest kept for audit; no retention rule stated. *Scenario:* a worker needs last year's shifts for tax — the screen shows minutes, not pay, and only the latest 100 rows. Trade-off: works for the current fortnight; useless as a pay record.
- **ALTERNATIVE B — Pharmacy sees only current pay period; history is admin-only:** *Scenario:* owner cannot pull last quarter without asking support. Reduces exposure; creates support load and hurts multi-branch reconciliation.
- **ALTERNATIVE C — Full history for both sides, exportable:** *Scenario:* worker downloads their year's shifts for tax. Most useful; highest PII exposure if access control fails. (Needs Q6 export + Q1 payment first.)
- **Other / defer:** —
- **Checks:** worker who worked at two pharmacies (separation — periods are per-pharmacy; My Hours filters by pharmacy), ex-employee access, deleted account, Web vs Expo difference (My Hours exists on both; contents NOT read on either).
- **Decide jointly with GM-14/GM-26 (record-keeping law, retention).**

### Q10 — What happens on the failure paths: no-show, early departure, shift cancelled mid-way, kiosk offline?
- **Plain English:** If the worker never turns up, leaves early, or the kiosk was down so there is no clock-out — is there still a timesheet, and is anything paid?
- **ACTUAL TODAY:** Every booked shift produces a timesheet state — including "no attendance recorded" — because a Timesheet row is created per worker per period and ROSTER_WITHOUT_ATTENDANCE is a BLOCKER, not an absence. Concretely: **no-show** → rostered shift with no attendance session → BLOCKER, timesheet cannot be approved until the attendance is corrected at source (or the roster is corrected). **Early departure** → FINISH_DIFFERS_FROM_ROSTER (WARNING) / DURATION_DIFFERS (WARNING); approval can proceed with the warning resolved/waived. **Kiosk offline / no clock-out** → open session counts worked minutes up to `min(now, period end)` with `open_session: true` (inflates, does not block); or MISSING_CLOCK_OUT (BLOCKER, unwaivable — must be corrected at source). **Shift cancelled mid-way** → no cancelled state in the timesheet code (GM-15 territory). **Nothing is paid on any path** — there is no payment (Q1).
- **RECOMMENDED:** Keep "every booked shift produces a timesheet state — including 'no attendance recorded' — so nothing silently vanishes; $0 timesheets for no-shows are explicit and visible, not absent." Add the missing pieces: a no-show flag (not just a blocker), and a rule for open sessions (cap at rostered end, not "now"). Severity: MEDIUM-HIGH.
- **ALTERNATIVE A — Keep current logic:** BLOCKER for no attendance; WARNING for early finish; open session counts to now. *Scenario:* kiosk offline, worker did work, timesheet blocked until a manager appends the missing punch with a reason. Trade-off: accurate; the worker waits and the manager does the work.
- **ALTERNATIVE B — No attendance, no timesheet:** *Scenario:* kiosk offline, worker did work, nothing to approve, worker must chase by chat. Simplest code; worst outcome for the worker. **This is NOT current logic.**
- **ALTERNATIVE C — Booked hours paid unless the pharmacy flags non-attendance within 24 hours:** *Scenario:* kiosk down, worker paid booked hours, pharmacy can dispute. Protects the worker; risks paying no-shows if the pharmacy is slow. (Only meaningful once Q1 creates a payment.)
- **Other / defer:** —
- **Checks:** partial attendance, duplicate clock-outs (attendance ordering guards), timezone/DST (untraced — GM-10-Q05), retry after offline sync (recalculate rebuilds from attendance received; UI copy mentions syncing offline kiosks), denied role, notification side effects (none), Web vs Expo difference (failure states shown on web cards as blocking/warning pills; Expo NOT read).
- **Links:** GM-08 (attendance source of truth), GM-15 (cancellation).

---

## §4 — SINGLE first decision question to ask the owner

**Q1 — Who pays whom, and when?**

> "When a locum finishes a shift, who actually sends the worker their pay — ChemistTasker, or the pharmacy directly? And when — same day, weekly, fortnightly?"

**Options (from Q1 above):**
- **A — Pharmacy pays the worker directly; ChemistTasker charges its fee ($30/shift or $80/job; $30/mo subscription, 50% off fees) separately.** Simplest legally; platform cannot guarantee payment. **This is the closest to what the code supports today.**
- **B — ChemistTasker collects from the pharmacy and pays the worker after the approved timesheet.** Strongest worker trust and dispute leverage; platform holds other people's money (trust-account, tax, reconciliation duties). **Nothing in the traced code supports this today — it is a build, not a switch.**
- **C — ChemistTasker invoices the pharmacy once for wages + fee; the pharmacy executes payment on the platform's instruction.** One bill; worker still waits if the pharmacy pays late. **Also a build** — the manifest exists, but no invoice generation from it was traced (GM-17).
- **Other (describe) / Defer** — deferring means launching without a stated payer; workers will assume the platform pays and pharmacies will assume the opposite.

**Why first:** every other GM-09 answer depends on it — approval deadlines (Q3), corrections after payment (Q4), premiums (Q5), export vs in-platform payroll (Q6), ABN vs TFN (Q7), and disputes (Q8) all change with the payer. It is also the conflict Issue #250 explicitly flags under "payment ownership". Do not ask Q2–Q10 in the same sitting; ask Q1, record the binding decision, then re-order the rest.

---

## §5 — Code gaps vs decision gaps

### Code gaps (no owner decision needed — just build/fix; the *bound* in Q3/Q5 is the only decision)
| ID | Gap (verified at 97c4543e) | Fix (after owner answers Q1 where noted) |
|---|---|---|
| CG-09-01 | `TimesheetCorrectionRequest` model exists but has NO API endpoint — unreachable via API (`models.py` vs `views.py`/`urls.py`/`transitions.py`) | Wire it up (worker-raised corrections) or delete it (after Q4/Q8) |
| CG-09-02 | No notifications on ANY timesheet event (build, submit, approve, reopen, lock, correct, comment, check decision) — no notify/email/push calls in the workforce timesheet files | Add notifications per event (after Q3/Q8; GM-22) |
| CG-09-03 | No export endpoint (no CSV, no payroll export) and no export button on the manager page | CSV export minimum (after Q1/Q6) |
| CG-09-04 | No money/rate/pay fields in the timesheet API or UI — minutes only | Add money fields once Q1/Q5 decide the pay model |
| CG-09-05 | TimesheetPeriod statuses REVIEW and APPROVED exist in the model but NO transition to them was found in the files read | Confirm dead statuses or wire them (verify or mark UNKNOWN — see §6) |
| CG-09-06 | No reject state on a timesheet (only reopen / check decisions) | Decide whether a reject is needed (after Q3/Q8) or document reopen as the "no" |
| CG-09-07 | No approval deadline, no auto-approval, no escalation | Build once Q3 picks a window |
| CG-09-08 | Manifest is a "future payroll/integration boundary" — nothing consumes it; `payroll.py` is a 20-line helper | Build the payroll boundary (after Q1/Q6; GM-17) |
| CG-09-09 | Open sessions (no clock-out) count worked minutes up to `min(now, period end)` with `open_session: true` — inflates worked time instead of blocking | Cap at rostered end or flag as BLOCKER (after Q10) |
| CG-09-10 | ROSTER_WITHOUT_ATTENDANCE is a BLOCKER, so a kiosk outage / missed punch blocks the whole timesheet until corrected at the attendance source | Confirm deliberate; add a no-show flag (after Q10) |

### Decision gaps (owner must choose first — do not build until answered)
| ID | Question | Blocks |
|---|---|---|
| Q1 | Payer model (FIRST) | Q3, Q4, Q5, Q6, Q7, Q8 |
| Q3 | Approval window / auto-approval | CG-09-07 |
| Q5 | Premium rules (flat vs Award-based) | CG-09-04; GM-10, GM-14 |
| Q7 | ABN vs TFN model | GM-14, GM-26 |
| Q8 | Dispute resolver + hold policy | CG-09-01, CG-09-02; GM-15 |
| Q10 | Failure-path rules (no-show flag, open-session cap) | CG-09-09, CG-09-10 |

### Dependencies on other areas
GM-08 attendance source of truth (Q2, Q10); GM-10 shift rates (Q5); GM-14 Award/GST/super/employment status (Q1, Q5, Q7); GM-15 disputes/ratings (Q8, Q10); GM-17 invoices/refunds (Q1, Q6); GM-26 privacy/retention (Q7, Q9); GM-22 notifications (Q3, Q4, Q8); GM-12 pay-readiness at accept (Q7).

---

## §6 — Documentation matrix and backlog

### 6a. Documentation matrix (status per question)

| Question | #184 predecessor | Status | ACTUAL TODAY | Source links (97c4543e) |
|---|---|---|---|---|
| Q1 Payer model | none (fee schedule only) | VALIDATED | No payment rail; manifest is future boundary | `timesheet_transitions.py:lock_period`; `models.py:TimesheetManifest`; `shifts/payroll.py`; `settings.py` billing flags |
| Q2 Timesheet creation | none established | VALIDATED | Auto-built roster + attendance + leave; no manual entry | `timesheet_builder.py`; `timesheet_data.py` |
| Q3 Approval / deadline | none established | VALIDATED | Manual approval; no deadline/auto-approval/notify | `timesheet_transitions.py` (submit/approve/reopen) |
| Q4 Corrections | none established | VALIDATED | Reason-required reopen/correct; append-only; adjustment manifest; correction-request model unreachable | `timesheet_transitions.py`; `attendance_edits.py`; `models.py:TimesheetCorrectionRequest` |
| Q5 Rates / premiums | PO-R01 (partly) | VALIDATED | No rate on timesheet; overtime flagged only | `timesheet_serialization.py`; `engagement.py:_build_tfn_award_terms`; GM-10 `pricing.py` |
| Q6 Export | none established | VALIDATED (absence) | No export endpoint/button/code | `workforce/urls.py`; `views.py`; `TimesheetsPage.tsx` |
| Q7 ABN / TFN | ON-Q04 | VALIDATED — ANSWERED | ABN blocked at accept; TFN deferred | `engagement.py:_external_payment_profile`, `validate_tfn_payroll_profile` |
| Q8 Disputes | CX-Q33 | VALIDATED — CHANGED | No dispute flow; comments + check decisions only | `timesheet_transitions.py` (decide_check/add_comment); `models.py` |
| Q9 Records / history | none established | VALIDATED | Own minutes (latest 100); per-pharmacy periods; no retention rule traced | `views.py:MyHoursView`; `TimesheetsPage.tsx` |
| Q10 Failure paths | none established | VALIDATED | BLOCKER for no attendance; WARNING for early finish; open session counts to now; no payment | `timesheet_checks.py`; `timesheet_data.py:_session_rows` |

Progress label (per Issue #250): **CURRENT FLOW TRACED**. It advances to OWNER DECIDED only when the owner answers, starting with Q1.

### 6b. Implementation backlog — ONLY after owner answers (nothing here is decided now)
1. **After Q1:** build the chosen payer path (A: document pharmacy-pays + fee split; B: payout rails + trust handling; C: invoice generation from the manifest — GM-17). Tests: approved timesheet → payment (or instruction) exactly once; double-submit cannot double-pay.
2. **After Q1 + Q5:** add money fields to the timesheet API/UI (rate, premiums as line items, totals); tests: Sunday/public-holiday premiums shown per line; frozen rate from accept.
3. **After Q3:** approval window + auto-approval (if chosen) + submit/approve reminders (notifications — GM-22); tests: deadline expiry auto-approves with notice; approver on leave.
4. **After Q4/Q8:** wire up `TimesheetCorrectionRequest` (or delete it) + formal dispute flow with resolver + timeline + hold policy; tests: worker raises correction; manager responds; dispute holds only the disputed amount (if chosen).
5. **After Q6:** CSV export (minimum) scoped per-pharmacy; tests: unapproved excluded; re-export after correction uses the adjustment manifest; wrong-tenant export refused.
6. **After Q7/GM-14/GM-26:** ABN/TFN status flag on the timesheet; storage/encryption/access rules confirmed; tests: TFN never in exports by default.
7. **After Q10:** no-show flag; open-session cap (rostered end, not "now"); tests: no-show timesheet explicit $0/minutes-0; open session does not inflate.
8. **Cross-client verification (after implementation):** Web (Vite + Next) verified, Expo verified, launch signed off — per Issue #250 progress labels. No step is "done" from a green typecheck alone.

### 6c. What is still UNKNOWN (do not present as decided)
1. **TimesheetPeriod REVIEW/APPROVED transitions:** the statuses exist in `models.py` but no transition to them was found in the files read — dead statuses or a transition elsewhere (verify or leave UNKNOWN).
2. **`workforce/tasks.py` rebuild task:** `rebuild_timesheet_period_task` is queued from `views.py` but its contents were not read — the async rebuild path is unverified.
3. **MyHoursPage / TimesheetDetailDrawer / TimesheetAdjustTimesDialog / TimesheetHealthBanners contents:** paths verified (web); contents NOT read at head. Worker-side submit/approve/reopen UI is therefore traced at the API level only.
4. **Expo timesheet screens contents:** `app/workforce-timesheets.tsx`, `app/my-hours.tsx`, `app/workforce-settings.tsx` located by search (default branch); contents NOT read at head. Expo parity is UNKNOWN at screen level.
5. **Next web timesheets:** no workforce/timesheet page was searched on Next — parity UNKNOWN.
6. **PR #249 commit `d15304b0`** ("fail-closed selected-pharmacy shift and payroll filters"): not read — a lead for the payroll-filters half of Q6, not a finding.
7. **ABN/TFN storage/encryption/visibility:** not traced in this area (GM-26/GM-02).
8. **Reservation-expiry / billing:** the D03 reservation-expiry implementation was not found (GM-13); it affects Q1's payment timing only indirectly.
9. **Tests:** no workforce/timesheet tests were inspected in this trace; test coverage for the §1 matrix is unverified.
10. **Timezone/DST for timesheet periods:** not traced (GM-10-Q05).

### 6d. What this attempt did and did not do
- **Did:** re-validated all 10 questions against current code at PR #249 head `97c4543e`; replaced every UNKNOWN in the prior skeleton with a traced fact or a confirmed absence; verified the manager timesheet page on Vite web at head; preserved the prior skeleton's question framework and ordering (Q1 first).
- **Did not:** change any code; create any PR/issue/comment/branch; notify the owner; read the Expo/Next timesheet screens at head; read `workforce/tasks.py` or the commit `d15304b0`; decide any question.

*No code changes were made in this trace. No PR/issue/comment/branch created. No owner was notified.*


---

## Added 2026-11-21: waiting owner decisions (review of PR #267)

Evidence refs: `pr257:` = `origin/agent/pr257-int` at `21add924` (Expo app + newest backend), `main:` = `origin/main` at `8ccf8f77` (web as deployed). Each question is asked once, recommendation first. Source: the orchestrator's waiting-decision list of 21 Nov (items W-01 to W-17, mapped in [`../OWNER_GRILL.md`](../OWNER_GRILL.md) section 3).

### GM-09-W01: Re-grill: overnight deferred payroll activation into a locked period (W-13, register item 7)
**Scenario:** Omar works Friday 22:00 to Saturday 06:00 with TFN/super details deferred. Tom locks the period that covers Saturday. Omar finishes his details, then Tom asks the app to activate payroll for the shift.
**What happens today:** An authorised manager starts activation. The server checks both work dates. A locked finishing date refuses activation and rolls back the offer and assignment writes (`pr257:backend/shifts/offers.py:566`, `:582`, `pr257:backend/shifts/payroll.py`). Separate cover and later assignment writes are outside this check (release register item 7).
**Recommendation first: KEEP.** The locked period stays intact. Tom handles the correction.
- **KEEP (recommended):** Tom sees the refusal and decides how to correct payroll.
- **A:** Tom can activate payroll and put Omar's hours in the next open period automatically.
- **DEFER**

**Status:** OPEN (re-grill requested by the owner)

## Added 2026-11-22: decisions the orchestrator made for you
From the orchestrator's decision logs (`DECISIONS_FOR_OWNER.md`, `DECISIONS_2026-11-11.md`, `DECISIONS_2026-11-12.md`). Code: `origin/agent/pr257-int` `47506e67`. "Yes" keeps the recommendation. Nothing is built from your answer until the whole grill ends.

### GM-09-OD-07: A worker's correction request notifies the managers (OD-07, D163/D173)
**Platforms:** Web + Expo
**What happens today:** A worker's comment on a timesheet is a correction request. Nobody was told, while the worker saw "Request sent to the timesheet reviewer". Now the managers who can act on that timesheet get a notice, and the author is never notified of their own comment.
**Already implemented:** commit 7855bbd8, `backend/workforce/timesheet_transitions.py:146`
**Recommendation:** Keep.
**Other option:** No notice (managers find requests themselves).
**Status:** OPEN, confirm or change.

### GM-09-OD-08: May a removed worker still raise a correction on a past timesheet? (OD-08, D181 (five-user run A6))
**Platforms:** Web + Expo
**What happens today:** Yes today: Ali, already removed, could still comment on his own past timesheet, and the managers are notified.
**Code:** today's behaviour, `backend/workforce/timesheet_transitions.py:128`
**Recommendation:** Keep it allowed, for wage disputes after someone leaves.
**Other option:** Block it after removal (disputes go to support).
**Status:** OPEN, confirm or change.
