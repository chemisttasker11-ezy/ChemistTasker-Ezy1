#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');

const forbidden = [
  'chemisttasker-Frontend-main',
  'frontend_web/vite.config copy.ts',
  'frontend_web/src/__tmp_talent_import.txt',
];

const failures = [];

for (const relative of forbidden) {
  if (fs.existsSync(path.join(root, relative))) {
    failures.push(`forbidden stale/duplicate path exists: ${relative}`);
  }
}

const mainPath = path.join(root, 'frontend_web/src/main.tsx');
const main = fs.readFileSync(mainPath, 'utf8');
if (!main.includes('React.lazy(')) {
  failures.push('frontend_web/src/main.tsx must retain route-level React.lazy splitting');
}
if (!main.includes('<React.Suspense')) {
  failures.push('frontend_web/src/main.tsx must retain a Suspense boundary for lazy routes');
}

if (failures.length) {
  console.error('Architecture boundary audit failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Architecture boundary audit passed.');
