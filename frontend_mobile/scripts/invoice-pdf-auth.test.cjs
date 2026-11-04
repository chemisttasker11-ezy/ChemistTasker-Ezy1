const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');

test('legacy invoice UI uses bearer-authenticated shared-core PDF retrieval, not a browser URL', () => {
  const helper = read('roles/shared/invoices/shareLegacyInvoicePdf.ts');
  assert.match(helper, /downloadInvoicePdf\(id\)/);
  assert.match(helper, /nativeFileBytes\(blob\)/);
  assert.match(helper, /new File\(Paths\.cache/);
  assert.match(helper, /Sharing\.shareAsync\(file\.uri/);
  assert.doesNotMatch(helper, /Linking\.openURL|getInvoicePdfUrl|\?token=/);
  for (const screen of ['InvoiceList.tsx', 'InvoiceDetail.tsx']) {
    const source = read('roles/shared/invoices/' + screen);
    assert.match(source, /shareLegacyInvoicePdf\(/);
    assert.doesNotMatch(source, /getInvoicePdfUrl|Linking\.openURL/);
  }
});
