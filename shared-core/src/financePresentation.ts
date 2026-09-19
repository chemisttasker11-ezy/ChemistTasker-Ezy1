import type { FinanceDraft, FinanceInvoice, FinanceItem, FinanceLine } from './finance';

export function financeToday(): string {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
export function financeDueDate(date: string, days: number): string {
  const value = new Date(`${date}T12:00:00`);
  if (!Number.isFinite(value.getTime())) return '';
  value.setDate(value.getDate() + days);
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
}
export function createFinanceDraft(requestKey: string, previous?: FinanceInvoice): FinanceDraft {
  const p = previous?.payload;
  return { request_key: requestKey, customer_id: 0, invoice_date: financeToday(), due_date: financeDueDate(financeToday(), 14),
    issuer_name: p?.issuer_name || '', issuer_entity_type: p?.issuer_entity_type || 'sole_trader', issuer_abn: p?.issuer_abn || '', issuer_address: p?.issuer_address || '',
    gst_registered: p?.gst_registered || false, price_mode: p?.price_mode || 'exclusive', super_mode: 'none', super_rate: '12.00', super_confirmed: false,
    bank_account_name: p?.bank_account_name || '', bsb: p?.bsb || '', account_number: p?.account_number || '',
    super_fund_name: p?.super_fund_name || '', super_usi: p?.super_usi || '', super_member_number: p?.super_member_number || '', reference: '', notes: '', lines: [] };
}
export function financeItemLine(item: FinanceItem): FinanceLine {
  return { item_id: item.id, description: item.name, quantity: '1.00', unit_price: item.unit_price, discount: '0.00',
    tax_code: item.tax_code, super_eligible: item.super_eligible, worked_on: financeToday(), category_code: item.category, unit: item.unit };
}
export function financeStatus(invoice: FinanceInvoice): string {
  if (invoice.voided) return 'Void';
  if (invoice.review_status === 'REVISION_REQUESTED') return 'Revision requested';
  if (invoice.status === 'paid') return 'Paid';
  if (invoice.review_status === 'APPROVED_FOR_PAYMENT') return 'Approved for payment';
  if (invoice.status === 'sent' && invoice.payload.due_date < financeToday()) return 'Overdue';
  if (invoice.status === 'sent') return Number(invoice.paid) > 0 ? 'Part paid' : 'Sent';
  return 'Saved';
}
