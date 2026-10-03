# Backend domain dependencies

This is the dependency map of the backend after the domain split (#99–#108). `core/test_backend_ownership_boundaries.py`
enforces it in CI. `DOMAIN_OWNERSHIP.md` names the owner of each domain, and `BACKEND_APPS.md` describes the apps.

## Rule

`client_profile` is a **compatibility kernel**. It keeps the historical import paths, the Django app label of the
models that have not been relabelled, the deployed Celery task implementations and the callables that migrations
reference. It does not own new behaviour, and runtime code does not depend on it backwards.

* Runtime code outside the kernel imports a name from the module that owns it. The test parses every shipped module,
  including function-local imports. A kernel import is accepted only if it is listed, with its reason, in
  `ALLOWED_LEGACY_IMPORTS`. Migrations and tests are exempt.
* The kernel only shrinks. No new runtime module, no new top-level definition, no model, and no growth in code lines
  (`KERNEL_DEFINITIONS`, `KERNEL_CODE_LINE_CEILING`). Re-exports and facades may stay. When something leaves the
  kernel, the stale entry is removed so the ceiling follows it down.
* A string that starts with `client_profile` must be one of:
  * the app label
  * a model label that Django resolves to that label (`"client_profile.Pharmacy"`)
  * a registered legacy Celery task name
  * an entry of `ALLOWED_STRING_REFERENCES`

  This covers `apps.get_model`, `ForeignKey("…")`, `send_task`, `importlib`, settings strings and data paths.
* No new pair of apps may import each other at module level (`ALLOWED_MUTUAL_APP_PAIRS`).
* Identity is pinned: `db_table`, app label and defining module of the 91 kernel and split-app models. Legacy imports
  must resolve to the same objects (`client_profile.models.X is apps.get_model("client_profile", "X")`). Every callable
  a migration references must stay importable. The 21 deployed Celery task names must stay registered.

**Python package ≠ Django app label.** `organizations`, `memberships`, `onboarding` and `shifts` own the code of
models that keep `app_label = "client_profile"`, with their tables, ContentTypes and migration state. So
`ForeignKey("client_profile.Pharmacy")` is correct and must not be "fixed": changing a label or a table is a database
change, made only through the procedure in `BACKEND_APPS.md`, in its own change.

## Domains

| Domain app | Owns (models) | Public interface | Imports at module level | Legacy paths kept in the kernel |
| --- | --- | --- | --- | --- |
| `organizations` | `Organization`, `Pharmacy`, `PharmacyClaim`, `PharmacyAdmin`, `Chain` (label `client_profile`) | `organizations.models`, `organizations.access` (admin capabilities, org scope), `organizations.timezone`, `organizations.claims`, `organizations.serializers` | `onboarding`, `memberships`, `users`, `notifications`, `core` | `client_profile.models[.orgs]`, `client_profile.admin_helpers`, `client_profile.timezone_utils`, `client_profile.domains.orgs.*` |
| `memberships` | `Membership`, `MembershipInviteLink`, `MembershipApplication` (label `client_profile`); the award classification choices | `memberships.models`, `memberships.serializers` (incl. the active-membership limit), `memberships.labels` | `organizations`, `onboarding`, `users`, `notifications`, `core` | `client_profile.models[.memberships]`, `client_profile.domains.memberships.*`, `client_profile.domains.common.labels` |
| `onboarding` | `OwnerOnboarding`, `PharmacistOnboarding`, `OtherStaffOnboarding`, `ExplorerOnboarding`, `RefereeResponse`, `OnboardingNotification` (label `client_profile`); `GENDER_CHOICES` | `onboarding.models`, `onboarding.serializers`, `onboarding.emails` | `users`, `core`; kernel: `client_profile.fields`, `client_profile.tasks` (allowed) | `client_profile.models[.onboarding]`, `client_profile.domains.onboarding.*` |
| `shifts` | `Shift`, `ShiftSlot`, `ShiftSlotAssignment`, `ShiftInterest`, `ShiftRejection`, `ShiftOffer`, `ShiftCounterOffer[Slot]`, `ShiftSaved`, `ShiftDescriptionTemplate`, `ShiftProfileAccessAudit`, `LeaveRequest`, `WorkerShiftRequest` (label `client_profile`) | `shifts.models`, `shifts.base`, `shifts.serializers`, `shifts.pricing`, `shifts.emails`, `shifts.access` (role and request helpers), … | `organizations`, `memberships`, `onboarding`, `users`, `notifications`, `talent`, `workforce` (`RosterPeriod`), `core` | `client_profile.models[.shifts]`, `client_profile.domains.shifts.*`, `client_profile.domains.common.access` |
| `workforce` | roster, leave, timesheets, employment engagements (label `workforce`) | `workforce.roster.*`, `workforce.*_service` | `shifts`, `organizations`, `memberships`, `onboarding`, `attendance`, `talent`, `users`, `core` | — |
| `attendance` | kiosk, sessions, events, approvals (label `attendance`) | `attendance.*` | `organizations`, `memberships`, `shifts`, `workforce` | — |
| `dashboards` | no models (read model) | `dashboards.views` | `shifts`, `organizations`, `memberships`, `invoicing`, `pharmacy_hub`, `users` | `client_profile.domains.dashboards.*` |
| `chat`, `pharmacy_hub`, `team_calendar`, `talent`, `rewards`, `ratings`, `invoicing`, `notifications` | their own models (#99 relabelled) | their modules | the owning domain apps above, never `client_profile` (except the two upload callables) | — |
| `users`, `billing`, `worker_finance`, `marketplace`, `ethical_marketplace`, `public_hub` | unchanged | unchanged | the owning domain apps above | — |

`core.uploads` owns the generic upload-path helpers (`unique_upload_path`, `safe_extension`). The kernel keeps them
under their historical names `_unique_upload_path` and `_safe_ext`.

### Why some model modules may not import the kernel

Importing anything under `client_profile.models` runs `client_profile/models/__init__.py`, which imports every domain
model module. A domain model module that reached into `client_profile.models.common` could therefore only be imported
after the kernel facade, and the old `users.models` → `client_profile.models` import hid that order dependency. The
choices and upload helpers those modules need now live with their owners (`memberships.models`, `onboarding.models`,
`core.uploads`). So `organizations.models`, `memberships.models` and `onboarding.models` import no kernel module except
`client_profile.fields`, which is a plain module outside the facade package.

### Module-level cycles that exist (ratcheted, not new)

Before this change, `users`, `shifts` and `memberships` each formed a pair with `client_profile`. Pointing imports at
the real owners shows what those pairs were:

* `users ↔ organizations/memberships/shifts/onboarding`: `users` holds both the identity models and the account API,
  which reads organisations, memberships and shifts.
* `memberships ↔ organizations`
* `shifts ↔ workforce`: `Shift` slots point at `RosterPeriod`, and the roster builds on shifts.
* `attendance ↔ workforce`
* `core ↔ *`: settings, URLs and shared utilities.

The model modules themselves import acyclically. These pairs are listed in `ALLOWED_MUTUAL_APP_PAIRS`. A new pair
fails CI, and a resolved pair must be removed from the list.

## What stays in the kernel, and why

| Kernel module | Kind | Why it stays |
| --- | --- | --- |
| `models/` (`__init__`, `orgs`, `memberships`, `onboarding`, `shifts`) | compatibility facade | `from client_profile.models import X`; the historical migration `client_profile.0001` references upload callables through it |
| `models/common.py` | migration-bound callables + facade | `chat_upload_path`, `hub_attachment_upload_path`: `chat.0001_initial` and `client_profile.0001` reference them by this path. The choices and helpers are re-exports. |
| `fields.py` (`EncryptedTextField`) | migration-bound | migrations deconstruct the field by its `client_profile.fields` path, so moving it would generate migrations |
| `tasks.py` | Celery implementation | deployed task names `client_profile.tasks.*` (table below). It is decomposed in its own change. |
| `admin.py` | admin of the `client_profile`-labelled models | admin URLs are `admin/client_profile/<model>/` |
| `urls.py` | kernel URLconf | included by `core.client_profile_api_urls`; the router composition lives in core |
| `admin_helpers.py`, `timezone_utils.py`, `file_validation.py`, `domains/**` | compatibility facades | historical import paths. `domains/dashboards/serializers.py` (5 response serializers) is unused: remove it later. |
| `apps.py` | app config | the `client_profile` app label |
| `characterization_support.py` | test support | factories for the characterization and WebSocket tests |

## Deployed Celery tasks still implemented in the kernel

The names are a contract: workers, beat entries and queued messages use them. They do not change. A later
decomposition can move each implementation to its owner and keep `name=`.

| Task name | Responsibility | Future owner |
| --- | --- | --- |
| `client_profile.tasks.verify_filefield_task` | OCR document verification | `onboarding` |
| `client_profile.tasks.verify_abn_task` (+ `abn_lookup`, `_parse_abn_html_fields`) | ABN verification | `onboarding` (lookup shared with `organizations`, `worker_finance`) |
| `client_profile.tasks.verify_ahpra_task` | AHPRA verification | `onboarding` |
| `client_profile.tasks.run_all_verifications`, `final_evaluation` | onboarding verification orchestration | `onboarding` |
| `client_profile.tasks.run_referee_reminder` (+ `schedule_/cancel_referee_reminder`) | referee reminders | `onboarding` |
| `client_profile.tasks.send_shift_reminders` | shift reminders (beat, hourly) | `shifts` |
| `client_profile.tasks.email_membership_application_{submitted,approved,rejected,review_updated}` | membership application e-mails | `memberships` |
| `client_profile.calendar_tasks.*` (3) | calendar (already in `team_calendar.tasks`) | done |

## Non-import references to the kernel

All of them were reviewed:

* 72 relation strings, such as `"client_profile.Pharmacy"` and `"client_profile.Membership"`. They are correct
  because the label is kept.
* 49 `"client_profile"` app-label arguments.
* Celery task names in `CELERY_TASK_ROUTES`, `CELERY_BEAT_SCHEDULE` and `async_task(...)`.
* Two route patterns.
* The kernel URLconf include.
* The `INSTALLED_APPS` entry.
* Two pricing data files: `shifts/pricing.py` reads `client_profile/data/*.json`. Moving the files is a follow-up.

## Not in this change

* Moving or renaming tables, labels or migrations.
* Splitting `client_profile/tasks.py`.
* The stale `worker_finance.invoicerecord` ContentType. It is a separate, deliberate data cleanup, done once nothing
  in `django_content_type`, `auth_permission`, `django_admin_log` or a generic relation references it.
