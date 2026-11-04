#!/usr/bin/env node
/**
 * ChemistTasker owner's controlled fresh-history frontend snapshot and reverse import.
 * This file belongs in the PRIVATE OWNER monorepo, not the contractor repository.
 * Compatible with Node.js 22, git, Windows and POSIX.
 */
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ownerRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const templateRoot = join(ownerRoot, 'tooling/frontend-contractor');
const roots = ['frontend_web/', 'frontend_mobile/', 'shared-core/'];
const scripts = new Set(['scripts/prepare-shared-core.mjs', 'scripts/run-with-env.mjs']);
const extras = new Set([
  'README.md', 'CONTRACTOR_HANDOVER.md', '.gitignore', 'frontend-export.json',
  'env/web.dev.env.example', 'frontend_mobile/.env.example', 'frontend_mobile/app.config.js',
  '.github/workflows/frontend-ci.yml', 'scripts/check-frontend-boundary.mjs',
  'scripts/check-staging-api.mjs',
]);
const required = [
  'frontend_web/package.json', 'frontend_web/landing_next/package.json',
  'shared-core/package.json', 'frontend_mobile/package.json', 'frontend_mobile/app.json',
  'scripts/prepare-shared-core.mjs', 'scripts/run-with-env.mjs',
];
const sensitiveFilename = /(^|\/)(?:\.env(?:\.[^/]+)?|[^/]*\.env(?:\.[^/]+)?|google-services\.json|GoogleService-Info\.plist|credentials\.json|[^/]*firebase-adminsdk[^/]*\.json|[^/]*service[-_.]?account[^/]*\.json|id_rsa|id_ed25519|[^/]*\.(?:pem|key|p8|p12|pfx|jks|keystore|mobileprovision|ovpn|sqlite3?|db|sql|dump))$/i;
const sensitiveTokens = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /ghp_[A-Za-z0-9]{30,}/, /github_pat_[A-Za-z0-9_]{40,}/,
  /(?:^|[^A-Za-z0-9_])sk-[A-Za-z0-9_-]{20,}/,
  /AKIA[0-9A-Z]{16}/, /sk_live_[A-Za-z0-9]{20,}/,
  /whsec_[A-Za-z0-9]{20,}/,
];
const fakeGoogleKey = 'AIzaSyNativeSmokeOnly000000000000000000';

function die(message) { throw new Error(message); }
function git(cwd, args) {
  const result = spawnSync('git', ['-C', cwd, ...args], { encoding: 'utf8', maxBuffer: 128 * 1024 * 1024 });
  if (result.status !== 0) die(`git ${args.join(' ')} failed in ${cwd}: ${result.stderr?.trim()}`);
  return result.stdout;
}
function options(args) {
  const result = {};
  for (let i = 0; i < args.length; i++) {
    if (['--apply', '--allow-deletions'].includes(args[i])) { result[args[i].slice(2)] = true; continue; }
    if (!['--source', '--dest', '--from'].includes(args[i]) || !args[i + 1]) die(`Invalid option ${args[i]}`);
    result[args[i].slice(2)] = resolve(args[++i]);
  }
  return result;
}
function safePath(path) {
  if (!path || path.includes('\\') || path.includes('\0') || path.startsWith('/') || /^[A-Za-z]:/.test(path) ||
      path.split('/').some(p => p === '.' || p === '..' || !p)) die(`Unsafe relative path: ${path}`);
  return path;
}
function allowed(path) {
  safePath(path);
  if (path.endsWith('.env.example') || path.endsWith('.env.sample')) {
    // All examples are text scanned below. A true environment file never leaves.
  } else if (sensitiveFilename.test(path)) return false;
  if (path.startsWith('frontend_web/src-tauri/')) return false; // Kiosk/Rust/signing not part of this handover
  if (path === 'frontend_mobile/eas.json' || path === 'frontend_mobile/app.config.js') return false; // Contractor receives a generated staging-only config
  if (/(^|\/)(?:\.git|node_modules|\.next|dist|dist-kiosk|coverage|\.expo|build)(\/|$)/.test(path)) return false;
  return roots.some(prefix => path.startsWith(prefix)) || scripts.has(path);
}
function tracked(root) { return git(root, ['ls-files', '-z']).split('\0').filter(Boolean).map(safePath); }
function regularFile(root, path) {
  let cursor = root;
  for (const part of path.split('/')) {
    cursor = join(cursor, part);
    if (lstatSync(cursor).isSymbolicLink()) die(`Refusing symlink: ${path}`);
  }
  if (!statSync(cursor).isFile()) die(`Not a regular file: ${path}`);
}
function scan(root, path) {
  regularFile(root, path);
  const bytes = readFileSync(join(root, path));
  if (bytes.length > 5_000_000 || bytes.includes(0)) return;
  const content = bytes.toString('utf8');
  if (sensitiveTokens.some(pattern => pattern.test(content))) die(`Credential-like content detected in ${path}; manual review required`);
  const keys = content.match(/AIza[0-9A-Za-z_-]{30,}/g) || [];
  if (keys.some(key => key !== fakeGoogleKey)) die(`Google API key-looking content detected in ${path}; review and replace with a staging key`);
}
function checkPaths(root, all, exported = false) {
  const selected = all.filter(allowed);
  for (const needed of required) if (!selected.includes(needed)) die(`Missing required frontend dependency: ${needed}`);
  if (exported) {
    const forbidden = all.filter(p => !allowed(p) && !extras.has(p));
    if (forbidden.length) die(`Unexpected path(s) in contractor repo: ${forbidden.slice(0, 12).join(', ')}`);
  }
  for (const path of (exported ? all : selected)) scan(root, path);
  return selected;
}
function checkHistory(root) {
  const history = git(root, ['log', '--all', '--name-only', '--pretty=format:']);
  const forbidden = history.split(/\r?\n/).filter(Boolean).find(path => !allowed(path) && !extras.has(path));
  if (forbidden) die(`Forbidden Git history path ${forbidden}; use a NEW repository, not a fork/clone with deleted backend`);
}
function clean(root) {
  if (git(root, ['status', '--porcelain']).trim()) die(`Uncommitted modifications in ${root}: commit or stash first`);
}
function copy(from, to, path, output = path) {
  const dest = join(to, output);
  mkdirSync(dirname(dest), { recursive: true });
  copyFileSync(join(from, path), dest);
}
function exportFiles(source, dest) {
  if (source === dest || dest.startsWith(`${source}${sep}`)) die('Export destination must be outside the full source repository');
  if (existsSync(dest) && readdirSync(dest).length) die(`Export target must be empty: ${dest}`);
  if (!existsSync(templateRoot)) die(`Missing owner-only templates: ${templateRoot}`);
  const files = checkPaths(source, tracked(source));
  // Every source path and credential gets validated before the first copy.
  mkdirSync(dest, { recursive: true });
  for (const path of files) copy(source, dest, path);
  const templates = [
    ['README.md', 'README.md'], ['CONTRACTOR_HANDOVER.md', 'CONTRACTOR_HANDOVER.md'],
    ['gitignore', '.gitignore'], ['frontend-ci.yml', '.github/workflows/frontend-ci.yml'],
    ['check-frontend-boundary.mjs', 'scripts/check-frontend-boundary.mjs'],
    ['check-staging-api.mjs', 'scripts/check-staging-api.mjs'],
    ['web.dev.env.example', 'env/web.dev.env.example'],
    ['mobile.dev.env.example', 'frontend_mobile/.env.example'],
    ['mobile.app.config.js', 'frontend_mobile/app.config.js'],
  ];
  for (const [src, dst] of templates) copy(templateRoot, dest, src, dst);
  const sourceCommit = git(source, ['rev-parse', 'HEAD']).trim();
  writeFileSync(join(dest, 'frontend-export.json'), JSON.stringify({
    kind: 'chemisttasker-frontend-only', sourceCommit, files: files.length,
    apps: ['react-vite', 'nextjs', 'expo-mobile', 'shared-core'],
    timestamp: new Date().toISOString(),
  }, null, 2) + '\n');
  console.log(`PASS: exported ${files.length} files from ${sourceCommit} without .git or backend.`);
}
function inspectContractor(root) {
  const files = tracked(root);
  const selected = checkPaths(root, files, true);
  checkHistory(root);
  console.log(`PASS: ${files.length} files, ${selected.length} source files, clean frontend-only repository history`);
  return selected;
}
function importFiles(source, contractor, apply = false, allowDeletions = false) {
  if (source === contractor) die('Owner and contractor repositories must be different');
  const marker = JSON.parse(readFileSync(join(contractor, 'frontend-export.json'), 'utf8'));
  if (marker.kind !== 'chemisttasker-frontend-only') die('Invalid export marker');
  clean(contractor);
  const selected = inspectContractor(contractor);
  const sourceFiles = tracked(source).filter(allowed);
  const next = new Set(selected);
  const changed = selected.filter(p => !existsSync(join(source, p)) ||
    !readFileSync(join(source, p)).equals(readFileSync(join(contractor, p))));
  const deletions = sourceFiles.filter(path => !next.has(path));
  console.log(`REVIEW: changed=${changed.length} missing=${deletions.length} action=${apply ? 'APPLY' : 'DRY-RUN'}`);
  for (const path of [...changed.map(x => `M ${x}`), ...deletions.map(x => `D ${x}`)].slice(0, 140)) console.log(path);
  if (!apply) return;
  if (deletions.length && !allowDeletions) die('Incoming deletions exist; re-run with explicit --allow-deletions only after review');
  clean(source);
  for (const path of changed) copy(contractor, source, path);
  for (const path of deletions) rmSync(join(source, path));
  console.log('Applied frontend paths only to owner working tree. Check git diff, run full CI and open owner PR.');
}
function main() {
  const [mode, ...args] = process.argv.slice(2), o = options(args);
  if (mode === 'export') exportFiles(o.source || ownerRoot, o.dest || die('export requires --dest'));
  else if (mode === 'check') inspectContractor(o.source || die('check requires --source'));
  else if (mode === 'import') importFiles(o.source || ownerRoot, o.from || die('import requires --from'), !!o.apply, !!o['allow-deletions']);
  else die('Use export --source <owner> --dest <empty-folder> | check --source <contractor> | import --source <owner> --from <contractor> [--apply] [--allow-deletions]');
}
try { main(); } catch (error) { console.error(`FRONTEND BOUNDARY ERROR: ${error.message}`); process.exitCode = 1; }
