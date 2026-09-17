# Shared-core endpoint catalogue reconciliation

**Checkpoint:** SC02  
**Django route authority:** `backend/**/urls.py`

## Canonical naming

Endpoint keys use domain/action semantics (`marketplace.listing(id)`,
`rosterV2.publish`, `attendance.workerClockIn`). Dynamic builders always return
the canonical Django path with a leading and trailing slash. Screen names and
transport verbs are not encoded into endpoint names.

`PLATFORM_ENDPOINTS` is the canonical registry for Public Hub, content,
Marketplace, Ethical Marketplace, Attendance V1, Roster V2 and kiosk server
identities. `API_ENDPOINTS` remains the compatibility registry for the large
legacy SDK until its consumers migrate; it must not be removed or renamed in a
big-bang change.

## Reconciliation result

| Catalogue | Result | Evidence / action |
|---|---|---|
| `PLATFORM_ENDPOINTS.publicHub` | Exact | Matches `backend/public_hub/urls.py`. |
| `PLATFORM_ENDPOINTS.content` | Exact | Matches `backend/public_hub/content_urls.py`. |
| `PLATFORM_ENDPOINTS.marketplace` | Exact | Matches `backend/marketplace/urls.py`. |
| `PLATFORM_ENDPOINTS.ethicalMarketplace` | Exact | Matches `backend/ethical_marketplace/urls.py`. |
| `PLATFORM_ENDPOINTS.attendance` | Exact | Matches Attendance V1 paths in `backend/client_profile/urls.py`. |
| `PLATFORM_ENDPOINTS.rosterV2` | Exact | Matches Roster V2 paths in `backend/client_profile/urls.py`. |
| `PLATFORM_ENDPOINTS.kiosk` | Exact / security-boundary | Matches Django; native restricted-token transport remains outside the general client. |
| Legacy shift detail builders | Corrected alias | Added canonical trailing slashes for the three DRF detail routes. Names are preserved. |
| `refereeRejectByToken(token)` | Added canonical | Matches the current single-token Django route. |
| `refereeReject(pk, refIndex)` | Stale compatibility alias | Targets the removed two-parameter route. Retained temporarily because legacy React/Next pages still reference it. |
| `onboardingCreate(role)` / `createOnboarding` | Stale compatibility alias | Django mounts `/{role}/onboarding/me/`; the non-`me` create route is absent. No active consumer was found. |
| `organizationDashboard(orgId)` | Partial alias | Django supports both collection-context and `{organization_pk}` variants; legacy helper exposes the parameterized form. |
| DRF router action paths in `API_ENDPOINTS` | Exact or generated | Verified against registered viewsets and their `@action` consumers; keep legacy names until SC08/client migration. |

## Guardrail

`platformEndpoints.test.ts` locks representative dynamic builders in every new
domain to exact Django paths. When Django routes change, update the backend,
registry, operation and test in the same change. Never add a route based only on
a UI expectation.

