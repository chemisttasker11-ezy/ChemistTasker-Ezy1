import { beforeEach, describe, expect, it, vi } from 'vitest';
import { configureApi } from '../../transport/application';
import { createSubscriptionCheckout, getCurrentSubscription, updateSubscriptionSeats } from './api';

let fetchMock: ReturnType<typeof vi.fn>;
function body(index = -1): Record<string, unknown> {
    const call = index < 0 ? fetchMock.mock.calls.at(-1) : fetchMock.mock.calls[index];
    return JSON.parse(String(call[1].body));
}
function url(index = -1): URL {
    const call = index < 0 ? fetchMock.mock.calls.at(-1) : fetchMock.mock.calls[index];
    return call[0] as URL;
}
beforeEach(() => {
    fetchMock = vi.fn(async () => new Response(JSON.stringify({
        exists: true, active: true, status: 'active', staffCount: 5, extraSeatCount: 0,
        url: 'https://checkout.example.test', message: 'Created',
    }), { headers: { 'content-type': 'application/json' } }));
    configureApi({ baseURL: 'https://example.test/api/v1', getToken: () => 'test', fetchImpl: fetchMock });
});
describe('billing account contract preserves platform return destination', () => {
    it('web checkout stays unchanged without an explicit platform', async () => {
        await createSubscriptionCheckout({ staffCount: 5, paymentMethod: 'card' });
        expect(url().pathname).toBe('/api/v1/billing/subscribe/');
        expect(body()).toEqual({ staff_count: 5, payment_method: 'card' });
    });
    it('Expo checkout conveys mobile destination to Django instead of silently dropping it', async () => {
        await createSubscriptionCheckout({ staffCount: 5, paymentMethod: 'card', platform: 'mobile' });
        expect(body()).toEqual({ staff_count: 5, payment_method: 'card', platform: 'mobile' });
    });
    it('shared subscription GET retains the optional pharmacy query', async () => {
        const data = await getCurrentSubscription();
        expect(data.active).toBe(true);
        expect(url().pathname).toBe('/api/v1/billing/subscription/');
        expect(url().search).toBe('');
        await getCurrentSubscription(13);
        expect(url().searchParams.get('pharmacy_id')).toBe('13');
    });
    it('Vite seat update sends identical data and does not invent a platform or pharmacy', async () => {
        await updateSubscriptionSeats({ staffCount: 8 });
        expect(url().pathname).toBe('/api/v1/billing/subscription/seats/');
        expect(body()).toEqual({ staff_count: 8 });
    });
    it('Expo seats keep mobile checkout redirects on the native app', async () => {
        await updateSubscriptionSeats({ staffCount: 8, platform: 'mobile' });
        expect(body()).toEqual({ staff_count: 8, platform: 'mobile' });
        await updateSubscriptionSeats({ staffCount: 8, pharmacyId: 13, platform: 'mobile' });
        expect(body()).toEqual({ staff_count: 8, pharmacy_id: 13, platform: 'mobile' });
    });
});
