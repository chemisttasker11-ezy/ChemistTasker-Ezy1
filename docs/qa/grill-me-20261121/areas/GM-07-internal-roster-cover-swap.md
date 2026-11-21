# GM-07 — Internal roster / cover / swap — Full Grill Documentation

> **Corrections against current code (21 Nov 2026 review).** 10 claims checked at `main` `8ccf8f77` and `pr257` `21add924`; 8 hold, 2 below need the correction shown. Where a question below says otherwise, this table wins. Full evidence: [`../followup/claim-check-2026-11-21.md`](../followup/claim-check-2026-11-21.md).

| Where | Claim in this file | Verdict | Correct statement | Evidence |
|---|---|---|---|---|
| W01 | “cover approvals … refuse dates outside the posting window” | WRONG as a blanket statement (already fixed in the W question text) | The posting window covers new vacancy creation and changed posting dates. Existing-assignment release and swap/replacement approval do not all apply that window. | GUARDED new-shift request: `pr257:backend/shifts/worker_requests.py:263`; existing-assignment release: `:241`; replacement: `pr257:backend/workforce/roster/worker_actions.py:315`; open-shift creation: `pr257:backend/workforce/roster/views.py:441` |
| W02 | booked roster manager may “edit and cancel” own booking | WRONG for cancellation/deletion (already fixed in the W question text) | A booked roster manager can make permitted edits, including description edits. Booked/payment-pending deletion is still refused, so do not claim unrestricted cancellation is currently allowed. | authority: `pr257:backend/organizations/access.py:164`; GUARDED roster deletion: `pr257:backend/workforce/roster/views.py:237`; ordinary deletion: `pr257:backend/shifts/deletion.py:10` |

> **Independent senior audit correction, 21 November 2026:** The owner already approved R04C: the replacement target accepts, passes role/conflict checks, and a manager approves the transfer. The current manager-only transfer is therefore an **IMPLEMENTATION GAP**, not an OPEN yes/no decision and not a supersession. Likewise R04A's per-pharmacy cover-publication control and R06's same-Shift/Slot needs-cover rule are binding directions with missing implementation. The original GM-07-Q04/Q06/Q07 text below is retained as a historical trace of the implementation mismatch; only ask the owner for genuinely missing detail or an explicit change of approved policy. See [owner ledger](../OWNER_DECISION_LEDGER.md).


**Area:** GM-07 Internal roster/cover/swap (Issue #250, area 7 of 26)
**Method:** Issue #250 interview rules + PR #184 format; Web (Vite + Next) and Expo traced together in every question, side by side, including parity gaps.
**Status:** TRACED. Decision status per question in Part C. No owner decision recorded yet. No code changed in this phase — documentation and decisions only.

## Web and Expo today, side by side (pr257 `21add924`)

Source for both web and Expo is `origin/agent/pr257-int` `21add924` (what merges to main). Read-only code check by agy, 21 Nov 2026; every cited file:line was checked to exist at that commit. "Parity question" = a choice for the owner, asked in this area's rounds. "Possible defect (to verify)" = drift that looks unintended; it is confirmed in code before it goes to the engineering backlog, never asked as a question. The Platforms table says which platforms each question applies to.

| Flow | Web (Vite + Next) | Expo | Same? | If different |
|---|---|---|---|---|
| Build draft roster week | Manager plans shifts on calendar grid (`frontend_web/src/components/roster/HorizontalCalendarGrid.tsx:30`). | Manager views and edits roster calendar (`frontend_mobile/app/manager/roster/calendar.tsx:1`). | Yes | — |
| Validate and publish roster | Manager validates roster requirements and publishes week (`frontend_web/src/components/roster/RosterManagerOverview.tsx:45`). | Manager accesses published roster view (`frontend_mobile/app/attendance/published-roster.tsx:1`). | Yes | — |
| Worker roster view & acknowledgement | Worker reviews schedule on roster grid (`frontend_web/src/components/roster/RosterGridViews.tsx:50`). | Manager tracks worker roster acknowledgements (`frontend_mobile/app/manager/roster/acknowledgements.tsx:1`). | Yes | — |
| Shift swap request | Shift engagement terms modal displays roster shift metadata (`frontend_web/src/pages/dashboard/sidebar/ShiftsBoard/components/ShiftEngagementTermsDialog.tsx:15`). | Manager reviews roster approvals including shift swaps (`frontend_mobile/app/manager/roster/approvals.tsx:1`). | Yes | — |
| Roster audit trail | Manager overview records roster status and revision summaries (`frontend_web/src/components/roster/RosterManagerOverview.tsx:70`). | Mobile manager roster audit screen inspects historical changes (`frontend_mobile/app/manager/roster/audit.tsx:1`). | Yes | — |

### Platforms per question
| Question id | Platforms |
|---|---|
| GM-07-Q01 | Web + Expo |
| GM-07-Q02 | Web + Expo |
| GM-07-Q03 | Web + Expo |
| GM-07-Q04 | Web + Expo |
| GM-07-Q05 | Web + Expo |
| GM-07-Q06 | Web + Expo |
| GM-07-Q07 | Web + Expo |
| GM-07-Q08 | Web + Expo |
| GM-07-Q09 | Web + Expo |
| GM-07-Q10 | Web + Expo |

## Bases (exact SHAs verified 2026-11-21)

| Source | Ref | SHA / head |
|---|---|---|
| Active PR #249 (revalidation target) | `refs/pull/249/head` | `97c4543e051b43fe30ec7e2e61ad3d69957a918e`, branch `fix/pr248-expo-production-waves-20261104`, open draft |
| Old grill PR #184 | `refs/pull/184/head` | `c786a4b8182ebf9b505d47cd81980eb3b9851ce3`, branch `docs/launch-grill-20261020` |

**Head-SHA resolution (recorded this session):** PR #249's body names a "working head `26cae2d6`" — that is the short SHA of the last *implementation commit listed in the body*, not the branch head. The API head is `97c4543e051b43fe30ec7e2e61ad3d69957a918e` (458 commits), identical to the Issue #250 snapshot. Every trace below is at that API head.

**No prior trace existed.** A BLOCKED-429 file was reported at `~/workspace/goals/chemisttasker-grill-me/files/GM-07-internal-roster-cover-swap-BLOCKED-429.md`, but it is **no longer on disk** (checked: the directory now contains only GM-11 and GM-22; the file could not be read). This is a full trace from scratch — nothing is carried from the lost file.

**Files read line by line at head `97c4543…`:** `backend/workforce/models.py` (807 lines: `RosterPeriod`, `RosterPublicationAudit`, `RosterAcknowledgement`, `RosterTemplate`, `RosterActionAudit`, `RosterRevisionState`, `RosterOperation`), `backend/workforce/roster/worker_actions.py` (478 lines: `request_direct_swap`, `approve_direct_swap`, `submit_cover_request`, `approve_cover_replacement`, `release_worker_from_assignment`, `reject_worker_shift_request`, `validate_worker_replacement_eligibility`), `backend/workforce/roster/publication.py` (345 lines: `publish_roster_period`, `unpublish_roster_period`, `archive_roster_period`, `get_worker_published_roster`, `unpublish_roster_shift`, `republish_roster_shift`), `backend/workforce/roster/validation.py` (85 lines: `worker_issues`), `backend/workforce/roster/permissions.py` (10 lines, delegating to `workforce/permissions.py`), `backend/workforce/permissions.py` (95 lines), `backend/workforce/roster/urls.py` (65 lines), `backend/workforce/urls.py` (63 lines), `backend/workforce/leave_service.py` (for the leave↔cover interaction), `backend/organizations/models.py` (`auto_publish_worker_requests`).

**Not read at head (marked UNKNOWN where it matters):** `backend/workforce/roster/v2_views.py` (the view layer behind the roster endpoints — function names known from `urls.py`, bodies not read), `backend/workforce/roster/views.py` (`RosterOwnerViewSet`, `RosterWorkerViewSet`, `RosterShiftManageViewSet`, `CreateShiftAndAssignView`), `backend/workforce/roster/services.py` (`_protect_assignment_history`, `refresh_assignment_rate`), `backend/workforce/roster/periods.py` (`validate_roster_period`, `get_roster_period_assignments`), `backend/workforce/roster/slot_locking.py`, `backend/workforce/roster/bulk_edit.py`, `backend/workforce/roster/copying.py`, `backend/workforce/roster/week_templates.py`, `backend/workforce/roster/acknowledgements.py`, `backend/workforce/roster/command_api.py`, `backend/shifts/worker_requests.py` (`WorkerShiftRequest` model — status values seen only via use: PENDING/APPROVED/REJECTED), `backend/shifts/assignment.py` (`guard_roster_assignment`), `backend/shifts/engagement.py` (`staff_assignment_defaults`), all Vite/Next/Expo roster screens.

**Adopted verdicts (not re-traced):** GM-01 session findings; GM-05 roles/membership revalidation (R01; MANAGE_ROSTER capability; removal consequences Q-09); GM-06 employment/leave trace (this session: approved leave does not release the shift; no leave balances); GM-04 chain/org definitions; GM-18 LA-Q12 STILL VALID; GM-25 structural trace.

## How to read this document

- **Plain English first.** The *internal roster* is the pharmacy's own weekly plan for its employed staff (full-time, part-time, casual — carried R01). A *swap* is one worker asking a named colleague to take their shift. *Cover* is a worker saying "I can't work this shift" and a manager finding a replacement. *Release* is a manager taking a worker off a shift without a replacement, so the shift can go back to the marketplace.
- **Code gap** = no owner choice needed; just build/fix it. **Decision gap** = the owner must choose first.
- **Decision status values:** `CARRIED — DECIDED` (settled in #184's carried list or the shift-lifecycle register, do not re-ask — unless the code contradicts the carried rule, in which case the contradiction is the question), `OPEN — NEW` (new GM-07 question; no #184 predecessor), `UNKNOWN` (not inspected at the head).

---

## Part A — Current-flow matrix

Columns: Trigger → Actor → Backend / API → Vite web → Next web → Expo mobile → Persisted state → Event / side effect → Recovery / denial path.

### F01 — Manager builds a draft roster week

| Trigger | Actor | Backend / API | Vite | Next | Expo | Persisted state | Event / side effect | Recovery / denial |
|---|---|---|---|---|---|---|---|---|
| Manager creates/edits roster shifts for a week | Owner / roster manager (`can_manage_roster_pharmacy`: owner, superuser, `PharmacyAdmin` with MANAGE_ROSTER, or org member with `OrgCapability.MANAGE_ROSTER` scoped to the pharmacy) | Roster weeks are `RosterPeriod` rows: one per pharmacy per Monday (`week_start` must be a Monday, unique per pharmacy+week), status DRAFT / PUBLISHED / ARCHIVED. Draft assignments are `ShiftSlotAssignment` rows with `is_rostered=True` linked to the period's slots. Endpoints: `roster-owner` / `roster-shifts` viewsets + `POST roster/create-and-assign-shift/` (`backend/workforce/roster/urls.py`); `POST roster/workspace/` + `roster/validate/` (`backend/workforce/urls.py`) — two parallel route sets, canonical one UNKNOWN (CG-07). Templates: `RosterTemplate` (weekly template, apply to generate draft assignments); copy-week; bulk-edit (v2 views, bodies not read) | Roster screens (Oct 2026 names; not re-traced at head) | UNKNOWN | Roster screens (Oct 2026: `app/my-roster.tsx` is the worker view; manager screens not re-traced) | `RosterPeriod` (DRAFT), draft `ShiftSlotAssignment` rows, `RosterRevisionState` (draft/published/validated revision counters) | None to workers — **draft assignments are never shown to workers** (`get_worker_published_roster`: "DRAFT assignments are NEVER returned") | Invalid week (not Monday) → ValidationError. Unauthorised manager → PermissionDenied ("You are not authorized to manage roster/workforce operations for this pharmacy") |

### F02 — Manager validates and publishes the roster week

| Trigger | Actor | Backend / API | Vite | Next | Expo | Persisted state | Event / side effect | Recovery / denial |
|---|---|---|---|---|---|---|---|---|
| Manager publishes the week | Owner / roster manager (`is_authorized_attendance_manager`) | `publish_roster_period` (`backend/workforce/roster/publication.py`): locks the period row (`select_for_update`); archived periods cannot publish; runs `validate_roster_period` — **blocking errors stop publication**; warnings stop it too unless `force_warnings` or the manager acknowledges specific warning keys (`reviewed_validation`); sets status PUBLISHED + `published_at`/`published_by`; restores any individually withdrawn slots (`unpublished_at=None`); writes a `RosterPublicationAudit` (revision number, total assignments, validation snapshot); notifies every rostered worker (in-app `notify_users`, title "Roster published", action URL `/dashboard/<role>/roster`, payload `roster_period_id` + `revision_number`). Re-publishing an already-published week with no acknowledged warnings returns the period + validation without a new audit row | UNKNOWN | UNKNOWN | UNKNOWN | `RosterPeriod` PUBLISHED, `RosterPublicationAudit` row (revision n), workers notified | Workers see their published shifts and are asked to acknowledge (F03). **Publishing never triggers shift escalation** (carried E03) and never converts marketplace bookings (assignments are created `is_rostered=True`; publishing never converts) | Validation errors → ValidationError listing every blocking message. Warnings unacknowledged → ValidationError listing warnings. Notification failure per worker is logged, not fatal (`logger.exception`, loop continues) |

### F03 — Worker sees the published roster and acknowledges it

| Trigger | Actor | Backend / API | Vite | Next | Expo | Persisted state | Event / side effect | Recovery / denial |
|---|---|---|---|---|---|---|---|---|
| Worker opens their roster; taps acknowledge | Rostered worker | `get_worker_published_roster` (publication.py): only `is_rostered=True` assignments whose pharmacy week is PUBLISHED; draft weeks, unpublished slots (`slot.unpublished_at` set) and assignments without a slot date are excluded. Acknowledge: `POST attendance/roster/acknowledge/` → `WorkerAcknowledgeRosterView`; status per period: `GET attendance/roster/acknowledgements/<period_id>/` (`RosterAcknowledgementStatusView`). Model: `RosterAcknowledgement` — unique per (roster_period, user), with `acknowledged_at` | `/dashboard/<role>/roster` (from the notification action URL) | UNKNOWN | UNKNOWN | `RosterAcknowledgement` row | Manager can see who has acknowledged (status view) | **Nothing in the code read forces acknowledgement or acts on a missing one** — no deadline, no escalation, no consequence for never acknowledging (see GM-07-Q03). A worker who never opens the app never sees the roster |

### F04 — Manager unpublishes a week, a single shift, or archives the week

| Trigger | Actor | Backend / API | Vite | Next | Expo | Persisted state | Event / side effect | Recovery / denial |
|---|---|---|---|---|---|---|---|---|
| Manager pulls the roster back | Owner / roster manager | `unpublish_roster_period`: PUBLISHED → DRAFT; "Draft shifts will immediately be hidden from worker views"; bumps the roster revision (so a previous review can't silently undo another manager's withdrawal). `unpublish_roster_shift` / `republish_roster_shift`: per-shift withdrawal/republish (bodies not read). `archive_roster_period`: PUBLISHED → ARCHIVED only (a DRAFT cannot be archived — "Publish the roster before archiving it"); archived periods cannot be published or unpublished | UNKNOWN | UNKNOWN | UNKNOWN | Status changes; `RosterActionAudit` rows for unpublish/republish (`SHIFT_UNPUBLISHED`, `SHIFT_REPUBLISHED`) | Workers lose sight of the withdrawn shifts immediately. No notification on unpublish was found in the code read (CG-04) | Archived → any publish/unpublish → ValidationError. Draft → archive → ValidationError |

### F05 — Worker requests a direct swap with a named colleague

| Trigger | Actor | Backend / API | Vite | Next | Expo | Persisted state | Event / side effect | Recovery / denial |
|---|---|---|---|---|---|---|---|---|
| Worker asks a named colleague to take their shift | The assigned worker only | `POST attendance/roster/worker/swap-request/` → `RosterWorkerSwapRequestView` → `request_direct_swap` (`backend/workforce/roster/worker_actions.py`): requester must be the current assignee; target cannot be self; target eligibility checked **at request time** (`validate_worker_replacement_eligibility` → `worker_issues`: active accepted non-CONTACT membership at this pharmacy, role match, no overlapping shift ±2 days, no approved leave overlapping, availability warning also blocks); creates a `WorkerShiftRequest` (PENDING, note "Direct swap request with <name>. …") + `RosterActionAudit` (SWAP_REQUESTED). **CRITICAL RULE (in code): submitting preserves the assignment — the requester stays assigned until a replacement is approved** (carried R04/D04) | UNKNOWN — swap screens not traced at head | UNKNOWN | UNKNOWN | `WorkerShiftRequest` PENDING + audit row | No notification to the target or the manager was found in `worker_actions.py` (CG-03). The target is **never asked to accept** (see F06 / Q04) | Not the assignee → PermissionDenied. Self-swap → ValidationError. Ineligible target → ValidationError listing every issue. Booked/payment-pending shifts cannot be swapped (`_guard_booked` → `guard_roster_assignment` — "cancel the booking instead") |

### F06 — Manager approves a direct swap

| Trigger | Actor | Backend / API | Vite | Next | Expo | Persisted state | Event / side effect | Recovery / denial |
|---|---|---|---|---|---|---|---|---|
| Manager approves the swap | Owner / roster manager (`is_authorized_attendance_manager`) | `POST attendance/roster/manager/approve-swap/` → `approve_direct_swap`: locks the request + assignment (`select_for_update`); request must still be PENDING; manager must be authorised for *that* pharmacy; assignment must still belong to the requester ("Stale request: the requesting worker is no longer assigned"); target is taken from the original SWAP_REQUESTED audit row (a different `target_user` argument is rejected); **eligibility is re-verified at decision time**; then `_reassign` hands the assignment to the target **under the target's own staff terms** (`staff_assignment_defaults` + `refresh_assignment_rate` — never the departing worker's terms); request → APPROVED + `resolved_by`/`resolved_at`; audit SWAP_APPROVED. All in one transaction | UNKNOWN | UNKNOWN | UNKNOWN | Assignment `user` = target; request APPROVED; audit row | The requester is off the shift; the target is on it. **The target never accepted** — manager approval alone transfers the shift. This contradicts carried R04C ("The target accepts, passes role and conflict checks, and a manager approves the transfer") — see GM-07-Q04 | Already-decided request → ValidationError ("already approved/rejected"). Stale assignment → ValidationError. Target now ineligible (new overlap, new approved leave) → ValidationError. Wrong-pharmacy manager → PermissionDenied |

### F07 — Worker requests cover ("can't work")

| Trigger | Actor | Backend / API | Vite | Next | Expo | Persisted state | Event / side effect | Recovery / denial |
|---|---|---|---|---|---|---|---|---|
| Worker says they can't work a shift | The assigned worker only | `POST attendance/roster/worker/cover-request/` → `submit_cover_request`: requester must be the assignee; **no target is named, no eligibility check runs at request time** (unlike swap); creates a `WorkerShiftRequest` (PENDING, note = reason or "Worker requested shift cover.") + audit COVER_REQUESTED. Assignment preserved (carried R04/D04). **No "publish cover" step exists** — there is no per-pharmacy "who can publish cover" setting in the code read (carried R04A has no mechanism; the only candidate, `Pharmacy.auto_publish_worker_requests`, is read by no backend code — CG-02 / GM-04 CG-02). No invite-to-cover step exists either (carried R04B: "named eligible colleagues" — the request names nobody; the manager picks the replacement at approval, F08) | UNKNOWN | UNKNOWN | UNKNOWN | `WorkerShiftRequest` PENDING + audit row | No notification found in `worker_actions.py` (CG-03). The shift stays assigned to the requester | Not the assignee → PermissionDenied. (No booked-shift guard at *request* time — the guard runs at approval/release, F08/F09) |

### F08 — Manager approves a cover replacement

| Trigger | Actor | Backend / API | Vite | Next | Expo | Persisted state | Event / side effect | Recovery / denial |
|---|---|---|---|---|---|---|---|---|
| Manager names a replacement and approves | Owner / roster manager | `POST attendance/roster/manager/approve-replacement/` → `approve_cover_replacement`: same locking, PENDING, authorisation, staleness and pharmacy checks as F06; replacement eligibility verified at decision time (`worker_issues` — role, overlap, approved leave, availability); `_reassign` under the replacement's own staff terms; request → APPROVED; audit COVER_APPROVED. One transaction | UNKNOWN | UNKNOWN | UNKNOWN | Assignment `user` = replacement; request APPROVED; audit row | The requester is off the shift; the replacement is on it. **No vacancy is ever opened** — the shift never appears as "needs cover" (carried R06 says a cover opened as a vacancy is "the same shift and slot, shown as needs cover and linked to the vacancy. No duplicate." — that vacancy path does not exist in this flow; the only vacancy-like path is release+escalate, F09). The replacement never accepted either (Q04) | As F06, plus: booked/payment-pending shift → ValidationError via `_guard_booked` ("cancel the booking instead") |

### F09 — Manager releases a worker without a replacement (shift goes back to the marketplace)

| Trigger | Actor | Backend / API | Vite | Next | Expo | Persisted state | Event / side effect | Recovery / denial |
|---|---|---|---|---|---|---|---|---|
| Manager releases the worker from a shift | Owner / roster manager | `POST attendance/roster/manager/release-worker/` → `release_worker_from_assignment`: locks the request; requester must still be the assignee; **deletes the `ShiftSlotAssignment` row** (after `_protect_assignment_history`) but **reuses the existing Shift and ShiftSlot — never creates a duplicate marketplace shift**. If `escalate_to_visibility` is given, the shift's visibility is moved to that tier (`apply_escalation`; PUBLIC tier enforces the public daily limit `enforce_public_shift_daily_limit`); roster-linked slots are detached (`roster_period=None`). Request → APPROVED (note: a release *approves* the worker's request); audit WORKER_RELEASED with the escalation tier + shift id. Booked/payment-pending shifts are guarded (`_guard_booked`) | UNKNOWN | UNKNOWN | UNKNOWN | Assignment row deleted; shift visibility possibly widened; request APPROVED; audit row | The shift is open again — to the chosen audience if escalated, otherwise to nobody in particular (the shift exists, unassigned, at its previous visibility). **No notification to anyone was found in this function** (CG-03). No "needs cover" flag is set on the shift (R06's vacancy display is not produced here either) | Stale request → ValidationError. Booked shift → ValidationError. Invalid escalation tier for the pharmacy → ValidationError |

### F10 — Manager rejects a swap or cover request

| Trigger | Actor | Backend / API | Vite | Next | Expo | Persisted state | Event / side effect | Recovery / denial |
|---|---|---|---|---|---|---|---|---|
| Manager says no | Owner / roster manager | `POST attendance/roster/manager/reject-request/` → `reject_worker_shift_request`: locks the request; must be PENDING; manager authorised for that pharmacy; request → REJECTED + `resolved_by`/`resolved_at` (+ reason, stored in the audit `details`, not on the request); audit SWAP_REJECTED or COVER_REJECTED — **classified by whether the word "swap" appears in the request note** (`"swap" in (req.note or "").lower()`), a fragile heuristic (CG-01). The original assignment remains completely intact | UNKNOWN | UNKNOWN | UNKNOWN | Request REJECTED; audit row | Worker stays assigned. **No notification to the worker was found in this function** (CG-03) — the worker is not told their request was rejected, as far as the code read shows | Already-decided → ValidationError. Wrong-pharmacy manager → PermissionDenied |

### F11 — Roster audit trail

| Trigger | Actor | Backend / API | Vite | Next | Expo | Persisted state | Event / side effect | Recovery / denial |
|---|---|---|---|---|---|---|---|---|
| Any roster action happens | System | `RosterActionAudit` (append-only log): SWAP_REQUESTED/APPROVED/REJECTED, COVER_REQUESTED/APPROVED/REJECTED, WORKER_RELEASED, LEAVE_REQUESTED/APPROVED, SHIFT_UNPUBLISHED/REPUBLISHED — with pharmacy, assignment, `performed_by`, `target_user`, `details` JSON, `created_at`. List endpoint: `GET attendance/roster/audits/` (`RosterActionAuditListView`). `RosterRevisionState` tracks draft/published/validated revision counters per period; `RosterOperation` records idempotent roster operations (`operation_type`, `request_hash`, `result_json`) | UNKNOWN | UNKNOWN | UNKNOWN | Audit rows | A full history of who asked for, approved, rejected or released what | Audit rows are never deleted by the code read (no delete path seen) |

### Web vs Expo parity gaps (GM-07-specific)

| Area | Web | Expo | Gap type |
|---|---|---|---|
| Roster build / publish screens | UNKNOWN — not traced at head | UNKNOWN — not traced at head | **Not traced, not "no gap"** — the endpoints exist on both route sets; the screens were not read |
| Worker roster view + acknowledge | `/dashboard/<role>/roster` (notification action URL, backend) | `app/my-roster.tsx` (Oct 2026 name; not re-traced) | Unknown on both |
| Swap / cover request screens | UNKNOWN | UNKNOWN | Unknown on both — the backend accepts both request types from either client (same API) |
| Manager approve / reject / release screens | UNKNOWN | UNKNOWN | Unknown on both |
| `auto_publish_worker_requests` toggle | Referenced in `PharmacyPage` / `PharmacyPage.model.ts` | Referenced in mobile `PharmacyForm.tsx` | No parity gap in the *field*; the toggle does nothing on either client (CG-02) |

### Actors and what each can do today

- **Pharmacy owner / superuser:** everything roster — build, validate, publish, unpublish, archive, approve/reject/release (via `can_manage_roster_pharmacy`).
- **Pharmacy admin (MANAGER / ROSTER_MANAGER):** same roster powers as the owner for their pharmacy (GM-05: MANAGER holds all four capabilities; ROSTER_MANAGER holds roster + comms). COMMUNICATION_MANAGER cannot manage the roster.
- **Org-wide admin with MANAGE_ROSTER scoped to the pharmacy:** same, via `_org_has_capability`.
- **Employed worker (assigned):** request a swap with a named colleague, or request cover, for their own shifts only. Cannot approve, reject, or release anything. Stays assigned until a manager approves a replacement or a release.
- **Employed worker (not assigned):** cannot request anything for a shift they don't hold; can only be *named* as a swap target or *chosen* as a cover replacement by a manager — never asked to accept (Q04).
- **Locum / favourite / Shift Hero:** no roster membership (R01) — they cannot be swap/cover targets through this flow unless they hold an active accepted membership at the pharmacy (`worker_issues` requires one); cover that goes to the marketplace is a shift offer (GM-12), not a roster action.

---

## Part B — Old questions re-validated (PR #184 / #204 / shift-lifecycle)

Method: all 142 questions in `questions.json` (re-read from `refs/pull/184/head` this session) were scanned for roster/cover/swap mechanics; the shift-lifecycle carried decisions were scanned the same way. #184 itself has **no standalone roster/cover/swap questions** — the roster rules live in the carried decisions from the shift-lifecycle register (#182), which #184 reused without re-asking.

| Old ID | Old question / carried rule | Verdict | Evidence (current code at head `97c4543…`) |
|---|---|---|---|
| R01 (carried) | Who belongs on the internal roster? "Only employed staff: full-time, part-time, casual. Locums and favourites go through shift offers." | **CARRIED — DECIDED, still valid** | `worker_issues` requires an active accepted non-CONTACT membership; `EmploymentEngagement.clean` enforces FULL_TIME/PART_TIME/CASUAL. GM-05 revalidated the same rule. |
| R04 (carried) | Staff swap and cover requests: "Staff can ask for swap or cover. No release until a manager decides or a replacement is fulfilled. Public worker cancels…" | **CARRIED — DECIDED, implemented** | `request_direct_swap` / `submit_cover_request` preserve the assignment; release only via manager approval (`approve_direct_swap`, `approve_cover_replacement`, `release_worker_from_assignment`). |
| R04A (carried) | Who allows staff to publish cover? "The owner sets it per pharmacy, not per worker or role." | **CARRIED — DECIDED, but NO MECHANISM EXISTS** | The only candidate setting, `Pharmacy.auto_publish_worker_requests`, is read by **no backend code** (default-branch search: models/serializers/clients only). There is no "publish cover" step anywhere in `worker_actions.py`. The decision stands; the implementation does not. See GM-07-Q06. |
| R04B (carried) | Who can staff invite to cover? "Named eligible colleagues. Widening to favourites or public needs a manager." | **CARRIED — DECIDED, partly implemented** | Swap names a colleague (F05). Cover names **nobody** — the manager picks the replacement at approval (F08). No invite-to-cover step exists; "widening to favourites or public" happens only via release+escalate (F09), which needs a manager. See GM-07-Q05. |
| R04C (carried) | When is a replacement fulfilled? "The target accepts, passes role and conflict checks, and a manager approves the transfer." | **CARRIED — DECIDED, but CONTRADICTED BY THE CODE** | Role/conflict checks happen (twice: at request and at approval). Manager approval happens. **The target never accepts** — there is no accept step, no target notification, and no target-facing endpoint in `worker_actions.py` or `roster/urls.py`. The transfer is manager-only. This is the first question (GM-07-Q04). |
| R04D (carried) | Public worker wants to cancel: "Always needs manager approval. Near start, emergency escalation with reason and notices. No self-cancel." | **CARRIED — DECIDED** | Roster workers cannot self-cancel (they can only request; the assignment stands until a manager acts). The "emergency escalation near start" half was not traced here — GM-15 owns cancellation. |
| R06 (carried) | Cover opened as a vacancy: "Same shift and slot, shown as needs cover and linked to the vacancy. No duplicate." | **CARRIED — DECIDED, but NO VACANCY EXISTS in this flow** | Cover approval reassigns directly (F08) — no vacancy is opened, no "needs cover" flag is set. Release+escalate (F09) reuses the shift/slot with no duplicate, but sets no vacancy display either. See GM-07-Q07. |
| D04 (carried) | Who can cancel? "Owner and authorised managers, with guards. Staff request cover, swap or cancel, stay assigned until approved or replaced." | **CARRIED — DECIDED, implemented** | Matches F05–F10 exactly. |
| D05 (carried) | Cancel one date or all? "One date, selected dates or the whole posting. Other dates and history stay." | **CARRIED — DECIDED** | Per-assignment actions (one shift/slot at a time) — the multi-date behaviour lives in cancellation (GM-15), not in this flow. |
| E03 (carried) | Escalation timing: "Owner picks escalation intervals when posting. Roster publishing never triggers escalation." | **CARRIED — DECIDED, implemented** | `publish_roster_period` touches no escalation; release+escalate (F09) is an explicit manager choice, not a publish side effect. |
| LA-Q11 (launch) | Fix before launch? "The auto-publish setting contradicts R06/R04B and is missing on mobile." | **CHANGED — half fixed, behaviour still dead** | Mobile `PharmacyForm.tsx` now references the flag (default-branch search) — the "missing on mobile" half is fixed at field level. But the flag still does nothing (no backend reader) and its help text still contradicts R06/R04B. See GM-07-Q06 / CG-02. |
| CX-Q06 | Inside the window, who is alerted and how fast? | **NOT GM-07 — route to GM-15/GM-22** | Cancellation alerting/timing. Roster worker requests have their own notification gap (CG-03) — related but not the same question. |
| CX-Q07 | If no manager answers before start and the worker doesn't come, what is it? | **PARTLY GM-07/GM-08 — boundary** | "The worker stays assigned until approved or replaced" (R04) — implemented (F05–F10). What the absence *is* (no-show) is GM-08's CX-Q11, still undecided. |
| CX-Q16 | Can the manager release a no-show's slot and repost straight away? "No emergency release exists (D13)." | **CHANGED — release now exists** | `release_worker_from_assignment` (F09) is the emergency release, with optional escalation. Whether it satisfies D13's "repost straight away" (notices, timing) is GM-15/GM-08 territory. |
| BK-Q11 | Can a worker hold a reservation that overlaps another booking or roster shift? | **NOT GM-07 — route to GM-12/GM-13** | Overlap rule for reservations vs roster. Roster-side overlap *is* checked (`worker_issues` SHIFT_OVERLAP) — but only against `ShiftSlotAssignment` rows, not reservations/offers. |
| AV-Q03 | When does availability 'match' a shift? "Roster checks need the shift fully inside the availability." | **PARTLY GM-07 — implemented as a warning-that-blocks** | `worker_issues`: availability outside the shift is a *warning* — but `validate_worker_replacement_eligibility` raises on warnings too, so for swap/cover it blocks. Whether roster *creation* treats it the same way was not traced (validation at publish is in `periods.py`, not read). |

**Old questions NOT carried forward unvalidated:** none — every candidate above was re-checked against the head, or is explicitly marked as routed elsewhere with its destination.

---

## Part C — GM-07 question queue (carried + new, #184 format)

Per-question format: plain-English explanation first, then ACTUAL TODAY with **Web** and **Expo** side by side, RECOMMENDED, ALTERNATIVE A (keep), ALTERNATIVE B/C, Other/defer. Normal case, edge case, retry/concurrency, denied role/wrong tenant, payment/notification side effects, and Web/Expo difference are shown inside each question. Sources are at head `97c4543…` unless noted. Decision status: **OPEN** for all — no owner answer recorded.

### GM-07-Q01 — Is the weekly draft → validate → publish → acknowledge roster the right shape?

**Plain English:** today a roster is a week (Monday to Sunday) that a manager drafts, the system validates, the manager publishes, and workers are asked to acknowledge. Drafts are invisible to workers. That shape is built — but nobody has confirmed a week is the right unit, or that publishing should be all-or-nothing per week.

**ACTUAL TODAY — Web and Expo (same backend):** `RosterPeriod`: one per pharmacy per Monday, DRAFT/PUBLISHED/ARCHIVED. Publish validates (errors block; warnings need force/acknowledge), writes a revisioned audit, notifies workers. Unpublish (whole week or single shift) hides shifts immediately. Archive only from published. Copy-week and templates exist. Workers see published weeks only.
**Normal case:** manager drafts next week, publishes Friday, workers acknowledge over the weekend. **Edge case:** a mistake is found in one shift of a published week — the manager can unpublish that single shift (`unpublish_roster_shift`) or the whole week; whether unpublishing a single shift notifies its worker is UNKNOWN (no notification found in the code read). **Retry/concurrency:** publish locks the period row; two managers publishing at once serialise on the lock; revision counters track draft/published/validated revisions. **Denied role / wrong tenant:** only that pharmacy's roster managers can publish; org admins need a scoped MANAGE_ROSTER capability. **Payment/notification:** publish notifies workers (in-app); unpublish/archive send nothing found. **Web/Expo difference:** none in the rule — backend behaviour; screens not traced.
**RECOMMENDED:** KEEP the weekly draft → publish shape, and add per-shift unpublish notices (same recipients as the publish notice). Severity: low for the shape, medium for the missing unpublish notice.
**ALTERNATIVE A — Keep current logic:** weekly shape as-is, silent unpublishes. Trade-off: no work; a worker can lose a shift without being told.
**ALTERNATIVE B — Fortnightly / monthly periods:** Trade-off: fewer publishes; bigger blast radius per mistake and a worse acknowledgement story.
**ALTERNATIVE C — No draft state (publish-as-you-go):** every roster change is live immediately. Trade-off: simplest, but workers see half-built rosters and there is no validation gate.
**Other (describe) / Defer.**
**Sources:** `backend/workforce/models.py` (`RosterPeriod`, `RosterPublicationAudit`, `RosterAcknowledgement`), `backend/workforce/roster/publication.py` (all functions), `backend/workforce/roster/urls.py`.
**Decision status:** OPEN — NEW.

### GM-07-Q02 — Who can build and publish a roster — owner, manager, roster manager, org admin?

**Plain English:** today the owner, any manager, any roster manager, and a scoped org admin can all publish a roster. A communications manager cannot. That is the rule in code — but it means a roster manager can publish a week the owner has never seen.

**ACTUAL TODAY — Web and Expo (same backend):** `can_manage_roster_pharmacy` (owner, superuser, `PharmacyAdmin` MANAGE_ROSTER via `can_manage_roster`, or org member with `OrgCapability.MANAGE_ROSTER` scoped to the pharmacy). GM-05 (adopted): OWNER and MANAGER hold identical capabilities; ROSTER_MANAGER holds roster + comms; COMMUNICATION_MANAGER holds comms only. Every publish/unpublish/archive/approve/reject/release path in this area goes through the same `is_authorized_attendance_manager` check.
**Normal case:** the roster manager builds and publishes the week. **Edge case:** owner on leave; a manager publishes — allowed today. Two managers disagree — either can unpublish the other's week (no lock-out besides the row lock during the call). **Retry/concurrency:** row locks serialise concurrent publishes; no approval workflow between two managers. **Denied role / wrong tenant:** a manager of Pharmacy A publishing Pharmacy B's roster → PermissionDenied (scoped check). **Payment/notification:** publish notifies workers; the owner is not separately notified that someone else published. **Web/Expo difference:** none — backend rule; whether the screens hide publish from unauthorised roles is UNKNOWN (screens not traced).
**RECOMMENDED:** KEEP who can publish, but require the *owner* (or a named delegate) to approve the first publish of a week when the publisher is not the owner — a lightweight second pair of eyes, not a veto. Severity: medium — publishing is the moment workers' plans change.
**ALTERNATIVE A — Keep current logic:** anyone with MANAGE_ROSTER publishes freely. Trade-off: no work; the owner may first hear about a roster from a worker.
**ALTERNATIVE B — Owner-only publish:** managers draft, only the owner publishes. Trade-off: tightest control; the owner is a bottleneck every week.
**ALTERNATIVE C — Split build vs publish:** roster managers build, managers+owners publish. Trade-off: a real separation of duties; needs a new capability split (the matrix has no "build but not publish").
**Other (describe) / Defer.**
**Sources:** `backend/workforce/permissions.py` (`can_manage_roster_pharmacy`), `backend/workforce/roster/permissions.py`, `backend/workforce/roster/publication.py`, GM-05 adopted revalidation.
**Decision status:** OPEN — NEW.

### GM-07-Q03 — Workers are asked to acknowledge the roster — what if they never do?

**Plain English:** when a roster publishes, every worker gets a notice asking them to acknowledge it. The product records who acknowledged — and then does nothing with that information. There is no deadline, no reminder, and no consequence for never acknowledging.

**ACTUAL TODAY — Web and Expo (same backend):** Publish notifies each rostered worker (in-app, action URL `/dashboard/<role>/roster`). `RosterAcknowledgement` is unique per (period, user) with `acknowledged_at`; a status view shows who has acknowledged. Nothing in the code read enforces acknowledgement, reminds the worker, escalates to the manager, or blocks anything on a missing acknowledgement.
**Normal case:** worker sees the notice, opens the roster, acknowledges. **Edge case:** worker never opens the app — they never see the roster, never acknowledge, and the manager has no signal beyond the status view (which they must go and check). Worker acknowledges, then the week is unpublished and republished — is the old acknowledgement still valid? The republish path restores withdrawn slots and writes a new audit revision; whether acknowledgements reset on republish was not traced (UNKNOWN). **Retry/concurrency:** n/a. **Denied role:** n/a. **Payment/notification:** acknowledgement is the only proof a worker saw their shifts; without a consequence it is a read receipt. **Web/Expo difference:** none in the rule; whether Expo surfaces the notice and the acknowledge action identically is UNKNOWN (screens not traced).
**RECOMMENDED:** Acknowledgement is a read receipt, not a gate — but add a reminder 24h before the week starts to workers who haven't acknowledged, and show the unacknowledged list on the manager's roster screen. Severity: low-medium — cheap, and it closes the "did they see it?" question that otherwise becomes a phone call.
**ALTERNATIVE A — Keep current logic:** ask once, record, do nothing. Trade-off: no work; managers must chase acknowledgements by hand.
**ALTERNATIVE B — Acknowledgement gates the shift:** a worker who hasn't acknowledged can't be marked present / can't clock in (GM-08) until they do. Trade-off: strongest signal, but a worker who forgot to tap is blocked at the door on Monday.
**ALTERNATIVE C — Drop acknowledgement:** publish notice only, no acknowledgement at all. Trade-off: honest about what the product enforces; loses the only proof-of-sight.
**Other (describe) / Defer.**
**Sources:** `backend/workforce/models.py` (`RosterAcknowledgement`), `backend/workforce/roster/publication.py` (`_notify_roster_publication`, `publish_roster_period`), `backend/workforce/roster/urls.py` (acknowledge + acknowledgement-status endpoints).
**Decision status:** OPEN — NEW.

### GM-07-Q04 — Target consent before swap or cover approval (R04C)

**Decision status:** Answered: the target accepts, passes role and conflict checks, and a manager approves, carried R04C - see BL-06. Engineering: see BL-06.

**Actual today:** A manager can approve a swap or replacement without the target accepting. The role, conflict, leave and availability checks still run (`pr257:backend/workforce/roster/worker_actions.py:209`, `:329`).

### GM-07-Q05 — Cover invitations and widening (R04B)

**Decision status:** Answered: staff invite named eligible colleagues; a manager must widen to favourites or the public, carried R04B - see BL-06. Engineering: see BL-06.

**Actual today:** A swap names one colleague. A cover request names nobody and the manager picks an eligible worker at approval. Manager release to the marketplace is the current route to a wider audience (`pr257:backend/workforce/roster/worker_actions.py:279`).

### GM-07-Q06 — Per-pharmacy permission to publish cover (R04A / LA-Q11)

**Decision status:** Answered: the pharmacy setting controls who can publish cover, carried R04A and R06 - see BL-06.

**Actual today:** Web and Expo expose `auto_publish_worker_requests`. The cover handler does not consult it. Its help text promises a new shift, while R06 keeps the existing shift and slot (`pr257:backend/organizations/models.py:240`, `pr257:backend/workforce/roster/worker_actions.py:234`). Engineering: see BL-06.

### GM-07-Q07 — When cover is needed, should the shift become a visible vacancy ("needs cover")?

**Plain English:** the rulebook says a cover opened as a vacancy is the same shift and slot, shown as "needs cover" and linked to the vacancy — no duplicate. Today there is no vacancy and no "needs cover" display anywhere in this flow. A cover request is invisible except to the manager who opens the request list.

**ACTUAL TODAY — Web and Expo (same backend):** Cover approval reassigns directly (F08). Release deletes the assignment and optionally widens visibility (F09) — but sets no vacancy flag and sends no notice. No `needs_cover` field, flag, or display was found in the files read (`worker_actions.py`, `publication.py`, `models.py` — searched in this pass for vacancy/cover display; none found). The marketplace boards show shifts by visibility tier, not by cover need.
**Normal case:** worker requests cover for Saturday; the manager sees the request in their list and picks someone. **Edge case:** manager is away — nobody else can see the shift needs cover, so it sits until the manager returns. The shift's own worker still shows as assigned (R04), so the boards don't show a gap either. **Retry/concurrency:** n/a. **Denied role / wrong tenant:** a vacancy visible to the wrong audience would leak staffing gaps; scoping (staff-only? favourites? public?) is part of the decision. **Payment/notification:** a visible vacancy could attract favourites/public (GM-12 offer terms) instead of staff terms — the pay basis changes with the audience. **Web/Expo difference:** none — the absence is backend-wide.
**RECOMMENDED:** Show an open cover request as "needs cover" to the pharmacy's own staff (and to named colleagues the requester suggested, Q05) — same shift, same slot, linked to the request — and only widen to favourites/public by an explicit manager action. Severity: medium — visibility is what makes cover fill fast; without it, everything depends on one manager's list.
**ALTERNATIVE A — Keep current logic:** cover requests visible only in the manager's request list; no vacancy anywhere. Trade-off: no work; cover fills at the speed of the manager.
**ALTERNATIVE B — Vacancy to the whole marketplace immediately:** an approved cover request (or a request itself) opens the shift to the public board. Trade-off: fastest fill; breaks R04 (stay assigned until replaced) in spirit — the public sees a shift that still shows a worker assigned — and pays on offer terms.
**ALTERNATIVE C — Vacancy, but staff-only and manager-gated:** the manager turns a cover request into a vacancy with one tap. Trade-off: the manager keeps control; one more step.
**Other (describe) / Defer.**
**Sources:** `backend/workforce/roster/worker_actions.py` (no vacancy), `backend/workforce/roster/publication.py`, carried R06, `backend/workforce/roster/urls.py` (no vacancy endpoint).
**Decision status:** OPEN.

### GM-07-Q08 — How late can a swap or cover request come in — and what happens near the start?

**Plain English:** today there is no deadline at all. A worker can request a swap or cover five minutes before the shift starts, and the code will happily accept the request. Whether a manager can still approve it in time, and what happens if nobody answers, is entirely up to the people involved.

**ACTUAL TODAY — Web and Expo (same backend):** No time-based rule was found in `worker_actions.py`, `validation.py`, or `publication.py`: no cut-off, no "too late" rejection, no escalation for unanswered requests near start, no expiry of pending requests. A pending request stays PENDING until a manager decides it (even after the shift has started or ended — no cleanup was found). Carried R04D covers public-worker cancellation near start ("emergency escalation with reason and notices") — that escalation path was not traced here (GM-15).
**Normal case:** worker requests cover the day before; manager approves the same day. **Edge case:** request 10 minutes before start; manager approves 5 minutes after start — the replacement is assigned to a shift that has begun (attendance GM-08: clock-in window is ±2h, so they can still clock in). Request never answered — the worker stays assigned and is expected to show up (R04), but if they don't, that's a no-show (GM-08, CX-Q11 undecided). **Retry/concurrency:** n/a. **Denied role:** n/a. **Payment/notification:** a late approval changes who is paid, possibly after the shift started; no notice is sent on approval/rejection today (CG-03), so a late decision may not even be seen. **Web/Expo difference:** none — backend absence.
**RECOMMENDED:** No hard cut-off for *requesting* (a late request is better than a silent no-show), but add a deadline for *deciding*: requests inside 2 hours of start escalate (notify the owner + all managers, not just the roster list), and a request still pending at start time is flagged "unanswered — worker still assigned" on the manager screen. Severity: medium — the near-start case is where cover matters most.
**ALTERNATIVE A — Keep current logic:** no deadlines, no escalation, pending requests never expire. Trade-off: no work; near-start requests depend entirely on a manager happening to look.
**ALTERNATIVE B — Hard cut-off:** no swap/cover requests inside N hours of start (owner picks N); inside the window the only path is a phone call / manager release. Trade-off: clear; but it pushes urgent cases outside the product.
**ALTERNATIVE C — Pending requests expire at start time:** unanswered requests auto-reject at start, and the worker is told they are still assigned. Trade-off: no stale requests; a manager who was about to approve loses the chance.
**Other (describe) / Defer.**
**Sources:** `backend/workforce/roster/worker_actions.py` (no time rule), carried R04D, GM-08 clock-in window (±2h, `attendance/eligibility.py`).
**Decision status:** OPEN — NEW.

### GM-07-Q09 — When a shift changes hands, whose pay terms apply — and what does the worker see?

**Plain English:** today, when a swap or cover moves a shift to someone else, the new worker is paid on *their own* staff terms — their own engagement, their own rates — never the departing worker's. That's a sensible rule, but the workers involved are never shown it, and nobody is notified the transfer happened.

**ACTUAL TODAY — Web and Expo (same backend):** `_reassign` (`worker_actions.py`): "Hand an assignment to a replacement worker under that worker's own staff terms, never the departing worker's." — `staff_assignment_defaults(user, pharmacy, work_date)` + `refresh_assignment_rate(assignment)`. The departing worker's terms are not carried over. No notification is sent on approval (CG-03), so neither worker is told by the system; the replacement discovers it on their roster. Whether the new terms are shown to either worker before/after transfer was not traced (screens not read).
**Normal case:** a $45/hr pharmacist covers for a $55/hr pharmacist — the cover is paid $45 (their own rate). **Edge case:** the replacement has no current engagement on file — what rate do they get? UNKNOWN (GM-06-Q01: engagements are optional today). Replacement is above-Award, requester is Award — the shift's cost changes with no approval step for the cost. **Retry/concurrency:** the transfer is one transaction (locks held); a concurrent leave approval on the same assignment is guarded by the staleness check (requester must still be assigned). **Denied role:** n/a. **Payment/notification:** the pay basis changes silently with the transfer; the only record is the audit row + the assignment's refreshed rate. **Web/Expo difference:** none — backend rule.
**RECOMMENDED:** KEEP "replacement's own terms", and show the rate that will apply to the replacement *before* the manager approves (on the approval screen), plus notify both workers on transfer. Severity: medium — the rule is right; the silence around it is the problem.
**ALTERNATIVE A — Keep current logic:** own-terms transfer, no notice, no preview. Trade-off: no work; workers discover their pay after the fact.
**ALTERNATIVE B — Departing worker's terms travel with the shift:** the cover is paid what the shift was going to pay. Trade-off: the shift's cost is stable; but a junior covering a senior's shift is overpaid and a senior covering a junior's is underpaid — and it breaks the engagement model (GM-06).
**ALTERNATIVE C — Manager sets the rate per transfer:** the approval screen lets the manager pick the rate. Trade-off: flexible; invites inconsistent pay and Award-floor mistakes.
**Other (describe) / Defer.**
**Sources:** `backend/workforce/roster/worker_actions.py` (`_reassign`, `staff_assignment_defaults`, `refresh_assignment_rate`), `backend/workforce/models.py` (`EmploymentEngagement`), GM-06-Q01.
**Decision status:** OPEN — NEW.

### GM-07-Q10 — Release to the marketplace: which audience, and who decides the tier?

**Plain English:** when a manager releases a worker without a replacement, they can push the shift out to a wider audience — staff, favourites, chain, org, or public. That choice is a free parameter on the release call, and the public tier has a daily limit. Nobody has decided which tiers a release may use, or whether the manager should choose at all.

**ACTUAL TODAY — Web and Expo (same backend):** `release_worker_from_assignment(request, manager, escalate_to_visibility=None)`: if a tier is given, it must be in `allowed_tiers(pharmacy)`; PUBLIC enforces `enforce_public_shift_daily_limit`; `apply_escalation` moves the shift; roster slots are detached (`roster_period=None`). If no tier is given, the shift is simply unassigned at its previous visibility. The release *approves* the worker's request (status APPROVED). No default tier, no rule about which tier is appropriate for a released roster shift, and no notification was found.
**Normal case:** Saturday shift released to favourites; a favourite takes it as a marketplace offer. **Edge case:** released straight to PUBLIC — the shift is now a public shift with no public-shift checks at posting (GM-04-Q03: posting checks nothing; but this shift was never "posted", it was released — whether the public-tier Verified/AHPRA gate applies to a released shift's applicants is a GM-12 question). Released with no tier — the shift sits unassigned at staff visibility, visible to staff who may not know it's open (no vacancy display, Q07). **Retry/concurrency:** the release is one transaction; a concurrent swap approval on the same request is blocked by the PENDING check. **Denied role / wrong tenant:** only that pharmacy's managers; invalid tier → ValidationError. **Payment/notification:** a released shift that gets booked pays on offer terms (GM-12/GM-14), not staff terms; no notice is sent on release. **Web/Expo difference:** none — backend behaviour; whether the release screen offers the tier choice on both clients is UNKNOWN.
**RECOMMENDED:** Default a release to the next tier up from where the shift was (staff → favourites → chain → org → public), let the manager override it on the same screen, and never release straight to public without a confirm step (public means the Verified/AHPRA gate and the daily limit both matter). Severity: medium — the tier decides who can take the shift and on what terms.
**ALTERNATIVE A — Keep current logic:** manager passes any allowed tier or none; no default, no confirm. Trade-off: no work; a tired manager can release a Saturday shift to nobody (no tier) or to everyone (public) by accident.
**ALTERNATIVE B — Release always goes to favourites first:** Trade-off: predictable; a shift nobody favourite wants sits until someone escalates it again.
**ALTERNATIVE C — Release never escalates:** a released shift stays at staff visibility; the manager must separately post/escalate it. Trade-off: safest; two steps for every release.
**Other (describe) / Defer.**
**Sources:** `backend/workforce/roster/worker_actions.py` (`release_worker_from_assignment`), `backend/shifts/escalation.py` (`allowed_tiers`, `apply_escalation`, `PUBLIC_LEVEL` — not line-read), `backend/shifts/limits.py` (`enforce_public_shift_daily_limit` — not line-read).
**Decision status:** OPEN — NEW.

---

## Part D — First owner question

Start at **GM-07-W01** (posting-window limit for roster planning). Target consent and cover publishing are carried rules. Engineering: see BL-06.

---

## Part E — Gaps: code gaps vs decision gaps

### Code gaps (no owner decision needed — build/fix once confirmed; still NO code in this phase)

| # | Gap | Code to touch | Notes |
|---|---|---|---|
| CG-01 | Reject reason classification is a substring hack: SWAP vs COVER is decided by whether the word "swap" appears in the request note | `backend/workforce/roster/worker_actions.py` (`reject_worker_shift_request`) | A cover request whose reason mentions "swap" is logged as SWAP_REJECTED. Store the request kind on the row instead (needs `WorkerShiftRequest` model read first) |
| CG-02 | The cover handler does not use `auto_publish_worker_requests`. Its help text conflicts with R06/R04B. | `backend/organizations/models.py`, `backend/workforce/roster/worker_actions.py` | Engineering: see the central BL-06. Wire the existing toggle to the carried policy. |
| CG-03 | No notifications on swap/cover request, approval, rejection, or release (none found in `worker_actions.py`) | `backend/workforce/roster/worker_actions.py`, `backend/notifications/*` | Publish *does* notify (F02). The request/decision silence means workers and targets learn late or never. Verify in `v2_views.py` too (not read) — the views may notify where the service doesn't |
| CG-04 | No notification on roster unpublish (whole week or single shift) was found | `backend/workforce/roster/publication.py` (`unpublish_roster_period`, `unpublish_roster_shift`) | Workers lose shifts silently. Same fix shape as the publish notice |
| CG-05 | No expiry/cleanup for pending swap/cover requests (a request can stay PENDING after its shift has passed) | `backend/workforce/roster/worker_actions.py`, `backend/shifts/worker_requests.py` | Pairs with Q08's deadline decision; the cleanup itself is a code gap once the deadline is chosen |
| CG-06 | `WorkerShiftRequest` model not read (status values, fields, indexes) — only its use in `worker_actions.py` was seen | `backend/shifts/worker_requests.py`, `backend/shifts/models.py` | Read before implementing Q04/Q05 (an accept step needs a field for the target's response) |
| CG-07 | Two parallel roster route sets: `workforce/urls.py` (`roster/workspace`, `roster/validate`, `roster/publish`) vs `workforce/roster/urls.py` (`attendance/roster/...` v2 views) — which is canonical is UNKNOWN | `backend/workforce/urls.py`, `backend/workforce/roster/urls.py`, `backend/workforce/views.py`, `backend/workforce/roster/v2_views.py` | Clients must know which roster API is canonical before any roster screen work is scoped |
| CG-08 | Roster screens (build/publish/approve) not traced on any client — Vite, Next and Expo parity is UNKNOWN, not "no gap" | Vite roster screens, `frontend_web/landing_next/migrated/`, Expo roster screens | GM-25 owns parity; flag here so no one claims the roster is "done on mobile" from the backend alone |

### Decision gaps (owner must choose first — do not build until answered)

GM-07-W01 (planning window) · W02 (booked manager) · Q01 (weekly shape) · Q02 (who can publish) · Q03 (acknowledgement consequences) · Q07 (vacancy visibility within R06) · Q08 (request deadlines) · Q09 (pay terms on transfer) · Q10 (release tier).

**Order to ask:** W01 → W02 → Q07 → Q08 → Q01 → Q02 → Q03 → Q10 → Q09.

---

## Part F — Implementation backlog (SEPARATE — FROZEN until the owner answers)

**Do not start any item below until its owner decision is recorded in Part C.** This backlog exists so that, once decisions land, implementation starts from a clear spec with exact files. No branch, no PR, no code change was made in this phase.

| Backlog item | Depends on (owner decision) | Files / functions to touch | Tests to add / update |
|---|---|---|---|
| BL-01 Target acceptance before transfer | R04C, carried | Engineering: see the central BL-06 | Target consent, checks and manager approval all required |
| BL-02 Existing per-pharmacy cover setting | R04A and R06, carried | Engineering: see the central BL-06 | Setting controls permission; cover keeps the same shift and slot |
| BL-03 Cover invites to named colleagues | R04B, carried | Engineering: see the central BL-06 | Widening to favourites or public requires a manager |
| BL-04 "Needs cover" vacancy display (staff-only, or wider per decision) | Q07 | `backend/workforce/roster/worker_actions.py` (+ vacancy flag), roster list endpoints, roster screens (web + Expo) | Same shift/slot, no duplicate; vacancy scoped to the decided audience; vacancy clears on approval/release |
| BL-05 Request deadlines + near-start escalation + pending-request expiry | Q08 | `backend/workforce/roster/worker_actions.py`, notification code, roster screens | Request inside window escalates; pending at start flagged/expired per decision |
| BL-06 Unpublish + request/decision notifications (target, requester, owner) | Q01/Q04/Q05 (content) + CG-03/CG-04 (mechanics) | `backend/workforce/roster/publication.py`, `backend/workforce/roster/worker_actions.py`, `backend/notifications/*` | Publish/unpublish/approve/reject/release each notify the right people exactly once |
| BL-07 Roster publish approval (owner second pair of eyes, if chosen) | Q02 | `backend/workforce/roster/publication.py`, `backend/workforce/permissions.py` | Non-owner publish needs owner approval; owner publish doesn't |
| BL-08 Acknowledgement reminders + unacknowledged list (if chosen) | Q03 | `backend/workforce/roster/publication.py` (`_notify_roster_publication`), acknowledgement status view, roster screens | Reminder 24h before week start; republish resets acknowledgement (if decided) |
| BL-09 Release-tier default + public confirm step (if chosen) | Q10 | `backend/workforce/roster/worker_actions.py` (`release_worker_from_assignment`), release screens | Default tier applied; public release needs confirm; daily limit enforced |
| BL-10 Pay-terms preview on approval + transfer notices | Q09 | `backend/workforce/roster/v2_views.py` (approval screens), `backend/workforce/roster/worker_actions.py` (`_reassign`) | Replacement's rate shown pre-approval; both workers notified with the rate |
| BL-11 Code gaps CG-01–CG-08, timed by owner | As noted in Part E | As per Part E | Each with web + Expo verification |

**Ordering note:** Target consent, the existing cover setting and named invitations are covered by the central BL-06. Ask GM-06-Q06 alongside roster cover where approved leave creates a request. GM-08 owns the no-show and late rules.

---

## Appendix — Evidence index (per-question source links)

- Head: PR #249 `get` — head `97c4543e051b43fe30ec7e2e61ad3d69957a918e`; Issue #250 `get` — 26 areas, scope freeze, method; PR #184 `get` + `get_files` — head `c786a4b8…`; `docs/qa/launch-grill/questions.json` (SHA `9b700e31…`, 142 questions, 30 carried decisions) and `AUDIT.md` read from `refs/pull/184/head`.
- Files read line by line at head `97c4543…`: `backend/workforce/models.py` (807 lines), `backend/workforce/roster/worker_actions.py` (478 lines), `backend/workforce/roster/publication.py` (345 lines), `backend/workforce/roster/validation.py` (85 lines), `backend/workforce/roster/permissions.py` (10 lines), `backend/workforce/permissions.py` (95 lines), `backend/workforce/roster/urls.py` (65 lines), `backend/workforce/urls.py` (63 lines), `backend/workforce/leave_service.py` (348 lines), `backend/organizations/models.py` (`auto_publish_worker_requests`).
- Default-branch search index (NOT head — flagged in text): `auto_publish_worker_requests` (12 hits, no backend reader), `OrganizationCreate` (not used here).
- Not read (flagged UNKNOWN in text): `backend/workforce/roster/v2_views.py`, `backend/workforce/roster/views.py`, `backend/workforce/roster/services.py`, `backend/workforce/roster/periods.py`, `backend/workforce/roster/slot_locking.py`, `backend/workforce/roster/bulk_edit.py`, `backend/workforce/roster/copying.py`, `backend/workforce/roster/week_templates.py`, `backend/workforce/roster/acknowledgements.py`, `backend/workforce/roster/command_api.py`, `backend/shifts/worker_requests.py`, `backend/shifts/assignment.py`, `backend/shifts/engagement.py`, all Vite/Next/Expo roster screens.
- Adopted without re-trace: GM-01 sessions; GM-05 membership (R01, capabilities, removal Q-09); GM-06 employment/leave (this session); GM-04 chain/org definitions; GM-18 LA-Q12; GM-25 structural trace.

*End of GM-07 documentation. No code was changed. No branch or PR was created.*


---

## Added 2026-11-21: waiting owner decisions (review of PR #267)

Evidence refs: `pr257:` = `origin/agent/pr257-int` at `21add924` (Expo app + newest backend), `main:` = `origin/main` at `8ccf8f77` (web as deployed). Each question is asked once, recommendation first. Source: the orchestrator's waiting-decision list of 21 Nov (items W-01 to W-17, mapped in [`../OWNER_GRILL.md`](../OWNER_GRILL.md) section 3).

### GM-07-W01: Does the 4-month posting window also apply to roster planning? (W-01, D148)
**Scenario:** Tom builds a week template, then uses "copy week" to fill the roster six months ahead for Omar, Ali and Mia.
**What happens today (pr257 only; deployed main has no server posting window):** new vacancy creation, recurrence and changed posting dates refuse dates outside the window (pharmacy-local today to the end of the fourth following calendar month) (`pr257:backend/shifts/posting.py:66` `validate_posting_window`, called at `:100` and `:228`; roster open-shift path `pr257:backend/workforce/roster/views.py:441`). Roster planning writers (week templates, copy week, bulk create, roster slot edits) do **not** check it, so Tom's copy succeeds. Releasing an existing assignment and approving a swap or replacement don't all apply it either.
**Recommendation first: A.** Use the same date limit for roster planning and vacancy posting.
- **A (recommended):** The copy stops at the window edge and tells Tom which weeks were skipped.
- **KEEP:** Tom can plan a year ahead and make permitted description edits. Moving dates outside the window is refused (`pr257:backend/shifts/posting.py:213`, `:228`).
- **B:** Tom can plan within a longer roster-only window, such as 12 months.
- **DEFER**

**Status:** OPEN

### GM-07-W02: May a roster manager edit or cancel a shift they are booked on themselves? (W-06, D178)
**Scenario:** Omar is Tom's pharmacist and has the roster-manager role at Brisbane. He is also booked on Saturday's shift there. He edits that shift's description, then tries to cancel it.
**What happens today:** Omar can edit the description. Agreed terms stay locked. Deleting a shift with booked or payment-pending staff is refused for any manager. The general D04 cancellation action is still to be built (`pr257:backend/workforce/roster/views.py:237`, `pr257:backend/workforce/roster/worker_actions.py:55`, O4 D178).
**Recommendation first: A.** Ask another manager or Tom to edit Omar's booked shift or use the future cancellation action.
- **A (recommended):** Omar asks another manager to make either change.
- **B:** Omar can edit the description. Another manager uses the future cancellation action.
- **C:** Omar keeps his current edit rights and can use the future D04 cancellation action with the same guards as other roster managers.
- **DEFER**

**Status:** OPEN

### GM-07-W03: Plain draft roster staff are deleted with their shift (W-12, carried grill #9)
**Answered:** yes (owner, grill #9, carried in the job memory). **Still true in code:** `pr257:backend/workforce/roster/views.py:233-234` deletes plain rostered staff on a draft shift together with it, and refuses when staff are offer-booked or payment-pending. Not re-asked.
