#!/usr/bin/env node
// Runs INSIDE the contractor repository. Reject forbidden Git history and credentials.
import { execFileSync } from 'node:child_process';
import { readFileSync, lstatSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const git = (...args) => execFileSync('git', args, {cwd: root, encoding: 'utf8', maxBuffer: 128 * 1024 * 1024});
const tracked = git('ls-files', '-z').split('\0').filter(Boolean);
const extras = new Set(['README.md', 'CONTRACTOR_HANDOVER.md', '.gitignore', 'frontend-export.json',
  'env/web.dev.env.example', 'frontend_mobile/.env.example', 'frontend_mobile/app.config.js',
  '.github/workflows/frontend-ci.yml', 'scripts/check-frontend-boundary.mjs', 'scripts/check-staging-api.mjs']);
const scripts = new Set(['scripts/prepare-shared-core.mjs', 'scripts/run-with-env.mjs']);
const required = ['frontend_web/package.json', 'frontend_web/landing_next/package.json',
  'shared-core/package.json', 'frontend_mobile/package.json', 'frontend_mobile/app.json',
  'scripts/prepare-shared-core.mjs', 'scripts/run-with-env.mjs'];
const deny = /(^|\/)(?:\.env(?:\.[^/]+)?|[^/]*\.env(?:\.[^/]+)?|google-services\.json|GoogleService-Info\.plist|credentials\.json|[^/]*firebase-adminsdk[^/]*\.json|[^/]*service[-_.]?account[^/]*\.json|id_rsa|id_ed25519|[^/]*\.(?:pem|key|p8|p12|pfx|jks|keystore|mobileprovision|ovpn|sqlite3?|db|sql|dump))$/i;
const sensitiveTokens = [/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,/ghp_[A-Za-z0-9]{30,}/,/github_pat_[A-Za-z0-9_]{40,}/,/(?:^|[^A-Za-z0-9_])sk-[A-Za-z0-9_-]{20,}/,/AKIA[0-9A-Z]{16}/,/sk_live_[A-Za-z0-9]{20,}/,/whsec_[A-Za-z0-9]{20,}/];
const valid = p => {
  if(!p || p.includes('\\') || p.startsWith('/') || p.split('/').some(s=>s==='..'||s==='.'||!s)) return false;
  if (!(p.endsWith('.env.example') || p.endsWith('.env.sample')) && deny.test(p)) return false;
  if (p.startsWith('frontend_web/src-tauri/')) return false;
  if (p === 'frontend_mobile/eas.json') return false;
  if (/(^|\/)(?:\.git|node_modules|\.next|dist|dist-kiosk|coverage|\.expo|build)(\/|$)/.test(p)) return false;
  return ['frontend_web/', 'frontend_mobile/', 'shared-core/'].some(pre=>p.startsWith(pre)) || scripts.has(p) || extras.has(p);
};
const problems=[];
for(const p of tracked){
  if(!valid(p)) {problems.push(`Forbidden file: ${p}`);continue;}
  if(lstatSync(join(root,p)).isSymbolicLink()) {problems.push(`Symlink: ${p}`);continue;}
  const data=readFileSync(join(root,p));
  if(data.length>5_000_000||data.includes(0))continue;
  const content=data.toString('utf8');
  if(sensitiveTokens.some(rx=>rx.test(content))) problems.push(`Credential-like content: ${p}`);
  if((content.match(/AIza[0-9A-Za-z_-]{30,}/g)||[]).some(s=>s!=='AIzaSyNativeSmokeOnly000000000000000000')) problems.push(`Google API key-like content: ${p}`);
}
for(const p of required)if(!tracked.includes(p))problems.push(`Required file not present: ${p}`);
const history=git('log','--all','--name-only','--pretty=format:').split(/\r?\n/).filter(Boolean);
for(const p of history)if(!valid(p)){problems.push(`Forbidden file in Git HISTORY: ${p}`);break;}
if(problems.length){console.error(problems.slice(0,25).join('\n'));process.exit(1);}
console.log(`PASS: ${tracked.length} files, Git history and credentials restricted to React/Next/Expo/shared-core`);
