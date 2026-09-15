import { useState, useEffect, useCallback } from 'react';
import { Shift, fetchActiveShifts, fetchPosterShiftDetailService } from '@chemisttasker/shared-core';

interface UseShiftsDataParams {
    selectedPharmacyId: number | null;
    shiftId?: number | null;
}

export function useShiftsData({ selectedPharmacyId: _selectedPharmacyId, shiftId }: UseShiftsDataParams) {
    const [shifts, setShifts] = useState<Shift[]>([]);
    const [loading, setLoading] = useState(false);

    const loadShifts = useCallback(async () => {
        setLoading(true);
        try {
            if (shiftId != null) {
                const detail = await fetchPosterShiftDetailService(shiftId);
                setShifts(detail ? [detail] : []);
            } else {
                const data = await fetchActiveShifts();
                setShifts(data || []);
            }
        } catch (error) {
            console.error('Failed to load active shifts', error);
            setShifts([]);
        } finally {
            setLoading(false);
        }
    }, [shiftId]);

    useEffect(() => {
        loadShifts();
    }, [loadShifts]);

    return {
        shifts,
        setShifts,
        loading,
        loadShifts,
    };
}
