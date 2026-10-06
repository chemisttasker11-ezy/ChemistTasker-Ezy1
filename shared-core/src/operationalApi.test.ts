import { afterEach, describe, expect, it, vi } from 'vitest';
import { attendance, configureApi, financeApi, rosterV2, workforce } from './api';

const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), {
  status,
  headers: { 'content-type': 'application/json' },
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function configure(fetchImpl: typeof fetch) {
  vi.stubGlobal('fetch', fetchImpl);
  configureApi({
    baseURL: 'https://example.test/api/v1',
    credentials: 'include',
    getToken: async () => 'operational-token',
  });
}

describe('authenticated operational api.ts domains', () => {
  it('owns attendance and roster v2 calls with the established authenticated core', async () => {
    const calls: Array<{ url: string; method: string; authorization: string | null }> = [];
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({
        url: String(input),
        method: init?.method ?? 'GET',
        authorization: new Headers(init?.headers).get('Authorization'),
      });
      return json({ status: 'ok' });
    }) as unknown as typeof fetch;
    configure(fetchImpl);

    await attendance.updatePin(2, '1234');
    await attendance.approve(3, 'Roster confirmed');
    await rosterV2.copyWeek({ source_period_id: 4, target_week_start: '2026-09-21' });
    await rosterV2.approveReplacement(5, 6);

    expect(calls).toEqual([
      { url: 'https://example.test/api/v1/v1/attendance/worker/pin/update/', method: 'POST', authorization: 'Bearer operational-token' },
      { url: 'https://example.test/api/v1/v1/attendance/manager/approve/', method: 'POST', authorization: 'Bearer operational-token' },
      { url: 'https://example.test/api/v1/v1/attendance/roster/copy-week/', method: 'POST', authorization: 'Bearer operational-token' },
      { url: 'https://example.test/api/v1/v1/attendance/roster/manager/approve-replacement/', method: 'POST', authorization: 'Bearer operational-token' },
    ]);
  });

  it('owns per-shift roster unpublish and republish through shared-core', async () => {
    const calls: Array<{ url: string; method: string; body: string | null }> = [];
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({
        url: String(input),
        method: init?.method ?? 'GET',
        body: typeof init?.body === 'string' ? init.body : null,
      });
      return json({ status: 'ok' });
    }) as unknown as typeof fetch;
    configure(fetchImpl);

    await rosterV2.unpublishShift(7);
    await rosterV2.republishShift(7, 'team');

    expect(calls).toEqual([
      { url: 'https://example.test/api/v1/v1/attendance/roster/shift/unpublish/', method: 'POST', body: JSON.stringify({ slot_id: 7 }) },
      { url: 'https://example.test/api/v1/v1/attendance/roster/shift/republish/', method: 'POST', body: JSON.stringify({ slot_id: 7, notify: 'team' }) },
    ]);
  });

  it('uses one reviewed publication contract from both roster facades', async () => {
    const calls: Array<{ url: string; body: string }> = [];
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({url: String(input), body: String(init?.body)});
      return json({status: 'PUBLISHED', period_id: 7});
    }) as unknown as typeof fetch;
    configure(fetchImpl);
    const command = {
      period_id: 7, expected_revision: 3,
      operation_id: '6f581c55-693b-4f91-8651-76f210c22157',
      acknowledged_warning_keys: ['reviewed-warning'],
    };
    await rosterV2.publish(command);
    await workforce.publishRoster(command);
    expect(calls).toEqual(Array.from({length: 2}, () => ({
      url: 'https://example.test/api/v1/v1/workforce/roster/publish/',
      body: JSON.stringify(command),
    })));
  });

  it('refreshes once after a 401 and retries the authenticated operational request', async () => {
    const calls: Array<{ authorization: string | null; body: string | null }> = [];
    const refreshToken = vi.fn(async () => 'refreshed-token');
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({
        authorization: new Headers(init?.headers).get('Authorization'),
        body: typeof init?.body === 'string' ? init.body : null,
      });
      if (calls.length === 1) {
        return json({ detail: 'Token expired.' }, 401);
      }
      return json({ status: 'ok' });
    }) as unknown as typeof fetch;

    vi.stubGlobal('fetch', fetchImpl);
    configureApi({
      baseURL: 'https://example.test/api/v1',
      credentials: 'include',
      getToken: async () => 'expired-token',
      refreshToken,
    });

    await attendance.clockOut('qr-token');

    expect(refreshToken).toHaveBeenCalledTimes(1);
    expect(calls).toEqual([
      { authorization: 'Bearer expired-token', body: JSON.stringify({ qr_token: 'qr-token' }) },
      { authorization: 'Bearer refreshed-token', body: JSON.stringify({ qr_token: 'qr-token' }) },
    ]);
  });

  it('owns workforce, employment engagement and timesheet calls in api.ts', async () => {
    const calls: Array<{ url: string; method: string }> = [];
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), method: init?.method ?? 'GET' });
      return json([]);
    }) as unknown as typeof fetch;
    configure(fetchImpl);

    await workforce.getRosterWorkspace(2, '2026-09-21');
    await workforce.createLeave({ membership_id: 3, leave_type: 'ANNUAL', start_at: '2026-09-21T09:00:00Z', end_at: '2026-09-21T17:00:00Z' });
    await workforce.submitTimesheet(4, 5);
    await workforce.previewEmploymentEngagementAward({ membership_id: 7, employment_type: 'FULL_TIME', award_classification: 'PHARMACIST' });

    expect(calls).toEqual([
      { url: 'https://example.test/api/v1/v1/workforce/roster/workspace/?pharmacy_id=2&week_start=2026-09-21', method: 'GET' },
      { url: 'https://example.test/api/v1/v1/workforce/leave/', method: 'POST' },
      { url: 'https://example.test/api/v1/v1/workforce/timesheets/4/submit/', method: 'POST' },
      { url: 'https://example.test/api/v1/v1/workforce/employment-engagements/award-preview/', method: 'POST' },
    ]);
  });

  it('keeps worker finance on the authenticated api.ts transport and inside the finance API boundary', async () => {
    const calls: Array<{ url: string; method: string; authorization: string | null; credentials?: RequestCredentials }> = [];
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({
        url: String(input),
        method: init?.method ?? 'GET',
        authorization: new Headers(init?.headers).get('Authorization'),
        credentials: init?.credentials,
      });
      return json({ id: 9, name: 'Test Pharmacy' });
    }) as unknown as typeof fetch;
    configure(fetchImpl);

    await financeApi.saveCustomer({
      name: 'Test Pharmacy',
      legal_name: '',
      abn: '',
      contact_name: '',
      email: 'accounts@example.test',
      phone: '',
      address: '',
      payment_terms_days: 7,
      notes: '',
      active: true,
    });

    expect(calls).toEqual([
      {
        url: 'https://example.test/api/v1/v1/finance/customers/',
        method: 'POST',
        authorization: 'Bearer operational-token',
        credentials: 'include',
      },
    ]);
  });

  it('rejects cross-origin and out-of-boundary finance pagination before sending credentials', async () => {
    const externalFetch = vi.fn(async () => json({
      count: 1,
      next: 'https://evil.example/api/v1/finance/customers/?page=2',
      previous: null,
      results: [{ id: 1 }],
    })) as unknown as typeof fetch;
    configure(externalFetch);

    await expect(financeApi.customers()).rejects.toThrow('Finance requests cannot leave the configured finance API.');
    expect(externalFetch).toHaveBeenCalledTimes(1);

    const escapedFetch = vi.fn(async () => json({
      count: 1,
      next: 'https://example.test/api/v1/users/me/',
      previous: null,
      results: [{ id: 1 }],
    })) as unknown as typeof fetch;
    configure(escapedFetch);

    await expect(financeApi.customers()).rejects.toThrow('Finance requests cannot leave the configured finance API.');
    expect(escapedFetch).toHaveBeenCalledTimes(1);
  });

  it('accepts same-origin finance pagination and preserves the authenticated core configuration', async () => {
    const calls: string[] = [];
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push(String(input));
      expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer operational-token');
      expect(init?.credentials).toBe('include');
      if (calls.length === 1) {
        return json({
          count: 2,
          next: 'https://example.test/api/v1/v1/finance/customers/?page=2',
          previous: null,
          results: [{ id: 1 }],
        });
      }
      return json({
        count: 2,
        next: null,
        previous: 'https://example.test/api/v1/v1/finance/customers/',
        results: [{ id: 2 }],
      });
    }) as unknown as typeof fetch;
    configure(fetchImpl);

    await expect(financeApi.customers()).resolves.toEqual([{ id: 1 }, { id: 2 }]);
    expect(calls).toEqual([
      'https://example.test/api/v1/v1/finance/customers/',
      'https://example.test/api/v1/v1/finance/customers/?page=2',
    ]);
  });

  it('returns finance PDFs as blobs through the shared authenticated request engine', async () => {
    const pdf = new Blob(['%PDF-test'], { type: 'application/pdf' });
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe('https://example.test/api/v1/v1/finance/invoices/7/pdf/');
      expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer operational-token');
      return new Response(pdf, { status: 200, headers: { 'content-type': 'application/pdf' } });
    }) as unknown as typeof fetch;
    configure(fetchImpl);

    const result = await financeApi.pdf(7);
    expect(result).toBeInstanceOf(Blob);
    expect(await result.text()).toBe('%PDF-test');
  });

  it('keeps receipt uploads multipart without forcing a JSON content type', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe('https://example.test/api/v1/v1/finance/expenses/8/receipts/');
      const headers = new Headers(init?.headers);
      expect(headers.get('Authorization')).toBe('Bearer operational-token');
      expect(headers.has('Content-Type')).toBe(false);
      expect(init?.body).toBeInstanceOf(FormData);
      return json({ id: 9, filename: 'receipt.pdf' }, 201);
    }) as unknown as typeof fetch;
    configure(fetchImpl);

    await financeApi.uploadReceipt(8, new Blob(['receipt'], { type: 'application/pdf' }), 'receipt.pdf');
  });

  it('uses the common API error parser for finance failures', async () => {
    const fetchImpl = vi.fn(async () => json({ detail: 'Invoice version is stale.' }, 409)) as unknown as typeof fetch;
    configure(fetchImpl);

    await expect(financeApi.issue(4, 1)).rejects.toThrow('Invoice version is stale.');
  });

});
