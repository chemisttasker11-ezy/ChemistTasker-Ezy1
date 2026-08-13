import React from 'react';
import { Box, Stack, Divider, Chip } from '@mui/material';
import {
    CheckCircle as Check,
    PersonAdd as UserCheck,
    PersonRemove as UserX,
    HourglassEmpty as Clock,
    Store,
} from '@mui/icons-material';
import { Shift, ShiftMemberStatus } from '@chemisttasker/shared-core';
import { StatusCard } from './StatusCard';
import { SlotSelector } from './SlotSelector';
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

    // Categorize members by status
    const interested = slotMembers.filter((m) => m.status === 'interested');
    const assigned = slotMembers.filter((m) => m.status === 'accepted');
    const rejected = slotMembers.filter((m) => m.status === 'rejected');
    const noResponse = slotMembers.filter((m) => m.status === 'no_response');

    const getOfferForMember = (member: ShiftMemberStatus) => {
        const offer = findOfferForMemberInShift(offers, member, selectedSlotId);
        // If multi-slot, lock to the selected slot; otherwise use null
        return { offer, slotId: multiSlots ? selectedSlotId : null };
    };

    return (
        <Stack spacing={2}>
            {/* Slot Selector for multi-slot shifts */}
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

            <Divider>
                <Chip
                    icon={<Store />}
                    label="Community Candidates"
                    sx={{
                        height: 38,
                        px: 0.75,
                        bgcolor: '#ECFDF5',
                        color: '#065F46',
                        border: '1px solid #A7F3D0',
                        boxShadow: '0 10px 22px rgba(16,185,129,.14)',
                        fontWeight: 950,
                        '& .MuiChip-icon': {
                            color: '#059669',
                            fontSize: 20,
                        },
                        '& .MuiChip-label': {
                            px: 1,
                            fontSize: { xs: 12, sm: 14 },
                        },
                    }}
                />
            </Divider>

            <Box
                sx={{
                    display: 'grid',
                    gridTemplateColumns: {
                        xs: 'repeat(2, minmax(0, 1fr))',
                        sm: 'repeat(2, minmax(0, 1fr))',
                        lg: 'repeat(4, minmax(230px, 1fr))',
                    },
                    gap: { xs: 1.25, sm: 2 },
                    alignItems: 'stretch',
                    justifyContent: 'center',
                }}
            >
                <StatusCard
                    title="Interested"
                    members={interested}
                    icon={<UserCheck />}
                    color="success"
                    shiftId={shift.id}
                    onReviewCandidate={onReviewCandidate}
                    getOfferForMember={getOfferForMember}
                    reviewLoadingId={reviewLoadingId}
                    onBuzzWorker={onBuzzWorker}
                    buzzLoadingOfferId={buzzLoadingOfferId}
                />
                <StatusCard
                    title="Assigned"
                    members={assigned}
                    icon={<Check />}
                    color="info"
                    shiftId={shift.id}
                    onReviewCandidate={onReviewCandidate}
                    getOfferForMember={getOfferForMember}
                    reviewLoadingId={reviewLoadingId}
                />
                <StatusCard
                    title="Rejected"
                    members={rejected}
                    icon={<UserX />}
                    color="error"
                    shiftId={shift.id}
                    onReviewCandidate={onReviewCandidate}
                    getOfferForMember={getOfferForMember}
                    reviewLoadingId={reviewLoadingId}
                />
                <StatusCard
                    title="No Response"
                    members={noResponse}
                    icon={<Clock />}
                    color="warning"
                    shiftId={shift.id}
                    onReviewCandidate={onReviewCandidate}
                    getOfferForMember={getOfferForMember}
                    reviewLoadingId={reviewLoadingId}
                />
            </Box>
        </Stack>
    );
};
