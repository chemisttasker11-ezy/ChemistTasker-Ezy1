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

function hookHarness(file,core,react={useState:v=>[v,()=>{}],useRef:v=>({current:v}),useCallback:fn=>fn,useEffect:()=>{}}){
  const source=path.resolve(__dirname,'../roles/shared/shifts/ActiveShiftsPage/hooks',file);
  const result=ts.transpileModule(fs.readFileSync(source,'utf8'),{
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true}
  }).outputText;
  const module={exports:{}};
  vm.runInNewContext(result,{module,exports:module.exports,console:{...console,error(){},log(){}},__DEV__:false,require(name){
    if(name==='react')return react;
    if(name==='@chemisttasker/shared-core')return core;
    if(name==='../utils/activeShiftRuntime')return {getNextGeneration:()=>1,isLatestGeneration:()=>true};
    throw Error('Unexpected M5 hook dependency '+name);
  }},{filename:source});
  return module.exports;
}
function deferredCalls(){
  const calls=[];
  return {calls,service:(...args)=>new Promise((resolve,reject)=>calls.push({args,resolve,reject}))};
}
function counterHarness(){
  const accept=deferredCalls(),reject=deferredCalls();
  const hook=hookHarness('useCounterOffers.ts',{acceptShiftCounterOfferService:accept.service,
    rejectShiftCounterOfferService:reject.service,fetchShiftCounterOffersService:async()=>[]});
  return {accept,reject,offers:hook.useCounterOffers('owner:7')};
}
test('R counter offers for N visible shifts load in one batch request, 100 ids per request (O4 N2)',async()=>{
  const batches=[],singles=[],state={};
  // useState slots in call order: offers, loading, error by shift.
  let slot=0;const react={useState:v=>{const key=slot++;state[key]=v;return [v,u=>{state[key]=typeof u==='function'?u(state[key]):u;}];},
    useRef:v=>({current:v}),useCallback:fn=>fn,useEffect:()=>{}};
  const hook=hookHarness('useCounterOffers.ts',{acceptShiftCounterOfferService:async()=>{},rejectShiftCounterOfferService:async()=>{},
    fetchShiftCounterOffersService:async id=>{singles.push(id);return [];},
    fetchShiftCounterOffersBatchService:async ids=>{batches.push(ids);
      if(ids.includes(666))throw Error('throttled');
      return Object.fromEntries(ids.filter(id=>id!==5).map(id=>[id,[{id:id*10,status:'PENDING'},{id:1,status:'ACCEPTED'}]]));}},react);
  const offers=hook.useCounterOffers('owner:7');
  const ids=Array.from({length:47},(_,i)=>i+1);
  await offers.loadCounterOffersBatch(ids);
  const plain=v=>JSON.parse(JSON.stringify(v));
  assert.deepEqual(plain(batches),[ids]);
  assert.deepEqual(singles,[]);
  assert.deepEqual(plain(state[0][3]),[{id:30,status:'PENDING'}]);
  // A shift the server left out (not visible to this user) shows no offers, not a spinner.
  assert.deepEqual(plain(state[0][5]),[]);
  assert.equal(state[1][3],false);
  batches.length=0;
  await offers.loadCounterOffersBatch(Array.from({length:150},(_,i)=>i+101));
  assert.deepEqual(plain(batches.map(chunk=>chunk.length)),[100,50]);
  await offers.loadCounterOffersBatch([666,667]);
  assert.equal(state[2][667],'throttled');
  assert.deepEqual(plain(state[0][667]),[]);
  const centre=fs.readFileSync(path.resolve(__dirname,'../roles/shared/shifts/ActiveShiftsPage/index.tsx'),'utf8');
  assert.match(centre,/loadCounterOffersBatch\(missing\)/);
  assert.doesNotMatch(centre,/forEach\(\(shift\) => \{[^}]*loadCounterOffers\(shift\.id\)/);
  const board=fs.readFileSync(path.resolve(__dirname,'../roles/shared/shifts/ShiftsBoard/hooks/useCounterOffers.ts'),'utf8');
  assert.match(board,/fetchShiftCounterOffersBatchService\(toFetch\.slice\(start, start \+ 100\)\)/);
});
test('R counter-offer accept sends once on same-render taps, then permits a retry',async()=>{
  const h=counterHarness();
  const offer={id:555};
  let successes=0;
  const a=h.offers.acceptOffer({offer,shiftId:12,slotId:201},()=>{successes++;});
  const b=h.offers.acceptOffer({offer,shiftId:12,slotId:201},()=>{successes++;});
  assert.equal(h.accept.calls.length,1,'a second immediate tap must not accept the counter offer twice');
  h.accept.calls[0].resolve({});
  await Promise.all([a,b]);
  assert.equal(successes,1);
  const later=h.offers.acceptOffer({offer,shiftId:12,slotId:201});
  assert.equal(h.accept.calls.length,2,'a settled accept permits an explicit retry');
  h.accept.calls[1].resolve({});
  assert.equal((await later).ok,true);
});
test('R counter-offer reject cannot race a pending accept of the same offer',async()=>{
  const h=counterHarness();
  const offer={id:555};
  const a=h.offers.acceptOffer({offer,shiftId:12,slotId:201});
  const r=h.offers.rejectOffer({offer,shiftId:12});
  const r2=h.offers.rejectOffer({offer:{id:556},shiftId:12});
  assert.equal(h.reject.calls.length,1,'only the other offer is rejected while 555 is being accepted');
  assert.equal(h.reject.calls[0].args[0].offerId,556);
  h.accept.calls[0].reject(Error('conflict'));
  h.reject.calls[0].resolve({});
  assert.equal((await a).ok,false);
  await Promise.all([r,r2]);
  const again=h.offers.rejectOffer({offer,shiftId:12}),twice=h.offers.rejectOffer({offer,shiftId:12});
  assert.equal(h.reject.calls.length,2,'a failed accept releases the lock; rejecting twice still sends once');
  h.reject.calls[1].resolve({});
  await Promise.all([again,twice]);
});
test('R reveal sends once on same-render taps and both taps get the revealed candidate',async()=>{
  const reveal=deferredCalls();
  const notices=[];
  const hook=hookHarness('useRevealInterest.ts',{revealShiftInterestService:reveal.service});
  const {revealInterest}=hook.useRevealInterest((id,level)=>`${id}_${level}`,()=>{},msg=>notices.push(msg));
  const shift={id:12},interest={id:3,userId:87,slotId:201};
  const a=revealInterest(shift,interest,'PLATFORM'),b=revealInterest(shift,interest,'PLATFORM');
  assert.equal(reveal.calls.length,1,'a second immediate tap must not reveal twice');
  reveal.calls[0].resolve({id:87,firstName:'Wren'});
  const [first,second]=await Promise.all([a,b]);
  assert.equal(first.id,87);
  assert.equal(second.id,87,'the later tap still opens the revealed candidate');
  assert.equal(notices.filter(x=>x==='Candidate revealed.').length,1);
  const other=revealInterest(shift,{id:4,userId:88,slotId:201},'PLATFORM');
  const retry=revealInterest(shift,interest,'PLATFORM');
  assert.equal(reveal.calls.length,3,'other candidates and a settled retry are not blocked');
  reveal.calls[1].resolve({id:88});reveal.calls[2].reject(Error('offline'));
  assert.equal((await other).id,88);
  assert.equal(await retry,null);
});
