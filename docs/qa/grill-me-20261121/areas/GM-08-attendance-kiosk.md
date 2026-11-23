# GM-08 — Attendance / kiosk — Full Grill Documentation

> **Corrections against current code (21 Nov 2026 review).** 9 claims checked at `main` `8ccf8f77` and `pr257` `21add924`; 8 hold, 1 below need the correction shown. Where a question below says otherwise, this table wins. Full evidence: [`../followup/claim-check-2026-11-21.md`](../followup/claim-check-2026-11-21.md).

| Where | Claim in this file | Verdict | Correct statement | Evidence |
|---|---|---|---|---|
| Q06 | PIN format is unknown / only non-empty checked | WRONG as a missing-validation premise | Both inspected setup paths require four to six numeric digits. Remove the proposed investigation of whether any PIN format rule exists. | GUARDED setup: `main:backend/attendance/credentials.py:961`; self-service: `pr257:backend/attendance/credentials.py:1025` |

**Area:** GM-08 Attendance/kiosk (Issue #250, area 8 of 26)
**Method:** Issue #250 interview rules + PR #184 format; Web (Vite + Next) and Expo traced together in every question, side by side, including parity gaps.
**Status:** TRACED. Decision status per question in Part C. No owner decision recorded yet. No code changed in this phase — documentation and decisions only.

> This file **overwrites** the earlier BLOCKED-429 stub of the same name. That stub verified only Issue #250, PR #184 `get`, and PR #249 `get`; no `questions.json`, no code. Everything below is traced from scratch at the head in this session.

## Web and Expo today, side by side (pr257 `21add924`)

Source for both web and Expo is `origin/agent/pr257-int` `21add924` (what merges to main). Read-only code check by agy, 21 Nov 2026; every cited file:line was checked to exist at that commit. "Parity question" = a choice for the owner, asked in this area's rounds. "Possible defect (to verify)" = drift that looks unintended; it is confirmed in code before it goes to the engineering backlog, never asked as a question. The Platforms table says which platforms each question applies to.

| Flow | Web (Vite + Next) | Expo | Same? | If different |
|---|---|---|---|---|
| Clock in via mobile QR scanner | Web browser app does not implement camera scanner for physical kiosk QR (`frontend_web/src/App.tsx`). | Mobile app opens camera scanner to read kiosk QR token (`frontend_mobile/app/attendance/clock.tsx:3`). | Expo only | Intended: camera QR scanning of the physical on-site kiosk is mobile-native. |
| Rotating kiosk QR display | Dedicated tablet kiosk web app renders rotating dynamic QR code (`frontend_web/src/pages/attendance/KioskPage.tsx:95`). | Mobile app provides pairing status and link screen for kiosk hardware (`frontend_mobile/app/attendance/kiosk-status.tsx:3`). | No | Parity question: the kiosk display terminal is web-only (`KioskPage.tsx`), while mobile manages pairing and diagnostics. |
| PIN clock in/out | Kiosk terminal provides numeric keypad for PIN attendance (`frontend_web/src/pages/attendance/KioskPage.tsx:722`). | Worker configures attendance PIN in dedicated mobile settings screen (`frontend_mobile/app/attendance-pin.tsx:11`). | No | Intended: terminal handles physical PIN entry while mobile allows worker PIN configuration. |
| Breaks recording | Kiosk terminal logs break start and break return events (`frontend_web/src/pages/attendance/KioskBreakDialog.tsx:65`). | Mobile parity screen tracks break events during shift attendance (`frontend_mobile/features/parity/attendance.tsx:27`). | Yes | — |
| Manager provisional attendance review | Manager audits unrostered and suspicious clock-ins (`frontend_web/src/pages/attendance/KioskEvidenceReview.tsx:41`). | Manager reviews attendance exceptions on mobile (`frontend_mobile/app/attendance/exceptions/[id].tsx:3`). | Yes | — |
| Attendance corrections | Attendance tracking logs manual time adjustments (`frontend_web/src/pages/attendance/ManagerAttendanceReviewPage.tsx:246`). | Manager submits manual attendance correction request (`frontend_mobile/app/attendance/corrections/new.tsx:3`). | Yes | — |

### Platforms per question
| Question id | Platforms |
|---|---|
| GM-08-Q01 | Web + Expo |
| GM-08-Q02 | Web + Expo |
| GM-08-Q03 | Web + Expo (also covers GM15-11) |
| GM-08-Q04 | Web + Expo (also covers GM15-12) |
| GM-08-Q05 | Web + Expo |
| GM-08-Q06 | Web + Expo |
| GM-08-Q07 | Web + Expo |
| GM-08-Q08 | Web + Expo |
| GM-08-Q09 | Web + Expo |
| GM-08-Q10 | Web + Expo |
| GM-08-Q11 | Web + Expo (also covers GM15-32, GM17-Q16) |
| GM-08-W01 — Re-grill: kiosk PIN setup and worker QR confirmations tied to the session the worker saw | Web + Expo |

## Bases (exact SHAs verified 2026-11-21)

| Source | Ref | SHA / head |
|---|---|---|
| Active PR #249 (revalidation target) | `refs/pull/249/head` | `97c4543e051b43fe30ec7e2e61ad3d69957a918e`, branch `fix/pr248-expo-production-waves-20261104`, open draft |
| Old grill PR #184 | `refs/pull/184/head` | `c786a4b8182ebf9b505d47cd81980eb3b9851ce3`, branch `docs/launch-grill-20261020` |

**Head-SHA resolution (recorded this session):** PR #249's body names a "working head `26cae2d6`" — that is the short SHA of the last *implementation commit listed in the body*, not the branch head. The API head is `97c4543e051b43fe30ec7e2e61ad3d69957a918e` (458 commits), identical to the Issue #250 snapshot. Every trace below is at that API head.

**The "W5 is a future wave" lead is resolved — it was wrong as a description of this head.** PR #249's body lists "W5 attendance/workforce" among *future* waves. At head `97c4543…`, `backend/attendance/` is a complete app (models, views, worker API, kiosk API, protocol, approvals, cover terms, credentials, eligibility, transitions, throttles, 14 test files, plus a `backend/attendance_tests/` directory) and `backend/workforce/` is equally complete (roster, leave, employment, timesheets). The attendance/workforce code predates #249 — it arrived via the #248 base / `main`, not via #249's waves. The W5 line describes #249's *remaining Expo work*, not the state of the backend. Do not quote it as "attendance doesn't exist yet".

**Files read line by line at head `97c4543…`:** `backend/attendance/models.py` (612 lines), `backend/attendance/urls.py` (64 lines, 29 routes), `backend/attendance/worker_api.py` (224 lines), `backend/attendance/transitions.py` (494 lines), `backend/attendance/eligibility.py` (421 lines), `backend/attendance/kiosk_api.py` (926 lines), `backend/attendance/approvals.py` (419 lines), `backend/attendance/` + `backend/workforce/` + `backend/workforce/roster/` + `backend/shifts/` directory listings. Frontend file *existence* via default-branch code search (NOT head — flagged where used): `kiosk` in `frontend_mobile` (9 hits) and `frontend_web` (42 hits).

**Not read at head (marked UNKNOWN where it matters):** `backend/attendance/protocol.py` (`sync_offline_batch` internals — the sync *contract* is traced from `KioskOfflineSyncView` + `KioskAttendanceEvent` + the test-file names; the verification math was not line-read), `backend/attendance/credentials.py` (QR signing, PIN verification, pairing codes — interfaces and call sites read, bodies not), `backend/attendance/kiosk_review.py`, `backend/attendance/cover_terms.py`, `backend/attendance/api_support.py`, `backend/attendance/throttles.py` (rate values not read), `backend/attendance/views.py` (manager views — the service layer in `approvals.py` was read instead), `backend/attendance_tests/` contents, `backend/workforce/attendance_edits.py`, `backend/workforce/timesheet_builder.py` / `timesheet_core.py` (the attendance→timesheet handover), and **all Vite/Next/Expo attendance and kiosk screens** (file names only, contents not read).

**Scope freeze (from #250, verified this session):** existing QR scanning remains unchanged unless separately approved. GM-08-Q07 records the QR parameters as "confirm, don't change".

**Adopted verdicts (not re-traced):** GM-01 session findings (kiosk sessions use a restricted device token, not a user JWT — confirmed in `KioskDevice` docstring this session); GM-06 employment/leave trace (this session: approved leave does not release the shift); GM-07 roster/cover/swap trace (this session: release path, target never accepts); GM-04 chain/org definitions (Chain model with M2M pharmacies feeds the cross-site attendance tiers); GM-18 LA-Q12 STILL VALID; GM-25 structural trace.

## How to read this document

- **Plain English first.** *Attendance* is the record of when a worker actually started and finished work — clock-in, breaks, clock-out — kept as append-only evidence. The *kiosk* is the pharmacy's shared device (counter tablet / desktop) that shows a rotating QR code and accepts PIN clock-ins, including offline. *Provisional* attendance is a clock-in by someone with no rostered shift at that pharmacy (an unrostered local, a cross-site worker, a favourite covering an emergency, or a verified locum with no booking) — it counts only if a manager approves it afterwards.
- **Code gap** = no owner choice needed; just build/fix it. **Decision gap** = the owner must choose first.
- **Decision status values:** `CARRIED — DECIDED` (settled in #184's carried list or the shift-lifecycle register, do not re-ask), `STILL VALID` (Oct 2026 premise re-checked against current code at the head), `CHANGED` (premise moved since #184), `OPEN — NEW` (new GM-08 question), `UNKNOWN` (not inspected at the head).

---

## Part A — Current-flow matrix

Columns: Trigger → Actor → Backend / API → Vite web → Next web → Expo mobile → Persisted state → Event / side effect → Recovery / denial path.

### F01 — Worker clocks in by scanning the kiosk QR (mobile QR)

| Trigger | Actor | Backend / API | Vite | Next | Expo | Persisted state | Event / side effect | Recovery / denial |
|---|---|---|---|---|---|---|---|---|
| Worker scans the QR on the pharmacy kiosk with their phone | Authenticated worker | `POST /api/v1/attendance/worker/clock-in/` → `WorkerClockInView` (`backend/attendance/worker_api.py`): body `qr_token` (signed, HMAC); `verify_signed_pharmacy_qr` validates it; then `clock_in` (`backend/attendance/transitions.py`): locks the worker row; **one open session per worker across ALL pharmacies** (DB unique constraint on open sessions); 30-second idempotent retry (same pharmacy, same session returned); 60-second "you just clocked out, clock in now?" confirm-opposite (409 `CONFIRM_OPPOSITE_ACTION` with `observed_session_id`, stale if the session changed); presence must be a signed QR or a kiosk PIN (else ValidationError); eligibility via `resolve_attendance_eligibility` (F06); creates `AttendanceSession` (`started_at` = server time) + immutable `AttendanceEvent` CLOCK_IN (source MOBILE_QR); if provisional, creates a PENDING `ProvisionalAttendance`. Throttled (`WorkerClockInThrottle`) | Worker attendance page: `frontend_web/src/pages/attendance/WorkerAttendancePage.tsx` (file exists, default-branch search; contents not read) | UNKNOWN — no Next attendance/kiosk page found in the search results (contents not read; GM-25 parity) | Expo attendance screens: `app/attendance-pin.tsx`, `features/parity/attendance.tsx` (files exist, default-branch search; contents not read) | `AttendanceSession` (open) + `AttendanceEvent` CLOCK_IN + maybe `ProvisionalAttendance` PENDING | None traced (no notification on clock-in was found in the code read) | Already clocked in elsewhere → ValidationError naming the other pharmacy. QR invalid/expired → 400 "QR verification failed: …". Not eligible → 400 "Attendance eligibility rejected: <reason>". Second scan within 30s → same session returned (no duplicate). Clock-in 60s after clock-out without confirming → 409, must confirm |

### F02 — Kiosk shows the rotating QR code

| Trigger | Actor | Backend / API | Vite | Next | Expo | Persisted state | Event / side effect | Recovery / denial |
|---|---|---|---|---|---|---|---|---|
| Kiosk device asks for a fresh QR | Kiosk device (restricted device token, **not** a user JWT) | `POST /api/v1/attendance/kiosk/qr/` → `KioskQRView` (`backend/attendance/kiosk_api.py`): device authenticated from its token (`_get_kiosk_device_from_request`); `generate_signed_pharmacy_qr(device, ttl_seconds=30)`; returns `qr_token`, `expires_at`, `pharmacy_id`, `pharmacy_name`, `refresh_interval_seconds: 30`. Throttled (`KioskQRRateThrottle`). **QR TTL is 30 seconds; the kiosk refreshes every 30 seconds.** `PharmacyQRSession` model (short-lived rotating code, `code` + `expires_at`) also exists — the signed-token path is the live one in `kiosk_api.py`/`worker_api.py` | Separate kiosk build: `frontend_web/kiosk.html`, `frontend_web/src/kiosk/` (`main.tsx`, `KioskSetup.tsx`, `desktopBridge.ts`), plus a Tauri desktop app (`frontend_web/src-tauri/`, `Cargo.toml`, `tauri.conf.json`); kiosk pages `frontend_web/src/pages/attendance/KioskPage.tsx`, `KioskActivationView.tsx`, `KioskPairingDialog.tsx` (files exist, default-branch search; contents not read) | UNKNOWN — `landing_next/next.config.ts` mentions kiosk (search hit) but no Next kiosk page was found; whether the Next site serves the kiosk is UNKNOWN | Expo does not render the kiosk QR (it *scans* it, F01); `app/kiosk-link.tsx`, `app/attendance/kiosk-status.tsx` exist (files exist; contents not read) | Short-lived QR token (30s) | None | Revoked/inactive device → 401. Throttled QR requests → throttle response (values not read). Expired QR (older than 30s) → verification fails at clock-in (F01) |

### F03 — Worker clocks in/out with a PIN at the kiosk (no phone)

| Trigger | Actor | Backend / API | Vite | Next | Expo | Persisted state | Event / side effect | Recovery / denial |
|---|---|---|---|---|---|---|---|---|
| Worker enters identifier + PIN on the kiosk | Worker at the pharmacy (kiosk device token auth; the *worker's* identity comes from the identifier + PIN) | `POST /api/v1/attendance/kiosk/pin-clock/` → `KioskPinClockView`: device from token; `verify_kiosk_worker_pin(device, identifier, raw_pin)`; then `clock_in`/`clock_out` with `kiosk_device` + `raw_pin` (source KIOSK_PIN). PIN model: `WorkerPIN` (one per membership): `pin_hash` (bcrypt/argon2 via `make_password`), `failed_attempts`, `locked_until`, `is_enabled` (owner toggle). **5 failed attempts → 15-minute lockout** (`MAX_FAILED_ATTEMPTS = 5`, `LOCKOUT_DURATION = 15 min`, serialised with `select_for_update`). Enrol (verify a PIN without creating attendance): `POST attendance/kiosk/workers/enrol/` → `KioskWorkerEnrolView` (device token auth, AllowAny; returns worker name, `is_clocked_in`, `is_on_break`, `verified_at`, `offline_valid_until` = now + `KIOSK_MAX_OFFLINE_HOURS` (default 24), `credential_generation` hash). PIN setup: worker sets their own PIN (`POST attendance/worker/pin/update/` — `worker_update_own_pin`, per pharmacy); manager setup via `POST attendance/kiosk/worker-pin/setup/` (6-digit email verification code, 10-minute reuse window — see `kiosk_api.py:604`). Throttled (`KioskPINRateThrottle`) | Kiosk pages (F02) + `KioskBreakDialog.tsx` | UNKNOWN | `app/attendance-pin.tsx` (file exists; contents not read) | `AttendanceSession` + `AttendanceEvent` (source KIOSK_PIN); `WorkerPIN.failed_attempts` / `locked_until` | None traced | Wrong identifier/PIN → 400 "Invalid worker identifier or PIN." (no hint which half). Locked PIN → 400 "Worker PIN is temporarily locked." + `locked: true`. Active session at another pharmacy → 409 (enrol). Clock-in/out within 60s of the opposite action without confirming → 409 confirm-opposite (same as F01; stale confirmations say "Enter the PIN again") |

### F04 — Worker takes a break / ends a break

| Trigger | Actor | Backend / API | Vite | Next | Expo | Persisted state | Event / side effect | Recovery / denial |
|---|---|---|---|---|---|---|---|---|
| Worker starts/ends a break | Clocked-in worker | `POST /api/v1/attendance/worker/break-start/` / `break-end/` (in-app, no QR — `WorkerBreakStartView` / `WorkerBreakEndView`); kiosk breaks: `POST /api/v1/attendance/kiosk/break/` → `KioskStaffBreakActionView` (break elapsed seconds returned). `start_break` / `end_break` (`transitions.py`): session must be open; breaks are strictly sequential (start requires the last event NOT to be BREAK_START; end requires the last event to BE BREAK_START); source IN_APP (or kiosk device). **Clock-out auto-ends an active break** (a BREAK_END event is written first, same timestamp). Break events are immutable like all events | `KioskBreakDialog.tsx`, `WorkerAttendancePage.tsx` (files exist; contents not read) | UNKNOWN | UNKNOWN | `AttendanceEvent` BREAK_START / BREAK_END | None traced | Break with no open session → ValidationError. Double break-start → ValidationError. Break-end without a break → ValidationError. **No paid/unpaid break rule exists** — breaks are recorded; whether break time is paid, and any break-length limit, is GM-09/GM-14 (see Q09) |

### F05 — Worker clocks out

| Trigger | Actor | Backend / API | Vite | Next | Expo | Persisted state | Event / side effect | Recovery / denial |
|---|---|---|---|---|---|---|---|---|
| Worker scans the QR / enters the PIN to finish | Clocked-in worker | `POST /api/v1/attendance/worker/clock-out/` → `WorkerClockOutView`: same QR validation as F01 (token must match the *session's* pharmacy); `clock_out` (`transitions.py`): locks the worker row; finds the open session (any pharmacy — the session's pharmacy governs); idempotent retry (closed within 30s → same session returned); 60-second "you just clocked in, clock out now?" confirm-opposite (409); auto-ends an active break; writes immutable CLOCK_OUT; stamps `session.ended_at = now`. **Clock-out resolves the session from clock-in regardless of later roster or membership changes.** Throttled (`WorkerClockOutThrottle`) | As F01 | UNKNOWN | As F01 | `AttendanceSession` closed (`ended_at` set) + CLOCK_OUT event (+ auto BREAK_END if needed) | Session close feeds the timesheet (GM-09 boundary — `TimesheetMissingPunchView` exists in `workforce/urls.py`; the builder was not read) | No open session → ValidationError ("No active open attendance session found"). Wrong-pharmacy QR → 400. Stale confirmation (expected session id mismatch) → 409 STALE_CONFIRMATION |

### F06 — Eligibility: who is allowed to clock in at all (the 5 tiers)

| Trigger | Actor | Backend / API | Vite | Next | Expo | Persisted state | Event / side effect | Recovery / denial |
|---|---|---|---|---|---|---|---|---|
| Any clock-in attempt | Any authenticated worker (or kiosk PIN holder) | `resolve_attendance_eligibility` (`backend/attendance/eligibility.py`, read in full): strict precedence. **Tier 1 — Confirmed assignment:** a `ShiftSlotAssignment` at this pharmacy whose shift window covers now (±2 hours: up to 2h before start, up to 2h after end; overnight-aware; pharmacy timezone via `get_pharmacy_timezone`). Draft-roster assignments are excluded (`is_draft_roster_assignment`: unpublished/DRAFT week → no eligibility). Non-provisional. **Tier 2 — Unscheduled local staff:** active + accepted employed staff (FULL_TIME/PART_TIME/CASUAL, not CONTACT) at this pharmacy. Provisional `UNROSTERED_LOCAL`. **Tier 2b — Favourite emergency cover:** active + accepted LOCUM/SHIFT_HERO favourite at this pharmacy. Provisional `FAVOURITE_COVER` ("owner decision 2026-10-04", paid by the worker's own invoice or TFN payroll preference). **Tier 3 — Cross-site staff:** active + accepted employed staff at another pharmacy with the same owner, a shared active `Chain`, or the same organisation. Provisional `CROSS_SITE_CHAIN` / `CROSS_SITE_ORG`. Never matches on null owner/org. **Tier 5 — Unbooked locum cover (live QR only):** a verified PHARMACIST account (`onboarding.verification.policy.evaluate` → verified). Provisional `UNBOOKED_LOCUM_COVER`, no source membership. An inactive/REJECTED/LEFT local membership blocks it. **Rejections** carry a reason code: `LOCAL_MEMBERSHIP_INACTIVE` / `PENDING` / `REJECTED` / `LEFT`, `FAVORITE_CONTACT_WITHOUT_ASSIGNMENT`, `REMOTE_MEMBERSHIP_NO_CHAIN_OR_ORG_MATCH`, `NO_ASSIGNMENT_OR_MEMBERSHIP`, `MISSING_USER_OR_PHARMACY`. Read-only: never creates shifts or memberships. **No lateness concept anywhere** — clocking in 2h early and 2h late are the same "inside the window" (see Q04) | Same backend rule on all clients | Same | Same | `AttendanceSession.source_membership` records the membership that justified a provisional clock-in | Provisional sessions need manager approval (F09); unapproved provisionals stay provisional | Rejection reason returned in the 400 ("Attendance eligibility rejected: …"). Draft-roster worker → falls through to tier 2/2b/3 (may clock provisionally) or rejection |

### F07 — Kiosk pairing, activation, config, revocation (device lifecycle)

| Trigger | Actor | Backend / API | Vite | Next | Expo | Persisted state | Event / side effect | Recovery / denial |
|---|---|---|---|---|---|---|---|---|
| Owner/manager sets up a kiosk device | Owner / manager (`is_authorized_kiosk_manager`) | Activate: `POST attendance/kiosk/activate/` → `KioskActivateView` (authenticated user; returns the restricted device token **shown once** to store locally; `installation_id`, `device_name`, `public_signing_key` (Ed25519), `platform`, `app_version`). Pairing (native offline): `POST attendance/kiosk/pairing/request/` → owner/manager requests a **single-use 6-digit pairing code** (push notification to their mobile app + in-app alert); `POST attendance/kiosk/pairing/pair/` redeems it (`KioskPairingAuthorization`: `code_digest`, `expires_at`, `consumed_at`, `client_attempt_id` for proof-bound recovery after a lost response; `allowed_client_kind` WEB_ONLINE / NATIVE_OFFLINE). Config: `GET attendance/kiosk/config/` → device policy + **server-time anchor** (`server_time`, `max_offline_hours`). Self-revoke: `POST attendance/kiosk/revoke-self/` (device revokes itself before local credentials are cleared). Manager device list: `GET/POST attendance/manager/kiosk-devices/` (`ManagerKioskDevicesView`). `KioskDevice`: pharmacy FK, device token (unique), `device_name` (e.g. "Front Counter iPad"), `installation_id` (UUID), `client_kind`, `is_active`, `activated_at`, `last_seen_at`, `last_sync_at`, `revoked_at`, `last_contiguous_sequence`, `last_event_hash`, `activated_by` | `KioskActivationView.tsx`, `KioskPairingDialog.tsx`, `KioskSetup.tsx` (files exist; contents not read) | UNKNOWN | `app/kiosk-link.tsx` (file exists; contents not read — likely the pairing-code link) | `KioskDevice` + `KioskPairingAuthorization` rows | Pairing code by push + in-app alert to the requesting manager | Non-manager activate/pair → 403/PermissionDenied. Expired/consumed pairing code → error (exact response not read — `credentials.py` not line-read). Revoked device → 401 on device calls (`allow_revoked=True` only for sync + self-revoke) |

### F08 — Offline kiosk: clock-ins without internet, then sync

| Trigger | Actor | Backend / API | Vite | Next | Expo | Persisted state | Event / side effect | Recovery / denial |
|---|---|---|---|---|---|---|---|---|
| Native offline kiosk records events while offline; syncs when back online | Kiosk device (`NATIVE_OFFLINE` only) | `POST /api/v1/attendance/kiosk/sync/batch/` → `KioskOfflineSyncView` (device token auth, AllowAny; **revoked devices are allowed to sync** — `allow_revoked=True` — so a revoked kiosk can still upload its outbox): `sync_offline_batch(device, events, app_version)` (`backend/attendance/protocol.py` — **not line-read**; contract traced from the view + models + test names). Events are `KioskAttendanceEvent` rows: `event_id` (UUID), `device_sequence` (unique per device), `device_timestamp`, `trusted_time_estimate`, `monotonic_elapsed_ms`, `boot_session_id`, `previous_event_hash` + `event_hash` (hash chain), `device_signature` (Ed25519), `canonical_payload`, `integrity_flags`, `processing_status` ACCEPTED / NEEDS_REVIEW / REJECTED + `rejection_reason`, linked `attendance_event` (OneToOne, nullable). **Offline validity: `KIOSK_MAX_OFFLINE_HOURS`, default 24** (setting; returned by config + enrol). Device tracks `last_contiguous_sequence` + `last_event_hash`. Sync response includes `device_revoked` and `max_offline_hours`. Suspicious events go to manager review (F10). Test files: `test_kiosk_pairing.py`, `test_pin_clock.py`, `test_pin_eligibility.py`, `test_clock_locking.py`, `test_timezone_resolution.py`, `test_rostered_corrections.py`, `test_cover_terms_*`, `test_favourite_cover.py`, `test_unbooked_locum_cover.py`, `test_approval_locking.py`, `test_kiosk_review.py` | Tauri desktop app is the offline-capable kiosk (`frontend_web/src-tauri/`); web-online kiosk is `src/kiosk/` | UNKNOWN | Expo is not the offline kiosk (native offline is the Tauri/desktop build + pairing flow) | `KioskAttendanceEvent` rows (append-only; update/delete raise ValidationError) | Accepted events become `AttendanceEvent`s; NEEDS_REVIEW events wait for a manager (F10); REJECTED events are kept with a reason | Wrong `client_kind` (WEB_ONLINE trying to sync) → PermissionDenied ("not authorized for offline attendance sync"). Out-of-order/duplicate sequence → unique constraint on (device, device_sequence) + hash-chain break → NEEDS_REVIEW/REJECTED (exact verification rules in `protocol.py`, NOT line-read). Offline longer than 24h → enrolment credential expires; what the kiosk does then (refuse clock-ins? queue anyway?) was not traced (see Q05) |

### F09 — Manager approves / rejects a provisional attendance (unrostered / cross-site / emergency cover)

| Trigger | Actor | Backend / API | Vite | Next | Expo | Persisted state | Event / side effect | Recovery / denial |
|---|---|---|---|---|---|---|---|---|
| Manager reviews pending provisional attendances | Destination pharmacy's owner / manager (`is_authorized_attendance_manager` — same workforce capability as GM-07; wrong-site managers strictly denied) | `GET attendance/manager/pending/` → `ManagerPendingAttendancesView`; `POST attendance/manager/approve/` → `approve_provisional_attendance` (`backend/attendance/approvals.py`): locks the provisional + session rows; **requires a closed session** (worker must be clocked out); converts actual times using the **destination pharmacy's timezone**; **backfills a real `Shift` + `ShiftSlot` + `ShiftSlotAssignment`** stamped with actual clock dates/times and linked to the session; clears `session.is_provisional`; **idempotent** (repeat approval returns the existing record, no duplicates); **never creates permanent membership**; applies the worker's own payment terms (`_apply_worker_payment_terms`: builds engagement terms; if the payment profile is incomplete, approval still proceeds and the assignment is flagged `payment_profile_incomplete` with the worker's TFN/ABN preference preserved and settlement `TIMESHEET_ONLY`). `POST attendance/manager/reject/` → `reject_provisional_attendance`: **requires a justification reason**; status REJECTED; raw session + immutable events retained intact for audit. Cover terms: `GET attendance/worker/cover-terms/` + `POST …/cover-terms/<assignment_id>/accept/` (`cover_terms.py` — not line-read; test files `test_cover_terms_acceptance/review/concurrency.py` exist) | Manager attendance screens (not traced; `WorkerAttendancePage.tsx` is the worker page) | UNKNOWN | UNKNOWN | `ProvisionalAttendance` APPROVED/REJECTED + `decided_by`/`decided_at`/`decision_reason`; backfilled Shift/Slot/Assignment on approval | Backfilled assignment feeds the timesheet/payroll (GM-09). The worker is **not** told of the decision by any notification found in `approvals.py` (CG-03) | Open session (not clocked out) → approval refused. Wrong-site manager → PermissionDenied. Already-decided → (repeat approval is idempotent; repeat rejection behaviour not read). Rejection without a reason → refused (reason required) |

### F10 — Manager reviews suspicious offline kiosk evidence

| Trigger | Actor | Backend / API | Vite | Next | Expo | Persisted state | Event / side effect | Recovery / denial |
|---|---|---|---|---|---|---|---|---|
| Offline event needs review | Destination pharmacy's owner / manager | `GET attendance/manager/kiosk-review/pending/` + `POST attendance/manager/kiosk-review/decide/` (`backend/attendance/kiosk_review.py` — not line-read; model + tests read). `KioskAttendanceReview`: separate immutable decision on a `KioskAttendanceEvent` (APPROVED/REJECTED, `reason` required, `effective_timestamp`, optional linked `AttendanceEvent`); the signed event itself never changes after review; review decisions are append-only (update/delete raise). `KioskEvidenceReview.tsx` exists on web (file exists; contents not read) | `KioskEvidenceReview.tsx` (file exists; contents not read) | UNKNOWN | UNKNOWN | `KioskAttendanceReview` row | Approved review can create/confirm the effective attendance timestamp; rejected review leaves the evidence intact but unusable | Review of an already-reviewed event → (behaviour not read). Wrong-site manager → denied (per the approvals docstring pattern; `kiosk_review.py` not line-read) |

### F11 — Manager corrects an attendance time

| Trigger | Actor | Backend / API | Vite | Next | Expo | Persisted state | Event / side effect | Recovery / denial |
|---|---|---|---|---|---|---|---|---|
| Manager fixes a wrong clock time | Destination pharmacy's owner / manager | `POST attendance/manager/correct/` → `ManagerCreateCorrectionView` → `create_attendance_correction` (`backend/attendance/approvals.py`): writes an `AttendanceCorrection` (original event FK, `corrected_timestamp`, `reason` **required**, `corrected_by`, `corrected_at`). **The original `AttendanceEvent.occurred_at` is never mutated**; `get_effective_session_timeline` computes the effective chronology with the audit trail. Corrections are append-only (update/delete raise ValidationError). Manager timeline: `GET attendance/manager/timeline/<session_id>/` (`ManagerSessionTimelineView`). (This is the "manager corrections exist in the attendance domain" that CX-Q33 cites.) | UNKNOWN | UNKNOWN | UNKNOWN | `AttendanceCorrection` rows | Effective times change for timesheet purposes (GM-09); the original evidence stays for audit | Non-manager → PermissionDenied. Correction without a reason → refused. **No worker dispute path exists** — a worker who disagrees with a correction has no in-product way to challenge it (CX-Q33, see Q08) |

### F12 — Worker checks their own attendance status

| Trigger | Actor | Backend / API | Vite | Next | Expo | Persisted state | Event / side effect | Recovery / denial |
|---|---|---|---|---|---|---|---|---|
| Worker opens their attendance screen | Authenticated worker | `GET /api/v1/attendance/worker/status/` → `WorkerAttendanceStatusView`: returns `has_active_session`, `session_id`, `pharmacy_id`/`pharmacy_name`, `started_at`, `is_provisional`, `cover_type`, `is_on_break`, `last_event_type` — or all-null when clocked out. Kiosk active staff: `GET/POST attendance/kiosk/active-staff/` → `KioskActiveStaffView` (device token; who is currently clocked in at this pharmacy — contents not read in detail) | `WorkerAttendancePage.tsx` | UNKNOWN | `app/attendance/kiosk-status.tsx` (file exists; contents not read) | None (read-only) | Worker sees whether they are clocked in, on break, provisional | Stale session / signed-out → signed-out state (GM-01) |

### F13 — Attendance feeds the timesheet (GM-09 boundary)

| Trigger | Actor | Backend / API | Vite | Next | Expo | Persisted state | Event / side effect | Recovery / denial |
|---|---|---|---|---|---|---|---|---|
| Session closes / timesheet built | System / manager | `AttendanceSession` (actual times) vs `ShiftSlotAssignment` (scheduled times) are kept separate by design. Workforce timesheets: `TimesheetMissingPunchView` (`POST timesheets/<id>/missing-punch/`), submit/approve/recalculate/lock/correct endpoints (`backend/workforce/urls.py`); `backend/workforce/attendance_edits.py`, `timesheet_builder.py`, `timesheet_core.py` **not read**. How actual hours, breaks, corrections, provisional approvals and missing punches combine into payable hours was **not traced here** — GM-09 owns it | UNKNOWN | UNKNOWN | `app/workforce-timesheets.tsx` (file exists; contents not read) | `Timesheet*` rows (GM-09) | Pay/invoicing (GM-09/GM-13/GM-16) | Missing punch (clock-in with no clock-out, or vice versa) → `missing-punch` flow exists; its rules are GM-09 |

### What does NOT exist (verified absences at head)

- **No no-show state.** Nothing in `backend/attendance/` records a no-show. A worker who never clocks in simply has no session; the assignment stays assigned (GM-07 R04). CX-Q11 ("There is no no-show state") is **STILL VALID**.
- **No lateness rule.** No grace period, no "late by N minutes", no early-departure rule in the attendance code. Clock-in is allowed anywhere in the ±2h window and all clock-ins look identical afterwards. CX-Q12 ("No lateness rule exists") is **STILL VALID**.
- **No shift-complete state.** CX-Q32 ("No completed state on bookings") — a closed attendance session is not a "completed" booking; completion is GM-09/GM-13 territory.
- **No early-finish / extra-hours rule.** CX-R01: timesheets capture actual hours, but no marketplace rule says when early finishes and extra hours are paid — the attendance side records the actual times; the pay rule is GM-09/GM-14.
- **No worker dispute path** for corrections or rejections (CX-Q33 half).
- **No automatic clock-out.** A session left open (worker forgot to clock out) stays open — one open session per user — until the worker clocks out or a manager acts (manager *correction* can adjust times, but no auto-close was found in the files read; `TimesheetMissingPunchView` suggests the fix happens at timesheet time, GM-09).

### Web vs Expo parity gaps (GM-08-specific)

| Area | Web (Vite) | Web (Next) | Expo | Gap type |
|---|---|---|---|---|
| Kiosk device (show QR, PIN entry, offline) | **Separate kiosk build**: `kiosk.html`, `src/kiosk/`, Tauri desktop app (`src-tauri/`) — the kiosk is a distinct app, not a dashboard page | UNKNOWN — `next.config.ts` mentions kiosk but no Next kiosk page was found; whether Next serves the kiosk is UNKNOWN | Expo does not host the kiosk; it scans the QR (`app/attendance-pin.tsx`, `kiosk-link`, `kiosk-status`) | **Architectural gap, not a screen gap:** the kiosk is Vite/Tauri-only as far as traced. Next parity for kiosk is UNKNOWN (GM-25) |
| Worker clock-in/out + breaks | `WorkerAttendancePage.tsx` (file exists; contents not read) | UNKNOWN | `features/parity/attendance.tsx` + tests (`attendanceLocum.test.mjs`, `attendance-double-clock.test.cjs`, `attendance-pin-guidance.test.cjs`) | Contents not compared — parity UNKNOWN, not "no gap" |
| Manager pending / approve / reject / timeline / corrections | Endpoints exist; screens not traced | UNKNOWN | UNKNOWN | Unknown on all three |
| Kiosk evidence review | `KioskEvidenceReview.tsx` (file exists; contents not read) | UNKNOWN | UNKNOWN (no Expo evidence-review file found) | Likely web-only by design (managers review on desktop) — but not confirmed; GM-25 |
| PIN setup / update | Kiosk setup screens + worker PIN update endpoint | UNKNOWN | `app/attendance-pin.tsx` | Unknown |
| Offline kiosk | Tauri desktop build (offline-capable) | UNKNOWN | N/A (Expo is not the offline kiosk) | By design as far as traced |

### Actors and what each can do today

- **Pharmacy owner / manager (destination pharmacy):** activate/pair/revoke kiosk devices; request pairing codes; enrol workers / set up PINs; approve/reject provisional attendances; decide offline-evidence reviews; correct attendance times; view session timelines and kiosk devices. Wrong-site managers are strictly denied (destination-pharmacy check).
- **Roster manager / org admin with MANAGE_ROSTER:** same attendance-manager powers (the check is `is_authorized_attendance_manager` → `can_manage_roster_pharmacy`). Whether a COMMUNICATION_MANAGER can do any of this: no (no MANAGE_ROSTER).
- **Worker (any authenticated user):** clock in/out by QR, breaks in-app, set their own PIN, check their own status. Clock-in is governed by the 5-tier eligibility, not by role alone.
- **Kiosk device (token, not a user):** display QR, accept PIN clock-ins, enrol-verify workers, sync offline batches, self-revoke. It cannot approve, correct, or see other pharmacies' data.
- **Verified pharmacist with no assignment (unbooked locum):** may clock in provisionally by live QR only (tier 5) — pending manager approval; no membership is created even on approval.
- **Platform admin:** no attendance-specific role traced (superuser passes the roster checks; kiosk activation requires `is_authorized_kiosk_manager` — superuser treatment there was not verified).

---

## Part B — Old questions re-validated (PR #184 / #204 / shift-lifecycle)

Method: all 142 questions in `questions.json` (re-read from `refs/pull/184/head` this session) were scanned for attendance/kiosk mechanics (attendance, kiosk, check-in/out, QR, PIN, late, no-show, corrections, timesheet boundary). The shift-lifecycle carried decisions were scanned the same way.

| Old ID | Old question | Verdict | Evidence (current code at head `97c4543…`) |
|---|---|---|---|
| CX-Q11 | When does a missing worker become a no-show? "There is no no-show state. Attendance and timesheets live in a separate domain." | **STILL VALID** | No no-show state, field, or transition exists anywhere in `backend/attendance/` (models + transitions + approvals read in full). A missing worker has no session; the assignment stays assigned. Carried as GM-08-Q03. |
| CX-Q12 | How is late arrival treated? "No lateness rule exists." | **STILL VALID** | No lateness/grace/early rule in `eligibility.py` (±2h window only), `transitions.py`, or `approvals.py`. All in-window clock-ins are identical. Carried as GM-08-Q04. |
| CX-Q33 | How are disputed hours settled? "Manager corrections exist in the attendance domain. No dispute path for the worker." | **STILL VALID** | `AttendanceCorrection` (append-only, reason required, original never mutated) exists and was read (`approvals.py`, `models.py`). No worker dispute/challenge path was found anywhere in the attendance code. Carried as GM-08-Q08. |
| CX-Q32 | What marks a shift complete? "Timesheets route to payroll or invoicing. No completed state on bookings (D14)." | **STILL VALID** | A closed `AttendanceSession` is not a booking-complete state; no complete flag was found in the attendance code. GM-09/GM-13 own completion. Carried as GM-08-Q11 (boundary). |
| CX-R01 | How are early finishes and extra hours paid? "Timesheets capture actual hours, but no marketplace rule says when…" | **STILL VALID (boundary)** | Attendance records actual times; the pay rule is not in the attendance code. GM-09/GM-14 own the pay rule. Carried as GM-08-Q11 (boundary). |
| CX-Q07 | If no manager answers before start and the worker doesn't come, what is it? "The worker stays assigned until approved or replaced." | **STILL VALID (roster half) / OPEN (no-show half)** | Roster half implemented (GM-07 F05–F10). The "what is it" half is CX-Q11 — still undecided (GM-08-Q03). |
| CX-Q16 | Can the manager release a no-show's slot and repost straight away? "No emergency release exists (D13)." | **CHANGED — release now exists** | `release_worker_from_assignment` (GM-07 F09) is the emergency release, with optional escalation. Whether it satisfies D13 (notices, timing, repost) is GM-15/GM-08 territory — see GM-08-Q03. |
| CX-Q01 | What cancellation can launch… "worker requests cover roster work only (SH-01)" | **NOT GM-08 — route to GM-15** | Cancellation itself is GM-15; the roster-cover half is GM-07. |
| AG-Q09 | Who is told when a shift is cancelled, covered or replaced? | **NOT GM-08 — route to GM-04-Q08/GM-22** | Attendance has its own notification gap (no notices on clock-in/approval/rejection — CG-03); the cancel/cover recipient list is GM-04-Q08. |
| LA-Q11 | Auto-publish setting contradicts R06/R04B and is missing on mobile | **NOT GM-08 — route to GM-07-Q06** | Roster cover publishing, not attendance. |
| CX-Q06 | Inside the window, who is alerted and how fast? | **NOT GM-08 — route to GM-15/GM-22** | Cancellation alerting. (Attendance's own alerting gap is CG-03.) |
| D13 / D14 (register) | No-show definition / shift-complete definition (stayed with the register per AUDIT.md) | **STILL OPEN — not in the register text re-read here** | AUDIT.md says "attendance/no-show detail (D13/D14 stay with the register)". The register itself (`docs/qa/shift-lifecycle/OWNER_DECISION_REGISTER.md`) was **not re-read in this pass** — D13/D14's exact wording is NOT RE-VALIDATED here. GM-08-Q03/Q11 carry the substance. |
| AUDIT.md §Not checked | "attendance/no-show detail (D13/D14 stay with the register)" | **Confirms the gap** | #184 explicitly did not audit attendance/no-show detail. This trace is the first line-by-line attendance pass. |

**Old questions NOT carried forward unvalidated:** none — every candidate above was re-checked against the head, or is explicitly routed elsewhere with its destination.

---

## Part C — GM-08 question queue (carried + new, #184 format)

Per-question format: plain-English explanation first, then ACTUAL TODAY with **Web** and **Expo** side by side, RECOMMENDED, ALTERNATIVE A (keep), ALTERNATIVE B/C, Other/defer. Normal case, edge case, retry/concurrency, denied role/wrong tenant, payment/notification side effects, and Web/Expo difference are shown inside each question. Sources are at head `97c4543…` unless noted. Decision status: **OPEN** for all — no owner answer recorded.

### GM-08-Q01 — Who is allowed to clock in — and should a verified locum with no booking be able to walk in and work? (FIRST QUESTION, see Part D)

**Plain English:** today five kinds of people can clock in: someone with a rostered or booked shift, an employed worker with no shift that day, a favourite covering an emergency, a worker from another site in the same chain or group — and a verified pharmacist with no booking at all, who just walks in, scans the QR, and works. That last one is the big trust decision: the system lets a stranger work first and asks the manager afterwards.

**ACTUAL TODAY — Web and Expo (same backend):** `resolve_attendance_eligibility` tiers (read in full): (1) confirmed assignment, non-provisional; (2) unscheduled local employed staff, provisional; (2b) favourite locum/Shift Hero, provisional; (3) cross-site employed staff (same owner / shared active Chain / same org), provisional; (5) **unbooked verified pharmacist, provisional, live-QR only** — no assignment, no membership, no source membership; blocked only if they hold an inactive/REJECTED/LEFT local membership. All provisional sessions need a manager's approval *after* the work (approval requires the session closed, backfills a Shift/Slot/Assignment with actual times, never creates membership). Draft-roster assignments confer no eligibility. Window: ±2h around the shift, pharmacy timezone.
**Normal case:** rostered pharmacist scans in at 8:55 for a 9:00 shift. **Edge case:** verified pharmacist with no booking walks into a busy pharmacy at 9:00, scans, works a full day provisionally; the manager approves at 17:00 (backfilled, paid on their own terms) — or rejects at 17:00 (they worked, the evidence is kept, but the session is rejected: pay/dispute handling is GM-09/GM-14). Cross-site worker from a *different* org with no chain link → rejected (`REMOTE_MEMBERSHIP_NO_CHAIN_OR_ORG_MATCH`). **Retry/concurrency:** one open session per user across all pharmacies — clocking in at site B while open at site A is refused. **Denied role / wrong tenant:** CONTACT favourites without an assignment are rejected; org-admin role alone never confers eligibility; pending/inactive memberships are rejected with a reason code. **Payment/notification side effects:** provisional approval applies the worker's own payment terms (incomplete profiles allowed, flagged `payment_profile_incomplete`, settlement TIMESHEET_ONLY); no notification is sent on clock-in, approval, or rejection (CG-03). **Web/Expo difference:** none in the rule — same backend; the *screens* that show eligibility failures were not compared (contents not read).
**RECOMMENDED:** KEEP tiers 1–3 and 2b; KEEP tier 5 (unbooked cover) but only for *verified pharmacists* (as today) and only when the pharmacy has enabled it per site (a per-pharmacy toggle, default off at launch, so a pharmacy opts into walk-in cover deliberately). Severity: high — tier 5 is the difference between "the roster is the plan" and "any verified pharmacist can create work".
**ALTERNATIVE A — Keep current logic:** all five tiers, tier 5 always available to any verified pharmacist by live QR. Trade-off: no work; maximum cover in an emergency, and a stranger can create a payable shift the manager must then approve or reject after the fact.
**ALTERNATIVE B — Drop tier 5 (unbooked cover):** only assigned, employed, favourite, or cross-site workers can clock in. Trade-off: the roster is the plan, full stop; a pharmacy short-staffed on the day cannot take a walk-in locum through the kiosk (they would need a marketplace offer first, GM-12).
**ALTERNATIVE C — Tier 5 needs a manager's live approval first:** the walk-in's clock-in pends until a manager taps approve on the kiosk/in-app. Trade-off: no work-before-approval; but the manager must be present and watching, which defeats the emergency use.
**Other (describe) / defer.**
**Sources:** `backend/attendance/eligibility.py` (full read), `backend/attendance/transitions.py` (`clock_in`), `backend/attendance/approvals.py` (`approve_provisional_attendance`), `backend/attendance/models.py` (`ProvisionalAttendance.CoverType`).
**Decision status:** OPEN — NEW. **Ask first (Part D).**

### GM-08-Q02 — Provisional attendance: who approves it, how fast, and what if nobody does?

**Plain English:** a provisional clock-in — someone with no shift who worked anyway — sits waiting for a manager until the manager approves or rejects it. There is no deadline, no reminder, and no rule for what happens if nobody ever looks at it. The worker's pay waits on that decision.

**ACTUAL TODAY — Web and Expo (same backend):** Pending provisionals list at `GET attendance/manager/pending/`; approve requires a closed session, backfills Shift/Slot/Assignment with actual times in the pharmacy timezone, is idempotent, never creates membership, applies the worker's own payment terms (incomplete allowed, flagged). Reject requires a reason; evidence is kept. **No deadline, no reminder, no auto-approve, no auto-reject, and no notification to the worker of either decision** was found in the code read. The destination pharmacy's owner/manager decides; wrong-site managers are strictly denied.
**Normal case:** cross-site pharmacist covers a sick colleague; manager approves the same evening; backfilled shift pays on the worker's terms. **Edge case:** manager is away for a week — the provisional sits PENDING; the worker's timesheet (GM-09) presumably can't settle it until approval; whether the timesheet blocks or warns is UNKNOWN (builder not read). Provisional approved after the worker's engagement changed — the backfill uses terms at approval time (`_apply_worker_payment_terms` builds them then). **Retry/concurrency:** approval locks both rows; repeat approval is idempotent (returns the existing record). **Denied role / wrong tenant:** only the destination pharmacy's managers; an org admin without a scoped MANAGE_ROSTER capability cannot approve. **Payment/notification side effects:** approval creates the payable assignment; rejection leaves worked hours with no assignment (pay/dispute = GM-09/GM-14); nobody is notified either way (CG-03). **Web/Expo difference:** none in the rule; approval screens not traced on any client.
**RECOMMENDED:** Approve/reject within 48 hours of clock-out (owner picks the number); remind the manager at 24h; if still pending at the timesheet lock, the timesheet shows it as "unapproved cover — hold pay" rather than silently dropping it. Severity: high — unapproved work is unpaid work until someone clicks.
**ALTERNATIVE A — Keep current logic:** no deadline, no reminder, no notice. Trade-off: no work; provisionals can sit forever and workers chase managers by hand.
**ALTERNATIVE B — Auto-approve after N hours:** a provisional nobody rejected becomes approved automatically. Trade-off: workers always get paid; a manager who was away returns to find shifts they never reviewed — and a fraudulent clock-in auto-pays.
**ALTERNATIVE C — Auto-reject after N hours:** Trade-off: no silent approvals; but a worker who genuinely covered a shift is rejected by a timer, and the dispute has no path (Q08).
**Other (describe) / Defer.**
**Sources:** `backend/attendance/approvals.py` (`get_pending_provisional_attendances`, `approve_provisional_attendance`, `reject_provisional_attendance`, `_apply_worker_payment_terms`), `backend/attendance/urls.py`.
**Decision status:** OPEN — NEW.

### GM-08-Q03 — When does a missing worker become a no-show? (carried CX-Q11) — STILL VALID

> **Also covers (22 Nov):** GM15-11 (GM-15). Asked once, here.

**Plain English:** today there is no such thing as a no-show in the product. A worker who never turns up simply has no attendance record, and their shift still shows them assigned. Nobody is told, nothing is flagged, and the incident ladder (which is supposed to count no-shows) has nothing to count.

**ACTUAL TODAY — Web and Expo (same backend):** No no-show state, field, transition, or job exists in `backend/attendance/` (models, transitions, approvals read in full). No scheduled task marks missing workers (no beat task for attendance was found in the files read; `backend/core/celery.py` was not read — GM-11/GM-23 territory). The rostered worker stays assigned (GM-07 R04) until a manager releases them. The incident ladder (P06/P10) is GM-15's; it has no no-show input from attendance today.
**Normal case:** locum doesn't turn up for a 9:00 shift; at 9:30 the pharmacy is short and nobody in the product knows. **Edge case:** worker clocks in 2h late (inside the window) — is that a late arrival or a no-show who showed up? No rule exists (Q04). Worker on approved leave who was never released from the roster (GM-06-Q06) looks exactly like a no-show. **Retry/concurrency:** n/a. **Denied role:** n/a. **Payment/notification side effects:** a no-show that is never recorded can't trigger the P06 warning ladder, the P09 fee logic, or a replacement — the manager must release the slot by hand (GM-07 F09, now exists — CX-Q16 CHANGED). **Web/Expo difference:** none — the absence is backend-wide.
**RECOMMENDED:** A worker with a confirmed assignment who has not clocked in by 30 minutes after shift start (owner picks the number) becomes "no-show — unconfirmed" and the manager + owner are notified; the manager confirms "no-show" or "late — still coming" (which keeps the assignment and the ±2h clock-in window open). The confirmed no-show feeds the P06/P10 ladder (GM-15) and releases the slot for cover. Severity: high — without it, the ladder, the fees, and the cover flow all depend on a manager noticing.
**ALTERNATIVE A — Keep current logic (no no-show state):** Trade-off: no work; no-shows are invisible to the product and everything downstream (ladder, fees, cover) waits on a human.
**ALTERNATIVE B — Manager marks it by hand, no automation:** a "mark no-show" button on the roster/attendance screen, no timer. Trade-off: simple; still depends on the manager looking.
**ALTERNATIVE C — Auto no-show at start + grace (see Q04):** the timer and the lateness rule are one decision. Trade-off: one rule instead of two; a worker stuck in traffic is auto-flagged.
**Other (describe) / Defer.**
**Sources:** `backend/attendance/models.py`, `backend/attendance/transitions.py`, `backend/attendance/approvals.py` (no no-show anywhere); `docs/qa/launch-grill/questions.json` CX-Q11, CX-Q07, CX-Q16; GM-07 F09 (release exists).
**Decision status:** OPEN (carried CX-Q11, STILL VALID).

### GM-08-Q04 — Late arrival, early departure, early finish: is there a grace period, and what counts? (carried CX-Q12) — STILL VALID

> **Also covers (22 Nov):** GM15-12 (GM-15). Asked once, here.

**Plain English:** today "late" doesn't exist. The clock-in window is two hours either side of the shift, and a clock-in at 8:00 for a 9:00 shift looks exactly the same as a clock-in at 10:30. There is no grace period, no late flag, and no rule for leaving early.

**ACTUAL TODAY — Web and Expo (same backend):** Eligibility window: start − 2h to end + 2h (`eligibility.py`, `_find_matching_assignment`). `AttendanceEvent.occurred_at` is server time; no comparison against scheduled time is made anywhere in the attendance code; no `late`, `grace`, `early`, or `minutes_late` field exists in the models. Clock-out has no window check at all (it closes whatever open session exists). Breaks are sequential but have no length limit and no paid/unpaid flag.
**Normal case:** worker clocks in 10 minutes late — recorded as a normal clock-in. **Edge case:** worker clocks in 1h 55m late (inside the window) — same as on time. Worker clocks in 2h 1m late — outside the window, no matching assignment; they fall through to provisional tiers (local staff → UNROSTERED_LOCAL; others → rejection). Worker clocks out 1h early — recorded as a normal clock-out; pay treatment is GM-09 (CX-R01). **Retry/concurrency:** n/a. **Denied role:** n/a. **Payment/notification side effects:** lateness that is never recorded can't affect pay (GM-09), ratings (GM-15), or the incident ladder (GM-15) — and a worker who is consistently 30 minutes late is indistinguishable from a punctual one. **Web/Expo difference:** none — backend absence.
**RECOMMENDED:** Record lateness, don't block on it: clock-in after start + 15 minutes grace is flagged "late (N min)" on the session/timeline (visible to the manager, not a denial); clock-out before end − 15 minutes is flagged "early finish". The flag feeds GM-09 (pay) and GM-15 (ladder) but the worker can still clock in inside the ±2h window. Severity: medium — a flag is cheap and the downstream decisions need the data.
**ALTERNATIVE A — Keep current logic (no lateness concept):** Trade-off: no work; late and early are invisible forever.
**ALTERNATIVE B — Hard grace + denial:** clock-in more than N minutes late is refused (worker must call the manager). Trade-off: clear; but a late worker who is refused can't work at all, and the pharmacy is shorter-staffed than if they'd started late.
**ALTERNATIVE C — Grace + manager confirm:** a late clock-in asks the manager (on the kiosk) to confirm "accept late start" before it counts. Trade-off: human judgement at the door; needs a manager present.
**Other (describe) / Defer.**
**Sources:** `backend/attendance/eligibility.py` (±2h window, no lateness), `backend/attendance/transitions.py`, `backend/attendance/models.py`; `docs/qa/launch-grill/questions.json` CX-Q12, CX-R01.
**Decision status:** OPEN (carried CX-Q12, STILL VALID).

### GM-08-Q05 — Offline kiosk: how long may it run offline, and what happens to suspicious events?

**Plain English:** the pharmacy's kiosk can keep working with no internet — it records clock-ins locally, signs each one, chains them together so none can be quietly changed, and uploads them when it's back online. It may run offline for up to 24 hours. Events that look wrong go to a manager for review instead of being accepted silently.

**ACTUAL TODAY — Web and Expo (same backend):** Native offline kiosk only (`client_kind == NATIVE_OFFLINE`; a WEB_ONLINE device that tries to sync is refused). Sync: `POST attendance/kiosk/sync/batch/` (device token; revoked devices may still sync, so a revoked kiosk can upload its outbox). Events: `KioskAttendanceEvent` with device sequence (unique per device), device timestamp + `trusted_time_estimate` + `monotonic_elapsed_ms` + `boot_session_id`, hash chain (`previous_event_hash` → `event_hash`), Ed25519 `device_signature`, `canonical_payload`, `integrity_flags`; status ACCEPTED / NEEDS_REVIEW / REJECTED + `rejection_reason`. Manager review: separate immutable `KioskAttendanceReview` (APPROVED/REJECTED, reason required, `effective_timestamp`); the signed event never changes. Config returns a server-time anchor + `max_offline_hours` (setting `KIOSK_MAX_OFFLINE_HOURS`, default 24). The verification rules inside `sync_offline_batch` (`protocol.py`) were **not line-read** — the exact accept/review/reject conditions are UNKNOWN beyond the model shape.
**Normal case:** internet drops at 9:00; kiosk keeps clocking people in; syncs at 11:00; events accepted. **Edge case:** offline longer than 24 hours — the enrolment credential expires (`offline_valid_until`); whether the kiosk then refuses new clock-ins, queues them anyway, or warns, was NOT traced (the enrol/sync code paths for expiry were not line-read). Clock tampering (device clock moved back) — the monotonic clock + hash chain exist to catch it; the exact handling is in `protocol.py` (not read). Duplicate/out-of-order sequence → unique constraint on (device, sequence). **Retry/concurrency:** batches are idempotent by `event_id` + device sequence (unique constraints); a retried batch does not duplicate events (as far as the model constraints show — the protocol code was not read). **Denied role / wrong tenant:** device token is per-pharmacy; a device cannot sync another pharmacy's events (device FK on every event). **Payment/notification side effects:** NEEDS_REVIEW events don't become attendance until a manager decides (F10); pay waits (GM-09). **Web/Expo difference:** the offline kiosk is the Tauri desktop build; Expo is not the offline kiosk; Vite web-online kiosk cannot sync offline batches by design.
**RECOMMENDED:** KEEP 24 hours and the review queue; add a kiosk-side rule (to be confirmed against `protocol.py`): past 24h offline, the kiosk warns loudly and keeps recording (never refuse a clock-in — a refused clock-in is lost evidence), and flags the whole batch NEEDS_REVIEW on sync. Severity: medium — the crypto exists; the expiry behaviour is the gap.
**ALTERNATIVE A — Keep current logic:** 24h, review queue, expiry behaviour as whatever `protocol.py` does (unverified). Trade-off: no work; the expiry case is untested by this trace.
**ALTERNATIVE B — Shorter offline window (e.g. 8h):** Trade-off: less room for clock drift/tampering; a pharmacy with a full-day outage can't clock anyone in offline after 8h.
**ALTERNATIVE C — No offline kiosk at all (online only):** Trade-off: simplest trust model; a pharmacy with no internet can't record attendance at all — which is exactly when they need it most.
**Other (describe) / Defer.**
**Sources:** `backend/attendance/models.py` (`KioskDevice`, `KioskAttendanceEvent`, `KioskAttendanceReview`), `backend/attendance/kiosk_api.py` (`KioskOfflineSyncView`, `KioskConfigView`, `KioskWorkerEnrolView`), `backend/attendance/protocol.py` (**not read** — verification rules UNKNOWN).
**Decision status:** OPEN — NEW (with an UNKNOWN: read `protocol.py` before implementing).

### GM-08-Q06 — PIN clock-in: keep it, who sets the PIN, and is 5-tries / 15-minutes right? (NEW)

**Plain English:** a worker can clock in at the kiosk with a personal PIN instead of their phone. The PIN is hashed, the owner can turn it off, and five wrong tries locks it for 15 minutes. The worker can also set their own PIN from the app.

**ACTUAL TODAY — Web and Expo (same backend):** `WorkerPIN`: one per membership, `pin_hash`, `failed_attempts`, `locked_until`, `is_enabled` (owner toggle). 5 failed attempts → 15-minute lockout, serialised per row. Worker sets/changes their own PIN (`POST attendance/worker/pin/update/`, per pharmacy). Manager setup via a 6-digit email code (10-minute reuse window). PIN + identifier verify at the kiosk (`KioskPinClockView`, `KioskWorkerEnrolView`); wrong PIN gives no hint which half was wrong. No PIN *format* rule was found in the code read (length? digits only? — `set_pin` only requires a non-empty string; whether the service layer enforces a format was not traced — `credentials.py` not line-read). Kiosk PIN clocking is throttled (`KioskPINRateThrottle`, values not read).
**Normal case:** worker forgets their phone, enters identifier + PIN, clocks in. **Edge case:** worker's PIN is locked after 5 typos — they can't clock in by PIN for 15 minutes (QR still works). Worker changes their PIN mid-shift — the `credential_generation` hash changes, which invalidates offline enrolments (by design). **Retry/concurrency:** failed attempts are serialised (`select_for_update` on the row). **Denied role / wrong tenant:** a PIN is per *membership* (per pharmacy) — a PIN for Pharmacy A doesn't work at Pharmacy B (the kiosk device is per-pharmacy and the membership lookup is per-pharmacy). **Payment/notification side effects:** none directly; a locked-out worker who can't clock in looks absent (Q03). **Web/Expo difference:** PIN entry is a kiosk function; PIN *setup* is worker-app (Expo `attendance-pin.tsx`) and web — contents not compared.
**RECOMMENDED:** KEEP PIN clock-in with 5 tries / 15 minutes, and set a PIN format rule (4–6 digits, not the worker's birth year — owner to confirm the exact rule) plus a manager reset (a manager can unlock/reset a worker's PIN without the email-code dance when the worker is standing at the counter). Severity: low-medium — the mechanism is sound; the format rule and the reset path are the gaps.
**ALTERNATIVE A — Keep current logic:** as-is, no format rule, no manager reset. Trade-off: no work; weak PINs ("1234", "0000") are possible and a locked worker waits 15 minutes.
**ALTERNATIVE B — Drop PIN clock-in (QR only):** Trade-off: one fewer credential to manage; workers without their phone can't clock in at all.
**ALTERNATIVE C — Stronger lockout (3 tries / 1 hour):** Trade-off: harder to brute-force a 4-digit PIN; more lockouts on honest typos.
**Other (describe) / Defer.**
**Sources:** `backend/attendance/models.py` (`WorkerPIN`), `backend/attendance/kiosk_api.py` (`KioskPinClockView`, `KioskWorkerEnrolView`, `KioskWorkerSetupPinView`), `backend/attendance/worker_api.py` (`WorkerUpdatePinView`), `backend/attendance/transitions.py` (KIOSK_PIN source).
**Decision status:** OPEN — NEW.

### GM-08-Q07 — QR scanning: confirm the current parameters and change nothing (scope freeze)

**Plain English:** the owner froze QR scanning — it stays as it is unless separately approved. So this question isn't asking to change it. It's asking the owner to confirm the parameters as they are, so nobody "fixes" them by accident later.

**ACTUAL TODAY — Web and Expo (same backend):** QR token: HMAC-signed, **30-second TTL**, kiosk refreshes every 30 seconds (`KioskQRView`: `ttl_seconds=30`, `refresh_interval_seconds: 30`). Worker scans with their own signed-in phone (`MOBILE_QR` source); clock-out needs a fresh QR at the session's pharmacy. Throttled (`KioskQRRateThrottle`). The QR itself carries no worker identity — identity comes from the signed-in user / the PIN. `PharmacyQRSession` (rotating code model) also exists; the live flow uses the signed token. **Scope freeze (Issue #250): existing QR scanning remains unchanged unless separately approved.**
**Normal case:** worker scans, clocks in within 30 seconds. **Edge case:** worker scans a QR that is 31 seconds old — verification fails, they scan again. Two workers scanning the same QR — the token identifies the *pharmacy*, not the worker; each scan is a separate clock-in by a separate signed-in user. **Retry/concurrency:** 30-second idempotency on clock-in (F01). **Denied role:** an unsigned-out/anonymous scan can't clock in (worker endpoints require authentication). **Payment/notification:** none. **Web/Expo difference:** the kiosk *shows* the QR (Vite/Tauri build); Expo *scans* it — the two sides are different apps by design.
**RECOMMENDED:** CONFIRM, no change: 30-second TTL, 30-second refresh, HMAC-signed, phone-side scan. Record the freeze explicitly against this question so a later "improvement" (longer TTL, static QR) has to come back as a new decision.
**ALTERNATIVE A — Keep current logic (same as recommended):** confirm and freeze. (This question's KEEP *is* the recommendation.)
**ALTERNATIVE B — Longer TTL (e.g. 5 minutes):** Trade-off: friendlier for slow phones; a photographed QR stays usable for 5 minutes — the freeze exists precisely to prevent this without a separate approval.
**ALTERNATIVE C — Static QR per pharmacy:** Trade-off: simplest kiosk; a photo of the QR clocks anyone in from anywhere, forever — contradicts the freeze.
**Other (describe) / Defer.**
**Sources:** `backend/attendance/kiosk_api.py` (`KioskQRView`), `backend/attendance/worker_api.py` (`WorkerClockInView`, `WorkerClockOutView`), Issue #250 scope freeze.
**Decision status:** OPEN — confirm-only, no change proposed.

### GM-08-Q08 — Manager corrections: who can correct, and how does a worker dispute one? (carried CX-Q33) — STILL VALID

**Plain English:** a manager can fix a wrong clock time, and the fix is properly audited — the original time is never overwritten, the reason is required, and the timeline shows both. But if the worker disagrees with the correction, there is no way in the product to say so.

**ACTUAL TODAY — Web and Expo (same backend):** `POST attendance/manager/correct/` → `create_attendance_correction`: manager of the *destination* pharmacy only; `AttendanceCorrection` (original event, corrected timestamp, reason required, corrected_by, corrected_at); original `occurred_at` never mutated; `get_effective_session_timeline` computes the effective chronology; corrections are append-only. Manager timeline view exists (`GET attendance/manager/timeline/<session_id>/`). **No worker dispute, challenge, or "I disagree" path exists** in the attendance code read. Whether the worker is even *notified* of a correction was not found (no notification in `approvals.py` — CG-03).
**Normal case:** worker forgot to clock out; manager corrects the clock-out to the scheduled end. **Edge case:** manager corrects a clock-in *earlier* than the real one (more paid hours) or *later* (fewer) — the reason is the only control, and the worker can't see or challenge it (unless the timeline is visible to them — the worker-facing timeline was not traced). Correction after the timesheet is locked (GM-09) — whether corrections are allowed then, and what happens, is UNKNOWN (timesheet lock interaction not traced). **Retry/concurrency:** corrections are append-only rows; two corrections to the same event stack (effective timeline picks the latest — exact precedence in `get_effective_session_timeline`, not line-read in detail). **Denied role / wrong tenant:** only the destination pharmacy's managers; a worker cannot correct their own times. **Payment/notification side effects:** corrections change effective (payable) hours — the money moves on a manager's say-so with no worker recourse. **Web/Expo difference:** none in the rule; correction screens not traced on any client.
**RECOMMENDED:** KEEP manager corrections as-is, and add a worker dispute: the worker sees their effective timeline, can flag "I disagree" with a note, which reopens the session to the manager (no pay change until the manager answers). Severity: high — a correction that cuts pay with no recourse is a Fair Work complaint in waiting.
**ALTERNATIVE A — Keep current logic:** manager corrects, worker has no path. Trade-off: no work; corrections are one-sided by design.
**ALTERNATIVE B — Worker can request a correction too:** the worker proposes a corrected time with a reason; the manager approves/rejects it (same append-only audit). Trade-off: symmetric; more states, but the dispute and the request become one flow.
**ALTERNATIVE C — Corrections need a second manager (four-eyes):** Trade-off: strongest control; slow, and small pharmacies have only one manager.
**Other (describe) / Defer.**
**Sources:** `backend/attendance/approvals.py` (`create_attendance_correction`, `get_effective_session_timeline`), `backend/attendance/models.py` (`AttendanceCorrection`), `backend/attendance/urls.py`; `docs/qa/launch-grill/questions.json` CX-Q33.
**Decision status:** OPEN (carried CX-Q33, STILL VALID).

### GM-08-Q09 — Breaks: paid or unpaid, how long, and who decides? (NEW, boundary with GM-09/GM-14)

**Plain English:** the product records breaks — start, end, on the phone or at the kiosk — but it never says whether a break is paid, how long one may be, or what happens if someone takes an hour. The roster wizard doesn't even have a break field. The pay answer lives with timesheets and the Award, but the attendance side has to record enough for that answer to be possible.

**ACTUAL TODAY — Web and Expo (same backend):** Break events: BREAK_START / BREAK_END, sequential, in-app or kiosk; clock-out auto-ends an active break. No break length, no paid/unpaid flag, no limit, no scheduled-break field was found in the attendance code. `PO-Q02` (Oct 2026): "Must every shift state the break length and whether it is paid? No break field exists. Frozen terms do not mention it." — still true as far as this trace shows (the posting wizard was not re-read at head; GM-10 owns it). Break elapsed seconds are returned by the kiosk break action (`break_elapsed_seconds`).
**Normal case:** worker takes a 30-minute meal break mid-shift. **Edge case:** worker on break for 2 hours — recorded, no flag, no limit. Worker never ends the break and clocks out — auto-ended at clock-out, so the "break" runs to the end of the shift. **Retry/concurrency:** sequential enforcement (double start / end-without-start refused). **Denied role:** n/a. **Payment/notification side effects:** whether break time is deducted from payable hours is GM-09's builder (not read) — the attendance side must record breaks accurately or the pay math is wrong. **Web/Expo difference:** none in the rule; break dialogs exist on web (`KioskBreakDialog.tsx`) — Expo break UI not traced.
**RECOMMENDED:** Decide the rule in GM-09/GM-14 (paid vs unpaid meal breaks under the Award), but record here: breaks stay as recorded (start/end, no auto-deduction in attendance), and the roster/posting flow gains a break-length + paid/unpaid field (PO-Q02, GM-10) so the timesheet has something to compare against. Severity: medium — the attendance recording is fine; the missing piece is the *expected* break.
**ALTERNATIVE A — Keep current logic:** breaks recorded, no rule anywhere. Trade-off: no work; pay for breaks is decided ad hoc at timesheet time.
**ALTERNATIVE B — Unpaid meal break auto-deducted (e.g. 30 min after 5h):** Trade-off: matches common Award practice; but auto-deduction without a recorded break punishes workers who didn't take one.
**ALTERNATIVE C — Breaks must be rostered:** every shift states its break; a break outside the rostered window is flagged. Trade-off: most precise; needs the posting field (PO-Q02) first.
**Other (describe) / Defer.**
**Sources:** `backend/attendance/transitions.py` (`start_break`, `end_break`), `backend/attendance/models.py` (`AttendanceEvent.EventType`), `backend/attendance/kiosk_api.py` (`KioskStaffBreakActionView`); `docs/qa/launch-grill/questions.json` PO-Q02.
**Decision status:** OPEN — NEW (decide the pay rule in GM-09/GM-14; record the attendance side here).

### GM-08-Q10 — Can a manager clock someone in or out for them? (MANAGER source) (NEW)

**Plain English:** the system has a "manager" clock source — a clock event recorded by a manager rather than by the worker. But no manager clock-in/out button or endpoint was traced in this pass, so it's unclear when, if ever, a manager is supposed to act for a worker — and what stops a manager from inventing attendance.

**ACTUAL TODAY — Web and Expo (same backend):** `AttendanceEvent.Source.MANAGER` exists in the enum (`models.py`), alongside QR_KIOSK / MOBILE_QR / KIOSK_PIN / IN_APP / OFFLINE_KIOSK. No manager clock-in/out endpoint appears in `attendance/urls.py` (29 routes — worker clock-in/out, kiosk PIN clock, breaks, manager pending/approve/reject/correct/timeline/devices/review; no manager clock action). No writer of `Source.MANAGER` was found in the files read (`transitions.py`, `worker_api.py`, `kiosk_api.py`, `approvals.py` — none sets MANAGER). It may be written by code not read (`views.py`, `attendance_edits.py`, `protocol.py`) or reserved for future use — UNKNOWN.
**Normal case:** (if it existed) worker forgot their phone and their PIN; manager clocks them in at the counter. **Edge case:** manager clocks in a worker who never arrived — the event would look like a normal clock-in except for its source; the only defence is the audit trail + the manager's identity (which the event does not store as a separate field — `device`/`qr_session`/`ip_address` exist, but no "recorded by manager X" field was seen on `AttendanceEvent`). **Retry/concurrency:** n/a. **Denied role:** n/a. **Payment/notification side effects:** a manager-recorded clock-in creates payable hours — the fraud/abuse surface is real if the capability exists without controls. **Web/Expo difference:** none — the enum value is backend-wide; no screen offers it as far as traced.
**RECOMMENDED:** Either wire it properly (manager clock-in/out only for a worker physically present, with the manager's identity stored on the event, a reason required, and the event flagged for review) or remove the enum value. Do not leave a source that nothing writes — it invites a future caller to use it without the controls. Severity: medium — today it appears to be dead; the risk is a future use without a decision.
**ALTERNATIVE A — Keep current logic (MANAGER source exists, nothing writes it):** Trade-off: no work; a dead enum value that may confuse the next developer.
**ALTERNATIVE B — Build manager clock-in/out with controls (recommended shape above):** Trade-off: genuinely useful at a busy counter; needs the controls, or it becomes the easiest way to fake attendance.
**ALTERNATIVE C — Remove the MANAGER source:** Trade-off: cleanest; if a manager ever needs to act for a worker, they use corrections (Q08) instead.
**Other (describe) / Defer.**
**Sources:** `backend/attendance/models.py` (`AttendanceEvent.Source.MANAGER`), `backend/attendance/urls.py` (no manager clock route), `backend/attendance/transitions.py` / `worker_api.py` / `kiosk_api.py` (no MANAGER writer found).
**Decision status:** OPEN — NEW (with an UNKNOWN: search the whole backend for MANAGER writers before implementing).

### GM-08-Q11 — What does attendance hand to the timesheet — and what marks a shift complete? (carried CX-Q32 / CX-R01, GM-09 boundary)

> **Also covers (22 Nov):** GM15-32 (GM-15), GM17-Q16 (GM-17). Asked once, here.

**Plain English:** attendance records what actually happened; the timesheet turns it into pay. The handover between the two was not traced in this pass, and there is still no "shift complete" state anywhere. The owner needs to say what counts as a finished, payable shift — and what happens to the awkward cases (forgot to clock out, clocked in but never rostered, provisional never approved).

**ACTUAL TODAY — Web and Expo (same backend):** `AttendanceSession` (actual times) and `ShiftSlotAssignment` (scheduled times) are separate by design; corrections adjust the *effective* timeline without touching the originals. Workforce timesheet endpoints exist (`timesheets/`, `missing-punch/`, `submit/`, `approve-time/`, `reopen/`, `lock/`, `correct/`, `recalculate/`) — but `timesheet_builder.py`, `timesheet_core.py`, `attendance_edits.py` were **not read**, so how actual hours, breaks, corrections, provisional approvals and missing punches combine into payable hours is UNKNOWN here. No "completed" state on bookings exists (CX-Q32, still valid). Early finishes / extra hours have no pay rule in the attendance code (CX-R01, still valid).
**Normal case:** worker clocks in/out on time; session closes; timesheet picks up actual hours. **Edge case:** worker never clocks out (open session) — the timesheet has a `missing-punch` flow (rules not traced). Worker clocks in provisionally and it's never approved — the session exists with no assignment; whether the timesheet includes it is UNKNOWN. Worker clocks out early / works late — actual times recorded; pay rule is GM-09's. **Retry/concurrency:** n/a. **Denied role:** n/a. **Payment/notification side effects:** everything — this handover *is* the pay calculation's input. **Web/Expo difference:** none — backend boundary; `app/workforce-timesheets.tsx` exists on Expo (contents not read).
**RECOMMENDED:** Define the handover in GM-09, but agree here: a shift is "complete" when the session is closed (clocked out) *and* any provisional is decided *and* any missing punch is resolved; an open session or pending provisional blocks that shift's timesheet from locking. Severity: high for pay correctness — but the decision belongs in GM-09; this question exists so the boundary isn't dropped.
**ALTERNATIVE A — Keep current logic (handover undefined, no complete state):** Trade-off: no work; timesheets are built on whatever the builder does today, unverified.
**ALTERNATIVE B — Session close alone = complete:** Trade-off: simplest; a provisional that was never approved still counts as complete (and payable?) — needs Q02's deadline to be safe.
**ALTERNATIVE C — Manager sign-off per shift:** a manager marks each attendance complete (in addition to corrections). Trade-off: most control; a second approval queue on top of the provisional one.
**Other (describe) / Defer.**
**Sources:** `backend/attendance/models.py` (`AttendanceSession` vs assignment), `backend/workforce/urls.py` (timesheet + missing-punch endpoints), `docs/qa/launch-grill/questions.json` CX-Q32, CX-R01; GM-09 owns the builder (not read here).
**Decision status:** OPEN — boundary question for GM-09 (carried CX-Q32/CX-R01, STILL VALID).

---

## Part D — SINGLE first decision question

### GM-08-Q01 — Who is allowed to clock in — and should a verified locum with no booking be able to walk in and work?

**Ask this first because:** it is the live trust model for the whole attendance system. Everything else — provisional approvals (Q02), no-shows (Q03), lateness (Q04), the timesheet handover (Q11) — assumes the eligibility tiers are right. The most consequential tier is the fifth one: a verified pharmacist with no booking, no membership, and no assignment can walk into any pharmacy, scan the QR, work a full day, and only afterwards does a manager decide whether it counts. If the owner keeps that, the rest of GM-08 is about managing it; if they drop it, the roster is the plan and the kiosk is just a clock.

**Question (plain English):** Today, five kinds of people can clock in at a pharmacy. Four of them the pharmacy already knows — a rostered or booked worker, an employed worker, a favourite, or someone from another site in the same chain or group. The fifth is a verified pharmacist with no booking at all, who can walk in, scan the QR, and work — the manager only decides afterwards whether it counts. Should that walk-in cover stay?

**Options:**

- **A — Keep current logic:** all five tiers, walk-in cover always available to any verified pharmacist by live QR. *What happens:* a busy pharmacy can take a walk-in locum with no phone call, no offer, no booking — the manager approves or rejects afterwards. *Trade-off:* maximum cover in an emergency; a stranger can create a payable shift the manager must deal with after the fact.
- **B — Keep the tiers, but walk-in cover is opt-in per pharmacy (RECOMMENDED):** tiers 1–3 and favourites stay as they are; the walk-in tier only works at pharmacies that turned it on. *What happens:* a pharmacy opts into walk-in cover deliberately; everywhere else the roster is the plan. *Trade-off:* one toggle, one decision per site; the emergency cover still exists where it's wanted.
- **C — Drop walk-in cover:** only assigned, employed, favourite, or cross-site workers can clock in. *What happens:* a walk-in locum needs a marketplace offer first (GM-12) before they can clock in. *Trade-off:* the roster is the plan, full stop; a short-staffed pharmacy can't take a walk-in through the kiosk.
- **D — Walk-in needs a manager's live approval first:** the walk-in's clock-in pends until a manager taps approve. *What happens:* no work-before-approval. *Trade-off:* the manager must be present and watching, which defeats the emergency use.
- **Other (describe) / defer.**

**Evidence:** `backend/attendance/eligibility.py` (`resolve_attendance_eligibility`, tiers 1–5, tier 5 = verified pharmacist, live-QR only), `backend/attendance/transitions.py` (`clock_in`), `backend/attendance/approvals.py` (`approve_provisional_attendance` — backfill, never creates membership).

**Second question after this one:** GM-08-Q03 (no-show — the missing state that the ladder, the fees, and the cover flow all need).

**Decision status:** OPEN.

---

## Part E — Gaps: code gaps vs decision gaps

### Code gaps (no owner decision needed — build/fix once confirmed; still NO code in this phase)

| # | Gap | Code to touch | Notes |
|---|---|---|---|
| CG-01 | `sync_offline_batch` verification rules not line-read — the exact accept / NEEDS_REVIEW / reject conditions are UNKNOWN | `backend/attendance/protocol.py` | Read before implementing Q05 or any offline change. The model shape (hash chain, sequence, signature) is traced; the verdict logic is not |
| CG-02 | `credentials.py` not line-read — QR signing, PIN verification, pairing-code bodies unverified | `backend/attendance/credentials.py` | Interfaces + call sites read; bodies not. Read before touching QR/PIN/pairing |
| CG-03 | No notifications on clock-in, provisional approval/rejection, or corrections (none found in `transitions.py`, `approvals.py`, `worker_actions.py`) | `backend/attendance/approvals.py`, `backend/attendance/transitions.py`, `backend/notifications/*` | Verify in `views.py` / `kiosk_api.py` too (not read) — the views may notify where the services don't. Workers and managers currently learn late or never |
| CG-04 | `Source.MANAGER` exists but nothing found writes it | `backend/attendance/models.py`, search whole backend for MANAGER writers | See Q10 — wire it with controls or remove it |
| CG-05 | No auto clock-out / no open-session cleanup was found (a forgotten clock-out leaves the session open indefinitely) | `backend/attendance/transitions.py`, `backend/workforce/attendance_edits.py`, `backend/workforce/timesheet_builder.py` | The timesheet `missing-punch` flow is the presumed remedy (GM-09) — verify it exists and what it does |
| CG-06 | No notification on roster unpublish affecting attendance (a worker's shift disappears while their clock-in window was open) | `backend/workforce/roster/publication.py` | Pairs with GM-07 CG-04; an unpublished shift + a clock-in inside its old window falls to provisional tiers or rejection |
| CG-07 | Kiosk/attendance screens not traced on any client — Vite, Next and Expo parity is UNKNOWN, not "no gap" | Vite `src/pages/attendance/*`, `src/kiosk/*`; `landing_next/migrated/`; Expo `app/attendance*`, `features/parity/attendance.tsx` | GM-25 owns parity; flag here so no one claims attendance is "done on mobile" from the backend alone. In particular: no Next kiosk page was found at all |
| CG-08 | `attendance_tests/` directory + `backend/attendance/test_*.py` (14 files) were listed but not read — test coverage for the traced behaviours is UNKNOWN (which of the 14 test files pass at head is also UNKNOWN; PR #249 says the shared-core suite needed re-verification) | `backend/attendance_tests/`, `backend/attendance/test_*.py` | Read the tests before implementing Q01/Q05 — they may already pin the expiry/review behaviour this trace marks UNKNOWN |

### Decision gaps (owner must choose first — do not build until answered)

GM-08-Q01 (who can clock in — FIRST) · Q02 (provisional approval deadline) · Q03 (no-show definition) · Q04 (late/early rules) · Q05 (offline window + suspicious events) · Q06 (PIN format/reset) · Q07 (QR — confirm only, scope freeze) · Q08 (corrections + worker dispute) · Q09 (breaks — pay rule in GM-09/GM-14) · Q10 (manager clock-in/out) · Q11 (timesheet handover — GM-09 boundary).

**Order to ask:** Q01 → Q03 → Q04 → Q02 → Q08 → Q07 (confirm) → Q05 → Q06 → Q10 → Q09 → Q11. (Q01 first per Part D — it is the trust model; Q03/Q04 second because the ladder, fees and cover all need the missing states; Q07 is a confirm-only question that can be asked any time.)

---

## Part F — Implementation backlog (SEPARATE — FROZEN until the owner answers)

**Do not start any item below until its owner decision is recorded in Part C.** This backlog exists so that, once decisions land, implementation starts from a clear spec with exact files. No branch, no PR, no code change was made in this phase.

| Backlog item | Depends on (owner decision) | Files / functions to touch | Tests to add / update |
|---|---|---|---|
| BL-01 Eligibility tiers as decided (per-pharmacy walk-in toggle, or tier 5 dropped, or live-approval) | Q01 | `backend/attendance/eligibility.py` (`resolve_attendance_eligibility`), `backend/attendance/transitions.py` (`clock_in`), kiosk + worker screens | Each tier × eligible/ineligible × provisional/non-provisional; walk-in toggle on/off per pharmacy |
| BL-02 Provisional approval deadline + reminders + timesheet-hold behaviour | Q02 | `backend/attendance/approvals.py`, notification code, `backend/workforce/timesheet_builder.py` (GM-09) | Pending past deadline; reminder timing; approval after deadline; timesheet hold vs drop |
| BL-03 No-show detection + manager confirm + ladder feed | Q03 (GM-15 owns the ladder) | New no-show marking (model or status), `backend/attendance/transitions.py` or a scheduled job, `backend/shifts/*` (GM-15), notifications | Missing worker at start+30m; manager confirms/declines; slot released for cover; ladder step recorded once |
| BL-04 Late/early flags on sessions + timeline display | Q04 | `backend/attendance/eligibility.py` (window), `backend/attendance/transitions.py`, `backend/attendance/approvals.py` (`get_effective_session_timeline`), manager/worker screens | In-window late, outside-window provisional, early finish; flags visible to manager, not a denial |
| BL-05 Offline expiry rule + review-queue behaviour (after reading `protocol.py`) | Q05 | `backend/attendance/protocol.py`, `backend/attendance/kiosk_api.py`, Tauri kiosk (`frontend_web/src-tauri/`, `src/kiosk/`) | Offline >24h; tampered clock; out-of-order sequence; retried batch (no duplicates) |
| BL-06 PIN format rule + manager reset/unlock | Q06 | `backend/attendance/models.py` (`WorkerPIN.set_pin`), `backend/attendance/credentials.py`, kiosk + worker PIN screens | Weak PIN rejected; locked PIN reset by manager; credential generation invalidates offline enrolment |
| BL-07 QR freeze recorded (no code — decision record only) | Q07 | Decision ledger | Any future QR change (TTL, static QR) must come back as a new decision |
| BL-08 Worker dispute path for corrections (+ correction notifications) | Q08 | `backend/attendance/approvals.py`, new dispute model/endpoint, worker timeline screens | Worker disputes a correction; manager answers; pay held until answered (if decided) |
| BL-09 Manager clock-in/out with controls, or remove the MANAGER source | Q10 | `backend/attendance/models.py`, `backend/attendance/transitions.py`, `backend/attendance/urls.py` + manager screens | Manager clocks in an absent worker (must fail or flag); manager identity stored; reason required |
| BL-10 Break expectation (posting field) + pay rule | Q09 (GM-09/GM-14 own the pay rule; GM-10 owns the posting field) | `backend/shifts/posting.py` (PO-Q02 field), `backend/workforce/timesheet_builder.py` | Rostered break vs actual break; paid/unpaid per Award; auto-deduction rules if any |
| BL-11 Timesheet handover + "complete" definition | Q11 (GM-09 owns the builder) | `backend/workforce/timesheet_builder.py`, `timesheet_core.py`, `attendance_edits.py`, `backend/attendance/approvals.py` | Open session / pending provisional / missing punch block locking per decision |
| BL-12 Code gaps CG-01–CG-08, timed by owner | As noted in Part E | As per Part E | Each with web + Expo verification; offline + kiosk-device tests included |

**Ordering note:** BL-01 (eligibility) first after the first decision — it is the trust model everything else hangs off — then BL-03/BL-04 (the missing no-show/late states), then BL-02/BL-08 (provisional + correction disputes, i.e. the worker's recourse), then BL-05/BL-06 (offline + PIN hardening). GM-09 must be decided alongside BL-11 (the handover is half theirs); GM-15 alongside BL-03 (the ladder consumes no-shows); GM-07 alongside BL-03 (release is the cover path a no-show triggers).

---

## Appendix — Evidence index (per-question source links)

- Head: PR #249 `get` — head `97c4543e051b43fe30ec7e2e61ad3d69957a918e`, branch `fix/pr248-expo-production-waves-20261104`; body "working head `26cae2d6`" is the last implementation commit's short SHA, not the branch head; "W5 attendance/workforce" is listed as a future wave in that body — **resolved in this trace**: the attendance/workforce apps already exist in full at this head (they predate #249).
- Issue #250 `get` — 26 areas; scope freeze (existing QR scanning unchanged unless separately approved); progress labels; method (#204, reuse #184's 142 questions + 30 decisions, revalidate against #249).
- Old grill: PR #184 `get` + `get_files` — head `c786a4b8…`; `docs/qa/launch-grill/questions.json` (SHA `9b700e31…`, 142 questions, 30 carried decisions) and `AUDIT.md` read from `refs/pull/184/head` — including "attendance/no-show detail (D13/D14 stay with the register)" and "Roster cover/swap/leave requests (`shifts/worker_requests.py`, `workforce/roster/worker_actions.py`)".
- Files read line by line at head `97c4543…`: `backend/attendance/models.py` (612 lines), `backend/attendance/urls.py` (64 lines, 29 routes), `backend/attendance/worker_api.py` (224 lines), `backend/attendance/transitions.py` (494 lines), `backend/attendance/eligibility.py` (421 lines), `backend/attendance/kiosk_api.py` (926 lines), `backend/attendance/approvals.py` (419 lines); directory listings: `backend/attendance/` (incl. 14 test files), `backend/workforce/`, `backend/workforce/roster/`, `backend/shifts/`.
- Default-branch search index (NOT head — flagged in text): `kiosk` in `frontend_mobile` (9 hits: `app/kiosk-link.tsx`, `app/attendance/kiosk-status.tsx`, `app/attendance-pin.tsx`, `features/parity/attendance.tsx`, `app/workforce-timesheets.tsx`, + tests) and `frontend_web` (42 hits: `kiosk.html`, `src/kiosk/*`, `src-tauri/*`, `src/pages/attendance/KioskPage.tsx`, `KioskPairingDialog.tsx`, `KioskEvidenceReview.tsx`, `KioskActivationView.tsx`, `KioskBreakDialog.tsx`, `WorkerAttendancePage.tsx`).
- Not read (flagged UNKNOWN in text): `backend/attendance/protocol.py`, `backend/attendance/credentials.py`, `backend/attendance/kiosk_review.py`, `backend/attendance/cover_terms.py`, `backend/attendance/api_support.py`, `backend/attendance/throttles.py`, `backend/attendance/views.py`, `backend/attendance_tests/`, `backend/workforce/attendance_edits.py`, `backend/workforce/timesheet_builder.py` / `timesheet_core.py`, `docs/qa/shift-lifecycle/OWNER_DECISION_REGISTER.md` (D13/D14 wording), all Vite/Next/Expo attendance/kiosk screen contents.
- Adopted without re-trace: GM-01 sessions (device token, not user JWT); GM-06 employment/leave (this session); GM-07 roster/cover/swap (this session); GM-04 chain/org definitions; GM-18 LA-Q12; GM-25 structural trace.

*End of GM-08 documentation. No code was changed. No branch or PR was created. This file replaces the earlier BLOCKED-429 stub of the same name.*


---

## Added 2026-11-21: waiting owner decisions (review of PR #267)

Evidence refs: `pr257:` = `origin/agent/pr257-int` at `21add924` (Expo app + newest backend), `main:` = `origin/main` at `8ccf8f77` (web as deployed). Each question is asked once, recommendation first. Source: the orchestrator's waiting-decision list of 21 Nov (items W-01 to W-17, mapped in [`../OWNER_GRILL.md`](../OWNER_GRILL.md) section 3).

### GM-08-W01: Re-grill: kiosk PIN setup and worker QR confirmations tied to the session the worker saw (W-13, register item 2)
**Scenario (worker QR):** Ali scans the kiosk QR on his phone. It asks him to confirm clock-out. He clocks out elsewhere using his own signed-in session, then taps the old confirmation.
**Scenario (PIN setup):** Mia verifies her code and sets a kiosk PIN. The kiosk asks her to confirm clock-in after a recent clock-out. Her attendance session changes before she confirms.
**What happens today:** On both paths, the server checks the action and session shown to the worker. It refuses a stale tap with 409 and writes no clock event. For stale PIN setup, the PIN write rolls back and the verification code stays usable. On the phone, Ali sees a reload and is told to start the action again (`pr257:backend/attendance/worker_api.py:164`, `pr257:backend/attendance/kiosk_api.py:708`, `pr257:frontend_mobile/features/parity/attendance.tsx:386`).
**Recommendation first: KEEP.** Both Ali and Mia act on fresh attendance information after a stale tap.
- **KEEP (recommended):** Ali starts clock-out again from the refreshed screen. Mia restarts PIN setup and confirms against the current session.
- **A:** When the intended clock state is already in place, Ali sees “Already clocked out” and Mia can finish setting her PIN without a second clock-in. A different session or action still needs fresh confirmation.
- **DEFER**

**Note:** The rollout order (ship the mobile build first, then the backend) is a GM-26 release item.
**Status:** OPEN (owner asked for a re-grill; the ACTIVE.md note "proposed until #242 merges" is out of date: #242 merged on 3 Nov)
