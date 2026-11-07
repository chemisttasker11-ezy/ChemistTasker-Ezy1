// M4-04: production marketplace wrapper, ReviewStep and durable draft module
// are transpiled in FULL. Network, AsyncStorage, image reads and router are boundaries.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('../node_modules/typescript');
const root = path.resolve(__dirname, '../..');
const jsx = (type, props, key) => ({ type, props: props || {}, key });
function load(relative, modules, globals = {}) {
  const file = path.join(root, relative);
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    fileName: file, compilerOptions: {
      target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(code, {
    module, exports: module.exports, console, Date, URL, Intl, FormData, Blob,
    Promise, setTimeout, clearTimeout, ...globals,
    require(name) {
      if (!Object.prototype.hasOwnProperty.call(modules, name))
        throw Error('Unmocked Marketplace import ' + name + ' in ' + relative);
      return modules[name];
    },
  }, { filename: file });
  return module.exports;
}
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function createScheduler() {
  const fibers = new Map();
  const effects = [];
  let active = null, index = 0, visited = new Set();
  const equal = (a, b) => !!a && !!b && a.length === b.length && a.every((x, i) => x === b[i]);
  const react = {
    useState(initial) {
      const id = index++, s = active.slots;
      if (!(id in s)) s[id] = { value: typeof initial === 'function' ? initial() : initial };
      return [s[id].value, value => {
        s[id].value = typeof value === 'function' ? value(s[id].value) : value;
      }];
    },
    useRef(initial) {
      const id = index++, s = active.slots;
      if (!(id in s)) s[id] = { current: initial };
      return s[id];
    },
    useMemo(fn, deps) {
      const id = index++, s = active.slots;
      if (!(id in s) || !equal(s[id].deps, deps)) s[id] = { deps, value: fn() };
      return s[id].value;
    },
    useCallback(fn, deps) {
      const id = index++, s = active.slots;
      if (!(id in s) || !equal(s[id].deps, deps)) s[id] = { deps, value: fn };
      return s[id].value;
    },
    useEffect(fn, deps) {
      const id = index++, fiber = active, old = fiber.effects.get(id);
      if (!old || !equal(old.deps, deps)) effects.push(() => {
        old?.cleanup?.();
        fiber.effects.set(id, { deps, cleanup: fn() });
      });
    },
  };
  react.default = react;
  const hosts = [];
  function walk(node, location) {
    if (Array.isArray(node)) {
      node.forEach((child, i) => walk(child, location + '.' + i));
      return;
    }
    if (!node || typeof node !== 'object') return;
    if (typeof node.type === 'function') {
      const key = location + '/' + (node.type.displayName || node.type.name) + ':' + String(node.key ?? '');
      if (!fibers.has(key)) fibers.set(key, { slots: [], effects: new Map() });
      const fiber = fibers.get(key), previous = active, previousIndex = index;
      visited.add(key);
      active = fiber; index = 0;
      const child = node.type(node.props);
      active = previous; index = previousIndex;
      walk(child, key);
    } else {
      hosts.push(node);
      walk(node.props?.children, location + '.children');
    }
  }
  function render(Component, props) {
    visited = new Set();
    hosts.length = 0;
    walk(jsx(Component, props), 'root');
    // Commit-phase unmount: an old keyed ReviewStep must run its cleanup,
    // even though its in-flight async closure still holds the old account.
    for (const [key, fiber] of fibers) if (!visited.has(key)) {
      for (const effect of fiber.effects.values()) effect.cleanup?.();
      fibers.delete(key);
    }
    return hosts.slice();
  }
  async function flush() {
    while (effects.length) effects.shift()();
    for (let i = 0; i < 12; i++) await Promise.resolve();
  }
  async function settled(Component, props) {
    for (let i = 0; i < 6; i++) { render(Component, props); await flush(); }
    return render(Component, props);
  }
  function unmount() {
    for (const f of fibers.values()) for (const e of f.effects.values()) e.cleanup?.();
    fibers.clear(); effects.length = 0;
  }
  return { react, render, settled, flush, unmount };
}

function createMarketplace() {
  const scheduler = createScheduler();
  const env = { user: { id: 1001, role: 'OWNER' }, params: {}, screen: 'review' };
  const storage = new Map(), calls = [], nav = [], fetchQueue = new Map(), responses = new Map();
  const writeBarriers = [], readBarriers = [], photoQueue = [];
  const store = {
    async getItem(key) { const value = storage.get(key) ?? null; const gate = readBarriers.shift(); if (gate) await gate.promise; return value; },
    async setItem(key, value) { const gate = writeBarriers.shift(); if (gate) await gate.promise; storage.set(key, value); },
    async removeItem(key) { storage.delete(key); },
  };
  const utils = load('frontend_mobile/features/parity/utils.ts', {});
  const draftModule = load('frontend_mobile/features/parity/marketplaceDraft.ts', {
    '@react-native-async-storage/async-storage': { __esModule: true, default: store },
    './utils': utils,
  });
  const model = load('frontend_mobile/features/parity/marketplaceBrowseModel.ts', {});
  const policy = load('shared-core/src/policy/marketplacePolicy.ts', {});
  function queue(method, next) {
    if (!responses.has(method)) responses.set(method, []);
    responses.get(method).push(next);
  }
  async function take(method, defaultValue) {
    const pending = responses.get(method);
    if (!pending?.length) return defaultValue;
    const value = pending.shift();
    if (value && value.promise) return value.promise;
    if (value instanceof Error) throw value;
    return value;
  }
  const api = {
    lookupCatalogue: async query => { calls.push({ step: 'lookup', owner: env.user?.id, query }); return take('lookup', { results: [] }); },
    getListingOptions: async () => ({
      can_trade_personally: true, can_trade_for_pharmacy: true, blockers: [],
      eligible_pharmacies: [{ id: 11, label: 'Tom A' }],
      role_code: env.user?.role || '', personal_categories: [], pharmacy_categories: [],
      role_guidance: [], seller_policy_version: 'v1',
    }),
    createListing: async body => {
      calls.push({ step: 'create', owner: env.user?.id, body });
      return take('create', { id: 'a1111111-1111-4111-8111-111111111111', version: 1 });
    },
    updateListing: async (id, body) => {
      calls.push({ step: 'update', owner: env.user?.id, id, body });
      return take('update', { id, version: body.expected_version + 1 });
    },
    updateAudience: async (id, body) => {
      calls.push({ step: 'audience', owner: env.user?.id, id, body });
      return take('audience', { version: body.expected_version + 1 });
    },
    uploadImage: async (id, body) => {
      calls.push({ step: 'upload', owner: env.user?.id, id, form: body });
      return take('upload', { id: 17, moderation_status: 'PENDING' });
    },
    actOnListing: async (id, action, version) => {
      calls.push({ step: 'submit', owner: env.user?.id, id, action, version });
      return take('submit', { publication_status: 'PENDING_REVIEW', version: version + 1 });
    },
  };
  const widgets = Object.fromEntries(
    ['ActionButtons', 'ChoiceChips', 'DataRow', 'EmptyState', 'Field', 'InfoNote',
      'MetricGrid', 'ParityPage', 'Section'].map(name => [name, name]));
  widgets.palette = { muted: '#444' };
  const router = {
    replace: destination => nav.push(['replace', destination, env.user?.id]),
    push: destination => nav.push(['push', destination, env.user?.id]),
  };
  const mockedFetch = async uri => {
    calls.push({ step: 'local-fetch', owner: env.user?.id, uri });
    const queue = fetchQueue.get(uri) || [];
    if (!queue.length) return { blob: async () => new Blob(['real-bytes'], { type: 'image/jpeg' }) };
    const response = queue.shift();
    if (response && response.promise) return response.promise;
    if (response instanceof Error) throw response;
    return response;
  };
  function queueLocal(uri, response) {
    if (!fetchQueue.has(uri)) fetchQueue.set(uri, []);
    fetchQueue.get(uri).push(response);
  }
  const module = load('frontend_mobile/features/parity/marketplace.tsx', {
    react: scheduler.react, 'react/jsx-runtime': { jsx, jsxs: jsx },
    'react-native': { Image: 'Image', View: 'View' },
    'react-native-paper': { Button: 'Button',
      Card: { Content: 'CardContent', Actions: 'CardActions' },
      Chip: 'Chip', IconButton: 'IconButton', Searchbar: 'Searchbar', Text: 'Text' },
    '@/components/security/GuardedModal': {
      GuardedDatePickerInput: 'DatePicker', GuardedTimePickerModal: 'TimePicker',
    },
    'expo-router': { useLocalSearchParams: () => env.params, useRouter: () => router },
    'expo-image-picker': { launchImageLibraryAsync: async () => {
      calls.push({ step: 'photo-picker', owner: env.user?.id });
      const pending = photoQueue.shift();
      return pending?.promise ? pending.promise : pending || { canceled: true };
    } },
    '@/config/api': { chemistTaskerApi: { marketplace: api } },
    '@/context/AuthContext': { useAuth: () => ({ user: env.user }) },
    '@chemisttasker/shared-core': policy,
    './ParityUI': widgets,
    './utils': utils,
    './marketplaceDraft': draftModule,
    './marketplaceBrowseModel': model,
    './MarketplaceAccessResolution': { MarketplaceAccessResolution: 'MarketplaceAccessResolution' },
  }, { fetch: mockedFetch });
  async function render() { return scheduler.settled(module.MarketplaceParityScreen, { screen: env.screen }); }
  const currentNodes = () => scheduler.render(module.MarketplaceParityScreen, { screen: env.screen });
  function button(label) {
    const nodes = currentNodes();
    const match = nodes.find(node => node.type === 'Button' &&
      String(node.props.children ?? '').trim() === label);
    assert.ok(match, 'Missing real ReviewStep action ' + label);
    assert.notEqual(match.props.disabled, true, 'disabled action: ' + label);
    return match;
  }
  function click(label) { button(label).props.onPress(); }
  function clickSameRender(label, count = 2) {
    const action = button(label).props.onPress;
    for (let i = 0; i < count; i++) action();
  }
  async function setDraft(scope, patch) {
    const value = { ...draftModule.emptyMarketplaceDraft(),
      seller_context: 'PERSONAL', pharmacy: null, category: 7,
      category_name: 'Books', mode: 'SELL', title: 'Used textbook',
      description: 'Clean condition book', condition: 'GOOD', quantity: 1,
      unit: 'item', amount: '45.00', desired_swap: '', suburb: 'Brisbane', state: 'QLD',
      postcode: '4000', allowed_buyer_roles: ['PHARMACIST'],
      image_uris: ['file:///photo-1'], uploaded_image_uris: [], ...patch,
    };
    await draftModule.saveMarketplaceDraft(String(scope), value);
    return value;
  }
  async function getDraft(scope) { return draftModule.loadMarketplaceDraft(String(scope)); }
  const callsOf = step => calls.filter(call => call.step === step);
  const pauseNextWrite = () => { const gate = deferred(); writeBarriers.push(gate); return gate; };
  const pauseNextRead = () => { const gate = deferred(); readBarriers.push(gate); return gate; };
  const queuePhoto = next => photoQueue.push(next);
  return { scheduler, env, storage, calls, nav, queue, queueLocal, pauseNextWrite, api,
    render, currentNodes, button, click, clickSameRender, setDraft, getDraft, callsOf, deferred, queuePhoto,
    pauseNextRead, draftModule,
    unmount: scheduler.unmount, flush: scheduler.flush };
}
module.exports = { createMarketplace, deferred };
