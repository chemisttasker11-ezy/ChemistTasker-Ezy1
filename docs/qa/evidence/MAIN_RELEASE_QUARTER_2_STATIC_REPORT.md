# PR200 538-file quarter static inspection report

Frozen main: b77e9fd296bc2710350ef6f3cd402ce2529ffc06
Scanner HEAD: 4ad9e9326352c27ba9ae9615fd5043fb1cd3c0a2
Complete file blobs read with matching Git SHA: 538 / 538
Files independently context/semantically reviewed: 0
Read, SHA or AST errors: 0
Unique files with static risk signatures (not confirmed defects): 348

## Source groups

| Group | Count |
|---|---:|
| backend | 235 |
| mobile | 95 |
| shared-core | 63 |
| web-Next | 50 |
| web-Vite | 95 |

## Pattern signals for targeted manual follow-up

| Signal | Matching files |
|---|---:|
| TENANT_ID | 162 |
| DB_WRITE | 121 |
| UNSCOPED_DB | 118 |
| UI_ROUTE | 116 |
| FINANCIAL | 87 |
| TRANSACTION | 42 |
| ROW_LOCK | 37 |
| MUTATION_ROUTE | 35 |
| PERMISSION | 32 |
| EXCEPTION_SWALLOW | 20 |
| SERIALIZER_SAVE | 18 |
| UI_ROLE_GATE | 11 |
| BROWSER_STORAGE | 6 |
| FOREIGN_KEY_INPUT | 2 |
| DIRECT_NETWORK | 1 |

Every source path, frozen SHA, lines read, earliest signature positions and evidence state are in the quarter CSV ledger.
**This is automated inspection, not 538 independent senior semantic reviews.** New B35+ gaps require a separate request-to-data trace and missing negative test.
