// useShiftsData hook
// Mirrors web logic for loading active shifts

import { useState, useEffect, useCallback, useRef } from 'react';
import { type Shift, fetchAllActiveShifts, fetchPosterShiftDetailService } from '@chemisttasker/shared-core';
import { filterShiftsByPharmacy, getNextGeneration, isLatestGeneration } from '../utils/activeShiftRuntime';

const EMPTY_SHIFTS: Shift[] = [];

interface UseShiftsDataParams {
    selectedPharmacyId: number | null;
    shiftId?: number | null;
    scopeKey?: string;
}

export function useShiftsData({ selectedPharmacyId, shiftId, scopeKey }: UseShiftsDataParams) {
    const [shifts, setShifts] = useState<Shift[]>(EMPTY_SHIFTS);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const generationsRef = useRef<Record<string, number>>({});

    const loadShifts = useCallback(async () => {
        const genKey = shiftId != null ? `shift_${shiftId}` : 'all';
        const generation = getNextGeneration(generationsRef.current, genKey);
        setShifts(EMPTY_SHIFTS); // Never show a previous pharmacy's rows during load/error.
        setLoading(true);
        setError(null);
        try {
            if (shiftId != null) {
                const detail = await fetchPosterShiftDetailService(shiftId);
                if (!isLatestGeneration(generationsRef.current, genKey, generation)) return;
                const result = detail ? filterShiftsByPharmacy([detail], selectedPharmacyId) : EMPTY_SHIFTS;
                setShifts(result.length > 0 ? result : EMPTY_SHIFTS);
            } else {
                const mapped = await fetchAllActiveShifts();
                if (!isLatestGeneration(generationsRef.current, genKey, generation)) return;
                const scoped = filterShiftsByPharmacy(mapped, selectedPharmacyId);
                setShifts(scoped.length > 0 ? scoped : EMPTY_SHIFTS);
            }
        } catch (err: any) {
            if (!isLatestGeneration(generationsRef.current, genKey, generation)) return;
            console.error('Failed to load active shifts', err);
            setError(err?.message || 'Failed to load active shifts');
        } finally {
            if (isLatestGeneration(generationsRef.current, genKey, generation)) {
                setLoading(false);
            }
        }
    }, [selectedPharmacyId, shiftId, scopeKey]);

    useEffect(() => {
        loadShifts();
        return () => {
            const genKey = shiftId != null ? `shift_${shiftId}` : 'all';
            getNextGeneration(generationsRef.current, genKey);
        };
    }, [loadShifts, shiftId]);

    return {
        shifts,
        setShifts,
        loading,
        error,
        loadShifts,
    };
}
