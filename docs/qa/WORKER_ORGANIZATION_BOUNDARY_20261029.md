# Worker-safe identity/organisation selector ownership

Fixed parent: draft PR #223 at `4cba71348a912e599b8b2d2a84260677d2bb946b`.
The user requested continued dependency work while hosted checks run independently.

## Rule and implementation

Identity helpers expose the same organisation scope and dashboard destination in workers,
management commands and HTTP. Organisation models are queried by organisation-owned selectors;
scope and navigation are not substituted for action-specific authorisation.

| Entry point | Canonical query owner | Preservation |
| --- | --- | --- |
| users.org_roles.membership_visible_pharmacies | organizations.identity_reads.visible_pharmacies_for_membership | Same org-wide/region/no-membership/unknown-role rules, foreign-org filtering and queryset model |
| users.navigation._pharmacy_manager_dashboard_url | organizations.identity_reads.manager_dashboard_pharmacy_id | Same active-assignment filter, ID ordering, first pharmacy and invitation fallback |
| Existing identity serializer/session organisation reads | Existing immutable identity port, now configured at startup | Same selector objects; workers no longer require URL composition |

The scope function's AST is identical after relocating its model import and renaming the owner.
The navigation queryset expression is AST-identical. In particular, navigation keeps its existing
behavior for inactive user objects; it does not adopt the stricter actor filtering of the
action-authorization selector. No permission, tenant-scope or account-activation policy changes.

Application composition binds the port after all models load. The hook's allowed AST is extended
only by this explicit configuration binding. Cold worker tests require a configured port before
any HTTP URL import and forbid SQL, HTTP and task dispatch during startup. Rebinding is idempotent.
Domain signal-only hooks, frozen port data and the receiver registry remain guarded.

## Graph and compatibility

No direct cyclic edges/components/mutual pairs. Combined cyclic edges **114 → 113**:
only users → organizations is removed, at all import depths. No new cyclic edge or component
expansion; the twenty-app combined component remains. The baseline tightens and the generated
ledger records every retained source. Source module/delayed edges: 102 / 64.

Historical identity function paths remain callable; no model, table, migration, task registration,
endpoint, payload, money or notification behavior changes. All financial and delivery policy
decisions previously deferred remain deferred.

## Verification

Seven real-database scope/navigation behavior cases passed before movement on unchanged #223.
Fifteen post-move ownership/startup/registry/signal controls pass, including worker-before-HTTP
binding and the existing cold worker helpers. Query source equivalence, graph/baseline/ledger,
13 scanner tests, shell syntax and whitespace pass. Final affected-domain selection:
**367/367 passed**, zero skips/failures/errors, 65.003 seconds after disposable SQLite setup.
It covers all users, organisations and memberships plus task, registry, signal, ownership and
route contracts. Fifteen focused post-move controls pass separately; counts overlap. Migration
drift is clean and released migrations are unchanged. Hosted acceptance must use this branch's exact head.

The new module is explicitly selected by Shared Core, both Serializer database variants and
isolated QA. No waiting on hosted gates is required to proceed with separately bounded source work.

## Remaining programme

The three previously named ownership candidates are now addressed: file lifecycle/registry,
ABR mechanics, and worker-side organisation scope/navigation. Module-level cycle removal is
complete; combined runtime acyclicity is not. Remaining cross-domain orchestration and historical
facades are explicit debt, not a reason to move business decisions into infrastructure.

Further work must name a concrete owner/consumer benefit, preserve worker bootstrap and historical
contracts, and demonstrate a non-growing combined cyclic-edge set. Do not introduce HTTP-only
ports for worker code or unify intentionally different scope/action/financial decisions.
Financial/settlement and notification changes still need their separately agreed contracts.
Native/device, provider, deployed upload smoke and stacked merge integration remain release evidence.
