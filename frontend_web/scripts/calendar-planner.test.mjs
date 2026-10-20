import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {createRequire,Module} from 'node:module';
import {fileURLToPath} from 'node:url';
import ts from 'typescript';

// Node's type stripping cannot load TSX or extensionless imports, so compile the source with the app's TypeScript.
function load(relative,stubs={}){
 const filename=fileURLToPath(new URL(relative,import.meta.url));
 const {outputText}=ts.transpileModule(readFileSync(filename,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}});
 const compiled=new Module(filename);compiled.filename=filename;
 const resolve=createRequire(filename);compiled.require=id=>id in stubs?stubs[id]:resolve(id);
 compiled._compile(outputText,filename);
 return compiled.exports;
}
// shared-core's dist only resolves under a bundler; navigation needs just its capability names.
const nav=load('../src/navigation.tsx',{'./constants/adminCapabilities':load('../../shared-core/src/constants/capabilities.ts'),'@chemisttasker/shared-core':{}});
const model=load('../src/pages/dashboard/sidebar/PharmacyCalendarPage.model.ts',{'../../../utils/apiClient':{default:{}}});

const calendarItems=(navigation,segment)=>navigation.filter(item=>item.segment===segment);
const note={id:8,pharmacy:101,date:'2027-01-06',series_date:'2026-12-28',title:'Opening',body:'Details',status:'open',is_planner_task:true,is_clinical:true,
 start_time:'09:00:00',end_time:'10:00:00',notify_on_shift_start:false,is_general:false,recurrence:{freq:'WEEKLY',interval:2,byweekday:[0,2],until_date:'2027-04-01'},
 assignees:[{id:4,membership_id:702,user_id:2,user_name:'Worker',notified_at:null,created_at:''}],created_by:1,created_by_name:'Owner',created_at:'',updated_at:'2026-12-20T00:00:00.123456Z'};

test('organization Calendar is reachable by either former Operations permission and nothing else',()=>{
 for(const capabilities of [['manage_roster'],['manage_communications'],['manage_roster','manage_communications']]){
  const navigation=nav.getOrganizationNav(false,capabilities);
  assert.equal(calendarItems(navigation,'dashboard/organization/calendar').length,1,capabilities.join());
  assert.doesNotMatch(JSON.stringify(navigation),/operations/);
 }
 assert.equal(calendarItems(nav.getOrganizationNav(false,['manage_staff']),'dashboard/organization/calendar').length,0);
 assert.equal(calendarItems(nav.getOrganizationNav(false,[]),'dashboard/organization/calendar').length,0);
});

test('pharmacy admins with roster or communications reach the scoped Calendar; owners keep theirs',()=>{
 for(const capabilities of [['MANAGE_ROSTER'],['MANAGE_COMMUNICATIONS']]){
  const assignment={pharmacy_id:101,admin_level:'FULL_ADMIN',capabilities};
  const navigation=nav.getAdminNav({assignments:[assignment],activeAssignment:assignment,hasUnreadMessages:false,userRole:'PHARMACIST',activePharmacyId:101});
  assert.equal(calendarItems(navigation,'dashboard/admin/101/calendar').length,1,capabilities.join());
  assert.doesNotMatch(JSON.stringify(navigation),/operations/);
 }
 const owner=nav.getOwnerNav(100,false);
 assert.equal(calendarItems(owner,'dashboard/owner/calendar').length,1);
 assert.doesNotMatch(JSON.stringify(owner),/operations/);
});

test('Plan fetches the Monday to Sunday week, across month and year ends',()=>{
 for(const [day,from,to] of [['2027-01-01','2026-12-28','2027-01-03'],['2027-01-03','2026-12-28','2027-01-03'],['2027-01-04','2027-01-04','2027-01-10'],
  ['2026-11-01','2026-10-26','2026-11-01'],['2026-10-19','2026-10-19','2026-10-25']])
  assert.deepEqual(model.weekRange(new Date(`${day}T00:00:00`)),{from,to},day);
});

test('new planner tasks are unassigned with notifications off; informal notes keep their defaults',()=>{
 const form=model.emptyNoteForm(new Date('2026-12-31T00:00:00'),true);form.title='  Opening  ';
 const payload=model.notePayload(form,101);
 assert.equal(payload.title,'Opening');assert.equal(payload.date,'2026-12-31');assert.equal(payload.isPlannerTask,true);
 assert.deepEqual(payload.assigneeMembershipIds,[]);assert.equal(payload.notifyOnShiftStart,false);
 assert.equal(payload.recurrence,null);assert.equal(payload.startTime,null);assert.equal(payload.endTime,null);
 const informal=model.emptyNoteForm(new Date());
 assert.equal(model.notePayload(informal,101).isPlannerTask,false);
 assert.deepEqual(model.notePayload({...informal,isGeneral:true,assigneeIds:[702]},101).assigneeMembershipIds,[]);
 assert.equal(model.notePayload({...form,isGeneral:true}).isGeneral,false);
});

test('editing starts from the series date and keeps weekdays and the exact stale token',()=>{
 const payload=model.notePayload(model.editNoteForm(note),101);
 assert.equal(payload.date,'2026-12-28');assert.deepEqual(payload.recurrence,note.recurrence);assert.equal(payload.updatedAt,note.updated_at);
 assert.equal(payload.startTime,'09:00');
 assert.equal(model.editNoteForm({...note,series_date:undefined,date:'2026-12-28'}).date,'2026-12-28');
});

test('planner tasks lock once anyone has completed them',()=>{
 assert.equal(model.editNoteForm(note,1).locked,true);
 assert.equal(model.editNoteForm({...note,completed_count:1}).locked,true);
 assert.equal(model.editNoteForm(note).locked,false);
 assert.equal(model.editNoteForm({...note,is_planner_task:false,completed_count:1}).locked,false);
});

test('saved tasks fill details without changing the day, people or repeats',()=>{
 const form=model.editNoteForm(note);
 const saved={id:1,pharmacy:101,title:'Saved',details:'Reusable details',start_time:null,end_time:null,is_clinical:false};
 const used=model.applySavedTask(form,saved);
 assert.equal(used.title,'Saved');assert.equal(used.body,'Reusable details');assert.equal(used.startTime,'');assert.equal(used.isClinical,false);
 assert.equal(used.date,form.date);assert.deepEqual(used.assigneeIds,[702]);assert.equal(used.recurrence,form.recurrence);
 saved.title='Changed later';assert.equal(used.title,'Saved');
});

test('copy feedback reports copied, skipped repeating and dropped people once by name',()=>{
 assert.equal(model.copyResultMessage({created:3,task_ids:[1,2,3],skipped_series:2,dropped_assignees:[{task_id:1,membership_id:9,name:'Alex'},{task_id:2,membership_id:9,name:'Alex'}]}),
  '3 copied; 2 repeating skipped; 2 people dropped: Alex.');
 assert.equal(model.copyResultMessage({created:0,task_ids:[],skipped_series:0,dropped_assignees:[]}),'0 copied; 0 repeating skipped; 0 people dropped.');
});
