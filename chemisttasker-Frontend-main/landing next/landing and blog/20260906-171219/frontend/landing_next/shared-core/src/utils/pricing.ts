/**
 * ChemistTasker Pricing Logic
 * This module is imported by both the Frontend (to show prices)
 * and the Backend (to generate Stripe invoices/checkout sessions).
 */

export const PRICING_CONSTANTS = {
    SUBSCRIPTION_BASE: 30, // AUD
    SUBSCRIPTION_BASE_STAFF_LIMIT: 5,
    SUBSCRIPTION_EXTRA_STAFF_FEE: 5, // AUD per additional staff

    SHIFT_PT_FT_STANDARD: 80, // AUD
    SHIFT_PT_FT_SUBSCRIBER: 40, // 50% discount

    SHIFT_LOCUM_STANDARD: 30, // AUD
    SHIFT_LOCUM_SUBSCRIBER: 15, // 50% discount

    PENALTY_RATE_24_HR: 0.20, // 20%
    PENALTY_RATE_72_HR: 0.10, // 10%
};

/**
 * Calculates the total monthly cost for a subscription based on staff count.
 */
export function calculateSubscriptionCost(staffCount: number): number {
    if (staffCount <= PRICING_CONSTANTS.SUBSCRIPTION_BASE_STAFF_LIMIT) {
        return PRICING_CONSTANTS.SUBSCRIPTION_BASE;
    }
    const extraStaff = staffCount - PRICING_CONSTANTS.SUBSCRIPTION_BASE_STAFF_LIMIT;
    return PRICING_CONSTANTS.SUBSCRIPTION_BASE + (extraStaff * PRICING_CONSTANTS.SUBSCRIPTION_EXTRA_STAFF_FEE);
}

/**
 * Calculates the exact fee to charge an owner when a shift is successfully filled.
 */
export function calculateFulfillmentFee(
    shiftType: 'locum' | 'pt-ft',
    isSubscriber: boolean
): number {
    if (shiftType === 'pt-ft') {
        return isSubscriber
            ? PRICING_CONSTANTS.SHIFT_PT_FT_SUBSCRIBER
            : PRICING_CONSTANTS.SHIFT_PT_FT_STANDARD;
    }

    if (shiftType === 'locum') {
        return isSubscriber
            ? PRICING_CONSTANTS.SHIFT_LOCUM_SUBSCRIBER
            : PRICING_CONSTANTS.SHIFT_LOCUM_STANDARD;
    }

    return 0;
}

/**
 * Calculates the cancellation penalty when an owner deletes an already-filled shift.
 * Total expected wage of the worker * penalty percentage based on timeline.
 */
export function calculateCancellationPenalty(
    shiftStartTime: Date,
    cancelledAtTime: Date,
    workerExpectedWageTotal: number
): number {
    const diffInMs = shiftStartTime.getTime() - cancelledAtTime.getTime();
    const diffInHours = diffInMs / (1000 * 60 * 60);

    // If the shift is already in the past, or cancelled extremely late
    if (diffInHours < 0) return 0;

    // Cancelled within 24 hours of start
    if (diffInHours <= 24) {
        return workerExpectedWageTotal * PRICING_CONSTANTS.PENALTY_RATE_24_HR;
    }

    // Cancelled within 72 hours of start
    if (diffInHours <= 72) {
        return workerExpectedWageTotal * PRICING_CONSTANTS.PENALTY_RATE_72_HR;
    }

    // Cancelled > 72 hours out
    return 0;
}
