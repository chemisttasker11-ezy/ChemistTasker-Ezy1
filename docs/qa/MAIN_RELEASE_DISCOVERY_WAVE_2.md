# PR #200 — Independent discovery wave 2: B24 onward

**Frozen application source:** b77e9fd296bc2710350ef6f3cd402ce2529ffc06 on remote main. **PR200** documentation-only branch; no application changes. **Date:** 25 October 2026 Brisbane. This continuation intentionally **does not re-review B01–B23**.

## Coverage ledger for this wave

- Independently followed request→service→model→current test contracts across previously unexamined ordinary marketplace, ethical marketplace, workforce timesheets, offline kiosk/attendance and notifications.
- **9 new source-level findings** B24–B32. Confidence is independent of severity; **0 reproduced runtime defects / 0 fixes**. Distinguish source-observable transaction ordering, policy ambiguity and concurrency assumptions.
- All findings link directly to the immutable baseline source and state an explicit negative/positive regression required for certification.
- This is active discovery, not a claim that all domains are manually reviewed. Subsequent waves must append B33+ without resetting count or repeating historical B01–B23.

## Newly discovered production-risk findings

### B24 — P0 — Ordinary marketplace

**Gap:** Exchange action accepts confirm-completion while still in ENQUIRY / TERMS_PROPOSED, and arbitrary propose-terms/cancel/decline after accepted or completed; buyer can invoke decline. This bypasses accepted terms and reservation lifecycle.

**Source chain:** [backend/marketplace/views.py#L361-L408](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/blob/b77e9fd296bc2710350ef6f3cd402ce2529ffc06/backend/marketplace/views.py#L361-L408); [backend/marketplace/models.py#L223-L258](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/blob/b77e9fd296bc2710350ef6f3cd402ce2529ffc06/backend/marketplace/models.py#L223-L258); [backend/marketplace/services.py#L39-L80](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/blob/b77e9fd296bc2710350ef6f3cd402ce2529ffc06/backend/marketplace/services.py#L39-L80).

**Evidence:** ExchangeAction confirms two parties without checking source state; only expected_version checked. Can transition COMPLETED without accept_exchange/reservation. No database state transition constraint.

**Missing negative/positive regression:** Create ENQUIRY, have both parties confirm-completion before seller accepts; assert 409, zero reservation, unchanged state. Decline/propose after COMPLETED must be denied.

**Classification:** DIRECT source path; needs HTTP test; status SOURCE-FINDING (not reproduced; not fixed).

### B25 — P1 — Marketplace listings

**Gap:** ListingAudience saves current circle and bumps listing.version before validating every requested schedule item. Invalid later schedule returns 400 after persistent state mutation.

**Source chain:** [backend/marketplace/views.py#L199-L230](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/blob/b77e9fd296bc2710350ef6f3cd402ce2529ffc06/backend/marketplace/views.py#L199-L230); [backend/marketplace/models.py#L128-L152](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/blob/b77e9fd296bc2710350ef6f3cd402ce2529ffc06/backend/marketplace/models.py#L128-L152).

**Evidence:** No transaction.atomic around ListingAudience.post; audience.save and listing.save precede for schedule validation; DRF ValidationError does not roll back without an explicit transaction.

**Missing negative/positive regression:** Submit a currently valid audience and schedule with invalid second target; expect 400 and assert circle, maximum, version and escalation rows unchanged.

**Classification:** DIRECT; needs HTTP test; status SOURCE-FINDING (not reproduced; not fixed).

### B26 — P1 — Ethical marketplace

**Gap:** EthicalListing draft is persisted before checking lot selection, lot ownership and available quantities; invalid listing create can leave orphan or partially allocated regulated-stock drafts.

**Source chain:** [backend/ethical_marketplace/views.py#L281-L319](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/blob/b77e9fd296bc2710350ef6f3cd402ce2529ffc06/backend/ethical_marketplace/views.py#L281-L319); [backend/ethical_marketplace/serializers.py#L48-L76](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/blob/b77e9fd296bc2710350ef6f3cd402ce2529ffc06/backend/ethical_marketplace/serializers.py#L48-L76).

**Evidence:** Ethical Listings.post serializer.save() happens before if not allocations and before per-lot ValidationError; no transaction.atomic wraps entire POST.

**Missing negative/positive regression:** POST with no lots, foreign lot, insufficient quantity or bad second lot; confirm 400/404 and no persisted EthicalListing or EthicalListingLot rows.

**Classification:** DIRECT; needs HTTP test; status SOURCE-FINDING (not reproduced; not fixed).

### B27 — P1 — Workforce timesheets

**Gap:** TimesheetPeriod creation rejects inverted/overlong date ranges but allows overlapping ranges for same pharmacy, while payroll manifests can each represent the same attendance/roster minutes.

**Source chain:** [backend/workforce/views.py#L636-L682](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/blob/b77e9fd296bc2710350ef6f3cd402ce2529ffc06/backend/workforce/views.py#L636-L682); [backend/workforce/models.py#L271-L314](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/blob/b77e9fd296bc2710350ef6f3cd402ce2529ffc06/backend/workforce/models.py#L271-L314); [backend/workforce/timesheet_builder.py#L39-L67](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/blob/b77e9fd296bc2710350ef6f3cd402ce2529ffc06/backend/workforce/timesheet_builder.py#L39-L67).

**Evidence:** Only exact (pharmacy,start_date,end_date) unique constraint; get_or_create does not test intersection with existing periods; per-period build references same underlying dates.

**Missing negative/positive regression:** Create two overlapping date windows for one pharmacy; assert business rejects overlap or proves unique payable assignment across both locked manifests.

**Classification:** DIRECT overlap; duplicate-payout impact conditional; status SOURCE-FINDING (not reproduced; not fixed).

### B28 — P1 — Timesheet controls

**Gap:** Timesheet check decision path allows new resolved/waived decision on a check belonging to an already LOCKED period without correction/reopen process.

**Source chain:** [backend/workforce/timesheet_transitions.py#L89-L128](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/blob/b77e9fd296bc2710350ef6f3cd402ce2529ffc06/backend/workforce/timesheet_transitions.py#L89-L128); [backend/workforce/timesheet_transitions.py#L133-L234](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/blob/b77e9fd296bc2710350ef6f3cd402ce2529ffc06/backend/workforce/timesheet_transitions.py#L133-L234); [backend/workforce/timesheet_checks.py#L127-L153](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/blob/b77e9fd296bc2710350ef6f3cd402ce2529ffc06/backend/workforce/timesheet_checks.py#L127-L153).

**Evidence:** decide_check checks manager permission, forbidden codes and reason; does not check period.status==LOCKED or lock TimesheetPeriod. Locked manifests are meant to freeze approved evidence.

**Missing negative/positive regression:** Lock a period containing warning/check, POST resolved or waived decision; expect denial and unchanged check decisions/hash, except via explicit correction.

**Classification:** DIRECT; downstream compliance impact conditional; status SOURCE-FINDING (not reproduced; not fixed).

### B29 — P0 — Attendance/offline kiosk

**Gap:** Signed offline event integrity flags for clock-anchor drift, backward time, monotonic rollback and seven-day server drift mark evidence NEEDS_REVIEW but still call live attendance mutation, so suspect timestamps can create normal AttendanceSessions.

**Source chain:** [backend/attendance/protocol.py#L74-L108](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/blob/b77e9fd296bc2710350ef6f3cd402ce2529ffc06/backend/attendance/protocol.py#L74-L108); [backend/attendance/protocol.py#L245-L308](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/blob/b77e9fd296bc2710350ef6f3cd402ce2529ffc06/backend/attendance/protocol.py#L245-L308); [backend/attendance/transitions.py#L36-L128](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/blob/b77e9fd296bc2710350ef6f3cd402ce2529ffc06/backend/attendance/transitions.py#L36-L128); [backend/attendance_tests/test_kiosk_offline_protocol.py#L236-L250](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/blob/b77e9fd296bc2710350ef6f3cd402ce2529ffc06/backend/attendance_tests/test_kiosk_offline_protocol.py#L236-L250).

**Evidence:** blocking_flags only includes SEQUENCE_GAP, HASH_CHAIN_MISMATCH, UNEXPECTED_INITIAL_HASH and DEVICE_REVOKED_DRAIN; non-blocking time-integrity flags still permit _apply_business_event, even though row processing_status NEEDS_REVIEW.

**Missing negative/positive regression:** Sign clock-in with 8-day old timestamp or anchored +10 minutes; assert needs_review, retained signed evidence and zero live attendance event/session until reviewed. Confirm valid offline control.

**Classification:** DIRECT in source; whether intended reconciliation permits provisional attendance requires product decision; status SOURCE-FINDING (not reproduced; not fixed).

### B30 — P1 — Notification privacy

**Gap:** Established notification WebSocket stays subscribed to user group after logout, user deactivation or credential revocation; consumer sends notification and message badge events without checking current account/session eligibility.

**Source chain:** [backend/notifications/consumers.py#L9-L60](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/blob/b77e9fd296bc2710350ef6f3cd402ce2529ffc06/backend/notifications/consumers.py#L9-L60); [backend/notifications/services.py#L31-L90](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/blob/b77e9fd296bc2710350ef6f3cd402ce2529ffc06/backend/notifications/services.py#L31-L90); [backend/users/api_account.py#L76-L103](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/blob/b77e9fd296bc2710350ef6f3cd402ce2529ffc06/backend/users/api_account.py#L76-L103).

**Evidence:** Authentication checked once on connect; subsequent notification_created, updated, counter and message_badge send without reauthentication, while account deletion revokes tokens but does not broadcast channel disconnect.

**Missing negative/positive regression:** Connect via real ASGI ticket, deactivate/delete user while socket stays connected; send new notification and assert no contents delivered / socket closed.

**Classification:** DIRECT session lifetime; needs Channels regression; status SOURCE-FINDING (not reproduced; not fixed).

### B31 — P1 — Ethical transfer concurrency

**Gap:** Ethical listing request verifies PUBLISHED status before transaction but never locks/rechecks listing inside it; two concurrent requests can create two active transfers for one single-reservation listing if they reserve different available lots.

**Source chain:** [backend/ethical_marketplace/views.py#L350-L416](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/blob/b77e9fd296bc2710350ef6f3cd402ce2529ffc06/backend/ethical_marketplace/views.py#L350-L416); [backend/ethical_marketplace/models.py#L227-L286](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/blob/b77e9fd296bc2710350ef6f3cd402ce2529ffc06/backend/ethical_marketplace/models.py#L227-L286).

**Evidence:** ListingRequests.post get_object_or_404(status=PUBLISHED) before transaction.atomic; atomic locks only stock lots, not listing. EthicalTransfer and EthicalReservation schema enforce line uniqueness but not one active transfer per listing.

**Missing negative/positive regression:** Two simultaneous requests against same published multi-lot listing, distinct lot selections; require at most one accepted reservation/transfer and correct stock counts.

**Classification:** CONDITIONAL concurrency; requires PostgreSQL interleaving proof; status SOURCE-FINDING (not reproduced; not fixed).

### B32 — P1 — Offline attendance assignment semantics

**Gap:** The signed kiosk event field is named shift_id but is forwarded as assignment_id; an explicitly supplied ID shortcut accepts an assignment regardless of event-date shift window, potentially linking old assignments as current attendance.

**Source chain:** [backend/attendance/protocol.py#L102-L122](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/blob/b77e9fd296bc2710350ef6f3cd402ce2529ffc06/backend/attendance/protocol.py#L102-L122); [backend/attendance/eligibility.py#L115-L145](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/blob/b77e9fd296bc2710350ef6f3cd402ce2529ffc06/backend/attendance/eligibility.py#L115-L145); [backend/attendance/transitions.py#L36-L128](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/blob/b77e9fd296bc2710350ef6f3cd402ce2529ffc06/backend/attendance/transitions.py#L36-L128).

**Evidence:** _apply_business_event passes shift_id as assignment_id; _find_matching_assignment with explicit ID returns candidate unless draft, skipping temporal window applied when no explicit ID.

**Missing negative/positive regression:** Past assignment, then signed offline event with matching ID outside work window; assert no non-provisional CONFIRMED_ASSIGNMENT and reconcile intended shift vs assignment IDs.

**Classification:** DIRECT mismatch/date bypass; operational impact conditional; status SOURCE-FINDING (not reproduced; not fixed).


## Senior scope controls and priority

- P0 candidate: B24 marketplace transaction integrity and B29 clock-integrity mutation. **P0 denotes impact if exercised, not a verified exploitable security incident.**
- High-impact conditional: B31 multi-request concurrency must be reproduced in a real PostgreSQL transaction interleaving; don't call it a confirmed duplicate transaction without that test.
- Relevant existing tests were inspected: marketplace/tests.py and test_listing_policy.py; ethical_marketplace/tests.py and test_finalisation.py; workforce/tests/test_timesheet_state_machine.py; attendance_tests/test_kiosk_offline_protocol.py. Their covered paths do **not** establish the new negative-case outcomes; existing pass status cannot be reused as evidence.
- Tracked software domains not yet independently reviewed this wave: deeper invoicing/worker-finance payment results, additional user/onboarding security, roster publication, public-hub media, remaining authorization and frontend/UI flows. Continue finding newly evidenced risks there.
- Do not modify backend, frontend, Expo, shared-core, database or production. Keep PR #200 draft and do not merge it as production approval.
