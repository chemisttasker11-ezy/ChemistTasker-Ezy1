import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const src = readFileSync(new URL('./discussionModel.ts', import.meta.url), 'utf8');
const exports = {};
const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const serialization = {};
const serializationJs = ts.transpileModule(readFileSync(new URL('../../../shared-core/src/utils/serialization.ts', import.meta.url), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
vm.runInNewContext(serializationJs, { exports: serialization, require: () => ({ getSessionGeneration: () => undefined }) });
vm.runInNewContext(js, { exports, URL, process: { env: {} }, require: () => serialization });

const {
  isScopeCurrent,
  createTokenLock,
  createThreadPagingLock,
  mergeItems,
  handlePageFailure,
  initialReplyState,
  updateReplyThread,
  insertPostedReply,
  applyServerReplyPage,
  incrementReplyCount,
  updateCommentReactions,
  markCommentDeleted,
  refreshLoadedPublicPages,
  beginOperation,
  beginThreadOperation,
} = exports;

// Normalize cross-VM array references to avoid cross-VM prototype comparison mismatch in node:test
const toPlain = obj => JSON.parse(JSON.stringify(obj));

test('real HubCommentSerializer shape vs PublicComment: refreshLoadedPublicPages fetches authoritative public shapes', async () => {
  // Hub mutation responses use HubCommentSerializer with author object and reaction_summary:
  const mutationWriteResponse = {
    id: 10,
    body: 'Great discussion',
    author: { id: 42, first_name: 'Jane', last_name: 'Doe' },
    reaction_summary: { LIKE: 5 },
  };
  // Directly casting mutationWriteResponse produces undefined author_name and missing reactions:
  assert.equal(mutationWriteResponse.author_name, undefined);
  assert.equal(mutationWriteResponse.reactions, undefined);

  // Instead, refreshLoadedPublicPages re-queries the public endpoint bounded by loadedPageCount:
  const mockPublicStore = [
    { id: 10, body: 'Great discussion', author_name: 'Jane Doe', can_edit: true, reactions: { LIKE: 5 } },
    { id: 11, body: 'Another comment', author_name: 'John Smith', can_edit: false, reactions: { LIKE: 2 } },
  ];
  const fetchPage = async page => {
    return page === 1 ? { results: mockPublicStore, next: null } : { results: [], next: null };
  };

  const refreshed = await refreshLoadedPublicPages(fetchPage, 1);
  assert.equal(refreshed.items.length, 2);
  assert.equal(refreshed.items[0].author_name, 'Jane Doe');
  assert.equal(refreshed.items[0].reactions.LIKE, 5);
  assert.equal(refreshed.nextPage, null);
});

test('repeated likes authoritative count does not drift on idempotent reactions', async () => {
  // If client blindly guessed LIKE+1/-1, 3 successive taps would increment to 4, 5, 6.
  // Instead, refreshLoadedPublicPages fetches the authoritative server-side count:
  let serverLikeCount = 3;
  const fetchPage = async () => ({
    results: [{ id: 1, body: 'Post', author_name: 'Sam', can_edit: false, reactions: { LIKE: serverLikeCount } }],
    next: null,
  });

  // Tap 1
  const first = await refreshLoadedPublicPages(fetchPage, 1);
  assert.equal(first.items[0].reactions.LIKE, 3);

  // Tap 2 (idempotent PUT returned same state on backend)
  const second = await refreshLoadedPublicPages(fetchPage, 1);
  assert.equal(second.items[0].reactions.LIKE, 3);
});

test('newly posted reply before expanding existing pages retains old replies when server page arrives', () => {
  let replyThreads = {};
  const localReply = { id: 999, parent: 10, body: 'Locally posted reply before expand' };

  // 1. User posts reply before expanding thread
  replyThreads = insertPostedReply(replyThreads, 10, localReply);
  assert.equal(replyThreads[10].expanded, true);
  assert.equal(replyThreads[10].serverLoaded, false);
  assert.equal(replyThreads[10].items.length, 1);
  assert.equal(replyThreads[10].items[0].id, 999);

  // 2. toggleReplies expands and fetches server page 1 with pre-existing replies
  const serverPage1 = [
    { id: 101, parent: 10, body: 'Pre-existing server reply 1' },
    { id: 102, parent: 10, body: 'Pre-existing server reply 2' },
  ];

  replyThreads = updateReplyThread(replyThreads, 10, prev =>
    applyServerReplyPage(prev, 1, serverPage1, 'http://api?page=2')
  );

  // Both pre-existing server replies AND locally posted reply are present!
  const ids = toPlain(replyThreads[10].items.map(i => i.id));
  assert.equal(ids.includes(101), true);
  assert.equal(ids.includes(102), true);
  assert.equal(ids.includes(999), true);
  assert.equal(replyThreads[10].serverLoaded, true);
  assert.equal(replyThreads[10].page, 1);
  assert.equal(replyThreads[10].nextPage, 2);
});

test('old finally cannot unlock new write via generation-owned token lock', () => {
  const lock = createTokenLock();
  assert.equal(lock.isLocked(), false);

  // Ticket 1 acquires lock
  assert.equal(lock.acquire(1), true);
  assert.equal(lock.isLocked(), true);

  // Ticket 2 cannot acquire while Ticket 1 holds it
  assert.equal(lock.acquire(2), false);

  // Ticket 1 releases lock
  assert.equal(lock.release(1), true);
  assert.equal(lock.isLocked(), false);

  // Ticket 2 acquires lock
  assert.equal(lock.acquire(2), true);
  assert.equal(lock.isLocked(), true);

  // Late finally block from Ticket 1 executes and tries to release Ticket 1
  const staleRelease = lock.release(1);
  assert.equal(staleRelease, false);
  // Lock MUST STILL be held by Ticket 2!
  assert.equal(lock.isLocked(), true);

  // Only Ticket 2 can release its own lock
  assert.equal(lock.release(2), true);
  assert.equal(lock.isLocked(), false);
});

test('per-thread paging lock provides synchronous same-tick exclusion for double-taps', () => {
  const threadLock = createThreadPagingLock();

  // Root 10 paging starts
  assert.equal(threadLock.acquire(10, 1), true);
  // Double-tap in same tick for Root 10 is excluded
  assert.equal(threadLock.acquire(10, 2), false);

  // Root 20 can page concurrently/independently
  assert.equal(threadLock.acquire(20, 3), true);

  // Old ticket release cannot release Root 10
  assert.equal(threadLock.release(10, 999), false);

  // Proper release works
  assert.equal(threadLock.release(10, 1), true);
  assert.equal(threadLock.acquire(10, 4), true);
});

test('failed page retains real loaded rows without wiping list', () => {
  const existingRows = [
    { id: 1, body: 'Page 1 item A' },
    { id: 2, body: 'Page 1 item B' },
  ];
  const networkError = new Error('500 Server error');
  const result = handlePageFailure(existingRows, networkError);

  assert.equal(toPlain(result.items).length, 2);
  assert.equal(result.items[0].id, 1);
  assert.equal(result.items[1].id, 2);
  assert.equal(result.error, '500 Server error');
});

test('stale route or account completion rejected and preserves drafts', () => {
  const latestScope = { accountKey: 'user-2', routeKey: 'article-1', generation: 2 };
  const staleSnapshot = { accountKey: 'user-1', routeKey: 'article-1', generation: 1 };

  assert.equal(isScopeCurrent(latestScope, staleSnapshot), false);
  assert.equal(isScopeCurrent(latestScope, { ...latestScope }), true);
});

test('beginOperation and beginThreadOperation isolation and activity lock', () => {
  const lock = createTokenLock(), scope = { accountKey: 'u', routeKey: 'r', generation: 1 };
  const op1 = beginOperation(lock, scope);
  const op2 = beginOperation(lock, scope);
  assert.ok(op1 && op2 === null);
  assert.equal(scope.generation, 1);
  assert.equal(isScopeCurrent(scope, op1.snapshot), true);
  assert.equal(lock.release(op1.ticket), true);

  const tLock = createThreadPagingLock();
  const t10 = beginThreadOperation(tLock, 10, scope);
  const t20 = beginThreadOperation(tLock, 20, scope);
  assert.ok(t10 && t20);
  assert.equal(isScopeCurrent(scope, t10.snapshot), true);
  assert.equal(isScopeCurrent(scope, t20.snapshot), true);
  assert.equal(tLock.acquire(10, 999), false);
  assert.equal(tLock.release(10, t10.ticket), true);
  assert.equal(tLock.release(20, t20.ticket), true);
});

test('refreshLoadedPublicPages stops when next is null and throws on failure', async () => {
  const calls = [];
  const fetchPage = async p => {
    calls.push(p);
    return p === 1 ? { results: [{ id: 1 }], next: 'p2' } : { results: [{ id: 2 }], next: null };
  };
  const res = await refreshLoadedPublicPages(fetchPage, 3);
  assert.deepEqual(toPlain(calls), [1, 2]);
  assert.deepEqual(toPlain(res.items.map(i => i.id)), [1, 2]);
  assert.equal(res.nextPage, null);

  const oldRows = [{ id: 1, body: 'old' }];
  await assert.rejects(
    refreshLoadedPublicPages(async () => { throw new Error('net fail'); }, 2),
    /net fail/
  );
  const fallback = handlePageFailure(oldRows, new Error('net fail'));
  assert.deepEqual(toPlain(fallback.items), oldRows);
});

function createHarness() {
  const state = [];
  let cursor = 0;
  const effects = [];
  const cleanups = [];
  const reactMock = {
    useState(init) {
      const idx = cursor++;
      if (!(idx in state)) state[idx] = typeof init === 'function' ? init() : init;
      return [state[idx], v => { state[idx] = typeof v === 'function' ? v(state[idx]) : v; }];
    },
    useRef(init) {
      const idx = cursor++;
      return (state[idx] ??= { current: init });
    },
    useMemo(fn, deps) {
      const idx = cursor++;
      const prev = state[idx];
      if (!prev || !deps || deps.some((d, i) => d !== prev.deps[i])) {
        state[idx] = { value: fn(), deps };
      }
      return state[idx].value;
    },
    useCallback(fn, deps) {
      const idx = cursor++;
      const prev = state[idx];
      if (!prev || !deps || deps.some((d, i) => d !== prev.deps[i])) {
        state[idx] = { fn, deps };
      }
      return state[idx].fn;
    },
    useEffect(effect, deps) {
      const idx = cursor++;
      const prev = state[idx];
      const changed = !prev || !deps || deps.some((d, i) => d !== prev[i]);
      state[idx] = deps;
      if (changed) {
        effects.push(() => {
          if (cleanups[idx]) cleanups[idx]();
          const cl = effect();
          if (typeof cl === 'function') cleanups[idx] = cl;
        });
      }
    },
  };
  return {
    reactMock,
    flush: () => { while (effects.length > 0) effects.shift()(); },
    unmount: () => { for (const cl of cleanups) if (typeof cl === 'function') cl(); cleanups.length = 0; },
    reset: () => { cursor = 0; },
    state,
  };
}

function findNodes(node, type) {
  if (!node || typeof node !== 'object') return [];
  if (Array.isArray(node)) return node.flatMap(n => findNodes(n, type));
  const res = [];
  if (String(node.type) === type) res.push(node.props);
  if (node.props?.children) res.push(...findNodes(node.props.children, type));
  return res;
}

test('PublicHubPostView screen handler VM regression: draft survival, ack separation, reload retry, unmount cleanup', async () => {
  const postSrc = readFileSync(new URL('../../app/explore/hubs/post/[id].tsx', import.meta.url), 'utf8');
  const postJs = ts.transpileModule(postSrc + '\nexports.PublicHubPostView = PublicHubPostView;', {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;

  let writeCount = 0;
  let refreshReject = false;
  let deferredPostWrite = null;
  const seedPost = { id: 1, body: 'Hub post', author_name: 'Author', can_interact: true, allow_comments: true, attachments: [] };
  const seedComments = [{ id: 10, body: 'Seed comment', author_name: 'User', can_edit: false }];

  const apiMock = {
    publicContent: {
      getPost: async () => seedPost,
      listPostComments: async () => {
        if (refreshReject) throw new Error('503 Refresh failed');
        return { results: seedComments, next: null };
      },
      createCommunityComment: async (id, data) => {
        writeCount++;
        return { id: 11, body: data.body };
      },
    },
  };

  const harness = createHarness();
  const postExports = {};
  const context = {
    exports: postExports,
    module: { exports: postExports },
    require(id) {
      if (id === 'react') return harness.reactMock;
      if (id === 'react/jsx-runtime') return { jsx: (t, p) => ({ type: t, props: p }), jsxs: (t, p) => ({ type: t, props: p }) };
      if (id === 'react-native') return { View: 'View', ScrollView: 'ScrollView', StyleSheet: { create: s => s } };
      if (id === 'expo-router') return { useRouter: () => ({ push: () => {}, replace: () => {}, back: () => {}, canGoBack: () => true }), useLocalSearchParams: () => ({ id: '1' }) };
      if (id === 'react-native-paper') return { Button: 'Button', Card: Object.assign('Card', { Content: 'CardContent' }), Text: 'Text', TextInput: 'TextInput', ActivityIndicator: 'ActivityIndicator' };
      if (id === '@/components/ui/BrandActivityIndicator') return { BrandActivityIndicator: 'ActivityIndicator', ActivityIndicator: 'ActivityIndicator' };
      if (id === 'react-native-safe-area-context') return { SafeAreaView: 'SafeAreaView' };
      if (id === '@/config/api') return { chemistTaskerApi: apiMock };
      if (id === '@/context/AuthContext') return { useAuth: () => ({ user: { id: 42, email: 't@test.com' } }) };
      if (id === '@/features/explore/RichContent') return { RichContent: 'RichContent' };
      if (id === '@/features/explore/webLinks') return { publicWebUrl: s => s, safePublicUrl: s => s };
      if (id === '@/features/explore/discussionModel') return exports;
      if (id === '@/constants/tokens') return { colors: { pageBg: '', border: '', surfaceBg: '', status: { red: { fg: '' } } }, radius: {}, space: {}, touch: {} };
      throw new Error(`Unmocked dependency ${id}`);
    },
    console, Date, Promise, Set, Array, Object, Number, String, Boolean, Error,
  };

  vm.runInNewContext(postJs, context);
  const { PublicHubPostView } = postExports;
  assert.ok(PublicHubPostView);

  // Mount
  harness.reset();
  let tree = PublicHubPostView({ id: 1, accountKey: 'u42' });
  harness.flush();
  await new Promise(setImmediate);
  harness.reset();
  tree = PublicHubPostView({ id: 1, accountKey: 'u42' });

  // 1. Pre-ack failure preserves draft
  let preAckCalled = 0;
  apiMock.publicContent.createCommunityComment = async () => {
    preAckCalled++;
    throw new Error('Pre-ack failure');
  };
  const commentInput = findNodes(tree, 'TextInput').find(i => i.label === 'Write a comment');
  assert.ok(commentInput);
  commentInput.onChangeText('Preserve this draft');

  harness.reset();
  tree = PublicHubPostView({ id: 1, accountKey: 'u42' });
  findNodes(tree, 'Button').find(b => b.children === 'Post comment').onPress();
  await new Promise(setImmediate);
  assert.equal(preAckCalled, 1, 'Pre-ack mock must have been invoked');

  harness.reset();
  tree = PublicHubPostView({ id: 1, accountKey: 'u42' });
  assert.equal(harness.state.find(s => s === 'Preserve this draft'), 'Preserve this draft');

  // 2. Write ack then refresh failure displays honest message and clears draft
  apiMock.publicContent.createCommunityComment = async (id, data) => {
    writeCount++;
    return { id: 12, body: data.body };
  };
  refreshReject = true;
  findNodes(tree, 'Button').find(b => b.children === 'Post comment').onPress();
  await new Promise(setImmediate);
  harness.reset();
  tree = PublicHubPostView({ id: 1, accountKey: 'u42' });

  assert.equal(harness.state.find(s => s === 'Preserve this draft'), undefined);
  const errorText = findNodes(tree, 'Text').find(t => t.accessibilityRole === 'alert');
  assert.equal(errorText.children, 'Comment posted, but refresh failed. Reload comments.');

  // 3. Retry refresh action does NOT repeat write
  refreshReject = false;
  const reloadBtn = findNodes(tree, 'Button').find(b => b.children === 'Reload comments');
  assert.ok(reloadBtn);
  reloadBtn.onPress();
  await new Promise(setImmediate);
  assert.equal(writeCount, 1);

  // Rerender after successful Reload before late phase
  harness.reset();
  tree = PublicHubPostView({ id: 1, accountKey: 'u42' });

  // 4. Actual cleanup invalidates scope so in-flight write does not touch state
  apiMock.publicContent.createCommunityComment = async () => new Promise(res => { deferredPostWrite = res; });
  const nextInput = findNodes(tree, 'TextInput').find(i => i.label === 'Write a comment');
  nextInput.onChangeText('Late draft');

  harness.reset();
  tree = PublicHubPostView({ id: 1, accountKey: 'u42' });
  findNodes(tree, 'Button').find(b => b.children === 'Post comment').onPress();

  assert.equal(typeof deferredPostWrite, 'function', 'deferredPostWrite resolver must exist before unmount');

  harness.unmount();
  const snapshotBefore = JSON.stringify(harness.state);
  deferredPostWrite({ id: 14, body: 'Late draft' });
  await new Promise(setImmediate);
  assert.equal(JSON.stringify(harness.state), snapshotBefore);
});
