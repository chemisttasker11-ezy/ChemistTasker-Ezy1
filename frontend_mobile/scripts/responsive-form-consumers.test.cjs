const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const fallbackRoot = path.resolve(__dirname, '..');
const harnessRoot = fs.existsSync(path.join(__dirname, 'invoice-generation.test.cjs')) ? path.resolve(__dirname, '..') : fallbackRoot;
const baseRequire = require('node:module').createRequire(path.join(harnessRoot, 'package.json'));
const dependency = id => { try { return require(id); } catch (error) { if (error.code !== 'MODULE_NOT_FOUND') throw error; return baseRequire(id); } };

function existingHarness(file, marker, edits, exported) {
  let source = fs.readFileSync(path.join(harnessRoot, 'scripts', file), 'utf8').replace(/\r\n/g, '\n').split(marker)[0];
  for (const [from, to] of edits) {
    assert.ok(source.includes(from), `Existing harness changed: ${from}`);
    source = source.replace(from, to);
  }
  source = source.replace("path.resolve(__dirname, '../../shared-core/src/domains/shifts/postingDraft.ts')", "path.resolve(harnessRoot, '../shared-core/src/domains/shifts/postingDraft.ts')");
  // These unchanged helper/controller files are absent from a partial candidate.
  // The modified InvoiceGenerate and PitchDialog must always come from __dirname.
  source = source.replace("path.join(directory, filename)", "filename === 'invoiceGeneration.ts' && !fs.existsSync(path.join(directory, filename)) ? path.join(harnessRoot, 'roles/shared/invoices', filename) : path.join(directory, filename)");
  source = source.replace("const indexPath = path.resolve(__dirname, '../roles/shared/talent-board/index.tsx');", "const candidateIndex = path.resolve(__dirname, '../roles/shared/talent-board/index.tsx'); const indexPath = fs.existsSync(candidateIndex) ? candidateIndex : path.join(harnessRoot, 'roles/shared/talent-board/index.tsx');");
  const sandbox = { require: dependency, harnessRoot, __dirname, console, setImmediate, setTimeout, clearTimeout, FormData, structuredClone, exports: {} };
  vm.runInNewContext(source + `\nexports.result = ${exported};`, sandbox);
  return sandbox.exports.result;
}
const mountInvoice = existingHarness('invoice-generation.test.cjs', "test('accepted source rows", [], 'mount');
const makePitch = existingHarness('public-pitch-delete-confirmation.test.cjs', "test('pitch delete safety: PitchDialog renders", [
  ["    react,\n", "    react,\n    '@/components/ui/ResponsiveSegmentedButtons': { ResponsiveSegmentedButtons: 'ResponsiveSegmentedButtons' },\n"],
], 'createPitchHarness');
const all = (node, predicate) => {
  if (!node || typeof node !== 'object') return [];
  if (Array.isArray(node)) return node.flatMap(n => all(n, predicate));
  return [...(predicate(node) ? [node] : []), ...all(node.props?.children, predicate)];
};

test('invoice passes its real value and callback to the wrapping form choices', async () => {
  const ui = await mountInvoice();
  let control = ui.all('ResponsiveSegmentedButtons')[0];
  assert.equal(control.props.value, 'internal');
  assert.deepEqual(Array.from(control.props.buttons, x => x.value), ['internal', 'external']);
  await ui.change(control, 'external');
  control = ui.all('ResponsiveSegmentedButtons')[0];
  assert.equal(control.props.value, 'external');
});

test('pitch loading and error retain recovery and ready editor keeps choices inside scrolling content', () => {
  const h = makePitch();
  const retry = () => {}, close = () => {};
  const props = { open: true, isExplorer: false, existingPostId: null, pitchForm: { headline: '', body: '', workTypes: [], travelStates: [], availabilitySlots: [] }, setPitchForm: () => {}, pitchError: 'Offline', pitchSaving: false, onRetryDefaults: retry, onClose: close, onSave: () => {}, onRequestDelete: () => {} };
  for (const status of ['loading', 'error']) {
    const tree = h.renderPitchDialogDirect({ ...props, defaultsStatus: status });
    assert.equal(all(tree, n => n.type === 'ResponsiveSegmentedButtons').length, 0);
    assert.equal(all(tree, n => n.props?.onPress === retry).length, status === 'error' ? 1 : 0);
    assert.ok(all(tree, n => n.props?.onPress === close).length);
  }
  let tree = h.renderPitchDialogDirect({ ...props, defaultsStatus: 'ready' });
  const section = all(tree, n => n.type === 'ResponsiveSegmentedButtons')[0];
  assert.equal(section.props.value, '0');
  assert.deepEqual(Array.from(section.props.buttons, x => x.value), ['0', '1', '2']);
  const scroll = all(tree, n => n.props?.style?.flexShrink === 1)[0];
  assert.ok(scroll && all(scroll, n => n === section).length, 'section choices are within scrolling area');
  assert.ok(all(tree, n => n.props?.children === 'Cancel' && n.props?.onPress === close).length);
  section.props.onValueChange('1');
  tree = h.renderPitchDialogDirect({ ...props, defaultsStatus: 'ready' });
  assert.equal(all(tree, n => n.type === 'ResponsiveSegmentedButtons')[0].props.value, '1');
});

test('app-lock choices retain all values, disabled state and authenticated callback', async () => {
  const ts = dependency('typescript');
  const source = fs.readFileSync(path.join(__dirname, '../app/settings/mobile.tsx'), 'utf8');
  const code = ts.transpileModule(source + '\nexports.content = MobileSettingsContent;', { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  async function run(platform) {
    let index = 0; const calls = [];
    const hooks = { useState(initial) { const i = index++; return [i === 5 ? false : i === 8 ? true : initial, () => {}]; }, useRef: initial => ({current: initial}), useEffect() {}, useCallback: fn => fn };
    const paper = new Proxy({ Card: Object.assign('Card', {Content: 'CardContent'}) }, {get: (o, key) => o[key] || String(key)});
    const modules = {
      react: hooks,
      'react/jsx-runtime': { jsx: (type, props) => ({type, props}), jsxs: (type, props) => ({type, props}), Fragment: 'Fragment' },
      'react-native': { DeviceEventEmitter: {emit() {}}, Linking: {}, Platform: {OS: platform}, ScrollView: 'ScrollView', View: 'View', StyleSheet: {create: x => x} },
      'react-native-paper': paper,
      'react-native-safe-area-context': {SafeAreaView: 'SafeAreaView'},
      'expo-router': {useRouter: () => ({back() {}})},
      'expo-notifications': {}, 'expo-camera': {Camera: {}},
      '@/context/AuthContext': {useAuth: () => ({})},
      '@/components/ui/BrandActivityIndicator': {BrandActivityIndicator: 'Loader'},
      '@/components/ui/ResponsiveSegmentedButtons': {ResponsiveSegmentedButtons: 'ResponsiveSegmentedButtons'},
      '@chemisttasker/shared-core': {},
      '@/constants/tokens': {colors: {status: {red: {fg: '#b42318'}}}, radius: {}, space: {}},
      '@/utils/appLock': {APP_LOCK_CHANGED: 'changed', validDelay: n => [0,30,60,300].includes(n), setAppLockPreference: async (id, pref) => calls.push([id,pref])},
      '@/utils/appUpdates': {getInstalledAppVersion: () => '1.0.0', fetchMobileAppConfig: async () => null, decideAppUpdate: () => ({})},
      '@/utils/biometricAuth': {authenticateWithDeviceLock: async () => true},
    };
    const exports = {};
    vm.runInNewContext(code, {exports, require: id => { assert.ok(id in modules, id); return modules[id]; }, console});
    const tree = exports.content({user: {id: 9}});
    return {control: all(tree, n => n.type === 'ResponsiveSegmentedButtons')[0], calls};
  }
  const enabled = await run('android');
  assert.equal(enabled.control.props.value, '60');
  assert.deepEqual(Array.from(enabled.control.props.buttons, b => b.value), ['0','30','60','300']);
  assert.ok(enabled.control.props.buttons.every(b => !b.disabled));
  enabled.control.props.onValueChange('30');
  for (let i = 0; i < 5; i++) await Promise.resolve();
  assert.equal(enabled.calls.length, 1); assert.equal(enabled.calls[0][1].delaySeconds, 30);
  const disabled = await run('web');
  assert.ok(disabled.control.props.buttons.every(b => b.disabled));
  disabled.control.props.onValueChange('300');
  for (let i = 0; i < 5; i++) await Promise.resolve();
  assert.equal(disabled.calls.length, 0);
});


