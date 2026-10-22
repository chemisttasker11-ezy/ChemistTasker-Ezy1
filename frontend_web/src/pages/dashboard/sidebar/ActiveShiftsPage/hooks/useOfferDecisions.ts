import React, { useState, useCallback } from 'react';
import { buzzShiftOffer, type Shift, type EscalationLevelKey } from '@chemisttasker/shared-core';
import type { useTabData } from './useTabData';
import type { useCounterOffers } from './useCounterOffers';
import type { useShiftActions } from './useShiftActions';
import type { ReviewOfferDialogState } from '../types';
import { getCurrentLevelKey } from '../utils/shiftHelpers';
import { getOfferSlotIds, getCandidateUserId } from '../utils/activeShiftRuntime';

type DecisionArgs = {
  shifts: Shift[];
  selectedLevelByShift: Record<number, EscalationLevelKey>;
  setTabData: ReturnType<typeof useTabData>['setTabData'];
  loadTabDataForShift: ReturnType<typeof useTabData>['loadTabDataForShift'];
  loadShifts: () => Promise<void>;
  loadCounterOffers: ReturnType<typeof useCounterOffers>['loadCounterOffers'];
  acceptOffer: ReturnType<typeof useCounterOffers>['acceptOffer'];
  rejectOffer: ReturnType<typeof useCounterOffers>['rejectOffer'];
  handleAccept: ReturnType<typeof useShiftActions>['handleAccept'];
  setReviewOfferDialog: React.Dispatch<React.SetStateAction<ReviewOfferDialogState>>;
  showSnackbar: (message: string) => void;
};
export function useOfferDecisions({ shifts, selectedLevelByShift, setTabData, loadTabDataForShift,
    loadShifts, loadCounterOffers, acceptOffer, rejectOffer, handleAccept, setReviewOfferDialog, showSnackbar }: DecisionArgs) {
    const [buzzLoadingOfferId, setBuzzLoadingOfferId] = useState<number | null>(null);
    const [buzzDialog, setBuzzDialog] = useState({ open: false, message: '', sent: true });
    // Handle accept/reject counter offer
    const handleAcceptOffer = useCallback(
        async (offer: any, shiftId: number | null, slotId: number | null) => {
            if (!offer || shiftId == null) return;
            const targetShift = shifts.find(s => s.id === shiftId);
            const requiresSlot = targetShift ? !((targetShift as any).singleUserOnly) : false;
            const offerSlotIds = getOfferSlotIds(offer);
            const slotMatchesOffer = slotId != null && offerSlotIds.length > 0 ? offerSlotIds.includes(slotId) : true;
            const resolvedSlotId = requiresSlot
                ? (slotMatchesOffer ? slotId : null) ?? offerSlotIds[0] ?? slotId
                : null;
            if (requiresSlot && resolvedSlotId == null) {
                showSnackbar('Select a slot to accept this offer.');
                return;
            }
            console.log('[ActiveShifts] Accept counter offer payload', {
                shiftId,
                offerId: offer?.id,
                slotId,
                offerSlotIds,
                resolvedSlotId,
                requiresSlot,
            });
            const result = await acceptOffer({ offer, shiftId, slotId: resolvedSlotId }, async () => {
                showSnackbar('Offer sent. Waiting for candidate confirmation.');
                setReviewOfferDialog({ open: false, shiftId: null, offer: null, candidate: null, slotId: null });
                await loadShifts();
                if (targetShift) {
                    const levelKey = selectedLevelByShift[shiftId] ?? getCurrentLevelKey(targetShift);
                    await loadTabDataForShift(targetShift, levelKey);
                    await loadCounterOffers(shiftId);
                }
            });
            if (result && !result.ok) {
                showSnackbar(result.detail || 'Failed to accept offer');
            }
        },
        [acceptOffer, showSnackbar, loadShifts, shifts, getOfferSlotIds, selectedLevelByShift, loadTabDataForShift, loadCounterOffers]
    );

    const handleRejectOffer = useCallback(
        async (offer: any, shiftId: number | null) => {
            if (!offer || shiftId == null) return;
            await rejectOffer({ offer, shiftId }, async () => {
                showSnackbar('Counter offer rejected');
                setReviewOfferDialog({ open: false, shiftId: null, offer: null, candidate: null, slotId: null });
                await loadShifts();
            });
        },
        [rejectOffer, showSnackbar, loadShifts]
    );

    const handleAssignCandidate = useCallback(
        async (userId: number, shiftId: number | null, slotId: number | null) => {
            if (!userId || shiftId == null) return;
            const result = await handleAccept(shiftId, userId, slotId);
            if (result) {
                const targetShift = shifts.find((s) => s.id === shiftId);
                const offerId = (result as any)?.offerId ?? (result as any)?.offer_id ?? null;
                setReviewOfferDialog((prev) => ({
                    ...prev,
                    candidate: prev.candidate
                        ? {
                            ...prev.candidate,
                            pendingConfirmation: true,
                            pendingOfferId: offerId ?? prev.candidate.pendingOfferId,
                        }
                        : prev.candidate,
                }));
                setTabData((prev) => {
                    const next = { ...prev };
                    Object.entries(next).forEach(([key, value]) => {
                        if (!key.startsWith(`${shiftId}_`) || !value) return;
                        const patchRecord = (record: any) => {
                            const recordUserId = getCandidateUserId(record);
                            if (recordUserId !== userId) return record;
                            return {
                                ...record,
                                pendingConfirmation: true,
                                pending_confirmation: true,
                                pendingOfferId: offerId ?? record.pendingOfferId ?? record.pending_offer_id,
                                pending_offer_id: offerId ?? record.pending_offer_id ?? record.pendingOfferId,
                            };
                        };
                        const updated: any = { ...value };
                        if (Array.isArray(updated.interestsAll)) {
                            updated.interestsAll = updated.interestsAll.map(patchRecord);
                        }
                        if (updated.interestsBySlot) {
                            updated.interestsBySlot = Object.fromEntries(
                                Object.entries(updated.interestsBySlot).map(([sid, list]) => [
                                    sid,
                                    Array.isArray(list) ? list.map(patchRecord) : list,
                                ])
                            );
                        }
                        if (Array.isArray(updated.members)) {
                            updated.members = updated.members.map(patchRecord);
                        }
                        if (updated.membersBySlot) {
                            updated.membersBySlot = Object.fromEntries(
                                Object.entries(updated.membersBySlot).map(([sid, list]) => [
                                    sid,
                                    Array.isArray(list) ? list.map(patchRecord) : list,
                                ])
                            );
                        }
                        next[key] = updated;
                    });
                    return next;
                });
                await loadShifts();
                if (targetShift) {
                    const levelKey = selectedLevelByShift[shiftId] ?? getCurrentLevelKey(targetShift);
                    await loadTabDataForShift(targetShift, levelKey);
                }
            }
        },
        [handleAccept, loadShifts, loadTabDataForShift, selectedLevelByShift, shifts]
    );

    const handleBuzzWorker = useCallback(
        async (offerId: number) => {
            if (!offerId) return;
            setBuzzLoadingOfferId(offerId);
            try {
                const result = await buzzShiftOffer(offerId);
                setBuzzDialog({
                    open: true,
                    sent: true,
                    message: result?.detail || "We've nudged the candidate to confirm this shift.",
                });
            } catch (error) {
                console.error('Failed to send confirmation reminder', error);
                const message =
                    (error as any)?.response?.data?.detail ||
                    (error as any)?.payload?.detail ||
                    (error as any)?.data?.detail ||
                    (error as any)?.message ||
                    "The reminder didn't go through. Try again in a moment.";
                setBuzzDialog({ open: true, message, sent: false });
                await loadShifts();
            } finally {
                setBuzzLoadingOfferId(null);
            }
        },
        [loadShifts]
    );

    // Toggle shift expansion
    return { handleAcceptOffer, handleRejectOffer, handleAssignCandidate, handleBuzzWorker,
        buzzLoadingOfferId, buzzDialog, setBuzzDialog };
}
