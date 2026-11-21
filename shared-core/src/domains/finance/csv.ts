/** Canonical cross-platform CSV projection of already-authorized finance records.
 * No API call, tax calculation or new permission rule is defined here.
 */
import type { FinanceExpense, FinanceInvoice, FinanceWorksheet } from '../../finance';

export type FinanceCsvValue = string | number;
export type FinanceCsvRows = FinanceCsvValue[][];

/** Quote every RFC4180 cell and escape leading spreadsheet formula introducers. */
export function csvCell(value: FinanceCsvValue): string {
  const text = String(value);
  const safe = /^[\s]*[=+@\-]/.test(text) || /^[\t\r\n]/.test(text) ? "'" + text : text;
  return '"' + safe.replace(/"/g, '""') + '"';
}

/** BOM + CRLF is required by the existing web download and native file consumers. */
export function renderFinanceCsv(rows: FinanceCsvRows): string {
  return '\ufeff' + rows.map(row => row.map(csvCell).join(',')).join('\r\n');
}

export function invoiceCsvRows(invoices: readonly FinanceInvoice[]): FinanceCsvRows {
  return [
    ['Number', 'Kind', 'Customer', 'Date', 'Due', 'Worker or fund payable AUD',
      'GST AUD', 'Paid AUD', 'Balance AUD', 'Status'],
    ...invoices.map(invoice => [
      invoice.number, invoice.kind, invoice.payload.customer?.name || '',
      invoice.payload.invoice_date, invoice.payload.due_date,
      invoice.calculation.payable, invoice.calculation.gst, invoice.paid,
      invoice.balance, invoice.status,
    ]),
  ];
}

export function expenseCsvRows(expenses: readonly FinanceExpense[]): FinanceCsvRows {
  return [
    ['Supplier', 'Description', 'Incurred', 'Paid', 'Gross AUD',
      'GST AUD', 'Creditable business use %', 'Estimated GST credit AUD', 'Reference'],
    ...expenses.map(expense => [
      expense.supplier, expense.description, expense.incurred_on, expense.paid_on || '',
      expense.amount, expense.gst_amount, expense.business_use_percent,
      expense.gst_credit, expense.reference,
    ]),
  ];
}

/** Every field stays a projection of the server estimate, explicitly NOT a BAS filing. */
export function worksheetCsvRows(worksheet: FinanceWorksheet): FinanceCsvRows {
  return [
    ['DRAFT ONLY', 'Not a complete BAS'],
    ['Lodgement ready', String(worksheet.lodgement_ready)],
    ['Start', worksheet.start],
    ['End', worksheet.end],
    ['Basis', worksheet.basis],
    ['G1 · Sales', worksheet.G1],
    ['1A · GST on sales', worksheet['1A']],
    ['1B · GST credits', worksheet['1B']],
    ['Estimated net GST', worksheet.estimated_gst_net],
    ['Excluded legacy invoices', worksheet.excluded_legacy_invoice_count],
    ['Expenses needing evidence', worksheet.expenses_needing_evidence.join('; ')],
    ...worksheet.warnings.map(warning => ['Warning', warning]),
  ];
}
