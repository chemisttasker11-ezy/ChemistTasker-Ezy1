// useShiftsData hook
// Mirrors web logic for loading active shifts

import { useState, useEffect, useCallback, useRef } from 'react';
import { Shift, fetchPosterShiftDetailService, shiftsDomain } from '@chemisttasker/shared-core';
import { fetchApi } from '@chemisttasker/shared-core/dist/transport/application';
import { fetchAllPages, type ApiList } from '@chemisttasker/shared-core/dist/utils/serialization';
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
        setLoading(true);
        setError(null);
        try {
            if (shiftId != null) {
                const detail = await fetchPosterShiftDetailService(shiftId);
                if (!isLatestGeneration(generationsRef.current, genKey, generation)) return;
                const result = detail ? filterShiftsByPharmacy([detail], selectedPharmacyId) : EMPTY_SHIFTS;
                setShifts(result.length > 0 ? result : EMPTY_SHIFTS);
            } else {
                const rawShifts = await fetchAllPages<any>((page) =>
                    fetchApi<ApiList<any>>(`/shifts/active/?page=${page}`)
                );
                if (!isLatestGeneration(generationsRef.current, genKey, generation)) return;
                const mapped = rawShifts.map((s: any) => shiftsDomain.mapShift(s));
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
