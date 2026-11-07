// M4-06: actual Vite and Next public talent entry points; real shared page loader and projection.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const repo = new URL('../../', import.meta.url);
const jsx = (type,props,key)=>({type,props:props||{},key});
function load(file,mocks,window={}) {
  const source=fs.readFileSync(new URL(file,repo),'utf8');
  const code=ts.transpileModule(source,{fileName:file,compilerOptions:{
    module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,
    jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true,
  }}).outputText;
  const module={exports:{}};
  vm.runInNewContext(code,{module,exports:module.exports,window,URL,URLSearchParams,Date,
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
  return {react,async render(component,props){
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
const presentation=load('shared-core/src/domains/talent/presentation.ts',{'../../skills':skill});
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
  assert.deepEqual(board.externalPosts.map(p=>p.id),[22]);
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
  assert.deepEqual(board.externalPosts.map(p=>p.id),[22]);
  const login=nodes(tree,'Button').find(p=>String(p.to).includes('/login?next='));
  assert.ok(login);
  assert.match(decodeURIComponent(login.to),/reference_code=REF-22/);
  assert.equal(board.externalPosts.some(p=>p.contact_email),false);
});

const registry=JSON.parse(fs.readFileSync(new URL('shared-core/skills_registry.json',repo),'utf8'));
function mountedTalentBoard(next) {
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
  const core={...presentation,...talent, normalizeVerification:()=>null,
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
  const post=presentation.normalizePublicTalentPost({
    id:22,reference_code:'REF-22',role_title:'Intern',
    work_types:['CASUAL'],location_state:'QLD',location_suburb:'Brisbane',
    availability_days:[{date:'2999-02-01'}],skills:['WEBSTER_PACKING_DAA'],
    rating_average:4.5,rating_count:2,is_anonymous:true,
    author_user_id:null,explorer_user_id:null,
  });
  return {render:()=>{const index=board.default({publicMode:true,
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
