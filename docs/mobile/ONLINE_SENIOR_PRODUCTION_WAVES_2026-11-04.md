# ChemistTasker Expo — senior production wave handover (4 November 2026)

## Branch and safety
- Parent: draft PR #248 `feat/mobile-merge-sdk`, original head `c98cf2ef`.
- Working draft PR #249: `fix/pr248-expo-production-waves-20261104`; this branch is stacked on #248, never directly on main.
- Current working commit at handover: `79d294d` (seven commits; each small and separately reviewable).
- No merge, deployment, staging provider write, app-store submission, native binary publishing, or live payment action was performed.
- All work must preserve six role personas, existing payments, permissions, shift booking state, all web parity, and shared-core API/domain ownership.

## Working rules
Source of truth: `LAUNCH_PLAN.md`, `W3_PLAN.md`, `DECISIONS.md`, `HANDOVER_2026-11-04.md`, `AGENT_WORKFLOW.md`; stale early proposal `EXPO_WEB_MIRROR_PLAN.md` is not authoritative for the current SDK 58 implementation.

Design: navy #06214A, violet #5222B8, Outfit/Inter, Lucide, spacious 20pt card system, useful hierarchy, native gestures and controls, semantic states, dark-ready tokens **but light-only launch**. Owner Post Shift and organization Pharmacies hero actions remain.

Skills: use `.claude/skills/expo/expo-design-system/SKILL.md` for token extension instead of second theme, `expo-native-ui` and `expo-router` for each native UI/navigation change, `expo-data-fetching` for every request state (but keep actual API in shared-core), `expo-animation` for motion/reduced-motion, `ponytail-review` for invariants and unintended behavior, `impeccable` native design audit/polish at visual gates, and `eas-app-stores`/`eas-update` only in approved release windows. Do not assume these skills run automatically; explicitly read them in each wave brief.

## Completed commits: implemented, not yet fully release accepted
| Commit | Change | Verification |
|---|---|---|
| 3149fbc2 | Shell-aware route audit, titles, launch-light consistency, design-contract audit, fail-fast gate script | Frontend Static and Mobile Lint succeeded; strict boundary rechecked on later head |
| 96cd52bf | Add shared-core paginated active/confirmed shift operations and mobile client adoption | Static lint and boundary checks on subsequent heads; shared-core suite must complete |
| d15304b0 | Scope-shift and payroll lists fail closed, terms dismissal and reload regression tests | Frontend lint and security succeeded at commit |
| a7ad728e | Candidate/member/counter-offer errors and Retry; cache invalidation on pharmacy scope; history scoped clear | Frontend lint and boundary job succeeded on this candidate; shared-core test unrelated harness failure below |
| d36927af | Replace root blank crash Stack with branded error recovery; paginated shared-core test cases | Frontend lint and security succeeded at commit |
| db5b4e51 | Align existing authApi VM test mock with actual API_ENDPOINTS import (test-only repair) | Exact-head CI pending at write time |
| 79d294d | Anonymous public shift board explicit load-more error and manual retry without losing results | Exact-head CI pending at write time |

### One discovered CI failure not in Expo UI logic
On a7ad728e, shared-core Vitest had 445 passed / 1 failed in `src/authApi.test.ts`. The mobile axios VM mock included `reportAhpraError` but omitted `API_ENDPOINTS`, which `frontend_mobile/utils/apiClient.ts` reads during module initialization. Commit db5b4e51 provides the real endpoint catalogue to the test mock. Recheck this exact test on the latest head: **do not treat as resolved before CI passes**.

### Previously failing baseline gates
PR #248's native tabs audit assumed each `organization/*.tsx` had its own `Tabs.Screen`; there are 12 such screens, while PersonaShell now generates its own tab structure. The replacement checks the shell contract and direct route titles; frontend lint passed after that change.

PR #248 strict architecture gate rejected `fetchApi` for active and confirmed shifts in mobile. Calls now use named typed shared-core APIs. Earlier visual no-drift test froze legacy theme colours in conflict with the approved redesign; it now tests approved canonical token linkage without waiving architecture invariants.

## Senior invariant review — follow through
1. **Permissions and pharmacy isolation.** Unselected scope can show all authorized data. A selected pharmacy must never show unknown, invalid, or other-pharmacy shifts/offers. Review every list and action, including history, offer mutation, payroll activation, admin delegation, loading and error overlays. Positive controls: own pharmacy, owner all-pharmacies, and delegated-admin authorized selection.
2. **Terms seen equal terms accepted.** Mobile UI no longer resurrects dismissed terms and drops previews on stale reload, but server-side D2 **snapshot identity/version validation remains open**. Cannot call financial consent production safe until backend + web/mobile shared-core contract and concurrent stale-terms tests are complete.
3. **Last request wins.** On pharmacy switch, shift id switch, retry and unmount, stale success/catch/finally may not mutate current visible state. Validate active tab, counter offers, rating, and pagination under overlapping requests.
4. **A failure is not empty.** Every network load has loading, content, empty and error with Retry. Missing candidates must not mean a failed server call. Preserve previously loaded content only when it belongs to the same authorized scope.
5. **Design never removes capability.** Check the changed screen's web counterpart, all route links, action authorization, optimistic state, failed actions, accessibility and restore behavior.

## Next implementation order (all OPEN unless a later signed-off report says otherwise)
- **W3 remaining review:** W3b Post Shift prefill persistence, scope changes, user edits and retry; the `runInitLoad` path currently calls `resetForm({ preservePrefills:true })` on a new-shift reload and `retryInitialLoad` reinitializes applied prefills. Establish that user-entered draft edits are never lost on same-scope network retry. Complete web-parity description-template create/edit/delete, window validation, distinct Save Draft and Publish, calendar 44/48dp and AA.
- **W3d:** inspect active Shift Centre scoped generation, pagination, reviews, escalation, slot payments, counter-offers (including settled/new offers), and verify retries added in this stack are correctly rendered. Independent code reviewer + real device screenshots required.
- **W3e:** confirmed/history/rating/payroll positive and negative permission tests, error and save paths, pending actions, old-pharmacy disappearance, clear button progress after failure.
- **W3f:** anonymous/public route allowlist, referral parameter preservation, workspace-hydration handoff, verified onboarding gates, delegated /admin persona, signed-out and signed-in behavior. Test page fetch fail+retry and filter switch race on device.
- **D2 terms:** implement backend immutable acceptance snapshot and shared-core + mobile caller payload and tests as a separate consent milestone.
- **Reference experience:** build/verify exact native prototypes/screens for owner Post Shift, worker Find/Offer Shift, and owner/admin Shift Centre using current tokens, with normal and 1.6x text, iOS/Android screens, VoiceOver/TalkBack, 44pt iOS/48dp Android touch, skeleton/empty/error states.
- **W4:** pharmacies, chain, staff, locums, invites, calendar, availability, memberships, internal roster.
- **W5:** attendance, timesheets, leave, approvals, kiosk and workforce/payroll, with real backend auth and money/award invariants.
- **W6:** invoices, BAS/finance, talent, hub, chat, notifications, profile and ratings. New vs legacy invoice behavior must be preserved.
- **W7:** marketplace/ethical marketplace/financial mobile-specific screens.
- **W8:** anonymous content, onboarding public education and community, editorial links and legal/privacy. Keep native clinical dose calculator out of release until clinical sign-off; only approved HTTPS web fallback.
- **Final restyle + release:** shift/post-shift web-sibling visual pass, complete parity matrix, production security/privacy, mandatory account deletion UX, OTA/runtime isolation, app signing/EAS profiles, rollback, store listing/privacy materials, TestFlight/Play internal acceptance and owner authorization.

## Required gates — two levels
**Wave gate:** exact branch SHA, `npm ci`, `npx tsc --noEmit`, `npx expo lint`, complete native node tests, shared-core typecheck/targeted Vitest, strict boundary and route audits, Git whitespace/EOL, `npx expo install --check`, and independent code review. `docs/mobile/agent-kit/gate.sh` was changed to propagate errors; check any local rig differences before running.

**Premerge production gate:** execute the full Senior Package Testing handbook on fixed SHA (including Docker isolated Django/Postgres concurrency, Shared Core Vite/Next/mobile, Playwright authenticated web, backend tests, screenshot baseline approvals), build signed SDK 58 Android/iOS, instrument physical devices and emulators for all six personas at normal/1.6x type, review payment terms and Stripe/email only on authorized staging, measure cold start/network, accessibility, crash recovery, and restore/rollback. CI success alone does not prove device readiness.

## Constraints and handoff verdict
At this checkpoint the PR is **DRAFT — NOT MERGE READY**. This remote-only session can inspect GitHub and push commits, but does not have a cloned working tree, installed dependencies, Android/iOS emulators, native screenshot capture, or independent Codex/Claude review. No claim of direct local tests or native screenshots is made. Continue on PR #249 and update this ledger after each wave; keep original PR #248 unchanged.
