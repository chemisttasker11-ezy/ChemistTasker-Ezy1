// M4-06 tests execute the COMPLETE native public modules with real hook callbacks.
process.env.TZ = 'UTC';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('../node_modules/typescript');
const root = path.resolve(__dirname, '..');
const jsx = (type, props) => ({ type, props: props || {} });
const Card = props => jsx('Card', props);
Card.Content = props => jsx('CardContent', props);
Card.Cover = props => jsx('CardCover', props);
const TextInput = props => jsx('TextInput', props);
TextInput.Icon = props => jsx('TextInputIcon', props);
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
function hooks() {
  const state = [], effects = [], cleanups = [];
  let cursor = 0;
  const same = (a,b) => a && b && a.length === b.length && a.every((v,i) => v === b[i]);
  const react = {
    useState(initial) {
      const index = cursor++;
      if (!(index in state)) state[index] = { value: typeof initial === 'function' ? initial() : initial };
      return [state[index].value, value => {
        state[index].value = typeof value === 'function' ? value(state[index].value) : value;
      }];
    },
    useRef(initial) {
      const index = cursor++;
      if (!(index in state)) state[index] = { current: initial };
      return state[index];
    },
    useMemo(fn, deps) {
      const index = cursor++;
      if (!(index in state) || !same(state[index].deps,deps)) state[index] = { deps, value: fn() };
      return state[index].value;
    },
    useCallback(fn, deps) { return react.useMemo(() => fn, deps); },
    useEffect(fn, deps) {
      const index = cursor++;
      if (!(index in state) || !same(state[index].deps,deps)) {
        effects.push(() => {
          cleanups[index]?.();
          cleanups[index] = fn();
          state[index] = { deps };
        });
      }
    },
  };
  react.default = react;
  return {
    react,
    async render(component, props) {
      let result;
      for (let i=0; i<5; i++) {
        cursor=0; result=component(props);
        while(effects.length) effects.shift()();
        for(let j=0;j<6;j++) await Promise.resolve();
      }
      cursor=0;
      return component(props);
    },
    unmount() { cleanups.forEach(fn => fn?.()); },
  };
}
function load(relative, modules) {
  const filename = path.join(root, relative);
  const { outputText } = ts.transpileModule(fs.readFileSync(filename,'utf8'), {
    fileName: filename, compilerOptions: { module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  });
  const module = { exports: {} };
  vm.runInNewContext(outputText, {
    module, exports: module.exports, Date, Intl, URL, URLSearchParams,
    process: { env: {} }, setTimeout: callback => { callback(); return 1; },
    clearTimeout() {}, console,
    require(name) {
      if (!(name in modules)) throw Error('Unmocked module ' + name + ' in ' + relative);
      const value = modules[name];
      return value && typeof value === 'object' && 'default' in value && !value.__esModule ?
        { __esModule: true, ...value } : value;
    },
  }, { filename });
  return module.exports;
}
function collect(node, type, out=[]) {
  if (Array.isArray(node)) { node.forEach(x=>collect(x,type,out)); return out; }
  if (node == null || typeof node !== 'object') return out;
  if (typeof node.type === 'function') return collect(node.type(node.props),type,out);
  if (node.type === type) out.push(node.props);
  collect(node.props?.children,type,out);
  return out;
}
const fixture = (id, role='Technician') => ({
  id, role_title: role, role_category: 'OTHER_STAFF',
  work_types: ['CASUAL'], location_state: 'QLD', location_suburb: 'Brisbane',
  reference_code: 'REF-' + id, availability_days: [{ date: '2026-11-10' }],
});
function boardHarness() {
  const host=hooks(), calls=[], pages=[], routes=[];
  const user={current: null};
  const getPublicTalentFeed = async params => {
    calls.push(params);
    if (!pages.length) throw Error('Unqueued public talent page');
    const reply=pages.shift();
    return reply.promise || (reply instanceof Error ? Promise.reject(reply) : reply);
  };
  const registry=JSON.parse(fs.readFileSync(path.join(root,'../shared-core/skills_registry.json'),'utf8'));
  const realSkills=load('../shared-core/src/skills.ts',{});
  const sharedTalent=load('../shared-core/src/talent.ts', {
    './domains/talent/api': {}, './utils/serialization': {},
  });
  const presentation=load('../shared-core/src/domains/talent/presentation.ts', {
    '../../skills': realSkills,
    '../onboarding/newcomer':load('../shared-core/src/domains/onboarding/newcomer.ts', {}),
  });
  const module=load('app/explore/talent-board.tsx', {
    react:host.react, 'react/jsx-runtime':{jsx,jsxs:jsx},
    'react-native':{ScrollView:'ScrollView',StyleSheet:{create:x=>x},View:'View'},
    'react-native-paper':{Button:'Button',Card,Text:'Text',TextInput:'TextInput',Chip:'Chip'},
    'expo-router':{useRouter:()=>({push:x=>routes.push(x),replace:x=>routes.push(x),back(){},canGoBack:()=>false}),
      useLocalSearchParams:()=>({})},
    '@/components/ui/BrandActivityIndicator':{BrandActivityIndicator:'Spinner'},
    'react-native-safe-area-context':{SafeAreaView:'SafeAreaView'},
    '@chemisttasker/shared-core':{getPublicTalentFeed,...realSkills,...sharedTalent,...presentation},
    '@chemisttasker/shared-core/skills_registry.json':registry,
    '@/context/AuthContext':{useAuth:()=>({user:user.current})},
    '@/constants/tokens':{colors:{pageBg:'white',textPrimary:'black',textSecondary:'gray',border:'gray',surfaceBg:'white',status:{red:{fg:'red'}}},radius:{card:4},space:{lg:16,md:8,sm:4,'3xl':32},touch:{min:40}},
  });
  return {host,calls,pages,routes,user,render:()=>host.render(module.default),collect,deferred};
}
test('R public board exposes role/state/work type/skill/availability/travel/placement/search filters', async () => {
  const h=boardHarness();
  h.pages.push({ count: 2, next: null, results: [fixture(1),fixture(2,'Pharmacist')] });
  const tree=await h.render();
  const controls=[...collect(tree,'TextInput'),...collect(tree,'Chip'),...collect(tree,'Button')];
  const labels=controls.map(p=>String(p.accessibilityLabel || p.placeholder || p.children || '')).join(' ');
  for(const name of ['Search','Role','State','Work type','Skill','Travel','Placement','Availability']) {
    assert.match(labels,new RegExp(name,'i'),'missing filter control: '+name);
  }
  h.host.unmount();
});
test('C page-two failure keeps page-one rows WITHOUT clicking retry or refetching page one', async () => {
  const h=boardHarness();
  h.pages.push({count:2,next:'/api/v1/explorer-posts/public-feed/?page=2',results:[fixture(1)]});
  h.pages.push(Error('Page 2 offline'));
  let tree=await h.render();
  // Older caller requested page 2 on demand; newer complete loader requests it automatically.
  if(h.calls.length === 1) {
    const pageTwo=collect(tree,'Button').find(x=>x.children==='Load more talent');
    assert.ok(pageTwo,'the original page-two action must be available');
    pageTwo.onPress();
    tree=await h.render();
  }
  assert.equal(h.calls.length,2,'page-two failure must not automatically refetch page one');
  assert.equal(collect(tree,'Card').length,1,'successful first page remains visible');
  assert.ok(collect(tree,'Text').some(p=>String(p.children).includes('Page 2 offline')));
  h.host.unmount();
});

function articleHarness(section='blog') {
  const host=hooks(), calls=[], pages=[], routes=[];
  const module=load('features/explore/ArticleFeed.tsx', {
    react:host.react,'react/jsx-runtime':{jsx,jsxs:jsx},
    'react-native':{Image:'Image',ScrollView:'ScrollView',StyleSheet:{create:x=>x},View:'View'},
    'react-native-paper':{Button:'Button',Card,
      Searchbar:'Searchbar',Text:'Text',Chip:'Chip'},
    'expo-router':{useRouter:()=>({push:x=>routes.push(x),replace(){},back(){},canGoBack:()=>false})},
    '@/components/ui/BrandActivityIndicator':{BrandActivityIndicator:'Spinner'},
    'react-native-safe-area-context':{SafeAreaView:'SafeAreaView'},
    '@/config/api':{chemistTaskerApi:{publicContent:{listArticles:async options=>{
      calls.push(options);
      const item=pages.shift();
      if(!item)throw Error('No article page queued');
      return item.promise || (item instanceof Error ? Promise.reject(item) : item);
    }}}},
    '@/constants/tokens':{colors:{pageBg:'white',textPrimary:'black',textSecondary:'gray',border:'gray',surfaceBg:'white',primary:'blue',status:{red:{fg:'red'}}},radius:{card:4},space:{lg:16,md:8,sm:4,'3xl':32,'2xl':20},touch:{min:40}},
    './webLinks':{safePublicUrl:x=>x},
  });
  return {host,calls,pages,routes,render:()=>host.render(module.default,{section}),collect,deferred};
}
const article=(id,topic='practice')=>({
  id,kind:'blog',title:'Article '+id,slug:'article-'+id,topic,
  excerpt:'Public pharmacy guidance',read_minutes:3,cover_url:null,
});
test('R blog topic selector sends topic+kind and retains query on page two',async()=>{
  const h=articleHarness('blog');
  h.pages.push({results:[article(1)],next:'/api/v1/public-hub/articles/?page=2'});
  let tree=await h.render();
  const topic=collect(tree,'Chip').find(p=>/Career/i.test(String(p.children)));
  assert.ok(topic,'rendered topic control for Career is required');
  h.pages.push({results:[article(2,'career')],next:'/api/v1/public-hub/articles/?page=2'});
  topic.onPress();
  tree=await h.render();
  assert.equal(h.calls.at(-1).kind,'blog');
  assert.equal(h.calls.at(-1).topic,'career');
  const more=collect(tree,'Button').find(p=>p.children==='Load more articles');
  assert.ok(more);
  h.pages.push({results:[article(3,'career')],next:null});
  more.onPress(); await h.render();
  assert.equal(h.calls.at(-1).page,2);
  assert.equal(h.calls.at(-1).topic,'career');
  h.host.unmount();
});
test('C failing article page two preserves first-page results and visible error',async()=>{
  const h=articleHarness('news');
  h.pages.push({results:[{...article(4),kind:'news'}],next:'/api/v1/public-hub/articles/?page=2'});
  let tree=await h.render();
  h.pages.push(Error('News page offline'));
  collect(tree,'Button').find(p=>p.children==='Load more articles').onPress();
  tree=await h.render();
  assert.equal(collect(tree,'Card').length,1);
  assert.ok(collect(tree,'Text').some(p=>String(p.children).includes('News page offline')));
  h.host.unmount();
});
function learningHarness() {
  const host=hooks(), calls=[], results=[], options=[], user={current:{id:11,role:'OTHER_STAFF'}};
  const component=load('roles/pharmacist/learning.tsx',{
    react:host.react,'react/jsx-runtime':{jsx,jsxs:jsx},
    'react-native':{Linking:{openURL:async()=>{}},ScrollView:'ScrollView',StyleSheet:{create:x=>x},View:'View'},
    'expo-router':{useFocusEffect:cb=>host.react.useEffect(cb,[cb])},
    'react-native-paper':{Button:'Button',Card,
      Chip:'Chip',Text:'Text',TextInput},
    '@/components/ui/BrandActivityIndicator':{BrandActivityIndicator:'Spinner'},
    '@/config/api':{chemistTaskerApi:{
      publicContent:{listArticles:async args=>{
        calls.push(['articles',args]);
        return results.shift() || {results:[],next:null};
      }},
      marketplace:{getListingOptions:async()=>{
        calls.push(['role',user.current?.id]);
        const result=options.shift();
       if(result instanceof Error || result?.name === 'ApiError')throw result;
       return result?.promise ? result.promise : result || {role_code:null};
      }},
    }},
    '@/context/AuthContext':{useAuth:()=>({user:user.current})},
    '@/components/ui/ContentState':{ContentState:'ContentState'},
    '@/constants/tokens':{colors:{pageBg:'white',textPrimary:'black',textSecondary:'gray',textMuted:'gray',primary:'blue',primarySoft:'white',border:'gray',surfaceBg:'white',tone:{violet:{fg:'purple'}},status:{red:{fg:'red'}}},radius:{card:4},space:{lg:16,md:8,sm:4,xs:2,'3xl':32},font:{outfit:{semiBold:'bold'},inter:{semiBold:'bold'}},touch:{min:40}},
  });
  return {host,calls,results,options,user,render:()=>host.render(component.default)};
}
test('R OTHER_STAFF technician receives a pathway from server role_code, not generic account role',async()=>{
  const h=learningHarness();
  h.results.push({results:[],next:null});
  h.options.push({role_code:'TECHNICIAN'});
  const tree=await h.render();
  const words=collect(tree,'Text').map(p=>String(p.children)).join(' ');
  assert.match(words,/Dispensary workflow and workplace development/);
  assert.ok(h.calls.some(c=>c[0]==='role'),'real listing-options context must be queried');
  h.host.unmount();
});


test('R #1 actual native role/state/work/skill/date/travel/placement filters find page-two-only candidate and clear',async()=>{
  const h=boardHarness();
  const other={...fixture(1),location_state:'NSW',location_suburb:'Sydney',open_to_travel:false};
  const target={...fixture(2,'Intern'),work_types:['PLACEMENT'],skills:['WEBSTER_PACKING_DAA'],
    open_to_travel:true,availability_days:[{date:'2027-03-10'}]};
  h.pages.push({count:2,next:'/api/v1/explorer-posts/public-feed/?page=2',results:[other]});
  h.pages.push({count:2,next:null,results:[other,target]}); // duplicate ID must be removed
  let tree=await h.render();
  assert.equal(collect(tree,'Card').length,2,'all complete pages deduped before filtering');
  const choose=async label=>{
    const chip=collect(tree,'Chip').find(p=>p.children===label || p.accessibilityLabel==='Skill '+label);
    assert.ok(chip,'missing rendered filter chip '+label);
    chip.onPress(); tree=await h.render();
  };
  await choose('Intern'); await choose('QLD'); await choose('Placement');
  await choose('WEBSTER_PACKING_DAA'); await choose('Travel');
  const placementSwitch=collect(tree,'Chip').find(p=>p.children==='Placement' && !p.selected);
  assert.ok(placementSwitch,'placement seeker toggle must remain separately selectable');
  placementSwitch.onPress();tree=await h.render();
  let search=collect(tree,'TextInput').find(p=>p.accessibilityLabel==='Search talent');
  assert.ok(search);
  search.onChangeText('REF-2');tree=await h.render();
  for(const [label,value] of [
    ['Availability start (YYYY-MM-DD)','2027-03-09'],
    ['Availability end (YYYY-MM-DD)','2027-03-11'],
  ]){
    const input=collect(tree,'TextInput').find(p=>p.label===label);
    assert.ok(input,label);input.onChangeText(value);tree=await h.render();
  }
  assert.equal(collect(tree,'Card').length,1,'only the second-page matching candidate remains');
  const count=collect(tree,'Text').map(p=>String(p.children)).join(' ');
  assert.match(count,/1 public candidates/);
  collect(tree,'Button').find(p=>p.children==='Clear filters').onPress();
  tree=await h.render();
  assert.equal(collect(tree,'Card').length,2,'clear restores full deduplicated collection');
  assert.equal(h.calls.length,2,'client filtering does not issue unauthorized server filter URLs');
  h.host.unmount();
});

test('C #3 stale account response cannot overwrite new account, even on success', async()=>{
  const h=boardHarness(), old=deferred();
  h.pages.push(old);
  let tree=await h.render();
  assert.equal(h.calls.length,1);
  h.user.current={id:99,role:'OWNER'};
  h.pages.push({count:1,results:[fixture(9,'Pharmacist')],next:null});
  tree=await h.render();
  old.resolve({count:1,results:[fixture(1,'Technician')],next:null});
  tree=await h.render();
  assert.equal(h.calls.length,2);
  assert.equal(collect(tree,'Card').length,1);
  assert.ok(collect(tree,'Text').some(p=>p.children==='Pharmacist'));
  h.host.unmount();
});

test('C #3 same-render retry has one pending request and invalid next URL is never fetched',async()=>{
  const h=boardHarness();
  h.pages.push(Error('Initial public outage'));
  let tree=await h.render();
  const retry=collect(tree,'Button').find(p=>/^(Retry|Load more talent)$/.test(String(p.children)));
  assert.ok(retry,'failure presents a working retry');
  const pending=deferred();
  h.pages.push(pending);
  retry.onPress(); retry.onPress(); // no render between attempts
  await h.render();
  assert.equal(h.calls.length,2,'synchronous pending mutex prevents a duplicate request');
  pending.resolve({count:1,next:'https://untrusted.example/feed/?page=999',results:[fixture(7)]});
  tree=await h.render();
  assert.equal(h.calls.length,2,'foreign pagination URL never drives a request');
  assert.equal(collect(tree,'Card').length,1);
  h.host.unmount();
});

test('R #4 blog search stays trimmed through topic changes, page two and clearing topic',async()=>{
  const h=articleHarness('blog');
  h.pages.push({results:[article(1)],next:null});
  let tree=await h.render();
  const bar=collect(tree,'Searchbar')[0];
  assert.ok(bar);h.pages.push({results:[article(2)],next:null});
  bar.onChangeText('  clinical handover  ');tree=await h.render();
  assert.equal(h.calls.at(-1).q,'clinical handover');
  h.pages.push({results:[article(3,'career')],next:'/api/v1/public-hub/articles/?page=2'});
  collect(tree,'Chip').find(p=>p.children==='Career').onPress();tree=await h.render();
  assert.equal(h.calls.at(-1).kind,'blog');
  assert.equal(h.calls.at(-1).topic,'career');
  assert.equal(h.calls.at(-1).q,'clinical handover');
  h.pages.push({results:[article(4,'career')],next:null});
  collect(tree,'Button').find(p=>p.children==='Load more articles').onPress();
  tree=await h.render();
  assert.equal(h.calls.at(-1).page,2);
  assert.equal(h.calls.at(-1).q,'clinical handover');
  assert.equal(collect(tree,'Card').length,2);
  h.pages.push({results:[article(5)],next:null});
  collect(tree,'Chip').find(p=>p.children==='All topics').onPress();
  await h.render();
  assert.equal(h.calls.at(-1).topic,undefined,'clearing topic keeps kind but removes topic');
  assert.equal(h.calls.at(-1).kind,'blog');
  assert.equal(h.calls.at(-1).page,undefined,'new topic starts on page one');
  h.host.unmount();
});

test('R #5 all OTHER_STAFF subtypes use server role_code and real pathway text',async()=>{
  const paths={
    TECHNICIAN:'Dispensary workflow and workplace development',
    ASSISTANT:'Customer service and workplace development',
    INTERN:'Internship, registration and workplace development',
    STUDENT:'Study, placement and transition to practice',
  };
  for(const [roleCode,expected] of Object.entries(paths)){
    const h=learningHarness();
    h.options.push({role_code:roleCode});
    h.results.push({results:[],next:null});
    const tree=await h.render();
    assert.ok(collect(tree,'Text').some(p=>p.children===expected),roleCode);
    assert.ok(h.calls.some(c=>c[0]==='role'));
    h.host.unmount();
  }
});

test('C #5 previously supported Tom/Omar/Zoe pathways retain their own copy',async()=>{
  for(const [role,expected] of [
    ['OWNER','Business, leadership and pharmacy operations'],
    ['PHARMACIST','Clinical practice, career and professional development'],
    ['EXPLORER','Career discovery and pharmacy pathways'],
  ]){
    const h=learningHarness();
    h.user.current={id:51,role};
    h.options.push({role_code:role});
    h.results.push({results:[],next:null});
    const tree=await h.render();
    assert.ok(collect(tree,'Text').some(p=>p.children===expected),role);
    h.host.unmount();
  }
});

test('R #5 real 403 role-options refusal shows neutral pathway then retry recovers',async()=>{
  const h=learningHarness();
  const { ApiError }=load('../shared-core/src/transport/errors.ts', {
    '../domains/onboarding/ahpra':{reportAhpraError:()=>null,AHPRA_UNREADABLE_MESSAGE:''},
  });
  h.options.push(new ApiError('Permission denied',403,{detail:'Permission denied'}));
  h.results.push({results:[],next:null});
  let tree=await h.render();
  assert.ok(collect(tree,'Text').some(p=>String(p.children).includes('Explore professional learning')));
  const retry=collect(tree,'Button').find(p=>p.children==='Retry pathway');
  assert.ok(retry,'the real pathway retry is exposed on service failure');
  h.options.push({role_code:'ASSISTANT'});
  retry.onPress();tree=await h.render();
  assert.ok(collect(tree,'Text').some(p=>p.children==='Customer service and workplace development'));
  h.host.unmount();
});

test('R #5 switching OTHER_STAFF account ignores delayed old role-code response',async()=>{
  const h=learningHarness(), pending=deferred();
  h.options.push(pending);
  h.results.push({results:[],next:null});
  await h.render();
  h.user.current={id:202,role:'OTHER_STAFF'};
  h.options.push({role_code:'INTERN'});
  let tree=await h.render();
  pending.resolve({role_code:'TECHNICIAN'});
  tree=await h.render();
  assert.ok(collect(tree,'Text').some(p=>p.children==='Internship, registration and workplace development'));
  assert.equal(collect(tree,'Text').some(p=>p.children==='Dispensary workflow and workplace development'),false);
  h.host.unmount();
});

test('R #7 public talent skill chips display the canonical registry label while filtering by stable code',async()=>{
  const h=boardHarness();
  h.pages.push({count:1,results:[{...fixture(1),skills:['WEBSTER_PACKING_DAA']}]});
  const tree=await h.render();
  const chips=collect(tree,'Chip');
  const skill=chips.find(p=>p.accessibilityLabel==='Skill WEBSTER_PACKING_DAA');
  assert.ok(skill,'skill filter retains the stable registry code as its accessibility label');
  assert.equal(skill.children,'Webster / DAA packing',
    'ordinary readers must see the same human label as the web Skill filter');
  skill.onPress();
  const filtered=await h.render();
  assert.equal(collect(filtered,'Card').length,1);
  h.host.unmount();
});
test('R #7 failed public talent collection offers Retry, not a misleading Load more action',async()=>{
  const h=boardHarness();
  h.pages.push(Error('Temporary discovery outage'));
  const tree=await h.render();
  assert.ok(collect(tree,'Button').some(p=>p.children==='Retry'));
  assert.equal(collect(tree,'Button').some(p=>p.children==='Load more talent'),false);
  assert.ok(collect(tree,'Text').some(p=>String(p.children).includes('Temporary discovery outage')));
  h.host.unmount();
});
