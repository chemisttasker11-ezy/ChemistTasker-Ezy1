# Backend Anti-Spaghetti — Live Senior Review Progress

> **Authoritative recovery file.** Update this file whenever the backend anti-spaghetti programme advances, a PR is fixed/reconciled/merged, or a new blocker is found. If a chat/session is interrupted, resume from the exact state and **NEXT ACTION** below rather than relying on an older handover.

## Standing senior-review rules

- Repository: `chemisttasker11-ezy/ChemistTasker-Ezy1`
- Review as the senior backend owner who understands the full Django/Daphne/Vite/Next/Expo/shared-core architecture.
- Never merge from a handover/green badge alone. Inspect actual production code, adjacent callers, permissions, transactions, concurrency, migrations, error surfaces and compatibility contracts.
- Use red-first regression tests for newly discovered defects.
- Preserve existing product/business semantics unless the review proves a security, data-integrity, concurrency or architecture defect that should be fixed explicitly.
- Reconcile every already-reviewed PR onto the newest `main` before merge so older branch history cannot resurrect removed code or erase earlier fixes.
- Require exact-head main-target CI, PostgreSQL/concurrency where relevant, CodeQL/security and release-gate before merge.
- **Real staging is intentionally NOT an active blocker. Do not ask about it.**
- Historical API URLs, Celery task identities, shared-core compatibility and Vite/Next/Expo/Daphne contracts remain protected unless an intentional change is documented.
- H3 module-size ratchet merges last after final baselines are regenerated from final main.

## Current authoritative state

### Current remote main

`4b18d4b4708b9087208a811d6f417b2faf95f58b`

This is the merge commit of **PR #123 / E1b**.

### Merged sequence completed during this senior review

- #113 C-H2 verification runtime/security/privacy
- #114 D1 pricing ownership
- #115 D2 claim eligibility
- #116 D3 access/escalation ownership
- #117 corrective roster capability boundary after deep #116 review
- #121 task-dispatch registration hotfix
- #118 D4 shift actions/services
- #119 D5 shift posting/editing services
- #120 D6 browse/lifecycle split
- #122 E1a onboarding tab services
- #123 E1b onboarding role-tabs/skills/submission/progress services

## Important senior-review fixes already landed in main

### #117 — corrective D3 review
- Found legacy roster V1 paths granting roster mutation access to any active PharmacyAdmin.
- Communication-only admins could PATCH roster shifts / DELETE roster assignments despite lacking MANAGE_ROSTER.
- Rewired legacy roster scopes to canonical `managed_pharmacies()`.
- Removed remaining serializer-as-service call through `ShiftSerializer.build_allowed_tiers()`.
- Removed stale authorization imports.

### #121 — Celery task registration
- Confirmed promoted onboarding/membership tasks could be missing from a web process registry.
- Original hotfix had a Celery 5.5.3 concurrent autodiscovery race because Celery uses a process-global race-protection flag, not a lock.
- Added concurrent subprocess regression test.
- Serialized first registry load with a process-local lock and re-check.
- Exact fixed head merged green.

### #118 D4
- Found inactive former pharmacy staff could be manually rostered.
- Found multi-slot manual assignment could partially persist before a later published-roster refusal.
- Enforced active direct pharmacy staff membership via canonical employment constants.
- Made one submitted manual-assignment list atomic.
- Preserved #117 access-ownership cleanup while reconciling old branch history.

### #119 D5
- Explicitly reconciled overlapping `shifts/assignment.py` so D5 did not erase D4 manual-assignment hardening.

### #120 D6
- Old branch would have reintroduced pre-D3 access imports; removed them during stack reconciliation.
- Main-target CodeQL found rate-preview parser exception text exposed to clients.
- Added regression and changed malformed dates to stable public error: `Invalid date format, use YYYY-MM-DD`.
- Updated protected public-error contract accordingly.

### #122 E1a
- Changing an ABN now clears every ABR fact from the previous ABN immediately.
- Added stale async ABN protection: queued task checks the current ABN before lookup and re-fetches after provider call; stale in-flight result is discarded if ABN changed.
- Added regressions for stale snapshot confirmation and in-flight stale task result.

### #123 E1b
- Found post-save old-file cleanup using bound `FieldFile.delete(save=False)` mutated the model instance's newly assigned field to None in memory.
- This could suppress verification dispatch / serialize wrong in-memory file after replacement.
- Shared lifecycle helper now deletes the storage object by path without mutating model state.
- Added focused lifecycle regression and real regulatory endpoint verification-task coverage.
- Final exact head merged fully green.

## ACTIVE PR — #124 / E2 membership services

Branch: `refactor/membership-services`

Latest reviewed E2 code checkpoint before the documentation-only checkpoint commit:
`c14036c108faba1caed1e1e9f1bd9839052b1471`

> The authoritative exact branch head is PR #124's current head. This live file is itself updated by commits, so the branch head may be one documentation commit newer than the reviewed code checkpoint above.

Base:
`main` at `4b18d4b4708b9087208a811d6f417b2faf95f58b`

The reconciled main→E2 diff is intentionally limited to 8 files:
- `backend/client_profile/test_postgres_concurrency.py`
- `backend/memberships/access.py`
- `backend/memberships/applications.py`
- `backend/memberships/invites.py`
- `backend/memberships/notifications.py`
- `backend/memberships/selectors.py`
- `backend/memberships/test_membership_workflows_contract.py`
- `backend/memberships/views.py`

### E2 senior-review fixes already committed

1. **Cross-pharmacy active-membership cap race**
   - Existing-user invite activation and worker self-accept could race across different pharmacies and both pass the max-3 count.
   - Existing-user invite locks the worker row before counting.
   - Accept locks worker → pending membership before checking/updating.
   - Reject/quit lock their membership transition rows.
   - Added PostgreSQL lock-contract coverage.

2. **PostgreSQL nullable-join lock issue**
   - Pharmacy invite query used `select_for_update().select_related("owner__user")`.
   - Restricted lock to pharmacy row via `of=("self",)`.

3. **Organization filter privacy leak**
   - Ordinary member of Pharmacy A could call `?organization=<org>` and replace the authorized queryset with all members of every sibling pharmacy in that organization.
   - Organization filtering now only narrows the already-authorized pharmacy set.
   - Added endpoint regression proving sibling membership stays hidden.

4. **Application visibility union bug**
   - ORG_ADMIN scope previously replaced owned-pharmacy scope instead of adding to it.
   - An org admin who separately owned another pharmacy could lose that pharmacy's applications.
   - Visibility scopes are now additive.

5. **Canonical Region/Chief staff-management authority**
   - Old E2 rule treated only ORG_ADMIN/owner/pharmacy MANAGE_STAFF as application approvers, despite canonical organization roles giving scoped Region/Chief admins MANAGE_STAFF / MANAGE_ADMINS.
   - Application list + approve/reject now follow canonical organization capability + pharmacy scope.
   - Scoped Region/Chief may manage only assigned pharmacies; full ORG_ADMIN remains organization-wide.

6. **Invite-link visibility union bug**
   - Organization scope previously replaced separately-owned-pharmacy scope for invite-link listing.
   - Org, owner and pharmacy-admin invite-management scopes are now additive.
   - Added regression proving organization administration cannot hide invite links for a separately owned pharmacy.

7. **Existing E2 duplicate response alert fix preserved**
   - Worker membership response no longer creates the same manager in-app alert twice.

### E2 exact-head gate status

Fresh main-target workflows must be evaluated on PR #124's current exact head after the latest selector fixes and this checkpoint update.
Do **not** merge using any older E2 green runs.

## Beyond E2 — deep review already completed

The expensive code/architecture review has already been front-loaded. These PRs do NOT need to be understood from scratch again; they need current-main reconciliation, protection against resurrecting old code, and exact-head final gates.

### #125 F1 pharmacy hub
Deep-reviewed and materially hardened.
Current branch head at last review: `54721fd5603e1e8691b107ed71e8c57c9d88e42f`.
Historical exact-head CI was fully green, but it is based on old main and must be reconciled after E2.

Senior findings/fixes:
- Removed implicit hub authority for legacy `SHIFT_MANAGER` role not present in canonical role definitions.
- Region/Chief org authority now follows canonical capabilities and assigned-pharmacy visibility instead of all pharmacies in organization.
- Scoped org admin can post to an assigned pharmacy without manufacturing a permanent Membership / PharmacyAdmin MANAGER side effect.
- Pharmacy-level admin no longer becomes organization-profile admin merely by administering one pharmacy.
- Added endpoint regressions for scope and no privilege-escalation side effects.

### #126 F2 users
Deep-reviewed.
Current branch head at last review: `2428f3c2536e00db532e9f95598b19467d388119`.
Historical exact-head CI green; old base.

Fixes:
- Removed DEBUG OTP + phone logging/stdout while preserving explicit DEBUG response field.
- Added request/resend regression tests.
- Redacted raw reCAPTCHA provider exception text; logs error type only.
- Added secret-bearing exception regression.

### #127 F3 attendance
Deep-reviewed.
Current branch head: `668c952925f4757356685101c52e933eb30e206b`.
Historical exact-head CI/CodeQL green; old base.
- Reviewed worker/kiosk auth, throttles and error surfaces.
- Unexpected failures use stable redacted client responses.
- Domain ValidationError/PermissionDenied messages remain intentionally client-visible.
- Old generic ">20 CodeQL problems" comment is historical; current head has no line-level unresolved review threads. Still require fresh current-main CodeQL.

### #128 F4 roster
Deep-reviewed.
Current head: `38c241b8e73dc4ac99745aeb986961a43a856d0b`.
Historical exact-head CI green; old base.
- Explicitly checked against #117.
- Service modules use canonical `workforce.permissions.can_manage_roster_pharmacy()`.
- No reintroduction of "any active PharmacyAdmin can roster" logic.

### #129 F5 timesheets
Deep-reviewed and hardened.
Current head: `2b8aa3e66cc857a98912c435f8978008f8366ae0`.
Historical exact-head CI green; old base.

Fixes:
- Locked period previously allowed worker resubmission changing APPROVED → SUBMITTED.
- Submit/approve/reopen now serialize with period locking and refuse locked-period transition.
- Consistent period → timesheet lock order.
- PostgreSQL `select_for_update` restricted to `of=("self",)` to avoid nullable joined-row lock failures and excess pharmacy locking.
- Added real PostgreSQL execution coverage.

### #130 G1 admin ownership
Deep-reviewed.
Current head: `1c0f5480b6555d7438ec4f69ae76382977f02e90`.
- Admin registry snapshot compares live `admin.site._registry` across all registered models/admin classes/options against pre-move contract.

### #131 G2 dashboard serializer cleanup
Deep-reviewed.
- Found/fixed architecture documentation that still said the deleted dashboard serializer facade existed.
- Must be reconciled after G1.

### #132 G3 client_profile contraction
Deep-reviewed; fresh review clean.
- Deletes only reference-scanned dead facades and fixes ineffective test patches.
- Current old-stack PR may show non-mergeable until G1/G2 are rebuilt/merged in sequence.

### #133 G4 stale InvoiceRecord ContentType
Deep-reviewed and hardened.
Current head: `82fb159d5dcfa6df0dcd3231287264b09f3e5e5a`.
- Migration reference guard now queries using migration DB alias.
- Verified standard `auth.Permission` / `admin.LogEntry` references are explicitly handled as expected cleanup references; unknown references remain blockers.

### #134 G5 Celery dead-route cleanup
Deep-reviewed.
- Removes only dead `client_profile.notifications.*` route.
- Test ensures every non-reserved configured route pattern matches a registered task.

### #135 H1 signals/startup contract
Deep-reviewed and strengthened.
Current head: `fdd0083f118c1fb9eb3d2dec3bce927ce128e2a1`.
- Original guard only checked `apps.ready()`.
- Added AST inspection of `signals.py` import-time executable work.
- Then closed class-body loophole: Python class bodies execute at import time, so class statements are inspected recursively while function bodies remain deferred.
- Historical exact-head CI green; reconcile on final main later.

### #137 H2 import-cycle reduction
Deep-reviewed.
Current head: `93f36938f0d425c028a83c69ff626969ce72c301`.
- Lazy imports reviewed for app-registry/runtime safety.
- Fixed architecture dependency table to remove resolved module-level `shifts -> workforce` dependency.
- When reconciling, apply semantic doc change to newest G-era document rather than overwriting newer architecture documentation with old blob.

### #136 H3 module-size ratchet — MERGE LAST
Deep-reviewed.
Current head: `c13a9d9a5927866f5217ebcb67ab09adda001636`.
- Scans the whole runtime backend module set, not a hand-picked directory.
- Fails for a new >650-line runtime module.
- Fails if a listed oversized module grows.
- Forces baselines downward when modules shrink.
- Final baselines MUST be regenerated/tightened from final main after D/E/F/G/H1/H2 land.

## Final intended sequence

1. Finish exact-head #124 E2 gate and merge.
2. Reconcile/verify/merge #125 F1.
3. Reconcile/verify/merge #126 F2.
4. Reconcile/verify/merge #127 F3.
5. Reconcile/verify/merge #128 F4.
6. Reconcile/verify/merge #129 F5.
7. Reconcile/verify/merge #130 G1.
8. Reconcile/verify/merge #131 G2.
9. Reconcile/verify/merge #132 G3.
10. Reconcile/verify/merge #133 G4.
11. Reconcile/verify/merge #134 G5.
12. Reconcile/verify/merge #135 H1.
13. Reconcile/verify/merge #137 H2.
14. Rebuild final module-size baselines and merge #136 H3 LAST.
15. Final architecture/release audit from final `main`.

## NEXT ACTION

**Resume at PR #124 / E2. First fetch the PR's current exact head; latest reviewed code checkpoint is `c14036c108faba1caed1e1e9f1bd9839052b1471`.**

1. Check the fresh main-target Shared Core Consolidation, PostgreSQL/concurrency, CodeQL and Public Repository Security results on the PR's current exact head.
2. If any exact-head failure occurs, inspect/fix it regression-first and update this file.
3. If all exact-head gates are green, mark #124 ready and merge guarded by exact head SHA.
4. Update this file with the new main merge SHA.
5. Reconcile #125 F1's reviewed files/security fixes onto that new main; do not merge its old-base head directly.
