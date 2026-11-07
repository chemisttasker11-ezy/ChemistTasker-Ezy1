// M4-03 shared execution harness; not itself a test. Loads COMPLETE production TSX.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('../node_modules/typescript');
const root = path.resolve(__dirname, '..');
const jsx = (type, props, key) => ({ type, props: props || {}, key });

function load(relative, modules) {
  const filename = path.join(root, relative);
  const src = fs.readFileSync(filename, 'utf8');
  const transpiled = ts.transpileModule(src, { fileName: filename,
    compilerOptions: { module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(transpiled, {
    exports: module.exports, module, Date, URL, URLSearchParams, console,
    setTimeout, clearTimeout,
    require(name) {
      if (!(name in modules)) throw Error('Unmocked dependency ' + name + ' from ' + relative);
      return modules[name];
    },
  }, { filename });
  return module.exports;
}
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};

function createHookScheduler() {
  const fibers = new Map(), afterRender = [];
  let active = null, hookIndex = 0, focused = false;
  const same = (a, b) => !!a && !!b && a.length === b.length && a.every((value, i) => value === b[i]);
  const react = {
    useState(initial) {
      const idx = hookIndex++, slots = active.slots;
      if (!(idx in slots)) slots[idx] = { value: typeof initial === 'function' ? initial() : initial };
      return [slots[idx].value, update => {
        slots[idx].value = typeof update === 'function' ? update(slots[idx].value) : update;
      }];
    },
    useRef(initial) {
      const idx = hookIndex++, slots = active.slots;
      if (!(idx in slots)) slots[idx] = { current: initial };
      return slots[idx];
    },
    useMemo(fn, deps) {
      const idx = hookIndex++, slots = active.slots;
      if (!(idx in slots) || !same(slots[idx].deps, deps)) slots[idx] = { deps, value: fn() };
      return slots[idx].value;
    },
    useCallback(fn, deps) {
      const idx = hookIndex++, slots = active.slots;
      if (!(idx in slots) || !same(slots[idx].deps, deps)) slots[idx] = { deps, value: fn };
      return slots[idx].value;
    },
    useEffect(effect, deps) {
      const idx = hookIndex++, fiber = active, old = fiber.effects.get(idx);
      if (!old || !same(old.deps, deps)) afterRender.push(() => {
        old?.cleanup?.();
        fiber.effects.set(idx, { deps, cleanup: effect() });
      });
    },
  };
  react.default = react;
  function useFocusEffect(callback) {
    const fiber = active;
    if (fiber.focusCallback !== callback) {
      fiber.focusCleanup?.();
      fiber.focusActive = false;
      fiber.focusCallback = callback;
      if (focused) afterRender.push(() => {
        if (!fiber.focusActive && fiber.focusCallback === callback) {
          fiber.focusCleanup = callback() || null;
          fiber.focusActive = true;
        }
      });
    }
  }
  const free = fiber => {
    fiber.focusCleanup?.();
    fiber.focusActive = false;
    for (const value of fiber.effects.values()) value.cleanup?.();
  };
  const nodes = [];
  let visited;
  function walk(node, location) {
    if (Array.isArray(node)) { node.forEach((entry, i) => walk(entry, location + '.' + i)); return; }
    if (!node || typeof node !== 'object') return;
    if (typeof node.type === 'function') {
      const id = location + '/' + String(node.key ?? '') + ':' + (node.type.displayName || node.type.name);
      let fiber = fibers.get(id);
      if (!fiber) { fiber = { slots: [], effects: new Map(), focusCallback: null, focusActive: false }; fibers.set(id, fiber); }
      visited.add(id);
      const saved = active, cursor = hookIndex;
      active = fiber; hookIndex = 0;
      const child = node.type(node.props);
      active = saved; hookIndex = cursor;
      walk(child, id);
    } else {
      nodes.push(node);
      walk(node.props?.children, location + '.children');
      walk(node.props?.ListHeaderComponent, location + '.header');
      walk(node.props?.ListFooterComponent, location + '.footer');
      walk(node.props?.ListEmptyComponent, location + '.empty');
      walk(node.props?.refreshControl, location + '.refresh');
    }
  }
  function render(component) {
    visited = new Set();
    nodes.length = 0;
    walk(jsx(component, {}), 'root');
    for (const [name, fiber] of fibers) if (!visited.has(name)) { free(fiber); fibers.delete(name); }
    return nodes.slice();
  }
  async function flush() {
    while (afterRender.length) afterRender.shift()();
    for (let i = 0; i < 8; i++) await Promise.resolve();
  }
  async function settle(component) {
    for (let i = 0; i < 5; i++) { render(component); await flush(); }
    return render(component);
  }
  function focus() {
    focused = true;
    for (const fiber of fibers.values()) if (fiber.focusCallback && !fiber.focusActive) {
      fiber.focusCleanup = fiber.focusCallback() || null;
      fiber.focusActive = true;
    }
  }
  function blur() {
    focused = false;
    for (const fiber of fibers.values()) {
      if (fiber.focusActive) fiber.focusCleanup?.();
      fiber.focusActive = false;
      fiber.focusCleanup = null;
    }
  }
  function unmount() {
    blur();
    for (const fiber of fibers.values()) free(fiber);
    fibers.clear();
  }
  return { react, useFocusEffect, render, settle, flush, focus, blur, unmount };
}

const text = node => typeof node === 'string' || typeof node === 'number' ? String(node)
  : Array.isArray(node) ? node.map(text).join(' ')
  : node && typeof node === 'object' ? text(node.props?.children) : '';

function createInbox() {
  const engine = createHookScheduler();
  const scope = { user: { id: 1001, role: 'PHARMACIST' }, pathname: '/pharmacist/notifications' };
  const events = [], routes = [], calls = [], pages = new Map(), marks = [];
  const waitFor = (page, outcome) => {
    const queue = pages.get(page) || [];
    queue.push(outcome);
    pages.set(page, queue);
  };
  const waitForMark = outcome => { marks.push(outcome); };
  const network = {
    getNotifications: async page => {
      calls.push(['GET', page, scope.user?.id ?? null]);
      const queue = pages.get(page) || [];
      if (!queue.length) throw Error('No queued page ' + page);
      const item = queue.shift();
      return item && 'promise' in item ? item.promise :
        item instanceof Error ? Promise.reject(item) : item;
    },
    markNotificationsAsRead: async ids => {
      calls.push(['POST', ids.slice(), scope.user?.id ?? null]);
      if (!ids.length) throw Error('Empty IDs could mark all server notifications');
      if (!marks.length) return { marked: ids.length, unread: 0 };
      const item = marks.shift();
      return item && 'promise' in item ? item.promise :
        item instanceof Error ? Promise.reject(item) : item;
    },
  };
  const surface = load('roles/shared/shifts/shiftSurface.ts', {});
  const navigation = load('utils/notificationNavigation.ts', {
    '@/roles/shared/shifts/shiftSurface': surface,
  });
  const chat = load('utils/chatRoutes.ts', {});
  const eventsModule = load('features/notifications/events.ts', {});
  const tokens = {
    colors: { pageBg: '#fff', primary: '#5511aa', textPrimary: '#000',
      textSecondary: '#333', surfaceBg: '#fff', status: { red: { bg: '#fee', fg: '#a00', solid: '#a00' } },
      tone: { violet: { bg: '#eee' } } },
    font: { inter: { semiBold: '' }, outfit: { medium: '' } },
    radius: { card: 12 }, space: { sm: 4, md: 8, lg: 16 }, touch: { min: 44 },
  };
  const screen = load('features/notifications/NotificationsScreen.tsx', {
    react: engine.react, 'react/jsx-runtime': { jsx, jsxs: jsx },
    'react-native': {
      View: 'View', FlatList: 'FlatList', Pressable: 'Pressable',
      RefreshControl: 'RefreshControl', DeviceEventEmitter: {
        emit: (name, ...args) => events.push([name, ...args]),
      }, StyleSheet: { create: value => value },
    },
    'react-native-paper': { Text: 'Text', Surface: 'Surface', Icon: 'Icon',
      IconButton: 'IconButton', Badge: 'Badge', Button: 'Button' },
    '@/components/ui/BrandActivityIndicator': { BrandActivityIndicator: 'Spinner' },
    'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView' },
    '@chemisttasker/shared-core': network,
    'expo-router': { useFocusEffect: engine.useFocusEffect,
      usePathname: () => scope.pathname,
      useRouter: () => ({ push: value => routes.push(value) }) },
    '@/context/AuthContext': { useAuth: () => ({ user: scope.user }) },
    '@/context/AdminWorkspaceContext': { useAdminCan: () => () => false },
    '@/utils/notificationNavigation': navigation,
    '@/utils/chatRoutes': chat,
    '@/roles/shared/shifts/shiftSurface': surface,
    './events': eventsModule,
    '@/constants/tokens': tokens,
  });
  const component = screen.default;
  const rows = nodes => {
    const list = nodes.find(node => node.type === 'FlatList');
    return list?.props.data || [];
  };
  async function settle() { return engine.settle(component); }
  const list = () => engine.render(component).find(node => node.type === 'FlatList');
  async function focus() {
    await settle(); engine.focus();
    await engine.flush(); return settle();
  }
  async function refocus() { engine.blur(); return focus(); }
  function itemNodes(id) {
    const node = list();
    assert.ok(node, 'expected actual FlatList');
    const row = node.props.data.find(n => n.id === id);
    assert.ok(row, 'missing notification ' + id);
    const renderItem = node.props.renderItem({ item: row });
    const output = [];
    const collect = object => {
      if (Array.isArray(object)) object.forEach(collect);
      else if (object && typeof object === 'object') {
        output.push(object); collect(object.props?.children);
      }
    };
    collect(renderItem);
    return output;
  }
  async function press(id, viaCheck = false) {
    const nodes = itemNodes(id);
    const target = nodes.find(node => viaCheck ?
      node.type === 'IconButton' && node.props.accessibilityLabel === 'Mark notification as read' :
      node.type === 'Pressable');
    assert.ok(target, 'notification action not rendered');
    // Intentionally do not await an in-flight network mutation. Tests control
    // its deferred resolution across blur/account transitions.
    target.props.onPress();
    await engine.flush();
    return settle();
  }
  async function refresh() {
    const control = list()?.props.refreshControl;
    assert.ok(control?.props.onRefresh, 'refresh control missing');
    control.props.onRefresh(); await engine.flush();
    return settle();
  }
  async function loadOlder() {
    const control = list(); assert.ok(control?.props.onEndReached);
    control.props.onEndReached(); await engine.flush();
    return settle();
  }
  // Assert the actual rendered header and footer, not hidden error state.
  const readError = nodes => {
    const list = nodes.find(n => n.type === 'FlatList');
    return [list?.props?.ListHeaderComponent, list?.props?.ListFooterComponent]
      .map(text).join(' ');
  };
  return { scope, calls, events, routes, waitFor, waitForMark, rows, list,
    settle, focus, refocus, blur: engine.blur, flush: engine.flush,
    press, refresh, loadOlder, readError, text, engine, deferred, unmount: engine.unmount };
}
module.exports = { createInbox, deferred, createHookScheduler, load, jsx };
