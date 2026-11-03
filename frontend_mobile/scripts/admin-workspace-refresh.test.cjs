const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

function load(file, modules) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(path.resolve(__dirname, file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020,
      jsx: ts.JsxEmit.React, esModuleInterop: true },
  }).outputText;
  vm.runInNewContext(code, { exports, console, require: (id) => {
    if (!(id in modules)) throw new Error(`Unexpected import ${id}`);
    return modules[id];
  }});
  return exports;
}

const assignments = [
  { id: 11, pharmacy_id: 501, pharmacy_name: 'Pharmacy A', admin_level: 'FULL' },
  { id: 22, pharmacy_id: 502, pharmacy_name: 'Pharmacy B', admin_level: 'FULL' },
];
const originalUser = { id: 7, role: 'PHARMACIST', first_name: 'Native', admin_assignments: assignments };

function mount(initialUser = originalUser) {
  let user = initialUser, cursor = 0, context;
  const hooks = [], pending = [], storage = new Map([['ct-active-persona:7', 'ADMIN:22']]);
  const writes = [];
  let workspaceUser, workspaceValue, pausedRead, releaseRead, pausedReload, releaseReload;
  let selectedPharmacyId = null;
  function getWorkspace() {
    if (workspaceUser !== user) {
      workspaceUser = user;
      workspaceValue = { reloadWorkspace: async () => {
        if (pausedReload) {
          pausedReload = false;
          await new Promise((resolve) => { releaseReload = resolve; });
        }
      }, setSelectedPharmacyId: async (id) => { selectedPharmacyId = id; },
        setSelectedPharmacyName: async () => {} };
    }
    return workspaceValue;
  }
  const asyncStorage = {
    getItem: async (key) => {
      const value = storage.get(key) ?? null;
      if (pausedRead) {
        pausedRead = false;
        await new Promise((resolve) => { releaseRead = resolve; });
      }
      return value;
    },
    setItem: async (key, value) => { writes.push([key, value]); storage.set(key, value); },
  };
  const persona = load('../utils/mobilePersona.ts', {
    '@react-native-async-storage/async-storage': asyncStorage,
    '@chemisttasker/shared-core': {
      getAdminPersonaAssignments: (value) => value?.admin_assignments ?? [],
      resolveAdminPersonaAssignmentId: (value) => value?.admin_assignments?.[0]?.id ?? null,
      resolvePersonaSelection: (_, stored) => stored?.startsWith('ADMIN:')
        ? { mode: 'admin', assignmentId: Number(stored.slice(6)) } : { mode: 'staff' },
      hasOrganizationAccess: () => false,
    },
  });
  const changed = (old, deps) => !old || deps.some((value, index) => !Object.is(value, old.deps[index]));
  const react = {
    createContext: () => ({ Provider: Symbol('Provider') }),
    createElement: (_, props) => { context = props.value; return null; },
    useState: (initial) => {
      const index = cursor++;
      hooks[index] ??= { value: initial };
      return [hooks[index].value, (value) => { hooks[index].value = value; }];
    },
    useRef: (initial) => {
      const index = cursor++;
      hooks[index] ??= { value: { current: initial } };
      return hooks[index].value;
    },
    useMemo: (calculate, deps) => {
      const index = cursor++;
      if (changed(hooks[index], deps)) hooks[index] = { deps, value: calculate() };
      return hooks[index].value;
    },
    useCallback: (fn, deps) => react.useMemo(() => fn, deps),
    useEffect: (effect, deps) => {
      const index = cursor++;
      if (changed(hooks[index], deps)) {
        const prior = hooks[index];
        hooks[index] = { deps };
        pending.push(() => { prior?.cleanup?.(); hooks[index].cleanup = effect(); });
      }
    },
  };
  const { AdminWorkspaceProvider } = load('../context/AdminWorkspaceContext.tsx', {
    react, './AuthContext': { useAuth: () => ({ user }) },
    './WorkspaceContext': { useWorkspace: getWorkspace },
    '@/utils/mobilePersona': persona,
  });
  return {
    storage, writes, persona,
    pauseNextRead() { pausedRead = true; },
    releaseRead() { releaseRead?.(); },
    pauseNextReload() { pausedReload = true; },
    releaseReload() { releaseReload?.(); },
    get selectedPharmacyId() { return selectedPharmacyId; },
    render(nextUser = user) {
      user = nextUser; cursor = 0;
      AdminWorkspaceProvider({ children: null });
      pending.splice(0).forEach((effect) => effect());
      return context;
    },
    async settle() { await new Promise(setImmediate); return this.render(); },
  };
}

test('profile refresh cannot overwrite a role choice made while leaving Admin', async () => {
  const app = mount();
  app.render();
  assert.equal((await app.settle()).activePharmacyId, 502);
  await app.persona.selectRolePersona(originalUser);
  const writesBeforeRefresh = app.writes.length;
  app.render({ ...originalUser, first_name: 'Fresh profile' });
  const current = await app.settle();
  assert.equal(app.storage.get('ct-active-persona:7'), 'ROLE:PHARMACIST');
  assert.equal(app.writes.length, writesBeforeRefresh, 'Unchanged authority must not reselect Admin');
  assert.equal(current.isLoading, false);
});

test('revoked assignment is revalidated and the remaining pharmacy is selected', async () => {
  const app = mount();
  app.render();
  await app.settle();
  app.render({ ...originalUser, admin_assignments: [assignments[0]] });
  const current = await app.settle();
  assert.equal(current.activePharmacyId, 501);
  assert.equal(app.storage.get('ct-active-persona:7'), 'ADMIN:11');
});

test('a different user is hydrated using that users own saved selection', async () => {
  const app = mount();
  app.render();
  await app.settle();
  app.storage.set('ct-active-persona:8', 'ADMIN:11');
  app.render({ ...originalUser, id: 8 });
  const current = await app.settle();
  assert.equal(current.activePharmacyId, 501);
  assert.equal(app.storage.get('ct-active-persona:7'), 'ADMIN:22');
  assert.equal(app.storage.get('ct-active-persona:8'), 'ADMIN:11');
});


test('returning to a hydrated scope cancels a pending authority refresh without leaving loading stuck', async () => {
  const app = mount();
  app.render();
  await app.settle();
  app.pauseNextRead();
  app.render({ ...originalUser, admin_assignments: [assignments[1]] });
  app.render(originalUser);
  app.releaseRead();
  const current = await app.settle();
  assert.equal(current.isLoading, false);
  assert.equal(current.activePharmacyId, 502);
});

test('an authority change while returning to the role cannot default back to Admin', async () => {
  const app = mount();
  app.render();
  await app.settle();
  await app.persona.selectRolePersona(originalUser);
  const before = app.writes.length;
  app.render({ ...originalUser, admin_assignments: [assignments[1]] });
  const current = await app.settle();
  assert.equal(app.storage.get('ct-active-persona:7'), 'ROLE:PHARMACIST');
  assert.equal(app.writes.length, before);
  assert.equal(current.isLoading, false);
});


test('returning scope rehydrates after a cancelled refresh already changed its selection', async () => {
  const app = mount();
  app.render();
  await app.settle();
  app.pauseNextReload();
  app.render({ ...originalUser, admin_assignments: [assignments[0]] });
  await new Promise(setImmediate);
  assert.equal(app.storage.get('ct-active-persona:7'), 'ADMIN:11');
  assert.equal(app.selectedPharmacyId, 502);
  app.render(originalUser);
  app.releaseReload();
  const current = await app.settle();
  assert.equal(current.activePharmacyId, 501);
  assert.equal(app.selectedPharmacyId, current.activePharmacyId);
  assert.equal(current.isLoading, false);
});
