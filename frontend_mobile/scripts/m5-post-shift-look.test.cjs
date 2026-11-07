// Mounted M5-05 Post Shift section-copy regression checks. No production source parsing.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('../node_modules/typescript');
const root = path.resolve(__dirname, '..');
const jsx = (type, props) => ({ type, props: props || {} });
const palette = { textPrimary: '#111', textSecondary: '#555', status: { red: { fg: '#a00' } }, surfaceBg: '#fff', primary: '#6610aa',
 accentStrong:'#6622aa',tone:{blue:{fg:'#000'},cyan:{fg:'#000'},magenta:{fg:'#000'}},border:'#ccc' };
const tokens = {colors:palette,touch:{min:48},space:{xxs:2,xs:4,sm:8,md:12,lg:16},radius:{control:8,pill:99},
 type:{labelSmall:{fontFamily:'Inter',fontSize:12,lineHeight:16,letterSpacing:0},
 titleMedium:{fontFamily:'Inter',fontSize:18,lineHeight:24,letterSpacing:0},
 bodySmall:{fontFamily:'Inter',fontSize:12,lineHeight:16,letterSpacing:0}}};
const styles = new Proxy({}, {get:(_,key)=>String(key)});
const component = (name) => Object.assign(function(props){return jsx(name,props)}, {Affix: function(props){return jsx(name+'.Affix',props)}});
const paper = Object.fromEntries(['Button','Menu','Surface','Text','TextInput','Switch','Chip','Checkbox'].map(name=>[name,component(name)]));
paper.Menu.Item=component('Menu.Item');
const react={useState:initial=>[initial,()=>{}],useMemo:fn=>fn(),useCallback:fn=>fn};
const icons = new Proxy({}, {get:(_,name)=>component(String(name))});
function load(relative){
 const src=fs.readFileSync(path.join(root,relative),'utf8');
 const output=ts.transpileModule(src,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,
 jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
 const mod={exports:{}};
 const imports={
  'react':{...react,default:react},
  'react/jsx-runtime':{jsx,jsxs:jsx,Fragment:'Fragment'},
  'react-native':{View:component('View'),TouchableOpacity:component('TouchableOpacity'),
    Pressable:component('Pressable'),Linking:{openURL(){}},StyleSheet:{create:x=>x}},
  'react-native-paper':paper,
  'lucide-react-native':icons,
  '@/constants/tokens':tokens,
  './PostShiftScreen.styles':{styles},
  '../pharmacies/PharmacyProfileFields':{ShiftContextFields:component('ShiftContextFields')},
  '@/components/ui/ResponsiveSegmentedButtons':{ResponsiveSegmentedButtons:component('ResponsiveSegmentedButtons')},
  './PostShiftScreen.helpers':{EMPLOYMENT_TYPES:['LOCUM'],ROLE_OPTIONS:['PHARMACIST'],
    GOVERNMENT_AWARD_GUIDE_URL:'https://fairwork.gov.au',RATE_TYPE_DESCRIPTIONS:{FIXED:'Fixed rate'},
    formatClockTime:x=>x,formatLongSlotDate:x=>x,getSlotDurationHours:()=>8}
 };
 vm.runInNewContext(output,{module:mod,exports:mod.exports,console,require(name){
  if(!(name in imports))throw Error('Unexpected M5-05 import '+name+' in '+relative);
  return imports[name];
 }},{filename:relative});
 return mod.exports.default;
}
function walk(node,items=[]){
 if(Array.isArray(node)){for(const child of node)walk(child,items);return items}
 if(node===null||node===undefined||typeof node==='boolean')return items;
 if(typeof node==='string'||typeof node==='number'){items.push(String(node));return items}
 if(typeof node.type==='function')return walk(node.type(node.props),items);
 if(node.props){walk(node.props.children,items); if(typeof node.props.placeholder==='string')items.push(node.props.placeholder);}
 return items;
}
const blank=()=>{};
const detailsProps={
 hasTravel:false,setHasTravel:blank,hasAccommodation:false,setHasAccommodation:blank,
 isUrgent:false,setIsUrgent:blank,pharmacyMenuVisible:false,setPharmacyMenuVisible:blank,
 pharmacies:[{id:1,name:'Test Pharmacy'}],pharmacyId:1,setPharmacyId:blank,
 roleNeeded:'PHARMACIST',setRoleNeeded:blank,employmentType:'LOCUM',setEmploymentType:blank,
 getEmploymentLabel:v=>v,descriptionTemplateLoading:false,descriptionTemplateError:'',
 retryDescriptionTemplate:blank,descriptionTemplate:null,descriptionTemplateSaving:false,
 handleUseDescriptionTemplate:blank,handleSaveDescriptionTemplate:blank,
 handleDeleteDescriptionTemplate:blank,description:'',setDescription:blank,
 workloadTags:[],setWorkloadTags:blank,supportOnShift:[],setSupportOnShift:blank
};
const payProps={isLocumLike:true,roleNeeded:'PHARMACIST',ftptPayMode:'HOURLY',
 rateType:'FIXED',paymentPreference:'ABN',locumSuperIncluded:false,
 hasOutsidePharmacyMemberAudience:false,expandedSlots:[{date:'2026-11-10',startTime:'09:00',endTime:'17:00'}],
 slotRateRows:[{rate:'60',status:'idle'}],ownerBonus:'0',pharmacyId:1,savingPharmacyRates:false,
 handleSavePharmacyRateDefaults:blank,handleSlotRateChange:blank};
for(const name of ['setFtptPayMode','setMinHourly','setMaxHourly','setMinAnnual','setMaxAnnual','setSuperPercent','setRateType','setPaymentPreference','setLocumSuperIncluded','setRateWeekday','setRateSaturday','setRateSunday','setRatePublicHoliday','setRateEarlyMorning','setRateLateNight','setOwnerBonus'])payProps[name]=blank;
for(const name of ['minHourly','maxHourly','minAnnual','maxAnnual','superPercent','rateWeekday','rateSaturday','rateSunday','ratePublicHoliday','rateEarlyMorning','rateLateNight'])payProps[name]='';
test('M5-05 R details_hints are rendered by the actual native Details component',()=>{
 const Details=load('roles/shared/shifts/PostShiftDetailsStep.tsx');
 const copy=walk(Details(detailsProps)).join(' ');
 assert.match(copy,/About the shift/);
 assert.match(copy,/What should the person know before they apply\?/);
 assert.match(copy,/On the day/);
 assert.match(copy,/Optional\. Helps people judge the workload before they apply\./);
});
test('M5-05 R template_saving_label shows Saving and disables the save action',()=>{
 const Details=load('roles/shared/shifts/PostShiftDetailsStep.tsx');
 const rendered=Details({...detailsProps,description:'Test shift',descriptionTemplateSaving:true});
 const nodes=[];
 function gather(node){
  if(!node||typeof node!=='object')return;
  if(Array.isArray(node)){node.forEach(gather);return}
  if(typeof node.type==='function')return gather(node.type(node.props));
  nodes.push(node);gather(node.props?.children);
 }
 gather(rendered);
 const button=nodes.find(n=>n.type==='Button'&&walk(n.props?.children).join(' ').includes('Saving'));
 assert.ok(button,'saving button should explicitly say Saving…');
 assert.equal(button.props.disabled,true);
});
test('M5-05 R pay_headings for fixed pharmacist locum and per-date rates',()=>{
 const Pay=load('roles/shared/shifts/PostShiftPayRateStep.tsx');
 const copy=walk(Pay(payProps)).join(' ');
 for(const expected of ['How they are paid','How is the rate set?','Rate for each date',
  'Change any date that pays differently.'])assert.ok(copy.includes(expected),expected);
});
test('M5-05 R pay_headings for salaried and award-based roles',()=>{
 const Pay=load('roles/shared/shifts/PostShiftPayRateStep.tsx');
 const salary=walk(Pay({...payProps,isLocumLike:false})).join(' ');
 assert.match(salary,/Pay/);
 assert.match(salary,/Shown to applicants as a range\./);
 const award=walk(Pay({...payProps,roleNeeded:'TECHNICIAN'})).join(' ');
 assert.match(award,/Award rate/);
});

// Semantic JSX-tree check of the real native screen, not a label/source grep.
// The footer must be a sibling of the scrolling form inside the keyboard-aware area.
test('M5-05 R footer stays outside the scroll view, inside keyboard-aware screen',()=>{
 const file='roles/shared/shifts/PostShiftScreen.tsx';
 const source=fs.readFileSync(path.join(root,file),'utf8');
 const tree=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 const found=[];
 function visit(node){
  if(ts.isJsxElement(node)&&node.openingElement.tagName.getText(tree)==='KeyboardAvoidingView'){
   const children=node.children.filter(child=>ts.isJsxElement(child));
   const tags=children.map(child=>child.openingElement.tagName.getText(tree));
   if(tags.includes('ScrollView')&&tags.includes('View')){
    const footer=children.find(child=>child.openingElement.tagName.getText(tree)==='View');
    const props=footer.openingElement.attributes.properties.map(p=>p.getText(tree)).join(' ');
    if(props.includes('styles.stickyFooter'))found.push({tags,footer:props});
   }
  }
  ts.forEachChild(node,visit);
 }
 visit(tree);
 assert.equal(found.length,1,'one reachable, pinned Back/Next/Post footer exists alongside ScrollView');
 assert.ok(found[0].tags.indexOf('View')>found[0].tags.indexOf('ScrollView'),'footer follows scroll content');
});
