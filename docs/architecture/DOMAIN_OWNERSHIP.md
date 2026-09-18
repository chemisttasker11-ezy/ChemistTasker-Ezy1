# ChemistTasker Domain Ownership

This document defines the canonical owner for each backend and shared-client domain. New features should extend the owning domain rather than adding more responsibility to `client_profile`.

| Domain | Canonical backend owner | Shared client owner | Migration rule |
| --- | --- | --- | --- |
| Authentication, account, OTP, session | `users` | `shared-core/domains/auth` (target) | Keep browser/mobile auth contracts compatible. |
| Organizations, pharmacy membership, admin scope | `client_profile` during consolidation | shared-core named operations | Split services/selectors first; do not move DB models until migration history is rehearsed. |
| Shift marketplace and offers | `client_profile` during consolidation | `shared-core` shift operations | Preserve existing URLs and response shapes while extracting modules. |
| Roster, leave, timesheets, attendance-derived workforce data | `workforce` | workforce APIs in shared-core | Legacy `client_profile` roster models are compatibility dependencies only; new workflow logic belongs in `workforce`. |
| Worker invoices, customers, expenses, receipts, BAS groundwork | `worker_finance` | finance APIs in shared-core | `client_profile.Invoice` remains the compatibility invoice model until a separately rehearsed schema migration. |
| Platform billing and Stripe | `billing` | billing API contracts | Financial transitions must be idempotent, auditable and covered by regression tests. |
| Public marketplace | `marketplace` | marketplace API contracts | Do not mix ethical/scheduled product policy into the public marketplace. |
| Ethical marketplace | `ethical_marketplace` | ethical marketplace API contracts | Private documents and regulated inventory stay authenticated and policy-scoped. |
| Public editorial/content | `public_hub` | public-content API contracts | New editorial models and workflows do not return to `client_profile`. |
| Private chat/community legacy | `client_profile` during consolidation | named shared-core operations | Extract services/serializers/views before any model move. |

## Refactor rules

1. Do not change endpoint URLs, serializer response shapes, or database tables in a structural-refactor pull request.
2. Extract views/services/selectors first; move Django models only in a dedicated migration project with staging rehearsal and rollback.
3. No new direct internal API route literals in web/mobile clients; add or reuse a named shared-core operation.
4. No new feature should increase the capped legacy hotspot files enforced by `scripts/audit-architecture-boundaries.mjs`.
5. Financial and permission-sensitive transitions require positive and negative tests.
6. Vite and Next may remain separate routers, but duplicated business logic must move to shared modules rather than being copied.
7. Historical source and build artifacts belong in Git history/releases, not beside the maintained application source.
