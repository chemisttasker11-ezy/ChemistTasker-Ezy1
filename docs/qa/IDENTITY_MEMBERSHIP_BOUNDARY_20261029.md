# Identity/membership ownership boundary

29 October 2026 (Australia/Brisbane). Fixed parent: PR #218 at `50560020bb8049b7a5742b5d2a37b5fa87c329a9`. PRs #213–#218 remain unchanged. At resumption, five applicable parent workflows passed, including all ten Shared Core jobs and release gate. Full Isolated QA was skipped; no isolated QA, deployment or live-provider acceptance is inferred.

## Preserved contracts

Identity keeps its public HTTP classes, routes, permission/validation order, token/session payloads and serializers. Membership management owns accepted-active selection, directory selection, and the existing atomic pharmacy-manager account conversion. `users.membership_port` defines an immutable service contract; `composition.identity_memberships` supplies its implementations before the unchanged URL objects are mounted. Neither identity nor membership imports the composition root. No deferred import replaces the removed edge.

| Consumer | Owner service | Preserved behavior |
| --- | --- | --- |
| Current-user session, login, refresh, mobile email OTP | `memberships.identity_reads.accepted_for_user` | Same accepted/active/current-user predicate and pharmacy join. Session retains membership IDs; token responses omit them. OTP retains its distinct role-only pharmacy projection. |
| Organization directory/hub rows | `memberships.identity_reads.directory_memberships` | Same organization, active and optional scoped-pharmacy filter, joins and ID ordering. Active pending rows remain visible; no synthetic memberships are created. |
| Pharmacy-manager account conversion | `memberships.account_management.convert_manager_account` | Same atomic owner, user-before-membership lock order, candidate/refusal rules, role/admin writes and profile callback location before commit. User adapter retains request parsing, validation, explorer conversion and response construction. |

All four accepted-membership query ASTs match the new owner after normalizing the prior `PharmacyMembership` alias and `self.user` parameter. The original atomic block matches the extracted block after substituting the explicit actor parameter and inlining the profile callback. Callback failure still rolls back all writes. No model identity, table, migration, app label, startup signal, task name, queue or notification policy changes.

## Graph proof

| Measure | Parent #218 | This batch |
| --- | ---: | ---: |
| Module edges | 103 | 103 |
| Delayed edges | 70 | 69 |
| Direct mutual pairs | 3 | 2 |
| Actual direct cyclic edges | 39 | 38 |
| Actual combined cyclic edges | 125 | 124 |
| Non-mutual cycle ledger | 33 | 34 |

Full module and combined edge comparisons remove only `users → memberships` from cyclic edges and add none. The only new graph edge is acyclic `composition → users`. Direct 11-app and combined 20-app cyclic components remain. Retained `memberships → users` is reclassified honestly into the longer-cycle ledger. No scanner exclusions or new allowed pairs.

## Verification

Four new real-route payload/directory characterization tests passed on unchanged #218 after correcting their initial test-only directory URL. The wider pre-extraction selection ran 266 tests with 265 passing and that single fixture-route failure; no production change was made for it. Initial post-extraction affected selection passed 284/284 tests with no skips/errors/failures (19.507 seconds after setup). Existing scope/delegation/invitation/manager-conversion denials remain selected.

Final integrated affected selection: **684 passed, seven PostgreSQL-only skips** (691 discovered), no failures/errors, 53.261 seconds after setup. The same 845 backend Python files retained identical SHA-256 hashes during verification. Migration drift: **No changes detected**. Graph/baseline, whitespace and shell syntax passed. Scanner unit tests: 11/11 passed. Both Serializer database variants and isolated-image QA explicitly select the new identity boundary tests; Shared Core already discovers all users tests. All earlier selections remain.

## Remaining

Two direct boundaries remain: `organizations/users` and migration-bound `client_profile/onboarding`, followed by the existing longer runtime cycles. This batch does not establish global acyclicity. Keep the continuation draft/unmerged; no parent/default-branch integration, deployment or provider operation.
