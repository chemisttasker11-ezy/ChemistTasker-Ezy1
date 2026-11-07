const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../node_modules/react-native-google-places-autocomplete/GooglePlacesAutocomplete.js'), 'utf8');
const part = (start, end) => source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)));
function setup() {
  const events = [], requests = [];
  class XHR { constructor(){requests.push(this)} open(){} send(){} abort(){this.aborted=true} }
  const context = { XMLHttpRequest: XHR, detailsRequestRef:{current:null}, requestsRef:{current:[]}, fetchDetails:true, hideListView(){}, Keyboard:{dismiss(){}}, _enableRowLoader(){}, _disableRowLoaders(){events.push('clear')}, timeout:1000, onTimeout(){}, onPress:(row,details)=>events.push(['selected',details]), _onBlur(){}, setStateText:x=>events.push(['text',x]), _renderDescription:x=>x.description, isNewPlacesAPI:false, url:'https://example.test', Qs:{stringify:()=>''}, query:{}, GooglePlacesDetailsQuery:{}, requestShouldUseWithCredentials:()=>false, setRequestHeaders(){}, getRequestHeaders(){}, props:{}, textInputProps:{onChangeText:x=>events.push(['edit',x])}, _onChangeText:x=>events.push(['query',x]), console };
  context.useCallback = fn => fn;
  context.setListWasDismissed = () => {};
  context.debounceData = text => events.push(['query',text]);
  vm.runInNewContext(part('  const _abortRequests = useCallback(() => {', '  // ==========================================================================' ) + '\nthis._abortRequests=_abortRequests;', context);
  vm.runInNewContext(part('  const _onPress = (rowData) => {','  const _onChangeText = (text) => {') + part('  const _onChangeText = (text) => {','  const hideListView =') + '\nthis.select=_onPress; this.edit=_handleChangeText;',context);
  return {context,events,requests};
}
function respond(request, callback) { request.readyState=4; request.status=200; request.responseText=JSON.stringify({status:'OK',result:{place_id:'selected',geometry:{location:{lat:1,lng:2}}}}); callback(); }
test('edit immediately invalidates pending details even if late callback fires', async () => {
  const {context,events,requests}=setup(); context.select({place_id:'x',description:'old'}); const req=requests[0], late=req.onreadystatechange;
  context.edit('new'); assert.equal(req.aborted,true); assert.equal(req.onreadystatechange,null);
  await new Promise(resolve=>setImmediate(resolve)); respond(req,late);
  assert.equal(events.some(e=>Array.isArray(e)&&e[0]==='selected'),false);
  assert.ok(events.some(e=>Array.isArray(e)&&e[0]==='edit'&&e[1]==='new'));
  assert.ok(events.some(e=>Array.isArray(e)&&e[0]==='query'&&e[1]==='new'));
});
test('uninterrupted suggestion retains details and future edits do not abort it', async () => {
  const {context,events,requests}=setup(); context.select({place_id:'x',description:'selected address'}); const req=requests[0];
  await new Promise(resolve=>setImmediate(resolve)); respond(req,req.onreadystatechange);
  assert.equal(events.find(e=>Array.isArray(e)&&e[0]==='selected')[1].place_id,'selected');
  context.edit('next'); assert.equal(req.aborted,undefined);
});

test('actual request cancellation clears detail tracking and rejects a captured response', async () => {
  const {context,events,requests}=setup(); context.select({place_id:'x',description:'old'}); const req=requests[0], late=req.onreadystatechange;
  context._abortRequests();
  assert.equal(context.detailsRequestRef.current,null); assert.equal(context.requestsRef.current.length,0); assert.equal(req.aborted,true);
  await new Promise(resolve=>setImmediate(resolve)); respond(req,late);
  assert.equal(events.some(e=>Array.isArray(e)&&e[0]==='selected'),false);
});
test('component cleanup cancels queued debounce and active details', async () => {
  const {context,events,requests}=setup(); let queued=true; const effects=[];
  context.useEffect=fn=>effects.push(fn()); context.debounceData=()=>{}; context.debounceData.cancel=()=>{queued=false};
  context.prevQueryStringRef={current:'same'}; context.queryString='same'; context.stateText=''; context.minLength=1;
  vm.runInNewContext(part('  useEffect(() => {\n    return () => {\n      // Cleanup debounced function on unmount', '  // Auto-show list'),context);
  context.select({place_id:'x',description:'old'}); const req=requests[0], late=req.onreadystatechange;
  effects.forEach(cleanup=>cleanup()); assert.equal(queued,false); assert.equal(req.aborted,true);
  await new Promise(resolve=>setImmediate(resolve)); respond(req,late);
  assert.equal(events.some(e=>Array.isArray(e)&&e[0]==='selected'),false);
});
test('timeout clears pending details so a late response cannot select', async () => {
  const {context,events,requests}=setup(); let timeouts=0, receiver, receivedEvent; context.onTimeout=function(event){timeouts++; receiver=this; receivedEvent=event};
  context.select({place_id:'x',description:'old'}); const req=requests[0], late=req.onreadystatechange;
  const event={type:'timeout'}; req.ontimeout(event); assert.equal(timeouts,1); assert.equal(receiver,req); assert.equal(receivedEvent,event); assert.equal(context.detailsRequestRef.current,null);
  await new Promise(resolve=>setImmediate(resolve)); respond(req,late);
  assert.equal(events.some(e=>Array.isArray(e)&&e[0]==='selected'),false);
});
