# ChemistTasker PR #200 — Deep review evidence register (B43–B51)

**Reviewed frozen source:** `b77e9fd296bc2710350ef6f3cd402ce2529ffc06`.
**Documents:** [Wave 6](MAIN_RELEASE_DISCOVERY_WAVE_6.md) · [Wave 7](MAIN_RELEASE_DISCOVERY_WAVE_7.md) · [Wave 8](MAIN_RELEASE_DISCOVERY_WAVE_8.md) · [Wave 9](MAIN_RELEASE_DISCOVERY_WAVE_9.md).
**Owner scope:** identify production gaps, not implement fixes.

## Measured source-call-path evidence

- **38 distinct backend source or test files** explicitly linked in B43–B51 detailed reasoning, with **56 source-line citation occurrences**. Each path is identified by its immutable baseline Git blob SHA in [deep review register](evidence/MAIN_RELEASE_DEEP_SOURCE_PATHS.csv).
- These file references trace actual request → permission → serializer/service → database/notification/storage → existing test expectation, rather than relying on regex counts.
- **9 newly identified B43–B51 risk candidates** with source chain, impact/conditionality, exact negative/positive test in waves 6–9. B01–B42 remain unchanged.
- **Important:** This measures files supporting deep causal chains; it is **not** 38 independently certified entire files. Some paths are inspected at only the relevant functions, and no completed HTTP/PostgreSQL/browser/real-device reproduction is recorded.
- Selected 538-file static/source-outline tranche remains 538/538 inspected and source-triaged, of which the earlier ledger counted 10 traced functions. This new register is **a separate cross-cutting evidence scope**; do not add totals together without deduplicating paths.

## Paths by backend domain

| Backend domain | Distinct paths |
| --- | ---: |
| `users` | 10 |
| `chat` | 7 |
| `onboarding` | 6 |
| `pharmacy_hub` | 6 |
| `core` | 3 |
| `memberships` | 3 |
| `client_profile` | 1 |
| `dashboards` | 1 |
| `notifications` | 1 |

## Completion criteria for a verified production blocker

1. Reproduce a forbidden action on an isolated copy of the frozen main with **two organizations, two pharmacies, distinct users and real role memberships**, when tenant isolation is relevant.
2. Show a positive control preserving valid role behavior, and verify rejected requests did not change database rows or emit notifications/payments.
3. For authentication, verify previous refresh/session tokens fail after the revocation event; for storage, assert DB and underlying file objects survive invalid submissions; for communication, assert no email/WS/push exfiltration on forbidden audience.
4. Record exact run SHA, test command, database engine, result and discovered side effects. Only then use **REPRODUCED** status, and keep fixes outside audit-only PR #200.

**Release decision:** not certified for real users. This register is a source-evidence ledger, not a guarantee of 51 confirmed exploitable defects or 99% semantic coverage.
