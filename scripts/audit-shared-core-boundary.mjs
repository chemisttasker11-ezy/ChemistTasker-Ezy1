#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

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
const routePattern = /(?:['"`])(?:https?:\/\/[^'"`]+)?\/api\/(?:users|public-hub|content|marketplace|ethical|client-profile|billing|account)\//g;

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

if (findings.length === 0) {
  console.log('Shared-core boundary audit: no direct internal /api route literals found.');
  process.exit(0);
}

console.log(`Shared-core boundary audit: ${findings.length} existing direct internal API route literal(s) found.`);
for (const finding of findings) console.log(`${finding.file}:${finding.line}  ${finding.text}`);
console.log('\nMigration rule: reuse/add the operation in @chemisttasker/shared-core before changing the client.');
console.log('This audit is report-only by default. Pass --strict only after the existing baseline is migrated.');
if (process.argv.includes('--strict')) process.exit(1);
