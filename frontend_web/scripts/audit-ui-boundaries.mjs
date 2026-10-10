#!/usr/bin/env node
// UI ownership boundaries for the Vite app:
//   1. Generic UI (components/ui, utils/labels) never imports page or feature code.
//   2. Generic primitives are imported from components/ui only, never through a feature module
//      (e.g. finance must not take Pill from Shift Centre or ConfirmDialog from the owner team page).
// usage: node scripts/audit-ui-boundaries.mjs   (run from frontend_web)
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, normalize, relative, sep } from 'node:path';
import ts from 'typescript';

const ROOT = 'src';
const GENERIC_DIRS = ['src/components/ui', 'src/utils/labels.ts', 'landing_next/shared-ui'];
const GENERIC_NAMES = ['Pill', 'CountBadge', 'InitialsAvatar', 'Hint', 'InfoHint', 'toneColors', 'StatusTone', 'ConfirmDialog', 'SectionCard', 'SegmentTabs', 'humanizeEnum'];
const isGeneric = (resolved) => GENERIC_DIRS.some((dir) => resolved === dir || resolved.startsWith(`${dir}/`) || `${resolved}.ts` === dir);

const walk = (dir) => readdirSync(dir).flatMap((name) => {
  const path = join(dir, name);
  return statSync(path).isDirectory() ? walk(path) : /\.(tsx?|mjs)$/.test(name) ? [path] : [];
});
const posix = (path) => path.split(sep).join('/');
const importsOf = (source) => {
  const parsed = ts.createSourceFile('view.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  return parsed.statements.flatMap(node => {
    if ((!ts.isImportDeclaration(node) && !ts.isExportDeclaration(node)) || !node.moduleSpecifier || !ts.isStringLiteral(node.moduleSpecifier)) return [];
    const clause = ts.isImportDeclaration(node) ? node.importClause?.namedBindings : node.exportClause;
    const names = clause && (ts.isNamedImports(clause) || ts.isNamedExports(clause))
      ? clause.elements.map(item => (item.propertyName ?? item.name).text) : [];
    if (ts.isImportDeclaration(node) && node.importClause?.name) names.push(node.importClause.name.text);
    return [{ names, from: node.moduleSpecifier.text }];
  });
};

const problems = [];
for (const file of [...walk(ROOT), ...walk('landing_next/shared-ui')].map(posix)) {
  const source = readFileSync(file, 'utf8');
  const generic = GENERIC_DIRS.some((dir) => file === dir || file.startsWith(`${dir}/`));
  for (const { names, from } of importsOf(source)) {
    if (!from.startsWith('.')) continue;
    const resolved = posix(normalize(join(dirname(file), from)));
    if (generic && /^(src|landing_next\/migrated)\/(pages|features|layouts)\//.test(resolved)) {
      problems.push(`${file}: generic UI imports page/feature code '${from}'`);
    }
    const misplaced = names.filter((name) => GENERIC_NAMES.includes(name) && name !== 'as');
    if (misplaced.length && !isGeneric(resolved)) {
      problems.push(`${file}: imports ${misplaced.join(', ')} from '${from}'; import generic UI from components/ui`);
    }
  }
}
// Responsibilities extracted from large panels must stay separate as the feature grows.
for (const [file, maximum] of Object.entries({
  'src/pages/dashboard/sidebar/chat/ConversationPanel.tsx': 400,
  'src/pages/dashboard/sidebar/owner/OwnerPharmacyDetailPage.tsx': 350,
  'src/pages/finance/FinanceWorkspace.tsx': 450,
})) {
  const lines = readFileSync(file, 'utf8').split('\n').length;
  if (lines > maximum) problems.push(`${file}: ${lines} lines exceeds the ${maximum}-line orchestration budget`);
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
