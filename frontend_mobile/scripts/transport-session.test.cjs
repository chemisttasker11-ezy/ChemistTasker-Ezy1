const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const flush = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };

for (const stale of [true, false]) {
  const session = stale ? 'switched session' : 'same session';
  test(`worker public feed: ${session} ${stale ? 'sends no next page' : 'loads the next page'}`, async () => {
    let generation = 7;
    const gate = deferred(), requests = [], displayed = [];
    const load = closure('app/share/worker.tsx', 'ShareWorkerQr', 'load', {
      useCallback: fn => fn, getSessionGeneration: () => generation, requestRef: { current: 0 }, userId: 4,
      setLoading() {}, setError() {}, setPost: post => { if (post) displayed.push(post.id); },
      nextPageUrl: url => url ? 2 : null,
      getPublicTalentFeed: async ({ page }) => {
        requests.push({ page, generation });
        if (page === 1) await gate.promise;
        return { results: page === 1 ? [] : [{ id: 9, author_user_id: 4, reference_code: 'public-card' }],
          next: page === 1 ? '?page=2' : null };
      },
    });
    const pending = load();
    assert.equal(requests.length, 1);
    if (stale) generation++;
    gate.resolve();
    await pending;
    assert.deepEqual(requests, (stale ? [1] : [1, 2]).map(page => ({ page, generation: 7 })),
      'public-feed continuation must use the captured session');
    if (!stale) assert.deepEqual(displayed, [9]);
  });

  test(`hub vote: ${session} ${stale ? 'sends no poll refresh' : 'refreshes all loaded poll pages'}`, async () => {
    let sessionGeneration = 7;
    const gate = deferred(), votes = [], requests = [], displayed = [];
    const vote = closure('app/explore/hubs/[hub].tsx', 'PublicHubFeedView', 'vote', {
      getSessionGeneration: () => sessionGeneration, generation: { current: 0 }, user: { id: 4 }, busy: false,
      hub: 'public-hub', pollPagesRef: { current: 2 }, setBusy() {}, setActionError() {}, setPollNext() {},
      nextPage: () => null, setPolls: rows => displayed.push(...rows.map(row => row.id)),
      chemistTaskerApi: { publicContent: {
        voteCommunityPoll: async (...args) => { votes.push(args); await gate.promise; },
        listCommunityPolls: async (hub, { page }) => {
          requests.push({ page, generation: sessionGeneration });
          return { results: [{ id: page }], next: null };
        },
      } },
    });
    const pending = vote({ id: 12, can_interact: true, is_closed: false }, 3);
    assert.deepEqual(votes, [[12, 3]]);
    // The auth session changes before React unmount cleanup updates the local ref.
    if (stale) sessionGeneration++;
    gate.resolve();
    await pending;
    assert.deepEqual(requests, (stale ? [] : [1, 2]).map(page => ({ page, generation: 7 })),
      'completed vote must not refresh polls in a new session');
    if (!stale) assert.deepEqual(displayed, [1, 2]);
  });

  for (const component of ['NewChatModal', 'NewGroupModal', 'GroupManageModal']) {
    test(`${component} search: ${session} ${stale ? 'sends no delayed search' : 'searches and displays results'}`, async () => {
      let generation = 7, timer;
      const requests = [], displayed = [];
      const file = `roles/shared/chat/${component}.tsx`;
      const source = ts.createSourceFile(file, fs.readFileSync(path.join(root, file), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
      let effect;
      function find(node) {
        if (ts.isCallExpression(node) && node.expression.getText(source) === 'useEffect' &&
          node.arguments[0].getText(source).includes('setTimeout')) effect = node.arguments[0];
        ts.forEachChild(node, find);
      }
      find(source);
      assert.ok(effect, 'delayed search effect exists');
      const runEffect = evaluate(`(${effect.getText(source)})`, {
        getSessionGeneration: () => generation, query: 'Alex', setLoading() {}, setError() {},
        setResults: rows => displayed.push(...rows.map(row => row.id)),
        setTimeout: (callback, delay) => { assert.equal(delay, 250); timer = callback; return 1; }, clearTimeout() {},
        searchParticipants: async query => { requests.push({ query, generation }); return [{ id: 9 }]; },
      });
      const cleanup = runEffect();
      assert.equal(typeof timer, 'function');
      assert.equal(requests.length, 0);
      // Fire before effect cleanup: cancellation alone cannot guard this window.
      if (stale) generation++;
      await timer();
      assert.deepEqual(requests, stale ? [] : [{ query: 'Alex', generation: 7 }],
        'delayed participant search must use the captured session');
      assert.deepEqual(displayed, stale ? [] : [9]);
      cleanup();
    });
  }
}

// Execute production closures with only their React state/native/network boundaries supplied.
function closure(file, component, name, globals) {
  const source = ts.createSourceFile(file, fs.readFileSync(path.join(root, file), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let owner, target;
  function find(node) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === component) owner = node;
    ts.forEachChild(node, find);
  }
  find(source);
  assert.ok(owner, component);
  function locate(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(source) === name) target = node.initializer;
    ts.forEachChild(node, locate);
  }
  locate(owner);
  assert.ok(target, name);
  return evaluate(`(${target.getText(source)})`, globals);
}
function evaluate(code, globals) {
  const output = ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.None } }).outputText;
  return vm.runInNewContext(output, { console, Promise, Date, FormData, Blob, ...globals });
}

function pagination(generation) {
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(path.join(root, '../shared-core/src/utils/serialization.ts'), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports,
    require: () => ({ getSessionGeneration: generation }) });
  return module.exports.fetchAllPages;
}

for (const kind of ['claims', 'legacy invoices', 'public comments']) {
  test(`${kind}: delayed page stops at the old session; same-session pages remain complete`, async () => {
    for (const stale of [false, true]) {
      let generation = 7;
      const gate = deferred(), requests = [], errors = [], displayed = [];
      const request = async ({ page }) => {
        requests.push({ page, token: `token-${generation}` });
        if (page === 1) await gate.promise;
        return { results: [{ id: page, organization: 4 }], next: page === 1 ? '?page=2' : null };
      };
      const globals = { fetchAllPages: pagination(() => generation), getInvoices: request, getPharmacyClaims: request,
        useCallback: fn => fn, currentRequest: { current: 0 }, organizationId: 4,
        setLoading() {}, setError: error => { if (error) errors.push(error); },
        setClaims: rows => { if (rows.length) displayed.push(...rows); } };
      let run;
      if (kind === 'claims') {
        run = closure('app/organization/pharmacies/claims.tsx', 'OrganizationPharmacyClaimsScreen', 'load', globals);
      } else if (kind === 'legacy invoices') {
        const source = fs.readFileSync(path.join(root, 'roles/shared/invoices/InvoiceList.tsx'), 'utf8');
        run = evaluate(`(${source.slice(source.indexOf('export async function fetchCompleteLegacyInvoices'), source.indexOf('type Props'))
          .replace('export async function', 'async function')})`, globals);
      } else {
        const module = { exports: {} };
        const code = ts.transpileModule(fs.readFileSync(path.join(root, 'features/explore/discussionModel.ts'), 'utf8'),
          { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
        vm.runInNewContext(code, { module, exports: module.exports, require: () => globals });
        run = async () => (await module.exports.refreshLoadedPublicPages(page => request({ page }), 2)).items;
      }
      const pending = run();
      await flush();
      assert.equal(requests.length, 1);
      if (stale) generation += 2;
      gate.resolve();
      if (kind !== 'claims' && stale) await assert.rejects(pending, /Session changed/);
      else {
        const rows = await pending;
        if (kind !== 'claims') displayed.push(...rows);
        if (stale) assert.match(errors.join(), /Session changed/);
      }
      assert.deepEqual(requests, (stale ? [1] : [1, 2]).map(page => ({ page, token: 'token-7' })));
      assert.deepEqual(displayed.map(row => row.id), stale ? [] : [1, 2]);
    }
  });
}
const post = 'roles/shared/hub/PostComposer.tsx';
for (const platform of ['android', 'web']) for (const editing of [null, { id: 8 }]) {
  test(`hub ${platform} ${editing ? 'edit' : 'create'} drops prepared files on session switch; same session uploads and cleans copies`, async () => {
    for (const stale of [true, false]) {
      let generation = 0;
      const gate = deferred(), deleted = [], sent = [];
      const FileSystem = { cacheDirectory: 'file://cache/', copyAsync: async () => gate.promise,
        File: class { constructor(uri) { this.uri = uri; } delete() { deleted.push(this.uri); } } };
      const globals = { getSessionGeneration: () => generation, FileSystem, Platform: { OS: platform },
        fetch: async () => ({ blob: async () => { await gate.promise; return new Blob(['private']); } }),
        File: class {},
        attachments: [{ uri: platform === 'android' ? 'content://private/photo' : 'blob:private-photo', name: 'evidence.jpg' }], body: 'Private post',
        stableScope: { type: 'pharmacy', id: 2 }, editing, taggedMemberIds: [],
        submission: { start: () => true, finish() {} }, setError() {}, setBody() {}, setAttachments() {}, setTaggedMemberIds() {},
        onSaved() {}, onDismiss() {}, getErrorMessage: e => e.message,
        createHubPost: async (...args) => { sent.push(args); return {}; }, updateHubPost: async (...args) => { sent.push(args); return {}; } };
      globals.normalizeAttachments = closure(post, 'PostComposer', 'normalizeAttachments', globals);
      const save = closure(post, 'PostComposer', 'handleSave', globals);
      const pending = save();
      await flush();
      if (stale) generation += 2;
      gate.resolve();
      await pending;
      assert.equal(sent.length, stale ? 0 : 1);
      assert.equal(deleted.length, platform === 'android' ? 1 : 0, 'prepared cache copy must be deleted');
      if (platform === 'android') assert.match(deleted[0], /^file:\/\/cache\/hub-attach-/);
    }
  });
}

test('hub deletes a discarded picker cache file; same-session failed submission retains the draft file', async () => {
  for (const stale of [true, false]) {
    let generation = 0;
    const gate = deferred(), deleted = [], sent = [];
    const globals = { getSessionGeneration: () => generation, FileSystem: { File: class { constructor(uri) { this.uri = uri; } delete() { deleted.push(this.uri); } } },
      attachments: [{ uri: 'file://cache/picked.pdf' }], body: 'Draft', stableScope: { type: 'pharmacy', id: 2 }, editing: null,
      taggedMemberIds: [], normalizeAttachments: async () => { await gate.promise; return [{ uri: 'file://cache/picked.pdf' }]; },
      submission: { start: () => true, finish() {} }, setError() {}, getErrorMessage: e => e.message,
      createHubPost: async () => { sent.push('upload'); throw new Error('offline'); } };
    const pending = closure(post, 'PostComposer', 'handleSave', globals)();
    if (stale) generation++;
    gate.resolve();
    await pending;
    assert.equal(sent.length, stale ? 0 : 1);
    assert.deepEqual(deleted, stale ? ['file://cache/picked.pdf'] : []);
  }
});

for (const [file, component, handler, kind] of [
  ['features/parity/finance.tsx', 'ExpenseReceipt', 'upload', 'receipt'],
  ['features/parity/ethicalMarketplace.tsx', 'ImportStock', 'pick', 'import'],
  ['features/parity/ethicalMarketplace.tsx', 'TransferDocuments', 'pick', 'transfer'],
]) {
  for (const phase of ['picker', 'blob']) {
    test(`${kind}: session switch during ${phase} drops upload and deletes cache; same session uploads`, async () => {
      for (const stale of [true, false]) {
        let generation = 0;
        const gate = deferred(), sent = [], deleted = [];
        const result = { canceled: false, assets: [{ uri: 'file://cache/evidence', name: 'evidence.csv', fileName: 'receipt.jpg' }] };
        const picker = async () => { if (phase === 'picker') await gate.promise; return result; };
        const upload = async (...args) => { sent.push(args); return { id: 1 }; };
        const globals = { getSessionGeneration: () => generation,
          DocumentPicker: { getDocumentAsync: picker }, ImagePicker: { requestCameraPermissionsAsync: async () => ({ granted: true }), launchCameraAsync: picker },
          File: class { constructor(uri) { this.uri = uri; } delete() { deleted.push(this.uri); } },
          fetch: async () => ({ blob: async () => { if (phase === 'blob') await gate.promise; return new Blob(['private']); } }),
          finance: { uploadReceipt: upload }, api: { uploadImport: upload, uploadTransferDocument: upload },
          expense: { id: 2 }, row: { id: 3 }, pharmacyId: 4, router: { push() {} }, onReload: async () => {},
          setBusy() {}, setError() {}, setLocalError() {}, errorMessage: e => e.message };
        const pending = closure(file, component, handler, globals)();
        await flush();
        if (stale) generation++;
        gate.resolve();
        await pending;
        assert.equal(sent.length, stale ? 0 : 1);
        assert.deepEqual(deleted, ['file://cache/evidence']);
      }
    });
  }
}

test('message fetch from an old session cannot acknowledge reads; same session acknowledges once', async () => {
  for (const stale of [false, true]) {
    let generation = 0, acknowledged = 0;
    const gate = deferred();
    const fetchMessages = closure('roles/pharmacist/messages/[id].tsx', 'PharmacistMessageDetailScreen', 'fetchMessages', {
      useCallback: fn => fn, getSessionGeneration: () => generation, parseRoomId: () => 7,
      getRoomMessages: async () => { await gate.promise; return []; },
      markRoomAsRead: async () => { acknowledged++; }, user: { id: 1 }, setMessages() {}, setLoading() {}, setTimeout() {},
    });
    const pending = fetchMessages();
    if (stale) generation++;
    gate.resolve();
    await pending;
    assert.equal(acknowledged, stale ? 0 : 1);
  }
});

test('queued Axios resend may retry only once even when its refreshed token is rejected', async () => {
  for (const rejectResend of [false, true]) {
    const axios = require('axios');
    const gate = deferred();
    let refreshes = 0;
    const module = { exports: {} };
    const source = fs.readFileSync(path.join(root, 'utils/apiClient.ts'), 'utf8');
    const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
    const imports = {
      axios, 'react-native': { Platform: { OS: 'android' } },
      '@chemisttasker/shared-core': { API_ENDPOINTS: {}, reportAhpraError() {} },
      './authSession': { getSessionGeneration: () => 0, getValidAccessToken: async () => 'token', clearStoredSession: async () => {},
        refreshAccessToken: async () => { refreshes++; await gate.promise; return 'fresh'; } },
      './browserAuth': {}, './apiUrl': { resolveApiBaseUrl: () => 'https://example.test/api/v1' },
    };
    vm.runInNewContext(code, { module, exports: module.exports, console, require: id => imports[id] });
    const client = module.exports.default;
    const attempts = new Map();
    client.defaults.adapter = async config => {
      const count = (attempts.get(config.url) || 0) + 1;
      attempts.set(config.url, count);
      if (count === 1 || (config.url === '/queued/' && rejectResend)) {
        throw new axios.AxiosError('unauthorized', 'ERR_BAD_REQUEST', config, null, { status: 401, data: {}, config, headers: {} });
      }
      return { status: 200, data: {}, config, headers: {} };
    };
    const leader = client.get('/leader/');
    await flush();
    assert.equal(refreshes, 1);
    const queued = client.get('/queued/');
    const results = Promise.allSettled([leader, queued]);
    await flush();
    gate.resolve();
    const outcome = await results;
    assert.equal(outcome[0].status, 'fulfilled');
    assert.equal(outcome[1].status, rejectResend ? 'rejected' : 'fulfilled');
    assert.equal(refreshes, 1);
    assert.equal(attempts.get('/queued/'), 2);
  }
});

for (const kind of ['messages', 'ahpra poll', 'ahpra foreground']) {
  test(`${kind}: scheduled callback uses its original session; same session still refreshes`, async () => {
    for (const stale of [false, true]) {
      let generation = 0, requests = 0, callback;
      const file = kind === 'messages' ? 'roles/pharmacist/messages/[id].tsx' : 'context/AhpraContext.tsx';
      const source = ts.createSourceFile(file, fs.readFileSync(path.join(root, file), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
      let target;
      function find(node) {
        if (ts.isCallExpression(node) &&
          (kind === 'ahpra foreground' ? node.expression.getText(source) === 'AppState.addEventListener' : node.expression.getText(source) === 'setInterval')) {
          if (!target) target = node.arguments[kind === 'ahpra foreground' ? 1 : 0];
        }
        ts.forEachChild(node, find);
      }
      find(source);
      const request = async () => { requests++; };
      callback = evaluate(`(${target.getText(source)})`, { getSessionGeneration: () => generation, sessionGeneration: generation,
        currentSession: () => generation === 0, isCancelled: false, refresh: request, fetchMessages: request,
        generation: { current: 0 }, current: 0, until: Infinity, timer: 1, clearInterval() {} });
      if (stale) generation++;
      callback('active');
      await flush();
      assert.equal(requests, stale ? 0 : 1);
    }
  });
}
