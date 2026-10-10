#!/usr/bin/env node
// Wiring diff between two git refs for the web apps: every API call, navigation target, route and external link,
// extracted per file and compared. Use it to check a redesign keeps the same API calls and destinations.
// usage: node scripts/audit-wiring-diff.mjs [baseRef=origin/main] [headRef=HEAD] [--json]
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const [baseRef = 'origin/main', headRef = 'HEAD'] = process.argv.slice(2).filter((arg) => !arg.startsWith('--'));
const asJson = process.argv.includes('--json');
const ROOTS = ['frontend_web/src', 'frontend_web/landing_next', 'shared-core/src'];
const SKIP = /(node_modules|\.next|\/dist\/|\.test\.|\.spec\.|\/migrated\/)/; // migrated is compared separately below

const git = (...args) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
const listing = (ref, roots) => ref === 'WORKTREE'
  ? git('ls-files', '--cached', '--others', '--exclude-standard', '--', ...roots)
  : git('ls-tree', '-r', '--name-only', ref, '--', ...roots);
const files = (ref) => listing(ref, ROOTS)
  .split('\n').filter((file) => /\.(tsx?|mjs|jsx?)$/.test(file) && !SKIP.test(file));
// One Git process per snapshot, rather than one per file (particularly costly on Windows).
function readSources(ref, paths) {
  if (ref === 'WORKTREE') return new Map(paths.map(file => {
    try { return [file, readFileSync(file, 'utf8')]; } catch { return [file, '']; }
  }));
  const result = execFileSync('git', ['cat-file', '--batch'], {
    input: paths.map(file => `${ref}:${file}`).join('\n') + '\n', maxBuffer: 256 * 1024 * 1024,
  });
  const sources = new Map();
  let offset = 0;
  for (const file of paths) {
    const end = result.indexOf(10, offset);
    const header = result.subarray(offset, end).toString();
    offset = end + 1;
    if (header.endsWith(' missing')) { sources.set(file, ''); continue; }
    const size = Number(header.split(' ').at(-1));
    if (!Number.isSafeInteger(size)) throw new Error(`Invalid Git object header for ${file}`);
    sources.set(file, result.subarray(offset, offset + size).toString('utf8'));
    offset += size + 1;
  }
  return sources;
}

// Each rule names a kind of wiring and how to pull its target out of source text.
const RULES = [
  ['api', /\bAPI_ENDPOINTS\.[\w.]+/g, (m) => m[0]],
  ['api', /\b(?:apiClient|axios|fetchWithAuth|fetchApi|platformApi|api)\s*\.?\s*(?:get|post|put|patch|delete)?\s*(?:<[^>]*>)?\(\s*[`'"]([^`'"]+)[`'"]/g, (m) => m[1]],
  ['api', /\bfetch\(\s*[`'"]([^`'"]*\/api\/[^`'"]*)[`'"]/g, (m) => m[1]],
  ['api', /[`'"](\/(?:users|shifts|shift-|finance|hub|chat|rooms|notifications|pharmacies|my-memberships|memberships|attendance|workforce|onboarding|dashboard|billing|invoices|talent|explorer|organizations|client-profile|public)[\w\-/${}.?=&]*\/)[`'"]/g, (m) => m[1]],
  ['nav', /\bnavigate\(\s*[`'"]([^`'"]+)[`'"]/g, (m) => m[1]],
  ['nav', /\b(?:href|to)=\{?\s*[`'"]([^`'"]+)[`'"]/g, (m) => m[1]],
  ['nav', /window\.location\.(?:assign|replace|href\s*=)\(?\s*[`'"]([^`'"]+)[`'"]/g, (m) => m[1]],
  ['nav', /window\.open\(\s*[`'"]([^`'"]+)[`'"]/g, (m) => m[1]],
  ['nav', /<Navigate[^>]*\bto=\{?\s*[`'"]([^`'"]+)[`'"]/g, (m) => m[1]],
  ['route', /\bpath:\s*[`'"]([^`'"]+)[`'"]/g, (m) => m[1]],
  ['route', /\bsegment:\s*[`'"]([^`'"]+)[`'"]/g, (m) => m[1]],
  ['env', /import\.meta\.env\.(\w+)|process\.env\.(\w+)/g, (m) => m[1] || m[2]],
];

function extract(source) {
  const out = new Set();
  for (const [kind, regex, pick] of RULES) {
    for (const match of source.matchAll(regex)) out.add(`${kind} ${pick(match).replace(/\s+/g, ' ')}`);
  }
  return out;
}

function snapshot(ref) {
  return new Map([...readSources(ref, files(ref))].map(([file, source]) => [file, extract(source)]));
}

const base = snapshot(baseRef);
const head = snapshot(headRef);
const all = (map) => new Set([...map.values()].flatMap((set) => [...set]));
const baseAll = all(base);
const headAll = all(head);

// Wiring that disappeared from the whole app, or appeared anywhere for the first time.
const removed = [...baseAll].filter((item) => !headAll.has(item)).sort();
const added = [...headAll].filter((item) => !baseAll.has(item)).sort();
const where = (map, item) => [...map].filter(([, set]) => set.has(item)).map(([file]) => file);

const report = {
  baseRef, headRef,
  // Global sets can conceal a page changing destinations when another page still uses the old one.
  pageChanges: [...new Set([...base.keys(), ...head.keys()])].sort().flatMap(file => {
    const before = base.get(file) ?? new Set();
    const after = head.get(file) ?? new Set();
    const removed = [...before].filter(item => !after.has(item)).sort();
    const added = [...after].filter(item => !before.has(item)).sort();
    return removed.length || added.length ? [{ file, removed, added }] : [];
  }),
  removed: removed.map((item) => ({ item, was: where(base, item) })),
  added: added.map((item) => ({ item, in: where(head, item) })),
};

// The Next app keeps a copy of some Vite pages under landing_next/migrated: list copies that drifted apart.
const migrated = listing(headRef, ['frontend_web/landing_next/migrated'])
  .split('\n').filter((file) => /\.(tsx?)$/.test(file));
const twins = migrated.map(file => file.replace('frontend_web/landing_next/migrated/', 'frontend_web/src/'));
const twinSources = readSources(headRef, [...migrated, ...twins]);
report.migratedDrift = migrated.filter((file) => {
  const twin = file.replace('frontend_web/landing_next/migrated/', 'frontend_web/src/');
  const a = twinSources.get(file).replace(/\r\n/g, '\n');
  const b = twinSources.get(twin).replace(/\r\n/g, '\n');
  return b && a !== b;
}).map((file) => file.replace('frontend_web/landing_next/migrated/', ''));

if (asJson) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(`Wiring diff ${baseRef} -> ${headRef}`);
  console.log(`\nRemoved (${removed.length}): wiring on ${baseRef} that no longer exists anywhere`);
  for (const { item, was } of report.removed) console.log(`  - ${item}    [${was.join(', ')}]`);
  console.log(`\nAdded (${added.length}): wiring that is new on ${headRef}`);
  for (const { item, in: inFiles } of report.added) console.log(`  + ${item}    [${inFiles.join(', ')}]`);
  console.log(`\nFiles with wiring differences (${report.pageChanges.length}); inspect the JSON report for per-page targets.`);
  console.log(`\nVite pages whose Next 'migrated' copy differs (${report.migratedDrift.length}):`);
  for (const file of report.migratedDrift) console.log(`  ~ ${file}`);
}
