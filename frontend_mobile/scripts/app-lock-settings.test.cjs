const test=require('node:test'),assert=require('node:assert/strict');const {readFileSync}=require('node:fs');const {resolve}=require('node:path');const read=p=>readFileSync(resolve(__dirname,'..',p),'utf8');
test('app lock is mounted within the authenticated root layout',()=>{
 const root=read('app/_layout.tsx');
 assert.match(root,/<AppLockGate \/>/);
 assert.ok(root.indexOf('<AuthProvider>') < root.indexOf('<AppLockGate />'));
 assert.match(root,/<GuardedRootContent>/);
 assert.ok(root.indexOf('<AuthProvider>') < root.indexOf('<UnsavedChangesDialogProvider>'), 'global guarded dialogs must be inside auth');
 assert.match(root,/<Portal.Host>\{children\}<\/Portal.Host>/);
});
test('app lock user preferences are gated by OS authentication',()=>{
 const settings=read('app/settings/mobile.tsx');
 assert.match(settings,/await authenticateWithDeviceLock\(\)/);
 assert.match(settings,/setAppLockPreference\(userId, \{ enabled, delaySeconds: delay \}\)/);
 assert.match(settings,/validDelay\(seconds\)/);
});
test('settings provides honest near-control feedback and individual accessibility labels',()=>{
 const settings=read('app/settings/mobile.tsx');
 assert.match(settings,/appLockLoadError/);
 assert.match(settings,/Security preferences could not be verified/);
 assert.match(settings,/Device passcode or biometric verification was cancelled/);
 assert.match(settings,/App lock preference could not be saved/);
 assert.match(settings,/accessibilityLabel="Fast sign-in"/);
 assert.match(settings,/accessibilityLabel="Lock when returning to the app"/);
 assert.match(settings,/accessibilityLabel=\{`Push notifications for \$\{label\}`\}/);
 assert.match(settings,/accessibilityLabel="Enable quiet hours"/);
});
test('settings keys content by account role and rejects stale unmounted saves',()=>{
 const settings=read('app/settings/mobile.tsx');
 assert.match(settings,/key=\{accountKey\}/);
 assert.match(settings,/aliveRef\.current = false/);
 assert.match(settings,/if \(!aliveRef\.current \|\| policyGenRef\.current !== gen\) return/);
});
