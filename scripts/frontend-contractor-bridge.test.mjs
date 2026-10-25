import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const script = fileURLToPath(new URL('./frontend-contractor-bridge.mjs', import.meta.url));
const work = resolve(dirname(script), '..');
function run(command, args, cwd) {
  const proc = spawnSync(command, args, { cwd, encoding:'utf8', maxBuffer: 4 * 1024 * 1024 });
  return { code:proc.status, output:proc.stdout + proc.stderr };
}
function addFile(dir, path, content) {
  mkdirSync(dirname(join(dir,path)), { recursive:true });
  writeFileSync(join(dir,path), content);
}
function git(dir, ...args) { const p=run('git',args,dir);assert.equal(p.code,0,p.output); }
function makeSource(root) {
  mkdirSync(root,{recursive:true});git(root,'init','-b','main');
  for (const path of ['frontend_web/package.json','frontend_web/landing_next/package.json','shared-core/package.json','frontend_mobile/package.json','scripts/prepare-shared-core.mjs','scripts/run-with-env.mjs']) addFile(root,path,'{}');
  addFile(root,'frontend_web/src/app.ts','export const ok = true;\n');
  addFile(root,'frontend_mobile/app/index.tsx','export const ExpoScreen = 1;\n');
  addFile(root,'frontend_mobile/google-services.json','{\"project_id\":\"production-secret\"}');
  addFile(root,'frontend_mobile/app.json','{}');
  addFile(root,'frontend_mobile/app/index.tsx','export default function App() { return null; }\n');
  addFile(root,'frontend_mobile/android/native-build-not-secret.txt','mobile native project');
  addFile(root,'frontend_mobile/google-services.json','\"private firebase material, not shared\"');
  addFile(root,'frontend_mobile/eas.json',JSON.stringify({build:{production:{}}}));
  addFile(root,'frontend_mobile/app.config.js','module.exports = () => ({ updates: {enabled: true} });');
  addFile(root,'frontend_web/src-tauri/src/main.rs','backend-adjacent kiosk; do not export');
  addFile(root,'backend/core/settings.py','INTERNAL_BACKEND_SOURCE');
  addFile(root,'frontend_web/.env.local','TEST_PASSWORD=hidden');
  git(root,'add','-A');git(root,'-c','user.name=CI','-c','user.email=test@example.invalid','commit','-m','fixture');
}
test('fresh frontend export has no Django code, kiosk runtime, secrets, or source history', () => {
  const t=mkdtempSync(join(tmpdir(),'ct-frontend-'));
  try {
    const source=join(t,'source'), contractor=join(t,'contractor');makeSource(source);
    let res=run(process.execPath,[script,'export','--source',source,'--dest',contractor],work);
    assert.equal(res.code,0,res.output);
    assert.ok(existsSync(join(contractor,'frontend_web/src/app.ts')));
    assert.ok(existsSync(join(contractor,'frontend_mobile/app/index.tsx')));
    assert.ok(existsSync(join(contractor,'frontend_mobile/.env.example')));
    assert.ok(existsSync(join(contractor,'frontend_mobile/app.config.js')));
    assert.match(readFileSync(join(contractor,'frontend_mobile/app.config.js'),'utf8'),/enabled: false/);
    assert.ok(existsSync(join(contractor,'frontend_mobile/app/index.tsx')));
    assert.ok(existsSync(join(contractor,'frontend_mobile/android/native-build-not-secret.txt')));
    for (const path of ['backend/core/settings.py','frontend_web/src-tauri/src/main.rs','frontend_web/.env.local','frontend_mobile/google-services.json','frontend_mobile/eas.json','.git']) assert.equal(existsSync(join(contractor,path)),false,path);
    assert.ok(existsSync(join(contractor,'.github/workflows/frontend-ci.yml')));
    assert.ok(existsSync(join(contractor,'env/web.dev.env.example')));
    git(contractor,'init','-b','main');git(contractor,'add','-A');git(contractor,'-c','user.name=CI','-c','user.email=test@example.invalid','commit','-m','frontend only');
    res=run(process.execPath,[script,'check','--source',contractor],work);
    assert.equal(res.code,0,res.output);
    // Execute the generated standalone boundary guard.
    res=run(process.execPath,[join(contractor,'scripts/check-frontend-boundary.mjs')],contractor);
    assert.equal(res.code,0,res.output);
    addFile(contractor,'backend/models.py','DO_NOT_SHARE');git(contractor,'add','-A');
    res=run(process.execPath,[script,'check','--source',contractor],work);
    assert.notEqual(res.code,0);assert.match(res.output,/Unexpected path/);
  } finally {rmSync(t,{recursive:true,force:true});}
});
test('import dry-run never changes full repository; apply touches only allowed paths', () => {
  const t=mkdtempSync(join(tmpdir(),'ct-import-'));
  try {
    const source=join(t,'source'), contractor=join(t,'contractor');makeSource(source);
    assert.equal(run(process.execPath,[script,'export','--source',source,'--dest',contractor],work).code,0);
    git(contractor,'init','-b','main');git(contractor,'add','-A');git(contractor,'-c','user.name=CI','-c','user.email=test@example.invalid','commit','-m','frontend only');
    addFile(contractor,'frontend_web/src/app.ts','export const ok = false;\n');
    git(contractor,'add','-A');git(contractor,'-c','user.name=CI','-c','user.email=test@example.invalid','commit','-m','change UI');
    let res=run(process.execPath,[script,'import','--source',source,'--from',contractor],work);
    assert.equal(res.code,0,res.output);assert.match(res.output,/DRY-RUN/);
    assert.match(readFileSync(join(source,'frontend_web/src/app.ts'),'utf8'),/true/);
    res=run(process.execPath,[script,'import','--source',source,'--from',contractor,'--apply'],work);
    assert.equal(res.code,0,res.output);
    assert.match(readFileSync(join(source,'frontend_web/src/app.ts'),'utf8'),/false/);
    assert.match(readFileSync(join(source,'backend/core/settings.py'),'utf8'),/INTERNAL_BACKEND_SOURCE/);
    assert.ok(existsSync(join(source,'frontend_web/src-tauri/src/main.rs')));
    assert.match(readFileSync(join(source,'frontend_mobile/app.config.js'),'utf8'),/updates: \{enabled: true\}/); // contractor override cannot reach production
  } finally {rmSync(t,{recursive:true,force:true});}
});
test('export stops before copying a frontend private key', () => {
  const t=mkdtempSync(join(tmpdir(),'ct-secret-'));
  try {
    const source=join(t,'source'), dest=join(t,'contractor');makeSource(source);
    addFile(source,'frontend_web/src/key.ts','-----BEGIN ' + 'PRIVATE KEY-----');git(source,'add','-A');
    const res=run(process.execPath,[script,'export','--source',source,'--dest',dest],work);
    assert.notEqual(res.code,0);assert.match(res.output,/Credential-like/);
    assert.equal(existsSync(dest),false);
  } finally {rmSync(t,{recursive:true,force:true});}
});
