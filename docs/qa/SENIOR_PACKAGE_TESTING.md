# Senior package testing — ChemistTasker permanent handbook
Invocation: **"Senior package testing"**. Created 2026-10-14.

This named procedure is the mandatory comprehensive senior package for an active ChemistTasker PR. The full reusable package is archived in the user's Library at `/ChemistTasker/Senior-package-testing-skill.zip` and `/ChemistTasker/Senior-package-testing-handbook.md` and can be installed as a ChatGPT Skill. Refer to those files for exact commands and the complete ~24 KB runbook.

## Repeatable start-to-finish process

1. Identify exact PR, base/parent stack, current `head_sha`, affected files, reviewer comments, handovers, accepted owner decisions and previous CI runs. Use connected GitHub tools if local git/network is unavailable.
2. Senior-review frontend Vite/Next/Expo, shared-core skills and domain ownership, Django models/views/serializers/migrations, role/permission and data privacy contracts, kiosk and auth flows page by page. Fix defects in owning domain with targeted regression tests; do not freeze superseded PR behavior without reasoning.
3. Run current workflow gates: `.github/workflows/shared_core_consolidation_ci.yml`, `backend_finalization_contracts.yml`, `serializer_decomposition_contracts.yml`, security/static/mobile lint, `e2e_runner_smoke.yml`, `frontend_e2e_manual.yml`, and `pr172_full_qa.yml` where applicable. Inspect each job, steps and failing log; do not infer pass from a green unrelated workflow.
4. Reproduce isolated container QA with `bash scripts/run-staging-qa.sh` on Docker + Node 22 + Python 3.12 + PostgreSQL 16. **Correct Docker context**: `docker build -f backend/Dockerfile -t chemisttasker-qa-backend:local .`; Dockerfile COPY needs backend/ and shared-core/ from repository root. Test on disposable DB only.
5. Execute browser Playwright fixture and integration paths, including live Vite→Next and authenticated Docker tests. Windows 390/1440 light/dark visual baselines run using `cd frontend_web/e2e && npm test -- frontend-appearance.spec.mjs --workers=2`. Never silently auto-approve screenshots or mask real input movement. Capture proposed baselines separately, review them, update only intentional changed goldens, rerun original gate.
6. Perform exact-head SQLite/PostgreSQL tests, migration drift, concurrency, fresh install and populated upgrade. Rehearse migration against isolated restored snapshot after backup and written data-impact authorisation. PR171 migration 0080 destroys duplicate AHPRA fields; PR173 compatibility preserves *historical* duplicates and blocks new claims. If 0080 already ran, an edited source migration will not restore lost data.
7. Run Android emulator and iOS simulator native acceptance in `native_mobile_acceptance.yml`; track real physical-device acceptance independently. Stage/deploy only with explicit authority and safe migration/data environment; never merge PR just to force staging deployment.
8. Verify all required workflows succeed on the final head (not a superseded SHA). Record PR URL/SHA, exact commands and runners, passed/failed/skipped counts, artifacts, screenshots, run/job IDs, migration/device/staging status and explicit MERGE-READY or NOT MERGE-READY. Do not merge or deploy without owner authorisation. Update the handover after each session.

## Historical lessons, PR 171–173

- Candidate Playwright fixtures must use canonical registry codes, while the UI shows the canonical display label `Prescription dispensing`, not raw `PRESCRIPTION_DISPENSING`.
- PR172 Linux functional browser suite had **136 passed, 27 skipped, zero failed** on an earlier head; separate Windows appearance still failed four Shift Centre screenshots. These results are historical, **not current-head proof**.
- Shift Centre redesign intentionally moved desktop date controls +90px versus previous approved goldens; inspect and explicitly approve new visuals instead of weakening comparison.
- Five nested mobile tabs can clip at 390px; assert no overlap/scroll-width overflow and check current MUI `.MuiTabs-list`.
- Snapshot candidate job must use the canonical `npm test` runner, which builds and starts Vite preview; bare `npx playwright test` causes `ERR_CONNECTION_REFUSED`.
- CI builds must use Docker repository-root context, not `docker build backend`.
- Never substitute native simulator for actual device or synthetic Postgres test for backup-backed staging migration.

## Minimum release evidence template

| Gate | Required evidence |
| --- | --- |
| Backend/SQLite, serializer, PostgreSQL/concurrency | exact SHA, workflow/job link, test counts |
| Shared-core, Vite, Next, Expo, architecture and security | exact SHA, passing logs |
| Playwright fixture, live browser and Windows visuals | pass/fail/skip, screenshots/traces and reviewed goldens |
| Docker QA and migration | isolated DB identity, safe backup/recovery proof |
| Android, iOS, physical device | separate statuses, exact source and emulator/device evidence |
| Staging | authorised deployment/snapshot status and smoke evidence |
| Final merge decision | all required gates PASS, exact head SHA and explicit authorisation |

**Zero unsupported assertions:** Pending, skipped or inaccessible steps remain pending/blocked, never marked green. Keep the execution going while tools are available; provide concrete status rather than repeatedly asking the owner to supervise.
