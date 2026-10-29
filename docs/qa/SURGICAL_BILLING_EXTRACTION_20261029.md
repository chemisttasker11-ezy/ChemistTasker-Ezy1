# PR #213 — billing account helper extraction

Date: 29 October 2026 (Australia/Brisbane). Continuation baseline: `0bc2da97c8d31c511bd0f7ccece60a7d9f834e91` on `fix/surgical-backend-consistency-20261029`, targeting completed E17 on `fix/pr211-followups`.

## Outcome and scope

The earlier checkout-return URL extraction remains in `billing/checkout_urls.py`. The final bounded continuation extracts four local subscription-account helpers into `billing/subscriptions.py`: account lookup, current subscription selection, get-or-create/contact refresh, and response serialization. HTTP authorization, metadata construction, provider identity resolution and provider lifecycle ownership stay in `billing/views.py`.

Concurrent upstream commit `d70806e755d581c3f8beb85afb0f860e59e8db47` extracted eight helpers. It was reviewed and preserved as ancestry, then narrowed explicitly because the handover says not to move provider identity handling. Its two metadata builders and two metadata/customer lookup helpers are restored to their original view definitions unchanged. All six upstream test cases remain, with only their imports adjusted for that ownership; our 14 independent account/HTTP contracts also remain. No upstream functionality or test assertion was discarded.

The four extracted private names remain aliases in `billing/views.py`, preserving endpoint call sites and direct imports or patches of those aliases. The moved helpers resolve their internal lookup in their owning module; the repository search found no caller relying on patching that internal lookup through `billing.views`.

The protected rule is: **a permitted billing action uses the same account, subscription precedence, provider identity and response as before; an unauthorized actor cannot create or read an account through these endpoints.**

Reading a subscription and creating one deliberately differ. An organization whose primary plan is absent or inactive may read its owner's active subscription. Starting a subscription still creates/uses the organization's primary record. The extraction preserves this distinction instead of inventing one universal account selector.

The HTTP account resolver remains in `views.py` because it combines pharmacy lookup, action authorization and HTTP error responses. Metadata construction and local metadata/customer matching also remain there, preserving their values, precedence and query behavior. Endpoint decorators, provider calls, subscription lifecycle mutations, webhook reconciliation, transaction boundaries and idempotency remain in `views.py`. No invoice generation, tax, super, money, model, migration, price ID or provider configuration changes are included.

## Guard and caller ledger

| Route or writer | Guard/owner | Evidence and status |
| --- | --- | --- |
| Account-to-subscription lookup | `billing/subscriptions.py:12` | Organization takes precedence; owner fallback is retained when no organization object is present; missing owner retains the existing `ValueError`. Characterized before and after movement. |
| Read subscription for a billing account | `billing/subscriptions.py:21` | Active organization wins, otherwise an active owner plan may be used, otherwise the primary record/absence is retained. The full 3 × 3 organization/owner status matrix is characterized. No authorization is inferred by this data helper. |
| Create/find primary account and refresh contact | `billing/subscriptions.py:39` | Always uses primary account identity, preserves existing provider IDs/entitlements, updates only an explicitly supplied changed contact, and never clears a contact for missing input. Caller rollback controls cover both creation and contact refresh. |
| Metadata construction and local provider-record lookup | `billing/views.py:111`, `:129`, `:141`, `:154` | Retains the original owner and exact metadata keys/values, extra-seat clamp, organization → owner → actor matching precedence and customer lookup. Upstream direct controls and our exact checkout assertions remain. |
| Response projection | `billing/subscriptions.py:57` | Retains the existing absent/present response shapes, minimum-five seat display, explicit provider IDs, ISO period and inactive/canceled behavior. The absent response deliberately continues to omit `stripeExtraSeatSubscriptionId`. |
| `GET /api/v1/billing/subscription/` | `billing/views.py`, `current_subscription` → `_current_account_for_user` | Owner and organization-admin positive controls; delegated chief admin denied; organization actor without pharmacy gets 400; unknown pharmacy gets 404. Reading leaves record count, contact and statuses intact, without provider calls. |
| `POST /api/v1/billing/subscribe/` | `billing/views.py`, `create_subscription_checkout` → `_current_account_for_user` | Authorized organization checkout creates its primary record even with an active owner fallback. Exact customer identity, checkout metadata and mobile return URLs are retained. Unauthorized checkout creates no account and calls no provider. |
| Seat changes, shift fulfillment and cancellation | Existing endpoint bodies in `billing/views.py` | Existing helper calls retain their old names. All remaining function bodies/decorators are AST-identical; focused billing endpoint tests cover subscriber pricing, operational payer vs subscription authority and seat behavior. |
| Stripe webhook/provider lifecycle | Existing `_process_stripe_event` and `stripe_webhook` in `billing/views.py` | Provider metadata/customer lookup definitions, lifecycle function bodies/decorators and helper call sites retain their original owner and behavior. This does not establish real provider configuration, delivery or replay acceptance. |
| Admin, task, serializer and direct-query callers of the four extracted helpers | Repository-wide name/reference search | No additional runtime caller outside `billing/views.py` was found. Direct administration/model writes are unchanged and are not routed through a new permission abstraction. |

## Preservation proof

Before the first local extraction, 14 new account/HTTP contracts, five existing URL tests and five official module-size tests passed: **24/24**, zero failures/errors/skips (1.953 seconds after real-migration setup). These are characterization tests of the already accepted behavior, not claimed failing-first defect regressions. The retained log was checked during independent review; the final integrated source is verified separately below.

An AST comparison against the continuation baseline found:

- All **four** finally extracted function bodies/signatures are identical after normalizing only their leading-underscore helper names and the two internal calls to the renamed lookup helper.
- All **18** functions remaining in the final `billing/views.py`, including their decorators and the restored metadata/provider lookup helpers, are unchanged.
- The helper module imports only its existing local billing model. No generic shared domain owner was introduced.
- The concurrent eight-helper upstream candidate also passed the AST comparison, but semantic equivalence did not override the user's explicit ownership boundary. Its six test class bodies remain AST-identical after the import adjustment.

Repository search found no existing test or runtime caller patching the moved helpers' internal dependency lookup through `billing.views`; direct view aliases remain patchable. No mock was repointed to a disconnected implementation.

## Official module-size ratchet

The count was obtained from the repository's own `core.test_module_size_ratchet.module_sizes()` and its AST/tokenizer `code_lines()` implementation, not physical lines or a guessed threshold.

| Module | Before this continuation | Broader upstream candidate | Final bounded extraction |
| --- | ---: | ---: | ---: |
| `billing/views.py` | 1,014 code lines | 923 | **960 code lines** |
| `billing/checkout_urls.py` | 49 | 49 | 49 |
| `billing/subscriptions.py` | Absent | 102 | **61** |

The old allowance was 1,047. On the first four-helper candidate, the official `test_entries_of_decomposed_modules_are_removed` test failed exactly with `{'billing/views.py': 960}` and instructed removal because 960 is below the existing 999-code-line review threshold. Its stale `LARGE_MODULES` entry was then removed. The final bounded implementation also measures 960 by the same official function, so that removal remains required. No threshold, tolerance or test assertion was raised or relaxed; growing above 999 now triggers the ordinary new-large-module guard.

## Earlier four-helper candidate execution record

Tests use the full pinned backend environment, dummy credentials, locmem email and a disposable local database. All Stripe operations exercised by the focused tests are mocked.

| Selection | Result |
| --- | --- |
| Before extraction: URL + new subscription contracts + module-size ratchet, SQLite | 24/24 passed; no skips. |
| After extraction, before ratchet reconciliation: stale-entry contract | One expected failure at measured size 960, proving the existing ratchet requires removal. |
| After extraction: complete billing app + module-size and backend ownership contracts, PostgreSQL 16 | **139/139 passed**, no failures/errors/skips; 17.061 seconds after real-migration setup. Includes the 14 new account tests, all five URL tests and all three existing billing PostgreSQL concurrency controls. |
| Runtime import graph with existing mutual-pair and longer-cycle baseline checks | Passed before and after. Identical app edges: 97 module-level, 72 delayed, seven mutual pairs, same existing SCC/cycle-edge set. This establishes no graph regression, not an acyclic backend. |
| Whitespace | `git diff --check` passed. |

Executed targeted commands (through the local hermetic runner):

```text
python3 /workspace/scratch/7c622ce304dd/run_pr213_backend.py test billing.test_checkout_urls billing.test_subscription_accounts core.test_module_size_ratchet --settings=core.contract_test_settings --verbosity=2 --noinput
python3 /workspace/scratch/7c622ce304dd/run_pr213_backend.py test core.test_module_size_ratchet.ModuleSizeRatchetTests.test_entries_of_decomposed_modules_are_removed --settings=core.contract_test_settings --verbosity=2 --noinput
PR213_TEST_DB=pr213_billing python3 /workspace/scratch/7c622ce304dd/run_pr213_backend.py test billing core.test_module_size_ratchet core.test_backend_ownership_boundaries --settings=core.postgres_test_settings --verbosity=2 --noinput --keepdb
python3 scripts/module_import_graph.py --json --check --check-baseline
```

The two selections overlap; counts are not a unique-project-test total. Automatic final-head CI is recorded by the integration checkpoint, not inferred from these local results. This batch completes the next scoped Stage I extraction; wider webhook decomposition remains conditional on a separate justified ownership improvement and preservation proof. PR #213 remains draft, unmerged and undeployed.

## Independent review of the earlier four-helper candidate

A separate review of the recovered working changes compared the four helper ASTs and all 18 remaining view function/decorator ASTs directly with `0bc2da97`. The equivalence checks passed. The review also inspected every repository reference to the old helper names, the subscription model constraints, endpoint authorization, provider mocks and the account/response contracts. No production correction or additional extraction was needed.

The earlier characterization, stale-ratchet failure and PostgreSQL result above were corroborated against their retained logs. Independent fresh execution on the reviewed working source then produced:

| Check | Fresh result |
| --- | --- |
| Five checkout URL tests, 14 subscription account/endpoint tests and five official module-size tests, SQLite | **24/24 passed**, no failures/errors/skips; 1.804 seconds after full migration setup. |
| Complete billing app plus module-size and backend ownership tests, disposable PostgreSQL 16 database `test_pr213_billing_review` | **139/139 passed**, no failures/errors/skips; 19.475 seconds after full migration setup. All three `FinancePostgresConcurrency` methods executed and passed. |
| Official size function | Confirmed 1,014 code lines at the starting head and 960 after extraction, with 61 in `subscriptions.py` and 49 in `checkout_urls.py`; existing review threshold remains 999. |
| Import graph gate and before/after comparison | Passed; app edge identities/counts, seven mutual pairs and the existing SCC are unchanged. Source line anchors naturally changed. |
| Whitespace | Passed for the reviewed change. |

The fresh PostgreSQL command is the command above with `PR213_TEST_DB=pr213_billing_review`. Its first sandboxed attempt could not connect to the local disposable cluster and executed no tests; the permitted loopback invocation supplied the passing result. No application credentials or real provider calls were used. These are reviewed working-source results, not a claim about a future published head; the final integration checkpoint must associate hosted results with the actual published SHA.

## Concurrent upstream integration and final bounded-source proof

The concurrent `d70806e7` eight-helper version was first reviewed and run intact: **30/30** direct SQLite tests passed in 1.919 seconds and **145/145** billing/ownership PostgreSQL tests passed in 21.857 seconds, with no failures/errors/skips. These are intermediate results only. After reapplying the explicit instruction to keep provider identity handling in its current owner, four metadata/provider lookup definitions were restored unchanged to `views.py`. The six upstream test bodies and every assertion were retained, with imports pointed at their restored private view aliases. This is an explicit ownership correction on top of the upstream history, not an unreviewed overwrite or removal of its tests.

The final scope is the four-helper extraction described at the top of this document. All 18 view function bodies/decorators and all four extracted helper bodies/signatures were compared with `0bc2da97` again and remained equivalent. The complete upstream test class body also remained AST-identical.

Final verification used the isolated checkout `/workspace/scratch/7c622ce304dd/pr213-reviewed-final`, rather than the checkout affected by an unexplained concurrent writer. All 32 billing/core Python file hashes in the recorded test manifest were identical before and after both final runs.

| Final-source selection | Result |
| --- | --- |
| Five checkout URL tests, six preserved upstream subscription tests, 14 independent account/HTTP tests, five module-size tests; SQLite | **30/30 passed**, no failures/errors/skips; **1.568 seconds** after full migration setup. |
| Complete billing app, module-size and backend ownership contracts; unique disposable PostgreSQL database `test_pr213_billing_scope_b84f` | **145/145 passed**, no failures/errors/skips; **18.805 seconds**. All three finance concurrency controls executed and passed. |
| Official code-line measurements | `billing/views.py` **960**, `billing/subscriptions.py` **61**, `billing/checkout_urls.py` **49**. Threshold 999 and all ratchet assertions unchanged; no stale large-module allowance. |
| Import graph | Passed; 97 module-level app edges, 72 delayed edges, seven existing mutual pairs, no new SCC, cycle edge or mutual pair. |
| Source manifest and whitespace | Before/after billing/core manifest identical; `git diff --check` passed. |

The unique PostgreSQL database was cloned from a completed disposable test database after the source run exited. It was not shared with the concurrent actor, contained no live data, and required no production migration. All provider interactions in these tests were mocked. The direct and complete selections overlap and must not be added as unique tests.

```text
python3 /workspace/scratch/7c622ce304dd/run_pr213_final.py test billing.test_checkout_urls billing.test_subscriptions billing.test_subscription_accounts core.test_module_size_ratchet --settings=core.contract_test_settings --verbosity=2 --noinput

PR213_TEST_DB=pr213_billing_scope_b84f python3 /workspace/scratch/7c622ce304dd/run_pr213_final.py test billing core.test_module_size_ratchet core.test_backend_ownership_boundaries --settings=core.postgres_test_settings --verbosity=2 --noinput --keepdb

python3 scripts/module_import_graph.py --json --check --check-baseline
```

Final working-source logs are `billing-final-scope-direct.log` and `billing-final-scope-postgres.log`; source manifests are `billing-final-scope-source-before.json` and `billing-final-scope-source-after.json`. Published-head CI must still be recorded by the integration owner against the actual committed SHA. No merge, deployment or live provider action is part of this verification.
