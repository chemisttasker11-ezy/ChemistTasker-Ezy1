import { useState, useCallback } from 'react';
import {
    acceptShiftCounterOfferService,
    fetchShiftCounterOffersService,
    rejectShiftCounterOfferService,
} from '@chemisttasker/shared-core';

export function useCounterOffers() {
    const [counterOffersByShift, setCounterOffersByShift] = useState<Record<number, any[]>>({});
    const [counterOffersLoadingByShift, setCounterOffersLoadingByShift] = useState<Record<number, boolean>>({});
    const [counterActionLoading, setCounterActionLoading] = useState<number | null>(null);

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
        setCounterOffersLoadingByShift(prev => ({ ...prev, [shiftId]: true }));
        try {
            const offers = await fetchShiftCounterOffersService(shiftId);
            const pendingOffers = (offers || []).filter(
                (offer: any) => String(offer?.status ?? '').toUpperCase() === 'PENDING'
            );
            setCounterOffersByShift(prev => ({ ...prev, [shiftId]: pendingOffers }));
        } catch (error) {
            console.error('Failed to load counter offers', error);
            setCounterOffersByShift(prev => ({ ...prev, [shiftId]: [] }));
        } finally {
            setCounterOffersLoadingByShift(prev => ({ ...prev, [shiftId]: false }));
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
        loadCounterOffers,
        acceptOffer,
        rejectOffer,
        counterActionLoading,
        updateOfferCache,
    };
}
