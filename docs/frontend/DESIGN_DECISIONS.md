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

## My Chain (2026-10-10)

- `PageHeader` *My chain* (Figma's *Manage Chains* duplicated the top bar); the page's own `Container` removed.
- Chain card: logo or violet `IconTile`, name, contact email; 44px labelled edit/delete buttons with hover hints and
  *Manage pharmacies*. **Delete now asks to confirm** (it deleted on one click before).
- *Staff by pharmacy* shows the pharmacy count; each pharmacy row shows *N staff*. Members show name first, then
  role in plain words · email (was email + raw role code).
- States: shared loading; error with *Try again* (a failed load used to claim "no chain yet"); empty with *Create
  chain* (one action, not a header button plus an empty-state button); no pharmacies with *Add pharmacies*; per
  pharmacy skeleton, *Staff not loaded* + *Try again*, *No staff yet*. All saves show a busy spinner and lock the
  dialog; buttons name their action (*Create chain* / *Save changes*, not *OK*).
- Checked: 1440 and 390 (empty, filled, error, delete dialog); AA sweep 0 failures.

## Memberships (2026-10-10)

- `PageHeader` *Memberships*; one amber pill counts what is *waiting for your answer* (no "N active" pill — the
  cards already say it).
- Cards keep Figma's structure (tile, name + status, role line, address · inviter) on the shared `IconTile`, Lucide
  icons and status-tone `Pill`s with readable labels and hints: *Waiting for you*, *Active*, *Declined*, *Left*
  (was raw *Pending/Accepted/Rejected* chips). Pending invitations sort first and get an amber edge; admin
  invitations use the same card with a shield tile.
- Copy: *Reject* → *Decline*, *Quit membership* → *Leave pharmacy*; the dialog names the pharmacy.
- States: shared loading; error with *Try again* (a failed load used to show an alert *and* "No memberships yet");
  empty explains where invitations come from; refreshes keep the list on screen (`aria-busy`) instead of blanking;
  action errors are dismissible; buttons show a spinner and the leave dialog locks while working. Weights 800–950
  replaced by the 500/600 scale.
- Checked: 1440 and 390 (active, mocked pending/active/left, error, leave dialog); AA sweep 0 failures; smoke test
  *owner CONTACT membership never offers the quit action* updated to the new label and passing.

## Worker roster (2026-10-10)

- Hand-made header (hex colours, weight 750) → `PageHeader` *My roster*, also shown above the loading skeleton.
- No pharmacy: shared empty state pointing to Memberships, and the empty calendar, filter and tabs are no longer
  shown under an info alert.
- *Roster Calendar* → *Pharmacy calendar* (section heading, display font); *Filter by Role* → *Show roles*. The help
  line becomes *No published shifts in this period. Use Next to look ahead.* when the period is empty.
- Error banner copy names the risk (*may be out of date*); *Retry* → *Try again*, kept on one line.
- Hex colours in the tabs and mobile agenda/calendar switch → theme tokens; weights 800 → 600.
- Tried and dropped: opening the calendar at 7 AM — the calendar is a fixed 1600px tall and the page scrolls, so
  `scrollToTime` has no effect.
- Checked: 1440 and 390 (filled, mocked empty, mocked error); AA sweep 0 failures.
- **Finding (not fixed, routing):** the top bar says *Shift Centre* on the worker roster when it is opened from the
  platform workspace (e.g. the overview's *My Roster* shortcut). *My Roster* only exists in the internal workspace
  menu, so the shell falls back to the parent item. Fix = switch to the internal workspace when opening the roster
  (owner decision: routes unchanged for now).

## Worker attendance (2026-10-10)

- `PageHeader` *My attendance*; the page's own 860px centred box (offset from every other page) removed.
- Desktop layout: clock-in status (wide) beside the kiosk PIN card; *Published shifts* below as a plain section
  (heading + rows), so empty/error states are not cards inside cards. Mobile stacks.
- Flat cards on theme tokens (were elevation shadows and Tailwind hexes; PIN used off-brand `#a855f7`), `IconTile`s,
  Lucide icons. Status as one `Pill` (*Clocked in*, *On break*, *Not clocked in*) instead of a title plus an
  all-caps chip. Shift timer in the display face with tabular figures (was a monospace costume at 800).
- Published shifts: plain date tile, pharmacy, role pill in words, *Acknowledged* / *Not acknowledged*. One
  *Acknowledge week* button per published week (it acknowledges the whole period; it repeated on every shift) with a
  hover hint. The header pill counts only what needs acknowledging.
- States: loading; **status error** (*We couldn't check whether you're clocked in*) — a failed load used to say *Not
  clocked in*; **shifts error** with *Try again* — a failed load used to say *No published shifts yet*; empty; busy
  spinners on break/clock/acknowledge/PIN; dialogs lock while saving; PIN confirm shows *PINs don't match yet* inline.
- Copy in sentence case: *Scan pharmacy QR*, *Clock in* / *Clock out*, *Kiosk PIN*, *Change PIN*.
- Checked: 1440 and 390 (not clocked in, mocked clocked in + shifts, mocked errors); AA sweep 0 failures; breadth
  tests (QR clock-in success/failure, roster acknowledgement) updated to the new copy and passing.

## Attendance approvals — manager (2026-10-10)

- `PageHeader` *Attendance approvals* (matches the menu); pharmacy picker moved into the header actions and
  renamed *Pharmacy* (was *Destination Pharmacy*); private 1200px centred box removed.
- The six-column table becomes one row card per worker (works at 1440 and 390): initials, name, cover type as a
  plain-words `Pill` with a hint (*Not on the roster*, *Cover from a sister store*, *Cover from your organisation*;
  were raw coloured chips), email · *usually at {home pharmacy}*, date · times · **hours** (or *still clocked in*
  / *In progress*). Actions are labelled: *Clock times* (was an unlabelled 34px icon), *Approve*, *Reject*.
- Section *Waiting for approval* with an *N to review* pill and a *Refresh* button that shows it is working.
- States: loading; **pharmacies error** with retry (a failure was silently swallowed); no pharmacies; **reviews
  error** with retry (a failure showed an alert *and* "No pending shifts"); empty *Nothing to approve*.
- Dialogs: *Approve {name}'s hours?* / *Reject {name}'s hours?*, buttons *Approve hours* / *Reject hours*, spinners
  and locked while saving; the reason field says it is required. *Clock times* dialog: loading and error with retry
  inside the dialog (it used to show the previous worker's data or "No timeline data"), event pills in words,
  *Recorded* vs *Counts as* with a *Corrected* pill (hint = reason) folded into one column so it fits at 390,
  labelled 40px correct buttons, correction form on theme tokens (was hex violets).
- Checked: 1440 and 390 (empty, mocked list, clock-times dialog, error); AA sweep 0 failures; smoke tests
  *Attendance approvals* route and *attendance approval uses existing … contracts* updated and passing.

## Workforce pages in the shell (2026-10-10)

- Timesheets, Leave, Workforce & Payroll, My Hours and My Leave were top-level routes with no dashboard layout, so
  their sidebar links dropped people out of the shell and theme (MUI default look). They now sit under one pathless
  layout route (`SharedDashboardWrapper`: theme + `DashboardTopShell`). URLs and each page's own capability guard are
  unchanged; the delegated-admin redirect in `HubDashboardWrapper` is deliberately not used.

## Timesheets (2026-10-10)

- No Figma frames exist for timesheets; the page follows the Attendance approvals pattern.
- `PageHeader` *Timesheets*; pharmacy picker in the header actions (only when there is more than one); the page's own
  `Container`, hex colours and weight 900 removed.
- Period card: period dates (status as a separate pill, not repeated in the field), *Open current fortnight*,
  *Recalculate* and *Lock period* with hover hints; a locked period shows only *Correct period*. Period health is one
  row of counted pills with hover guidance (*1 timesheet with errors*, *2 checks to review*, *1 leave request
  waiting*, *1 worker still clocked in*, *1 ready to approve*, or *No exceptions*), replacing a stack of five alerts.
- The 9-column table (980px minimum, scrolled sideways on phones, row clickable by mouse only) becomes one keyboard-
  reachable row card per worker: initials, name, status in words (*Needs review*, *Ready to approve*, ...), *Needs
  recalculating*, *Worked 66.5 h · Rostered 76 h · ...*, and *1 error · 1 warning · 2 comments* pills (were raw
  codes, `0.00 h` figures and "0 blocking" chips).
- `window.confirm` / `window.prompt` replaced by dialogs: *Lock {dates}?* and *Correct {dates}?* with a required,
  explained reason; both lock and show a spinner while saving.
- States: pharmacies loading/error/none; periods loading/error; no periods with *Open current fortnight*; timesheets
  loading, error with *Try again*, empty, and *No timesheets match* with *Clear filters*. Refreshes keep the list on
  screen (`aria-busy`). Before, every failure became one alert above an empty table that said "No timesheets".
- Detail drawer (shared with My Hours): status/severity in words (*Error*, *Warning*, *Note*, *Waived*), totals as a
  2/3-column grid, days with worked hours, checks as cards with a severity edge; *Recalculate* labelled (was an
  unlabelled icon); approve button names the hours (*Approve 66.5 h*) and says why it is disabled (*Fix 1 error
  first.*); missing clock-time dialog in plain words; comments show *Managers only*. Busy spinners everywhere, and a
  failed resolve/waive now shows an error (it failed silently). Loading and load-error states with retry.
- Checked: 1440 and 390 (filled, drawer, checks, lock dialog, no periods, load error, empty); AA sweep 0 failures on
  page and drawer; Recalculate contract and the five workforce route checks passing.
- **Finding (not changed):** the drawer offers *Resolve*/*Waive* on checks in worker mode (My Hours) too; the server
  decides whether a worker may do this. Worth hiding for workers once the rule is confirmed.

## Owner billing (2026-10-10)

- No Figma frames exist for billing; built from the system. `PageHeader` per step (*Billing & subscription*, *Set up
  your subscription*, *Staff seats* in seats-only mode) with labelled back buttons; the sticky centred "Back" bar,
  hover-lift shadow cards, off-brand teal `#00a99d` border, all-caps *RECOMMENDED* badge and weights 700–800 removed.
- Plans: two flat cards; *Current plan* is a pill (was a disabled button); the subscription card has the deep-violet
  edge and a *Recommended* pill; prices in the display face; features as a list with check icons. Prices, fees and
  allowances are unchanged word for word in meaning.
- Setup: payment method as two selectable cards (card / invoice, keyboard focus ring), monthly total, and a button
  that says what happens next (*Continue to card payment* / *Subscribe by invoice*) with a spinner beside the label.
- Manage: status pill, *Staff seats 7 (5 included + 2 extra)*, *Renews*, *Monthly total*; the Stripe ID is a small
  *Reference for support* line. Extra seats use a −/+ stepper (44px) with a live total (*$30 base + 3 × $5 · 8 seats
  in total*); the button names the change (*Change to 3 extra seats*) and is disabled until the number changes (it
  used to toast "No seat change detected"). *Refresh* keeps the page on screen and shows a spinner.
- States: loading; **load error** with *Try again* (a failed load used to toast and show the plans as if the owner
  had no subscription); a failed refresh keeps the last details with a dismissible error; the developer-facing
  "make sure your webhook listener is running" warning is now *Your payment details are saved, but the subscription
  isn't active yet* with *Check again*.
- Checked: 1440 and 390 (plans with pending activation, setup, manage, error); AA sweep 0 failures.
- **Finding (not changed):** the top bar reads *Owner Dashboard* on billing because billing is a view of the overview
  route, not a menu item.

## Talent board (2026-10-10)

- **Prior work checked first.** The redesigned filter sidebars from the UI01/UI02 integration branch (PR #155/#156)
  are already on this branch for both the talent and shift boards. The Next public site (`landing_next/migrated`)
  adds a public presentation on top: live result count, a labelled *Filters (N)* button, a drawer footer button and
  `PublicTalentCard`. Taken into the dashboard: the count line, the labelled filters button and the drawer footer.
  Kept: the dashboard `TalentCardV2` (it matches the Figma *Talent Board / Default* frame), the sidebar search
  (Figma puts search in the sidebar).
- `PageHeader` *Find talent* with a live count (*2 profiles match your filters*, `aria-live`); the hand-made h5 at
  weight 700 removed, and the page's own tinted, padded wrapper removed so it lines up with every other page.
- The unlabelled floating "+" (Figma) becomes a header action *Publish your availability* / *Update my pitch*:
  discoverable and named for screen readers. Mobile: *Filters (N)* button instead of an icon-only button; the drawer
  has a display-face title and a sticky *Show N profiles* footer.
- Card: the engagement pill sat in a fixed 320px box, squeezing the headline and pitch to one or two words per line
  at 1440; it now sizes to its content.
- States: error *We couldn't load talent profiles* with *Try again* (showed the raw "Request failed with status
  500"; the count line no longer says "0 profiles" on error); a failed refresh keeps results with a warning and *Try
  again* (was a line of red text); the staff verification note is an info alert with *Verify profile*. Filter chips
  in sentence case (*Open to travel*, *Students & interns*, *Available … to …*); the red *Clear All* chip is a text
  button; pagination is labelled.
- Checked: 1440 and 390 (owner filled, mobile filter drawer, pharmacist with verification note, error); AA sweep 0
  failures; talent route checks and the visual-states audit passing.
- **For the job (shift) boards, later:** the Next copy of `ShiftsBoard` also has public-presentation changes in
  `index.tsx` and `ShiftList.tsx` to review when the worker shift boards are revised.

## Chat (2026-10-10, Messenger-grade pass)

Owner asked for a detailed, elegant chat with the features people expect from Facebook Messenger. Done on the
existing chat API only (rooms, messages, reactions, pins, edit, delete, typing over the websocket); nothing on the
server changed. Figma: *Chat / Conversation*, *Message Hover Actions*, *Error (Send Failed)*, *Mobile Thread*.

- **Look:** own messages in deep violet `#3C18A8` (was an off-brand bright blue `#2f6fec`), others on white with a
  hairline; violet-tone avatars (were grey); magenta unread counts (were blue/red); 20px card radius, no shadow;
  Outfit titles; 500/600 weights only. Dark mode keeps its palette, own bubble brand violet `#5222B8`.
- **Thread:** day separators (*Today*, *Yesterday*, *Monday 6 Oct*); consecutive messages from one person within 5
  minutes are grouped (one name, one avatar, one time, chained corners); emoji-only messages shown large without a
  bubble; links clickable; @mentions highlighted; *New messages* divider; *Start of your conversation* at the top;
  *Loading earlier messages* pill; skeleton bubbles while loading; empty room shows the name, *Say hello* and a
  one-tap *Wave 👋*.
- **Scrolling:** the view follows new messages only when you are already at the bottom (or sent it yourself); otherwise
  a *N new messages* / *Latest messages* button appears. It used to jump to the bottom on every update, pulling you
  away from what you were reading.
- **Header:** avatar, *Group · 3 members* or *Direct message*, live *Priya is typing…*, pin/unpin conversation. The
  pinned message is a violet banner that jumps to the message and has its own unpin button.
- **Message actions:** toolbar beside the bubble (above it on phones) on hover, keyboard focus or tap (was hover-only,
  so unreachable by keyboard or touch): react, copy text, pin/unpin, edit and delete (own) or message privately
  (others). Reactions stay 👍 ❤️ 🔥 💩 because the server only accepts those (`backend/chat/views.py`); chips show
  the count, highlight your own and name who reacted on hover; tapping one toggles it.
- **Red heart:** Inter/Outfit include a text glyph for U+2764, so ❤️ rendered as a black heart. Every emoji now uses a
  colour-emoji font stack first (`EMOJI_FONT`).
- **Edit** happens in the composer with an *Editing message* bar, Enter to save, Esc to cancel (was a dialog).
  **Delete** asks in a dialog that says what others will see (was `window.confirm`).
- **Composer:** rounded field with emoji picker, attach, paste an image, or drop files anywhere on the conversation
  (*Drop files to attach*); image thumbnails and file chips with remove; filled send button with a spinner; Shift+Enter
  for a new line. **A failed send keeps your text** and shows *Message not sent… Try again* (it used to toast and
  clear the box, losing the message). Failed edits and reactions now say so (they failed silently).
- **List:** last-message time (*1:30 AM*, *Yesterday*, *Mon*, *6 Oct*), *You:* prefix, bold unread rows, pin marker;
  rows are real keyboard targets with a labelled options button. Search on its own full-width row (it was squeezed to
  150px). Empty: *No conversations yet* with *Start a conversation* (or what to expect for staff); filters and search
  explain empty results with *Clear search*.
- **Page states:** skeleton list while loading (was a bare spinner); **load error** *We couldn't load your
  conversations* with *Try again* (a failure used to look like an empty inbox); the right panel says *Your messages*
  with *Start a conversation* (was "Welcome to Chemist Tasker Chat", misspelling the brand).
- **Accessibility:** names for the composer, send, attach, emoji, back, list rows and options; the thread is a live
  log; reduced-motion respected for typing dots and shimmer.
- Checked: 1440 and 390 (list, thread, hover toolbar, edit mode, emoji picker, send failure, empty, load error); AA
  sweep 0 failures; all six persona chat route checks pass.
- **Backend follow-ups (not done, need API fields):** reply-to/quote threads, *Seen* receipts (only my own last-read
  time is sent), online presence, a wider reaction set.
