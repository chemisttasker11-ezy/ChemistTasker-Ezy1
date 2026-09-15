# Checkpoint 10 Result: Roster Copy, Templates and Bulk Operations

**Status**: COMPLETE
**Timestamp**: 2026-09-15T11:13:00+10:00
**Executor**: Antigravity Gemini Flash (CLI)

---

## 1. Summary of Deliverables

Checkpoint 10 delivers comprehensive weekly roster copy, reusable template management, and transactional bulk operations using existing models (`Shift`, `ShiftSlot`, `ShiftSlotAssignment`, `RosterTemplate`, `RosterPeriod`):

### A. Roster Copy (`copy_roster_week`)
- **Draft Status Enforcement**: Target `RosterPeriod` is always created with `status=DRAFT` and `copied_from` set to the source period to prevent accidental publication.
- **Monday Validation**: Target week start is validated to be a Monday (`weekday() == 0`), rejecting mid-week dates or copying onto the same week.
- **Accidental Publication & Duplicate Protection**:
  - Target periods that are already `PUBLISHED` cannot be copied into (`ValidationError`).
  - Target periods that already have shifts require explicit `overwrite=True` to replace.
  - Safe replacement cleans existing assignments and slots using scoped SQL (`_clear_target_week_shifts`), avoiding cascading ORM collector issues.
- **Cross-Pharmacy Isolation**: Managers cannot copy across different pharmacies.

### B. Roster Templates (`create_roster_template`, `save_period_as_template`, `apply_roster_template`)
- **Schema Validation**: Validates `template_data` JSON schema:
  - `day_of_week` integer between 0 (Monday) and 6 (Sunday).
  - Valid `start_time` and `end_time` with `start_time < end_time`.
  - Role choices validated against `Shift.ROLE_CHOICES`.
  - Optional `user_id` validated to exist.
- **Saving from Period**: `save_period_as_template` parses all existing shifts/slots from a `RosterPeriod` and builds a reusable `RosterTemplate`.
- **Applying to Week**: `apply_roster_template` applies a template to any target Monday week, generating shifts, slots, and optional assigned workers in `DRAFT` status. Prevents applying templates across different pharmacies or onto published weeks.

### C. Bulk Operations (`bulk_edit_roster_period`)
- **All-or-Nothing Transaction**: Entire batch of operations runs inside `transaction.atomic()`. Any single validation error (e.g. slot from another pharmacy, date outside week, invalid time) immediately rolls back the entire batch and returns exact operation error context.
- **Supported Batch Actions**:
  - `create_shift`: Creates new shift, slot, and optional assignment within the period dates.
  - `assign_worker`: Assigns or updates worker on an existing slot.
  - `unassign_worker`: Removes worker assignment from a slot.
  - `delete_slot`: Deletes slot (and cascading assignment).
  - `update_slot_times`: Modifies slot start and end times with boundary validation.
- **Published Protection**: Disallows bulk edits on published periods (`Unpublish first`).

### D. REST API Endpoints
- `POST /attendance/roster/copy-week/`: Week copy endpoint.
- `GET /attendance/roster/templates/?pharmacy_id=`: List templates for pharmacy.
- `POST /attendance/roster/templates/`: Create template (direct or from period).
- `POST /attendance/roster/templates/apply/`: Apply template to target week.
- `POST /attendance/roster/bulk-edit/`: Execute atomic batch of edits.

---

## 2. Files Modified / Created

1. **`backend/client_profile/roster_services.py`**:
   - Added `_parse_time`, `_parse_date`, `_clear_target_week_shifts`.
   - Added `copy_roster_week`.
   - Added `validate_roster_template_data`, `create_roster_template`, `save_period_as_template`, `apply_roster_template`.
   - Added `bulk_edit_roster_period`.
2. **`backend/client_profile/attendance_views.py`**:
   - Added `RosterCopyWeekView`.
   - Added `RosterTemplateView` (`GET` and `POST`).
   - Added `RosterTemplateApplyView`.
   - Added `RosterBulkEditView`.
3. **`backend/client_profile/urls.py`**:
   - Registered paths for all 4 new endpoints.
4. **`backend/attendance_tests/test_roster_copy_templates.py`**:
   - Created 17 unit, integration, and API tests covering copy, templates, bulk rollback, and isolation.

---

## 3. Test Verification & Results

- **Checkpoint 10 Test Suite (`test_roster_copy_templates.py`)**:
  - `Ran 17 tests in 0.221s`: **17 PASSED (100%)**.
- **Full `attendance_tests` Suite**:
  - `Ran 97 tests in 1.008s`: **97 PASSED (100%)**.
- **Helper Tests (`client_profile.test_attendance_helpers`)**:
  - `Ran 6 tests in 0.002s`: **6 PASSED (100%)**.
- **Grand Total**: **103 tests passing (100%)**.
- **Django System Check**: 0 issues identified.
- **Frontend TypeScript (`npx tsc --noEmit`)**: 0 errors.

---

## 4. Unresolved Issues / Blockers

None. The original database and quarantined migration `0044` remain untouched.
All testing was executed against isolated disposable in-memory SQLite.
Ready for **Checkpoint 11: Owner weekly roster interface**.
