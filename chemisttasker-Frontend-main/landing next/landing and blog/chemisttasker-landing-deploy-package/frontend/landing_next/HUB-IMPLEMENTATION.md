# Public blog and pharmacy news hub

This work is local only. The design source is `landing_next/app` and the accompanying `landing_lightweight-handoff/landing_lightweight` guide and prompt. The original Vite and mobile applications have not been migrated or restyled. No code was pushed to GitHub and no live service was deployed or modified.

Backend reference: `https://github.com/chemisttasker-smsm/chemisttasker`, branch `main`, source revision `454bacd53ee87559808c88f2b3e95f748a23729a`. The local working copy is the workspace's `backend-source` directory. New Django code is in `backend-source/backend/public_hub`; the existing `core/settings.py` and `core/urls.py` register it.

## What is included

- `/blog`: staff-authored journal, featured article, topic filters, search and pagination.
- `/news`: industry, TGA, career and community news with the same publication controls.
- `/blog/[slug]`, `/news/[slug]`: server-rendered articles, readable sections, optional source attribution and cover image, related reading, share-link copying and discussions.
- `/community/sign-in`: existing ChemistTasker email/password contract, return to the article, HttpOnly cookie session and backend token refresh.
- Homepage navigation and a journal/community section linking to both publications.
- Public reading. All authenticated user roles can comment, reply and react without pharmacy membership or subscription requirements.
- One reaction per user per target, change/remove reactions, top-level comments with a paginated reply thread, author removal, report submission and staff moderation.
- Staff publishing in the existing Django admin: drafts, future scheduled publication, featured stories, comments open/closed, image alt text, source attribution, SEO title/description, archive.
- Server-rendered article text, canonical links, Open Graph, Twitter metadata, BlogPosting/NewsArticle JSON-LD, sitemap and robots. Search/filter result variants are noindex/follow. No ranking guarantees are implied.

Article bodies are plain text paragraphs with `## Heading` sections separated by blank lines. HTML is displayed as text rather than executed. This first implementation does not include a rich-text editor, automatic news ingestion, image upload UI, live push notifications or migration of the existing private Pharmacy Hub.

## Run the local preview

The current workspace has a Python 3.12 virtual environment at `tmp/hub-py312` with the pinned Django/DRF test dependencies installed. It is separate from all production services.

From `backend-source/backend`:

```powershell
../../tmp/hub-py312/Scripts/python -m django migrate --settings=public_hub.test_settings
../../tmp/hub-py312/Scripts/python -m django seed_hub_preview --settings=public_hub.test_settings
../../tmp/hub-py312/Scripts/python -m django runserver 127.0.0.1:8000 --settings=public_hub.test_settings --noreload
```

From this `landing_next` directory, in another terminal:

```powershell
$env:HUB_API_URL='http://127.0.0.1:8000/api'
$env:HUB_PREVIEW_MODE='1'
$env:NEXT_PUBLIC_SITE_URL='http://127.0.0.1:3000'
npm run dev -- --hostname 127.0.0.1
```

Open `http://127.0.0.1:3000/blog` or `/news`. Use that exact origin for the local preview; writes validate the configured origin.

Local reader: `reader@example.test` / `Local-preview-2026!`.
Local staff admin: `http://127.0.0.1:8000/admin/`, username `hub-editor` / `Local-editor-2026!`.

These are deliberately disposable local accounts, not real ChemistTasker credentials. The fixture command refuses settings other than `public_hub.test_settings`. Sample articles identify themselves as local preview content and the development banner marks the preview. `hub-local.sqlite3` is ignored by Git. Never use the test settings, test URL configuration, database, accounts or MD5 test password hasher in deployment.

The isolated harness uses Django's standard User and SimpleJWT so the feature can be exercised without Azure, billing, mail, Redis, or the production database. The production app remains configured for `users.User` and the existing custom login, verification and refresh endpoints. Full-stack testing against production dependencies and the real account service was not performed.

## Publishing and moderation

In Django admin, grant trusted editors the `public_hub` Article view/add/change permissions and staff login access. Existing production admin retains its OTP protection. Pharmacy owner/delegated roles do not automatically become public editors. Create a Blog or News article, set topic, excerpt, text, optional image/source, and a publication date, then change status to Published. Future dates remain invisible until due. Staff can archive an article, close comments, hide inappropriate comments and their threads, and resolve reports. Published URL slugs and kinds should remain permanent.

Public API responses omit private account identifiers, emails, role data and reports. Comment deletion is a tombstone so replies are retained. Staff hiding a top-level comment hides its reply thread from public reads and interactions. Reactions use database uniqueness/check constraints and transactional target locking. Discussion writes are throttled to 30 per minute per authenticated user.

## Integration after local review (not performed)

The Django production changes consist of the `public_hub` application and its initial swappable-user migration, one installed-app entry and one API include. Apply the migration through the existing deployment procedure in a staging environment first. The source repository does not contain migrations for every existing app; reconcile its existing migration history rather than generating unrelated migrations against production.

The Next.js runtime needs a server-reachable `HUB_API_URL` ending in `/api`. Set `NEXT_PUBLIC_SITE_URL` to the exact public HTTPS origin and `NEXT_PUBLIC_PLATFORM_URL` to the existing Vite application origin. The configured site origin is also the expected write-request Origin. If the landing and platform share a host, route `/blog`, `/news`, `/community/sign-in`, `/api/hub`, `/sitemap.xml`, `/robots.txt` and Next assets to Next without disturbing existing Vite routes or Django APIs.

The `/api/hub` proxy only permits this feature's paths, validates write origins, hides tokens in scoped HttpOnly/SameSite cookies, forwards credentials only to the configured backend, refreshes sessions, and marks session-dependent responses no-store. The new marketing-site session uses the same account credentials; it does not automatically import Vite localStorage sessions across origins. Configure normal login rate limiting at the trusted ingress alongside the existing backend lockout protections.

No automatic feed scraping or sample regulatory announcements are published. Editorial staff supply and review source material.

## Interaction map and checks

| Screen/control | Handler → API | Permission and states |
| --- | --- | --- |
| Blog/news search, topics, next page | Server `getArticles` → GET `/api/public-hub/articles/` | Public; loading, empty, error, filtered, paginated |
| Article link | Server `getArticle` → GET `/api/public-hub/articles/:slug/` | Published only; not found, service error |
| Sign in | BFF session → existing POST `/api/users/login/` | Existing account/verification checks; error, pending, return path |
| Session restoration | BFF session → GET `/api/public-hub/me/`; existing refresh when necessary | HttpOnly cookie, valid JWT, no-store |
| Comment/reply | `Composer` → POST article `comments/` | Authenticated; open discussion, valid same-article root, bounded input |
| Reactions | `ReactionBar` → PUT/DELETE target `reaction/` | Authenticated; idempotent, pending/error state |
| Remove comment | DELETE `/comments/:id/` | Author or explicit moderator permission; confirmation and tombstone |
| Report | POST `/comments/:id/report/` | Authenticated; reason, duplicate prevention, acknowledgement |
| Staff publishing/moderation | Existing Django ModelAdmin | Explicit staff/model permissions, existing production OTP admin |

Run feature tests from `backend-source/backend`:

```powershell
../../tmp/hub-py312/Scripts/python -m django test public_hub --settings=public_hub.test_settings --verbosity=2
../../tmp/hub-py312/Scripts/python -m django makemigrations --check --dry-run --settings=public_hub.test_settings
```

Frontend checks: `npm run typecheck`, `npm run build`. See `HUB-VERIFICATION.md` for the completed browser and integration checks.
