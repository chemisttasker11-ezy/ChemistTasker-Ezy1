# ChemistTasker — Senior Frontend Engineering Handover
## UI01 / UI02, Figma React design implementation and Claude Code optimisation

**Prepared:** 9 October 2026  
**For:** Incoming senior frontend / full-stack reviewer and Claude Code implementation lead  
**Repo:** https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1  
**Design source:** https://www.figma.com/design/t32C9hNvsDdQ4wzUKVJx9O  
**Status:** IMPLEMENTATION IN PROGRESS — NOT PRODUCTION READY  
**Current integration PR:** [#157](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/pull/157), branch `feat/ui01-ui02-figma-react-integration`, inspected head `08106ef01f66a5df52e5695825fa6d701a48c908`.

> **Senior review instruction:** Read this document before editing. The product is not an empty design exercise. Preserve all working data flows, authentication, role/persona entitlements, pharmacy scope, business APIs, and previously validated user journeys. Figma directs the visual hierarchy and state treatments; the working repository directs the business behaviour. Do not claim 100% implementation or merge without real browser acceptance evidence.

---

## 1. Executive summary / exact decision

The active work is a **stacked integration**, not three independent PRs to merge indiscriminately:

| PR | Base | Inspected head | What it contains | Decision |
| --- | --- | --- | --- | --- |
| [#155 UI01](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/pull/155) | `main` | `a61e35a37fa0e5d18174f86ea1802744a7ae073d` | Next public redesign; unified authenticated Vite sidebar, header, routing/search, personas; first-look dashboards; worker-shift relationships; roster/role/backend fixes | **Keep as functional/visual baseline; owner approval still required** |
| [#156 original UI02](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/pull/156) | Older `main` | `63da3111b2ccdf2bf516e0c909964ab29605dad7` | Early Figma React component extraction, UI states and 232-frame inventory | **Historical development source only; do not merge independently** |
| [#157 integrated UI02](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/pull/157) | **#155's branch**, not `main` | `08106ef01f66a5df52e5695825fa6d701a48c908` | #155 preserved wholesale; compatible #156 loading/empty/error states for Shifts/Talent/Finance, CI contracts and docs | **Continue here; draft, currently fails React compile** |

**Correct sequence:** fix #157 build, verify its functional/visual states, obtain owner review and approval for #155, merge #155 to `main`, rebase or retarget #157 onto the then-current `main`, rerun verification, merge #157 only when accepted. Close #156 as superseded after the changes are accounted for, rather than merging it.

**Crucial:** #155 made major improvements after #156 initially started. Its newer `DashboardOverviewTemplate.tsx`, `OwnerOverviewHome.tsx`, dashboard shell and Talent filter sidebar are authoritative. The earlier #156 `DashboardOverviewPrimitives.tsx` and its rewrites of the two overview pages **were deliberately NOT brought into #157**, preventing older UI from overwriting #155's role-aware implementation.

## 2. Immediate P0 block — fix BEFORE visual optimisation

The inspected #157 head currently **does not compile**:

- **GitHub job:** [Shared Core Consolidation run 37912319080](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/actions/runs/37912319080) → `web-vite` job `113760275506` failed.
- **TypeScript:** `src/pages/dashboard/sidebar/TalentBoard/index.tsx(1019,11): error TS1005: '}' expected`.
- **Browser job:** [Frontend E2E run 37912319081](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/actions/runs/37912319081) → `vite-playwright` job `113760150441` failed **before tests**, with `Adjacent JSX elements must be wrapped in an enclosing tag` at the same screen/line.
- **Cause to investigate:** the last manual integration replaced Talent Hub's candidate-list rendering with a nested inline JSX conditional around lines 1012–1019. The surrounding content/layout closing tags or conditional expression are malformed. This is a real #157 integration regression; **not** a CI flake or a missing Figma permission.
- **Minimal remedy:** inspect the entire JSX tree, preserve the #155 filter sidebar/mobile drawer, replace the condensed ternary with a readable typed rendering branch and **one valid parent**, then typecheck and build before touching other screens. Do not add arbitrary tags purely to silence the parser; verify the actual component nesting.

Exact first commands (from the repo root, after checking out the integrated branch):

```bash
cd frontend_web
npx tsc -p tsconfig.app.json --noEmit
node scripts/audit-dashboard-visual-states.mjs
npx vite build
```

The static source check is not equivalent to typecheck or browser tests.

### CI at inspection — do not confuse heads

- **#155**: inspected head had successful Shared Core Consolidation with `backend`, `web-vite`, `web-next` and `release-gate` green, plus other reported security/lint/CodeQL/contract jobs; this is evidence **only for #155's SHA**, not #157.
- **#156**: its latest `Frontend E2E Manual Verification` completed successfully after excluding a live-stack-only test from the Vite fixture run; #156 must not be merged on that basis because its older dashboard changes overlap #155.
- **#157**: static/mobile lint and repository security passed; **Vite typecheck and E2E build failed** on Talent JSX; Next web build had completed successfully; other Shared Core Consolidation jobs were still running at the time of inspection. No browser screenshot result exists for #157 while its build fails.
- **Previous test boundary:** a Vite-only Playwright job previously recorded **93 passes and one failure** when it attempted `real-stack.spec.mjs`'s real Next-login/Django-session test without the full live stack. #157's workflow intentionally uses `npm test -- --grep-invert "real Next login hands off"`; that is a **fixture-suite separation**, not a substitute for testing the real Next-to-Django-to-Vite login.

Record every new CI result with SHA, job, conclusion, and artifact link. Do not repeatedly poll pending jobs; check at sensible development milestones.

---

## 3. Architecture, source-of-truth and non-negotiable business constraints

| Surface | Repository location | Primary function |
| --- | --- | --- |
| Authenticated React | `frontend_web/src/` | Vite + React 19 + React Router 7 + MUI 7/Emotion; Owner, Admin, Organisation, Pharmacist, Other Staff and Explorer workspaces |
| Public Next.js | `frontend_web/landing_next/` | Marketing, public Shift/Talent discovery, public account and auth entry routes; primary ownership in #155 |
| Native mobile | `frontend_mobile/` | Expo/RN parity; **not a React web copy/paste target** |
| Shared domain clients | `shared-core/` (`@chemisttasker/shared-core`) | API, domain/client policy and role logic; reuse instead of duplicating endpoints/transformers |
| Backend | `backend/` | Real permissions, invoice billing, role matrix, shift/roster/attendance business authority |
| Authenticated theme | `frontend_web/src/theme/sleekTheme.tsx` | Single existing MUI theme and CSS variables, light/dark + component defaults |
| Route ownership | `frontend_web/src/main.tsx`, `frontend_web/src/navigation.tsx`, `frontend_web/src/layouts/dashboardRouteScope.ts` | Real route registrations, navigation, pharmacy/workspace scope |
| Dashboard context | `contexts/AuthContext`, `contexts/WorkspaceContext`, `contexts/DashboardNavigationContext` | Active user/persona, current pharmacy, permitted navigation |

**Preserve, never reconstruct from Figma:**

1. Active-persona versus base-role behaviour, role-specific permissions and account-switch isolation. Same signed-in user may keep valid UI state; a different signed-in account must not inherit prior user's forms, chat or private data.
2. Pharmacy picker must show all authorised pharmacies. Use actual membership/ownership scope; never fabricate or shrink its options to fit a mockup.
3. Owner / Organisation Admin billing authority; Chief/Region/Pharmacy Manager must not silently acquire billing privileges through visual controls. For worker-invoice issuance, infer issuing versus receiving workspace from active persona/route as already implemented.
4. Worker `My next shifts` is only a relationship feed for genuinely interested/applied/offered/committed/confirmed shifts. `Recommended for you` is a separate opportunity matcher, never a substitute for booked work.
5. Other Staff role matrix: Pharmacy Assistant opportunities broad; Intern jobs to Interns; Dispensary Technician jobs to Technicians; Student jobs to Students. Do not widen access with a presentation refactor.
6. The Explorer persona must not be shown Vite destinations without existing routes or permitted backend workflows.
7. Shift escalation, post-shift review, pharmacy onboarding, invited-member/account status and roster validation must preserve current actions, validation, error semantics and API paths.
8. React and Next components can share **tokens and behaviour contracts**, but do not ship an independent parallel design system or copy native Expo JSX directly into web.

Figma `?step=`, `?state=`, `?tool=` and `source:...` labels represent design **states**, not automatic React routes or backend endpoints. Tie them to existing component state rather than making synthetic paths.

## 4. Figma inventory and design quality assessment

- Verified source: 18 top-level Figma pages, with `00/01` foundations/components, `10` public, `11` access/shared, `12` authenticated web, `13` onboarding states, `14` pharmacy management, `15` finance states, `16` workflow states, `20` responsive public, plus Expo/mobile pages.
- `docs/frontend/FIGMA_REACT_VITE_SCREEN_DECISIONS.md` inventories **232 actual screen frames** across six relevant web pages, plus six page index frames (**238** section frames). Breakdown: **15 access/shared, 144 authenticated, 21 onboarding, 10 pharmacy management, 16 finance, 26 workflow**. Not all 232 are implemented Vite routes: access/public belongs largely in Next.
- Representative reference nodes: Owner overview `15:3049`, Find Shifts `15:1789`, Find Talent `15:1865`, Talent Hub `15:5823`, worker shifts `15:12164`, onboarding identity `15:18844`, pharmacy edit `15:21277`, invoice overdue `15:22089`, roster add `15:24250`, Post Shift review `15:25608`.
- Figma file includes reusable components and variable collections `CT Primitives`, `CT Ezy Auth Web`, `CT Ezy Dimensions`. Example Auth Web colours are `#063BDA`, `#6D28D9`, `#F7F9FD`, `#E5ECF7`. These do not supersede established persona-aware or dark-mode theme colours.
- Parts of the Figma file are fixed-position mockups with no Auto Layout/component instances. Screens sometimes show overlapping action text, tiny operational labels or fabricated example data. **Keep their hierarchy/intended interactions, improve production accessibility and responsiveness, never paste raw absolute-position generated JSX.**
- Figma Code Connect was unavailable during earlier inspection for the connected seat/plan; ordinary Figma design-context extraction and screenshots worked. Claude Code must confirm its own authenticated MCP capabilities before promising Code Connect.
- **Important documentation correction:** The older Figma decision ledger originally says “Keep existing DM Sans application font”. This is **superseded by #155's implemented shared design system**: Outfit for headings/display and Inter for functional/body/control text, loaded as bundled fonts in Next and Vite. See `docs/frontend/IMPECCABLE_UI_UX_RULES.md` and `frontend_web/src/theme/sleekTheme.tsx`. Keep DM Sans only where a legacy/special page explicitly requires it; do not initiate a fresh global font switch.

The objective is **usable, consistent production UI**, not forcing pixel-level fidelity to problematic static mockups.

## 5. What #155 actually implemented and why to retain it

### 5.1 Public Next conversion journey

Principal surfaces: `frontend_web/landing_next/app/landing-page.tsx`, public/hub layouts, public/header/footer, migrated public auth and marketplace/learning pages.

- Reorganised marketing hierarchy around clear product value and conversion, moved public Shift/Talent discovery earlier and mobile-app promotion later.
- Kept established public routes, auth-aware actions, app-store destinations, onboarding and the multi-persona product story.
- Applied public branding and visual continuity via Next theme and bundled Inter/Outfit, rather than generating a disconnected landing page.
- Added public route contracts and React/Next visual standards.
- **Senior review:** check hero, Shift/Talent cards, owner/pharmacist journeys, onboarding CTAs, navigation and mobile header. Functional destinations are more important than illustrative Figma copy.

### 5.2 Shared authenticated sidebar, header and scope

Principal sources:
- `frontend_web/src/layouts/DashboardSideNav.tsx` (new shared nav; expanded/collapsed rail, group states, active selections, keyboard/reduced-motion and light/dark handling).
- `frontend_web/src/layouts/DashboardTopShell.tsx` (authenticated shell, persona/pharmacy selector and surface composition).
- `frontend_web/src/layouts/TopBarActions.tsx` (search, notifications, messages, profile/theme controls).
- `frontend_web/src/layouts/dashboardRouteScope.ts`, `frontend_web/src/navigation.tsx`, `contexts/DashboardNavigationContext`.
- `frontend_web/src/theme/sleekTheme.tsx` and `frontend_web/src/index.css`.

**How it works:** sidebar and top-bar search consume navigation/capability context; pharmacy scope parameters are normalised using common route helpers. This replaces duplicated static route maps. Do not recreate the old static search list or hard-code fake Admin/Explorer paths. Keep correct delegated access, active pharmacy and account switching.

**UX trade-off:** prefer a calm, compact authenticated “Operate” dashboard over busy public marketing cards. Use useful hierarchy, readable labels, coherent icon style and expandable information on demand. Test the expanded and collapsed rails at 1440, 1024, 768 and 390px.

### 5.3 First-look dashboards and worker opportunity truth

- `pages/dashboard/sidebar/OverviewPageStaff.tsx`: personal-shift relationship feed and separate recommendations, real statuses and details, availability/travel matching.
- `pages/dashboard/sidebar/owner/OwnerOverviewHome.tsx` and `OwnerOverviewContainer.tsx`: owner landing prioritises operating tasks (pharmacy, roster, post shift, Shift Centre, finance, workforce). Dead Owner Settings action corrected to actual workforce settings.
- `pages/dashboard/admin/AdminOverview.tsx`: delegated actions respect capabilities; no misleading billing KPI.
- `pages/dashboard/organization/OrganizationOverviewPage.tsx`: org actions follow actual membership capabilities; org-wide financial read scope limited to Organisation Admin.
- Backend tests in #155 cover worker personalisation, invoice scope, role matrix and shift access. These are **protected product rules**—UI polish must not invalidate them.

### 5.4 Roster, workflow and responsive states

#155 changed `components/roster/HorizontalCalendarGrid.tsx`, `RosterGridViews.tsx`/model, `RosterManagerOverview.tsx`, `RosterPlanningToolbar.tsx`, `RosterStackedDayView.tsx`, `RosterWorkerAcknowledgements.tsx`, `RosterWorkerAgenda.tsx`, `features/workforce/RosterCoveragePanel.tsx`, `RosterOwnerPage.tsx`, `RosterWorkerPage.tsx` and appearance utilities. It also changed backend roster/attendance validation and test coverage.

**Senior rule:** visual changes may reorder/clarify cards, calendars, legend, validation and staffing summaries, but must preserve assignment/acknowledgement states, manager decision actions, shift dates/timezones, coverage logic and backend authority. Never infer workforce business logic from Figma's summary cards.

## 6. What #156 introduced, and what #157 actually integrates

### Historical #156-only implementation — DO NOT merge over #155

- Added `DashboardOverviewPrimitives.tsx`: typed action, upcoming-shifts, recent-activity and metric cards, responsive grids, button semantics and reduced-motion support.
- Replaced significant portions of older `DashboardOverviewTemplate.tsx` and `OwnerOverviewHome.tsx` with those components; also introduced an overview static audit.
- Useful exploration, but it targeted older `main` before #155's richer role-aware redesign. Its overview components and old font/tone assumptions were intentionally **not** adopted into #157. Extract isolated visual ideas later only after comparison with #155 code, without duplicating core components.

### Current #157: exactly nine files changed versus #155

| File | What changed | Pattern / guarantee | Remaining proof |
| --- | --- | --- | --- |
| `src/components/dashboard/DashboardContentState.tsx` | New shared MUI state view | Typed `loading / empty / error`; skeletons, explanatory messages, optional reset/retry buttons; semantic `status/alert` roles and `data-ct-state` hooks | Verify light/dark contrast, localisation, responsive overflow and screen-reader announcements |
| `src/pages/dashboard/sidebar/ShiftsBoard/components/ShiftList.tsx` | Initial loading skeleton and no-match state | Replaces plain loading text/no-results card; reuses existing `clearAllFilters`; retains shift list and offer handlers | Add long-loading, network failure, saved/filtered/expanded/urgent/offer UI tests |
| `src/pages/dashboard/sidebar/TalentBoard/index.tsx` | #155 filter sidebar retained, new loading/empty/failure UI inserted | Separates no published talent, filter misses and API failures; retry via existing feed reload; labels availability publish action | **P0 syntax fix first**, then verify filtered, loading, failed, mobile drawer, pitch/calendar/booking and error retry |
| `src/pages/finance/FinanceWorkspace.tsx` | MUI state treatment applied to finance | Loading, zero/filtered invoices, received-search no match and reset; preserves issuer/recipient `receivedMode`, actual finance API/actions | Confirm invoice tabs, request revision, paid/approval, receipt/expense and error/refresh states |
| `src/scripts` is NOT changed | — | Do not confuse with `frontend_web/scripts/` | — |
| `frontend_web/scripts/audit-dashboard-visual-states.mjs` | Static source contract guard | Uses string/regex assertions that key state usage and authority remain present | Not behavioural tests; complement with Playwright, don't overfit textual formatting |
| `.github/workflows/shared_core_consolidation_ci.yml` | Adds visual-state contract in Vite job | Runs source assertion after installing the actual app/shared-core dependencies | Fix current Vite typecheck before later steps can run |
| `.github/workflows/frontend_e2e_manual.yml` | PR-triggered browser checks and artifacts | Vite fixture Playwright, excludes only live Next/Django-login scenario | Current #157 build fails before Playwright; need separate full-stack login verification |
| `docs/frontend/FIGMA_REACT_VITE_SCREEN_DECISIONS.md` | Per-frame keep/adapt/routing ledger | Inventory with specific Figma node IDs and authority decisions | Mark actual completion and screenshots separately; fix old font statement |
| `docs/frontend/FIGMA_REACT_VITE_LIVE_PROGRESS.md` | Session/change journal | Resumable scope, TODOs and known blockers | Early sections refer to superseded #156 as “working branch”; read latest checkpoint and this handover for current truth |

**Count:** #157 has 9 changed files; the table above includes an explanatory non-file row so no actual changed file is hidden. #157 retains #155 files unchanged unless one of the nine is listed.

**Do not overclaim:** the 232-frame inventory is not 232 coded or tested screens. #157 has not yet produced accepted Figma-versus-browser screenshot evidence. The Playwright screenshots for individual Figma states remain a required next implementation step.

## 7. Senior review order: P0 → architecture → visual states

| Priority | Scope | Required action | Exit criterion |
| --- | --- | --- | --- |
| P0 | #157 Talent JSX | Fix TS1005 and adjacent-root error without modifying #155 filter semantics; run tsc/Vite | Vite and fixture runner can actually start |
| P0 | Merge safety | Verify #157 is stacked on current #155 head; no independent merge of #156 | No silent loss of owner, worker, org, admin, roster or Next changes |
| P1 | Typography and theme | Update stale ledger instruction and use #155 Inter/Outfit + semantic MUI tokens | No unintended global font/tone change; light/dark correct |
| P1 | Auth and permissions | Verify persona switching, pharmacy count/filter, cross-account reset, org billing and Explorer routes | No hidden capabilities, private data retention or fake route |
| P1 | Figma state mapping | For each frame identify existing route **and local component/modal/tab state**; do not add dummy routes | Traceable mapping and screenshot state for each changed area |
| P2 | Domain UX | Improve onboarding, pharmacy forms, roster, attendance, finance, Shift Centre, Talent and chats | Responsive and complete feedback/validation/destructive states |
| P2 | Frontend maintainability | Detect duplicate cards/filters/navigation/styles; split oversized components only by existing domain boundaries | No new parallel state store/router/API client; regression suite green |
| P3 | Polish | Spacing, contrast, icons, motion, density, skeletons, focus and layout behaviour | Reviewed desktop/tablet/mobile screenshots in both themes |

### Actual state-coverage checklist

For **every relevant page/interaction**, explicitly exercise:
- initial/loading with skeleton and aria-busy; populated/success; genuinely empty; filtered no-match; recoverable error with retry; permission denied and redirect; form invalid/valid/saving/saved/conflict; destructive confirm/cancel/success/failure;
- filter control selected/unselected/clear-all, chips, sorting, pagination, drawer open/close and no scroll trap;
- modals/dialogs open, error state, keyboard/focus/Escape and mobile sizing;
- account and persona switch, pharmacy scope change, browser reload/back, deep links and cross-account private-state separation;
- long names/text, varying shift slots, dates, currencies, actual Australian postcode/address content, default/system zoom, light and dark themes.

Focus by Figma family:
- **Auth/onboarding**: phone/OTP, existing-account redirect to login, role-specific steps, identity/referee, save/resume/invalid, submitting and conflict/403.
- **Owner / organisation / pharmacy**: no pharmacies, many pharmacies, owner/admin scope, directory/editor/claim, ABN/PBS approval details (not decorative verification).
- **Roster / attendance**: staff/day/calendar/stacked, new/edit shifts, validation, publish, acknowledge, clock-in/out and QR errors, manager reopen and review.
- **Shifts / Talent**: browsing vs saved, filtered, shift card expanded, applying, counter-offer, candidate calendar, booking and pitch/dialog, server errors.
- **Finance**: sent/received persona, saved/sent/revision/overdue/paid filters, date/customer filters, preview/PDF, confirm/send/approve/revise/mark-paid, expenses/BAS warning.

### UX craft constraints

- Avoid tiny Figma mockup labels as production text; support readable minimum UI/body sizes and WCAG AA where applicable.
- Prefer clean whitespace and grouped controls, but do not hide critical clinical/workforce/financial fields for visual neatness.
- Use role-specific accent colours deliberately, not a single uniform navy/purple everywhere.
- Use MUI theme/components and semantic roles; do not create a second Tailwind/card framework inside authenticated Vite.
- Prefer SVG/brand/icon assets already in repository. Download and verify any new Figma assets; do not ship temporary MCP asset URLs or screenshots masquerading as components.
- Keep PRs/change sets by page family and avoid unnecessary backend/API/schema changes.
- Add visual tests around **states**, not merely homepage screenshot.

---

## 8. Claude Code — exact recommended setup (Windows / WSL2)

**Purpose:** let Claude Code finish UI design implementation inside the real checked-out repository with its Figma MCP and a browser, while GitHub provides independent CI evidence. Do NOT run an agent from an unrelated extracted Figma project.

### 8.1 Checkout the correct branch

In your existing authenticated Git checkout (prefer your WSL2 Ubuntu project directory):

```bash
git status --short
git fetch origin --prune
git switch feat/ui01-ui02-figma-react-integration
git pull --ff-only
```

If the branch does not exist locally, create a tracking branch from `origin/feat/ui01-ui02-figma-react-integration`. Protect uncommitted changes before switching branches. To work in a **separate review worktree** based on the correct integration head:

```bash
git fetch origin --prune
git worktree add -b review/ui02-claude ../ChemistTasker-UI02 origin/feat/ui01-ui02-figma-react-integration
cd ../ChemistTasker-UI02
claude
```

Do not blindly launch a default-branch worktree and assume #155/#157 changes are present. You may instead work directly on the integration branch if it is clean and only one developer is editing.

### 8.2 Connect Figma to Claude Code

**Official preferred path** (supported by Figma):

```bash
claude plugin install figma@claude-plugins-official
```

If the plugin is unavailable, use the documented remote MCP connection:

```bash
claude mcp add --transport http figma https://mcp.figma.com/mcp
claude mcp list
```

Then start `claude`, type `/mcp`, select Figma and complete OAuth. Provide **specific Figma frame links/node IDs**, not simply “redesign everything”. Avoid configuring remote and desktop MCP with colliding names. Official reference: https://developers.figma.com/docs/figma-mcp-server/remote-server-installation/

### 8.3 Make durable project instructions

Before creating `CLAUDE.md`, inspect whether one already exists and check `AGENTS.md`, `docs/frontend/IMPECCABLE_UI_UX_RULES.md` and `.agents/skills/ui-ux-pro-max/SKILL.md`. Keep any `CLAUDE.md` **brief** (around 100–200 lines), with links to the long handover and screen register. It should mandate:
- #155-first precedence; functional API/role contracts;
- current MUI / Inter / Outfit system; no parallel router/client/token source;
- safe component reuse, accessibility and responsiveness;
- component-level Figma frames and all in-page visual states;
- test commands and GitHub gate evidence;
- incremental updates to `FIGMA_REACT_VITE_LIVE_PROGRESS.md`;
- no merge without owner approval and passing evidence.

Claude's `/init` can propose the file, but a senior must check its generated instructions before committing. Official guide: https://code.claude.com/docs/en/memory

### 8.4 Baseline commands Claude should run

Install locked dependencies according to the repository scripts. The authoritative CI commands already exist in `.github/workflows/shared_core_consolidation_ci.yml` and should be reused rather than inventing alternatives.

```bash
cd frontend_web
npm ci
npx tsc -p tsconfig.app.json --noEmit
node scripts/audit-dashboard-visual-states.mjs
npx vite build
cd e2e
npm ci
npx playwright install chromium
npm test -- --grep-invert "real Next login hands off"
```

The full Next/Django/Vite real-stack acceptance must be run separately using its documented environment. Do not modify production secrets or commit `.env` files. `frontend_web/package.json` has a shared-core preinstall script; keep the repository's install sequence intact.

### 8.5 Figma-to-code workflow for Claude

**Work on one coherent page family at a time.** For each frame:
1. Read existing route/component/state/business API; capture current browser screenshot (desktop and mobile).
2. Fetch the exact Figma node's screenshot, design context, spacing, variables and static assets.
3. Write a **keep / adapt / reject** comparison. Expose content hierarchy, controls, loading/empty/error/disabled/dialog states. Record any weak Figma choices and why production should improve on them.
4. Reuse MUI, current theme and existing domain components; change presentation separately from API/business logic.
5. Run unit/static tests, real Vite typecheck/build and Playwright interactions before declaring the screen done.
6. Capture **actual rendered** screenshots at 1440px, 1024/768px and 390px, in light/dark, for all key states. Compare side by side with Figma; review practical differences.
7. Document exact files, state conditions, tests, screenshot artifact links, deviations and outstanding blockers in the progress register.
8. Commit a focused change; repeat for the next family. Re-evaluate CI after meaningful milestones, not in a polling loop.

Suggested optimisation order:
1. **Unblock #157 Talent JSX/typecheck**; prove current base + integration.
2. Lock responsive theme tokens/fonts and sidebar/header consistency from #155.
3. Complete common feedback components (loading/empty/error/success/permission), tables, form fields and modal foundations only where real reuse exists.
4. Complete Talent and Shift cards, filter drawers, saved/list/expanded/booking/offer variants.
5. Complete pharmacy forms/verification/management and onboarding step states.
6. Complete roster/calendar/stacked/attendance/leave, including dialogs and keyboard actions.
7. Complete finance and invoice revision/payment, BAS and expenses state variants.
8. Complete activity/chat/Hub and mobile overflow/detail states.
9. Design-system and architecture cleanup with PR-by-PR tests, genuine screenshot comparisons and security/permission review.

---

## 9. Copy-and-paste starting instruction for Claude Code

```text
You are the senior React/TypeScript frontend architect and experienced UI/UX implementation lead for ChemistTasker.

The repository is ChemistTasker-Ezy1. We are on the integrated UI02 branch, PR #157, BASED ON PR #155. Do not work from main or merge the standalone PR #156.

READ FIRST:
- docs/frontend/SENIOR_HANDOVER_UI01_UI02_FIGMA_CLAUDE_CODE.md
- docs/frontend/FIGMA_REACT_VITE_LIVE_PROGRESS.md
- docs/frontend/FIGMA_REACT_VITE_SCREEN_DECISIONS.md
- docs/frontend/IMPECCABLE_UI_UX_RULES.md
- .agents/skills/ui-ux-pro-max/SKILL.md
- frontend_web/src/theme/sleekTheme.tsx
- frontend_web/src/navigation.tsx and layouts/dashboardRouteScope.ts

Figma source:
https://www.figma.com/design/t32C9hNvsDdQ4wzUKVJx9O

PHASE A (P0): Verify the exact Git SHA and fix the current PR #157 TalentBoard JSX parsing error (line ~1019, TS1005, adjacent JSX elements). Preserve the newer PR #155 filter sidebar/mobile drawer and all business callbacks. Run TypeScript, Vite and the static architecture checks. Do not start visual changes while the app does not compile.

PHASE B (READ-ONLY DESIGN AUDIT): For each React/Vite page and internal state, map Figma node -> existing route/component -> actual state/data/API -> keep/adapt/reject decision. Do not invent new routes from Figma ?state, ?step or source labels. Confirm which pages belong to Next and Expo so they are not duplicated in Vite. Produce a prioritised file-level plan before extensive rewrites.

PHASE C (IMPLEMENT): Optimise one page family at a time with existing MUI/Emotion + current theme. Keep Outfit display and Inter functional typefaces from PR #155. Preserve auth, persona, scope, access rules, exact shared-core endpoints, forms, shift relationships, invoice role authority, roster and attendance. Do not replace working logic with a Figma screenshot prototype. Cover loading, empty, filtered no-match, errors, 403, stale, success, modal, responsive and keyboard interactions inside the pages.

PHASE D (VERIFY): Run targeted unit/contract tests, npx tsc -p tsconfig.app.json --noEmit, npx vite build and Playwright. Use real desktop/tablet/mobile browser screenshots and compare against Figma; record meaningful deviations. Run the real Next/Django/Vite session test in its own proper environment. Check GitHub gates after each meaningful milestone, not continuously.

PHASE E (DOCUMENT): Keep docs/frontend/FIGMA_REACT_VITE_LIVE_PROGRESS.md current, including commit IDs, changed files, verified states/screenshots, exact passing/failing tests, next action and blockers. Update the per-frame decisions ledger with IMPLEMENTED vs VERIFIED vs PENDING. No unsupported 100% claim. Never merge PR #155/#157 without final owner approval.

First response: report exact SHA, P0 error diagnosis and test plan. Then fix P0 and continue, using small reviewable commits.
```

## 10. Definition of “100%”, and what to hand back to the owner

Completion is **not** equal to every Figma frame being represented by static JSX. Each in-scope frame/state must map to real, working UI, or be explicitly rejected as a mockup error/out-of-scope with rationale.

The senior lead's closing review must provide:
- A **route/state matrix** with Figma IDs and actual component references; each marked `IMPLEMENTED`, `VERIFIED`, `ADAPTED`, `OUT OF SCOPE` or `BLOCKED` (do not treat an inventory as implementation).
- Evidence of preserved #155 business functions and role constraints, with no parallel API/router/theme, and an explicit account/persona regression suite.
- Responsive light/dark visual comparison, keyboard and screen-reader checks, appropriate interaction states and no clipping.
- Real TypeScript, Vite, Next, shared-core, backend authority and Playwright passing results tied to the **integrated** commit SHA; full-stack Next/Django session acceptance separated correctly from Vite fixtures.
- A complete list of changed files and intentional visual deviations from Figma with justification.
- **One approved merge path**: #155 → `main`, then stacked #157 updated against the latest `main`, verified and approved. Do not separately merge #156.

**At this handover:** these exit criteria have **not** been met. The current deliverable is a reviewable, tested-in-parts implementation with an identified P0 JSX compile defect and a clear, resumable completion plan.

## 11. Reference links / evidence locations

- [PR #155 — UI01](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/pull/155)
- [PR #156 — superseded UI02 source](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/pull/156)
- [PR #157 — current stacked integration](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/pull/157)
- [PR #157 — failing Vite typecheck](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/actions/runs/37912319080)
- [PR #157 — failing browser build](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/actions/runs/37912319081)
- [Per-frame Figma decisions](FIGMA_REACT_VITE_SCREEN_DECISIONS.md)
- [Progress / resumption journal](FIGMA_REACT_VITE_LIVE_PROGRESS.md)
- [Frontend craft and typography rules](IMPECCABLE_UI_UX_RULES.md)
- [Figma official remote MCP + Claude Code installation](https://developers.figma.com/docs/figma-mcp-server/remote-server-installation/)
- [Claude Code documentation](https://code.claude.com/docs/en/overview)

**Next immediate action:** On the integration branch, inspect `TalentBoard/index.tsx` around lines 1009–1022, repair JSX structure, run CI Vite typecheck/build, then begin real screenshot-based Figma state acceptance. Nothing should be merged before that.
