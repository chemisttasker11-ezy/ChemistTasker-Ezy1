# Frontend refinement plan

Updated 2026-09-05 before application edits. Extends [Step 1](STEP-01-REVIEW.md) and [Step 2](STEP-02-REVIEW.md), retaining their feature coverage and the proposal mapping.

## Decisions

Refine the real frontend, retaining rich visuals, layouts and functionality. Approved reference: workspace `landing_lightweight-handoff/landing_lightweight/`; its five guidance documents and HTML/CSS/JS guide presentation. Business code is authoritative.

Inter/Outfit and handoff application tones supersede proposed DM Sans for application adoption. Four persona identifiers remain. Original supplied logo stays intact; brand-studio logo variants remain drafts. Its 27 skill icons remain available for review and dashboard/Talent Hub adoption.

Next.js public / Vite authenticated app / React Native mobile remains the architecture direction. No framework migration in this refinement increment. User review follows each completed increment.

## Preserved stages

1. Source inventory complete; recheck actual code before changes.
2. Brand/icon showcase complete as isolated draft; reconcile approved handoff now.
3. Shared foundations: begin with scoped reusable application presentation.
4. Public Next experience pending, including SEO and role-aware links.
5. Auth/onboarding pending; preserve guards, verification and uploads.
6. Dashboards/profiles/Talent Hub pending, including all 27 labelled skill icons and distinct status.
7. Pharmacy/shifts elevated to current priority: Post Shift and Shift Centre navigation first; complex child cards/dialogs retain their own audit/verification increments.
8. Operations pending: messaging, invoices, payments, subscriptions, rewards, notifications.
9. React Native adoption pending.
10. Integration QA throughout; final cross-persona regression pending.

## Current increment

- Create supported project-local reusable skill and separate progress notes.
- Inventory Post Shift steps/fields/branches/actions and Shift Centre dependencies; snapshot sources and interaction bindings before editing.
- Capture real component screenshots with isolated synthetic data; no production writes.
- Extract Post Shift's existing local theme into a reusable module; refine typography, colours, focus and accessible controls. Preserve stepper, calendar, audience cards and rate previews.
- Refine Shift Centre navigation readability, selected semantics and focus while retaining routes and child components.
- Run locked dependency build, baseline/after typecheck, browser and preservation checks. Report unverified states.
- Configure requested upstream Blender MCP separately from app dependencies; use sparingly for meaningful 3D work.

## Discrepancies preserved for separate investigation

- Code tiers: pharmacy members → favourite staff → owner chain if available → organisation if claimed → public. Marketing tier order differs; do not reorder business logic.
- Post Shift `onCompleted` runs in both success and finally; existing duplicate callback is not changed by styling.
- Post Shift returns before later hooks when user is absent; existing hook-order concern recorded.
- Super default/award-copy dates are business content, not visual tokens; no financial changes.
- Step 1's Junior/Explorer classification, learning placeholders and mobile admin scoping notes remain pending.
