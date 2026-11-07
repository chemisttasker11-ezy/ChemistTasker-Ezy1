import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

function loadSession() {
  const source = readFileSync(new URL('./receiptShare.ts', import.meta.url), 'utf8');
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const scope = {
    exports: {},
    require: (id) => {
      if (id === 'expo-sharing') return { isAvailableAsync: async () => true, shareAsync: async () => {} };
      if (id === 'expo-file-system') return { File: class {}, Paths: { cache: '/tmp' } };
      if (id === '@chemisttasker/shared-core') return { finance: {} };
      if (id === './nativeFileBytes') return { nativeFileBytes: async () => new Uint8Array() };
      throw new Error(`Unexpected import: ${id}`);
    },
    Date, Math, String, Promise, Error,
  };
  runInNewContext(js, scope);
  return {
    ReceiptShareSession: scope.exports.ReceiptShareSession,
    safeMimeAndExt: scope.exports.safeMimeAndExt,
  };
}

function makeFakeDeps(overrides = {}) {
  let fileDeleted = false;
  let fileWritten = false;
  let fileCreated = false;
  let createdFileName = '';
  let sharedUri = '';
  let shareOptions = null;

  const fakeFile = {
    uri: 'file:///cache/test-receipt.pdf',
    create: () => { fileCreated = true; },
    write: (bytes) => { fileWritten = true; /* void return like installed Expo File */ },
    delete: () => { fileDeleted = true; },
  };

  const deps = {
    fetchReceipt: async (id) => ({ size: 100, type: 'application/pdf' }),
    readBytes: async () => new Uint8Array([1, 2, 3]),
    createFile: (filename) => {
      createdFileName = filename;
      return fakeFile;
    },
    isShareAvailable: async () => true,
    shareAsync: async (uri, opts) => {
      sharedUri = uri;
      shareOptions = opts;
    },
    ...overrides,
  };

  return {
    deps,
    get created() { return fileCreated; },
    get written() { return fileWritten; },
    get deleted() { return fileDeleted; },
    get fileName() { return createdFileName; },
    get sharedUri() { return sharedUri; },
    get shareOptions() { return shareOptions; },
  };
}

test('preserves detected MIME and safe extension without unsafe user names', () => {
  const { safeMimeAndExt } = loadSession();
  assert.deepEqual({ ...safeMimeAndExt('application/pdf') }, { ext: 'pdf', mimeType: 'application/pdf', uti: 'com.adobe.pdf' });
  assert.deepEqual({ ...safeMimeAndExt('image/png') }, { ext: 'png', mimeType: 'image/png', uti: 'public.png' });
  assert.deepEqual({ ...safeMimeAndExt('image/jpeg') }, { ext: 'jpg', mimeType: 'image/jpeg', uti: 'public.jpeg' });
  assert.deepEqual({ ...safeMimeAndExt('image/webp') }, { ext: 'webp', mimeType: 'image/webp', uti: 'org.webmproject.webp' });
  assert.deepEqual({ ...safeMimeAndExt('other/unknown') }, { ext: 'bin', mimeType: 'application/octet-stream' });
});

test('successful sharing writes PDF extension, passes UTI, and cleans up temp file', async () => {
  const { ReceiptShareSession } = loadSession();
  const fake = makeFakeDeps();
  const session = new ReceiptShareSession(fake.deps);

  const result = await session.openReceipt('user_1', 123);
  assert.equal(result.ok, true);
  assert.match(fake.fileName, /^receipt-123-.*\.pdf$/);
  assert.equal(fake.shareOptions.mimeType, 'application/pdf');
  assert.equal(fake.shareOptions.UTI, 'com.adobe.pdf');
  assert.equal(fake.deleted, true);
});

test('unavailable sharing gives honest feedback and cleans up temp file', async () => {
  const { ReceiptShareSession } = loadSession();
  const fake = makeFakeDeps({ isShareAvailable: async () => false });
  const session = new ReceiptShareSession(fake.deps);

  const result = await session.openReceipt('user_1', 123);
  assert.equal(result.ok, false);
  assert.equal(result.error, 'Sharing is unavailable on this device.');
  assert.equal(fake.deleted, true);
});

test('synchronous double-submit mutex rejects second tap in same tick', async () => {
  const { ReceiptShareSession } = loadSession();
  let fetchCount = 0;
  const fake = makeFakeDeps({
    fetchReceipt: async () => {
      fetchCount++;
      await new Promise((r) => setTimeout(r, 10));
      return { type: 'application/pdf' };
    },
  });
  const session = new ReceiptShareSession(fake.deps);

  const p1 = session.openReceipt('user_1', 123);
  const p2 = session.openReceipt('user_1', 123);

  const [res1, res2] = await Promise.all([p1, p2]);
  assert.equal(res2.ok, false);
  assert.equal(res2.error, 'Operation already in progress');
  assert.equal(res1.ok, true);
  assert.equal(fetchCount, 1);
});

test('session invalidation on unmount/account change prevents sharing old pending receipt', async () => {
  const { ReceiptShareSession } = loadSession();
  let shareCalled = false;
  const fake = makeFakeDeps({
    fetchReceipt: async () => {
      await new Promise((r) => setTimeout(r, 20));
      return { type: 'application/pdf' };
    },
    shareAsync: async () => { shareCalled = true; },
  });
  const session = new ReceiptShareSession(fake.deps);

  const pending = session.openReceipt('user_1', 100);
  session.invalidate(); // unmount or account switch invalidates session

  const res = await pending;
  assert.equal(res.ok, false);
  assert.equal(shareCalled, false); // old receipt must NEVER be shared!
  assert.equal(fake.created, false); // Invalidation occurred before file creation.
  assert.equal(fake.deleted, false);
});
