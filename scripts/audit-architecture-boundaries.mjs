#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');

const forbidden = [
  'chemisttasker-Frontend-main',
  'frontend_web/vite.config copy.ts',
  'frontend_web/src/__tmp_talent_import.txt',
];

const byteBudgets = {
  'backend/client_profile/views.py': 430000,
  'backend/client_profile/serializers.py': 348000,
  'backend/client_profile/models.py': 182000,
  'shared-core/src/api.ts': 105000,
  'frontend_web/src/pages/dashboard/sidebar/PostShiftPage.tsx': 138000,
  'frontend_web/src/pages/dashboard/sidebar/PharmacyPage.tsx': 116000,
  'frontend_web/src/pages/dashboard/sidebar/ActiveShiftsPage/index.tsx': 94000,
  'frontend_web/src/pages/attendance/KioskPage.tsx': 107000,
  'frontend_web/src/layouts/TopBarActions.tsx': 62000,
  'frontend_mobile/roles/shared/shifts/PostShiftScreen.tsx': 118000,
};

const failures = [];

for (const relative of forbidden) {
  if (fs.existsSync(path.join(root, relative))) {
    failures.push(`forbidden stale/duplicate path exists: ${relative}`);
  }
}

for (const [relative, limit] of Object.entries(byteBudgets)) {
  const full = path.join(root, relative);
  if (!fs.existsSync(full)) {
    failures.push(`budgeted source file is missing: ${relative}`);
    continue;
  }
  const size = fs.statSync(full).size;
  if (size > limit) {
    failures.push(`${relative} grew to ${size} bytes (budget ${limit}); extract a domain/component instead of expanding the monolith`);
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
console.log('Legacy hotspots are capped; new work should move into focused domain/component modules.');
