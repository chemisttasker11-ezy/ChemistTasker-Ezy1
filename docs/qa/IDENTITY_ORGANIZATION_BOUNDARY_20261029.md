# Identity/organization module boundary and shared authorization facts

29 October 2026 (Australia/Brisbane). Fixed parent: draft #219 at `e13b7008708e96ffa3077a37b6bfd20ed40d2e53`. Earlier PRs remain unchanged.

## Ownership and contracts

The identity model and role definitions no longer import organization model classes at module initialization. Shared pharmacy admin level/capability facts live in model-free `access_control.pharmacy_roles`. Both existing models consume the identical enum object and capability matrix. The enum retains `organizations.models.PharmacyAdmin.AdminLevel` as its historical pickle path. `OrganizationMembership` uses the existing `client_profile.Organization` Django relation label; its class, app label, table, content type and resolved related model are unchanged. No new Django model or schema migration.

Identity HTTP projections consume organization-owned selectors through an immutable `users.organization_port`. The application composition root binds those selectors before mounting the identical URL objects. Ordinary DRF PK-field subclasses obtain their querysets from the owner and retain inherited PK conversion, validation/error codes, many-value behavior and scope validation. The membership/invitation serializers, permission rules and response payloads stay at their existing public paths. The admin-assignment selector is the exact original function object.

The two pre-existing function-local organization imports in `users.org_roles.membership_visible_pharmacies` and `users.navigation._pharmacy_manager_dashboard_url` remain unchanged. Background workers call these without loading a URLconf. Routing them through HTTP-only composition would break that existing bootstrap contract. They remain explicit combined-graph debt; **organization/identity is not declared removed at every depth**. No new import delay, AppConfig.ready hook, signal registration, worker initialization or service-locator lookup is added.

## Graph evidence

| Measure | #219 | This batch |
| --- | ---: | ---: |
| Module edges | 103 | 104 |
| Delayed edges | 69 | 69 |
| Direct mutual pairs | 2 | 1 |
| Actual direct cyclic edges | 38 | 23 |
| Direct cyclic component | 11 apps | 8 apps |
| Actual combined cyclic edges | 124 | 124 |
| Combined cyclic component | 20 apps | Same 20 apps |
| Non-mutual ledger | 34 | 21 |

Only the direct source edge `users → organizations` is removed. The two added source edges are `users → access_control` and `organizations → access_control`, both acyclic; shared facts import no business domain. The smaller SCC also removes 14 other edges from the set of *cyclic* direct edges without removing their source imports. Users, notifications and public_hub leave that direct SCC. The combined graph retains users → organizations through its two original delayed imports; no combined cyclic edge is added or removed. No graph exclusion or new mutual-pair exemption.

## Verification

Five new model/relation/pickle/DRF-PK/navigation contracts passed before extraction on unchanged #219 (0.049 seconds after setup). Initial affected-domain selection: **265/265 passed**, no skips/errors/failures, 22.670 seconds after setup. Migration drift: **No changes detected**.

Additional permanent controls verify shared-policy ownership, canonical immutable selector binding without SQL/queue work, and a fresh worker process using the existing scope/navigation helpers before URL composition, followed by no-I/O HTTP binding. Existing identity, region-delegation, organization role, manager conversion, claims, invitations and denial suites remain unchanged. The new module is explicitly selected in both Serializer database variants and isolated-image QA; Shared Core already discovers users tests. Scanner, graph/baseline, whitespace and shell syntax checks pass.

Final integrated affected selection: **695 passed, seven PostgreSQL-only skips** (702 discovered), no errors/failures, 58.528 seconds after setup. All 852 backend Python hashes remained unchanged during the run. The shared policy definitions and organization role bodies are AST-identical after explicitly renaming their fact owner. PostgreSQL/source checks must be verified independently on this new head; parent or local SQLite results do not establish hosted acceptance.

## Remaining

The only direct mutual pair is now migration-bound `client_profile/onboarding`. Longer runtime cycles, including the explicit organization/identity delayed debt, remain. Keep draft/unmerged. No merge, parent retarget, deployment or live provider operation. No native/device, staging or provider acceptance claim.
