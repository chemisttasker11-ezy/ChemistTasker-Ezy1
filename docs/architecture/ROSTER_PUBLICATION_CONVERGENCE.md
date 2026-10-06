# F04 - One reviewed roster publication command

Base: F02 merged main 6e3a9e78aa23f54a689cff1402722c48801259be.
This is an intentional pre-production HTTP contract change, not an invisible structural refactor.

## Ownership and contract

The workforce revision command is authoritative. Both transitional workforce and
attendance/roster HTTP mounts resolve to the same command API classes. No third
publication engine, model, table or migration was added.

Validation requires period_id and expected_revision. Publication additionally
requires a caller-supplied UUID operation_id and acknowledged_warning_keys. Missing
or malformed command fields return 400; wrong-site requests return 403; stale
revisions, blockers, changed warnings and conflicting operation reuse return a
structured 409. No force_warnings HTTP escape, implicit latest revision, automatic
operation ID or period creation is allowed in validation/publication. Period
initialization is the existing explicit POST operation; reads remain side-effect free.

Warning identity includes the full facts displayed to the manager. The underlying
publication service checks current warnings after its period/worker locks. The
existing globally unique RosterOperation is reserved transactionally before changes;
failed commands roll back the reservation. Repeated identical requests by the same
actor return the stored result. Reuse with another period, actor or payload fails
without a second publication. Whole-week withdrawal invalidates prior revision
reviews and repeated withdrawal is idempotent.

The internal low-level publication service remains available for existing internal
callers/tests. Public routes no longer bypass the reviewed command. Its previous
force-warning argument is not exposed through the canonical HTTP command.

## Client integration

Shared-core exports typed command/result contracts and a pure publication-attempt
builder. An unchanged reviewed command reuses its operation UUID after a lost
response. Web's review dialog cannot publish before successful revision validation;
mobile replaces its blanket warning bypass with individually acknowledged warning
facts. Both use named shared-core operations. No fresh revision is silently fetched
at publication time. Changing the selected pharmacy/week invalidates the review;
stale asynchronous loads are not applied to the new selection.

## Evidence before hosted acceptance

- Red-first actual PostgreSQL HTTP/concurrency suite: 11 tests with failing subcases
  covering weak validation, missing revision/idempotency requirements, global UUID
  collision and stale warning identity. Earlier behavior was reproduced, not inferred.
- After implementation: local PostgreSQL 16.15 real-migration regression run passed
  131 tests across workforce, attendance approval/favourite cover, ownership and ratchet.
- Isolated legacy roster API/acceptance/safety suites: 3 + 9 + 9 tests passed with
  explicit reviewed command payloads. Negative authorization tests remain negative.
- Shared-core typecheck and 86 tests passed. Boundary audit reports no new bypasses.
- The expanded hosted finalization workflow runs the new command HTTP/race suite on
  both SQLite and PostgreSQL. Full hosted web/mobile, backend, security, schema and
  final release acceptance still must run against the finished PR head.

No staging deployment is claimed. No billing-policy, Celery identity, database
identity or native kiosk credential change. F05-F07 remain separate milestones.
