# Shared-core endpoint catalogue reconciliation

**Original checkpoint:** SC02  
**Final hardening:** CP2-CP4  
**Django route authority:** `backend/**/urls.py`

## Ownership rule

Endpoint keys use domain/action semantics and dynamic builders return canonical Django paths with leading/trailing slashes.

The catalogue split is now intentional rather than historical:

- `API_ENDPOINTS` owns the established authenticated Vite/mobile surface and compatibility API: users, memberships, shifts, pharmacy Hub, Workforce, EmploymentEngagement, Timesheets, Attendance, Roster V2 and Worker Finance.
- `PLATFORM_ENDPOINTS` owns public/request-scoped platform domains used by the Next/public surface: Public Hub/articles, content management, Marketplace and Ethical Marketplace.
- `PLATFORM_ENDPOINTS.kiosk` exposes kiosk server endpoint identities only. Native restricted device-token/offline transport remains in Rust/Tauri and is not routed through the end-user bearer client.

This avoids two endpoint registries claiming the same authenticated operational domain while preserving the two different transport models.

## Reconciliation result

| Catalogue | Result | Evidence / action |
|---|---|---|
| `PLATFORM_ENDPOINTS.publicHub` | Exact | Matches `backend/public_hub/urls.py`; named article/community operations are exposed through `platformApi.ts`. |
| `PLATFORM_ENDPOINTS.content` | Exact | Matches `backend/public_hub/content_urls.py`; content mutations use named platform operations. |
| `PLATFORM_ENDPOINTS.marketplace` | Exact | Matches `backend/marketplace/urls.py`; Marketplace policy remains Django-owned. |
| `PLATFORM_ENDPOINTS.ethicalMarketplace` | Exact | Matches `backend/ethical_marketplace/urls.py`; ethical access/escalation remains Django-owned. |
| `PLATFORM_ENDPOINTS.kiosk` | Exact / security boundary | Matches Django endpoint identities; restricted native transport remains separate. |
| `API_ENDPOINTS.attendance` | Exact | Authenticated worker/manager Attendance routes moved here in CP2. |
| `API_ENDPOINTS.rosterV2` | Exact | Authenticated Roster V2 routes moved here in CP2. |
| `API_ENDPOINTS.workforce` | Exact | Workforce/EmploymentEngagement/Timesheet routes are owned by the established authenticated API. |
| `API_ENDPOINTS.finance` | Exact / confined | Worker Finance routes added in CP3; requests are additionally confined to `/client-profile/finance/`. |
| Legacy shift detail builders | Corrected compatibility | Canonical trailing-slash DRF detail paths are retained under existing names. |
| `refereeRejectByToken(token)` | Canonical | Matches the current single-token Django route. |
| `refereeReject(pk, refIndex)` | Deprecated compatibility alias | Retained only for legacy compatibility; new code must use the token route. |
| `onboardingCreate(role)` / `createOnboarding` | Deprecated compatibility alias | Current Django onboarding is `/{role}/onboarding/me/`; new code must use current named operations. |

## Guardrails

`platformEndpoints.test.ts`, `operationalApi.test.ts` and the boundary audit lock representative paths and ownership boundaries. When Django routes change, update the backend route, the correct catalogue, the named operation and its contract test in the same change.

Do not add an operational endpoint to `PLATFORM_ENDPOINTS` simply because a new UI is written in Next. Route ownership follows authentication/business-domain architecture, not screen technology.
