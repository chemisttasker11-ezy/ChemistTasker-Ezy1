# Staging Redis role isolation

This change is staging-first. Production/shared Redis config stays unchanged until a separately accepted maintenance window.

| Role | Service/database | Policy |
|---|---|---|
| Celery broker/results | existing redis DB2/DB3 | AOF, noeviction |
| Security attempts, OTP and locks | existing redis DB4 | AOF, noeviction |
| AHPRA request/recheck limits and coordination | existing redis DB1 (`ahpra` alias) | AOF, noeviction |
| Channels delivery | redis_cache DB1 | disposable, allkeys-lru |
| Verifier heartbeat hints | redis_cache DB0 (`verifier_presence` alias) | disposable, allkeys-lru |
| Default Django cache | process LocMem | unchanged |

Presence is a routing hint with a 120-second TTL. Redis errors on presence reads/writes are logged and treated as a missing hint; protected rate-limit/security operations do not use this fallback. Its loss may route a check through the bridge; persisted checks and verified results remain in PostgreSQL. No rate-limit, OTP, queue or deduplication keys are moved into the evicting service. Channels outages or eviction can lose delivery/group membership; a healthy HTTP endpoint does not prove websocket delivery. Verifier heartbeat dispatch also polls persisted checks, but other clients may need an explicit reconnect/reload to restore group membership. Presence fallback alone does not repair an unavailable channel layer. This is not a durable event bus.

## Maintenance sequence (after R2)

Ordinary releases deliberately use `--no-recreate` for existing Redis. Merely merging this Compose file does **not** change the running protected service's eviction policy. Complete this named maintenance before reopening traffic.

1. Hold the same private `STAGING_OPS_DIR/deploy.lock` used by deploy and DB refresh. Verify the reviewed SHA and clean environment. Build the application image before downtime. Record existing Redis container/image/volume identity and all protected URLs without printing credentials. Record queue length/unacked counts and protected key counts, never task payloads or secrets.
2. Pull/create only `redis_cache`; verify its health and memory policy. Do not recreate the existing Redis service yet.
3. Stop beat, gracefully drain active workers, stop web and any other publishers/verifier consumers. Abort rather than force-kill an active writer. The release script's drain/backup logic is the reference. Do not consume outbound queues just to empty them.
4. With all writers paused, take a same-version Redis backup using `redis-cli SAVE`, then archive the existing Redis data volume (including the complete appendonlydir manifest and AOF files). Verify an isolated restore before proceeding. Retain the original volume and archive. Back up PostgreSQL too. A logical count alone is not a validated backup.
5. On the existing protected Redis process, run `redis-cli CONFIG SET maxmemory-policy noeviction` and verify `CONFIG GET maxmemory-policy`; this keeps its container, addresses, data and queue intact. The checked-in Compose command ensures a future intentional recreation retains noeviction. A simple restart of an old container still uses its old command: apply/verify the policy on every restart until an approved recreation has occurred.
6. Run the reviewed one-shot migration/static preparation and start matching web/worker/beat images with the new explicit aliases. The release and refresh scripts explicitly start/wait for `redis_cache` before starting applications with `--no-deps`. Both refuse to pause writers while the protected Redis still reports an evicting policy; complete step 5 first. Verify protected queue/key counts, existing security attempts and AHPRA limits; exercise Channels reconnect and heartbeat recovery. Only then resume beat/publishers and record acceptance.

Never use FLUSHDB/FLUSHALL, prune volumes, migrate queued task payloads or reset counters during cutover. Existing broker/security/AHPRA state remains at the original DB numbers. New settings default to the historical Channels URL outside this staging topology, preserving other environments until their own migration.

## Failure and capacity

Noeviction makes a full protected Redis reject writes explicitly; it does not create infinite queue capacity. Alert on used_memory/maxmemory, rejected writes, queue/unacked age, task retry failures and evictions. Existing Django/Redis errors must not be treated as a successful security check. Keep memory headroom for AOF buffers/fork copy-on-write and measure the budget before rollout (R6). Do not shrink below current use.

Validate low-memory pressure with disposable isolated Redis instances: only cache keys may evict; protected counters and queued test work survive, a new oversized write fails visibly, and persisted no-op test work remains after a clean restart. Delivery is at least once; task effects must remain idempotent.

Rollback pauses writers and reconnects matching application images to the preserved protected state. Do not return queue/security traffic to an evicting policy. Presence can rebuild; protect any post-cutover security state instead of restoring an older counter snapshot over it. Restore a backup only through an explicit, reviewed recovery procedure.

Presence has 1-second connect/read timeouts. Channels uses a 1-second connect timeout and 10-second socket timeout, exceeding its 5-second blocking receive wait. A notification outage does not undo the committed check or create a false enqueue failure: verifier heartbeat polling recovers dispatch. Protected rate-limit failures remain explicit.
