import { json } from './apiFixture.mjs';

const page1 = (results) => ({ count: results.length, next: null, previous: null, results });

export const invoice = (id, number) => ({
  id, invoice_id: id, number, version: 1, request_key: `k${id}`, kind: 'invoice', source: 'external',
  payload: {
    request_key: `k${id}`, customer_id: 7, invoice_date: '2026-10-11', due_date: '2026-10-25', issuer_name: 'Smoke Worker',
    issuer_abn: '', issuer_address: '', gst_registered: false, price_mode: 'exclusive', super_mode: 'none', super_rate: '12.00',
    super_confirmed: false, bank_account_name: '', bsb: '', account_number: '', super_fund_name: '', super_usi: '',
    super_member_number: '', reference: '', notes: '', lines: [],
    customer: { name: 'Harbour Health', legal_name: '', address: '', abn: '', email: '', contact_name: '' },
  },
  calculation: { lines: [], subtotal: '0.00', gst: '0.00', payable: '100.00', sales_gross: '0.00', super: '0.00', automatic_super: '0.00' },
  locked: false, editable: true, voided: false, status: 'sent', review_status: 'NONE', delivery_status: null,
  paid: '0.00', balance: '100.00', super_document_id: null, payments: [], revisions: [], review_requests: [],
});

/** Finance API for a worker with two invoices. `failFirstLoad` makes the first invoice list request fail. */
export function financeApi({ failFirstLoad = false } = {}) {
  let invoiceListCalls = 0;
  const invoices = [invoice(41, 'INV-0041'), invoice(42, 'INV-0042')];
  return async (route, { path }) => {
    if (!path.includes('/finance/')) return undefined;
    const tail = path.replace(/.*\/finance\//, '');
    if (tail === 'invoices/') {
      invoiceListCalls += 1;
      if (failFirstLoad && invoiceListCalls === 1) return json(route, { detail: 'Temporarily unavailable' }, 503);
      return json(route, page1(invoices));
    }
    if (tail === 'invoices/internal-sources/') return json(route, []);
    if (tail === 'invoices/defaults/') return json(route, { issuer_name: 'Smoke Worker', issuer_abn: '', issuer_address: '', gst_registered: false, bank_account_name: '', bsb: '', account_number: '', super_fund_name: '', super_usi: '', super_member_number: '', super_rate: '12.00' });
    if (tail === 'invoices/preview/') return json(route, invoices[0].calculation);
    const one = tail.match(/^invoices\/(\d+)\/$/);
    if (one) return json(route, invoices.find((item) => item.id === Number(one[1])) ?? {}, invoices.some((item) => item.id === Number(one[1])) ? 200 : 404);
    return json(route, page1([]));
  };
}
