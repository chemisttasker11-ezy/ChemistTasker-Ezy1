import { afterEach, describe, expect, it, vi } from 'vitest';
import { configureApi, logoutSession } from './api';

afterEach(() => {
  vi.unstubAllGlobals();
});

function configure(fetchImpl: typeof fetch) {
  vi.stubGlobal('fetch', fetchImpl);
  configureApi({
    baseURL: 'https://example.test/api',
    credentials: 'omit',
    getToken: async () => 'should-not-be-used',
  });
}

describe('logoutSession', () => {
  it('uses browser cookies and CSRF without exposing a refresh token', async () => {
    const fetchImpl = vi.fn(async () => Response.json({ detail: 'Logged out.' })) as unknown as typeof fetch;
    configure(fetchImpl);

    await logoutSession({ isBrowser: true, csrfToken: 'csrf-value', refreshToken: 'hidden-refresh' });

    expect(fetchImpl).toHaveBeenCalledOnce();
    const [url, init] = vi.mocked(fetchImpl).mock.calls[0];
    expect(String(url)).toBe('https://example.test/api/users/logout/');
    expect(init?.credentials).toBe('include');
    expect(init?.body).toBe('{}');
    expect(new Headers(init?.headers).get('X-CSRFToken')).toBe('csrf-value');
    expect(new Headers(init?.headers).get('X-Client-Platform')).toBe('web');
    expect(new Headers(init?.headers).has('Authorization')).toBe(false);
  });

  it('uses the explicit native refresh token without cookies', async () => {
    const fetchImpl = vi.fn(async () => Response.json({ detail: 'Logged out.' })) as unknown as typeof fetch;
    configure(fetchImpl);

    await logoutSession({ refreshToken: 'native-refresh' });

    const [, init] = vi.mocked(fetchImpl).mock.calls[0];
    expect(init?.credentials).toBe('omit');
    expect(JSON.parse(String(init?.body))).toEqual({ refresh: 'native-refresh' });
    expect(new Headers(init?.headers).get('X-Client-Platform')).toBe('mobile');
    expect(new Headers(init?.headers).has('X-CSRFToken')).toBe(false);
    expect(new Headers(init?.headers).has('Authorization')).toBe(false);
  });
});
