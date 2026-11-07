# J8 — Unkeyed Explorer pitch-create HTTP POST sweep

**PR #249 head:** `97c4543e051b43fe30ec7e2e61ad3d69957a918e`. Source inspection at named SHA. This is the **identified** call graph; a complete repository-wide search is **not verified** because no Git checkout or full SHA-specific content grep could be run. GitHub code search indexes the default branch, so all entries below were separately read at this SHA. No code was changed.

## HTTP create endpoints and callers (all missing Idempotency-Key in inspected calls)

| Layer | Exact file:line | POST or invocation | Key status | Minimum change and executable regression |
|---|---|---|---|---|
| **shared-core network boundary** | `shared-core/src/domains/talent/api.ts:65-67` | `createExplorerPost(data)` issues `fetchApi('/explorer-posts/', { method:'POST', body })` | **UNKEYED**; no header supplied at this call | Add explicit `Idempotency-Key` to shared-core create operation, derive/reuse stable key for a single logical submission; production transport interception assertion that request contains nonempty key and retry reuses it **fails today**. |
| Expo UI | `frontend_mobile/roles/shared/talent-board/index.tsx:579-580` | `else await createExplorerPost(payload)` | Inherits unkeyed shared-core request | Thread stable submission key through native submit/retry; UI integration test executes real submit and inspects captured HTTP request. |
| Vite web UI, flow 1 | `frontend_web/src/pages/dashboard/sidebar/TalentBoard/index.tsx:705-707` | `else await createExplorerPost(payload)` | Inherits unkeyed request | Preserve logical key across retry, integration test. |
| Vite web UI, flow 2 | `frontend_web/src/pages/dashboard/sidebar/TalentBoard/index.tsx:729-731` | `else await createExplorerPost(payload)` | Inherits unkeyed request | Same; test both branches with real shared-core operation. |
| Next migrated web copy, flow 1 | `frontend_web/landing_next/migrated/pages/dashboard/sidebar/TalentBoard/index.tsx:759-761` | `else await createExplorerPost(payload)` | Inherits unkeyed request | Propagate same contract through migrated flow, test create and retry. |
| Next migrated web copy, flow 2 | `frontend_web/landing_next/migrated/pages/dashboard/sidebar/TalentBoard/index.tsx:783-785` | `else await createExplorerPost(payload)` | Inherits unkeyed request | Same second branch. |
| Backend DRF test, create 1 | `backend/talent/test_explorer_api.py:13,131` | `client_for(owner).post(URL, ..., format='json')` | No `HTTP_IDEMPOTENCY_KEY` | Supply key in test; backend contract test should require header and reject omission (fails against current acceptance policy, pending server implementation). |
| Backend DRF test, create 2 | `backend/talent/test_explorer_api.py:138` | `client_for(user).post(URL, ..., format='json')` | No header | Add unique logical-create key; verify existing role permission outcome. |
| Backend DRF test, create 3 | `backend/talent/test_explorer_api.py:147` | `client_for(user).post(URL, ..., format='json')` | No header | Add key; retain negative/role-path assertion. |
| Backend DRF test, create 4 | `backend/talent/test_explorer_api.py:153` | `client_for(make_user('OTHER_STAFF')).post(URL,...)` | No header | Add key; retain existing negative-path assertion. |
| Backend newcomer helper | `backend/talent/test_newcomer_rules.py:59,66-67` | `NewcomerTalentPostTests.post(user)` uses `client_for(user).post(self.URL,...)` | No header; reused by tests at `:70-91` | Generate per logical operation key; for retries intentionally reuse, for fresh submissions generate fresh. Execute DRF test against production view. |
| Backend onboarding transition test | `backend/onboarding/test_verification_transitions.py:336-337` | `client.post(BASE+'explorer-posts/', {'headline':'Again',...},format='json')` | No header | Supply key; assert authorised create after delete. |

## Route and exclusions (not create HTTP POSTs)

- `backend/talent/urls.py:15` registers `explorer-posts` with `ExplorerPostViewSet`; `shared-core/src/constants/endpoints.ts:175-180` declares path constants. These are route **definitions**, not requests.
- `backend/talent/test_explorer_api.py:18,113`; `backend/talent/test_saved_professional_contacts.py:15-16`; `backend/onboarding/test_verification_transitions.py:37`; `backend/users/test_account_security_contract.py:513-514` use `ExplorerPost.objects.create` (direct model setup), **not HTTP POST**, therefore won't be blocked by an HTTP header requirement.
- `shared-core/src/domains/talent/api.ts:57-63` POSTs to **detail view/like/unlike actions**; these must not be mistaken for collection-create.
- `shared-core/src/domains/auth/browserOperations.test.ts:135` references `/api/v1/explorer-posts/public-feed/` for GET, not create.

## Verification boundary and acceptance

A GitHub indexed-code query on `explorer-posts` and `createExplorerPost` identified the above current-head paths; **full sweep of seeds, management commands, E2E, scripts, documentation and indirect constructed URLs remains not verified** without exhaustive SHA-specific contents search. Do **not** interpret absence of additional entries as a verified negative. Re-run `git grep -n -E 'explorer-posts|createExplorerPost|ExplorerPostViewSet'` at `97c4543e051b43fe30ec7e2e61ad3d69957a918e` after a checkout and manually follow alias/variable-built POST URLs.

**Production-code regression:** run the real `createExplorerPost` with a spy `fetchImpl` through shared-core `configureApi`, capture request headers and assert `Idempotency-Key` present and identical for retried same submission. This necessarily fails on `shared-core/src/domains/talent/api.ts:65-67` now. Backend integration should assert bare collection POST rejects missing key after the planned server change.

**Inventory:** 12 identified rows, **12 unkeyed entry/call sites** (one shared network boundary, five UI invocations, six backend test invocations/helpers). Highest risk: shared-core creator has no key; web has two creation branches per copy; backend tests will break when create requires key.
