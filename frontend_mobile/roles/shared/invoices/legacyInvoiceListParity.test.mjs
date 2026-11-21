import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('./InvoiceList.tsx', import.meta.url), 'utf8');
const start = source.indexOf('export async function fetchCompleteLegacyInvoices');
const end = source.indexOf('type Props', start);
assert.ok(start > 0 && end > start);
const snippet = source.slice(start, end).replaceAll('getInvoices({ page })', 'mockGetInvoices({ page })');
const js = ts.transpileModule(snippet, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const serialization = {};
const serializationJs = ts.transpileModule(readFileSync(new URL('../../../../shared-core/src/utils/serialization.ts', import.meta.url), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
runInNewContext(serializationJs, { exports: serialization, require: () => ({ getSessionGeneration: () => undefined }) });

test('managed invoice row navigates by finance_record_id, not legacy invoice id', () => {
  assert.match(source, /router\.push\(`\$\{resolvedBase\}\?invoice=\$\{item\.finance_record_id\}` as any\)/);
  assert.match(source, /financeManaged \? useWorkspace\(\)/);
});
test('legacy invoices fetch every DRF page while preserving sequence', async () => {
  const calls = [];
  const scope = { exports: {}, fetchAllPages: serialization.fetchAllPages, mockGetInvoices: async ({page}) => {
    calls.push(page);
    return page === 1 ? {results:[{id:1}],next:'?page=2'} : {results:[{id:2}],next:null};
  }};
  runInNewContext(js, scope);
  const rows = await scope.exports.fetchCompleteLegacyInvoices();
  assert.deepEqual(Array.from(rows, row=>row.id), [1,2]);
  assert.deepEqual(calls, [1,2]);
});
test('legacy pagination preserves malformed-response, repeated-page and page-limit errors', async () => {
  for (const [response, message, expectedRequests] of [
    [() => ({}), /Unexpected legacy invoice list response/, 1],
    [() => ({ results: [], next: '?page=2' }), /pagination repeated a page/, 2],
    [page => ({ results: [], next: `?page=${page + 1}` }), /exceeds the available page limit/, 100],
  ]) {
    let requests = 0;
    const scope = { exports: {}, fetchAllPages: serialization.fetchAllPages,
      mockGetInvoices: async ({ page }) => { requests++; return response(page); } };
    runInNewContext(js, scope);
    await assert.rejects(scope.exports.fetchCompleteLegacyInvoices(), message);
    assert.equal(requests, expectedRequests);
  }
});
test('legacy list reports API failure and never pretends it has zero invoices', () => {
  assert.match(source, /setLoadError\(err\?\.message/);
  assert.match(source, /Invoice history could not refresh/);
  assert.match(source, /ListEmptyComponent=\{loadError \|\| \(loading && !refreshing\) \? (?:null|undefined)/);
  assert.doesNotMatch(source, /setInvoices\(\[\]\);/);
});
test('managed PDF uses revision-aware workspace, legacy PDF preserves its endpoint', () => {
  assert.match(source, /title="View or share in Finance"/);
  assert.match(source, /void onOpenPdf\(item\.id\)/);
});
