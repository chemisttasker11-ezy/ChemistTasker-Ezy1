// M4-04 qualification: execute the actual Next migrated AddItemWizard host.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const jsx = (type, props, key) => ({ type, props: props || {}, key });
const text = node => typeof node === 'string' || typeof node === 'number' ? String(node)
  : Array.isArray(node) ? node.map(text).join(' ')
  : node && typeof node === 'object' ? text(node.props?.children) : '';

function nextWizard(options = {}) {
  const state = { session: 'authenticated', role: 'PHARMACIST', id: 101 };
  const calls = [], routes = [], slots = [], effects = [];
  let cursor = 0, uuid = 0;
  const equal = (a, b) => !!a && !!b && a.length === b.length && a.every((x, i) => x === b[i]);
  const react = {
    useState(initial) {
      const i = cursor++;
      if (!(i in slots)) slots[i] = { value: typeof initial === 'function' ? initial() : initial };
      return [slots[i].value, update => {
        slots[i].value = typeof update === 'function' ? update(slots[i].value) : update;
      }];
    },
    useRef(initial) {
      const i = cursor++;
      if (!(i in slots)) slots[i] = { current: initial };
      return slots[i];
    },
    useMemo(fn, deps) {
      const i = cursor++;
      if (!(i in slots) || !equal(slots[i].deps, deps)) slots[i] = { value: fn(), deps };
      return slots[i].value;
    },
    useCallback(fn, deps) {
      const i = cursor++;
      if (!(i in slots) || !equal(slots[i].deps, deps)) slots[i] = { value: fn, deps };
      return slots[i].value;
    },
    useEffect(fn, deps) {
      const i = cursor++;
      if (!(i in slots) || !equal(slots[i].deps, deps)) {
        const previous = slots[i];
        slots[i] = { deps };
        effects.push(() => {
          previous?.cleanup?.();
          slots[i].cleanup = fn();
        });
      }
    },
  };
  react.default = react;
  const source = readFileSync(new URL('./add-item-wizard.tsx', import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2020,
      module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
    fileName: 'add-item-wizard.tsx',
  }).outputText;
  const category = { id: 7, slug: 'textbooks', name: 'Professional books',
    description: 'Used reference material', context: 'PERSONAL',
    maximum_buyer_roles: ['PHARMACIST'], permitted_modes: ['SELL', 'FREE'] };
  const access = {
    can_trade_personally: true, can_trade_for_pharmacy: false,
    role_code: 'PHARMACIST', role_label: 'Pharmacist', blockers: [],
    eligible_pharmacies: [], personal_categories: [category],
    pharmacy_categories: [], role_guidance: ['Use safe categories'], ethical_entry_available: false,
    ...options.access,
  };
  const api = {
    getListingOptions: async () => access,
    lookupCatalogue: async () => ({ results: [] }),
    createListing: async body => {
      calls.push({ method: 'create', body });
      if (options.create) return options.create(body);
       return { id: 'a1111111-1111-4111-8111-111111111111', version: 1 };
    },
    updateListing: async (id, body) => {
      calls.push({ method: 'update', id, body });
      return options.update ? options.update(id, body) : { id, version: body.expected_version + 1 };
    },
    updateAudience: async (id, body) => {
      calls.push({ method: 'audience', id, body });
      return { version: body.expected_version + 1 };
    },
    uploadImage: async (id, body) => {
      calls.push({ method: 'upload', id, body });
      return options.upload ? options.upload(id, body) : { id: 88 };
    },
    actOnListing: async (id, action, version) => {
      calls.push({ method: 'submit', id, action, version });
      return { publication_status: 'PENDING_REVIEW', version: version + 1 };
    },
  };
  const modules = {
    react, 'react/jsx-runtime': { jsx, jsxs: jsx },
    'next/link': { default: 'Link' },
    'next/navigation': { useRouter: () => ({ push: url => routes.push(url) }) },
    'lucide-react': new Proxy({}, { get: (_, name) => String(name) }),
    '@/shared/browser-session': { loginHref: next => '/login?next=' + encodeURIComponent(next) },
    '@/shared/session-provider': { useSession: () => ({ status: state.session,
      user: state.session === 'authenticated' ? { id: state.id, role: state.role } : null }) },
    './api': { marketplaceApi: api },
    './access-steps': { default: 'MarketplaceAccessSteps' },
    './add-item-wizard.module.css': { default: {}, __esModule: true },
  };
  const module = { exports: {} };
  vm.runInNewContext(compiled, {
    module, exports: module.exports, URL, FormData, Blob, console,
    crypto: { randomUUID: () => `5b3f8a60-bccb-4b66-988b-${String(++uuid).padStart(12, '0')}` },
    require(id) {
      if (!(id in modules)) throw Error('Unknown Next wizard import ' + id);
      return modules[id];
    },
  }, { filename: 'add-item-wizard.tsx' });
  function flatten(node, result = []) {
    if (Array.isArray(node)) { node.forEach(entry => flatten(entry, result)); return result; }
    if (!node || typeof node !== 'object') return result;
    if (typeof node.type === 'function') return flatten(node.type(node.props), result);
    result.push(node);
    flatten(node.props?.children, result);
    return result;
  }
  function render() {
    cursor = 0;
    return flatten(module.exports.default());
  }
  async function flush() {
    while (effects.length) effects.shift()();
    for (let i = 0; i < 8; i++) await Promise.resolve();
  }
  async function stable() {
    for (let i = 0; i < 5; i++) { render(); await flush(); }
    return render();
  }
  async function click(label) {
    const tree = await stable();
    const found = tree.find(n => n.type === 'button' &&
      text(n).trim().includes(label));
    assert.ok(found, 'Could not find genuine Next action: ' + label);
    assert.notEqual(found.props.disabled, true, 'Next action disabled: ' + label);
    found.props.onClick();
    await flush();
  }
  async function fill(placeholder, value) {
    const tree = await stable();
    const input = tree.find(n => (n.type === 'input' || n.type === 'textarea') &&
      n.props.placeholder === placeholder);
    assert.ok(input, 'Missing real input ' + placeholder);
    input.props.onChange({ target: { value } });
    await flush();
  }
  async function toFinal(withPhoto = false, pharmacy = false) {
    await click(pharmacy ? 'Pharmacy-owned item' : 'Personal item');
    await click('Free');
    await click('Continue to Category');
    await click('Professional books');
    await click('Continue to Details');
    await fill('e.g. AMH 2024 Reference Guide', 'Used pharmacology textbook');
    await fill('Describe condition, edition, markings, or included accessories...',
      'Clean pages, no patient information');
    if (withPhoto) {
      const upload = (await stable()).find(n => n.type === 'input' && n.props.type === 'file');
      assert.ok(upload);
      upload.props.onChange({ target: { files: [new Blob(['photo'], { type: 'image/jpeg' })] } });
      await stable();
    }
    await click('Continue to Audience');
    await click('Continue to Delivery');
    await fill('e.g. Brisbane', 'Brisbane');
    await click('Review Listing');
    await click('Proceed to Submit');
    const nodes = await stable();
    assert.ok(nodes.some(n => n.type === 'h2' && text(n).includes('Ready to finalize')));
  }
  function unmount() { for (const slot of slots) slot?.cleanup?.(); }
  return { state, calls, routes, access, api, stable, click, fill, toFinal, unmount };
}

test('R: Add another item creates a second listing with a new receipt', async () => {
  const app = nextWizard();
  await app.toFinal();
  await app.click('Save as private draft');
  await app.click('Add another item');
  await app.toFinal();
  await app.click('Save as private draft');
  assert.deepEqual(app.calls.map(c => c.method), ['create', 'create']);
  assert.notEqual(app.calls[0].body.client_request_id, app.calls[1].body.client_request_id);
});

test('C: upload retry retains the same listing receipt and progress', async () => {
  let attempt = 0;
  const app = nextWizard({ upload: async () => { if (++attempt === 1) throw Error('Retry'); } });
  await app.toFinal(true);
  await app.click('Save as private draft');
  await app.click('Save as private draft');
  assert.deepEqual(app.calls.map(c => c.method), ['create', 'upload', 'update', 'upload']);
  assert.equal(app.calls[2].id, app.calls[1].id);
  assert.equal(app.calls[2].body.client_request_id, app.calls[0].body.client_request_id);
});

test('R: changed pharmacy audience is reapplied after an upload failure', async () => {
  let attempt = 0;
  const category = { id: 7, slug: 'fixtures', name: 'Professional books', description: 'Fixtures',
    context: 'PHARMACY', maximum_buyer_roles: ['OWNER'], permitted_modes: ['FREE'] };
  const app = nextWizard({ access: { can_trade_for_pharmacy: true,
    eligible_pharmacies: [{ id: 1, label: 'My pharmacy' }], pharmacy_categories: [category] },
    upload: async () => { if (++attempt === 1) throw Error('Retry'); } });
  await app.toFinal(true, true);
  await app.click('Submit for review');
  await app.click('Back');
  await app.click('Back');
  await app.click('Back');
  const select = (await app.stable()).find(n => n.type === 'select' && n.props.value === 'PLATFORM');
  assert.ok(select, 'Maximum audience ceiling control');
  select.props.onChange({ target: { value: 'OWNED_CHAIN' } });
  await app.click('Continue to Delivery');
  await app.click('Review Listing');
  await app.click('Proceed to Submit');
  await app.click('Submit for review');
  const audiences = app.calls.filter(c => c.method === 'audience');
  assert.equal(audiences.length, 2);
  assert.equal(audiences[0].body.maximum_circle, 'PLATFORM');
  assert.equal(audiences[1].body.maximum_circle, 'OWNED_CHAIN');
  assert.equal(audiences[1].body.expected_version, 3);
  assert.equal(app.calls.find(c => c.method === 'submit').version, 4);
});

test('C: anonymous Next marketplace new route does not create/submit; links back to authentication', async () => {
  const app = nextWizard();
  app.state.session = 'anonymous';
  const nodes = await app.stable();
  assert.ok(nodes.some(n => n.type === 'a' &&
    String(n.props.href).includes(encodeURIComponent('/marketplace/new'))));
  assert.equal(app.calls.length, 0);
  assert.equal(nodes.some(n => n.type === 'button' && text(n).includes('Submit for review')), false);
});

test('C: authenticated but blocked viewer has no personal/pharmacy create step', async () => {
  const app = nextWizard({ access: {
    can_trade_personally: false, can_trade_for_pharmacy: false,
    blockers: [{ code: 'MARKETPLACE_TERMS_REQUIRED', message: 'Accept current terms first' }],
    personal_categories: [], pharmacy_categories: [],
  } });
  const nodes = await app.stable();
  assert.equal(nodes.some(n => n.type === 'button' && text(n).includes('Personal item')), false);
  assert.equal(nodes.some(n => n.type === 'button' && text(n).includes('Pharmacy-owned item')), false);
  assert.equal(app.calls.length, 0);
});

test('C: real Next wizard Save private draft performs only a server create', async () => {
  const app = nextWizard();
  await app.toFinal();
  await app.click('Save as private draft');
  const nodes = await app.stable();
  assert.deepEqual(app.calls.map(c => c.method), ['create']);
  assert.equal(app.calls[0].body.mode, 'FREE');
  assert.equal(app.calls[0].body.amount, '0');
  assert.equal(app.calls[0].body.seller_context, 'PERSONAL');
  assert.equal(app.calls[0].body.pharmacy, null);
  assert.ok(nodes.some(n => n.type === 'h1' && text(n).includes('Draft created')));
});

test('C: real Next Submit for review uses same create payload then explicit server submit', async () => {
  const app = nextWizard();
  await app.toFinal();
  await app.click('Submit for review');
  const nodes = await app.stable();
  assert.deepEqual(app.calls.map(c => c.method), ['create', 'submit']);
  assert.equal(app.calls[1].action, 'submit');
  assert.equal(app.calls[1].version, 1);
  assert.ok(nodes.some(n => n.type === 'h1' && text(n).includes('Listing submitted')));
});

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const spin = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };

test('R: Next account switch while create is pending blocks all subsequent writes and stale completion', async () => {
  const pending = deferred();
  const app = nextWizard({ create: () => pending.promise });
  await app.toFinal();
  await app.click('Submit for review');
  assert.equal(app.calls.filter(x => x.method === 'create').length, 1);
  app.state.id = 202; app.state.role = 'OWNER';
  await app.stable();
  pending.resolve({ id: 'a1111111-1111-4111-8111-111111111111', version: 1 });
  await spin(); await app.stable();
  assert.deepEqual(app.calls.map(x => x.method), ['create']);
  assert.equal(app.routes.length, 0);
  app.unmount();
});

test('R: Next unmount during create prevents all further writes', async () => {
  const pending = deferred();
  const app = nextWizard({ create: () => pending.promise });
  await app.toFinal();
  await app.click('Submit for review');
  app.unmount();
  pending.resolve({ id: 'a1111111-1111-4111-8111-111111111111', version: 1 });
  await spin();
  assert.deepEqual(app.calls.map(x => x.method), ['create']);
});

test('R: Next failed create retains client_request_id on retry', async () => {
  let count = 0;
  const app = nextWizard({ create: async () => {
    if (++count === 1) throw Error('Connection dropped');
    return { id: 'a1111111-1111-4111-8111-111111111111', version: 1 };
  } });
  await app.toFinal();
  await app.click('Submit for review');
  await app.stable();
  await app.click('Submit for review');
  await app.stable();
  const creates = app.calls.filter(x => x.method === 'create');
  assert.equal(creates.length, 2);
  assert.ok(creates[0].body.client_request_id);
  assert.equal(creates[1].body.client_request_id, creates[0].body.client_request_id);
});

test('R: Next failed submit resumes same listing/version rather than creating another', async () => {
  const app = nextWizard();
  let attempts = 0;
  app.api.actOnListing = async (id, action, version) => {
    app.calls.push({ method: 'submit', id, action, version });
    if (++attempts === 1) throw Error('Cannot submit yet');
    return { publication_status: 'PENDING_REVIEW', version: version + 1 };
  };
  await app.toFinal();
  await app.click('Submit for review');
  await app.stable();
  await app.click('Submit for review');
  await app.stable();
  assert.equal(app.calls.filter(x => x.method === 'create').length, 1);
  assert.equal(app.calls.filter(x => x.method === 'update').length, 1);
  assert.equal(app.calls.filter(x => x.method === 'submit').length, 2);
});

test('R: Next upload failure is visible and no submit/created state is falsely reported', async () => {
  let uploadAttempts = 0;
  const app = nextWizard({ upload: async () => {
    uploadAttempts++;
    if (uploadAttempts === 1) throw Error('Image upload unavailable');
    return { id: 88 };
  } });
  await app.toFinal(true);
  await app.click('Submit for review');
  const failed = await app.stable();
  assert.equal(app.calls.filter(c => c.method === 'upload').length, 1);
  assert.equal(app.calls.filter(c => c.method === 'submit').length, 0);
  assert.equal(failed.some(n => n.type === 'h1' && text(n).includes('Listing submitted')), false);
  assert.ok(failed.some(n => typeof n.props?.children === 'string' &&
    String(n.props.children).includes('Image upload unavailable')));
  await app.click('Submit for review');
  await app.stable();
  assert.equal(app.calls.filter(c => c.method === 'create').length, 1);
  assert.equal(app.calls.filter(c => c.method === 'upload').length, 2);
  assert.equal(app.calls.filter(c => c.method === 'submit').length, 1);
});
