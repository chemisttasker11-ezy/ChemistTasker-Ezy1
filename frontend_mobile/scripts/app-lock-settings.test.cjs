const test=require('node:test'),assert=require('node:assert/strict');const {readFileSync}=require('node:fs');const {resolve}=require('node:path');const read=p=>readFileSync(resolve(__dirname,'..',p),'utf8');
test('app lock is mounted within the authenticated root layout',()=>{
 const root=read('app/_layout.tsx');
 assert.match(root,/<AppLockGate \/>/);
 assert.ok(root.indexOf('<AuthProvider>') < root.indexOf('<AppLockGate />'));
});
test('app lock user preferences are gated by OS authentication',()=>{
 const settings=read('app/settings/mobile.tsx');
 assert.match(settings,/await authenticateWithDeviceLock\(\)/);
 assert.match(settings,/setAppLockPreference\(userId, \{ enabled, delaySeconds: delay \}\)/);
 assert.match(settings,/validDelay\(seconds\)/);
});
