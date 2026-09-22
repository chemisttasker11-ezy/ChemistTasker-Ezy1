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
    baseURL: 'https://example.test/api',
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
      { url: 'https://example.test/api/client-profile/attendance/worker/pin/update/', method: 'POST', authorization: 'Bearer operational-token' },
      { url: 'https://example.test/api/client-profile/attendance/manager/approve/', method: 'POST', authorization: 'Bearer operational-token' },
      { url: 'https://example.test/api/client-profile/attendance/roster/copy-week/', method: 'POST', authorization: 'Bearer operational-token' },
      { url: 'https://example.test/api/client-profile/attendance/roster/manager/approve-replacement/', method: 'POST', authorization: 'Bearer operational-token' },
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
      { url: 'https://example.test/api/client-profile/workforce/roster/workspace/?pharmacy_id=2&week_start=2026-09-21', method: 'GET' },
      { url: 'https://example.test/api/client-profile/workforce/leave/', method: 'POST' },
      { url: 'https://example.test/api/client-profile/workforce/timesheets/4/submit/', method: 'POST' },
      { url: 'https://example.test/api/client-profile/workforce/employment-engagements/award-preview/', method: 'POST' },
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
        url: 'https://example.test/api/client-profile/finance/customers/',
        method: 'POST',
        authorization: 'Bearer operational-token',
        credentials: 'include',
      },
    ]);
  });
});
