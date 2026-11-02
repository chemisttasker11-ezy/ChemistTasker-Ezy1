# Chat attachment batch rejection and PR #214 closure

29 October 2026 (Australia/Brisbane). Immutable parent: `dc371fce307d20055116b94ca86206daa186c8eb`, approved draft PR #214. This correctness fix is a separate draft PR stacked on #214. The user explicitly requested the chat fix after previously deferring workflow changes; that authorisation is limited to this upload issue.

## Invariant and intentional correction

A room-message request containing an invalid attachment must return the existing validation error before any message, permanent attachment file or message-delivery callback from that request is created. Existing messages/files, conversation ordering and participant read positions must remain unchanged. Valid requests retain their existing captions, order, metadata, recipients, permission checks, status codes and single-object/multiple-object response shapes.

Previously, `ConversationViewSet.messages()` validated and saved one file at a time. An invalid second or later file returned 400 after earlier messages and files had already persisted. The fix validates the entire attachment list in its original order, then enters the existing creation loop. There is one additional loop boundary and explanatory comment; no validator, policy, storage implementation or business-domain service changes.

This is an **intentional correctness change**, not a logic-neutral refactor: a rejected batch no longer leaves earlier valid attachments behind. It preserves the error response rather than introducing partial-success responses. Validation happens after the existing conversation and participant checks. The first validation error, file policy and stream-restoration implementation remain unchanged.

No database-transaction-only workaround is used. Because invalid batches never reach a storage save, rejected files do not need compensating deletion. This guarantee concerns attachment-policy rejection. It does not claim transactional rollback across arbitrary later database/storage outages, and no new storage retry or deletion protocol is introduced.

## Writer ledger

| Normal application path | Guard / coverage |
| --- | --- |
| `ConversationViewSet.messages()`, POST `/api/v1/rooms/<id>/messages/` | Only multi-attachment creation loop. All files validated before entering the unchanged message creation loop. Invalid-first/middle/last, invalid extension, oversized second file and successful multi-file controls run through the actual multipart endpoint. |
| `MessageViewSet.create()`, POST `/api/v1/messages/` | Existing single-attachment writer validates its selected file before creating its message. Preserved, with positive/negative attachment and non-participant controls. Its existing single-file contract is not converted into a batch contract. |
| `MessageViewSet.update()` / `MessageSerializer` | Update changes message text only; serializer attachment fields are read-only. No additional attachment creation writer found in chat runtime source. |
| `broadcast_new_message()` | Registers delivery on commit after message creation. Rejected batches create no messages and register no callbacks. The signal's delivery semantics are untouched. |
| Direct privileged ORM/admin operations | Outside this HTTP upload correction; no new privileged-operation policy. |

## Failing-first and successful-user evidence

Before the production change, the two new regression methods ran on the immutable parent with only tests added. They reported **four expected failures**: invalid signature in middle/last position, forbidden extension after a valid file, and oversized file after a valid file. The failure was a retained message, reproducing the same partial-write defect. Invalid-first already rejected without writes.

After the fix:

- **169/169 targeted permanent tests passed**, no skips/failures/errors, 18.643 seconds after real migration setup, using Python 3.12.14 / Django 5.2.17 and `core.contract_test_settings` (disposable SQLite).
- Selection: the twelve modules documented in `NO_LOGIC_UPLOAD_CLEANUP_20261029.md`, now including the two new rejection tests. No disposable diagnostic is counted in this run.
- Import scanner unit tests: **11/11 passed**; graph/baseline check passed with existing six mutual pairs and longer cycles still visible. No scanner or allowance changed.
- `git diff --check` and `bash -n scripts/run-staging-qa.sh`: passed. The Serializer workflow YAML parses with the attachment class included in the matrix command.
- Migration drift: `makemigrations --check --dry-run` reported no changes.
- Upload validator remains byte-identical to PR #213; billing has no diff from the approved parent. No model or migration changed. No new local PostgreSQL result is claimed.

The regression checks use actual multipart HTTP requests, real validation, database rows and temporary local file storage. A pre-existing message/file is retained byte-for-byte while rejected requests leave the message ID list, conversation timestamp, participant read positions and on-commit callback list unchanged. Existing legitimate-user controls verify PDFs/images through both writers, full stored bytes after signature inspection, recipient read-back and the successful two-file order/caption response. Non-participant attempts remain rejected through both writers.

The six chat attachment regression methods are explicitly added to both database variants of Serializer Decomposition Contracts. The same selection is added to the isolated QA script so its real backend image exercises these routes; the existing Shared Core backend job already discovers all chat tests. These are CI coverage changes, not deployed worker/provider changes.

## Verified PR #214 closure checkpoint

GitHub was refreshed before making the separate fix. PR #214 remains at `dc371fce`, draft and unmerged, targeting PR #213's branch at `737e82bc`. All outstanding automated checks in the supplied final review completed successfully:

| Check at `dc371fce` | Verified result / evidence |
| --- | --- |
| Full Isolated QA, newly requested by `full-qa` label | Passed, run [40847586904](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/actions/runs/40847586904). The earlier skip is retained as historical, not counted as a pass. |
| Shared Core Consolidation | Passed, run [40846796890](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/actions/runs/40846796890). All ten jobs, including backend, PostgreSQL concurrency/migration rehearsal and release-gate, succeeded. |
| Serializer Decomposition Contracts | Passed, run [40846796788](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/actions/runs/40846796788). |
| Backend Finalization Contracts | Passed, run [40846796891](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/actions/runs/40846796891). |
| Public Repository Security | Passed, run [40846796807](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/actions/runs/40846796807). |
| E2E Runner Smoke | Passed, run [40846796795](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/actions/runs/40846796795). |

These results belong to approved PR #214's exact head. The separate fix's new head needs its own results. Native/device and real provider acceptance are not inferred from these workflows.

## Release controls and staging smoke

No merge, retarget, deployment, production-data repair or external provider operation is performed. The verified stack is PR #213 → PR #214 → this fix. Required integration order remains:

1. Integrate PR #213 only under the agreed release approval/process.
2. Retarget PR #214 to the actual merged base and verify its diff still contains only the intended upload extraction, tests and evidence. Run the required checks against the resulting head/base.
3. Integrate #214 through that process, then retarget this fix and verify its diff still contains only the batch-validation correction, regression/CI coverage and this evidence.
4. After an authorised staging deployment, record the deployed commit/image and verify `infrastructure.file_validation` imports inside that running image.
5. With disposable staging participants in a private test conversation, upload a PDF/image through both existing endpoints. Verify response metadata, sender/recipient read-back and complete stored file bytes.
6. Through the room endpoint, verify two valid files retain order and first-message caption. Then submit valid-first/invalid-second and invalid-first batches: expect the existing 400, no added message/file, unchanged read positions/conversation ordering and no emitted message notification for the rejected request. Verify an unauthorised account remains denied.
7. Remove only the authorised test artefacts and record actual deployed storage/broker observations. Keep SMTP/Stripe acceptance separate; do not use real recipients or paid operations for this smoke.

The deployed staging smoke and stacked merges remain **pending**, not failed or passed. An isolated CI Docker run is useful image evidence but is not a deployed staging smoke.

## Decision register

The mixed-attachment issue is now authorised and implemented in this separate fix; closure awaits its checks and integration. Do not continue listing it as awaiting a choice between partial success and validation rejection. PR #214 itself still retains the parent behaviour until this fix is integrated.

Other decisions remain deferred and unauthorised for implementation: payroll activation replay and locked-period transitions; payment obligations, retries and uncertain provider outcomes; billing activation, account trials and store-local penalties; unified invoice rounding/GST cutover; notification cooldown, response and retry semantics; durable critical deliveries; configured broker/SMTP/Stripe acceptance. Six cross-app dependency pairs remain architectural work, with the existing source ledger and compatibility constraints unchanged. No further architectural refactor is part of this upload correction.
