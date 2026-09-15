# ChemistTasker Landing, Blog, News Handoff

This compact handoff contains the local Next.js landing/public-page work and the Django public hub backend files for blog/news/journal/community comments and reactions.

## What is included

- `frontend/landing_next`: Next.js app source for the landing page, public pages, public shifts board, talent board, blog, news, journal teaser, hub API proxy, styling, migrated React page source, shared-core source, and small visual assets.
- `backend/django_public_hub`: Django `public_hub` app and the small integration files a backend developer needs to wire it into the existing API.

## What is intentionally excluded

- `node_modules`, `.next`, cache folders, build output, git history, and large dependency folders.
- Private dashboard source that was not part of the public landing migration.
- Any push/commit/deployment artifacts.

## Frontend quick start

```powershell
cd frontend\landing_next
npm install
npm run dev
```

Default local URL: `http://localhost:3000`.

Useful environment values:

```env
PLATFORM_API_URL=http://127.0.0.1:8000/api
NEXT_PUBLIC_SITE_URL=http://localhost:3000
NEXT_PUBLIC_RECAPTCHA_SITE_KEY=
```

The Next app proxies platform calls through `/api/platform/*` and hub calls through `/api/hub/*` so the public pages keep same-origin browser behaviour.

## Backend notes

The backend folder is a source handoff, not a complete standalone Django project. Merge `public_hub` into the existing ChemistTasker backend and wire the included URL/settings changes into the real project.

Key backend surface:

- Public blog/news listing and detail endpoints.
- Auth-gated comments, replies, reactions, bookmarks and moderation-style fields.
- Email template for tagged hub posts.
- Tests included in `public_hub/tests.py`, `test_urls.py`, and `test_settings.py`.

## Current caveats

- The frontend migration is local-only and was not pushed to GitHub.
- The official dispensing-system logo replacement is still a follow-up item; current skill/software chips use icon fallbacks.
- The public boards render real data only when the existing backend API is running.
