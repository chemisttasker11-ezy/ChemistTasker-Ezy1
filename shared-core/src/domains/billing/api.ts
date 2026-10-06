/** Domain-owned operations extracted from the established shared API. */
import { fetchApi } from '../../transport/application';
export function createSubscriptionCheckout(payload: {
    staffCount: number;
    paymentMethod: 'card' | 'invoice';
}) {
    return fetchApi('/billing/subscribe/', {
        method: 'POST',
        body: JSON.stringify({
            staff_count: payload.staffCount,
            payment_method: payload.paymentMethod
        })
    });
}
export function getCurrentSubscription(pharmacyId?: number | string) {
    const query = pharmacyId ? `?pharmacy_id=${pharmacyId}` : '';
    return fetchApi(`/billing/subscription/${query}`);
}
export function updateSubscriptionSeats(payload: {
    staffCount: number;
    pharmacyId?: number | string;
}) {
    return fetchApi('/billing/subscription/seats/', {
        method: 'POST',
        body: JSON.stringify({
            staff_count: payload.staffCount,
            pharmacy_id: payload.pharmacyId
        })
    });
}
export function chargeShiftFulfillment(shiftId: number | string) {
    return fetchApi(`/billing/charge-fulfillment/${shiftId}/`, {
        method: 'POST'
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
