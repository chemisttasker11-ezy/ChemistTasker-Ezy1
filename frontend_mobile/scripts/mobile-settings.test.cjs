const test=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {resolve}=require('node:path');
const read=p=>readFileSync(resolve(__dirname,'..',p),'utf8');
test('settings preserves API sign-in checks and separates kiosk PIN',()=>{
 const settings=read('app/settings/mobile.tsx'), bio=read('utils/biometricAuth.ts');
 assert.match(settings,/authenticateWithDeviceLock\(\)/);
 assert.match(settings,/getSavedBiometricUser/);
 assert.match(settings,/configuredUser\?\.id === userId/);
 assert.match(settings,/disableBiometricLogin/);
 assert.match(settings,/\/attendance-pin/);
 assert.match(bio,/disableDeviceFallback: false/);
 assert.doesNotMatch(settings,/password\s*=\s*pin|setItemAsync\(.+pin/);
});
test('mobile settings link is available to all signed-in personas and stays unavailable to anonymous users',()=>{
 assert.match(read('components/shell/MoreScreen.tsx'),/route: '\/settings\/mobile'/);
 const root=read('app/_layout.tsx');
 assert.match(root,/sharedProductPrefixes = new Set\(\[.*'settings'/);
 assert.match(root,/!user && !isPublic && !isPublicShiftRoute/);
});
test('notification and camera permissions remain user-driven',()=>{
 const src=read('app/settings/mobile.tsx');
 assert.match(src,/Notifications\.requestPermissionsAsync\(\)/);
 assert.match(src,/Camera\.getCameraPermissionsAsync\(\)/);
 assert.doesNotMatch(src,/Camera\.requestCameraPermissionsAsync\(\)/);
 assert.match(src,/Linking\.openSettings\(\)/);
});
