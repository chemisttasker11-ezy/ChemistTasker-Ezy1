#!/usr/bin/env node
// UI ownership boundaries for the Vite app:
//   1. Generic UI (components/ui, utils/labels) never imports page or feature code.
//   2. Generic primitives are imported from components/ui only, never through a feature module
//      (e.g. finance must not take Pill from Shift Centre or ConfirmDialog from the owner team page).
// usage: node scripts/audit-ui-boundaries.mjs   (run from frontend_web)
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, normalize, relative, sep } from 'node:path';

const ROOT = 'src';
const GENERIC_DIRS = ['src/components/ui', 'src/utils/labels.ts'];
const GENERIC_NAMES = ['Pill', 'CountBadge', 'InitialsAvatar', 'Hint', 'InfoHint', 'toneColors', 'StatusTone', 'ConfirmDialog', 'SectionCard', 'SegmentTabs', 'humanizeEnum'];
const isGeneric = (resolved) => GENERIC_DIRS.some((dir) => resolved === dir || resolved.startsWith(`${dir}/`) || `${resolved}.ts` === dir);

const walk = (dir) => readdirSync(dir).flatMap((name) => {
  const path = join(dir, name);
  return statSync(path).isDirectory() ? walk(path) : /\.(tsx?|mjs)$/.test(name) ? [path] : [];
});
const posix = (path) => path.split(sep).join('/');
const importsOf = (source) => [...source.matchAll(/import\s+(?:type\s+)?(?:([\w*\s{},]+)\s+from\s+)?['"]([^'"]+)['"]/g)]
  .map(([, names = '', from]) => ({ names: names.replace(/\btype\s+/g, '').match(/\w+/g) ?? [], from }));

const problems = [];
for (const file of walk(ROOT).map(posix)) {
  const source = readFileSync(file, 'utf8');
  const generic = GENERIC_DIRS.some((dir) => file === dir || file.startsWith(`${dir}/`));
  for (const { names, from } of importsOf(source)) {
    if (!from.startsWith('.')) continue;
    const resolved = posix(normalize(join(dirname(file), from)));
    if (generic && /^src\/(pages|features|layouts)\//.test(resolved)) {
      problems.push(`${file}: generic UI imports page/feature code '${from}'`);
    }
    const misplaced = names.filter((name) => GENERIC_NAMES.includes(name) && name !== 'as');
    if (misplaced.length && !isGeneric(resolved)) {
      problems.push(`${file}: imports ${misplaced.join(', ')} from '${from}'; import generic UI from components/ui`);
    }
  }
}
// Feature modules must not re-export generic primitives (that is how cross-feature coupling creeps back).
for (const feature of ['src/pages/dashboard/shiftCenter/ShiftCentreParts.tsx', 'src/pages/dashboard/sidebar/owner/teamUi.tsx']) {
  const source = readFileSync(feature, 'utf8');
  for (const name of GENERIC_NAMES) {
    if (new RegExp(`export\\s+(?:function|const|type)\\s+${name}\\b|export\\s*\\{[^}]*\\b${name}\\b`).test(source)) {
      problems.push(`${relative('.', feature)}: re-exports generic ${name}; it belongs in components/ui`);
    }
  }
}

if (problems.length) {
  console.error(`UI boundary audit failed (${problems.length}):\n${problems.map((line) => `  - ${line}`).join('\n')}`);
  process.exit(1);
}
console.log('PASS: generic UI is owned by components/ui and imports no page code');
