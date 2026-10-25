# Phase 6 organization manager tenant/capability separation

A Region Admin's direct `organizations.access.user_can_manage_pharmacy`
previously granted access whenever a `pharmacies` M2M contained the store,
without verifying that it belongs to the same organization or that the
admin_level carries MANAGE_ROSTER. `workforce.permissions` additionally
allowed inactive users through delegated roles.

Corrected with a single workforce capability gate for pharmacy management,
region M2M filtered to its owning organization, and active-account checks.
Managed-pharmacy visibility now matches the same scoped roster capability,
so a communication-only manager cannot acquire roster authority.
No role semantics were broadened for payroll, invoices or organization edit.

Positive/negative tests cover legitimate roster manager, cross-org forged
M2M, communication-only level, deleted role, disabled account/admin/owner,
and org-wide admin isolation. CI job will run exact-head Django tests.

No migrations, deployment or PR200 updates. Release remains NO-GO.
