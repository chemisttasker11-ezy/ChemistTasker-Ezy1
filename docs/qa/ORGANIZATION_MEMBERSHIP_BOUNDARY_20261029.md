# Organisation/membership ownership boundary

29 October 2026 (Australia/Brisbane). Fixed architectural parent: PR #217 at `e88438810424472b5f1167b900a9f32a1fee8778`. The independently published `c51ddf59` checkpoint is also retained as an ancestor; neither history nor any of #217's source, tests or CI selections is discarded. PR #218 is repurposed as this continuation above #217, so there is one core/shifts proposal in the stack.

## Invariant and ownership

Authorised organisation endpoints retain the same HTTP classes/routes/decorators, payloads, validation/refusal order, actor scope, membership/admin model objects, row-lock order, transaction ownership, response status/body and notification callback/failure order. Membership management owns its membership writes. Its pharmacy and identity facts continue to depend on their existing owners.

| Original controller method/block | Membership-owned implementation | Preserved boundary |
| --- | --- | --- |
| `PharmacyAdminViewSet.my_pending_invitations` | `pending_admin_invitations` | Same pending/accepted filter, ordering and response projection |
| `accept_invitation`, `reject_invitation` | `accept_admin_invitation`, `reject_admin_invitation` | Same transaction, assignment-before-membership locks, membership cap, responses and existing accepted-staff preservation |
| `get_queryset` | `admin_queryset` | Same owner/admin/organisation scope and destroy-only pending visibility |
| `create` | `create_admin` | Same role/persona/owner checks, validation order, membership/admin changes and post-commit email |
| `destroy` | `revoke_admin` | Same conditional pending rejection, accepted-staff preservation, unlinking and revoked-access protection |
| `ChainViewSet.add_user`, `remove_user` | `chain_add_user`, `chain_remove_user` | Same scoped lookup, refusal and existing protected-membership removal behaviour |
| Pharmacy creation's membership/admin statements | `link_owner` | Same two statements, still inside the original view's atomic block and before notification registration |
| Claim bootstrap's role/membership/admin statements | `bootstrap_contact` | Same role resolution and writes, still inside the original claim transaction, before its existing invitation email |

All eight lifted endpoint/query bodies match #217's ASTs exactly. The two writer blocks retain their statement order; contact bootstrap receives the same request actor as an explicit argument. Existing decorators remain on the public HTTP adapters. Membership services receive the adapter's existing permission/query/serializer callbacks. The email dispatcher is passed as a lookup wrapper so a callback still resolves `organizations.views.async_task` at execution time, preserving the historical patch point and deferred lookup semantics.

`organizations.membership_port` declares ten immutable callable slots and imports no membership or composition module. The application root binds their concrete membership functions in `composition.organization_memberships` and mounts `composition.urls`, which re-exports the identical historical URL-pattern object. This wiring performs no database or queue operation. There is no new Django app, model, schema migration, AppConfig.ready work, signal receiver, task registration, permission rule, financial/settlement change or provider policy.

## Graph comparison

Both module-only and module-plus-delayed graphs are rebuilt with the unchanged scanner. Full SCC-internal cyclic-edge sets are compared, including the exempt mutual pairs.

| Measure | #217 | Continuation |
| --- | ---: | ---: |
| Module edges | 101 | 103 |
| Delayed edges | 71 | 70 |
| Direct mutual pairs | 4 | 3 |
| Actual direct cyclic edges | 40 | 39 |
| Direct cyclic component | 11 apps | Same 11 apps |
| Combined mutual pairs | 34 | 33 |
| Actual combined cyclic edges | 126 | 125 |
| Combined cyclic component | 20 apps | Same 20 apps |
| Non-mutual ledger entries | 32 | 33 |

The only removed actual cyclic edge in either graph is `organizations → memberships`; no actual cyclic edge is added. Composition has no business importer and belongs to neither cyclic component. Retained `memberships → organizations` is reclassified into the ledger when the now-absent mutual-pair exemption is retired. No scanner exclusion, hidden dynamic import or deferred-import workaround is used. Three direct boundaries and the existing longer cycles remain open.

## Verification and provenance

Local environment: Python 3.12, pinned backend requirements, disposable SQLite with `core.contract_test_settings`, workflow placeholder environment and local-memory email. No production database or live provider is involved.

- **Before extraction: 294/294 passed**, no skips/errors/failures, 13.327 seconds after migration setup. Selection: `organizations memberships users client_profile.test_admin_invitations client_profile.test_characterization_chains client_profile.test_characterization_claims client_profile.test_membership_application_integrity core.test_organization_domain_contract core.test_backend_ownership_boundaries`.
- **Three new endpoint contracts: 3/3 passed on unchanged #217**, no skips, 0.050 seconds after setup in a separate detached worktree. The exact route-test class was exercised without the new composition tests. This establishes existing late callback lookup, queue-failure persistence and denied-invite/no-write behaviour before movement.
- **Initial post-extraction: 383/383 passed**, no skips/errors/failures, 28.588 seconds after setup. This extends the pre-extraction selection with the new six boundary tests, module-size, unchanged startup/signal registry and task/discovery contracts. Two further composition controls were then added.
- **Final integrated affected selection: 677 passed, seven PostgreSQL-only skips** (684 discovered), no failures/errors; 50.376 seconds after migration setup. All 840 backend Python hashes remained unchanged throughout the run; SHA-256 `b8ba92b26ca3fda9939a154fe4bcfc1988074e5a8e32cb4851a9c778f16cfdd8`.
- Scanner **11/11 passed**; graph/baseline, migration drift, shell syntax and whitespace checks passed. Migration drift reports **No changes detected**.

Final integrated command:

```bash
python backend/manage.py test \
  organizations memberships users shifts \
  client_profile.test_admin_invitations client_profile.test_characterization_chains \
  client_profile.test_characterization_claims client_profile.test_membership_application_integrity \
  core.test_organization_domain_contract core.test_backend_ownership_boundaries \
  core.test_module_size_ratchet core.test_signal_registry_contract \
  core.test_task_contracts core.test_task_dispatch_registration \
  core.test_serializer_values_boundary core.test_serializer_decomposition \
  core.test_serializer_lifecycle_ownership core.test_runtime_contract invoicing.test_delivery \
  --settings=core.contract_test_settings --verbosity=1 --noinput
```

New permanent contracts cover route-object identity, immutable binding without SQL/queue work, two fresh interpreter/import orders, no reverse organisation-to-membership/composition imports, no business importer of the composition root, post-commit dispatcher lookup, queue-error persistence and denied-invite/no-write behaviour. Existing tests retain claims/bootstrap across user personas, chain and membership removal, pending/accepted invitations, owner restrictions, cross-pharmacy/organisation denials, revocation, owner cascade protection, serializers, users/session routes, signal ownership and cold/concurrent task discovery. No existing assertion or test-discovery rule is weakened. Selection counts overlap and must not be added.

Both PostgreSQL/SQLite Serializer variants now select `organizations`, `memberships`, and the existing admin-invitation/chain/claim suites. Shared Core's existing promoted-domain selection already discovers the new organisation test module. The isolated-image script includes the same affected suites, retaining #217's parser controls and the independent shift-binding contracts.

## Integration and remaining work

Parent #217's five applicable automatic workflows passed; Full Isolated QA was skipped. The independent `c51ddf59` checkpoint also has five successful applicable workflows and a skipped Full Isolated QA. Those are historical results and cannot establish the new head's acceptance. New-head PostgreSQL, source and browser smoke results belong in the draft PR.

Three direct boundaries remain: `memberships/users`, `organizations/users`, and `client_profile/onboarding`. The living plan retains the identity-projection and migration/encryption proof requirements, plus longer runtime cycles. All earlier PRs keep fixed heads; this continuation stays draft/unmerged. No merge into a parent/default branch, deployment or live provider operation is performed. Native/device and authorised staging/provider acceptance remain separate from configured source CI.
