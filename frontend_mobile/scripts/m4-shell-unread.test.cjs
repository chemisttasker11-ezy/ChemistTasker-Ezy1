// M4-03: executes the real useShellChrome hook under mutable auth/focus/event sources.
const test = require('node:test');
const assert = require('node:assert/strict');
const { createHookScheduler, load, jsx, deferred } = require('./m4-notification-harness.cjs');

function shellHarness() {
  const engine = createHookScheduler();
  const scope = { user: { id: 101, role: 'PHARMACIST' }, pathname: '/pharmacist/dashboard' };
  const requests = [], responses = [], listeners = [];
  const network = { getNotifications: async () => {
    requests.push(scope.user?.id);
    if (!responses.length) throw Error('Unqueued header count request');
    const reply = responses.shift();
    if (reply && reply.promise) return reply.promise;
    if (reply instanceof Error) throw reply;
    return reply;
  }};
  const events = { addListener(name, callback) {
    const sub = { kind: name, callback, active: true, remove() { this.active = false; } };
    listeners.push(sub); return sub;
  }};
  const nativePush = { addNotificationReceivedListener(callback) {
    const sub = { kind: 'push', callback, active: true, remove() { this.active = false; } };
    listeners.push(sub); return sub;
  }};
  const mod = load('components/shell/useShellChrome.ts', {
    react: engine.react,
    'react-native': { DeviceEventEmitter: events },
    'expo-notifications': nativePush,
    'expo-router': { useFocusEffect: engine.useFocusEffect, usePathname: () => scope.pathname },
    '@chemisttasker/shared-core': network,
    '@/context/AuthContext': { useAuth: () => ({ user: scope.user, isLoading: false }) },
    '@/features/notifications/events': { NOTIFICATIONS_READ_EVENT: 'ct-notifications-read' },
  });
  function Hook() {
    const badge = mod.useShellChrome('/pharmacist/notifications', () => {});
    return jsx('Badge', { count: badge.unreadCount, photo: badge.photoUrl });
  }
  async function render() { return engine.settle(Hook); }
  const count = nodes => nodes.find(node => node.type === 'Badge')?.props.count;
  const fire = name => {
    for (const l of listeners) if (l.kind === name && l.active) l.callback();
  };
  return { scope, engine, responses, requests, listeners, render, count, fire, deferred };
}

test('R: old-account unread request cannot reappear in new account after auth switch', async () => {
  const app = shellHarness(), slow = deferred(), fresh = deferred();
  app.responses.push(slow);
  await app.render();
  app.scope.user = { id: 202, role: 'EXPLORER' };
  app.responses.push(fresh);
  let nodes = await app.render();
  assert.equal(app.count(nodes), 0, 'badge hides old account synchronously');
  assert.ok(app.requests.includes(202), 'new auth identity triggers its own count load');
  slow.resolve({ results: [
    { id: 1, read_at: null }, { id: 2, read_at: null }, { id: 3, read_at: null },
  ] });
  await app.engine.flush();
  nodes = await app.render();
  assert.equal(app.count(nodes), 0, 'old account response must not update current count');
  fresh.resolve({ results: [{ id: 2021, read_at: null }] });
  await app.engine.flush();
  nodes = await app.render();
  assert.equal(app.count(nodes), 1);
  app.engine.unmount();
});

test('C: read event reloads current account only and unmount removes event listeners', async () => {
  const app = shellHarness();
  app.responses.push({ results: [{ id: 1, read_at: null }] });
  let nodes = await app.render();
  assert.equal(app.count(nodes), 1);
  app.responses.push({ results: [] });
  app.fire('ct-notifications-read');
  await app.engine.flush();
  nodes = await app.render();
  assert.equal(app.count(nodes), 0);
  app.engine.unmount();
  assert.ok(app.listeners.every(l => !l.active), 'event listeners must be removed on cleanup');
});

test('R: merely navigating to inbox cannot clear a badge before a successful read receipt', async () => {
  const app = shellHarness();
  app.responses.push({ results: [{ id: 44, read_at: null }, { id: 45, read_at: null }] });
  let nodes = await app.render();
  assert.equal(app.count(nodes), 2);
  // The inbox may be offline and emit no receipt; opening it is not a read.
  app.scope.pathname = '/pharmacist/notifications';
  nodes = await app.render();
  assert.equal(app.count(nodes), 2, 'navigation alone is not a successful receipt');
  // A current successful receipt emits the production event; the shell reloads.
  app.responses.push({ results: [{ id: 44, read_at: '2026-11-07T03:00:00Z' },
    { id: 45, read_at: '2026-11-07T03:00:00Z' }] });
  app.fire('ct-notifications-read');
  await app.engine.flush();
  nodes = await app.render();
  assert.equal(app.count(nodes), 0, 'confirmed read receipt refreshes the current badge');
  app.engine.unmount();
});
