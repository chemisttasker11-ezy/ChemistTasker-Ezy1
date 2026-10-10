import React, { useCallback, useMemo, useState } from 'react';
import type { Shift, EscalationLevelKey } from '@chemisttasker/shared-core';
import type { useTabData } from './useTabData';
import type { useCounterOffers } from './useCounterOffers';
import { PUBLIC_LEVEL_KEY, getCurrentLevelKey } from '../utils/shiftHelpers';
import { ACTIVE_SHIFT_SLOT_SEEN_KEY_PREFIX, getSlotIds, buildPublicSlotSignature, buildMemberSlotSignature } from '../utils/activeShiftRuntime';

type AttentionArgs = {
    userId: number | string | null | undefined;
    shifts: Shift[];
    selectedLevelByShift: Record<number, EscalationLevelKey>;
    tabData: ReturnType<typeof useTabData>['tabData'];
    counterOffersByShift: ReturnType<typeof useCounterOffers>['counterOffersByShift'];
    getTabKey: (shiftId: number, level: EscalationLevelKey) => string;
};
export function useShiftSlotAttention({ userId, shifts, selectedLevelByShift, tabData, counterOffersByShift, getTabKey }: AttentionArgs) {
    const [slotHasUpdatesByShift, setSlotHasUpdatesByShift] = useState<Record<number, Record<number, boolean>>>({});
    const [seenSlotSignatures, setSeenSlotSignatures] = useState<Record<string, string>>({});
    const [slotSeenReady, setSlotSeenReady] = useState(false);
    const latestSlotSignaturesRef = React.useRef<Record<string, string>>({});
    const seenStorageKey = useMemo(
        () => `${ACTIVE_SHIFT_SLOT_SEEN_KEY_PREFIX}:${userId ?? 'anon'}`,
        [userId]
    );

    const markShiftSlotsUpdated = useCallback((shiftId: number, slotIds: number[] | null) => {
        const shift = shifts.find((s) => s.id === shiftId);
        if (!shift) return;
        const targetSlotIds = (slotIds && slotIds.length > 0) ? slotIds : [];
        if (targetSlotIds.length === 0) return;
        setSlotHasUpdatesByShift((prev) => {
            const nextShiftState = { ...(prev[shiftId] || {}) };
            targetSlotIds.forEach((slotId) => {
                nextShiftState[slotId] = true;
            });
            return {
                ...prev,
                [shiftId]: nextShiftState,
            };
        });
    }, [shifts]);

    React.useEffect(() => {
        try {
            const raw = localStorage.getItem(seenStorageKey);
            const parsed = raw ? JSON.parse(raw) : {};
            if (parsed && typeof parsed === 'object') {
                setSeenSlotSignatures(parsed);
            } else {
                setSeenSlotSignatures({});
            }
        } catch {
            setSeenSlotSignatures({});
        } finally {
            setSlotSeenReady(true);
        }
    }, [seenStorageKey]);

    React.useEffect(() => {
        if (!slotSeenReady) return;
        try {
            localStorage.setItem(seenStorageKey, JSON.stringify(seenSlotSignatures));
        } catch {
            // ignore persistence failures
        }
    }, [seenSlotSignatures, seenStorageKey, slotSeenReady]);

    React.useEffect(() => {
        const onShiftSlotActivity = (evt: Event) => {
            const customEvt = evt as CustomEvent<any>;
            const notification = customEvt?.detail;
            const payload = notification?.payload || notification?.data || {};
            const shiftIdRaw = payload.shift_id ?? payload.shiftId;
            const shiftId = Number(shiftIdRaw);
            if (!Number.isFinite(shiftId)) return;

            const rawSlotIds = payload.slot_ids ?? payload.slotIds;
            const slotIdsFromList = Array.isArray(rawSlotIds)
                ? rawSlotIds.map((value: any) => Number(value)).filter((value: number) => Number.isFinite(value))
                : [];
            const slotIdRaw = payload.slot_id ?? payload.slotId;
            const slotIdSingle = Number(slotIdRaw);
            const slotIds = slotIdsFromList.length > 0
                ? slotIdsFromList
                : (Number.isFinite(slotIdSingle) ? [slotIdSingle] : null);

            markShiftSlotsUpdated(shiftId, slotIds);
        };

        window.addEventListener('shift-slot-activity', onShiftSlotActivity as EventListener);
        return () => {
            window.removeEventListener('shift-slot-activity', onShiftSlotActivity as EventListener);
        };
    }, [markShiftSlotsUpdated]);

    const markSlotSeen = useCallback(
        (shiftId: number, slotId: number) => {
            const shift = shifts.find((s) => s.id === shiftId);
            if (!shift) return;
            const levelKey = selectedLevelByShift[shiftId] ?? getCurrentLevelKey(shift);
            const signatureKey = `${shiftId}:${levelKey}:${slotId}`;
            const latestSignature = latestSlotSignaturesRef.current[signatureKey];
            if (!latestSignature) return;
            setSeenSlotSignatures((prev) => {
                if (prev[signatureKey] === latestSignature) return prev;
                return { ...prev, [signatureKey]: latestSignature };
            });
            setSlotHasUpdatesByShift((prev) => ({
                ...prev,
                [shiftId]: {
                    ...(prev[shiftId] || {}),
                    [slotId]: false,
                },
            }));
        },
        [selectedLevelByShift, shifts]
    );

    React.useEffect(() => {
        if (!slotSeenReady) return;

        const nextUpdatesByShift: Record<number, Record<number, boolean>> = {};
        const nextSignatures: Record<string, string> = {};
        const baselineMissing: Record<string, string> = {};

        shifts.forEach((shift) => {
            const isSingleUserShift = Boolean((shift as any).singleUserOnly);
            if (isSingleUserShift) return;

            const slotIds = getSlotIds(shift);
            if (slotIds.length === 0) return;

            const levelKey = selectedLevelByShift[shift.id] ?? getCurrentLevelKey(shift);
            const tabKey = getTabKey(shift.id, levelKey);
            const currentTabData = tabData[tabKey] || {};

            // Avoid creating a false "seen baseline" from empty/loading state.
            const tabDataReady = Object.prototype.hasOwnProperty.call(tabData, tabKey) && !currentTabData.loading;
            if (!tabDataReady) return;

            // Slot signatures include offers, so wait until they are loaded.
            const offersReady = Object.prototype.hasOwnProperty.call(counterOffersByShift, shift.id);
            if (!offersReady) return;

            const offers = counterOffersByShift[shift.id] || [];

            slotIds.forEach((slotId) => {
                const signature =
                    levelKey === PUBLIC_LEVEL_KEY
                        ? buildPublicSlotSignature(slotId, currentTabData.interestsAll || [], offers)
                        : buildMemberSlotSignature(slotId, currentTabData.membersBySlot?.[slotId] || [], offers);
                const signatureKey = `${shift.id}:${levelKey}:${slotId}`;
                nextSignatures[signatureKey] = signature;

                const seen = seenSlotSignatures[signatureKey];
                if (seen == null) {
                    baselineMissing[signatureKey] = signature;
                    return;
                }
                if (seen !== signature) {
                    if (!nextUpdatesByShift[shift.id]) nextUpdatesByShift[shift.id] = {};
                    nextUpdatesByShift[shift.id][slotId] = true;
                }
            });
        });

        latestSlotSignaturesRef.current = nextSignatures;
        setSlotHasUpdatesByShift(nextUpdatesByShift);
        if (Object.keys(baselineMissing).length > 0) {
            setSeenSlotSignatures((prev) => ({ ...prev, ...baselineMissing }));
        }
    }, [
        shifts,
        tabData,
        counterOffersByShift,
        selectedLevelByShift,
        getTabKey,
        seenSlotSignatures,
        slotSeenReady,
    ]);

    return { slotHasUpdatesByShift, markSlotSeen };
}
