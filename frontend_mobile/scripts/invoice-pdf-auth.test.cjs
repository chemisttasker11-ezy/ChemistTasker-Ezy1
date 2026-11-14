const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');

test('each native share guard captures and checks the authentication generation', () => {
 for (const [file, count] of [
  ['roles/shared/invoices/FinanceWorkspace.tsx',2], ['roles/shared/invoices/shareLegacyInvoicePdf.ts',1],
  ['features/parity/workforce.tsx',1], ['roles/shared/shifts/ActiveShiftsPage/hooks/useShareShift.ts',1],
  ['roles/owner/profile.tsx',1], ['roles/organization/profile.tsx',1],
 ]) {
  const source=read(file);
  assert.ok((source.match(/const sessionGeneration\s*=\s*getSessionGeneration\(\)/g)||[]).length>=count,file);
  assert.ok((source.match(/sessionGeneration\s*===\s*getSessionGeneration\(\)/g)||[]).length>=count,file);
 }
});

test('legacy invoice UI uses bearer-authenticated shared-core PDF retrieval, not a browser URL', () => {
  const helper = read('roles/shared/invoices/shareLegacyInvoicePdf.ts');
  assert.match(helper, /downloadInvoicePdf\(id\)/);
  assert.match(helper, /nativeFileBytes\(blob\)/);
  assert.match(helper, /new File\(Paths\.cache/);
  assert.match(helper, /Sharing\.shareAsync\(file\.uri/);
  assert.match(helper, /finally\s*\{/);
  assert.match(helper, /file\.delete\(\)/);
  assert.doesNotMatch(helper, /Linking\.openURL|getInvoicePdfUrl|\?token=/);
  const detail = read('roles/shared/invoices/InvoiceDetail.tsx');
  assert.match(detail, /\['owner', 'organization', 'admin'\]\.includes/);
  for (const screen of ['InvoiceList.tsx', 'InvoiceDetail.tsx']) {
    const source = read('roles/shared/invoices/' + screen);
    assert.match(source, /shareLegacyInvoicePdf\(/);
    assert.doesNotMatch(source, /getInvoicePdfUrl|Linking\.openURL/);
  }
});
