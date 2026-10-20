# Senior architecture implementation ledger — PR #191

**Updated:** 2026-10-20 (Australia/Brisbane)
**Repository:** `chemisttasker11-ezy/ChemistTasker-Ezy1`
**Parent:** draft [PR #181](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/pull/181) at `216fb05c2b27ec9fd26f612956fb0e389b1cc58c`
**Remediation PR:** [#191](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/pull/191)
**Original plan:** `CHEMISTTASKER_EZY_ARCHITECTURE_REMEDIATION_HANDOVER_2026-10-20.md` (available as a separate handover artifact; do not treat this shorter progress ledger as a replacement).
**Scope:** internal Ezy repository only. No external frontend repository, production deploy, staging deploy or merge.

## Authoritative current package status (PR #191; 2026-10-20)

**Head ancestry:** PR #191 incorporates PR #181 through `216fb05` as its second-parent merge `c1e9ef3`. The sync brought four parent-only planner files with no overlap with PR #191 changes.

| Package | Status | Required exit criterion |
| --- | --- | --- |
| A00 ownership / sequencing | PARTIAL | Complete owner/domain manifest and assess four newer #181 files for nonconflicting synchronization. |
| A01 pharmacy authority | BLOCKED ON OWNER POLICY | Historic read/write coupling retained; DELETE and sensitive fields require separate authorization decisions and negative matrix tests. No privilege changes approved. |
| A02 pharmacy multipart | CODE IMPLEMENTED; NATIVE QA OPEN | Android/iOS document-picker/upload/readback and failure retry on live seeded backend. |
| A03 calendar | OWNED BY #181 | No shadow implementation here; sync parent only after overlapping-file review. |
| A04 transport inventory | PARTIAL | AST report and added-line ratchet exist. Classify every finding, build documented allowlist/ownership manifest and enforce whole-tree strict only after review. |
| A05a roster SDK | PARTIAL | Vite named operations and wire tests exist; cross-platform lifecycle, errors, headers, idempotency and PostgreSQL parity require evidence. |
| A05b financial / #182 | FROZEN | Keep existing tests incl. chargeShiftFulfillment; defer new policy/penalty/offer migrations until #182 contracts stable. |
| A05c Next/Expo | PARTIAL | Next public-content ownership and Expo native boundary still to classify. |
| A06 Next/Vite twins | NOT COMPLETE | Twin inventory, ownership decisions and removal of verified duplicates. |
| A07 component decomposition | EARLY | HoursRow and roster type extraction done; split true orchestration after green behavior contracts. |
| A08 design identity | EARLY | Brand tokens added without visual changes; persona semantic mapping, accessibility, generated skill icon check remain. |
| A09 Django dependency graph | PARTIAL | SCC report exists; import-time AST scope corrected with tests. Approved legacy SCC baseline and new-cycle rejection pending. |
| A10 Windows Tauri/Rust kiosk | EXCLUDED FROM SHARED-CORE MIGRATION | Independent application; runtime unchanged. Existing independent smoke/gates still protect it; no kiosk refactor needed for #191. |
| A11 Senior Package Testing | NOT COMPLETE | Exact-head full QA, Postgres upgrade rehearsal, Vite/Next real-stack E2E, Android/iOS native and visual evidence. |

**Live CI finding before this corrective batch:** at `5e9d063`, mobile, shared-core, Vite, Next, PostgreSQL concurrency and architecture jobs passed. Backend failed because the existing permission gate returned **403** for unrelated manager PATCH while a new characterization expected **404**. The test now expects the observed existing policy response; the underlying permissions were **not** modified. No exact-head green assertion is made here.

**Important:** `--strict` in `audit-shared-core-boundary.mjs` is a diff-base validity ratchet, **not** zero legacy bypasses. The inventory remains report-only. The generated count of 176 was an unclassified previous-head snapshot, not 176 proven violations.

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

## A09 backend cycle graph (current continuation)

- Commit `9304d08`: added `scripts/module_import_graph.py` (machine-readable and CLI check of module-level versus delayed runtime Django-app import edges), five standard-library regression tests, and the existing architecture CI job invokes both. The authoritative eight-pair allowlist is **read from** `backend/core/test_backend_ownership_boundaries.py` using Python AST, rather than duplicated or widened.
- No Django runtime imports, model labels, migration files, Celery tasks or Windows kiosk code were modified. The graph baseline is an inspection tool and explicitly does not assert zero existing cycles.
- Tests and exact-head CI remain pending; do not claim 100% completion before real execution and A01 authorization resolution.

## Parent synchronization and QA scope — 2026-10-20

- Merge commit `02f0776` incorporated exactly seven newer #181 source files (calendar/planner/shared-core presentation changes). It has two parents: existing PR #191 and current PR #181 `68b22eca`. No intersecting #191 paths; #182 not a parent or cherry-pick.
- AST inventory log correction `b91a3dc` now prints the actual `callee` and `route` fields rather than the removed `evidence` property.
- `ad161745` explicitly includes new pharmacy-tenant and multipart tests in the backend CI job. Previously they were in source but were not a separately required CI step.
- The implementation must remain aligned to changing #181 head without silently including #182 decisions. Full native/staging/manual and backend-test evidence is still required. A passing CI job on an older head does not apply to final head.

## Consolidated checkpoint (one implementation commit)
- Incorporated the latest PR181 planner/UI state as a true second-parent merge, including tracked screenshot assets. PR182/Windows kiosk remain excluded.
- Added separate pharmacy-profile write-authority check (owner, full manager, authorized org or scoped region manager), not mere read visibility. Added nine negative/positive Django HTTP tests. Requires exact-head CI and policy verification before release.
- Extracted Expo closed-hours row and Vite roster DTO interfaces without altering logic; ensured brand hex colors are referenced from a shared identity token while retaining identical UI output.
- Final release tests including native device testing are not represented as complete. This PR remains draft; no merge or deploy.

## Senior review corrective work (20 Oct 2026)
- Commit `e669c576` repairs Expo syntax, checks the saved hashed file rather than its original filename, restores the original fulfillment payment wire test, and reverts unapproved pharmacy write permissions. The previously added policy test was removed because it asserted an unapproved role matrix. `PHARMACY_WRITE_POLICY_DECISION.md` records the unresolved owner choice and required POST/PUT/PATCH/DELETE tests.
- The existing permission_denied positional-argument misuse was corrected without changing the previous authorization semantics.
- Additional import-cycle SCC reporting and tests are being added without altering app model identity or migration paths.
- PR #182 and Windows kiosk runtime remain untouched. Exact-head CI, full isolated QA and Android/iOS manual acceptance remain required; this is not a 100% completion claim.

## Current review remediation checkpoint

- Commits `0512a5b` onward: characterized legacy manager PATCH 403 without altering policy; expanded import-graph AST traversal to recognize import-time control flow and class body imports; exclude type-checking guards. Added fixtures. This change is in PR191 only.
- No claim of completed A04/A06/A07/A08/A11. **Do not merge** or deploy this draft.
- The Windows kiosk is intentionally **outside** shared-core, Vite/Next/Expo migration and PR191's refactor completion criteria. Keep its separate existing CI gate.

## Audit controls added in this continuation

- `scripts/inventory-client-api-boundaries.mjs --strict` is a **true whole-tree classification gate** separate from the preexisting added-line ratchet. Each stable callsite needs a reviewed manifest decision with owner and rationale. An empty manifest is deliberately not considered acceptable when candidate calls remain. No existing callsite is auto-approved.
- `docs/handover/architecture-remediation-2026-10-20/CLIENT_BOUNDARY_MANIFEST.json` is initially empty; classifying existing calls is still required. `client-boundary-inventory.json` is now an explicit GitHub Action review artifact, with detailed callsites in the CI log. `--strict` is not called by the release gate while this legacy debt is outstanding; this is intentional, not completion.
- `scripts/audit-generated-skill-icons.mjs` compares registry codes, generated native require mappings and PNG asset names without changing the drawings or kiosk. Added as a dedicated architecture CI step.
- This is still a **draft** until every classification, domain migration, policy approval and full acceptance is complete. The full-isolated QA workflow has been **skipped**, not passed, on prior commits.

## Latest parent synchronization

- Merge `c1e9ef3` incorporates precisely four newer PR #181 files: the planner handover, Vite planner E2E test, calendar page and shared-core planner test. Parent merge is recorded as second parent. Compare from former parent `6b6e2f7` confirmed no overlap with the 33 PR #191-specific modified files. PR #182 and #184 are not included.
- The final exact-head CI remains authoritative. Earlier successful checks and canceled runs are not a pass for this merge.
