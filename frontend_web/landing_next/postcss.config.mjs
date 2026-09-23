/**
 * Next owns its CSS pipeline independently from the sibling Vite app.
 *
 * Keep this local config so Next/Turbopack does not walk up to
 * frontend_web/postcss.config.js and accidentally require Vite-only
 * Tailwind/PostCSS dependencies that are not part of landing_next.
 */
const config = {
  plugins: {},
};

export default config;
