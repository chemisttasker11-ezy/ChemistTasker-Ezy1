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
  const sharedTalent=load('../shared-core/src/talent.ts', {
    './domains/talent/api': {}, './utils/serialization': {},
  });
  const presentation=load('../shared-core/src/domains/talent/presentation.ts', {
    '../../skills': {
      skillId: (_registry, value) => value, isMatchableSkill: () => true,
      findSkill: () => ({ group: 'Clinical Services' }), SOFTWARE_GROUP: 'Dispense Software',
    },
  });
  const module=load('app/explore/talent-board.tsx', {
    react:host.react, 'react/jsx-runtime':{jsx,jsxs:jsx},
    'react-native':{ScrollView:'ScrollView',StyleSheet:{create:x=>x},View:'View'},
    'react-native-paper':{Button:'Button',Card,Text:'Text',TextInput:'TextInput',Chip:'Chip'},
    'expo-router':{useRouter:()=>({push:x=>routes.push(x),replace:x=>routes.push(x),back(){},canGoBack:()=>false}),
      useLocalSearchParams:()=>({})},
    '@/components/ui/BrandActivityIndicator':{BrandActivityIndicator:'Spinner'},
    'react-native-safe-area-context':{SafeAreaView:'SafeAreaView'},
    '@chemisttasker/shared-core':{getPublicTalentFeed,...sharedTalent,...presentation},
    '@chemisttasker/shared-core/skills_registry.json':{skills:[]},
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
       if(result instanceof Error)throw result;
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
