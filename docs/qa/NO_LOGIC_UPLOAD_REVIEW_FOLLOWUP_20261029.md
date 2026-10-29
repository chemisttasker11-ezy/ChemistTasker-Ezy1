# PR #214 — review follow-up without behaviour changes

29 October 2026 (Australia/Brisbane). Parent: `cd07a401eb0cabf690b9f89d70e570fabc38ba67`. PR #214 stays stacked on draft PR #213 at `737e82bcc433e7513fd341251570f1ac2af86073`.

## Scope and invariant

This continuation changes tests and evidence only. Every production file, including the decomposed billing services and upload validator, remains identical to its parent. No database migration, permission, settlement, financial, delivery or provider behaviour changes.

The protected upload contract is: authorised participants can send supported attachments with the complete original bytes and existing metadata; disguised attachments are rejected; non-participants cannot create messages or stored files. Both existing writers are exercised:

| Writer | Positive proof | Negative proof |
| --- | --- | --- |
| `ConversationViewSet.messages`, `/api/v1/rooms/<id>/messages/` | PDF/image, saved sender/body/name/URLs, recipient read-back, full bytes beyond the 8192-byte signature read; two valid files preserve order, response array and caption only on first message | Disguised PDF returns the existing 400; non-participant returns the existing 404; neither single-file rejection stores a message/file |
| `MessageViewSet.create`, `/api/v1/messages/` | Same PDF/image, persistence, metadata, full byte and recipient read-back controls | Disguised PDF returns the existing 400; non-participant returns the existing 403; neither rejection stores a message/file |

Tests use the normal authenticated multipart endpoints, actual validator, database and disposable local file storage. Signature fixtures exercise the existing signature policy; they do not introduce a full PDF/image decoder or a new validation requirement. No upload, validator, storage or permission mocks are used.

The import guard now detects `from core.file_validation import ...`, `import core.file_validation`, aliases, `from core import file_validation`, and function-local instances. A positive/negative guard control proves these forms are detected while unrelated imports and strings remain allowed. This strengthens test enforcement only; it changes neither the runtime scanner nor its exclusions/allowlists. Existing CI discovers the chat tests through its `chat` selection and explicitly selects the upload architecture module.

## Validation

- Final local selection: **168/168 passed**, no skips/errors/failures, 18.734 seconds after migration setup. This consists of **167 permanent selected tests plus one disposable diagnostic** kept outside the repository. The permanent selection is the same command recorded in `NO_LOGIC_UPLOAD_CLEANUP_20261029.md`; it now discovers four added chat tests and one added import-guard test. The diagnostic uses a separate test module via `PYTHONPATH` and is not shipped or selected by CI.
- Preliminary selection, before the multi-valid-attachment case was added: 9/9 passed.
- Import scanner unit tests: 11/11 passed. Graph and existing baseline check passed with the six remaining pairs and longer cycles explicitly reported.
- Validator byte comparison against PR #213: identical. Every production file is identical to `cd07a401`; billing is also identical to `737e82bc`.
- Whitespace check: passed. No migration source changed. Prior migration-drift evidence is retained; this tests/documentation continuation requires no new migration.
- Local database: disposable SQLite using `core.contract_test_settings`; no new local PostgreSQL concurrency result is claimed.

The parent `cd07a401` was independently refreshed through GitHub: Shared Core Consolidation, Serializer Decomposition, Backend Finalization, E2E Runner Smoke and Public Repository Security all completed successfully. Full Isolated QA was skipped. These results describe the parent, not the new continuation head. No full-QA label is added during this targeted coding batch. Hosted checks for the new head must be evaluated independently; neither deployed upload smoke, native/device nor actual provider acceptance is claimed.

## Multi-attachment finding — discussion required

A disposable diagnostic reproduced the normal room-message endpoint with two files: a signature-confirmed `first.pdf`, then `disguised.pdf` with invalid bytes. The response was the existing HTTP 400, while exactly one message and its first stored attachment remained. This is now a runtime-reproduced issue in the local SQLite contract environment, not merely a source candidate. No PostgreSQL or deployed-storage reproduction is claimed. The endpoint production source is unchanged from the parent and PR #213, so this is not introduced by the upload extraction.

Changing this to all-or-nothing behaviour would be an intentional correctness change. Keep it separate from this tests-only continuation. Discussion must define whether a mixed batch rejects all files or returns explicit partial success, and how stored files and any emitted side effects are cleaned up. A database transaction alone does not roll back file-storage writes. No corrective implementation, failing acceptance test or permanent regression that requires retaining partial writes is shipped here.

## Remaining six dependency boundaries

The graph remains 101 module-level app edges, 72 delayed edges, six mutual pairs, 42 actual SCC-internal cyclic edges and one direct 11-app cyclic component. This continuation removes no additional runtime edge and makes no zero-cycle claim. The existing longer-cycle ledger contains 30 entries after the previous reclassification; it is not the full cyclic-edge count.

The source ledger below was regenerated from `scripts/module_import_graph.py` and contains all 87 module-level import locations contributing to the six remaining direct mutual pairs. Reproduce the complete runtime evidence, including longer and delayed paths, with:

```bash
python3 scripts/module_import_graph.py --json
python3 scripts/module_import_graph.py --check --check-baseline
```

| Boundary | Intended direction / next structural proof |
| --- | --- |
| `core ↔ users` | Keep composition in core. Separate generic task-registry/queue mechanics from the email-notification orchestration currently embedded in `core.task_queue`; users should consume lower-level queue infrastructure. Prove historical aliases, cold/concurrent task discovery, option mutation, eager/non-eager dispatch, OTP behaviour and commit timing before moving callers. |
| `core ↔ shifts` | Keep composition/sitemap dependencies from core to shifts. The reverse imports reach task dispatch plus neutral serializer parsing. Queue ownership work above and a neutral parsing owner can remove reverse coupling, provided all successful and failed-dispatch behaviour stays unchanged. |
| `memberships ↔ organizations` | Membership facts may depend on organisations. Organisation endpoints currently orchestrate membership management and embed membership serializers. Move that orchestration to its proper service owner while retaining endpoint adapters, actor scope, payloads, validation order and model identity. Moving imports alone will not close this boundary. |
| `memberships ↔ users` | Preserve identity dependencies from membership facts. Identity serializers, authenticated-session payloads and organisation-account operations currently also read pharmacy memberships; separate those projections/orchestration while preserving their public outputs and model references. Rebuild the full graph to avoid replacing a pair with a longer cycle. |
| `organizations ↔ users` | Separate organisation-specific account orchestration and shared role/capability facts from identity. `OrganizationMembership` also references organisation models/admin choices, so source-level movement needs model/deconstruction and startup proof even without a database change. |
| `client_profile ↔ onboarding` | Leave migration-bound field-path work last. The reverse edge is `onboarding.models → client_profile.fields.EncryptedTextField`; historical migration imports and field deconstruction must remain exact. Compatibility debt remains visible until a verified adapter preserves replay and identities. |

Further behaviour-preserving cleanup is authorised. These are next-batch structural requirements, not a request to approve policy changes, and none of the six pairs is marked resolved. Do not move the whole task dispatcher into infrastructure: it currently owns email notification creation/commit behaviour and imports users tasks. That would carry business coupling into the purported lower-level package. Do not remove cycles through deferred imports or scanner exclusions.

## Discussion register and integration boundary

Keep the prior financial and operational discussion register open: payroll activation replay/locked-period transitions; checkout obligations and uncertain payments; billing activation/account trial ownership/store-local penalties; invoice rounding/GST cutover; notification cooldown/success/retry rules; durable critical deliveries; configured Stripe/SMTP/broker acceptance. This continuation authorises none of those behaviour changes.

Both PRs remain draft and unmerged. No merge, retarget, deployment, live email/Stripe/provider action or production data operation is performed. Integrate PR #213 first through the agreed release process, then retarget PR #214 and re-check its diff/CI against the actual merged base. This evidence is scoped source/test progress, not final five-area or production acceptance.

## Source-level mutual-import ledger

Read-only snapshot of runtime imports at cd07a401; tests-only continuation changes no runtime edges.

| Dependency | Importing source | Imported module |
| --- | --- | --- |
| client_profile → onboarding | `client_profile/models/common.py:14` | `onboarding.models` |
| client_profile → onboarding | `client_profile/models/onboarding.py:7` | `onboarding.models` |
| client_profile → onboarding | `client_profile/tasks.py:22` | `onboarding.tasks` |
| client_profile → onboarding | `client_profile/tasks.py:30` | `onboarding.verification.reminders` |
| core → shifts | `core/sitemap.py:10` | `shifts.models` |
| core → users | `core/api_v1_urls.py:11` | `users.views` |
| core → users | `core/asgi.py:14` | `users.jwt_ws` |
| core → users | `core/websocket_testing.py:10` | `users.jwt_ws` |
| core → users | `core/websocket_testing.py:11` | `users.models` |
| memberships → organizations | `memberships/access.py:6` | `organizations.access` |
| memberships → organizations | `memberships/access.py:7` | `organizations.models` |
| memberships → organizations | `memberships/invites.py:30` | `organizations.models` |
| memberships → organizations | `memberships/models.py:7` | `organizations.models` |
| memberships → organizations | `memberships/notifications.py:10` | `organizations.access` |
| memberships → organizations | `memberships/notifications.py:11` | `organizations.models` |
| memberships → organizations | `memberships/selectors.py:6` | `organizations.access` |
| memberships → organizations | `memberships/selectors.py:13` | `organizations.models` |
| memberships → organizations | `memberships/serializers.py:9` | `organizations.models` |
| memberships → organizations | `memberships/serializers.py:15` | `organizations.serializers` |
| memberships → organizations | `memberships/tasks.py:17` | `organizations.models` |
| memberships → organizations | `memberships/views.py:4` | `organizations.models` |
| memberships → users | `memberships/access.py:8` | `users.models` |
| memberships → users | `memberships/access.py:9` | `users.org_roles` |
| memberships → users | `memberships/applications.py:14` | `users.models` |
| memberships → users | `memberships/applications.py:15` | `users.normalization` |
| memberships → users | `memberships/invites.py:31` | `users.models` |
| memberships → users | `memberships/invites.py:32` | `users.normalization` |
| memberships → users | `memberships/notifications.py:12` | `users.models` |
| memberships → users | `memberships/notifications.py:13` | `users.org_roles` |
| memberships → users | `memberships/selectors.py:14` | `users.org_roles` |
| memberships → users | `memberships/serializers.py:10` | `users.serializers` |
| memberships → users | `memberships/serializers.py:13` | `users.presentation` |
| memberships → users | `memberships/serializers.py:14` | `users.normalization` |
| memberships → users | `memberships/tasks.py:18` | `users.models` |
| memberships → users | `memberships/tasks.py:19` | `users.org_roles` |
| memberships → users | `memberships/tasks.py:20` | `users.navigation` |
| memberships → users | `memberships/tasks.py:21` | `users.tasks` |
| memberships → users | `memberships/views.py:15` | `users.normalization` |
| memberships → users | `memberships/views.py:20` | `users.models` |
| onboarding → client_profile | `onboarding/models.py:9` | `client_profile.fields` |
| organizations → memberships | `organizations/claims.py:3` | `memberships.models` |
| organizations → memberships | `organizations/views.py:7` | `memberships.models` |
| organizations → memberships | `organizations/views.py:12` | `memberships.access` |
| organizations → memberships | `organizations/views.py:13` | `memberships.role_resolution` |
| organizations → memberships | `organizations/views.py:14` | `memberships.serializers` |
| organizations → memberships | `organizations/views.py:31` | `memberships.labels` |
| organizations → memberships | `organizations/views.py:35` | `memberships.serializers` |
| organizations → users | `organizations/access.py:9` | `users.org_roles` |
| organizations → users | `organizations/claims.py:12` | `users.normalization` |
| organizations → users | `organizations/claims.py:13` | `users.navigation` |
| organizations → users | `organizations/claims.py:21` | `users.models` |
| organizations → users | `organizations/claims.py:22` | `users.org_roles` |
| organizations → users | `organizations/claims.py:23` | `users.utils` |
| organizations → users | `organizations/serializers.py:8` | `users.serializers` |
| organizations → users | `organizations/serializers.py:16` | `users.models` |
| organizations → users | `organizations/serializers.py:17` | `users.org_roles` |
| organizations → users | `organizations/views.py:11` | `users.permissions` |
| organizations → users | `organizations/views.py:42` | `users.models` |
| organizations → users | `organizations/views.py:43` | `users.org_roles` |
| shifts → core | `shifts/announcements.py:12` | `core.task_queue` |
| shifts → core | `shifts/assignment.py:14` | `core.task_queue` |
| shifts → core | `shifts/base.py:85` | `core.task_queue` |
| shifts → core | `shifts/browse.py:30` | `core.task_queue` |
| shifts → core | `shifts/cancellation.py:10` | `core.task_queue` |
| shifts → core | `shifts/candidates.py:14` | `core.task_queue` |
| shifts → core | `shifts/context.py:4` | `core.serializer_values` |
| shifts → core | `shifts/counter_offers.py:11` | `core.task_queue` |
| shifts → core | `shifts/emails.py:13` | `core.task_queue` |
| shifts → core | `shifts/interest.py:13` | `core.task_queue` |
| shifts → core | `shifts/offers.py:30` | `core.task_queue` |
| shifts → core | `shifts/tasks.py:13` | `core.task_queue` |
| shifts → core | `shifts/worker_requests.py:13` | `core.task_queue` |
| users → core | `users/api_account.py:8` | `core.task_queue` |
| users → core | `users/api_organizations.py:22` | `core.task_queue` |
| users → core | `users/api_otp.py:14` | `core.task_queue` |
| users → core | `users/views.py:7` | `core.task_queue` |
| users → memberships | `users/api_organizations.py:10` | `memberships.models` |
| users → memberships | `users/serializers.py:18` | `memberships.models` |
| users → memberships | `users/sessions.py:5` | `memberships.models` |
| users → organizations | `users/api_otp.py:11` | `organizations.access` |
| users → organizations | `users/models.py:5` | `organizations.models` |
| users → organizations | `users/org_roles.py:12` | `organizations.models` |
| users → organizations | `users/serializers.py:12` | `organizations.models` |
| users → organizations | `users/serializers.py:17` | `organizations.models` |
| users → organizations | `users/serializers.py:19` | `organizations.access` |
| users → organizations | `users/sessions.py:4` | `organizations.access` |
| users → organizations | `users/sessions.py:6` | `organizations.models` |
