const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const read = p => readFileSync(resolve(__dirname, '..', p), 'utf8');
test('marketplace browser routes native category and mode filters to the approved catalogue API', () => {
 const src=read('features/parity/marketplace.tsx');
 assert.match(src,/api\.listListings\(browseQuery\(\{search:query,category:categoryFilter,mode:modeFilter\}\)\)/);
 assert.match(src,/router\.replace\(\{pathname:'\/marketplace',params:browseQuery/);
 assert.match(src,/categorySlug\(category\)/);
 assert.match(src,/request===requestRef\.current/);
 assert.match(src,/listingCount/);
});
test('mobile ordinary-goods enquiry requires meaningful message, identity access and authorized buying context', () => {
 const src=read('features/parity/marketplace.tsx');
 assert.match(src,/api\.getAccess\(\)/);
 assert.match(src,/api\.getEligibility\(listing\.id/);
 assert.match(src,/enquiryValidation\(message\)/);
 assert.match(src,/!access\?\.can_trade_personally/);
 assert.match(src,/eligible_pharmacies/);
 assert.match(src,/terms:\{intent:'ENQUIRY'\}/);
 assert.match(src,/client_request_id:requestIdRef\.current/);
 assert.doesNotMatch(src,/Interested via ChemistTasker mobile Marketplace/);
});
test('every role can review real OS notification settings rather than a cosmetic toggle', () => {
 const preferences=read('app/app-preferences.tsx');
 assert.match(preferences,/Notifications\.getPermissionsAsync\(\)/);
 assert.match(preferences,/Linking\.openSettings\(\)/);
 assert.match(preferences,/router\.push\('\/notifications'/);
 for(const role of ['pharmacist','otherstaff','explorer','owner','organization']){
   const src=read(`roles/${role}/profile.tsx`);
   assert.match(src,/\/app-preferences/);
 }
 for(const role of ['owner','organization']){
   assert.doesNotMatch(read(`roles/${role}/profile.tsx`),/notificationsEnabled|setNotificationsEnabled/);
 }
});
