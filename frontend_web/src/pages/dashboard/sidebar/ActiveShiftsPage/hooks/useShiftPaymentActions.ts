import { useState, useCallback } from 'react';
import { chargeShiftFulfillment, resumeFulfillmentCheckout, expireFulfillmentCheckout, payShiftWithPills, type Shift } from '@chemisttasker/shared-core';

export function useShiftPaymentActions(loadShifts: () => Promise<void>, showSnackbar: (message: string) => void) {
    const [checkoutConflict, setCheckoutConflict] = useState<{ shift: Shift; offerIds: number[]; checkoutId: string } | null>(null);
    const [checkoutRecovering, setCheckoutRecovering] = useState(false);
    const [pillPayingShiftId, setPillPayingShiftId] = useState<number | null>(null);
    const [paymentSlotSelection, setPaymentSlotSelection] = useState<Record<number, number[]>>({});
    const handlePayWithPills = useCallback(async (shift: Shift, offerIds: number[] = []) => {
        setPillPayingShiftId(shift.id);
        try {
            const res = await payShiftWithPills(shift.id, offerIds);
            showSnackbar(res?.detail || 'Shift paid with pills.');
            await loadShifts();
        } catch (err: any) {
            console.error(err);
            const data = err?.response?.data ?? err?.payload;
            const detail = Array.isArray(data?.detail) ? data.detail[0] : data?.detail;
            const message = data?.code === 'insufficient_pills'
                ? `Not enough pills. You have ${data?.balance ?? 0}; this shift needs ${data?.required ?? 'more'} pills.`
                : detail || err?.message || 'Failed to pay with pills.';
            showSnackbar(message);
        } finally {
            setPillPayingShiftId(null);
        }
    }, [loadShifts, showSnackbar]);

    const handlePayWithStripe = useCallback(async (shift: Shift, offerIds: number[] = []) => {
        try {
            const res = await chargeShiftFulfillment(shift.id, { offerIds });
            if (res?.url) {
                window.location.href = res.url;
            } else if (res?.free) {
                showSnackbar(res?.message || 'Shift finalized without payment.');
                await loadShifts();
            } else {
                showSnackbar('Payment session was not returned.');
            }
        } catch (err: any) {
            const data = err?.response?.data ?? err?.payload;
            if (err?.status === 409 && data?.checkout_id) {
                setCheckoutConflict({ shift, offerIds, checkoutId: data.checkout_id });
            } else {
                showSnackbar(err?.message || 'Failed to initiate payment.');
            }
        }
    }, [loadShifts, showSnackbar]);
    const recoverCheckout = useCallback(async (action: 'resume' | 'expire') => {
        if (!checkoutConflict) return;
        setCheckoutRecovering(true);
        try {
            const { shift, checkoutId, offerIds } = checkoutConflict;
            if (action === 'resume') {
                const result = await resumeFulfillmentCheckout(shift.id, checkoutId);
                window.location.href = result.url;
            } else {
                await expireFulfillmentCheckout(shift.id, checkoutId);
                setCheckoutConflict(null);
                await handlePayWithStripe(shift, offerIds);
            }
        } catch (err: any) {
            showSnackbar(err?.message || 'Checkout recovery could not be confirmed.');
        } finally {
            setCheckoutRecovering(false);
        }
    }, [checkoutConflict, handlePayWithStripe, showSnackbar]);
    return { checkoutConflict, setCheckoutConflict, checkoutRecovering, recoverCheckout,
        pillPayingShiftId, paymentSlotSelection, setPaymentSlotSelection, handlePayWithPills, handlePayWithStripe };
}
