# ChemistTasker Mobile — Store-Launch Design Direction (DD1)

**Design Read:** Operate-mode native workforce & clinical operations app for pharmacy owners, managers, pharmacists, and staff — crisp editorial authority (Outfit + Inter, brand navy `#06214A` + deep violet `#3C18A8`, `20pt` flat hairline surfaces, four semantic tile tones, tactile native press/sheet physics).
**Dials (`taste` / `ui-ux-pro-max`):** `DESIGN_VARIANCE: 4` (structured operational clarity) · `MOTION_INTENSITY: 5` (purposeful native spring/haptic feedback, zero ambient loops) · `VISUAL_DENSITY: 6` (scannable mobile cards, tabular figures, zero clutter).

---

## 1. Verdict on the Plan’s Design Parts

| Plan Area | Verdict | Reason & Required Adjustment |
|---|---|---|
| **Phase 2 Kit List** (`EXPO_WEB_MIRROR_PLAN.md:68-72`) | **CHANGE (Keep 13 + Add 3)** | Keep all 13 parts (`IconTile`, `SectionCard`+`ViewAllLink`, `Pill`, `Hint`, `MetricStrip`, `StatList`, `ActivityList`, `PageHeader`, `SegmentTabs`, `ConfirmDialog`, `InitialsAvatar`, `CandidateRow`, `ContentState`). **Add:** (1) `BrandBanner` ([`BrandBanner.tsx:15`](file:///C:/dev/worktrees/ct-mobile-mirror/frontend_web/src/components/ui/BrandBanner.tsx#L15)) so Wave 2 overviews don't invent custom gradients like [`dashboard.tsx:218`](file:///C:/dev/worktrees/ct-mobile-mirror/frontend_mobile/roles/owner/dashboard.tsx#L218); (2) `CountBadge` ([`Pill.tsx:46`](file:///C:/dev/worktrees/ct-mobile-mirror/frontend_web/src/components/ui/Pill.tsx#L46)) for tabular unread/attention counts; (3) `BottomSheet` primitive to host `Hint`, scope pickers, and filter drawers natively. |
| **Phase 2 Shell** (`EXPO_WEB_MIRROR_PLAN.md:73-75`) | **CHANGE (Unify Nav)** | Keep header pharmacy/persona switchers and `<= 5` bottom tabs. **Change:** Make **More** the 5th bottom tab and **delete** both the top-left hamburger modal ([`owner/_layout.tsx:66-82`](file:///C:/dev/worktrees/ct-mobile-mirror/frontend_mobile/app/owner/_layout.tsx#L66-L82), [`owner/_layout.tsx:311`](file:///C:/dev/worktrees/ct-mobile-mirror/frontend_mobile/app/owner/_layout.tsx#L311)) and the protruding `-20pt` centre FAB tab ([`owner/_layout.tsx:400-410`](file:///C:/dev/worktrees/ct-mobile-mirror/frontend_mobile/app/owner/_layout.tsx#L400-L410)). Two competing menu patterns violate native platform conformance. |
| **Phase 3 Wave Order** (`EXPO_WEB_MIRROR_PLAN.md:82-90`) | **CHANGE (Swap W2/W3)** | Keep **W1 (Auth & Onboarding)** first. **Swap W3 (Shifts) before W2 (Overviews):** Shift Centre is the finishing standard ([`DESIGN_DECISIONS.md:122-140`](file:///C:/dev/worktrees/ct-mobile-mirror/docs/frontend/DESIGN_DECISIONS.md#L122-L140)) that proves `CandidateRow`, slot pills, and audience steppers. Overviews (W2) are summary aggregators of shifts/pills/activity and land cleaner once W3 shift cards and routes are locked. Keep W4→W5→W6→W7. |

---

## 2. Native Token Specification (`frontend_mobile/constants/tokens.ts`)

### 2.1 Core Surfaces, Text, Brand & Status Colours (Light + Dark)
Mirrors [`sleekTheme.tsx:9-125`](file:///C:/dev/worktrees/ct-mobile-mirror/frontend_web/src/theme/sleekTheme.tsx#L9-L125) and [`tone.ts:3-18`](file:///C:/dev/worktrees/ct-mobile-mirror/frontend_web/src/components/ui/tone.ts#L3-L18). Light ships active at launch; dark values are populated in `tokens.dark` (Decision D2).

| Token | Light | Dark | Usage & Contrast Note |
|---|---|---|---|
| `brandNavy` | `#06214A` | `#06214A` | Brand anchor, `navy` Pill fill (`#FFFFFF` text = **15.8:1**), skill linework ([`sleekTheme.tsx:108`](file:///C:/dev/worktrees/ct-mobile-mirror/frontend_web/src/theme/sleekTheme.tsx#L108)) |
| `primary` | `#5222B8` | `#AA81E9` | Primary CTA button fill (`#FFFFFF` text on `#5222B8` = **8.42:1**) ([`sleekTheme.tsx:11,43`](file:///C:/dev/worktrees/ct-mobile-mirror/frontend_web/src/theme/sleekTheme.tsx#L11)) |
| `primaryPressed` | `#40168F` | `#7D45CB` | Primary CTA pressed state (`primary[700]` / `primary[500]`) ([`sleekTheme.tsx:11`](file:///C:/dev/worktrees/ct-mobile-mirror/frontend_web/src/theme/sleekTheme.tsx#L11)) |
| `primarySoft` | `#EFE7FF` | `rgba(170,129,233,0.18)` | Selected row / active nav pill tint (`rgba(82,34,184,0.10)`) ([`sleekTheme.tsx:25,90`](file:///C:/dev/worktrees/ct-mobile-mirror/frontend_web/src/theme/sleekTheme.tsx#L25)) |
| `accentStrong` | `#3C18A8` | `#B9A5F5` | Active tab/link text, `StatList` figures, outline button label (**11.12:1** on `#FFF`) ([`sleekTheme.tsx:97`](file:///C:/dev/worktrees/ct-mobile-mirror/frontend_web/src/theme/sleekTheme.tsx#L97)) |
| `secondary` | `#C000B4` | `#F09BE4` | Brand magenta AA shade (**4.53:1** on `#FFF`), nice-to-have skills ([`sleekTheme.tsx:45`](file:///C:/dev/worktrees/ct-mobile-mirror/frontend_web/src/theme/sleekTheme.tsx#L45)) |
| `pageBg` | `#F7F9FC` | `#08111F` | Root screen canvas background (`--ct-page-bg`) ([`sleekTheme.tsx:30`](file:///C:/dev/worktrees/ct-mobile-mirror/frontend_web/src/theme/sleekTheme.tsx#L30)) |
| `surfaceBg` | `#FFFFFF` | `#101A2D` | Flat cards, header, tab bar (`--ct-surface-bg`) ([`sleekTheme.tsx:31`](file:///C:/dev/worktrees/ct-mobile-mirror/frontend_web/src/theme/sleekTheme.tsx#L31)) |
| `elevatedBg` | `#FFFFFF` | `#142036` | Bottom sheets, dialogs, popovers (`--ct-elevated-bg`) ([`sleekTheme.tsx:32`](file:///C:/dev/worktrees/ct-mobile-mirror/frontend_web/src/theme/sleekTheme.tsx#L32)) |
| `subtleBg` | `#F7F8FC` | `rgba(255,255,255,0.03)` | Neutral pill fill, table/section bands (`--ct-subtle-bg`) ([`sleekTheme.tsx:124`](file:///C:/dev/worktrees/ct-mobile-mirror/frontend_web/src/theme/sleekTheme.tsx#L124)) |
| `inputBg` | `#FFFFFF` | `#0C1628` | TextInput background (`--ct-input-bg`) ([`sleekTheme.tsx:91,317`](file:///C:/dev/worktrees/ct-mobile-mirror/frontend_web/src/theme/sleekTheme.tsx#L91)) |
| `pressBg` | `rgba(226,232,240,0.50)` | `rgba(255,255,255,0.06)` | Row/card pressed highlight (`--ct-hover-bg`) ([`sleekTheme.tsx:28,89`](file:///C:/dev/worktrees/ct-mobile-mirror/frontend_web/src/theme/sleekTheme.tsx#L28)) |
| `border` | `#E5ECF7` | `rgba(148,163,184,0.24)` | Card `1pt` border & hairline dividers (`--ct-border-color`) ([`sleekTheme.tsx:35`](file:///C:/dev/worktrees/ct-mobile-mirror/frontend_web/src/theme/sleekTheme.tsx#L35)) |
| `inputBorder` | `#D9E0EC` | `rgba(148,163,184,0.24)` | Resting input outline (`1.5pt` `#5222B8` when focused) ([`sleekTheme.tsx:318-320`](file:///C:/dev/worktrees/ct-mobile-mirror/frontend_web/src/theme/sleekTheme.tsx#L318-L320)) |
| `textPrimary` | `#06123A` | `#EAF1FF` | Headings & primary body (**18.3:1** on `#FFF` / **15.1:1** on `#101A2D`) ([`sleekTheme.tsx:33`](file:///C:/dev/worktrees/ct-mobile-mirror/frontend_web/src/theme/sleekTheme.tsx#L33)) |
| `textSecondary` | `#5E6B8D` | `#A9B8D3` | Subtitles, labels, inactive tabs (**5.34:1** on `#FFF`) ([`sleekTheme.tsx:34`](file:///C:/dev/worktrees/ct-mobile-mirror/frontend_web/src/theme/sleekTheme.tsx#L34)) |
| `textMuted` | `#63708C` | `#8E9BB5` | Captions, timestamps, helper copy (**4.93:1** on `#FFF`) ([`sleekTheme.tsx:96`](file:///C:/dev/worktrees/ct-mobile-mirror/frontend_web/src/theme/sleekTheme.tsx#L96)) |
| `disabledBg` / `Fg` | `#F1F5F9` / `#94A3B8` | `rgba(255,255,255,0.08)` / `rgba(234,241,255,0.38)` | Non-interactive disabled controls ([`sleekTheme.tsx:60-61`](file:///C:/dev/worktrees/ct-mobile-mirror/frontend_web/src/theme/sleekTheme.tsx#L60-L61)) |
| `scrim` | `rgba(6,18,58,0.48)` | `rgba(2,8,23,0.68)` | Modal & bottom-sheet backdrop overlay |
| `tone.violet` | bg `#EFE9FD` · fg `#3C18A8` | bg `rgba(139,108,240,0.18)` · fg `#C6B6F7` | Default `IconTile`, `InitialsAvatar`, active `SegmentTabs` ([`sleekTheme.tsx:99-100`](file:///C:/dev/worktrees/ct-mobile-mirror/frontend_web/src/theme/sleekTheme.tsx#L99-L100)) |
| `tone.blue` | bg `#E6F1FC` · fg `#0063A8` | bg `rgba(63,155,232,0.18)` · fg `#8CC6F5` | Hub/membership tiles, workspace badge (**6.30:1** on `#FFF`) ([`sleekTheme.tsx:101-102`](file:///C:/dev/worktrees/ct-mobile-mirror/frontend_web/src/theme/sleekTheme.tsx#L101-L102)) |
| `tone.cyan` | bg `#DFF7F9` · fg `#007486` | bg `rgba(34,184,201,0.18)` · fg `#7FDCE6` | Confirmed/assignment tiles & pills (**5.48:1** on `#FFF`) ([`sleekTheme.tsx:103-104`](file:///C:/dev/worktrees/ct-mobile-mirror/frontend_web/src/theme/sleekTheme.tsx#L103-L104)) |
| `tone.magenta` | bg `#FCE6F8` · fg `#A3008F` | bg `rgba(214,59,196,0.18)` · fg `#F09BE4` | Invoice/attention tiles & badges (**6.17:1** on `#FFF`) ([`sleekTheme.tsx:105-106`](file:///C:/dev/worktrees/ct-mobile-mirror/frontend_web/src/theme/sleekTheme.tsx#L105-L106)) |
| `status.green` | solid `#117A50` · bg `#E4F5EA` · fg `#17663A` | solid `#34C27A` · bg `rgba(52,194,122,0.18)` · fg `#8EE0B3` | Booked / Active / Approved (`#17663A` = **7.00:1** on `#FFF`) ([`sleekTheme.tsx:47,118-119`](file:///C:/dev/worktrees/ct-mobile-mirror/frontend_web/src/theme/sleekTheme.tsx#L47)) |
| `status.amber` | solid `#A15C07` · bg `#FDF0D9` · fg `#8A4B00` | solid `#F5B85A` · bg `rgba(240,168,58,0.18)` · fg `#F6C77E` | Waiting / Pending / Offline (`#8A4B00` = **6.36:1** on `#FFF`) ([`sleekTheme.tsx:48,120-121`](file:///C:/dev/worktrees/ct-mobile-mirror/frontend_web/src/theme/sleekTheme.tsx#L48)) |
| `status.red` | solid `#C9364A` · bg `#FDE8E7` · fg `#B42318` | solid `#FF8A97` · bg `rgba(240,106,94,0.18)` · fg `#F7A39B` | Declined / Destructive / Error (`#B42318` = **5.89:1** on `#FFF`) ([`sleekTheme.tsx:49,122-123,279`](file:///C:/dev/worktrees/ct-mobile-mirror/frontend_web/src/theme/sleekTheme.tsx#L49)) |

### 2.2 Persona Accents (Decision D3: Fill vs AA Text/Icon Shade)
Replaces [`theme.ts:32-39`](file:///C:/dev/worktrees/ct-mobile-mirror/frontend_mobile/constants/theme.ts#L32-L39) where `pharmacist` (`2.77:1`), `otherStaff` (`2.28:1`), `explorer` (`2.80:1`), and `admin` (`4.47:1`) fail WCAG AA 4.5:1 on white.

| Persona | `softBg` (Light) | `accentFill` (Decorative/Fill) | `textAA` (Light Text/Icon) | Contrast of `textAA` on `#FFFFFF` | `textAA` (Dark) |
|---|---|---|---|---|---|
| **Owner** | `#EEF2FF` | `#4F46E5` | `#3C18A8` | **11.12 : 1** (AAA) | `#C6B6F7` |
| **Pharmacist** | `#E0F2FE` | `#0EA5E9` | `#0369A1` | **5.93 : 1** (AA) | `#7DD3FC` |
| **Other Staff** | `#DCFCE7` | `#22C55E` | `#17663A` | **7.00 : 1** (AAA) | `#8EE0B3` |
| **Explorer** | `#FFEDD5` | `#F97316` | `#C2410C` | **5.18 : 1** (AA) | `#FDBA74` |
| **Organization** | `#E0F2FE` | `#0369A1` | `#0369A1` | **5.93 : 1** (AA) | `#8CC6F5` |
| **Admin** | `#EEF2FF` | `#6366F1` | `#4338CA` | **7.91 : 1** (AAA) | `#A5B4FC` |

### 2.3 Typography Scale (pt, Outfit + Inter)
Load `Outfit_500Medium`, `Outfit_600SemiBold`, `Inter_400Regular`, `Inter_500Medium`, `Inter_600SemiBold` via `expo-font` while holding `SplashScreen.preventAutoHideAsync()`. Never use weights `700`–`900` ([`DESIGN_DECISIONS.md:27-29`](file:///C:/dev/worktrees/ct-mobile-mirror/docs/frontend/DESIGN_DECISIONS.md#L27-L29)).

| Token / Paper Variant | Family | Weight | Size (pt) | Line Height (pt) | Letter Spacing | Usage & Scaling Rule |
|---|---|---|---|---|---|---|
| `displayLarge` | `Outfit_500Medium` | `500` | `36` | `40` (`1.11×`) | `-0.9pt` | `BrandBanner` pill balance figure; `tabular-nums`, `maxFontSizeMultiplier={1.2}` |
| `displayMedium` | `Outfit_500Medium` | `500` | `28` | `32` (`1.14×`) | `-0.7pt` | `BrandBanner` hero greeting ([`BrandBanner.tsx:46`](file:///C:/dev/worktrees/ct-mobile-mirror/frontend_web/src/components/ui/BrandBanner.tsx#L46)) |
| `headlineLarge` | `Outfit_500Medium` | `500` | `26` | `30` (`1.15×`) | `-0.65pt` | `PageHeader` screen title ([`PageHeader.tsx:35`](file:///C:/dev/worktrees/ct-mobile-mirror/frontend_web/src/components/ui/PageHeader.tsx#L35)) |
| `headlineMedium` | `Outfit_500Medium` | `500` | `24` | `28` (`1.17×`) | `-0.4pt` | `MetricStrip` & `StatList` figures (`tabular-nums`) ([`MetricStrip.tsx:43`](file:///C:/dev/worktrees/ct-mobile-mirror/frontend_web/src/components/ui/MetricStrip.tsx#L43)) |
| `titleLarge` | `Outfit_500Medium` | `500` | `20` | `25` (`1.25×`) | `-0.3pt` | `ConfirmDialog` & BottomSheet titles ([`sleekTheme.tsx:308`](file:///C:/dev/worktrees/ct-mobile-mirror/frontend_web/src/theme/sleekTheme.tsx#L308)) |
| `titleMedium` | `Outfit_500Medium` | `500` | `18` | `23` (`1.28×`) | `-0.27pt` | `SectionCard` & `ContentState` titles ([`SectionCard.tsx:79`](file:///C:/dev/worktrees/ct-mobile-mirror/frontend_web/src/components/ui/SectionCard.tsx#L79)) |
| `titleSmall` | `Outfit_500Medium` | `500` | `16` | `21` (`1.31×`) | `-0.2pt` | Action card titles, top app bar title ([`DashboardOverviewTemplate.tsx:340`](file:///C:/dev/worktrees/ct-mobile-mirror/frontend_web/src/components/dashboard/DashboardOverviewTemplate.tsx#L340)) |
| `bodyLarge` | `Inter_400Regular` | `400` | `15` | `23` (`1.53×`) | `0pt` | `PageHeader` subtitle, `ConfirmDialog` body ([`PageHeader.tsx:43`](file:///C:/dev/worktrees/ct-mobile-mirror/frontend_web/src/components/ui/PageHeader.tsx#L43)) |
| `bodyMedium` | `Inter_400Regular` | `400` | `14` | `21` (`1.50×`) | `0pt` | Default reading copy, form input text ([`sleekTheme.tsx:74`](file:///C:/dev/worktrees/ct-mobile-mirror/frontend_web/src/theme/sleekTheme.tsx#L74)) |
| `bodySmall` | `Inter_400Regular` | `400` | `13` | `19` (`1.46×`) | `0pt` | `SectionCard` subtitle, `StatList` labels ([`SectionCard.tsx:85`](file:///C:/dev/worktrees/ct-mobile-mirror/frontend_web/src/components/ui/SectionCard.tsx#L85)) |
| `labelLarge` | `Inter_600SemiBold` | `600` | `14` | `20` (`1.43×`) | `0pt` | Buttons (`44pt`/`48pt`), row primary titles ([`sleekTheme.tsx:75`](file:///C:/dev/worktrees/ct-mobile-mirror/frontend_web/src/theme/sleekTheme.tsx#L75)) |
| `labelMedium` | `Inter_600SemiBold` | `600` | `12.5` | `16` (`1.28×`) | `0pt` | `Pill`, `CountBadge`, `ViewAllLink`, `SegmentTabs` (`500` inactive, `600` selected) |
| `labelSmall` | `Inter_500Medium` | `500` | `11.5` | `16` (`1.39×`) | `0pt` | Captions, timestamps, bottom tab labels (`maxFontSizeMultiplier={1.15}`) |

### 2.4 Spacing, Radii, Hairline/Elevation & Touch Targets
- **Spacing Scale (`4pt` base):** `xxs: 2`, `xs: 4`, `sm: 8`, `md: 12`, `lg: 16` (phone horizontal page gutter), `xl: 20` (card padding on phone; `24pt` on tablet `>=768pt`), `2xl: 24` (section gap), `3xl: 32`.
- **Concentric Radii (`outer = inner + padding`):** `sheet: 24`, `card: 20` ([`sleekTheme.tsx:98`](file:///C:/dev/worktrees/ct-mobile-mirror/frontend_web/src/theme/sleekTheme.tsx#L98)), `banner: 20`, `nested: 14` (`SegmentTabs` active pill, inner skeleton card [`DashboardContentState.tsx:70`](file:///C:/dev/worktrees/ct-mobile-mirror/frontend_web/src/components/dashboard/DashboardContentState.tsx#L70)), `control: 12` (buttons, inputs, `IconTile >=40pt`), `tileSm: 9` (`IconTile <40pt`), `pill: 999`.
- **Hairline & Elevation Rule:** All cards (`SectionCard`, `MetricStrip`, shift/row cards) are **flat** (`elevation: 0`, `shadowOpacity: 0`, `borderWidth: 1`, `borderColor: tokens.border`). Internal list separators (`StatList`, `ActivityList`) use `StyleSheet.hairlineWidth` with `tokens.border`. Shadows are restricted to **floating surfaces** (Dialogs, BottomSheets, sticky CTA bars): `shadowColor: '#06123A'`, `shadowOffset: { width: 0, height: 12 }`, `shadowOpacity: 0.14`, `shadowRadius: 24`, `elevation: 8`.
- **Touch Targets:** Minimum `44×44pt` (iOS) / `48×48dp` (Android) with `>=8pt` separation. Small visual glyphs (`15–20pt`) expand via `hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}`.

---

## 3. Component Kit Specifications (`frontend_mobile/components/ui/`)

All icons use `lucide-react-native` with `strokeWidth={1.75}` (`2` inside `12pt` `Pill`s).

| Component (Web Twin) | Anatomy & Sizes | Interactive & Data States (Pressed / Disabled / Loading / Error) |
|---|---|---|
| **`IconTile`** ([`IconTile.tsx:13`](file:///C:/dev/worktrees/ct-mobile-mirror/frontend_web/src/components/ui/IconTile.tsx#L13)) | Tinted square `View` (`importantForAccessibility="no-hide-descendants"`). `tone`: `'violet' \| 'blue' \| 'cyan' \| 'magenta'`. Sizes: `44pt` (default, `radius: 12`, glyph `20pt`), `36pt` (shift row, `radius: 9`, glyph `16pt`), `32pt` (`ActivityList`, `radius: 9`, glyph `15pt`). | Decorative only (static). Inherits parent press state when inside an action card or row. |
| **`SectionCard` + `ViewAllLink`** ([`SectionCard.tsx:6,32`](file:///C:/dev/worktrees/ct-mobile-mirror/frontend_web/src/components/ui/SectionCard.tsx#L6)) | `20pt` radius `View`, `1pt` `border`, `surfaceBg`, padding `20pt` (`dense: 16pt`, `flush: 0` body with padded header). Header row: optional `20pt` `accentStrong` Lucide icon + `titleMedium` (`18pt` Outfit 500), `bodySmall` (`13pt`) subtitle below, `action` slot right. `ViewAllLink`: `44pt` min-height `Pressable`, `13pt` Inter 600 `accentStrong` + `16pt` `ArrowRight`. | `ViewAllLink` **Pressed:** `opacity: 0.72`, arrow translates `+2pt` X (`150ms`). **Disabled:** `textMuted`, no arrow shift. |
| **`Pill` & `CountBadge`** ([`Pill.tsx:8,46`](file:///C:/dev/worktrees/ct-mobile-mirror/frontend_web/src/components/ui/Pill.tsx#L8)) | `Pill`: `minHeight: 24`, `px: 8`, `radius: 999`, `12pt` Inter 600, `numberOfLines={1}`, optional `13pt` leading icon (`strokeWidth: 2`). Tones: `StatusTone` (`violet`, `blue`, `cyan`, `magenta`, `green`, `amber`, `red`, `neutral`, `navy`). `outlined`: `surfaceBg` + `1pt` `border` + `textPrimary`. `CountBadge`: `minWidth: 24`, `height: 24`, `px: 6`, `tabular-nums`. | Display-only unless wrapped in filter chip `Pressable` (where `minHeight: 36` + `hitSlop: 6`, pressed `scale: 0.96`). |
| **`Hint` & `InfoHint`** ([`Hint.tsx:8,26`](file:///C:/dev/worktrees/ct-mobile-mirror/frontend_web/src/components/ui/Hint.tsx#L8)) | **Native adaptation (no hover on phones):** `InfoHint` renders a `16pt` Lucide `Info` icon in `textMuted` inside a `44×44pt` hit target (`accessibilityRole="button"`, `accessibilityLabel={title}`). Tapping opens a compact `BottomSheet` (`24pt` top radius, drag handle, `titleMedium` title, `bodyMedium` explanation, `Done` button). | **Pressed:** icon tints to `accentStrong`, `scale: 0.96`. Dismisses on backdrop tap, swipe down, or Android hardware back. |
| **`MetricStrip`** ([`MetricStrip.tsx:15`](file:///C:/dev/worktrees/ct-mobile-mirror/frontend_web/src/components/ui/MetricStrip.tsx#L15)) | Single `20pt`-radius card split into a `2×2` grid on phones (`4×1` on tablet `>=768pt`) with `1pt` internal `border` hairlines. Each cell (`padding: 16pt`, `gap: 12pt`): `44pt` `IconTile` left + right stack (`12pt` `textSecondary` label, `24pt` Outfit 500 `tabular-nums` value, `11.5pt` `textMuted` caption). | **Pressed (when `onPress` set):** cell background transitions to `pressBg`. **Loading:** `48×24pt` rounded skeleton bar in place of value. |
| **`StatList`** ([`StatList.tsx:5`](file:///C:/dev/worktrees/ct-mobile-mirror/frontend_web/src/components/ui/StatList.tsx#L5)) | Vertical stack of rows (`paddingVertical: 12pt`) separated by `StyleSheet.hairlineWidth` `border`. Left: `13.5pt` Inter 400 `textSecondary` label. Right: `26pt` Outfit 500 `accentStrong` `tabular-nums` figure. | **Loading:** `32×24pt` shimmer skeleton on the right, keeping row labels visible. |
| **`ActivityList`** ([`ActivityList.tsx:31`](file:///C:/dev/worktrees/ct-mobile-mirror/frontend_web/src/components/ui/ActivityList.tsx#L31)) | Vertical stack with hairline top borders (`index > 0`). Each row (`py: 12pt`, `gap: 12pt`): `32pt` `IconTile` mapped by `kind` (`shift`→`CalendarDays`/violet, `confirmed`→`ShieldCheck`/cyan, `hub`→`MessageSquareText`/blue, `invoice`→`ReceiptText`/magenta, `membership`→`Users`/blue, fallback→`Bell`/violet), center (`13pt` Inter 600 title + `12pt` `textMuted` description), right `11pt` `textMuted` timestamp. | **Pressed (when `onOpen` set):** `pressBg` fill (`radius: 10pt`). Static `View` when `onOpen` is null. |
| **`PageHeader`** ([`PageHeader.tsx:8`](file:///C:/dev/worktrees/ct-mobile-mirror/frontend_web/src/components/ui/PageHeader.tsx#L8)) | Used on every inner screen (overviews use `BrandBanner`). Title: `26pt` Outfit 500 `textPrimary`. Subtitle: `15pt` Inter 400 `textSecondary` (`mt: 6pt`). Actions row (`mt: 12pt` on phone or right-aligned when single compact button). Optional `children` slot (`mt: 16pt`) for `SegmentTabs`. | Action buttons follow standard `44pt` height, `12pt` radius, `scale: 0.96` press feedback. |
| **`SegmentTabs`** ([`SegmentTabs.tsx:19`](file:///C:/dev/worktrees/ct-mobile-mirror/frontend_web/src/components/ui/SegmentTabs.tsx#L19)) | `20pt` radius container (`surfaceBg`, `1pt` `border`, `padding: 6pt`). Tabs (`2–5` items): `minHeight: 44pt`, `radius: 14pt`, optional `16pt` leading icon + `12.5pt` label (`500` inactive `textSecondary` with `1pt` `border`; `600` selected `accentStrong` on `tone.violet.bg` with transparent border). For `4–5` long labels on `<390pt` phones, set `mobileWrap` (`2–3` per row, never horizontal scroll). | **Pressed:** `scale: 0.98`, `pressBg`. Announces `accessibilityRole="tab"` and `accessibilityState={{ selected }}`. |
| **`ConfirmDialog`** ([`ConfirmDialog.tsx:5`](file:///C:/dev/worktrees/ct-mobile-mirror/frontend_web/src/components/ui/ConfirmDialog.tsx#L5)) | Centered modal (`20pt` radius, `elevatedBg`, `maxWidth: 380pt`, navy-tinted shadow). Title: `20pt` Outfit 600. Body: `15pt` Inter 400 `textSecondary`. Footer (`gap: 10pt`): `Cancel` (text/outlined `44pt`) + Confirm (`44pt` contained `status.red.solid` if `destructive`, else `primary`). | **Loading (`busy=true`):** locks backdrop/back dismissal, disables both buttons, swaps confirm label to `busyLabel` with `16pt` spinner. |
| **`InitialsAvatar`** ([`InitialsAvatar.tsx:15`](file:///C:/dev/worktrees/ct-mobile-mirror/frontend_web/src/components/ui/InitialsAvatar.tsx#L15)) | Circle (`size: 34pt` default, `40pt` in rows, `radius: 999`) using `toneColors(tone)` (`violet` default, never low-contrast grey [`sleekTheme.tsx:290`](file:///C:/dev/worktrees/ct-mobile-mirror/frontend_web/src/theme/sleekTheme.tsx#L290)). Displays 2 uppercase initials (`size * 0.36`, Inter 600) or Lucide `EyeOff` (`size * 0.45`) on `neutral` tone when `anonymous={true}`. When a photo URL exists, render `expo-image` with `1pt` `rgba(0,0,0,0.08)` inner ring. | Static decorative (`accessibilityElementsHidden={true}`). |
| **`CandidateRow`** ([`DESIGN_DECISIONS.md:133-137,545-555`](file:///C:/dev/worktrees/ct-mobile-mirror/docs/frontend/DESIGN_DECISIONS.md#L133-L137)) | Flat `14pt`-radius row card (`1pt` `border`, `p: 12pt`, `gap: 12pt`). Left: `InitialsAvatar` (`40pt`, `anonymous` until revealed on platform interest). Middle: Name (or *"Platform candidate"*), role `Pill` + *"via {audience}"* (`12pt` `textMuted`), counter-offer / rating badge. Bottom/Right: action buttons (*Reveal profile*, *Review offer*, *Assign to this date*). Never displays raw email/phone on unbooked rows. | **Pressed:** `pressBg`. **Loading (revealing/assigning):** inline spinner on the triggered button, row locked (`disabled`). **Error:** inline `status.red` banner with retry. |
| **`ContentState`** ([`DashboardContentState.tsx:34`](file:///C:/dev/worktrees/ct-mobile-mirror/frontend_web/src/components/dashboard/DashboardContentState.tsx#L34)) | `20pt`-radius card (`1pt` `border`, `p: 24pt`). Supports `kind: 'loading' \| 'empty' \| 'error' \| 'offline' \| 'forbidden'`. Non-loading states center a `56×56pt` (`16pt` radius) tinted tile (`tone.violet` for empty, `status.amber` for offline, `status.red` for error/403) with a `26pt` Lucide icon (`Inbox`, `SearchX`, `WifiOff`, `ShieldAlert`, `AlertCircle`), `19pt` Outfit 500 title, `14pt` `textSecondary` description, and `44pt` CTA button. | **Loading (`kind='loading'`):** renders 3 (`2` if `compact`) `14pt`-radius skeleton rows (`44×44pt` tile + `45%` and `75%` text bars) inside the card — never a bare spinner. |

---

## 4. Native Shell Architecture

- **Top App Header (`56pt` + top safe area inset, `surfaceBg`, `1pt` bottom `border`):**
  - **Root tab screens:** Left shows active **Persona / Admin pill** (tapping opens the *Switch workspace* `BottomSheet` if user has multiple personas/admin assignments) + **Pharmacy scope pill** (`Store` icon + pharmacy name or *"All pharmacies"*, tapping opens the *Select pharmacy* `BottomSheet`, replacing inline dashboard clutter at [`dashboard.tsx:173-182`](file:///C:/dev/worktrees/ct-mobile-mirror/frontend_mobile/roles/owner/dashboard.tsx#L173-L182)). Right shows **Notifications** (`44×44pt` `Bell` + magenta `CountBadge`) and **Profile `InitialsAvatar`** (`34pt`).
  - **Inner pushed screens:** Left shows `44×44pt` `ChevronLeft` back button (`accessibilityLabel="Go back"`), center/left `16pt` Outfit 500 screen title (`numberOfLines={1}`), right contextual action.
- **Bottom Tab Bar (`5` tabs max per persona, `60pt` + bottom safe area inset, `surfaceBg`, `1pt` top `border`):**
  - **Owner / Org / Admin:** `Home` (`LayoutDashboard`), `Shifts` (`CalendarClock`), `Roster` (`CalendarDays`), `Chat` (`MessageSquare`), `More` (`Menu`).
  - **Pharmacist / Other Staff:** `Home` (`LayoutDashboard`), `Shifts` (`Briefcase`), `Roster` (`CalendarDays`), `Availability` (`Clock`), `More` (`Menu`).
  - **Explorer:** `Home` (`Compass`), `Jobs` (`Briefcase`), `Talent` (`Sparkles`), `Hub` (`Users`), `More` (`Menu`).
  - **Active style:** Selected tab uses `accentStrong` (`#3C18A8`) icon (`22pt`, `strokeWidth: 2`) inside a `56×30pt` pill highlight (`tone.violet.bg` `#EFE9FD`, `radius: 999`) + `11.5pt` Inter 600 label (`accentStrong`). Inactive tabs use `textSecondary` (`#5E6B8D`), `strokeWidth: 1.75`, Inter 500.
- **The `More` Screen:** Full tab screen (not a modal) rendering `SectionCard` groups matching web's exact sidebar groups and wording ([`DESIGN_DECISIONS.md:51-52`](file:///C:/dev/worktrees/ct-mobile-mirror/docs/frontend/DESIGN_DECISIONS.md#L51-L52)): *Workspace*, *Pharmacy operations*, *Shifts & finance*, *Discover*, *Mobile tools* (Clock/PIN/BAS/Marketplace), and *Account* (Profile, Subscription, Sign out).
- **Surface Routing Rule (Sheets vs Full Screens vs Dialogs):**
  - **Bottom Sheets (`BottomSheet`):** `Hint` explanations, Pharmacy/Persona switchers, Board Filters (with sticky *"Show N results"* footer), and quick action menus.
  - **Full Pushed Screens (`Stack`):** Multi-step workflows (Post Shift 5 steps, Invoice Composer, Onboarding), detail views (Pharmacy Detail tabs, Shift Detail, Chat Thread, Revealed Candidate Profile).
  - **Dialogs (`ConfirmDialog`):** Consequential/destructive confirmations only (*Delete shift?*, *Leave pharmacy?*, *Lock period?*, *Discard changes?*).
- **Android Back & Safe Areas:** Root `_layout.tsx` must not hardcode `#FFFFFF` or strip top/bottom edges improperly ([`_layout.tsx:453`](file:///C:/dev/worktrees/ct-mobile-mirror/frontend_mobile/app/_layout.tsx#L453)); headers own `edges={['top']}`, tab bar owns `edges={['bottom']}`, pushed screens with sticky footers pad by `useSafeAreaInsets().bottom + 12`. Android hardware/predictive back closes open sheets/dialogs first, then pops the stack, or asks `ConfirmDialog` when `UnsavedChangesRegistry` is dirty.

---

## 5. Motion, Feel & Haptics (`react-native-reanimated` + `expo-haptics`)

Map `transitions-dev` tokens ([`transitions-dev/SKILL.md:137-184`](file:///C:/Users/semse/.agents/skills/transitions-dev/SKILL.md#L137-L184)) and `make-interfaces-feel-better` rules ([`make-interfaces-feel-better/SKILL.md:37-99`](file:///C:/Users/semse/.agents/skills/make-interfaces-feel-better/SKILL.md#L37-L99)) to UI-thread Reanimated worklets:

- **Motion Tokens (`constants/motion.ts`):**
  - Durations: `stagger: 40ms`, `micro: 80ms`, `quick: 150ms` (sheet/dialog close, press release), `fast: 250ms` (dialog/sheet open, tab pill slide, icon swap), `medium: 350ms` (panel close), `slow: 400ms` (skeleton cross-fade reveal).
  - Easings: `smoothOut: Easing.bezier(0.22, 1, 0.36, 1)` (sheets, modals, layout), `inOut: Easing.inOut(Easing.ease)` (skeletons, swaps), `springTight: { damping: 24, stiffness: 280, mass: 0.9 }` (press scale, tab indicator).
- **Press Feedback:** Replace `TouchableOpacity` with a shared `ScalePressable`: on `onPressIn`, animate `scale` to **`0.96`** (`100ms` `smoothOut`, never `<0.95` per `make-interfaces-feel-better` §12) + background `pressBg`; on `onPressOut`, spring back to `1`.
- **Haptics Matrix (`expo-haptics`):**
  - `Haptics.selectionAsync()`: SegmentTab switch, filter chip toggle, pharmacy/persona switch, stepper `−/+`.
  - `Haptics.impactAsync(ImpactFeedbackStyle.Light)`: Pull-to-refresh threshold, chat reaction tap, copy BSB/account number.
  - `Haptics.impactAsync(ImpactFeedbackStyle.Medium)`: Primary workflow CTA (*Post shift*, *Clock in/out*, *Reveal candidate*).
  - `Haptics.notificationAsync(NotificationFeedbackType.Success | Warning | Error)`: Shift booked / timesheet approved / invoice saved (`Success`), destructive dialog open (`Warning`), form validation / PIN mismatch + `6pt` horizontal error shake (`12-error-state-shake`, `Error`).
- **Transitions, Lists & Skeletons:** Pushed screens use native platform slide (`ios_from_right` / Android fade-from-bottom); sheets enter at `250ms` `smoothOut` and exit faster at `150ms` `quick`. First-load overview cards may stagger once (`40ms` per item, `translateY: 8 -> 0`, `opacity: 0 -> 1`); high-frequency lists (shifts, chat, notifications) render immediately without stagger (`initial={false}`). Skeletons pulse opacity `0.45 ↔ 0.9` (`1100ms` linear loop) and cross-fade (`250ms`) into content.
- **Reduced Motion (`useReducedMotion()`):** Disable all scale/translate/shake/shimmer loops; replace slides with `120ms` opacity cross-fades and keep static colour/border state changes intact.

---

## 6. Signature Moves & Codebase Anti-Patterns to Eliminate

### 5 Signature ChemistTasker Moves
1. **The Brand Welcome & Pill Panel (`BrandBanner`):** Overview screens open with the signature deep-navy-to-violet gradient (`#02184B → #1F1777 → #3A1BA6 → #0280D6`, [`BrandBanner.tsx:11`](file:///C:/dev/worktrees/ct-mobile-mirror/frontend_web/src/components/ui/BrandBanner.tsx#L11)) pairing the Outfit greeting, crisp white primary CTA, and translucent pill-balance glass card (`tabular-nums`).
2. **Flat `20pt` Hairline Architecture + 4-Tone `IconTile`s:** Zero card drop-shadows; every surface is structured by `#E5ECF7` `1pt` borders and punctuated by `44pt` violet/blue/cyan/magenta `IconTile`s.
3. **The ChemistTasker Bottle & Duotone Skill Grammar:** Platform escalation steps and badges use the ChemistTasker bottle mark ([`DESIGN_DECISIONS.md:128`](file:///C:/dev/worktrees/ct-mobile-mirror/docs/frontend/DESIGN_DECISIONS.md#L128)), and onboarding/talent cards render the custom duotone skill symbols (`#06214A` ink over violet/cyan/magenta/blue fills, [`DESIGN_DECISIONS.md:599-614`](file:///C:/dev/worktrees/ct-mobile-mirror/docs/frontend/DESIGN_DECISIONS.md#L599-L614)).
4. **Shift Centre Slot & Audience Clarity:** Multi-date shifts display readable slot pills (*1 interested · 3 no reply*, *New activity*) and split candidates into *ChemistTasker platform* (anonymous `EyeOff` avatar until revealed) vs *Your network* ([`DESIGN_DECISIONS.md:130-137`](file:///C:/dev/worktrees/ct-mobile-mirror/docs/frontend/DESIGN_DECISIONS.md#L130-L137)).
5. **Tap-to-Explain `InfoHint` Bottom Sheets:** Complex pharmacy rules (award classifications, cover types, candidate reveal privacy, period health checks) never clutter cards or rely on desktop hover — a tap on `InfoHint` opens a crisp 2-line native sheet.

### 10 Anti-Patterns to Ban (from Current Mobile Code)
1. **Off-brand Indigo `#6366F1` & template hexes:** Remove `#6366F1` ([`theme.ts:13`](file:///C:/dev/worktrees/ct-mobile-mirror/frontend_mobile/constants/theme.ts#L13), [`ParityUI.tsx:8`](file:///C:/dev/worktrees/ct-mobile-mirror/frontend_mobile/features/parity/ParityUI.tsx#L8), [`owner/_layout.tsx:296`](file:///C:/dev/worktrees/ct-mobile-mirror/frontend_mobile/app/owner/_layout.tsx#L296)), MUI blue `#1976d2` ([`welcome.tsx:71`](file:///C:/dev/worktrees/ct-mobile-mirror/frontend_mobile/app/welcome.tsx#L71)), and Expo template `#0a7ea4` ([`Colors.ts:6`](file:///C:/dev/worktrees/ct-mobile-mirror/frontend_mobile/constants/Colors.ts#L6)).
2. **Low-contrast persona text on light surfaces:** Never use raw `#0EA5E9`, `#22C55E`, or `#F97316` ([`theme.ts:34-36`](file:///C:/dev/worktrees/ct-mobile-mirror/frontend_mobile/constants/theme.ts#L34-L36)) for text/icons; always use `persona.textAA`.
3. **Perpetual ambient background animations:** Delete the 7s/9s floating teal `#00a99d` network nodes and `#a5b4fc`/`#fbbf24` blobs in [`AuthLayout.tsx:29-98,153-200`](file:///C:/dev/worktrees/ct-mobile-mirror/frontend_mobile/components/AuthLayout.tsx#L29-L98).
4. **3D shadows, rotated stripes & raster clipart on cards:** Remove `elevation: 3–8` card shadows, rotated white stripe views (`heroAngleOne`/`Two`), and `drugs.png` clipart in [`dashboard.tsx:218-246,384-415,466-475`](file:///C:/dev/worktrees/ct-mobile-mirror/frontend_mobile/roles/owner/dashboard.tsx#L218-L246).
5. **`<IconButton>` inside `tabBarIcon` or static cards:** [`owner/_layout.tsx:368-443`](file:///C:/dev/worktrees/ct-mobile-mirror/frontend_mobile/app/owner/_layout.tsx#L368-L443) and [`dashboard.tsx:272,307,317`](file:///C:/dev/worktrees/ct-mobile-mirror/frontend_mobile/roles/owner/dashboard.tsx#L272) nest interactive Paper `IconButton`s inside tabs/rows. Render Lucide SVG icons directly.
6. **Triple-duplicated navigation on Home:** [`owner/_layout.tsx:66-82`](file:///C:/dev/worktrees/ct-mobile-mirror/frontend_mobile/app/owner/_layout.tsx#L66-L82) (Modal menu) + [`dashboard.tsx:128-140,251-253,304-359`](file:///C:/dev/worktrees/ct-mobile-mirror/frontend_mobile/roles/owner/dashboard.tsx#L128-L140) (`HomeNavigationGrid`, `ParityToolsCard`, bottom settings list) repeat the same links 3–4 times.
7. **Synthetic font weights `700`–`900` & system Roboto:** Replace `fontWeight: '900'` ([`dashboard.tsx:424`](file:///C:/dev/worktrees/ct-mobile-mirror/frontend_mobile/roles/owner/dashboard.tsx#L424)) and `'800'`/`'700'` ([`ParityUI.tsx:119,261`](file:///C:/dev/worktrees/ct-mobile-mirror/frontend_mobile/features/parity/ParityUI.tsx#L119)) with loaded `Outfit_500Medium`/`600SemiBold` and `Inter_400Regular`/`500Medium`/`600SemiBold`.
8. **Static top-level `Dimensions.get('window')` math:** [`dashboard.tsx:24,489`](file:///C:/dev/worktrees/ct-mobile-mirror/frontend_mobile/roles/owner/dashboard.tsx#L24) computes card widths once at import time, breaking on rotation/foldables. Use Flexbox or `useWindowDimensions()`.
9. **Full-screen spinner blanking:** Replace `<ActivityIndicator size="large" />` in [`ParityUI.tsx:74`](file:///C:/dev/worktrees/ct-mobile-mirror/frontend_mobile/features/parity/ParityUI.tsx#L74) with `ContentState` (`kind="loading"`).
10. **Blank white screen on ErrorBoundary crash:** [`_layout.tsx:75-88`](file:///C:/dev/worktrees/ct-mobile-mirror/frontend_mobile/app/_layout.tsx#L75-L88) renders an empty `<Stack>` inside `ErrorBoundary` when `hasError` is true. Render `ContentState` (`kind="error"`, *Restart app* action).

---

## 7. Launch Priority & Top 3 Visual Problems Now

### Launch Priority (by User Impact)
1. **P0 — Foundation + Shell (Phase 2):** `tokens.ts`, Outfit/Inter font loading, Lucide icons, `components/ui/*` kit, unified header + 5-tab bar + `More` screen, `ParityPage` re-skin (instantly upgrades all parity screens).
2. **P1 — W1 Auth & Onboarding:** `welcome.tsx`, `login.tsx`, `AuthLayout.tsx`, OTP/mobile-verify, persona onboarding, and replacing Expo's placeholder `assets/images/icon.png` ([`BRAND.md:14`](file:///C:/ChemistTasker_Ezy/brand/BRAND.md#L14)).
3. **P2 — W3 Shifts (Core Revenue & Daily Loop):** Shift Centre (Active/Confirmed/History + `CandidateRow` reveal), Post Shift 5-step wizard, Worker Shift Boards & Detail.
4. **P3 — W2 Persona Overviews:** Owner, Pharmacist, Other Staff, Org, Admin, Explorer dashboards using `BrandBanner` + `MetricStrip` + `SectionCard`.
5. **P4 — W4 & W5 Operations, Roster & Attendance:** My Pharmacies/Detail, Roster, Clock/PIN, Attendance Approvals, Timesheets, Leave.
6. **P5 — W6 & W7 Finance, Hub/Chat & Mobile-Only:** Invoices/Finance workspace, Talent Board, Chat, Hub, Marketplace/BAS restyle.

### Top 3 Visual Problems in Current Mobile Code
1. **Fragmented, off-brand visual identity on first impression:** [`welcome.tsx:13-20,68-75`](file:///C:/dev/worktrees/ct-mobile-mirror/frontend_mobile/app/welcome.tsx#L13-L20) has no logo and uses Material `#1976d2` text on white, while [`AuthLayout.tsx:84-98,153-200`](file:///C:/dev/worktrees/ct-mobile-mirror/frontend_mobile/components/AuthLayout.tsx#L84-L98) wraps [`login.tsx:148`](file:///C:/dev/worktrees/ct-mobile-mirror/frontend_mobile/app/login.tsx#L148) in floating teal `#00a99d` network lines and yellow/indigo blobs.
2. **Cluttered, non-native Owner Shell & Dashboard:** [`owner/_layout.tsx:66-82,296-445`](file:///C:/dev/worktrees/ct-mobile-mirror/frontend_mobile/app/owner/_layout.tsx#L66-L82) mixes a centered modal "sidebar", a `-20pt` protruding `#6366F1` FAB tab, and `IconButton`s inside tabs, while [`dashboard.tsx:173-256,304-430`](file:///C:/dev/worktrees/ct-mobile-mirror/frontend_mobile/roles/owner/dashboard.tsx#L173-L256) stacks inline scope switchers, a `#267DB8→#9A087D` gradient with `drugs.png` clipart, and three redundant navigation lists.
3. **`ParityUI` scaffolding looks like an unstyled admin wireframe:** [`ParityUI.tsx:7-23,49-76,255-284`](file:///C:/dev/worktrees/ct-mobile-mirror/frontend_mobile/features/parity/ParityUI.tsx#L7-L23) hardcodes Tailwind `#6366F1`/`#F9FAFB`, `12pt` cards, weight `700`/`800` Roboto headers, and bare spinner loading states across dozens of operational screens.

---

## Summary for the orchestrator
- **Verdict:** Keep Phase 2 token/font/Lucide architecture; add `BrandBanner`, `CountBadge`, and `BottomSheet` to the Phase 2 kit; replace the modal sidebar + protruding centre tab with a standard 5-tab bar (`More` as tab 5); swap Wave 3 (Shifts) ahead of Wave 2 (Overviews).
- **Tokens & Type:** Exact web `--ct-*` light + dark hexes locked in `tokens.ts`, Outfit 500/600 + Inter 400/500/600 pt scale (`maxFontSizeMultiplier` caps on badges/figures), `20pt` flat `1pt`-bordered cards, and AA-verified persona text shades (`5.18:1` to `11.12:1` on `#FFFFFF`).
- **Kit & Motion:** All 13+3 kit components specified with anatomy, sizes, states, and Reanimated + `expo-haptics` tokens (`0.96` press scale, `150ms`/`250ms` sheet physics, skeleton-first loading).
- **Immediate Impact:** Upgrading `ParityPage` and the Shell in Phase 2 plus W1→W3→W2 eliminates the top 3 visual defects before store binary cut.

## Notes for the next agent
- Changed: Phase 2 kit adds `BrandBanner`, `CountBadge`, and `BottomSheet`; Wave 3 (Shifts) runs before Wave 2 (Overviews).
- Decided: Bottom tab bar has max 5 flat tabs with `More` as tab 5; delete the modal sidebar in `owner/_layout.tsx:66-82` and protruding centre button in `owner/_layout.tsx:400-410`.
- Decided: Persona `accentFill` stays for fills, while text/icons must use `persona.textAA` (`#3C18A8`, `#0369A1`, `#17663A`, `#C2410C`, `#4338CA` — all `>=5.18:1` on `#FFFFFF`).
- Decided: Cards use `20pt` radius, `1pt` `#E5ECF7` border, and `0` elevation; shadows (`#06123A` tint) are allowed only on dialogs, sheets, and sticky bars.
- Left: `C:\ChemistTasker_Ezy\brand\logo` is currently an empty folder and `BRAND.md` has TODOs; source the official logo from `frontend_web/public/assets/official-logo.png` and replace mobile's placeholder `assets/images/icon.png`.
- Trap: `owner/_layout.tsx:368-443` and `dashboard.tsx:272` nest Paper `<IconButton>` inside tabs/cards — replace with direct `lucide-react-native` icons (`strokeWidth={1.75}`) so hit targets and accessibility roles don't collide.
- Trap: `_layout.tsx:75-88` `ErrorBoundary` renders an empty `<Stack>` on crash (white screen), and `_layout.tsx:453` applies only `edges={['left', 'right']}` while `OfflineBanner.tsx:13` lacks top safe-area padding.