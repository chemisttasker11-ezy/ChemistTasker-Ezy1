import { beforeEach, expect, it, vi } from 'vitest';
import { configureApi } from '../../transport/application';
import * as invoices from './api';

let requests: Array<{ url: URL; options: RequestInit }>;
let response: unknown;
beforeEach(() => {
  requests = [];
  configureApi({
    baseURL: 'https://example.test/api/v1', getToken: () => 'worker-token',
    fetchImpl: vi.fn(async (url: RequestInfo | URL, options?: RequestInit) => {
      requests.push({ url: new URL(String(url)), options: options || {} });
      return new Response(JSON.stringify(response), { headers: { 'content-type': 'application/json' } });
    }) as unknown as typeof fetch,
  });
});

it.each([false, true])('generation preview keeps server decimals and route policy (external=%s)', async external => {
  const line = {
    description: 'Reviewed extra', category_code: 'Miscellaneous', unit: 'Item',
    quantity: '1.50', unit_price: '3.03', discount: '0.00',
    gst_applicable: false, super_applicable: false,
  };
  const input = {
    external, ...(external ? {} : { pharmacy: 9, shift_ids: [11] }),
    gst_registered: false, super_rate_snapshot: '0.00', line_items: [line],
  };
  response = {
    line_items: [{ ...line, origin: 'custom', custom_index: 0, total: external ? '4.54' : '4.55' }],
    subtotal: external ? '4.54' : '74.55', gst_amount: '0.00', super_amount: '0.00', total: external ? '4.54' : '74.55',
  };
  expect(await invoices.previewGeneratedInvoice(input)).toEqual(response);
  expect(requests).toHaveLength(1);
  const { url, options } = requests[0];
  expect(url.pathname).toBe('/api/v1/invoices/generate/preview/');
  expect(options.method).toBe('POST');
  expect(new Headers(options.headers).get('Authorization')).toBe('Bearer worker-token');
  expect(JSON.parse(String(options.body))).toEqual(input);
  expect(options.redirect).toBe('error');
});

it('generation still sends the established multipart fields to the existing save endpoint', async () => {
  response = { id: 81, total: '70.00', super_amount: '8.40' };
  const body = new FormData();
  body.append('gst_registered', 'false');
  body.append('super_rate_snapshot', '12.00');
  body.append('shift_ids', '[11]');
  body.append('line_items', '[]');
  expect(await invoices.generateInvoice(body)).toEqual(response);
  expect(requests).toHaveLength(1);
  expect(requests[0].url.pathname).toBe('/api/v1/invoices/generate/');
  expect(requests[0].options.method).toBe('POST');
  expect(requests[0].options.body).toBe(body);
  expect(new Headers(requests[0].options.headers).get('Content-Type')).toBeNull();
});
