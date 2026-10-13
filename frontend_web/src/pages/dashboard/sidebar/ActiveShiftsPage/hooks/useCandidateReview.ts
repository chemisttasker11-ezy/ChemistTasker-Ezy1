import React, { useState, useCallback } from 'react';
import { type Shift, type ShiftInterest, type ShiftMemberStatus, type EscalationLevelKey } from '@chemisttasker/shared-core';
import type { useTabData } from './useTabData';
import type { useCounterOffers } from './useCounterOffers';
import type { useRevealInterest } from './useRevealInterest';
import { useWorkerRatings } from './useWorkerRatings';
import { PUBLIC_LEVEL_KEY, getCurrentLevelKey } from '../utils/shiftHelpers';
import { findInterestForOffer } from '../utils/candidateHelpers';
import { mapOfferSlotsWithShift } from '../utils/offerHelpers';
import { findInterestForMember, getOfferSlotIds } from '../utils/activeShiftRuntime';
import type { ReviewOfferDialogState } from '../types';

type ReviewArgs = {
  selectedLevelByShift: Record<number, EscalationLevelKey>;
  tabData: ReturnType<typeof useTabData>['tabData'];
  getTabKey: (shiftId: number, level: EscalationLevelKey) => string;
  loadTabDataForShift: ReturnType<typeof useTabData>['loadTabDataForShift'];
  counterOffersByShift: ReturnType<typeof useCounterOffers>['counterOffersByShift'];
  updateOfferCache: ReturnType<typeof useCounterOffers>['updateOfferCache'];
  loadCounterOffers: ReturnType<typeof useCounterOffers>['loadCounterOffers'];
  revealInterest: ReturnType<typeof useRevealInterest>['revealInterest'];
  showSnackbar: (message: string) => void;
};
export function useCandidateReview({ selectedLevelByShift, tabData, getTabKey, loadTabDataForShift,
  counterOffersByShift, updateOfferCache, loadCounterOffers, revealInterest, showSnackbar }: ReviewArgs) {
    const candidateReviewRequest = React.useRef(0);
    React.useEffect(() => () => { candidateReviewRequest.current += 1; }, []);
    const [reviewOfferDialog, setReviewOfferDialog] = useState<ReviewOfferDialogState>({
        open: false,
        shiftId: null,
        offer: null,
        candidate: null,
        slotId: null,
    });

    const {
        summary: workerRatingSummary,
        comments: workerRatingComments,
        page: workerCommentsPage,
        pageCount: workerCommentsPageCount,
        loadRatings: loadWorkerRatings,
        reset: resetWorkerRatings,
    } = useWorkerRatings();
    // Handle reveal interest
    const handleRevealInterest = useCallback(async (shift: Shift, interest: ShiftInterest) => {
        const request = ++candidateReviewRequest.current;
        const levelKey = selectedLevelByShift[shift.id] ?? PUBLIC_LEVEL_KEY;

        resetWorkerRatings();
        let revealedUser: any = null;

        // Reveal if not already revealed
        if (!interest.revealed) {
            try {
                revealedUser = await revealInterest(shift, interest, levelKey);
                if (!revealedUser || request !== candidateReviewRequest.current) return;


                // Update counter offer cache if they have an offer
                const offers = counterOffersByShift[shift.id] || [];
                const matchingOffer = offers.find((o: any) => {
                    const offerUserId = typeof o.user === 'object' ? o.user?.id : o.user;
                    return offerUserId === interest.userId;
                });

                if (matchingOffer && revealedUser) {
                    updateOfferCache(shift.id, matchingOffer.id, revealedUser);
                    await loadCounterOffers(shift.id);
                }
            } catch (error) {
                console.error('Failed to reveal interest', error);
                showSnackbar('Failed to reveal candidate.');
                return;
            }
        } else {
            // Already revealed, use existing user data
            revealedUser = interest.userDetail || (interest as any).user_detail || interest.user;
        }



        // Build candidate object - handle case where user is just a string
        const userObj = (typeof revealedUser === 'object' && revealedUser)
            ? revealedUser
            : (typeof interest.user === 'object' && interest.user)
                ? interest.user
                : interest.userDetail || (interest as any).user_detail;

        const interestAny = interest as any;

        const candidate = {
            userId: interest.userId ?? userObj?.id ?? null,
            name:
                // Try object properties first
                (userObj?.firstName && userObj?.lastName)
                    ? `${userObj.firstName} ${userObj.lastName}`
                    : (userObj?.first_name && userObj?.last_name)
                        ? `${userObj.first_name} ${userObj.last_name}`
                        : userObj?.name || userObj?.displayName || userObj?.display_name
                        // Fall back to string fields
                        || interestAny?.displayName
                        || (typeof interest.user === 'string' ? interest.user : null)
                        || interest?.userName
                        || 'Candidate',
            email: userObj?.email || interestAny?.email || '',
            shortBio: userObj?.shortBio || userObj?.short_bio || interestAny?.shortBio || interestAny?.short_bio || '',
            profile: userObj,
            pendingConfirmation: Boolean(interestAny?.pendingConfirmation ?? interestAny?.pending_confirmation),
            pendingOfferId: interestAny?.pendingOfferId ?? interestAny?.pending_offer_id ?? null,
            awaitingPayment: Boolean(interestAny?.awaitingPayment ?? interestAny?.awaiting_payment),
            awaitingPaymentOfferId: interestAny?.awaitingPaymentOfferId ?? interestAny?.awaiting_payment_offer_id ?? null,
        };

        // Load ratings
        const interestUserId =
            typeof interest?.user === 'object' && interest?.user
                ? (interest.user as any).id
                : null;
        const ratingsUserId = (typeof userObj === 'object' && userObj?.id) ? userObj.id : (interest?.userId ?? interestUserId ?? null);
        if (ratingsUserId != null) {
            try {
                await loadWorkerRatings(ratingsUserId, 1);
            } catch (error) {
                console.error('Failed to load candidate ratings', error);
            }
        }

        // Open dialog (no counter offer, just showing interest)
        if (request !== candidateReviewRequest.current) return;
        setReviewOfferDialog({
            open: true,
            shiftId: shift.id,
            offer: null,
            candidate,
            slotId: interest.slotId ?? null,
        });
    }, [revealInterest, selectedLevelByShift, counterOffersByShift, updateOfferCache, resetWorkerRatings, loadWorkerRatings, showSnackbar, loadCounterOffers]);

    // Handle review offer dialog
    const handleReviewOffer = useCallback(
        async (shift: Shift, offer: any, tabData: any, slotId: number | null) => {
            const request = ++candidateReviewRequest.current;
            resetWorkerRatings();

            // Find the interest for this offer
            const interest = findInterestForOffer(offer, tabData, slotId);

            let revealedUser: any = null;

            // Reveal if necessary
            if (interest && !interest.revealed) {
                try {
                    const levelKey = selectedLevelByShift[shift.id] ?? PUBLIC_LEVEL_KEY;
                    revealedUser = await revealInterest(shift, interest, levelKey);
                    if (!revealedUser || request !== candidateReviewRequest.current) return;

                    // Update offer cache
                    if (revealedUser) {
                        updateOfferCache(shift.id, offer.id, revealedUser);
                    }

                    await loadCounterOffers(shift.id); // Refresh to get user_detail
                } catch (error) {
                    console.error('Failed to reveal offer candidate', error);
                }
            }

            // Build candidate object
            const userObj =
                revealedUser ||
                (interest as any)?.userDetail ||
                (interest as any)?.user_detail ||
                offer.userDetail ||
                offer.user_detail ||
                (typeof offer.user === 'object' ? offer.user : null);
            const interestAny = interest as any;
            const candidate =
                userObj || interest
                    ? {
                        userId: userObj?.id ?? interestAny?.userId ?? interest?.userId ?? offer?.user?.id ?? null,
                        name:
                            userObj?.firstName && userObj?.lastName
                                ? `${userObj.firstName} ${userObj.lastName}`
                                : userObj?.name ||
                                userObj?.displayName ||
                                interestAny?.userName ||
                                'Candidate',
                        email: userObj?.email || interestAny?.email,
                        shortBio: userObj?.shortBio || interestAny?.shortBio || interestAny?.short_bio || '',
                        profile: userObj,
                    }
                    : null;

            // Load ratings
            const interestUserId =
                typeof interestAny?.user === 'object' && interestAny?.user
                    ? interestAny.user.id
                    : null;
            const ratingsUserId = userObj?.id ?? interest?.userId ?? interestUserId ?? offer?.user?.id ?? null;
            if (ratingsUserId != null) {
                try {
                    await loadWorkerRatings(ratingsUserId, 1);
                } catch (error) {
                    console.error('Failed to load candidate ratings', error);
                }
            }

            const isSingleUserShift = Boolean((shift as any).singleUserOnly);
            const offerSlotIds = getOfferSlotIds(offer);
            const slotFromOffer = offerSlotIds[0] ?? null;
            const fallbackSlotId = shift.slots?.[0]?.id ?? null;
            const slotMatchesOffer = slotId != null && offerSlotIds.length > 0 ? offerSlotIds.includes(slotId) : true;
            const resolvedSlotId = isSingleUserShift
                ? null
                : (slotMatchesOffer ? slotId : null) ?? slotFromOffer ?? slotId ?? fallbackSlotId;

            // Map slots
            const mappedSlots = mapOfferSlotsWithShift(offer, shift, resolvedSlotId);

            // Open dialog
            if (request !== candidateReviewRequest.current) return;
            setReviewOfferDialog({
                open: true,
                shiftId: shift.id,
                offer: { ...offer, _mappedSlots: mappedSlots },
                candidate,
                slotId: resolvedSlotId,
            });
        },
        [
            revealInterest,
            selectedLevelByShift,
            resetWorkerRatings,
            loadCounterOffers,
            loadWorkerRatings,
            updateOfferCache,
        ]
    );

    // Handle review candidate (community level)
    const handleReviewCandidate = useCallback(
        async (shift: Shift, member: ShiftMemberStatus, offer: any | null, slotId: number | null) => {
            const request = ++candidateReviewRequest.current;
            resetWorkerRatings();
            const levelKey = selectedLevelByShift[shift.id] ?? getCurrentLevelKey(shift);
            const currentTabData = tabData[getTabKey(shift.id, levelKey)] || {};
            const interest = findInterestForMember(member, currentTabData, slotId);
            let revealedUser: any = null;

            if (interest && !(interest as any).revealed) {
                try {
                    revealedUser = await revealInterest(shift, interest, levelKey);
                    if (!revealedUser || request !== candidateReviewRequest.current) return;
                    await loadTabDataForShift(shift, levelKey);
                } catch (error) {
                    console.error('Failed to reveal reviewed candidate', error);
                }
            }

            const revealedUserObj =
                (typeof revealedUser === 'object' && revealedUser) ||
                (typeof (interest as any)?.user === 'object' ? (interest as any).user : null) ||
                (interest as any)?.user_detail ||
                (interest as any)?.userDetail ||
                (member as any).userDetail ||
                (member as any).user_detail ||
                null;

            const pendingConfirmationCounterOffer =
                (member as any).pendingConfirmationCounterOffer ??
                (member as any).pending_confirmation_counter_offer ??
                null;
            const awaitingPaymentCounterOffer =
                (member as any).awaitingPaymentCounterOffer ??
                (member as any).awaiting_payment_counter_offer ??
                null;

            const candidate = {
                userId: revealedUserObj?.id ?? (member as any).userId ?? (member as any).user?.id ?? null,
                name:
                    revealedUserObj?.firstName && revealedUserObj?.lastName
                        ? `${revealedUserObj.firstName} ${revealedUserObj.lastName}`
                        : revealedUserObj?.first_name && revealedUserObj?.last_name
                            ? `${revealedUserObj.first_name} ${revealedUserObj.last_name}`
                    : (member as any).firstName && (member as any).lastName
                        ? `${(member as any).firstName} ${(member as any).lastName}`
                        : revealedUserObj?.name || revealedUserObj?.displayName || revealedUserObj?.display_name || member.displayName || (member as any).email || 'Candidate',
                email: revealedUserObj?.email || (member as any).email || '',
                shortBio: revealedUserObj?.shortBio || revealedUserObj?.short_bio || (member as any).shortBio || '',
                profile: revealedUserObj,
                pendingConfirmation: !offer && Boolean((member as any).pendingConfirmation ?? (member as any).pending_confirmation),
                pendingOfferId: (member as any).pendingOfferId ?? (member as any).pending_offer_id ?? null,
                pendingConfirmationCounterOffer,
                awaitingPayment: !offer && Boolean((member as any).awaitingPayment ?? (member as any).awaiting_payment),
                awaitingPaymentOfferId: (member as any).awaitingPaymentOfferId ?? (member as any).awaiting_payment_offer_id ?? null,
                awaitingPaymentCounterOffer,
            };

            // Load ratings
            if (member.userId != null) {
                try {
                    await loadWorkerRatings(member.userId, 1);
                } catch (error) {
                    console.error('Failed to load candidate ratings', error);
                }
            }

            const isSingleUserShift = Boolean((shift as any).singleUserOnly);
            const offerSlotIds = getOfferSlotIds(offer);
            const slotFromOffer = offerSlotIds[0] ?? null;
            const fallbackSlotId = shift.slots?.[0]?.id ?? null;
            const slotMatchesOffer = slotId != null && offerSlotIds.length > 0 ? offerSlotIds.includes(slotId) : true;
            const resolvedSlotId = isSingleUserShift
                ? null
                : (slotMatchesOffer ? slotId : null) ?? slotFromOffer ?? slotId ?? fallbackSlotId;

            // Map slots if offer exists
            const mappedSlots = offer ? mapOfferSlotsWithShift(offer, shift, resolvedSlotId) : [];
            const pendingCounterWithSlots = pendingConfirmationCounterOffer
                ? { ...pendingConfirmationCounterOffer, _mappedSlots: mapOfferSlotsWithShift(pendingConfirmationCounterOffer, shift, resolvedSlotId) }
                : null;
            const awaitingCounterWithSlots = awaitingPaymentCounterOffer
                ? { ...awaitingPaymentCounterOffer, _mappedSlots: mapOfferSlotsWithShift(awaitingPaymentCounterOffer, shift, resolvedSlotId) }
                : null;

            if (request !== candidateReviewRequest.current) return;
            setReviewOfferDialog({
                open: true,
                shiftId: shift.id,
                offer: offer ? { ...offer, _mappedSlots: mappedSlots } : null,
                candidate: {
                    ...candidate,
                    pendingConfirmationCounterOffer: pendingCounterWithSlots,
                    awaitingPaymentCounterOffer: awaitingCounterWithSlots,
                },
                slotId: resolvedSlotId,
            });
        },
        [
            resetWorkerRatings,
            selectedLevelByShift,
            tabData,
            getTabKey,
            revealInterest,
            loadTabDataForShift,
            loadWorkerRatings,
            getOfferSlotIds,
        ]
    );

    const closeReview = useCallback(() => {
        candidateReviewRequest.current += 1;
        resetWorkerRatings();
        setReviewOfferDialog({ open: false, shiftId: null, offer: null, candidate: null, slotId: null });
    }, [resetWorkerRatings]);
    return { reviewOfferDialog, setReviewOfferDialog, closeReview, handleRevealInterest, handleReviewOffer,
        handleReviewCandidate, workerRatingSummary, workerRatingComments, workerCommentsPage,
        workerCommentsPageCount, loadWorkerRatings };
}
