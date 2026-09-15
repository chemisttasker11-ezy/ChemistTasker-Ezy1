# Checkpoint 12 Result: Worker Roster Actions and Existing Escalation

**Status**: COMPLETE  
**Timestamp**: 2026-09-15T11:45:00+10:00  
**Executor**: Antigravity Gemini Flash (CLI)  

---

## 1. Summary of Deliverables

Checkpoint 12 implements the worker-side roster action lifecycle and owner/manager escalation mechanisms per `ROSTER-ATTENDANCE-PLAN.md` requirements (lines 117–120 and 266–277):

### A. Roster Action Audit Model (`RosterActionAudit`)
- Model added in [client_profile/models.py](file:///c:/ChemistTasker_Ezy/chemisttasker-ezy/backend/client_profile/models.py):
  - Action types: `SWAP_REQUESTED`, `SWAP_APPROVED`, `SWAP_REJECTED`, `COVER_REQUESTED`, `COVER_APPROVED`, `COVER_REJECTED`, `WORKER_RELEASED`, `LEAVE_REQUESTED`, `LEAVE_APPROVED`.
  - Captures `pharmacy`, `shift_assignment` (nullable upon deletion/release), `performed_by`, `target_user`, JSON metadata `details`, and `created_at`.
  - Database indexes on `[pharmacy, action_type]` and `[created_at]`.

### B. Worker Actions & Escalation Service (`roster_worker_actions.py`)
- Created [client_profile/roster_worker_actions.py](file:///c:/ChemistTasker_Ezy/chemisttasker-ezy/backend/client_profile/roster_worker_actions.py):
  1. **Worker Replacement Eligibility Validation (`validate_worker_replacement_eligibility`)**:
     - Enforces role compatibility (user role or active pharmacy membership matching `role_needed`).
     - Checks active pharmacy membership or assignment.
     - Detects shift overlaps (`max(start1, start2) < min(end1, end2)` on same date).
     - Detects approved leave conflicts (`LeaveRequest` with status `APPROVED`).
  2. **Direct Swap Request (`request_direct_swap`)**:
     - Enforces that only assigned worker can request.
     - Verifies target worker role match and availability.
     - **Assignment Preservation**: Retains `assignment.user = requesting_user` (never unassigns upon request submission).
     - Creates `WorkerShiftRequest` with status `PENDING` and records `SWAP_REQUESTED` audit.
  3. **Atomic Direct Swap Approval (`approve_direct_swap`)**:
     - Executes inside atomic transaction with row locking (`select_for_update`).
     - Checks manager authorization for the pharmacy (`is_authorized_attendance_manager`).
     - Re-verifies target worker availability at decision time.
     - Atomically sets `assignment.user = target_user`, marks request `APPROVED`, and records `SWAP_APPROVED` audit.
  4. **Direct Swap Rejection (`reject_worker_shift_request`)**:
     - Marks request `REJECTED`. Original assignment remains completely intact with requesting worker.
  5. **Cover Request Submission (`submit_cover_request`)**:
     - Worker submits "can't work" cover request.
     - **Assignment Preservation**: Assignment remains assigned to worker; creates `WorkerShiftRequest(status="PENDING")` and logs `COVER_REQUESTED` audit.
  6. **Atomic Cover Replacement Approval (`approve_cover_replacement`)**:
     - Atomically reassigns assignment to replacement worker after role, overlap, and leave validation; logs `COVER_APPROVED` audit.
  7. **Worker Release with Escalation Reuse (`release_worker_from_assignment`)**:
     - When manager explicitly releases worker without replacement:
     - Deletes the filled `ShiftSlotAssignment`.
     - **No Duplicate Marketplace Shifts**: Directly reuses the existing `Shift` and updates its `visibility` (e.g. `LOCUM_CASUAL`, `PLATFORM`) per existing tiered escalation.
     - Marks request `APPROVED` and logs `WORKER_RELEASED` audit.

### C. Published Roster Visibility in Worker View (`RosterWorkerViewSet`)
- Updated `get_queryset()` in [client_profile/views.py](file:///c:/ChemistTasker_Ezy/chemisttasker-ezy/backend/client_profile/views.py):
  - Excludes `is_rostered=True` assignments falling within weeks whose `RosterPeriod` is in `DRAFT` status.
  - Workers can view shifts for `PUBLISHED` roster periods only.
  - Non-rostered marketplace shifts (`is_rostered=False`) remain visible to workers.

### D. REST API Endpoints & Routes
- Added views in [client_profile/attendance_views.py](file:///c:/ChemistTasker_Ezy/chemisttasker-ezy/backend/client_profile/attendance_views.py) and registered routes in [client_profile/urls.py](file:///c:/ChemistTasker_Ezy/chemisttasker-ezy/backend/client_profile/urls.py):
  - `POST /attendance/roster/worker/swap-request/` (`RosterWorkerSwapRequestView`)
  - `POST /attendance/roster/worker/cover-request/` (`RosterWorkerCoverRequestView`)
  - `POST /attendance/roster/manager/approve-swap/` (`RosterManagerApproveSwapView`)
  - `POST /attendance/roster/manager/approve-replacement/` (`RosterManagerApproveReplacementView`)
  - `POST /attendance/roster/manager/release-worker/` (`RosterManagerReleaseWorkerView`)
  - `POST /attendance/roster/manager/reject-request/` (`RosterManagerRejectRequestView`)
  - `GET /attendance/roster/audits/` (`RosterActionAuditListView`)

---

## 2. Files Modified / Created

1. **`backend/client_profile/models.py`**:
   - Added `RosterActionAudit` model definition.
2. **`backend/client_profile/roster_worker_actions.py`**:
   - New service module with swap, cover, atomic approval, release, and escalation functions.
3. **`backend/client_profile/views.py`**:
   - Updated `RosterWorkerViewSet.get_queryset()` with draft period exclusion filter.
4. **`backend/client_profile/attendance_views.py`**:
   - Added 7 new REST API views for worker actions, manager decisions, and audit retrieval.
5. **`backend/client_profile/urls.py`**:
   - Wired URL routes for all 7 new endpoints.
6. **`backend/attendance_tests/test_roster_worker_actions.py`**:
   - New test suite with 14 comprehensive unit and API integration tests.

---

## 3. Test Verification & Results

- **New Test Suite (`test_roster_worker_actions.py`)**:
  - `test_direct_swap_request_preserves_assignment`: PASSED
  - `test_direct_swap_validation_role_mismatch`: PASSED
  - `test_direct_swap_validation_shift_overlap`: PASSED
  - `test_direct_swap_validation_approved_leave`: PASSED
  - `test_direct_swap_cannot_swap_with_self`: PASSED
  - `test_direct_swap_unauthorized_requester`: PASSED
  - `test_manager_approve_direct_swap_atomic`: PASSED
  - `test_manager_reject_direct_swap`: PASSED
  - `test_cover_request_preserves_assignment`: PASSED
  - `test_manager_approve_cover_replacement_atomic`: PASSED
  - `test_manager_release_worker_reuses_existing_shift_escalation`: PASSED
  - `test_unauthorized_user_cannot_approve_or_release`: PASSED
  - `test_api_endpoints_end_to_end`: PASSED
  - `test_worker_roster_view_excludes_draft_roster_periods`: PASSED
  - **Result**: **14/14 PASSED (0.202s)**

- **Full Attendance Test Suite (`attendance_tests`)**:
  - **111/111 PASSED (1.182s)** (100% pass rate across all 10 test modules).

- **Attendance Helper Tests (`client_profile.test_attendance_helpers`)**:
  - **6/6 PASSED (0.002s)**.

- **Total Backend Tests**: **117/117 PASSED (100%)**.

- **Django System Check (`python manage.py check`)**:
  - **0 issues identified**.

- **Frontend TypeScript Check (`cmd /c npx tsc --noEmit`)**:
  - **0 errors**.

---

## 4. Unresolved Issues / Blockers

None. The original database and quarantined migration `0044` remain untouched.
Ready for **Checkpoint 13: Acceptance and Step 3A Handover**.
