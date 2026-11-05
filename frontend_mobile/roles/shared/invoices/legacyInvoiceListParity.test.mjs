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

test('managed invoice row navigates by finance_record_id, not legacy invoice id', () => {
  assert.match(source, /router\.push\(`\$\{resolvedBase\}\?invoice=\$\{item\.finance_record_id\}` as any\)/);
  assert.match(source, /financeManaged \? useWorkspace\(\)/);
});
test('legacy invoices fetch every DRF page while preserving sequence', async () => {
  const calls = [];
  const scope = { exports: {}, mockGetInvoices: async ({page}) => {
    calls.push(page);
    return page === 1 ? {results:[{id:1}],next:'?page=2'} : {results:[{id:2}],next:null};
  }};
  runInNewContext(js, scope);
  const rows = await scope.exports.fetchCompleteLegacyInvoices();
  assert.deepEqual(Array.from(rows, row=>row.id), [1,2]);
  assert.deepEqual(calls, [1,2]);
});
test('legacy list reports API failure and never pretends it has zero invoices', () => {
  assert.match(source, /setLoadError\(err\?\.message/);
  assert.match(source, /Invoice history could not refresh/);
  assert.match(source, /ListEmptyComponent=\{loadError \? null/);
  assert.doesNotMatch(source, /setInvoices\(\[\]\);/);
});
test('managed PDF uses revision-aware workspace, legacy PDF preserves its endpoint', () => {
  assert.match(source, /title="View or share in Finance"/);
  assert.match(source, /void onOpenPdf\(item\.id\)/);
});
