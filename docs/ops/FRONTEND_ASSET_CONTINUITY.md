# Dashboard assets across staging deployments

On 2026-11-03 an already-open dashboard ran `app.B9RddmC9.js` after the
frontend was replaced by the c115a0ff release (`app.2hBshiuB.js`). Navigation
then requested retired chunks, including ChatPage and shared controls, and
received 404. The failure affected dashboard routes generally. A hard refresh
was only a workaround. No service worker is registered by the web app.

The immediate staging repair restored 231 missing public hashed assets from
the saved previous frontend image. All 299 current assets were preserved.
Public HTTPS verified all 231 restored files by SHA-256 and verified current
HTML with `Cache-Control: no-store`. Only frontend static files/config changed;
its container identity/start time and all application/data services were kept.
Private operational evidence is outside the repository under the release record.

## Permanent behavior

- HTML, including deep-link fallback to index.html, uses `no-store`.
- Current build assets retain their existing immutable 30-day cache policy.
- Staging mounts `staging_frontend_assets` at `/var/cache/chemisttasker-assets`.
  The frontend startup hook archives current `js/` and `dashboard-assets/` files
  before NGINX starts. A missing current asset can be served from this archive.
- Current content wins; changed bytes at an existing archive filename fail
  startup. An atomic active-file manifest stamps the previous release at retirement,
  so a long-running release receives its full 31-day grace period. Imported
  files are stamped at adoption instead of trusting their original mtimes.
  Active assets are refreshed before retired files older than 31 days are pruned. HTML is never archived. The archive is public build content only.
- Tabs left open longer than the retention window may require the existing
  Reload page recovery action. Do not automatically reload unsaved user forms.
- Production has no archive mount in this change; adopting the same volume
  there belongs to its separately approved rollout. HTML policy applies to any
  deployment using the shared frontend image.

## First adoption on an existing staging installation

Before replacing the old frontend for the first time, seed the new dedicated
archive volume with that frontend's `js/` and `dashboard-assets/` directories.
For this release include the previous-version files restored by the incident
repair. Copy only these public directories; never index.html, env files or
backend/media data. Check matching filenames have identical bytes. Ensure archive directories are
0755 and public files are 0644 so NGINX workers can read imported content. Record the
volume name, input container/image and file hashes in the private release log.
Do not remove this volume during normal deploys or rollback. Startup refuses
an empty archive by default. For a genuinely new installation with no previous
frontend only, set `STAGING_ALLOW_EMPTY_FRONTEND_ARCHIVE=1` on the deployment
command; keep it unset for upgrades. The guard prevents a successful unseeded
upgrade, but seed before starting the release to avoid an interrupted cutover.

After deployment verify current HTML is uncached, both previous and current
hashed URLs return their exact content, unknown assets remain 404, and normal
in-app navigation succeeds. Run `python scripts/test_staging_assets.py` on a
Docker-capable Linux host. This exercises real NGINX with two releases, archive
expiry, current-content preservation, collision rejection, deep-link headers,
missing-file behavior and gateway gzip negotiation.

References: [Vite load errors](https://vite.dev/guide/build.html#load-error-handling)
and [NGINX response headers](https://nginx.org/en/docs/http/ngx_http_headers_module.html).

## Independent review and validation

Claude B reviewed the implementation twice. Its first review found two
retention-timestamp defects (long-running releases and epoch-zero imported
files) and an empty-archive adoption gap. The active manifest, adoption stamp
and fresh-install guard address all three. Rereview found no actionable defect.

Validation before push: two pinned-image NGINX tests passed, six Compose resource
contracts passed, and the new HTTP regression failed with the original config.
The incident repair also passed public exact-byte checks for all 231 restored
files. In the existing authenticated Chrome session, Overview, Chat, Invoices,
Profile and Attendance rendered without the retired-chunk exception.
The final deployment must additionally verify complete seed contents and real
image startup as root. This static-hosting fix does not certify the separate
native iOS workspace-switch/PDF-share acceptance gate.
