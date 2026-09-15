# Antigravity Checkpoint 9 Result — Roster Periods, Draft/Publish & Validation Backend

**Date:** 2026-09-15  
**Checkpoint:** 9. Roster periods, draft/publish and validation backend  
**Status:** COMPLETE  

---

## 1. Summary of Work

Implemented the core business logic, validation engine, and REST endpoints for **Roster V2** according to `ROSTER-ATTENDANCE-PLAN.md` Step 9:

### 1.1 Roster V2 Services (`client_profile/roster_services.py`)
- **Period-to-Assignment Mapping (`get_or_create_roster_period`, `get_roster_period_assignments`)**:
  - Enforces Monday-to-Sunday weekly periods (`weekday() == 0` validation).
  - Automatically queries all `ShiftSlotAssignment` records where `slot_date` falls in `[week_start, week_end]` and `shift.pharmacy == roster_period.pharmacy`.
- **Worker Visibility Isolation (`get_worker_published_roster`)**:
  - **Zero Draft Exposure**: Draft assignments are strictly hidden from workers. Only shifts whose pharmacy's `RosterPeriod` is in `PUBLISHED` status appear in worker roster endpoints.
- **Pre-Publish Validation Engine (`validate_roster_period`)**:
  - **Role Matching**: Ensures assigned worker's role or active membership matches `shift.role_needed` (`PHARMACIST`, `INTERN`, `STUDENT`, `ASSISTANT`, `TECHNICIAN`, `EXPLORER`).
  - **Overlap / Double-Booking**: Detects concurrent shift assignments for the same worker across all pharmacies on the same day (`max(start1, start2) < min(end1, end2)`).
  - **Approved Leave**: Detects conflicts against approved `LeaveRequest` records (`status="APPROVED"`).
  - **Availability Conflict**: Evaluates `UserAvailability` and returns diagnostic warnings if shift times fall outside declared availability.
- **Atomic Publication (`publish_roster_period`, `unpublish_roster_period`)**:
  - Requires destination-pharmacy manager authority (`is_authorized_attendance_manager`).
  - Uses `select_for_update()` inside `transaction.atomic()` to prevent concurrent publish races.
  - Blocks publication if hard validation errors (role mismatch, overlap, leave conflict) exist.
  - Automatically increments publication revision counter and records `RosterPublicationAudit`.
  - Sets `is_rostered = True` on all published assignments.
- **Worker Acknowledgement Engine (`acknowledge_roster_period`, `get_roster_acknowledgement_status`)**:
  - Allows assigned workers to acknowledge published rosters with optional confirmation notes.
  - Rejects acknowledgement attempts on draft rosters or by unassigned workers.
  - Provides managers with a real-time progress breakdown (`total_workers`, `acknowledged_count`, `pending_count`).

### 1.2 Model Layer Additions (`client_profile/models.py`)
- Restored `RosterPeriod` and added:
  - `RosterPublicationAudit`: Append-only audit record logging `published_by`, `published_at`, `revision_number`, `total_assignments`, and `validation_snapshot`.
  - `RosterAcknowledgement`: Worker shift acknowledgement record with `user`, `roster_period`, `acknowledged_at`, and `notes`.

### 1.3 REST API Layer (`client_profile/attendance_views.py` & `urls.py`)
- Mounted under `/attendance/roster/...`:
  - `GET /attendance/roster/period/`: Retrieves or initializes weekly period for a pharmacy.
  - `POST /attendance/roster/validate/`: Runs pre-publish validation on a period.
  - `POST /attendance/roster/publish/`: Atomically validates and publishes roster period.
  - `POST /attendance/roster/unpublish/`: Reverts published roster period to DRAFT.
  - `GET /attendance/roster/worker/`: Worker view of published shifts (strictly excludes drafts).
  - `POST /attendance/roster/acknowledge/`: Worker acknowledgement submission.
  - `GET /attendance/roster/acknowledgements/<int:period_id>/`: Manager summary of worker acknowledgements.

---

## 2. Validation Evidence

All tests ran under isolated disposable SQLite in-memory (`attendance_tests.settings`), never touching `core.settings`, unapplied migrations, or the configured PostgreSQL database.

### 2.1 Test Execution Results
- `attendance_tests/test_roster_services.py`: **12 passed** (0.146s)
  - `test_roster_period_creation_and_monday_validation` (ok)
  - `test_draft_assignments_invisible_to_worker` (ok)
  - `test_published_assignments_visible_to_worker` (ok)
  - `test_validation_detects_role_mismatch` (ok)
  - `test_validation_detects_overlapping_shifts` (ok)
  - `test_validation_detects_approved_leave_conflict` (ok)
  - `test_validation_detects_availability_conflict` (ok)
  - `test_atomic_publish_and_audit_history` (ok)
  - `test_consecutive_publish_increments_revision` (ok)
  - `test_worker_acknowledgement_workflow` (ok)
  - `test_unauthorized_manager_denied_publish` (ok)
  - `test_unpublish_hides_shifts_from_worker` (ok)
- `attendance_tests/test_roster_api.py`: **3 passed** (0.658s)
  - `test_roster_period_detail_endpoint` (ok)
  - `test_roster_validate_and_publish_endpoints` (ok)
  - `test_worker_published_roster_and_acknowledgement` (ok)
- **Total `attendance_tests` suite: 80 passed in 0.867s**.
- **Total `client_profile.test_attendance_helpers`: 6 passed in 0.002s**.
- **Grand Total: 86 automated tests passing (100% pass rate)**.
- `python manage.py check`: **0 issues identified**.
- Frontend TypeScript check (`npx tsc --noEmit`): **0 errors**.

---

## 3. Files Created / Modified

| File | Status | Description |
|---|---|---|
| `backend/client_profile/roster_services.py` | Created | Core Roster V2 business logic: period mapping, validation, atomic publish, draft isolation, acknowledgements |
| `backend/attendance_tests/test_roster_services.py` | Created | 12 automated unit and integration tests for roster services |
| `backend/attendance_tests/test_roster_api.py` | Created | 3 automated integration tests for Roster REST API endpoints |
| `backend/client_profile/models.py` | Modified | Restored RosterPeriod and added RosterPublicationAudit and RosterAcknowledgement |
| `backend/client_profile/attendance_views.py` | Modified | Added REST API views for roster period, validation, publish, unpublish, worker published roster, acknowledgements |
| `backend/client_profile/urls.py` | Modified | Registered `/attendance/roster/...` URL patterns |

---

## 4. Next Step Recommendation

Checkpoint 9 is complete. The system is ready for **Checkpoint 10: Roster copy, templates and bulk operations**.
