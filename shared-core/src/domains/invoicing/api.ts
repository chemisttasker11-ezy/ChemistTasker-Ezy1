import type { InvoiceDetailApi } from '../../contracts/invoiceDetail';
import type { Invoice } from '../../types';
import type { Collection } from '../../contracts/common';
/** Domain-owned operations extracted from the established shared API. */
import { fetchApi, getApiConfig } from '../../transport/application';
export function getInvoices() {
    return fetchApi<Collection<Invoice>>('/client-profile/invoices/');
}
export function getInvoiceDetail(id: number | string) {
    return fetchApi<InvoiceDetailApi>(`/client-profile/invoices/${id}/`);
}
export function createInvoice(data: unknown) {
    return fetchApi<InvoiceDetailApi>('/client-profile/invoices/', { method: 'POST', body: JSON.stringify(data) });
}
export function updateInvoice(id: number | string, data: unknown) {
    return fetchApi<InvoiceDetailApi>(`/client-profile/invoices/${id}/`, { method: 'PATCH', body: JSON.stringify(data) });
}
export function deleteInvoice(id: number | string) {
    return fetchApi(`/client-profile/invoices/${id}/`, { method: 'DELETE' });
}
export function generateInvoice(data: unknown) {
    const body = data instanceof FormData ? data : JSON.stringify(data);
    return fetchApi('/client-profile/invoices/generate/', { method: 'POST', body });
}
export function previewInvoice(id: number | string) {
    return fetchApi(`/client-profile/invoices/preview/${id}/`);
}
export function getInvoicePdfUrl(id: number | string) {
    const { baseURL } = getApiConfig();
    return `${baseURL}/client-profile/invoices/${id}/pdf/`;
}
export function sendInvoiceEmail(id: number | string) {
    return fetchApi(`/client-profile/invoices/${id}/send/`, { method: 'POST' });
}
export function reportInvoiceIssue(id: number | string, data: unknown = {}) {
    return fetchApi(`/client-profile/invoices/${id}/report-issue/`, { method: 'POST', body: JSON.stringify(data) });
}
