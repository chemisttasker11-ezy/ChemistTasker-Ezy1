# Dashboard design decisions (Figma → Vite)

**Principle (owner, 2026-10-10): the Figma is a reference, not a bible.** Choose the best treatment per
element, then apply it uniformly across every page.

Running log of what was taken from the Figma files, what was left out, and why. Newest decisions are appended
per area. Business logic, routes, permissions and API contracts are never changed for a visual reason; when a
Figma screen reflects older behaviour, the current product wins and the Figma *styling* is applied to it.

## Sources and authority

| Source | Role |
| --- | --- |
| Figma `ChemistTasker-Dashboard (Copy)` — `m4xv4a7c2wruhlYK4RyCXe` (copy of prototype `9azyw1oO…`) | **Visual authority for the authenticated Vite app.** 51 sections / ~640 frames: onboarding, shell, overviews, shifts, calendar, chat, hub, talent, pills, Post Shift, Shift Centre, pharmacies, roster, invoices, invite staff, availability, memberships. |
| Figma `t32C9hNvsDdQ4wzUKVJx9O` (used by PR #156/#157) | Earlier draft (placeholder icons, overlapping text, route labels on screen). Gap-filler only. |
| Figma `next` — `RxH01Q8h3oN6QhKEWCVWfl` | Public Next site states and responsive frames (landing, auth & public, hub & legal). |
| `landing_lightweight-handoff` | Brand identity: navy `#06214A`, violet `#5222B8`, magenta, cyan, blue; Outfit + Inter. |
| ChemistTasker UX & Frontend Handbook 2026 | Behaviour rules: state matrix, definition of done, persona/scope/billing authority. |
| Current repository (PR #155 logic) | Business truth. Wins over any Figma screen that shows older behaviour. |

The Figma frames are flattened vector exports (absolute positions, no auto-layout or variables). Values are
measured from the frames (`get_design_context` + sampled pixels) and rebuilt with MUI + shared components —
never pasted as generated markup.

## Global decisions

1. **Type.** Owner decision: only Inter 400/500/600 and Outfit 500/600 load (as main's Next site). Figma sets
   headings in Outfit 400; we use Outfit 500, the nearest approved face. Body/UI text Inter 400 with 600 for
   emphasis (Figma "Bold" → 600).
2. **Colour.** Figma navy `#001848` ≈ brand navy `#06214A`: the brand value is kept so Next and Vite match.
   Figma's deep violet `#3C18A8` is adopted for active items, figures and links (`--ct-accent-strong`); brand
   violet `#5222B8` stays the button colour. Figma secondary text `#4A5878`/`#7886A3` map to
   `--ct-text-secondary` / new `--ct-text-muted`.
3. **Tinted tiles.** Figma's four icon-tile tones (violet, blue, cyan, magenta) become theme variables
   `--ct-tone-*-bg/fg` with dark-mode values; the foreground shades are Figma's darker, AA-legible ones.
4. **Icons.** Lucide outline icons (stroke 1.75) everywhere, the same library and version as the Next site —
   one icon family across web. Navigation icons are chosen per item title (Figma), not per old MUI symbol
   (the same MUI icon used to stand for Chat, Overview and Community Shifts). Verification status badges
   keep their MUI glyphs until the profile area is redesigned.
5. **Cards.** 20px radius, hairline border, no shadow (`--ct-card-radius`), Outfit 18px titles with an outline
   icon (`SectionCard`). "View all →" links in bold deep violet (`ViewAllLink`).
6. **Design annotations are not product.** Figma's "ILLUSTRATIVE · sample data, not real" badges, placeholder
   copy and sample figures are never shipped.
7. **Shared components** live in `frontend_web/src/components/ui/`: `IconTile`, `SectionCard`/`ViewAllLink`,
   `BrandBanner`, `MetricStrip`, `StatList`, `ActivityList`. Pages compose these instead of restyling locally.

## Shell

- **Sidebar** follows Figma: 13px items (regular; active and open groups semibold), 12.5px sub-items with their
  own small icons (replacing dots), 10.5px uppercase group labels, soft violet active row without the accent bar,
  icons without tiles.
- **Kept from #155, not Figma:** the shorter group names ("Workspace", "Pharmacy operations", "Shifts &
  finance", "Discover") — Figma's "Profile Settings" group holds Chat and Calendar, which is misleading.
- **Kept from #155:** header search, the two-row phone header with a reachable pharmacy selector, persona/admin
  switching. Figma has no search; ours is functional and stays.

## Shell (continued)

- **Taken from Figma:** logo at the top of a full-height sidebar with a «/» collapse button; the top bar
  starts right of the sidebar. The old "Navigation" label row is gone. Below 1200px (no sidebar) the logo stays
  in the top bar.
- **Search:** Figma has none. Ours stays, as an icon that opens the search dialog below 1536px and as a 260px
  field above, so the page title and pharmacy selector keep their room beside the sidebar.

## Owner overview

- **Taken:** brand welcome banner (navy → violet → blue, sampled from Figma) with *Post a shift* / *Manage
  pharmacies* and the pill-balance panel; four-metric strip with tinted tiles; icon card titles; violet
  figures; activity rows with tinted icons by activity kind.
- **Kept from #155:** the real upcoming-shift list (sorted by next slot), calendar snapshot, invoice summary and
  workspace tools. Figma only shows counts.
- **Left out:** Figma's 3×3 shortcut grid (Manage Pharmacies, Internal Roster, Post Shift, …). It repeats the
  sidebar; the handbook asks overviews to lead with next actions. Figma's "5 pills per shift post" chip — there
  is no data source for a per-post cost, so it is not invented.
- The page heading is the banner's "Welcome back, {first name}!" (h1); the top bar already names the page.

## Persona overviews (Pharmacist, Other Staff, Explorer, Admin, Organisation)

All five use `DashboardOverviewTemplate`, now built from the shared components:
- Order follows Figma: workspace chip row → welcome banner (pill panel with the real per-post cost) → metric
  strip → content. The metric strip moved up from the bottom of the page.
- **Kept from #155:** "My next shifts" (only shifts the worker engaged with) and "Recommended for you"
  (availability match). Figma shows plain counts; our feeds are the approved logic. They sit full width under
  the metrics.
- Action cards in Figma's quieter style (44px tinted tile, Outfit 16 title, 12.5 description), three across,
  beside the right column (shift counts, recent activity, invoice card in Figma's blue → navy gradient).
- The organisation banner now greets by first name like every other persona.
- Callers' Material icons replaced by Lucide equivalents.

## One theme, one page header (all inner pages)

- **Private themes removed.** Post Shift, Active Shifts (Shift Centre) and the three onboarding layouts each built
  their own MUI theme (off-brand violets `#6D28D9`, a blue `#2563eb` primary in onboarding, a green secondary,
  gradient buttons). Active Shifts also injected Google Fonts at runtime (Inter up to 700), against the
  bundled-fonts rule. All now use the shared theme. Finance keeps a scoped theme for **density only** (small
  fields, compact table rows, tabular figures); its 5–8px corners are gone.
  Out of scope, noted: the kiosk (its own app), the legacy Vite landing/pricing pages (Next owns public pages) and
  the Vite auth layout still carry private themes.
- **Shared theme overrides** (apply to every page): buttons 600 weight / 12px radius / 40–48px; inputs 12px radius,
  quiet border, 1.5px brand focus; tabs no-caps with a 3px deep-violet indicator; chips 600; dialogs 20px radius;
  popovers 14px with a soft shadow; table headers small uppercase on a mist band; alerts 14px; tooltips navy;
  cards flat 20px. Heading weights 500 (Outfit), buttons 600.
- **Page headers:** Figma itself mixes a gradient banner (Shift Centre) with plain headings (everything else).
  Chosen rule: **banners only on overview/home pages; every inner page uses `PageHeader`** (Outfit 32 title,
  15px line, actions right). Applied to Shift Centre, Post Shift, My Pharmacies, Roster, Invoices & finances.
- **Section switches** use one `SegmentTabs` component (Figma Shift Centre pills).
- **Top bar names the page** you are on (the active navigation item); overviews keep the persona dashboard title.
- **Positive actions** that relied on the old private green secondary (review offer, act on interest) use the
  theme's `success` green. The "nice to have" skill toggle uses brand magenta.
- **Cards** in Shift Centre lose their gradient wash and glowing gradient tile; they use the flat card and a
  violet `IconTile`-style tile like everywhere else.
- **Page gutters:** pages no longer add their own outer padding/containers; the shell's gutter is the only one,
  so every page edge lines up.

## Findings logged while implementing (not visual)

- Fixed: the owner overview requested `pharmacy_id=0` (403) before the scope was known (`25381b6`).
- Open: one owner overview load requests `/dashboard/owner/` four times and `/pharmacies/` four times; worth a
  data-flow pass later.

## Shift Centre (Active, Confirmed, History)

- **Card = summary + status bar + details.** Summary: pharmacy, role (navy pill), type, urgency, date, address, three
  metric tiles with hover explanations. Status bar: who can see the shift (*Internal · Favourites* or *Platform ·
  ChemistTasker*), what needs attention (*N waiting for review*, *Payment required*, *New activity*), and an explicit
  *Manage candidates* toggle (`aria-expanded`). The whole card is no longer a `role=button` wrapping other buttons.
- **Audience stepper** grouped under *Your network* and *Platform*; every step says on hover whom it reaches; the
  escalation banner names who will be notified. The ChemistTasker bottle marks the platform everywhere (step, section,
  pills) — owner decision; Figma's sparkle icon not used.
- **Dates (slots):** the unexplained red dot and *Int/Asg/Rej/No* chips are replaced by readable counts
  (*1 interested · 3 no reply*) with hover meanings, *Open/Assigned* state, and a labelled *New activity* marker
  (same rule as before: candidate activity changed since the date was last opened; selecting it clears the marker).
- **Candidates grouped by source:** *ChemistTasker platform* (counter offers, interested; names hidden until revealed)
  and *Your network* (interested, assigned, no reply, rejected). Columns are neutral with a tinted header and a
  one-line meaning; each person shows initials, type and *via {audience}*. Columns size to the card (container
  queries), not the window.
- **States:** skeleton loading, error with *Try again* (the data hook no longer hides failures as "no shifts"), empty
  with *Post a shift*, skeleton while candidates load, escalating state in the banner.
- **Confirmed/History** use the same card; date tiles are flat with the booked person as a row (no box-in-pill).
- Figma left out: the gold gradient *Buzz* (now a soft amber reminder button), coloured full-bleed status columns.

## Contrast (whole app)

- Theme radius scale back to MUI's 4px: sx `borderRadius: 3` had become 42px, which produced pill-inside-box shapes.
- Text-button colour moved to a theme variant; the old nested selector out-ranked component styles and hid labels.
- AA values: muted text `#63708C`, success `#117A50`, warning `#A15C07`, info `#0369A1`, magenta `#C000B4`,
  status tones `--ct-status-{green,amber,red}`; brand text variants `blueText`, `successText`, `mintText`.
- Invoices rendered in MUI's default blue/orange: the finance density theme re-derived the palette. It now layers
  density onto the dashboard theme with a function theme.
- Default letter avatars use the violet tile tone (grey + white was 2.7:1).
- Sweep: every owner and pharmacist page passes AA text contrast except the calendar's dimmed other-month days
  (inactive, exempt).

## Standard process for every page (owner decision 2026-10-10)

1. Read the page's logic and flows; list what the user must understand and do.
2. Compare with the Figma frames for the page and its states; keep what is better, fix what reflects old logic.
3. Make status, source and the next action obvious; readable counts, no codes; short hover hints (guide, don't explain).
4. All states: loading skeleton, empty with the next action, error with retry, busy/disabled, dialogs.
5. Shared parts only (`ShiftCentreParts`, `IconTile`, `PageHeader`, `DashboardContentState`); AA checked by sweep.
6. Screenshots at 1440 and 390; log decisions here.

## Revision plan (pages already styled, to bring to the standard)

| Order | Area | Known gaps |
| --- | --- | --- |
| 1 | Post Shift (5 steps) | header offset, clipped field label, step states, review summary before posting |
| 2 | Internal roster / timesheets / attendance | cryptic chips (0.0H, codes), draft/publish states, empty week |
| 3 | Worker shift boards (public/community/roster) | card parity with Shift Centre, interest/offer states |
| 4 | My Pharmacies / My Chain / Memberships | card details, empty/error states, invite flows |
| 5 | Invoices list/detail/editor | status pills, empty/error, review actions |
| 6 | Overviews (all personas) | attention items, empty feeds |
| 7 | Chat, Pharmacy Hub, Talent Hub, Calendar, Availability, Onboarding | page headers, states, contrast leftovers |
