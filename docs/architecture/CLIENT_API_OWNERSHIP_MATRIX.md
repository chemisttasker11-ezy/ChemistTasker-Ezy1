# ChemistTasker client API ownership matrix — A00

**Scope:** internal Ezy Vite, Next and Expo only, assessed on PR #191 at `215fc375a3b1`. Windows Tauri/Rust kiosk and its browser shell are **independent** and intentionally excluded from the shared-core migration. Expo's pairing surface remains a mobile consumer and must not be confused with the Windows kiosk.

This matrix describes grounded priority routes and source owners. It is **not** a claim that every legacy runtime call has been classified; use `CLIENT_BOUNDARY_MANIFEST.json` and the CI inventory artifact for complete callsite tracking. API route examples below are paths relative to the canonical `/api/v1` root unless otherwise noted.

| Area / route | Django owner (observed) | Shared-core named operations | Client status / decision |
| --- | --- | --- | --- |
| `pharmacies/`, `pharmacies/{id}/` | `backend/organizations/views.py` PharmacyViewSet, PharmacySerializer | `getPharmacies`, `getPharmacyById`, `createPharmacy`, `updatePharmacy`, `deletePharmacy` | SDK is established in Vite and Expo. Native multipart verification added. A01 **write and DELETE role/action policy unapproved**. |
| `pharmacies/lookup-abn/` | Organizations PharmacyViewSet action | `lookupPharmacyAbn` | Shared operation exists. ABN verification/locked state must not be silently modified. |
| `organizations/`, `chains/`, `pharmacy-admins/` | Organizations models/views | `getOrganizations`, `getChains`, `getPharmacyAdmins` and named mutations | Shared domain established; scope and admin authority governed by Django, not UI persona colour. |
| `roster-*/*`, `workforce/*` | Workforce/roster domains | `rosterV2.getPeriod`, `initializePeriod`, `validate`, `publish`, `unpublishShift`, `republishShift`, `copyWeek`, templates, assignments and request actions | Vite grid and toolbar migrated; Expo/post-shift lifecycle parity requires separate evidence. Do not import PR #182 shift-policy choices. |
| `calendar-events/`, `calendar-feed/` | Calendar/work-notes service | `getCalendarEvents`, `createCalendarEvent`, `updateCalendarEvent`, `getCalendarFeed` | PR #181-owned. Maintain recurrence and occurrence-date semantics; do not duplicate mapper in PR #191. |
| `work-notes/` | Work notes/calendar | `getWorkNotes`, `createWorkNote`, `updateWorkNote`, `markWorkNoteDone`, `markWorkNoteOpen` | Shared domain exists; manager controls, clinical verification and recurrence protected by PR #181. |
| `billing/subscription/`, `billing/subscription/seats/`, `billing/subscribe/` | Billing | `getCurrentSubscription`, `updateSubscriptionSeats`, `createSubscriptionCheckout` | Vite/Expo subscription operations consolidated. Keep `platform: 'mobile'` for Expo returns; verify checkout redirects on devices. |
| `billing/charge-fulfillment/{id}/` | Billing/shifts | `chargeShiftFulfillment` | Existing wire contract test restored. **Freeze new payment/penalty decisions pending PR #182.** |
| Marketplace and ethical-marketplace endpoints | Marketplace and ethical-marketplace domains | Named `marketplaceApi` / `ethicalMarketplaceApi` actions in the shared Next/platform facade | Named methods are **not** direct raw transport escapes. Generic `.request` remains an audit candidate and requires ownership classification. |
| `users/csrf/`, `users/token/refresh/`, `users/logout/` | Users/auth | Shared authentication contracts plus request-scoped Next/browser session | Platform-specific CSRF/cookie/SSR implementation may be a narrow, documented exception. Do not move credentials into global SDK state. |
| `attendance/kiosk/*` on Windows | Attendance backend; Windows device protocol | **None required for kiosk migration** | Independent Windows Tauri/Rust and kiosk browser shell excluded; existing dedicated kiosk CI remains. |
| `attendance/kiosk/pairing/request/` in Expo | Attendance backend | Candidate mobile adapter, currently direct request | Expo pairing UI is a mobile consumer, **not** Windows kiosk. Review transport parity separately, without touching kiosk Rust. |

## Architecture decision register

- **Already shared:** operation names and payload mappers above where listed. Different Next SSR/browser adapters do not imply duplicated business rules.
- **Needs classification:** raw domain transport findings in Vite, Next and Expo, including genuinely dynamic routes. The initial 176 findings were a prior scanner snapshot and included false positives; use refined scanner output for current numbers.
- **Allowed platform-specific only with evidence:** Next server proxy/session cookies, Expo native files/device calls, browser CSRF bootstrap, Windows kiosk native protocol (fully outside migration).
- **Forbidden drift:** client reimplementations of authorization, billing calculation, workforce shift lifecycle, roster publish policy or calendar recurrence.

## A00 acceptance still open

Complete each callsite with backend route ownership, SDK operation or documented exception, source consumer, and behavioral/regression contract. Evidence must include auth, errors, CSRF, idempotency and relevant server test. No broad auto-whitelists or unreviewed migration of 43 divergent Vite/Next twins.
