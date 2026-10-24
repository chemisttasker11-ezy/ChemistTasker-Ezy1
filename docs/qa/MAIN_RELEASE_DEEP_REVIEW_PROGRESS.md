# PR #200 — Deep causal source-review accounting (B43–B52)

**Frozen app baseline:** `b77e9fd296bc2710350ef6f3cd402ce2529ffc06`. **Latest deep review:** discovery [waves 6](MAIN_RELEASE_DISCOVERY_WAVE_6.md), [7](MAIN_RELEASE_DISCOVERY_WAVE_7.md), [8](MAIN_RELEASE_DISCOVERY_WAVE_8.md), [9](MAIN_RELEASE_DISCOVERY_WAVE_9.md) and [10](MAIN_RELEASE_DISCOVERY_WAVE_10.md). All work audit-only.

## Actual measured progress

- **44 distinct backend/web/Expo source and test files** referenced in **64 code-line evidence occurrences** across **10 independent B43–B52 source findings**; each has a precise affected workflow and missing positive and negative test.
- **24 of those paths are newly reviewed outside the previously selected 538-source tranche**, while **20 overlap** the first selection. They are *not* added twice to the source-inventory coverage.
- These represent **function-level causal chain reviews**, often several interacting files per finding. **Do not convert the 44 references into 44 complete-file semantic certifications**. The entire 538-file tranche remains structurally examined, with deeper verification needed across most business flows.
- **0 reproduced security exploits, 0 payment/concurrency/real-device regressions executed**, zero code fixes. PR #200 remains draft. Candidate risk priorities are not independently proven exploit severities.

## Domains contributing to new source evidence

| Domain | Distinct source paths |
| --- | ---: |
| `backend/users` | 10 |
| `backend/chat` | 7 |
| `backend/onboarding` | 6 |
| `backend/pharmacy_hub` | 6 |
| `frontend_mobile` | 5 |
| `backend/core` | 3 |
| `backend/memberships` | 3 |
| `backend/client_profile` | 1 |
| `backend/dashboards` | 1 |
| `backend/notifications` | 1 |
| `frontend_web` | 1 |

## Evidence and next verification gates

The [immutable path register](evidence/MAIN_RELEASE_DEEP_SOURCE_PATHS.csv) contains source SHA, wave IDs, overlap grade and execution status. B43 token revocation needs web/native session replay; B44 invalid identity updates need persisted-file/transaction assertions; B45 invalid referee responses need HTTP check; B46/B48/ B50/B51 require private notification and revoked-member denial tests; B47 requires owner policy decision; B49 requires fake-PDF upload rejection; B52 requires Expo startup under denied server identity and browser comparison. For release, execute negative+positive tests on representative PostgreSQL/real-client fixtures and record the exact CI head and output. Never label a candidate reproduced without those records.

**Source audit work progressed; 99% manual semantic/release verification remains NOT achieved.**
