import { useState, useCallback, useEffect } from 'react';
import {
    Shift,
    ShiftMemberStatus,
    EscalationLevelKey,
    fetchShiftInterests,
    fetchShiftMemberStatus,
} from '@chemisttasker/shared-core';
import { TabDataState } from '../types';
import { deriveLevelSequence, getCurrentLevelKey, PUBLIC_LEVEL_KEY } from '../utils/shiftHelpers';

export function useTabData(
    shifts: Shift[],
    selectedLevelByShift: Record<number, EscalationLevelKey>,
    getTabKey: (shiftId: number, levelKey: EscalationLevelKey) => string
) {
    const [tabData, setTabData] = useState<Record<string, TabDataState>>({});

    const loadTabDataForShift = useCallback(
        async (shift: Shift, levelKey: EscalationLevelKey) => {
            const key = getTabKey(shift.id, levelKey);
            setTabData(prev => ({ ...prev, [key]: { loading: true } }));

            try {
                // Public/platform: interests/rejections
                if (levelKey === PUBLIC_LEVEL_KEY) {
                    const interests = await fetchShiftInterests({ shiftId: shift.id });
                    const interestsBySlot: Record<number, any[]> = {};
                    (shift.slots || []).forEach(slot => {
                        interestsBySlot[slot.id] = interests.filter((i: any) => i.slotId === slot.id || i.slotId == null);
                    });

                    setTabData(prev => ({
                        ...prev,
                        [key]: {
                            loading: false,
                            interestsAll: interests,
                            interestsBySlot,
                        },
                    }));
                    return;
                }

                // Community/other levels: member status by slot
                const membersBySlotEntries = await Promise.all(
                    (shift.slots || []).map(async slot => {
                        try {
                            const members = await fetchShiftMemberStatus(shift.id, {
                                slotId: slot.id,
                                visibility: levelKey,
                            });
                            return [slot.id, members] as const;
                        } catch (error) {
                            console.error(`Failed to load members for shift ${shift.id} slot ${slot.id}`, error);
                            return [slot.id, [] as ShiftMemberStatus[]] as const;
                        }
                    })
                );

                const membersBySlot = membersBySlotEntries.reduce<Record<number, ShiftMemberStatus[]>>((acc, [slotId, members]) => {
                    acc[slotId] = members;
                    return acc;
                }, {});

                const members = membersBySlotEntries.flatMap(([, list]) => list);

                setTabData(prev => ({
                    ...prev,
                    [key]: {
                        loading: false,
                        membersBySlot,
                        members,
                    },
                }));
            } catch (error) {
                console.error('Failed to load tab data', error);
                setTabData(prev => ({ ...prev, [key]: { loading: false } }));
            }
        },
        [getTabKey]
    );

    useEffect(() => {
        shifts.forEach(shift => {
            const currentLevel = selectedLevelByShift[shift.id] || (shift as any).visibility || PUBLIC_LEVEL_KEY;
            const viewableLevels = deriveLevelSequence(
                getCurrentLevelKey(shift),
                (shift as any).allowedEscalationLevels,
            );
            const levelsToLoad = new Set<EscalationLevelKey>([
                ...viewableLevels,
                currentLevel as EscalationLevelKey,
            ]);
            levelsToLoad.forEach(level => loadTabDataForShift(shift, level));
        });
    }, [shifts, selectedLevelByShift, loadTabDataForShift]);

    return { tabData, setTabData, loadTabDataForShift };
}
