import React from 'react';
import { Box, Stack } from '@mui/material';
import { Sparkles, Tag, UserCheck } from 'lucide-react';
import { Shift, ShiftInterest } from '@chemisttasker/shared-core';
import { SlotSelector } from './SlotSelector';
import { CandidateColumn, CandidateRow, Pill, RowAction, SourceSection } from '../ShiftCentreParts';
import { getInterestDisplayName } from '../../utils/candidateHelpers';

interface PublicLevelViewProps {
    shift: Shift;
    slotId: number | null;
    slotHasUpdates?: Record<number, boolean>;
    slotCandidateCounts?: Record<number, number>;
    slotStatusCounts?: Record<number, { interested: number; assigned: number; rejected: number; noResponse: number }>;
    interestsAll: any[];
    counterOffers: any[];
    counterOffersLoaded: boolean;
    onReveal: (shift: Shift, interest: ShiftInterest) => void;
    onReviewOffer: (shift: Shift, offer: any, slotId: number | null) => void;
    onSelectSlot?: (slotId: number) => void;
    revealingInterestId: number | null;
    onBuzzWorker?: (offerId: number) => void;
    buzzLoadingOfferId?: number | null;
}

const proposedRateOf = (offer: any): string | null => {
    const offerSlots = offer?.slots || offer?.offer_slots || [];
    const rate = offerSlots
        .map((slot: any) => slot?.proposedRate ?? slot?.proposed_rate)
        .find((value: any) => value != null && value !== '');
    return rate != null ? `Proposed rate $${rate}` : null;
};

export const PublicLevelView: React.FC<PublicLevelViewProps> = ({
    shift,
    slotId,
    slotHasUpdates,
    slotCandidateCounts,
    slotStatusCounts,
    interestsAll,
    counterOffers,
    counterOffersLoaded,
    onReveal,
    onReviewOffer,
    onSelectSlot,
    revealingInterestId,
    onBuzzWorker,
    buzzLoadingOfferId,
}) => {
    const slots = (shift as any).slots || [];
    const multiSlots = !(shift as any).singleUserOnly && slots.length > 0;
    const offersList = counterOffersLoaded ? counterOffers : [];

    const getOfferSlotId = (offer: any): number | null => {
        const offerSlots = offer?.slots || offer?.offer_slots || [];
        const slotIdFromSlots =
            offerSlots
                .map((s: any) => s.slot_id ?? s.slotId ?? s.slot?.id ?? null)
                .find((id: any) => id != null) ?? null;
        const fallback = offer?.slotId ?? offer?.slot_id ?? null;
        return slotIdFromSlots ?? fallback ?? null;
    };

    const findInterestForOffer = (offer: any, offerSlotId: number | null) => {
        const offerUserId = typeof offer.user === 'object' ? offer.user?.id : offer.user;
        if (offerUserId == null) return null;
        return interestsAll.find((i: any) => {
            const iUserId = i.userId ?? i.user?.id ?? null;
            if (iUserId !== offerUserId) return false;
            if (offerSlotId == null) {
                return i.slotId == null;
            }
            return i.slotId === offerSlotId;
        }) || null;
    };

    // Filter interests based on slot
    const slotInterests = slotId
        ? interestsAll.filter(i => i.slotId === slotId || i.slotId == null)
        : interestsAll;

    // Filter counter offers based on slot
    const slotOffers = slotId
        ? counterOffers.filter(o => {
            const offerSlots = o.slots || o.offer_slots || [];
            return offerSlots.some((s: any) => (s.slot_id ?? s.slotId ?? s.slot?.id) === slotId);
        })
        : offersList;

    const offerUserIds = new Set(
        slotOffers
            .map(o => (typeof o.user === 'object' ? o.user?.id : o.user))
            .filter((id: any) => id != null)
    );

    const slotInterestsFiltered = slotInterests.filter(interest => {
        const iUserId = interest.userId ?? interest.user?.id ?? null;
        if (iUserId == null) return true;
        return !offerUserIds.has(iUserId);
    });

    const total = slotOffers.length + slotInterestsFiltered.length;

    return (
        <Stack spacing={3}>
            {multiSlots && onSelectSlot && (
                <SlotSelector
                    slots={slots}
                    selectedSlotId={slotId}
                    onSelectSlot={onSelectSlot}
                    slotHasUpdates={slotHasUpdates}
                    slotCandidateCounts={slotCandidateCounts}
                    slotStatusCounts={slotStatusCounts}
                />
            )}
            <SourceSection
                title="ChemistTasker platform"
                subtitle="Public applicants from outside your network. Names stay hidden until you reveal them."
                tone="cyan"
                icon={<Sparkles />}
                count={total}
                hint={{
                    title: 'Platform candidates',
                    body: 'Verified professionals who found this shift on ChemistTasker. Reveal an applicant to see their name and profile before you decide.',
                }}
            >
                <Box
                    sx={{
                        display: 'grid',
                        gridTemplateColumns: 'minmax(0, 1fr)',
                        '@container (min-width: 540px)': { gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' },
                        gap: 1.5,
                        alignItems: 'stretch',
                    }}
                >
                    <CandidateColumn
                        title="Counter offers"
                        helper="Asked for a different rate or time."
                        tone="violet"
                        icon={<Tag />}
                        count={slotOffers.length}
                        emptyText="No counter offers yet."
                    >
                        {slotOffers.map((offer) => {
                            const offerSlotId = slotId ?? getOfferSlotId(offer);
                            const interest = findInterestForOffer(offer, offerSlotId);
                            const hidden = Boolean(interest && !interest.revealed);
                            const label = hidden ? 'Reveal offer' : 'Review offer';
                            const name = (() => {
                                if (interest && interest.revealed) {
                                    if (interest.user) {
                                        const userObj = typeof interest.user === 'object' ? interest.user : null;
                                        if (userObj) {
                                            const fullName =
                                                (userObj.firstName && userObj.lastName)
                                                    ? `${userObj.firstName} ${userObj.lastName}`
                                                    : (userObj.first_name && userObj.last_name)
                                                        ? `${userObj.first_name} ${userObj.last_name}`
                                                        : userObj.name || userObj.displayName || userObj.display_name;
                                            if (fullName) return fullName;
                                        }
                                        if (typeof userObj === 'string') return userObj;
                                    }
                                    const displayName = (interest as any).displayName || interest.userName;
                                    if (displayName) return displayName;
                                }
                                return null;
                            })();

                            return (
                                <CandidateRow
                                    key={offer.id}
                                    name={name ?? 'Anonymous applicant'}
                                    anonymous={!name}
                                    tone="violet"
                                    meta={proposedRateOf(offer) ?? 'Sent a counter offer'}
                                    actions={
                                        <RowAction kind={hidden ? 'primary' : 'secondary'} onClick={() => onReviewOffer(shift, offer, offerSlotId)}>
                                            {label}
                                        </RowAction>
                                    }
                                />
                            );
                        })}
                    </CandidateColumn>

                    <CandidateColumn
                        title="Interested"
                        helper="Applied at the posted rate."
                        tone="cyan"
                        icon={<UserCheck />}
                        count={slotInterestsFiltered.length}
                        emptyText="No platform applicants yet."
                    >
                        {slotInterestsFiltered.map((interest) => {
                            const isPendingConfirmation = Boolean(interest.pendingConfirmation ?? interest.pending_confirmation);
                            const isAwaitingPayment = Boolean(interest.awaitingPayment ?? interest.awaiting_payment);
                            const pendingOfferId = interest.pendingOfferId ?? interest.pending_offer_id ?? null;
                            const revealed = Boolean(interest.revealed);
                            return (
                                <CandidateRow
                                    key={interest.id}
                                    name={revealed ? getInterestDisplayName(interest, interest.user) : 'Anonymous applicant'}
                                    anonymous={!revealed}
                                    tone="cyan"
                                    meta={revealed ? 'Platform applicant' : 'Reveal to see name and profile'}
                                    pills={
                                        isAwaitingPayment ? <Pill tone="red" label="Awaiting payment" />
                                            : isPendingConfirmation ? <Pill tone="amber" label="Offer sent · awaiting reply" />
                                                : undefined
                                    }
                                    actions={
                                        <>
                                            <RowAction
                                                kind={revealed || isPendingConfirmation || isAwaitingPayment ? 'secondary' : 'primary'}
                                                loading={revealingInterestId === interest.id}
                                                disabled={revealingInterestId === interest.id}
                                                onClick={() => onReveal(shift, interest)}
                                            >
                                                {isPendingConfirmation || isAwaitingPayment ? 'View' : revealed ? 'Review' : 'Reveal'}
                                            </RowAction>
                                            {isPendingConfirmation && !isAwaitingPayment && pendingOfferId != null && onBuzzWorker && (
                                                <RowAction
                                                    kind="buzz"
                                                    title="Send a reminder to confirm"
                                                    loading={buzzLoadingOfferId === Number(pendingOfferId)}
                                                    disabled={buzzLoadingOfferId === Number(pendingOfferId)}
                                                    onClick={() => onBuzzWorker(Number(pendingOfferId))}
                                                >
                                                    Buzz
                                                </RowAction>
                                            )}
                                        </>
                                    }
                                />
                            );
                        })}
                    </CandidateColumn>
                </Box>
            </SourceSection>
        </Stack>
    );
};
