# ChemistTasker — secure frontend contractor handover

**Target:** a private, fresh-history GitHub repository containing React/Vite, Next.js, Expo React Native and frontend `shared-core`, with a separately hosted disposable Django staging API, plus owner-controlled upstream import.

## Verified source-state (11 October 2026)

- Source: `chemisttasker11-ezy/ChemistTasker-Ezy1`; GitHub now reports **PRIVATE**. Keep it private and do not grant the contractor access.
- Current `main`: `44bce2db2f4714a6b31c70dfbde526b4f0d7aa25` (at latest inspection). PR **#160 is MERGED** as of 10 October 2026. Export from the latest reviewed `main` checkout.
- Web apps: `frontend_web/src` (Vite) and `frontend_web/landing_next` (Next). They require `shared-core/`, `scripts/prepare-shared-core.mjs` and `scripts/run-with-env.mjs`.
- Expo React Native INCLUDED in handover. Contractor-only `app.config.js` disables production EAS OTA updates and Firebase production plugins. The Rust/Tauri kiosk runtime, EAS release profiles and production mobile signing credentials remain excluded.
- Staging configuration exists: `docker-compose.staging.yml` with isolated Django/PostgreSQL/Redis/Celery and the OVH self-hosted `staging-preview.yml` workflow. Existing preview uses a temporary Cloudflare Quick Tunnel URL; this **is not** a stable contractor backend.
- Existing private destination repo is `chemisttasker11-ezy/ChemistTasker_Front`; visibility was confirmed PRIVATE. OVH tunnel/DNS has not been changed. Neither action can be completed using a GitHub source-code-only connector without an authenticated owner administration workflow.

## 1. Security must happen before onboarding

1. The source repository visibility has been changed to **Private**; verify it remains private before onboarding. This does not remove historical forks/clones. Do not grant the contractor access to the source repository.
2. Review GitHub Code Scanning / Secret Scanning and historical Git blobs, rotate any live secrets that were ever published. Assume historical exposure until investigated; do not rely only on a clean current tree.
3. Keep GitHub default branch protected. Only a trusted owner/admin may add secrets or deploy to production. Do not grant contractor account admin rights.
4. If converting visibility affects GitHub Actions, forks, security updates or collaborators, revalidate CI and permissions.

## 2. Fresh private frontend repository

Prerequisites: source checkout on the owner's computer at the accepted `main` commit, Node 22, Git, GitHub CLI (`gh`), and authenticated owner access. **Do not fork. Do not copy `.git`.**

**Primary approach:** use the private owner's **Frontend Contractor Initial Export** workflow after merging its PR. To grant the one-time workflow write access, create a short-lived fine-grained PAT limited to `chemisttasker11-ezy/ChemistTasker_Front` with `Contents: Read and write`. Put it in the original owner's GitHub Actions secrets as `FRONTEND_DEST_WRITE_TOKEN`. Never share it with the contractor or put it in ChatGPT. Run the workflow manually once, then revoke the PAT.

**Alternative owner-run PowerShell (uses owner's local `gh auth`):**

```powershell
.\scripts\bootstrap-private-frontend.ps1 -SourceRepo 'C:\ChemistTasker\ChemistTasker-Ezy1'
```

This checks both repositories are private, exports frontend-only files into a fresh temporary directory and appends one clean frontend-only commit to the existing destination's README-only Git history. It does **not** overwrite an in-use frontend repository. Do not use a fork or bring the owner `.git` history across.

After creation, confirm visibility **PRIVATE**, enable required PR reviews and CI checks, restrict Actions workflow modifications, invite the contractor as **Write** collaborator **only to this repo**, and do not give them source-repo deploy keys or tokens. Remember: a GitHub private repo still gives authorized collaborators access to every file and commit in that repo.

## 3. Staging backend ownership (trusted infrastructure operator only)

Use `docker-compose.staging.yml` on OVH (not the production DB). Provide a stable dedicated hostname, e.g. **`https://api-staging.chemisttasker.com.au` (not configured/verified)**, using a named Cloudflare Tunnel with the correct DNS record or a guarded HTTPS reverse proxy. Do not keep using a rotating Quick Tunnel for a long-lived developer environment.

- Keep staging in an isolated PostgreSQL DB, Redis namespace, Celery worker, media volume and identity/account set; never restore personally identifiable production records unless fully anonymized and explicitly approved.
- Strict settings: Django `DEBUG=False`, `ALLOWED_HOSTS` for the staging hostname, `CORS_ALLOWED_ORIGINS` and `CSRF_TRUSTED_ORIGINS` for the actual developer origins (`http://localhost:3000`, `http://localhost:5173` if needed), secure cookies, configured proxy headers, origin checks for `/ws`, HTTPS. Test real cookie refresh/CSRF against the reverse proxy. Avoid wildcard CORS and permissive development settings on the public internet.
- Disabled/sandboxed: payments, SMS/phone validation charges, outbound email, real pharmacy invitations, scheduled notifications, OCR/verification systems, scraping/vendor API quotas. Use restricted test keys for Maps/recaptcha where necessary.
- Seed test-only accounts for Owner, Organisation Admin, Pharmacist, Other Staff and Explorer, with role-specific pharmacy/shift/roster/chat/marketplace records. Distribute those test credentials privately, not in GitHub or chat.
- Gate the service behind approved network/IP/VPN/Access controls where practical, rate-limit login, monitor logs and backups, and prevent uploads or callbacks affecting production.
- Confirm public `/api/v1/users/mobile/app-config/`, rejection of anonymous `/api/v1/users/me/`, login + CSRF refresh, onboarding, API WebSocket upgrade, media routing and Next BFF proxy. In the contractor repo run `node scripts/check-staging-api.mjs https://YOUR-STAGING-HOST` as the first anonymous smoke test.
- Keep the canonical frontend-facing API root: `https://YOUR-STAGING-HOST/api/v1`. `frontend_web/scripts/dev-all.mjs` reads `env/web.dev.env` and proxies requests. Keep credentials and real service keys out of `VITE_` and `NEXT_PUBLIC_` env variables.

**Operational note:** the current staging Docker/Cloudflare setup creates a temporary tunnel inside `scripts/deploy-staging.sh`; a named tunnel cutover must be configured and proven separately. This toolkit does not claim to deploy it.

## 4. Upstream / downstream PR review

**Owner → contractor:** export a new allowlisted snapshot only into an empty directory. Inspect differences; do not blindly overwrite contractor work. Sync work through approved PRs instead of force-pushing the private repo.

**Contractor → owner:** approve the contractor PR, check green UI tests, and use a trusted local source checkout + clean contractor clone:

```sh
# From original FULL repo, preferably on a fresh branch:
node /path/to/toolkit/scripts/frontend-contractor-bridge.mjs import --source . --from ../ChemistTasker-Frontend
# Displays only; does not modify anything.
node /path/to/toolkit/scripts/frontend-contractor-bridge.mjs import --source . --from ../ChemistTasker-Frontend --apply
# Inspect git diff -- frontend_web shared-core scripts/prepare-shared-core.mjs scripts/run-with-env.mjs
```

Then open a new **monorepo** PR. Run all backend/architecture/security/Playwright/mobile release gates and staging journeys. The contractor repo cannot directly PR into the owner repo: they have separate Git histories and must use this controlled sync. Import never updates the `backend` folder, infrastructure config or secrets, and refuses unexpected contractor history.

## 5. Known limitations / follow-up

- Frontend files (especially `shared-core`) may include non-secret **business rules/DTOs**; approve them for contractor visibility before sharing. A real frontend application still exposes its browser-visible API endpoints and request/response contracts; this is not the same as handing out Django code.
- Full end-to-end tests require a live stable staging backend; local frontend-only/contract tests cannot prove all real flows.
- GitHub branch protection and access invitation require owner administrative permission. Provisioning OVH/Cloudflare/DNS requires their respective authenticated accounts. No password or secret should be pasted into ChatGPT.
- PR #160 has merged; verify the newest reviewed `main` source SHA before generating the contractor's first snapshot. Do not export from an outdated local checkout.

## 6. Owner export into EXISTING private `ChemistTasker_Front` (recommended)

The owner-only source workflow `.github/workflows/frontend_contractor_initial_export.yml` exports web+Expo mobile+shared-core from the merged current `main`, scans for credential patterns, and pushes a **fresh-history snapshot** into the existing private frontend destination. Its source code runs only in the original trusted repo. The contractor has no read or CI access to that source repository.

1. On GitHub, create a **fine-grained personal access token** with repository access **ONLY** to `ChemistTasker_Front`, repository permission **Contents: Read and write**, expiry as short as practical. Keep it out of chat and code. No permission to original source is required.
2. In the ORIGINAL `ChemistTasker-Ezy1` repo → Settings → Secrets and variables → Actions → New repository secret, save this token as `FRONTEND_DEST_WRITE_TOKEN`.
3. Merge the reviewed export-workflow PR to the source repo's main branch and run **Actions → Frontend Contractor Initial Export → Run workflow**. This initial run ONLY accepts an empty/README-only target to avoid overwriting contractor work.
4. Confirm the destination remains PRIVATE and contains only `frontend_web`, `frontend_mobile`, `shared-core`, the two frontend scripts, generated frontend docs/config/tests and no `backend` directory. Check the destination frontend CI gates. Revoke the temporary PAT after successful initial export (reissue only for later controlled sync).
5. Invite contractor as Write collaborator to destination ONLY after baseline CI checks and staging-account isolation.

This workflow **cannot run until the token has been configured in the source repository**, and running the workflow cannot be triggered through the current GitHub source-code connector. It does not create or configure OVH infrastructure.
