# PR #200 — Discovery wave 4: first 48 full-file read and cross-path verification

Frozen main: `b77e9fd296bc2710350ef6f3cd402ce2529ffc06`. Date 25 October 2026 (Brisbane). Source paths in the queued 538 manifest were individually fetched via connected GitHub at immutable main and each returned blob SHA compared with manifest. **48/538 complete files read, SHA verified, signature triaged; 6 new source risks B35–B40**. Additional cross-file and existing-test reading does NOT count toward the 538 unless separately present in the ledger. This is not 25% senior manual review, and GitHub Actions static scan is a different evidence class.

## B35 — P0 candidate — Roster-create cross-tenant writes

**Source finding:** RosterOwnerViewSet is an authenticated ModelViewSet with pharmacy-filtered get_queryset but default create/perform_create; RosterAssignmentSerializer exposes writable user/slot/shift FKs. Create does not enforce that the selected assignment belongs to managed_pharmacies. Direct POST may create an assignment into an unrelated pharmacy.

**Evidence:** [backend/workforce/roster/views.py#L44-L101](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/blob/b77e9fd296bc2710350ef6f3cd402ce2529ffc06/backend/workforce/roster/views.py#L44-L101); [backend/workforce/roster/serializers.py#L37-L63](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/blob/b77e9fd296bc2710350ef6f3cd402ce2529ffc06/backend/workforce/roster/serializers.py#L37-L63); [backend/workforce/roster/urls.py#L29-L42](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/blob/b77e9fd296bc2710350ef6f3cd402ce2529ffc06/backend/workforce/roster/urls.py#L29-L42).

**Missing negative and positive test:** As user controlling only pharmacy A, POST roster-owner with shift and slot of pharmacy B; require 403 and zero B records; test allowed A creation.

**Status:** SOURCE-FINDING, not reproduced or fixed. Priority is anticipated business impact, not proven exploit severity.

## B36 — P0 candidate — Roster-shift cross-tenant writes

**Source finding:** RosterShiftManageViewSet is a ModelViewSet with a managed-only read queryset; default POST invokes ShiftSerializer.create which reads a globally writable Pharmacy field. The create path calls post_shift without owner-scoped validation. A user with a valid login may post a shift for a pharmacy outside their management scope.

**Evidence:** [backend/workforce/roster/views.py#L126-L145](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/blob/b77e9fd296bc2710350ef6f3cd402ce2529ffc06/backend/workforce/roster/views.py#L126-L145); [backend/shifts/serialization/shifts.py#L45-L63](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/blob/b77e9fd296bc2710350ef6f3cd402ce2529ffc06/backend/shifts/serialization/shifts.py#L45-L63); [backend/shifts/serialization/shifts.py#L275-L329](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/blob/b77e9fd296bc2710350ef6f3cd402ce2529ffc06/backend/shifts/serialization/shifts.py#L275-L329).

**Missing negative and positive test:** Authenticated stranger POST /api/v1/roster-shifts/ with another pharmacy PK, valid shift and slots; require 403 no Shift/Slot, and managed owner positive control.

**Status:** SOURCE-FINDING, not reproduced or fixed. Priority is anticipated business impact, not proven exploit severity.

## B37 — P1 candidate — Worker roster disclosure

**Source finding:** RosterWorkerViewSet.get_queryset includes all assignments in pharmacies with is_active membership, but does not require status ACCEPTED or exclude CONTACT memberships. An active pending/rejected or contact-only membership could reveal other workers' assignments, email and compensation through RosterAssignmentSerializer.

**Evidence:** [backend/workforce/roster/views.py#L533-L626](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/blob/b77e9fd296bc2710350ef6f3cd402ce2529ffc06/backend/workforce/roster/views.py#L533-L626); [backend/workforce/roster/serializers.py#L13-L60](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/blob/b77e9fd296bc2710350ef6f3cd402ce2529ffc06/backend/workforce/roster/serializers.py#L13-L60); [backend/workforce/roster/serializers.py#L63-L121](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/blob/b77e9fd296bc2710350ef6f3cd402ce2529ffc06/backend/workforce/roster/serializers.py#L63-L121).

**Missing negative and positive test:** Create active PENDING and CONTACT memberships for user A at pharmacy B; request roster-worker and assert other people's assignments, emails/rates/timesheets are absent. Confirm accepted employed staff behavior.

**Status:** SOURCE-FINDING, not reproduced or fixed. Priority is anticipated business impact, not proven exploit severity.

## B38 — P1 candidate — Roster assignment overwrite

**Source finding:** RosterShiftManageViewSet.update explicitly permits user_id to update_or_create each ShiftSlotAssignment after serializer update; it does not apply an existing-assignment history or timesheet lock before changing assigned user. Source accepts replacement through an unpublish/edit path; completed or invoice-linked assignment may be overwritten or fail inconsistently.

**Evidence:** [backend/workforce/roster/views.py#L144-L230](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/blob/b77e9fd296bc2710350ef6f3cd402ce2529ffc06/backend/workforce/roster/views.py#L144-L230); [backend/workforce/tests/test_roster_slot_http_contract.py#L54-L165](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/blob/b77e9fd296bc2710350ef6f3cd402ce2529ffc06/backend/workforce/tests/test_roster_slot_http_contract.py#L54-L165); [backend/workforce/roster/serializers.py#L37-L63](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/blob/b77e9fd296bc2710350ef6f3cd402ce2529ffc06/backend/workforce/roster/serializers.py#L37-L63).

**Missing negative and positive test:** Create accepted/previously-worked or invoice-linked assignment; PATCH user_id after permitted unpublish and ensure no historical reassignment, no side effects; verify duplicate/rollback.

**Status:** SOURCE-FINDING, not reproduced or fixed. Priority is anticipated business impact, not proven exploit severity.

## B39 — P1 candidate — Rate default destructive update

**Source finding:** sync_pharmacy_rate_defaults sets six pharmacy rate fields to None when apply_rates_to_pharmacy is true but caller omits those fields; the function does not distinguish absent keys from explicit clears. An unrelated shift edit can silently erase saved rate defaults.

**Evidence:** [backend/shifts/posting.py#L215-L265](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/blob/b77e9fd296bc2710350ef6f3cd402ce2529ffc06/backend/shifts/posting.py#L215-L265); [backend/shifts/posting.py#L104-L130](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/blob/b77e9fd296bc2710350ef6f3cd402ce2529ffc06/backend/shifts/posting.py#L104-L130); [backend/shifts/serialization/shifts.py#L307-L342](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/blob/b77e9fd296bc2710350ef6f3cd402ce2529ffc06/backend/shifts/serialization/shifts.py#L307-L342).

**Missing negative and positive test:** Save pharmacy with weekday/weekend/holiday defaults; post/edit shift with apply_rates_to_pharmacy=true and incomplete rate payload; omitted defaults must survive or be explicitly cleared; check both APIs.

**Status:** SOURCE-FINDING, not reproduced or fixed. Priority is anticipated business impact, not proven exploit severity.

## B40 — P1 candidate — Booking eligibility stale verification

**Source finding:** onboarding verification evaluate preserves was_verified when base checks are missing except for specified AHPRA adverse states; the booking and availability gates may rely on profile.verified. This is a conditional authorization lapse if mobile/email verification is revoked by a pathway not explicitly clearing profile.verified.

**Evidence:** [backend/onboarding/verification/policy.py#L49-L116](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/blob/b77e9fd296bc2710350ef6f3cd402ce2529ffc06/backend/onboarding/verification/policy.py#L49-L116); [backend/marketplace/policy.py#L60-L95](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/blob/b77e9fd296bc2710350ef6f3cd402ce2529ffc06/backend/marketplace/policy.py#L60-L95); [backend/talent/views/explorer.py#L112-L148](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/blob/b77e9fd296bc2710350ef6f3cd402ce2529ffc06/backend/talent/views/explorer.py#L112-L148).

**Missing negative and positive test:** Revoke OTP/mobile after previously verified state without changing onboarding evidence; ensure public shift/talent access fails. Confirm all active revocation callers update verified or check user status independently.

**Status:** SOURCE-FINDING, not reproduced or fixed. Priority is anticipated business impact, not proven exploit severity.

## Scope and verification

The 48 completed initial reads cover backend finance, onboarding, roster management, permissions and marketplace policies. B01–B34 remain frozen and were not counted again. Read-only automated scan of 538 selected sources is separately scheduled in PR200 workflow and must not be mistaken for the human source trace above. Some issues, notably B38/B40, are conditional and require full caller/test checks before being promoted to launch blockers. No application code changed.
