import { ShiftMemberStatus } from '@chemisttasker/shared-core';

export interface TabDataState {
    loading: boolean;
    interestsAll?: any[];
    interestsBySlot?: Record<number, any[]>;
    membersBySlot?: Record<number, ShiftMemberStatus[]>;
    members?: ShiftMemberStatus[];
}

export interface ReviewCandidateDialogState {
    open: boolean;
    candidate: ShiftMemberStatus | null;
    offer: any | null;
    slotId: number | null;
}

export interface ReviewOfferDialogState {
    open: boolean;
    shiftId: number | null;
    offer: any | null;
    candidate: any | null;
    slotId: number | null;
}

export interface DeleteConfirmDialogState {
    open: boolean;
    shiftId: number | null;
}

export interface RatingSummary {
    average: number;
    count: number;
}

export interface RatingComment {
    id: number;
    stars: number;
    comment: string;
    createdAt: string;
}
