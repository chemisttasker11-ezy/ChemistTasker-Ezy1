// M5-02: execute production candidate workspace components against shared-core.
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const ts=require('../node_modules/typescript'),root=path.resolve(__dirname,'..');
const jsx=(type,props)=>({type,props:props||{}});
const icons=new Proxy({}, {get:(_,name)=>String(name)});
const colors={primary:'#5222B8',primarySoft:'#EFE7FF',border:'#D8DCE9',
 textPrimary:'#06214A',textMuted:'#63708C',surfaceBg:'#FFFFFF',subtleBg:'#F8F9FC',
 status:{green:{bg:'#DEF3E6',fg:'#11613A'},amber:{bg:'#FFF4DA',fg:'#8A4B00'},red:{bg:'#FCE3E5',fg:'#A52929'}},
 tone:{blue:{bg:'#EDF4FF',fg:'#0955A7'},cyan:{bg:'#E1F7FC',fg:'#065F71'}}};
const tokens={colors,font:{inter:{regular:'Inter',medium:'Inter',semiBold:'Inter'},outfit:{semiBold:'Outfit'}},
 radius:{nested:14,card:20,sheet:24,pill:99,control:12},space:{xs:4,sm:8,md:12,lg:16,xl:20},
 touch:{min:48},type:{bodyMedium:{fontSize:14},labelLarge:{fontSize:14,lineHeight:20}}};
function load(relative,imports){
 const js=ts.transpileModule(fs.readFileSync(path.join(root,relative),'utf8'),{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,
   jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true},
 }).outputText;
 const module={exports:{}};
 vm.runInNewContext(js,{module,exports:module.exports,console,Date,Set,Map,
  require(name){
   if(name.endsWith('.png'))return 1;
   if(!Object.prototype.hasOwnProperty.call(imports,name))
    throw Error('Unmocked import '+name+' in '+relative);
   const imported=imports[name];
   return imported&&typeof imported==='object'&&'default' in imported&&!imported.__esModule
    ? {__esModule:true,...imported} : imported;
  }},{filename:relative});
 return module.exports;
}
function tree(node,list=[]){
 if(Array.isArray(node))node.forEach(n=>tree(n,list));
 else if(node&&typeof node==='object'){
  if(typeof node.type==='function')return tree(node.type(node.props),list);
  list.push(node);tree(node.props?.children,list);
 }
 return list;
}
function text(node){
 if(Array.isArray(node))return node.map(text).join(' ');
 if(node==null||typeof node==='boolean')return '';
 if(typeof node==='string'||typeof node==='number')return String(node);
 if(typeof node.type==='function')return text(node.type(node.props));
 return node.type==='Pill' ? String(node.props?.label ?? '') : text(node.props?.children);
}
const paper=Object.fromEntries(['View','Surface','Text','ScrollView','Divider','Image',
 'TouchableOpacity','ActivityIndicator','Button','Chip','Card'].map(n=>[n,n]));
paper.Card=Object.assign(function Card(p){return jsx('Card',p);},{Content:'Card.Content'});
const react={useState(init){let value=typeof init==='function'?init():init;return [value,next=>{
 value=typeof next==='function'?next(value):next;}];},useMemo:fn=>fn(),useCallback:fn=>fn,memo:fn=>fn};
react.default=react;
const shared=load('../shared-core/src/domains/shifts/audience.ts',{});
const audience=shared.SHIFT_AUDIENCE_LEVELS;
const helper=load('roles/shared/shifts/ActiveShiftsPage/utils/displayHelpers.ts',{
 '../theme':{levelColors:{}},
 '@chemisttasker/shared-core':shared});
const cand=load('roles/shared/shifts/ActiveShiftsPage/utils/candidateHelpers.ts',{});
const base={'react':react,'react/jsx-runtime':{jsx,jsxs:jsx,Fragment:'Fragment'},
 'react-native':{View:'View',Image:'Image',ScrollView:'ScrollView',TouchableOpacity:'TouchableOpacity',
  StyleSheet:{create:s=>s}},
 'react-native-paper':paper,'lucide-react-native':icons,
 '@/constants/tokens':tokens,
 '@/components/ui/BrandActivityIndicator':{BrandActivityIndicator:'ActivityIndicator'},
 '@/components/ui/Pill':{Pill:'Pill'}};
const shift={id:19,visibility:'FULL_PART_TIME',currentVisibility:'FULL_PART_TIME',
 allowedEscalationLevels:audience.map(x=>x.key),slots:[],singleUserOnly:true};
function mountStepper(config={}){
 const mod=load('roles/shared/shifts/ActiveShiftsPage/components/Escalation/EscalationStepper.tsx',{
  ...base,'@chemisttasker/shared-core':shared,
  '@/components/ui/ConfirmDialog':{ConfirmDialog:'ConfirmDialog'},
  '../../theme':{customTheme:{colors:{grey:'#888'}},levelColors:{}},
  '../../utils/displayHelpers':helper});
 return tree(mod.default({shift,currentLevel:'FULL_PART_TIME',selectedLevel:'OWNER_CHAIN',
   onSelectLevel(){},onEscalate(){},...config}));
}
function mountStatusCard(props){
 const mod=load('roles/shared/shifts/ActiveShiftsPage/components/Candidates/StatusCard.tsx',{
  ...base,'../../utils/candidateHelpers':cand});
 return mod.default(props);
}
function mountNetwork(config={}){
 const mod=load('roles/shared/shifts/ActiveShiftsPage/components/Candidates/CommunityLevelView.tsx',{
  ...base,'@chemisttasker/shared-core':shared,
  './StatusCard':{default:mountStatusCard},
  './SlotSelector':{default:'SlotSelector'},
  '../../utils/candidateHelpers':cand});
 return tree(mod.default({shift,members:[],selectedSlotId:null,offers:[],
  onSelectSlot(){},onReviewCandidate(){},...config}));
}
function mountPlatform(config={}){
 const mod=load('roles/shared/shifts/ActiveShiftsPage/components/Candidates/PublicLevelView.tsx',{
  ...base,'./SlotSelector':{default:'SlotSelector'},
  '../../utils/candidateHelpers':cand});
 return tree(mod.default({shift,slotId:null,interestsAll:[],counterOffers:[],
  counterOffersLoaded:true,revealingInterestId:null,onReveal(){},onReviewOffer(){},...config}));
}
test('R stepper_copy: real stepper uses canonical audience and outreach copy',()=>{
 const mounted=mountStepper(),combined=mounted.map(text).join(' ');
 assert.match(combined,/Who can see this shift/);
 for(const level of audience)assert.ok(combined.includes(level.label),level.label);
 assert.match(combined,/Need more candidates\?/);
 assert.match(combined,/Escalating notifies/);
});
test('R network_section: real network board has web group copy and columns in order',()=>{
 const mounted=mountNetwork(),combined=mounted.map(text).join(' ');
 assert.match(combined,/Your network/);
 assert.match(combined,/Internal candidates reached through/);
 const labels=['Interested','Assigned','No reply','Rejected'];
 for(const label of labels)assert.ok(combined.includes(label),label);
 const indices=labels.map(x=>combined.indexOf(x));
 assert.ok(indices.every((x,i)=>i===0||x>indices[i-1]),'web column order retained');
});
test('R platform_section: web counter-offer and interested helper copy',()=>{
 const mounted=mountPlatform(),combined=mounted.map(text).join(' ');
 for(const label of ['ChemistTasker platform','Counter offers','Asked for a different rate or time.',
  'No counter offers yet.','Interested','Applied at the posted rate.','No platform applicants yet.'])
  assert.ok(combined.includes(label),label);
});
test('R platform_rows: anonymous and pending/awaiting candidates have distinct actions',()=>{
 const interests=[
  {id:101,userId:61,revealed:false},
  {id:102,userId:62,revealed:true,user:{firstName:'Ada',lastName:'Lee'},pendingConfirmation:true,pendingOfferId:310},
  {id:103,userId:63,revealed:true,user:{firstName:'Ben',lastName:'Ray'},awaitingPayment:true,pendingOfferId:311}];
 const mounted=mountPlatform({interestsAll:interests,onBuzzWorker(){}});
 const combined=mounted.map(text).join(' ');
 for(const label of ['Anonymous applicant','Reveal to see name and profile','Offer sent · awaiting reply','Awaiting payment','Buzz'])
  assert.ok(combined.includes(label),label);
 const actions=mounted.filter(n=>n.type==='TouchableOpacity').map(n=>n.props.accessibilityLabel);
 assert.ok(actions.some(x=>String(x).startsWith('Reveal Anonymous applicant')));
 assert.ok(actions.some(x=>String(x).startsWith('View Ada')));
 assert.ok(actions.some(x=>String(x).startsWith('View Ben')));
});

test('C platform callbacks pass the selected shift, offer and slot without crossing dates',()=>{
 const multi={...shift,singleUserOnly:false,slots:[{id:34},{id:99}]};
 const offer={id:701,user:61,slots:[{slot_id:34}]};
 const interest={id:101,userId:61,slotId:34,revealed:false};
 const calls=[];
 const mounted=mountPlatform({shift:multi,slotId:34,counterOffers:[offer],
  interestsAll:[interest],onReviewOffer:(...args)=>calls.push(args)});
 const action=mounted.find(n=>n.type==='TouchableOpacity' &&
  String(n.props.accessibilityLabel).startsWith('Reveal offer from'));
 assert.ok(action,'counter offer action must be mounted for selected slot');
 action.props.onPress();
 assert.equal(calls.length,1);
 assert.equal(calls[0][0],multi);
 assert.equal(calls[0][1],offer);
 assert.equal(calls[0][2],34);
 assert.equal(mounted.filter(n=>n.type==='SlotSelector')[0].props.selectedSlotId,34);
});
test('C platform reveal and Buzz use the selected candidate and exact numeric offer ID',()=>{
 const anonymous={id:101,userId:61,slotId:34,revealed:false};
 const pending={id:102,userId:62,slotId:34,revealed:true,pendingConfirmation:true,pendingOfferId:'310'};
 const paid={id:103,userId:63,slotId:34,revealed:true,awaitingPayment:true,pendingOfferId:311};
 const foreign={id:104,userId:64,slotId:99,revealed:false};
 const reveals=[],buzzes=[];
 const mounted=mountPlatform({slotId:34,interestsAll:[anonymous,pending,paid,foreign],
  onReveal:(...args)=>reveals.push(args),onBuzzWorker:id=>buzzes.push(id)});
 const buttons=mounted.filter(n=>n.type==='TouchableOpacity');
 const reveal=buttons.find(n=>String(n.props.accessibilityLabel)==='Reveal Anonymous applicant');
 const buzz=buttons.find(n=>String(n.props.accessibilityLabel)==='Buzz candidate for offer 310');
 assert.ok(reveal);
 assert.ok(buzz);
 assert.ok(!buttons.some(n=>String(n.props.accessibilityLabel).includes('offer 311')),
  'awaiting-payment rows must not offer Buzz');
 assert.equal(buttons.filter(n=>String(n.props.accessibilityLabel)==='Reveal Anonymous applicant').length,1,
  'the foreign slot candidate must not leak into the selected slot');
 reveal.props.onPress();
 buzz.props.onPress();
 assert.deepEqual(reveals[0],[shift,anonymous]);
 assert.deepEqual(buzzes,[310]);
 const busy=mountPlatform({slotId:34,interestsAll:[pending],onBuzzWorker:()=>{},
  buzzLoadingOfferId:310});
 const disabled=busy.find(n=>n.props.accessibilityLabel==='Buzz candidate for offer 310');
 assert.equal(disabled.props.disabled,true,'in-flight Buzz remains disabled');
});
