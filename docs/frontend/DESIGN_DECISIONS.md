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

## Findings logged while implementing (not visual)

- Fixed: the owner overview requested `pharmacy_id=0` (403) before the scope was known (`25381b6`).
- Open: one owner overview load requests `/dashboard/owner/` four times and `/pharmacies/` four times; worth a
  data-flow pass later.
