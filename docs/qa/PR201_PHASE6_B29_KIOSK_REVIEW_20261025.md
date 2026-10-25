# B29 suspicious signed kiosk attendance: manager review/rejection

Add append-only `KioskAttendanceReview` model and pharmacy-authorized pending/decide API. Original signed `KioskAttendanceEvent` never mutates and remains NEEDS_REVIEW; pre-approval generates no operational AttendanceEvent (existing B29 fix).

- GET `/api/v1/attendance/manager/kiosk-review/pending/?pharmacy_id=N`
- POST `/api/v1/attendance/manager/kiosk-review/decide/` with event_id, decision, reason, corrected_timestamp on approval.

On APPROVED, a manager supplies verified aware corrected_timestamp and _apply_business_event uses ordinary attendance eligibility checks. REJECTED keeps evidence and generates no live attendance. Decisions are one-to-one, transactionally serialized, idempotent on same decision, immutable once recorded; foreign-pharmacy managers receive 403. Revoked device, broken chain and sequence gap cannot be overridden into live attendance through this endpoint. Included tests on the standalone signed kiosk schema.

Migration attendance.0005 is additive and not deployed. Downstream payroll export behavior and staff notification acceptance must be verified on staging before B29 fully certified. NO-GO.
