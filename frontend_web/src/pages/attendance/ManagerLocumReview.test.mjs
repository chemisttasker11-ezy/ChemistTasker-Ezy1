import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const locum = {
  provisional_id: 71, session_id: 81, worker_id: 17,
  worker_name: 'Verified Locum', worker_email: 'locum@example.test',
  started_at: '2026-10-29T08:00:00+10:00', ended_at: null,
  cover_type: 'UNBOOKED_LOCUM_COVER', source_membership: null,
  source_pharmacy: null, source_pharmacy_name: null,
  status: 'PENDING', decision_reason: null, created_at: '2026-10-29T08:00:00+10:00',
};

function nodes(node, type) {
  if (node == null || typeof node !== 'object') return [];
  if (Array.isArray(node)) return node.flatMap(child => nodes(child, type));
  if (node.props?.hidden || (node.type === 'Dialog' && !node.props.open)) return [];
  return [...(node.type === type ? [node] : []), ...nodes(node.props?.children, type)];
}
function text(node) {
  if (node == null || typeof node === 'boolean') return '';
  if (Array.isArray(node)) return node.map(text).join(' ');
  if (typeof node !== 'object') return String(node);
  if (node.props?.hidden || (node.type === 'Dialog' && !node.props.open)) return '';
  return [node.props?.label, text(node.props?.children)].filter(value => value != null).join(' ');
}

async function review(rows = [locum]) {
  const state = [], deps = [], memo = [], calls = [], fallbacks = [];
  let cursor = 0, dirty = true, effects = [], tree;
  const equal = (a, b) => a && b && a.length === b.length && a.every((value, i) => Object.is(value, b[i]));
  const hooks = {
    useState(initial) {
      const index = cursor++;
      if (!(index in state)) state[index] = typeof initial === 'function' ? initial() : initial;
      return [state[index], value => {
        const next = typeof value === 'function' ? value(state[index]) : value;
        if (!Object.is(next, state[index])) { state[index] = next; dirty = true; }
      }];
    },
    useRef(initial) { const index = cursor++; return state[index] ??= { current: initial }; },
    useMemo(fn, next) {
      const index = cursor++;
      if (!equal(deps[index], next)) { deps[index] = next; memo[index] = fn(); }
      return memo[index];
    },
    useCallback(fn, next) { return hooks.useMemo(() => fn, next); },
    useEffect(fn, next) {
      const index = cursor++;
      if (!equal(deps[index], next)) { deps[index] = next; effects.push(fn); }
    },
  };
  const names = new Proxy({}, { get: (_, name) => String(name) });
  const imports = {
    react: hooks, 'react/jsx-runtime': { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) },
    '@mui/material': names, 'lucide-react': names,
    '@chemisttasker/shared-core': {
      attendance: { async getManagerPending(id) { calls.push(['load', id]); return structuredClone(rows); } },
      fetchPharmaciesService: async () => [{ id: 9, name: 'Cover Pharmacy' }],
      formatAttendanceMinutes: minutes => `${Math.floor(minutes / 60)}h ${minutes % 60}m`,
    },
    '../../components/ui/PageHeader': 'PageHeader', './KioskEvidenceReview': 'KioskEvidenceReview',
    '../../components/dashboard/DashboardContentState': 'DashboardContentState',
    '../../components/ui/InitialsAvatar': { InitialsAvatar: 'InitialsAvatar' },
    '../../components/ui/Pill': { Pill: 'Pill' },
  };
  function load(relative) {
    const { outputText } = ts.transpileModule(readFileSync(new URL(relative, import.meta.url), 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
    });
    const exports = {};
    vm.runInNewContext(outputText, { exports, console, require(name) {
      if (name in imports) return imports[name];
      assert.ok(!name.startsWith('.'), `Unmocked manager dependency: ${name}`);
      return require(name);
    } });
    return exports;
  }
  const { humanizeEnum } = load('../../utils/labels.ts');
  imports['../../utils/labels'] = { humanizeEnum(value) { fallbacks.push(value); return humanizeEnum(value); } };
  imports['./correctionTimestamp'] = load('./correctionTimestamp.ts');
  const { default: Component } = load('./ManagerAttendanceReviewPage.tsx');
  async function flush() {
    for (let i = 0; i < 30; i++) {
      if (dirty) {
        cursor = 0; dirty = false; tree = Component();
        const pending = effects; effects = []; pending.forEach(fn => fn());
      }
      await new Promise(setImmediate);
      if (!dirty && !effects.length) return;
    }
    assert.fail('Manager review effects did not settle');
  }
  await flush();
  assert.deepEqual(calls, [['load', 9]], 'Exercise the real pharmacy-scoped pending-list load');
  return {
    fallbacks, get tree() { return tree; },
    async open(action) {
      const control = nodes(tree, 'Button').find(node => new RegExp(`^${action}$`, 'i').test(text(node).trim()));
      assert.ok(control, `Missing ${action} action: ${text(tree)}`);
      assert.ok(!control.props.disabled, `${action} must stay available`);
      control.props.onClick(); await flush();
      const dialogs = nodes(tree, 'Dialog');
      assert.equal(dialogs.length, 1); assert.match(text(dialogs[0]), new RegExp(action, 'i'));
    },
  };
}

test('unbooked manager row uses the explicit Unbooked locum cover label rather than the enum fallback', async () => {
  const ui = await review();
  assert.ok(nodes(ui.tree, 'Pill').some(node => /^Unbooked locum cover$/i.test(node.props.label)));
  // The fallback happens to produce the same words; it still lacks the dedicated hint.
  assert.ok(!ui.fallbacks.includes(locum.cover_type), 'UNBOOKED_LOCUM_COVER needs a dedicated COVER_TYPES entry');
});

test('unbooked manager row explains no booking and approval before payable', async () => {
  const ui = await review();
  const copy = [text(ui.tree), ...nodes(ui.tree, 'Pill').map(node => node.props.title || '')].join(' ');
  assert.match(copy, /no booking/i);
  assert.match(copy, /before[\s\S]*payable/i);
});

test('unbooked manager row with null sources renders the worker without null or undefined text', async () => {
  const ui = await review();
  assert.match(text(ui.tree), /Verified Locum/);
  assert.match(text(ui.tree), /locum@example\.test/);
  assert.doesNotMatch(text(ui.tree), /\b(?:undefined|null)\b/i);
  assert.doesNotMatch(text(ui.tree), /usually at/i);
});

for (const action of ['Approve', 'Reject']) {
  test(`unbooked manager row keeps ${action} available and opens its decision dialog`, async () => {
    const ui = await review(); await ui.open(action);
    assert.match(text(nodes(ui.tree, 'Dialog')[0]), /Verified Locum/);
  });
}

for (const [coverType, label] of [
  ['UNROSTERED_LOCAL', 'Not on the roster'],
  ['CROSS_SITE_CHAIN', 'Cover from a sister store'],
  ['CROSS_SITE_ORG', 'Cover from your organisation'],
]) {
  test(`existing ${coverType} keeps its manager label and source pharmacy`, async () => {
    const ui = await review([{ ...locum, cover_type: coverType, source_membership: 4, source_pharmacy: 3, source_pharmacy_name: 'Home Pharmacy' }]);
    assert.ok(nodes(ui.tree, 'Pill').some(node => node.props.label === label));
    assert.match(text(ui.tree), /usually at Home Pharmacy/i);
    assert.ok(!ui.fallbacks.includes(coverType));
  });
}


test('unbooked manager row renders approval-before-payable guidance as visible text rather than a tooltip', async () => {
  const ui = await review();
  const row = nodes(ui.tree, 'Paper').find(node => node.props.variant === 'outlined' && text(node).includes(locum.worker_email));
  assert.ok(row, 'Unbooked worker must appear in a pending row');
  const copy = text(row); // Deliberately excludes title/tooltip props.
  assert.match(copy, /no booking/i);
  assert.match(copy, /approv(?:e|al)[\s\S]*before[\s\S]*payable/i);
});
