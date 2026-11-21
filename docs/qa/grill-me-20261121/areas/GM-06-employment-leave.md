# GM-06 — Employment / leave — Full Grill Documentation

> **Corrections against current code (21 Nov 2026 review).** 7 claims checked at `main` `8ccf8f77` and `pr257` `21add924`; 4 hold, 3 below need the correction shown. Where a question below says otherwise, this table wins. Full evidence: [`../followup/claim-check-2026-11-21.md`](../followup/claim-check-2026-11-21.md).

| Where | Claim in this file | Verdict | Correct statement | Evidence |
|---|---|---|---|---|
| Q01 | “No rule requires an engagement to exist” | WRONG as a blanket claim | Staff rostering can omit an engagement when ChemistTasker payroll is disabled. With payroll enabled, the shared staff-terms helper requires complete TFN payroll details and a dated engagement covering the work date. | `main:backend/shifts/engagement.py:99`; `pr257:backend/shifts/engagement.py:103`; `:112`; payroll-off path: `pr257:backend/shifts/engagement.py:80` |
| Q07 | “nothing … warns at roster publish” about approved leave | WRONG | Approved leave is a blocking roster-validation error and prevents publication and validated slot edits. Some older direct assignment writers need separate treatment; the guard is not replacement-only. | GUARDED leave check: `main:backend/workforce/roster/validation.py:61`; validation caller: `pr257:backend/workforce/roster/periods.py:234`; publish refusal: `pr257:backend/workforce/roster/publication.py:59`; slot edit: `pr257:backend/workforce/roster/slot_edit.py:52` |
| Q09 | coverage requirements have no identified consumer | WRONG as an absence premise | The roster workspace calculates coverage and shortfalls across each required window. These are displayed calculations, not publication-blocking errors in the inspected validation path. | `main:backend/workforce/roster/revisions.py:64`; `pr257:backend/workforce/roster/revisions.py:91`; `:144` |

**Area:** GM-06 Employment/leave (Issue #250, area 6 of 26)
**Method:** Issue #250 interview rules + PR #184 format; Web (Vite + Next) and Expo traced together in every question, side by side, including parity gaps.
**Status:** TRACED. Decision status per question in Part C. No owner decision recorded yet. No code changed in this phase — documentation and decisions only.

## Web and Expo today, side by side (pr257 `21add924`)

Source for both web and Expo is `origin/agent/pr257-int` `21add924` (what merges to main). Read-only code check by agy, 21 Nov 2026; every cited file:line was checked to exist at that commit. "Parity question" = a choice for the owner, asked in this area's rounds. "Possible defect (to verify)" = drift that looks unintended; it is confirmed in code before it goes to the engineering backlog, never asked as a question. The Platforms table says which platforms each question applies to.

| Flow | Web (Vite + Next) | Expo | Same? | If different |
|---|---|---|---|---|
| Create employment engagement | Manager configures employment terms and award rates in engagements panel (`frontend_web/src/features/workforce/EmploymentEngagementsPanel.tsx:150`). | Manager creates and views employment engagements (`frontend_mobile/app/workforce/employment-engagements/index.tsx:1`). | Yes | — |
| Part-time contracted hours recording | Engagement terms dialog records agreed part-time hours (`frontend_web/src/pages/dashboard/sidebar/ShiftsBoard/components/ShiftEngagementTermsDialog.tsx:15`). | Mobile workforce settings records contracted hours for part-time staff (`frontend_mobile/app/workforce-settings.tsx:274`). | Yes | — |
| Minimum staffing / coverage rules | Coverage panel displays pharmacy coverage requirements (`frontend_web/src/features/workforce/RosterCoveragePanel.tsx:20`). | Manager roster coverage screen reviews staffing coverage (`frontend_mobile/app/manager/roster/coverage.tsx:1`). | Yes | — |
| Worker requests leave | Worker submits leave request in My Leave page (`frontend_web/src/features/workforce/MyLeavePage.tsx:6`). | Worker creates leave request with reason and date range (`frontend_mobile/app/my-leave.tsx:67`). | Yes | — |
| Manager reviews and decides leave | Manager approves or rejects pending leave requests (`frontend_web/src/features/workforce/ManagerLeavePage.tsx:6`). | Manager reviews pending leave requests from workforce screen (`frontend_mobile/app/workforce/leave-requests.tsx:1`). | Yes | — |

### Platforms per question
| Question id | Platforms |
|---|---|
| GM-06-Q01 | Web + Expo |
| GM-06-Q02 | Web + Expo |
| GM-06-Q03 | Web + Expo |
| GM-06-Q04 | Web + Expo |
| GM-06-Q05 | Web + Expo |
| GM-06-Q06 | Web + Expo |
| GM-06-Q07 | Web + Expo |
| GM-06-Q08 | Web + Expo |
| GM-06-Q09 | Web + Expo |

## Bases (exact SHAs verified 2026-11-21)

| Source | Ref | SHA / head |
|---|---|---|
| Active PR #249 (revalidation target) | `refs/pull/249/head` | `97c4543e051b43fe30ec7e2e61ad3d69957a918e`, branch `fix/pr248-expo-production-waves-20261104`, open draft |
| Old grill PR #184 | `refs/pull/184/head` | `c786a4b8182ebf9b505d47cd81980eb3b9851ce3`, branch `docs/launch-grill-20261020` |

**Head-SHA resolution (recorded this session):** PR #249's body names a "working head `26cae2d6`" — that is the short SHA of the last *implementation commit listed in the body*, not the branch head. The API head is `97c4543e051b43fe30ec7e2e61ad3d69957a918e` (458 commits), identical to the Issue #250 snapshot. Every trace below is at that API head.

**No prior trace existed.** No GM-06 file existed anywhere in `~/workspace` before this session (checked first). This is a full trace from scratch.

**Files read line by line at head `97c4543…`:** `backend/workforce/models.py` (807 lines: `EmploymentEngagement`, `MembershipWorkSettings`, `CoverageRequirement`, `WorkforceLeaveRequest`, `Timesheet*`, `RosterPeriod`, `RosterActionAudit`), `backend/workforce/leave_service.py` (348 lines: `create_leave`, `update_pending_leave`, `decide_leave`), `backend/workforce/employment_engagement_service.py` (298 lines: `build_employment_engagement_payload`, `require_end_before_rate_review`), `backend/workforce/urls.py` (63 lines), `backend/workforce/permissions.py` (95 lines), `backend/workforce/roster/validation.py` (85 lines: `worker_issues`), `backend/shifts/leave.py` (145 lines: legacy `LeaveRequestViewSet`), `backend/workforce/roster/worker_actions.py` (478 lines, for the leave↔cover interaction), `backend/organizations/models.py` (`Pharmacy.use_chemisttasker_payroll`, rates).

**Not read at head (marked UNKNOWN where it matters):** `backend/workforce/views.py` (the employment/leave/timesheet view layer — endpoints are known from `urls.py`, but per-view permission checks and serializers were not line-read), `backend/workforce/employment_terms.py` (`correspondence_profile`, `normalise_part_time_pattern` — only their call sites were seen), `backend/workforce/award_rates.py` (Award schedule resolution — only its interface was seen), `backend/workforce/membership_services.py`, the Vite/Next/Expo employment and leave screens (no screen-level trace — see Part A parity notes).

**Adopted verdicts (not re-traced):** GM-01 session findings; GM-05 roles/membership revalidation (membership is the stable worker-at-pharmacy identity; removal consequences; 3-pharmacy cap); GM-04 chain/org definitions (a pharmacy belongs to one org, many chains); GM-18 LA-Q12 STILL VALID; GM-25 structural trace.

## How to read this document

- **Plain English first.** *Employment* here means the dated pay agreement between a pharmacy and one of its employed staff (full-time, part-time, casual) — what they are paid, under which Award classification, from when. *Leave* means a worker asking not to work a rostered shift, or a date range, and a manager approving or rejecting it. Locums and favourites are **not** employed staff (carried R01) — they go through shift offers, not employment engagements.
- **Code gap** = no owner choice needed; just build/fix it. **Decision gap** = the owner must choose first.
- **Decision status values:** `CARRIED — DECIDED` (settled in #184's carried list or the shift-lifecycle register, do not re-ask), `OPEN — NEW` (new GM-06 question; no #184 predecessor), `UNKNOWN` (not inspected at the head).

---

## Part A — Current-flow matrix

Columns: Trigger → Actor → Backend / API → Vite web → Next web → Expo mobile → Persisted state → Event / side effect → Recovery / denial path.

### F01 — Manager creates an employment engagement (pay agreement) for a staff member

| Trigger | Actor | Backend / API | Vite | Next | Expo | Persisted state | Event / side effect | Recovery / denial |
|---|---|---|---|---|---|---|---|---|
| Manager sets/updates a worker's pay terms | Owner / staff-or-roster manager (`can_manage_workforce_pharmacy` = `can_manage_staff_pharmacy` OR `can_manage_roster_pharmacy`; `backend/workforce/permissions.py`) | `POST /api/v1/workforce/employment-engagements/` → `EmploymentEngagementListCreateView`; `GET …/award-preview/`; `GET/PATCH …/<uuid:public_id>/` (`backend/workforce/urls.py`). Payload built by `build_employment_engagement_payload` (`backend/workforce/employment_engagement_service.py`): role must match the membership role; employment_type must be FULL_TIME / PART_TIME / CASUAL; pay_basis AWARD or ABOVE_AWARD; classification resolved from the Award schedule; rates frozen into `award_rate_snapshot`; junior-rate rule: an engagement must end before the worker's next birthday rate review (`require_end_before_rate_review`) | UNKNOWN — employment screens not traced at head | UNKNOWN | UNKNOWN | `EmploymentEngagement` row: membership FK (PROTECT), `effective_from` / `effective_to` (nullable = open-ended), role, employment_type, job_title, pay_basis, award_code `MA000012` (Pharmacy Industry Award 2020), award_classification, award snapshot, ordinary_hours_pattern (part-time only), 4 base rates + early-morning/late-night rates + applicability flags, notes, created_by/updated_by | None traced (no notification in the service code read) | Overlapping engagement dates → `ValidationError` ("dates overlap an existing engagement"); role mismatch → ValidationError; missing correspondence profile → fail closed; rate < 0 → ValidationError; part-time pattern on a full-time/casual engagement → ValidationError. Exact HTTP responses UNKNOWN (views not read) |

### F02 — Part-time worker's contracted hours are recorded

| Trigger | Actor | Backend / API | Vite | Next | Expo | Persisted state | Event / side effect | Recovery / denial |
|---|---|---|---|---|---|---|---|---|
| Manager records contracted hours / work pattern | Owner / manager | `POST /api/v1/workforce/work-settings/` → `MembershipWorkSettingsView` (`backend/workforce/urls.py`). Model: `MembershipWorkSettings` (one-to-one on membership): `contracted_weekly_minutes`, `work_pattern` (JSON), `effective_from` | UNKNOWN | UNKNOWN | UNKNOWN | `MembershipWorkSettings` row | None traced | Only part-time engagements store an `ordinary_hours_pattern` (`EmploymentEngagement.clean` rejects a pattern on full-time/casual, and normalises it on part-time). Whether `work-settings` and the engagement pattern are kept in sync: UNKNOWN (not traced) |

### F03 — Pharmacy sets its minimum staffing (coverage requirements)

| Trigger | Actor | Backend / API | Vite | Next | Expo | Persisted state | Event / side effect | Recovery / denial |
|---|---|---|---|---|---|---|---|---|
| Manager defines minimum staff per weekday/role/time | Owner / manager | `POST/GET /api/v1/workforce/coverage-requirements/` (+ detail) (`backend/workforce/urls.py`). Model: `CoverageRequirement`: pharmacy, weekday (Mon=0…Sun=6), start/end time, role, `minimum_staff` (≥1), `active` | UNKNOWN | UNKNOWN | UNKNOWN | `CoverageRequirement` rows | None traced — **whether anything enforces `minimum_staff` (a warning? a publish block?) was not found in the files read**; roster validation (`worker_issues`) does not reference coverage. See GM-06-Q09 | N/A |

### F04 — Worker requests leave for one rostered shift

| Trigger | Actor | Backend / API | Vite | Next | Expo | Persisted state | Event / side effect | Recovery / denial |
|---|---|---|---|---|---|---|---|---|
| Worker taps "request leave" on an assigned shift | Employed worker (own shift only) | `POST /api/v1/workforce/leave/` → `WorkforceLeaveListCreateView` → `create_leave` (`backend/workforce/leave_service.py`): `slot_assignment_id` given → assignment locked (`select_for_update`), must belong to the requester, one active (PENDING/APPROVED) request per assignment max; start/end are **computed from the assignment** in the pharmacy's timezone (`assignment_interval`, overnight aware); `leave_type` from 7 types; row saved PENDING; email + in-app notice to owner + org-wide admins + pharmacy admins (`_notify_slot_leave_created`, template `emails/leave_request.html`, link back to the roster) | Leave UI on roster screens (Oct 2026: web `RosterWorkerPage`, mobile `app/my-roster.tsx` — not re-traced at head) | UNKNOWN | Same (Oct 2026) | `WorkforceLeaveRequest` row: pharmacy, membership, user, `slot_assignment` FK, leave_type, start_at/end_at, status PENDING, note, `legacy_leave` (link to old `client_profile.LeaveRequest`, nullable) | Managers notified by email + in-app. **The assignment is NOT released, NOT covered, NOT changed in any way** — the worker stays assigned while the request is pending | Another active request for the same assignment → ValidationError. Someone else's assignment → PermissionDenied ("only request leave for your own assigned shifts"). Bad assignment id → ValidationError |

### F05 — Worker requests leave for a date range (no specific shift)

| Trigger | Actor | Backend / API | Vite | Next | Expo | Persisted state | Event / side effect | Recovery / denial |
|---|---|---|---|---|---|---|---|---|
| Worker requests leave over dates | Employed worker (own active accepted membership) | `POST /api/v1/workforce/leave/` without `slot_assignment_id` → `create_leave`: membership looked up by `membership_id` (must be the requester's, active, ACCEPTED); `start_at`/`end_at` must be ISO-8601 **with a timezone offset** (naive datetimes rejected); end must be after start; row saved PENDING. **No notification is sent on this path** — `_notify_slot_leave_created` returns early when there is no `slot_assignment_id`, so a date-range request notifies **nobody** | UNKNOWN | UNKNOWN | UNKNOWN | `WorkforceLeaveRequest` row with `slot_assignment` NULL | None — silent creation. Managers are not told (code gap CG-02) | Wrong membership / inactive membership → PermissionDenied. Bad datetimes → ValidationError |

### F06 — Manager approves or rejects a leave request

| Trigger | Actor | Backend / API | Vite | Next | Expo | Persisted state | Event / side effect | Recovery / denial |
|---|---|---|---|---|---|---|---|---|
| Manager decides | Owner / manager (`can_manage_pharmacy`, `backend/workforce/permissions.py`) | `POST /api/v1/workforce/leave/<id>/decision/` → `decide_leave` (`leave_service.py`): row locked; only PENDING can be decided; APPROVED/REJECTED only by a manager; worker may CANCEL only their own pending request. On APPROVED: the worker's user row is locked (`select_for_update`) so two overlapping approvals cannot both pass; overlapping **approved** leave for the same worker+pharmacy is rejected. If the request is slot-bound and the assignment has since changed hands, approval is refused ("Reject the stale leave request instead"). Decision email + in-app notice to the worker (`leave_approved` / `leave_rejected` templates) | UNKNOWN | UNKNOWN | UNKNOWN | Status → APPROVED/REJECTED/CANCELLED, `decided_by`, `decided_at`, `manager_note` | Worker notified. **The rostered assignment is still NOT released or covered on approval** — approval changes only the leave row. A manager must separately release the worker / find cover (GM-07). Overlap check is only against other *approved leave*, not against roster assignments or bookings | Non-pending → ValidationError. Non-manager → PermissionDenied. Overlapping approved leave → ValidationError. Stale assignment → ValidationError |

### F07 — Worker edits or cancels their own pending leave request

| Trigger | Actor | Backend / API | Vite | Next | Expo | Persisted state | Event / side effect | Recovery / denial |
|---|---|---|---|---|---|---|---|---|
| Worker changes note/type/dates, or withdraws | The requesting worker | `update_pending_leave` (`leave_service.py`): only the owner, only while PENDING; leave_type/note editable; dates editable **only** for date-range requests (slot-bound dates are fixed by the assignment); `decide_leave` with decision CANCELLED: only the worker, only while PENDING. No notification on edit/cancel was found in the code read | UNKNOWN | UNKNOWN | UNKNOWN | Updated row / CANCELLED status | None traced | Decided request → ValidationError ("Only pending leave requests can be updated or cancelled") |

### F08 — Replacement eligibility checks approved leave

| Trigger | Actor | Backend / API | Vite | Next | Expo | Persisted state | Event / side effect | Recovery / denial |
|---|---|---|---|---|---|---|---|---|
| Manager approves a swap/cover replacement; roster validation runs | System | `worker_issues` (`backend/workforce/roster/validation.py`): a replacement candidate with **APPROVED** leave overlapping the shift window is an error (`APPROVED_LEAVE_CONFLICT`) and blocks the swap/cover (GM-07: `validate_worker_replacement_eligibility` raises on errors *and* warnings). Pending leave does **not** block a replacement | Same backend rule on both clients | Same | Same | None | A worker with approved leave cannot be drafted as cover — but the worker *on* leave stays assigned until a manager acts (F06) | N/A |

### F09 — Employment ends / engagement closes

| Trigger | Actor | Backend / API | Vite | Next | Expo | Persisted state | Event / side effect | Recovery / denial |
|---|---|---|---|---|---|---|---|---|
| Employment ends (resignation, termination, end of contract) | UNKNOWN — no end-of-employment flow was found | `EmploymentEngagement.effective_to` can close a dated pay period; `Membership.remove()` (GM-05) can delete/deactivate the membership row. **No termination flow, no end reason, no handover of future roster shifts, no final-pay step was found in the files read.** What happens to the person's future roster assignments, pending leave, confirmed bookings or attendance sessions when employment ends: UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | `effective_to` set, or membership deactivated/deleted | UNKNOWN | See GM-06-Q08 |

### F10 — Legacy leave (compatibility route)

| Trigger | Actor | Backend / API | Vite | Next | Expo | Persisted state | Event / side effect | Recovery / denial |
|---|---|---|---|---|---|---|---|---|
| Old client calls the original roster-leave routes | Any authenticated user | `LeaveRequestViewSet` (`backend/shifts/leave.py`): "Compatibility API for the original Sada roster-leave routes. … all active reads/writes now use `workforce.WorkforceLeaveRequest` as the canonical leave record. `client_profile.LeaveRequest` is retained only as migrated historical data." List/retrieve/create/update/destroy/approve/reject delegate to `WorkforceLeaveRequest` (slot-bound only, CANCELLED excluded from list) | Old web clients | UNKNOWN | Old mobile clients | Canonical `WorkforceLeaveRequest` rows | None beyond F04–F07 | UNKNOWN — the view's queryset scoping (which users see whose requests) was not fully read |

### Web vs Expo parity gaps (GM-06-specific)

| Area | Web | Expo | Gap type |
|---|---|---|---|
| Employment engagement screens (pay terms, Award preview) | UNKNOWN — not traced at head | UNKNOWN — not traced at head | **Not traced, not "no gap"** — the endpoints exist (`employment-engagements/`, `award-preview`), the screens were not read |
| Leave request / decision screens | Roster screens named in Oct 2026 (`RosterWorkerPage`); manager approval screens not re-traced | `app/my-roster.tsx` (Oct 2026); not re-traced | Unknown on both |
| Leave notifications | Email + in-app (backend, same for both) | Email + in-app (backend, same for both) | No parity gap in the *rule*; whether both clients surface the notice identically is UNKNOWN |
| Date-range leave (no shift) | UNKNOWN | UNKNOWN | Backend notifies nobody on this path (CG-02) — whichever client offers it, managers stay silent |

### Actors and what each can do today

- **Pharmacy owner / superuser:** can manage workforce (employment + roster) at their pharmacy; owner is the fallback recipient of leave notices.
- **Pharmacy admin with MANAGE_STAFF or MANAGE_ROSTER:** can manage employment/pay records (`can_manage_workforce_pharmacy` = staff OR roster capability) and decide leave (`can_manage_pharmacy`).
- **Org-wide admin with MANAGE_STAFF / MANAGE_ROSTER scoped to the pharmacy:** same, via `_org_has_capability`.
- **Employed worker (FULL_TIME / PART_TIME / CASUAL, active accepted membership):** can request leave for their own shifts / date ranges, edit or cancel while pending. Cannot request leave for anyone else's shift.
- **Locum / favourite / Shift Hero:** no employment engagement, no leave — they cancel/cover through shift offers and roster worker actions (GM-07/GM-15), not through leave.
- **Platform admin:** no employment/leave role traced (superuser passes `_is_owner_or_superuser` in roster checks; leave decision uses `can_manage_pharmacy` — superuser treatment there was not verified).

---

## Part B — Old questions re-validated (PR #184 / #204 / shift-lifecycle)

Method: all 142 questions in `questions.json` (re-read from `refs/pull/184/head` this session) were scanned for employment/leave mechanics (employment type, engagement, pay terms, Award, leave, balances, entitlements, termination). The shift-lifecycle carried decisions were scanned the same way.

| Old ID | Old question | Verdict | Evidence |
|---|---|---|---|
| (none) | Employment / leave | **NO #184 QUESTION EXISTS** | Keyword scan of all 142 questions for employment/leave/engagement/termination/balance/entitlement/annual/sick found no employment or leave question. #184 audited onboarding, shifts, talent and availability; employment and leave were never grilled. GM-06 is new ground. |
| R01 (carried) | Who belongs on the internal roster? | **CARRIED — DECIDED, still valid** | "Only employed staff: full-time, part-time, casual. Locums and favourites go through shift offers." Re-confirmed in code: `PHARMACY_STAFF_EMPLOYMENT_TYPES` + `EmploymentEngagement.clean` enforces FULL_TIME/PART_TIME/CASUAL. Bounds GM-06: leave and engagements are for employed staff only. |
| R04 / R04A–R04D, R06, D04, D05 (carried) | Swap/cover/cancel rules | **CARRIED — DECIDED** | These are GM-07's carried rules; they touch leave only at the edges (a worker on approved leave still needs cover — see GM-06-Q06). Not re-asked here. |
| ON-Q10 | How should super show on ABN contractor terms? | **NOT GM-06 — route to GM-14** | ABN contractor terms / super on engagement terms. Employment engagements here are for employed staff (TFN); ABN terms belong to GM-14 (Terms/Award/GST/super). |
| PO-R01 | Must TFN shifts pass Pharmacy Award checks before posting? | **NOT GM-06 — route to GM-10/GM-14** | Award checks at *posting* time. GM-06 owns the Award *engagement* (the dated pay agreement); the posting check is GM-10/GM-14. |
| CX-Q33 | How are disputed hours settled? | **PARTLY GM-06/GM-09 — boundary** | "Manager corrections exist in the attendance domain. No dispute path for the worker." Leave is not the dispute path; attendance corrections are GM-08, timesheet disputes GM-09. Not carried as a GM-06 question. |
| AUDIT.md §Not checked | — | **Confirms the gap** | #184 explicitly left "invoice/payroll internals" and roster/attendance detail partly unchecked. Employment engagements and leave balances were never audited. |

**Old questions NOT carried forward unvalidated:** none — there was nothing to carry. Every GM-06 question in Part C is new.

---

## Part C — GM-06 question queue (new, #184 format)

Per-question format: plain-English explanation first, then ACTUAL TODAY with **Web** and **Expo** side by side, RECOMMENDED, ALTERNATIVE A (keep), ALTERNATIVE B/C, Other/defer. Normal case, edge case, retry/concurrency, denied role/wrong tenant, payment/notification side effects, and Web/Expo difference are shown inside each question. Sources are at head `97c4543…` unless noted. Decision status: **OPEN** for all — no owner answer recorded.

### GM-06-Q01 — Should every employed worker have a dated pay agreement (engagement), and who sets it?

**Plain English:** today each employed worker can have a dated pay agreement that says their role, full-time/part-time/casual, Award classification and exact rates — and the rates are frozen in time, so changing the Award later doesn't rewrite history. But nobody has decided whether *every* employed worker must have one, or who is allowed to create it.

**ACTUAL TODAY — Web and Expo (same backend):** `EmploymentEngagement` is a dated period per membership (`effective_from`, optional `effective_to`); overlapping periods are rejected; role must match the membership; rates are frozen in `award_rate_snapshot`. Creation is via `POST employment-engagements/` for anyone who `can_manage_workforce_pharmacy` (owner, staff/roster manager, scoped org admin). **No rule requires an engagement to exist** — a member can be rostered with no engagement on file (whether rostering checks for one was not traced — UNKNOWN). Screens on web/Expo were not traced.
**Normal case:** manager hires a part-time pharmacist, creates an engagement from 1 Dec with Award rates. **Edge case:** worker rostered before any engagement exists — what rate do they get paid? UNKNOWN (timesheet/rate resolution is GM-09/GM-14). **Retry/concurrency:** two managers creating overlapping engagements — the `clean()` overlap check runs per save; race behaviour UNKNOWN (no lock seen in the service code read). **Denied role / wrong tenant:** a manager from another pharmacy creating an engagement → permission check is `can_manage_workforce_pharmacy` (scoped per pharmacy); exact denial response UNKNOWN (views not read). **Payment/notification:** the engagement *is* the pay basis — wrong rates here flow straight into timesheets and payroll. No notification on create was found.
**RECOMMENDED:** Require one current engagement per employed member before they can be published on a roster (fail closed, with a clear "set pay terms first" message), created by the owner or a staff manager. Severity: high — pay without agreed terms is the fastest route to a dispute.
**ALTERNATIVE A — Keep current logic:** engagements optional; anyone with workforce permission can create them. Trade-off: no work; workers can be rostered and paid with no agreed terms on file.
**ALTERNATIVE B — Owner-only:** only the pharmacy owner (not managers) creates engagements. Trade-off: tightest control; the owner becomes a bottleneck for every hire.
**ALTERNATIVE C — Auto-create from membership:** an engagement is auto-created from the membership + Award defaults when a worker joins. Trade-off: no one is ever missing terms, but the defaults may be wrong (classification, above-Award rates) and nobody reviewed them.
**Other (describe) / Defer.**
**Sources:** `backend/workforce/models.py` (`EmploymentEngagement`), `backend/workforce/employment_engagement_service.py` (`build_employment_engagement_payload`), `backend/workforce/permissions.py` (`can_manage_workforce_pharmacy`), `backend/workforce/urls.py`.
**Decision status:** OPEN — NEW.

### GM-06-Q02 — Award or above Award — and what happens when the worker has a birthday (junior rates)?

**Plain English:** the pay agreement is built on the Pharmacy Industry Award 2020, either at Award rates or above Award. For junior workers the Award rate changes on their birthday — and the code already forces an engagement to end the day before that birthday so a new one starts at the new rate. The owner needs to confirm this is the rule they want, and who fixes it when a birthday is missed.

**ACTUAL TODAY — Web and Expo (same backend):** `pay_basis` is AWARD or ABOVE_AWARD; `award_code` defaults to `MA000012`; the Award schedule is resolved by role + classification + employment type + date of birth + date (`resolve_award_schedule`, `award_rates.py` — interface only, not read); above-Award keeps the Award as the floor (`award_floor`); `require_end_before_rate_review` rejects an `effective_to` that runs past the next rate-review (birthday) date. Date of birth comes from onboarding, falling back to an approved membership application.
**Normal case:** 19-year-old intern's engagement ends the day before their 20th birthday; a successor engagement starts at the new rate. **Edge case:** birthday missed (no successor created) — the worker's pay terms are expired with no current engagement; what the roster/timesheet does then is UNKNOWN. **Retry/concurrency:** n/a. **Denied role:** n/a. **Payment/notification:** no reminder or notice about an approaching rate review was found in the code read. **Web/Expo difference:** none — backend rule.
**RECOMMENDED:** KEEP the birthday rule, and add a reminder (to owner + manager) 14 days before a junior rate review, plus a block on publishing a roster week that includes a worker whose engagement expires mid-week. Severity: medium — underpaying a junior is an Award breach.
**ALTERNATIVE A — Keep current logic:** birthday rule enforced, no reminder, no roster block. Trade-off: no work; expired terms are discovered late.
**ALTERNATIVE B — Auto-roll the engagement:** on the birthday, auto-create a successor at the new Award rate. Trade-off: never expired, but nobody reviewed the new terms and above-Award loadings may need re-thinking.
**Other (describe) / Defer.**
**Sources:** `backend/workforce/employment_engagement_service.py` (`require_end_before_rate_review`, `build_employment_engagement_payload`), `backend/workforce/models.py` (`EmploymentEngagement`).
**Decision status:** OPEN — NEW.

### GM-06-Q03 — Part-time contracted hours: what does the roster owe a part-timer?

**Plain English:** part-timers have contracted hours — a pattern of ordinary hours stored on their pay agreement, plus a weekly-minutes figure on their membership. But nothing in the code I read checks the roster against those hours. A part-timer contracted for 20 hours a week could be rostered for 38, or for 4, and nothing would flag it.

**ACTUAL TODAY — Web and Expo (same backend):** Part-time engagements store `ordinary_hours_pattern` (normalised by `normalise_part_time_pattern`); full-time/casual engagements must NOT have one. `MembershipWorkSettings` stores `contracted_weekly_minutes` + `work_pattern` + `effective_from`. Roster validation (`worker_issues`) checks role, overlaps and approved leave — **not** contracted hours. Whether the roster builder, publisher, or timesheet checks contracted hours was not found in the files read.
**Normal case:** part-timer contracted 3 days a week is rostered for those 3 days. **Edge case:** part-timer rostered over their contracted hours — overtime? Refusal right? UNKNOWN (no rule found). Rostered under their hours — is the pharmacy obliged to top up? UNKNOWN. **Retry/concurrency:** n/a. **Denied role:** n/a. **Payment/notification:** contracted hours feed pay expectations; no check means pay disputes surface at timesheet time (GM-09). **Web/Expo difference:** none — backend rule (or absence of one).
**RECOMMENDED:** Warn (not block) at roster publish when a part-timer's published week is outside their contracted pattern, and show contracted vs rostered hours on the roster screen. Severity: medium — protects both sides, keeps the roster flexible.
**ALTERNATIVE A — Keep current logic:** contracted hours stored, never checked. Trade-off: no work; the pattern is decoration.
**ALTERNATIVE B — Block at publish:** a roster week that breaks a part-timer's pattern cannot publish. Trade-off: strongest protection, but a sick-cover week may need exactly that breach — needs an override with a reason.
**ALTERNATIVE C — Drop contracted hours from the product:** delete the pattern/minutes fields. Trade-off: honest about what the product does, but the Award needs ordinary-hours patterns for part-timers (the engagement already enforces the pattern's shape).
**Other (describe) / Defer.**
**Sources:** `backend/workforce/models.py` (`MembershipWorkSettings`, `EmploymentEngagement.clean`), `backend/workforce/roster/validation.py` (`worker_issues` — no hours check), `backend/workforce/employment_terms.py` (not read — `normalise_part_time_pattern` only seen at call sites).
**Decision status:** OPEN — NEW.

### GM-06-Q04 — Which leave types exist, and is leave paid, unpaid, or "the roster just changes"?

**Plain English:** today there are seven leave types — sick, annual, compassionate, study, carer's, unpaid, and other. But the product never says whether any of them is paid, never counts a balance, and never touches pay. Approving "annual leave" changes nothing except the leave row itself.

**ACTUAL TODAY — Web and Expo (same backend):** `WorkforceLeaveRequest.LEAVE_TYPES`: SICK, ANNUAL, COMPASSIONATE, STUDY, CARER, UNPAID, OTHER. No paid/unpaid flag, no balance, no accrual, no entitlement model anywhere in `backend/workforce/models.py` or `leave_service.py` (verified by search). No pay treatment on approval — timesheet/payroll handling of leave is GM-09 territory and was not traced here. The legacy `client_profile.LeaveRequest` is historical data only.
**Normal case:** worker requests annual leave for a rostered Saturday; manager approves. **Edge case:** worker requests sick leave for a shift that already started, or for dates with no rostered shift (date-range path) — both are accepted by the code as written. **Retry/concurrency:** one active request per assignment; overlapping approved leave is blocked at decision. **Denied role / wrong tenant:** leave for another worker's shift → PermissionDenied; leave under another pharmacy's membership → PermissionDenied. **Payment/notification:** no pay effect in this code; whether approved leave generates paid hours in a timesheet is UNKNOWN (GM-09). **Web/Expo difference:** none — backend rule.
**RECOMMENDED:** Keep the seven types, and decide the pay treatment per type now (even if the answer is "leave is unpaid in the product until GM-09 builds paid leave"): annual/sick/compassionate/carer's paid per the Award for full/part-time staff, unpaid for casuals; study/other/unpaid unpaid. Severity: high — "approved annual leave" that pays nothing is a Fair Work problem waiting to happen.
**ALTERNATIVE A — Keep current logic:** seven types, no pay meaning, no balances. Trade-off: no work; every leave approval is a promise the payroll side may not keep.
**ALTERNATIVE B — Cut the list to what the product can honour:** sick / annual / unpaid only, until paid-leave handling exists. Trade-off: honest, but study/carer's/compassionate requests go through "other" with a note.
**ALTERNATIVE C — Leave is roster-only, never paid through the product:** the product only moves the roster; pay for leave is handled outside ChemistTasker. Trade-off: clear boundary, but the pharmacy must do leave pay by hand.
**Other (describe) / Defer.**
**Sources:** `backend/workforce/models.py` (`WorkforceLeaveRequest.LEAVE_TYPES`), `backend/workforce/leave_service.py` (no pay/balance logic).
**Decision status:** OPEN — NEW.

### GM-06-Q05 — Should the product track leave balances and entitlements, or stay request-only?

**Plain English:** today the product does not know how much leave anyone has. There is no balance, no accrual, no "you have 12 days left". A worker can request annual leave every week and the product will happily approve it every week, as long as the requests don't overlap each other.

**ACTUAL TODAY — Web and Expo (same backend):** No balance/accrual/entitlement field, model, or check exists in the workforce models or leave service (verified by search for balance/accrual/entitle/accrue — zero hits). Approval checks only overlap with other *approved* leave. Nothing checks how many days a worker has taken this year, or whether they have any entitlement left.
**Normal case:** full-timer requests 4 weeks' annual leave; manager approves on trust. **Edge case:** casual requests paid annual leave (casuals don't accrue it under the Award) — nothing stops it. Worker requests leave beyond their balance — nothing stops it. **Retry/concurrency:** n/a. **Denied role:** n/a. **Payment/notification:** balances are the difference between approving leave and approving *paid* leave; without them, every approval is a handshake. **Web/Expo difference:** none — the absence is backend-wide.
**RECOMMENDED:** Add balances after launch (defer the build), but decide the rule now: balances accrue per the Award by employment type (full/part-time accrue annual + sick; casuals don't), shown to worker and manager on the leave screen, and approval warns (not blocks) when the request exceeds the balance. Severity: high for correctness, medium for launch — a request-only launch is shippable if the owner accepts manual balance-keeping outside the product.
**ALTERNATIVE A — Keep current logic (request-only, no balances):** Trade-off: no work; balances live in a spreadsheet or the pharmacy's payroll system, and the product can approve leave nobody has.
**ALTERNATIVE B — Balances before launch:** accrue + show + enforce at approval. Trade-off: correct, but a real payroll feature (accrual rules, carry-over, cash-out, termination payout) — the biggest build in GM-06.
**ALTERNATIVE C — Track taken-days only (no accrual math):** show "days taken this year" per type, no entitlement figure. Trade-off: cheap visibility, no false precision; still lets a manager spot abuse.
**Other (describe) / Defer.**
**Sources:** `backend/workforce/models.py`, `backend/workforce/leave_service.py` (searched: no balance/accrual/entitlement).
**Decision status:** OPEN — NEW.

### GM-06-Q06 — When leave is approved, what happens to the rostered shift? (FIRST QUESTION, see Part D)

**Plain English:** today, nothing happens. Approving leave changes the leave request from "pending" to "approved" — and the worker stays assigned to the shift. The manager has to separately release the worker or find cover, in a different flow, or the shift still shows the worker who is on leave.

**ACTUAL TODAY — Web and Expo (same backend):** `decide_leave` (APPROVED) only updates the leave row (`status`, `decided_by`, `decided_at`, `manager_note`) and notifies the worker. It does not touch `ShiftSlotAssignment`, does not create a cover request, does not open a vacancy, does not notify anyone else. The rostered worker remains assigned. Separately, `worker_issues` blocks a *replacement* candidate who has approved leave overlapping the shift — so the system knows leave matters for cover, but never acts on the leaver's own shift.
**Normal case:** worker's Saturday leave is approved on Monday; the manager releases the shift and finds cover by Wednesday. **Edge case:** leave approved the morning of the shift — the worker is still assigned, nobody has been asked to cover, and the shift starts uncovered. Leave approved for a date-range with no assignment — nothing to release; but any rostered shifts inside the range stay assigned (no sweep). **Retry/concurrency:** approval and a swap/cover approval racing on the same assignment — `decide_leave` locks the leave row and checks the assignment is unchanged *at decision time*; whether a cover approval racing a leave approval is safe was not traced. **Denied role / wrong tenant:** only a manager of that pharmacy can approve; approval by the wrong pharmacy's manager → PermissionDenied. **Payment/notification:** approval notifies only the worker; the roster, the cover flow and the attendance check (GM-08: approved leave blocks a replacement, not the leaver) are untouched. **Web/Expo difference:** none — backend behaviour.
**RECOMMENDED:** On approval of slot-bound leave, prompt the manager (same screen, one tap) to release the shift to cover — "release now", "find cover later", or "keep assigned" — and record the choice. Never silently keep an approved-leave worker assigned without the manager seeing it. Severity: high — an approved-leave worker left on the roster is a no-show waiting to happen (GM-08) and a pay dispute (GM-09).
**ALTERNATIVE A — Keep current logic:** approval touches only the leave row; the manager must remember to handle the shift separately. Trade-off: no work; the gap is silent and easy to miss, especially for leave approved close to the shift.
**ALTERNATIVE B — Auto-release on approval:** approving slot-bound leave automatically releases the assignment (GM-07 release path, with optional escalation to the marketplace). Trade-off: the shift is never left assigned to an absent worker; but a manager who wanted to keep the worker assigned (e.g. leave approved in error) must re-add them.
**ALTERNATIVE C — Auto-create a cover request:** approval creates a pending cover request (GM-07) for the shift, still assigned to the worker until a replacement is approved. Trade-off: matches carried R04 (stay assigned until replaced) and makes the gap visible in the cover queue; needs the cover-request plumbing to accept a manager-created request.
**Other (describe) / Defer.**
**Sources:** `backend/workforce/leave_service.py` (`decide_leave` — no assignment touch), `backend/workforce/roster/worker_actions.py` (`release_worker_from_assignment`, `submit_cover_request`), `backend/workforce/roster/validation.py` (`APPROVED_LEAVE_CONFLICT`).
**Decision status:** OPEN — NEW. **Ask first (Part D).**

### GM-06-Q07 — Leave for a date range: who sees it, and should it block rostering inside the range?

**Plain English:** a worker can request leave for a date range with no specific shift attached — and when they do, nobody is told, and nothing stops a manager rostering them right inside those dates. The request exists, but the roster can't see it.

**ACTUAL TODAY — Web and Expo (same backend):** Date-range leave (`create_leave` without `slot_assignment_id`) requires the worker's own active accepted membership and tz-aware datetimes; it saves PENDING and notifies **nobody** (`_notify_slot_leave_created` returns early without a slot assignment). Roster validation (`worker_issues`) blocks a replacement only if they have *approved* leave overlapping the shift — so a date-range leave, once approved, does block the worker being drafted as cover; but nothing stops a manager *rostering* them (creating a new assignment) inside an approved leave range, and nothing warns at roster publish.
**Normal case:** worker requests annual leave 10–24 Dec (date range); manager approves; no one is rostered over it because the manager remembers. **Edge case:** manager publishes a January roster that includes the worker on days they have approved leave in December — different month, fine; but a leave range spanning a roster week that gets published after approval — no warning was found. **Retry/concurrency:** n/a. **Denied role / wrong tenant:** date-range leave under another pharmacy's membership → PermissionDenied. **Payment/notification:** silent creation (CG-02) + silent approval-to-roster gap. **Web/Expo difference:** none — backend behaviour; whether either client even offers date-range leave is UNKNOWN (screens not traced).
**RECOMMENDED:** Notify the same recipients as slot-bound leave on creation *and* on decision, and warn (not block) at roster publish when a published assignment overlaps a worker's approved leave. Severity: medium — the silent path makes date-range leave a trap.
**ALTERNATIVE A — Keep current logic:** date-range leave notifies nobody and never blocks rostering. Trade-off: no work; managers must remember every approved date range.
**ALTERNATIVE B — Block rostering inside approved leave:** creating/publishing an assignment overlapping approved leave is refused. Trade-off: strongest; a genuine exception (worker agrees to work a day inside their leave) needs a manager override + the leave to be amended.
**ALTERNATIVE C — Drop date-range leave:** leave is only ever for a specific rostered shift. Trade-off: simplest; workers planning holidays must wait until the roster exists, which may be weeks after they need to book flights.
**Other (describe) / Defer.**
**Sources:** `backend/workforce/leave_service.py` (`create_leave`, `_notify_slot_leave_created`), `backend/workforce/roster/validation.py` (`worker_issues`), `backend/workforce/roster/publication.py` (`publish_roster_period` — no leave check seen).
**Decision status:** OPEN — NEW.

### GM-06-Q08 — When employment ends, what happens to the roster, the bookings, and the leave?

**Plain English:** today there is no "employment ends" flow at all. A pay agreement can be given an end date, and a membership can be removed — but nothing in the code I read says what happens to that person's future roster shifts, their pending leave, their confirmed bookings, or their attendance record when they leave.

**ACTUAL TODAY — Web and Expo (same backend):** `EmploymentEngagement.effective_to` closes a pay period (overlap rules still apply). `Membership.remove()` (GM-05, adopted) deletes the row, or deactivates it if employment history protects it — and GM-05 found nothing that handles the removed person's future bookings, roster entries, or pending offers. No termination reason, no last-day, no handover, no final-pay step was found in the files read. `WorkforceLeaveRequest` has no handling for a member who leaves with pending/approved leave.
**Normal case:** a part-timer resigns with 2 weeks' notice; the manager sets `effective_to` and removes the membership. **Edge case:** the person has rostered shifts next week, approved leave next month, and a confirmed locum booking (they also locum elsewhere) — which of those survive? UNKNOWN. Person leaves mid-shift (attendance session open) — UNKNOWN. **Retry/concurrency:** removal racing an acceptance — GM-05 notes the acceptance should fail if the membership is gone (not verified in `offers.py`). **Denied role / wrong tenant:** only a manager of that pharmacy can remove; exact behaviour UNKNOWN here. **Payment/notification:** final pay, leave payout, and notice are Fair Work matters; the product currently says nothing. **Web/Expo difference:** none — the absence is backend-wide.
**RECOMMENDED:** On membership removal / engagement end, block new bookings immediately, keep history, and force an explicit choice on future roster assignments and approved leave (release with notice, or keep with a warning) — the same shape as GM-05-Q09, which owns the removal consequences. Do not silently keep a departed worker on the roster. Severity: high — ghost workers on the roster become no-shows (GM-08) and pay errors (GM-09).
**ALTERNATIVE A — Keep current logic:** end the engagement / remove the membership and let whatever happens happen. Trade-off: no work; future shifts stay assigned to someone who has left.
**ALTERNATIVE B — Auto-release everything:** ending employment deletes/cancels all future roster assignments and pending leave, and releases the shifts to cover. Trade-off: clean, but a worker who is only changing employment type (casual → part-time) would lose their roster.
**ALTERNATIVE C — Employment end is a GM-05 removal only:** no separate GM-06 flow; the membership-removal decision covers it. Trade-off: one place to decide; but pay/leave/final-pay specifics still need a home.
**Other (describe) / Defer.**
**Sources:** `backend/workforce/models.py` (`EmploymentEngagement.effective_to`), GM-05 adopted revalidation (`Membership.remove()`, Q-09), `backend/workforce/leave_service.py` (no leaver handling).
**Decision status:** OPEN — NEW (overlaps GM-05-Q09 — decide together, don't decide twice).

### GM-06-Q09 — Minimum staffing (coverage requirements): a rule, a warning, or decoration?

**Plain English:** a pharmacy can write down "we need at least 2 pharmacists on Saturdays 9–5" — but nothing in the code I read ever checks it. The roster can publish with nobody on, and nothing complains.

**ACTUAL TODAY — Web and Expo (same backend):** `CoverageRequirement` exists (weekday, times, role, `minimum_staff`, `active`) with create/list/detail endpoints. No reference to coverage requirements was found in roster validation (`worker_issues`), publication (`publish_roster_period`), or the files read. Whether any other module enforces it was not traced.
**Normal case:** Saturday needs 2 pharmacists; roster publishes with 2. **Edge case:** Saturday publishes with 1 (one called in sick, leave approved) — publish succeeds silently today. **Retry/concurrency:** n/a. **Denied role:** n/a. **Payment/notification:** none — but an understaffed pharmacy is a safety and service problem, and the product currently can't see it. **Web/Expo difference:** none — backend absence.
**RECOMMENDED:** Warn at roster publish when a coverage requirement is unmet (list the gap, require the manager to acknowledge it — same pattern as publication warnings), and show coverage vs rostered on the roster screen. Severity: medium — a warning is useful; a block would stop a pharmacy publishing a roster it has to publish short-staffed.
**ALTERNATIVE A — Keep current logic:** coverage requirements stored, never checked. Trade-off: no work; the feature is decoration.
**ALTERNATIVE B — Block publish when coverage is unmet:** Trade-off: safest on paper; a pharmacy that cannot fill a Saturday cannot publish any of its roster, which punishes the whole week for one gap.
**ALTERNATIVE C — Drop coverage requirements:** remove the model and endpoints. Trade-off: honest; loses the only place minimum staffing is written down.
**Other (describe) / Defer.**
**Sources:** `backend/workforce/models.py` (`CoverageRequirement`), `backend/workforce/urls.py` (endpoints), `backend/workforce/roster/validation.py` + `backend/workforce/roster/publication.py` (no coverage reference found).
**Decision status:** OPEN — NEW.

---

## Part D — SINGLE first decision question

### GM-06-Q06 — When leave is approved, what happens to the rostered shift?

**Ask this first because:** it is the live behaviour that silently creates no-shows: leave is approved, the worker stays assigned, and nobody is prompted to do anything about the shift. Every other GM-06 question (balances, pay treatment, date ranges, employment end) assumes the roster and the leave record agree with each other — today they don't. It also decides the GM-07 cover flow's starting point: if approval auto-creates a cover request, the cover queue has work to do; if it doesn't, the manager must remember.

**Question (plain English):** Today, when a manager approves a worker's leave for a rostered shift, the leave is marked approved — but the worker stays assigned to that shift, and nothing asks anyone to find cover. Should approving leave also deal with the shift?

**Options:**

- **A — Keep current logic:** approval changes only the leave record; the manager must separately release the worker or find cover. *What happens:* the shift still shows the worker who is on leave until someone remembers. *Trade-off:* no work; the gap is silent, especially for leave approved close to the shift.
- **B — Prompt on approval (RECOMMENDED):** approving slot-bound leave asks the manager right there — "release now", "find cover later", or "keep assigned" — and records the choice. *What happens:* the manager can't approve leave without seeing the shift consequence. *Trade-off:* one extra tap per approval; the shift is never silently left assigned.
- **C — Auto-release on approval:** approving leave automatically releases the assignment (with optional escalation to the marketplace, GM-07). *What happens:* the shift is immediately open for cover. *Trade-off:* never left assigned to an absent worker; a mistaken approval needs the worker re-added.
- **D — Auto-create a cover request:** approval creates a pending cover request for the shift; the worker stays assigned until a replacement is approved (carried R04). *What happens:* the gap lands visibly in the cover queue. *Trade-off:* matches the carried rule; needs the cover flow to accept manager-created requests.
- **Other (describe) / defer.**

**Evidence:** `backend/workforce/leave_service.py` (`decide_leave` — updates only the leave row), `backend/workforce/roster/worker_actions.py` (`release_worker_from_assignment`, `submit_cover_request`), `backend/workforce/roster/validation.py` (`APPROVED_LEAVE_CONFLICT`).

**Second question after this one:** GM-06-Q05 (leave balances — the other decision that changes what "approved" means).

**Decision status:** OPEN.

---

## Part E — Gaps: code gaps vs decision gaps

### Code gaps (no owner decision needed — build/fix once confirmed; still NO code in this phase)

| # | Gap | Code to touch | Notes |
|---|---|---|---|
| CG-01 | No rule requires an engagement to exist before rostering; a member can be rostered with no pay terms on file | `backend/workforce/roster/validation.py` (`worker_issues`), `backend/workforce/roster/publication.py` | Verify whether roster creation checks for an engagement at all (GM-06-Q01). If not, the "require engagement" decision needs a check, not just a policy |
| CG-02 | Date-range leave notifies nobody on creation (and no decision notice was found for it either — `_notify_slot_leave_decision` only fires for slot-bound rows) | `backend/workforce/leave_service.py` (`_notify_slot_leave_created`, `_notify_slot_leave_decision`) | Slot-bound leave notifies owner + org admins + pharmacy admins; date-range leave is silent. Fix regardless of Q07's answer — silent creation is a bug shape |
| CG-03 | `CoverageRequirement` is never checked anywhere in the files read | `backend/workforce/roster/validation.py`, `backend/workforce/roster/publication.py` | Verify by searching the whole backend for `CoverageRequirement` readers before deciding Q09 — it may be enforced somewhere not read |
| CG-04 | `MembershipWorkSettings` (contracted minutes/pattern) and the engagement's `ordinary_hours_pattern` are two separate stores with no sync traced | `backend/workforce/models.py`, `backend/workforce/employment_terms.py` | Read `employment_terms.py` + `membership_services.py` before implementing Q03 |
| CG-05 | No reminder or roster block for a junior rate review (birthday) approaching | `backend/workforce/employment_engagement_service.py` (`require_end_before_rate_review`) | Q02's recommended reminder; the enforcement exists, the warning doesn't |
| CG-06 | `WorkforceLeaveRequest` edit/cancel sends no notification (managers aren't told a request was withdrawn or changed) | `backend/workforce/leave_service.py` (`update_pending_leave`, `decide_leave` CANCELLED path) | Small fix; verify in the view layer too (`backend/workforce/views.py` not read) |
| CG-07 | Two parallel roster route sets: `workforce/urls.py` (`roster/workspace`, `roster/validate`, `roster/publish`) vs `workforce/roster/urls.py` (`attendance/roster/...` v2 views) — which is canonical is UNKNOWN | `backend/workforce/urls.py`, `backend/workforce/roster/urls.py`, `backend/workforce/views.py`, `backend/workforce/roster/v2_views.py` | GM-07 owns the roster routes; flag here because leave/employment clients must know which roster API to call |

### Decision gaps (owner must choose first — do not build until answered)

GM-06-Q01 (engagement required? who sets it) · Q02 (Award/above-Award + junior birthdays) · Q03 (part-time contracted hours — warn/block/ignore) · Q04 (leave types + pay treatment per type) · Q05 (balances — build/defer/track-taken-only) · Q06 (approved leave and the shift — FIRST) · Q07 (date-range leave — notify + block rostering?) · Q08 (employment end — with GM-05-Q09) · Q09 (coverage requirements — warn/block/drop).

**Order to ask:** Q06 → Q05 → Q04 → Q01 → Q07 → Q03 → Q02 → Q09 → Q08. (Q06 first per Part D; Q05/Q04 decide what "approved leave" means before the rest can be built.)

---

## Part F — Implementation backlog (SEPARATE — FROZEN until the owner answers)

**Do not start any item below until its owner decision is recorded in Part C.** This backlog exists so that, once decisions land, implementation starts from a clear spec with exact files. No branch, no PR, no code change was made in this phase.

| Backlog item | Depends on (owner decision) | Files / functions to touch | Tests to add / update |
|---|---|---|---|
| BL-01 Require a current engagement before roster publish (or owner-only / auto-create, per decision) | Q01 | `backend/workforce/roster/validation.py`, `backend/workforce/roster/publication.py`, `backend/workforce/employment_engagement_service.py` | Roster publish with/without engagement; role/permission matrix |
| BL-02 Junior rate-review reminder + mid-week expiry block (if chosen) | Q02 | `backend/workforce/employment_engagement_service.py`, notification code, roster publish | Birthday boundary (day-before end, successor start); reminder timing |
| BL-03 Contracted-hours warning/block at publish (if chosen) | Q03 | `backend/workforce/roster/validation.py`, `backend/workforce/roster/publication.py`, roster screens | Part-timer over/under contracted hours; override with reason if blocking |
| BL-04 Pay treatment per leave type (paid/unpaid per type + employment type) | Q04 (GM-09 owns the timesheet side) | `backend/workforce/leave_service.py`, `backend/workforce/timesheet_builder.py` (GM-09) | Approved annual/sick/carer's pay treatment by employment type |
| BL-05 Leave balances (accrual, display, warn/enforce) — or taken-days only | Q05 | New balance model/service, `backend/workforce/leave_service.py`, leave screens (web + Expo) | Accrual by employment type; casuals accrue nothing; balance-exceeded warning/block |
| BL-06 Approved-leave → shift handling (prompt / auto-release / auto-cover-request) | Q06 | `backend/workforce/leave_service.py` (`decide_leave`), `backend/workforce/roster/worker_actions.py`, leave decision screens | Slot-bound approval releases/covers/prompts; date-range approval sweeps rostered shifts in range (if decided) |
| BL-07 Date-range leave notifications + roster overlap warning/block | Q07 | `backend/workforce/leave_service.py`, `backend/workforce/roster/validation.py`, `backend/workforce/roster/publication.py` | Silent-path fix (CG-02); publish with overlapping approved leave |
| BL-08 Employment-end flow (with GM-05-Q09 removal consequences) | Q08 | `backend/workforce/models.py`, `backend/memberships/models.py` (`remove()`), roster/offer cleanup | Leaver with future roster/bookings/leave; mid-shift leaver |
| BL-09 Coverage requirement warning/block (or removal) | Q09 | `backend/workforce/roster/validation.py`, `backend/workforce/roster/publication.py`, roster screens | Publish with unmet coverage (warn/acknowledge/block per decision) |
| BL-10 Code gaps CG-01–CG-07, timed by owner | As noted in Part E | As per Part E | Each with web + Expo verification |

**Ordering note:** BL-06 (approved-leave → shift) first after the first decision, then BL-05/BL-04 (what "approved" means for pay), then BL-01/BL-03 (engagement + hours at roster time). GM-07 owns the cover/release mechanics BL-06 calls into; GM-09 owns the timesheet/pay side of BL-04/BL-05; GM-05-Q09 must be decided together with BL-08.

---

## Appendix — Evidence index (per-question source links)

- Head: PR #249 `get` — head `97c4543e051b43fe30ec7e2e61ad3d69957a918e`; Issue #250 `get` — 26 areas, scope freeze, method; PR #184 `get` + `get_files` — head `c786a4b8…`; `docs/qa/launch-grill/questions.json` (SHA `9b700e31…`, 142 questions, 30 carried decisions) and `AUDIT.md` read from `refs/pull/184/head`.
- Files read line by line at head `97c4543…`: `backend/workforce/models.py` (807 lines), `backend/workforce/leave_service.py` (348 lines), `backend/workforce/employment_engagement_service.py` (298 lines), `backend/workforce/urls.py` (63 lines), `backend/workforce/permissions.py` (95 lines), `backend/workforce/roster/validation.py` (85 lines), `backend/shifts/leave.py` (145 lines), `backend/workforce/roster/worker_actions.py` (478 lines), `backend/organizations/models.py` (`use_chemisttasker_payroll`, rates).
- Searched with zero hits in the workforce leave code: balance / accrual / entitle / accrue (no leave-balance model exists).
- Not read (flagged UNKNOWN in text): `backend/workforce/views.py`, `backend/workforce/employment_terms.py`, `backend/workforce/award_rates.py`, `backend/workforce/membership_services.py`, all Vite/Next/Expo employment and leave screens.
- Adopted without re-trace: GM-01 sessions; GM-05 membership (R01, removal, 3-pharmacy cap); GM-04 chain/org definitions; GM-18 LA-Q12; GM-25 structural trace.

*End of GM-06 documentation. No code was changed. No branch or PR was created.*
