# Surgical backend implementation checkpoint — 29 October 2026

This is the first-batch historical checkpoint. The subsequent [E17 integration and invoice-source batch](SURGICAL_E17_INVOICE_BATCH_20261029.md) uses completed E17 `0e2a4a14` and records the next implementation and verification. References below to unfinished E17 describe the earlier checkpoint only.

## Status and baseline

This checkpoint implements stages **B1, B2, B3, G and H** of the surgical backend plan. It is an isolated review branch based on the completed followups, with one code commit per stage. It is **NOT MERGE-READY**: this record establishes the focused local evidence below, not the complete release package in `SENIOR_PACKAGE_TESTING.md`.

- Repository: `chemisttasker11-ezy/ChemistTasker-Ezy1`.
- Base: `fix/pr211-followups` at `2f7c40dd1ff4c5a8fd888184c3fd3ad5ca551a98`.
- Branch: `fix/surgical-backend-consistency-20261029`.
- Original five code patches: `d19acce4ae4876f8cec1a4eac98e98f00667c545` (tree `98dbe558357ac09cd0bf1aedf7f8718c95f9c311`). The subsequent CI correction below changes test applicability only.
- Main remains `25ef200f0c32b2b6fc764a4d05a648b604038794`.
- E17 remains the unfinished snapshot `12c6dc639f4d450333f7fdbdaa87baea92efc420` on `wip/e17-cover-terms`.
- Work was performed in an isolated checkout. No changes were made to another developer's worktree or to the E17 branch.

The production diff is 90 added and 56 removed lines across ten files, or 34 net added lines. Four existing test files gain the regression and characterization coverage; two further test files receive the small CI fixture corrections described below. No model, schema, endpoint, pricing, tax-policy or frontend changes are included.

## Implemented changes and preserved behavior

### B1 — persist the already-calculated generated professional-line amount

**Invariant:** an ordinary generated professional line must retain the server-calculated accepted-assignment amount when persisted.

The reproduced case is 7.50 hours at $70.03 with GST and super disabled. Before the fix, the real preview, finance calculation and initial revision showed $525.23, while the canonical saved line, generation response and legacy PDF showed $525.22.

`invoicing.services` now persists the total from the professional line it has just generated from locked accepted assignments. It does not apply a second rounding rule to that total. The source is trusted server output: client-supplied professional lines are discarded earlier in this path. The test sends a forged professional line to verify that boundary.

Manual and external lines retain their existing calculation path. The positive control preserves the current 1.50 × $3.03 result of $4.54 in those paths and ignores a submitted total of $999. The fix makes no claim of complete manual-line or GST parity across the two invoice workspaces.

Tests exercise the real preview/generation API, saved line and invoice, finance calculation, initial revision, preserved assignment evidence, duplicate-generation rejection, and rollback/retry after finance adoption fails. They invoke both actual PDF renderers and inspect the text. Both one-page PDFs were also rendered to images and visually checked for the $525.23 result. The fixture does not require a source offer.

### B2 — announce offers after their transaction commits

**Invariant:** offer and counteroffer announcements cannot escape a rolled-back business change.

The changes are confined to `shifts.assignment.offer_shift` and `shifts.counter_offers.accept_counter_offer`. Their existing notification helper uses `deliver_on_commit=True`; their existing email task is registered through `transaction.on_commit(..., robust=True)` with captured recipient/context values.

The in-app notification row remains transactional. Email recipients, task names, templates, payloads, permissions, offer terms and API responses remain unchanged. A delivery outage does not undo a committed offer. Each independent callback can run even if an earlier robust callback fails.

Repeated ordinary pending offers retain their existing no-second-announcement behavior. Reaccepting an explicit-slot counteroffer retains the existing refresh-and-announce behavior. This patch does not impose a new general notification deduplication rule.

Transaction tests call the actual endpoints inside an outer transaction, proving no external dispatch before commit, no offer/notification/callback after rollback, and preserved committed state when notification or queue delivery raises. Only external delivery boundaries are mocked.

### B3 — confirm PIN creation after commit

**Invariant:** the PIN-created confirmation describes a committed PIN, using the existing OTP and clock transaction semantics.

Only the success-confirmation block in `attendance.credentials.setup_worker_kiosk_pin` moves to a robust after-commit callback. The callback captures its recipient/message and logs a failed or unexpectedly rejected send. The existing OTP-consumption callback is still registered first. The real plain-message email wrapper, including its existing automatic in-app notification, remains the delivery owner.

The regression controls deliberately distinguish these outcomes:

| Existing outcome | PIN and OTP behavior | Confirmation |
| --- | --- | --- |
| Successful setup/clock action | PIN commits; OTP is consumed | Attempted after commit |
| Ordinary auto-clock-in validation HTTP 400 | PIN still commits; OTP is consumed | Attempted after commit |
| `CONFIRM_OPPOSITE_ACTION` HTTP 409 | PIN change rolls back; OTP stays usable | No confirmation |
| Enclosing transaction rollback or failed commit | PIN and attendance changes roll back; OTP stays usable | No confirmation |
| Delivery failure after successful commit | Committed PIN/attendance remain valid | Failure is logged |

Real PostgreSQL tests preserve the completed followups' lock ordering, concurrent review/sync behavior, OTP reuse protections and confirmed retry. The global email dispatcher, OTP setup-code email and kiosk endpoints are unchanged.

These small after-commit callbacks do not provide durable retry or exactly-once external delivery. In particular, B3 preserves the existing non-robust OTP callback; a failure in that earlier callback remains outside this patch's delivery guarantee.

### G — share pharmacy scope, retain each action's authority

**Invariant:** shared scope facts do not collapse different action permissions.

`users.org_roles.membership_covers_pharmacy` delegates to the existing organization-wide capability and visible-pharmacy owners, with an explicit organization match. Four duplicated fragments use it: workforce's organization capability check and membership invitation, membership change and application decision checks.

Each caller retains its actor checks, action-capability check, owner/platform exceptions and membership protections. Billing, pairing and attendance permission owners remain separate.

The new matrix characterizes 12 role/scope scenarios across seven actions. Assigned Region Admins at roster or communication levels retain their invitation authority while staff management, roster/attendance review and pairing remain distinct. An unassigned pharmacy or a foreign-organization pharmacy mistakenly included in the assignment M2M cannot confer authority. Unsupported roles remain denied. Existing tests cover direct pharmacy administrators, owner-derived memberships and wider organization roles.

### H — remove only the duplicate public onboarding calls

**Invariant:** public opportunity actions retain their current onboarding/AHPRA decisions and transaction-time rechecks.

The first `require_public_ahpra` call already performs the onboarding check for the public, non-member case, including when AHPRA enforcement is off. The second direct onboarding call is removed from express interest, counteroffer POST and offer acceptance. Only unused imports are removed with it.

The first guard stays in its original position in each route. Existing error ordering, role checks, public/internal/member exceptions and the viewset's historical member-access alias remain. All `lock_public_ahpra` calls remain in their booking transactions.

Two new endpoint characterization tests cover missing, unverified and verified pharmacist profiles with enforcement on and off. Existing interest contracts cover its corresponding behavior. The booking and AHPRA race tests exercise the preserved locked recheck on PostgreSQL.

## Executed evidence

Dependencies were installed from the repository's pinned `backend/requirements.txt` into an isolated Python 3.12 environment. The runs used Django 5.2.17; PDF checks used the actual pinned WeasyPrint and PyMuPDF. PostgreSQL runs used a disposable PostgreSQL 16.15 cluster listening only on localhost, with independent test databases. They did not use production credentials or data.

The repository's published CI dummy environment was used. PostgreSQL runs additionally used `APP_ENV=test` and the disposable database connection. No tests were weakened, skipped artificially, or redirected to a fake locking implementation.

| Selection | Result | Settings |
| --- | --- | --- |
| Invoice integrity, finance calculations, real PDF rendering | 53 passed; no skips | `core.contract_test_settings` |
| Offer/counteroffer responses and transaction delivery | 14 passed; no skips | `core.contract_test_settings` |
| Full PIN/clock locking module | 18 passed; no skips | `core.postgres_test_settings` |
| Scope, memberships, workforce, pairing and attendance approval | 79 passed; no skips | `core.postgres_test_settings` |
| Shift actions, AHPRA application and onboarding regressions | 96 run: 94 passed, 2 PostgreSQL-only skips | `core.contract_test_settings` |
| Relevant AHPRA suspension and offer-confirmation races | 2 passed; no skips | `core.postgres_test_settings` |
| Ownership boundaries, module-size ratchet, task contracts/registration | 91 passed; no skips | `core.contract_test_settings` |
| Migration drift | No changes detected | `makemigrations --check --dry-run` |
| Import graph | No new violations against the reviewed baseline | `--check --check-baseline` |
| Whitespace/error check | Passed | `git diff --check` |

Counts overlap between focused selections and must not be added together as a unique-test total. The SQLite skips were `OfferConfirmationRaceTests.test_b54_only_one_simultaneous_worker_reserves_or_books_the_occurrence` and `UnlinkedCoverApprovalPostgresTests.test_concurrent_approvals_publish_one_vacancy`. The relevant offer-confirmation race is rerun on PostgreSQL. The unrelated unlinked-cover race is not newly verified by this checkpoint.

The import checker still prints pre-existing cyclic edges/SCCs. Exit zero establishes no new mutual-pair or reviewed-cycle-baseline regression; it does not establish an acyclic backend.

### Red/green and characterization sequence

- B1's new real-API/PDF half-cent case failed against the unchanged production calculation; the other targeted controls passed. The narrow persistence fix made the full selected invoice suite green.
- B2's commit/rollback/outage tests exposed external dispatch before commit and failure propagation on unchanged production code. Existing successful/repeated-request behavior passed before the fix and stayed green afterwards.
- B3's seven selected tests produced nine expected assertion failures against unchanged production on PostgreSQL. The same selection passed after the callback change, followed by all 18 clock-locking tests.
- G's nine scoped-role tests, including the new matrix, passed before extraction. The final 79-test selection passed after extraction on PostgreSQL.
- H's two new methods characterized all 12 endpoint/profile/enforcement combinations before the duplicate calls were removed. The combined suite passed after the cleanup.

An initial G selection used SQLite for a class that explicitly requires PostgreSQL: 69 tests executed successfully and the pairing class rejected that environment before running. The final 79-test PostgreSQL run replaces that incomplete result. Initial sandbox-denied PostgreSQL connection attempts executed no tests; they are environment setup failures, not test regressions.

Independent read-only review found no blocking issue in B1/B2 or G/H. Production and test diffs were also reviewed centrally. Each remote code tree is compared with an independently computed local Git tree hash from the tested file snapshot before publication.

### Hosted integration follow-up

The first published head, `eb0c51f00e002ee23405d1959130aa68354cc501`, received additional hosted evidence:

- [Backend Finalization Contracts](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/actions/runs/40793553599) passed on SQLite and PostgreSQL. The 71-test PostgreSQL selection had no skips; SQLite had eight intentional skips and also passed its three isolated adapter selections.
- [Serializer PostgreSQL](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/actions/runs/40793553596/job/123184377635) passed all 546 tests with no skips.
- [Serializer SQLite](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/actions/runs/40793553596/job/123184377451) exposed a fixture setup error followed by eight offer-callback subcase failures. This was investigated and corrected, not treated as passing evidence.

`LocumApprovalGateTests` inherits a PostgreSQL-only fixture and Django `TestCase`. The fixture called `super().setUpClass()` before rejecting SQLite, opening a class transaction before raising. Unittest does not run `tearDownClass` after failed class setup, so the transaction remained open and suppressed subsequent `TransactionTestCase` commit callbacks. A reduced selection of the locum approval class followed by the new offer transaction tests reproduced exactly eight failures and one setup error.

The correction is a class-level PostgreSQL applicability guard in `workforce/tests/test_locum_approval_gate.py`, evaluated before fixture setup. It adds five lines, changes no production behavior, and leaves every approval assertion and the PostgreSQL workflow selection intact. All ten tests in the locum-approval plus offer-transaction selection pass on PostgreSQL after this correction, with no skips. The full corrected SQLite serializer selection runs 546 tests successfully: 529 passed and 17 intentional skips. Five of those skips are this PostgreSQL-only class, whose tests execute and pass on PostgreSQL.

The first [Shared Core PostgreSQL job](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/actions/runs/40793553587/job/123184377813) also found one existing test-helper error across 339 tests. A suspended-worker request was correctly denied by the AHPRA middleware's Django `JsonResponse`, but the refusal helper evaluated DRF-only `response.data` as its assertion-message argument. That crashed before completing its status and no-attendance assertions. The same single test reproduced the error locally with enforcement enabled.

The one-line correction uses the common `response.content` attribute for that diagnostic message. It does not alter the accepted denial statuses, no-attendance assertions, middleware or eligibility policy. All 43 unbooked-locum and workforce-approval tests pass on PostgreSQL with enforcement enabled after the correction. This line in `attendance/test_unbooked_locum_cover.py` should be preserved when integrating the final E17 test changes; it does not modify the active E17 branch.

The initial mobile job also fails the live dependency audit for `GHSA-gcqx-w48m-w2h4` (`deepmerge`). The [same failure on main before this work](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/actions/runs/40650008013/job/122687825085), together with identical base-to-head dependency and security-gate blob IDs, establishes a separate existing blocker. Mobile lint, type checking and dependency regression checks passed before the live audit rejection. The audit stops at the first unhandled advisory, so this evidence does not establish that it is the only remaining advisory. The backend patch does not change or waive the mobile gate.

Hosted results above belong to their stated source head. The test-only correction requires fresh final-head CI evidence; earlier successful jobs are not relabeled as final-head passes. PR #213's description and the plan execution status record the later observed results without forcing a new application-code commit for status-only changes.

### Reproducible selections

Run these from the repository root using the pinned dependencies and the workflow's dummy environment. For PostgreSQL, point `LOCAL_DB_*` at a disposable PostgreSQL 16 database and set `APP_ENV=test`.

```bash
python backend/manage.py test \
  invoicing.test_integrity worker_finance.tests.test_calculations \
  core.test_pdf_rendering_contract \
  --settings=core.contract_test_settings --noinput

python backend/manage.py test \
  shifts.test_shift_actions_contract.OfferNotificationCommitTests \
  shifts.test_shift_actions_contract.AcceptUserTests \
  shifts.test_shift_actions_contract.CounterOfferTests \
  --settings=core.contract_test_settings --noinput

python backend/manage.py test attendance.test_clock_locking \
  --settings=core.postgres_test_settings --noinput

python backend/manage.py test \
  users.test_org_role_scope organizations.test_pr201_scoped_roles \
  memberships.test_membership_workflows_contract \
  workforce.tests.test_roster_admin_capabilities \
  workforce.tests.test_employment.WorkforceCapabilityPermissionTests \
  attendance.test_kiosk_pairing.WebPairingAuthorityTests \
  attendance.test_approval_locking.ApprovalLockingContracts \
  --settings=core.postgres_test_settings --noinput

python backend/manage.py test \
  shifts.test_shift_actions_contract shifts.test_ahpra_application_gates \
  onboarding.test_review3_fixes onboarding.test_review_183_fixes \
  --settings=core.contract_test_settings --noinput

AHPRA_ENFORCEMENT_ENABLED=true python backend/manage.py test \
  client_profile.test_postgres_concurrency.AhpraSuspensionAcceptRacePostgresTests \
  shifts.test_shift_actions_contract.OfferConfirmationRaceTests \
  --settings=core.postgres_test_settings --noinput

python backend/manage.py test \
  core.test_backend_ownership_boundaries core.test_module_size_ratchet \
  core.test_task_contracts core.test_task_dispatch_registration \
  --settings=core.contract_test_settings --noinput

python backend/manage.py makemigrations --check --dry-run \
  --settings=core.contract_test_settings
python3 scripts/module_import_graph.py --check --check-baseline
```

The CI fixture correction is verified with the exact SQLite serializer selection and a required PostgreSQL preservation control:

```bash
python backend/manage.py test \
  core.test_serializer_decomposition core.test_runtime_contract \
  core.test_promoted_model_import_ownership core.test_module_size_ratchet \
  core.test_backend_ownership_boundaries core.test_public_error_surface \
  core.test_serializer_lifecycle_ownership shifts pharmacy_hub dashboards workforce.tests \
  --settings=core.contract_test_settings --verbosity=1 --noinput

python backend/manage.py test \
  workforce.tests.test_locum_approval_gate \
  shifts.test_shift_actions_contract.OfferNotificationCommitTests \
  --settings=core.postgres_test_settings --verbosity=2 --noinput

AHPRA_ENFORCEMENT_ENABLED=true python backend/manage.py test \
  attendance.test_unbooked_locum_cover workforce.tests.test_locum_approval_gate \
  --settings=core.postgres_test_settings --verbosity=1 --noinput
```

The 14-test B2 result predates H's extra counteroffer characterization method. Running that particular selection on the combined branch includes the additional method; H's combined gate already includes all B2 tests on the final production source.

## Integration and remaining plan

The review target is `fix/pr211-followups`, preserving PR #211 and B/CLOCK/C/D/L in the ancestry. A comparison against main would include those existing changes and obscure this checkpoint's scope. The unfinished E17 snapshot is neither the base nor an integration substitute for its corrected final commit.

| Remaining stage | Next concrete step |
| --- | --- |
| A — E17 | Current owner finishes the actual cover-terms implementation and gates; record the final SHA and review its delta from the snapshot. |
| C — accepted invoice source | After final E17, share original accepted-assignment facts across the existing consumers, including accepted cover with no source offer. Preserve authorized correction/revision behavior. |
| D — occurrence protection | Reuse E17 and existing booking guards. Add only missing cross-route mutation/race coverage and fix demonstrated residual gaps. |
| E — legacy invoice delivery | Separate lifecycle patch using the existing Delivery/bridge reservation and exact revision, including definite failure versus uncertain acceptance. The small offer/PIN callbacks are not this durable financial workflow. |
| F — monetary conventions | Resolve concrete GST default and aggregate-versus-per-line examples before aligning saved revisions. B1 does not select that policy. |
| I — billing extraction | Conditional, after financial preservation/provider evidence; one cohesive operation at a time. |
| J — time geometry | Conditional, after differential proof preserves each caller's segmentation, precision, holiday/review semantics and rate policy. |

When E17 lands, integrate it on this isolated line through an ordinary reviewed merge/rebase, resolve shared-file changes deliberately, and rerun the affected integration selections against the resulting source. Do not overwrite the active E17 branch or treat its earlier reviews as proof for a different final tree.

No live SMTP, push-provider or Stripe acceptance, Docker staging migration rehearsal, browser/native acceptance, physical-device run, deployment or merge is claimed here. Remote workflow results must be evaluated against the published head; local results do not imply a passing full release package. Preserve the **NOT MERGE-READY** designation until the applicable final-head gates and owner release decision are complete.

## Rollback

Each code stage is an independent commit. Revert the relevant commit, resolving any later shared-file test changes normally; no schema or data rollback is required for these patches. Existing issued invoices are not rewritten. Reverting code cannot retract notifications or emails already sent, and no such claim is made.

The first subsequent integration checkpoint remains the final E17 contract: approved, worker-accepted contractor cover must become an ordinary invoice source while existing staff/payroll and attendance controls remain distinct.
