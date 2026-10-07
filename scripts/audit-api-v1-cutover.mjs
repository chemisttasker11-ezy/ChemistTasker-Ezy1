#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const roots = ['backend', 'shared-core', 'frontend_web', 'frontend_mobile', 'scripts', '.github'];
const forbiddenHttp = /\/api\/(?:client-profile|users|public-hub|marketplace|ethical|content|billing|account)\//g;
const forbiddenRelative = /\/client-profile\//g;
const forbiddenEscapedRelative = /\\\/client-profile\\\//g;
const forbiddenUnversionedString = /(?:["'`])\/api\/(?!v1(?:\/|["'`])|platform(?:\/|["'`])|hub(?:\/|["'`]))[A-Za-z0-9_-]+(?:\/|["'`])/g;
const forbiddenBareHttpApiRoot = /https?:\/\/[^"'`\s]+\/api(?=["'`])/g;
const forbiddenReverse = /reverse(?:_lazy)?\(\s*["']client_profile:/g;
const extensions = new Set(['.py', '.ts', '.tsx', '.js', '.mjs', '.cjs', '.yml', '.yaml', '.sh', '.rs']);
const failures = [];

// Compatibility/negative tests deliberately exercise legacy inputs. Keep the
// namespace rules above on those files, but apply the new root ratchet to callers.
function maintainedHttpSource(source, rel) {
  if (/(^|\/)(tests?|__tests__)\//.test(rel) ||
      /(?:[.-]test|[.-]spec)\.[^.]+$/.test(rel) ||
      /\/test_[^/]+\.py$/.test(rel)) return '';
  // Rust keeps rejection tests alongside production code in a cfg(test) module.
  if (rel.endsWith('.rs')) source = source.split(/#\[cfg\(test\)\]/)[0];
  return source.split('\n').map(line =>
    /^\s*(?:\/\/|\/\*|\*|#)/.test(line) ? '' : line
  ).join('\n');
}

function ignored(rel) {
  return rel.startsWith('docs/') ||
    rel.includes('/migrations/') ||
    rel.includes('/node_modules/') ||
    rel.includes('/.next/') ||
    rel.includes('/target/') ||
    rel.includes('/dist/') ||
    rel.includes('/build/') ||
    rel.includes('/coverage/') ||
    rel.endsWith('scripts/audit-api-v1-cutover.mjs');
}

function visit(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    const rel = path.relative(root, full).replaceAll('\\', '/');
    if (ignored(rel)) continue;
    if (entry.isDirectory()) visit(full);
    else if (extensions.has(path.extname(entry.name))) {
      const source = fs.readFileSync(full, 'utf8');
      const rules = [
        ['legacy unversioned application API', forbiddenHttp],
        ['legacy client-profile relative API', forbiddenRelative],
        ['escaped legacy client-profile API matcher', forbiddenEscapedRelative],
        ['unversioned local application API string', forbiddenUnversionedString],
        ['bare legacy HTTP API root', forbiddenBareHttpApiRoot],
        ['legacy Django client_profile URL namespace', forbiddenReverse],
      ];
      for (const [label, pattern] of rules) {
        pattern.lastIndex = 0;
        const auditedSource = pattern === forbiddenBareHttpApiRoot
          ? maintainedHttpSource(source, rel) : source;
        for (const match of auditedSource.matchAll(pattern)) {
          const line = auditedSource.slice(0, match.index).split('\n').length;
          failures.push(`${rel}:${line}: ${label}: ${match[0]}`);
        }
      }
    }
  }
}

for (const name of roots) {
  const target = path.join(root, name);
  if (fs.existsSync(target)) visit(target);
}

if (failures.length) {
  console.error('API v1 cutover audit failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}
console.log('API v1 cutover audit passed: no maintained caller uses a removed application API namespace.');
