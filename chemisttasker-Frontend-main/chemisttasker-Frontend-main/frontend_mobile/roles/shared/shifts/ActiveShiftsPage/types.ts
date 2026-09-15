// ActiveShiftsPage Types
// TypeScript type definitions for Active Shifts components

import { ShiftMemberStatus } from '@chemisttasker/shared-core';

export interface TabDataState {
    loading: boolean;
    interestsAll?: any[];
    interestsBySlot?: Record<number, any[]>;
    membersBySlot?: Record<number, ShiftMemberStatus[]>;
    members?: ShiftMemberStatus[];
}

export type ReviewOfferDialogState = {
    open: boolean;
    shiftId: number | null;
    offer: any | null;
    candidate: any | null;
    slotId: number | null;
};

export type DeleteConfirmDialogState = {
    open: boolean;
    shiftId: number | null;
};

export type RatingSummary = {
    average: number;
    count: number;
};

export type RatingComment = {
    id: number;
    stars: number;
    comment: string;
    createdAt: string;
};

export type EscalationLevelKey = 'FULL_PART_TIME' | 'LOCUM_CASUAL' | 'OWNER_CHAIN' | 'ORG_CHAIN' | 'PLATFORM';

export type ShiftExpansionState = {
    expandedShifts: Set<number>;
    selectedLevelByShift: Record<number, EscalationLevelKey>;
    selectedSlotByShift: Record<number, number>;
};
