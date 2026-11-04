import { useState, useCallback, useEffect, useRef } from 'react';
import {
    acceptShiftCounterOfferService,
    fetchShiftCounterOffersService,
    rejectShiftCounterOfferService,
} from '@chemisttasker/shared-core';
import { getNextGeneration, isLatestGeneration } from '../utils/activeShiftRuntime';

export function useCounterOffers(scopeKey?: string) {
    const [counterOffersByShift, setCounterOffersByShift] = useState<Record<number, any[]>>({});
    const [counterOffersLoadingByShift, setCounterOffersLoadingByShift] = useState<Record<number, boolean>>({});
    const [counterOffersErrorByShift, setCounterOffersErrorByShift] = useState<Record<number, string | null>>({});
    const [counterActionLoading, setCounterActionLoading] = useState<number | null>(null);
    const generationsRef = useRef<Record<string, number>>({});
    useEffect(() => {
        // Scope switch invalidates stale responses, previous pharmacy offers and errors.
        Object.keys(generationsRef.current).forEach(key => { generationsRef.current[key] += 1; });
        setCounterOffersByShift({});
        setCounterOffersLoadingByShift({});
        setCounterOffersErrorByShift({});
        return () => {
            Object.keys(generationsRef.current).forEach(key => { generationsRef.current[key] += 1; });
        };
    }, [scopeKey]);

    const resolveOfferSlotId = useCallback((offer: any): number | null => {
        const offerSlots = offer?.slots || offer?.offer_slots || [];
        const slotIdFromSlots =
            offerSlots
                .map((s: any) => s.slot_id ?? s.slotId ?? s.slot?.id ?? null)
                .find((id: any) => id != null) ?? null;
        const fallback = offer?.slot_id ?? offer?.slotId ?? null;
        const resolved = slotIdFromSlots ?? fallback;
        return resolved != null ? Number(resolved) : null;
    }, []);

    const loadCounterOffers = useCallback(async (shiftId: number) => {
        const genKey = String(shiftId);
        const generation = getNextGeneration(generationsRef.current, genKey);
        setCounterOffersByShift(prev => { const next = { ...prev }; delete next[shiftId]; return next; });
        setCounterOffersLoadingByShift(prev => ({ ...prev, [shiftId]: true }));
        setCounterOffersErrorByShift(prev => ({ ...prev, [shiftId]: null }));
        try {
            const offers = await fetchShiftCounterOffersService(shiftId);
            if (!isLatestGeneration(generationsRef.current, genKey, generation)) return;
            const pendingOffers = (offers || []).filter(
                (offer: any) => String(offer?.status ?? '').toUpperCase() === 'PENDING'
            );
            setCounterOffersByShift(prev => ({ ...prev, [shiftId]: pendingOffers }));
            setCounterOffersErrorByShift(prev => ({ ...prev, [shiftId]: null }));
        } catch (error: any) {
            if (!isLatestGeneration(generationsRef.current, genKey, generation)) return;
            console.error('Failed to load counter offers', error);
            setCounterOffersByShift(prev => ({ ...prev, [shiftId]: [] }));
            setCounterOffersErrorByShift(prev => ({ ...prev, [shiftId]: error?.message || 'Failed to load counter offers' }));
        } finally {
            if (isLatestGeneration(generationsRef.current, genKey, generation)) {
                setCounterOffersLoadingByShift(prev => ({ ...prev, [shiftId]: false }));
            }
        }
    }, []);

    const acceptOffer = useCallback(
        async (payload: { offer: any; shiftId: number; slotId: number | null }, onSuccess?: () => void) => {
            setCounterActionLoading(payload.offer.id);
            try {
                const resolvedSlotId = payload.slotId ?? resolveOfferSlotId(payload.offer);
                if (__DEV__) {
                    console.log('[ActiveShifts] acceptShiftCounterOfferService', {
                        shiftId: payload.shiftId,
                        offerId: payload.offer.id,
                        slotId: payload.slotId,
                        resolvedSlotId,
                    });
                }
                await acceptShiftCounterOfferService({
                    shiftId: payload.shiftId,
                    offerId: payload.offer.id,
                    slotId: resolvedSlotId,
                });
                setCounterOffersByShift(prev => ({
                    ...prev,
                    [payload.shiftId]: (prev[payload.shiftId] || []).filter((offer: any) => offer.id !== payload.offer.id),
                }));
                if (onSuccess) onSuccess();
                return { ok: true };
            } catch (error) {
                console.error('Failed to accept counter offer', error);
                const detail = (error as any)?.data?.detail || (error as any)?.message || 'Failed to accept offer';
                return { ok: false, detail };
            } finally {
                setCounterActionLoading(null);
            }
        },
        [resolveOfferSlotId]
    );

    const rejectOffer = useCallback(
        async (payload: { offer: any; shiftId: number }, onSuccess?: () => void) => {
            setCounterActionLoading(payload.offer.id);
            try {
                await rejectShiftCounterOfferService({
                    shiftId: payload.shiftId,
                    offerId: payload.offer.id,
                });
                if (onSuccess) onSuccess();
            } catch (error) {
                console.error('Failed to reject counter offer', error);
            } finally {
                setCounterActionLoading(null);
            }
        },
        []
    );

    const updateOfferCache = useCallback((shiftId: number, offerId: number, userDetail: any) => {
        setCounterOffersByShift(prev => {
            const existing = prev[shiftId] || [];
            const updated = existing.map((o: any) =>
                o.id === offerId ? { ...o, userDetail: userDetail, user_detail: userDetail } : o
            );
            return { ...prev, [shiftId]: updated };
        });
    }, []);

    return {
        counterOffersByShift,
        counterOffersLoadingByShift,
        counterOffersErrorByShift,
        loadCounterOffers,
        acceptOffer,
        rejectOffer,
        counterActionLoading,
        updateOfferCache,
    };
}
