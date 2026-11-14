const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
test('native QR renders web targets for all share kinds', () => {
 const p = path.join(__dirname, '../features/parity/ShareQr.tsx');
 assert.ok(fs.existsSync(p));
 const s = fs.readFileSync(p, 'utf8');
 for (const value of ['/talent/public-board?reference_code=', '/membership/apply/', '/organization/', 'qrcode-generator', 'react-native-svg']) assert.ok(s.includes(value), value);
 for (const file of ['app/share/worker.tsx','app/explore/organization/[slug].tsx','roles/shared/pharmacies/StaffManager.tsx','roles/shared/pharmacies/LocumManager.tsx']) assert.ok(fs.readFileSync(path.join(__dirname,'..',file),'utf8').includes('ShareQr'), file);
});
const ts = require('typescript');
const vm = require('node:vm');
test('invite QR handlers reject malformed links and show valid links', () => {
 for (const manager of ['LocumManager', 'StaffManager']) for (const link of ['chemisttasker.com.au/membership/apply/abcdefgh', 'https://example.com/membership/apply/abcdefgh']) {
  const source = fs.readFileSync(path.join(__dirname, `../roles/shared/pharmacies/${manager}.tsx`), 'utf8');
  const code = ts.transpileModule(source, {compilerOptions:{module:ts.ModuleKind.CommonJS, jsx:ts.JsxEmit.React, esModuleInterop:true}}).outputText;
  const state = []; let index = 0;
  const react = {createElement:(type,props,...children)=>({type,props:{...props,children}}), useState:init=>{const i=index++; if (!(i in state)) state[i]=i===15?link:init; return [state[i],v=>{state[i]=v}];},useMemo:fn=>fn(),useCallback:fn=>fn,useEffect:()=>{}};
  const component = new Proxy(function(){}, {get:()=>component});
  const paper = new Proxy({}, {get:(_,key)=>key});
  const mod={exports:{}};
  vm.runInNewContext(code,{module:mod,exports:mod.exports,process,URL,require:id=>id==='react'?react:id==='react-native'?{FlatList:'FlatList',View:'View',ScrollView:'ScrollView',StyleSheet:{create:x=>x}}:id==='react-native-paper'?paper:id==='./types'?{surfaceTokens:{}}:id==='./inviteUtils'?{formatExistingUserRole:()=>'',normalizeEmail:x=>x||''}:id.includes('AuthContext')?{useAuth:()=>({})}:id==='expo-router'?{useRouter:()=>({})}:{__esModule:true,default:component,ShareQr:'ShareQr'}});
  const render=()=>{index=0; return mod.exports.default({pharmacyId:1,memberships:[],onMembershipsChanged:()=>{}})};
  const find=(node,predicate)=>{if (!node || typeof node!=='object') return; if(predicate(node)) return node; for(const child of (node.props?.children||[]).flat(Infinity)){const result=find(child,predicate); if(result)return result;}};
  let tree=render();
  find(tree,n=>n.type==='Button' && n.props.children.includes('Show invite QR')).props.onPress();
  tree=render();
  if (link.startsWith('https:')) {const qr=find(tree,n=>n.type==='ShareQr'); assert.equal(qr.props.value,'abcdefgh'); assert.equal(qr.props.origin,'https://example.com');}
  else {assert.equal(find(tree,n=>n.type==='ShareQr'),undefined); assert.ok(state.some(x=>x?.message==='Invitation link is not valid for QR sharing.'));}
 }
});
test('generating a new invite link hides the QR of the previous link', async () => {
 for (const manager of ['LocumManager', 'StaffManager']) {
  const source = fs.readFileSync(path.join(__dirname, `../roles/shared/pharmacies/${manager}.tsx`), 'utf8');
  const code = ts.transpileModule(source, {compilerOptions:{module:ts.ModuleKind.CommonJS, jsx:ts.JsxEmit.React, esModuleInterop:true}}).outputText;
  const state = []; let index = 0;
  const react = {createElement:(type,props,...children)=>({type,props:{...props,children}}), useState:init=>{const i=index++; if (!(i in state)) state[i]=i===15?'https://example.com/membership/apply/tokenAAAA':init; return [state[i],v=>{state[i]=typeof v==='function'?v(state[i]):v}];},useMemo:fn=>fn(),useCallback:fn=>fn,useEffect:()=>{}};
  const component = new Proxy(function(){}, {get:()=>component});
  const paper = new Proxy({}, {get:(_,key)=>key});
  const mod={exports:{}};
  vm.runInNewContext(code,{module:mod,exports:mod.exports,process,URL,require:id=>id==='react'?react:id==='react-native'?{FlatList:'FlatList',View:'View',ScrollView:'ScrollView',StyleSheet:{create:x=>x}}:id==='react-native-paper'?paper:id==='./types'?{surfaceTokens:{}}:id==='./inviteUtils'?{formatExistingUserRole:()=>'',normalizeEmail:x=>x||''}:id.includes('AuthContext')?{useAuth:()=>({})}:id==='expo-router'?{useRouter:()=>({})}:id==='@chemisttasker/shared-core'?{createMembershipInviteLinkService:async()=>({token:'tokenBBBB'})}:{__esModule:true,default:component,ShareQr:'ShareQr'}});
  const render=()=>{index=0; return mod.exports.default({pharmacyId:1,memberships:[],onMembershipsChanged:()=>{}})};
  const find=(node,predicate)=>{if (!node || typeof node!=='object') return; if(predicate(node)) return node; for(const child of (node.props?.children||[]).flat(Infinity)){const result=find(child,predicate); if(result)return result;}};
  let tree=render();
  find(tree,n=>n.type==='Button' && n.props.children.includes('Show invite QR')).props.onPress();
  tree=render();
  assert.equal(find(tree,n=>n.type==='ShareQr').props.value,'tokenAAAA', manager);
  await find(tree,n=>n.type==='Button' && n.props.mode==='contained' && n.props.loading!==undefined && typeof n.props.onPress==='function' && n.props.onPress.length===0 && /Generate/.test(String(n.props.children))).props.onPress();
  tree=render();
  assert.ok(state.includes('https://www.chemisttasker.com/membership/apply/tokenBBBB') || state.some(x=>typeof x==='string' && x.endsWith('/membership/apply/tokenBBBB')), manager+' new link');
  const qr=find(tree,n=>n.type==='ShareQr');
  assert.ok(!qr || qr.props.value==='tokenBBBB', manager+' stale QR still shows the previous token');
 }
});

test('QR encodes the web URL for each kind and renders a matrix', () => {
 const source = fs.readFileSync(path.join(__dirname, '../features/parity/ShareQr.tsx'), 'utf8');
 const code = ts.transpileModule(source, {compilerOptions:{module:ts.ModuleKind.CommonJS, jsx:ts.JsxEmit.ReactJSX, esModuleInterop:true}}).outputText;
 const mod = {exports:{}}; let encoded;
 const qr = () => ({addData: value => {encoded=value}, make(){}, getModuleCount:()=>1, isDark:()=>true});
 const jsx = (type, props) => ({type, props});
 vm.runInNewContext(code, {module:mod, exports:mod.exports, URL, require: name => name==='react' ? {useMemo:fn=>fn()} : name==='react/jsx-runtime' ? {jsx,jsxs:jsx,Fragment:'Fragment'} : name==='qrcode-generator' ? qr : name==='react-native' ? {useWindowDimensions:()=>({width:360})} : name==='./ParityUI' ? {InfoNote:'InfoNote'} : {__esModule:true, default:'Svg',Path:'Path',Rect:'Rect'}});
 for (const [kind,value,url] of [['worker','ABCD','https://example.com/talent/public-board?reference_code=ABCD'],['pharmacy-invite','abcdefgh','https://example.com/membership/apply/abcdefgh'],['organization','acme','https://example.com/organization/acme']]) {
  const element = mod.exports.ShareQr({kind,value,origin:'https://example.com'});
  assert.equal(encoded,url); assert.equal(element.props.children[0].type,'Svg'); assert.ok(element.props.children[0].props.children[1].props.d);
 }
 assert.equal(mod.exports.shareQrTarget('organization','../bad','https://example.com'),null);
 assert.equal(mod.exports.shareQrTarget('worker','ABCD','chemisttasker.com.au'),null);
});
