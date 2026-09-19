# Running the consolidated web project

All maintained browser code is in `frontend_web`: the existing Vite dashboard in `src`, and the Next.js public site in `landing_next`. These remain two applications with one public origin. The former duplicate reference package has been removed.

## Local startup

Install dependencies once, from `C:\ChemistTasker_Ezy\chemisttasker-ezy\frontend_web`:

```powershell
npm run install:all
```

Start Django in a separate terminal from `C:\ChemistTasker_Ezy\chemisttasker-ezy\backend` (local PostgreSQL and configured Redis must be running):

```powershell
$env:FRONTEND_BASE_URL='http://localhost:3000'
$env:CSRF_TRUSTED_ORIGINS='http://localhost:3000,http://127.0.0.1:3000'
$env:PUBLIC_COMMUNITY_ENABLED='True'
..\.venv\Scripts\python.exe manage.py runserver 8000
```

Then start the complete web frontend from `frontend_web`:

```powershell
npm run dev
```

Open **http://localhost:3000**. Public pages, blog, news, calculator, community and `/content` are Next.js; `/dashboard/*` goes to Vite on internal port 5173. Keep both terminals open. Ctrl+C stops both frontend processes. `npm run dev:dashboard` retains the previous dashboard-only command.

The existing `env/web.dev.env` is loaded without printing credentials. The launcher uses same-origin `/api` for browser requests. Set `WEB_PORT`, `DASHBOARD_PORT`, or `PLATFORM_API_URL` before starting to override ports. Match Django's frontend URL and CSRF origins to the chosen public port.

The current review session uses **http://localhost:3011**, Django port 8011 and Vite port 5173. Restart normally using the commands above for port 3000.

## Content administrator

```powershell
..\.venv\Scripts\python.exe manage.py bootstrap_content_admin <email>
```

Run from `backend`. The existing email queue receives a seven-day activation invitation. Acceptance requires the matching verified account. The command is idempotent; `--resend` rotates a pending token and queues another email. Set `FRONTEND_BASE_URL` before running so the invitation points to the correct public origin. No password, Django staff access, or Django superuser is created by this command.

The existing account `es.ahmed.abas@gmail.com` now has active content-administrator access in the **local database**, granted directly at the user's request on 14 September 2026. Its pending bootstrap invitations were revoked. Use the same existing password at `/login?next=/content`; no email acceptance or second account is required. Django staff/superuser flags and professional role were preserved.

Direct email sending was attempted, but the configured SMTP server rejected authentication (535). SMTP credentials still need correcting for future invitations. The bootstrap command supports `--send-now` for explicit immediate delivery through the existing provider; it does not bypass delivery authentication.

Run the existing Celery email worker for ordinary invitations and Celery beat plus its worker for scheduled publication.

## Deployment and migration gate

Three additive `public_hub` migrations were applied normally to local PostgreSQL: `0001_initial`, `0002_article_body_document_communityreport_and_more`, and `0003_contentmedia`. No old migrations were regenerated or faked. The Explorer choice is application-level on the existing character columns; its migration state must be reconciled with the recovered client_profile history.

Existing deployed migration **source files** for users/client_profile/billing are missing from this checkout. Recover them before the production startup migration guard can pass. A clean production migration rehearsal and staging-data rehearsal remain outstanding. Do not use a generated unrelated baseline or fake migration state to bypass this gate.

1. Restore and verify deployed migration sources, back up staging, and run `manage.py check_content_migrations`, `manage.py migrate --plan`, then `manage.py migrate` there.
2. Deploy backend with `PUBLIC_COMMUNITY_ENABLED=False`. Start the Next.js service before reloading Nginx. Both Docker configurations now use `frontend_web/landing_next`.
3. Configure the real canonical origin, CSRF trusted origins, email worker and scheduled-publishing worker/beat. Build both frontends (`npm run build:all`, requiring the existing production web env).
4. Validate sign-in, cookie refresh, dashboard handoffs, invitation acceptance and private-hub/media access in staging.
5. Set `PUBLIC_SITE_ENABLED=1` on the infrastructure stack and regenerate/reload its Nginx configuration. Enable anonymous community reads only after staging checks. Keep the prior frontend image and restore `PUBLIC_SITE_ENABLED=0` for routing rollback; disable public reads independently.

Local checks: Next production build and Vite production compilation passed; consolidated dev launcher starts both apps; TypeScript passes. Focused Django tests cover permissions, revisions, invitations, public/private access, cookies/CSRF, and media publication. Browser review verified the social feed. Production cutover, live email delivery, complete cross-frontend account/payment flows, mobile regression, and clinical validation have not been performed.

Local media limitation: the historical attachment `pharmacy_hub/attachments/Logo_of_ChemistTaskerRx.png` is referenced by existing posts but absent from configured local storage. Restore the actual media backup to display missing historical uploads. Available uploads render inline; unavailable photos/video/audio show a clear file state. No substitute images or sample posts were seeded.


## Unified navigation rollout

The current launcher enables Vite's public-route handoff automatically. For production, build with `PUBLIC_SITE_ENABLED=1` when enabling the Next gateway; Compose passes this as the Vite `VITE_PUBLIC_SITE_ENABLED` build argument. The setting is compiled into the image, so changing it requires rebuilding. Keep the previous Vite image for rollback together with the routing flag. `/dashboard` now resolves through the Next account gate; role-specific dashboards remain Vite. Existing community login links redirect to `/login` with their return path.

Shared session code lives in `frontend_web/landing_next/shared` and is also imported by Vite. Public headers show the same account menu. Cookie refresh, logout notifications and validated return destinations are shared; email/phone verification resumes the destination. Anonymous API reads retain public permissions. Local checks cover builds, 32 focused Django tests, return-path/concurrent-refresh tests and live CSRF/expired-cookie logout. Full signed-in browser navigation, cross-browser concurrent tabs, billing/mobile and staging deployment checks remain to be completed.
