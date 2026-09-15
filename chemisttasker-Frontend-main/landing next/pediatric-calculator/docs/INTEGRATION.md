# Main project inspection — 6 September 2026

Read-only inspection of `C:/Users/semse/Desktop/chemisttasker`.

## Existing stack

- `backend/requirements.txt`: Django 5.1.8; Django REST Framework 3.16.0; SimpleJWT 5.5.0; Channels 4.3.1; django-q2 1.8.0; psycopg 3.2.9.
- `backend/core/settings.py`: PostgreSQL configuration, JWT authentication, Redis channel layer with an in-memory fallback, Django-Q jobs, ASGI entrypoint. Configuration was inspected without reading environment secrets or connecting to services.
- `backend/core/urls.py`: `/api/users/`, `/api/client-profile/`, `/api/billing/`, `/api/account/`; development schema/docs endpoints. No calculator API was identified in the top-level routes.
- `frontend_web/package.json`: React 19, TypeScript, Vite 8, React Router 7, MUI 7. It is not a Next.js application.

## Calculator boundary

The calculator is a separate Next.js 16 / React 19 / TypeScript app. No existing auth flows, API clients, schema, billing or clinical data stores were changed. The calculation engine is a pure module with structured source and regimen records, so a reviewed dataset could later be delivered by a DRF endpoint without rewriting the UI.

Do not add a backend dependency solely for arithmetic. Future integration can link to a standalone calculator route or use a shared public Next.js shell once that project is available. If authoring/review is later required, a Django-managed versioned regimen catalogue could store source URL, document version, exact section, review date, reviewer and release state. Published versions should be immutable and only clinically approved records should be served. None of these future endpoints or workflows has been created.

Source registration status, paediatric evidence and specialist restrictions must remain distinct attributes. Do not treat PBS listing as a complete ARTG or dosing audit. Do not overwrite one institution's doses with another's while retaining the first institution's citation.
