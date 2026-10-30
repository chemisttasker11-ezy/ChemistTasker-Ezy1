const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'features/parity/nativeFileBytes.ts'), 'utf8');
const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const binary = Uint8Array.from([37, 80, 68, 70, 45, 49, 46, 55, 10, 0, 128, 255, 13, 10]);

// Model the shipped native Blob surface: slice/size/type, but no arrayBuffer.
// Execute the actual installed fetch Response implementation, not a replacement
// binary reader. FileReader is the native bridge boundary under test.
class NativeBlob {
  constructor(parts = [], options = {}) {
    this.bytes = Uint8Array.from(parts.flatMap(part => Array.from(part.bytes || part)));
    this.size = this.bytes.length;
    this.type = options.type || '';
  }
  slice(start, end) { return new NativeBlob([this.bytes.slice(start, end)], { type: this.type }); }
}
function nativeRuntime(error) {
  let reads = 0;
  class NativeReader {
    readAsArrayBuffer(blob) {
      reads++;
      queueMicrotask(() => {
        if (error) { this.error = error; this.onerror(); }
        else { this.result = blob.bytes.slice().buffer; this.onload(); }
      });
    }
  }
  const context = vm.createContext({ exports: {}, Blob: NativeBlob, FileReader: NativeReader,
    Uint8Array, ArrayBuffer, Promise, URLSearchParams, Symbol, console });
  vm.runInContext(fs.readFileSync(require.resolve('whatwg-fetch/dist/fetch.umd.js'), 'utf8'), context);
  context.Response = context.WHATWGFetch.Response;
  context.exports = {};
  vm.runInContext(output, context);
  return { read: context.exports.nativeFileBytes, reads: () => reads };
}

test('native Blob without arrayBuffer reproduces the old failure; shipped Response preserves every PDF byte', async () => {
  const blob = new NativeBlob([binary], { type: 'application/pdf' });
  assert.equal(blob.arrayBuffer, undefined);
  assert.throws(() => blob.arrayBuffer(), TypeError);
  const runtime = nativeRuntime();
  assert.deepEqual(await runtime.read(blob), binary);
  assert.equal(runtime.reads(), 1);
});

test('native read failure rejects before a file can be written or shared', async () => {
  const failure = new Error('native file reader failed');
  const runtime = nativeRuntime(failure);
  await assert.rejects(runtime.read(new NativeBlob([binary])), error => error === failure);
});

test('browser Blob/Response compatibility preserves the same binary document', async () => {
  const context = vm.createContext({ exports: {}, Response, Uint8Array });
  vm.runInContext(output, context);
  assert.deepEqual(await context.exports.nativeFileBytes(new Blob([binary], { type: 'application/pdf' })), binary);
});
