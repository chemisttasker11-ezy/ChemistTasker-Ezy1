# Backend apps

`client_profile` used to hold every domain of the platform in one Django app (about 5,000 model lines and 10,500 view
lines). It is now a smaller kernel plus nine apps that each own one domain. Public URLs, request/response shapes,
Celery task names and WebSocket routes did not change: the frontends (Vite SPA, Next.js, Expo) and the shared-core SDK
keep calling `/api/client-profile/...` and `/ws/...` exactly as before.

## Apps and what they own

| App | Owns | Tables (renamed from `client_profile_*`) | Routes (mounted under `/api/client-profile/`) |
| --- | --- | --- | --- |
| `client_profile` (kernel) | organisations, pharmacies, chains, memberships and applications, onboarding, shifts / offers / interests / leave / worker requests, roster, dashboards, shared permissions and helpers | `client_profile_*` (unchanged) | everything not listed below |
| `attendance` | kiosk devices and pairing, QR sessions, worker PINs, attendance sessions and events, offline kiosk events, provisional approvals, corrections | `attendance_*` (9) | `attendance/kiosk/**`, `attendance/worker/**`, `attendance/manager/**` |
| `chat` | conversations, participants, messages, reactions, the room WebSocket consumer, chat signals | `chat_*` (4) | `rooms/**`, `messages/**`, `chat-participants/` |
| `invoicing` | invoices and line items, invoice generation from shifts, PDF/e-mail | `invoicing_*` (2) | `invoices/**` |
| `notifications` | in-app notifications, device tokens, delivery (database, WebSocket, Expo push), the notification consumer | `notifications_*` (1) | `notifications/**`, `device-tokens/**` |
| `pharmacy_hub` | community groups, posts, comments, reactions, polls, attachments, hub scope resolution | `pharmacy_hub_*` (13) | `hub/**` |
| `ratings` | ratings and rating reports | `ratings_*` (2) | `ratings/**` |
| `rewards` | pill rewards, referral codes and events, the ledger, the verified-onboarding signal | `rewards_*` (4) | `pill-rewards/**` |
| `talent` | explorer posts and reactions, user availability | `talent_*` (3) | `explorer-posts/**`, `user-availability/**` |
| `team_calendar` | calendar events, work notes, the calendar feed, their Celery tasks | `team_calendar_*` (4) | `calendar-events/**`, `work-notes/**`, `calendar-feed/**` |

`users`, `billing`, `workforce`, `worker_finance`, `marketplace`, `ethical_marketplace` and `public_hub` were already
separate apps and are unchanged in ownership (see `DOMAIN_OWNERSHIP.md`).

The roster stays in the kernel on purpose: `ShiftSlot.roster_period` is a foreign key into the roster and the shift
code guards published periods, so shifts and roster are one scheduling domain. Its code now lives together in
`client_profile/domains/roster/` (views, V2 views, serializers, services, validation, worker actions, permissions).

## Layout of an app

```
<app>/
  apps.py          AppConfig (ready() connects the app's signals)
  models.py        the app's models (explicit, no star imports)
  urls.py          the app's routes: a DRF router and/or path() entries
  views.py, serializers.py, services.py, ...   domain code
  admin.py, signals.py, routing.py (WebSocket), tasks.py (Celery), test_*.py
  migrations/
```

The kernel keeps one package per domain under `client_profile/domains/<domain>/` (views, serializers, services) and a
`client_profile/models/` package with one module per domain. Shared kernel helpers that other apps import stay at
`client_profile/admin_helpers.py`, `file_validation.py`, `timezone_utils.py` (and `fields.py`, referenced by migrations).

## Dependency rules

* Leaf apps depend on the kernel (`client_profile`), `users` and `notifications`, never the other way round, with the
  seams below as the only exceptions. Leaf apps do not import each other except where listed.
* `notifications` depends on `users` only; every app may call `notifications.services.notify_users`.
* Imports are explicit and absolute. There are no star imports and no re-export shims: import a name from the module
  that defines it.

Seams where the kernel reaches into a leaf app (each is a single, reviewed place):

* `client_profile/urls.py` aggregates the apps' routes: it adopts each router's registrations at the original position
  (`router.registry.extend(...)`, so the API root listing, route order and `client_profile:` route names are
  unchanged) and includes the apps' explicit `path()` lists before the router.
* the dashboards read invoices and hub posts; the upload-reference registry
  (`domains/common/serializers.py`) lists chat and hub attachments; roster services read attendance facts (lazy
  import); `client_profile/tasks.py` calls the rewards service after verification (lazy import); roster code reads
  `talent.UserAvailability`.
* `workforce` consumes attendance (timesheets, signals); `worker_finance` and `invoicing` share the invoice model.

## Conventions

* **Routes** are declared in the app's `urls.py`. A router uses `include_root_view = False`; the kernel router adopts it.
* **Logging**: `LOGGING` configures loggers by top-level package name. Every app split out of the kernel has the same
  entry as `client_profile` (console, level `APP_LOG_LEVEL`); `core/settings.py` lists them in one loop and the gate
  checks it. Modules log with `logging.getLogger(__name__)`.
* **Signals** live in the app that owns the receiver and are connected from `AppConfig.ready()` (`chat/signals.py`,
  `rewards/signals.py`, `workforce/signals.py`). The kernel has no signals module.
* **WebSocket routes**: each app declares `routing.py`; `core/routing.py` mounts them in the original order for
  `core/asgi.py`.
* **Celery**: task names are a persistent contract and are pinned with `name=`. Moving a task to an app only changes
  `CELERY_IMPORTS`; `team_calendar` keeps the names `client_profile.calendar_tasks.*`.
* **Tests** live next to the code. The isolated SQLite harnesses (`attendance_tests/`, `worker_finance/tests/`) list
  the apps they need as models-only stub configs (no signals); add a new app there when kernel code imports its models.

## Database and migrations

Moving a model between apps must not touch data or the live schema, so a move is two steps:

1. `<app>.0001_initial` and `client_profile.<N>_move_<app>_out` are **state only** (`SeparateDatabaseAndState`, no SQL).
   The new app registers the models under their old table names and re-labels the ContentType rows in place, so
   permissions, admin history and generic relations stay attached. Relations from other apps are re-pointed by a
   state-only migration in that app (`worker_finance.0007`, `workforce.0006`), which the move-out migration depends on.
2. `<app>.0002_clean_table_and_index_names` renames the tables and indexes (`ALTER TABLE ... RENAME`,
   `ALTER INDEX ... RENAME`: metadata only, no row is rewritten). It depends on the move-out migration, so it runs after
   every other migration that creates a foreign key to the old table name, whatever order the planner picks.

Rules that keep this safe:

* never add a dependency to an already applied migration (it makes Django refuse to migrate existing databases);
* data migrations of other apps that look moved models up (`worker_finance.0005/0006`) try the new app label first and
  fall back to the old one, so a fresh `migrate` works in any plan order;
* callables referenced from historical migrations stay importable at their old path
  (`client_profile.models.chat_upload_path`, `hub_attachment_upload_path`, `client_profile.fields.EncryptedTextField`);
* the repository ignores every `migrations/` folder except an allow-list in `.gitignore`: a new app must be added there.

## Known product bugs (frozen, not fixed by the split)

They are pinned by `KNOWN QUIRK` tests so a later, reviewed change can fix them deliberately: DRF-shadowed
`ValidationError` returns HTTP 500 instead of 400 in a few views (pill claim, notification mark-read, message edit,
two pharmacy-claim decisions), `chains/` (GET and POST), `hub/polls/{id}/reactions/`, `hub/posts/{id}/comments/{id}/reactions/`,
`hub/posts/{id}/reactions/`, `magic/memberships/{token}/` and `.../apply/`, `ratings/pending/`, `shift-offers/` (POST)
and a malformed date in the calendar feed also fail with HTTP 500.
