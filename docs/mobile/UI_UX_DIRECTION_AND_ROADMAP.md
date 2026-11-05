# ChemistTasker UI/UX direction and roadmap: mobile (Expo) and web

Date: 3 Nov 2026. Researched on the web today. Checked against `main` (b7fc8e4d) and the mobile-mirror branch
`feat/mobile-web-mirror` (F1, F2, F3 and W1a committed locally).

---

## 1. The short answer

1. **Keep the stack you have.** Do not switch UI libraries (Tamagui, NativeWind/Uniwind, gluestack, HeroUI
   Native). The mobile kit (`frontend_mobile/components/ui/*`, 20 components) is already built on Paper 5.
   Paper is still maintained (5.15.x, May 2026). Swapping libraries is the most common vibe-coding trap: weeks
   of rework and nothing new for users.
2. **The biggest real risk is the Expo version, not the design.** The app is on **Expo SDK 54**. Current is
   **SDK 58** (Oct 2026, React Native 0.88, built for iOS 27). We already need a new store binary for the
   fonts and icons, so the upgrade should ship in **that same binary**.
3. **The biggest UX win is designing around the 5 jobs people open the app for**, not around the 175 web
   pages: find and accept a shift, clock in and out, see my roster, approve timesheets and cover, get paid.
   Each persona's home screen should answer "what do I do next?" in one tap.
4. **"Humanise" means people and plain words, not decoration.** Show real faces and names, use the cast's
   language ("Sara accepted your Saturday shift"), give every empty state a next step, show honest progress,
   and give a haptic on confirmations. Tone: warm and dry, a professional tool. Not playful like Duolingo.
5. **Add the skills the Expo and React communities use now** on top of your design stack. The official Expo
   plugin is **already downloaded on this PC but switched off**.

---

## 2. Skills: what you have and what to add

### Already in use (keep; every UI brief names them, see memory `design-skills-stack`)
| Skill | Use |
|---|---|
| ui-ux-pro-max | rules per stack (react-native and react), palettes, UX guidelines |
| design-taste-frontend (taste) | anti-default and anti-"AI look" rules |
| impeccable | critique, audit, polish, adapt (it is a fork of Anthropic's `frontend-design`, so don't install both) |
| make-interfaces-feel-better | detail polish: shadows, radii, icons, numbers |
| transitions-dev / transitions-polish | motion timing tokens (web CSS; on mobile only the timing rules apply) |
| ponytail | smallest complete change |

### Add for mobile
| Skill | Why | Install |
|---|---|---|
| **Expo official plugin** (23 skills): `expo-native-ui`, `expo-design-system`, `expo-animation`, `expo-ui`, `expo-router`, `expo-data-fetching`, `expo-upgrade`, `eas-app-stores`, `eas-update`, `eas-observe` and more | Written by the Expo team, updated 2 Nov 2026. Covers the SDK upgrade, native UI, store submission, OTA. | Claude: `claude plugin install expo@claude-plugins-official` (already in `~\.claude\plugins\cache\claude-plugins-official\expo`, just enable it). Codex: `codex plugin add expo@openai-curated`. agy: `npx skills add expo/skills` |
| **vercel-react-native-skills** (Vercel) | Performance and layout rules: lists, memoising, native stack, no scroll position in state | `npx -y skills add vercel-labs/agent-skills --skill vercel-react-native-skills --agent claude-code` |

### Add for web
| Skill | Why | Install |
|---|---|---|
| **web-design-guidelines** (Vercel) | Audits UI code against Vercel's Web Interface Guidelines and gives file:line findings. Very widely used (about 450k installs). | `npx skills add vercel-labs/agent-skills --skill web-design-guidelines` |
| **vercel-react-best-practices** | The "write it right" half of the web-design-guidelines audit | same repo |
| **ibelick ui-skills**: `fixing-accessibility`, `fixing-motion-performance`, `baseline-ui` | Small, focused fix passes: keyboard, focus, contrast, jank | `github.com/ibelick/ui-skills` |

Read every SKILL.md before installing a third-party skill: a skill is a set of instructions the agent will follow.

---

## 3. Mobile (Expo): direction

### 3.1 Libraries: keep, add, skip
| Decision | What | Why |
|---|---|---|
| Keep | Expo Router, Paper 5 (as building blocks under our own kit), Reanimated 4, Gesture Handler, expo-haptics, expo-image, Lucide (D1) | Working, maintained, already wired |
| Add after the SDK upgrade | **`@expo/ui`**, stable since SDK 56. It gives real SwiftUI and Jetpack Compose controls. Use it for the bottom sheet (`@expo/ui/community/bottom-sheet`, a near drop-in for `@gorhom/bottom-sheet`), date and time pickers, and menus | Native feel for free. Swap it in **behind** our `BottomSheet` component, so screens don't change |
| Add where profiling shows lag | **FlashList v2** for long lists (shift board, timesheets, notifications). **Legend List** for chat (it keeps the scroll at the newest message) | FlatList is fine for short lists; measure first |
| Skip for launch | `expo-router` native tabs (still `unstable-` in the import path); custom Liquid Glass tab bars | Not stable yet |
| Skip | Tamagui, NativeWind/Uniwind, gluestack, HeroUI Native, react-native-reusables | Each would mean rewriting a kit we already have |

### 3.2 Look: native chrome, brand content
Since 2025, iOS uses Liquid Glass (iOS 26: translucent) and Android uses Material 3 Expressive (bold colour).
They pull in opposite directions, so the rule is:
- **Our brand on both platforms**: cards, colours (navy, violet, deep violet, magenta, cyan, blue), Outfit and
  Inter, Lucide icons. This is what makes the app a sibling of the web app (D6).
- **The system's own controls on each platform**: tab bar, sheets, pickers, alerts, the back gesture, the
  keyboard. This is what makes it feel native rather than like a web page on a phone.

### 3.3 Patterns to copy from proven apps (patterns, not their look)
| App | The pattern that works | ChemistTasker use |
|---|---|---|
| Uber Driver / DoorDash Dasher | One status-driven home: "On shift at X until 5 pm" plus one big action | Worker home = a **Now card**: next shift, countdown, Clock in, Directions |
| Clipboard Health (healthcare shifts) | Browse shifts by list, calendar or map; requirements are checked **before** booking; cancelling explains the consequence and asks to confirm | Shift board with list, calendar and map views. "Add your AHPRA number to apply" shown before Apply, not after |
| Airbnb | Trust from faces and reviews; a summary sheet before you confirm | Candidate reveal and favourite locum (Ben): photo, rating, shifts done. A confirm sheet showing rate, hours and total |
| Deputy / When I Work / Connecteam | Week strip for the roster; approve timesheets in bulk | Manager inbox: "3 timesheets need you", with Approve all and per-row swipe |
| Monzo / Revolut | Money as a timeline, with exact amounts | Invoice and payout status: Sent, Viewed, Paid, with dates |
| Linear (web) | Fast keyboard use, a command menu | Web search dialog becomes Ctrl+K: "go to", "post shift", "find staff" |

Where to look for screens: **Mobbin** (paid, has full flows), **Pttrns**, **Screenlane** (free tier),
**Refero**. Best of all: install the competitor apps (Deputy, Connecteam, Indeed Flex, Sidekicker, Mable,
Clipboard) on the emulator and record their onboarding, find-a-shift, clock-in and timesheet flows. I could not
find good public write-ups of their UX, so this hands-on teardown (step 2 below) is the reliable source.

### 3.4 Humanise: rules every screen must pass
1. **Names and faces before data.** "Omar is covering Tue 9-5", not "Shift #4821 assigned".
2. **One next action** on every empty, error and success state. "No shifts yet. Post your first shift".
3. **Plain words from the pharmacy world**, short on phones. Keep the web copy unless the phone needs it shorter.
4. **Confirm big moments the human way.** Clock-in, shift accepted, invoice paid: a short success state plus
   a success haptic. Ordinary taps get a light haptic or none.
5. **Honest waiting.** A skeleton that matches the layout, real progress, never a fake delay.
6. **Forgiving.** Undo where we can, "Continue later" on long forms, keep the draft when a save fails (the
   GUARD work already does this).
7. **Respect the person's settings.** OS font size (Dynamic Type) and reduced motion. 44 pt targets on iOS,
   48 dp on Android (already in tokens). Screen-reader labels on every icon button.
8. **Speak to the moment.** Calm on a busy Saturday (an owner short of staff gets "Ben and 2 others are
   free", not a form).

---

## 4. Web (Vite + MUI): direction

The stack is React 19, Vite, MUI 7 + Emotion, framer-motion 12, Lucide and React Router 7. The redesign
(#155-#166) is done and good. The web work now is **audit, slim and upgrade**, not redesign.

| Item | Finding | Action |
|---|---|---|
| MUI | **v9 has been stable since 7 Apr 2026** (it skipped v8). It improves accessibility and `sx` performance and removes deprecated APIs | Upgrade as its own PR after the mobile waves, using MUI's codemods |
| Dates | Three date libraries ship: `dayjs` (33 files), `moment` (13), `date-fns` (1) | Settle on one (dayjs, which MUI pickers use); move the 13 moment files over |
| Icons | Lucide (76 files) and MUI icons (81). `react-icons` and `@iconify/react` have **0 imports** in `src` | Remove the unused two (check `landing_next` and `shared` first). Move MUI icons to Lucide when a page is touched |
| Unused | `aos`, `react-apexcharts`/`apexcharts`, `canvas-confetti`, `simplebar-react`: 0 imports in `src` | Confirm, then remove (a smaller bundle and a faster first load) |
| Motion | `framer-motion` is now called `motion` (`motion/react`, same author, v12) | Rename only when touching that code. Low value |
| Page transitions | React's `<ViewTransition>` is reported stable in React 19.3 (one secondary source; not confirmed in React's own notes) | Wait. Confirm in the React changelog first |
| Audits | Not yet run on web: web-design-guidelines, fixing-accessibility | One audit pass, findings go to a fix list |
| Patterns | Linear for the command menu, Stripe Dashboard for tables, filters and detail drawers | Command menu (Ctrl+K) on the existing search; tables get saved filters and a side drawer instead of new pages |

---

## 5. Roadmap: steps in order

Each step names who does it (playbook routing: Claude B designs and builds UI, Argon checks design, Codex
reviews code, agy g1/g3 run visual checks) and what "done" means.

| # | Step | When | Who | Done when |
|---|---|---|---|---|
| 0 | **Turn on the skills**: enable the Expo plugin, add vercel-react-native-skills and web-design-guidelines, add their paths to the UI brief template | Today (needs your yes: it changes settings) | Orchestrator | Every new UI brief lists them |
| 1 | **Top-tasks map**: for each persona, the 3-5 jobs and how often they happen, taken from the launch-grill answers. It drives the tab bar, the home screens and the More screen order (D5) | 1 day | Orchestrator + Claude B | One page per persona; Argon agrees |
| 2 | **Competitor teardown**: install 5-6 apps on the emulator and record onboarding, find-and-apply, clock-in and timesheet flows | 2-3 hours | agy g3 (visual lane) | A "steal / avoid" sheet with screenshots |
| 3 | **Finish the mirror job's open gates**: F3, F4, W1a/W1b, GUARD (already in flight) | This week | As in `mobile-mirror.md` | Committed after Codex B's gate |
| 4 | **SDK upgrade 54 → 58**, one SDK at a time with `expo-upgrade` and `expo-doctor`, on its own branch in parallel with the screen waves. Watch: Firebase, maps, SSL pinning, paper-dates, the Hermes v1 memory issue (fixed in RN 0.86.3+), the iOS 27 scene lifecycle, and the `runtimeVersion` change | Weeks 1-2, in parallel | Codex B (`codex-write`) | Android dev build boots on SDK 58; tsc and lint clean; merged before the first store binary |
| 5 | **Screen waves W1-W7** as planned, plus per screen: the humanise checklist (3.4), one competitor pattern applied where it fits, and a check on a **real phone** (EAS dev build) every wave, not only the emulator | Weeks 1-6 | Claude B builds, Argon checks, Codex B gates, agy visual | Each wave is a reviewed commit with screenshots |
| 5b | **Wave W8 "Public & content"** (owner D9, 2026-11-04): calculator, learning, blog/news, public hubs, public organisation profile, signed-out talent board natively; pricing, terms, privacy and the publishing workspace in the in-app browser. Plan: `C:\dev\worktrees\ct-mobile-mirror-work\W8_PUBLIC_CONTENT_PLAN.md` | After W7 | Same as step 5 | Each sub-wave a reviewed commit with signed-out and signed-in shots; calculator off in store builds until the owner decides |
| 6 | **Native polish**: `@expo/ui` bottom sheet and pickers behind the kit, FlashList where profiling shows lag, Legend List in chat | After step 4 | Claude B | Same component APIs; no screen changes needed |
| 7 | **Five-user test** (5 users find most usability problems): one locum, one owner, one pharmacist, one technician, one assistant, each doing 5 scripted tasks on a real phone. Fix what at least 2 of them trip on | Before release | You recruit; I script and summarise | Each task done without help, or fixed |
| 8 | **Launch**: one new store binary (SDK 58 + fonts + icons), `eas-app-stores`, the ASO skill for the listing, Crashlytics / EAS Observe on | After 5-7 | Orchestrator; you push and submit | Binary in TestFlight and Play internal test |
| 9 | **Web pass**: run the audits, slim the dependencies, add the command menu, then upgrade MUI to v9 | After W3, in parallel (different files) | Claude B / Codex B | Audit findings closed; bundle smaller; v9 green |
| 10 | **Measure after launch**: time to accept a shift, clock-in success rate, crash-free sessions, where people drop out of onboarding | Ongoing | Orchestrator | A monthly 1-page report |

---

## 6. Lessons from this project, built into the plan
- A "simple + native" brief without the design skills produced a flat UI → every brief names the skills (step 0).
- "Simplify" removed planner features → simplify = UX; features and workflows stay unless you say otherwise.
- PowerShell `>` corrupted 34 screenshots → screenshots use `screencap` + `adb pull`.
- `runtimeVersion` stayed the same across a native change → an OTA update would crash old binaries; bump it on
  every native change (step 4).
- Emulator-only checks miss touch feel, real fonts and the keyboard → a real phone every wave (step 5).

## 7. What I need from you
1. **Yes or no to step 0**: enable the Expo plugin and install the Vercel skills (a settings change).
2. **Five testers for step 7** (real users from your network), around week 5.
Everything else (design calls, order, routing) I own and report at milestones.

## Sources
- Expo SDK 58: https://expo.dev/changelog/sdk-58 · upgrade guide https://expo.dev/blog/how-to-upgrade-to-sdk-58
- Expo SDK 57: https://expo.dev/changelog/sdk-57 · SDK 56: https://expo.dev/changelog/sdk-56 · SDK 55: https://expo.dev/changelog/sdk-55
- Expo UI stable: https://expo.dev/blog/expo-ui-stable-sdk-56 · https://docs.expo.dev/versions/latest/sdk/ui
- Expo skills: https://docs.expo.dev/skills/ · native tabs: https://docs.expo.dev/router/advanced/native-tabs.md
- Vercel agent skills: https://github.com/vercel-labs/agent-skills/wiki
- ui-skills: https://www.ui-skills.com/
- React Native Paper: https://github.com/callstack/react-native-paper · https://depscope.dev/pkg/npm/react-native-paper
- RN UI library landscape: https://market.gluestack.io/blog/best-react-native-ui-libraries · HeroUI Native https://heroui.com/en/docs/native/getting-started
- Lists: https://www.pkgpulse.com/guides/flashlist-vs-flatlist-vs-legendlist-react-native-lists-2026
- MUI v9: https://mui.com/blog/introducing-mui-v9/
- Motion vs ViewTransition: https://blog.logrocket.com/react-viewtransition-vs-motion/
- Liquid Glass vs Material 3 Expressive: https://androidcentral.com/apps-software/android-os/android-16-material-3-expressive-vs-ios-26-liquid-glass
- Clipboard Health worker app: https://workers.clipboardhealth.com/hc/en-us/articles/34214219385239-How-to-Use-the-Clipboard-App
- UI inspiration libraries: https://theapplaunchpad.com/blog/best-mobbin-alternatives/
