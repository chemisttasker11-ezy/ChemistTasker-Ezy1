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
