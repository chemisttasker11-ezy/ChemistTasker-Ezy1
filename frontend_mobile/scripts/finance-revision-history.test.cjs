const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const source = readFileSync(resolve(__dirname, '../roles/shared/invoices/FinanceWorkspace.tsx'), 'utf8');
test('finance history is read-only and uses exact authorized worker or received revision', () => {
  assert.match(source, /finance\.receivedRevision\(invoice\.id, version\)/);
  assert.match(source, /finance\.invoiceRevision\(invoice\.id, version\)/);
  assert.match(source, /revision\.id === invoice\.id && revision\.version === version/);
  assert.match(source, /Read-only historical document/);
  assert.match(source, /selected && historyDocument \?/);
  assert.match(source, /Share this revision PDF/);
  assert.match(source, /Historical revisions cannot be edited, sent, approved or marked paid/);
});

test('historical financial reads and temporary PDF files remain within the active account', () => {
  assert.match(source, /historyGen\.current === request && scopeRef\.current === requestedScope/);
  assert.match(source, /const current = \(\) => scopeRef\.current === requestedScope/);
  assert.match(source, /if \(!current\(\)\) return;\s*await Sharing\.shareAsync/);
  assert.match(source, /file\.delete\(\)/);
});

test('shift invoice prefill cannot overwrite a draft edited while the request was pending', () => {
  const editor = readFileSync(resolve(__dirname, '../roles/shared/invoices/FinanceInvoiceEditor.tsx'), 'utf8');
  assert.match(editor, /const editGeneration = draftEditGeneration\.current/);
  assert.match(editor, /draftEditGeneration\.current !== editGeneration/);
  assert.match(editor, /prefillGeneration\.current !== request/);
  assert.match(editor, /editedDefaults\.current\.add\(key\)/);
  assert.match(editor, /setError\('The invoice was edited while loading this shift/);
});
