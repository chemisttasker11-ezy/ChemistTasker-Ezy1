# Backend Production Finalization - Live Progress

Authoritative recovery record for the programme authorized on 2026-10-06. The earlier BACKEND_ANTI_SPAGHETTI_LIVE_PROGRESS.md remains the historical record of the completed C-H sequence; this programme does not rewrite that history or claim those checks prove the newly identified workflow contracts.

## Baseline and scope

- Repository: chemisttasker11-ezy/ChemistTasker-Ezy1 (testing repository, not the production repository).
- Verified starting main: fca354b62d49e95dced15d0d10d0d0cf87c9370e (PR #138).
- Preserve Django domain ownership, shared-core, Daphne, Celery task identities and kiosk native credential boundaries.
- No new business model/table for roster editing, corrections, financial records or permissions when the existing model serves the requirement.
- Structural serializer and HTTP-boundary PRs must introduce no migrations. Framework compatibility work is separate; released migrations remain immutable.
- Keep the 999-code-line review threshold. Remove serializer exceptions when no longer needed; do not inflate baselines or compress source to evade the ratchet.
- Platform billing remains distinct from workforce/payroll capability. No billing-policy changes in this programme without a separate explicit decision.
- Real staging is not a gate. Controlled CI PostgreSQL, schema, workflow and deployment evidence is required instead.
- Owner confirmation on 2026-10-06: final acceptance MUST include properly rewired Expo, Next and Vite. Temporary migration gaps are not the final deliverable; all three must use the canonical shared-core contracts and pass their acceptance checks.
- Never call a planned, inspected or merely compiled change runtime-tested. Record exact commits and checks.
- Never merge a failing/draft evidence branch. Recheck current main, reviewed head, required checks and review findings before each merge.

## Integration warning: existing PR #139

PR #139 (fix/billing-payers-and-dead-api, head observed 042b81d379b8b9ddb461de67ec4551b2feee0521) changes platform billing payer access, removes unused shared-core exports, and adds CI suites. Its description asserts a newer owner decision broadening payers. This conflicts with the last confirmed policy in this conversation. It is NOT incorporated or merged here. Review its changes separately before any future rebase; do not overwrite the branch or silently resolve its policy assertion. Its shared-core/CI edits overlap later milestones.

## Programme and dependency order

| ID | Milestone | Status | Exit evidence |
| --- | --- | --- | --- |
| F01 | Roster slot write-path correction (#140) | MERGED | Actual HTTP PATCH preserves slot/assignment identity, unpublished state, sibling records and cross-week period ownership; notification choices occur at republish; negative/rollback tests; PostgreSQL verification. |
| F02 | Supported runtime baseline (#141) | MERGED | Verify supported Django 5.2 LTS patch and dependency compatibility from official sources; isolated upgrade PR; full suites/migrations/security evidence. |
| F03 | Shifts and Pharmacy Hub serializer decomposition (#142) | MERGED | Cohesive classes moved intact; explicit stable export facades; direct internal imports; output/schema/validation/logging/patch-target compatibility; remove large-module exceptions. |
| F04 | Roster publication convergence | IMPLEMENTED - selection-lifetime correction awaiting exact-head CI | Existing revision/idempotency-aware publication contract becomes authoritative; no third publication engine; migrate clients deliberately. |
| F05 | Shared-core transport and domain convergence | IMPLEMENTED - exact-head CI pending | Reuse existing transport/client.ts seams; isolated client instances for SSR; retain auth/cookies/errors/multipart/finance restrictions; progressively typecheck implementations. |
| F06 | Canonical /api/v1 domain cutover | PLANNED | Method/path/handler/permissions/schema/caller matrix; migrate Django namespaces/reverse references and consumers BEFORE removing legacy HTTP mounts; preserve finance adapters' protections. |
| F07 | Production acceptance and closure | PLANNED | Real client-to-API journeys, schema generation/diff, populated PostgreSQL upgrade and fresh install, concurrency coverage, deployment checks, security, and exact-head release evidence. |

## F01 active work

PR: #140 (merged)
Branch: fix/finalization-f01-roster-slot-contract
Base: fca354b62d49e95dced15d0d10d0d0cf87c9370e

Source audit found that RosterShiftManageViewSet.update delegates slot writes to ShiftSerializer/revise_shift, which replaces the slot collection. Existing positive unpublish/edit/republish tests call slot.save directly rather than the editor's HTTP PATCH. New red-first HTTP contracts are needed before changing the implementation.

Required invariants:

1. Edit an explicitly identified slot in place, preserving its ID, unpublished marker and unrelated fields.
2. Preserve the existing assignment ID and historical links when the worker is unchanged. Do not reset accepted engagement snapshots during a time-only edit.
3. Leave omitted sibling slots/assignments untouched, including published siblings.
4. Permit slot-level edits independently, but reject a changed shift-wide role/field that would mutate still-published siblings.
5. Validate slot ownership, time/date input, selected worker eligibility and pharmacy scope on the server. No cross-pharmacy slot IDs.
6. Cross-week moves synchronize existing period ownership and assignment dates. Republish requires a published destination week and must not retain a stale source-period link.
7. Ordinary edits of an unpublished slot do not invoke the marketplace notification path. Republish applies worker/team/none after commit.
8. Lock ordering and revision consistency must be reviewed against existing roster period, assignment, publication and timesheet writers. SQLite passing is not concurrency proof.
9. No table/model additions and no business-policy changes.

## F01 evidence and implementation checkpoint

- Red-first head: fd48d2f1590666ae766f404fb6c81001cfd0683b. Focused run 37381968236 ran 21 tests on each database. SQLite job 112005939219 and PostgreSQL job 112005939460 each produced 15 passes and the same 6 HTTP failures. All 13 pre-existing roster tests passed. The new tests exposed premature notifications, foreign-slot and invalid-time HTTP 500s, a lost cross-week period link, a published sibling incorrectly blocking an independent edit, and assignment reconstruction after slot replacement.
- First correction head: d05a8cf8979ca4503371f4fe28427ed0e8af2214. Focused run 37383851787 passed all 21 tests on SQLite (112012189740) and PostgreSQL (112012189467), with migration drift checks passing. This is real migration-backed red/green evidence, not a source inference.
- The correction uses roster-owned slot_edit_inputs.py, slot_locking.py and slot_edit.py; the existing endpoint delegates only roster-owned slot-bearing requests to it. General marketplace slot replacement remains separate.
- Additional hardening now shares period-first locks with per-slot unpublish/republish, aligns explicit period ownership, records before/after values on the existing RosterActionAudit, rechecks assigned-worker eligibility on republish, and protects existing invoice/modern-leave links during reassignment/date changes. No model/table/migration additions.
- Nine additional HTTP safety tests cover partial-field preservation, server-owned fields, duplicate/missing IDs, shift-wide role changes affecting siblings, rollback on a later invalid slot, ineligible replacements, overlaps, invoice linkage, republish eligibility and existing audit records.
- Four PostgreSQL-only TransactionTestCase tests now cover lock acquisition order, edit-versus-republish, whole-week unpublish-versus-republish, and opposite cross-week moves. SQLite skips are expected and are NOT concurrency proof. Hosted PostgreSQL results for this expanded set are pending at this checkpoint.
- Local working-tree regression run: 110 tests across workforce.tests, attendance.test_favourite_cover, core.test_module_size_ratchet and core.test_backend_ownership_boundaries; 106 passed and 4 PostgreSQL cases skipped. Focused local run: 34 tests, 30 passed and 4 skipped. Local settings used the runtime model schema without migrations to accelerate iterations; these results do not replace the hosted migration-backed checks.
- The deliberately raised broker-unavailable exception in the post-commit notification resilience test is expected logging, not a failed test.

## F02 independent runtime work

PR #141 (draft), branch chore/finalization-f02-django-lts, starts from the same verified main. Initial head 520c6ce0ebdee387bad444624c443c2befe75d80 changes Django 5.1.8 to the officially published/non-yanked 5.2.17 LTS patch and adds an isolated resolved-dependency audit. Compatibility/advisory results are pending. No business logic or billing policy is changed. Final merge requires the combined F01+F02 tree to be tested, not just their independent baselines.

Primary runtime sources and acceptance notes live in docs/architecture/BACKEND_RUNTIME_BASELINE.md on that branch. A prospective development release must not be pinned until official catalogue and PyPI publication are confirmed.

## Execution environment and evidence boundaries

- Direct local GitHub cloning failed DNS, so connected GitHub reads/writes were used.
- A contents:read CI job exported only tracked source (no .git credentials/runtime data). Artifact 11376031723 from run 37382736939 supplied exact source commit 6564f09f3c935e7d531261ac1d5210261bf46c20; tar SHA-256 ed6a9d2faae1e87a345c558890b477ff29c651f64d25f7cb459dbab8c9a07659 was verified before extraction.
- An isolated installed Python 3.12.14 test runtime was obtained from read-only run 37384273801, artifact 11376139627, commit 076df59cf85822bb42eced84375acc9cc4aa8e32. Runtime tar SHA-256 97ccc635fe1ca9cad02d2ad08ae5eb74259bc0e050db74779073ea6c776c6229 was verified. Local Django 5.1.8/DRF 3.16.0/psycopg 3.2.9 match that installed environment.
- Local full SQLite migration startup exceeded the bounded execution window. Fast local model-schema tests are supplemental only. The hosted focused workflow still runs real migrations on both databases and is the acceptance authority.
- Temporary source/runtime artifact bootstrap steps were removed after retrieval; the permanent workflow retains only exact-head tests, dependency installation and migration checks.
- Compile and hash checks were performed on local changes before GitHub tree updates. Local repository commit IDs are not remote commit evidence.
- Main remains unchanged. No merge-ready declaration has been made.

## Recovery checkpoint - 2026-10-06

- F01 merged after final review and exact-head green integration/CodeQL/security plus real HTTP and transaction checks. Merge: cc0c01b8b7a0f115a8c4272af6bc4735bd165de4. Its tree is exactly the tested f5ac6d7 tree 60b1f3b40c0e42382f08638fc70e873abbb20dfa. Earlier pending/draft statements above are historical checkpoints, not current status.
- F02 #141 remains blocked by the new resolved-dependency audit. Findings are being deduplicated and matched to verified published fixed versions; no blanket suppression.
- F03 #142 is implemented. Six PostgreSQL fingerprint failures were reproduced as database-derived integer bounds present identically in the original unsplit F01 serializers. Complete per-vendor field objects match before/after. Commit d743381ec7d4533fd058871118ef5e9a5e958e07 adds independently measured PostgreSQL baselines without weakening checks. Static/export tests passed locally on both settings. The actual migration-backed PostgreSQL suite remains required.
- That expanded suite also exposed an existing attendance approval query locking a nullable membership outer join. The independent attendance correction locks the mutable review and session rows explicitly, not the nullable source membership. New actual approval/repeat/denial tests and PostgreSQL lock/race tests are added. Local supplemental model-schema run: 16 tests, 14 passed and 2 PostgreSQL-only cases skipped. Hosted real-migration acceptance is pending; this is not yet declared fixed in production.
- No billing policy/model/table/migration changes are included. #139 remains separate.
- Exact tracked-source archives for F01/F02/F03 were recovered through a contents:read temporary CI export; checksum and reconstructed Git trees verified. A bounded patch transport may write only a new work/finalization-candidate-* branch after exact parent, patch SHA-256, allowed paths and expected Git tree verification. PR/main updates remain separate reviewed connector actions; temporary transport is not part of the release tree.

## Previous next-action checkpoint (superseded)

1. Verify the independent attendance correction on real PostgreSQL and SQLite; integrate only after all required gates pass.
2. Reconcile F03 with current main and the attendance correction, preserving intact serializer extraction and exact original per-vendor contracts.
3. Remediate the F02 advisory packages with compatible published fixes and rerun resolved audit plus combined-tree tests.
4. Implement F04-F07 as scoped milestones; do not remove legacy HTTP namespaces before canonical routing, reverse references and shipping clients are verified.

## Previous next-action checkpoint (historical)

1. Run expanded focused SQLite/PostgreSQL HTTP and real-transaction contracts on the exact new F01 head. Investigate any failure; do not weaken assertions.
2. Run the complete existing backend, PostgreSQL, architecture/boundary, shared-core, Vite/Next/mobile, kiosk, repository security and CodeQL gates. Add the new focused workflow to the merge review checklist.
3. Re-review direct mutation paths, publication locking, history guards and preserved accepted terms, then update #140 description/status. Check current main and exact reviewed head before any merge.
4. Inspect #141's runtime/advisory evidence while F01 CI runs. Resolve dependency compatibility and advisories in that dedicated branch; do not mix runtime changes into F01.
5. Start serializer extraction only from the final integrated implementation, moving intact classes and preserving public exports/patch targets. Continue F03-F07 according to the table above, recording real evidence per milestone.

## Active resume checkpoint - 2026-10-06

Approved GitHub writes were retried successfully. F03 #142 is merged at
9dcf0a7a0cdb3753670ad394e94e9d6995ed788d; signed merge tree equals tested
60fe2649f9f69773cad2e728facf2e529d3bd4fb. Integration/release, CodeQL, repository
security and dedicated serializer/finalization SQLite/PostgreSQL checks passed.
All 31 moved AST definitions were independently rechecked unchanged.

F02's previous strict dependency audit is now green. Its integrated runtime adds a
reviewed DRF field-metadata adaptation and explicit numeric-ID regression tests.
Combined exact-head hosted acceptance is pending. No new tables/models/migrations
or billing-policy change. Temporary recovery/transport helpers are not release files.

## Previous next action (superseded)

1. Verify and review F02 on integrated F01/F03/attendance main before guarded merge.
2. Complete F04 publication convergence using the existing revision/idempotency command.
3. Complete F05 shared-core and F06 canonical /api/v1 migration with all callers verified.
4. Complete F07 workflow/schema/populated-upgrade/concurrency/deployment evidence.
F04-F07 are not complete. Do not describe a structural/refactor gate as final acceptance.

## F04 implementation checkpoint - 2026-10-06

F02 merged at 6e3a9e78aa23f54a689cff1402722c48801259be. The signed merge tree
d09ea9c76fad8eb1086b73921f7c99d6ab9a72d2 equals the fully tested runtime head.
Strict resolved audit, serializer/finalization SQLite/PG, full integration/release,
CodeQL and repository security passed. F01-F03 plus independent attendance fix are merged.

F04 now uses one revision/idempotency/warning-aware publication command for both
transitional HTTP mounts. Web/mobile review exactly the returned revision and warning
keys, and preserve operation UUID across retries of the same reviewed command.
Global UUID conflicts return 409 rather than an integrity-error 500; failed requests
leave no reservation/publication. Whole-week withdrawal invalidates prior reviews.
Local real-PG regression: 131 tests passed. Isolated roster API suites: 21 passed.
Shared-core: 86 passed and typecheck passed. Hosted exact-head acceptance is pending.
Detailed boundaries/evidence: ROSTER_PUBLICATION_CONVERGENCE.md. No new models/tables/migrations.

## NEXT ACTION (current)

1. Review and run F04 exact-head hosted integration, HTTP/PG race and client checks before merge.
2. Complete F05 shared-core transport/domain convergence without SSR credential sharing.
3. Complete F06 canonical /api/v1 routes, reverse refs and clients before legacy HTTP removal.
4. Complete F07 schema/populated upgrade/concurrency/deployment acceptance and clean recovery branches.
The programme is not complete. PR #139 remains explicitly separate.

## F04 selection-lifetime correction - 2026-10-06

Source checkpoint: 32c86cbd9fc9c33d14ce6e64f067fc3c8c04177c. A recovery read/write session confirmed main remains 6e3a9e78aa23f54a689cff1402722c48801259be. No repeat authorization was needed.

- The reported Expo initialization race is corrected using a keyed pharmacy/week/screen component and per-mounted-selection request tickets. Unmount, refresh or a newer operation invalidates late results. Initialization is checked before any period state write or dependent validation request. A new selection owns fresh busy/review state, including A -> B -> A changes.
- Publication/withdrawal/per-slot completion paths do not update or reload a newer selection. The server may already have accepted a cancelled-view mutation; the guard only suppresses stale client continuations and does not pretend to cancel committed work.
- Vite workspace initialization and publication-dialog completion use the same framework-independent scope utility. Each awaited dependency is checked before and after execution.
- Added 10 deterministic deferred-response tests for the actual shared review helper and scope utility. Local shared-core typecheck/build and all 96 tests passed. This does not substitute for mounted Expo/browser acceptance or the exact-head hosted gate.
- All three final clients are required in F05-F07: Expo (authenticated/native operations and navigation), Vite (operational screens and auth), and Next (request-scoped SSR/public/content/proxy behavior). Native kiosk device signing remains separate.
- A temporary contents:read recovery workflow exported only the exact tracked source and pinned shared-core node dependencies. Source tar SHA-256 f80ec0ca1fa2915051e0800fa15f45158b5dddf0884827f3e475cd33d336a5fa and reconstructed tree 67c895e8b627f343c6df516bb90733b3c6d60258 were verified before edits. Temporary recovery/patch tooling is not part of the release tree.

Next: full exact-head checks and final review of F04, while implementing F05. F06 will carry a complete method/path/caller inventory and F07 must prove all three rewired clients, not merely update endpoint constants. No model/table/migration or billing-policy change.

## F05 implementation checkpoint - 2026-10-06

F04 #144 merged at `3b67975442b7dcb1acf40b60d1b86c0bbf2d6926`; signed merge tree `2216da7004126850de15f26834fd82ae6108d72f` equals tested `40914809d777630f84cb3b89b1883f5f3cb5c607`. Exact-head integration/release, CodeQL, repository security, serializer/finalization SQLite/PostgreSQL and all three client checks passed. The selection-lifetime finding is fixed. Older draft/pending statements above are historical checkpoints.

F05 now consolidates HTTP/auth into one instance-based transport and moves the application operations into strictly checked domain modules. The old public exports remain. All 438 measured runtime exports are pinned to the new domain objects. Local shared-core 136 tests/typecheck/build, Vite typecheck/build, Expo typecheck/lint and Next typecheck pass. Local source-shaped contract corrections and limitations are detailed in SHARED_CORE_TRANSPORT_CONVERGENCE.md. No models/tables/migrations or billing-policy changes. Required architecture CI now enforces no new shared-core HTTP engine or file-wide type suppression.

## NEXT ACTION - F05/F06/F07

1. Run all exact-head F05 hosted gates and review the consolidated transport, mapper outputs and all Expo/Next/Vite callers before milestone merge.
2. F06: build the complete old-to-canonical method/path/view/action/namespace/caller matrix; migrate domain URLs and reverse references, then every shipping Expo/Next/Vite consumer and restricted kiosk path. Only remove the legacy HTTP mounts after migration checks prove no active caller remains. Keep native signing credentials separate.
3. F07: verify actual wired journeys, schema, populated PostgreSQL upgrade/fresh install, concurrency, production settings and security on the final integrated tree. No claim of complete production acceptance from source/type checks alone.
4. Retire the isolated recovery/patch-tool branches after implementation is safe and recorded. They are not part of the release tree. PR #139 remains separate.
