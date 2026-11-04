# W3 web-to-Expo functional parity — senior review, 4 November 2026

**Scope:** The real implementation in `frontend_web/shared/postShift`, `frontend_web/src/pages/dashboard/{shiftCenter,sidebar/ActiveShiftsPage}` versus `frontend_mobile/roles/shared/shifts`, the native screen wrappers and shared-core. This is **job and permission parity**, not duplicate layout or pixel mirroring.

**Review baseline:** PR #248 head `c98cf2ef`; other agent's PR #249 head at review start `cf8b245c`. Targeted senior fixes in this review advanced PR #249 through `2df30dee`; see commit history. **No actual native device visual approval or fully green exact-head release gate at the time of this review.**

Legend: **present** = matching operation and reachable UI observed in source, but device acceptance still required. **partial** = operation exists but meaningful UX/edge case remains. **extra** = beyond the current web UI. **pending acceptance** = source implementation present, final end-to-end tests not yet proven.

## A. Owner/admin/organization Post Shift

| Web job or option | Source of authority | Expo source / finding | Assessment |
|---|---|---|---|
| Choose posting pharmacy and role | `PostShiftForm.tsx`, `PostShiftDetailsStep.tsx` | `PostShiftScreen.tsx`, `PostShiftDetailsStep.tsx`, `useShiftSurface` | Present; delegated admin must remain pharmacy-scoped |
| Locum, full/part-time posting and role-specific payment fields | `PostShiftForm.tsx`, `PostShiftPayStep.tsx`, `postingDraft.ts` | `PostShiftScreen.tsx`, `PostShiftPayRateStep.tsx` | Present, same `buildShiftPostingPayload` and `validateShiftPostingDraft` |
| Workload, preferred/must-have skills, software defaults and support | Web Details/Skills components, shared skills registry | Native Details/Skills, same registry | Present; native screen/device keyboard and lengthy list review pending |
| Description template by pharmacy/role; use and save | `useShiftDescriptionTemplate.ts` list+save | `PostShiftScreen.tsx` list+save+delete | Present plus mobile-only template deletion; **current web UI does not separately expose template delete or a multi-template editor** |
| Post anonymously, visibility tiers, escalation, notifications | Web `PostShiftVisibilityStep.tsx` | Native `PostShiftVisibilityStep.tsx`, `PostShiftScreen.tsx` | Present; corrected pharmacy-team notice at FULL_PART_TIME and suppressed edit-mode sends; verify against server |
| Automatic/custom/off audience escalation | Web native datetime-local | Native date + TimePickerModal, transactional date/time confirmation | Source parity repaired; **physical device and timezone acceptance pending** |
| Multi-date, per-date hours, recurring schedule, single-user booking | Web `useShiftTimetable.ts` and Timetable step | Native `PostShiftTimetableStep.tsx`, `PostShiftScreen.tsx` | Present as native calendar; week/day **view mode** differs but scheduling job remains reachable |
| Rate calculator, weekday/weekend/holiday/early/late, slot rate overrides, pharmacist-provided, super/payroll | Web `useShiftPricing.ts`, Pay step | Native PayRate step and shared-core rate calls | Present; financial parity requires isolated acceptance with store-location holiday/Award rules |
| Review posting preview | Web `PostShiftWizardShell`, `renderPreview` | Native `NativeShiftBoardPreview` | Present; parity of every badge/slot/status needs screenshots |
| Create and edit posted shift | `createOwnerShiftService`, `updateOwnerShiftService` | Same shared-core operations and `?edit` | Present; editing protected fields on a booked/payment-linked shift remains backend-controlled |
| Deep-link prefills: pharmacy, role, single/date list, start/end, visibility, employment type, dedicated user | Web `readPostShiftPrefill` in `helpers.ts` | Native `parsePostShiftSearchParams`, `computePrefillPlan` | Missing aliases, visibility, employment type corrected; apply once and never replay over user edits |
| Save Draft and Publish as *separate* buttons | Web `PostShiftForm.tsx` has **one** submit action | Native has one submit | **Not a current web-to-mobile parity gap.** An owner-requested product enhancement, requires draft storage/permission semantics before release |

### Post Shift issues still requiring acceptance
- Custom escalation date+clock is only committed after confirming the clock. Android/iOS native keyboard/locale/tap test still required.
- The web and mobile both display an out-of-order escalation warning; whether invalid ordering should block submission is a **domain decision**, not safely inferred by a UI patch.
- Confirm that selecting a new pharmacy while a template or rate request is in flight cannot apply a stale response to a different pharmacy. The current Post Shift request design uses cancellation and generation guards on some paths; test all paths.
- Multi-slot repeat dates and public holiday rate calculations need a real Australian device/backend test, not only unit helpers.

## B. Owner/admin/organization Shift Centre

| Web job or option | Expo status | Evidence and remaining caveat |
|---|---|---|
| Active / Confirmed / History sections | **Present** | `shiftCenter/ShiftCenterPage.tsx` vs `ShiftsScreen.tsx`, `ShiftSectionTabs.tsx`; persona scope and capability matter |
| Load all active/confirmed pages, detail links | **Present** | Named paginated shared-core operations; scoped generation and failure handling |
| Open specific `?shift_id` + `?slot_id` | **Partial** | Native now validates both IDs, expands the shift, selects only an owned slot; unlike web `scrollIntoView`, **no automatic scroll-to-card** yet |
| New `notification_id` or `_ntf` for same shift refreshes candidate status | **Present in source** | Native `useShiftsData` now depends on notification key; device push/deep-link acceptance pending |
| One-tap Post Shift even when list empty | **Present** | New capability-scoped native action in active header and empty state, links to owner/org/admin route |
| Candidate cards by eligible escalation level and slot | **Present** | `ActiveShiftCards.tsx`, `useTabData.ts`, `isCandidateLevelVisible`; backend has final permission authority |
| Expressed interest, profile reveals and candidate review | **Present** | Native reveal/review handlers, slot controls, masked public profiles until revealed |
| Counter-offer review, accept/reject, slot selection, ratings | **Present** | Native counter-offer dialog, candidate review, slot-specific rate offers and rating load; races and rate invariants still need browser+device acceptance |
| Escalate to next permitted audience, reject, delete, share, remind worker | **Present** | Native shift actions, share, buzz, escalation stepper; tests must check booked/payment-protected backend |
| Stripe/pills payment and pending-checkout recovery | **Present in source, pending acceptance** | Native has Stripe/Pills handlers and checkout recovery alert; real sandbox Stripe reconciliation and 2-device race required |
| Slot update indicators (unseen candidates/offers) | **Present** | Native persisted signatures + `mergeSlotSignatures`; refresh and reorder tests pending |
| Confirmed and history assignment information, worker profile and ratings | **Present** | `ConfirmedShiftsView.tsx`, `HistoryShiftsView.tsx`, `OwnerAssignedShiftBoard`; fail-closed pharmacy filter checked |
| Deferred payroll activation for authorized manager | **Present** | `confirmedPayroll.ts` filter + `activateShiftOfferPayrollService`; worker-only views must not activate payroll |
| Worker history invoice / rating-pharmacy handoff | **Present** | `WorkerHistoryShiftsView.tsx` invoice-route, rating; new/legacy invoice integration still needs acceptance |

### Shift Centre issues still open
- **P1 device behavior:** deep-linked shift expands/sets slot but does not scroll itself into view in a long list; web does.
- **P1 UX polish:** `ActiveShiftCards.tsx` and much of the 323-line ActiveShift styles still use older hard-coded colors, heavy elevation and dense cards. Header and Post Shift action now use canonical brand tokens, but full native premium polish requires screenshot signoff.
- **P1 concurrency/financial:** entitlement/permissions, paid checkout recovery, frozen roster, slot assignment and post-payment conditions must pass the full Senior Package Test; static presence is not proof.
- Candidate/error and payroll list failure retries need role-specific, real backend network-interruption tests, including scope changes while requests are pending.

## C. Worker public/community, offers and W3f

- Native `CommunityShiftsView.tsx` and `PublicShiftsView.tsx` expose Browse, Saved, Interested, Rejected and Accepted/Offers states, filter and paginate, apply/express interest, counter offers, save/unsave, rejection, offer acceptance/decline and terms review.
- Anonymous `AnonymousShiftBoardScreen.tsx` implements public browsing with load-more retry; `publicShiftRoute.ts` restricts signed-out routes and preserves referral/auth handoff.
- The other agent removed unauthorized worker-side payroll activation while retaining worker readiness. Verify manager-only mutation access with positive (manager) and negative (worker) controls.
- D2 server-side `terms_version` validation and a PostgreSQL concurrent slot-rate change test are present. A pre-existing ABN consent positive test had to be updated to echo the version rather than bypass the guard. **CI, real backend and staging acceptance remain required**; do not mark the consent milestone closed on code review alone.

## D. Release-quality gate and review verdict

The initial head `cf8b245c` failed Shared Core Consolidation due to six Expo TypeScript errors and one stale ABN positive-consent fixture expecting HTTP 200 without the newly required `terms_version`. The new commits corrected those causes; the frontend lint workflow passed on intervening heads. **Exact-head full gate on the latest candidate is still pending**; earlier runs were cancelled when later commits were pushed.

Source-only review was possible through the connected GitHub repository, not a local clone/emulator. No Android/iOS screenshot, physical-device check, accessibility 1.6x text screenshot, registered TestFlight/Play beta, staging checkout, or full Senior Package Testing run was directly performed in this review.

**Senior verdict:** The core W3 jobs are substantially implemented. This is not yet a fully accepted web-to-mobile parity release, and it should **remain draft/unmerged/undeployed** until the open items, tests and device acceptance are closed. Distinguish unverified capability from absent capability. Do not build duplicate flows just to mimic desktop screens.

### Recommended next wave
1. Review latest exact-head CI and fix only reproducible failures without weakening business invariants.
2. Implement Shift Centre scroll-to-target for `shift_id` using native row measurement + guarded scroll, retain manual scroll/selection.
3. Independent source review of candidate/reveal/payment and all payroll actions with positive and negative account controls; finish W3 screenshots for Post Shift and Shift Centre.
4. Then move to W4 validation and next waves, keeping user-facing feature parity ledger current.
