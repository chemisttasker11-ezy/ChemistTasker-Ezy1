import { expect, it, vi } from 'vitest';
import { configureApi } from '../../transport/application';
import { createExplorerPost } from './api';
import { createBrowserPendingPitchStore, createPendingPitchStore, pitchIntentScope, sendPendingPitch } from './pendingPitch';
import { claimUserBrowserStorage, clearUserBrowserStorage } from '../../../../frontend_web/landing_next/shared/browser-session';

const key = '165416cf-c485-4aad-8914-d7580f831843';

it.each([400, 500])('only a pitch POST 400 rejects its captured intent (%s)', async (status) => {
  const store = fixture().open();
  const intent = await store.acquire({ headline: 'Original' }, 'EXPLORER');
  configureApi({ baseURL: 'https://example.test/api/v1', getToken: () => 'token',
    fetchImpl: async () => new Response('{}', { status, headers: { 'content-type': 'application/json' } }) });
  await expect(sendPendingPitch(store, intent, () => true)).rejects.toMatchObject({ status });
  expect(Boolean((await store.read())?.rejected)).toBe(status === 400);
});

it('does not reject an unrelated in-flight intent when another operation returns 400', async () => {
  const store = fixture().open();
  const intent = await store.acquire({ headline: 'Tab B' }, 'EXPLORER');
  let respond!: (response: Response) => void;
  configureApi({ baseURL: 'https://example.test/api/v1', getToken: () => 'token',
    fetchImpl: () => new Promise<Response>((resolve) => { respond = resolve; }) });
  const pending = sendPendingPitch(store, intent, () => true);
  await vi.waitFor(() => expect(respond).toBeDefined());
  const onboarding = Promise.reject({ status: 400 });
  await expect(onboarding).rejects.toMatchObject({ status: 400 });
  expect((await store.read())?.rejected).toBeUndefined();
  await expect(store.resolve(intent.key)).rejects.toThrow();
  respond(new Response('{"id":7}', { status: 201, headers: { 'content-type': 'application/json' } }));
  expect(await pending).toBe(7);
});
function fixture() {
  const records = new Map<string, string>();
  let queue = Promise.resolve();
  const storage = {
    getItem: async (name: string) => records.get(name) ?? null,
    setItem: vi.fn(async (name: string, value: string) => { records.set(name, value); }),
    removeItem: async (name: string) => { records.delete(name); },
  };
  const lock = async <T,>(_name: string, run: () => Promise<T>) => {
    const previous = queue;
    let release!: () => void;
    queue = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    try { return await run(); } finally { release(); }
  };
  const open = (scope = 'account-one') => createPendingPitchStore(storage, lock, scope, () => key);
  return { records, storage, open };
}

it('forwards the same key and body through authentication retry', async () => {
  const requests: RequestInit[] = [];
  configureApi({ baseURL: 'https://example.test/api/v1', getToken: () => 'old', refreshToken: async () => 'new',
    fetchImpl: async (_url, options) => {
      requests.push(options!);
      return new Response(JSON.stringify({ id: 7 }), { status: requests.length === 1 ? 401 : 201, headers: { 'content-type': 'application/json' } });
    } });
  await createExplorerPost({ headline: 'Frozen' }, key);
  expect(requests).toHaveLength(2);
  for (const request of requests) {
    expect(new Headers(request.headers).get('Idempotency-Key')).toBe(key);
    expect(request.body).toBe('{"headline":"Frozen"}');
  }
});

it('serializes double taps and tabs, and resumes the frozen payload after restart/midnight', async () => {
  const { open } = fixture();
  const first = { availability_days: ['2026-11-07'], headline: 'Original' };
  const [one, two] = await Promise.all([open().acquire(first, 'EXPLORER'), open().acquire({ headline: 'Changed tomorrow' }, 'EXPLORER')]);
  expect(one).toEqual(two);
  first.availability_days.length = 0;
  expect((await open().read())?.exactPayload).toEqual({ availability_days: ['2026-11-07'], headline: 'Original' });
});

it('fails closed on failed or corrupt storage', async () => {
  const { records, storage, open } = fixture();
  storage.setItem.mockRejectedValueOnce(new Error('quota'));
  await expect(open().acquire({}, 'EXPLORER')).rejects.toThrow('quota');
  records.set('account-one', '{broken');
  await expect(open().read()).rejects.toThrow('Recover');
  records.set('account-one', JSON.stringify({ key }));
  await expect(open().acquire({}, 'EXPLORER')).rejects.toThrow('Recover');
});

it('persists acknowledgement before reload and never rotates unresolved keys', async () => {
  const { open } = fixture();
  const intent = await open().acquire({ headline: 'Original' }, 'OTHER_STAFF');
  await expect(open().resolve(intent.key)).rejects.toThrow();
  await open().acknowledge(intent.key, 7);
  expect(await open().acquire({ headline: 'New' }, 'OTHER_STAFF')).toMatchObject({ key, resultId: 7 });
  await open().resolve(intent.key);
  expect(await open().read()).toBeNull();
});

it('keeps terminal conflicts for explicit reconciliation, independent of role/account', async () => {
  const { open } = fixture();
  await open().acquire({}, 'EXPLORER');
  await open().reconcile(key, 'PITCH_DELETED', 7);
  expect(await open().read()).toMatchObject({ key, terminalCode: 'PITCH_DELETED', resultId: 7 });
  expect(await open('account-two').read()).toBeNull();
  await open().resolve(key);
  expect(await open().read()).toBeNull();
  expect(pitchIntentScope('https://a/api', 1)).not.toBe(pitchIntentScope('https://b/api', 1));
  expect(pitchIntentScope('https://a/api', 1)).not.toBe(pitchIntentScope('https://a/api', 2));
});

it('blocks dispatch/completion on account switch and keeps the old intent', async () => {
  const { open } = fixture();
  const store = open();
  const intent = await store.acquire({}, 'EXPLORER');
  const fetchImpl = vi.fn(async () => new Response('{"id":7}', { status: 201, headers: { 'content-type': 'application/json' } }));
  configureApi({ baseURL: 'https://example.test/api/v1', getToken: () => 'token', fetchImpl });
  await expect(sendPendingPitch(store, intent, () => false)).rejects.toThrow('account changed');
  expect(fetchImpl).not.toHaveBeenCalled();
  let current = true;
  fetchImpl.mockImplementationOnce(async () => { current = false; return new Response('{"id":7}', { status: 201, headers: { 'content-type': 'application/json' } }); });
  await expect(sendPendingPitch(store, intent, () => current)).rejects.toThrow('account changed');
  expect((await store.read())?.acknowledged).toBeUndefined();
});

it('acknowledges before a failing feed reload, so resuming never creates again', async () => {
  const { open } = fixture();
  const store = open();
  const intent = await store.acquire({ headline: 'Frozen' }, 'EXPLORER');
  const fetchImpl = vi.fn(async () => new Response('{"id":7}', { status: 201, headers: { 'content-type': 'application/json' } }));
  configureApi({ baseURL: 'https://example.test/api/v1', getToken: () => 'token', fetchImpl });
  expect(await sendPendingPitch(store, intent, () => true)).toBe(7);
  const reload = async () => { throw new Error('feed unavailable'); };
  await expect(reload()).rejects.toThrow();
  expect(await sendPendingPitch(store, (await store.read())!, () => true)).toBe(7);
  expect(fetchImpl).toHaveBeenCalledOnce();
});

it('retains scoped pending pitches through browser logout and account changes', () => {
  const storage = () => Object.create({
    getItem(this: Record<string, string>, name: string) { return this[name] ?? null; },
    setItem(this: Record<string, string>, name: string, value: string) { this[name] = value; },
    removeItem(this: Record<string, string>, name: string) { delete this[name]; },
  }) as Storage;
  const local = storage();
  const session = storage();
  vi.stubGlobal('localStorage', local);
  vi.stubGlobal('sessionStorage', session);
  try {
    const scope = pitchIntentScope('https://example.test/api', 1);
    local.setItem(scope, 'pending');
    local.setItem('unscoped-user-cache', 'private');
    clearUserBrowserStorage();
    claimUserBrowserStorage(2);
    expect(local.getItem(scope)).toBe('pending');
    expect(local.getItem('unscoped-user-cache')).toBeNull();
  } finally { vi.unstubAllGlobals(); }
});

it.each(['IDEMPOTENCY_PAYLOAD_MISMATCH', 'PITCH_DELETED', 'IDEMPOTENCY_REPLAY_EXPIRED'] as const)(
  'preserves %s for explicit reconciliation without another POST', async (code) => {
    const { open } = fixture();
    const store = open();
    const intent = await store.acquire({ headline: 'Original' }, 'EXPLORER');
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ code, post_id: 7 }), {
      status: code === 'IDEMPOTENCY_PAYLOAD_MISMATCH' ? 409 : 410, headers: { 'content-type': 'application/json' },
    }));
    configureApi({ baseURL: 'https://example.test/api/v1', getToken: () => 'token', fetchImpl });
    await expect(sendPendingPitch(store, intent, () => true)).rejects.toMatchObject({ status: code === 'IDEMPOTENCY_PAYLOAD_MISMATCH' ? 409 : 410 });
    expect((await store.read())?.key).toBe(key);
    await store.reconcile(key, code, 7);
    await expect(sendPendingPitch(store, (await store.read())!, () => true)).rejects.toThrow('Review');
    expect(fetchImpl).toHaveBeenCalledOnce();
  },
);

it('fails closed until explicit recovery of corrupt storage', async () => {
  const { records, open } = fixture();
  records.set('account-one', '{broken');
  await expect(open().acquire({}, 'EXPLORER')).rejects.toThrow('Recover');
  await open().recoverCorruptAfterReview();
  expect(await open().read()).toBeNull();
  await open().acquire({}, 'EXPLORER');
  await expect(open().recoverCorruptAfterReview()).rejects.toThrow('Resolve');
});

it('refuses browser acquisition without cross-tab locks before writing anything', async () => {
  const setItem = vi.fn();
  vi.stubGlobal('window', { localStorage: { getItem: () => null, setItem } });
  vi.stubGlobal('navigator', {});
  try {
    await expect(createBrowserPendingPitchStore('https://example.test/api', 1).acquire({}, 'EXPLORER')).rejects.toThrow('Update your browser');
    expect(setItem).not.toHaveBeenCalled();
  } finally { vi.unstubAllGlobals(); }
});

it('forwards cancellation while authentication is waiting and retains the original intent', async () => {
  const { open } = fixture();
  const store = open();
  const intent = await store.acquire({}, 'EXPLORER');
  const controller = new AbortController();
  let resolveToken!: (token: string) => void;
  const token = new Promise<string>((resolve) => { resolveToken = resolve; });
  const fetchImpl = vi.fn(async (_url, options) => {
    expect(options?.signal).toBe(controller.signal);
    if (options?.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    return new Response('{"id":7}', { status: 201, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  configureApi({ baseURL: 'https://example.test/api/v1', getToken: () => token, fetchImpl });
  const request = sendPendingPitch(store, intent, () => true, controller.signal);
  controller.abort();
  resolveToken('new-account-token');
  await expect(request).rejects.toMatchObject({ name: 'AbortError' });
  expect((await store.read())?.key).toBe(key);
  expect((await store.read())?.acknowledged).toBeUndefined();
});

it('keeps a refused validation request until the person explicitly starts corrected details', async () => {
  const { open } = fixture();
  const store = open();
  const intent = await store.acquire({ headline: '' }, 'EXPLORER');
  await store.reject(intent.key);
  await expect(sendPendingPitch(store, (await store.read())!, () => true)).rejects.toThrow('Review');
  expect((await store.read())?.exactPayload).toEqual({ headline: '' });
  await store.resolve(intent.key);
  expect(await store.read()).toBeNull();
});
