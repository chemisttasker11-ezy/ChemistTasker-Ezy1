import { useState, useCallback, useRef } from 'react';
import { Shift, ShiftInterest, revealShiftInterestService, EscalationLevelKey } from '@chemisttasker/shared-core';
import { TabDataState } from '../types';

export function useRevealInterest(
    getTabKey: (shiftId: number, levelKey: EscalationLevelKey) => string,
    setTabData: React.Dispatch<React.SetStateAction<Record<string, TabDataState>>>,
    showSnackbar: (msg: string) => void
) {
    const [revealingInterestId, setRevealingInterestId] = useState<number | null>(null);
    // Same-render taps share the in-flight reveal: one tap = one request, and the latest tap still gets the result.
    const pendingReveals = useRef<Map<string, Promise<any>>>(new Map());

    const reveal = useCallback(
        async (shift: Shift, interest: ShiftInterest, levelKey: EscalationLevelKey) => {
            if (interest.userId == null) {
                showSnackbar('Unable to reveal this interest.');
                return null;
            }

            setRevealingInterestId(interest.id);
            try {
                const userDetail = await revealShiftInterestService(shift.id, {
                    userId: interest.userId,
                    slotId: interest.slotId ?? null,
                });

                const tabKey = getTabKey(shift.id, levelKey);
                setTabData(prev => {
                    const current = prev[tabKey];
                    if (!current) return prev;

                    const nextInterestsBySlot: Record<number, any[]> = {};
                    Object.entries(current.interestsBySlot || {}).forEach(([sid, list]) => {
                        nextInterestsBySlot[Number(sid)] = (list as any[]).map(item =>
                            item.id === interest.id ? { ...item, revealed: true, user: userDetail, userDetail } : item
                        );
                    });

                    const nextInterestsAll = (current.interestsAll || []).map((item: any) =>
                        item.id === interest.id ? { ...item, revealed: true, user: userDetail, userDetail } : item
                    );

                    return {
                        ...prev,
                        [tabKey]: { ...current, interestsBySlot: nextInterestsBySlot, interestsAll: nextInterestsAll },
                    };
                });

                showSnackbar('Candidate revealed.');
                return userDetail;
            } catch (error) {
                console.error('Failed to reveal interest', error);
                showSnackbar('Failed to reveal candidate.');
                return null;
            } finally {
                setRevealingInterestId(null);
            }
        },
        [getTabKey, setTabData, showSnackbar]
    );

    const revealInterest = useCallback(
        (shift: Shift, interest: ShiftInterest, levelKey: EscalationLevelKey) => {
            const key = `${shift.id}_${interest.userId}_${interest.slotId ?? 'all'}`;
            const pending = pendingReveals.current.get(key);
            if (pending) return pending;
            const request = reveal(shift, interest, levelKey).finally(() => pendingReveals.current.delete(key));
            pendingReveals.current.set(key, request);
            return request;
        },
        [reveal]
    );

    return { revealInterest, revealingInterestId };
}
