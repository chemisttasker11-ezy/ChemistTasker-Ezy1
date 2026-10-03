# ChemistTasker Domain Ownership

This document defines the canonical owner for each backend and shared-client domain. New features should extend the owning domain rather than adding more responsibility to the `client_profile` kernel, which is a compatibility kernel only (enforced by `core/test_backend_ownership_boundaries.py`). `BACKEND_APPS.md` describes the apps split out of `client_profile`, their layout and the migration procedure; `BACKEND_DOMAIN_DEPENDENCIES.md` is the dependency map.

| Domain | Canonical backend owner | Shared client owner | Migration rule |
| --- | --- | --- | --- |
| Authentication, account, OTP, session | `users` | `shared-core/domains/auth` (target) | Keep browser/mobile auth contracts compatible. |
| Organizations, pharmacies, admin scope | `organizations` | shared-core named operations | Models keep the `client_profile` app label and tables; relabelling is a separate database change (`BACKEND_APPS.md`). |
| Pharmacy membership and applications | `memberships` | shared-core named operations | Same label rule as above. |
| Worker and owner onboarding, verification | `onboarding` (verification Celery tasks still implemented in `client_profile/tasks.py` under their deployed names) | shared-core named operations | Same label rule as above. |
| Shift marketplace and offers | `shifts` | `shared-core` shift operations | Preserve existing URLs and response shapes. Shift models refuse edits inside a published roster period (`ShiftSlot.roster_period` points to `workforce.RosterPeriod`). |
| Roster, leave, timesheets, attendance-derived workforce data | `workforce` (roster models in `workforce/models.py`; roster V1/V2 API, services, validation and worker actions in `workforce/roster/`) | workforce APIs in shared-core | Roster routes keep their `/api/client-profile/` paths and `client_profile:` route names (declared in `workforce/roster/urls.py`); new workflow logic belongs in `workforce`. |
| Attendance and kiosk | `attendance` | kiosk/attendance operations in shared-core | Kiosk protocol and credentials are security-sensitive: positive and negative tests for every change. |
| Invoices (model, generation from shifts, PDF/e-mail) | `invoicing` | invoice operations in shared-core | `invoicing.Invoice` is shared with `worker_finance` (revisions, payments, deliveries). |
| Worker customers, expenses, receipts, BAS groundwork, invoice workspace | `worker_finance` | finance APIs in shared-core | Builds on `invoicing.Invoice`; its data migrations look moved models up tolerantly. |
| Platform billing and Stripe | `billing` | billing API contracts | Financial transitions must be idempotent, auditable and covered by regression tests. |
| Public marketplace | `marketplace` | marketplace API contracts | Do not mix ethical/scheduled product policy into the public marketplace. |
| Ethical marketplace | `ethical_marketplace` | ethical marketplace API contracts | Private documents and regulated inventory stay authenticated and policy-scoped. |
| Public editorial/content | `public_hub` | public-content API contracts | New editorial models and workflows do not return to `client_profile`. |
| Chat | `chat` | named shared-core operations | Room WebSocket consumer and signals live in the app. |
| Notifications and device tokens | `notifications` | notification adapter in shared-core | Platform service: every app may call `notify_users`; depends on `users` only. |
| Authenticated pharmacy hub (community) | `pharmacy_hub` | hub operations in shared-core | `public_hub` reads hub posts for the public community pages. |
| Ratings | `ratings` | ratings operations in shared-core | |
| Pill rewards and referrals | `rewards` | rewards operations in shared-core | Awards run from `rewards/signals.py` and a lazy call in `client_profile/tasks.py`. |
| Talent board and availability | `talent` | talent/availability operations in shared-core | Roster code reads `talent.UserAvailability`. |
| Team calendar and work notes | `team_calendar` | calendar operations in shared-core | Celery task names stay `client_profile.calendar_tasks.*`. |

## Refactor rules

1. Do not change endpoint URLs, serializer response shapes, or database tables in a structural-refactor pull request.
2. Move Django models between apps only with the state-only procedure in `BACKEND_APPS.md`, rehearsed on a populated database (schema diff, migration graph, ContentTypes and row preservation) before it ships.
3. No new direct internal API route literals in web/mobile clients; add or reuse a named shared-core operation.
4. No new feature should increase the capped legacy hotspot files enforced by `scripts/audit-architecture-boundaries.mjs`.
5. Financial and permission-sensitive transitions require positive and negative tests.
6. Vite and Next may remain separate routers, but duplicated business logic must move to shared modules rather than being copied.
7. Historical source and build artifacts belong in Git history/releases, not beside the maintained application source.
8. The magic-link pharmacy membership application is Vite-owned. Next may proxy `/membership/*` to Vite on the shared host, but must not contain a second membership page or migrated copy.
