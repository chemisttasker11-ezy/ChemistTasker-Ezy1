# J6 — Explorer History/Confirmed 403: cross-client role and endpoint audit

**PR #249 head:** `97c4543e051b43fe30ec7e2e61ad3d69957a918e`. Static source inspection at the named SHA; no runtime 403 reproduction or test execution (no local repository checkout). The user-reported 403 is consistent with an explicit backend role denial.

## Verified callers and policy

| Surface | File:line evidence | Caller/path | Effect for EXPLORER |
|---|---|---|---|
| Backend worker History | `backend/shifts/urls.py:53`; `backend/shifts/my_shifts.py:40-48`; `backend/shifts/access.py:67-73` | `MyHistoryShiftsViewSet`, `permission_classes=[IsPharmacistOrOtherStaff]`; `/api/v1/my-history-shifts/` | Permission only accepts PHARMACIST or OTHER_STAFF, not EXPLORER: authenticated Explorer is denied (403 expected). |
| Backend worker Confirmed | `backend/shifts/my_shifts.py:10-18`; `backend/shifts/access.py:67-73` | `MyConfirmedShiftsViewSet`, same permission class | Same Explorer denial applies to Confirmed (second defect). |
| Backend manager History (distinct!) | `backend/shifts/urls.py:43`; `backend/shifts/lifecycle.py:170-191` | `HistoryShiftViewSet`; `shifts_managed_by(qs,user)` | Managed-pharmacy history, not the worker's personal History; do not grant access or change this to resolve the Explorer error. |
| Shared-core worker History | `shared-core/src/domains/shifts/api.ts:51-53,314-315` | `getMyHistoryShifts` → `/my-history-shifts/`; `fetchMyHistoryShifts` | Correct worker endpoint for authorised workers; shared-core should not be changed to return manager history to Explorers. |
| Shared-core manager History | `shared-core/src/domains/shifts/api.ts:45-46,308-309` | `getHistoryShifts` → `/shifts/history/`; `fetchHistoryShifts` | Separate API retained for owners/manager admins. |
| Vite Explorer route | `frontend_web/src/main.tsx:566-587` | `/dashboard/explorer/shifts/history` renders `MyHistoryShiftsPage`, `confirmed` renders `MyConfirmedShiftsPage` | Both routes available to EXPLORER; direct deep-link can invoke forbidden worker APIs. |
| Vite shared Public tabs | `frontend_web/src/pages/dashboard/sidebar/PublicShiftsPage.tsx:690-691`; `frontend_web/src/pages/dashboard/shiftCenter/StaffShiftCentreTabs.tsx:16-30` | Public page mounts tab control containing History and Confirmed without a persona filter | A visible History/Confirmed affordance on the Explorer Public page, notwithstanding the sidebar restriction. |
| Vite worker History fetch | `frontend_web/src/pages/dashboard/sidebar/MyHistoryShiftsPage.tsx:21-24,41-50` | `fetchMyHistoryShifts()` | Explorer direct/tab navigation invokes denied endpoint. |
| Vite authorised worker routes | `frontend_web/src/main.tsx:486-495,533-541` | Pharmacist and other staff History/Confirmed routes | Must retain these routes and their worker APIs. |
| Vite manager History | `frontend_web/src/pages/dashboard/sidebar/HistoryShiftsPage.tsx:62` | `fetchHistoryShifts()` | Different authorised management use case; preserve. |
| Expo Explorer tab policy | `frontend_mobile/roles/shared/shifts/shiftSurface.ts:16-18,135-144` | `isWorkerPersona('explorer')` and `shiftSections` expose `confirmed`, `history` | Mobile labels Explorer a worker for these tabs, irrespective of permission class. |
| Expo tab dispatcher | `frontend_mobile/roles/shared/shifts/ShiftsScreen.tsx:21-25,36,46-57,63-67` | For worker persona mounts `WorkerHistoryShiftsView` or `WorkerConfirmedShiftsView` | Tab selection causes forbidden API call. |
| Expo worker History | `frontend_mobile/roles/shared/shifts/WorkerHistoryShiftsView.tsx:8-15,68-84` | `fetchMyHistoryShifts()`; displays returned detail | Direct cause of user-visible permission error. |
| Expo worker Confirmed | `frontend_mobile/roles/shared/shifts/WorkerConfirmedShiftsView.tsx:6,17-37` | `fetchMyConfirmedShifts()` | Same role mismatch. |
| Expo manager History | `frontend_mobile/roles/shared/shifts/HistoryShiftsView.tsx:74-87` | `fetchHistoryShifts()` | Separate manager path preserved. |

## Intended policy and recommended decision

**Hide worker Confirmed and History for Explorers; do not grant read access to those worker-only endpoints.** Evidence: `frontend_web/src/navigation.tsx:505-530` specifically lists only **Public Shifts** and **Community Shifts** for Explorer; `backend/shifts/access.py:67-73` deliberately limits the worker views; `backend/shifts/my_shifts.py:23-27,53-56` filters to personally assigned worker shifts. `backend/shifts/test_shift_listing_contract.py:160-169,227-244` documents the distinct worker endpoints and role-group expectations, but **does not by itself prove an Explorer-specific 403 assertion**.

### Minimal repair (no changes made)

1. **Expo:** in `frontend_mobile/roles/shared/shifts/shiftSurface.ts:143` return `['public','community']` for Explorer. `ShiftsScreen` already derives tabs and panels from that list (`frontend_mobile/roles/shared/shifts/ShiftsScreen.tsx:32-35,46-57`). Review existing deep-link fallback at `shiftSurface.ts:147-153` so a stale `section=history` cannot fetch.
2. **Vite:** filter `StaffShiftCentreTabs` by active user persona when displayed within Explorer Public/Community; preserve all four tabs for pharmacist/other-staff (`frontend_web/src/pages/dashboard/shiftCenter/StaffShiftCentreTabs.tsx:16-30`). Close or redirect Explorer-only `confirmed` and `history` routes at `frontend_web/src/main.tsx:584-585` to Public to prevent direct-link fetch. Keep pharmacist/otherstaff routes at `:486-495,533-541`.
3. **Next migrated copy:** the identified shared Dashboard worker tabs are Vite routes; an independent Next Explorer authenticated route implementation is **not verified** and must not be assumed based on similarly named migrated files.

### Executable regressions that fail against current production code

- **Expo:** import and execute the real `shiftSections` from `frontend_mobile/roles/shared/shifts/shiftSurface.ts`; assert `shiftSections({persona:'explorer',workspace:'platform'})` equals `['public','community']`, and a requested `history` resolves to the public board without mounting `WorkerHistoryShiftsView`. The first assertion fails on current line 143.
- **Vite:** mount the production `PublicShiftsPage` and its real `StaffShiftCentreTabs` under an Explorer AuthContext/router, assert no History/Confirmed tab links and no `fetchMyHistoryShifts` call after tab navigation; current `StaffShiftCentreTabs.tsx:16-20` fails. Route-test an Explorer deep link to `/dashboard/explorer/shifts/history` redirects, while pharmacist still accesses their history; current `main.tsx:584-585` fails.
- **Backend:** DRF API test for authenticated EXPLORER vs PHARMACIST on both `my-history-shifts/` and `my-confirmed-shifts/`; assert 403 for Explorer, authorised worker filtered to own records. This is a **policy-protection test**, not expected to fail against current backend; the client regressions above meet the fail-on-current-code criterion.

## Verdict
Rows: **15**; GAPs: **2** (Explorer History and Confirmed access). Top impacts: visible 403 on History; analogous Confirmed 403; direct web deep links bypass sidebar policy. No change to server permission recommended.
