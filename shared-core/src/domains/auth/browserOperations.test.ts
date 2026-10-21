import { describe, it, expect, vi } from 'vitest';
import {
  browserLoginSession, browserVerifyEmailOtp, browserResendEmailOtp,
  browserRegisterAccount, browserRequestPasswordReset,
  browserSubmitReferee, browserRejectReferee, browserMagicMembershipInfo,
  browserSessionCurrentUser, browserWebSocketTicket, browserPublicTalentFeed,
} from './browserOperations';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json' },
});

describe('browser identity and public wire contract parity', () => {
  const make = (reply: (path: string) => unknown = () => ({})) => {
    const seen: { path: string; credentials?: RequestCredentials; method?: string; headers: Headers; body: string | null }[] = [];
    const fetchImpl = vi.fn(async (u: RequestInfo | URL, init?: RequestInit) => {
      const path = new URL(String(u)).pathname;
      seen.push({ path, credentials: init?.credentials, method: init?.method ?? 'GET',
        headers: new Headers(init?.headers), body: typeof init?.body === 'string' ? init.body : null });
      return json(reply(path));
    }) as unknown as typeof fetch;
    return { seen, options: { baseUrl: 'https://example.test/api/v1', fetchImpl } };
  };
  it('browser login obtains CSRF and posts web-labelled credentials with cookies', async () => {
    const { seen, options } = make(path => path.endsWith('csrf/') ? { csrfToken: 'csrf-browser' } : { access: 'jwt', user: { id: 7 } });
    expect((await browserLoginSession(options, { email: 'test@example.test', password: 'secret', remember_me: true })).access).toBe('jwt');
    expect(seen.map(s => s.path)).toEqual(['/api/v1/users/csrf/', '/api/v1/users/login/']);
    expect(seen.map(s => s.credentials)).toEqual(['include', 'include']);
    expect(seen[1].headers.get('X-CSRFToken')).toBe('csrf-browser');
    expect(seen[1].headers.get('X-Client-Platform')).toBe('web');
    expect(JSON.parse(seen[1].body!)).toEqual({ email: 'test@example.test', password: 'secret', remember_me: true });
    expect(seen.every(s => !s.headers.has('Authorization'))).toBe(true);
  });
  it('email verification has explicit CSRF but resend retains the historical browser-only header', async () => {
    const { seen, options } = make(path => path.endsWith('csrf/') ? { csrfToken: 'csrf' } : {});
    await browserVerifyEmailOtp(options, 'test@example.test', '123456');
    await browserResendEmailOtp(options, 'test@example.test');
    expect(seen[1].headers.get('X-CSRFToken')).toBe('csrf');
    expect(seen[2].headers.get('X-CSRFToken')).toBe(null);
    expect(seen[2].headers.get('X-Client-Platform')).toBe('web');
    expect(seen[2].credentials).toBe('include');
  });
  it('public signup, reset and referee calls never leak bearer or cross-origin cookies', async () => {
    const { seen, options } = make();
    await browserRegisterAccount(options, { email: 'e@test.invalid' });
    await browserRequestPasswordReset(options, 'e@test.invalid');
    await browserSubmitReferee(options, 'invite-token', { referee_name: 'John' });
    await browserRejectReferee(options, '7', '2');
    await browserMagicMembershipInfo(options, 'invite-token');
    expect(seen.map(s => s.path)).toEqual([
      '/api/v1/users/register/', '/api/v1/users/password-reset/',
      '/api/v1/onboarding/submit-reference/invite-token/',
      '/api/v1/onboarding/referee-reject/7/2/',
      '/api/v1/magic/memberships/invite-token/',
    ]);
    expect(seen.every(s => s.credentials === 'same-origin' && !s.headers.has('Authorization'))).toBe(true);
  });
  it('cookie-only current-user bootstrap does not refresh while bearer reads keep their access header', async () => {
    const { seen, options } = make(() => ({ id: 44, role: 'OWNER' }));
    expect((await browserSessionCurrentUser(options))?.id).toBe(44);
    await browserSessionCurrentUser(options, 'old-bearer');
    expect(seen.every(s => s.credentials === 'include')).toBe(true);
    expect(seen[0].headers.has('Authorization')).toBe(false);
    expect(seen[1].headers.get('Authorization')).toBe('Bearer old-bearer');
  });
  it('a 401 session is treated as anonymous; other errors do not impersonate anonymous', async () => {
    const options = { baseUrl: 'https://example.test/api/v1',
      fetchImpl: vi.fn(async () => json({ detail: 'No session' }, 401)) as unknown as typeof fetch };
    expect(await browserSessionCurrentUser(options)).toBeNull();
    options.fetchImpl = vi.fn(async () => json({ detail: 'Backend unavailable' }, 503)) as unknown as typeof fetch;
    await expect(browserSessionCurrentUser(options)).rejects.toThrow('Your account is temporarily unavailable.');
  });
  it('websocket ticket uses the explicit bearer and preserves a body-object POST', async () => {
    const { seen, options } = make(() => ({ ticket: 'ws-secret' }));
    expect(await browserWebSocketTicket(options, 'access')).toBe('ws-secret');
    expect(seen[0].headers.get('Authorization')).toBe('Bearer access');
    expect(seen[0].body).toBe('{}');
  });
  it('public talent uses the anonymous paginated route', async () => {
    const { seen, options } = make(() => ({ results: [{ id: 3 }] }));
    await browserPublicTalentFeed(options, 3, 200);
    expect(seen[0].path).toBe('/api/v1/explorer-posts/public-feed/');
    expect(seen[0].headers.has('Authorization')).toBe(false);
  });
});
