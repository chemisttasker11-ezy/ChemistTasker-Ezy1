import { it, expect, vi } from 'vitest';
import { configureApi } from '../../transport/application';
import { registerPushDeviceToken } from './api';

it('registers the mobile OS push token through the same authenticated endpoint and body', async () => {
  const seen: unknown[] = [];
  configureApi({
    baseURL: 'https://example.test/api/v1', getToken: () => 'native-access', credentials: 'omit',
    fetchImpl: vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      seen.push({ url: String(url), method: init?.method, body: JSON.parse(String(init?.body)),
        bearer: new Headers(init?.headers).get('Authorization'), credentials: init?.credentials });
      return new Response('{}', { headers: { 'content-type': 'application/json' } });
    }) as unknown as typeof fetch,
  });
  await registerPushDeviceToken('expo-push-token', 'android');
  expect(seen).toEqual([{ url: 'https://example.test/api/v1/device-tokens/', method: 'POST',
    body: { token: 'expo-push-token', platform: 'android' }, bearer: 'Bearer native-access', credentials: 'omit' }]);
});
