#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');

const forbidden = [
  'chemisttasker-Frontend-main',
  'frontend_web/vite.config copy.ts',
  'frontend_web/src/__tmp_talent_import.txt',
  'frontend_web/landing_next/app/(public)/membership',
  'frontend_web/landing_next/migrated/pages/MembershipApplyPage.tsx',
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

const bridgePath = path.join(root, 'frontend_web/src/components/PublicRouteBridge.tsx');
const bridge = fs.readFileSync(bridgePath, 'utf8');
if (/\|membership\|?|membership\|/.test(bridge)) {
  failures.push('Vite PublicRouteBridge must not redirect /membership/* into Next');
}

const nextConfigPath = path.join(root, 'frontend_web/landing_next/next.config.ts');
const nextConfig = fs.readFileSync(nextConfigPath, 'utf8');
if (!nextConfig.includes("'membership'")) {
  failures.push('Next must proxy /membership/* to the Vite dashboard server');
}

if (failures.length) {
  console.error('Architecture boundary audit failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Architecture boundary audit passed.');
