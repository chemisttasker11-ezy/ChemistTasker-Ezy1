import { describe, expect, it } from 'vitest';
import { csvCell, renderFinanceCsv, invoiceCsvRows, expenseCsvRows, worksheetCsvRows } from './csv';
import type { FinanceInvoice, FinanceExpense, FinanceWorksheet } from '../../finance';

const invoice = (id: number, number: string): FinanceInvoice => ({
  id, invoice_id: id, number, version: 1, request_key: 'test-' + id,
  kind: 'invoice', source: 'external', status: 'sent', locked: true, voided: false,
  payload: {
    request_key: 'test-' + id, customer_id: 5, invoice_date: '2026-07-10',
    due_date: '2026-07-31', issuer_name: 'Worker', issuer_abn: '', issuer_address: '',
    gst_registered: true, price_mode: 'exclusive', super_mode: 'none',
    super_rate: '12.00', super_confirmed: true, bank_account_name: '', bsb: '',
    account_number: '', super_fund_name: '', super_usi: '', super_member_number: '',
    reference: '', notes: '', lines: [], customer: { name: 'ACME, "North"', abn: '', legal_name: '',
      address: '', email: '', contact_name: '' },
  },
  calculation: { lines: [], subtotal: '100.00', gst: '10.00', payable: '110.00',
    sales_gross: '110.00', super: '0', automatic_super: '0' },
  delivery_status: null, paid: '30.00', balance: '80.00', super_document_id: null, payments: [],
});
const expense: FinanceExpense = {
  id: 9, request_key: 'expense-9', version: 1, supplier: '  =SUM(1,2)',
  description: 'Visit "A",\n next line', category: 'Travel',
  incurred_on: '2026-07-10', paid_on: null, amount: '120.00', gst_amount: '10.91',
  tax_code: 'GST', business_use_percent: '80.00', gst_registered: true,
  evidence_confirmed: false, reimbursable: false, reference: 'ref-9', notes: '',
  gst_credit: '8.73', receipts: [],
};
const worksheet: FinanceWorksheet = {
  start: '2026-07-01', end: '2026-09-30', basis: 'cash',
  G1: '10000.00', '1A': '1000.00', '1B': '200.00',
  estimated_gst_net: '800.00', expenses_needing_evidence: [9],
  excluded_legacy_invoice_count: 3, lodgement_ready: false,
  warnings: ['Figures are estimates'],
};

describe('M4-02 actual finance CSV serializer', () => {
  it('quotes/escapes RFC 4180 cells and neutralises spreadsheet formula characters after whitespace', () => {
    for (const value of ['=A1', '+cmd', '-1+2', '@A1', '\t=1+1', '  =1+1', '\r=SUM(1)']) {
      expect(csvCell(value)).toBe('"' + ("'" + value).replace(/"/g, '""') + '"');
    }
    expect(csvCell('Text, "quoted"\nwith newline')).toBe('"Text, ""quoted""\nwith newline"');
    expect(csvCell('Łódź')).toBe('"Łódź"');
  });

  it('emits a UTF-8 BOM with CRLF, web invoice column order and all owned pages', () => {
    const rows = invoiceCsvRows([invoice(1, 'INV-1'), invoice(51, 'INV-51')]);
    expect(rows[0]).toEqual(['Number', 'Kind', 'Customer', 'Date', 'Due',
      'Worker or fund payable AUD', 'GST AUD', 'Paid AUD', 'Balance AUD', 'Status']);
    expect(rows.slice(1)).toHaveLength(2);
    expect(rows[2]).toEqual(['INV-51', 'invoice', 'ACME, "North"', '2026-07-10', '2026-07-31',
      '110.00', '10.00', '30.00', '80.00', 'sent']);
    const csv = renderFinanceCsv(rows);
    expect(csv.startsWith('\ufeff"Number"')).toBe(true);
    expect(csv).toContain('\r\n"INV-1"');
    expect(csv).toContain('\r\n"INV-51"');
    expect(csv).toContain('"ACME, ""North"""');
    expect(csv.split('\r\n')).toHaveLength(3);
  });

  it('exports expense evidence/credit fields, all rows, multiline and injection-safe cells', () => {
    const rows = expenseCsvRows([expense, { ...expense, id: 10, supplier: 'second' }]);
    expect(rows[0]).toEqual(['Supplier', 'Description', 'Incurred', 'Paid', 'Gross AUD',
      'GST AUD', 'Creditable business use %', 'Estimated GST credit AUD', 'Reference']);
    expect(rows[1]).toEqual(['  =SUM(1,2)', 'Visit "A",\n next line', '2026-07-10', '',
      '120.00', '10.91', '80.00', '8.73', 'ref-9']);
    const text = renderFinanceCsv(rows);
    expect(text).toContain('"\'  =SUM(1,2)"');
    expect(text).toContain('"Visit ""A"",\n next line"');
    expect(text).toContain('\r\n"second"');
  });

  it('labels the BAS worksheet DRAFT and makes the exclusion of legacy invoices explicit', () => {
    const rows = worksheetCsvRows(worksheet);
    const csv = renderFinanceCsv(rows);
    expect(rows[0]).toEqual(['DRAFT ONLY', 'Not a complete BAS']);
    expect(csv).toContain('DRAFT');
    expect(csv).toContain('Not a complete BAS');
    for (const value of ['2026-07-01', '2026-09-30', 'cash', '10000.00',
      '1000.00', '200.00', '800.00', '3', 'Figures are estimates']) {
      expect(csv).toContain(value);
    }
    expect(csv).toContain('Excluded legacy invoices');
    expect(csv).toContain('Lodgement ready');
    expect(csv).toContain('false');
  });
});
