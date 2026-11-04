import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
const source=readFileSync(new URL('./nextShiftModel.ts',import.meta.url),'utf8');
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const scope={exports:{},Date,Set,Number,String,URLSearchParams,encodeURIComponent};
runInNewContext(js,scope);
const {sanitizeConfirmedShifts,upcomingShifts,calendarEditorUrl,directionsUrl}=scope.exports;
const sample={id:5,roleNeeded:'PHARMACIST',pharmacyDetail:{name:'Test pharmacy',streetAddress:'10 Example St',suburb:'Brisbane',state:'QLD'},slots:[{id:9,date:'2027-01-08',startTime:'09:00:00',endTime:'17:00:00'},{id:10,date:'2027-01-10',startTime:'09:00',endTime:'17:00'}],hourlyRate:'999.99',lineItems:[{bankAccount:'PRIVATE'}]};
test('cache projection excludes financial and private shift fields',()=>{
 const rows=sanitizeConfirmedShifts([sample],123);
 assert.equal(rows.length,2);
 assert.deepEqual(Object.keys(rows[0]).sort(),['address','end','pharmacy','role','shiftId','slotId','start'].sort());
 assert.doesNotMatch(JSON.stringify(rows),/999.99|PRIVATE|bankAccount/);
 assert.equal(sanitizeConfirmedShifts([sample],null).length,0);
});
test('invalid reverse and duplicate slots are rejected',()=>{
 const bad={...sample,slots:[sample.slots[0],sample.slots[0],{id:100,date:'2027-01-08',startTime:'19:00',endTime:'08:00'},{id:101,date:'2027-02-30',startTime:'10:00',endTime:'11:00'}]};
 assert.equal(sanitizeConfirmedShifts([bad],7).length,1);
});
test('upcoming shifts are chronological and calendar choice needs user confirmation',()=>{
 const rows=sanitizeConfirmedShifts([sample],7);
 assert.equal(upcomingShifts(rows,new Date('2027-01-09T00:00:00Z')).length,1);
 const url=new URL(calendarEditorUrl(rows[0]));
 assert.equal(url.host,'calendar.google.com');
 assert.equal(url.searchParams.get('action'),'TEMPLATE');
 assert.match(url.searchParams.get('dates'),/^\d{8}T\d{6}Z\/\d{8}T\d{6}Z$/);
 assert.match(directionsUrl(rows[0]),/^https:\/\/www\.google\.com\/maps\/dir\//);
});
