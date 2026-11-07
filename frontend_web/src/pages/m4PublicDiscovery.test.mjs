// M4-06: actual Vite and Next public talent entry points; real shared page loader and projection.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const repo = new URL('../../../', import.meta.url);
const jsx = (type,props,key)=>({type,props:props||{},key});
function load(file,mocks,window={}) {
  const source=fs.readFileSync(new URL(file.startsWith('shared-core/') ? file : 'frontend_web/'+file,repo),'utf8');
  const code=ts.transpileModule(source,{fileName:file,compilerOptions:{
    module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,
    jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true,
  }}).outputText;
  const module={exports:{}};
  vm.runInNewContext(code,{module,exports:module.exports,window,URL,URLSearchParams,Date,AbortController,
    console,localStorage:window.localStorage||{},sessionStorage:window.sessionStorage||{},
    CustomEvent:class{constructor(type,init){this.type=type;this.detail=init.detail;}},
    setTimeout:fn=>{fn();return 1;},clearTimeout(){},
    require(id){if(!Object.prototype.hasOwnProperty.call(mocks,id))
      throw Error('Unmocked dependency '+id+' for '+file);
      const item=mocks[id];
      return item && typeof item==='object'&&'default'in item&&!item.__esModule
        ? {__esModule:true,...item}:item;
    }},{filename:file});
  return module.exports;
}
const nodes=(tree,kind,result=[])=>{
  if(Array.isArray(tree)){tree.forEach(t=>nodes(t,kind,result));return result;}
  if(!tree||typeof tree!=='object')return result;
  if(tree.type===kind)result.push(tree.props);
  nodes(tree.props?.children,kind,result);return result;
};
function hooks() {
  const values=[], effects=[];let index=0;
  const equal=(a,b)=>!!a&&!!b&&a.length===b.length&&a.every((x,i)=>x===b[i]);
  const react={
    lazy:()=> 'LazyComponent',
    useState(init){const i=index++;if(!(i in values))values[i]={value:typeof init==='function'?init():init};
      return [values[i].value,next=>{values[i].value=typeof next==='function'?next(values[i].value):next;}];},
    useRef(init){const i=index++;return values[i]||={current:init};},
    useMemo(fn,deps){const i=index++;if(!(i in values)||!equal(values[i].deps,deps))
      values[i]={deps,value:fn()};return values[i].value;},
    useCallback(fn,deps){return react.useMemo(()=>fn,deps);},
    useEffect(fn,deps){const i=index++;if(!(i in values)||!equal(values[i].deps,deps)){
      const old=values[i];values[i]={deps};
      effects.push(()=>{old?.cleanup?.();values[i].cleanup=fn();});}},
  };react.default=react;
  return {react, reset(){index=0;},async render(component,props){
    let tree;for(let n=0;n<7;n++){index=0;tree=component(props);
      while(effects.length)effects.shift()();
      for(let j=0;j<15;j++)await Promise.resolve();}
    index=0;return component(props);
  }};
}
const talent=load('shared-core/src/talent.ts',{
  './domains/talent/api':{},'./utils/serialization':{},
});
const skill=load('shared-core/src/skills.ts',{});
const newcomer=load('shared-core/src/domains/onboarding/newcomer.ts',{});
const presentation=load('shared-core/src/domains/talent/presentation.ts',{
  '../../skills':skill,'../onboarding/newcomer':newcomer,
});
function mount(next) {
  const h=hooks(),requests=[],routes=[];
  const window={location:{origin:'https://chemisttasker.test',pathname:'/talent/public-board',
    search:'?reference_code=REF-22'}};
  const pages={
    1:{count:2,results:[{id:11,role_title:'Technician',reference_code:'REF-11'}]},
    2:{count:2,results:[{id:22,role_title:'Intern',reference_code:'REF-22'}]},
  };
  const fetchPage=async page=>{requests.push(page);return pages[page];};
  const mui=Object.fromEntries(['Dialog','DialogActions','DialogContent','DialogTitle','Button',
    'Typography','Box','Stack','Alert'].map(name=>[name,name]));
  const modules={
    react:h.react,'react/jsx-runtime':{jsx,jsxs:jsx},
    'react-router-dom':{Link:'Link'},'@/public/navigation':{Link:'Link'},
    '@mui/material':mui,
    '../layouts/AuthLayout':{default:'AuthLayout'},
    '../components/PublicLogoTopBar':{default:'PublicLogoTopBar'},
    './dashboard/sidebar/TalentBoard':{default:'TalentBoard'},
    '../contexts/AuthContext':{useAuth:()=>({user:null})},
    '../constants/api':{API_BASE_URL:'/api/v1'},
    '@chemisttasker/shared-core':{
      normalizePublicTalentPost:presentation.normalizePublicTalentPost,
      getPublicTalentFeed:opts=>fetchPage(opts.page),
      browserPublicTalentFeed:(_cfg,page)=>fetchPage(page),
    },
    './dashboard/sidebar/TalentBoard/hooks/loadAllTalentPages':{
      loadAllTalentPages:talent.loadAllTalentPages},
    '../utils/seo':{setCanonical(){},setPageMeta(){},setSocialMeta(){}},
  };
  const page=load(next?'landing_next/migrated/pages/PublicTalentBoardPage.tsx':
    'src/pages/PublicTalentBoardPage.tsx',modules,window);
  return {requests,routes,render:()=>h.render(page.default)};
}
test('C #2/#7 Vite public TalentBoard entry loads all authorized pages before QR filtering',async()=>{
  const h=mount(false),tree=await h.render(),board=nodes(tree,'TalentBoard')[0];
  assert.ok(board,'real Vite entry mounts the talent board');
  assert.deepEqual(h.requests,[1,2]);
  assert.deepEqual(Array.from(board.externalPosts,p=>p.id),[22]);
  assert.equal(board.externalPosts[0].referenceCode,'REF-22');
  assert.equal(board.publicMode,true);
  assert.equal(typeof board.onRequireLogin,'function');
  board.onRequireLogin('booking');
  assert.equal(board.externalPosts.length,1,'anonymous booking does not expose another profile');
});
test('C #2/#7 migrated Next public TalentBoard entry preserves QR and safe login handoff',async()=>{
  const h=mount(true),tree=await h.render(),board=nodes(tree,'TalentBoard')[0];
  assert.ok(board,'real migrated entry mounts the talent board');
  assert.deepEqual(h.requests,[1,2]);
  assert.deepEqual(Array.from(board.externalPosts,p=>p.id),[22]);
  const login=nodes(tree,'Button').find(p=>String(p.to).includes('/login?next='));
  assert.ok(login);
  assert.match(decodeURIComponent(login.to),/reference_code=REF-22/);
  assert.equal(board.externalPosts.some(p=>p.contact_email),false);
});

const registry=JSON.parse(fs.readFileSync(new URL('shared-core/skills_registry.json',repo),'utf8'));
function mountedTalentBoard(next, overrides={}) {
  const ui=hooks(), navigated=[];
  const router={useNavigate:()=>dest=>navigated.push(dest),
    useLocation:()=>({pathname:'/talent/public-board',search:'?reference_code=REF-22'})};
  const filterFile=next?
    'landing_next/migrated/pages/dashboard/sidebar/TalentBoard/hooks/useTalentFilters.ts':
    'src/pages/dashboard/sidebar/TalentBoard/hooks/useTalentFilters.ts';
  const realFilter=load(filterFile,{react:ui.react,
    '@chemisttasker/shared-core':{filterTalentCandidates:presentation.filterTalentCandidates},
    '@chemisttasker/shared-core/skills_registry.json':registry});
  const model=load('src/pages/dashboard/sidebar/TalentBoard/talentModel.ts',{
    './constants':{ENGAGEMENT_LABELS:{}},
    '../../../../../../shared-core/skills_registry.json':registry,
    '@chemisttasker/shared-core':{skillId:skill.skillId,skillLabel:skill.skillLabel,
      newcomerTypeLabel:()=>null},
  });
  const material=Object.fromEntries(['Alert','Box','Button','Chip','Divider','Drawer',
    'IconButton','Paper','Stack','Pagination','Typography','Dialog',
    'InputAdornment','TextField'].map(x=>[x,x]));
  const core={...presentation,...talent, getApiConfig:()=>({}), normalizeVerification:()=>null,
    newcomerTypeLabel:()=>null,getRatingsSummary:async()=>({average:0,count:0}),
    canPublishTalent:()=>false};
  const mocks={
    react:ui.react,'react/jsx-runtime':{jsx,jsxs:jsx},
    'react-router-dom':router,'@/public/navigation':router,
    '@mui/material':material,
    '@mui/icons-material':new Proxy({}, {get:(_,name)=>String(name)}),
    'lucide-react':{Megaphone:'Megaphone',SlidersHorizontal:'SlidersHorizontal'},
    '@chemisttasker/shared-core':core,
    '@chemisttasker/shared-core/skills_registry.json':registry,
    '@chemisttasker/shared-ui/VerificationBadges':{BadgeGuideLink:'BadgeGuideLink'},
    '@/public/skill-icon':{default:'SkillIcon'},
    '../../../../components/ui/PageHeader':{default:'PageHeader'},
    './hooks/useTalentFeed':{useTalentFeed:()=>({posts:[],loading:false,error:null,reload(){}})},
    './hooks/useTalentFilters':realFilter,
    './components/PitchDialog':{default:'PitchDialog'},
    './components/AvailabilitySidebar':{default:'AvailabilitySidebar'},
    './components/TalentCardV2':{default:'TalentCardV2'},
    './components/PublicTalentCard':{default:'PublicTalentCard'},
    '../../../../components/dashboard/DashboardContentState':{default:'DashboardContentState'},
    './components/FiltersSidebar':{default:'FiltersSidebar'},
    '../../../../contexts/AuthContext':{useAuth:()=>({user:null,isAdminUser:false})},
    '../../../../utils/dashboardPath':{resolveUserHomePath:()=>'/dashboard'},
    '../../../../utils/roleLabels':{otherStaffRoleLabel:()=>''},
    './constants':{ENGAGEMENT_LABELS:{}},
    './talentModel':model,
  };
  const src=next?'landing_next/migrated/pages/dashboard/sidebar/TalentBoard/index.tsx':
    'src/pages/dashboard/sidebar/TalentBoard/index.tsx';
  const board=load(src,mocks,{location:{pathname:'/talent/public-board',search:''},
    addEventListener(){},removeEventListener(){}});
  const post={
    id:22,referenceCode:'REF-22',roleTitle:'Intern',
    workTypes:['CASUAL'],locationState:'QLD',locationSuburb:'Brisbane',
    availabilityDays:[{date:'2999-02-01'}],skills:['WEBSTER_PACKING_DAA'],
    ratingAverage:4.5,ratingCount:2,is_anonymous:true,
    authorUserId:null,explorerUserId:null,...overrides,
  };
  return {render:()=>{ui.reset();const index=board.default({publicMode:true,
    publicPresentation:next,externalPosts:[post],externalLoading:false});
    return index;},navigated};
}
test('C #7 real Vite and Next TalentBoard/index render consistent public Candidate cards',()=>{
  const results=[];
  for(const next of [false,true]){
    const view=mountedTalentBoard(next);
    const tree=view.render();
    const card=nodes(tree,next?'PublicTalentCard':'TalentCardV2')[0];
    assert.ok(card,'real board must hand its projected candidate to the card');
    assert.equal(card.canViewAvailability,false,'anonymous public board cannot open private availability');
    assert.equal(card.candidate.id,22);
    assert.equal(card.candidate.refId,'REF-22');
    assert.equal(card.candidate.role,'Intern');
    assert.deepEqual(Array.from(card.candidate.availableDates),['2999-02-01']);
    assert.equal(card.candidate.ratingAverage,4.5);
    assert.equal(card.candidate.ratingCount,2);
    assert.equal(card.candidate.authorUserId,null);
    results.push({ref:card.candidate.refId,role:card.candidate.role,
      work:card.candidate.workTypes,dates:card.candidate.availableDates,
      rating:card.candidate.ratingAverage});
  }
  assert.deepEqual(JSON.parse(JSON.stringify(results[0])),JSON.parse(JSON.stringify(results[1])));
});

for (const next of [false,true]) test(`R blank public title survives Pharmacist filter on ${next?'Next':'Vite'}`,()=>{
  const view=mountedTalentBoard(next,{roleTitle:'',roleCategory:'PHARMACIST'});
  let tree=view.render();
  const filters=nodes(tree,'FiltersSidebar')[0];
  assert.ok(filters.roleOptions.includes('Pharmacist'),'Pharmacist role filter must exist');
  filters.onChange({...filters.filters,roles:['Pharmacist']});
  tree=view.render();
  const card=nodes(tree,next?'PublicTalentCard':'TalentCardV2')[0];
  assert.ok(card,'filtered candidate remains visible');
  assert.equal(card.candidate.role,'Pharmacist');
});

function realLogin(next, rawNext, verified=true) {
  const ui=hooks(), navigations=[], announcements=[], storage=new Map();
  const search='?next='+encodeURIComponent(rawNext);
  const localStore={getItem:k=>storage.get('l:'+k)||null,
    setItem:(k,v)=>storage.set('l:'+k,String(v)),
    removeItem:k=>storage.delete('l:'+k)};
  const sessionStore={getItem:k=>storage.get('s:'+k)||null,
    setItem:(k,v)=>storage.set('s:'+k,String(v)),
    removeItem:k=>storage.delete('s:'+k)};
  const window={location:{pathname:'/login',search,
    replace:to=>navigations.push(to),assign:to=>navigations.push(to)},
    localStorage:localStore,sessionStorage:sessionStore,
    dispatchEvent:event=>announcements.push(event.type)};
  const browser=load('landing_next/shared/browser-session.ts',{},window);
  const dashboard=load(next?'landing_next/migrated/utils/dashboardPath.ts':
    'src/utils/dashboardPath.ts',{},window);
  const user={id:44,role:'EXPLORER',is_mobile_verified:verified};
  const auth={login(){} ,user:null};
  const route={useNavigate:()=>where=>navigations.push(where),
    Link:'Link',useLocation:()=>({pathname:'/login',search,state:{}})};
  const icons={Visibility:'Visibility',VisibilityOff:'VisibilityOff'};
  const material=Object.fromEntries(['Typography','TextField','Button','Box','CircularProgress',
    'Alert','Link','InputAdornment','IconButton','Checkbox','FormControlLabel']
    .map(x=>[x,x]));
  const core={browserLoginSession:async()=>({access:'session-token',refresh:'',user}),
    hasOrganizationAccess:()=>false};
  const mocks={
    react:ui.react,'react/jsx-runtime':{jsx,jsxs:jsx},
    'react-router-dom':route,'@/public/navigation':route,
    '@mui/material':material,'@mui/icons-material':icons,
    '../constants/api':{API_BASE_URL:'/api/v1'},
    '@chemisttasker/shared-core':core,
    '../contexts/AuthContext':{useAuth:()=>auth},
    '../layouts/AuthLayout':{default:'AuthLayout'},
    '../components/PublicLogoTopBar':{default:'PublicLogoTopBar'},
    '../utils/dashboardPath':{resolveDashboardPath:dashboard.resolveDashboardPath,
      resolveUserHomePath:dashboard.resolveUserHomePath},
    '../utils/ownerSetup':{getOwnerSetupStatus:async()=>({nextPath:null})},
    '../utils/seo':{setRobotsMeta(){}},
    '../../shared/session-provider':{useSession:()=>({status:'anonymous'})},
    '../../shared/browser-session':browser,
    '../../landing_next/shared/browser-session':browser,
    '../constants/roles':{ORG_ROLES:['ORGANIZATION','ORG_ADMIN','REGION_ADMIN']},
  };
  const component=load(next?'landing_next/migrated/pages/login.tsx':
    'src/pages/login.tsx',mocks,window).default;
  return {
    navigations,ui,window,sessionStore,storage,
    async submit(){
      let tree=await ui.render(component);
      for(const [label,value] of [['Email','worker@example.test'],['Password','secret']]){
        const input=nodes(tree,'TextField').find(p=>p.label===label);
        assert.ok(input,label);
        input.onChange({target:{value}});
        tree=await ui.render(component);
      }
      const form=nodes(tree,'form')[0];
      assert.ok(form,'real login form is mounted');
      await form.onSubmit({preventDefault(){}});
      await ui.render(component);
    },
  };
}
test('R #2/#5 Vite login resumes a sanitized QR return, not its generic overview',async()=>{
  const app=realLogin(false,'/talent/public-board?reference_code=REF-22');
  await app.submit();
  assert.deepEqual(app.navigations,['/talent/public-board?reference_code=REF-22']);
});
test('C #5 Vite and Next reject external login next destinations',async()=>{
  for(const next of [false,true]){
    const app=realLogin(next,'https://untrusted.example/private');
    await app.submit();
    assert.equal(app.navigations.some(where=>String(where).includes('untrusted.example')),false);
    assert.ok(app.navigations.some(where=>String(where).includes('/dashboard/explorer')));
  }
});
test('C #5 Next login respects the existing safe browser return destination',async()=>{
  const app=realLogin(true,'/talent/public-board?reference_code=REF-22');
  await app.submit();
  assert.deepEqual(app.navigations,['/talent/public-board?reference_code=REF-22']);
});
test('R #5 Next pending mobile verification wins over a public QR next redirect',async()=>{
  const app=realLogin(true,'/talent/public-board?reference_code=REF-22',false);
  await app.submit();
  assert.deepEqual(app.navigations,['/mobile-verify']);
});

test('R #2 Vite QR next survives mobile verification and resumes after success',async()=>{
  const destination='/talent/public-board?reference_code=REF-22';
  const app=realLogin(false,destination,false);
  await app.submit();
  assert.deepEqual(app.navigations,['/mobile-verify']);
  app.window.location.search='';
  const browser=load('landing_next/shared/browser-session.ts',{},app.window);
  const ui=hooks();
  const verify=load('src/pages/MobileOTPVerify.tsx',{
    react:ui.react,'react/jsx-runtime':{jsx,jsxs:jsx},
    '@chemisttasker/shared-core':{canSkipOverseasMobileCheck:()=>false},
    'react-router-dom':{Link:'Link'},
    '@mui/material':Object.fromEntries(['TextField','Button','Box','CircularProgress','Alert','Link','Typography','Stack'].map(x=>[x,x])),
    '../layouts/AuthLayout':{default:'AuthLayout'},'../components/PublicLogoTopBar':{default:'PublicLogoTopBar'},
    '../utils/browserMobileOtp':{verifyBrowserMobileOtp:async()=>({user:{role:'EXPLORER'}})},
    '../contexts/AuthContext':{useAuth:()=>({user:{role:'EXPLORER'},setUser(){},login(){}})},
    '../utils/dashboardPath':{resolveDashboardPath:()=>'/dashboard/explorer/overview'},
    '../../landing_next/shared/browser-session':browser,
  },app.window).default;
  const tree=await ui.render(verify);
  const form=nodes(tree,'form').find(p=>typeof p.onSubmit==='function');
  assert.ok(form,'verification form');
  await form.onSubmit({preventDefault(){}});
  assert.deepEqual(app.navigations,['/mobile-verify',destination]);
  assert.equal(app.sessionStore.getItem('ct:return-to'),null,'consumed destination is cleared');
});

