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
test('QR encodes the web URL for each kind and renders a matrix', () => {
 const source = fs.readFileSync(path.join(__dirname, '../features/parity/ShareQr.tsx'), 'utf8');
 const code = ts.transpileModule(source, {compilerOptions:{module:ts.ModuleKind.CommonJS, jsx:ts.JsxEmit.ReactJSX, esModuleInterop:true}}).outputText;
 const mod = {exports:{}}; let encoded;
 const qr = () => ({addData: value => {encoded=value}, make(){}, getModuleCount:()=>1, isDark:()=>true});
 const jsx = (type, props) => ({type, props});
 vm.runInNewContext(code, {module:mod, exports:mod.exports, require: name => name==='react' ? {useMemo:fn=>fn()} : name==='react/jsx-runtime' ? {jsx,jsxs:jsx} : name==='qrcode-generator' ? qr : {__esModule:true, default:'Svg',Path:'Path',Rect:'Rect'}});
 for (const [kind,value,url] of [['worker','ABCD','https://example.com/talent/public-board?reference_code=ABCD'],['pharmacy-invite','abcdefgh','https://example.com/membership/apply/abcdefgh'],['organization','acme','https://example.com/organization/acme']]) {
  const element = mod.exports.ShareQr({kind,value,origin:'https://example.com'});
  assert.equal(encoded,url); assert.equal(element.type,'Svg'); assert.ok(element.props.children[1].props.d);
 }
 assert.equal(mod.exports.shareQrTarget('organization','../bad','https://example.com'),null);
});
