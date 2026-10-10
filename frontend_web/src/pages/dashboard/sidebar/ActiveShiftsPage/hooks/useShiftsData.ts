import { useState, useEffect, useCallback } from 'react';
import { Shift, fetchActiveShifts, fetchPosterShiftDetailService } from '@chemisttasker/shared-core';

interface UseShiftsDataParams {
    shiftId?: number | null;
}

export function useShiftsData({ shiftId }: UseShiftsDataParams) {
    const [shifts, setShifts] = useState<Shift[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const loadShifts = useCallback(async () => {
        setLoading(true);
        setError(null);
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
            setError('We could not load your active shifts.');
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
        error,
        loadShifts,
    };
}
