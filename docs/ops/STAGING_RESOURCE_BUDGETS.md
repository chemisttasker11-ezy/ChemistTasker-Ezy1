# Staging resource budgets and acceptance

These are initial staging runtime bounds, not production sizing certification. They live only in `docker-compose.staging.resources.yml`; normal releases use the base Compose and do not adopt these new limits. They follow the 2 November 2026 read-only 12-sample baseline and must pass representative load before staging rollout. Production/shared Compose is unchanged. Source limits do not prove an existing container has adopted them.

Observed host: 8 logical CPUs, 31.13 GiB RAM, 27.58 GiB available and no swap use during the sample. Container identities/restart counts were unchanged. This is idle evidence, not a peak-load forecast.

| Service | Observed peak MiB | Initial memory MiB | CPUs | PID limit |
|---|---:|---:|---:|---:|
| PostgreSQL | 89.9 | 1024 | 0.75 | 128 |
| Protected Redis | 6.3 | 768 | 0.25 | 64 |
| Disposable Redis | new service | 160 | 0.25 | 64 |
| Web | 152.8 | 1024 | 1 | 128 |
| One-shot migration | new owner | 1024 | 1 | 128 |
| Celery worker | 254.3 | 1536 | 1 | 128 |
| Celery beat | 135.1 | 384 | 0.25 | 64 |
| Vite NGINX | 7.7 | 128 | 0.25 | 64 |
| Next | 64.9 | 768 | 0.75 | 128 |
| Staging gateway | 7.7 | 128 | 0.25 | 64 |

Default maxima total 6944 MiB (6.78 GiB) and 5.75 CPUs, including the one-shot migration. R2 pauses web/workers during migration, so those owners do not normally peak together. This leaves over 24 GiB and 2.25 CPUs outside staging runtime caps for production, OS and headroom on the measured host. CPU quotas are upper bounds, not dedicated reservations; builds and Docker/host processes are outside these service limits. Do not use these numbers to justify concurrent heavy builds on the shared VPS.

The worker retains concurrency 2 and prefetch 1. Its 1.5 GiB allowance covers parent/children and PDF/image work with headroom over the observed baseline. Beat has separate memory. Protected Redis keeps dataset maxmemory 256 MiB with 768 MiB container headroom for AOF buffers/rewrite/fork overhead; this is not a promise that any rewrite fits. Disposable Redis has 96 MiB maxmemory with 160 MiB process allowance. Never reduce a live limit below current use, and measure PostgreSQL connections/query work before applying its cap.

After representative-load acceptance, opt in explicitly in the release process:

```bash
STAGING_RESOURCE_BUDGET_APPROVED=1 bash scripts/deploy-staging.sh --expected-sha "$REVIEWED_SHA"
```

The same process flag applies to DB refresh. Continue using the flag for later releases after adoption. Both scripts inspect only existing staging Memory/NanoCpus/PidsLimit fields and refuse an unflagged release that would silently remove existing bounds (the disposable Redis baseline is excluded). To roll back, use the reviewed runtime-limit procedure, not an omitted flag. It is deliberately a shell-level acknowledgement: placing it only in an env file does not enable the overlay. Both scripts validate the fully resolved overlay with the actual four operator env files before any build, writer pause or database change. Invalid per-owner limits, aggregate budgets, log bounds or Redis headroom are refused without printing environment values. The CI check exercises the same validator. Actual adoption still requires inspecting HostConfig and the named infrastructure maintenance below.

Each service accepts explicit `STAGING_<SERVICE>_MEMORY_LIMIT`, `_CPUS`, `_PIDS_LIMIT` overrides (for example STAGING_CELERY_WORKER_MEMORY_LIMIT). Changing an override requires reviewing the aggregate budget and preserving host reserve. Existing env values are not rewritten. With the accepted overlay all staging services use json-file logs bounded to 10m x 5; ten owners therefore have a configured upper log envelope of approximately 500 MiB, excluding removed-container logs and filesystem overhead. Existing unbounded log configs need a separately reviewed recreation; Docker update cannot change logging.

## Local gates

- `python scripts/test_staging_resources.py` parses the real Compose with dummy inputs, verifies finite runtime limits, aggregate headroom, bounded logs and Redis memory margin, and checks the sampler unit conversion.
- `python scripts/measure-staging-resources.py --samples 12 --interval 2 --label idle` only reads known staging Docker stats/identities and host memory; it does not emit env/log content or change a service. It includes `chemisttasker_staging_migrate` when started while that short-lived owner is running; it cannot recover metrics for a completed container. Repeat with labels for the actual observed workload, retaining raw evidence privately.
- Run `scripts/profile-backend-resources.py --run-disposable-workload --workers 2 --repeats 3` only in an isolated test container with a finite memory/CPU/PID cap and network disabled. It exercises the actual invoice PDF contracts, actual first-page PDF-to-image conversion and actual OCR response parsing using a captured synthetic provider response. It reports cgroup peak/OOM events and child RSS. It never uses a real provider, database or broker. A synthetic pass does not certify production input sizes, queue behavior or load.

## Staging acceptance before applying limits

1. Pin the reviewed image/source, collect the bounded idle and representative request/task sample, and record production/host consumption read-only. Use public routes, authenticated scoped reads, representative DB queries and captured-provider PDF/OCR jobs. Do not send live outbound messages or card payments to create load.
2. In a capped disposable copy, run the same workload with these budgets and concurrency. Record p95/peak RSS, latency, CPU throttling, queue/unacked age, task failures/retries, OOM/restart counts and database health. Exercise Redis persistence/rewrite using disposable state. Require no OOM kills/restart loop, no sustained queue aging and acceptable product latency. Keep at least 25% memory headroom over the largest observed workload; raise only a measured constrained owner and recalculate reserve if it fails.
3. Hold the shared maintenance lock. Keep PostgreSQL/protected Redis volumes and container identities. R2 deliberately uses --no-recreate for data services and restarts the existing gateway: it will not silently apply new resource/log settings to them. Use a named, reviewed maintenance to adopt limits, preferably Docker update for runtime caps on the existing IDs. Gateway image/log recreation requires the R7 route-preservation plan; data-service log recreation requires a backup/restore rehearsal. Never use compose down, prune or volume replacement.
4. Deploy application owners in R2 order. Inspect actual HostConfig Memory, NanoCpus, PidsLimit and LogConfig for every owner (including one-shot migration while present); compare with the reviewed Compose. Recheck volume/network/container identities and health. A successful Compose parse alone is not acceptance.
5. Repeat representative load under the actual limits. Alert on memory above 75% sustained, any OOM, repeated restart, rejected protected Redis writes, sustained CPU throttling/queue aging, low host memory or disk/log pressure. Match grace/drain timeouts to measured long tasks; web/worker have a 120s stop grace, and R2 aborts rather than force-killing a writer that exceeds its drain window.

Rollback restores prior runtime limits on the same recorded container IDs, or raises only the measured constrained owner; recheck headroom, health and volumes. A log-driver rollback needs its own controlled recreation. No database migration, provider call or production/shared service update is part of this package.


## Concrete resource rollback

A resource rollback does not restore the database or remove containers/volumes. Keep the overlay active while reverting a constrained owner to its previous accepted finite budget.

1. Retain the pre-change container IDs and HostConfig Memory, MemorySwap, NanoCpus, PidsLimit and LogConfig in the private release record. Confirm the same owners still exist; pause affected writers gracefully if capacity is unstable. Never shrink below observed use.
2. Persist the previous accepted memory/CPU/PID overrides in `env/staging.runtime.env`, changing only the affected owner. If that old budget was insufficient, raise just that owner with measured headroom and recheck the 8GiB/6CPU envelope. Do not silently fall back to unlimited defaults. The same resolved-budget validator runs before any flagged release.
3. For application owners, rerun the reviewed SHA with `STAGING_RESOURCE_BUDGET_APPROVED=1`. R2 serializes the release, backs up before migrations and preserves data/gateway identities. Keep the approved overrides in the runtime env for subsequent releases.
4. For PostgreSQL/protected Redis/gateway runtime caps, apply the accepted tuple to the exact recorded ID in the named maintenance window, including a compatible MemorySwap value; Docker update can change runtime caps, not logging. Inspect the resulting HostConfig, health, OOM/restart count and volume/network identities. Do not substitute a container name for an unverified ID or remove bounds as an implicit rollback.
5. Verify request/task latency and queue age recover before resuming publishers. A logging/image rollback still needs the separate controlled recreation and route/backup plan; it is not performed by this resource procedure.

The refresh static job uses the same fixed `chemisttasker_staging_migrate` name as deploy, so it can be sampled while running. A pre-existing running owner blocks refresh before any service/database change, even if an earlier client lost its release lock.
