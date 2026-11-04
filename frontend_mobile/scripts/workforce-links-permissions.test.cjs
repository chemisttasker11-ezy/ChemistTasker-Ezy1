const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {resolve}=require('node:path');
const code=readFileSync(resolve(__dirname,'../app/workforce-settings.tsx'),'utf8');
test('workforce links preserve role and pharmacy capability restrictions',()=>{
 assert.match(code,/hasCapability\('MANAGE_ROSTER', pharmacyId\)/);
 assert.match(code,/orgCapabilities\(user\)/);
 assert.match(code,/canManageKioskDevices\(user, pharmacyId\)/);
 assert.match(code,/\{canManageRoster \? <Button[^>]*calendar-check/);
 assert.match(code,/\{canManageKiosk \? <Button[^>]*cellphone-key/);
});
