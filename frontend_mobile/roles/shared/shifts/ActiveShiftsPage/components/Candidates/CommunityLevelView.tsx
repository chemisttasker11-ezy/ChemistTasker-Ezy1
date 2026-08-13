// CommunityLevelView Component
// Displays community shift members grouped by status

import React from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { Divider, Surface, Text, Icon } from 'react-native-paper';
import { Shift, ShiftMemberStatus } from '@chemisttasker/shared-core';
import { customTheme } from '../../theme';
import StatusCard from './StatusCard';
import SlotSelector from './SlotSelector';
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

export default function CommunityLevelView({
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
}: CommunityLevelViewProps) {
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
        <ScrollView contentContainerStyle={styles.container}>
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

            <View style={styles.dividerContainer}>
                <Divider style={styles.divider} />
                <Surface style={styles.dividerChip} elevation={2}>
                    <Icon source="storefront" size={20} color="#059669" />
                    <Text style={styles.dividerChipText}>Community Candidates</Text>
                </Surface>
                <Divider style={styles.divider} />
            </View>

            <View style={styles.grid}>
                <StatusCard
                    title="Interested"
                    members={interested}
                    icon="account-check"
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
                    icon="check-circle"
                    color="info"
                    shiftId={shift.id}
                    onReviewCandidate={onReviewCandidate}
                    getOfferForMember={getOfferForMember}
                    reviewLoadingId={reviewLoadingId}
                />
                <StatusCard
                    title="Rejected"
                    members={rejected}
                    icon="account-remove"
                    color="error"
                    shiftId={shift.id}
                    onReviewCandidate={onReviewCandidate}
                    getOfferForMember={getOfferForMember}
                    reviewLoadingId={reviewLoadingId}
                />
                <StatusCard
                    title="No Response"
                    members={noResponse}
                    icon="clock-outline"
                    color="warning"
                    shiftId={shift.id}
                    onReviewCandidate={onReviewCandidate}
                    getOfferForMember={getOfferForMember}
                    reviewLoadingId={reviewLoadingId}
                />
            </View>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: {
        padding: customTheme.spacing.md,
        gap: customTheme.spacing.md,
    },
    dividerContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: customTheme.spacing.sm,
        marginVertical: customTheme.spacing.sm,
    },
    divider: {
        flex: 1,
    },
    dividerChip: {
        backgroundColor: '#ECFDF5',
        borderWidth: 1,
        borderColor: '#A7F3D0',
        borderRadius: 999,
        paddingHorizontal: customTheme.spacing.md,
        paddingVertical: 8,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        shadowColor: '#10B981',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.14,
        shadowRadius: 12,
    },
    dividerChipText: {
        color: '#065F46',
        fontSize: 13,
        fontWeight: '900',
    },
    grid: {
        gap: customTheme.spacing.md,
    },
});
