import { Linking, Platform } from 'react-native';
import type { Shift, ShiftCounterOfferPayload } from '@chemisttasker/shared-core';
import type { CounterOfferTrack, RatePreference, SlotFilterMode } from '../types';
import {
    getShiftAddress,
    getShiftCity,
    getShiftState,
} from '../utils/shift';

export const buildMapAddress = (shift: Shift) => {
    const addressLine = getShiftAddress(shift);
    const city = getShiftCity(shift);
    const state = getShiftState(shift);
    const parts = [addressLine, city, state].filter(Boolean);
    if (parts.length > 0) return parts.join(', ');
    const pharmacy = shift.pharmacyDetail as any;
    const fallbackParts = [
        pharmacy?.streetAddress,
        pharmacy?.suburb,
        pharmacy?.state,
        pharmacy?.postcode,
    ].filter(Boolean);
    return fallbackParts.join(', ');
};

export const openMap = (address: string) => {
    if (!address) return;
    const query = encodeURIComponent(address);
    const url = Platform.select({
        ios: `maps:0,0?q=${query}`,
        android: `geo:0,0?q=${query}`,
        default: `https://www.google.com/maps/search/?api=1&query=${query}`,
    });
    Linking.openURL(url!).catch(() => {});
};

export type ShiftListProps = {
    loading?: boolean;
    processedShifts: Shift[];
    clearAllFilters: () => void;
    hideCounterOffer?: boolean;
    onSubmitCounterOffer?: (payload: ShiftCounterOfferPayload) => Promise<void> | void;
    onRejectShift?: (shift: Shift) => Promise<void> | void;
    onRejectSlot?: (shift: Shift, slotId: number) => Promise<void> | void;
    onRejectSlots?: (shift: Shift, slotIds: number[]) => Promise<void> | void;
    handleApplyAll: (shift: Shift) => Promise<void> | void;
    handleApplySlot: (shift: Shift, slotId: number) => Promise<void> | void;
    handleApplySlots: (shift: Shift, slotIds: number[]) => Promise<void> | void;
    handleRejectShift: (shift: Shift) => Promise<void> | void;
    handleRejectSlot: (shift: Shift, slotId: number) => Promise<void> | void;
    handleRejectSlots: (shift: Shift, slotIds: number[]) => Promise<void> | void;
    toggleExpandedCard: (shiftId: number) => void;
    expandedCards: Record<number, boolean>;
    selectedSlotIds: Record<number, Set<number>>;
    toggleSlotSelection: (shiftId: number, slotId: number) => void;
    clearSelection: (shiftId: number) => void;
    appliedShiftIds: Set<number>;
    appliedSlotIds: Set<number>;
    rejectedShiftIds: Set<number>;
    rejectedSlotIds: Set<number>;
    savedShiftIds: Set<number>;
    savedFeatureEnabled: boolean;
    hideSaveToggle?: boolean;
    toggleSaveShift: (shiftId: number) => void;
    counterOffers: Record<number, CounterOfferTrack>;
    onReviewOffers: (shiftId: number) => void;
    openCounterOffer: (shift: Shift, selectedSlots?: Set<number>) => void;
    rejectActionGuard?: (shift: Shift) => boolean;
    actionDisabledGuard?: (shift: Shift) => boolean;
    userRatePreference?: RatePreference;
    pharmacyRatings: Record<number, { average: number; count: number }>;
    slotFilterMode?: SlotFilterMode;
    applyLabel?: string;
    disableSlotActions?: boolean;
    disableActionGuards?: boolean;
};
