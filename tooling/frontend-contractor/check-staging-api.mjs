#!/usr/bin/env node
// Anonymous read-only API sanity check. Never tests against ChemistTasker production.
const raw = process.argv[2];
if (!raw) { console.error('Usage: node scripts/check-staging-api.mjs https://your-staging-host'); process.exit(2); }
try {
  const url = new URL(raw);
  if (url.protocol !== 'https:' || url.username || url.password ||
      ['chemisttasker.com.au', 'www.chemisttasker.com.au', 'backend.chemisttasker.com.au'].includes(url.hostname) ||
      !/staging|preview|trycloudflare|dev|test/i.test(url.hostname)) {
    throw new Error('Use only an HTTPS staging/test host, NEVER a production host');
  }
  const origin = url.origin;
  const app = await fetch(`${origin}/api/v1/users/mobile/app-config/`, { signal: AbortSignal.timeout(15000) });
  if (!app.ok) throw new Error(`App config API HTTP ${app.status}`);
  const identity = await fetch(`${origin}/api/v1/users/me/`, { signal: AbortSignal.timeout(15000), redirect: 'manual' });
  if (![401,403].includes(identity.status)) throw new Error(`Anonymous identity must reject access, got HTTP ${identity.status}`);
  console.log(`PASS: ${origin}: app config HTTP ${app.status}, anonymous identity HTTP ${identity.status}`);
} catch (error) { console.error(`STAGING CHECK FAILED: ${error.message}`); process.exitCode = 1; }
