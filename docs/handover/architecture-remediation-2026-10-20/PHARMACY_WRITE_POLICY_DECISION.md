# Decision required: pharmacy-profile write authority

**Status: OPEN — no owner-approved role/action matrix as of 20 October 2026.**

PR #191 briefly enforced a new role matrix through `can_edit_pharmacy_profile`. That implementation was **reverted without changing the existing deployed semantics**, pending explicit approval. The original read-versus-write coupling remains a known authorization policy gap and must be resolved deliberately before release.

## Proposed, not yet approved

- Owners may edit the pharmacies they own.
- Full active pharmacy managers may edit delegated pharmacy profiles.
- Organization admins and chief admins may edit pharmacies in their organization.
- Scoped region managers at MANAGER level may edit assigned pharmacy profiles.
- Roster-only and communication-only assignments may view their permitted pharmacies but not edit profiles.
- **Deleting a pharmacy is not a profile edit.** Require a separate destructive-action policy and evidence for dependent data before granting DELETE.
- Require separate decisions for regulated documents, ABN evidence, legal verification status, billing and organization control-plane settings; viewing or editing ordinary contact information is not authorization for those fields.
- Preserve tenant isolation and 404 for out-of-scope objects.

## Tests required after owner approval

Role × GET, POST, PUT, PATCH, DELETE, including inactive assignments, cross-tenant objects, unscoped organization staff, dual-persona owner/managers and sensitive document fields. Use server-side tests and browser/native verification. Do not add skipped or expected-failing tests as release evidence.

The scoped proposal code and tests from previous commit `a1ed1ef7` remain recoverable in Git history. **Do not silently restore them** before approval.
