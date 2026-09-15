# Copy-paste task prompt

Act as a senior frontend engineer and UI/UX designer. Extend the approved ChemistTasker landing-page visual identity to the remaining frontend_web application. Implement the redesign in the existing project, not as screenshots or a parallel demo.

First read applicable AGENTS.md files and landing_lightweight/BRAND-DESIGN-GUIDE.md, landing_lightweight/FEATURE-MAPPING.md and landing_lightweight/INTEGRATION.md. Inspect landing_lightweight/index.html/styles.css/assets and sibling landing_next/app for visual references. Treat frontend_web/src as the functional source of truth. Do not migrate Vite to Next.js or change frontend_mobile in this task.

Before editing, inspect the working tree and preserve all user changes. Inventory all actual routes, role layouts, shared components and workflows. Start with src/main.tsx, src/navigation.tsx, src/contexts/AuthContext.tsx, src/utils/apiClient.ts, src/utils/tokenService.ts and src/utils/dashboardPath.ts. Follow their imports to the real implementations. Establish baseline build/typecheck/test results from package.json. Create a progress checklist and interaction map before restyling.

Apply white/mist surfaces, navy #06214A text, purple #5222B8 actions, restrained cyan #00BDD2/magenta #D600C8 accents, Outfit headings and Inter UI text. Use the guide's dashboard density, accessible typography and reusable component rules. Prefer theming existing MUI/shared components over replacing libraries. Keep all CSS isolated or centrally themed. Do not copy marketing-scale spacing or tiny illustrative dashboard text into the working app.

Preserve every existing React hook, API call, payload, route/query parameter, authentication guard, role/permission rule, validation, subscription, side effect and state transition. Retain all button/menu actions and loading/empty/error/disabled/success states. Do not stub real actions, create fake success messages, alter escalation/payment rules, weaken security or use placeholder accounts in production. Preserve invoice downloads, uploads, messaging, notifications and realtime connections. Use development-only fixtures for visual testing only if needed, clearly isolated from real auth and production builds.

Implement in phases:
1. Shared tokens/theme, app shell, navigation and foundational components.
2. Owner overview, manage pharmacies, post-shift flow and Shift Centre.
3. Pharmacist and Other Staff dashboards, roster, availability, confirmed shifts and history.
4. Organisation/delegated administration and Explorer views, according to actual routes.
5. Calendar, memberships, invoices, Pharmacy Hub/chat, talent/learning, profiles/settings and all remaining discovered screens.

For every phase, update the interaction map with control → handler/hook → API or route → permissions → states → tests. Verify representative complete workflows, not just individual screens. Test responsive layouts, keyboard navigation, form errors, accessible contrast and role restrictions. Never submit real shifts, messages, invoices or payments just to test styling without explicit authorisation; use mocks/intercepted requests or a dedicated test environment.

Work through the scoped frontend in coherent increments. Do not call the redesign complete after only the shared shell or owner dashboard. If blocked, finish unaffected work and identify the exact missing access or decision. Do not invent evidence. Deliver a summary of changed screens/files, preserved integrations, checks run, remaining gaps and how to preview the result. Do not deploy or alter backend services without approval.
