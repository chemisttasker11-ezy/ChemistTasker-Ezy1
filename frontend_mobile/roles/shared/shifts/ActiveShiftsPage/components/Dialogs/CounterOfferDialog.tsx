import React from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Portal, Dialog, Text, Divider, ActivityIndicator } from 'react-native-paper';
import {
    Star,
    Plane,
    MapPin,
    Clock,
    DollarSign,
    Calendar,
} from 'lucide-react-native';
import { Pill } from '@/components/ui/Pill';
import { colors as tokenColors, font, radius, space, touch } from '@/constants/tokens';
import { RatingComment, RatingSummary } from '../../types';
import type { ShiftReviewCandidate } from '@chemisttasker/shared-core';
import { CandidateWorkProfile } from '../../../../skills/CandidateWorkProfile';

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
    candidate: ShiftReviewCandidate | null;
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

    const awaitingPayment = Boolean(candidate?.awaitingPayment);
    const pendingConfirmation = !awaitingPayment && Boolean(candidate?.pendingConfirmation);
    const offerStatus = String(offer?.status ?? '').toUpperCase();
    const isActionableCounterOffer = Boolean(offer) && !pendingConfirmation && !awaitingPayment && offerStatus === 'PENDING';
    const counterOfferDetails =
        offer ||
        candidate?.pendingConfirmationCounterOffer ||
        candidate?.awaitingPaymentCounterOffer ||
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
    const rawSlots =
        counterOfferDetails?._mappedSlots ||
        counterOfferDetails?.slots ||
        counterOfferDetails?.offer_slots ||
        [];
    const visibleSlots =
        slotId == null
            ? rawSlots
            : rawSlots.filter((s: any) => (s.slotId ?? s.slot_id ?? s.slot?.id ?? s.id) === slotId);
    const slotsToShow = visibleSlots.length > 0 ? visibleSlots : rawSlots;

    const isLoading = counterActionLoading != null && offer?.id === counterActionLoading;

    const dialogTitle = awaitingPayment
        ? 'Awaiting Payment'
        : pendingConfirmation
            ? 'Pending Confirmation'
            : isActionableCounterOffer
                ? 'Counter Offer'
                : 'Candidate Review';

    return (
        <Portal>
            <Dialog visible={visible} onDismiss={onDismiss} style={styles.dialog}>
                <Dialog.Title style={styles.dialogTitle}>{dialogTitle}</Dialog.Title>
                <Dialog.ScrollArea style={styles.scrollArea}>
                    <ScrollView contentContainerStyle={styles.content}>
                        {candidate && (
                            <View style={styles.section}>
                                {/* Same profile as web Review: no contact details before the booking is confirmed. */}
                                <CandidateWorkProfile
                                    name={candidate.name || 'Candidate'}
                                    bio={candidate.shortBio}
                                    profile={candidate.profile}
                                />
                                {pendingConfirmation && (
                                    <View style={styles.statusPillWrap}>
                                        <Pill label="Offer sent · Waiting for candidate confirmation" tone="amber" />
                                    </View>
                                )}
                                {awaitingPayment && (
                                    <View style={styles.statusPillWrap}>
                                        <Pill label="Candidate confirmed · Payment is required to finalize" tone="red" />
                                    </View>
                                )}
                            </View>
                        )}

                        {counterOfferDetails && slotsToShow.length > 0 && (
                            <View style={styles.section}>
                                <Text style={styles.sectionTitle}>Proposed Shift Terms</Text>
                                {slotsToShow.map((slot: any, idx: number) => {
                                    const slotDate = slot.date || slot.slotDate;
                                    const startTime = (slot.proposedStart ?? slot.proposedStartTime ?? slot.proposed_start_time ?? slot.startTime ?? slot.start_time)?.slice(0, 5) || 'N/A';
                                    const endTime = (slot.proposedEnd ?? slot.proposedEndTime ?? slot.proposed_end_time ?? slot.endTime ?? slot.end_time)?.slice(0, 5) || 'N/A';
                                    const rate = slot.proposedRate != null ? `$${slot.proposedRate}` : null;

                                    return (
                                        <View key={`${slot.slotId ?? slot.id ?? idx}`} style={styles.offerSlotBlock}>
                                            <View style={styles.slotRow}>
                                                <Calendar size={14} color={tokenColors.textSecondary} />
                                                <Text style={styles.slotDate}>
                                                    {slotDate ? new Date(slotDate).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }) : `Slot ${idx + 1}`}
                                                </Text>
                                            </View>
                                            <View style={styles.slotRow}>
                                                <Clock size={14} color={tokenColors.textSecondary} />
                                                <Text style={styles.detail}>
                                                    Proposed time: {startTime} - {endTime}
                                                </Text>
                                            </View>
                                            {rate && (
                                                <View style={styles.slotRow}>
                                                    <DollarSign size={14} color={tokenColors.primary} />
                                                    <Text style={styles.slotRate}>
                                                        Proposed rate: {rate}/hr
                                                    </Text>
                                                </View>
                                            )}
                                        </View>
                                    );
                                })}
                            </View>
                        )}

                        {counterOfferDetails && (
                            <View style={styles.section}>
                                <Text style={styles.sectionTitle}>Travel</Text>
                                {requestTravel ? (
                                    <View style={styles.travelWrap}>
                                        <Pill
                                            label="Requested travel support"
                                            tone="violet"
                                            icon={<Plane size={11} color="#6D28D9" />}
                                        />
                                        <View style={styles.locationRow}>
                                            <MapPin size={14} color={tokenColors.textSecondary} />
                                            <Text style={styles.detail}>
                                                Traveling from: {travelSuburb || rawOrigin || 'Location not provided'}
                                            </Text>
                                        </View>
                                    </View>
                                ) : (
                                    <Text style={styles.detail}>No travel support requested.</Text>
                                )}
                            </View>
                        )}

                        <View style={styles.section}>
                            <Text style={styles.sectionTitle}>Ratings & Reviews</Text>
                            {workerRatingSummary ? (
                                <View style={styles.ratingSummaryRow}>
                                    <Star size={16} color="#B45309" fill="#B45309" />
                                    <Text style={styles.ratingSummaryText}>
                                        {workerRatingSummary.average.toFixed(1)} ({workerRatingSummary.count} reviews)
                                    </Text>
                                </View>
                            ) : (
                                <Text style={styles.detail}>No ratings yet.</Text>
                            )}
                            {workerRatingComments.length > 0 ? (
                                workerRatingComments.map((comment) => (
                                    <View key={comment.id} style={styles.commentRow}>
                                        <View style={styles.commentStarsRow}>
                                            {Array.from({ length: comment.stars || 0 }).map((_, i) => (
                                                <Star key={i} size={12} color="#B45309" fill="#B45309" />
                                            ))}
                                        </View>
                                        <Text style={styles.commentText}>{comment.comment}</Text>
                                    </View>
                                ))
                            ) : (
                                <Text style={styles.detail}>No reviews to display.</Text>
                            )}
                            {workerCommentsPageCount > 1 && (
                                <View style={styles.paginationRow}>
                                    <TouchableOpacity
                                        style={[styles.pageBtn, workerCommentsPage <= 1 && styles.pageBtnDisabled]}
                                        disabled={workerCommentsPage <= 1}
                                        onPress={() => onPageChange(workerCommentsPage - 1)}
                                        accessible
                                        accessibilityRole="button"
                                        accessibilityLabel="Previous reviews page"
                                    >
                                        <Text style={styles.pageBtnText}>Prev</Text>
                                    </TouchableOpacity>
                                    <Text style={styles.pageText}>
                                        {workerCommentsPage} / {workerCommentsPageCount}
                                    </Text>
                                    <TouchableOpacity
                                        style={[styles.pageBtn, workerCommentsPage >= workerCommentsPageCount && styles.pageBtnDisabled]}
                                        disabled={workerCommentsPage >= workerCommentsPageCount}
                                        onPress={() => onPageChange(workerCommentsPage + 1)}
                                        accessible
                                        accessibilityRole="button"
                                        accessibilityLabel="Next reviews page"
                                    >
                                        <Text style={styles.pageBtnText}>Next</Text>
                                    </TouchableOpacity>
                                </View>
                            )}
                        </View>
                    </ScrollView>
                </Dialog.ScrollArea>
                <Divider />
                <Dialog.Actions style={styles.actions}>
                    <TouchableOpacity
                        onPress={onDismiss}
                        disabled={isLoading || assignLoading}
                        style={styles.actionBtnSecondary}
                        accessible
                        accessibilityRole="button"
                        accessibilityLabel="Close dialog"
                    >
                        <Text style={styles.actionBtnLabelSecondary}>Close</Text>
                    </TouchableOpacity>

                    {isActionableCounterOffer && (
                        <>
                            <TouchableOpacity
                                onPress={() => onReject(offer)}
                                disabled={isLoading}
                                style={styles.actionBtnDestructive}
                                accessible
                                accessibilityRole="button"
                                accessibilityLabel="Reject counter offer"
                            >
                                <Text style={styles.actionBtnLabelDestructive}>Reject</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                onPress={() => onAccept(offer)}
                                disabled={isLoading}
                                style={styles.actionBtnPrimary}
                                accessible
                                accessibilityRole="button"
                                accessibilityLabel="Accept counter offer"
                            >
                                {isLoading ? (
                                    <ActivityIndicator size={14} color="#FFFFFF" />
                                ) : (
                                    <Text style={styles.actionBtnLabelPrimary}>Accept</Text>
                                )}
                            </TouchableOpacity>
                        </>
                    )}

                    {!isActionableCounterOffer && !pendingConfirmation && !awaitingPayment && onAssign && candidate && (
                        <TouchableOpacity
                            onPress={() => {
                                if (candidate.userId != null) onAssign(candidate.userId, slotId);
                            }}
                            disabled={assignLoading}
                            style={styles.actionBtnPrimary}
                            accessible
                            accessibilityRole="button"
                            accessibilityLabel={assignLabel || 'Assign Candidate'}
                        >
                            {assignLoading ? (
                                <ActivityIndicator size={14} color="#FFFFFF" />
                            ) : (
                                <Text style={styles.actionBtnLabelPrimary}>
                                    {assignLabel || 'Assign Candidate'}
                                </Text>
                            )}
                        </TouchableOpacity>
                    )}
                </Dialog.Actions>
            </Dialog>
        </Portal>
    );
}

const styles = StyleSheet.create({
    dialog: {
        maxHeight: '84%',
        borderRadius: radius.card,
        backgroundColor: '#FFFFFF',
    },
    dialogTitle: {
        fontSize: 16,
        fontWeight: '800',
        fontFamily: font.inter.semiBold,
        color: tokenColors.textPrimary,
        paddingHorizontal: space.md,
        paddingTop: space.md,
        paddingBottom: space.xs,
    },
    scrollArea: {
        paddingHorizontal: 0,
    },
    content: {
        paddingHorizontal: space.md,
        paddingBottom: space.md,
        gap: space.sm,
    },
    section: {
        padding: space.md,
        borderRadius: radius.nested,
        backgroundColor: '#F8FAFC',
        borderWidth: 1,
        borderColor: tokenColors.border,
        gap: space.xs,
    },
    sectionTitle: {
        fontWeight: '800',
        fontFamily: font.inter.semiBold,
        fontSize: 13,
        color: tokenColors.textPrimary,
        marginBottom: space.xs,
    },
    statusPillWrap: {
        marginTop: space.xs,
        alignSelf: 'flex-start',
    },
    offerSlotBlock: {
        paddingVertical: space.xs + 2,
        borderBottomWidth: 1,
        borderBottomColor: tokenColors.border,
        gap: 3,
    },
    slotRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.xs,
    },
    slotDate: {
        fontSize: 13,
        fontWeight: '700',
        fontFamily: font.inter.semiBold,
        color: tokenColors.textPrimary,
    },
    slotRate: {
        fontSize: 13,
        fontWeight: '800',
        fontFamily: font.inter.semiBold,
        color: tokenColors.primary,
    },
    detail: {
        fontSize: 12,
        fontFamily: font.inter.regular,
        color: tokenColors.textSecondary,
    },
    travelWrap: {
        gap: space.xs,
        alignItems: 'flex-start',
    },
    locationRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.xs,
        marginTop: 2,
    },
    ratingSummaryRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.xs,
    },
    ratingSummaryText: {
        fontSize: 13,
        fontWeight: '700',
        fontFamily: font.inter.semiBold,
        color: tokenColors.textPrimary,
    },
    commentRow: {
        marginTop: space.xs,
        paddingTop: space.xs,
        borderTopWidth: 1,
        borderTopColor: tokenColors.border,
        gap: 2,
    },
    commentStarsRow: {
        flexDirection: 'row',
        gap: 2,
    },
    commentText: {
        color: tokenColors.textPrimary,
        fontSize: 12,
        fontFamily: font.inter.regular,
    },
    paginationRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginTop: space.sm,
    },
    pageBtn: {
        minHeight: touch.min,
        minWidth: 54,
        paddingHorizontal: space.sm,
        borderRadius: radius.control,
        borderWidth: 1,
        borderColor: tokenColors.border,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#FFFFFF',
    },
    pageBtnDisabled: {
        opacity: 0.4,
    },
    pageBtnText: {
        fontSize: 12,
        fontWeight: '700',
        fontFamily: font.inter.semiBold,
        color: tokenColors.textPrimary,
    },
    pageText: {
        color: tokenColors.textSecondary,
        fontSize: 12,
        fontFamily: font.inter.medium,
    },
    actions: {
        paddingHorizontal: space.md,
        paddingVertical: space.sm,
        gap: space.xs,
    },
    actionBtnSecondary: {
        minHeight: touch.min,
        paddingHorizontal: space.md,
        borderRadius: radius.control,
        alignItems: 'center',
        justifyContent: 'center',
    },
    actionBtnLabelSecondary: {
        color: tokenColors.textSecondary,
        fontSize: 12,
        fontWeight: '700',
        fontFamily: font.inter.semiBold,
    },
    actionBtnDestructive: {
        minHeight: touch.min,
        paddingHorizontal: space.md,
        borderRadius: radius.control,
        alignItems: 'center',
        justifyContent: 'center',
    },
    actionBtnLabelDestructive: {
        color: '#DC2626',
        fontSize: 12,
        fontWeight: '700',
        fontFamily: font.inter.semiBold,
    },
    actionBtnPrimary: {
        minHeight: touch.min,
        minWidth: 64,
        paddingHorizontal: space.md,
        borderRadius: radius.control,
        backgroundColor: tokenColors.primary,
        alignItems: 'center',
        justifyContent: 'center',
    },
    actionBtnLabelPrimary: {
        color: '#FFFFFF',
        fontSize: 12,
        fontWeight: '700',
        fontFamily: font.inter.semiBold,
    },
});
