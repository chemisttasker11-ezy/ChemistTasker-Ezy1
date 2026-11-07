// M4-07: exercise production Next community-client and its independent post/poll paging.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const jsx=(type,props)=>({type,props:props??{}});
function traverse(node,pred,results=[]) {
  if(Array.isArray(node))node.forEach(n=>traverse(n,pred,results));
  else if(node&&typeof node==='object'){
    if(pred(node))results.push(node);
    traverse(node.props?.children,pred,results);
  }
  return results;
}
test('C: Next community uses public shared-core APIs for separate search and poll page',async()=>{
  const path=new URL('./community-client.tsx',import.meta.url);
  const compiled=ts.transpileModule(readFileSync(path,'utf8'),{fileName:path.pathname,
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,
      jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
  const slots=[];let index=0;const effects=[];const pending={};const queries={posts:[],polls:[]};
  const react={
    useState(initial){const i=index++;if(!(i in slots))slots[i]=typeof initial==='function'?initial():initial;
      return [slots[i],v=>{slots[i]=typeof v==='function'?v(slots[i]):v;}];},
    useRef(v){const i=index++;return slots[i]??(slots[i]={current:v});},
    useMemo(fn,deps){const i=index++,old=slots[i];if(!old||!deps||deps.some((d,j)=>d!==old.deps[j]))slots[i]={value:fn(),deps};return slots[i].value;},
    useCallback(fn,deps){const i=index++,old=slots[i];if(!old||!deps||deps.some((d,j)=>d!==old.deps[j]))slots[i]={value:fn,deps};return slots[i].value;},
    useEffect(fn,deps){const i=index++,old=slots[i];if(!old||!deps||deps.some((d,j)=>d!==old.deps[j])){slots[i]={deps};effects.push(fn);}},
  };
  react.default=react;
  const api={publicContent:{
    listHubs:async()=>[{key:'public',can_interact:false}],
    listCommunityPosts:async(hub,q)=>{queries.posts.push([hub,q]);if(q.q==='FIRST'||q.q==='SECOND')return new Promise((resolve,reject)=>{pending[q.q]={resolve,reject};});return{results:[],next:null,count:0};},
    listCommunityPolls:async(hub,q)=>{queries.polls.push([hub,q]);return{results:[{id:q?.page===2?13:1,
      question:'Poll '+(q?.page===2?13:1), options:[],can_interact:false,is_closed:false}],
      next:q?.page===2?null:'?page=2',count:13};},
    voteCommunityPoll:async()=>({}),
  }};
  const mocks={
    react,'react/jsx-runtime':{jsx,jsxs:jsx,Fragment:'Fragment'},
    'next/link':{__esModule:true,default:'Link'},
    'lucide-react':new Proxy({}, {get:(_obj,key)=>String(key)}),
    './post-entry':{__esModule:true,default:'PostEntry'},
    './access-notice':{__esModule:true,default:'AccessNotice'},
    '@/shared/session-provider':{useSession:()=>({user:null,status:'anonymous'})},
    '@/shared/browser-session':{loginHref:x=>x},
    '@/lib/chemisttasker-api':{chemistTaskerApi:api},
    '@/components/rich-content':{},
    './social-format':{fullDate:()=>'',initials:()=>'',relativeTime:()=>'',richText:()=>''},
  };
  const module={exports:{}};
  vm.runInNewContext(compiled,{module,exports:module.exports,require(name) {
    if(!(name in mocks))throw Error('Unmocked '+name);
    const m=mocks[name];return m&&typeof m==='object'&&'default' in m&&!m.__esModule?{__esModule:true,...m}:m;
  },sessionStorage:{getItem:()=>null},window:{location:{assign(){}}},FormData,URL,URLSearchParams,console});
  index=0;
  let tree=module.exports.default({hub:'public',label:'Public',initial:{results:[],next:null,count:0}});
  // Root wrapper returns Feed element; mount the real Feed component, not just its JSX.
  const feedElement=tree;
  const feed=feedElement.type;
  const feedProps=feedElement.props;
  index=0;
  tree=feed(feedProps);
  for(const run of effects.splice(0))await run();
  await new Promise(resolve=>setTimeout(resolve,0));
  assert.deepEqual(queries.posts.map(([hub,q])=>[hub,q.page,q.q]),[['public',1,'']]);
  assert.deepEqual(queries.polls.map(([hub,q])=>[hub,q.page]),[['public',1]]);
  const render=()=>{index=0;return feed(feedProps);};
  const flush=async()=>{for(const run of effects.splice(0))await run();
    await new Promise(resolve=>setTimeout(resolve,0));};
  // The real search opener and form drive Next's own search/page state.
  const opener=traverse(tree,n=>n.type==='button'&&n.props['aria-label']==='Search this group')[0];
  assert.ok(opener);
  opener.props.onClick();
  tree=render();
  const searchForm=traverse(tree,n=>n.type==='form'&&n.props.role==='search')[0];
  assert.ok(searchForm);
  const input=traverse(searchForm,n=>n.type==='input')[0];
  input.props.onChange({target:{value:'pharmacy roster'}});
  tree=render();
  traverse(tree,n=>n.type==='form'&&n.props.role==='search')[0].props.onSubmit({preventDefault(){}});
  tree=render();
  await flush();
  assert.equal(queries.posts.at(-1)[1].q,'pharmacy roster');
  assert.equal(queries.posts.at(-1)[1].page,1);
  assert.equal(queries.polls.length,1,'Next post search must leave poll page unchanged');
  const pollPager=traverse(tree,n=>typeof n.type==='function'&&n.type.name==='Paging'&&n.props.next)[0];
  assert.ok(pollPager,'real Next poll pager required when API says next');
  pollPager.props.onPage(2);
  tree=render();
  await flush();
  assert.equal(queries.polls.at(-1)[1].page,2);
  assert.equal(queries.posts.at(-1)[1].q,'pharmacy roster');
  assert.equal(queries.posts.length,2,'poll page change must not reload discussions');
  for(const word of ['FIRST','SECOND']) {
    traverse(render(),n=>n.type==='input'&&n.props['aria-label']==='Search this group')[0].props.onChange({target:{value:word}});
    traverse(render(),n=>n.type==='form'&&n.props.role==='search')[0].props.onSubmit({preventDefault(){}});
    render();await flush();
  }
  const result=word=>({results:[{id:word,body:word}],next:null,count:1});
  pending.SECOND.resolve(result('SECOND'));await flush();
  pending.FIRST.resolve(result('FIRST'));await flush();
  const entries=traverse(render(),n=>n.type==='PostEntry');
  assert.equal(entries[0].props.post.body,'SECOND');

});
