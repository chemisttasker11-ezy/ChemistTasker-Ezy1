const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

for (const switched of [false, true]) test(`receipt share after deferred fetch, session switched: ${switched}`, async () => {
  let generation = 1, resolveFetch, shares = 0;
  const pending = new Promise(resolve => { resolveFetch = resolve; });
  const module = { exports: {} };
  const source = fs.readFileSync('frontend_mobile/features/parity/receiptShare.ts', 'utf8');
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, {
    module, exports: module.exports, Uint8Array, Date, Math,
    require: id => id.includes('authSession') ? { getSessionGeneration: () => generation } : {},
  });
  const session = new module.exports.ReceiptShareSession({
    fetchReceipt: () => pending, readBytes: async () => new Uint8Array([1]),
    createFile: () => ({ uri: 'file://receipt', create() {}, write() {}, delete() {} }),
    isShareAvailable: async () => true, shareAsync: async () => { shares++; },
  });
  const result = session.openReceipt('account', 1);
  if (switched) generation++;
  resolveFetch({ type: 'application/pdf' });
  await result;
  assert.equal(shares, switched ? 0 : 1);
  assert.equal(session.isBusy, false);
});

for (const switched of [false, true]) test(`ethical import after deferred upload, session switched: ${switched}`, async () => {
  let generation = 1, resolveUpload, pushed = 0, started;
  const began = new Promise(resolve => { started = resolve; });
  const pending = new Promise(resolve => { resolveUpload = resolve; });
  const source = fs.readFileSync('frontend_mobile/features/parity/ethicalMarketplace.tsx', 'utf8');
  const start = source.indexOf('const pick=async()=>', source.indexOf('function ImportStock('));
  const end = source.indexOf(';return <ParityPage', start);
  const code = ts.transpileModule(source.slice(start, end) + ';pick;', { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const pick = vm.runInNewContext(code, {
    getSessionGeneration: () => generation, setBusy() {}, setError() {}, pharmacyId: 1,
    DocumentPicker: { getDocumentAsync: async () => ({ canceled: false, assets: [{ uri: 'content://file', name: 'file.csv' }] }) },
    fetch: async () => ({ blob: async () => ({}) }), FormData: class { append() {} },
    api: { uploadImport: () => { started(); return pending; } }, router: { push: () => { pushed++; } },
  });
  const result = pick(); await began;
  if (switched) generation++;
  resolveUpload({ id: 8 }); await result;
  assert.equal(pushed, switched ? 0 : 1);
});

for (const switched of [false, true]) test(`finance PDF after deferred download, session switched: ${switched}`, async () => {
  let generation = 1, resolvePdf, shares = 0, started;
  const began = new Promise(resolve => { started = resolve; });
  const pending = new Promise(resolve => { resolvePdf = resolve; });
  const source = fs.readFileSync('frontend_mobile/roles/shared/invoices/FinanceWorkspace.tsx', 'utf8');
  const start = source.indexOf('  const sharePdf = async');
  const end = source.indexOf('  const shareCsv = async', start);
  const code = ts.transpileModule(source.slice(start, end) + '\nsharePdf;', { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const share = vm.runInNewContext(code, {
    ownerScope: 'owner', scopeRef: { current: 'owner' }, pdfGeneration: { current: 1 }, getSessionGeneration: () => generation,
    Sharing: { isAvailableAsync: async () => true, shareAsync: async () => { shares++; } },
    finance: { pdf: () => { started(); return pending; } }, nativeFileBytes: async () => new Uint8Array([37, 80, 68, 70, 45]),
    File: class { constructor() { this.uri = 'file://pdf'; } create() {} write() {} delete() {} }, Paths: { cache: 'cache' }, String,
  });
  const result = share({ id: 1, version: 1, number: 'INV' }); await began;
  if (switched) generation++;
  resolvePdf({}); await result;
  assert.equal(shares, switched ? 0 : 1);
});

for (const switched of [false, true]) test(`chat attachment after deferred download, session switched: ${switched}`, async () => {
  let generation = 1, resolveDownload, shares = 0;
  const pending = new Promise(resolve => { resolveDownload = resolve; });
  const source = fs.readFileSync('frontend_mobile/roles/shared/messages/[id].tsx', 'utf8');
  const start = source.indexOf('        const openAttachment = async () => {');
  const end = source.indexOf('        return (', start);
  const code = ts.transpileModule(source.slice(start, end) + '\nopenAttachment;', { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const open = vm.runInNewContext(code, {
    attachmentAvailable: true, user: { id: 1 }, item: { id: 3 }, parseRoomId: () => 4,
    roomGenerationRef: { current: 1 }, accountRef: { current: 1 }, getSessionGeneration: () => generation,
    Sharing: { isAvailableAsync: async () => true, shareAsync: async () => { shares++; } },
    downloadChatAttachment: () => pending, nativeFileBytes: async () => new Uint8Array([1]),
    File: class { constructor() { this.uri = 'file://chat'; } create() {} write() {} delete() {} },
    Paths: { cache: 'cache' }, setSnackbar() {}, Date, Number, String,
  });
  const result = open();
  await Promise.resolve();
  if (switched) generation++;
  resolveDownload({ type: 'application/pdf' });
  await result;
  assert.equal(shares, switched ? 0 : 1);
});
