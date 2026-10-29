# Onboarding encryption boundary with historical migration identity

29 October 2026 (Australia/Brisbane). Fixed parent: draft #220 at `f97712b35cd746b27405e4506f0ceedeb6896b43`. Earlier draft heads remain unchanged.

## Implementation and invariant

The complete encryption implementation is copied **byte-for-byte** from the parent's `client_profile.fields` to `infrastructure.encrypted_fields`; SHA-256 `346e41183b3ea6a4bd2d3d27622088074cc15d1d8d4617a9b24a01848f7b374b`. Onboarding imports its field from infrastructure. Infrastructure imports no business domain or composition package.

`client_profile.fields` explicitly re-exports the identical class, prefix, Fernet builder and original import names. It binds the class's historical module metadata using its own `__name__`. The kernel model facade loads that metadata before its existing model exports. Thus model discovery, migrations, field deconstruction and pickle retain `client_profile.fields.EncryptedTextField`; no class copy/subclass or migration-path change is introduced. There is no new AppConfig.ready hook, signal receiver, dynamic import, settings change, database query or task dispatch at bootstrap. Both neutral-first and legacy-first imports are tested in fresh processes.

Key derivation, ciphertext prefix, Fernet behavior, None/empty handling, legacy plaintext and corrupt/wrong-key fallback remain unchanged. Preparation of *valid* ciphertext already decrypts through TextField.to_python and then re-encrypts the plaintext with a fresh Fernet nonce; the tests pin that existing behavior rather than requiring deterministic ciphertext. Raw storage round-trips cover both historical onboarding models and a fixed saved pre-extraction ciphertext.

The obsolete onboarding → kernel import exemption is removed. The direct mutual-pair allowlist is now empty; its scanner test requires exactly an empty set instead of its stale assumption that at least one pair exists. The kernel code-line ceiling tightens **291 → 260**, and its definition ledger shrinks. No import/string allowlist or scanner exclusion is added. Released migration files are unchanged.

## Graph proof

| Measure | #220 | This batch |
| --- | ---: | ---: |
| Module edges | 104 | 104 |
| Delayed edges | 69 | 69 |
| Direct mutual pairs/exemptions | 1 | 0 |
| Actual direct cyclic edges | 23 | 22 |
| Actual combined cyclic edges | 124 | 123 |
| Non-mutual cycle ledger | 21 | 22 |

Both full graph comparisons remove only `onboarding → client_profile` from actual cyclic edges; no cyclic edge is added. The only new source edge is acyclic `client_profile → infrastructure`; onboarding already depended on infrastructure. Retained kernel-to-onboarding becomes part of the non-mutual ledger. The eight-app direct and 20-app combined cyclic components remain unchanged. **No global-acyclicity claim follows from zero mutual pairs.** Exact remaining cyclic edges, including all module/delayed source locations, are in `docs/architecture/RUNTIME_CYCLE_LEDGER_20261029.json`.

## Verification

Before source movement, four behavior controls and the storage control ran against unchanged #220. An initial test-only assumption of deterministic valid-ciphertext preparation failed; after correcting that expectation to the existing decrypt/re-encrypt behavior, all four behavior tests passed on the unchanged implementation (0.002 seconds). The storage control had passed in the original run. No production logic was changed for the expectation.

Initial affected selection: **345 passed, one PostgreSQL-only skip** (346 discovered), no errors/failures, 23.686 seconds after setup. Four additional ownership/migration-state/import-order controls passed with no database (2.112 seconds). Migration drift reports **No changes detected**. Disposable SQLite creation replays the historical migrations, while a no-SQL MigrationLoader state check verifies both historical field definitions. The copied implementation was compared byte-for-byte with immutable #220.

Final integrated affected selection: **953 passed, eight PostgreSQL-only skips** (961 discovered), no errors/failures, 66.872 seconds after setup. All 854 backend Python hashes remained unchanged. Selection includes organizations, memberships, all users, all shifts, all onboarding, claims/admin/chain/membership-application routes, model/serializer/runtime/startup/task contracts and invoice delivery. The new controls are explicitly selected in Shared Core, both Serializer database variants and isolated-image QA, preserving all earlier selections. Eleven scanner tests, graph/baseline, shell syntax and whitespace checks pass. New-head PostgreSQL/source/browser acceptance must be checked independently; skipped checks are not passes.

## Remaining runtime work

All three direct mutual boundaries present at resumption are retired. There remain **22 direct cyclic edges** and **123 combined module/delayed cyclic edges**, including the two original identity worker-helper dependencies. The graph ledger is the exact next source inventory. Start with reverse core utility/task imports and the historical attachment upload helper, preserve migration/pickle metadata and task identities, then remeasure all source edges. Domain projections and background-worker composition need their own before/after bootstrap proof; HTTP-only bindings must not be imposed on worker helpers.

Keep draft/unmerged. No parent/default-branch integration, retargeting, deployment, provider operation, native/device or staging acceptance.
