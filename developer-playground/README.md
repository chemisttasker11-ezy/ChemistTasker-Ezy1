# ChemistTasker local playground

Open **http://127.0.0.1:8090** for the searchable account directory, pharmacy relationship map, scenario participants and credentials.

- Main app: http://localhost:3000/login
- Local backend: http://127.0.0.1:8000
- All fixture accounts use **Playground!2026**. Emails end in **@playground.test**.
- Start with **owner.independent.01@playground.test**, **pharmacist.locum.01@playground.test**, **org.1.staff.01@playground.test**, or **content.admin@playground.test**.

## One-click account access

Choose an account in the directory, then click **Open logged in**. A new tab performs the normal CSRF-protected login and opens local main's dashboard (or the content workspace for editorial staff). You do not need to paste credentials. The launcher uses localhost consistently so cookies survive the app's dashboard redirects. Passwords and tokens are never placed in the URL or browser storage by the launcher.

Tabs on the same localhost share the latest signed-in account, including across Main/PR ports. This is a new tab, not an isolated browser profile. Use separate browser profiles to test several accounts simultaneously. Inactive accounts remain disabled; email verification and other normal application restrictions are respected. Failed login shows an explanation and a retry button.

## Included

916 fictional accounts, 71 pharmacies, 3 organisations:

- Ten independent pharmacies, each with a different owner.
- Four owners with 3, 4, 4 and 5 stores. One group is unconnected, one is partially connected, two are connected.
- Organisations with 10, 15 and 20 pharmacies, plus chief, organisation and scoped regional admins (ten of each role overall).
- Every pharmacy has its owner and eight core staff: manager, roster manager, locum pharmacist, technician/communications manager, assistant, intern, student and contact.
- Ten additional examples of every pharmacist/intern/technician/assistant/student × full-time/part-time/casual/locum/shift-hero combination.
- Ten explorers of each category: student, adult junior and career switcher.
- One content administrator, ten writers and ten publishers with assignments for Blog, News and all six platform hubs.
- Verified, pending, rejected, draft onboarding, unverified email, inactive, pharmacist registration expiry and marketplace terms-pending cases. Memberships separately include accepted, pending, rejected and left.
- 308 shifts, including 12 paid intern opportunities and 12 paid student placements, with 166 interests, 142 assignments, 142 offers, roster periods, leave requests, team chats, notifications and twelve sample invoices.
- 662 Talent Hub posts and 2,379 private calendar availability slots. Public Talent posts belong to staff with verified public profiles; owner-invited staff whose public onboarding is still pending have only private calendar availability. Explorer accounts retain their post-only path.
- Twenty Blog/News articles including draft, scheduled and archived examples; all six platform hubs, pharmacy team posts, comments, reactions and polls.
- 32 equipment listings, 25 exchanges with conversations, saved listings and reservations.
- Ethical premises approval states, professional access, one explicitly synthetic training product and eleven transfer-state examples. These do not represent real medicines or approvals.

The exact inventory is in `data.json`. This is broad representative coverage, not proof of every application edge case.

## Start, refresh and verify

Run from the checkout root in PowerShell:

```powershell
.\developer-playground\start.ps1
# Restore fixture values while retaining unrelated records:
..\tmp\ezy-backend-venv\Scripts\python.exe .\developer-playground\seed.py
# Check counts, relations, portraits, real API login and marketplace admission:
..\tmp\ezy-backend-venv\Scripts\python.exe .\developer-playground\verify.py
```

`start.ps1 -Seed` also refreshes the dataset. The local `chemisttasker_preview` PostgreSQL database and existing Python environment are required. This developer kit is versioned for review; runtime output remains ignored.

### Seed order

For a clean or manually controlled setup, use this order:

1. Start the local PostgreSQL preview database and apply Django migrations.
2. Run `prepare_assets.py` to copy the bundled synthetic images into `backend/media/playground/`.
3. Run `seed.py`; it creates or refreshes the deterministic model records, then regenerates `record-ids.json`, `data.json`, and `data.js`.
4. Run `verify.py` to check relationships, asset coverage, API login, Talent access, and marketplace gates.
5. Serve this directory on port 8090 and open the control dashboard at <http://127.0.0.1:8090>.

`start.ps1 -Seed` performs the relevant migration, asset, seed, application-start, and dashboard-start steps automatically for the available local runtime. The committed `data.json`, `data.js`, and `record-ids.json` are a complete synthetic snapshot for review and a stable baseline for reseeding.

The local frontend uses the preview backend and database. Use separate browser profiles for simultaneous roles; localhost authentication cookies may be shared across ports. Login links use the public app port (3000), because the Vite-only login route loops through the public-route bridge in the current app.

To use **Open Expo web logged in**, run Expo web alongside the main Docker stack from this checkout:

```powershell
docker compose -f docker-compose.dev.yml -f developer-playground/expo-web.compose.yml up -d --build
```

Expo web is at `http://localhost:8082`. The directory signs in via the local backend cookie, then opens Expo web with a development-only `playground=1` flag that discards any previous Expo browser session and restores the new account. No password or token is put in the URL. This does not sign in the native phone/emulator app.

Seeding uses the real Django models and an atomic database transaction. IDs and `record-ids.json` identify records the seeder owns. It refuses to overwrite untracked IDs. Bulk writes skip notification signals; required relationships and chat participants are created explicitly. Seeding restores baseline fixtures, does not delete extra records created while testing, and is **not** a complete database reset. Keep `record-ids.json` with the database. Back up the database before migrations for incompatible PRs. Do not run concurrent seeds or change accounts during a seed.

## Portraits and assets

Images were generated with Higgsfield GPT Image 2.5, using the supplied images as visual style guidance, without copying the referenced people. The library has 36 uniform portraits, 36 business/casual portraits, and six content photos. Portraits are reused across accounts, with each selection matched to its role, planned name group and gender presentation. They are not 916 unique faces.

- Pharmacists and pharmacist owners: white pharmacy tunics.
- Assistants and technicians: blue pharmacy tunics.
- Students, interns and explorers: navy polos.
- Organisation and content team: business/smart casual clothing.

`assets/` contains the contact sheets and extracted JPEG cells. `prepare_assets.py` installs copies into local main's backend media directory. The directory has portraits for every account; the app's ORG_STAFF model has no profile-photo field, so organisation portraits are available in the directory only. Other supported profiles have their actual photo fields populated.

Generation job IDs:

- Business portraits: `0462612a-4620-4763-894c-a176dfa600e2`
- Content photos: `0bc554db-457b-43bd-9a33-09d355d3129a`
- Uniform portraits: `3e29b285-0f97-4721-a561-daa54d8539bd`

Prompt brief: natural Australian pharmacy photography, diverse fictional adult faces, six-column portrait grids, role-specific white tunics / blue tunics / navy polos, and pharmacy/team/study/equipment scenes. The role and culture mapping is explicit in `seed.py`; no ethnicity is inferred from real reference people.

## Local boundaries and limitations

### Repository boundaries

The reusable developer kit, synthetic snapshot, deterministic seed tooling and generated assets are versioned in `developer-playground/`. Runtime logs, bytecode caches, local environments, database files, process IDs and downloaded installers are not versioned. Keep new machine-local output in ignored paths and never point these settings at a shared or production database.

`local_settings.py` only accepts a loopback database named `chemisttasker_preview`. It uses filesystem media, in-memory email and task queues, and disables configured payment, SMS and external verification credentials. It does not run a worker. Email delivery, SMS, payments and live registration verification are therefore not end-to-end tested. Do not deploy these settings, assets, credentials or seed data.

All IDs, addresses, contact details and verification states are synthetic. No real identity documents, tax IDs, bank details or professional registrations are created. Financial values are examples. Ethical stock transfer history is a UI state fixture, not a complete regulated stock ledger; no jurisdiction operation policies have been approved, so policy-sensitive actions remain intentionally blocked. Hardware kiosk, offline attendance, payroll processing, billing subscriptions and external integrations are not populated or verified by this seed.

The directory is a seed-time snapshot. App mutations do not immediately update its state. Re-running the seed refreshes it **and restores fixture data**, so use the app to inspect changes you want to retain.

Validation output: `verification.log`. A browser smoke check also confirmed owner login and a populated owner dashboard, account search and details, and visible role-appropriate photos.
