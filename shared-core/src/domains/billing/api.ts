/** Domain-owned operations extracted from the established shared API. */
import { fetchApi } from '../../transport/application';
export interface BillingSubscriptionSnapshot {
    exists?: boolean;
    active: boolean;
    status: string;
    staffCount: number;
    extraSeatCount: number;
    stripeCustomerId?: string | null;
    stripeSubscriptionId?: string | null;
    currentPeriodEnd?: string | null;
    accountName?: string;
}
export interface BillingCheckoutResponse { url?: string; message?: string; subscription_id?: string; }
export function createSubscriptionCheckout(payload: {
    staffCount: number;
    paymentMethod: 'card' | 'invoice';
    platform?: 'web' | 'mobile';
}) {
    return fetchApi<BillingCheckoutResponse>('/billing/subscribe/', {
        method: 'POST',
        body: JSON.stringify({
            staff_count: payload.staffCount,
            payment_method: payload.paymentMethod,
            ...(payload.platform ? { platform: payload.platform } : {}),
        })
    });
}
export function getCurrentSubscription(pharmacyId?: number | string) {
    const query = pharmacyId ? `?pharmacy_id=${pharmacyId}` : '';
    return fetchApi<BillingSubscriptionSnapshot>(`/billing/subscription/${query}`);
}
export function updateSubscriptionSeats(payload: {
    staffCount: number;
    pharmacyId?: number | string;
    platform?: 'web' | 'mobile';
}) {
    return fetchApi<BillingCheckoutResponse>('/billing/subscription/seats/', {
        method: 'POST',
        body: JSON.stringify({
            staff_count: payload.staffCount,
            ...(payload.pharmacyId != null ? { pharmacy_id: payload.pharmacyId } : {}),
            ...(payload.platform ? { platform: payload.platform } : {}),
        })
    });
}
export function chargeShiftFulfillment(shiftId: number | string, payload?: { offerIds?: number[]; platform?: 'mobile' | 'web' }) {
    // The backend requires an explicit offer selection via offer_ids.
    return fetchApi<{ url?: string; free?: boolean; message?: string }>(`/billing/charge-fulfillment/${shiftId}/`, {
        method: 'POST',
        ...(payload ? { body: JSON.stringify({
            ...(payload.offerIds?.length ? { offer_ids: payload.offerIds } : {}),
            ...(payload.platform ? { platform: payload.platform } : {})
        }) } : {})
    });
}
export function chargeShiftPenalty(shiftId: number | string, payload: {
    hours: number;
}) {
    return fetchApi(`/billing/charge-penalty/${shiftId}/`, {
        method: 'POST',
        body: JSON.stringify({ hours: payload.hours })
    });
}
