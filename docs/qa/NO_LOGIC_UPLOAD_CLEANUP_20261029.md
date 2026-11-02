# Behaviour-preserving upload infrastructure cleanup

29 October 2026 (Australia/Brisbane). Base: `737e82bcc433e7513fd341251570f1ac2af86073` on PR #213. Cleanup branch: `refactor/no-logic-upload-infrastructure-20261029`, intended as a separate stacked draft PR targeting PR #213's branch. Billing implementation remains untouched.

## Contract and change

The same uploaded file and policy must produce the same acceptance/rejection, error text and file-stream position through every existing upload route. Historical imports must continue resolving to the same implementation and policy objects.

Chat imported `core.file_validation` for neutral upload infrastructure, while core imports chat to compose URLs/WebSocket routes. The validator now lives in `infrastructure.file_validation`, a plain Python package with no Django app registration, models, migration state, business-domain imports or reverse dependency on core. Seven runtime consumers now import the lower-level owner directly. `core.file_validation` explicitly re-exports all historical validators, policies, the dataclass and its imported dependencies, including private sniff/read helpers.

The new implementation file is **byte-for-byte identical** to the old file at the immutable base. SHA-256: `420564a2cd9568d18f6ca635155de487ee3636c3d28a4a71098948c6c46416d2`. No validation rule, signature, exception, policy limit, permitted extension/content type, ZIP/document inspection or stream-restoration logic changed. Direct historical imports share the same objects, and the historical pickle class path is tested. No field/migration path, Django app label, table or Celery task identifier changes.

Runtime caller ledger:

| Caller | Change and evidence |
| --- | --- |
| `chat/views.py` | Direct import of the same attachment policy/validator; chat API and WebSocket contracts pass. |
| `core/serializer_mixins.py` | Same mapping validator now imported from infrastructure; all serializer execution/order remains unchanged. |
| `onboarding/serializers.py` | Same document/image policy objects; role-tab and skill-review contracts pass. |
| `onboarding/services/skills.py` | Same document validator; no evidence/eligibility decision altered. |
| `organizations/serializers.py` | Same document/image objects; multipart/pharmacy upload contracts pass. |
| `pharmacy_hub/scoping.py` | Same attachment validation; positive and invalid multi-file update cases pass. |
| `pharmacy_hub/serialization/profiles.py` | Same image policy object; hub API contracts pass. |
| Historical `core.file_validation` | Compatibility adapter has no duplicate function/class/validation implementation; identity and legacy pickle-path controls pass. |

## Dependency evidence and honest limits

| Metric | Base | Cleanup |
| --- | ---: | ---: |
| Direct mutual app pairs | 7 | 6 |
| Actual SCC-internal cyclic edges | 43 | 42 |
| Direct cyclic components | 1 (11 apps) | 1 (same 11 apps) |
| Direct app edges | 97 | 101 |
| Delayed app edges | 72 | 72 |

Direct edge count rises because infrastructure is explicitly represented as a new lower-level dependency sink, not excluded from the scanner. The specific `chat → core` dependency is removed. The longer `core → chat → other domains → core` paths remain; no zero-cycle claim is made.

The exact mutual-pair exemption `chat/core` is removed. The retained `core → chat` composition edge remains inside a longer cycle and therefore moves into the non-mutual cycle ledger. That ledger's count becomes **30 instead of 29**, while actual cyclic edges shrink from 43 to 42. This is a classification change, not a newly accepted runtime dependency. A direct set comparison proved the cleanup's full cyclic-edge set is a strict subset of the base's set. The historical attendance/workforce component was already absent and is removed from the stale baseline. No scanner exclusion, function-local import shuffle, widened cycle allowance or fake zero-cycle result was used.

The wider combined direct-plus-delayed graph is still cyclic. This batch does not certify zero runtime cycles or complete the broader architecture programme.

## Validation

Before source movement, the existing selection passed **67/67**, no skips/failures/errors; 11.127 seconds after real SQLite migration setup.

Final source, Python 3.12.14 / Django 5.2.17 / `core.contract_test_settings`:

```bash
python backend/manage.py test \
  core.test_upload_infrastructure_contract core.test_kernel_utility_ownership \
  core.test_backend_ownership_boundaries core.test_module_size_ratchet \
  core.test_signal_registry_contract core.test_task_dispatch_registration \
  chat.test_api chat.test_websocket organizations.test_pharmacy_upload_contract \
  onboarding.test_role_tabs_contract onboarding.test_skill_review_regressions pharmacy_hub.test_api \
  --settings=core.contract_test_settings --verbosity=1
```

**162/162 passed**, zero skips/failures/errors; 18.443 seconds after setup. Five new compatibility/layering contracts are explicitly selected in Shared Core's backend command and both Serializer workflow database variants. The only changes after the final local product-source run are evidence and CI discovery selections.

- Canonical import scanner test command: `python3 -m unittest discover -s scripts -p 'test_module_import_graph.py' -v`: **11/11 passed**.
- `python3 scripts/module_import_graph.py --check --check-baseline`: passed.
- Migration drift: no changes.
- Whitespace: passed.
- Validator byte comparison against base: identical.
- Billing diff against base: none. No monetary, permission, settlement, provider retry or notification-delivery semantics changed.

The base billing commit's hosted checkpoint is verified independently: all seven applicable workflows passed, including Full Isolated QA and Shared Core's ten child jobs; native QA was conditionally skipped. Cleanup-head hosted CI must be evaluated separately after publication. No local PostgreSQL locking proof, real provider, native/device, staging or deployment acceptance is claimed for this source move.

## Discussion boundary

This is structural cleanup only. Do not implement the previously proposed changes to invoice rounding/GST, billing activation, trial anchors, provider retry semantics, penalty timing, payroll settlement guards, eligibility outcomes or message retry/failure responses without discussing them with the user first. Further behaviour-preserving dependency cleanup remains permitted, but must preserve real compatibility and describe remaining cycles honestly. No merge or deployment is authorized.
