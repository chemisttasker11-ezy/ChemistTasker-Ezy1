# ChemistTasker Frontend UI/UX Standing Rules

This file is a standing implementation rule for ongoing ChemistTasker frontend work.

## Authority order
1. Current `main` product behavior, routes, APIs, permissions, persona logic, and domain contracts remain the functional baseline.
2. The ChemistTasker UX & Frontend Development Handbook is the implementation contract.
3. The current Next public area establishes the visual direction to carry into authenticated dashboards and related frontend surfaces.
4. Figma is the organizing design system for typography, spacing, hierarchy, components, responsive behavior, and states.
5. External design references are selective inputs only; they do not replace superior current product logic.

## UI/UX Pro Max reference
Use the repository's local UI/UX Pro Max skill as an implementation guide:
- Skill: `.agents/skills/ui-ux-pro-max/SKILL.md`
- Apply its priority order: accessibility, touch/interaction, performance, style consistency, responsive layout, typography/color, motion, feedback, and navigation.
- For new or substantially redesigned surfaces, use its design-system approach rather than ad-hoc page styling.

## Impeccable reference
Use the upstream Impeccable guidance as a standing quality reference:
- Repository: https://github.com/pbakaus/impeccable
- Codex skill: https://github.com/pbakaus/impeccable/blob/main/.agents/skills/impeccable/SKILL.md

Apply the principles, not a blind visual copy.

## Shared ChemistTasker typography (Next public and Vite authenticated)
- The public Next.js app is the visual source of truth. Both apps must bundle the same `@fontsource/inter` and `@fontsource/outfit` packages, rather than depending on external Google Fonts availability.
- **Outfit** is the display face for page headings, sections, dialogs and the dashboard navigation title. Prefer weight 600 and a deliberate 1.08-1.2 line height with modest negative letter spacing.
- **Inter** is the functional face for body text, menus, labels, form fields, table data, figures, buttons and helper messages. Use genuine 400, 500, 600 and 700 weights.
- All new web pages should inherit the shared theme/tokens. Do not add an independent Roboto, system-font or Google Fonts heading stack, or apply 900+ synthetic weights to routine labels.
- Confirm text contrast at **4.5:1** for ordinary copy and **3:1** for large text, in both light and dark themes. Theme-sensitive dashboard text must use semantic colour tokens, not fixed navy text on a dark surface.
- Dense operational screens may have smaller secondary metadata where justified, but primary actions and reading text must remain legible at browser zoom and narrow widths.
- Preserve numeric readability with tabular figures where values are compared. Use purposeful headings rather than large bold Inter text styled to imitate Outfit.

## Non-negotiable implementation rules
- Preserve all working links, routes, CTA destinations, handlers, API calls, permissions, and auth-aware behavior unless a product change is explicitly approved.
- Preserve the real ChemistTasker persona/domain model; do not simplify it to fit a mockup.
- Prefer reusable tokens, primitives, and patterns over page-specific CSS or duplicated components.
- Use intentional typography, spacing, hierarchy, responsive behavior, focus states, motion, and touch targets.
- Design loading, empty, validation, error, 401/403, stale/conflict, success, destructive, and offline states where relevant.
- Maintain accessibility: keyboard navigation, focus visibility, semantic structure, sufficient contrast, reduced-motion support, screen-reader labels, and mobile touch targets.
- Avoid decorative UI that reduces clarity, fake statistics, unverified marketing claims, fabricated timings, or links that are not backed by the product.
- Desktop, tablet, and mobile must feel like one coherent system rather than separate designs.
- Frontend redesign work should change presentation safely, not casually rewrite business logic.
