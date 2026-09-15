# Real-project integration

Public destination paths were checked against frontend_web/src/main.tsx: /login, /register, /pricing, /shifts/public-board, /talent/public-board, /privacy-policy and /terms-of-service. They are preserved in the HTML. Change the `platform` constant in app.js to target your application deployment; the default is https://chemisttasker.com.au. For local integration use the actual running Vite origin, not a guessed port. Production availability was not checked by submitting actions.

This static handoff preserves landing interactions and real destination links, not executable React hooks from authenticated screens. Those hooks remain in the original application. Port presentation into existing React components while retaining their hooks and handlers; do not transplant static dashboard previews as live dashboards.

Role landing paths are defined by src/utils/dashboardPath.ts:

- Owner: /dashboard/owner/overview
- Pharmacist: /dashboard/pharmacist/overview
- Other Staff: /dashboard/otherstaff/overview
- Organisation roles: /dashboard/organization/overview
- Explorer: /dashboard/explorer/overview

Use the existing resolver and auth guard after login, not hard-coded redirects based on the marketing role tab. Landing role CTA links intentionally open registration. The role tabs only change explanatory content.

Inspect src/contexts/AuthContext.tsx, src/utils/apiClient.ts and src/utils/tokenService.ts before integration. Never embed credentials, copy session tokens into this handoff, or bypass authenticated route checks. Post Shift and Manage Pharmacy must retain the existing guarded workflows, handlers and API contracts.

Local interactions retained in app.js: mobile menu, role selection/arrow-key navigation, footer role selection, tier selection, playback/pause/replay, viewport-aware playback and reduced-motion support. FAQ and capability accordions use native details/summary. The calendar/workspace mockups and five-tier network remain illustrative, with no backend writes.
