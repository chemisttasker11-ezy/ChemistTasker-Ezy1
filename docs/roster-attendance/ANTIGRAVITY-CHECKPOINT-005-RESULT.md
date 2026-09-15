# Antigravity Checkpoint 5 Result — Kiosk, Signed QR and Personal Code Services

**Date:** 2026-09-15  
**Checkpoint:** 5. Kiosk activation, signed QR and optional code services  
**Status:** COMPLETE  

---

## 1. Summary of Work

Implemented the physical presence and credential verification layer in an isolated module:
- Created `client_profile/attendance_credentials.py` implementing:
  1. **Kiosk Device Management**:
     - `activate_kiosk_device(user, pharmacy, device_name)`: Enforces that caller is pharmacy owner or authorized manager (`PharmacyAdmin` with OWNER/MANAGER level). Generates a cryptographically random restricted device token (`ctk_kiosk_<random>`). Prevents unauthorized activation.
     - `revoke_kiosk_device(user, kiosk_device)`: Deactivates device, immediately disabling its ability to generate QR or verify PINs.
     - `authenticate_kiosk_device(device_token)`: Authenticates active kiosk devices from token; rejects revoked devices.
  2. **Rotating Signed Pharmacy QR**:
     - `generate_signed_pharmacy_qr(kiosk_device, ttl_seconds=60)`: Issues rotating HMAC-signed tokens with expiration timestamps. Multiple workers can use the same current pharmacy QR concurrently.
     - `verify_signed_pharmacy_qr(signed_token, expected_pharmacy_id=None)`: Verifies HMAC signature, exact expiry timestamp, and pharmacy context (preventing cross-pharmacy QR reuse). Tampered tokens are immediately rejected.
  3. **Personal Code (WorkerPIN) Lifecycle & Kiosk Verification**:
     - `set_worker_personal_code(user, membership, raw_pin)`: Owner/manager sets or resets a worker's hashed PIN.
     - `toggle_worker_personal_code(user, membership, is_enabled)`: Toggles PIN requirement.
     - `verify_kiosk_worker_pin(kiosk_device, user_identifier, raw_pin)`:
       * Resolves worker via email or user ID without requiring organizational prefixes.
       * Supports local staff and cross-site staff under the same owner chain or same organization.
       * Serializes attempt counting with row locks (`select_for_update`) to eliminate race conditions.
       * 5 consecutive failed attempts trigger an atomic 15-minute lockout. Attempts during an active lockout do NOT extend the lockout timer.
       * An expired lockout allows a fresh attempt window. A correct PIN resets the failed attempts counter to 0.
       * Disabled PINs are rejected even with correct raw credentials.

---

## 2. Validation Evidence

All tests ran under isolated disposable SQLite in-memory (`attendance_tests.settings`), never touching `core.settings`, unapplied migrations, or the configured PostgreSQL database.

### Test execution

```powershell
..\.venv\Scripts\python.exe -m unittest attendance_tests.test_attendance_credentials -v
```
**Result:** 15 tests passed in 0.106s.
- `test_owner_and_manager_can_activate_kiosk` (ok)
- `test_unauthorized_user_cannot_activate_kiosk` (ok)
- `test_kiosk_revocation_disables_authentication` (ok)
- `test_unauthorized_revocation_rejected` (ok)
- `test_generate_and_verify_signed_qr` (ok)
- `test_multiple_workers_can_use_same_active_qr` (ok)
- `test_qr_expires_at_exact_deadline` (ok)
- `test_tampered_qr_signature_is_rejected` (ok)
- `test_cross_pharmacy_qr_isolation` (ok)
- `test_revoked_kiosk_cannot_generate_qr` (ok)
- `test_set_and_verify_local_worker_pin` (ok)
- `test_cross_site_pin_resolution_without_prefixes` (ok)
- `test_pin_brute_force_lockout_after_five_attempts` (ok)
- `test_lockout_expires_and_resets_on_next_window` (ok)
- `test_disabled_pin_is_rejected` (ok)

### Regression test execution

```powershell
..\.venv\Scripts\python.exe -m unittest attendance_tests.test_attendance_eligibility -v
..\.venv\Scripts\python.exe -m unittest attendance_tests.test_model_foundation -v
..\.venv\Scripts\python.exe -c "import os, django; os.environ['DJANGO_SETTINGS_MODULE']='attendance_tests.settings'; django.setup(); import unittest; unittest.main(module='client_profile.test_attendance_helpers', argv=['test', '-v'])"
..\.venv\Scripts\python.exe manage.py check
```
**Results:**
- `test_attendance_eligibility`: 14 tests passed in 0.137s.
- `test_model_foundation`: 8 tests passed in 0.011s.
- `test_attendance_helpers`: 6 tests passed in 0.002s.
- `manage.py check`: System check identified no issues (0 silenced).

---

## 3. Boundary & Protection Verification

- **Configured database**: Untouched.
- **Existing migrations**: Quarantined `0044` intact; no migrations created, faked, or applied.
- **Existing models & APIs**: Untouched; services are cleanly isolated in `client_profile/attendance_credentials.py`.
- **Git status**: No commit, no push.

---

## 4. Files Created / Modified

- `backend/client_profile/attendance_credentials.py` (new)
- `backend/attendance_tests/test_attendance_credentials.py` (new)
- `docs/roster-attendance/ANTIGRAVITY-CHECKPOINT-005-RESULT.md` (new)
