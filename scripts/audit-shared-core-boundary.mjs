#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

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

const root = path.resolve(import.meta.dirname, '..');
const ignoredDirs = new Set(['node_modules', 'dist', 'dist-kiosk', '.next', '.expo', 'build', 'coverage']);
const extensions = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);

function walk(directory, output = []) {
  if (!fs.existsSync(directory)) return output;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && ignoredDirs.has(entry.name)) continue;
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(fullPath, output);
    else if (extensions.has(path.extname(entry.name))) output.push(fullPath);
  }
  return output;
}

// Operational ownership is not legacy debt: after CP1 there must be zero
// Vite/mobile clients using the Next/platform facade for these domains.
const operationalFindings = [];
for (const target of ['frontend_web/src', 'frontend_mobile']) {
  for (const file of walk(path.join(root, target))) {
    const relative = path.relative(root, file).replaceAll('\\', '/');
    const source = fs.readFileSync(file, 'utf8');
    source.split(/\r?\n/).forEach((line, index) => {
      if (operationalPlatformPattern.test(line)) {
        operationalFindings.push({ file: relative, line: index + 1, text: line.trim() });
      }
    });
  }
}
if (operationalFindings.length) {
  console.error(`Shared-core ownership audit failed: ${operationalFindings.length} operational platform-facade use(s) remain.`);
  for (const finding of operationalFindings) console.error(`${finding.file}:${finding.line}  ${finding.text}`);
  console.error('Workforce, Attendance and Roster V2 must use the authenticated api.ts shared-core exports.');
  process.exit(1);
}


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
