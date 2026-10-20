import assert from 'node:assert/strict';
import { test } from 'vitest';
import * as model from './planner';
import { plannerCopyRequest, taskStatusLabel } from './planner';
import { projectCalendarFeed } from './mappers';

const note={id:8,pharmacy:101,date:'2027-01-06',series_date:'2026-12-28',title:'Opening',body:'Details',status:'open',is_planner_task:true,is_clinical:true,
 start_time:'09:00:00',end_time:'10:00:00',notify_on_shift_start:false,is_general:false,recurrence:{freq:'WEEKLY',interval:2,byweekday:[0,2],until_date:'2027-04-01'},
 assignees:[{id:4,membership_id:702,user_id:2,user_name:'Worker',notified_at:null,created_at:''}],created_by:1,created_by_name:'Owner',created_at:'',updated_at:'2026-12-20T00:00:00.123456Z'};

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
 assert.equal(model.copyResultMessage({created:0,task_ids:[],skipped_series:0,dropped_assignees:[]}),'0 copied.');
 assert.equal(model.copyResultMessage({created:2,task_ids:[1,2],skipped_series:0,dropped_assignees:[{task_id:1,membership_id:9,name:'Alex'}]}),'2 copied; 1 people dropped: Alex.');
});

test('duplicate stays on the same day; day and week copies use the atomic API offsets', () => {
  const day = new Date(2027, 0, 1);
  assert.deepEqual({ ...plannerCopyRequest(3, day, 'task', null, 18), request_key: 'key' }, {
    pharmacy: 3, source_from: '2027-01-01', source_to: '2027-01-01', day_offset: 0, task_id: 18, request_key: 'key',
  });
  assert.deepEqual({ ...plannerCopyRequest(3, day, 'day', null), request_key: 'key' }, {
    pharmacy: 3, source_from: '2027-01-01', source_to: '2027-01-01', day_offset: 1, request_key: 'key',
  });
  assert.deepEqual({ ...plannerCopyRequest(3, day, 'week', null), request_key: 'key' }, {
    pharmacy: 3, source_from: '2026-12-28', source_to: '2027-01-03', day_offset: 7, request_key: 'key',
  });
});

test('an uncertain copy reuses its key only for identical input, including the source task and pharmacy', () => {
  const day = new Date(2027, 0, 1);
  const previous = plannerCopyRequest(3, day, 'task', null, 18);
  assert.equal(plannerCopyRequest(3, day, 'task', previous, 18), previous);
  assert.notEqual(plannerCopyRequest(3, day, 'task', previous, 19).request_key, previous.request_key);
  assert.notEqual(plannerCopyRequest(4, day, 'task', previous, 18).request_key, previous.request_key);
  assert.notEqual(plannerCopyRequest(3, day, 'day', previous).request_key, previous.request_key);
  assert.notEqual(plannerCopyRequest(3, new Date(2027, 0, 2), 'task', previous, 18).request_key, previous.request_key);
  assert.notEqual(plannerCopyRequest(3, day, 'task', null, 18).request_key, previous.request_key);
});


test('staff see their own To do / Done state; managers see completion counts', () => {
  const note = { status: 'open', assignees: [{}, {}, {}], completed_count: 2 };
  assert.equal(taskStatusLabel(note, false), 'To do');
  assert.equal(taskStatusLabel({ ...note, status: 'done' }, false), 'Done');
  assert.equal(taskStatusLabel(note, true), '2 of 3 done');
  assert.equal(taskStatusLabel({ status: 'open', assignees: [] }, true), '');
});


test('each copy action gets a fresh key', () => {
  const day = new Date(2027, 0, 1);
  assert.notEqual(plannerCopyRequest(3, day, 'day', null).request_key, plannerCopyRequest(3, day, 'day', null).request_key);
});


test('roster input uses local times and filling adds each person once', () => {
 const form = {...model.emptyNoteForm(new Date(2027, 0, 1), true), assigneeIds: [7], startTime: '09:00', isClinical: true};
 assert.deepEqual(model.plannerRosterInput(form, 3), {pharmacy: 3, date: '2027-01-01', start_time: '09:00', end_time: null, is_clinical: true});
 const filled = model.mergeRosterAssignees(form, [7, 8, 8]);
 assert.deepEqual(filled.assigneeIds, [7, 8]);
 assert.deepEqual(form.assigneeIds, [7]);
 assert.deepEqual(model.savedTaskInput(filled, 3), {pharmacy: 3, title: '', details: '', start_time: '09:00', end_time: null, is_clinical: true});
});

test('completed tasks lock scheduling even when only completed_by is supplied', () => {
 assert.equal(model.canEditTaskSchedule({...note, completed_by: ['Worker']}), false);
 assert.equal(model.canEditTaskSchedule({...note, completed_count: 0}, 1), false);
 assert.equal(model.canEditTaskSchedule({...note, is_planner_task: false}, 1), true);
});

test('feed projection keeps occurrences, source data, completion and local wall times', () => {
 const event = {id: '3-2027-01-01', series_id: 3, is_occurrence: true, title: 'Event', date: '2027-01-01', start_time: '09:00:00', end_time: '10:00:00', source: 'manual'};
 const feed = projectCalendarFeed({events: [event], work_notes: [{...note, completed_by: ['Worker']}]});
 assert.equal(feed[0].seriesId, 3); assert.equal(feed[0].isOccurrence, true);
 assert.equal(feed[0].date.getFullYear(), 2027); assert.equal(feed[0].date.getMonth(), 0); assert.equal(feed[0].date.getDate(), 1);
 assert.equal(feed[0].readOnly, false); assert.equal(feed[0].time, '09:00 - 10:00'); assert.equal(feed[0].eventData, event);
 assert.deepEqual(feed[1].assignees, ['Worker']); assert.deepEqual(feed[1].assigneeMembershipIds, [702]);
 assert.deepEqual(feed[1].completedBy, ['Worker']); assert.equal(feed[1].status, 'OPEN'); assert.equal(feed[1].allDay, false);
});


test('task actions follow manager and assignee permissions; informal notes keep their actions', () => {
 assert.deepEqual(model.calendarTaskState(note, true, 99), { label: '0 of 1 done', canEdit: true, canComplete: false });
 assert.deepEqual(model.calendarTaskState(note, false, 2), { label: 'To do', canEdit: false, canComplete: true });
 assert.equal(model.calendarTaskState(note, false, 99).canComplete, false);
 assert.equal(model.calendarTaskState({...note, is_planner_task: false}, false, 99).canEdit, true);
 assert.equal(model.calendarTaskState({...note, is_planner_task: false}, false, 99).canComplete, true);
 assert.equal(model.taskRepeatLabel({freq: 'WEEKLY'}), 'Weekly');
 assert.equal(model.taskRepeatLabel({freq: 'DAILY', interval: 2}), 'Every 2 days');
});
