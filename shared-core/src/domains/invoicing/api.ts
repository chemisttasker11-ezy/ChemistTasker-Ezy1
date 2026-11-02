import type { InvoiceDetailApi } from '../../contracts/invoiceDetail';
import type { InvoiceAssignmentPreviewLine, InvoiceGenerationInput, InvoiceGenerationPreview } from '../../contracts/invoiceGeneration';
import type { Invoice } from '../../types';
import type { Collection } from '../../contracts/common';
/** Domain-owned operations extracted from the established shared API. */
import { fetchApi, getApiConfig, performApiRequest } from '../../transport/application';
export function getInvoices() {
    return fetchApi<Collection<Invoice>>('/invoices/');
}
export function getInvoiceDetail(id: number | string) {
    return fetchApi<InvoiceDetailApi>(`/invoices/${id}/`);
}
export function createInvoice(data: unknown) {
    return fetchApi<InvoiceDetailApi>('/invoices/', { method: 'POST', body: JSON.stringify(data) });
}
export function updateInvoice(id: number | string, data: unknown) {
    return fetchApi<InvoiceDetailApi>(`/invoices/${id}/`, { method: 'PATCH', body: JSON.stringify(data) });
}
export function deleteInvoice(id: number | string) {
    return fetchApi(`/invoices/${id}/`, { method: 'DELETE' });
}
export function generateInvoice(data: unknown) {
    const body = data instanceof FormData ? data : JSON.stringify(data);
    return fetchApi('/invoices/generate/', { method: 'POST', body });
}
export function previewInvoice(id: number | string) {
    return fetchApi<InvoiceAssignmentPreviewLine[]>(`/invoices/preview/${id}/`);
}
export function previewGeneratedInvoice(data: InvoiceGenerationInput) {
    return fetchApi<InvoiceGenerationPreview>('/invoices/generate/preview/', { method: 'POST', body: JSON.stringify(data) });
}
/** Authenticated binary read: never interpret an invoice PDF as application JSON. */
export async function downloadInvoicePdf(id: number | string): Promise<Blob> {
    const response = await performApiRequest(`/invoices/${id}/pdf/`, { method: 'GET' });
    return response.blob();
}
export function getInvoicePdfUrl(id: number | string) {
    const { baseURL } = getApiConfig();
    return `${baseURL}/invoices/${id}/pdf/`;
}
export function sendInvoiceEmail(id: number | string) {
    return fetchApi<{
        status: 'draft' | 'sent' | 'paid';
        detail?: string;
        delivery_status?: string | null;
    }>(`/invoices/${id}/send/`, { method: 'POST' });
}
export function reportInvoiceIssue(id: number | string, data: unknown = {}) {
    return fetchApi(`/invoices/${id}/report-issue/`, { method: 'POST', body: JSON.stringify(data) });
}
