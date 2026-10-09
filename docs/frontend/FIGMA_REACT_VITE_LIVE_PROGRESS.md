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
