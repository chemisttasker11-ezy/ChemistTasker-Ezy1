# Expo mirrors web again: plan (draft, 3 Nov 2026)

Status: **decisions D1-D4 taken; waiting for the go-ahead to start Phase 0.** Nothing is built yet.

## What this is

For months the Vite web app got the redesign (PR #155-#166: brand navy/violet, Outfit + Inter, Lucide outline
icons, 20px hairline cards, tone tiles, Pill/Hint/SectionCard/DashboardContentState, the Shift Centre finishing
standard). Expo kept getting logic fixes but still wears the pre-redesign look (indigo `#6366F1`, default
Paper/Roboto, per-persona colours, `ParityUI` scaffolding).

Goal: every web page has a mobile screen that does the same job, with the same data, rules, copy and visual
language, built the native way (bottom tabs, sheets, safe areas, haptics, 44pt targets), ready for store launch.

Rules that do not change:
- Shared-core is the only source of API calls, types and domain logic. Mobile owns only its UI. No copied
  `apiClient` calls (lesson from PR #153); run the boundary audit before every push.
- Routes, endpoint strings, payloads, permissions and handler behaviour stay as they are unless a separate,
  approved product change says otherwise (FRONTEND_PARITY_AND_REFACTOR_BACKLOG refactor safety rule).
- Mobile-only features (ethical marketplace, marketplace, attendance clock, kiosk link, PIN, BAS) stay. They get
  the new look, not removal.
- Ponytail full: smallest complete change, reuse before writing, no unasked features.

## Where things stand (survey)

| | Web (Vite) | Mobile (Expo 54, RN 0.81, Paper 5) |
|---|---|---|
| Screens | ~175 routes, 6 personas | ~257 screen files, same 6 personas + mobile-only areas |
| API layer | shared-core | shared-core (203 imports) - good |
| Type | Outfit 500/600 + Inter 400/500/600 | System/Roboto, no custom fonts loaded |
| Colour | brand navy `#06214A`, violet `#5222B8`, deep violet `#3C18A8`, 4 tone pairs, dark mode | indigo `#6366F1`, Tailwind greys, persona accents, light only |
| Icons | Lucide outline, stroke 1.75 (77 distinct icons) | `@expo/vector-icons` mixed sets |
| Components | `components/ui/*` kit + DashboardContentState | `features/parity/ParityUI.tsx` + per-screen styles |
| Nav | sidebar groups per persona | 5 bottom tabs per persona + hidden routes |
| Visual check | `ui-shots.ps1`, playwright | none locally (no Android SDK on this PC); Android acceptance runs in CI |

The parity backlog doc is stale: it lists manager roster, attendance reviews, timesheets, leave review and
workforce settings as missing on mobile, but those screens now exist (`manager/roster/*`, `attendance/reviews/*`,
`workforce-timesheets`, `workforce/leave-requests`, `workforce-settings`). Phase 1 re-checks every row.

## Phases

### Phase 0 - Setup (me)
- Worktree outside OneDrive: `C:\dev\worktrees\ct-mobile-mirror`, branch `feat/mobile-web-mirror` from `main`.
- Baseline gates recorded: `tsc --noEmit`, `expo lint`, mobile node tests, shared-core tests,
  `expo export --platform android,ios` (proves the bundle compiles).
- Screenshot rig: `expo start --web` + a small playwright script at 390x844 (iPhone) and 360x800 (Android),
  logged in with playground accounts. React Native Web is a proxy, not the device; native-only modules (maps,
  camera, firebase) get a web stub only if they block rendering. Final native proof = Android CI job + your device
  on an EAS dev build.

### Phase 1 - Parity matrix (Codex research lane, read-only)
`docs/mobile/PARITY_MATRIX.md`: one row per web nav item and route, per persona:
web route -> mobile screen -> status (`match` / `visual drift` / `logic drift` / `missing` / `mobile-only`) ->
the shared-core operations each side calls. Logic drift (mobile calling something web no longer does, or
missing a state web handles) is a bug, fixed first. This matrix is the checklist for every later wave.

### Phase 2 - Foundation (first commits on the branch, everything else builds on it)
1. **Tokens** `frontend_mobile/constants/tokens.ts`: the exact web values (navy, violet, deep violet,
   text primary/secondary/muted, border, surface, the 4 tone bg/fg pairs, success/warning/danger, 20px card radius,
   spacing scale), light values now, dark values alongside so dark mode is a switch later. `theme.ts`
   (Paper MD3) and `ParityUI` palette read from it; raw hex in screens is removed as screens are touched.
2. **Type**: load Outfit 500/600 + Inter 400/500/600 with `expo-font` (already installed) before the splash
   hides; Paper `fonts` config maps display/headline -> Outfit, body/label -> Inter. Respect OS font scaling
   (cap per component only where layout breaks).
3. **Icons**: `lucide-react-native` + `react-native-svg` so mobile uses the same 77 icons as web
   (see decision D1).
4. **Kit** `frontend_mobile/components/ui/`, a native twin of each web part, same names and props where it makes
   sense: `IconTile`, `SectionCard` + `ViewAllLink`, `Pill`, `Hint` (tap an info icon -> small sheet; no hover on
   phones), `MetricStrip`, `StatList`, `ActivityList`, `PageHeader`, `SegmentTabs`, `ConfirmDialog`,
   `InitialsAvatar`, `CandidateRow`, `ContentState` (skeleton / empty with next action / error with retry /
   offline / 403). `ParityPage` becomes a thin wrapper over these so existing screens improve at once.
5. **Shell**: header with the pharmacy selector and persona/admin switch (as web), bottom tabs <= 5 per persona,
   and a **More** screen that lists the web sidebar groups and items in the same order and wording, so every web
   page is reachable. Tab bar respects safe areas; Android back always goes back.
6. Log decisions in `docs/mobile/DESIGN_DECISIONS.md` (same format as `docs/frontend/DESIGN_DECISIONS.md`).

### Phase 3 - Screen waves (each wave = reviewed commits on the branch, the Shift Centre finishing standard per screen)
Per screen: read the logic and the web page -> list every state -> rebuild with the kit -> contrast check
(AA 4.5:1 / 3:1) -> phone screenshots -> decision log line. Same copy as web unless the phone needs shorter.

| Wave | Area | Main screens |
|---|---|---|
| W1 | Auth & onboarding | welcome, login, register, OTP, mobile verify, forgot/reset, persona onboarding, owner setup |
| W2 | Overviews | dashboard for owner, org, admin, pharmacist, other staff, explorer |
| W3 | Shifts | Post Shift, Shift Centre (active/confirmed/history, applications, candidate reveal), worker boards (public/community/confirmed/history/detail), shared shift link |
| W4 | Pharmacy operations | my pharmacies, pharmacy detail/edit/add, staff, locums, invite, my chain, internal roster (manager + worker), calendar, availability, memberships |
| W5 | Attendance & workforce | clock, PIN, kiosk link, attendance approvals, timesheets, leave (manager + mine), my hours, workforce & payroll settings, payroll export |
| W6 | Finance & people | invoices (list/new/detail), finance workspace, talent hub, interests, learning, pills/rewards, hub, chat + messages, notifications, profile + ratings |
| W7 | Mobile-only | marketplace, ethical marketplace, BAS - restyle only |

### Phase 4 - Launch hardening (runs through every wave, closed before release)
Safe areas and notches; keyboard avoidance on every form; screen-reader labels and roles on icon buttons;
44x44pt targets (hitSlop where the glyph is small); Pressable with press feedback; FlatList memoised rows for long
lists; `expo-image` for photos; offline banner + retry on every data screen; 401 -> login, 403 -> clear message;
reduced-motion respected; splash holds until fonts and session are ready; Crashlytics on; no console noise.

### Phase 5 - Gates and release
Per wave: tsc, lint, mobile + shared-core tests, `expo export` both platforms, boundary audit, Codex review of the
diff, screenshots in the PR description. Then the one PR -> staging -> production as AGENTS.md says. The icon/font change
adds native code, so the first release after Phase 2 is a **new store binary** (EAS build), not an OTA update;
later waves can ship OTA on the same runtime.

## Who does what (playbook)
- Me (Claude, orchestrator): Phase 0, foundation tokens/kit API, briefs, reviewing every diff, gates, commits, PRs.
- agy g1-g4 (Gemini): implement waves in parallel, one worktree each, split so no two touch the same files
  (g1 and g4 share quota). Visual lane critiques screenshots (impeccable + ui-ux-pro-max, ADHD lens).
- Codex A/B: Phase 1 matrix (research lane) and the review lane on every wave PR.
- Skills in use: ui-ux-pro-max (react-native stack rules), impeccable (adapt.native, audit.native, polish),
  ponytail full. The taste skill is for landing pages, so only its anti-default rules apply here.

## Owner decisions (3 Nov 2026)
- **D1 icons: Lucide.** `lucide-react-native` + `react-native-svg`; first release after Phase 2 is a new EAS
  binary. (Feather was rejected: 34 of web's 77 icons have no Feather twin.)
- **D2 dark mode: light at launch, dark-ready.** Tokens carry web's dark values; no dark QA in the waves.
- **D3 persona colours: kept.** Persona accents stay as tokens. Where an accent is used for text or icons it gets
  an AA-legible shade of the same hue (e.g. other-staff green `#22C55E` is ~2.3:1 on white, so text uses a darker
  green); the light accent stays for fills.
- **D4 PR shape: one long branch, one PR.** `feat/mobile-web-mirror`; each phase/wave lands as its own reviewed
  commit(s) with the gates run on it, so the PR history reads wave by wave. Draft PR opened early for CI.
