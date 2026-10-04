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

### Current code-bearing main checkpoint

`cd8c6d4e319d0c6ca1109fb10b67fba02b1c9b21`

This is the merge commit of **PR #130 / G1 domain-admin ownership split**.

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
- #124 E2 membership services
- #125 F1 Pharmacy Hub split + senior identity/scope/atomicity/storage hardening
- #126 F2 users split + privacy/delivery/OTP/storage/directory hardening
- #127 F3 attendance split + scoped kiosk-pairing authorization projection fix
- #128 F4 roster services split
- #129 F5 timesheet split + PostgreSQL lock-order/locked-manifest/read-only hardening
- #130 G1 domain-admin ownership split + focused admin-registry contract

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

## COMPLETED — #125 / F1 pharmacy hub split

Branch: `refactor/pharmacy-hub-split`

Latest reconciled code checkpoint before this documentation commit:
`b96438c52824ab9b079cefa5ba95bf4c2e5c7d9c`

Base:
`main` at `230396de7aabf649bf20ce347e702267d03cb4a4`

The post-E2 reconciliation began as the 13 reviewed F1 files. Senior E2-integration review then intentionally added `pharmacy_hub/serializers.py` and `pharmacy_hub/test_api.py` for the poll human-identity fix, plus this progress document. The original 13-file overlay remains conflict-safe: none changed on main after F1 branched and E2 touches none of them.

### F1 senior-review fixes already committed

1. Hub organization authority now follows canonical `users.org_roles` capabilities and pharmacy scope instead of hard-coded role-name shortcuts.
2. Legacy `SHIFT_MANAGER` receives no implicit hub administration.
3. Region/Chief admins can manage only assigned pharmacy hubs.
4. Scoped org authors do not manufacture a Membership or PharmacyAdmin MANAGER side effect merely to create a hub post.
5. Pharmacy-level admins retain pharmacy-profile authority but do not become organization-profile admins.
6. Control-plane hub authoring (owner/pharmacy admin/org admin) is now side-effect free when no real Membership exists: posts/polls/comments use the explicit user author instead of manufacturing/reactivating Membership or PharmacyAdmin state.
7. Regression coverage proves a LEFT membership remains LEFT/inactive and no PharmacyAdmin is created when an ORG_ADMIN authors a pharmacy-hub post.
8. Poll voting is now stable across User ↔ Membership identity changes. A person who voted while membership-less cannot gain a second vote after receiving a Membership; read state (`has_voted`, `selected_option_id`) follows the same human identity.
9. Vote writes serialize on the User row and collapse any historical user-keyed/membership-keyed duplicate rows on the next vote, repairing materialized option counts without a schema migration.
10. Platform/user-keyed poll creator ownership is now stable. Poll management recognizes either `created_by=User` or historical `created_by_membership`, so a membership-less platform creator can edit/delete their own poll.
11. Endpoint regressions pin allowed/denied scope, side-effect-free control-plane authoring, vote identity continuity and user-keyed creator ownership.
12. Deep exact-head review found the same User ↔ Membership identity-transition defect in post/comment reactions: a person could react while membership-less, later gain a Membership, then create a second materialized reaction; delete removed only the current identity row.
13. Added red-first post/comment reaction identity regressions. Reaction writes now serialize on the User row, reuse one human reaction, collapse historical user/member duplicates, and recompute summary counts. Deletes remove every representation of the same human identity.
14. Serializer `viewer_reaction` now resolves by human identity (`user_id` OR `member__user_id`) so read state remains stable across Membership creation.
15. PostgreSQL review caught a nullable-join row-lock hazard in reaction identity repair. Reaction rows now use `select_for_update(of=("self",))` while the User row remains the serialization lock, avoiding PostgreSQL attempts to lock the nullable Membership join.
16. Side-effect-free user-keyed control-plane posts exposed a mention-notification regression: tag notifications derived the author only from `author_membership`, producing “A teammate” and failing self-author identity checks. Added regression and fallback to `post.author_user`.
17. Deep scope review found stale creator authority in community groups: `created_by` alone could bypass current pharmacy authorization, so a former owner/admin/scoped org admin who created a group could retain group-admin access after their pharmacy authority was removed.
18. Added a red-first regression using a Region Admin who is assigned the pharmacy, creates a group, then loses that assignment; `group_scope` must deny after scope removal.
19. Group creator status is now informational only. Access requires current pharmacy-level admin authority or an active staff group Membership; management requires current pharmacy admin authority or an active group Membership marked admin.
20. Removed the same stale `created_by` shortcut from group permission projection/serialization. A former scoped admin who later remains only ordinary staff sees `is_admin=false` and receives 403 on mutation instead of a misleading admin UI state.
21. Group update review found a partial-persistence bug: `super().update()` saved name/description before replacement `member_ids` were domain-validated, so an invalid request could return 400 after changing the group.
22. Added a red-first atomicity regression. Replacement memberships are now resolved before writes, the update runs inside `transaction.atomic()`, and the group row plus existing membership-link rows are locked so concurrent edits cannot interleave or escape serialization when the group initially has no links.
23. Context/resolver contract review found an owner projection mismatch: `organization_scope` authorizes a pharmacy owner to manage the containing organization profile, but Hub Context advertised `can_manage_profile=false`. Added a targeted owner regression and now derive that permission from the existing per-pharmacy `is_owner` authority while keeping `is_org_admin=false`.
24. Removed two unused lazy QuerySet assignments from organization member-count construction; the real per-organization distinct-user aggregation is unchanged.
25. Attachment review found request-level partial persistence: a multi-file create/update validated each file only while writing it, so a later invalid file could return 400 after the post or earlier attachments had already changed.
26. Added red-first create and update rollback regressions. The entire attachment batch is now validated before any post mutation; post + attachment DB writes run atomically.
27. Attachment add failure cleanup now handles both previously-created rows and the current unsaved/failed attachment object, covering the FileField case where storage write succeeds before a database insert fails.
28. Attachment removal previously bulk-deleted database rows without deleting storage objects. Removal now locks the selected attachment rows, deletes DB ownership inside the transaction, and schedules path-based storage deletion only after commit so rollback cannot strand a database reference to a missing file.
29. Hub Pharmacy/Organization profile cover replacement also leaked old storage objects. Added coverage for both endpoints and an F1-local profile cleanup mixin that deletes the old path after commit only when no live model reference remains.
30. Storage cleanup deliberately follows the E1b principle of deleting by captured storage path rather than mutating a bound FieldFile; no shared lifecycle module was changed in F1.
31. Multipart attachment removal had a cardinality bug: shared-core submits repeated `remove_attachment_ids` values, but the backend used `QueryDict.get()`, so only the last requested attachment was removed.
32. Added a two-attachment regression and switched removal parsing to `getlist()` when available, preserving plain mapping compatibility. One update now removes every requested attachment row and corresponding storage object.
33. Final exact-head gate on `f445d12103e1cd4e12fb6254a27226ea4d161996` passed security, both CodeQL languages, architecture, boundary, shared-core, PostgreSQL migration/concurrency, kiosk, mobile, Vite and Next, but backend domain tests exposed four F1 issues before merge.
34. One failure was a real availability defect: after the post DB transaction had committed, tagged-member email enqueue still propagated a Celery/Redis broker outage and turned a valid Hub post request into HTTP 500. Tag email dispatch is now best-effort with redacted exception-type logging; the durable in-app notification/post remain successful.
35. The broker regression is deterministic: the scope-contract test now forces `pharmacy_hub.posts.async_task` to fail and requires the post/notification path to remain successful.
36. The remaining backend failures were test-fixture corrections, not production semantics: the user-keyed platform-poll creator fixture is now OTP-verified as required by `platform_scope`, and profile-cover tests generate a real PNG through Pillow so DRF/ImageField validation exercises the intended replacement/cleanup path.
37. Because code changed after `f445d121`, all green results from that SHA are supporting evidence only. The new exact head after this checkpoint must pass the full main-target gate again before #125 is marked ready or merged.

### F1 final gate and merge

- Corrected exact head: `bb1fa390524b35cbd9767f1f4fd4f7367e148f57`.
- Base remained E2 main `230396de7aabf649bf20ce347e702267d03cb4a4`; final compare was `behind=0`, mergeable.
- Exact-head Public Repository Security: green.
- Exact-head CodeQL Python + JavaScript/TypeScript: green.
- Exact-head Shared Core Consolidation: boundary audit, architecture audit, shared-core, backend, PostgreSQL migration/concurrency, kiosk, mobile, Vite, Next and final release-gate all green.
- #125 was marked ready only after those exact-head jobs completed.
- Merge was SHA-guarded against `bb1fa390524b35cbd9767f1f4fd4f7367e148f57`.
- Merge commit / new main: `525e18e3592e6a18a321ee145791a6abff383e07`.
- Verified remote `main` is identical to that merge commit.

## COMPLETED — #126 / F2 users split

Original PR branch: `refactor/users-auth-split`

Live reviewed source head:
`7e3230c377b8c732c023a1788d4899007b560535`

Clean post-F1 reconciliation branch:
`reconcile/f2-users-post-f1-20261004`

Clean base:
`main` at `525e18e3592e6a18a321ee145791a6abff383e07`

### F2 reconciliation status

1. The progress file's earlier reviewed head `2428f3c2536e00db532e9f95598b19467d388119` was stale. The live PR advanced five commits to `7e3230c377b8c732c023a1788d4899007b560535`; those follow-up changes are intentional Region/Chief directory-scope hardening in `users/api_organizations.py` plus regressions in `users/test_region_delegation.py`.
2. Compared F2's old base `7e191332d5f959da37f95638a2fce5decbf02e87` to post-E2 main: none of the 14 `backend/users/*` F2 files changed on main. The only overlapping later-main file was the shared CI workflow.
3. Created `reconcile/f2-users-post-f1-20261004` directly from F1 merge main and overlaid the 14 live reviewed users-domain files from `7e3230c`.
4. Deliberately did **not** copy F2's stale workflow blob. Preserved the newest post-F1 workflow and applied only F2's intended one-line coverage expansion: `users.tests billing.tests` → `users billing.tests`.
5. PR #126 itself will be preserved. After reconciliation/hardening is complete, move `refactor/users-auth-split` atomically to the verified reconciliation head rather than merging old-base history.
6. Historical CI/CodeQL/security on `7e3230c` are green but are supporting evidence only; final verification must run on the reconciled exact head.

### F2 senior fixes committed on the reconciliation branch

1. Added `users.delivery.deliver_email_best_effort()` as one redacted failure boundary while preserving each caller's existing transport and Celery task identity.
2. Registration OTP, welcome e-mail, OTP resend, password reset, contact-support mail, account-deletion confirmation and organization invites no longer turn an already-persisted user action into HTTP 500 when the queue/broker is unavailable.
3. Password-reset and e-mail-OTP resend now remain non-enumerating during queue failure; known and unknown e-mails keep the same public response.
4. Account-deletion identity documents now clear database ownership inside the transaction and delete captured storage paths only after commit. A rollback keeps both the DB reference and physical file.
5. Account-deletion confirmation delivery is best-effort; a completed anonymisation/revocation remains HTTP 200 even if Celery/Redis is unavailable.
6. Mobile OTP send/resend share one provider helper with redacted status/error-type logging. Transport exceptions now return the same stable 502 as provider rejection.
7. Failed mobile OTP attempts restore the previous identity/mobile/OTP state only if that failed attempt is still current, using a row lock + expected code/timestamp compare so a newer concurrent request cannot be clobbered.
8. A failed SMS delivery therefore creates no false 60-second cooldown and an immediate retry is allowed.
9. Removed `OrganizationMembership` → fake CONTACT `Membership` synthesis from `for_hub/include_pharmacy_members` reads. The combined view now contains real pharmacy Membership rows only; organization-only control-plane identities stay in the normal organization-membership directory.
10. Updated the Region Admin regression to pin side-effect-free reads while preserving role/region/assigned-pharmacy visibility boundaries.
11. Added `users.test_delivery_resilience` with focused regressions for storage rollback, queue-failure non-enumeration, account-deletion queue failure, SMS provider rejection/transport exceptions and retry state.
12. An undelivered e-mail OTP resend now restores the prior OTP code/timestamp/failed-attempt state, guarded by row lock + expected code/timestamp so a concurrent newer resend cannot be overwritten.

### F2 preflight findings to harden regression-first

1. **Account-deletion file rollback safety.** `users/account_deletion.py` deletes verification files from storage with bound `FieldFile.delete(save=False)` while the database transaction is still open. A later rollback can restore database references after physical files are already gone. Rework to clear DB ownership transactionally, capture path/storage, and delete storage only after commit; follow the E1b path-based deletion principle.
2. **Account-deletion broker failure.** `DeleteAccountView` commits anonymisation/revocation and then enqueues its confirmation email. A Celery/Redis outage can return HTTP 500 after the account is already deleted. Confirmation delivery must be best-effort and must not reverse or misreport a completed deletion.
3. **Outbound-email failure boundary.** Registration, e-mail OTP verification/resend, password reset, contact submission, account deletion and organization invite can persist durable state before queuing e-mail. Production broker failure currently can propagate from `send_async_email()` / `async_task()`.
4. **Non-enumeration under queue outage.** Password reset and OTP resend intentionally return non-enumerating responses. If queueing fails only for a real account, known e-mails can currently diverge from unknown-account responses and leak account existence. Add explicit broker-failure non-enumeration regressions.
5. **Mobile OTP provider exceptions and false cooldown.** Request/resend persist the new OTP and timestamp before the SMS provider call. Non-200 delivery failure leaves a fresh cooldown despite no confirmed delivery; transport exceptions can currently escape as 500. Add redacted stable 502 handling and define rollback/clearing so a confirmed failure does not create a false retry cooldown.
6. **GET/list side effect in organization Hub directory.** `for_hub/include_pharmacy_members` can manufacture a CONTACT pharmacy Membership during a read. The live F2 follow-up correctly constrains that side effect to actor/target visible pharmacy scope, but current shared-core Hub member loading does not use `for_hub`; assess removing the read-time Membership synthesis entirely so F2 aligns with F1's explicit User-vs-Membership identity rules.
7. Compatibility façade check is clean: `users.views` still re-exports URL-exposed classes and historical helpers such as `_build_authenticated_user_payload`; current `users/urls.py` wildcard routing remains compatible.
8. PR #126 has no unresolved human review threads. Historical CodeQL clear-text OTP logging threads are resolved/outdated and their fixes are present.

### F2 final gate and merge

- Final exact head: `46cc7361485c787bdae1af8fadb10ac043c4f50c`.
- Base: F1 main `525e18e3592e6a18a321ee145791a6abff383e07`; final compare was `behind=0`, mergeable.
- Exact-head Public Repository Security: green.
- Exact-head CodeQL: green.
- Exact-head Shared Core Consolidation: full `users` package, boundary audit, architecture audit, shared-core, backend, PostgreSQL migration/concurrency, kiosk, mobile, Vite, Next and release-gate all green.
- The full users gate specifically passed the new `users.test_delivery_resilience` regressions and the side-effect-free Region Admin directory contract.
- #126 was marked ready only after the exact-head gates completed.
- Merge was SHA-guarded against `46cc7361485c787bdae1af8fadb10ac043c4f50c`.
- Merge commit / code-bearing main checkpoint: `c0e0cb4c4d2606f557b961773979cbf38020143c`.
- Verified remote `main` was identical to that merge commit before this documentation-only checkpoint.

## COMPLETED — #127 / F3 attendance split

Original PR branch: `refactor/attendance-api-split`
Final reviewed head: `e8061d0da4d60dc90bee8d65b8ab9a12a67920ec`
Merge commit: `82258451dc319f0a5d795cae93134f267c125c74`

### F3 final senior result

1. Reconciled from post-F2 main without old-base history; final head was `behind=0`.
2. Preserved historical attendance URLs and `attendance.views` re-export/patch/logging contracts.
3. Preserved the stable non-integer manager `pharmacy_id` 400 contract.
4. Fixed pairing-options projection so assigned CHIEF_ADMIN/REGION_ADMIN managers see only their assigned pharmacies while final authority remains with `is_authorized_kiosk_manager()`.
5. Added scoped pairing-options regression alongside existing kiosk-device authority tests.
6. Exact-head Public Repository Security: green.
7. Exact-head CodeQL Python + JavaScript/TypeScript: green.
8. Exact-head Shared Core Consolidation: architecture, boundary, shared-core, PostgreSQL concurrency, kiosk, mobile, Vite, Next, backend attendance/kiosk contracts, workforce/finance tail and final release-gate all green.
9. #127 was marked ready only after exact-head completion and merged with SHA guard `e8061d0da4d60dc90bee8d65b8ab9a12a67920ec`.

## COMPLETED — #128 / F4 roster services split

Original PR branch: `refactor/roster-services-split`
Final reviewed head: `c6bcb5fd29b893fbcf90dee7388321a27d0815d6`
Merge commit: `27a6fb36030edb7d0dc4c76e5c770e1293609326`

### F4 final senior result

1. Rebuilt cleanly from F3-merged main with exactly the nine reviewed roster-service files plus this progress document; final compare was `behind=0`.
2. Reconfirmed #117's canonical roster capability boundary. All roster-management mutations remain behind `is_authorized_attendance_manager()` / `can_manage_roster_pharmacy()`; no legacy “any PharmacyAdmin can roster” shortcut returned.
3. Historical `workforce.roster.services` façade preserved every live import.
4. Compared the monolith with extracted owner modules using top-level function boundaries: **26/26 moved functions are byte-identical**.
5. Exact-head Public Repository Security: green.
6. Exact-head CodeQL Python + JavaScript/TypeScript: green.
7. Exact-head Shared Core Consolidation: backend, PostgreSQL concurrency, shared-core, architecture, boundary, kiosk, mobile, Vite, Next and release-gate all green.
8. #128 was marked ready only after exact-head completion and merged with SHA guard `c6bcb5fd29b893fbcf90dee7388321a27d0815d6`.

## COMPLETED — #129 / F5 timesheet split

Original PR branch: `refactor/timesheets-split`
Reviewed source head: `2b8aa3e66cc857a98912c435f8978008f8366ae0`
Clean reconciliation branch: `reconcile/f5-timesheets-post-f4-20261004`
Clean base: `main` at `27a6fb36030edb7d0dc4c76e5c770e1293609326`

### F5 reconciliation and senior review

1. Rebuilt from post-F4 main without old-base history.
2. Eight timesheet split/test files had zero later-main overlap. The only overlapping file was `backend/client_profile/test_postgres_concurrency.py`; every E2 membership locking test was preserved and only the F5 timesheet imports/tests were added.
3. Historical `workforce.timesheets` façade preserves all 33 historical functions plus existing exported tolerance/engagement constants.
4. Function-body comparison against current main: **28/33 original functions are byte-identical**. The only changed functions are `ensure_period_timesheets`, `build_timesheet`, `submit_timesheet`, `approve_timesheet`, and `reopen_timesheet`; the only new functions are the two row-lock helpers.
5. Existing F5 hardening remains: submit/approve/reopen are atomic, lock period first then timesheet, re-read current state under lock, reject locked-period transitions, and restrict PostgreSQL row locks with `of=("self",)`.
6. PostgreSQL execution coverage with `membership=None` is preserved to prevent nullable outer-join lock regressions.
7. Senior preflight found an unresolved P1: `build_timesheet()` used a joined timesheet+period row lock whose acquisition order could oppose transition/period locking and deadlock under PostgreSQL.
8. Fixed builder lock order regression-first: builder now resolves the period, locks `TimesheetPeriod` first, then locks only the `Timesheet` row using `of=("self",)`; PostgreSQL query-order coverage proves period FOR UPDATE occurs before timesheet FOR UPDATE.
9. Senior review found a locked-manifest integrity gap: `build_timesheet()` only blocked a locked period when `force=True`, so a normal/direct build could still create a new revision or change live status after the manifest had been frozen.
10. Locked-period build regression added. **All** direct builds now reject a LOCKED period regardless of `force`.
11. `ensure_period_timesheets()` could also create a new worker Timesheet around/after final lock. It now serializes on the period row and becomes a no-op once the period is LOCKED; a regression proves a locked period cannot gain a new Timesheet through list/directory synchronization.
12. Normal pre-lock behavior is unchanged: manager recalculation/reopen/approval and worker submission continue as before; manager approval without prior worker submission remains the explicitly pinned current product behavior.
13. Post-lock correction is a separate product gap, not solved by rewriting the locked record. Web/mobile already tell users “later corrections require the adjustment workflow,” but no actual unlock/TimesheetAdjustment workflow exists in the repo. Senior direction: keep the original locked manifest immutable and implement future post-lock amendments as a new linked adjustment revision with actor/time/reason rather than an in-place unlock that rewrites audit/payroll history.
14. First exact-head PostgreSQL run on `ead17ae873b8ace6b00b5920b230510e6775b02f` exposed a **test matcher defect**, not a production locking defect: the assertion matched table names by substring, so `workforce_timesheet` also matched `workforce_timesheetperiod` and one period-lock query could be classified as both locks.
15. Tightened the PostgreSQL regression to identify lock acquisition by the query's exact `FROM <quoted_table>` base table. Senior review confirmed production builder code already locked period → timesheet correctly, so production code was intentionally left unchanged.
16. Because the assertion/documentation corrections changed the PR head, all prior green results are supporting evidence only. Fresh exact-head Shared Core/PostgreSQL/CodeQL/security must pass on the final head before merge.
17. Senior API integration review found a locked-read edge: `TimesheetDetailView.GET` auto-rebuilt manager-visible rows when `needs_rebuild=True`. Normal locking prevents that flag, but a stale legacy/manual flag on a LOCKED row would invoke the correctly rejecting builder from a GET and could surface as HTTP 500.
18. Added a red-first locked-detail regression. A LOCKED timesheet detail GET is now strictly read-only even with stale `needs_rebuild=True`: it returns the existing approved data, creates no revision and leaves the flag/status untouched. Explicit recalculate continues to return the locked-period validation error.
19. Fresh exact-head backend on `08a851ff08492c107bef6e37134f1a686287171d` reached Workforce/Finance and exposed a test-fixture error before exercising the new locked-directory assertion: the regression referenced `projection.User`, but the reused fixture module does not expose that name in the CI import context.
20. Corrected the regression to construct the extra worker through Django's `get_user_model()`. No F5 production code changed for this failure; prior PostgreSQL concurrency, CodeQL, security, architecture, boundary, shared-core, kiosk, mobile, Vite and Next evidence remains supporting-only until the new exact head passes the full final gate.
21. Final reviewed exact head: `7ae917dce3ce44087fb8b342f68bf473d9d24e4a`; final compare to F4 main was `behind=0`.
22. Exact-head Public Repository Security, CodeQL Python/JavaScript, shared-core, architecture, boundary, backend, PostgreSQL concurrency, kiosk, mobile, Vite, Next and **release-gate** all passed green.
23. #129 was marked ready only after exact-head completion and merged with SHA guard `7ae917dce3ce44087fb8b342f68bf473d9d24e4a`. Merge commit: `a589c727d4cdc1ef71cd6611ee26f837cdb013ed`.

## COMPLETED — #130 / G1 admin ownership

Original PR branch: `refactor/admin-ownership`
Reviewed source head: `1c0f5480b6555d7438ec4f69ae76382977f02e90`
Clean reconciliation branch: `reconcile/g1-admin-post-f5-20261004`
Clean base: `main` at `a589c727d4cdc1ef71cd6611ee26f837cdb013ed`

### G1 reconciliation and senior review

1. Proved G1 has **zero file overlap with F5**, so the post-F5 rebuild cannot overwrite any timesheet hardening.
2. Rebuilt only the reviewed admin ownership surface: `client_profile/admin.py`, four domain admin modules, ownership/admin contract tests, and one additive current-workflow CI change.
3. Compared the moved implementations against pre-move current main: **19/19 admin classes/forms/mixins are byte-identical**. G1 changes ownership/location, not admin behavior.
4. Registration coverage is identical: the same 18 `client_profile`-labelled models stay registered, including direct registrations for MembershipApplication, RefereeResponse and WorkerShiftRequest.
5. `client_profile.admin` remains a compatibility facade for historical test/import paths while registrations live in the owning domain apps; no reverse domain dependency was introduced.
6. Original G1's 1,100-line global admin snapshot was over-broad: it froze 78 project/third-party admin registrations although G1 only moves 18 client_profile-labelled models. Senior review narrowed the contract to those **18 moved registrations and their exact options**, reducing unrelated dependency noise while preserving the real invariant.
7. The narrowed registry test still checks admin class, list display/filter, search, readonly fields, inlines, form, ordering and actions, plus OTP admin registry sharing.
8. Workflow reconciliation uses the newest `shared_core_consolidation_ci.yml` and adds only `core.test_admin_registry_contract` to the existing backend kernel/domain command; no stale workflow blob is copied.
9. PR #130 had no unresolved review threads during preflight.
10. Reconciliation branch is `behind=0`; before moving the PR, expected diff is exactly the eight reviewed G1 files plus this progress document.
11. Final reviewed exact head: `04df39d1f7f0f1045f646b41b8987f3bee6f85be`; final compare was `behind=0`.
12. Exact-head Public Repository Security, both CodeQL languages, architecture, boundary, shared-core, backend (including the narrowed 18-model admin registry contract), PostgreSQL concurrency, kiosk, mobile, Vite, Next and release-gate all passed green.
13. #130 was marked ready only after exact-head completion and merged with SHA guard `04df39d1f7f0f1045f646b41b8987f3bee6f85be`. Merge commit: `cd8c6d4e319d0c6ca1109fb10b67fba02b1c9b21`.

## ACTIVE PR — #131 / G2 dashboard serializer cleanup

Original PR head reviewed: `c7bfbfd608985f5aa562b8b605698633f1d64f8e`
Clean reconciliation branch: `reconcile/g2-dashboard-post-g1-20261004`
Clean base: `main` at `cd8c6d4e319d0c6ca1109fb10b67fba02b1c9b21`

### G2 reconciliation and senior review

1. Rebuilt from G1-merged main as an exact **three-file semantic delta**, `behind=0`: delete `client_profile/domains/dashboards/serializers.py`, tighten the kernel ownership baseline, and update the architecture inventory.
2. Reference scan confirmed all five deleted response serializer names appear only in the dead serializer module and the ownership baseline. No runtime caller, URL, task, migration, shared-core client or test consumer uses them.
3. The original G2 P3 review correctly noted that the architecture doc still said the serializer should be removed “later.” The reconciled branch fixes that documentation in the same change.
4. Kernel code-line ceiling drops from 625 to 591 and the deleted module's top-level definitions are removed from the ratchet; no unrelated kernel baseline is changed.
5. G2 does not touch runtime endpoint behavior, serializers actually used by dashboards, model ownership, routes or client contracts.
6. Fresh exact-head CI/security is still required after moving PR #131.
7. Senior activation audit found #131 was still stacked on the G1 branch after G1 merged. The PR base has been explicitly retargeted to `main` at `cd8c6d4e319d0c6ca1109fb10b67fba02b1c9b21`; any runs created before that retarget are not merge evidence. This checkpoint commit intentionally triggers a fresh synchronize event on the corrected main-target PR.

## Beyond E2 — deep review already completed

The expensive code/architecture review has already been front-loaded. These PRs do NOT need to be understood from scratch again; they need current-main reconciliation, protection against resurrecting old code, and exact-head final gates.

### #125 F1 pharmacy hub
Merged after full current-main reconciliation and exact-head verification.
Final reviewed head: `bb1fa390524b35cbd9767f1f4fd4f7367e148f57`.
Merge commit: `525e18e3592e6a18a321ee145791a6abff383e07`.
Full senior findings and exact-head gate evidence are recorded above.

### #126 F2 users
Merged after full current-main reconstruction, senior hardening and exact-head verification.
Final reviewed head: `46cc7361485c787bdae1af8fadb10ac043c4f50c`.
Merge commit: `c0e0cb4c4d2606f557b961773979cbf38020143c`.
Full reconciliation, fixes and gate evidence are recorded above.

Already-reviewed fixes:
- Removed DEBUG OTP + phone logging/stdout while preserving explicit DEBUG response field.
- Added request/resend regression tests.
- Redacted raw reCAPTCHA provider exception text; logs error type only.
- Added secret-bearing exception regression.
- Region/Chief organization-directory reads now follow delegation role/region/assigned-pharmacy scope.
- Hub-directory organization-role metadata is attached only inside the target admin's assigned pharmacy scope.
- New active hardening targets are recorded in the ACTIVE F2 section above.

### #127 F3 attendance
Merged after clean post-F2 reconciliation, scoped pairing-options hardening and full exact-head verification.
Final reviewed head: `e8061d0da4d60dc90bee8d65b8ab9a12a67920ec`.
Merge commit: `82258451dc319f0a5d795cae93134f267c125c74`.

### #128 F4 roster
Merged after clean post-F3 reconciliation and full exact-head verification.
Final reviewed head: `c6bcb5fd29b893fbcf90dee7388321a27d0815d6`.
Merge commit: `27a6fb36030edb7d0dc4c76e5c770e1293609326`.

### #129 F5 timesheets
Merged after clean post-F4 reconstruction, PostgreSQL lock-order hardening, locked-manifest immutability and locked-detail read protection.
Final reviewed head: `7ae917dce3ce44087fb8b342f68bf473d9d24e4a`.
Merge commit: `a589c727d4cdc1ef71cd6611ee26f837cdb013ed`.
- Preserved all E2 membership PostgreSQL tests.
- Final exact-head full gate including PostgreSQL and release-gate: green.
- Post-lock amendment workflow remains a separate product feature; do not implement an in-place unlock.

### #130 G1 admin ownership
Merged after clean post-F5 reconciliation and full exact-head verification.
Final reviewed head: `04df39d1f7f0f1045f646b41b8987f3bee6f85be`.
Merge commit: `cd8c6d4e319d0c6ca1109fb10b67fba02b1c9b21`.
- 19/19 moved admin classes/forms/mixins are byte-identical.
- Registration/options contract is deliberately scoped to the 18 moved `client_profile` models rather than freezing unrelated third-party admins.
- Full exact-head gate including the focused admin-registry contract and release-gate: green.

### #131 G2 dashboard serializer cleanup
Active clean reconciliation on G1-merged main.
- Exact three-file semantic delta, `behind=0`.
- Reference scan proves the five response serializers are dead.
- Architecture inventory P3 is fixed in the same branch.

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

## Known reconciliation hazards already mapped

- **F2 #126:** do not copy its old CI workflow blob; preserve current workflow and apply only the auth/account expansion from `users.tests` to the whole `users` package.
- **F5 #129:** E2 and F5 both touch `backend/client_profile/test_postgres_concurrency.py`. Preserve all E2 membership locking tests and apply only F5's timesheet imports + `TimesheetTransitionPostgresLockingTests`.
- **G1 #130 / H1 #135 / H3 #136:** all edit the shared CI workflow. Apply each incremental test-step addition to the newest workflow; never replace the whole old blob.
- **G2/G3/H2:** all touch `core/test_backend_ownership_boundaries.py` and/or architecture docs. Apply their semantic deltas in sequence on the newest files.
- **G3 #132:** its PostgreSQL test edit is only the import-owner path change; preserve E2/F5 concurrency additions. Its serializer-lifecycle test rewrite must preserve E1b's storage-cleanup regression.
- **H2 #137:** its `core/serializer_lifecycle.py` change is only moving domain imports into `_known_file_references()`; preserve E1b's `default_storage` / path-based deletion fix.
- **H3 #136:** regenerate module-size baselines from final main and merge last.

## Final intended sequence

1. Reconcile/verify/merge #125 F1.
2. Reconcile/verify/merge #126 F2.
3. Reconcile/verify/merge #127 F3.
4. Reconcile/verify/merge #128 F4.
5. Reconcile/verify/merge #129 F5.
6. Reconcile/verify/merge #130 G1.
7. Reconcile/verify/merge #131 G2.
8. Reconcile/verify/merge #132 G3.
9. Reconcile/verify/merge #133 G4.
10. Reconcile/verify/merge #134 G5.
11. Reconcile/verify/merge #135 H1.
12. Reconcile/verify/merge #137 H2.
13. Rebuild final module-size baselines and merge #136 H3 LAST.
14. Final architecture/release audit from final `main`.

## NEXT ACTION

**Resume at PR #131 / G2 dashboard serializer cleanup from `reconcile/g2-dashboard-post-g1-20261004`. Current main is `cd8c6d4e319d0c6ca1109fb10b67fba02b1c9b21`.**

1. Fetch the reconciliation branch after this documentation commit and confirm current main → exact head remains `behind=0`; expected diff is the three reviewed G2 files plus this progress document.
2. Atomically move PR #131's branch to the reconciliation head; do not carry old stacked history.
3. Recheck/resolve the old P3 documentation thread against the new head.
4. Run fresh exact-head Shared Core Consolidation, CodeQL and Public Repository Security.
5. While G2 gates run, continue the already-built G3/G4/G5/H1/H2 preflight stack on isolated branches; do not modify the G2 exact head.
6. If all exact-head gates are green, mark #131 ready and merge with exact-head SHA guard; immediately rebuild #132 G3 from G2-merged main using the verified 87-path reconciliation (85/87 reviewed blobs identical, with only F5 PostgreSQL and E1b lifecycle regressions intentionally newer).
