# Antigravity Checkpoint 5 Result — Secure Kiosk, QR, and PIN Flows

**Date:** 2026-09-15  
**Checkpoint:** 5. Secure kiosk, QR, and PIN flows (`ROSTER-ATTENDANCE-FINALIZATION-PLAN.md`)  
**Status:** COMPLETE  

---

## 1. Summary of Work

Secured and hardened the kiosk device lifecycle, rotating QR codes, worker PIN authentication, and draft assignment eligibility:

1. **Hashed Kiosk Device Tokens**:
   - `activate_kiosk_device` in `backend/client_profile/attendance_credentials.py` generates high-entropy `ctk_kiosk_...` tokens, computes a deterministic SHA-256 hash using `hash_kiosk_token(raw_token)`, and stores only the hash in `KioskDevice.device_token`.
   - The raw token is returned once to the activating client.
   - `authenticate_kiosk_device` looks up devices by the SHA-256 hash of the presented token, with a fallback for legacy unhashed tokens to ensure seamless backward compatibility.

2. **Kiosk Authentication Without JWT Conflict**:
   - `KioskActivateView`, `KioskQRView`, and `KioskPinClockView` in `backend/client_profile/attendance_views.py` use `authentication_classes = []` and `permission_classes = [permissions.AllowAny]`.
   - Device authentication is handled strictly via `_get_kiosk_device_from_request`, reading `X-Device-Token` (or `HTTP_X_DEVICE_TOKEN` / `Authorization: Bearer ctk_kiosk_...` / request body) without conflicting with DRF JWT middleware.

3. **Draft Assignment Protection in Attendance Eligibility**:
   - In `backend/client_profile/attendance_eligibility.py`, implemented `is_draft_roster_assignment(assignment)`: checks if an assignment marked `is_rostered=True` belongs to an unpublished draft `RosterPeriod`.
   - `_find_matching_assignment` skips draft assignments.
   - Workers assigned only on draft rosters cannot claim `CONFIRMED_ASSIGNMENT` eligibility: local staff fall back to provisional `UNROSTERED_LOCAL`, and external workers without membership are rejected with `NO_ASSIGNMENT_OR_MEMBERSHIP` until the manager publishes the roster.

4. **Dedicated Throttles**:
   - Created `backend/client_profile/attendance_throttles.py` defining:
     - `KioskQRRateThrottle`: 60 requests/minute per kiosk device/IP.
     - `KioskPINRateThrottle`: 10 attempts/minute per kiosk device/IP.
     - `WorkerClockInThrottle`: 20 requests/minute per worker user/IP.
     - `WorkerClockOutThrottle`: 20 requests/minute per worker user/IP.
   - Attached throttles to `KioskQRView`, `KioskPinClockView`, `WorkerClockInView`, and `WorkerClockOutView`.

5. **Generic PIN Responses & Tested Lockout**:
   - `KioskPinClockView` returns generic error responses (`"Invalid worker identifier or PIN."`, `locked=False`) on both incorrect PINs and non-existent worker identifiers to prevent employee enumeration.
   - On the 5th failed attempt, account locks out for 15 minutes (`"Account is temporarily locked due to too many failed attempts. Please try again later."`, `locked=True`).
   - Verified that attempts made during an active lockout do not extend the lockout duration into the future.

6. **Activating Manager Credential Clearance**:
   - Updated `handleActivate` in `frontend_web/src/pages/attendance/KioskPage.tsx` to immediately invoke `clearTokens()` and post to logout after storing the device token in localStorage.
   - Ensures shared kiosk hardware (e.g. counter iPads) cannot be used to access manager or owner administrative dashboard routes.

---

## 2. Test Execution & Evidence

- **Focused Security Test Suite (`backend/attendance_tests/test_kiosk_qr_pin_security.py`)**:
  - `test_kiosk_token_stored_hashed_and_authenticates` (ok)
  - `test_kiosk_token_backward_compatibility_unhashed` (ok)
  - `test_generic_pin_failure_responses_prevent_worker_enumeration` (ok)
  - `test_pin_lockout_after_five_attempts_and_window_non_extension` (ok)
  - `test_draft_roster_assignment_does_not_grant_confirmed_eligibility` (ok)
  - `test_kiosk_qr_endpoint_accepts_device_token_without_jwt` (ok)
  - `test_throttle_classes_attached_to_views` (ok)
  - **Result**: 7/7 tests passed in 0.089s.

- **Credentials Test Suite (`backend/attendance_tests/test_attendance_credentials.py`)**:
  - 15/15 tests passed in 0.120s.

- **Full Attendance Test Suite (`backend/attendance_tests`)**:
  - **Result**: 147/147 tests passed in 1.810s.

- **Django System Check (`python manage.py check`)**:
  - 0 issues identified.

- **Frontend Typecheck (`npx tsc --noEmit`)**:
  - 0 errors, clean compilation.

---

## 3. Files Modified / Created

- `backend/client_profile/attendance_credentials.py`
- `backend/client_profile/attendance_eligibility.py`
- `backend/client_profile/attendance_throttles.py` (new)
- `backend/client_profile/attendance_views.py`
- `frontend_web/src/pages/attendance/KioskPage.tsx`
- `backend/attendance_tests/test_kiosk_qr_pin_security.py` (new)
- `docs/roster-attendance/ANTIGRAVITY-CHECKPOINT-005-RESULT.md` (new)
