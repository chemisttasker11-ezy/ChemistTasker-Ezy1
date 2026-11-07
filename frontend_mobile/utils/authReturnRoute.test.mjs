import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const transpile = (sourcePath) =>
  ts.transpileModule(readFileSync(new URL(sourcePath, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.React },
  }).outputText;

const authReturnExports = {};
vm.runInNewContext(transpile('./authReturnRoute.ts'), { exports: authReturnExports, URLSearchParams });
const { sanitizeReturnTo } = authReturnExports;

test('allows valid existing membership apply, admin-invitations, and explore routes', () => {
  assert.equal(sanitizeReturnTo('/membership/apply/token123'), '/membership/apply/token123');
  assert.equal(sanitizeReturnTo('/admin-invitations'), '/admin-invitations');
  assert.equal(sanitizeReturnTo('/explore'), '/explore');
  assert.equal(sanitizeReturnTo('/explore/posts/valid-article-slug_42'), '/explore/posts/valid-article-slug_42');
});

test('preserves safe query params and strips fragment junk', () => {
  assert.equal(
    sanitizeReturnTo('/membership/apply/tok1?referral_code=REF1&source=email#heading'),
    '/membership/apply/tok1?referral_code=REF1&source=email'
  );
  assert.equal(sanitizeReturnTo('/admin-invitations?referral_code=ADM42'), '/admin-invitations?referral_code=ADM42');
});

test('rejects external, protocol-relative, backslash, traversal, control chars and escapes', () => {
  for (const bad of [
    'https://evil.com', 'http://evil.com', '//evil.com', '\\evil.com', '/\\evil.com',
    '/membership/apply/tok/../../secret', '/membership/apply/%2e%2e', '/membership/apply/%2f%2fevil',
    '/membership/apply/%5cevil', '/membership/apply/tok%00', '/membership/apply/%252e',
    '/explore/art%255c', '/explore/%zz', '/admin\x00invitations', '/admin-invitations\x1f',
  ]) {
    assert.equal(sanitizeReturnTo(bad), null, `expected rejection of: ${bad}`);
  }
});

function createComponentHarness(Component) {
  let hooks = [], hookIndex = 0, tree = null;
  const replaced = [];
  const router = { replace: (to) => replaced.push(to), back: () => {}, canGoBack: () => true, push: () => {} };
  const React = {
    useState: (init) => {
      const idx = hookIndex++;
      if (hooks[idx] === undefined) hooks[idx] = typeof init === 'function' ? init() : init;
      return [hooks[idx], (v) => { hooks[idx] = typeof v === 'function' ? v(hooks[idx]) : v; render(); }];
    },
    useRef: (init) => { const idx = hookIndex++; if (!hooks[idx]) hooks[idx] = { current: init }; return hooks[idx]; },
    createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
  };
  const render = () => { hookIndex = 0; tree = Component(); return tree; };
  const find = (node, predicate) => {
    if (!node || typeof node !== 'object') return null;
    if (predicate(node)) return node;
    const ch = Array.isArray(node.props?.children) ? node.props.children : [node.props?.children];
    for (const c of ch.flat(Infinity)) { const res = find(c, predicate); if (res) return res; }
    return null;
  };
  return { React, render, getTree: () => tree, find, replaced, router };
}

function loadHarness(sourcePath, modules = {}) {
  let harness;
  const react = {
    useState: (...args) => harness.React.useState(...args),
    useRef: (...args) => harness.React.useRef(...args),
    createElement: (...args) => harness.React.createElement(...args),
    __esModule: true,
  };
  react.default = react;
  modules.react = react;
  if (!modules['expo-router']) modules['expo-router'] = {};
  modules['expo-router'].useRouter = () => harness.router;

  const exports = {};
  vm.runInNewContext(transpile(sourcePath), { exports, require: (id) => modules[id] || {}, console });
  harness = createComponentHarness(exports.default);
  harness.render();
  return harness;
}

test('ResetPasswordScreen actual handler: truerejectreset renders reset error', async () => {
  let resetCalled = false;
  const modules = {
    '@chemisttasker/shared-core': { passwordResetConfirm: async () => { resetCalled = true; throw new Error('Token expired'); } },
    '../context/AuthContext': { useAuth: () => ({ logout: async () => {} }) },
    'expo-router': { useLocalSearchParams: () => ({ uid: 'u1', token: 't1' }) },
    '@/components/ui': { TextField: 'TextField', Button: 'Button' },
    '../components/AuthLayout': { default: (p) => p.children, AuthNotice: 'AuthNotice', AuthLink: 'AuthLink', __esModule: true },
    '@/constants/tokens': { space: { md: 8 } },
    'react-native': { View: 'View' },
  };
  const harness = loadHarness('../app/reset-password.tsx', modules);

  harness.find(harness.getTree(), n => n.props?.label === 'New password').props.onChangeText('secret123');
  harness.find(harness.getTree(), n => n.props?.label === 'Confirm new password').props.onChangeText('secret123');
  await harness.find(harness.getTree(), n => n.props?.label === 'Reset password').props.onPress();
  await new Promise(r => setTimeout(r, 0));

  assert.equal(resetCalled, true);
  const notice = harness.find(harness.getTree(), n => n.type === 'AuthNotice');
  assert.equal(notice?.props?.tone, 'error');
  assert.equal(notice?.props?.message, 'Token expired');
});

test('ResetPasswordScreen actual handler: ackreset/rejectlogout shows honest notice and login action', async () => {
  let logoutAttempted = false;
  const modules = {
    '@chemisttasker/shared-core': { passwordResetConfirm: async () => ({ ok: true }) },
    '../context/AuthContext': { useAuth: () => ({ logout: async () => { logoutAttempted = true; throw new Error('Cookie signout failed'); } }) },
    'expo-router': { useLocalSearchParams: () => ({ uid: 'u1', token: 't1' }) },
    '@/components/ui': { TextField: 'TextField', Button: 'Button' },
    '../components/AuthLayout': { default: (p) => p.children, AuthNotice: 'AuthNotice', AuthLink: 'AuthLink', __esModule: true },
    '@/constants/tokens': { space: { md: 8 } },
    'react-native': { View: 'View' },
  };
  const harness = loadHarness('../app/reset-password.tsx', modules);

  harness.find(harness.getTree(), n => n.props?.label === 'New password').props.onChangeText('secret123');
  harness.find(harness.getTree(), n => n.props?.label === 'Confirm new password').props.onChangeText('secret123');
  await harness.find(harness.getTree(), n => n.props?.label === 'Reset password').props.onPress();
  await new Promise(r => setTimeout(r, 0));

  assert.equal(logoutAttempted, true);
  const notice = harness.find(harness.getTree(), n => n.type === 'AuthNotice');
  assert.equal(notice?.props?.tone, 'info');
  assert.match(notice?.props?.message, /Password updated successfully/);
  const loginBtn = harness.find(harness.getTree(), n => n.props?.label === 'Go to login');
  assert.ok(loginBtn, 'login action must be available on logout failure');
});

test('VerifyOTPScreen actual handler: web success routes login, native success routes mobile-verify', async () => {
  for (const os of ['web', 'ios']) {
    let verifiedEmail = '';
    const modules = {
      '../context/AuthContext': { useAuth: () => ({ verifyOTP: async (_, e) => { verifiedEmail = e; } }) },
      'expo-router': { useLocalSearchParams: () => ({ email: 'test@example.com' }) },
      '@/components/ui': { Button: 'Button', TextField: 'TextField' },
      '../components/AuthLayout': { default: (p) => p.children, AuthNotice: 'AuthNotice', AuthLink: 'AuthLink', AuthPrompt: 'AuthPrompt', OtpCodeInput: 'OtpCodeInput', __esModule: true },
      '@/constants/tokens': {
        colors: { textSecondary: '#666' },
        font: { inter: { semiBold: 'sb', regular: 'r' } },
        space: { xs: 4, md: 8 },
        type: { bodyMedium: { fontSize: 14, lineHeight: 20 }, bodySmall: { fontSize: 12, lineHeight: 16 } },
      },
      'react-native': { Platform: { OS: os }, StyleSheet: { create: () => ({}) }, Text: 'Text', View: 'View' },
    };
    const harness = loadHarness('../app/verify-otp.tsx', modules);

    harness.find(harness.getTree(), n => n.type === 'OtpCodeInput').props.onChangeText('123456');
    await harness.find(harness.getTree(), n => n.props?.label === 'Verify').props.onPress();
    await new Promise(r => setTimeout(r, 0));

    assert.equal(verifiedEmail, 'test@example.com');
    if (os === 'web') {
      assert.deepEqual(JSON.parse(JSON.stringify(harness.replaced[0])), { pathname: '/login', params: { email: 'test@example.com', verified: '1' } });
    } else {
      assert.equal(harness.replaced[0], '/mobile-verify');
    }
  }
});
