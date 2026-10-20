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
| A01 | CHARACTERIZATION TESTS ADDED; POLICY NOT MODIFIED | Django `PharmacyViewSet.check_object_permissions` on unsafe requests can accept visible organizations or pharmacy assignments. Read and write permissions must be separated using role/action test matrix **after authorized policy is confirmed**. Do not silently change current legitimate edit access. |
| A02 | IMPLEMENTED; QA PENDING | Commit `174c30b`: Expo certificate key corrected from `approval_certificate` to `methadone_s8_protocols` for read and upload; JSON-list multipart serialization replaced with shared `appendPharmacyFormFields`; three Vitest cases and five Django multipart HTTP cases added. |
| A03 | ALREADY IN DRAFT #181 | `CalendarRecurrence`, occurrence-date and shared calendar methods implemented on parent; do not overwrite |
| A04 | AST INVENTORY + STRICT RATCHET; FINAL QA PENDING | Read-only `node scripts/inventory-client-api-boundaries.mjs --json` plus `node --test scripts/inventory-client-api-boundaries.test.mjs`; existing change-line ratchet is retained. |
| A05a | ROSTER SDK CLIENT MIGRATION IN PROGRESS | Vite roster grid and toolbar reuse `rosterV2`; shared wire tests added; final-head verification pending. |
| A05b | EXCLUDED: PR #182 | Do not modify, rebase, merge, cherry-pick or incorporate PR #182. No shift lifecycle, cancellation or pricing/penalty changes. |
| A05c / A10 | EXCLUDED: WINDOWS KIOSK | Windows Tauri/Rust kiosk remains separate and unchanged. Expo pairing change was reverted. |
| A06–A09 / A11 | NOT COMPLETE | See original plan. Native acceptance and full senior package remain pending. |

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

## Second implementation batch

- `5941a737`: new `backend/organizations/test_pharmacy_access_characterization.py` cross-tenant ownership/scoped visibility tests; read/write authorization implementation intentionally unchanged.
- `5941a737` plus follow-up corrective commits: new read-only `scripts/inventory-client-api-boundaries.mjs` and Node tests; detects probable direct-route and generic escape-hatch usage across current client trees. Regex/newline escaping corrections pushed.
- GitHub Actions started automatically. PASS status must be associated with final branch SHA rather than earlier commits.

## New implementation checkpoints

- Parent PR #181 remains at `bdc0b698` and is the **only** implementation base. PR #182 stays separate and untouched.
- `fc5a8f6`: reverted kiosk-related shared-core/API changes. Windows Tauri/Rust kiosk remains independent.
- `e32e24a`: narrowed nullable roster period ID to resolve Vite TypeScript failure.
- `e88860b`: shifted counter-offer API invocation to an existing shared-core operation without changing its payload or policies.
- `f0e9c27`: introduced truthful `--strict` parsing and missing-base failure for boundary audit, wider domain route matching, CLI regression tests and CI coverage. This must pass on the final PR head before merge.

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

## Latest continuation checkpoint

- `ae72c84`, `2ac5c3`: replaced line-based inventory matcher with TypeScript AST traversal for Vite/Next/Expo runtime. Handles multiline calls, template interpolation, concatenated route strings and generic transport escape hatches; reports unresolved calls honestly. Excludes Windows kiosk source and test fixtures. The scanner is **report-only**, not a zero-debt claim.
- `e45224f`: connected inventory fixture tests and `--summary` to shared-core CI, after package dependency installation. Check exact final-head CI before claiming PASS.
- No changes to #181 or #182; #191 remains stacked on #181. Windows Tauri/Rust kiosk unchanged; no merge/deploy.

## Billing SDK continuation (2026-10-20)

- Commit `ebf952b`: preserved the Expo `platform: mobile` checkout redirect parameter that the earlier shared-core checkout function dropped. Added typed billing snapshot/checkout response and migrated the Vite + Expo subscription reads and extra-seat requests to the existing shared-core billing domain. Added five Vitest wire-contract tests. No shift penalty, cancellation, payment authority or pricing logic changed; PR #182 untouched.
- The CI checks at this commit and on final head remain authoritative, not checks from a prior commit. Native payment-return URL acceptance remains outstanding.
- Full architecture remediation (A01 permission write policy, A06-A09 UI/backend decomposition and A11 native/staging acceptance) is not complete.
