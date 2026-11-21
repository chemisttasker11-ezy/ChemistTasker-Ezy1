const test=require('node:test');const assert=require('node:assert/strict');const {readFileSync}=require('node:fs');const {resolve}=require('node:path');
const read=p=>readFileSync(resolve(__dirname,'..',p),'utf8');
test('next-shift utility only appears for workers with server-confirmed-shift access',()=>{
 const more=read('components/shell/MoreScreen.tsx'),layout=read('app/_layout.tsx');
 assert.match(more,/\['PHARMACIST', 'OTHER_STAFF'\]\.includes/);
 assert.match(more,/route: '\/next-shifts'/);
 assert.match(layout,/top === 'next-shifts' && !\['PHARMACIST', 'OTHER_STAFF'\]\.includes/);
});
test('next-shift view does not mutate bookings and only pulls authenticated worker confirmed endpoint',()=>{
 const src=read('app/next-shifts.tsx');
 assert.match(src,/fetchMyConfirmedShifts/);
 assert.match(src,/readConfirmedShiftSnapshot/);
 assert.match(src,/saveConfirmedShiftSnapshot/);
 assert.doesNotMatch(src,/acceptShift|bookShift|createShift|clockIn|submitInvoice/);
});
