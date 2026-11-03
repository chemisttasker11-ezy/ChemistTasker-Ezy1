# NGINX security maintenance: staging, frontend, shared TLS proxy

The candidate is the official 1.30.6-alpine image, pinned to the multi-platform
manifest digest verified through Docker Hub on 2 November 2026:

`nginx:1.30.6-alpine@sha256:0e52bd054126cdc040b1276c0af347aeb02a41b9cfe305d6094767ac30e97949`

References: https://nginx.org/news.html and
https://hub.docker.com/v2/repositories/library/nginx/tags/1.30.6-alpine .
This changes the staging gateway, the Vite runtime image base, and the shared TLS
proxy declaration. It is maintenance, not evidence of an exploitable incident.

## Before applying

Record the exact reviewed commit; pull/inspect the pinned image and retain the old
image IDs and a usable rollback tag. Privately preserve rendered live configuration,
certificate mounts, networks and upstream addresses. Compare live custom staging
routes against the repository template: do not overwrite an extra working route.
Run nginx -t in the candidate with production-shaped rendered config, both server
names and disposable certificates before replacing any running proxy. Include the
real WebSocket, BFF/API, media, upload and ACME routes in that validation.

## Staging first

Use the ordinary frontend-only release path for the rebuilt Vite image. A gateway
image change is an explicit maintenance operation: an ordinary application deploy
only restarts the gateway and deliberately never recreates it. Determine whether
the shared proxy reaches staging by DNS name or a literal address; recreation can
change the gateway's address even if its container name is unchanged. Preserve a
verified endpoint or deliberately update/test/reload the shared route as part of
this maintenance. Do not assume NGINX re-resolves an old upstream automatically.
Verify staging TLS, /login, a valid setup route, dashboard deep links, /api/v1,
/api/platform, /api/hub, WebSocket upgrade, static compression and cache behavior,
media and bounded upload behavior. Confirm secure cookie/CSRF/logout behavior.

## Shared proxy separately

After staging validation, schedule a shared-infrastructure window. This proxy
serves production and staging; replacement can briefly interrupt both and existing
WebSockets may reconnect. Apply only the named proxy update with its reviewed
networks, certificates, ACME and static mounts retained. Never compose down or
prune volumes, and never recreate PostgreSQL/Redis as part of this update.
Run nginx -t and both-host HTTPS/route smoke immediately after replacement; verify
the runtime version and image digest and check for new upstream/5xx failures.

## Rollback

Restore the exact prior image and configuration with the same mounts/network route,
then nginx -t and both-host smoke. Retest the staging upstream address after rollback.
Do not restore databases for a proxy-image rollback. Keep old artifacts until the
maintenance acceptance is recorded. A merged pin alone is not deployment evidence.


## Other release entrypoints

The DB-refresh script now cooperates with the staging release lock, starts the
existing gateway instead of recreating it, and checks its identity/address. It
preserves existing PostgreSQL/Redis instances and runs the public smoke afterwards.
It is still a destructive data-refresh operation requiring its own reviewed backup
and explicit operator authorization; this PR does not run it or certify a DB refresh.

The production frontend uses this Dockerfile too: its next ordinary image build
will pick up the new NGINX base after merge. Hold production frontend releases until
the staging frontend acceptance has passed. The gateway/shared proxy image changes
remain separate maintenance operations even if all declarations merge together.
The isolated gzip test reads the staging image reference, so future image updates
exercise the actual candidate rather than an obsolete test-only version.
