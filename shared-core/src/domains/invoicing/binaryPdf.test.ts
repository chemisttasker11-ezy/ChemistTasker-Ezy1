import { it, expect, vi } from 'vitest';
import { configureApi } from '../../transport/application';
import { downloadInvoicePdf } from './api';

it('fetches a binary invoice using the authenticated shared transport', async () => {
  const requests: Array<{ path: string; method: string; token: string | null; redirect?: RequestRedirect }> = [];
  configureApi({
    baseURL: 'https://example.test/api/v1',
    getToken: () => 'invoice-recipient-token',
    fetchImpl: vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      requests.push({ path: new URL(String(url)).pathname, method: init?.method ?? 'GET',
        token: new Headers(init?.headers).get('Authorization'), redirect: init?.redirect });
      return new Response('%PDF-1.7 binary-content', { headers: { 'content-type': 'application/pdf' } });
    }) as unknown as typeof fetch,
  });
  const pdf = await downloadInvoicePdf(43);
  expect(await pdf.text()).toBe('%PDF-1.7 binary-content');
  expect(pdf.type).toBe('application/pdf');
  expect(requests).toEqual([{ path: '/api/v1/invoices/43/pdf/', method: 'GET', token: 'Bearer invoice-recipient-token', redirect: 'error' }]);
});
