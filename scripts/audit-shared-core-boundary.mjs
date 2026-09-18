#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root = path.resolve(import.meta.dirname, '..');
const targets = [
  'frontend_web/src',
  'frontend_web/landing_next',
  'frontend_mobile',
];
const allowed = new Set([
  // Bootstrap/configuration may declare the API origin but should not own domain routes.
  'frontend_web/src/config-global.ts',
]);
const ignoredDirs = new Set(['node_modules', 'dist', 'dist-kiosk', '.next', '.expo', 'build', 'coverage']);
const extensions = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);
// Match both absolute `/api/...` routes and the relative `/<domain>/...`
// literals used with Axios instances whose base URL already ends at `/api`.
const routePattern = /(?:['"`])(?:https?:\/\/[^'"`]+)?\/(?:api\/)?(?:users|public-hub|content|marketplace|ethical|client-profile|billing|account)\//g;
// This digest records the reviewed legacy direct-route backlog. Strict mode
// fails on any added, removed or changed literal, so relative Axios/fetch
// routes cannot be introduced quietly while remaining migrations are explicit.
const REVIEWED_BASELINE_DIGEST = '5168552e6396b6e2dff321d78580d1473f5a4c3de660b6ae02934fabcb10ee1c';

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

const findings = [];
for (const target of targets) {
  for (const file of walk(path.join(root, target))) {
    const relative = path.relative(root, file).replaceAll('\\', '/');
    if (allowed.has(relative)) continue;
    const text = fs.readFileSync(file, 'utf8');
    text.split(/\r?\n/).forEach((line, index) => {
      if (routePattern.test(line)) findings.push({ file: relative, line: index + 1, text: line.trim() });
      routePattern.lastIndex = 0;
    });
  }
}

const digest = crypto.createHash('sha256')
  .update(findings.map(({ file, text }) => `${file}\t${text}`).sort().join('\n'))
  .digest('hex');

if (process.argv.includes('--baseline-digest')) {
  console.log(digest);
  process.exit(0);
}

if (findings.length === 0) {
  console.log('Shared-core boundary audit: no direct internal /api route literals found.');
  process.exit(0);
}

console.log(`Shared-core boundary audit: ${findings.length} existing direct internal API route literal(s) found.`);
for (const finding of findings) console.log(`${finding.file}:${finding.line}  ${finding.text}`);
console.log(`\nReviewed baseline digest: ${digest}`);
console.log('Migration rule: reuse/add the operation in @chemisttasker/shared-core before changing the client.');
if (process.argv.includes('--strict')) {
  if (digest !== REVIEWED_BASELINE_DIGEST) {
    console.error('Strict boundary audit failed: direct-route baseline changed. Migrate the route or review and update the baseline intentionally.');
    process.exit(1);
  }
  console.log('Strict boundary audit passed: no unreviewed direct-route drift.');
}
