import { financeApi, invoice } from './financeFixture.mjs';
import { json } from './apiFixture.mjs';

export const pharmacyRecord = { id: 101, name: 'Smoke Pharmacy', street_address: '1 Test Street', suburb: 'Brisbane', state: 'QLD', postcode: '4000', email: 'pharmacy@example.test', abn: '51824753556' };
export const reviewInvoice = { ...invoice(41, 'INV-0041'), review_status: 'NONE', is_current: true, payload: { ...invoice(41, '').payload, issuer_name: 'Smoke Worker' } };

export function reviewApi() {
  const workerFinance = financeApi();
  return async (route, ctx) => {
    const { path } = ctx;
    if (path.endsWith('/pharmacies/')) return json(route, [pharmacyRecord]);
    if (path.endsWith('/workforce/payroll-configuration/')) return json(route, { pharmacy_id: 101, use_chemisttasker_payroll: false });
    if (path.endsWith('/finance/received-invoices/')) return json(route, { results: [reviewInvoice], count: 1, next: null, previous: null });
    if (path.endsWith('/rooms/')) return json(route, { results: [{ id: 11, title: 'Team One', type: 'GROUP', pharmacy: null, participant_ids: [702, 704], my_membership_id: 702, updated_at: '2026-10-10T09:00:00Z' }], count: 1, next: null, previous: null });
    if (path.endsWith('/rooms/11/messages/')) return json(route, { results: [{ id: 20, conversation: 11, body: 'A message for the team', sender: { id: 702, pharmacy: 101, user_details: { id: 4, first_name: 'Smoke', last_name: 'Worker' } }, created_at: '2026-10-10T09:00:00Z', attachment_url: null }], count: 1, next: null, previous: null });
    if (path.endsWith('/hub/context/')) return json(route, { pharmacies: [], organizations: [], community_groups: [], organization_groups: [], chemisttasker_hubs: [{ key: 'public', label: 'Everyone Hub', audience_type: 'PUBLIC' }] });
    if (path.includes('/finance/')) return workerFinance(route, ctx);
    return undefined;
  };
}
