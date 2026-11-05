# Expo app: launch plan (v2, 3 Nov 2026)

Revision of the 3 Nov draft (`EXPO_WEB_MIRROR_PLAN.md`) after the owner's clarification, a check on the
installed Android SDK, and Argon's design direction (`docs/mobile/DESIGN_DIRECTION.md`, DD1).

## What "mirror" means (owner, D5 + D6)
- **Same features and functions as web, not the same pages.** Every job a user can do on web they can do on
  mobile, with the same data, rules and permissions. Each screen is designed the native mobile way: layout,
  navigation, grouping, flow and copy length may differ from web.
- **Siblings in look.** Stay as close as we can to the web design and palette (logo colours: navy `#06214A`,
  violet `#5222B8`, deep violet `#3C18A8`, magenta, cyan, blue; Outfit + Inter; Lucide outline icons; 20pt
  hairline cards; tone tiles) so web and mobile read as one product. Within that, do what is best on a phone.
- Unchanged: shared-core is the only source of API calls, types and domain logic; routes, endpoints, payloads,
  permissions and handler behaviour stay; mobile-only features stay (restyled); nothing the owner built is
  removed to "simplify" (simplify = UX).
- Earlier owner decisions stand: D1 Lucide (new EAS binary), D2 light at launch with dark-ready tokens,
  D3 persona accents kept with AA text shades, D4 one branch `feat/mobile-web-mirror`, one PR.

## Review of the draft: what changed and why
| # | Draft said | Now | Why |
|---|---|---|---|
| 1 | No Android SDK; screenshots via `expo start --web` | **Native emulator rig** (debug build + Metro + `adb screencap`) is the visual check; RN Web dropped | SDK, NDK 27.1, AVD API 36.1, JDK 17 and Gradle cache are installed; a debug build compiled in 7m47s and runs on the emulator. Native truth beats a web proxy |
| 2 | Parity matrix status `visual drift` | Job-based: `same job` / `logic drift` / `missing` / `mobile-only` | D5: a different layout is not drift; a missing job, state or rule is |
| 3 | More screen = web sidebar groups in web order | More = every feature reachable, grouped by how often a phone user needs it; web group names reused where they fit | D5 |
| 4 | Load fonts with `expo-font` before splash hides | Embed Outfit/Inter with the `expo-font` **config plugin** (`@expo-google-fonts/outfit`, `@expo-google-fonts/inter`) | We ship a new binary anyway (D1); embedded fonts have no load flash or runtime cost |
| 5 | (missing) | **Bump `runtimeVersion`** (fixed `"1.0.11"`, `app.json:11`) and `version` with the native change | Otherwise an OTA update built on the new runtime reaches old binaries and crashes |
| 6 | Kit of 13 parts | + `BottomSheet`, `CountBadge`, `BrandBanner`, `ScalePressable` | DD1: hints, switchers and filters need a native sheet; overviews need the web banner; one press-feedback primitive |
| 7 | Waves W1..W7 in order | **W1 → W3 (Shifts) → W2 (Overviews)** → W4..W7 | DD1: Shift Centre is the finishing standard; overviews summarise shift data and land cleaner after it |
| 8 | (missing) | Android edge-to-edge is enforced at targetSdk 36: every screen owns its insets; fix `app/_layout.tsx` (`edges={['left','right']}`) and `OfflineBanner` top inset | DD1 trap + Android 15+ behaviour |
| 9 | (missing) | Error boundary renders a real error state, not an empty `<Stack>` (`app/_layout.tsx:75-88`) | White screen on crash |
| 10 | (missing) | Direct `apiClient` imports in screens (e.g. `roles/owner/dashboard.tsx:10`) move to shared-core first | Rule: shared-core only; listed in the parity matrix |
| 11 | Gates | + `npx expo install --check` (dependency versions match SDK 54) + emulator screenshots per wave | New native deps |

## Phases
**0. Setup** (done 3 Nov): worktree `C:\dev\worktrees\ct-mobile-mirror`, baseline gates green on main
`c2f1615d` (`tsc --noEmit`, `expo lint`), local Android rig proven, foundation deps installed.

**1. Feature parity matrix** (`docs/mobile/PARITY_MATRIX.md`, Codex A, read-only): per persona, every web job →
the mobile screen that does it → status → shared-core calls. Logic drift and missing jobs are fixed first.

**2. Foundation** (one commit each, reviewed):
- F1 tokens `constants/tokens.ts` (DD1 §2 values, light + dark), Paper MD3 theme and `Colors.ts`/`ParityUI`
  palette read from it; fonts embedded; `runtimeVersion`/`version` bump.
- F2 kit `components/ui/*` (DD1 §3) incl. `ScalePressable`, `BottomSheet`, `ContentState`; motion tokens
  `constants/motion.ts` (DD1 §5), reduced motion respected.
- F3 `ParityPage` rebuilt on the kit, so every parity screen improves at once.
- F4 shell: header (pharmacy + persona/admin switch as sheets), ≤5 bottom tabs with More, Android back,
  insets. Waits on the owner question about the owner tab bar (below).

**3. Waves** (W1 auth & onboarding → W3 shifts → W2 overviews → W4 pharmacy ops → W5 attendance & workforce →
W6 finance & people → W7 mobile-only restyle). Per screen: list every state the web page handles → design it
for the phone with the kit → contrast check → emulator screenshot → decision log line.

**4. Launch hardening** (through every wave): safe areas/edge-to-edge, keyboard avoidance, screen-reader labels,
44pt targets, `ScalePressable` feedback + haptics matrix (DD1 §5), memoised FlatList rows, `expo-image`, offline
banner + retry, 401 → login, 403 → clear message, reduced motion, splash until session ready, Crashlytics, no
console noise.

**Feature-parity gate (owner target, 3 Nov):** every shared-core function web uses must be used by mobile too,
unless it is web-only by nature (browser session/storage). Checked by diffing runtime imports from
`@chemisttasker/shared-core` in `frontend_web/src` vs `frontend_mobile` (first run 3 Nov: web 295, mobile 308,
66 web-only, being classified as covered / missing / platform). Release needs zero unexplained web-only
exports, and no mobile screen calling the API outside shared-core.

**5. Gates and release** per wave: tsc, lint, `expo install --check`, mobile + shared-core tests, boundary audit,
`expo export` both platforms, debug build + emulator screenshots, Codex A review; agy front-end code also gets a
Claude B review. First release after Phase 2 = new EAS binary; later waves can ship OTA on that runtime.

## Who does what
- Orchestrator (Claude A): plan, briefs, gates, emulator rig, commits.
- Argon (agy g2): design direction, kit (F2), visual review lane (screenshots, impeccable + ui-ux-pro-max + taste
  + make-interfaces-feel-better).
- agy g1/g3: front-end waves in their own worktrees, split so no two touch the same files.
- Codex A: parity matrix, review lane on every commit (Codex B is out of credits until its reset).
- Claude B: review of agy front-end code and the whole PR.
- Docker only for logged-in acceptance windows, shut down after.

## Owner answers (3 Nov)
- **D7 Post Shift is the hero action** (main income; owner left the design to the orchestrator). Owner/org tab
  bar: **Home · Shifts · Post shift (centre) · Chat · More**.
  - Centre tab: a 56pt brand-violet `#5222B8` circle with a white Lucide `Plus` (2pt stroke) and the label
    "Post shift", lifted 8pt but wholly inside the tab bar's touch area (no clipped overlap like today's -20),
    Medium haptic on press, `accessibilityLabel="Post a shift"`. Overrides DD1's "no centre tab".
  - Also the primary button in the Home banner, the Shifts tab header and every empty "no shifts" state, so
    it is never more than one tap away.
  - The hamburger "Owner menu" modal goes; every item it lists moves to the More tab (nothing removed).
    Hub moves from the tab bar to the top of More; notifications sit as a bell with a count badge in the header.
- **D8 owner accent stays indigo** `#4F46E5` (6.29:1 on white).
