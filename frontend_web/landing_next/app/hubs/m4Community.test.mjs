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
  const slots=[];let index=0;const effects=[];const queries={posts:[],polls:[]};
  const react={
    useState(initial){const i=index++;if(!(i in slots))slots[i]=typeof initial==='function'?initial():initial;
      return [slots[i],v=>{slots[i]=typeof v==='function'?v(slots[i]):v;}];},
    useRef(v){const i=index++;return slots[i]??(slots[i]={current:v});},
    useMemo(fn){index++;return fn();},
    useCallback(fn){index++;return fn;},
    useEffect(fn){index++;effects.push(fn);},
  };
  react.default=react;
  const api={publicContent:{
    listHubs:async()=>[{key:'public',can_interact:false}],
    listCommunityPosts:async(hub,q)=>{queries.posts.push([hub,q]);return{results:[],next:null,count:0};},
    listCommunityPolls:async(hub,q)=>{queries.polls.push([hub,q]);return{results:[],next:null,count:0};},
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
  const feed=tree.type;
  index=0;
  tree=feed(tree.props);
  for(const run of effects.splice(0))await run();
  await new Promise(resolve=>setTimeout(resolve,0));
  assert.deepEqual(queries.posts.map(([hub,q])=>[hub,q.page,q.q]),[['public',1,'']]);
  assert.deepEqual(queries.polls.map(([hub,q])=>[hub,q.page]),[['public',1]]);
  const buttons=traverse(tree,n=>n.type==='button');
  assert.ok(buttons.some(n=>n.props.children==='Discover hubs')===false);
});
