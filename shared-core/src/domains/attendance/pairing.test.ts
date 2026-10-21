import { beforeEach, describe, expect, it, vi } from 'vitest';
import { configureApi } from '../../transport/application';
import { attendance } from './api';

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
    fetchMock = vi.fn(async () => new Response(JSON.stringify({
        pharmacies: [{ id: 9, name: 'Test Pharmacy', timezone: 'Australia/Brisbane' }],
        pairing_code: '123456', expires_in_seconds: 900,
    }), { headers: { 'content-type': 'application/json' } }));
    configureApi({
        baseURL: 'https://example.test/api/v1',
        getToken: () => 'pairing-owner-token',
        fetchImpl: fetchMock,
    });
});
describe('Expo kiosk pairing consumes shared-core, not Windows kiosk Rust', () => {
    it('retains GET route and pharmacy list response', async () => {
        const result = await attendance.getKioskPairingOptions();
        expect(result.pharmacies[0].id).toBe(9);
        const [url, request] = fetchMock.mock.calls[0];
        expect((url as URL).pathname).toBe('/api/v1/attendance/kiosk/pairing/request/');
        expect(request.method ?? 'GET').toBe('GET');
    });
    it('retains mobile pairing payload, code and expiry fields', async () => {
        const result = await attendance.createKioskPairingCode(9, 'Front counter');
        expect(result.pairing_code).toBe('123456');
        expect(result.expires_in_seconds).toBe(900);
        const [url, request] = fetchMock.mock.calls[0];
        expect((url as URL).pathname).toBe('/api/v1/attendance/kiosk/pairing/request/');
        expect(request.method).toBe('POST');
        expect(JSON.parse(String(request.body))).toEqual({ pharmacy_id: 9, device_name: 'Front counter' });
    });
});
