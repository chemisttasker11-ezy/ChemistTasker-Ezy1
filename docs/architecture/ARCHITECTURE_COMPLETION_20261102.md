# Architecture completion — 2 November 2026

## Scope and result

This completes the reviewed architecture continuation on a branch from b0996c45 (the local #238-based fix branch). The work preserves business policy and historical compatibility. It does not close the separate correctness findings or certify the whole stack for deployment.

| Source-import measure | Before | After |
|---|---:|---:|
| Direct cyclic edges | 0 | 0 |
| Combined cyclic edges, including function-local imports | 113 | 37 |
| Largest combined component | 20 apps | 8 apps |
| Deferred app edges | 64 | 50 |
| Module-level app edges | 102 | 108 |

The combined graph now has three cyclic components:
- Operations/money: attendance, billing, invoicing, ratings, shifts, talent, worker_finance, workforce.
- Identity: memberships, notifications, onboarding, organizations, users.
- Historical kernel/project/hubs: client_profile, core, pharmacy_hub, public_hub.

A smaller cyclic-edge set is not a count of deleted imports, a complete execution graph, or a performance benchmark. Composition adds explicit outward dependencies; existing legitimate workflow and compatibility dependencies remain visible.

## Revised plan and implemented ownership

The previous plan's graph-only proposal is replaced by a source contract: operational foundation modules cannot import the listed feature implementations at any depth. Exact historical/project facades are retained. The rejected roster-publish freeze allegation is not implemented; its existing no-op cleanup stays on the parent branch.

1. Membership services are configured by explicit functions in CompositionConfig.ready(), after model discovery. HTTP URL loading is no longer required. URL objects, canonical operation identities and existing permissions are preserved.
2. shifts.occurrences owns offer selection. Billing keeps its no-slot whole-shift fallback; payroll keeps existing-assignment dates; finalization keeps unavailable accepted-pair refusal and Shift/Slot/Offer locks. Each caller retains its expansion lookup and order.
3. users.feature_port exposes the projections/signup/cleanup identity actually needs. Billing, content, rewards and talent own the implementations. Referral exception handling, award=False and cleanup queries remain in their owning workflows.
4. organizations.feature_port exposes store calendar projection/validation, workforce authority and protected deletion. The existing shifts/workforce implementations remain authoritative.
5. memberships.employment_port uses workforce-owned employment creation/query/award functions. Membership approval still owns the outer transaction, validation order and notifications.
6. onboarding.feature_port binds synchronous AHPRA access/cancellation, booking notices, referral award and newcomer cleanup. Profile locks, refusal type and on_commit/robust behavior remain unchanged; cancellation was not made best-effort.
7. Feature sitemap query bodies belong to shifts, public_hub and marketplace. The historical core view/helpers, route ordering, caching and serialization remain. The three moved function bodies are AST-identical to the parent after renaming.
8. The shared WebSocket group constant belongs to infrastructure, retaining the chat.realtime export and exact group value.

Consumer-owned ports are immutable and bound by application composition without I/O. Live owner lookup preserves the original function-local lookup behavior and existing patch points. These are explicit service contracts, not dynamic model lookup or import-delay workarounds.

## Invariants and sibling paths

| Invariant | Evidence |
|---|---|
| Workers/commands can use membership services before HTTP. | core.test_foundation_startup starts a fresh process with SQL, HTTP, task dispatch and URL resolution prohibited before django.setup(); checks both canonical membership services and all new bindings. |
| No new foundation-to-feature operational imports. | core.test_foundation_dependencies inspects runtime ASTs at every depth; rejects unlisted imports and stale facade exceptions. |
| Permission owners and positive access remain. | users/organizations/memberships behavioral suites; existing workforce/shift/attendance PostgreSQL controls. Service callbacks preserve owner exceptions and execute synchronously. |
| AHPRA cancellation, account cleanup and referral behavior remain. | onboarding, users, talent and rewards suites; PostgreSQL verification transitions; live-binding refusal test. |
| Booking/payment selection remains aligned. | Characterization tests passed before extraction and after it; checkout/shift/payroll PostgreSQL suites retain conflict, history, recurrence and frozen-period cases. |
| Models/migrations/serializer/task identities remain. | Serializer field snapshots on SQLite and PostgreSQL; model/import/upload/encryption/task/signal contracts; migration drift check reports no changes. |
| Routes and clients remain compatible. | Existing API behavior suites, sitemap tests, API-v1 cutover and shared-core ownership/package audits. No frontend/mobile/shared-core source changes. |
| Architecture improvement is bounded honestly. | Scanner retains zero direct cycles; tightened baseline records only the 37 actual remaining combined edges and three components; runtime ledger matches source. |

## Exact compatibility exceptions

Dated 2026-11-02 and enforced by exact file/module/imported-symbol keys in the test:

| File | Retained import | Reason |
|---|---|---|
| core/urls.py | public_hub.attachment_access, public_hub.media | Historical project HTTP/media composition. |
| core/api_v1_urls.py | worker_finance.legacy | Ordered legacy invoice handlers before generic routes. |
| core/routing.py | chat.routing | Project WebSocket route composition. |
| client_profile/models/common.py | chat.uploads, pharmacy_hub.uploads | Historical migration/pickle callable identity. |
| client_profile/models/shifts.py | shifts.models | Historical model imports, app labels and tables. |
| client_profile/domains/common/access.py | shifts.access | Pinned legacy access-helper imports. |
| client_profile/tasks.py | shifts.tasks | Historical task-object aliases/registration contracts. |

Nine import declarations retain six app-level facade edges. The 37 operational source-import locations outside those exceptions were removed through owned contracts. No scanner scope/exclusion was widened.

## Verification

Fresh local results on the architecture candidate:
- Linux SQLite affected behavior suites: 1,151 tests, OK, 16 database-specific skips.
- Public-hub suite with its CI-required PUBLIC_COMMUNITY_ENABLED flag: 40 tests, OK.
- Project PostgreSQL concurrency selection plus new architecture tests: 520 tests, OK, no skips.
- Standalone attendance suites under their own in-memory settings: 24 modules, 269 tests, all OK. The double-clock PostgreSQL module runs in the 520-test selection.
- Extra serializer/model/import/upload/encryption compatibility selection: 50 tests, OK.
- PostgreSQL serializer field/import contracts: 4 tests, OK (no database queries).
- Startup/signal/membership contracts: 22 tests, OK.
- After peer review, tightened per-symbol facade checks and the startup resolver interception: 24 affected tests, OK. Three adversarial import cases failed before the guard fix, then passed.
- Import-scanner tests: 13 tests, OK; attendance/workforce/talent/identity boundary tests: 5 tests, OK.
- Full direct/combined graph baseline and runtime-ledger checks: pass.
- Holiday data offline reconciliation, architecture/package/transport audits and API-v1 cutover checks: pass.
- Migration drift: no changes detected. No new migration or application data change.

Test counts overlap and must not be summed as unique coverage. Windows-only file locking/default source encoding and the per-suite public-community flag were corrected in test execution, not by weakening product assertions. Invalid early driver runs are excluded from passing evidence.

No UI changed, so a visual check is not applicable. Claude B independently approved the implementation with no P1/P2 findings. Both optional P3 verification suggestions were implemented; Claude B separately approved that delta with no remaining findings. The 24 affected contracts passed after the fixes. Review was read-only; GPT ran all verification. Full review reports and logs are in the local active-plan-completion-20261102 artifact directory.
