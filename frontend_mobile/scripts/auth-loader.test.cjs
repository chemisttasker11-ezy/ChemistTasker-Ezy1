const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require(fs.existsSync(path.resolve(__dirname, '../node_modules/typescript')) ? path.resolve(__dirname, '../node_modules/typescript') : path.resolve(__dirname, '../node_modules/typescript'));
function render(file, user, isLoading) {
  const exports = {}; const redirects = []; const effects = [];
  const jsx = (type, props) => ({ type, props });
  const mocks = {
    'react/jsx-runtime': { jsx, jsxs: jsx }, react: { useEffect: fn => effects.push(fn) },
    'react-native': { View: 'View' }, '@/components/ui/BrandLoader': { BrandLoader: 'BrandLoader' },
    'expo-router': { Redirect: 'Redirect', useRouter: () => ({ replace: path => redirects.push(path) }) },
    '@chemisttasker/shared-core': { hasOrganizationAccess: user => !!user?.organization },
    '../context/AuthContext': { useAuth: () => ({ user, isLoading }) },
    '../../context/AuthContext': { useAuth: () => ({ user, isLoading }) },
  };
  const source = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  vm.runInNewContext(code, { exports, require: id => { if (!(id in mocks)) throw Error(id); return mocks[id]; } });
  const tree = exports.default(); effects.forEach(fn => fn());
  return { tree, redirects };
}
for (const [file, label] of [['app/+not-found.tsx', 'Restoring session'], ['roles/pharmacist/index.tsx', 'Loading workspace']]) {
  test(`${file}: auth restoration renders centered accessible brand loader and no redirects`, () => {
    const { tree, redirects } = render(file, null, true);
    assert.equal(tree.type, 'View');
    assert.equal(tree.props.style.justifyContent, 'center');
    assert.equal(tree.props.style.alignItems, 'center');
    assert.equal(tree.props.children.type, 'BrandLoader');
    assert.equal(tree.props.children.props.accessibilityLabel, label);
    assert.deepEqual(redirects, []);
  });
}
test('not-found keeps persona, organization and signed-out destinations', () => {
  for (const [user, expected] of [[null, '/login'], [{role:'OWNER'}, '/owner/dashboard'], [{role:'PHARMACIST'}, '/pharmacist/dashboard'], [{role:'OTHER_STAFF'}, '/otherstaff/dashboard'], [{role:'EXPLORER'}, '/explorer/dashboard'], [{role:'PHARMACIST', organization:true}, '/organization/dashboard']]) {
    const { tree } = render('app/+not-found.tsx', user, false);
    assert.equal(tree.type, 'Redirect'); assert.equal(tree.props.href, expected);
  }
});
test('pharmacist index retains rendered redirect and effect guards', () => {
  for (const [user, expected] of [[null, ['/login']], [{role:'OWNER'}, ['/']], [{role:'PHARMACIST'}, []]]) {
    const { tree, redirects } = render('roles/pharmacist/index.tsx', user, false);
    assert.equal(tree.type, 'Redirect'); assert.equal(tree.props.href, '/pharmacist/dashboard');
    assert.deepEqual(redirects, expected);
  }
});
