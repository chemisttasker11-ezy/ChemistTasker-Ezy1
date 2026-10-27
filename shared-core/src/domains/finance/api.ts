import type { FinanceCustomer, FinanceItem, FinanceInvoice, FinanceInvoiceDefaults, FinanceInternalSource, FinanceExpense, FinanceWorksheet, FinanceCalculation, FinanceDraft } from '../../finance';
import type { ApplicationRequestOptions } from '../../transport/application';
interface FinanceRequestOptions {
    method?: string;
    body?: ApplicationRequestOptions['body'];
}
/** Domain-owned operations extracted from the established shared API. */
import { API_ENDPOINTS } from '../../constants/endpoints';
import { performApiRequest } from '../../transport/application';
import { buildQuery } from '../../utils/serialization';
function financeRequest(endpoint: string, options: FinanceRequestOptions & {
    responseType: 'blob';
}): Promise<Blob>;
function financeRequest<T = unknown>(endpoint: string, options?: FinanceRequestOptions & {
    responseType?: 'json';
}): Promise<T>;
async function financeRequest<T = unknown>(endpoint: string, { method = 'GET', body, responseType = 'json' }: FinanceRequestOptions & {
    responseType?: 'json' | 'blob';
} = {}): Promise<T | Blob | undefined> {
    const response = await performApiRequest(endpoint, {
        method,
        body,
        redirect: 'error',
    }, {
        allowedPathPrefix: API_ENDPOINTS.finance.root,
        errorMessage: 'Finance requests cannot leave the configured finance API.',
    });
    if (responseType === 'blob') {
        return response.blob();
    }
    if (response.status === 204) {
        return undefined;
    }
    return response.json();
}
async function financeListAll<T>(endpoint: string): Promise<T[]> {
    const results: T[] = [];
    const seen = new Set<string>();
    let next: string | null | undefined = endpoint;
    while (next) {
        if (seen.has(next) || seen.size >= 100) {
            throw new Error('List is too large or pagination repeated. Narrow the server query.');
        }
        seen.add(next);
        const page: {
            results: T[];
            next?: string | null;
        } = await financeRequest<{
            results: T[];
            next?: string | null;
        }>(next);
        if (!Array.isArray(page?.results))
            throw new Error('Unexpected finance list response.');
        results.push(...page.results);
        next = page.next;
    }
    return results;
}
export const financeApi = {
    customers: () => financeListAll<FinanceCustomer>(API_ENDPOINTS.finance.customers),
    saveCustomer: (value: Record<string, unknown>, id?: number | string) => financeRequest<FinanceCustomer>(id ? API_ENDPOINTS.finance.customer(id) : API_ENDPOINTS.finance.customers, { method: id ? 'PATCH' : 'POST', body: value }),
    lookupAbn: (id: number | string) => financeRequest<FinanceCustomer>(API_ENDPOINTS.finance.customerLookupAbn(id), { method: 'POST', body: {} }),
    items: () => financeListAll<FinanceItem>(API_ENDPOINTS.finance.items),
    saveItem: (value: Record<string, unknown>, id?: number | string) => financeRequest<FinanceItem>(id ? API_ENDPOINTS.finance.item(id) : API_ENDPOINTS.finance.items, { method: id ? 'PATCH' : 'POST', body: value }),
    seedItems: () => financeRequest(API_ENDPOINTS.finance.seedItems, { method: 'POST', body: {} }),
    invoices: () => financeListAll<FinanceInvoice>(API_ENDPOINTS.finance.invoices),
    receivedInvoices: () => financeListAll<FinanceInvoice>(API_ENDPOINTS.finance.receivedInvoices),
    receivedInvoice: (id: number | string) => financeRequest<FinanceInvoice>(API_ENDPOINTS.finance.receivedInvoice(id)),
    receivedRevision: (id: number | string, version: number) => financeRequest<FinanceInvoice>(API_ENDPOINTS.finance.receivedRevision(id, version)),
    receivedRevisionPdf: (id: number | string, version: number) => financeRequest(API_ENDPOINTS.finance.receivedRevisionPdf(id, version), { responseType: 'blob' }),
    invoiceDefaults: () => financeRequest<FinanceInvoiceDefaults>(API_ENDPOINTS.finance.invoiceDefaults),
    internalSources: () => financeRequest<FinanceInternalSource[]>(API_ENDPOINTS.finance.internalSources),
    internalPrefill: (assignment_ids: number[]) => financeRequest<FinanceDraft>(API_ENDPOINTS.finance.internalPrefill, { method: 'POST', body: { assignment_ids } }),
    invoice: (id: number | string) => financeRequest<FinanceInvoice>(API_ENDPOINTS.finance.invoice(id)),
    invoiceRevision: (id: number | string, version: number) => financeRequest<FinanceInvoice>(API_ENDPOINTS.finance.invoiceRevision(id, version)),
    invoiceRevisionPdf: (id: number | string, version: number) => financeRequest(API_ENDPOINTS.finance.invoiceRevisionPdf(id, version), { responseType: 'blob' }),
    saveInvoice: (value: FinanceDraft, id?: number | string) => financeRequest<FinanceInvoice>(id ? API_ENDPOINTS.finance.invoice(id) : API_ENDPOINTS.finance.invoices, { method: id ? 'PATCH' : 'POST', body: value }),
    preview: (value: FinanceDraft) => financeRequest<FinanceCalculation>(API_ENDPOINTS.finance.invoicePreview, { method: 'POST', body: value }),
    duplicate: (id: number | string, request_key: string) => financeRequest<FinanceInvoice>(API_ENDPOINTS.finance.invoiceDuplicate(id), { method: 'POST', body: { request_key } }),
    issue: (id: number | string, version: number) => financeRequest<FinanceInvoice>(API_ENDPOINTS.finance.invoiceIssue(id), { method: 'POST', body: { version, confirmed: true } }),
    superDocument: (id: number | string, version: number) => financeRequest(API_ENDPOINTS.finance.invoiceSuperDocument(id), { method: 'POST', body: { version } }),
    send: (id: number | string, version: number) => financeRequest<{
        detail: string;
        delivery_id: number;
    }>(API_ENDPOINTS.finance.invoiceSend(id), { method: 'POST', body: { version, confirmed: true } }),
    markPaid: (id: number | string, version?: number, fund_payment_confirmed?: boolean) => financeRequest<FinanceInvoice>(API_ENDPOINTS.finance.invoiceMarkPaid(id), { method: 'POST', body: { ...(version == null ? {} : { version }), ...(fund_payment_confirmed == null ? {} : { fund_payment_confirmed }) } }),
    requestRevision: (id: number | string, version: number, note: string) => financeRequest<FinanceInvoice>(API_ENDPOINTS.finance.receivedRequestRevision(id), { method: 'POST', body: { version, note } }),
    approveForPayment: (id: number | string, version: number, note = '') => financeRequest<FinanceInvoice>(API_ENDPOINTS.finance.receivedApprovePayment(id), { method: 'POST', body: { version, note } }),
    markReceivedPaid: (id: number | string, version: number, note = '') => financeRequest<FinanceInvoice>(API_ENDPOINTS.finance.receivedMarkPaid(id), { method: 'POST', body: { version, note } }),
    receivedPdf: (id: number | string) => financeRequest(API_ENDPOINTS.finance.receivedPdf(id), { responseType: 'blob' }),
    payment: (id: number | string, value: Record<string, unknown>) => financeRequest<FinanceInvoice>(API_ENDPOINTS.finance.invoicePayments(id), { method: 'POST', body: value }),
    pdf: (id: number | string) => financeRequest(API_ENDPOINTS.finance.invoicePdf(id), { responseType: 'blob' }),
    expenses: () => financeListAll<FinanceExpense>(API_ENDPOINTS.finance.expenses),
    saveExpense: (value: Record<string, unknown>, id?: number | string) => financeRequest<FinanceExpense>(id ? API_ENDPOINTS.finance.expense(id) : API_ENDPOINTS.finance.expenses, { method: id ? 'PATCH' : 'POST', body: value }),
    uploadReceipt: (id: number | string, file: Blob, filename: string) => {
        const data = new FormData();
        data.append('file', file, filename);
        return financeRequest(API_ENDPOINTS.finance.expenseReceipts(id), { method: 'POST', body: data });
    },
    receipt: (id: number | string) => financeRequest(API_ENDPOINTS.finance.receiptDownload(id), { responseType: 'blob' }),
    shiftHours: (value: Record<string, unknown>) => financeRequest<{
        hours: string;
    }>(API_ENDPOINTS.finance.shiftHours, { method: 'POST', body: value }),
    worksheet: (start: string, end: string, basis: 'cash' | 'accrual') => financeRequest<FinanceWorksheet>(`${API_ENDPOINTS.finance.basWorksheet}${buildQuery({ start, end, basis })}`),
};
