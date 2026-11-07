// Executable native discovery harness. Production modules are transpiled WHOLE.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('../node_modules/typescript');
const root = path.resolve(__dirname, '..');
const jsx = (type, props, key) => ({type, props: props || {}, key});
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes,no) => {resolve=yes; reject=no;});
  return {promise,resolve,reject};
};
function load(file, mocks) {
  const name = path.resolve(root, file);
  const code = ts.transpileModule(fs.readFileSync(name, 'utf8'), {
    fileName:name, compilerOptions: {module:ts.ModuleKind.CommonJS,
      target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true},
  }).outputText;
  const module = {exports:{}};
  vm.runInNewContext(code, {module,exports:module.exports, console, Date, Intl,
    URL, URLSearchParams, process:{env:{}}, setTimeout: fn=>{fn();return 1;},
    clearTimeout(){}, require(id) {
      if (!Object.prototype.hasOwnProperty.call(mocks,id)) throw Error('Unexpected '+id+' in '+file);
      const value=mocks[id];
      return value && typeof value === 'object' && 'default' in value && !value.__esModule
        ? {__esModule:true,...value}: value;
    }}, {filename:name});
  return module.exports;
}
function renderer() {
  const cells=[], effects=[], cleanups=[];
  let cursor=0;
  const equal=(a,b)=>!!a&&!!b&&a.length===b.length&&a.every((v,i)=>v===b[i]);
  const react={
    useState(init){const i=cursor++;if(!(i in cells))cells[i]={value:typeof init==='function'?init():init};
      return [cells[i].value, value=>{cells[i].value=typeof value==='function'?value(cells[i].value):value;}];},
    useRef(init){const i=cursor++;return cells[i] ||= {current:init};},
    useMemo(fn,deps){const i=cursor++;if(!(i in cells)||!equal(cells[i].deps,deps))cells[i]={deps,value:fn()};return cells[i].value;},
    useCallback(fn,deps){return react.useMemo(()=>fn,deps);},
    useEffect(fn,deps){const i=cursor++;if(!(i in cells)||!equal(cells[i].deps,deps)){
      effects.push(()=>{cleanups[i]?.();cleanups[i]=fn();cells[i]={deps};});}},
  };
  react.default=react;
  return {react, async render(Component,props) {
    let node;
    for(let i=0;i<7;i++){cursor=0;node=Component(props);
      while(effects.length)effects.shift()();
      for(let n=0;n<12;n++)await Promise.resolve();}
    cursor=0;return Component(props);
  },unmount(){cleanups.forEach(fn=>fn?.());effects.length=0;}};
}
function collect(tree,kind,found=[]) {
  if(Array.isArray(tree)){tree.forEach(n=>collect(n,kind,found));return found;}
  if(!tree||typeof tree!=='object')return found;
  if(typeof tree.type==='function')return collect(tree.type(tree.props),kind,found);
  if(tree.type===kind)found.push(tree.props);
  collect(tree.props?.children,kind,found);
  return found;
}
const datum = (id, opts={}) => ({
  id, reference_code:'REF-'+id, role_title:'Technician',role_category:'OTHER_STAFF',
  work_types:['CASUAL'],location_state:'QLD',location_suburb:'Brisbane',
  skills:[],software:[],open_to_travel:true,availability_days:['2027-03-10'],...opts,
});
function talentHarness(reference='', role=null) {
  const ui=renderer(), calls=[], queue=[], routes=[], session={user:role?{id:71,role}:null,reference};
  const registry=JSON.parse(fs.readFileSync(path.resolve(root,'../shared-core/skills_registry.json'),'utf8'));
  const talent=load('../shared-core/src/talent.ts', {'./domains/talent/api':{},'./utils/serialization':{}});
  const presentation=load('../shared-core/src/domains/talent/presentation.ts',{
    '../../skills':load('../shared-core/src/skills.ts', {
      './skills_registry.json':registry,
    }),
  });
  const getPublicTalentFeed=async opts=>{
    calls.push({...opts});const item=queue.shift();
    if(!item)throw Error('Missing talent page fixture '+opts.page);
    if(item.promise)return item.promise;
    if(item instanceof Error)throw item;
    return item;
  };
  const module=load('app/explore/talent-board.tsx', {
    react:ui.react,'react/jsx-runtime':{jsx,jsxs:jsx},
    'react-native':{ScrollView:'ScrollView',StyleSheet:{create:x=>x},View:'View'},
    'react-native-paper':{Button:'Button',Card:{Content:'CardContent'},Chip:'Chip',Text:'Text',TextInput:'TextInput'},
    'expo-router':{useRouter:()=>({push:r=>routes.push(r),replace:r=>routes.push(r),
      canGoBack:()=>false,back(){}}), useLocalSearchParams:()=>({reference_code:session.reference})},
    '@/components/ui/BrandActivityIndicator':{BrandActivityIndicator:'Spinner'},
    'react-native-safe-area-context':{SafeAreaView:'SafeAreaView'},
    '@chemisttasker/shared-core':{getPublicTalentFeed,...talent,...presentation},
    '@chemisttasker/shared-core/skills_registry.json':registry,
    '@/context/AuthContext':{useAuth:()=>({user:session.user})},
    '@/constants/tokens':{colors:{pageBg:'',textPrimary:'',textSecondary:'',border:'',surfaceBg:'',
      status:{red:{fg:''}}},radius:{card:4},space:{lg:1,md:1,sm:1,'3xl':1},touch:{min:44}},
  });
  const render=()=>ui.render(module.default);
  const press=(tree,label)=>{const btn=collect(tree,'Button').find(n=>String(n.children).includes(label));
    assert.ok(btn,'Missing button '+label);btn.onPress();};
  return {ui,session,calls,queue,routes,render,press,collect,deferred,datum,registry};
}

function articleHarness(section='blog') {
  const ui=renderer(), queue=[], calls=[], routes=[];
  const module=load('features/explore/ArticleFeed.tsx', {
    react:ui.react,'react/jsx-runtime':{jsx,jsxs:jsx},
    'react-native':{ScrollView:'ScrollView',Image:'Image',StyleSheet:{create:x=>x},View:'View'},
    'react-native-paper':{Button:'Button',Card:{Content:'CardContent'},Chip:'Chip',Text:'Text',Searchbar:'Searchbar'},
    'expo-router':{useRouter:()=>({push:x=>routes.push(x),replace:x=>routes.push(x),back(){},canGoBack:()=>false})},
    '@/components/ui/BrandActivityIndicator':{BrandActivityIndicator:'Spinner'},
    'react-native-safe-area-context':{SafeAreaView:'SafeAreaView'},
    '@/config/api':{chemistTaskerApi:{publicContent:{listArticles:async opts=>{
      calls.push(opts);const item=queue.shift();
      if(!item)throw Error('Unqueued article page');
      if(item.promise)return item.promise;
      if(item instanceof Error)throw item;
      return item;
    }}}},
    '@/constants/tokens':{colors:{pageBg:'',textPrimary:'',textSecondary:'',border:'',surfaceBg:'',
      primary:'',status:{red:{fg:''}}},radius:{card:4},space:{lg:1,md:1,sm:1,'3xl':1,'2xl':1},touch:{min:44}},
    './webLinks':{safePublicUrl:value=>value},
  });
  return {ui,queue,calls,routes,render:()=>ui.render(module.default,{section}),collect,deferred};
}

module.exports={load,renderer,collect,jsx,deferred,talentHarness,articleHarness,datum};
