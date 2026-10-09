# ChemistTasker React / Vite — Figma Implementation & Frontend Architecture Progress

> **Live handover.** Read this file FIRST when resuming. Update it at each implementation milestone, before ending a work session, and after resolving any blocker. Do not mark a phase complete until evidence is recorded.

## Mission and guardrails

Implement the relevant Figma React/web dashboard designs into the **existing** Vite React frontend under `frontend_web/src/`, without rebuilding it, introducing a second design system, or changing application business authority. Modernise the user experience, eliminate genuine presentation duplication, and retain the established data, navigation, authentication, persona, pharmacy selection, permissions, API, theme, and error/loading behaviours.

- Authoritative codebase: `chemisttasker11-ezy/ChemistTasker-Ezy1`
- Base: `main` at `a4fb05bd5caa3a68a639544729c419eea868015a` (verified 2026-10-09)
- Working branch: `feat/figma-react-vite-design-system`
- Figma: `https://www.figma.com/design/t32C9hNvsDdQ4wzUKVJx9O`
- Scope: `12 — Web · Authenticated` plus other Vite React web screen families and the shared `01 — Components` / `00 — Foundations` references. **Not** Next.js public landing or Expo in this PR.
- PR #155 (`feat/ui01-public-landing-refresh`) is concurrently changing the Vite dashboard shell, owner/role first-look screens and public Next; avoid parallel rewrites of its navigation/business logic. Before eventual merge, reconcile exact-head changes and rebase safely.
- Figma is authoritative for visual direction *where it does not contradict* current product behaviour, current responsive accessibility rules, or the established Next public visual baseline.
- Preserve current fonts by default; any typography switch requires an explicit documented decision.
- Preserve active backend APIs and route contracts. No backend changes or migrations.
- Never paste generated absolute-position Figma markup or temporary Figma asset URLs into app code.
- CI: run targeted local/static checks when feasible; launch the PR checks but **do not repeatedly monitor pending workflow jobs**. Revisit results at a milestone or future session; record exact results.
- **Do not merge** until implementation, functional tests, visual comparisons, and integration with PR #155 are verified.

## Figma discovery — completed

- Live Figma read confirmed 18 organised pages: foundations, component library, public web, authenticated web, auth/onboarding, management, finance, workflow, responsive public web, Expo personas.
- Figma handoff reports 455 source-aligned screens + 77 **proposed**, not implemented, Expo gaps. Do not infer code routes from proposed frames.
- Shared component library has 18 Figma COMPONENTs (buttons, auth metric/card, roster shift, form input, status chip, navigation row, table row, dialog, mobile card etc.).
- Public Shifts & Talent section has 54 nested frames but no Auto Layout or component instances; direct JSX output is highly absolute-positioned. Owner overview is the same class of static mockup.
- Owner reference screen: node `15:3049` under `12 — Web · Authenticated`; public Find Shifts `15:1789`, Find Talent `15:1865`, mobile public `15:27387` and `15:27419` for reference only.
- Owner Figma screenshot reveals overlapping action labels/descriptions. Resolve this at implementation rather than copying the defect. Its intended composition is left navigation, slim top header, gradient welcome banner, 3-by-2 quick actions, upcoming shifts and recent activity, 4-metric strip.
- Figma Code Connect is unavailable under the connected Figma plan/seat, but ordinary context and screenshots work.
- Fonts observed in Figma: Inter, Outfit and DM Sans. Current Vite dashboards already use DM Sans in screen-level typography, while current MUI theme uses Inter; avoid an uncontrolled global font change.
- No static image/asset should be inserted unless its corresponding design slot, source and local file are verified.

## Baseline repository audit — completed

- Main stack: React 19, React Router 7, MUI 7, Emotion, Vite, `@chemisttasker/shared-core`.
- Current active MUI theme: `frontend_web/src/theme/sleekTheme.tsx`; older `theme/theme.ts` is not assumed authoritative.
- Existing shared dashboard layout `frontend_web/src/components/dashboard/DashboardOverviewTemplate.tsx` serves multiple personas.
- Owner overview `frontend_web/src/pages/dashboard/sidebar/owner/OwnerOverviewHome.tsx` reproduces significant duplicated card/metric/activity visual composition from the shared template; opportunity for safe, presentation-only consolidation.
- `frontend_web/src/layouts/DashboardTopShell.tsx` owns persona/pharmacy and top-bar interactions and is currently also part of PR #155 scope: **do not replace**.
- Main already has large, domain-specific screens and working state. Preserve their state and API calls.
- Environment limitation: direct `git clone` is unavailable in this session because shell DNS cannot reach github.com; GitHub connector reads/writes work. Do not claim a local Vite build has passed unless an actual build run provides evidence.

## Delivery milestones

| Phase | Status | Evidence and notes |
| --- | --- | --- |
| 0. Access, Figma inspection, current-main audit | DONE | Main SHA, file layout, node IDs and PR #155 overlap verified |
| 1. Branch + persistent handover + draft PR | DONE | PR #156 draft open, ledger committed |
| 2. Extract genuinely duplicated overview presentation into shared typed React component(s) | DONE — implementation | Shared DashboardOverviewPrimitives.tsx; adopted in owner and multi-persona overview. Awaiting typecheck/browser evidence |
| 3. Correct responsive quick-action composition from Figma | DONE — implementation | Responsive 1/2/3-column grids, flexible text, keyboard focus, touch semantics and reduced motion; browser visual verification pending |
| 4. Add focused repeatable regression/architecture checks | IN PROGRESS | Added frontend_web/scripts/audit-dashboard-overview-primitives.mjs; not yet executed in repository runtime |
| 5. Remaining Vite React page families | IN PROGRESS | 232 detailed design frames inventoried in `FIGMA_REACT_VITE_SCREEN_DECISIONS.md`; page-family implementation remains outstanding |
| 6. Visual review with actual render screenshots | PENDING | Figma vs browser at desktop/tablet/mobile, real data and state variants |
| 7. Tests/CI, reconcile PR #155, final production verdict | PENDING | Don't imply 100% readiness before evidence |

## Resume checklist

1. Read this file and the latest PR commits. Record the latest branch head.
2. Check if PR #155 landed or changed; keep business wiring authoritative.
3. Continue with the earliest PENDING/IN PROGRESS milestone, commit scope-limited work, and update this file.
4. For each page, document Figma node, actual route/source, differences, accessibility, responsive/interaction states, tests, and any blockers.
5. Do not silently mark tests passed. Do not merge automatically.

## Session journal

### 2026-10-09 — Session 1, initial checkpoint
- Verified real Figma live access; inspected primary React web owner dashboard.
- Verified main `a4fb05bd5caa3a68a639544729c419eea868015a`; GitHub push permission available.
- Detected significant overlap with open PR #155; plan intentionally limits changes to reusable React presentation and avoids overwriting PR #155's shell/route changes.
- Created branch `feat/figma-react-vite-design-system` from current main.
- Up next: commit initial handover, open draft PR, implement shared owner/multi-persona action cards with responsive layout and keyboard semantics, then update this document.

### 2026-10-09 — Session 1, implementation checkpoint
- Draft PR **#156** created: https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/pull/156
- Added `frontend_web/src/components/dashboard/DashboardOverviewPrimitives.tsx` — centralises presentation-only tone palette, responsive quick-action grid, upcoming shifts, recent activity and metrics; typed callback/data contracts, accessible `ButtonBase`, focus-visible styling, reduced-motion support, and non-overlapping card text.
- Refactored `DashboardOverviewTemplate.tsx` (455 → 300 lines) and `owner/OwnerOverviewHome.tsx` (631 → 402 lines) to use shared React primitives, preserving their established data sourcing and navigation callback wiring. Their Figma alignment deliberately corrects text overlap rather than replicating broken fixed geometry.
- Added `frontend_web/scripts/audit-dashboard-overview-primitives.mjs` to reject duplicated presentation patterns and missing callback/keyboard contracts.
- No backend, Next public, Expo, navigation or API files changed.
- **Tests:** not run. Local git clone failed due to DNS resolution; do not mistake code inspection for typecheck, Vite build or browser validation. The first follow-up with local execution access MUST run `node scripts/audit-dashboard-overview-primitives.mjs`, `npx tsc --noEmit -p tsconfig.app.json`, Vite build, then targeted browser visual/functional acceptance.
- PR #155 overlaps owner/template and will require reconciliation before eventual merge.
- **Next:** validate exact PR head and fix compile/runtime issues; then inventory and implement additional Vite React page families incrementally. Compare screenshot to Figma with responsive states and multiple personas. Keep PR draft until gates and visual review are complete.

### 2026-10-09 — Session 2: comprehensive React-web Figma mapping
- Revalidated latest remote main `a4fb05bd5caa3a68a639544729c419eea868015a`, open PR #155 `a61e35a`, and PR #156 starting head `bc3fc97`. Both #155 and #156 are drafts against current main; #155 changes the React shell and many first-look pages. Reconcile before merging.
- Inspected all six relevant Figma web pages: **232 actual screen frames** (15 access/shared, 144 authenticated, 21 onboarding states, 10 pharmacy management, 16 finance, 26 workflow). Each page also has one index frame, making **238 total section frames**. Exact route/state IDs and keep/adapt/authority decisions documented individually in `docs/frontend/FIGMA_REACT_VITE_SCREEN_DECISIONS.md`.
- Checked semantic Figma variables directly: CT Ezy Auth Web tokens include primary #063BDA, secondary #6D28D9, background #F7F9FD, border #E5ECF7. Existing role-tone and DM Sans/Inter typography remain a better working baseline than wholesale Figma-export CSS.
- Inspected representative live design-context screenshots for Pharmacist Overview, onboarding basic-info, Roster Staff, and Finance. Found fixed-position 1440x1024 exports; onboarding labels and actions overlap and some workflow text is too small. KEEP intention, CHANGE implementation to responsive accessible existing React components.
- Verified React Router `frontend_web/src/main.tsx` has real nested persona/workspace paths, including roles with limited Explorer destinations, and finance controls. The Figma file contains `?step=`, `?state=`, `?tool=` and `source:` descriptive labels; **none should be mistaken for new API or frontend route requirements**. Finance design includes mislabeled Owner screens with pharmacist paths; preserve issuer/recipient authority.
- Retrieved an existing PR #156 workflow snapshot once: frontend static & mobile lint SUCCESS, security SUCCESS, CodeQL SUCCESS, shared-core consolidation in progress at observation. These reflect the then-current PR head, not this new ledger commit or a full runtime acceptance. No polling performed.
- Environment limitation persists: `git ls-remote` cannot resolve github.com, so no local dependency installation, Vite build, Playwright browser run, or screenshot comparison is possible here. We can use the authenticated GitHub connector to read/write files, but must not claim production readiness. **Do not silently mark this task complete at the end of a chat.**
- **Resumption next action:** verify React design primitives against main and PR #155, run real TypeScript/Vite/browser acceptance in an environment with checkout access, then implement page families in order: shell/overview conflict reconciliation; pharmacy management; roster/attendance; onboarding; finance; shifts/talent; learning/chat. Update individual ledger rows with source path, visual delta, tests and status as completed.

### 2026-10-09 — Session 2 accessibility and architecture checkpoint
- Corrected Owner pill balance control from a clickable `Stack role="button"` to a native `button` rendered by Stack, preserving `onOpenPills` and adding accessible name, visible keyboard focus and inherited font styling. This is intentionally a genuine UI accessibility correction, not a route/API change.
- Re-fetched all three edited React component files and the static guard from PR #156; **20 connector-based structural assertions passed; zero failed**. These checks cover shared component adoption, duplicated tone/icon removal, focus and reduced-motion styling, and retained invoice routing. They are **NOT** an executed Node audit, TypeScript typecheck, Vite build, Playwright test, or visual acceptance.
- Current implementation status remains **PARTIAL**. No claim of 100% readiness; UI page-family breadth, automated tests and browser rendering remain outstanding. The full keep/change register is `FIGMA_REACT_VITE_SCREEN_DECISIONS.md`.

### 2026-10-09 — Session 3: implement real in-page visual states and CI coverage
- Verified PR #155 is still open against the same main commit. Did not overwrite its shell and persona navigation changes.
- Reviewed original Figma context/screenshots for `15:24250` (roster add), `15:25608` (shift review/publish), `15:22089` (invoice overdue), `15:21277` (pharmacy edit), `15:18844` (onboarding identity), `15:5823` (Talent Hub) and `15:12164` (public shifts). Figma visually describes states inside already-functioning routes; no new route or backend API should be inferred.
- Found and fixed TypeScript error reported by GitHub's earlier Vite gate: unused React import in OwnerOverviewHome, commit `45c39bf`.
- Added `DashboardContentState.tsx`: MUI-native reusable `loading` (structured skeleton), `empty` (context-specific explanation and action), and `error` (alert and optional retry). Preserves current theme, keyboard focus and accessible loading roles; does not copy fixed-position Figma markup.
- Adopted in `ShiftsBoard/components/ShiftList.tsx` for first-load and no-filter-match screens; preserves shift logic, callbacks and offers.
- Adopted in `TalentBoard/index.tsx` for loading, network failure, no published talent, no filtered matches; avoids masking API errors with “no candidates”; retry only where the working feed reload is available. Added an accessible label to the publish availability action.
- Adopted in `pages/finance/FinanceWorkspace.tsx` for loading, no records, invoice-filter/no-match and received-invoice search states. No changes to `receivedMode`, invoice issuer/receiver authority or finance APIs.
- Created `frontend_web/scripts/audit-dashboard-visual-states.mjs` and integrated both state and overview architecture audits into the actual `web-vite` job of `.github/workflows/shared_core_consolidation_ci.yml` so GitHub executes them after TypeScript succeeds.
- **Verification status:** changes pushed through GitHub, but updated TypeScript, script audits, Vite build and browser acceptance for the current head are **not yet observed complete**. Do not claim green gates or 100% readiness. Github-hosted Vite gate is the authoritative execution environment until local checkout is available.
- **Remaining:** full screen family alignment; all Figma nested states (onboarding, roster, attendance, workforce, finance editor/revision, pharmacy management, shifts/talent) and actual responsive screenshots at each state; reconcile PR #155's React UI; browser regression, accessibility and visual evidence; complete green checks. Keep PR **draft** until these are evidenced.

#### Immediate continuation checklist
1. Check latest #156 Vite gate once at next development milestone; resolve any TypeScript/build/static-contract failures before expanding surface.
2. Add Playwright state coverage for loading/empty/error/filtered and real-dialog paths using existing `frontend_web/e2e` fixtures. Do not assert screenshot parity until actual browser screenshots have been compared to the design.
3. Work feature-by-feature through the `FIGMA_REACT_VITE_SCREEN_DECISIONS.md` ledger, marking **implemented, verified, and deferred** separately. Do not treat simply inventoried frames as delivered.
4. Reconcile changed shared dashboards with PR #155 before final merge and rerun visual checks against rebased code.

### 2026-10-09 — Session 4: unblocking browser execution
- Confirmed direct local git clone fails with DNS resolution for github.com; GitHub connector read/write and GitHub-hosted runners work.
- Confirmed PR #155 remains open and overlaps #156 in DashboardOverviewTemplate, OwnerOverviewHome, TalentBoard, workflow and theme. It is unsafe to claim zero conflict until the two heads are reconciled.
- Confirmed GitHub Actions shared-core checks already execute Vite TypeScript and Vite build; prior typecheck error fixed in commit 45c39bf. Newer check results remain to be reviewed at milestone only.
- Updated `.github/workflows/frontend_e2e_manual.yml` to **also run on pull_request changes in React src or e2e tests**, rather than solely workflow_dispatch, and to upload Playwright artefacts even when the suite passes. This uses GitHub's hosted Chromium for genuine functional acceptance without relying on local clone.
- The existing browser breadth suite already exercises 45+ routes across Owner, Admin, Organisation, Pharmacist, Other Staff and Explorer, including form submission and attendance states. Screenshot-by-screen Figma comparison is still not provided by that suite and remains outstanding.
- STATUS: browser gate enabled, but do not claim green or production readiness. Continue with in-page state tests, implementation mapping, head-to-head PR #155 integration, visual screenshot review and remaining UX work.

### 2026-10-09 — Integration checkpoint: #155 first, #156 compatible features on top
- Working integration branch: `feat/ui01-ui02-figma-react-integration`, based **directly on #155's green head** `a61e35a37fa0e5d18174f86ea1802744a7ae073d`. Unlike the earlier independent #156 branch, this keeps all of #155's public Next work, auth and persona-aware React shell, backend contracts, roster and first-look improvements.
- Carried #156's DashboardContentState, ShiftList loading/empty states and finance in-page states; deliberately merged Talent error/loading/empty and filter feedback into **#155's more recent TalentBoard**, retaining its full-size filter sidebar/mobile drawer.
- Added a shared-core GitHub Vite contract check and isolated Vite browser suite from the single test requiring a running Next+Django stack.
- **Superseded, do not blindly restore:** #156's older DashboardOverviewPrimitives, DashboardOverviewTemplate and OwnerOverviewHome; #155 has more recent operational screens and persona-authoritative business logic. Removing obsolete duplicate implementations is preferable to false "no spaghetti" claims.
- **Do not declare 100%:** all Figma in-page state variants, 232 individual screens, screenshots and real end-to-end stack still need explicit acceptance. This integration has not yet passed CI.
- Original PR #156 is still open independently and must not be merged on top of this stack without conflict resolution. Continue only from this integration branch for combined work.
