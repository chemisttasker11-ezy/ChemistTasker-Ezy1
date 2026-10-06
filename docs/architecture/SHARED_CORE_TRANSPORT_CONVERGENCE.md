# F05 - Shared-core transport and domain convergence

Base: main `3b67975442b7dcb1acf40b60d1b86c0bbf2d6926`, the signed F04 merge. This milestone does not change HTTP namespaces, Django models, Celery identities, platform-billing policy or the native kiosk protocol. F06 performs the explicit route migration; F07 supplies final release acceptance.

## Implementation

- `transport/client.ts` is the single HTTP implementation. Next SSR still creates a client instance per request; this is not one global authenticated user. Browser/native compatibility configuration snapshots its instance before asynchronous work.
- Both the established application API and request-scoped platform API use that engine. JSON, multipart, binary responses, cookie/CSRF headers, native credential omission, error payloads and the finance path restriction remain explicit.
- Cross-origin/protocol-relative/credential-bearing URLs are rejected before retrieving a bearer token. Redirect following is disabled. Finance pagination/download paths reject path escapes, including encoded separators. Public calls do not invoke refresh or logout on a 401; the exported refresh-token operation is explicitly unauthenticated so it cannot recursively refresh itself.
- Refresh coordination is per client instance. Concurrent SSR clients cannot share tokens, configuration or refresh promises.
- The 3,000-line, `@ts-nocheck` application module is now explicit public re-exports. Existing named operations are moved to domain-owned APIs and mappers; no domain implementation imports back through the public facade. The entire maintained shared package passes strict TypeScript checking without a file-wide suppression.
- Canonical domain seams reuse the existing package. No per-frontend SDK copy or extra transport was added. The existing pack-once/checksum/all-client CI remains.

## Extraction review

`SHARED_API_EXTRACTION_REVIEW.json` records a type-erased token comparison against the F04 source. Of 503 original runtime definitions inspected, 488 retain identical statement tokens (ignoring export modifiers, comments and semicolons). This is structural evidence, not a claim of complete runtime equivalence. All 438 measured public runtime operations remain the same domain object through the compatibility facade, pinned by a test.

Reviewed differences are the query/list/recursive-mapping helper implementations, shared operational and finance transport delegation, explicit unauthenticated refresh, typed error handling in counter-offer loading, consistent nullable group employment type, removal of one unused private display helper, and the raw organization-group membership field correction below. Native runtimes without `File`/`Blob`/`FormData` globals no longer throw merely when recursively mapping ordinary objects.

## Concrete client contract corrections

Strict output contracts exposed previously hidden mismatches. These are deliberate corrections, not silently described as byte-identical extraction:

- Vite pharmacy admin lookup now sends `{ pharmacy: id }`, matching the backend queryset, rather than passing a scalar to a query builder and unintentionally omitting the filter.
- Expo direct chat passes a scalar partner user ID, not `{userId}` inside the `partner_user_id` field.
- Vite and Next job boards treat the low-level public response as raw snake-case records before their existing presentation mapping. A false cast to the mapped domain type was removed.
- Invite controls on Vite/Expo consume the shared operation's direct token DTO, not an assumed Axios `data` envelope or an object coerced into a token URL.
- Mapped membership display uses camel-case first/last names; raw membership and invoice projections preserve nullable backend fields. The pending-admin endpoint's membership ID is non-null because its queryset requires an existing membership state.
- The attendance PIN operation preserves the actual `{pharmacies: [...]}` response envelope. Roster grid/period contracts now describe the backend's concrete assigned/vacant/staff/stacked projections.
- Organization group option mapping reads raw `user_details` and `employment_type` before converting to UI fields. Hub author/tag email absence is retained; no contact data is added to backend responses.
- Expo organization dashboard selection explicitly narrows the required organization ID before calling the operation; it does not issue a request for an undefined organization.

## Evidence at implementation checkpoint

- Shared-core strict typecheck and build passed.
- 136 shared-core tests passed: existing suites, 21 transport-convergence cases, 19 domain/export/source-shaped cases, and the F04 scope/publication tests.
- Vite application typecheck and production build passed.
- Expo typecheck and lint passed.
- Next typecheck and production build passed (confirmed process exit 0). These local checks use checksum-verified pinned dependencies restored from CI, not a new dependency version.
- Existing boundary audit and package/transport ownership audits passed. The required architecture audit now includes transport/type ownership without changing the workflow.
- No backend production code, model or migration changes in this milestone. Exact-head hosted acceptance remains required before merge.

The source-shaped fixtures deliberately test known backend fields and IDs. They are not a replacement for F06 route resolution/replay or F07 mounted browser/native journey tests. F05-F07 is not a whole-product UI redesign.
