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
- Expo may be temporarily incomplete during migration, but that is not an exemption from listing unverified shipping clients in the final acceptance report.
- Never call a planned, inspected or merely compiled change runtime-tested. Record exact commits and checks.
- Never merge a failing/draft evidence branch. Recheck current main, reviewed head, required checks and review findings before each merge.

## Integration warning: existing PR #139

PR #139 (fix/billing-payers-and-dead-api, head observed 042b81d379b8b9ddb461de67ec4551b2feee0521) changes platform billing payer access, removes unused shared-core exports, and adds CI suites. Its description asserts a newer owner decision broadening payers. This conflicts with the last confirmed policy in this conversation. It is NOT incorporated or merged here. Review its changes separately before any future rebase; do not overwrite the branch or silently resolve its policy assertion. Its shared-core/CI edits overlap later milestones.

## Programme and dependency order

| ID | Milestone | Status | Exit evidence |
| --- | --- | --- | --- |
| F01 | Roster slot write-path correction (#140) | IN PROGRESS | Actual HTTP PATCH preserves slot/assignment identity, unpublished state, sibling records and cross-week period ownership; notification choices occur at republish; negative/rollback tests; PostgreSQL verification. |
| F02 | Supported runtime baseline (#141) | IN PROGRESS | Verify supported Django 5.2 LTS patch and dependency compatibility from official sources; isolated upgrade PR; full suites/migrations/security evidence. |
| F03 | Shifts and Pharmacy Hub serializer decomposition | PLANNED | Cohesive classes moved intact; explicit stable export facades; direct internal imports; output/schema/validation/logging/patch-target compatibility; remove large-module exceptions. |
| F04 | Roster publication convergence | PLANNED | Existing revision/idempotency-aware publication contract becomes authoritative; no third publication engine; migrate clients deliberately. |
| F05 | Shared-core transport and domain convergence | PLANNED | Reuse existing transport/client.ts seams; isolated client instances for SSR; retain auth/cookies/errors/multipart/finance restrictions; progressively typecheck implementations. |
| F06 | Canonical /api/v1 domain cutover | PLANNED | Method/path/handler/permissions/schema/caller matrix; migrate Django namespaces/reverse references and consumers BEFORE removing legacy HTTP mounts; preserve finance adapters' protections. |
| F07 | Production acceptance and closure | PLANNED | Real client-to-API journeys, schema generation/diff, populated PostgreSQL upgrade and fresh install, concurrency coverage, deployment checks, security, and exact-head release evidence. |

## F01 active work

PR: #140 (draft)
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

## NEXT ACTION

1. Run expanded focused SQLite/PostgreSQL HTTP and real-transaction contracts on the exact new F01 head. Investigate any failure; do not weaken assertions.
2. Run the complete existing backend, PostgreSQL, architecture/boundary, shared-core, Vite/Next/mobile, kiosk, repository security and CodeQL gates. Add the new focused workflow to the merge review checklist.
3. Re-review direct mutation paths, publication locking, history guards and preserved accepted terms, then update #140 description/status. Check current main and exact reviewed head before any merge.
4. Inspect #141's runtime/advisory evidence while F01 CI runs. Resolve dependency compatibility and advisories in that dedicated branch; do not mix runtime changes into F01.
5. Start serializer extraction only from the final integrated implementation, moving intact classes and preserving public exports/patch targets. Continue F03-F07 according to the table above, recording real evidence per milestone.
