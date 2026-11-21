import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
const require = createRequire(import.meta.url);
const ts = require('typescript');

function transpile(path, imports) {
  const compiled = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(compiled, {
    module, exports: module.exports, console: { ...console, error() {} },
    require(name) {
      if (Object.prototype.hasOwnProperty.call(imports, name)) return imports[name];
      throw new Error('Unmocked import: ' + name);
    },
  }, { filename: path });
  return module.exports;
}
const plain = (value) => JSON.parse(JSON.stringify(value));

test('R the Active Shifts counter offers for N shifts load in one request per 100 (O4 N2)', async () => {
  const batches = [], singles = [], state = [];
  const react = {
    useState: (value) => { const key = state.length; state.push(value); return [value, (u) => { state[key] = typeof u === 'function' ? u(state[key]) : u; }]; },
    useCallback: (fn) => fn,
  };
  const hook = transpile('./useCounterOffers.ts', {
    react,
    '@chemisttasker/shared-core': {
      acceptShiftCounterOfferService: async () => {}, rejectShiftCounterOfferService: async () => {},
      fetchShiftCounterOffersService: async (id) => { singles.push(id); return []; },
      fetchShiftCounterOffersBatchService: async (ids) => {
        batches.push(ids);
        if (ids.includes(666)) throw new Error('throttled');
        return Object.fromEntries(ids.map((id) => [id, [{ id: id * 10, status: 'PENDING' }, { id: 1, status: 'ACCEPTED' }]]));
      },
    },
  });
  const offers = hook.useCounterOffers();
  const ids = Array.from({ length: 47 }, (_, i) => i + 1);
  await offers.loadCounterOffersBatch(ids);
  assert.deepEqual(plain(batches), [ids]);
  assert.deepEqual(singles, []);
  assert.deepEqual(plain(state[0][3]), [{ id: 30, status: 'PENDING' }]);
  assert.equal(state[1][3], false);
  batches.length = 0;
  await offers.loadCounterOffersBatch(Array.from({ length: 150 }, (_, i) => i + 101));
  assert.deepEqual(plain(batches.map((chunk) => chunk.length)), [100, 50]);
  await offers.loadCounterOffersBatch([666]);
  assert.deepEqual(plain(state[0][666]), []);
  assert.equal(state[1][666], false);

  const page = readFileSync(new URL('../index.tsx', import.meta.url), 'utf8');
  assert.match(page, /loadCounterOffersBatch\(missing\)/);
  assert.doesNotMatch(page, /forEach\(\(shift\) => \{[^}]*loadCounterOffers\(shift\.id\)/);
});
