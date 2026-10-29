# PR #213 — consistency continuation and acceptance record

Date: 29 October 2026 (Australia/Brisbane). Repository: `chemisttasker11-ezy/ChemistTasker-Ezy1`. Branch: `fix/surgical-backend-consistency-20261029`; base: `fix/pr211-followups` at `0e2a4a14344492cddab1ed2998c14340d538ad30`.

This continuation begins at `0bc2da97c8d31c511bd0f7ccece60a7d9f834e91`. PR #213 remains **draft, unmerged and undeployed**. The source changes below have targeted local evidence; the PR description and living plan record automatic CI against the final published commit. No live Stripe, email or provider action is authorized or included.

## Initial exact-head review

The remote PR still matched the handover before the first source edit. Reviewing jobs against that exact commit found two independent blockers:

- Both PostgreSQL jobs that selected the new finalization/manual-assignment race failed on its import of nonexistent `BILLING_STATE_FREE`. SQLite skipped this PostgreSQL-only test. A passing Backend Finalization workflow did not establish that this race executed.
- The mobile live dependency gate failed at its first unknown advisory, `GHSA-gcqx-w48m-w2h4`. The complete audit also revealed `qs` advisory `GHSA-6pq8-jhm2-2vcw`; the already fingerprint-patched node-forge advisory remained present in version metadata.

Full Isolated QA and Architecture Mainline Native Full QA were conditionally skipped, not passed. Earlier-head results are retained as historical evidence only.

## Changed business boundaries

### Booking, history and parent deletion

The protected rules are one worker per occurrence, preservation of assignment identity/history and accepted terms, and respect for roster publication. The [Stage D route/writer ledger](SURGICAL_STAGE_D_EVIDENCE_20261029.md) records each runtime entry point, its actual guard, positive/negative evidence and the explicit **intentional privileged superadmin exception**.

Real production gaps were reproduced before repairing them:

- A single assignment PATCH could change an invoice-linked worker/date. The existing history guard now runs only for a real identity/date change, preserving supported same-value, readonly-input, classification and unaccepted-rate maintenance.
- Same-worker recurring cleanup omitted history protection. Invoice history caused an uncontrolled `ProtectedError`; nullable leave history could lose its link. The existing history guard now checks all obsolete assignments before deletion.
- Direct manual assignment and bulk assignment could lock Slot before Shift, opposite to offer finalization. Forced PostgreSQL contention demonstrated a 500 deadlock. Both paths now acquire their existing Shift parents before Slot locks, in stable order for a bulk batch. A second deterministic probe found a Shift/RosterPeriod inversion: finalization holds Shift while its synchronous assignment signal needs the roster period, which bulk/slot editing already holds. The shared roster Shift lock now uses NOWAIT inside a savepoint and translates only PostgreSQL 55P03 to a clear refresh-and-retry 400. Normal period/worker serialization and atomic revision invalidation remain unchanged; unrelated database errors propagate. Both bulk and slot PATCH paths are covered. The tentative weaker User lock was discarded after it failed to resolve the actual cycle.
- Pharmacy and organization DELETE inherited an unguarded Django cascade. Eight protected subcases actually returned 204 and deleted booked/payment-pending records. These endpoints now lock their parent/descendant state and reuse the **unchanged existing direct-shift deletion rule** before the cascade. Plain unassigned deletion and action authorization remain supported.

The shared deletion helper is owned by `shifts/deletion.py`. The direct shift endpoint catches its refusal inside the original transaction so lookup-triggered escalation writes and commit callbacks retain their previous behavior. Parent deletion intentionally propagates the refusal to abort the whole cascade. A dedicated regression checks this transaction distinction.

The earlier bulk-move history repair in `0bc2da97` remains in place and is executed by the Stage D selection. The earlier dedicated-offer publication repair `71736755` remains confined to that route; it is not a platform-wide side-effect audit.

### Mobile dependency security

The [dependency security record](PR213_MOBILE_DEPENDENCY_SECURITY_20261029.md) includes the complete advisory leaves, affected consumers, failing-first cases, actual patch code, fresh install and compatibility evidence.

- `deepmerge@4.3.1` has a local two-loop `__proto__` guard in source, CommonJS and UMD implementations. All three installed files are fingerprinted, and the actual Expo config consumer must resolve the checked implementation.
- `qs` is pinned to the official fixed version `6.16.1`; the real Places consumer's package resolution is checked.
- The audit reports all unresolved leaves together. Unknown advisories, extra unpatched package locations and changed installed code remain failures. No severity threshold, ratchet, waiver or test skip was loosened.

Raw `npm audit` still reports upstream version metadata for deepmerge and the previously patched node-forge. The repository gate verifies the installed repairs; it does not claim zero raw advisories. The independent reviewer approved the installed patch semantics, real consumer resolution and strict refusal behavior. A fresh install and the configured security/mobile tests passed independently.

### Scoped Stage I extraction

The [billing extraction record](SURGICAL_BILLING_EXTRACTION_20261029.md) covers the earlier checkout URL helpers and four subscription-account helpers now owned by `billing/subscriptions.py`.

Characterization preserves active organization/owner read precedence, primary-account creation, contact refresh, response quirks and caller transaction rollback. Old private names remain aliases in `billing/views.py`; the extracted functions resolve internal lookup dependencies in their new owner, with no existing caller relying on patching that internal lookup through the old module. All four moved functions are AST-equivalent after naming normalization; all 18 remaining endpoint/helper bodies and decorators are unchanged. HTTP authorization, Stripe metadata, provider identity, retries, webhooks and mutations retain their owners.

A concurrent contributor published eight extracted helpers in `d70806e7`. Its account extraction and all six additional tests are retained. This continuation restores the four metadata/customer-identity helpers to their original `views.py` owner because the handover explicitly excludes provider identity handling from this stage. Those six tests retain their assertions and import the restored private helpers where appropriate. The upstream commit remains in ancestry; no functionality or test is discarded.

The official tokenizer/AST ratchet measured `billing/views.py` at **1,014 → 960 code lines** for this continuation. The old allowance was 1,047. Because 960 is below the existing 999 review threshold, the official stale-entry test required removing the exception. The threshold and tolerance were unchanged.

## Architecture decisions for R4–R6

The detailed [architecture decision record](SURGICAL_ARCHITECTURE_DECISIONS_20261029.md) contains the source boundaries and preservation checks.

### Existing dependency cycles

The runtime import graph remains **97 module-level app edges, 72 delayed edges and seven mutual pairs**, with the same 11-app strongly connected component and 29 existing longer-cycle edges outside the mutual-pair allowlist. Both regression checks pass. This is preserved debt, not an acyclic backend or a new cycle reduction.

`docs/architecture/BACKEND_DOMAIN_DEPENDENCIES.md` now reflects the actual graph, including the already removed attendance/workforce import-time cycle. That earlier removal is not claimed as work performed in this continuation. Existing composition roots, migration compatibility and reciprocal domain facts are not relocated into a generic shared owner merely to reduce counts.

### Scope and eligibility

The inspected callers of `membership_covers_pharmacy` use a shared organization-coverage fact while retaining action authorization. Collection selectors in leave, dashboards and organization views are not interchangeable with a point membership predicate. No further concrete G/H production gap was established by this review.

Public `require_public_ahpra` can schedule a recheck; it remains unsuitable as a side-effect-free UI explanation helper. `lock_public_ahpra` retains its transaction recheck. Attendance's action-specific eligibility result remains distinct from roster and public-work decisions. Accepted work and invoice source facts are not revalidated against present-day public eligibility. A universal eligibility boolean or optional common explanation format was not introduced without a concrete consumer.

### Conditional Stage J decision

No new interval abstraction was selected. Pricing's legacy/current cut points and four-decimal hour quantization differ from engagement's dynamic day classification, unquantized elapsed hours, overtime early refusals and review metadata. Sharing only the loop would still require these distinct policy owners and could make the boundary harder to follow.

The existing shared holiday owner remains unchanged. The full 43-test selected pricing/holiday preservation suite passed, including the 600-case fingerprint:

```text
682ecafdc6dcfdfff90ad7b480b358bb97836ada0caa297f3c88eaa27d745518
```

Offline holiday reconciliation also passed (eight states/territories, 56 regional records, ten part-day records). This checks the repository's current fixture; it is not a new legal-source certification, and pending declarations remain pending. Stage J is **deliberately deferred under the plan's stop rule**, not represented as implemented. PR #211 timezone/attendance formatting was not revisited.

## Targeted validation and discovery

Tests use the pinned backend dependencies, a disposable PostgreSQL 16 instance, dummy credentials and locmem email. Provider operations in billing tests are mocked. Final suite counts overlap and must not be summed into a unique project total.

| Check | Local result |
| --- | --- |
| Stage D history, E17 and PostgreSQL contention | **73/73 passed**, no skips/errors/failures; 20.570 seconds on a unique disposable database. All 811 backend Python files were unchanged during execution. |
| Parent deletion, direct-shift refusal and positive/negative authorization | Included in the final Stage D selection; separate immutable-baseline reproductions are recorded in its ledger. |
| Complete billing + official module-size + backend ownership contracts, PostgreSQL | **145/145 passed**, no skips/errors/failures; 18.805 seconds after the final bounded integration. Direct URL/both account suites/ratchet selection **30/30 passed**, no skips; 1.568 seconds. All 32 billing/core Python files were unchanged during both final runs. |
| Dependency security | Earlier fresh install and **33/33** controls passed. After retaining the concurrent regression/runtime check, final **34/34 passed**, no skips; strict live audit passed on the integrated source. Patch/lock/fingerprint bytes are unchanged. |
| Configured mobile behavior | **71/71 passed**, no skips; lint and TypeScript passed. |
| Pricing/holiday preservation | **43/43 passed**, including the 600-case hash and boundary/provenance controls. |
| Import scanner / deferred ownership controls | **11/11 and 4/4 passed**, respectively. |
| Migration drift, cycle baselines, architecture boundaries, whitespace | Passed; no model or migration change. |

Configured discovery was checked in source:

- `serializer_decomposition_contracts.yml` selects all `shifts` and `workforce.tests` on PostgreSQL and SQLite. It discovers the original manual-assignment race, the new forced races and the earlier bulk-move invoice-history regression. PostgreSQL execution is required for race evidence.
- `shared_core_consolidation_ci.yml` explicitly selects `shifts.test_shift_actions_contract` in its PostgreSQL job. Its broader backend selects `users billing`, all `organizations`, and `workforce.tests.test_assignment_protection`, including the new subscription and parent-cascade tests.
- The mobile job already selects both security tests and the live dependency gate after the 71 mobile behavior contracts. Final Node 22 hosted execution is required independently of the local Node 24 run.

The final publication does not change test discovery or workflow policy. Hosted job links and final SHA belong in the PR description/living plan once those jobs finish, rather than asserting a future pass in this source checkpoint.

## Preservation and release boundary

No invoice arithmetic or accepted evidence changed. Internal/external `1.50 × 3.03` remain `4.55`/`4.54`; two taxable `70.06` rows retain internal/external GST `14.02`/`14.01`; the explicit-12% accepted-source case retains payable `74.55` and generated super `8.94`. False accepted flags, invoice-level GST opt-out, manual-zero super, ignored internal professional rows, external zero/negative compatibility and legacy raw precision remain their established contracts.

The mobile preview/Save boundary remains unchanged: locked accepted rows, custom-only resubmission, server decimal strings, no preview persistence, stale-preview Save refusal, explicit edit precedence, duplicate-click guard, sanitized custom metadata and controlled assignment-ID overflow.

Passing repository CI will establish the configured source gate. It does not establish real configured Stripe prices, provider identifiers, webhook replay/retry behavior, invoice-specific browser/native/device acceptance or authorized staging behavior. No live-provider action, merge or deployment was performed. Those acceptance boundaries remain explicit when assessing release readiness.

## Concurrent work and publication discipline

The original shared checkout changed during review. Its tracked and untracked work was preserved in a separate detached worktree before the final concurrency repair. No original working files were reverted. A second actor then published `49dd1f15` (the fixture import correction), `f7fcb2fd` (a preliminary Stage D ledger), `d70806e7` (the broader billing helper extraction), `4f783432` (a smaller deepmerge repair), `f97643ee` (the same module-ratchet removal) and `43b338c5` (patch hunk-coordinate correction). Those commits are retained as ancestry. The preliminary ledger is explicitly marked historical because later tests demonstrated gaps it had called guarded. The billing extraction is reconciled with the explicit provider-identity boundary above. The additional upstream deepmerge regression and install-time exploit verification are retained alongside the broader patch and strict gate. The comprehensive replacement patch already passed a fresh install. Publication uses the current remote parent and an expected-head lease; a moved branch must be reviewed before retrying.
