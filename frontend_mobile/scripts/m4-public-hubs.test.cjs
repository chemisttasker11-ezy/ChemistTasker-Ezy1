// M4-07: executable native hub behavior, using real transpiled screen and transport facade.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('../node_modules/typescript');

const source = fs.readFileSync(path.resolve(__dirname, '../app/explore/hubs/[hub].tsx'), 'utf8');
const output = ts.transpileModule(source, { fileName:'[hub].tsx',
  compilerOptions:{ module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,
    jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true } }).outputText;
const element = (type,props,key) => ({type,props:{...(props||{}),...(key===undefined?{}:{key})}});
function find(node, predicate, found=[]) {
  if(Array.isArray(node)) node.forEach(n=>find(n,predicate,found));
  else if(node && typeof node==='object') {
    if(predicate(node)) found.push(node);
    find(node.props?.children,predicate,found);
  }
  return found;
}
function page(items,next=null) { return { count:items.length,results:items,next,previous:null }; }
const poll = id => ({id,question:'Poll '+id,options:[{id:id*10,text:'Yes',votes:0}],
  can_interact:true,is_closed:false});
const post = id => ({id,body:'Post '+id,author_name:'Demo',comment_count:0,
  reactions:{},is_pinned:false});
function deferred() { let resolve,reject;const promise=new Promise((r,j)=>{resolve=r;reject=j;});
  return {promise,resolve,reject};}
function env(overrides={}) {
  const values=[], effects=[], cleanups={};
  let activeKey=null, cursor=0, hub=overrides.hub||'public', user=overrides.user===undefined?{id:7,role:'PHARMACIST'}:overrides.user;
  const calls={posts:[],polls:[],votes:[]};
  const api={
    listHubs: async()=>[{key:hub,label:'Demo Hub',can_interact:true}],
    listCommunityPosts:async(h,q)=>{calls.posts.push([h,q]);return page([post(q?.page===2?13:1)],q?.page===2?null:'?page=2');},
    listCommunityPolls:async(h,q)=>{calls.polls.push([h,q]);return page(q?.page===2?[poll(12),poll(13)]:Array.from({length:12},(_,i)=>poll(i+1)),q?.page===2?null:'?page=2');},
    voteCommunityPoll:async(id,option)=>{calls.votes.push([id,option]);return{};},
    createCommunityPost:async()=>({}),
    ...overrides.api,
  };
  const react={
    useState(initial){const i=cursor++;if(!(i in values))values[i]=typeof initial==='function'?initial():initial;
      return [values[i],v=>{values[i]=typeof v==='function'?v(values[i]):v;}];},
    useRef(initial){const i=cursor++;return values[i]??(values[i]={current:initial});},
    useCallback(fn,deps){const i=cursor++,s=values[i];if(!s||!deps||deps.some((v,j)=>v!==s.deps[j]))values[i]={value:fn,deps};return values[i].value;},
    useEffect(fn,deps){const i=cursor++,s=values[i];if(!s||!deps||deps.some((v,j)=>v!==s.deps[j])) {
      values[i]={deps};effects.push(()=>{cleanups[i]?.();cleanups[i]=fn();});
    }},
  };
  react.default=react;
  const mocks={
    react, 'react/jsx-runtime':{jsx:element,jsxs:element},
    'expo-document-picker':{getDocumentAsync:async()=>({canceled:true})},
    'react-native':{ScrollView:'ScrollView',Share:{share:async()=>{}},StyleSheet:{create:v=>v},View:'View'},
    'expo-router':{useLocalSearchParams:()=>({hub}),useRouter:()=>({push(){},replace(){},canGoBack:()=>false})},
    'react-native-paper':{Button:'Button',Card:Object.assign('Card',{Content:'CardContent'}),
      Text:'Text',TextInput:'TextInput'},
    '@/components/ui/BrandActivityIndicator':{BrandActivityIndicator:'Spinner'},
    'react-native-safe-area-context':{SafeAreaView:'SafeAreaView'},
    '@/config/api':{chemistTaskerApi:{publicContent:api}},
    '@/context/AuthContext':{useAuth:()=>({user})},
    '@/features/explore/RichContent':{RichContent:'RichContent'},
    '@/features/explore/webLinks':{publicWebUrl:x=>x},
    '@/constants/tokens':{colors:{pageBg:'',textPrimary:'',surfaceBg:'',border:'',textSecondary:'',primary:'',status:{red:{fg:''}}},
      radius:{card:2},space:{lg:4,md:3,sm:2,'3xl':12},touch:{min:44}},
  };
  const mod={exports:{}};
  vm.runInNewContext(output,{exports:mod.exports,module:mod,URL,URLSearchParams,FormData,
    Promise,console,require(name) {
      if(!(name in mocks)) throw Error('Unmocked '+name);
      const m=mocks[name];
      return m && typeof m==='object' && 'default' in m && !m.__esModule?{__esModule:true,...m}:m;
    }});
  const screen=mod.exports.default;
  async function tick() {
    while(effects.length)effects.shift()();
    await new Promise(resolve=>setTimeout(resolve,0));
    await new Promise(resolve=>setTimeout(resolve,0));
  }
  function render(){
    const shell=screen();
    if(activeKey!==null&&activeKey!==shell.props.key){
      Object.values(cleanups).forEach(fn=>typeof fn==='function'&&fn());
      values.length=0;effects.length=0;
      for(const key of Object.keys(cleanups))delete cleanups[key];
    }
    activeKey=shell.props.key;
    cursor=0;
    return shell.type(shell.props);
  }
  function button(label,tree=render()){const items=find(tree,n=>n.type==='Button');
    return items.find(n=>find(n.props?.children,x=>x===label).length||n.props?.children===label||String(n.props?.children).includes(label));}
  return {render,tick,button,calls,api,find,key:()=>screen().props.key,changeHub:newHub=>{hub=newHub;},changeUser:newUser=>{user=newUser;},
    unmount(){Object.values(cleanups).forEach(fn=>typeof fn==='function'&&fn());}};
}
test('R: search submit trims and caps at 200; post pagination retains q and clear resets',async()=>{
  const h=env();
  h.render();await h.tick();h.render();
  const search=h.find(h.render(),n=>n.type==='TextInput'&&n.props.label==='Search community posts')[0];
  assert.ok(search,'native post-search input required');
  search.props.onChangeText('  shifts '.repeat(30));
  const go=h.button('Search');
  assert.ok(go);
  go.props.onPress();
  await h.tick();h.render();
  assert.equal(h.calls.posts.at(-1)[1].q.length,200);
  assert.equal(h.calls.posts.at(-1)[1].page,1);
  h.button('Load more posts').props.onPress();
  await h.tick();
  assert.equal(h.calls.posts.at(-1)[1].q.length,200);
  assert.equal(h.calls.posts.at(-1)[1].page,2);
  h.button('Clear search').props.onPress();
  await h.tick();
  assert.equal(h.calls.posts.at(-1)[1].page,1);
  assert.ok(!h.calls.posts.at(-1)[1].q);
  assert.equal(h.calls.polls.length,1,'post query changes must not reset polls');
});
test('R: polls page 2 loads the thirteenth, merges and suppresses duplicate IDs',async()=>{
  const h=env();h.render();await h.tick();h.render();
  assert.ok(h.button('Load more polls'),'poll pager is separate from posts');
  h.button('Load more polls').props.onPress();
  await h.tick();
  assert.equal(h.calls.polls.at(-1)[1].page,2);
  const names=h.find(h.render(),n=>n.type==='Text'&&typeof n.props.children==='string'&&n.props.children.startsWith('Poll '));
  assert.equal(names.length,13,'duplicate poll id 12 from page 2 is collapsed');
  assert.equal(new Set(names.map(n=>n.props.children)).size,13);
  assert.equal(names.filter(n=>n.props.children==='Poll 12').length,1);
  assert.equal(names.filter(n=>n.props.children==='Poll 13').length,1);
  assert.equal(h.button('Load more polls'),undefined,'last page has no more link');
});
test('R: failed poll paging is retryable without clearing visible first-page polls',async()=>{
  let failures=0;
  const h=env({api:{listCommunityPolls:async(_h,q)=>{
    if(q?.page===2 && failures++===0)throw Error('timeout');
    return page(Array.from({length:q?.page===2?1:12},(_,i)=>poll((q?.page===2?13:1)+i)),
      q?.page===2?null:'?page=2');
  }}});
  h.render();await h.tick();
  h.button('Load more polls').props.onPress();await h.tick();
  assert.ok(h.find(h.render(),n=>n.props?.accessibilityRole==='alert').length>0);
  assert.equal(h.find(h.render(),n=>n.type==='Text'&&String(n.props.children).startsWith('Poll ')).length,12);
  h.button('Retry polls').props.onPress();await h.tick();
  assert.equal(h.find(h.render(),n=>n.type==='Text'&&String(n.props.children).startsWith('Poll ')).length,13);
});
test('R: poll vote refreshes active poll page, not the post query',async()=>{
  const h=env();h.render();await h.tick();
  h.button('Load more polls').props.onPress();await h.tick();
  const before=h.calls.posts.length;
  const choice=h.find(h.render(),n=>n.type==='Button'&&String(n.props.children).includes('Yes'))[0];
  assert.ok(choice&&!choice.props.disabled);
  choice.props.onPress();await h.tick();
  assert.equal(h.calls.votes.length,1);
  assert.deepEqual(h.calls.votes[0],[1,10],'first eligible poll must submit its exact option');
  assert.equal(h.calls.posts.length,before,'vote must not reload or erase post discussion');
  assert.equal(h.calls.polls.at(-1)[1].page,2);
});
test('C: changing hub drops stale responses and errors, distinct account key remounts',async()=>{
  const first=deferred();
  const h=env({api:{listCommunityPosts:(hub,q)=>hub==='public'?first.promise:Promise.resolve(page([post(777)]))}});
  h.render();await h.tick();h.changeHub('explorer');h.render();await h.tick();
  first.reject(Error('stale 403'));await h.tick();
  assert.equal(h.find(h.render(),n=>n.type==='Text'&&n.props.children==='Post 777').length,1);
  assert.equal(h.find(h.render(),n=>n.props?.accessibilityRole==='alert').length,0);
  const key=h.key();
  h.changeUser({id:88,role:'EXPLORER'});
  const other=h.key();
  assert.notEqual(key,other);
});


test('C: closed and server-ineligible poll options never call the voting facade',async()=>{
  const h=env({api:{listCommunityPolls:async()=>page([
    {...poll(41),is_closed:true},
    {...poll(42),can_interact:false},
  ])}});
  h.render();await h.tick();
  const tree=h.render();
  for(const id of [41,42]){
    const card=h.find(tree,n=>String(n.type)==='Card').find(n=>
      h.find(n,x=>x.type==='Text'&&x.props?.children==='Poll '+id).length===1);
    assert.ok(card,'server poll '+id+' is rendered');
    const action=h.find(card,n=>n.type==='Button'&&String(n.props?.children).includes('Yes'))[0];
    assert.ok(action);
    assert.equal(action.props.disabled,true,'server eligibility must disable voting for '+id);
    action.props.onPress();
  }
  await h.tick();
  assert.deepEqual(h.calls.votes,[],'no vote transport request is authorized');
});

test('C: account remount refreshes server interaction flags; former account cannot vote',async()=>{
  let permitted=true;
  const h=env({api:{listCommunityPolls:async(...a)=>{h.calls.polls.push(a);return page([{...poll(1),can_interact:permitted}]);}}});
  h.render();await h.tick();
  const first=h.render();
  const allowed=h.find(first,n=>n.type==='Button'&&String(n.props?.children).includes('Yes'))[0];
  assert.ok(allowed&&!allowed.props.disabled);
  const previousKey=h.key();
  permitted=false;
  h.changeUser({id:88,role:'EXPLORER'});
  h.render();await h.tick();
  const current=h.render();
  assert.notEqual(h.key(),previousKey,'account switch remounts the real feed');
  const forbidden=h.find(current,n=>n.type==='Button'&&String(n.props?.children).includes('Yes'))[0];
  assert.ok(forbidden);
  assert.equal(forbidden.props.disabled,true);
  forbidden.props.onPress();
  await h.tick();
  assert.equal(h.calls.polls.length,2,'new account fetches its own eligibility');
  assert.deepEqual(h.calls.votes,[],'former-account vote permission was not reused');
});

test('R: double-tapping Load more polls from one render sends exactly one page request',async()=>{
  const second=deferred();
  let pageTwoCalls=0;
  const h=env({api:{listCommunityPolls:async(_hub,params)=>{
    if(params?.page===2){pageTwoCalls++;return second.promise;}
    return page(Array.from({length:12},(_,i)=>poll(i+1)),'?page=2');
  }}});
  h.render();await h.tick();
  const sameTree=h.render();
  const action=h.button('Load more polls',sameTree);
  assert.ok(action);
  action.props.onPress();
  action.props.onPress(); // Same render: the pending ref must guard both presses.
  await h.tick();
  assert.equal(pageTwoCalls,1,'one in-flight request per poll feed');
  second.resolve(page([poll(12),poll(13)]));
  await h.tick();
  const names=h.find(h.render(),n=>n.type==='Text'&&String(n.props?.children).startsWith('Poll '));
  assert.equal(names.length,13);
  assert.equal(h.button('Load more polls'),undefined);
});

test('R: vote response after page-2 fetch refreshes every visible poll, never truncates newer pages',async()=>{
  const pendingVote=deferred(), votes=[];
  const h=env({api:{voteCommunityPoll:(pollId,optionId)=>{
    votes.push([pollId,optionId]);return pendingVote.promise;
  }}});
  h.render();await h.tick();
  const sameTree=h.render();
  const choice=h.find(sameTree,n=>n.type==='Button'&&String(n.props?.children).includes('Yes'))[0];
  const nextPageButton=h.button('Load more polls',sameTree);
  assert.ok(choice&&!choice.props.disabled&&nextPageButton);
  choice.props.onPress(); // Vote transport remains unresolved while page 2 loads.
  assert.deepEqual(votes,[[1,10]]);
  nextPageButton.props.onPress();
  await h.tick();
  const loaded=h.find(h.render(),n=>n.type==='Text'&&String(n.props?.children).startsWith('Poll '));
  assert.equal(loaded.length,13,'page 2 must finish while the vote is pending');
  assert.equal(h.calls.polls.at(-1)[1].page,2);
  pendingVote.resolve({});
  await h.tick(); // The vote refresh must read the up-to-date page count.
  const remaining=h.find(h.render(),n=>n.type==='Text'&&String(n.props?.children).startsWith('Poll '));
  assert.equal(remaining.length,13,'late vote refresh cannot drop newly loaded page 2');
  assert.equal(new Set(remaining.map(n=>n.props.children)).size,13);
  assert.ok(remaining.some(n=>n.props.children==='Poll 13'));
  assert.equal(h.calls.polls.at(-1)[1].page,2,'vote refresh re-fetches the current final poll page');
});


test('R: pending search blocks stale-query post pagination',async()=>{
  const pending=deferred();
  const h=env({api:{listCommunityPosts:async(_hub,q)=>{
    h.calls.posts.push([_hub,q]);
    if(q.q==='MATCH') return pending.promise;
    return page([post(q.page===2?99:1)],q.page===1?'?page=2':null);
  }}});
  h.render();await h.tick();
  h.find(h.render(),n=>n.type==='TextInput'&&n.props.label==='Search community posts')[0].props.onChangeText('MATCH');
  const tree=h.render();
  h.button('Search',tree).props.onPress();
  h.button('Load more posts',tree).props.onPress();
  await h.tick();
  pending.resolve(page([post(42)],'?page=2'));await h.tick();
  assert.equal(h.calls.posts.filter(([,q])=>q.page===2).length,0);
  assert.equal(h.find(h.render(),n=>n.type==='Text'&&n.props.children==='Post 99').length,0);
});

test('C: double post load is guarded and failed vote retains feeds',async()=>{
  const pending=deferred();let calls=0;
  const h=env({api:{listCommunityPosts:async(_hub,q)=>{if(q.page===2){calls++;return pending.promise;}return page([post(1)],'?page=2');},voteCommunityPoll:async()=>{throw Error('vote failed');}}});
  h.render();await h.tick();const tree=h.render();
  const more=h.button('Load more posts',tree);more.props.onPress();more.props.onPress();
  assert.equal(calls,1);pending.resolve(page([post(2)]));await h.tick();
  h.find(h.render(),n=>n.type==='Button'&&String(n.props.children).includes('Yes'))[0].props.onPress();await h.tick();
  assert.ok(h.find(h.render(),n=>n.type==='Text'&&n.props.children==='Post 2').length);
  assert.ok(h.find(h.render(),n=>n.type==='Text'&&n.props.children==='Poll 1').length);
  assert.ok(h.find(h.render(),n=>n.props?.accessibilityRole==='alert').length);
});

test('C: unknown hub failure can recover on retry',async()=>{
  let fail=true;const h=env({api:{listHubs:async()=>{if(fail)throw Error('unknown hub');return [{key:'public',label:'Recovered',can_interact:false}];}}});
  h.render();await h.tick();assert.ok(h.button('Retry'));fail=false;h.button('Retry').props.onPress();await h.tick();
  assert.ok(h.find(h.render(),n=>n.type==='Text'&&n.props.children==='Recovered').length);
});

test('C: stale poll and post completions from the former account cannot replace the new feed',async()=>{
  const oldPosts=deferred(),oldPolls=deferred();let account=1;
  const h=env({api:{
    listCommunityPosts:()=>account===1?oldPosts.promise:Promise.resolve(page([post(77)])),
    listCommunityPolls:()=>account===1?oldPolls.promise:Promise.resolve(page([poll(77)])),
  }});
  h.render();await h.tick();account=2;h.changeUser({id:88,role:'EXPLORER'});h.render();await h.tick();
  oldPosts.resolve(page([post(1)]));oldPolls.resolve(page([poll(1)]));await h.tick();
  const tree=h.render();
  assert.equal(h.find(tree,n=>n.type==='Text'&&n.props.children==='Post 77').length,1);
  assert.equal(h.find(tree,n=>n.type==='Text'&&n.props.children==='Poll 77').length,1);
  assert.equal(h.find(tree,n=>n.type==='Text'&&['Post 1','Poll 1'].includes(n.props.children)).length,0);
});
