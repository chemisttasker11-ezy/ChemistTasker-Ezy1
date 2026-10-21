import { beforeEach, describe, expect, it, vi } from 'vitest';
import { configureApi } from '../../transport/application';
import { getMyMemberships, respondToMyMembership } from './api';

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn(async () => new Response(JSON.stringify({ results: [] }), {
    headers: { 'content-type': 'application/json' },
  }));
  configureApi({
    baseURL: 'https://example.test/api/v1',
    getToken: () => 'member-token',
    fetchImpl: fetchMock,
  });
});
describe('Vite and Expo membership decision parity', () => {
  it('retains existing GET listing route and JSON response shape', async () => {
    expect(await getMyMemberships()).toEqual({ results: [] });
    expect((fetchMock.mock.calls[0][0] as URL).pathname).toBe('/api/v1/my-memberships/');
    expect(new Headers(fetchMock.mock.calls[0][1].headers).get('Authorization')).toBe('Bearer member-token');
  });
  it.each(['accept', 'reject', 'quit'] as const)('preserves bodyless POST %s route', async action => {
    await respondToMyMembership(123, action);
    const [url, options] = fetchMock.mock.calls.at(-1)!;
    expect((url as URL).pathname).toBe(`/api/v1/my-memberships/123/${action}/`);
    expect(options.method).toBe('POST');
    expect(options.body).toBeUndefined();
    expect(new Headers(options.headers).get('Authorization')).toBe('Bearer member-token');
  });
});
