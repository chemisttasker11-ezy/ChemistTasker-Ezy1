/** Worker finance uses the same base URL, credentials and token provider as core API. */
export type FinanceTaxCode = 'GST' | 'GST_FREE' | 'INPUT_TAXED' | 'OUT_OF_SCOPE';
export type FinanceCategory = 'ProfessionalServices' | 'Superannuation' | 'Transportation' | 'Accommodation' | 'Miscellaneous';
export type FinanceUnit = string;
export type FinanceMoney = string;
export interface FinanceConfig {
  baseURL: string;
  getToken: () => string | null | undefined | Promise<string | null | undefined>;
  credentials?: RequestCredentials;
}
export interface FinanceCustomer {
  id: number; name: string; legal_name: string; abn: string; contact_name: string;
  email: string; phone: string; address: string; payment_terms_days: number;
  notes: string; active: boolean; abn_result?: Record<string, unknown>; abn_checked_at?: string | null;
}
export interface FinanceItem {
  id: number; code: string; name: string; category: FinanceCategory; unit: FinanceUnit;
  unit_price: FinanceMoney; tax_code: FinanceTaxCode; super_eligible: boolean; active: boolean;
}
export interface FinanceLine {
  item_id?: number | null; description?: string; quantity: string; unit_price: FinanceMoney;
  discount: string; tax_code?: FinanceTaxCode; super_eligible?: boolean; worked_on?: string | null;
  category_code?: FinanceCategory; unit?: FinanceUnit;
  locked?: boolean; source_assignment_id?: number | null; shift_id?: number | null;
}
export interface FinanceDraft {
  request_key: string; version?: number; customer_id: number; invoice_date: string; due_date: string;
  issuer_name: string; issuer_entity_type?: 'sole_trader' | 'company'; issuer_abn: string; issuer_address: string; gst_registered: boolean;
  price_mode: 'exclusive' | 'inclusive'; super_mode: 'none' | 'summary' | 'separate';
  super_rate: string; super_confirmed: boolean; bank_account_name: string; bsb: string; account_number: string;
  super_fund_name: string; super_usi: string; super_member_number: string; reference: string; notes: string;
  lines: FinanceLine[];
  source_assignment_ids?: number[];
  customer?: Pick<FinanceCustomer, 'name' | 'legal_name' | 'address' | 'abn' | 'email' | 'contact_name'>;
}
export interface FinanceCalculation {
  lines: (FinanceLine & { net: string; gst: string; gross: string })[];
  subtotal: string; gst: string; payable: string; sales_gross: string; super: string; automatic_super: string;
}
export interface FinanceInvoice {
  id: number; invoice_id: number; number: string; version: number; request_key: string;
  kind: 'invoice' | 'super_request'; source: 'external' | 'internal'; payload: FinanceDraft;
  calculation: FinanceCalculation; source_snapshot?: Record<string, unknown>;
  locked: boolean; editable?: boolean; voided: boolean; status: 'draft' | 'sent' | 'paid' | 'void';
  review_status?: 'NONE' | 'APPROVED_FOR_PAYMENT' | 'REVISION_REQUESTED';
  last_review_note?: string; last_reviewed_at?: string | null;
  delivery_status: string | null; paid: string; balance: string; super_document_id: number | null;
  payments: { id: number; date: string; amount: string; reference: string }[];
  revisions?: Array<{ version: number; invoice_status: string; review_status: string; created_at: string; calculation: FinanceCalculation }>;
  review_requests?: Array<{ id: number; requested_version: number; note: string; requested_by_name: string; created_at: string; resolved_at: string | null; resolved_by_version: number | null }>;
}
export interface FinanceInvoiceDefaults {
  issuer_name: string; issuer_abn: string; issuer_address: string; gst_registered: boolean;
  bank_account_name: string; bsb: string; account_number: string;
  super_fund_name: string; super_usi: string; super_member_number: string; super_rate: string;
}
export interface FinanceInternalSource {
  assignment_id: number; shift_id: number; slot_id: number; date: string; start_time: string; end_time: string;
  hours: string; rate: string;
  pharmacy: { id: number; name: string; abn: string; legal_name: string; email: string; address: string };
}
export interface FinanceExpense {
  id: number; request_key: string; version: number; supplier: string; description: string; category: string;
  incurred_on: string; paid_on: string | null; amount: string; gst_amount: string; tax_code: FinanceTaxCode;
  business_use_percent: string; gst_registered: boolean; evidence_confirmed: boolean; reimbursable: boolean;
  reference: string; notes: string; gst_credit: string;
  receipts: { id: number; filename: string; size: number; created_at: string }[];
}
export interface FinanceWorksheet {
  start: string; end: string; basis: 'cash' | 'accrual'; G1: string; '1A': string; '1B': string;
  estimated_gst_net: string; expenses_needing_evidence: number[]; excluded_legacy_invoice_count: number;
  lodgement_ready: false; warnings: string[];
}
export type FinanceCustomerInput = Omit<FinanceCustomer, 'id' | 'abn_result' | 'abn_checked_at'>;
export type FinanceItemInput = Omit<FinanceItem, 'id'>;
export type FinanceExpenseInput = Omit<FinanceExpense, 'id' | 'gst_credit' | 'receipts'>;
interface Page<T> { results: T[]; next: string | null; count: number }
let configuration: FinanceConfig | undefined;

/** Called by the package configureApi wrapper, not independently by applications. */
export function configureFinanceApi(value: FinanceConfig): void { configuration = value; }
function endpoint(path: string): URL {
  if (!configuration) throw new Error('API not configured. Call configureApi() first.');
  const base = new URL('client-profile/finance/', configuration.baseURL.replace(/\/?$/, '/'));
  const target = new URL(path, base);
  if (!['http:', 'https:'].includes(target.protocol) || target.username || target.password || target.origin !== base.origin || !target.pathname.startsWith(base.pathname)) {
    throw new Error('Finance requests cannot leave the configured finance API.');
  }
  return target;
}
function messageFrom(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) { const result = messageFrom(child); if (result) return result; }
  }
  return undefined;
}
async function request<T>(path: string, method = 'GET', body?: unknown, binary = false): Promise<T> {
  const url = endpoint(path);
  const config = configuration!;
  const token = await config.getToken();
  const headers = new Headers();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const multipart = typeof FormData !== 'undefined' && body instanceof FormData;
  if (body !== undefined && !multipart) headers.set('Content-Type', 'application/json');
  const response = await fetch(url, { method, redirect: 'error', credentials: config.credentials ?? 'include', headers,
    body: body === undefined ? undefined : multipart ? body as FormData : JSON.stringify(body) });
  if (!response.ok) {
    const error: unknown = await response.json().catch(() => null);
    // Safe, specific server messages are useful for uncertain email acceptance too.
    throw new Error(messageFrom(error) || `Finance request failed (${response.status}).`);
  }
  if (binary) return await response.blob() as T;
  if (response.status === 204) return undefined as T;
  return await response.json() as T;
}
async function listAll<T>(path: string): Promise<T[]> {
  const results: T[] = [];
  const seen = new Set<string>();
  let next: string | null = path;
  while (next) {
    if (seen.has(next) || seen.size >= 100) throw new Error('List is too large or pagination repeated. Narrow the server query.');
    seen.add(next);
    const page: Page<T> = await request<Page<T>>(next);
    if (!Array.isArray(page.results)) throw new Error('Unexpected finance list response.');
    results.push(...page.results); next = page.next;
  }
  return results;
}
export const finance = {
  customers: () => listAll<FinanceCustomer>('customers/'),
  saveCustomer: (value: FinanceCustomerInput, id?: number) => request<FinanceCustomer>(`customers/${id ? `${id}/` : ''}`, id ? 'PATCH' : 'POST', value),
  lookupAbn: (id: number) => request<FinanceCustomer>(`customers/${id}/lookup_abn/`, 'POST', {}),
  items: () => listAll<FinanceItem>('items/'),
  saveItem: (value: FinanceItemInput, id?: number) => request<FinanceItem>(`items/${id ? `${id}/` : ''}`, id ? 'PATCH' : 'POST', value),
  seedItems: () => request<{ detail: string }>('items/seed/', 'POST', {}),
  invoices: () => listAll<FinanceInvoice>('invoices/'),
  receivedInvoices: () => listAll<FinanceInvoice>('received-invoices/'),
  receivedInvoice: (id: number) => request<FinanceInvoice>(`received-invoices/${id}/`),
  invoiceDefaults: () => request<FinanceInvoiceDefaults>('invoices/defaults/'),
  internalSources: () => request<FinanceInternalSource[]>('invoices/internal-sources/'),
  internalPrefill: (assignment_ids: number[]) => request<FinanceDraft>('invoices/internal-prefill/', 'POST', { assignment_ids }),
  invoice: (id: number) => request<FinanceInvoice>(`invoices/${id}/`),
  saveInvoice: (value: FinanceDraft, id?: number) => request<FinanceInvoice>(`invoices/${id ? `${id}/` : ''}`, id ? 'PATCH' : 'POST', value),
  preview: (value: FinanceDraft) => request<FinanceCalculation>('invoices/preview/', 'POST', value),
  duplicate: (id: number, request_key: string) => request<FinanceInvoice>(`invoices/${id}/duplicate/`, 'POST', { request_key }),
  issue: (id: number, version: number) => request<FinanceInvoice>(`invoices/${id}/issue/`, 'POST', { version, confirmed: true }),
  superDocument: (id: number, version: number) => request<FinanceInvoice>(`invoices/${id}/super-document/`, 'POST', { version }),
  send: (id: number, version: number) => request<{ detail: string; document: FinanceInvoice }>(`invoices/${id}/send/`, 'POST', { version, confirmed: true }),
  markPaid: (id: number, version?: number) => request<FinanceInvoice>(`invoices/${id}/mark-paid/`, 'POST', version == null ? {} : { version }),
  requestRevision: (id: number, version: number, note: string) => request<FinanceInvoice>(`received-invoices/${id}/request-revision/`, 'POST', { version, note }),
  approveForPayment: (id: number, version: number, note = '') => request<FinanceInvoice>(`received-invoices/${id}/approve-payment/`, 'POST', { version, note }),
  markReceivedPaid: (id: number, version: number, note = '') => request<FinanceInvoice>(`received-invoices/${id}/mark-paid/`, 'POST', { version, note }),
  receivedPdf: (id: number) => request<Blob>(`received-invoices/${id}/pdf/`, 'GET', undefined, true),
  payment: (id: number, value: { request_key: string; date: string; amount: string; reference: string; fund_payment_confirmed: boolean }) => request<FinanceInvoice>(`invoices/${id}/payments/`, 'POST', value),
  pdf: (id: number) => request<Blob>(`invoices/${id}/pdf/`, 'GET', undefined, true),
  expenses: () => listAll<FinanceExpense>('expenses/'),
  saveExpense: (value: FinanceExpenseInput, id?: number) => request<FinanceExpense>(`expenses/${id ? `${id}/` : ''}`, id ? 'PATCH' : 'POST', value),
  uploadReceipt: (id: number, file: Blob, filename: string) => { const data = new FormData(); data.append('file', file, filename); return request<FinanceExpense>(`expenses/${id}/receipts/`, 'POST', data); },
  receipt: (id: number) => request<Blob>(`receipts/${id}/download/`, 'GET', undefined, true),
  shiftHours: (value: { start: string; end: string; break_minutes: number }) => request<{ hours: string }>('shift-hours/', 'POST', value),
  worksheet: (start: string, end: string, basis: 'cash' | 'accrual') => request<FinanceWorksheet>(`bas-worksheet/?${new URLSearchParams({ start, end, basis })}`),
};
