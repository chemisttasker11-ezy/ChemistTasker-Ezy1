# Native finance PDF/receipt binary compatibility

Fixed parent: #234, `62bf3c4cb75e0c7c0411150eff48c57a72545a0e`.

## Demonstrated failure and preservation rule

The Android native acceptance run `40998602127`, job `123877475104`, reached actual
invoice preview, Save, the second revision, sent state and the PDF endpoint (HTTP
200). It then failed to open the native share sheet. The diagnostic artifact shows
the invoice detail still open after the PDF request, not an alternate share target.

Both invoice sharing and receipt opening invoked Blob.arrayBuffer(). The installed
React Native Blob implementation lacks that method. Its installed fetch Response
supports arrayBuffer() through React Native FileReader.readAsArrayBuffer. A focused
native-shaped Blob fixture reproduces the old TypeError and executes the actual
installed fetch Response implementation to verify the supported bridge.

Use one mobile binary bridge (`nativeFileBytes`) for those two callers: construct a
Response from the already authenticated Blob and read its ArrayBuffer before writing
the same Uint8Array to the existing Expo file. This adds no network request and changes
no endpoint, authentication, invoice calculation, source/revision, filename, MIME type,
recipient, sharing choice or external provider behavior. Shared Core's Blob response
contract remains intact for the web clients. Native read errors still reject before
writing or presenting a file; no partial document is silently shared.

## Validation and boundaries

18 local contracts passed: 15 existing invoice contracts plus three binary bridge
controls (native Blob missing the method, exact binary bytes including 00/80/FF,
native reader failure, and browser Blob/Response compatibility across the cases).
Mobile TypeScript and whitespace checks passed. The bridge controls are selected in
the mobile CI job. Final native simulator acceptance is required to establish that
the platform share sheet opens after this repair; this document does not claim that
run passed before it executes.

The parent's Full Isolated QA, Shared Core, serializer, authenticated browser and
fixed-candidate recovery workflows passed. Its production-security and actual
PostgreSQL backup/restore/old-code rollback rehearsal passed. Those are parent-head
results, not certification of this new head. The remaining visual snapshot failure
and actual provider/staging/physical-device evidence remain separately tracked in
FIXED_CANDIDATE_RECOVERY_20261030.md. No merge, deployment, live charge or external
email is authorized or performed.
