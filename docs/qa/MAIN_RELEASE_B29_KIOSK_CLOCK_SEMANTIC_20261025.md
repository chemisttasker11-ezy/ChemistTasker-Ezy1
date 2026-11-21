# B29 — independently challenged kiosk time-integrity decision (25 October 2026)

Frozen production main: `b77e9fd296bc2710350ef6f3cd402ce2529ffc06`. Evidence grade: **S2 bounded source-callpath, not S3 reproduction or S2 certified whole files**. Product code untouched.

## Causal chain and trust assumptions

- `backend/attendance/protocol.py:22-42` defines canonical signed event fields and hash; `:172-193` parses IDs and verifies device-bound Ed25519 signature. A correctly signed event is **not** independently trusted to carry authentic wall-clock time.
- `backend/attendance/protocol.py:89-117` emits CLOCK_MOVED_BACKWARDS, MONOTONIC_ROLLBACK, CLOCK_ANCHOR_DRIFT (over five minutes), and SERVER_TIME_DRIFT (over seven days), plus sequence/hash-chain flags.
- `backend/attendance/protocol.py:234-260` records flags as NEEDS_REVIEW, but the *blocking_flags* set contains only SEQUENCE_GAP, HASH_CHAIN_MISMATCH, UNEXPECTED_INITIAL_HASH and DEVICE_REVOKED_DRAIN. **Clock flags are not blocking.**
- At `backend/attendance/protocol.py:261-274`, the business attendance transition is still applied for an active worker if none of those four blocking flags appear. The event is subsequently retained as NEEDS_REVIEW `(:275-301)`. Thus a correctly signed event with drift can produce a live `AttendanceEvent` / `AttendanceSession` despite being marked for review.
- `backend/attendance_tests/test_kiosk_offline_protocol.py:89-110` provides a working Ed25519 signing fixture. Existing `:243-253` and `:267-282` establish sequence-gap and revoked-device controls, but no clock-drift must-not-apply assertion in the observed path.

**Security interpretation:** source-supported conditional P0-impact/P1 candidate if flagged offline attendance is supposed to remain provisional until a manager accepts the time. If the intended business rule is to provisionally reflect attendance while explicitly preventing pay/approval/export side effects until review, the release risk depends on downstream gating. A NEEDS_REVIEW audit row alone does not prevent the separate applied attendance mutation.

## Positive/negative contract to execute in disposable isolated runner

Re-use the existing self-contained `attendance_tests` test environment and `signed_event` fixture; after mutating any device_timestamp, trusted_time_estimate, monotonic_elapsed_ms or boot_session_id, **recalculate event_hash and re-sign with the fixture private key**. Do not count INVALID_SIGNATURE as B29 evidence.

1. Positive: correctly signed current timestamp + current trusted anchor, initial sequence 1, valid active worker, event CLOCK_IN. Expect acknowledged, one accepted KioskAttendanceEvent, and exactly one valid business AttendanceEvent/Session. Resending identical event is idempotent.
2. Negative clock anchor: correctly signed device timestamp >5 minutes different from trusted estimate, but within seven days of server. Assert CLOCK_ANCHOR_DRIFT and NEEDS_REVIEW retained; if strict integrity policy, zero live AttendanceEvent/Session pending review.
3. Negative server drift: correctly signed timestamp >7 days old and matching trusted estimate. Assert SERVER_TIME_DRIFT and no live attendance until review.
4. Negative rollback: initial valid signed sequence 1, then signed sequence 2 same boot_id with non-increasing monotonic elapsed milliseconds and/or earlier device timestamp. Preserve correct previous_event_hash chain. Assert flags and no additional live attendance until review.
5. Negative hash/signature: tampered timestamp without resigning must be rejected, and sequence gap/revoked device already have no-apply tests. Positive manager-approved correction after integrity review must apply once with original signed evidence retained.

**Executable status:** NOT RUN. Special attendance_tests settings/bootstrap required; do not treat ordinary Django `manage.py test` as equivalent. Source observation is strong, but the exact downstream payroll/attendance effect needs a signed-event test. Do not escalate to reproduced without it.

Source permalinks:
- https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/blob/b77e9fd296bc2710350ef6f3cd402ce2529ffc06/backend/attendance/protocol.py#L89-L117
- https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/blob/b77e9fd296bc2710350ef6f3cd402ce2529ffc06/backend/attendance/protocol.py#L234-L301
- https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/blob/b77e9fd296bc2710350ef6f3cd402ce2529ffc06/backend/attendance_tests/test_kiosk_offline_protocol.py#L89-L110
