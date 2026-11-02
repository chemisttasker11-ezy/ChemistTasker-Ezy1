# Runtime ownership and Django/client contract continuation

Fixed parent: PR #221, `d8a1a476c9d53ea3c98d7e5cc357d90d13912dc1`.
The user authorised continuation and replanning, retaining discussion before workflow changes.
This branch leaves all earlier draft heads untouched and remains unmerged/undeployed.

## Changes and benefit

| Change | Benefit | Preserved contract |
| --- | --- | --- |
| Remaining runtime queue callers import `users.task_dispatch` | Removes dependency on application composition for a domain-owned service | Same function objects, queues, callbacks, exceptions and timing; core facade retained |
| Generic upload naming moves byte-for-byte to `infrastructure.uploads` | Model owners can import neutral mechanics without importing core | Extensions, prefixes, UUID generation and historical exports |
| Attachment paths move to chat/hub owners | Chat models no longer load the kernel model facade solely for a path callable | Same bodies, model field objects, migration/pickle metadata bound at historical owner |
| Six-case shared kiosk fixture checked in Django and TypeScript | Detects drift in representative same-site/other-site and admin-level decisions | Existing permission rules; Django database authority is exercised |
| Multipart client test | Checks FormData identity, multiple files and transport-owned Content-Type | Existing API and server rejection semantics |
| Pricing documentation correction | Removes false claim that Django imports this TypeScript implementation | Every exported calculation unchanged |
| Logout E2E response synchronisation | Requires an actual successful logout before asserting cookie removal | Cookie and protected-page denial assertions remain; no authentication code changed |

Existing test patch literals move to the canonical users dispatch lookup for function-local
calls. No assertions, permissions, monetary outputs, task registrations or failure policies
are weakened. The kernel line ceiling tightens 260 to 259. Released migrations are unchanged.

## Graph evidence

Direct mutual pairs remain zero. The direct SCC shrinks from eight to seven apps:
chat, core, memberships, onboarding, organizations, shifts and talent.
Direct cyclic edges decrease 22 to 15; combined module/function-local cyclic edges decrease
123 to 120. The direct cyclic set is a strict subset of the parent. The combined graph
removes five edges and adds two explicit compatibility-facade edges: client_profile -> chat
and client_profile -> pharmacy_hub. They are required re-exports of the canonical upload
callables, replacing the two backwards model-to-kernel dependencies. The combined twenty-app
component does not expand. This is an ownership/import-safety improvement, not a claim that
every combined edge is a subset. The revised user direction permits retained compatibility
coupling where model identity and a clear domain owner are preserved.
`runtime_cycle_ledger.py` provides a repeatable generation/check command for the exact ledger.
The no-growth baseline tightens to the current graph; no exclusions are added.

## Contract audit and boundaries of the evidence

| Area | Actual source owners reviewed | Result / remaining decision |
| --- | --- | --- |
| Kiosk authority | attendance.credentials.is_authorized_kiosk_manager; shared-core policy/accessPolicy | Shared fixture verifies six direct-admin/worker cases against actual database rows; existing owner/org/region suites retained. This is representative coverage, not universal permission parity. |
| Roster filtering | shared-core policy/rosterPolicy; workforce and shifts assignment guards | Client selects display candidates; backend remains final authority. No attempt to replace action-specific guards with one Boolean. |
| Invoice totals | shared-core domains/invoicing/generation; domains/finance/api; backend invoicing | Preview transports server amounts. Existing managed/external rounding differences remain intentional pending approval. Existing generation and finance mapping suites retained. |
| Chat uploads | shared-core domains/chat/api; chat.views attachment writers | Client forwards multipart data, Django validates/persists. Existing real multipart rejection and successful batch tests retained. |
| Billing | shared-core utils/pricing; billing/shift_payments and subscription_operations | TypeScript helpers are exported estimates; no direct source consumers of the three calculate helpers were found beyond their definitions. Stripe checkout remains server-owned. Provider price values cannot be proven from hard-coded price IDs alone. |

**Additional discussion item:** calculateCancellationPenalty in TypeScript explicitly returns
zero for a past start time. Django's cancellation calculation applies the <=24 hour 20%
branch, including negative hours. This is source-confirmed divergence, not a newly reproduced
provider charge or a refactor regression. Decide the intended past-shift policy before wiring
this estimate into a UI. Amounts, cutoff timezone, obligations and rounding remain unchanged.

## Verification record

Two new upload behavior contracts passed on unchanged #221 before extraction.
The copied generic implementation is byte-identical to that parent. Every other modified
backend runtime consumer differs only by import substitution, apart from the explicit
compatibility adapters and moved attachment functions. Eleven scanner tests pass.
Shared Core: 445 tests pass; typecheck and build pass. Frontend E2E runner
typecheck and default test discovery pass; this host has no Docker binary, so
actual authenticated browser acceptance must run in hosted CI.
Focused final checks: 31/31 ownership/startup/task contracts pass; migration drift is clean.
Initial backend checks exposed the stale kernel ceiling and old function-local mock target;
those were corrected without changing expected behavior. Final integrated source selection: **697 discovered, 696 passed, one PostgreSQL-only
skip, zero failures/errors** (109.530 seconds after database setup). Selection covers all
users, organizations, memberships and onboarding, chat multipart, pharmacy hub, invoice
delivery, startup/task/ownership/kernel contracts and the new cross-client fixture.
The earlier pre-correction broader run is retained as red evidence; its stale test patch
and ceiling failures are not represented as production fixes. Final source checks pass.

## Revised remaining work

1. Complete final-head PostgreSQL, E2E and Full Isolated QA. The #221 E2E artifact showed an
   unfinished logout request at cookie assertion; the strengthened test must earn its own pass.
   A rerun alone is not proof that the underlying issue is fixed.
2. Retain the seven-app direct / twenty-app combined dependency debt explicitly. Further work
   on the domain-aware file-reference registry, ABR integration placement or worker-side
   organisation scope needs a separately bounded ownership benefit and bootstrap proof.
   Do not move these wholesale into infrastructure or impose HTTP-only composition on workers.
3. Financial/settlement decisions remain deferred: payroll activation replay and locked-period
   integrity, duplicate checkout obligations and retry semantics, billing date/trial ownership,
   penalty timezone/past-start policy, invoice rounding/GST cutover.
4. Delivery corrections remain deferred pending their contracts: buzz cooldown on queue failure,
   reveal quotas and partial notifications, roster publication isolation, uncertain SMTP recovery.
5. Real provider acceptance, deployed upload smoke, native/device acceptance and stacked merge
   integration require their actual authorised environment/release step. Local/CI results do not
   establish them. No provider, deployment or merge operation is part of this source batch.

This finishes the selected ownership extractions and representative contract audit. It does
not declare global acyclicity, complete cross-language parity or production acceptance.

## Publication and F07 compatibility follow-up

Published as draft PR #222, stacked on the unchanged #221. Initial published commit
`ec4b65b1f38734b934ec2ca6a4e54d00489a55fc` has tree
`915784f8a838eaf2eb19050db390d0733cbb9142`, identical to tested local commit `672bfc26`.
The connected GitHub publisher assigned different commit metadata; no source difference exists.

The manual F07 security block still asserted `core.urls` even though #218 intentionally made
`composition.urls` the entrypoint. It now requires the composition entrypoint and the exact
historical URL-pattern object, retaining every mounted handler and permission implementation.
Route contracts compare all existing domain prefixes and representative protected handlers;
the same contracts run in Shared Core, isolated QA and the manual F07 security job.
The corrected security block and `check --deploy --tag security --fail-level WARNING` pass
locally under the workflow's production settings. This is not a pass of the whole hosted F07
workflow or deployed acceptance. No application routing or permission behavior changes.
The final local route/permission selection passed **20/20**, zero skips/failures/errors:
`core.test_client_profile_api_composition`, `organizations.test_pharmacy_access_characterization`
and `users.test_cross_client_authority_contract` (0.910 seconds after disposable SQLite setup).
This includes permitted actors and cross-site/unauthenticated denials. Shell syntax, whitespace
and the unchanged runtime-cycle ledger also pass.

Hosted verification must use the final follow-up head. Enable `full-qa` so isolated QA runs
instead of skipping. Authenticated logout acceptance, PostgreSQL, browser and full isolated
results remain pending until their final-head jobs finish. Native/device, provider, deployment
and stacked merge integration remain separate release evidence. Financial/delivery policy
changes and further longer-cycle work remain bounded by the revised remaining work above.
