import { useState, useCallback } from 'react';
import { Shift, ShiftInterest, revealShiftInterestService, EscalationLevelKey } from '@chemisttasker/shared-core';
import { TabDataState } from '../types';

export function useRevealInterest(
    getTabKey: (shiftId: number, levelKey: EscalationLevelKey) => string,
    setTabData: React.Dispatch<React.SetStateAction<Record<string, TabDataState>>>,
    showSnackbar: (msg: string) => void
) {
    const [revealingInterestId, setRevealingInterestId] = useState<number | null>(null);

    const revealInterest = useCallback(
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

                // Update tab data to mark interest as revealed
                const tabKey = getTabKey(shift.id, levelKey);
                setTabData(prev => {
                    const current = prev[tabKey];
                    if (!current) return prev;

                    const nextInterestsBySlot: Record<number, any[]> = {};
                    Object.entries(current.interestsBySlot || {}).forEach(([sid, list]) => {
                        nextInterestsBySlot[Number(sid)] = (list as any[]).map(item =>
                            item.id === interest.id ? { ...item, revealed: true, user: userDetail, user_detail: userDetail } : item
                        );
                    });

                    const nextInterestsAll = (current.interestsAll || []).map((item: any) =>
                        item.id === interest.id ? { ...item, revealed: true, user: userDetail, user_detail: userDetail } : item
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

    return { revealInterest, revealingInterestId };
}
