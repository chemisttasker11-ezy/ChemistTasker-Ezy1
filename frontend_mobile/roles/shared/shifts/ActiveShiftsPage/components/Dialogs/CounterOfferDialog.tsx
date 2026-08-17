import React from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { Portal, Dialog, Button, Text, Surface, Divider, ActivityIndicator, Chip } from 'react-native-paper';
import { customTheme } from '../../theme';
import { RatingComment, RatingSummary } from '../../types';

const STATE_CODES = new Set(['NSW', 'VIC', 'QLD', 'WA', 'SA', 'TAS', 'ACT', 'NT']);

const extractSuburb = (origin?: string | null) => {
    if (!origin) return null;
    const cleaned = origin.replace(/\s+/g, ' ').trim();
    if (!cleaned) return null;
    const commaParts = cleaned.split(',').map((part) => part.trim()).filter(Boolean);
    const candidate = commaParts.length >= 2 ? commaParts[1] : cleaned;
    const tokens = candidate.split(' ').filter(Boolean);
    const stateIndex = tokens.findIndex((token) => STATE_CODES.has(token.toUpperCase()));
    if (stateIndex > 0) {
        const beforeState = tokens.slice(0, stateIndex);
        if (beforeState.length >= 2) return beforeState.slice(-2).join(' ');
        return beforeState.join(' ');
    }
    if (/^\d/.test(tokens[0]) && tokens.length >= 2) {
        return tokens.slice(-2).join(' ');
    }
    return tokens.join(' ') || null;
};

interface CounterOfferDialogProps {
    visible: boolean;
    offer: any | null;
    candidate: any | null;
    slotId: number | null;
    workerRatingSummary: RatingSummary | null;
    workerRatingComments: RatingComment[];
    workerCommentsPage: number;
    workerCommentsPageCount: number;
    counterActionLoading: number | null;
    assignLoading?: boolean;
    assignLabel?: string;
    onDismiss: () => void;
    onAccept: (offer: any) => void;
    onReject: (offer: any) => void;
    onAssign?: (userId: number, slotId: number | null) => void;
    onPageChange: (page: number) => void;
}

export default function CounterOfferDialog({
    visible,
    offer,
    candidate,
    slotId,
    workerRatingSummary,
    workerRatingComments,
    workerCommentsPage,
    workerCommentsPageCount,
    counterActionLoading,
    assignLoading,
    assignLabel,
    onDismiss,
    onAccept,
    onReject,
    onAssign,
    onPageChange,
}: CounterOfferDialogProps) {
    if (!offer && !candidate) return null;

    const awaitingPayment = Boolean(
        candidate?.awaitingPayment ?? candidate?.awaiting_payment
    );
    const pendingConfirmation = !awaitingPayment && Boolean(
        candidate?.pendingConfirmation ?? candidate?.pending_confirmation
    );
    const offerStatus = String(offer?.status ?? '').toUpperCase();
    const isActionableCounterOffer = Boolean(offer) && !pendingConfirmation && !awaitingPayment && offerStatus === 'PENDING';
    const counterOfferDetails =
        offer ||
        candidate?.pendingConfirmationCounterOffer ||
        candidate?.pending_confirmation_counter_offer ||
        candidate?.awaitingPaymentCounterOffer ||
        candidate?.awaiting_payment_counter_offer ||
        null;
    const rawOrigin =
        (counterOfferDetails as any)?.travel_origin ??
        (counterOfferDetails as any)?.travelOrigin ??
        null;
    const travelSuburb = extractSuburb(rawOrigin);
    const requestTravel = Boolean(
        (counterOfferDetails as any)?.requestTravel ??
        (counterOfferDetails as any)?.request_travel
    );
    const rawSlots = counterOfferDetails?._mappedSlots || counterOfferDetails?.slots || counterOfferDetails?.offer_slots || [];
    const visibleSlots =
        slotId == null
            ? rawSlots
            : rawSlots.filter((s: any) => (s.slotId ?? s.slot_id ?? s.slot?.id ?? s.id) === slotId);
    const slotsToShow = visibleSlots.length > 0 ? visibleSlots : rawSlots;

    const isOffer = Boolean(offer);
    const isLoading = counterActionLoading != null && offer?.id === counterActionLoading;

    return (
        <Portal>
            <Dialog visible={visible} onDismiss={onDismiss} style={styles.dialog}>
                <Dialog.Title>{awaitingPayment ? 'Awaiting Payment' : pendingConfirmation ? 'Pending Confirmation' : isActionableCounterOffer ? 'Counter Offer' : 'Candidate Review'}</Dialog.Title>
                <Dialog.ScrollArea>
                    <ScrollView contentContainerStyle={styles.content}>
                        {candidate && (
                            <Surface style={styles.section} elevation={1}>
                                <Text style={styles.sectionTitle}>Candidate</Text>
                                <Text style={styles.candidateName}>
                                    {candidate.name || candidate.first_name || candidate.firstName || 'Candidate'}
                                </Text>
                                {candidate.shortBio && (
                                    <Text style={styles.detail}>{candidate.shortBio}</Text>
                                )}
                                {candidate.email && (
                                    <Text style={styles.detail}>{candidate.email}</Text>
                                )}
                                {pendingConfirmation && (
                                    <Chip style={styles.pendingChip}>Offer sent. Waiting for candidate confirmation.</Chip>
                                )}
                                {awaitingPayment && (
                                    <Chip style={styles.awaitingPaymentChip}>Candidate confirmed. Payment is required to finalize.</Chip>
                                )}
                            </Surface>
                        )}

                        {counterOfferDetails && slotsToShow.length > 0 && (
                            <Surface style={styles.section} elevation={1}>
                                <Text style={styles.sectionTitle}>Proposed Shift Terms</Text>
                                {slotsToShow.map((slot: any, idx: number) => (
                                    <View key={`${slot.slotId ?? slot.id ?? idx}`} style={styles.offerSlotBlock}>
                                        <Text style={styles.slotDate}>
                                            {slot.date || slot.slotDate
                                                ? new Date(slot.date || slot.slotDate).toLocaleDateString()
                                                : `Slot ${idx + 1}`}
                                        </Text>
                                        <Text style={styles.detail}>
                                            Proposed time:{' '}
                                            {(slot.proposedStart ?? slot.proposedStartTime ?? slot.proposed_start_time ?? slot.startTime ?? slot.start_time)?.slice(0, 5) || 'N/A'}
                                            {' - '}
                                            {(slot.proposedEnd ?? slot.proposedEndTime ?? slot.proposed_end_time ?? slot.endTime ?? slot.end_time)?.slice(0, 5) || 'N/A'}
                                        </Text>
                                        <Text style={styles.slotRate}>
                                            Proposed rate: {slot.proposedRate != null ? `$${slot.proposedRate}` : 'N/A'}
                                        </Text>
                                    </View>
                                ))}
                            </Surface>
                        )}

                        {counterOfferDetails && (
                            <Surface style={styles.section} elevation={1}>
                                <Text style={styles.sectionTitle}>Travel</Text>
                                {requestTravel ? (
                                    <>
                                        <Chip icon="airplane" style={styles.travelChip}>Requested travel support</Chip>
                                        <Text style={styles.detail}>
                                            Traveling from: {travelSuburb || rawOrigin || 'Location not provided'}
                                        </Text>
                                    </>
                                ) : (
                                    <Text style={styles.detail}>No travel support requested.</Text>
                                )}
                            </Surface>
                        )}

                        <Surface style={styles.section} elevation={1}>
                            <Text style={styles.sectionTitle}>Ratings & Reviews</Text>
                            {workerRatingSummary ? (
                                <Text style={styles.detail}>
                                    {workerRatingSummary.average.toFixed(1)} ({workerRatingSummary.count} reviews)
                                </Text>
                            ) : (
                                <Text style={styles.detail}>No ratings yet.</Text>
                            )}
                            {workerRatingComments.length > 0 ? (
                                workerRatingComments.map((comment) => (
                                    <View key={comment.id} style={styles.commentRow}>
                                        <Text style={styles.commentStars}>{'★'.repeat(comment.stars || 0)}</Text>
                                        <Text style={styles.commentText}>{comment.comment}</Text>
                                    </View>
                                ))
                            ) : (
                                <Text style={styles.detail}>No reviews to display.</Text>
                            )}
                            {workerCommentsPageCount > 1 && (
                                <View style={styles.paginationRow}>
                                    <Button
                                        mode="outlined"
                                        compact
                                        disabled={workerCommentsPage <= 1}
                                        onPress={() => onPageChange(workerCommentsPage - 1)}
                                    >
                                        Prev
                                    </Button>
                                    <Text style={styles.pageText}>
                                        {workerCommentsPage} / {workerCommentsPageCount}
                                    </Text>
                                    <Button
                                        mode="outlined"
                                        compact
                                        disabled={workerCommentsPage >= workerCommentsPageCount}
                                        onPress={() => onPageChange(workerCommentsPage + 1)}
                                    >
                                        Next
                                    </Button>
                                </View>
                            )}
                        </Surface>
                    </ScrollView>
                </Dialog.ScrollArea>
                <Divider />
                <Dialog.Actions>
                    <Button onPress={onDismiss} disabled={isLoading || assignLoading}>Close</Button>
                    {isActionableCounterOffer ? (
                        <>
                            <Button onPress={() => onReject(offer)} disabled={isLoading} textColor={customTheme.colors.error}>
                                Reject
                            </Button>
                            <Button
                                onPress={() => onAccept(offer)}
                                loading={isLoading}
                                disabled={isLoading}
                                mode="contained"
                            >
                                Accept
                            </Button>
                        </>
                    ) : !pendingConfirmation && !awaitingPayment && onAssign && candidate ? (
                        <Button
                            mode="contained"
                            loading={assignLoading}
                            disabled={assignLoading}
                            onPress={() => onAssign(candidate.userId ?? candidate.id, slotId)}
                        >
                            {assignLabel || 'Assign Candidate'}
                        </Button>
                    ) : (
                        <ActivityIndicator />
                    )}
                </Dialog.Actions>
            </Dialog>
        </Portal>
    );
}

const styles = StyleSheet.create({
    dialog: {
        maxHeight: '80%',
    },
    content: {
        paddingHorizontal: 16,
        paddingBottom: 16,
    },
    section: {
        padding: customTheme.spacing.md,
        borderRadius: 8,
        marginBottom: customTheme.spacing.sm,
        backgroundColor: customTheme.colors.greyLight,
    },
    sectionTitle: {
        fontWeight: '600',
        fontSize: 14,
        color: customTheme.colors.grey,
        marginBottom: customTheme.spacing.xs,
    },
    candidateName: {
        fontSize: 16,
        fontWeight: '600',
        color: customTheme.colors.text,
    },
    detail: {
        fontSize: 13,
        color: customTheme.colors.textMuted,
        marginTop: 4,
    },
    pendingChip: {
        alignSelf: 'flex-start',
        marginTop: customTheme.spacing.sm,
        backgroundColor: customTheme.colors.warningLight,
    },
    awaitingPaymentChip: {
        alignSelf: 'flex-start',
        marginTop: customTheme.spacing.sm,
        backgroundColor: customTheme.colors.errorLight,
    },
    offerSlotBlock: {
        paddingVertical: 8,
        borderBottomWidth: 1,
        borderBottomColor: customTheme.colors.border,
    },
    slotDate: {
        fontSize: 14,
        color: customTheme.colors.text,
    },
    slotRate: {
        fontSize: 14,
        fontWeight: '600',
        color: customTheme.colors.primary,
    },
    travelChip: {
        alignSelf: 'flex-start',
        marginTop: customTheme.spacing.xs,
    },
    commentRow: {
        marginTop: customTheme.spacing.xs,
    },
    commentStars: {
        color: customTheme.colors.warning,
        fontSize: 12,
    },
    commentText: {
        color: customTheme.colors.text,
        fontSize: 13,
    },
    paginationRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginTop: customTheme.spacing.sm,
    },
    pageText: {
        color: customTheme.colors.textMuted,
    },
});
