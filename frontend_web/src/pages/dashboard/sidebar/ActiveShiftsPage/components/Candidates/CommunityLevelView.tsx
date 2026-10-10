import React from 'react';
import { Box, Stack } from '@mui/material';
import { CircleCheck, Clock, UserCheck, UserX, Users } from 'lucide-react';
import { Shift, ShiftMemberStatus } from '@chemisttasker/shared-core';
import { StatusCard } from './StatusCard';
import { SlotSelector } from './SlotSelector';
import { SourceSection } from '../../../../shiftCenter/ShiftCentreParts';
import { dedupeMembers, findOfferForMemberInShift } from '../../utils/candidateHelpers';

interface CommunityLevelViewProps {
    shift: Shift;
    members: ShiftMemberStatus[];
    selectedSlotId: number | null;
    slotHasUpdates?: Record<number, boolean>;
    slotCandidateCounts?: Record<number, number>;
    slotStatusCounts?: Record<number, { interested: number; assigned: number; rejected: number; noResponse: number }>;
    offers: any[];
    showSlotSelector?: boolean;
    /** Audiences already reached inside the poster's own network, e.g. ["My Pharmacy", "Favourites"]. */
    audienceLabels?: string[];
    onSelectSlot: (slotId: number) => void;
    onReviewCandidate: (member: ShiftMemberStatus, shiftId: number, offer: any | null, slotId: number | null) => void;
    reviewLoadingId?: number | null;
    onBuzzWorker?: (offerId: number) => void;
    buzzLoadingOfferId?: number | null;
}

export const CommunityLevelView: React.FC<CommunityLevelViewProps> = ({
    shift,
    members,
    selectedSlotId,
    slotHasUpdates,
    slotCandidateCounts,
    slotStatusCounts,
    offers,
    showSlotSelector = true,
    audienceLabels,
    onSelectSlot,
    onReviewCandidate,
    reviewLoadingId,
    onBuzzWorker,
    buzzLoadingOfferId,
}) => {
    const slots = (shift as any).slots || [];
    const multiSlots = !(shift as any).singleUserOnly && slots.length > 0;

    // Parent passes the selected-slot member list. Do not re-filter here; slot field
    // names vary between API payloads and double-filtering can freeze/empty the view.
    const slotMembers = dedupeMembers(members);

    const interested = slotMembers.filter((m) => m.status === 'interested');
    const assigned = slotMembers.filter((m) => m.status === 'accepted');
    const rejected = slotMembers.filter((m) => m.status === 'rejected');
    const noResponse = slotMembers.filter((m) => m.status === 'no_response');

    const getOfferForMember = (member: ShiftMemberStatus) => {
        const offer = findOfferForMemberInShift(offers, member, selectedSlotId);
        // If multi-slot, lock to the selected slot; otherwise use null
        return { offer, slotId: multiSlots ? selectedSlotId : null };
    };

    const reached = audienceLabels && audienceLabels.length > 0 ? audienceLabels.join(', ') : 'your team';
    const shared = { shiftId: shift.id, onReviewCandidate, getOfferForMember, reviewLoadingId };

    return (
        <Stack spacing={3}>
            {showSlotSelector && multiSlots && (
                <SlotSelector
                    slots={slots}
                    selectedSlotId={selectedSlotId}
                    onSelectSlot={onSelectSlot}
                    slotHasUpdates={slotHasUpdates}
                    slotCandidateCounts={slotCandidateCounts}
                    slotStatusCounts={slotStatusCounts}
                />
            )}

            <SourceSection
                title="Your network"
                subtitle={`Internal candidates reached through ${reached}.`}
                tone="violet"
                icon={<Users />}
                count={slotMembers.length}
                hint={{
                    title: 'Internal candidates',
                    body: 'People already connected to you: your team, favourites, chain or organisation. Their names are always visible.',
                }}
            >
                <Box
                    sx={{
                        display: 'grid',
                        // Sized by the card, not the window: 1, 2 or 4 columns.
                        gridTemplateColumns: 'minmax(0, 1fr)',
                        '@container (min-width: 540px)': { gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' },
                        '@container (min-width: 960px)': { gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' },
                        gap: 1.5,
                        alignItems: 'stretch',
                    }}
                >
                    <StatusCard
                        title="Interested"
                        helper="Said yes. Review and assign."
                        emptyText="No one has responded yet."
                        members={interested}
                        icon={<UserCheck />}
                        tone="cyan"
                        actionable
                        onBuzzWorker={onBuzzWorker}
                        buzzLoadingOfferId={buzzLoadingOfferId}
                        {...shared}
                    />
                    <StatusCard
                        title="Assigned"
                        helper="Booked for this date."
                        emptyText="No one assigned yet."
                        members={assigned}
                        icon={<CircleCheck />}
                        tone="green"
                        {...shared}
                    />
                    <StatusCard
                        title="No reply"
                        helper="Notified, has not answered."
                        emptyText="Everyone notified has replied."
                        members={noResponse}
                        icon={<Clock />}
                        tone="amber"
                        {...shared}
                    />
                    <StatusCard
                        title="Rejected"
                        helper="You turned them down."
                        emptyText="No one rejected."
                        members={rejected}
                        icon={<UserX />}
                        tone="red"
                        {...shared}
                    />
                </Box>
            </SourceSection>
        </Stack>
    );
};
