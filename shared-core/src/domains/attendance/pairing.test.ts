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

describe('PR-C authenticated web pairing uses the existing mobile-compatible operations', () => {
    it.each(['web', 'mobile'] as const)('GET supports explicit %s platform and manager authentication', async (platform) => {
        const result = await attendance.getKioskPairingOptions(platform);
        expect(result.pharmacies).toEqual([{ id: 9, name: 'Test Pharmacy', timezone: 'Australia/Brisbane' }]);
        expect(fetchMock).toHaveBeenCalledTimes(1);
        const [url, request] = fetchMock.mock.calls[0];
        expect(String(url)).toBe('https://example.test/api/v1/attendance/kiosk/pairing/request/');
        expect(request.method).toBe('GET');
        expect(request.body).toBeUndefined();
        expect(new Headers(request.headers).get('X-Client-Platform')).toBe(platform);
        expect(new Headers(request.headers).get('Authorization')).toBe('Bearer pairing-owner-token');
    });

    it.each(['web', 'mobile'] as const)('POST supports explicit %s without changing payload or code/expiry response', async (platform) => {
        fetchMock.mockResolvedValue(new Response(JSON.stringify({ pairing_code: '012345', expires_in_seconds: 900 }), {
            headers: { 'content-type': 'application/json' },
        }));
        const result = await attendance.createKioskPairingCode(9, 'Front counter', platform);
        expect(result).toEqual({ pairing_code: '012345', expires_in_seconds: 900 });
        expect(fetchMock).toHaveBeenCalledTimes(1);
        const [url, request] = fetchMock.mock.calls[0];
        expect(String(url)).toBe('https://example.test/api/v1/attendance/kiosk/pairing/request/');
        expect(request.method).toBe('POST');
        expect(JSON.parse(String(request.body))).toEqual({ pharmacy_id: 9, device_name: 'Front counter' });
        expect(new Headers(request.headers).get('X-Client-Platform')).toBe(platform);
        expect(new Headers(request.headers).get('Authorization')).toBe('Bearer pairing-owner-token');
    });

    it('web calls do not change the default mobile platform for subsequent callers', async () => {
        await attendance.getKioskPairingOptions('web');
        await attendance.getKioskPairingOptions();
        await attendance.createKioskPairingCode(9, 'Web', 'web');
        await attendance.createKioskPairingCode(9, 'Mobile');
        expect(fetchMock.mock.calls.map(([, request]) => new Headers(request.headers).get('X-Client-Platform')))
            .toEqual(['web', 'mobile', 'web', 'mobile']);
    });

    it.each(['options', 'issuance'])('propagates forbidden %s without issuing a fallback request', async (operation) => {
        fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: 'Not a manager for this pharmacy.' }), {
            status: 403, headers: { 'content-type': 'application/json' },
        }));
        const request = operation === 'options'
            ? attendance.getKioskPairingOptions('web')
            : attendance.createKioskPairingCode(99, 'Forbidden counter', 'web');
        await expect(request).rejects.toMatchObject({ status: 403 });
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });
});
describe('Expo kiosk pairing consumes shared-core, not Windows kiosk Rust', () => {
    it('retains GET route and pharmacy list response', async () => {
        const result = await attendance.getKioskPairingOptions();
        expect(result.pharmacies[0].id).toBe(9);
        const [url, request] = fetchMock.mock.calls[0];
        expect((url as URL).pathname).toBe('/api/v1/attendance/kiosk/pairing/request/');
        expect(request.method ?? 'GET').toBe('GET');
        expect(new Headers(request.headers).get('X-Client-Platform')).toBe('mobile');
    });
    it('retains mobile pairing payload, code and expiry fields', async () => {
        const result = await attendance.createKioskPairingCode(9, 'Front counter');
        expect(result.pairing_code).toBe('123456');
        expect(result.expires_in_seconds).toBe(900);
        const [url, request] = fetchMock.mock.calls[0];
        expect((url as URL).pathname).toBe('/api/v1/attendance/kiosk/pairing/request/');
        expect(request.method).toBe('POST');
        expect(new Headers(request.headers).get('X-Client-Platform')).toBe('mobile');
        expect(JSON.parse(String(request.body))).toEqual({ pharmacy_id: 9, device_name: 'Front counter' });
    });
});
