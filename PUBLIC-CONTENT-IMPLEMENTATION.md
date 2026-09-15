# Public site implementation checkpoint

Maintained web root: `frontend_web`. Public Next.js site: `frontend_web/landing_next`. Private dashboard: `frontend_web/src`. See [RUN-WEB.md](RUN-WEB.md) for the single startup command, environment, administrator activation and deployment gates.

Saved: supplied public site/blog/news/calculator; shared cookie authentication and proxies; Docker/Nginx split; anonymous public hubs and Explorer; ownership corrections; structured editor and isolated revisions; scoped writing/publishing/team permissions; invitations/bootstrap; moderation/audit API; guarded media; sitemaps; social feed with inline photos/video/audio/PDF and file cards, reactions/comments/sharing and multipart posting.

Local PostgreSQL has all three additive public_hub migrations applied without fake migration state. Next and Vite builds passed. Focused permission tests and frontend TypeScript checks pass. Reference sources remain untouched.

Outstanding rollout gates: restore deployed migration source files, rehearse clean/staging migrations, verify end-to-end authentication/payment/mobile regressions and actual email delivery, then enable production routing and public reads. Content administrator activation is pending the invited user's verified-account acceptance. Stage 2 unrestricted administration and authenticator setup remain deferred as approved.

Design authority: supplied landing_lightweight BRAND-DESIGN-GUIDE.md. The user's Next.js integration and social-feed requests supersede the handoff's older Vite-only scope. Calculator source calculations remain unchanged; this is not clinical validation.

Next implementation sequence: see [UNIFIED-WEB-EXPERIENCE-PLAN.md](UNIFIED-WEB-EXPERIENCE-PLAN.md), updated 14 September 2026. It consolidates canonical login/return paths, shared session state, two-way Next/Vite navigation and account-aware headers. These follow-up steps are planned, not yet implemented. The existing requested administrator account is active/verified; its editorial invitation remains pending acceptance. Missing historical photos are explicitly out of scope.


14 September continuation: the existing administrator account now has direct local content access; email acceptance is no longer needed. Unified login/session/navigation work has been saved; see the latest checkpoint in UNIFIED-WEB-EXPERIENCE-PLAN.md for implemented behavior and the remaining authenticated/staging verification. SMTP delivery failed authentication (535). No additional schema migrations were needed for these session/navigation changes.
