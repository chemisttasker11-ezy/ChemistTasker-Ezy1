# Senior architecture implementation ledger — PR #191

**Updated:** 2026-10-20 (Australia/Brisbane)
**Repository:** `chemisttasker11-ezy/ChemistTasker-Ezy1`
**Parent:** draft [PR #181](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/pull/181) at `bdc0b698d7848f50b6cc5e8bd8d484d455089426`
**Remediation PR:** [#191](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/pull/191)
**Original plan:** `CHEMISTTASKER_EZY_ARCHITECTURE_REMEDIATION_HANDOVER_2026-10-20.md` (available as a separate handover artifact; do not treat this shorter progress ledger as a replacement).
**Scope:** internal Ezy repository only. No external frontend repository, production deploy, staging deploy or merge.

## Status

| ID | Current state | Evidence / next action |
| --- | --- | --- |
| A00 | STARTED | Parent PR verified; branch made directly on #181; stacked #182 and #184 protected |
| A01 | ASSESSED; POLICY NOT MODIFIED | Django `PharmacyViewSet.check_object_permissions` on unsafe requests can accept visible organizations or pharmacy assignments. Read and write permissions must be separated using role/action test matrix **after authorized policy is confirmed**. Do not silently change current legitimate edit access. |
| A02 | IMPLEMENTED; QA PENDING | Commit `174c30b`: Expo certificate key corrected from `approval_certificate` to `methadone_s8_protocols` for read and upload; JSON-list multipart serialization replaced with shared `appendPharmacyFormFields`; three Vitest cases and five Django multipart HTTP cases added. |
| A03 | ALREADY IN DRAFT #181 | `CalendarRecurrence`, occurrence-date and shared calendar methods implemented on parent; do not overwrite |
| A04–A11 | NOT STARTED | Refer to full plan and unblock per dependency order |

## Exact test commands (not yet marked PASS)

```bash
cd shared-core && npm ci && npm run typecheck && npm run test:ci
cd ../frontend_mobile && npm ci && npm run lint && npx tsc --noEmit
cd ..
python backend/manage.py test organizations.test_pharmacy_upload_contract --settings=core.contract_test_settings
python backend/manage.py test organizations users.test_region_delegation --settings=core.contract_test_settings
python backend/manage.py makemigrations --check --dry-run --settings=core.contract_test_settings
```

Then verify emulator/device multipart uploads against isolated seeded Django/PostgreSQL, and exact-head GitHub Actions. Do not count existing PR #181 checks as #191 evidence. Do not record skipped full-isolated QA as passed.

## A02 behavioral guardrails

- Match Django `PharmacySerializer` canonical file fields exactly.
- `employment_types`, `roles_needed`, `software`, `services` must each be encoded once as a JSON array when using multipart. JSON-only requests are unchanged.
- React Native `DocumentPicker` file attachments remain native; shared-core helper only encodes scalar and array fields.
- Existing certificates remain when no replacement upload is provided.
- No schema, endpoint, authorization, onboarding policy, shifts/payment, calendar or kiosk behavior is intentionally changed.

## Next actions

1. Inspect final-head CI and fix code/test defects surgically.
2. Characterize A01 permission behavior with **negative** tenant tests and capability-action matrix, without authorizing any write change by assumption.
3. Implement A04 whole-tree inventory/strict audit with truthful handling of missing git comparison base.
4. Continue A05–A11 as independent domain-scope PRs after their dependencies are satisfied, running the Senior package testing handbook each time.

**Merge status: NOT MERGE READY**, pending exact-head CI, dedicated backend tests, native upload acceptance and ownership/capability decisions.
