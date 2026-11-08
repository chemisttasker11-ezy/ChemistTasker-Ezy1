// Mounted hook contract: exercise the actual shift actions through TypeScript transpilation.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const ts=require('../node_modules/typescript');
const sourcePath=path.resolve(__dirname,'../roles/shared/shifts/ActiveShiftsPage/hooks/useShiftActions.ts');
function harness(){
  const counts={escalate:[],remove:[],accept:[]},notices=[];
  let shifts=[{id:12,visibility:'FULL_PART_TIME'},{id:13,visibility:'LOCUM_CASUAL'}];
  const deferred={};
  for(const action of Object.keys(counts)){
    let complete,fail;
    const promise=new Promise((resolve,reject)=>{complete=resolve;fail=reject});
    deferred[action]={promise,complete,fail};
  }
  const core={
    escalateShiftService:(...args)=>{counts.escalate.push(args);return deferred.escalate.promise;},
    deleteActiveShiftService:(...args)=>{counts.remove.push(args);return deferred.remove.promise;},
    acceptShiftCandidateService:(...args)=>{counts.accept.push(args);return deferred.accept.promise;}
  };
  const react={
    useState:v=>[v,()=>{}],
    useRef:v=>({current:v}),
    useCallback:fn=>fn
  };
  const result=ts.transpileModule(fs.readFileSync(sourcePath,'utf8'),{
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true}
  }).outputText;
  const module={exports:{}};
  vm.runInNewContext(result,{module,exports:module.exports,console,require(name){
    if(name==='react')return react;
    if(name==='@chemisttasker/shared-core')return core;
    throw Error('Unexpected M5 action dependency '+name);
  }},{filename:sourcePath});
  const setShifts=update=>{shifts=typeof update==='function'?update(shifts):update};
  const actions=module.exports.useShiftActions(setShifts,msg=>notices.push(msg));
  return {actions,counts,notices,deferred,getShifts:()=>shifts};
}
test('R escalation submits only once on same-render taps, then permits a retry',async()=>{
  const h=harness();
  const a=h.actions.handleEscalate(12,'LOCUM_CASUAL');
  const b=h.actions.handleEscalate(12,'LOCUM_CASUAL');
  assert.equal(h.counts.escalate.length,1,'same-render escalation must be single-flight');
  h.deferred.escalate.complete({});
  const results=await Promise.all([a,b]);
  assert.equal(results[0],true);
  assert.equal(h.getShifts()[0].visibility,'LOCUM_CASUAL');
  assert.equal(h.notices.filter(x=>x==='Shift escalated successfully').length,1);
  await h.actions.handleEscalate(12,'PLATFORM');
  assert.equal(h.counts.escalate.length,2);
});
test('R deletion does not issue two DELETE calls for one shift',async()=>{
  const h=harness();
  const a=h.actions.handleDelete(12),b=h.actions.handleDelete(12);
  assert.equal(h.counts.remove.length,1);
  h.deferred.remove.complete({});
  const results=await Promise.all([a,b]);
  assert.equal(results[0],true);
  assert.deepEqual(JSON.parse(JSON.stringify(h.getShifts().map(s=>s.id))),[13]);
  assert.equal(h.notices.filter(x=>x==='Shift deleted successfully').length,1);
});
test('R candidate acceptance cannot create duplicate offers on rapid taps',async()=>{
  const h=harness();
  const a=h.actions.handleAccept(12,87,201),b=h.actions.handleAccept(12,87,201);
  assert.equal(h.counts.accept.length,1);
  assert.deepEqual(JSON.parse(JSON.stringify(h.counts.accept[0])),[12,{userId:87,slotId:201}]);
  h.deferred.accept.complete({id:909});
  const results=await Promise.all([a,b]);
  assert.equal(results[0].id,909);
  assert.equal(h.notices.filter(x=>x.includes('Offer sent')).length,1);
  await h.actions.handleAccept(12,87,201);
  assert.equal(h.counts.accept.length,2,'explicit later retry is allowed once settled');
});

test('R candidate offers to separate dates remain independent while one request is pending',async()=>{
  const h=harness();
  const first=h.actions.handleAccept(12,87,201);
  const repeated=h.actions.handleAccept(12,87,201);
  const second=h.actions.handleAccept(12,87,202);
  assert.equal(h.counts.accept.length,2,
    'distinct slots must not share the same single-flight key');
  assert.deepEqual(JSON.parse(JSON.stringify(h.counts.accept.map(([,payload])=>payload.slotId))),[201,202]);
  h.deferred.accept.complete({id:910});
  const results=await Promise.all([first,repeated,second]);
  assert.equal(results[1],false,'repeated tap on the first slot is ignored');
  assert.equal(results[0].id,910);
  assert.equal(results[2].id,910);
  assert.equal(h.notices.filter(x=>x.includes('Offer sent')).length,2);
});
