# Antigravity Checkpoint 4 Result — Attendance Eligibility Service

**Date:** 2026-09-15  
**Checkpoint:** 4. Central attendance eligibility service  
**Status:** COMPLETE  

---

## 1. Summary of Work

Implemented the central attendance eligibility resolution service in an isolated module:
- Created `client_profile/attendance_eligibility.py` providing `resolve_attendance_eligibility(user, pharmacy, target_time=None, assignment_id=None)` and immutable `AttendanceEligibilityResult`.
- Strictly implemented the required order of precedence:
  1. **Tier 1: Confirmed Assignment**: Resolves scheduled `ShiftSlotAssignment` matching target pharmacy and time window (considering pharmacy timezone and overnight shifts). Confirmed marketplace locums and rostered workers clock in normally without provisional flags (`is_provisional=False`). No permanent pharmacy membership is required.
  2. **Tier 2: Unscheduled Local Staff**: Active, accepted employed staff (`FULL_TIME`, `PART_TIME`, `CASUAL`) at the target pharmacy clock in provisionally (`is_provisional=True`, `cover_type=UNROSTERED_LOCAL`) pending destination manager approval. Records local `source_membership`.
  3. **Tier 3A: Cross-Site Owner Chain Cover**: Active, accepted staff from another pharmacy sharing the same non-null `owner` or shared active `Chain` clock in provisionally (`is_provisional=True`, `cover_type=CROSS_SITE_CHAIN`). Records remote `source_membership`.
  4. **Tier 3B: Cross-Site Organization Cover**: Active, accepted staff from another pharmacy sharing the same non-null `organization` clock in provisionally (`is_provisional=True`, `cover_type=CROSS_SITE_ORG`). Records remote `source_membership`.
- Strictly enforced negative rules:
  - Rejected inactive (`is_active=False`), pending (`status=PENDING`), rejected, or left memberships.
  - Rejected favourite contacts / locums in the directory (`role=CONTACT` or `employment_type in FAVORITE_STAFF_EMPLOYMENT_TYPES`) who attempt unscheduled clock-in without an assignment.
  - Rejected matching null owner or null organization (null != null).
  - Rejected inactive chains.
  - Rejected unrelated pharmacy staff.
  - Never inferred eligibility from onboarding flags or org-admin roles.
  - Strictly read-only evaluation: never auto-creates shifts or memberships.

---

## 2. Validation Evidence

All tests ran under isolated disposable SQLite in-memory (`attendance_tests.settings`), never touching `core.settings`, unapplied migrations, or the configured PostgreSQL database.

### Test execution

```powershell
..\.venv\Scripts\python.exe -m unittest attendance_tests.test_attendance_eligibility -v
```
**Result:** 14 tests passed in 0.140s.
- `test_confirmed_locum_without_membership_is_eligible_normal` (ok)
- `test_rostered_permanent_staff_with_assignment_records_local_membership` (ok)
- `test_unscheduled_local_staff_is_provisional` (ok)
- `test_cross_site_staff_same_owner` (ok)
- `test_cross_site_staff_shared_active_chain` (ok)
- `test_cross_site_staff_same_organization` (ok)
- `test_reject_inactive_local_membership` (ok)
- `test_reject_pending_local_membership` (ok)
- `test_reject_rejected_or_left_membership` (ok)
- `test_reject_favourite_contact_without_assignment` (ok)
- `test_reject_null_to_null_owner_or_org_match` (ok)
- `test_reject_inactive_chain` (ok)
- `test_reject_unrelated_pharmacy_staff` (ok)
- `test_no_shifts_or_memberships_created_by_evaluation` (ok)

### Regression test execution

```powershell
..\.venv\Scripts\python.exe -m unittest attendance_tests.test_model_foundation -v
..\.venv\Scripts\python.exe -c "import os, django; os.environ['DJANGO_SETTINGS_MODULE']='attendance_tests.settings'; django.setup(); import unittest; unittest.main(module='client_profile.test_attendance_helpers', argv=['test', '-v'])"
..\.venv\Scripts\python.exe manage.py check
```
**Results:**
- `test_model_foundation`: 8 tests passed in 0.012s.
- `test_attendance_helpers`: 6 tests passed in 0.002s.
- `manage.py check`: System check identified no issues (0 silenced).

---

## 3. Boundary & Protection Verification

- **Configured database**: Untouched (isolated in-memory SQLite used for all test executions).
- **Existing migrations**: Quarantined `0044` intact; no migrations created, faked, or applied.
- **Existing models & APIs**: Untouched; all service code is in new isolated module `client_profile/attendance_eligibility.py`.
- **Git status**: No commit, no push.

---

## 4. Files Created / Modified

- `backend/client_profile/attendance_eligibility.py` (new)
- `backend/attendance_tests/test_attendance_eligibility.py` (new)
- `docs/roster-attendance/ANTIGRAVITY-CHECKPOINT-004-RESULT.md` (new)
