# ChemistTasker frontend design direction

This codifies the user-approved landing direction, not a legal brand certification. Apply to the existing frontend without changing business behaviour.

## Source of truth

- Visual reference: this folder's index.html, styles.css and assets.
- React reference: sibling landing_next/app (landing-page.tsx, globals.css, tier-explainer.tsx and motion styles).
- Functional source of truth: sibling frontend_web/src, not marketing copy or illustrative previews.
- Existing route definitions: frontend_web/src/main.tsx. Role landing rules: frontend_web/src/utils/dashboardPath.ts.

## Identity

Calm, connected, human and pharmacy-first. White/light surfaces, navy text, confident purple actions, restrained magenta/cyan accents. Keep the supplied ChemistTasker logo intact; do not redraw, stretch, recolour or crop the actual symbol/wordmark. The current raster is acceptable for preview; request a proper transparent/vector master for production. Portraits are illustrative, never testimonials or authenticated user identities.

## Tokens

| Token | Value | Purpose |
| --- | --- | --- |
| Navy | #06214A | Primary text and identity |
| Purple | #5222B8 | Primary actions and active controls |
| Magenta | #D600C8 | Small brand accents |
| Cyan | #00BDD2 | Highlights and network accents |
| Blue | #008DDB | Focus and secondary accents |
| Mist | #F5F8FC | Workspace background |
| White | #FFFFFF | Cards and inputs |
| Body | #59677E | Supporting text |
| Border | #E6EAF2 | Dividers and card boundaries |

Outfit 500/600 for headings; Inter 400/500/600 for UI/body. Keep fonts local. Use existing icon libraries where practical; keep outline weight/size consistent. Never replace functional icon meaning solely for visual consistency.

Dashboard adaptation: body 14–16px, labels 12–14px, page titles 28–36px, section headings 20–24px. Do not copy the landing's tiny mockup text into working dashboards. Use a 4/8px spacing rhythm, 16–24px card padding, 8–12px input/button radii and 16–24px panel radii. Keep tables and forms efficient; oversized hero typography and 100px section gaps belong to marketing only.

Use gradients sparingly for branded hero/summary areas, not whole dashboards or routine form controls. Shadows should be subtle (reference: 0 16px 50px #06214A0A). Dark navy is reserved for selected explanatory/brand panels; the app remains light by default.

## Components and states

Build reusable page shell, navigation, page header, primary/secondary/destructive buttons, cards, form controls, tabs, filters, tables, status badges, dialogs, toasts and empty states. Theme existing MUI components if that is what a screen uses; do not replace the component stack unnecessarily. Scope styles or theme them centrally—never paste landing global selectors into the existing app.

Preserve loading, empty, error, validation, permission-denied, disabled, success and offline states where present. Colour must not be the only status cue. Meet WCAG AA contrast: normal text 4.5:1, large text 3:1, control boundaries/focus indicators 3:1. Cyan/magenta are not automatically accessible text colours on white. Aim for 44px touch targets, visible focus, associated labels, keyboard navigation and semantic table/dialog behaviour.

## Motion

Routine feedback: subtle 150–250ms opacity/transform transitions. Do not animate every card or repeatedly pulse notifications. The five-tier graphic is a concept illustration: local pharmacy/person clusters, direct connections, moving invitation packets, progressively expanded audiences. Keep Play/Pause/Replay, explicit tier selection, offscreen pause and reduced-motion support. It does not establish backend decentralisation or change escalation rules.

## Non-negotiable integration rules

Preserve routes, query strings, parameter names, API methods/payloads, auth context, token refresh, permissions, hooks, validation, state transitions, subscriptions, notifications, uploads/downloads, billing and error handling. Never replace working actions with alerts, dead links, local-only mocks or demo success states. Styling must not bypass authentication. Fixture data is allowed only in an explicit development-only preview.

Workspaces include Owner, Pharmacist, Other Staff, Organisation and Explorer. Manager/delegated access must follow existing permission logic. Audit actual menus and routes: do not assume this list exhausts the project.

Do not claim new compliance, verification, rewards or learning capabilities from the marketing catalogue unless confirmed in the real application. Preserve the existing implementation and flag discrepancies.

## Delivery discipline

Maintain a screen inventory and action map: screen → component → control → handler/hook → API/route → permission → loading/error/success → verification result. Restyle one complete workflow at a time. Test desktop and mobile, keyboard interaction and permission boundaries. Report actual checks, pre-existing failures and unverified areas honestly.
