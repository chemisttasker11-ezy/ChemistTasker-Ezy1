import { useState, useEffect, useCallback, useRef } from 'react';
import { Shift, fetchActiveShifts, fetchPosterShiftDetailService } from '@chemisttasker/shared-core';

interface UseShiftsDataParams {
    selectedPharmacyId: number | null;
    shiftId?: number | null;
}

export function useShiftsData({ selectedPharmacyId, shiftId }: UseShiftsDataParams) {
    const [shifts, setShifts] = useState<Shift[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);
    const requestVersion = useRef(0);

    const loadShifts = useCallback(async () => {
        const version = ++requestVersion.current;
        setLoading(true);
        setError(false);
        try {
            let data: Shift[];
            if (shiftId != null) {
                const detail = await fetchPosterShiftDetailService(shiftId);
                data = detail ? [detail] : [];
            } else {
                data = await fetchActiveShifts();
            }
            if (version !== requestVersion.current) return;
            setShifts((data || []).filter((shift) => selectedPharmacyId == null ||
                Number(shift.pharmacyDetail?.id ?? shift.pharmacyId ?? shift.pharmacy) === selectedPharmacyId));
        } catch (error) {
            console.error('Failed to load active shifts', error);
            if (version === requestVersion.current) setError(true);
        } finally {
            if (version === requestVersion.current) setLoading(false);
        }
    }, [shiftId, selectedPharmacyId]);

    useEffect(() => {
        loadShifts();
        return () => { requestVersion.current += 1; };
    }, [loadShifts]);

    return {
        shifts,
        setShifts,
        loading,
        error,
        loadShifts,
    };
}
