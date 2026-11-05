const test=require('node:test'),assert=require('node:assert/strict');const {readFileSync}=require('node:fs'),{resolve}=require('node:path');const s=readFileSync(resolve(__dirname,'..','app/settings/mobile.tsx'),'utf8');
test('push preferences are server-backed, scoped to user identity and not represented as OS notification permission',()=>{
 assert.match(s,/getNotificationPushPreferences\(\)/);
 assert.match(s,/updateNotificationPushPreferences\(values\)/);
 assert.match(s,/quiet_hours_enabled/);
 assert.match(s,/push_alerts/);
 assert.match(s,/quiet_start:quietStart,quiet_end:quietEnd/);
 assert.match(s,/in-app notifications remain available/i);
});
