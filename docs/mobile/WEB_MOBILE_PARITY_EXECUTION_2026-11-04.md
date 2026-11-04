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
3. W5: finish worker published-roster acknowledgment device/server verification; then manager timesheet detail, corrections and attendance timezone; validate role restrictions and protected records.
4. W6: modern-vs-legacy invoice detail, authenticated PDF download/share, approve/paid gating; chat older-message pagination and canonical pharmacy team rooms.
5. W7/W8: Explorer board and dashboard parity, native content and learning, marketplace/ethical marketplace, profile/comms; categorize browser-first external forms rather than duplicate them.
6. Premium design review on representative small and large screens, 1.6x accessibility text, native loading/error/empty/success, native keyboard, reduced motion, secure links, and clear one-handed actions.
7. Full Senior Package Testing with auth scopes, backend/Postgres, native devices, network disconnect, reinstalls, provider/staging only; merge, deploy, distribute only on explicit owner approval.

**Avoid claiming complete parity or launch-ready while any critical job remains unverified.**
