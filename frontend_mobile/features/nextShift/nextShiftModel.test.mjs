import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
const source=readFileSync(new URL('./nextShiftModel.ts',import.meta.url),'utf8');
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const scope={exports:{},Date,Intl,Set,Number,String,URLSearchParams,Object,encodeURIComponent};
runInNewContext(js,scope);
const {sanitizeConfirmedShifts,upcomingShifts,calendarEditorUrl,directionsUrl}=scope.exports;
const sample={id:5,roleNeeded:'PHARMACIST',pharmacyDetail:{name:'Test pharmacy',streetAddress:'10 Example St',suburb:'Brisbane',state:'QLD'},slots:[{id:9,date:'2027-01-08',startTime:'09:00:00',endTime:'17:00:00'},{id:10,date:'2027-01-10',startTime:'09:00',endTime:'17:00'}],hourlyRate:'999.99',lineItems:[{bankAccount:'PRIVATE'}]};
test('worker offline projection is local-time aware and excludes payment details',()=>{
 const rows=sanitizeConfirmedShifts([sample],123);
 assert.equal(rows.length,2);
 assert.deepEqual(Object.keys(rows[0]).sort(),['address','end','pharmacy','role','shiftId','slotId','start','wallStart','wallEnd','timeZone'].sort());
 assert.equal(rows[0].start,'2027-01-07T23:00:00.000Z');
 assert.doesNotMatch(JSON.stringify(rows),/999.99|PRIVATE|bankAccount/);
 assert.equal(sanitizeConfirmedShifts([sample],null).length,0);
});
test('overnight shifts cross midnight; duplicate and impossible dates are rejected',()=>{
 const bad={...sample,slots:[sample.slots[0],sample.slots[0],{id:100,date:'2027-01-08',startTime:'19:00',endTime:'08:00'},{id:101,date:'2027-02-30',startTime:'10:00',endTime:'11:00'}]};
 const rows=sanitizeConfirmedShifts([bad],7);
 assert.equal(rows.length,2);
 const overnight=rows.find(x=>x.slotId===100);
 assert.equal(overnight.wallEnd,'2027-01-09T08:00:00');
});
test('Sydney DST differs from Queensland and calendar preserves source zone',()=>{
 const s={...sample,pharmacyDetail:{...sample.pharmacyDetail,state:'NSW'}};
 const rows=sanitizeConfirmedShifts([s],7);
 assert.equal(rows[0].start,'2027-01-07T22:00:00.000Z');
 const cal=new URL(calendarEditorUrl(rows[0]));
 assert.equal(cal.searchParams.get('ctz'),'Australia/Sydney');
 assert.equal(cal.searchParams.get('dates'),'20270108T090000/20270108T170000');
});
test('upcoming order and navigation use safe external destinations',()=>{
 const rows=sanitizeConfirmedShifts([sample],7);
 assert.equal(upcomingShifts(rows,new Date('2027-01-09T00:00:00Z')).length,1);
 assert.match(directionsUrl(rows[0]),/^https:\/\/www\.google\.com\/maps\/dir\//);
});
