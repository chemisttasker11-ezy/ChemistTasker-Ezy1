# GM-23 Calendars / Operations — Full Grill Documentation

**Area:** GM-23 Calendars/operations (Issue #250, area 23 of 26)
**Method:** Issue #250 interview rules + PR #184 format; Web (Vite + Next) and Expo traced together in every question, side by side, including parity gaps.
**Status:** TRACED + RE-VALIDATED (re-run 2026-11-21). Decision status per question in Part C. No owner decision recorded yet. No code changed in this phase — documentation and decisions only.

## Bases (exact SHAs verified 2026-11-21)

| Source | Ref | SHA / head |
|---|---|---|
| Active PR #249 (revalidation target) | `refs/pull/249/head` | `97c4543e051b43fe30ec7e2e61ad3d69957a918e`, branch `fix/pr248-expo-production-waves-20261104`, open draft, unchanged since first verified 2026-11-21 |
| PR #249 base | `feat/mobile-merge-sdk` (#248) | `c98cf2ef74c6de356cceb8dee3a61dad47b6b843` |
| PR #248 head | — | `25939534a1c5543454a8e770571e4dff46380d96` |
| `main` (reference) | `main` | `8ccf8f7` (merge PR #247, 2026-11-03) |
| Old grill PR #184 | `refs/pull/184/head` | `c786a4b8182ebf9b505d47cd81980eb3b9851ce3`, branch `docs/launch-grill-20261020`, draft, docs-only, 8 files, +6887 |
| PR #184 `questions.json` | `refs/pull/184/head` | SHA `9b700e3132c584e6f3755c05901dbd5dc945f8aa`, 142 questions, 30 carried decisions |
| PR #184 `AUDIT.md` | `refs/pull/184/head` | 35 gaps (18 code, 17 decision) at #182 head, 2026-10-20 |
| Issue #250 | open | Created 2026-11-05T15:26:05Z; GM-23 = Calendars/operations |

**Head-SHA resolution (re-confirmed this session):** PR #249's body names a "working head `26cae2d6`" — that is the short SHA of the last *implementation commit listed in the body*, not the branch head. The API head is `97c4543e051b43fe30ec7e2e61ad3d69957a918e` (458 commits, 314 changed files, `mergeable_state: unstable`). Every trace below is at that API head.

**PR #249 body wave list — CONFIRMED verbatim this session:** "Waves W4 pharmacy operations; W5 attendance/workforce; W6 invoice/finance/talent/hub/chat; W7 marketplace/BAS; W8 public/content; final screen restyle." **Nuance found by this trace:** the body lists W4 as "next work", but W4 calendar screens already exist at this head — `frontend_mobile/roles/shared/calendar/` (team calendar, with tests titled "W4 calendar deep links…") and the manager roster parity screens. "Next work" therefore means *sign-off / remaining W4 work*, not absence. Do not read the body as "no W4 code exists".

**Rate-limit note:** no HTTP 429 occurred in this re-run (~35 sequential read calls, all succeeded, ≥8 s apart). The 429 that blocked the first GM-23 attempt has cleared. Every file below was read at the PR #249 head in this session, except where marked ADOPTED (GM-18/GM-19 senior-reviewed verdicts, adopted per the senior review — not re-traced from scratch) or UNKNOWN.

**Adopted, not re-fetched (GM-18/GM-19, senior-reviewed PASS at this same head):** `backend/talent/models.py` (`UserAvailability`, `ExplorerPost.is_talent_board_visible`), `backend/talent/views/availability.py`, `backend/talent/serializers/availability.py`, `backend/talent/views/explorer.py`, `backend/talent/serializers/explorer.py`, `backend/shifts/announcements.py` (581 lines), `backend/workforce/roster/validation.py` (`worker_issues`), `frontend_web/src/pages/dashboard/sidebar/SetAvailabilityPage.tsx`, `frontend_mobile/roles/shared/availability/SetAvailabilityScreen.tsx` + `availabilityModel.ts`, `shared-core/src/domains/talent/api.ts`, `backend/talent/test_availability_api.py`. GM-06 leave findings adopted (leave approval does not release the assignment; date-range leave notifies nobody; `APPROVED_LEAVE_CONFLICT` blocks replacements; 7 leave types, no balances/pay).

**Files verified at the PR #249 head in THIS trace (new GM-23 ground):** `backend/team_calendar/` (full listing — 9 files), `models.py`, `tasks.py`, `views.py`, `serializers.py`, `recurrence.py`, `urls.py`, `test_api.py`, `backend/notifications/migrations/0004_notificationpushpreference.py`, `backend/notifications/models.py`, `backend/notifications/services.py`, `backend/core/celery.py`, `backend/core/settings.py` (beat schedule + `TIME_ZONE`), `backend/organizations/timezone.py`, `backend/shifts/tasks.py` (`send_shift_reminders`), `backend/client_profile/tasks.py` (re-export), `backend/shifts/escalation.py`, `backend/shifts/base.py` (lazy escalation call site), `backend/shifts/models.py` (Shift / ShiftSlot / ShiftSlotAssignment), `backend/workforce/roster/worker_actions.py`, `backend/workforce/roster/publication.py`, `frontend_web/src/pages/dashboard/sidebar/PharmacyCalendarPage.tsx` + `PharmacyCalendarPage.model.ts` + `calendarViews.tsx`, `RosterWorkerPage.tsx`, `RosterOwnerPage.tsx`, `frontend_web/shared/postShift/` (listing, `useShiftTimetable.ts`, `PostShiftDetailsStep.tsx`, `PostShiftForm.tsx`), `shared-core/src/domains/calendar/api.ts`, `shared-core/src/contracts/calendar.ts`, `shared-core/src/domains/dashboards/api.ts`, `frontend_mobile/roles/shared/calendar/` (listing, `calendarModel.ts`, `calendarScope.test.mjs`, `index.tsx`), `frontend_mobile/scripts/calendar-request-budget.test.cjs`, `frontend_mobile/app/my-roster.tsx`, `frontend_mobile/app/manager/roster/` (listing + `calendar.tsx` + `operations.tsx`), `frontend_mobile/features/parity/roster.tsx`, `frontend_mobile/app/owner/calendar.tsx`, `frontend_mobile/app/pharmacist/calendar.tsx`, plus directory listings for `frontend_web/src/pages/dashboard/`, `dashboard/sidebar/`, `landing_next/migrated/pages/`, `dashboard/sidebar/`, `shared-core/src/domains/`, `shared-core/src/contracts/`, `frontend_mobile/app/`, `app/manager/`, `app/owner/`, `app/pharmacist/`.

**Headline finding (one paragraph):** the "team calendar" and the "roster calendar" are two different calendars that never meet. The team calendar (`/calendar-feed/`) shows only manual events, work notes and birthdays — no shifts, no leave, no reservations, no needs-cover — on Vite (month grid) and Expo (a near-identical month grid, W4). The roster calendar (`RosterWorkerPage` / `RosterOwnerPage` / Expo `my-roster` + manager roster) shows shifts, leave status and cover states in month/week/fortnight/day views, but never shows the team-calendar events or work notes. There is no operations dashboard, no calendar export, and no single "what state is this entry in" vocabulary. The Oct 2026 "operations rules engine" (`team_calendar/operations_rules.py`) no longer exists at this head. Time is kept in three places at once (server `Australia/Sydney`, pharmacy state/explicit zone, per-user push-preference zone defaulting to Brisbane) while calendar dates are stored as naive local dates. The availability half (AV-Q01–Q09 / LA-Q16–Q18) is adopted from GM-18/GM-19 as instructed; the genuinely new GM-23 ground (GM-23-18–29) is fully traced below.

---

## Part A — Current-flow matrix

Columns: Trigger → Actor → Backend / API → Vite web → Next web → Expo mobile → Persisted state → Event / side effect → Recovery / denial path.

### F01 — Manager creates a manual calendar event

| Trigger | Actor | Backend / API | Vite | Next | Expo | Persisted state | Event / side effect | Recovery / denial |
|---|---|---|---|---|---|---|---|---|
| Manager adds an event for a date | Owner / admin / manager with `MANAGE_ROSTER` or `MANAGE_ADMINS` org capability, or pharmacy owner (`can_manage_calendar`, `backend/team_calendar/views.py`) | `POST /calendar-events/` → `CalendarEventViewSet.perform_create`; `source` forced to `MANUAL` by the serializer; pharmacy XOR organisation required; org mismatch → 403; no start<end validation, no recurrence validation | `PharmacyCalendarPage.tsx` event modal (month grid, day detail) | **No surface** | `roles/shared/calendar/index.tsx` `SharedCalendarScreen` — same month grid + modal, via `getCalendarFeed` + `createCalendarEvent` (shared-core) | `CalendarEvent` row: pharmacy/org, title, description, `date` (DateField), naive `start_time`/`end_time`, `all_day`, `recurrence` JSON, `created_by` | None | Wrong pharmacy → 403 / empty list (fail-closed); non-manager → 403 "You don't have permission to create events for this pharmacy."; auto-generated events cannot be created by clients at all |

### F02 — Any active member creates / completes a work note

| Trigger | Actor | Backend / API | Vite | Next | Expo | Persisted state | Event / side effect | Recovery / denial |
|---|---|---|---|---|---|---|---|---|
| Staff member adds a task for a date, assigns colleagues, marks it done | **Any active member** of the pharmacy (`can_create_work_notes`); managers additionally see who completed it | `POST /work-notes/` → `WorkNoteViewSet`; assignee membership IDs must belong to the pharmacy and be active (serializer validation); `POST /work-notes/<id>/mark_done/` + `mark_open/` per membership + occurrence date (`WorkNoteCompletion`, unique per note/member/date) | Same `PharmacyCalendarPage` (notes filter, assignee picker, mark-done) | **No surface** | Same `SharedCalendarScreen` (notes filter, mark-done) | `WorkNote` row (status open/in_progress/done, `notify_on_shift_start`, `is_general`, recurrence) + `WorkNoteAssignee` rows + `WorkNoteCompletion` rows | None on create; completion is per-member, so one member marking done does not complete it for others | Non-member → 403 / empty list; assignee from another pharmacy → 400 "Invalid or inactive membership IDs"; marking a note not assigned to you → 403 unless manager; bad occurrence date → 400 |

### F03 — Birthday events appear (auto-generated)

| Trigger | Actor | Backend / API | Vite | Next | Expo | Persisted state | Event / side effect | Recovery / denial |
|---|---|---|---|---|---|---|---|---|
| Daily 00:15 beat | System | `client_profile.calendar_tasks.generate_all_birthday_events` (beat `calendar-birthdays-daily`, `crontab(hour=0, minute=15)`); birthdays within 30 days, idempotent `get_or_create` on (`source_membership`, `date`, `source`); DOB read from onboarding records, not `Membership` | Shown as birthday items (cake icon, green) on the month grid | **No surface** | Shown identically | `CalendarEvent` with `source='birthday'`, `all_day=True` | None | No DOB on file → skipped silently; **birthdays are hidden from non-managers** in both list and feed (`can_view_birthdays` = `can_manage_calendar`); auto events cannot be edited/deleted (403) |

### F04 — Work-note notification at shift start (hourly) + 9am fallback

| Trigger | Actor | Backend / API | Vite | Next | Expo | Persisted state | Event / side effect | Recovery / denial |
|---|---|---|---|---|---|---|---|---|
| Hourly beat (:05) / 9am beat (:10), pharmacy-local time | System | `send_shift_start_work_note_notifications` (hourly) + `send_9am_work_note_fallback` (9am pharmacy-local); uses `get_pharmacy_timezone`; general notes → all users starting a shift this hour; assigned notes → assignees starting now whose `notified_at` is null; deduped against existing `WORK_NOTE` notifications for that note+day; `notify_users` (in-app + WebSocket + Expo push per prefs) | Notification appears in-app; action URL links to `/calendar?pharmacy_id=…&date=…&note_id=…` | Same backend (no Next surface to open the link into) | Push (if `push_work_notes` on and outside quiet hours) + in-app | `WorkNoteAssignee.notified_at` stamped; `Notification` rows (type `work_note`) | In-app notification + optional push | Push failure never rolls back the in-app notification; a note with `notify_on_shift_start=False` never fires; a worker with no assignment starting this hour gets nothing even if assigned the note |

### F05 — Pre-shift reminder email (~12h before, email only)

| Trigger | Actor | Backend / API | Vite | Next | Expo | Persisted state | Event / side effect | Recovery / denial |
|---|---|---|---|---|---|---|---|---|
| Hourly beat (:15) | System | `client_profile.tasks.send_shift_reminders` (beat `shift-reminders-hourly`); window = pharmacy-local now+12h to now+13h; queries `ShiftSlotAssignment` rows only; sends via `users.tasks.send_async_email`, template `emails/shift_reminder.html` | Email only — nothing in-app, no push | Same email | Same email | No reminder record is written (no dedupe row) | One email per assignment in the window | No second reminder; no push/in-app copy; **no cancellation/payment filter in the function** — assignments have no status field (cancellation = row deletion, so deleted rows cannot remind; whether a payment-pending reservation holds an assignment row is GM-13, UNKNOWN here); a beat retry/re-run would resend (no sent-record — observation, not a tested failure) |

### F06 — Worker sets availability (adopted GM-19)

| Trigger | Actor | Backend / API | Vite | Next | Expo | Persisted state | Event / side effect | Recovery / denial |
|---|---|---|---|---|---|---|---|---|
| Worker saves dated/recurring availability | Worker (own rows only) | `UserAvailability` CRUD, own-user queryset, **no server validation** (AV-05, adopted); `recurring_end_date` nullable (open-ended); no blackout/unavailable-date model; no `confirmed_at` | `SetAvailabilityPage.tsx` (dated + recurring, notify toggle, travel/radius default 30 km) | **No surface** | `SetAvailabilityScreen.tsx` (same + map preview, radius 5–1000 km) | `UserAvailability` row | None on save; feeds matching (F07) | Invalid rows accepted by API; another user's rows invisible (empty list/404) |

### F07 — Match alerts at posting time only (adopted GM-19)

| Trigger | Actor | Backend / API | Vite | Next | Expo | Persisted state | Event / side effect | Recovery / denial |
|---|---|---|---|---|---|---|---|---|
| Owner posts a shift straight to PLATFORM | System | `announce_availability_matches` (posting time only, PLATFORM only): `notify_new_shifts=True`, active, role + travel check, **any-overlap** match, recipient cap; **no Verified/AHPRA filter, no rate check, no booked-time check, no leave check** | — | — | — | Shift + match notifications | Email/in-app match alert | Posted to staff/favourites/chain/org tiers → no availability alerts; escalation → no re-announce (F08) |

### F08 — Shift escalates (lazy, silent)

| Trigger | Actor | Backend / API | Vite | Next | Expo | Persisted state | Event / side effect | Recovery / denial |
|---|---|---|---|---|---|---|---|---|
| Someone loads a shift list/detail; or manager escalates manually | System / manager | `auto_escalate_due_shifts` runs inside `BaseShiftViewSet.get_queryset` on **every** list/detail request — no beat entry; candidates must have **no interests at all** (`interests__isnull=True`); PLATFORM step skipped at the daily public-shift limit; **no announce/notify call anywhere in `escalation.py`** | Fires only when someone browses | Same lazy trigger | Same | Visibility tier advances (or stalls) | New audience is **not notified**; escalation stalls if nobody browses; a shift with any prior interest never auto-escalates | Manual `escalate` action exists (manager only); no recovery for a stalled escalation |

### F09 — Worker requests leave / cover on a rostered shift

| Trigger | Actor | Backend / API | Vite | Next | Expo | Persisted state | Event / side effect | Recovery / denial |
|---|---|---|---|---|---|---|---|---|
| Worker taps leave/cover on an assigned shift | Employed worker (own assignment only) | Leave: `create_leave` (`leave_service.py`, adopted GM-06) — slot-bound leave notifies managers; date-range leave notifies **nobody**; approval changes only the leave row, worker **stays assigned**. Cover: `submit_cover_request` (`worker_actions.py`) — `WorkerShiftRequest` PENDING, assignment **preserved** until replacement approved/released; `RosterActionAudit` row (COVER_REQUESTED) | `RosterWorkerPage`: leave dialog (type + note, PENDING-only edit/cancel), cover dialog; event shows `(Leave: STATUS)` + leave/cover colours | **No surface** | `my-roster.tsx`: week view, own assignments only, leave + cover dialogs, pending cover requests section | `WorkforceLeaveRequest` / `WorkerShiftRequest` rows | Managers notified for slot-bound leave only (GM-06); **no notification call exists in `worker_actions.py`** — cover/swap/release/reject write audit rows only; whether the view layer notifies is UNKNOWN (not traced) | Someone else's assignment → PermissionDenied; non-pending request → ValidationError; replacement with approved leave overlapping → hard error (`APPROVED_LEAVE_CONFLICT`) |

### F10 — Manager approves cover / releases a worker (no duplicate shift)

| Trigger | Actor | Backend / API | Vite | Next | Expo | Persisted state | Event / side effect | Recovery / denial |
|---|---|---|---|---|---|---|---|---|
| Manager approves a replacement or releases a worker | Authorised attendance manager (`is_authorized_attendance_manager`) | `approve_cover_replacement`: atomic, `select_for_update`, stale-request check (requester must still be assignee), replacement eligibility = `worker_issues` errors **and** warnings both block; `_reassign` under the replacement's own staff terms. `release_worker_from_assignment`: **deletes** the assignment, **reuses** the existing Shift/Slot, optional `escalate_to_visibility` (daily PLATFORM limit enforced), never creates a duplicate shift; audit rows (COVER_APPROVED / WORKER_RELEASED) | `RosterOwnerPage`: cover approve/reject dialogs | **No surface** | Manager roster `approvals.tsx` (parity screen: PENDING requests + replacement picker) | Assignment reassigned or deleted; `WorkerShiftRequest` APPROVED; `RosterActionAudit` rows | None traced (see F09 — no notify call in this layer) | Booked/payment-pending work → ValidationError ("cancel the booking instead of swapping/replacing/releasing"); stale request → ValidationError; replacement failing any check → ValidationError |

### F11 — Roster week published / unpublished / republished

| Trigger | Actor | Backend / API | Vite | Next | Expo | Persisted state | Event / side effect | Recovery / denial |
|---|---|---|---|---|---|---|---|---|
| Manager publishes, unpublishes or republishes a roster week (or one shift) | Authorised attendance manager | `publish_roster_period`: row lock, validation — **blocking errors block, warnings block unless forced/acknowledged**; sets PUBLISHED + `published_at`/`published_by`; `RosterPublicationAudit` revision; **notifies every assigned worker** (in-app + push per prefs, "Roster published", action `/dashboard/<role>/roster`) on commit; **publishing never converts marketplace bookings and never escalates** (E03). `unpublish_roster_period`: back to DRAFT, **hidden from workers immediately, no notification**. Per-shift: `unpublish_roster_shift` (hidden, audit SHIFT_UNPUBLISHED, no notify) / `republish_roster_shift` with **notify = worker / team / none (default worker)**, re-validates errors only | `RosterOwnerPage`: publish/unpublish/republish with notify choice; `RosterCoveragePanel` shown | **No surface** | Manager roster `publish.tsx` + `validate.tsx` + `acknowledgements.tsx` (parity screens); worker sees only PUBLISHED/ARCHIVED weeks via `get_worker_published_roster` (drafts never returned) | `RosterPeriod` status + audit revisions; slot `unpublished_at` | Publish notice per worker (TASK-type notification, so the `push_tasks` pref governs push); republish notice "Roster updated" | Unpublish is silent — workers only discover it by the shift disappearing; archived weeks cannot be unpublished/republished; republish of an archived slot → ValidationError |

### F12 — Team-calendar feed (month view)

| Trigger | Actor | Backend / API | Vite | Next | Expo | Persisted state | Event / side effect | Recovery / denial |
|---|---|---|---|---|---|---|---|---|
| User opens the team calendar | Any authenticated user with pharmacy/org access | `GET /calendar-feed/?pharmacy_id=&date_from=&date_to=` → `CalendarFeedView`: defaults to the **current month**; expands recurrence into occurrences (composite IDs `<id>-<date>`); per-occurrence completion status for the caller; **admins see `completed_by` names, ordinary staff do not**; birthdays excluded for non-managers; inaccessible pharmacy → 403 with error body | `PharmacyCalendarPage`: month grid, day detail, filters all/events/notes/birthdays, event + note modals | **No surface** | `SharedCalendarScreen`: same month grid + filters + modals, 15 s request budget (`withCalendarRequestBudget`); pharmacy scope fail-closed (`pickAllowedCalendarPharmacyId` — membership wins over a requested id) | None (read-only feed) | None | Malformed dates/ids → 400; no pharmacy selected → empty state; request aborted after 15 s on Expo |

### F13 — Owner posts a multi-date / recurring shift (adopted + re-verified)

| Trigger | Actor | Backend / API | Vite | Next | Expo | Persisted state | Event / side effect | Recovery / denial |
|---|---|---|---|---|---|---|---|---|
| Owner builds a shift in the post-shift wizard | Owner/manager | `Shift.single_user_only` ("only one user may take the entire shift (all slots)"); `Shift.is_urgent` flag; `ShiftSlot.clean()` **requires** `recurring_end_date` for recurring slots (after start date), weekdays 0=Monday..6=Sunday; wizard picker caps dates at today + 4 months (UI only); wizard rejects finish ≤ start (no overnight entry via the manual path — observation) | Shared `PostShiftForm` (single-user + urgent switches, timetable step requires weekdays + end date, description templates only — no duplicate / post-again in the files read) | **No surface** | Post-shift is W3b (GM-10); whether Expo exposes the single-user/urgent switches was **not** verified here | `Shift` + `ShiftSlot` rows | None | Past date → "That date has passed"; recurring without weekdays/end → "Pick the weekdays and the date it repeats until."; duplicate dates → "Those dates are already in your list." |

### Web vs Expo parity — verified at head (summary)

| Area | Vite web | Next web | Expo |
|---|---|---|---|
| Team calendar (events/notes/birthdays) | Month grid, full create/edit | **None** | Month grid, full create/edit (owner + pharmacist routes verified; otherstaff/explorer routes UNKNOWN) |
| Roster calendar (shifts/leave/cover) | Month/week/fortnight/day, default week; **team assignments visible with names** | **None** | Worker: week view, **own assignments only**; Manager: week-at-a-glance roster parity screens |
| Availability entry | Full screen | **None** | Full screen (+ map preview) |
| Reminders / notifications | Email only (backend) + in-app notifications | Same backend, no surfaces | Same backend + push per prefs |
| Ops dashboard | **None built** | **None built** | **None built** |
| Calendar export / sync | **None built** | **None built** | **None built** |
| Publish/unpublish/republish | Full (owner page) | **None** | Parity screens (publish/validate/acknowledgements/audit) |

---

## Part B — Old questions re-validated (PR #184 / #204 / shift-lifecycle)

Method: the 17 GM-23-scope old questions (AV-Q01–Q09, AG-Q11–Q12, PO-Q05–Q07, LA-Q16–Q18) were re-checked against the PR #249 head `97c4543e`. The availability half adopts the senior-reviewed GM-18/GM-19 verdicts (not re-traced from scratch, per the senior review); the rest was re-verified in this trace. Verdicts: ✅ STILL VALID · 🔄 CHANGED · 🟢 FIXED · 🔀 SPLIT.

| Old ID | Old question | Verdict | Evidence (current code) |
|---|---|---|---|
| LA-Q16 / AV-01 | Talent-post availability copied once, never syncs | **✅ STILL VALID** (adopted GM-18/GM-19) | Two stores, no link in `talent/models.py`; editing availability never updates a talent post. Carried as GM-23-01. |
| AV-Q01 | How should workers set availability? | **✅ STILL VALID** (adopted GM-19) | Dated + recurring only; no unavailable-date/blackout/holiday exception model in `UserAvailability` or either SetAvailability screen. Carried as GM-23-02. |
| AV-Q02 / AV-02 | How far can repeating availability run? | **🔄 CHANGED — Oct claim wrong** (adopted GM-19; confirmed for team calendar in this trace) | Backend allows open-ended recurrence (`recurring_end_date` nullable) **and both apps** send `null` when unset — the Oct claim "apps require an end date" is wrong. Team-calendar recurrence (`recurrence.py`) is likewise open-ended (`until_date` optional). Nothing expires a pattern; no reconfirm prompt. Carried as GM-23-03. |
| AV-Q03 / AV-03 | When does availability "match" a shift? | **✅ STILL VALID — divergence verified** (adopted GM-19) | Alerts/dashboard: **any-overlap** (`announcements.py::_availability_matches_slot`, touching endpoints count). Roster warnings: **full containment** (`validation.py`). Same worker/shift can be "matched" by email and "outside availability" by the roster. Carried as GM-23-04. |
| AV-Q04 / AV-06 | Who can see a worker's availability? | **✅ STILL VALID** (adopted GM-19) | Only the worker reads raw availability (own-rows queryset); pharmacies see only the copied talent-post snapshot; no opt-in field exists. Carried as GM-23-05. |
| AV-Q05 | Should confirmed bookings block that time? | **🔄 CHANGED — split, alert side now verified** (adopted GM-19) | Roster: overlapping assignments are a hard `SHIFT_OVERLAP` error. Alerts: **no assignment check** in `announce_availability_matches` — booked workers are still alerted. Approved leave likewise not checked by alerts (roster blocks it). Carried as GM-23-06. |
| AV-Q06 / AV-02 | When should a talent post stop showing? | **✅ STILL VALID; 🟢 TB-03 FIXED** (adopted GM-19) | `is_talent_board_visible`: hidden → no; full-time → always yes; dated → until last date; undated → forever. `get_queryset` now filters **all** non-write reads through `_visible_posts` (the Oct bypass is fixed). Undated/full-time posts still live forever unless moderated. Carried as GM-23-07. |
| AV-Q07 | Should availability show when last confirmed? | **✅ STILL VALID** (adopted GM-19) | No `confirmed_at`, no freshness signal, no reconfirm action; `updated_at` is not a confirmation. Carried as GM-23-08. |
| AV-Q08 | Should urgent-shift alerts need a separate opt-in? | **✅ STILL VALID — now verified, with new context** (adopted GM-19 + this trace) | One `notify_new_shifts` flag per availability row; no separate urgent consent, no quiet-hours in matching. **New:** push preferences now exist (`NotificationPushPreference`: per-type opt-outs, quiet hours 22:00–07:00, per-user timezone) and `Shift.is_urgent` exists as a poster flag — but neither creates an urgent-alert audience; alerts still have no urgency rule. Carried as GM-23-09. |
| AV-Q09 | Max distance + minimum rate for alerts? | **🔀 SPLIT** (adopted GM-19) | Distance **enforced** (`_user_can_travel_to_shift`: travel states or haversine ≤ `coverage_radius_km`; missing coords/radius → silently no match). Rate **not checked** — no rate field on `UserAvailability`, no comparison in the alert function. Carried as GM-23-10. |
| AG-Q11 | Which shifts get pre-shift reminders, and when? | **🔄 CHANGED — now precisely verified** (this trace) | Hourly beat, pharmacy-local window now+12h to now+13h, **email only**, assignments only (`shifts/tasks.py::send_shift_reminders`). No second reminder, no push/in-app copy, no dedupe record. The "reservations get none" half is now a sharper UNKNOWN: assignments have no status field, so whether a payment-pending reservation holds an assignment row (and thus gets the email) depends on GM-13, not on this function. Carried as GM-23-11. |
| AG-Q12 | If a shift changes inside 12h, what happens to reminders? | **🔄 CHANGED — partially answered** (this trace) | Still no instant alert for a plain re-time and no cancellation of the already-sent 12h email. **But** the roster edit path now has a real mechanism: `unpublish_roster_shift` / `republish_roster_shift` (notify worker / team / none, default worker, "Roster updated"). Whether every re-time goes through that path (slot-mutability guard not read) is UNKNOWN. Carried as GM-23-12. |
| PO-Q05 | "Same worker for every date" for multi-date posts? | **✅ STILL VALID (first half); second half NOT RE-VALIDATED** | `Shift.single_user_only` exists on the backend and the switch exists in the shared web wizard (`PostShiftForm`). The Oct gap — "worker cards don't say 'all dates required'" — was **not** re-checked on worker cards in this trace. Carried as GM-23-13. |
| PO-Q06 | How far ahead can recurring shifts run? | **🔄 CHANGED — end date now required** (this trace) | `ShiftSlot.clean()` **requires** `recurring_end_date` (after the start date) for recurring slots, and the wizard requires weekdays + end date. The wizard date picker caps at today + 4 months (UI only). There is still **no maximum horizon** in the backend beyond "an end date must exist" — a 2-year recurrence is storable if the wizard cap is bypassed (API-level horizon untested). Carried as GM-23-14. |
| PO-Q07 | How should owners repeat a past shift? | **✅ STILL VALID as far as traced** | Description templates only (`useShiftDescriptionTemplate`, "Save for future shifts"); no duplicate / post-again / shift template was found in `PostShiftForm`, `PostShiftDetailsStep` or `useShiftTimetable`. Expo post-shift repeat not checked (GM-10/W3b). Carried as GM-23-15. |
| LA-Q17 / AV-04 | Match emails miss escalated shifts; reach unverified workers | **✅ STILL VALID — both halves re-verified** (this trace + GM-19) | Escalation: `escalation.py` contains **no announce call**; `auto_escalate_due_shifts` has no beat entry and is only called lazily from `BaseShiftViewSet.get_queryset`. Recipients: `announce_availability_matches` has **no Verified/AHPRA filter** (adopted GM-19). Carried as GM-23-16. |
| LA-Q18 / AV-05 | Availability input has no validation | **✅ STILL VALID** (adopted GM-18/GM-19) | `backend/talent/serializers/availability.py` is a bare `ModelSerializer` with zero `validate_*` methods; no validation tests exist. Carried as GM-23-17. |
| ON-02 (AUDIT §1) | AHPRA expiry never enforced; no scheduled re-check | **🔄 CHANGED — the cited location is gone; the mechanism moved** (this trace) | `backend/team_calendar/operations_rules.py` **does not exist at this head** (directory listing proves it) — the Oct 2026 citation (`operations_rules.py:114`) is dead. AHPRA overdue alerts now live in `onboarding.tasks.alert_overdue_ahpra_checks` on a **15-minute beat** (`ahpra-overdue-alerts`). Whether that task blocks anything or only alerts, and whether Verified stays true after a lapse, was **not** traced here (GM-02 owns it). The GM-23 consequence stands: no AHPRA rule runs inside the calendar. |
| SH-05 / LA-Q08 | Escalation only runs on page load; no beat task | **✅ STILL VALID** (this trace) | `celery.py` schedules only marketplace escalations; `CELERY_BEAT_SCHEDULE` has no shift-escalation entry; `get_queryset` still calls `auto_escalate_due_shifts` on every request. |
| SH-06 | Escalation sends no notice; skips shifts with any prior interest | **✅ STILL VALID** (this trace) | `escalation.py` sends nothing; candidates require `interests__isnull=True`. Whether a *withdrawn* interest still blocks escalation was not verified. |
| Carried D01–D05, R01, R04/R04A–D, R06, E01/E03, P07–P10 (from #184) | — | **CARRIED — DECIDED, not re-asked** | See §3 of the blocked report (preserved). E03 re-confirmed in code: `publish_roster_period` never touches visibility/escalation. R06 re-confirmed: `release_worker_from_assignment` reuses the existing Shift/Slot and never creates a duplicate. R04/R04A–D re-confirmed in `worker_actions.py` (assignment preserved until replacement approved). |

**Old questions NOT carried forward unvalidated:** none — every candidate above was re-checked or adopted from a senior-reviewed area; the routed-away items (ON-Q03, ON-P01, ON-Q05, LA-Q13 lapsed half is carried in GM-01, LA-Q12 is GM-01/GM-18) are recorded in GM-01/GM-18/GM-19 so they are not lost.

---

## Part C — GM-23 question queue (new + carried, #184 format)

Per-question format: plain-English explanation first, then ACTUAL TODAY with **Web** and **Expo** side by side, RECOMMENDED, ALTERNATIVE A (keep), ALTERNATIVE B/C, Other/defer. Normal case, edge case, retry/concurrency, denied role/wrong tenant, payment/notification side effects, and Web/Expo difference are shown inside each question. Sources are file/function at PR #249 head `97c4543e` unless marked ADOPTED (GM-18/GM-19). Decision status: **OPEN** for all — no owner answer recorded.

### GM-23-01 — LA-Q16 / AV-01. Talent-post availability is copied once and never syncs with the calendar. Fix before launch? — FIRST QUESTION (Part D)

**Plain English:** a worker writes a talent post and the dates they typed are frozen in that post. If they later change their calendar, the post still shows the old dates.

**ACTUAL TODAY — Web and Expo (same backend, ADOPTED GM-18/GM-19):** both apps copy availability into the pitch form when composing a talent post and save separate post dates (`availability_days` snapshot). Later calendar edits do not update the saved snapshot — there is no link or sync mechanism in `talent/models.py`.
**Normal case:** post created, calendar edited later. **Edge case:** worker deletes all availability — post shows stale dates, not nothing. **Retry/concurrency:** two edits racing — last write wins, no version shown. **Denied role/wrong tenant:** only the post owner edits their calendar; pharmacies read only the copy. **Payment/notification:** none directly; stale post → wasted match emails. **Web/Expo:** same copy on both.
**RECOMMENDED:** A — Before launch. A post can advertise dates the worker removed from the live calendar. Fix or clearly eliminate the copied calendar before launch; a silent stale snapshot is misleading.
**ALTERNATIVE A — Keep current logic:** keep the copied snapshot. Scenario: worker removes a Saturday, pharmacy still invites them for that Saturday, worker declines, pharmacy loses a day. Trade-off: no build, but stale invitations and wasted contact.
**ALTERNATIVE B:** Live link — talent post always renders the live calendar. Scenario: same worker, post auto-updates; pharmacy always sees true availability. Consequence: needs a live-read path + the visibility consent in GM-23-05.
**ALTERNATIVE C:** Copy, but stamp it "as at [date]" and auto-hide after N days without reconfirm. Scenario: honest staleness label, less build than live link.
**Other (describe) / Defer.** Defer consequence: GM-23-04/05/06/07/08/16 cannot be finally decided, because they all assume a known freshness model.
**Sources:** `backend/talent/models.py` (`ExplorerPost.availability_days` vs `UserAvailability`), ADOPTED GM-18/GM-19.
**Decision status:** OPEN — **ask first (Part D)**.

### GM-23-02 — AV-Q01. How should workers set availability? (ADOPTED GM-19)

**Plain English:** can a worker say "I'm usually free Mondays" and also block out a holiday, or must they type every single date?
**ACTUAL TODAY — Web:** dated + recurring entry, calendar preview, notify toggle, travel/radius (default 30 km). **Expo:** same, radius 5–1000 km + map preview. **Backend:** `UserAvailability` has date, time window or all-day, recurring weekdays, optional end date, `notify_new_shifts`, notes — **no unavailable-date / blackout / holiday exception model**.
**RECOMMENDED:** A — Weekly pattern plus unavailable dates; exceptions always win. (Relief Buddy / Locate a Locum pattern.)
**ALTERNATIVE A — Keep current logic:** dated + recurring available slots without unavailable-date exceptions. Scenario: worker on holiday must delete/re-add their whole pattern. Trade-off: no build; error-prone, stale patterns.
**ALTERNATIVE B:** Dated slots only. Scenario: worker retypes every week; fewer stale patterns but high friction.
**Other / Defer.** Edge: public holiday inside a recurring pattern; overnight shift crossing midnight; all-day vs timed. Retry/concurrency: overlapping rows for same day — no validation (GM-23-17). Denied role: only own calendar. Web/Expo: same entry on both; Next: no surface.
**Sources:** ADOPTED GM-19 (`talent/models.py`, both SetAvailability screens).
**Decision status:** OPEN.

### GM-23-03 — AV-Q02 / AV-02. How far can a repeating availability run? (ADOPTED GM-19 + this trace)

**Plain English:** can "every Monday forever" run forever, or must it end and be renewed?
**ACTUAL TODAY — Web and Expo:** open-ended recurrence is allowed by the backend (`recurring_end_date` nullable) **and by both apps** — the end date is optional; the payload sends `recurring_end_date: null` when unset. The Oct 2026 claim "apps require an end date" is wrong at head. **Team calendar, this trace:** `recurrence.py` likewise allows open-ended recurrence (`until_date` optional; unknown `freq` silently yields no occurrences). Nothing expires a pattern and nobody is prompted to refresh it.
**RECOMMENDED:** B — Open-ended, reconfirm quarterly (nudge every 3 months). (#184 rec; quarterly is a proposed local default, not a competitor standard.)
**ALTERNATIVE A — Keep current logic:** optional end dates, no refresh prompts. Scenario: API and apps keep disagreeing; old patterns never questioned.
**ALTERNATIVE B:** End date required, max 3 months. Scenario: forces a refresh; worker with a stable pattern re-enters it 4×/year.
**Other / Defer.** Edge: recurrence with no end date created via API; DST change shifts a recurring time. Web/Expo: same on both.
**Sources:** ADOPTED GM-19; `backend/team_calendar/recurrence.py` (this trace).
**Decision status:** OPEN.

### GM-23-04 — AV-Q03 / AV-03. When does availability "match" a shift? (ADOPTED GM-19)

**Plain English:** if you're free 9–10 and a shift is 9–17, is that a match?
**ACTUAL TODAY — Web and Expo (same backend):** match emails + dashboard suggestions accept **any time overlap**, including touching endpoints (`announcements.py:229`); roster warnings require **full containment** (shift fully inside availability, `workforce/roster/validation.py:76`).
**RECOMMENDED:** A — Shift fully inside availability, same rule everywhere.
**ALTERNATIVE A — Keep current logic:** overlap-based alerts + full-containment roster warnings. Scenario: worker free 9–10 gets alerted for a 9–17 shift they cannot cover; roster then warns the manager. Trade-off: more alerts, more noise, more false hope.
**ALTERNATIVE B:** Overlap of at least X% (pick a percentage). Scenario: 80% overlap counts, 10% doesn't. Consequence: needs an owner-chosen X; boundary disputes.
**Other / Defer.** Edge: touching endpoints (free until 9, shift starts 9); overnight shifts; all-day availability vs timed shift. Retry/concurrency: availability edited after the match email sent. Web/Expo: shared backend rule on both.
**Sources:** ADOPTED GM-19.
**Decision status:** OPEN.

### GM-23-05 — AV-Q04 / AV-06. Who can see a worker's availability? (ADOPTED GM-19)

**Plain English:** is your calendar private, or can pharmacies see when you're free?
**ACTUAL TODAY — Web and Expo (same API):** only workers can read/edit their raw availability; it drives alerts, recommendations and roster warnings. Pharmacies see copied talent-post dates rather than a live calendar on either app. No visibility/opt-in field exists on `UserAvailability`.
**RECOMMENDED:** B — Opt-in trusted pharmacies: worker chooses staff + favourite visibility. (OAIC APP 6 — relationship alone should not silently disclose a private calendar/notes.)
**ALTERNATIVE A — Keep current logic:** raw calendar private; posts hold copied dates. Scenario: pharmacy cannot plan around a favourite locum's real availability; must ask via chat/post.
**ALTERNATIVE B/C:** Opt-in talent card (broader employer visibility). Scenario: any pharmacy browsing the talent board sees free days. Consequence: wider disclosure, needs explicit consent + notes redaction.
**Other / Defer.** Edge: worker is staff at Pharmacy A and favourite at B — different visibility per pharmacy? Wrong tenant: Pharmacy A must never see availability the worker shared only with B. Web/Expo: same API rule.
**Sources:** ADOPTED GM-19.
**Decision status:** OPEN.

### GM-23-06 — AV-Q05. Should confirmed bookings block that time automatically? (ADOPTED GM-19)

**Plain English:** once you're booked 9–17, should the system stop telling you about other shifts at that time?
**ACTUAL TODAY — Web and Expo (same backend, split):** roster side — overlapping assignments are a hard `SHIFT_OVERLAP` error. Alert side — `announce_availability_matches` has **no assignment check**: a worker already booked for those hours is still alerted. Approved leave is likewise not checked by alerts (roster blocks it, alerts do not).
**RECOMMENDED:** A — Yes, booked time is unavailable; no alerts for those hours.
**ALTERNATIVE A — Keep current logic:** leave declared availability and alerts unchanged when bookings are confirmed. Scenario: booked worker gets an alert, applies, then hits a conflict check. Trade-off: noise + wasted applies.
**Other / Defer.** Edge: overlapping reservation (unpaid hold) vs confirmed booking — does a hold block too? Cancellation frees the time — does alerting resume? Concurrency: booking confirmed at the same moment a match email is being built. Web/Expo: same.
**Sources:** ADOPTED GM-19.
**Decision status:** OPEN.

### GM-23-07 — AV-Q06 / AV-02. When should a talent post stop showing? (ADOPTED GM-19)

**Plain English:** how long can an old talent post sit on the board before it disappears?
**ACTUAL TODAY — Web and Expo (same backend):** feeds hide dated availability posts after their last date; undated and full-time posts remain indefinitely unless moderated. **Fixed since Oct 2026:** ordinary list/detail endpoints now filter through `_visible_posts` too (TB-03 fixed) — the old bypass is closed.
**RECOMMENDED:** A — Hide after 30 days without update; nudge the worker first. (30 days is a proposed local default.)
**ALTERNATIVE A — Keep current logic:** hide dated posts after last date; retain undated/full-time posts. Scenario: board fills with "ghosts" — workers who left months ago.
**ALTERNATIVE B:** Never hide. Scenario: board fills with ghosts (worst case).
**Other / Defer.** Edge: full-time post with no dates; paused worker's post stays listed. Web/Expo: same backend filter gap.
**Sources:** ADOPTED GM-19.
**Decision status:** OPEN.

### GM-23-08 — AV-Q07. Should availability show when it was last confirmed? (ADOPTED GM-19)

**Plain English:** should pharmacies see "this calendar was confirmed 3 days ago" vs "6 months ago"?
**ACTUAL TODAY — Web and Expo:** not built yet. No availability confirmation date, reconfirm action, or freshness status; generic DB update timestamps are not a worker confirmation.
**RECOMMENDED:** A — Yes, plus weekly one-tap reconfirm; marked stale after 14 days; pause option. (Weekly/14-day timing proposed, not a competitor standard.)
**ALTERNATIVE A:** No — pharmacies guess. Scenario: pharmacy invites a worker whose calendar is a year old.
**Other / Defer.** Edge: worker confirms, then edits one day — does the whole calendar re-stamp? Web/Expo: needs the same stamp on both.
**Sources:** ADOPTED GM-19.
**Decision status:** OPEN.

### GM-23-09 — AV-Q08. Should urgent-shift alerts need a separate opt-in? (ADOPTED GM-19 + new context)

**Plain English:** one switch for all shift alerts, or a separate switch for urgent (starting within 24h) shifts?
**ACTUAL TODAY — Web and Expo (same backend):** one matching-public-shift notification switch per availability row (`notify_new_shifts`). No separate urgent-shift consent or urgency-based alert audience. **New in this trace:** push preferences now exist (`NotificationPushPreference`: per-type opt-outs, quiet hours 22:00–07:00, per-user timezone; alerts bypass quiet hours but honour an explicit alert opt-out) and `Shift.is_urgent` exists as a poster flag — but neither creates an urgent-alert audience, and match alerts never consult `is_urgent`.
**RECOMMENDED:** KEEP — use the same matching-shift notification consent for urgent and ordinary shifts; label urgent messages clearly; add frequency controls only if volume proves necessary.
**ALTERNATIVE A:** Yes, separate urgent opt-in for shifts starting within 24h. Scenario: worker wants ordinary alerts but not 2am urgent pings.
**Other / Defer.** Edge: shift becomes urgent after posting (start approaches) — does consent change? Escalation never re-announces, so the worker is never told it became urgent. Notification side effect: urgent alerts at night (quiet hours do not apply to the email match alerts at all — they are not push).
**Sources:** ADOPTED GM-19; `backend/notifications/models.py`, `backend/notifications/services.py`, `backend/shifts/models.py` (`is_urgent`) — this trace.
**Decision status:** OPEN.

### GM-23-10 — AV-Q09. Should workers set a max distance and minimum rate for alerts? (ADOPTED GM-19)

**Plain English:** should alerts respect "don't tell me about shifts more than 30 km away or under $X/hour"?
**ACTUAL TODAY — Web and Expo:** both apps let workers set coverage radius / travel states, and match alerts **already enforce** these preferences (haversine ≤ `coverage_radius_km`, or travel-states check; missing coords/radius → silently no match). Alerts do **not** check a minimum hourly rate; talent-post radius is a separate snapshot.
**RECOMMENDED:** A — Yes, alerts respect both (keep distance/travel matching; add a worker minimum-rate preference for alerts; search can still widen).
**ALTERNATIVE A — Keep current logic:** respect existing distance/travel preferences without filtering alerts by minimum rate. Scenario: worker gets alerts for shifts below their rate, applies, then counters — wasted round trip.
**Other / Defer.** Edge: rate is a range / varies by day; distance from home vs current location. Web/Expo: same.
**Sources:** ADOPTED GM-19.
**Decision status:** OPEN.

### GM-23-11 — AG-Q11. Which shifts get pre-shift reminders, and when? (re-verified this trace)

**Plain English:** who gets reminded before a shift, how many times, and how close to the start?
**ACTUAL TODAY — Web and Expo (same backend, verified `backend/shifts/tasks.py`):** an hourly job emails every worker with a `ShiftSlotAssignment` once, when the slot starts 12–13 hours ahead in **pharmacy-local time** (`get_pharmacy_timezone`). Reservations: whether a payment-pending reservation holds an assignment row is GM-13 territory — the function has no payment/reservation filter, so this trace cannot confirm the Oct claim "reservations get none". No push, no in-app copy, no second reminder, no dedupe record.
**Normal case:** confirmed booking, one email ~12h before. **Edge:** shift starting in <2h — no reminder (window already passed). Shift cancelled after the email — the row is deleted, so no *further* email, but the sent one is never retracted. **Retry:** a beat retry/re-run would resend (no sent-record). **Denied role:** only the assigned worker gets it. **Payment side effect:** none; but if reservations do hold assignment rows, a reminder could imply a booking is confirmed when it is only held (GM-13 to confirm). **Web/Expo:** email-only on both.
**RECOMMENDED:** A — Confirmed only, 24h and 2h before; one per worker per date.
**ALTERNATIVE A — Keep current logic:** one email ~12h before each assigned slot. Scenario: worker misses the single email, no closer nudge, no-show risk.
**ALTERNATIVE B:** Confirmed only, 24h before (fewer messages).
**ALTERNATIVE C:** Also reservations (reminds about unpaid holds — but risks nagging for a hold that may expire; interacts with D02/D03).
**Other / Defer.**
**Sources:** `backend/shifts/tasks.py` (`send_shift_reminders`), `backend/core/settings.py` (beat `shift-reminders-hourly`), `backend/organizations/timezone.py`.
**Decision status:** OPEN.

### GM-23-12 — AG-Q12. If a shift changes inside 12 hours of start, what happens to reminders? (re-verified this trace)

**Plain English:** the start time moves after the reminder went out — does the worker get told?
**ACTUAL TODAY — Web and Expo (same backend):** no special handling for a plain re-time: the 12h reminder reads the slot's current time when it fires, and there is no cancellation of an already-sent reminder and no instant alert. **But** the roster edit path now has a real mechanism: `unpublish_roster_shift` takes one shift back to draft (hidden from workers, audit only, **no notification**), and `republish_roster_shift` notifies with the manager's choice of worker / team / none (default worker, "Roster updated"). Whether every re-time goes through unpublish/republish (slot-mutability guard not read) is UNKNOWN.
**RECOMMENDED:** A — Instant alert; old reminders cancelled; new reminder uses new details.
**ALTERNATIVE A — Keep current logic:** no late-change alert beyond the republish notice; reminder uses current slot time. Scenario: worker turns up at the old time; pharmacy is short.
**Other / Defer.** Edge: change inside 2h; change after the worker has already left home. Concurrency: reminder firing at the same moment as the change. Web/Expo: same backend gap; the republish notice exists on both via the same API.
**Sources:** `backend/workforce/roster/publication.py` (`unpublish_roster_shift`, `republish_roster_shift`), `backend/shifts/tasks.py`.
**Decision status:** OPEN.

### GM-23-13 — PO-Q05. For multi-date posts, how is "same worker for every date" set? (re-verified this trace, first half)

**Plain English:** does one worker have to take every date in a block, or can different workers take different dates?
**ACTUAL TODAY — Web:** owners tick the single-user switch in the shared post-shift wizard (`PostShiftForm`: `singleUserOnly` → `Shift.single_user_only`, "only one user may take the entire shift (all slots)"); one worker then takes the whole block. Otherwise each date is a separate slot. **Expo:** whether the switch exists in the Expo post-shift flow was not verified here (W3b/GM-10). **Worker cards:** the Oct gap ("cards don't say 'all dates required'") was **not** re-checked in this trace.
**RECOMMENDED:** KEEP — today's switch is exactly what Locumate asks; the only gap is a label fix on worker cards (to be confirmed).
**ALTERNATIVE A:** Always separate dates (simpler; no continuity). Scenario: a 5-day block needs 5 workers; handover each day.
**Other / Defer.** Edge: worker takes the block then cancels one date (D05 — one date vs whole posting?). Calendar display: block shown as one entry or five? Web/Expo: switch verified on web only.
**Sources:** `backend/shifts/models.py` (`single_user_only`), `frontend_web/shared/postShift/PostShiftForm.tsx`.
**Decision status:** OPEN.

### GM-23-14 — PO-Q06. How far ahead can recurring shifts run? (re-verified this trace — CHANGED)

**Plain English:** can a weekly shift repeat for years, or is there a limit?
**ACTUAL TODAY — Web:** recurring slots need weekdays and an end date — enforced in **three** places: `ShiftSlot.clean()` (backend, `recurring_end_date` required and after the start date), the wizard timetable step ("Pick the weekdays and the date it repeats until."), and the wizard date picker, which caps selectable dates at today + 4 months (UI only). There is **no maximum horizon in the backend** beyond "an end date must exist" — a 2-year recurrence is storable if the picker cap is bypassed (API-level horizon untested). **Expo:** not verified here (GM-10).
**RECOMMENDED:** A — Up to 12 weeks; repost to extend. (Rates/availability go stale over longer runs.)
**ALTERNATIVE A — Keep current logic:** end date required, picker cap ~4 months on web, no backend horizon. Scenario: a 2-year recurrence with a rate set in 2026 still filling in 2028 (via API).
**ALTERNATIVE B:** Up to 6 months. Scenario: fewer reposts, more staleness.
**Other / Defer.** Edge: recurrence crossing a rate/Award change; DST. Calendar: long recurrences flood the team calendar (but note: recurring *shifts* do not appear on the team calendar at all — F12). Web/Expo: web verified; Expo unknown.
**Sources:** `backend/shifts/models.py` (`ShiftSlot.clean`), `frontend_web/shared/postShift/useShiftTimetable.ts` (`maxCalendarDate`, `handleAddManualSlot`).
**Decision status:** OPEN.

### GM-23-15 — PO-Q07. How should owners repeat a past shift? (re-verified as far as traced)

**Plain English:** can an owner copy last week's shift instead of retyping it?
**ACTUAL TODAY — Web:** no duplicate, post-again or shift template exists in the files read (`PostShiftForm`, `PostShiftDetailsStep`, `useShiftTimetable`). Owners can only save and reuse a **description** template per pharmacy and role (`useShiftDescriptionTemplate`, "Save for future shifts"). **Expo:** not checked (GM-10/W3b).
**RECOMMENDED:** A — "Post again" copies, dates reviewed. (Instawork book-again / LocumCo+ duplication pattern.)
**ALTERNATIVE A — Keep current logic:** retype each shift; only the description can be reused.
**ALTERNATIVE B:** Saved named templates. **ALTERNATIVE C:** Both (most flexible; most to build).
**Other / Defer.** Edge: copying a shift whose rate/Award terms changed; copying a shift for a different pharmacy (wrong tenant — must not copy across pharmacies). Calendar: copied dates must be reviewed, not silently reused.
**Sources:** `frontend_web/shared/postShift/PostShiftDetailsStep.tsx`, `useShiftDescriptionTemplate.ts` (listing), `PostShiftForm.tsx`.
**Decision status:** OPEN.

### GM-23-16 — LA-Q17 / AV-04. Match emails miss escalated shifts and reach unverified workers. Fix before launch? (re-verified this trace)

**Plain English:** when a shift widens to the public, do available workers hear about it — and do workers who can't apply get emailed anyway?
**ACTUAL TODAY — Web and Expo (same backend):** availability-match messages run when posting directly to public, not when shifts later escalate there (`escalation.py` has no announce call; `auto_escalate_due_shifts` has no beat entry and is only called lazily from `get_queryset`). Recipients are filtered by active account, role and travel/availability, but **not Verified** (adopted GM-19); the same backend serves both apps.
**RECOMMENDED:** A — Before launch. Fix both: notify on escalation to PLATFORM, and filter recipients by Verified (eligible recipients only).
**ALTERNATIVE A — Keep current logic:** post-time-only matching, unverified recipients included. Scenario: escalated vacancy sits unfilled; unverified worker gets an alert, applies, is blocked.
**ALTERNATIVE B:** Notify on escalation only; keep unverified recipients (with "finish verification to apply" CTA). **ALTERNATIVE C:** Verified-only, post-time only.
**Other / Defer.** Edge: worker becomes Verified between posting and escalation. Retry: escalation + match email both firing — dedupe. Web/Expo: same backend.
**Sources:** `backend/shifts/escalation.py`, `backend/shifts/base.py` (`get_queryset`), ADOPTED GM-19 (`announcements.py`).
**Decision status:** OPEN.

### GM-23-17 — LA-Q18 / AV-05. Availability input has no validation. Fix before launch? (ADOPTED GM-18/GM-19)

**Plain English:** can a broken calendar entry (end before start, impossible weekday) be saved?
**ACTUAL TODAY — Web and Expo:** both apps check time order and repeat fields, but the API serializer has **no semantic validation** for time order, weekdays, recurrence, past dates or duplicates. Direct API calls bypass the client checks.
**RECOMMENDED:** A — Before launch. Add server-side semantic validation so malformed availability cannot corrupt matching; this is correctness work, not a new owner policy.
**ALTERNATIVE A — Keep current logic:** client checks only. Scenario: a bad row saved via API breaks matching for that worker silently.
**Other / Defer.** Edge: past dates, duplicate rows, weekday 7, overnight end<start. Web/Expo: both clients check; API does not.
**Sources:** ADOPTED GM-18/GM-19 (`backend/talent/serializers/availability.py`).
**Decision status:** OPEN.

### GM-23-18 — NEW. Team calendar views: day / week / month — what does each role see? (verified this trace)

**Plain English:** when a manager opens the team calendar, do they see a day, a week, or a month — and can a worker see anyone else's shifts?
**ACTUAL TODAY — Vite:** the **team calendar** (`PharmacyCalendarPage`) is a **month grid only**, with a day-detail panel; it shows events, work notes and birthdays — never shifts. The **roster calendar** (`RosterWorkerPage` / `RosterOwnerPage`) is react-big-calendar with **month / week / fortnight / day** views (default week) and shows assignments, open shifts, leave and cover states — and the worker page shows **team assignments with names** (role/pharmacy filters). **Expo:** the team calendar (`SharedCalendarScreen`) is the same month grid as Vite; `my-roster` is a **week view of the worker's own assignments only** (`ownRosterAssignments` — function body not read, name + code comment verified); the manager calendar screen is a week-at-a-glance **roster**, not the team calendar. **Next:** no calendar or roster surface at all.
**Normal case:** manager opens the month grid; worker opens their roster week. **Edge:** multi-pharmacy manager switching pharmacies — the Expo calendar scope helper falls back to the first permitted pharmacy (`pickAllowedCalendarPharmacyId`, tested); the web page defaults from `?pharmacy_id=` or first membership. **Wrong tenant:** server scopes fail closed (empty list / 403) on every calendar endpoint. **Web/Expo difference:** the big one — Vite's worker roster shows the team; Expo's worker roster shows only self.
**RECOMMENDED:** Month view by default for managers (whole team), week/day for the worker's own shifts on the roster; a worker sees only their own assignments + "needs cover" slots on the roster, never colleagues' pay/leave reasons. The team calendar (events/notes/birthdays) stays month-only on both clients.
**ALTERNATIVE A:** One shared month view for everyone, with role-based row masking. **ALTERNATIVE B:** No team calendar on mobile at launch (list only) — **not** the current state (Expo has the month grid); declaring this would mean removing it. **ALTERNATIVE C:** Worker sees full team roster (transparency) — privacy trade-off, needs consent; this is what Vite does today, so C is closer to "keep Vite, change Expo".
**Other / Defer.** The Vite-vs-Expo worker-roster visibility split (team vs own-only) needs an explicit owner choice either way — it cannot stay accidental.
**Sources:** `frontend_web/src/pages/dashboard/sidebar/PharmacyCalendarPage.tsx`, `calendarViews.tsx`, `RosterWorkerPage.tsx`, `RosterOwnerPage.tsx`; `frontend_mobile/roles/shared/calendar/index.tsx`, `calendarModel.ts`, `calendarScope.test.mjs`, `app/my-roster.tsx`, `features/parity/roster.tsx`.
**Decision status:** OPEN.

### GM-23-19 — NEW. Operations tasks / rules engine: what rules run, when, and who acts on them? (verified this trace — the engine is gone)

**Plain English:** the system flags things like "registration expiring" — what flags exist, and what happens when one fires?
**ACTUAL TODAY — Web and Expo (same backend):** there is **no operations-rules engine in `team_calendar/`** at this head — `operations_rules.py` does not exist (directory listing proves it), and nothing in the team-calendar models/views/tasks/serializers checks AHPRA, Verified status, or any other ops rule. What exists instead: (a) work notes with `notify_on_shift_start` (a per-note flag, not a rule engine); (b) roster validation warnings/errors at placement time (`worker_issues`); (c) an AHPRA overdue-alerts beat every 15 minutes in `onboarding.tasks.alert_overdue_ahpra_checks` — whether it only alerts or also blocks is GM-02 territory, not traced here. No scheduled re-check of Verified status lives in the calendar.
**RECOMMENDED:** Inventory every rule first (starting from the AHPRA beat and the roster validation rules); each rule gets owner + action + deadline + escalation. Rules that block booking (e.g. lapsed AHPRA) must be fail-closed.
**ALTERNATIVE A:** Rules are advisory only (flag, never block). **ALTERNATIVE B:** Rules block the affected action until cleared. **Other / Defer.**
**Edge:** rule fires for a worker mid-shift; rule data stale (no scheduled re-check of Verified — ON-02). **Unknown:** whether any code still imports `team_calendar.operations_rules` (dead-import check not done — a leftover import would break at runtime).
**Sources:** `backend/team_calendar/` (listing), `models.py`, `views.py`, `tasks.py`; `backend/core/settings.py` (beat `ahpra-overdue-alerts`).
**Decision status:** OPEN.

### GM-23-20 — NEW. Leave on the calendar: how do leave / roster / cover requests appear? (verified this trace)

**Plain English:** when someone is on leave, does the calendar show it, and does it block rostering them?
**ACTUAL TODAY — Vite:** leave **does** render on the roster calendar: the event title gains `(Leave: PENDING|APPROVED|…)` and the event colour changes (`LEAVE_PENDING` / `LEAVE_APPROVED`), on both the worker page and the owner page; the owner page has leave approve/reject dialogs. But the worker **stays assigned** (GM-06: approval changes only the leave row) — the shift still shows, coloured as on-leave. **Date-range leave (no assignment) appears nowhere** on any calendar: there is no assignment row to hang an event on. **Expo:** `my-roster` carries the leave request on the assignment and offers leave/cover dialogs for the worker's own shifts; whether it renders a distinct leave colour/label on its week view was **not** verified (event styling not read). The team calendar (events/notes/birthdays) shows no leave on either client. **Roster blocking:** approved leave is a hard error for *replacement* candidates (`APPROVED_LEAVE_CONFLICT`) but nothing stops a manager rostering a worker inside an approved leave range (GM-06-Q07).
**RECOMMENDED:** Approved leave renders as a blocked-out day on the team calendar and blocks roster assignment + availability matching for those dates; pending leave shows as tentative.
**ALTERNATIVE A:** Leave is invisible on the calendar (manager memory only). **ALTERNATIVE B:** Leave blocks rostering but is not shown (privacy). **Other / Defer.**
**Edge:** leave approved after a shift was already assigned (today: shift stays assigned, coloured); overlapping leave + confirmed locum booking; leave reason visibility (never show reason to colleagues — the calendar today shows only the status, not the note, on Vite).
**Sources:** `frontend_web/src/pages/dashboard/sidebar/RosterWorkerPage.tsx` (event titles + `eventStyleGetter`), `RosterOwnerPage.tsx`; `frontend_mobile/app/my-roster.tsx`; ADOPTED GM-06 (`leave_service.py`).
**Decision status:** OPEN.

### GM-23-21 — NEW. Shift display on the calendar: what state does each entry show? (verified this trace)

**Plain English:** can you tell at a glance whether a calendar entry is a draft, an open vacancy, a reservation waiting for payment, a confirmed booking, needs-cover, or cancelled?
**ACTUAL TODAY — Vite + Expo:** there is **no single display-state field and no unified vocabulary**. State is derived per surface: `Shift.visibility` (5 tiers) + `Shift.payment_status` (NOT_REQUIRED / PENDING / PAID) + assignment presence (`is_rostered`, slot `unpublished_at`) + `WorkerShiftRequest` status. What each surface actually shows: **team calendar** — only event / note / birthday (no shift states at all). **Roster calendar (Vite)** — "Open Shift: <role>" (click to claim), "Cover Request (PENDING|APPROVED|REJECTED)", worker name + "(Leave: STATUS)", role colours, dashed borders for open/approved-cover. **Roster (Expo my-roster)** — own assignments, open shifts, pending cover requests (styling not fully read). A **reservation waiting for payment is not distinguishable** on any calendar traced here — the roster event builder does not reference `payment_status` in the lines read (GM-13 owns the reservation model; whether a reservation renders distinctly is UNKNOWN). A cancelled assignment is a **deleted row** (`ShiftSlotAssignment` has no status field), so cancelled work simply disappears rather than showing as cancelled.
**RECOMMENDED:** One state per entry, same labels on web + Expo: Draft / Open / Reserved (pay by [time], D02) / Confirmed / Needs cover / Cancelled / Completed. A reservation must never look confirmed.
**ALTERNATIVE A:** Calendar shows only confirmed + rostered work (open vacancies live only on boards). **ALTERNATIVE B:** Calendar shows everything including drafts. **Other / Defer.**
**Edge:** unpaid reservation expires (D03) — entry must clear without manual work. Concurrency: two workers reserving the same slot. **Payment side effect:** `payment_status=PENDING` on the shift is the only reservation signal in the model, and no calendar reads it.
**Sources:** `backend/shifts/models.py` (`Shift.payment_status`, `Shift.visibility`, `ShiftSlotAssignment` — no status field), `frontend_web/src/pages/dashboard/sidebar/RosterWorkerPage.tsx`, `RosterOwnerPage.tsx`.
**Decision status:** OPEN.

### GM-23-22 — NEW. Operations dashboard: what does it show, to whom, and how fresh is it? (verified this trace — NOT BUILT)

**Plain English:** is there a page that says "today: 3 shifts unfilled, 2 expiring reservations, 1 lapsed registration" — and who sees it?
**ACTUAL TODAY — Vite, Next, Expo:** **no operations dashboard exists.** No ops-dashboard endpoint, page, or shared-core contract was found: `shared-core/src/domains/dashboards/api.ts` exposes only the five role dashboards (`/dashboard/organization/<id>/`, `/dashboard/owner/`, `/dashboard/pharmacist/`, `/dashboard/otherstaff/`, `/dashboard/explorer/`), whose contents were not traced here. The closest existing surfaces are the roster pages (coverage panel on the owner page), the shift boards, and the manager roster parity screens (approvals/audit/validate). Nothing aggregates "today's coverage, unfilled/needs-cover, expiring reservations, pending approvals, lapsed credentials" in one place.
**RECOMMENDED:** Owner/manager dashboard: today's coverage, unfilled/needs-cover, expiring reservations (D02 countdowns), pending cover/swap approvals, lapsed-credential flags; refreshed on load, never cached across pharmacy switches (cf. PR #249 `d15304b0` fail-closed filters).
**ALTERNATIVE A:** No ops dashboard at launch (boards + lists only). **ALTERNATIVE B:** Dashboard for platform admins only. **Other / Defer.**
**Edge:** manager with two pharmacies — dashboard must be scoped to the selected pharmacy, fail-closed if none selected (the Expo calendar scope helper is the pattern to copy).
**Sources:** `shared-core/src/domains/dashboards/api.ts`; directory listings (no ops-dashboard page found on any client).
**Decision status:** OPEN.

### GM-23-23 — NEW. Clock / timezone: whose time is a shift time? (verified this trace — ALTERNATE FIRST QUESTION)

**Plain English:** a shift at "9am" — 9am in Brisbane, in the pharmacy's timezone, or on the worker's phone?
**ACTUAL TODAY — verified, three clocks at once:** (1) **Server default** `TIME_ZONE = 'Australia/Sydney'`, `USE_TZ = True` (`backend/core/settings.py`). (2) **Pharmacy-local time** for scheduled work: `organizations/timezone.py::get_pharmacy_timezone` resolves an explicit `pharmacy.timezone` field, then postcode `2880` → Broken Hill, then a state map (NSW/ACT→Sydney, VIC→Melbourne, QLD→Brisbane, WA→Perth, SA→Adelaide, TAS→Hobart, NT→Darwin), then the server default. Both the work-note notifications and the 12h reminder compute their windows in pharmacy-local time. (3) **Per-user push-preference timezone**, default `Australia/Brisbane` (`NotificationPushPreference.time_zone`), used only for quiet-hours checks. **Storage:** shift and calendar dates are **naive local dates + naive times** (`ShiftSlot.date` + `start_time`/`end_time`; `CalendarEvent.date` + times) — there is no UTC instant stored for a shift; the pharmacy timezone is applied at *read/compute* time, not stored with the slot. **Display:** both calendar pages parse dates device-local (`toDate`: `new Date("YYYY-MM-DDT00:00:00")`; roster pages use `moment("YYYY-MM-DD HH:mm")`) — a worker in Perth viewing a Sydney pharmacy's 9am shift sees it rendered in device-local terms with **no timezone label anywhere traced**. **DST:** no DST test or transition handling was found in the traced files; the reminder window adds 12h to an aware local datetime, so a repeated/skipped hour at a DST boundary is an unhandled edge. **Weekday split:** availability recurrence counts Sunday=0; shift and team-calendar recurrence count Monday=0.
**RECOMMENDED:** Store UTC; display in the pharmacy's timezone on every screen (web + Expo), with the timezone named next to the time; reminders fire on pharmacy-local time; DST transitions must not shift or duplicate a slot.
**ALTERNATIVE A:** Display in the viewer's device timezone. **ALTERNATIVE B:** Display in a single platform timezone (AEST) everywhere. **Other / Defer.**
**Edge:** DST change inside a recurring block; worker in another state; shift crossing midnight (wizard rejects finish ≤ start, so overnight entry is blocked on the manual path — `ShiftSlot.clean()` still handles overnight for breaks); reminder at 2h before a DST-shifted start. **Legal/financial: pay/Award calculations depend on the correct local date — a wrong timezone can misprice a shift. Severity: high — decide before launch.**
**Sources:** `backend/core/settings.py:457,461`, `backend/organizations/timezone.py`, `backend/shifts/tasks.py`, `backend/team_calendar/tasks.py`, `backend/shifts/models.py` (`ShiftSlot`), `frontend_web/src/pages/dashboard/sidebar/PharmacyCalendarPage.model.ts`, `RosterWorkerPage.tsx`.
**Decision status:** OPEN — **alternate first question (Part D)**.

### GM-23-24 — NEW. Calendar permissions: who can create / edit / delete calendar entries, per role and per pharmacy? (verified server-side this trace)

**Plain English:** can a casual worker edit the team calendar, or only owners and managers — and only for their own pharmacy?
**ACTUAL TODAY — backend (verified `backend/team_calendar/views.py`):** **events** — create/edit/delete requires `can_manage_calendar`: pharmacy admin, org member with `MANAGE_ROSTER`/`MANAGE_ADMINS`, or the pharmacy owner; org-level events require an org-wide admin role; auto-generated events (birthday/shift/org) can never be edited or deleted; an event cannot be reassigned to another pharmacy/org. **Work notes** — **any active member** of the pharmacy can create/edit/delete; only the assignee (or a manager) can mark one done. **Birthdays** — visible to managers only. **Feed** — scoped to accessible pharmacies/orgs, fail-closed (empty list or 403). **Clients:** the web and Expo calendar pages rely on these server rules (create/edit buttons are shown, the server decides); **which Vite routes expose `PharmacyCalendarPage` to which roles was not traced** (route registration UNKNOWN). **Expo:** the calendar is routed for owner (`app/owner/calendar.tsx`) and pharmacist (`app/pharmacist/calendar.tsx`); otherstaff/explorer routes UNKNOWN.
**RECOMMENDED:** Owner + authorised managers only for events, scoped to their pharmacy; workers edit only their own availability; locums edit nothing on the team calendar; any active member may create work notes (as today); admin override is audited.
**ALTERNATIVE A:** Any staff member can propose changes (manager approves). **ALTERNATIVE B:** Managers edit, owners only view. **Other / Defer.**
**Edge:** denied role / wrong tenant must fail closed with no data leaked (verified: empty list / 403, no data); manager whose membership was revoked mid-session (server re-checks per request — membership is queried live).
**Sources:** `backend/team_calendar/views.py` (`CalendarScopeMixin`, `CalendarEventViewSet`, `WorkNoteViewSet`), `test_api.py` (30 tests incl. tenant isolation B06/B07).
**Decision status:** OPEN.

### GM-23-25 — NEW. External calendar: export / sync to Google / Outlook / Apple, or ICS download? (verified this trace — NOT BUILT)

**Plain English:** can a worker add a confirmed shift to their phone calendar with one tap?
**ACTUAL TODAY — Vite, Next, Expo:** **nothing exists.** No ICS export, no Google/Outlook/Apple sync, no export route, no shared-core contract, no UI affordance was found in any traced file (team-calendar urls expose only `calendar-events/`, `work-notes/`, `calendar-feed/`; the calendar contract is events + work notes only). A worker who wants a shift in their phone calendar must retype it.
**RECOMMENDED:** ICS download for confirmed bookings only (no pay/rate in the file, no reservation state), per-worker, revocable link or one-off file — decide after privacy review.
**ALTERNATIVE A:** No export at launch. **ALTERNATIVE B:** Full two-way sync. **Other / Defer.**
**Edge:** exported event goes stale after a late change (GM-23-12) — no update pushed. Privacy: exported file must not contain other workers' details (the Vite roster page shows team names — an export built from that view would leak them).
**Sources:** `backend/team_calendar/urls.py`, `shared-core/src/contracts/calendar.ts`, `shared-core/src/domains/calendar/api.ts` (no export surface anywhere traced).
**Decision status:** OPEN.

### GM-23-26 — NEW. Calendar notifications: which calendar events notify, on which channel, and can the worker turn them off? (verified this trace)

**Plain English:** new shift on your calendar, a cover request, a time change — email, push, or in-app only?
**ACTUAL TODAY — verified per channel:** **Shift reminders:** email only (`send_shift_reminders`), no push/in-app, no per-worker opt-out (not routed through `notify_users` at all, so push preferences do not apply). **Work notes:** in-app + WebSocket + Expo push via `notify_users` (type `WORK_NOTE`, `push_work_notes` pref, quiet hours apply, deduped per note+day). **Roster publish:** in-app + push via `notify_users` (default type `TASK`, so the `push_tasks` pref governs it). **Roster republish:** same, with manager-chosen audience (worker/team/none). **Unpublish (whole week or one shift):** silent — no notification at all. **Cover/swap/release/reject:** no notification call in `worker_actions.py` (audit rows only; view-layer notification UNKNOWN). **Match alerts:** email/in-app at posting time only (GM-23-16). **Push preferences** (`NotificationPushPreference`, migration `0004`): per-user, one-to-one; `push_messages`/`push_tasks`/`push_work_notes`/`push_alerts` all default **True**; quiet hours default **off**, 22:00–07:00 when on, judged in the user's own `time_zone` (default Brisbane); **alerts bypass quiet hours** but honour an explicit alert opt-out; an invalid timezone blocks push (logged); push failure never removes the durable in-app notification; opting out of push never removes the in-app notification.
**RECOMMENDED:** Email for reminders (GM-23-11) + push for time-critical calendar changes (GM-23-12) + in-app inbox; one worker-level opt-out for non-critical alerts, never for cancellation/time-change alerts.
**ALTERNATIVE A:** Email only at launch. **ALTERNATIVE B:** Push for everything. **Other / Defer.**
**Edge:** a worker who opts out of `push_tasks` silently loses roster-publish notices (push only — the in-app copy still arrives); a worker who opts out of `push_alerts` still gets alerts in-app. Cancellation alerts: no cancellation notification was verified in the traced files (GM-15 owns cancellations).
**Sources:** `backend/notifications/models.py`, `backend/notifications/services.py` (`notify_users`, `push_allowed_for_notification`, `_deliver_notification`), `backend/notifications/migrations/0004_notificationpushpreference.py`, `backend/shifts/tasks.py`, `backend/team_calendar/tasks.py`, `backend/workforce/roster/publication.py`.
**Decision status:** OPEN.

### GM-23-27 — NEW. Roster publishing: what does publishing a roster do to calendars, and can it be undone? (verified this trace)

**Plain English:** when a manager publishes next week's roster, do workers get told — and what if there's a mistake?
**ACTUAL TODAY — Web and Expo (same backend, `backend/workforce/roster/publication.py`):** publishing **validates first** (blocking errors block; warnings block unless forced or individually acknowledged), sets the week PUBLISHED with `published_at`/`published_by`, writes a `RosterPublicationAudit` revision, restores any individually-withdrawn slots, and **notifies every assigned worker** (in-app + push per prefs, "Roster published", link to their roster). It **never** converts marketplace bookings and **never** triggers escalation (carried E03, re-confirmed). Workers see only PUBLISHED/ARCHIVED weeks — **drafts are never returned** (`get_worker_published_roster`). **Undo:** whole-week unpublish returns the week to DRAFT (hidden from workers immediately, **no notification**, revision bumped); per-shift unpublish takes one shift back to draft (hidden, audit only, no notification); per-shift republish re-validates errors only and notifies worker / team / none (manager's choice, default worker, "Roster updated"). Archived weeks cannot be unpublished or republished.
**RECOMMENDED:** Publishing notifies only affected staff, writes the calendar entries once, and keeps a draft until published; un-publish/re-publish is an explicit manager action with a new notice, not a silent edit.
**ALTERNATIVE A:** Silent publish (workers check the calendar). **ALTERNATIVE B:** Publish = immediate escalation to locums for gaps. **Other / Defer.**
**Edge:** publishing a roster that conflicts with approved leave or a confirmed locum booking (validation errors block publish — `worker_issues` runs; approved-leave-as-replacement is an error, but rostering *into* approved leave is GM-06-Q07's open gap). Republish after an edit must re-validate (it does — errors only, warnings not re-checked on the per-shift path).
**Sources:** `backend/workforce/roster/publication.py` (whole file), `frontend_web/src/pages/dashboard/sidebar/RosterOwnerPage.tsx`, `frontend_mobile/features/parity/roster.tsx` (publish/validate/acknowledgements screens).
**Decision status:** OPEN.

### GM-23-28 — NEW. "Needs cover" on the calendar: who sees it, and how is it filled without double-booking? (verified this trace)

**Plain English:** a shift needs cover — does it show on the team calendar, and can two people claim it?
**ACTUAL TODAY — Web and Expo:** there is **no "needs cover" state anywhere** — not on the team calendar (events/notes/birthdays only), not as a flag on any model, and not as a roster label. What exists: a `WorkerShiftRequest` in PENDING status, shown on the Vite roster as **"Cover Request (PENDING)"** (and APPROVED/REJECTED after decision), in the Expo worker roster's "Pending cover requests" section, and in the manager approvals screen. The assignment **stays with the original worker** until a replacement is approved (carried R04) or the worker is released. **Filling:** manager approves one replacement — atomic (`select_for_update`), stale-request guard (requester must still be the assignee), replacement must pass `worker_issues` errors **and** warnings; a second approval attempt fails ("Request is already approved"). **Release:** deletes the assignment and reuses the Shift/Slot, optionally escalating visibility (daily PLATFORM limit enforced) — one vacancy, no duplicate (carried R06). **Who sees it:** the requesting worker, the manager (approvals), and — on Vite — anyone viewing the team roster (the cover-request event is visible with its status).
**RECOMMENDED:** One calendar entry, state "Needs cover", linked to the single vacancy; claiming it goes through the R04C fulfilment path (accept + role/conflict checks + manager approval); the entry clears only when the replacement is confirmed.
**ALTERNATIVE A:** Needs-cover shows only to managers until a vacancy is posted. **Other / Defer.**
**Edge:** two colleagues accept cover at once — first confirmed wins, second gets a clear "already filled" message, no double assignment (guarded by the PENDING-status check + row lock).
**Sources:** `backend/workforce/roster/worker_actions.py` (`submit_cover_request`, `approve_cover_replacement`, `release_worker_from_assignment`), `frontend_web/src/pages/dashboard/sidebar/RosterWorkerPage.tsx`, `RosterOwnerPage.tsx`, `frontend_mobile/app/my-roster.tsx`, `features/parity/roster.tsx`.
**Decision status:** OPEN.

### GM-23-29 — NEW. Calendar history / audit: can the owner see who changed what, when? (verified this trace — split)

**Plain English:** if a shift time was changed, is there a record of who changed it?
**ACTUAL TODAY — split:** **Roster actions are audited.** `RosterActionAudit` is append-only and records swap/cover requested/approved/rejected, worker released, shift unpublished/republished (actor, target, slot before/after snapshots, request ids); `RosterPublicationAudit` records every publish as a numbered revision with a validation snapshot; the manager roster has an audit screen (`audit.tsx`). **Calendar events and work notes are NOT audited:** `team_calendar/views.py` writes no audit rows — the only history is `created_by`, `created_at`, `updated_at` on each row (who created it and when it was last touched, not what changed). There is no audit view for calendar events/notes on any client.
**RECOMMENDED:** Every calendar-affecting change (create, re-time, cancel, cover, publish) writes an audit entry with actor, old/new values, and time; visible to owner/manager for their pharmacy.
**ALTERNATIVE A:** No audit at launch (rely on chat/email). **Other / Defer.**
**Edge:** a work note edited by a colleague — today only `updated_at` moves, with no record of who or what. **Wrong tenant:** audit reads must be scoped per pharmacy like everything else (the manager audit screen is pharmacy-scoped).
**Sources:** `backend/workforce/roster/worker_actions.py`, `backend/workforce/roster/publication.py`, `backend/workforce/models.py` (`RosterActionAudit`, `RosterPublicationAudit` — referenced), `backend/team_calendar/views.py` (no audit writes), `frontend_mobile/app/manager/roster/audit.tsx` (listing).
**Decision status:** OPEN.

---

## Part D — The SINGLE first decision question

**Ask GM-23-01 first** — "Is the worker availability calendar the single live source of truth, with talent posts showing live calendar data — not a copied snapshot?"

Why first: every other GM-23 decision depends on it. If posts hold stale copies, then matching (GM-23-04), visibility (GM-23-05), booking-blocking (GM-23-06), freshness (GM-23-08), match emails (GM-23-16) and the ops dashboard (GM-23-22) all reason about wrong dates. Fixing the source of truth first unblocks the rest; deciding matching rules first would optimise alerts for data that is already stale. It is also the #184 "fix before launch" item with the clearest launch-gating harm (a pharmacy inviting a worker for a date they removed). It is fully verified at the current head (adopted GM-18/GM-19), so KEEP is a known quantity, not an unknown.

**Question as asked to the owner (one question, plain English first):**

> When a worker changes their calendar, should their talent post change too — automatically? Today it doesn't: the dates typed when the post was written stay frozen in the post, even if the worker later removes those days from their calendar.

**Options:**

- **A — Before launch: make the calendar the single source of truth (RECOMMENDED).** Talent posts render live availability (or a live-linked subset the worker chose). Later calendar edits update the post automatically. *Benefit:* pharmacies never invite workers for removed dates. *Risk/cost:* needs a live-read path + the visibility consent in GM-23-05; more build than a label. *Scenario:* worker removes Saturday; their post stops showing Saturday the same day; no wasted invitation.
- **B — Keep current logic: copied snapshot.** Post keeps the dates typed when it was written; calendar edits don't touch it. *Benefit:* no build. *Risk:* stale invitations, wasted contact, worker frustration — the exact harm #184 flagged.
- **C — Copy, but stamp it "as at [date]" and auto-hide after N days without reconfirm.** *Benefit:* honest staleness, less build than a live link. *Risk:* still stale within the window; needs the N-day rule (GM-23-07) decided too.
- **Other (describe) / Defer.** *Defer consequence:* if deferred, GM-23-04/05/06/07/08/16 cannot be finally decided, because they all assume a known freshness model; launch would carry stale-post risk.

**Evidence:** `backend/talent/models.py` (`ExplorerPost.availability_days` vs `UserAvailability`), adopted GM-18/GM-19 (verified at head `97c4543e`).

**Second question after this one:** GM-23-23 (timezone) — the alternate first question. It is launch-gating and high-severity (pay/Award date correctness), but it does not unblock as many downstream decisions as GM-23-01. If the owner wants the clock question first, ask GM-23-23 with the same A/B/C/Other shape: A — store UTC, display pharmacy-local with the timezone named (RECOMMENDED); B — display in the viewer's device timezone; C — one platform timezone (AEST) everywhere.

---

## Part E — Gaps: code gaps vs decision gaps

### Code gaps (no owner decision needed — build/fix once confirmed; still NO code in this phase)

| # | Gap | Code to touch | Notes |
|---|---|---|---|
| CG-01 | No server-side availability validation (LA-Q18 / AV-05) | `backend/talent/serializers/availability.py` | Bare `ModelSerializer`, zero `validate_*`; no validation tests. Adopted GM-18/GM-19. Owner sub-decision only: may a worker backdate availability? |
| CG-02 | Talent-post availability snapshot never syncs (LA-Q16 / AV-01) | `backend/talent/models.py` | Structural fact; no sync mechanism exists. Fix follows the GM-23-01 decision. |
| CG-03 | Match alerts use any-overlap while roster uses full containment (AV-Q03) | `backend/shifts/announcements.py`, `backend/workforce/roster/validation.py` | Both verified; the fix follows the owner's GM-23-04 choice. |
| CG-04 | Match emails miss escalated shifts; no beat for escalation (LA-Q17, SH-05/SH-06) | `backend/shifts/escalation.py`, `backend/shifts/base.py`, `backend/core/settings.py` / `celery.py` | Escalation has no announce call and no beat entry; it runs lazily in `get_queryset` and skips any shift with prior interest. |
| CG-05 | Match emails reach unverified / AHPRA-lapsed workers (LA-Q17 second half) | `backend/shifts/announcements.py` | No Verified/AHPRA filter on recipients; no lapsed-credential re-check on post visibility. Adopted GM-19. |
| CG-06 | Booked time and approved leave do not suppress match alerts (AV-Q05) | `backend/shifts/announcements.py` | Roster blocks both; alerts block neither. Adopted GM-19. |
| CG-07 | **Operations-rules engine is gone; Oct citation dead** (ON-02) | `backend/team_calendar/` (absent), `backend/onboarding/` (AHPRA beat) | `operations_rules.py` does not exist at this head. Check whether any code still imports it (dead-import check NOT done). AHPRA overdue alerts now run on a 15-min beat (GM-02 owns whether they block). |
| CG-08 | Team-calendar recurrence/event validation gaps | `backend/team_calendar/serializers.py`, `recurrence.py` | No start<end check; no recurrence-schema validation; unknown `freq` silently yields zero occurrences (a mistyped rule makes an event vanish without error). |
| CG-09 | Weekday convention split | `backend/talent/models.py` vs `backend/shifts/models.py` vs `backend/team_calendar/recurrence.py` | Availability counts Sunday=0; shifts and team-calendar recurrence count Monday=0. One shared convention needed before any cross-calendar recurrence work. |
| CG-10 | Unpublish notifies nobody (whole week + per-shift) | `backend/workforce/roster/publication.py` (`unpublish_roster_period`, `unpublish_roster_shift`) | Workers discover it only by the shift disappearing. Republish notifies; unpublish does not. |
| CG-11 | Reminder has no dedupe record; email-only | `backend/shifts/tasks.py` (`send_shift_reminders`) | Window design prevents dupes in normal operation, but a beat retry/re-run would resend. No push/in-app copy; no reservation/payment filter in the function (GM-13 dependency). |
| CG-12 | No calendar export / sync (GM-23-25) | New: ICS endpoint + client affordance | Nothing exists on any client. Owner must decide scope first (GM-23-25), then build. |
| CG-13 | No operations dashboard (GM-23-22) | New: dashboard endpoint + page | Nothing exists; role dashboards exist but their contents were not traced. Owner must decide scope first (GM-23-22). |
| CG-14 | Next has no calendar or roster surface | `frontend_web/landing_next/migrated/pages/dashboard/sidebar/` | Only `ShiftsBoard` + `TalentBoard`. Parity gap (GM-25). |
| CG-15 | Team calendar and roster calendar never meet | `backend/team_calendar/` + roster views | Feed is events/notes/birthdays only; roster shows shifts/leave/cover only. No unified "what is happening at this pharmacy today" view exists. |
| CG-16 | Vite worker roster shows the team; Expo worker roster shows only self | `frontend_web/src/pages/dashboard/sidebar/RosterWorkerPage.tsx` vs `frontend_mobile/app/my-roster.tsx` (`ownRosterAssignments` — body not read) | Accidental split; needs an explicit owner choice (GM-23-18), not a silent difference. |
| CG-17 | No audit trail for calendar events / work notes | `backend/team_calendar/views.py` | Only `created_by`/`created_at`/`updated_at`. Roster actions are audited; calendar actions are not. |
| CG-18 | Authenticated talent list exposes author identity unmasked (LA-Q12) | `backend/talent/serializers/explorer.py`, `backend/talent/views/explorer.py` | Adopted GM-19. Public feed masks; authenticated list does not. |
| CG-19 | Missing coords/radius silently excludes a worker from matching | `backend/shifts/announcements.py` (`_user_can_travel_to_shift`) | Adopted GM-19. Worker is never told they are invisible to matching. |
| CG-20 | Wizard blocks overnight entry (finish ≤ start rejected) while the backend handles overnight | `frontend_web/shared/postShift/useShiftTimetable.ts` vs `backend/shifts/models.py` (`ShiftSlot.clean`) | Observation, not a tested failure: a night shift crossing midnight cannot be entered via the manual wizard path as read. GM-10 owns posting; flagged here because it shapes what the calendar can ever display. |
| CG-21 | Reminder emails bypass push preferences entirely | `backend/shifts/tasks.py` vs `backend/notifications/services.py` | Reminders are sent by direct email task, not `notify_users`, so quiet hours and per-type opt-outs never apply to them. |

### Decision gaps (owner must choose first — the Part C questions)

GM-23-01 (source of truth — FIRST) · GM-23-02 (blackout exceptions) · GM-23-03 (recurrence horizon + reconfirm) · GM-23-04 (single match rule) · GM-23-05 (availability visibility / opt-in) · GM-23-06 (booked time blocks alerts) · GM-23-07 (post inactivity window) · GM-23-08 (freshness stamp + reconfirm cadence) · GM-23-09 (urgent-alert consent) · GM-23-10 (minimum-rate alert filter — distance half is built) · GM-23-11 (reminder timing/channels) · GM-23-12 (late-change alerts) · GM-23-13 (all-or-nothing blocks + card label) · GM-23-14 (recurrence horizon) · GM-23-15 (repeat-a-shift) · GM-23-16 (escalation re-announce + Verified filter) · GM-23-17 (validation — code gap, one owner sub-decision on past dates) · GM-23-18 (calendar views + Vite/Expo roster visibility split) · GM-23-19 (ops rules: what exists, advisory vs blocking) · GM-23-20 (leave on calendar + rostering into approved leave) · GM-23-21 (single display-state vocabulary) · GM-23-22 (ops dashboard scope) · GM-23-23 (timezone — high legal/financial severity, alternate first) · GM-23-24 (calendar permissions incl. route gating) · GM-23-25 (export/sync scope) · GM-23-26 (notification channels + opt-outs) · GM-23-27 (publish/unpublish notice rules) · GM-23-28 ("needs cover" state + visibility) · GM-23-29 (calendar audit trail).

**Distinction applied:** LA-Q18 is a code gap (validation) even though it is phrased as a fix question; GM-23-23 (timezone) is a decision gap with high legal/financial severity (pay/Award date depends on local time) — it needs an owner choice, not just engineering. GM-23-22/25 (dashboard/export) are decision gaps first (scope), code gaps second.

---

## Part F — Implementation backlog (SEPARATE — FROZEN until the owner answers)

**Do not start any item below until its owner decision is recorded in Part C.** This backlog exists so that, once decisions land, implementation starts from a clear spec with exact files. No branch, no PR, no code change was made in this phase.

| Backlog item | Depends on (owner decision) | Files / functions to touch | Tests to add / update |
|---|---|---|---|
| BL-01 Talent posts live-linked to the calendar OR stamp + auto-hide copies | GM-23-01 | `backend/talent/models.py`, `views/explorer.py`, talent board (web + Expo) | Stale-post, live-update, opt-out cases |
| BL-02 Server-side availability validation (time order, weekdays, recurrence, past dates, duplicates) | GM-23-17 (code gap; past-date sub-decision only) | `backend/talent/serializers/availability.py`, `backend/talent/test_availability_api.py` | Positive/negative validation cases |
| BL-03 Match on escalation to PLATFORM + Verified-only recipients | GM-23-16 | `backend/shifts/escalation.py`, `backend/shifts/announcements.py`, beat entry | Escalation re-announce, Verified filter, dedupe cases |
| BL-04 Booked time (+ approved leave) blocks availability/alerts | GM-23-06 | `backend/shifts/announcements.py` (`announce_availability_matches`, `find_availability_matched_shifts`) | Booked/leave suppression + restore-on-cancel cases |
| BL-05 Single match rule everywhere | GM-23-04 | `announcements.py::_availability_matches_slot`, `validation.py`, dashboard recommendations | Touching-endpoint + overnight cases |
| BL-06 Reminders: 24h + 2h, confirmed only; suppress on cancel; instant late-change alert; dedupe record | GM-23-11, GM-23-12 | `backend/shifts/tasks.py`, `backend/core/settings.py` (beat), `publication.py` (unpublish notice) | Reminder windows, cancel suppression, retry-no-duplicate cases |
| BL-07 Availability freshness: reconfirm prompt + "last confirmed" stamp + inactivity hiding | GM-23-03, GM-23-07, GM-23-08 | `UserAvailability` (`confirmed_at`), both SetAvailability screens, nudge job | Reconfirm, stale-marking, pause cases |
| BL-08 Unavailable-date exceptions over recurring patterns | GM-23-02 | `UserAvailability` (blackout model), both SetAvailability screens, matching engine | Blackout precedence (blackout vs booking vs leave) cases |
| BL-09 Scheduled escalation job (not lazy on page load) + notify new tier | GM-23-16 + SH-05/SH-06 (cross-ref GM-11) | `backend/core/settings.py` (beat), `backend/shifts/base.py` (remove lazy call or keep as backstop) | Escalation timing, stall, daily-limit cases |
| BL-10 Timezone: store UTC, display pharmacy-local with label, DST-safe reminders | GM-23-23 | `backend/shifts/models.py`, `organizations/timezone.py`, both calendar pages, both roster pages, reminder/work-note tasks | DST boundary, cross-state, midnight-crossing cases |
| BL-11 Team-calendar views + ops dashboard, role/tenant-scoped, fail-closed | GM-23-18, GM-23-22, GM-23-24 | `PharmacyCalendarPage.tsx`, `SharedCalendarScreen`, new dashboard endpoint + page, `CalendarScopeMixin` | Role × pharmacy visibility matrix, stale-pharmacy-switch cases |
| BL-12 Leave-on-calendar + needs-cover single-entry + calendar audit trail | GM-23-20, GM-23-28, GM-23-29 | Roster event builders, `WorkforceLeaveRequest` rendering, `WorkerShiftRequest` "needs cover" state, audit writes in `team_calendar/views.py` | Leave-rendering, cover-claim race, audit cases |
| BL-13 Ops-rules inventory: confirm what replaced `operations_rules.py`; wire AHPRA/Verified rules to fail-closed where the owner chooses | GM-23-19 ( + GM-02 for the AHPRA beat) | Dead-import check for `team_calendar.operations_rules`; `onboarding.tasks.alert_overdue_ahpra_checks` | Lapsed-credential visibility + booking-block cases |
| BL-14 Calendar export (ICS for confirmed bookings, no pay/rate) | GM-23-25 | New export endpoint, per-worker token/file, both clients | Stale-export, privacy (no other workers' details) cases |
| BL-15 Notification-channel pass: reminders through `notify_users` (or a deliberate email-only decision), unpublish notice, cover/swap notices | GM-23-26, GM-23-27 | `backend/shifts/tasks.py`, `publication.py`, `worker_actions.py` (view layer) | Opt-out, quiet-hours, alert-bypass cases |
| BL-16 Expo parity pass for every GM-23 screen (W4) + positive/negative role tests | All above, after owner answers | `roles/shared/calendar/`, `app/my-roster.tsx`, `features/parity/roster.tsx`, Next surfaces (GM-25) | Role × client parity matrix; Next scope decision |
| BL-17 Weekday-convention unification (availability Sun=0 vs shifts/calendar Mon=0) | GM-23-03/04 (rule decisions) + code gap CG-09 | `talent/models.py`, `shifts/models.py`, `team_calendar/recurrence.py`, both availability screens | Recurrence-boundary cases |

**Ordering note:** BL-01 (source of truth) first after the first decision, then BL-10 (timezone) and BL-06 (reminders — no-show risk), then BL-03/BL-05 (matching), then BL-11/BL-12 (views + leave + cover), then the rest in owner-priority order. GM-02 (worker onboarding/credentials) owns the "Verified" definition that GM-23-16/BL-03 and GM-23-19/BL-13 depend on — sequence GM-02's Verified decision before implementing those. GM-13 owns the reservation model that BL-06's "confirmed only" wording depends on.

---

## Appendix — Evidence index (per-question source links, verified @ PR #249 head `97c4543e` unless marked ADOPTED/UNKNOWN)

- **Team calendar backend:** `backend/team_calendar/models.py` (`CalendarEvent`, `WorkNote`, `WorkNoteAssignee`, `WorkNoteCompletion`), `views.py` (`CalendarScopeMixin`, `CalendarEventViewSet`, `WorkNoteViewSet`, `CalendarFeedView`), `serializers.py` (`CalendarEventSerializer`, `WorkNoteSerializer`), `recurrence.py` (`expand_recurrence_dates`), `tasks.py` (birthday / shift-start work-note / 9am fallback tasks), `urls.py` (`calendar-events/`, `work-notes/`, `calendar-feed/`), `test_api.py` (30 tests, 6 classes).
- **Notifications:** `backend/notifications/models.py` (`Notification`, `NotificationPushPreference`), `services.py` (`notify_users`, `push_allowed_for_notification`, `_deliver_notification`), `migrations/0004_notificationpushpreference.py`.
- **Scheduling/time:** `backend/core/celery.py` (marketplace escalations only), `backend/core/settings.py` (`CELERY_BEAT_SCHEDULE`, `TIME_ZONE='Australia/Sydney'`, `USE_TZ=True`), `backend/organizations/timezone.py` (`get_pharmacy_timezone`), `backend/shifts/tasks.py` (`send_shift_reminders`), `backend/client_profile/tasks.py` (re-export).
- **Shifts/escalation:** `backend/shifts/escalation.py` (`auto_escalate_due_shifts`, `escalate_shift`), `backend/shifts/base.py` (`get_queryset` lazy call), `backend/shifts/models.py` (`Shift`, `ShiftSlot`, `ShiftSlotAssignment`, `single_user_only`, `is_urgent`, `payment_status`, `visibility`).
- **Roster:** `backend/workforce/roster/worker_actions.py` (swap/cover/release/reject + `RosterActionAudit`), `backend/workforce/roster/publication.py` (publish/unpublish/republish + `RosterPublicationAudit`), ADOPTED `backend/workforce/roster/validation.py` (`worker_issues`), ADOPTED `backend/workforce/leave_service.py`.
- **Web:** `frontend_web/src/pages/dashboard/sidebar/PharmacyCalendarPage.tsx` + `PharmacyCalendarPage.model.ts`, `calendarViews.tsx`, `RosterWorkerPage.tsx`, `RosterOwnerPage.tsx`, `SetAvailabilityPage.tsx` (ADOPTED); `frontend_web/shared/postShift/` (`PostShiftForm.tsx`, `PostShiftDetailsStep.tsx`, `useShiftTimetable.ts`, `useShiftDescriptionTemplate.ts`); Next `frontend_web/landing_next/migrated/pages/dashboard/sidebar/` (only `ShiftsBoard` + `TalentBoard`).
- **Shared-core:** `shared-core/src/domains/calendar/api.ts`, `shared-core/src/contracts/calendar.ts`, `shared-core/src/domains/dashboards/api.ts`; ADOPTED `shared-core/src/domains/talent/api.ts`.
- **Expo:** `frontend_mobile/roles/shared/calendar/index.tsx` (`SharedCalendarScreen`), `calendarModel.ts` (`pickAllowedCalendarPharmacyId`, `withCalendarRequestBudget`), `calendarScope.test.mjs`, `frontend_mobile/scripts/calendar-request-budget.test.cjs`, `frontend_mobile/app/my-roster.tsx`, `frontend_mobile/app/manager/roster/` (`calendar.tsx`, `operations.tsx`, `publish.tsx`, `approvals.tsx`, `audit.tsx`, `coverage.tsx`, `templates.tsx`, `validate.tsx`, `copy-week.tsx`, `shift-editor.tsx`, `acknowledgements.tsx`, `staff.tsx`, `index.tsx`), `frontend_mobile/features/parity/roster.tsx` (`RosterParityScreen`), `frontend_mobile/app/owner/calendar.tsx`, `frontend_mobile/app/pharmacist/calendar.tsx`; ADOPTED `frontend_mobile/roles/shared/availability/SetAvailabilityScreen.tsx`.
- **Old sources:** PR #184 `docs/qa/launch-grill/questions.json` (142 Qs, SHA `9b700e31…`), `docs/qa/launch-grill/AUDIT.md` (35 gaps); PR #204 decision ledger (30 carried); `docs/qa/shift-lifecycle/OWNER_DECISION_REGISTER.md`; Issue #250.
- **Adopted senior-reviewed areas:** GM-18 (talent/recruitment), GM-19 (availability/matching), GM-06 (employment/leave), GM-01 (sessions/auth — push/device-token behaviour).

## Unknowns (not inspected — do not infer)

1. Whether any code still imports `team_calendar.operations_rules` (dead-import check not done).
2. Whether a payment-pending reservation holds a `ShiftSlotAssignment` row (GM-13) — decides whether reservations receive the 12h reminder email.
3. Whether every roster re-time goes through unpublish/republish (slot-mutability guard `_assert_roster_slot_mutable` not read).
4. Expo calendar routes for otherstaff/explorer (only owner + pharmacist route files verified).
5. Which Vite routes expose `PharmacyCalendarPage` to which roles (route registration not traced).
6. The "all dates required" label on worker cards (PO-Q05 second half, not re-checked).
7. Expo post-shift single-user/urgent switches (W3b/GM-10).
8. Whether the live Next site serves the migrated copies (GM-25).
9. Contents of the five role dashboards (GM-23-22 alternative: extend them instead of building an ops dashboard).
10. Whether the AHPRA overdue-alerts beat blocks anything or only alerts (GM-02).
11. Whether `RosterCoveragePanel` enforces coverage or only displays it (GM-06-Q09).
12. Body of Expo `ownRosterAssignments` (team-vs-own filtering traced via function name + code comment only).
13. Whether `send_shift_reminders` double-sends on a beat retry (no test found; window design suggests no, unproven).
14. What `Shift.is_urgent` changes anywhere (flag exists; no alert/display rule traced).
15. Whether a *withdrawn* interest still blocks auto-escalation (`interests__isnull=True` — withdrawal semantics not traced).
16. Caller of `find_availability_matched_shifts` (which dashboard screen shows recommendations) — carried UNKNOWN from GM-19.
17. Whether the live Expo app serves `SharedCalendarScreen` behind any additional gate beyond the route files (no runtime check performed).

*End of GM-23 documentation. No code was changed. No branch or PR was created — the parent agent will assemble and raise the PR after all areas are done and reviewed.*
