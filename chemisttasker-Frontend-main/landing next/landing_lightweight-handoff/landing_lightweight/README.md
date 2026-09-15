# Lightweight developer handoff

Open index.html directly in a modern browser, or serve this folder with any static web server. No npm install, React, Next.js, build tool, CDN or account is required. Assets and fonts are local. Keep the folder structure when sharing.

- index.html: landing markup and inline SVG icons/network.
- styles.css: visual styles and fonts.
- app.js: dependency-free interactions and configurable real-application origin.
- assets/: supplied logo/portraits and local fonts.
- BRAND-DESIGN-GUIDE.md: reusable identity and dashboard design rules.
- CODEX-PROMPT.md: paste-ready task for the remaining frontend.
- INTEGRATION.md: verified project routes and integration boundaries.
- FEATURE-MAPPING.md: reference feature coverage and source cautions.

To use the redesign prompt, open your existing Codex CLI session in the project directory containing frontend_web, frontend_mobile, landing_next and landing_lightweight. Paste the content of CODEX-PROMPT.md. The task targets frontend_web only; extend to frontend_mobile separately after reviewing the web implementation.

The approved Next.js reference remains untouched in landing_next. This folder is a portable presentation handoff, not a replacement authentication/backend implementation. Keep real business logic in frontend_web when integrating. Review claims and image usage rights before public release.
