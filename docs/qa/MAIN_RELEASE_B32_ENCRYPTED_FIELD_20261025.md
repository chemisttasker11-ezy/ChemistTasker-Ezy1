# PR200 B32 attendance time scope and field key rotation

**Baseline:** `b77e9fd296bc2710350ef6f3cd402ce2529ffc06`. Five disposable Django contracts, run-specific status initially **NOT EXECUTED**. No production code, data or migration change.

**B32:** `backend/attendance/eligibility.py:106-211`: `_find_matching_assignment` with explicit `assignment_id` validates user and pharmacy, checks unpublished roster draft, and returns before the normal window from two hours before start to two hours after end. Kiosk protocol passes a signed event `shift_id` into this assignment parameter; HTTP/signed event impact requires separate end-to-end validation. The positive tests cover a valid on-shift confirmed assignment and an out-of-window clock with no assignment ID (denied); negative checks the same external worker who has *no local membership*, an out-of-window time and explicit ID must be denied.

**Novel encrypted field candidate (not added to canonical 226 pending dedup):** `backend/client_profile/fields.py` derives its Fernet key solely from `settings.SECRET_KEY`. On invalid token `EncryptedTextField._decrypt_if_needed` returns original `enc1$` string without signalling failure. Positive same-key round trip and negative changed-key read. **Conditional data availability concern only:** supported key-rotation policy unknown; not data exfiltration.

Workflow `.github/workflows/pr200_targeted_attendance_key.yml` runs exactly these tests against a disposable database. Each negative only advances S3 after fixtures and positive controls pass; source S2 coverage is tracked separately.
