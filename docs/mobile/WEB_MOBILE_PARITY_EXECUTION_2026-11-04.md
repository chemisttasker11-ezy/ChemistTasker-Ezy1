# ChemistTasker web/mobile utility parity — live senior execution ledger
**Date:** 4 November 2026  
**Working PR:** [#249](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/pull/249), stacked atop draft #248, **unmerged and undeployed**.  
**Decision:** match authenticated actions, data, permission checks, state transitions and task outcomes. Use native information hierarchy and navigation; do not copy desktop pixels.

## Completed source implementation in this continuation, NOT device-certified
| Web job | Native implementation | Evidence/acceptance |
|---|---|---|
| Shift Centre notification opens exact shift in long active list | React Native ScrollView *instance* ref corrected; scope+shift-keyed measurement helper and unit regression; never mark scroll done without native ref | Mobile TS gate must pass on latest head; Android/iOS long-list and repeat-notification manual-scroll acceptance remain |
| Organization claims pharmacy via registered email | /organization/pharmacies/claims: validates email; scoped membership and history, submit, states, retry | Validate role-level permissions and actual request/owner decision on staging |
| Organization owner claim status/history | Existing owner accept/reject untouched; organization sees pending/accepted/rejected and owner response | Permission boundary by active organization id added client-side; backend remains authority |
| Learning resources (was placeholder or missing) | One native branded resource screen for pharmacist, other staff, owner, organization, Explorer; searchable article/news listing, pagination and retry; open published article on web | Compare editorial content/feed and links in QA; test Android/iOS, offline network failures, 1.6x text and keyboard |
| Legacy invoice PDF open/share | Owner, organization, pharmacist and other-staff list/detail now use `downloadInvoicePdf` + `nativeFileBytes` + Expo cache and native share sheet instead of unauthenticated `Linking.openURL(getInvoicePdfUrl(...))`. | Source/UI contract test wired into CI; authenticated staging/device PDF, recipient authorization and secure cleanup acceptance required |
| Worker published roster acknowledgement | `/attendance/published-roster` uses server-published shifts and `rosterV2.acknowledge` per week with retry | Source contract in CI; real worker and manager-counter verification remains |
| W5 timesheet detail and manager review | Manager and worker native detail pages now expose period/day totals, pharmacy-timezone clock comparisons, exception checks, comments, and explicit revision-bound manager approval/reopen; manager list no longer bypasses review with direct approval | New policy and route regressions wired to shared-core CI; authenticated permission and real payroll-freeze acceptance remain |
| W5 missing-punch corrections | Source-required missing clock checks lead to audited `addMissingPunch` with session, local time and reason; unresolved provisional sessions link to attendance review. Source-required checks cannot be waived in mobile UI. | Confirm on staging with locked/reopened periods, DST-timezone facilities, and backend prevention of invalid corrections |
| W6 chat older history and reading position | Native conversation screen now uses the backend next-page cursor, de-duplicates by message ID, preserves latest live revisions, maintains scroll position while prepending, avoids unconditional scroll-to-bottom for incoming messages and shows a jump-to-latest action | Source/contract tests in CI; real long-thread iOS/Android and background reconnect acceptance pending |
| W6 canonical pharmacy team chat | Mobile chat now discovers eligible active-pharmacy memberships and opens an existing or canonical backend team group via `getOrCreatePharmacyGroup`; no client-generated duplicate groups | Multi-tenant/role server-authorisation and no-membership acceptance pending |
| W6 immutable invoice revision detail | Native finance workspace now lets users inspect historical worker/received revisions read-only, with revision-specific PDF; only the current detail has approve/send/pay/edit actions | Exact-backend serializer reviewed and contract test added; role and delivery-visibility staging acceptance pending |
| Documentation/test discipline | New organization membership/email tests; active shift deep-link scope test wired to mobile CI | **Require fully green exact-head CI**, not an intermediate green build |

## Status caveats
- The previous candidate head `389f4170` failed Expo TypeScript in Shift Centre because ScrollView was typed as a component rather than its instance; the fix was committed after a targeted regression test.
- Changes made while CI runs may cancel outdated runs. Sign off the **final** commit only, not any superseded SHA.
- This is a source/connector review. Native emulator/screenshots, real backend logins for all six personas, 44pt/48dp hit-area audits, actual app-store builds and Stripe/SMTP staging proof were **not performed**.
- A static route does not prove feature parity. The accepted bar is a real worker/manager can complete the same web business action with an equal permission outcome and safe failure/recovery paths.
- No payment, attendance or invoice financial business rules were intentionally changed; the legacy invoice **document delivery path** now uses authenticated native transport instead of a browser URL.

## Next high-impact source and acceptance work
1. Finish green latest-head CI (Expo lint/typecheck, shared core, web, PostgreSQL concurrency), then verify the custom shift deep-link scroll on physical iOS/Android.
2. Compare Post Shift/Shift Centre field-by-field with web source and real network behavior: rates, per-slot dates, counter-offers, reveal permissions, Stripe/Pills settlement, payroll gating and deep-link retry. Update `W3_WEB_TO_EXPO_FUNCTIONAL_PARITY_REVIEW_2026-11-04.md` on acceptance, not just source existence.
3. W5: verify native timesheet detail, source corrections and published-roster acknowledgement with actual worker/manager roles, timezone display, blocked approvals and protected locked periods; review adjustment dialogs against the web before signing off.
4. W6: verify native historical invoice revisions and canonical pharmacy team rooms, load 500+ chat messages on real devices, review source-vs-web full invoice approval/payment actions and attachment security without changing finance business logic.
5. W7/W8: Explorer board and dashboard parity, native content and learning, marketplace/ethical marketplace, profile/comms; categorize browser-first external forms rather than duplicate them.
6. Premium design review on representative small and large screens, 1.6x accessibility text, native loading/error/empty/success, native keyboard, reduced motion, secure links, and clear one-handed actions.
7. Full Senior Package Testing with auth scopes, backend/Postgres, native devices, network disconnect, reinstalls, provider/staging only; merge, deploy, distribute only on explicit owner approval.

**Avoid claiming complete parity or launch-ready while any critical job remains unverified.**
