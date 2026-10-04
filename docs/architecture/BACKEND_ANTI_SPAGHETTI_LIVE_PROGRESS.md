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

`230396de7aabf649bf20ce347e702267d03cb4a4`

This is the merge commit of **PR #124 / E2**.

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

## ACTIVE PR — #125 / F1 pharmacy hub split

Branch: `refactor/pharmacy-hub-split`

Latest reconciled code checkpoint before this documentation commit:
`eb8b1b70c5b50117aa12a12dfb288a6fdd68018b`

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

### F1 gate status

Fresh post-E2 main-target CI must run on PR #125's current exact head after this checkpoint update. CodeQL and Public Repository Security were green on `d3a2b92`; that evidence became supporting-only after the reaction-identity fix. The new exact head must pass all final gates before merge.

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

**Resume at PR #125 / F1. First fetch PR #125's live exact head. Latest reconciled code checkpoint before this documentation commit is `eb8b1b70c5b50117aa12a12dfb288a6fdd68018b`.**

1. Verify PR metadata has caught up to the reconciled branch ref and compare current main → exact head; expected diff remains inside the reviewed/hardened F1 Pharmacy Hub code/test surface plus this progress document. `posts.py`, `scoping.py`, `serializers.py`, `test_api.py` and `test_hub_scope_contract.py` now also contain identity, mutation-atomicity and storage-lifecycle hardening.
2. Run/check fresh main-target Shared Core Consolidation, backend, CodeQL and Public Repository Security on the exact F1 head.
3. If any failure occurs, fix regression-first and update this file.
4. If all exact-head gates are green, mark #125 ready and merge guarded by exact head SHA.
5. Update this file with the new main merge SHA, then reconcile #126 F2 using the mapped workflow exception above.
