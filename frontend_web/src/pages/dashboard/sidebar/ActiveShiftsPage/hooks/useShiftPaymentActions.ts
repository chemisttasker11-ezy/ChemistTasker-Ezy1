import { useState, useCallback } from 'react';
import { chargeShiftFulfillment, payShiftWithPills, type Shift } from '@chemisttasker/shared-core';

export function useShiftPaymentActions(loadShifts: () => Promise<void>, showSnackbar: (message: string) => void) {
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
        } catch (err) {
            console.error(err);
            showSnackbar('Failed to initiate payment.');
        }
    }, [loadShifts, showSnackbar]);
    return { pillPayingShiftId, paymentSlotSelection, setPaymentSlotSelection, handlePayWithPills, handlePayWithStripe };
}
