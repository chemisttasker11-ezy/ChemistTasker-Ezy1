#!/usr/bin/env node
import { execFileSync } from 'node:child_process';

const targets = [
  'frontend_web/src',
  'frontend_web/landing_next',
  'frontend_mobile',
];

// Domain routes belong in @chemisttasker/shared-core. Runtime bootstrap files
// may configure an API origin, but feature code must not construct backend
// domain routes or use generic shared-core escape hatches.
const routePattern = /(?:['"`])(?:https?:\/\/[^'"`]+)?\/(?:api\/)?(?:users|public-hub|content|marketplace|ethical|client-profile|billing|account)\//;
const escapeHatchPattern = /\b(?:marketApi|ethicalApi)\s*(?:<[^>]*>)?\s*\(|\b(?:chemistTaskerApi\.(?:publicContent|contentManagement|marketplace|ethicalMarketplace)|(?:marketplaceApi|ethicalMarketplaceApi))\.request\s*(?:<[^>]*>)?\s*\(/;
// Authenticated operational domains are intentionally owned by legacy api.ts.
// Do not reintroduce them through the request-scoped Next/platform facade.
const operationalPlatformPattern = /\bchemistTaskerApi\.(?:workforce|attendance|rosterV2)\b/;

function resolveBase() {
  const configured = (process.env.SHARED_CORE_AUDIT_BASE || '').trim();
  if (configured && !/^0+$/.test(configured)) return configured;
  try {
    return execFileSync('git', ['rev-parse', 'HEAD^'], { encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}

const base = resolveBase();
if (!base) {
  console.log('Shared-core boundary audit: no comparison base is available; nothing to ratchet.');
  process.exit(0);
}

let diff;
try {
  diff = execFileSync(
    'git',
    ['diff', '--unified=0', base, 'HEAD', '--', ...targets],
    { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 },
  );
} catch (error) {
  console.error('Shared-core boundary audit could not inspect the changed client lines.');
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

const findings = [];
let currentFile = '';
for (const line of diff.split(/\r?\n/)) {
  if (line.startsWith('+++ b/')) {
    currentFile = line.slice('+++ b/'.length);
    continue;
  }
  if (!line.startsWith('+') || line.startsWith('+++')) continue;
  const added = line.slice(1);
  if (routePattern.test(added) || escapeHatchPattern.test(added) || operationalPlatformPattern.test(added)) {
    findings.push({ file: currentFile || '(unknown)', text: added.trim() });
  }
}

if (findings.length) {
  console.error(`Shared-core boundary audit failed: ${findings.length} new client bypass(es) introduced.`);
  for (const finding of findings) console.error(`${finding.file}  ${finding.text}`);
  console.error('Rule: add/reuse a named @chemisttasker/shared-core operation instead of adding a client-local backend route.');
  process.exit(1);
}

console.log('Shared-core boundary audit passed: no new client bypasses; reductions are allowed.');
