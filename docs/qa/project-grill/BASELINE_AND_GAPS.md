# Baseline and gaps

## Repository baseline

- Parent PR: [#203](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/pull/203), branch `fix/pr201-combined`.
- Baseline source commit used to create this documentation branch: `6ce30e590efe595296e11d370e271ba4aac523ba`.
- New branch: `docs/grill-me-project-wide-on-pr203-20261026`.
- This branch must remain documentation-only.
- The source repository has backend Django domains, a shared-core package, web/Vite and Next frontends, Expo mobile, kiosk and presentation surfaces, operational scripts and QA/architecture documentation. The 26-area map records likely entry points but does not claim semantic review of all files.

## Existing Grill baseline

The October 20 Launch Grill defines 142 questions in eight areas and 30 carried decisions. Its current-behaviour summaries refer to an earlier code snapshot and include some known historical inconsistencies. The archived source is preserved as the authority for the exact original question wording; it is not the authority for current implementation behaviour.

## PR #203 handover-reported status

The PR description reports substantial tenant/auth, shift/roster, billing, attendance/kiosk, chat/Hub, talent/marketplace and client-parity work. It reports a 9/9 local browser walk, backend comparison tests, migration rehearsals and repository audits. These are provenance notes from the PR handover, not a claim that this new Grill branch independently reran those checks.

The PR handover explicitly lists deferred or owner-dependent items: Stripe prices/events, duplicate-intent reconciliation, Pills keys, existing-staff repricing, calendar verification, historical invoice repair, escalation outreach, payroll handoff, recurring checkout, notification/retry details, privacy/retention decisions and the cancellation charge policy/refund process. Consult the live PR description and handover before treating the list as current.

## Known discussion candidates from the latest senior review

These are candidates for verification and owner discussion, not silently decided requirements:

1. Cancellation charge endpoint differs from the carried graduated fee table and the shared-core helper; confirm legal review, applicability, timing and whether any charge should be enabled at all.
2. Restricted Hub group deletion has a fail-closed 409 guard for existing posts/polls according to PR notes; verify concurrency protection and decide archive/purge/retention separately.
3. Refund/reconciliation for paid but unbookable offers remains an operational policy and provider workflow.
4. Stripe product/price IDs and refund/subscription webhook subscriptions require actual account/mode evidence.
5. The 390px Windows appearance baseline choice is explicitly the owner's choice (accept new 44px touch-target/top-bar layout or revert); this is separate from product behaviour.
6. Invoice-from-shift was not completed end-to-end in the reported seeded browser journey because no eligible shift was present.
7. Native physical-device and staging acceptance are not established by documentation alone.

## What is not yet verified

- A file-by-file current-source review for all 26 areas.
- All old question descriptions against the current PR #203 head.
- Whether every older carried decision has since been superseded elsewhere.
- Exact count and state of unresolved decisions across the whole project.
- Full implementation and acceptance status of every deferred item.
- The next owner decision: **no interview has started in this branch**.

## Evidence update template

For each area, record the exact commit, relevant paths and line ranges, tests read/run, current observed behavior, confidence, unverified paths and questions that genuinely require owner intent.
