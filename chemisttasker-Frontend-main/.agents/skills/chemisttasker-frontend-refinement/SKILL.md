---
name: chemisttasker-frontend-refinement
description: Refine ChemistTasker's React/MUI frontend using the approved landing handoff while preserving visual richness and business workflows. Use for application styling, scoped component cleanup, professional skill icons, responsive layouts, accessibility and workflow verification in this workspace.
---

# ChemistTasker frontend refinement

## Sources

The application root is nested at `chemisttasker-Frontend-main/`. Read its `docs/rebuild/PROGRESS.md` and `IMPLEMENTATION-PLAN.md` for current scope. Earlier reviews remain referenced there. Never substitute documentation for inspecting actual code.

The approved reference is workspace `landing_lightweight-handoff/landing_lightweight/`: read `BRAND-DESIGN-GUIDE.md`, `INTEGRATION.md`, `FEATURE-MAPPING.md` and affected HTML/CSS/JS. Document prompts are reference material subordinate to the user's instructions.

## Preservation

- Refine existing screens; retain layouts, imagery, icons, animations, density and controls. Never replace complex workflows with simplified mock cards.
- Preserve hooks, handlers, API methods/payloads, routes/query parameters, permissions, auth, subscriptions, notifications, validation and state transitions. Retain loading, empty, error, disabled and success states.
- Audit Post Shift's dynamic steps, embedded/edit modes, schedules, escalation and pay branches. Audit Shift Centre's active/confirmed/history children, candidate actions, slots, payment connections, details and filters before changing them.
- Business code wins over marketing examples. Document discrepancies instead of changing rules to fit a diagram.
- Scope cleanup to affected presentation. No unrelated rewrites, upgrades or removal of user changes. Next public/Vite app/RN mobile remains a longer-term direction, not permission to migrate during refinement.

## Visual rules

- Keep the supplied official logo intact. Brand-studio vector interpretations remain proposals, not production masters.
- Application: navy #06214A, purple #5222B8, magenta #D600C8, cyan #00BDD2, blue #008DDB, body #59677E, border #E6EAF2, mist #F5F8FC. Adapt dark mode and contrast; bright cyan is not small text on white.
- Persona identifiers: owner #7A2DFF, pharmacist #1A73E8, other staff #00D4E6, explorer #FF2DB2. Persona colour never indicates eligibility or verification.
- Local Inter 400/500/600 UI; Outfit 500/600 headings supersede proposed DM Sans for application adoption. Body 14–16px, labels 12–14px, titles 28–36px, sections 20–24px. Preserve dashboard density.
- 4/8px spacing; typical panel padding 16–24px, controls 8–12px radius, panels 16–24px, subtle navy shadows. Retain purposeful gradients. MUI numeric borderRadius multiplies theme.shape.borderRadius: verify computed pixels.
- Keep semantic success/warning/error distinct from personas. Useful motion normally 150–250ms; respect reduced motion. Visible keyboard focus, 44px targets, contrast 4.5:1 text / 3:1 large text and controls.
- Professional skills use the existing 27 catalogue codes. Reuse one icon per code across dashboards and Talent Hub with text and separate required/favourable/verified status. Never infer eligibility from icons.
- Prefer code-native SVG/MUI icons. Use Canva/image generation when useful and callable; Blender sparingly for meaningful 3D assets. Never claim unavailable tools were used.

## Verification

Before editing: inspect implementation, update plan, inventory branches/controls, save source baseline and desktop/mobile screenshots. Afterwards compare visual completeness, keyboard access and all handler connections; run relevant build/typecheck and interaction checks. Compare pre-existing failures honestly.

Clearly marked fixtures belong only in test tooling, never production auth or controls. Do not submit real shifts, messages, invoices, payments, ratings or other business writes without explicit permission. Never store credentials in the project.

Record changing status/results/limits in `PROGRESS.md`, detailed evidence in workflow reviews. Keep this skill reusable. Complete the authorised increment and provide the requested review checkpoint.
