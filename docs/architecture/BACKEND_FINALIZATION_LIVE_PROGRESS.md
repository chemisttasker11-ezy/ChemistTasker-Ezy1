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
| F01 | Roster slot write-path correction | IN PROGRESS | Actual HTTP PATCH preserves slot/assignment identity, unpublished state, sibling records and cross-week period ownership; notification choices occur at republish; negative/rollback tests; PostgreSQL verification. |
| F02 | Supported runtime baseline | PLANNED | Verify supported Django 5.2 LTS patch and dependency compatibility from official sources; isolated upgrade PR; full suites/migrations/security evidence. |
| F03 | Shifts and Pharmacy Hub serializer decomposition | PLANNED | Cohesive classes moved intact; explicit stable export facades; direct internal imports; output/schema/validation/logging/patch-target compatibility; remove large-module exceptions. |
| F04 | Roster publication convergence | PLANNED | Existing revision/idempotency-aware publication contract becomes authoritative; no third publication engine; migrate clients deliberately. |
| F05 | Shared-core transport and domain convergence | PLANNED | Reuse existing transport/client.ts seams; isolated client instances for SSR; retain auth/cookies/errors/multipart/finance restrictions; progressively typecheck implementations. |
| F06 | Canonical /api/v1 domain cutover | PLANNED | Method/path/handler/permissions/schema/caller matrix; migrate Django namespaces/reverse references and consumers BEFORE removing legacy HTTP mounts; preserve finance adapters' protections. |
| F07 | Production acceptance and closure | PLANNED | Real client-to-API journeys, schema generation/diff, populated PostgreSQL upgrade and fresh install, concurrency coverage, deployment checks, security, and exact-head release evidence. |

## F01 active work

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

## Execution environment and evidence

- Live main and the initial files were read through the connected GitHub API.
- Local git ls-remote failed because github.com could not be resolved in this container. Do not claim a local checkout or local Django suite pass.
- GitHub branch creation succeeded. Use connected GitHub writes and hosted GitHub Actions for executable evidence, with contents:read and no production secrets in the new focused workflow.
- No runtime reproduction or production fix is yet recorded as passing at this checkpoint.

## NEXT ACTION

1. Add red-first tests for the actual roster HTTP edit request and a focused SQLite/PostgreSQL Actions job, without weakening existing gates.
2. Open the F01 draft PR and record the exact red-test head/results. Fix fixture errors separately from product defects.
3. Implement the smallest domain-owned in-place roster write operation, wire the current endpoint, and test identity, siblings, period ownership, permissions, rollback and notification timing.
4. Update this record with commit/check evidence before proceeding to the next milestone. Keep main unchanged until the exact-head merge gate passes.
