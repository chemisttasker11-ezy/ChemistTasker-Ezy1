# Core/shifts dependency-boundary continuation

29 October 2026 (Australia/Brisbane). Fixed parent: PR #216, `230ccff2d798d0672bea46d356616b758ea1148f`. Stack: #213 → #214 → #215 → #216 → this continuation. This source batch implements package 2 of `docs/architecture/DEPENDENCY_CYCLE_REMOVAL_PLAN_20261029.md`.

## Protected invariant and source ledger

Shift writers retain the existing dispatch callable, task/queue names, arguments, option conversion, return values, eager/non-eager behaviour, commit callback timing and queue-failure order. JSON-list input retains its list identity, empty-string compatibility and separate malformed-JSON/non-list validation messages. Existing serializer fields, permissions and API routes remain unchanged.

| Consumers | Ownership change |
| --- | --- |
| `shifts.announcements`, `assignment`, `base`, `browse`, `cancellation`, `candidates`, `counter_offers`, `emails`, `interest`, `offers`, `tasks`, `worker_requests` | Import the canonical `users.task_dispatch.async_task` already re-exported by `core.task_queue`. No dispatch implementation moves or changes in this batch. |
| `shifts.context`, `organizations.pharmacy_profile` | Import the byte-identical parser from `infrastructure.serializer_values`. |
| `core.serializer_values` | Explicit facade retaining `json_list`, `json`, `serializers` and old pickle lookup. |

All fourteen caller modules have identical non-import ASTs relative to the parent. The new parser-owner file is byte-identical to the original core file. `users.task_dispatch`, `infrastructure.task_queue`, financial/settlement code, holiday data/rates, models, migrations and task registrations are unchanged. The retired core/shifts mutual-pair exemption is removed; no scanner exclusion or deferred-import replacement is introduced.

## Before/after graph evidence

Generated with `python scripts/module_import_graph.py --json`; direct and delayed edge sets were additionally combined and their complete SCC-internal edge sets compared using that scanner's `strongly_connected_components` and `mutual_pairs` functions.

| Measure | Parent #216 | Continuation |
| --- | ---: | ---: |
| Module-level app edges | 101 | 101 |
| Delayed app edges | 71 | 71 |
| Direct mutual pairs | 5 | 4 |
| Actual direct cyclic edges, including exempt pairs | 41 | 40 |
| Direct cyclic component | 11 apps | Same 11 apps |
| Combined module/delayed mutual pairs | 35 | 34 |
| Actual combined cyclic edges | 127 | 126 |
| Combined cyclic component | 20 apps | Same 20 apps |
| Non-mutual longer-cycle ledger | 31 | 32 |

For both graphs, the actual cyclic-edge delta is exactly removal of `shifts → core`; no cyclic edge is added. The ledger's extra entry is the existing `core → shifts` sitemap dependency reclassified from the retired exemption. Passing the ratchet is not acyclic completion.

## Local verification

Python 3.12, pinned `backend/requirements.txt`, disposable SQLite using `core.contract_test_settings`, workflow placeholder environment, local-memory email backend. No live email/provider call or production database is used.

- Before movement: **4/4 behaviour tests passed**, no skips; 0.242 seconds after database setup. These tests cover all twelve dispatch bindings and both JSON parsing outcomes before the import changes.
- Initial affected selection: **370 passed, 7 skipped** (377 discovered), 33.118 seconds after setup. Seven skips are the selection's PostgreSQL-only cases. This run preceded the two final test-only ownership additions.
- Final six boundary contracts: **6/6 passed**, no skips; 0.912 seconds after setup. Includes the two added ownership/import/pickle controls.
- Final integrated affected selection: **372 passed, 7 PostgreSQL-only skips** (379 discovered), no errors/failures; 35.202 seconds after setup. All 833 backend Python file hashes remained unchanged during this final run. Manifest SHA-256: `8aee5a6f1074230f999fb47354bc8be400693da7289b7299897e7fda6337f30a`. Counts overlap with the narrower runs and must not be summed.
- Scanner unit tests: **11/11 passed**. Graph/baseline, whitespace and shell syntax checks passed. Migration drift: **No changes detected**.

The final integrated selection is:

```bash
python backend/manage.py test \
  shifts users.test_task_dispatch_boundary \
  core.test_task_contracts core.test_task_dispatch_registration \
  core.test_backend_ownership_boundaries core.test_upload_infrastructure_contract \
  core.test_serializer_decomposition core.test_serializer_lifecycle_ownership \
  organizations.test_pharmacy_profile_contract \
  --settings=core.contract_test_settings --verbosity=1 --noinput
python backend/manage.py makemigrations --check --dry-run --settings=core.contract_test_settings
python -m unittest discover -s scripts -p 'test_module_import_graph.py'
python scripts/module_import_graph.py --check --check-baseline
bash -n scripts/run-staging-qa.sh
git diff --check
```

The unchanged source and existing shift suites retain real route tests for posting/actions, eligibility, offers, cancellations, assignment history and queue-error isolation. New contracts exercise each of the twelve dispatch bindings against the registered Celery app, and prove exact payload/alias/options and notice ordering without external provider traffic. Cold and concurrent task resolution run in fresh child interpreters through the existing registration suite. Both Serializer database variants already select all `shifts`; the isolated-image script explicitly selects the new contracts and task registration/behaviour suites. No existing assertion is weakened.

## Hosted and acceptance status

Parent #216 has successful exact-head Backend Finalization (40853719212), Serializer Decomposition (40853719281), Shared Core Consolidation (40853719051), E2E Runner Smoke (40853719208) and Public Repository Security (40853719207) workflows. Its Full Isolated QA (40853719388) was skipped. These are parent results; this continuation must earn its own checks.

New-head hosted results are recorded in the draft PR. Local SQLite skips are not PostgreSQL proof. Browser/native/device, authorised staging deployment and configured provider acceptance remain distinct from source CI. The four remaining direct boundaries and longer cycles stay open in the living plan. All stacked PRs stay draft/unmerged; no retarget, merge, deployment or provider operation is performed.
