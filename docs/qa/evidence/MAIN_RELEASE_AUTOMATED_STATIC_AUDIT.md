# PR #200 full-tree automated static audit

Inspected HEAD: 4ad9e9326352c27ba9ae9615fd5043fb1cd3c0a2
Frozen main baseline: b77e9fd296bc2710350ef6f3cd402ce2529ffc06
Generated UTC: 2026-10-24T21:17:07.676070+00:00

## Scope and evidence

- Source-file content read and Git blob SHA checked: 2151/2151 (100.0%).
- Existing baseline-branch tracked source files inspected: 2150/2150.
- Python AST parse passes / failures: 777 / 0.
- Read / immutable Git blob hash failures: 0.
- Manual source certification: 0 claimed. Static-file coverage does not establish application correctness.

## Static signal inventory (not confirmed vulnerabilities)

| Signature | Matching source files |
| --- | ---: |
| TENANT_SCOPE_REFERENCE | 100 |
| FINANCE_IDEMPOTENCY | 71 |
| FILE_UPLOAD | 31 |
| CASCADE_DELETION | 25 |
| BROAD_OBJECTS_ALL | 22 |
| AUTH_ALLOW_ANY | 20 |
| AWARD_RATE_REFERENCE | 20 |
| DIRECT_WEB_TRANSPORT | 18 |
| RAW_SQL | 17 |
| ORG_WIDE_ROLE | 15 |
| DYNAMIC_EVAL_EXEC | 14 |
| BROWSER_TOKEN_STORAGE | 6 |
| AUTH_OVERRIDE | 5 |
| WEB_REDIRECT | 5 |
| CSRF_EXEMPT | 4 |
| STRIPE_PAYMENT | 4 |
| AUTH_EMPTY_CLASSES | 3 |
| HTML_INJECTION_SINK | 1 |

See MAIN_RELEASE_SOURCE_COVERAGE.csv for each checked source path, blob SHA, rule hits and inspection limit.
See MAIN_RELEASE_STATIC_FLAGS.csv for exact paths and line locations requiring expert triage.

**Decision: NOT RELEASE-READY.** This scanner never exercises permissions, transactions,
concurrency, web/mobile UI, security exploits, migrations or deployment. Each B01-B23
finding still needs independent validation; no code fixes were attempted.
