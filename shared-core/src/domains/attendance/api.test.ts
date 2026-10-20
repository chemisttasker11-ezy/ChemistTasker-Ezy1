import { beforeEach, describe, expect, it, vi } from 'vitest';
import { configureApi } from '../../transport/application';
import { attendance } from './api';

let mockedFetch: ReturnType<typeof vi.fn>;
beforeEach(() => {
    mockedFetch = vi.fn(async () => new Response(JSON.stringify({
        pharmacies: [{ id: 14, name: 'North', timezone: 'Australia/Brisbane' }],
        pairing_code: '123456', expires_in_seconds: 900, pharmacy_id: 14,
    }), { headers: { 'content-type': 'application/json' } }));
    configureApi({ baseURL: 'https://example.test/api/v1', getToken: () => 'token', fetchImpl: mockedFetch });
});
describe('kiosk manager pairing request remains manager-authorized API, never native key material', () => {
    it('GET lists scoped pharmacies and POST retains device identity fields', async () => {
        const pharmacies = await attendance.getKioskPairingPharmacies();
        expect(pharmacies.pharmacies).toEqual([{ id: 14, name: 'North', timezone: 'Australia/Brisbane' }]);
        const code = await attendance.requestKioskPairingCode(14, 'Front counter');
        expect(code).toMatchObject({ pairing_code: '123456', expires_in_seconds: 900 });
        const [get, post] = mockedFetch.mock.calls;
        expect((get[0] as URL).pathname).toBe('/api/v1/attendance/kiosk/pairing/request/');
        expect(get[1].method).toBe('GET');
        expect((post[0] as URL).pathname).toBe('/api/v1/attendance/kiosk/pairing/request/');
        expect(post[1].method).toBe('POST');
        expect(JSON.parse(post[1].body)).toEqual({ pharmacy_id: 14, device_name: 'Front counter' });
        expect(JSON.stringify(post[1].body)).not.toContain('private_signing_key');
    });
});
