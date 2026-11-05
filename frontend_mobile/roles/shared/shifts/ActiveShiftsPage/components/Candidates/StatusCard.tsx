// StatusCard Component
// Displays candidates grouped by status (Interested, Assigned, Rejected, No Response)

import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Card, Text, ActivityIndicator } from 'react-native-paper';
import {
    Heart,
    CheckCircle2,
    XCircle,
    Clock,
    Star,
    Building2,
    FileText,
} from 'lucide-react-native';
import { Pill } from '@/components/ui/Pill';
import { colors as tokenColors, font, radius, space, touch } from '@/constants/tokens';
import { ShiftMemberStatus } from '@chemisttasker/shared-core';
import { getCandidateDisplayName } from '../../utils/candidateHelpers';

interface StatusCardProps {
    title: string;
    members: ShiftMemberStatus[];
    icon: string;
    color: 'success' | 'error' | 'warning' | 'info';
    shiftId: number;
    onReviewCandidate: (member: ShiftMemberStatus, shiftId: number, offer: any | null, slotId: number | null) => void;
    getOfferForMember?: (member: ShiftMemberStatus) => { offer: any | null; slotId: number | null };
    reviewLoadingId?: number | null;
    onBuzzWorker?: (offerId: number) => void;
    buzzLoadingOfferId?: number | null;
}

const colorMap = {
    success: { bg: '#F0FDF4', fg: '#15803D', pillTone: 'green' as const },
    error: { bg: '#FEF2F2', fg: '#B91C1C', pillTone: 'red' as const },
    warning: { bg: '#FFFBEB', fg: '#B45309', pillTone: 'amber' as const },
    info: { bg: '#EFF6FF', fg: '#1D4ED8', pillTone: 'blue' as const },
};

function StatusIllustration({ title, fg }: { title: string; fg: string }) {
    const isHourglass = title === 'No Response';
    const isInterested = title === 'Interested';
    const isAssigned = title === 'Assigned';
    const isRejected = title === 'Rejected';
    return (
        <View style={styles.illustration}>
            <View style={[styles.illustrationGlow, { backgroundColor: fg + '18' }]} />
            {isInterested ? (
                <View style={styles.iconCircle}>
                    <Heart size={28} color="#7C3AED" fill="#7C3AED" />
                </View>
            ) : isAssigned ? (
                <View style={styles.iconCircle}>
                    <CheckCircle2 size={30} color="#15803D" />
                </View>
            ) : isRejected ? (
                <View style={styles.iconCircle}>
                    <XCircle size={30} color="#B91C1C" />
                </View>
            ) : isHourglass ? (
                <View style={styles.iconCircle}>
                    <Clock size={28} color="#B45309" />
                </View>
            ) : (
                <View style={styles.iconCircle}>
                    <FileText size={28} color={fg} />
                </View>
            )}
        </View>
    );
}

export default function StatusCard({
    title,
    members,
    color,
    shiftId,
    onReviewCandidate,
    getOfferForMember,
    reviewLoadingId,
    onBuzzWorker,
    buzzLoadingOfferId,
}: StatusCardProps) {
    const scheme = colorMap[color];

    return (
        <Card style={[styles.card, { backgroundColor: scheme.bg, borderColor: scheme.fg + '2A' }]}>
            <View style={styles.cardHeader}>
                <View style={styles.headerLeft}>
                    {title === 'Interested' ? (
                        <Heart size={18} color={scheme.fg} />
                    ) : title === 'Assigned' ? (
                        <CheckCircle2 size={18} color={scheme.fg} />
                    ) : title === 'Rejected' ? (
                        <XCircle size={18} color={scheme.fg} />
                    ) : (
                        <Clock size={18} color={scheme.fg} />
                    )}
                    <Text style={[styles.cardTitle, { color: scheme.fg }]}>{title}</Text>
                </View>
                <Pill label={String(members.length)} tone={scheme.pillTone} />
            </View>

            <Card.Content style={styles.cardContent}>
                <View style={styles.bodyRow}>
                    <StatusIllustration title={title} fg={scheme.fg} />
                    {members.length > 0 ? (
                        <View style={styles.membersList}>
                            {members.map((member) => {
                                const memberAny = member as any;
                                const ratingValue = memberAny.averageRating ?? memberAny.rating ?? null;
                                const match = getOfferForMember
                                    ? getOfferForMember(member)
                                    : { offer: null, slotId: null };
                                const hasOffer = Boolean(match.offer);
                                const pendingConfirmation = Boolean(
                                    memberAny.pendingConfirmation ?? memberAny.pending_confirmation
                                );
                                const awaitingPayment = Boolean(
                                    memberAny.awaitingPayment ?? memberAny.awaiting_payment
                                );
                                const isCounterOffer = hasOffer && Boolean(
                                    match.offer?.counterOffer ??
                                    match.offer?.counter_offer ??
                                    match.offer?.slots
                                );
                                const offerStatus = String(match.offer?.status ?? '').toUpperCase();
                                const isPendingConfirmation = !awaitingPayment && !isCounterOffer && (
                                    pendingConfirmation || (hasOffer && offerStatus === 'PENDING')
                                );
                                const pendingOfferId = memberAny.pendingOfferId ?? memberAny.pending_offer_id ?? match.offer?.id ?? null;
                                const userId = memberAny.userId || memberAny.user_id || memberAny.id;
                                const sourceVisibility = memberAny.sourceVisibility ?? memberAny.visibilityLevel ?? memberAny.visibility_level;
                                const organizationName = memberAny.organizationName ?? memberAny.organization_name;
                                const showOrganizationLabel = sourceVisibility === 'ORG_CHAIN' && Boolean(organizationName);

                                return (
                                    <View key={userId} style={styles.memberCard}>
                                        <View style={styles.memberRow}>
                                            <View style={styles.memberInfo}>
                                                <Text
                                                    style={styles.memberName}
                                                    numberOfLines={2}
                                                    ellipsizeMode="tail"
                                                >
                                                    {memberAny.name || getCandidateDisplayName(member)}
                                                </Text>
                                                {memberAny.employmentType && (
                                                    <Text
                                                        style={styles.employmentType}
                                                        numberOfLines={1}
                                                        ellipsizeMode="tail"
                                                    >
                                                        {memberAny.employmentType}
                                                    </Text>
                                                )}
                                            </View>
                                            <View style={styles.memberBadges}>
                                                {title === 'Interested' && isPendingConfirmation && (
                                                    <Pill label="Pending" tone="amber" />
                                                )}
                                                {title === 'Interested' && awaitingPayment && (
                                                    <Pill label="Awaiting payment" tone="red" />
                                                )}
                                                {title === 'Interested' && isCounterOffer && !isPendingConfirmation && (
                                                    <Pill label="Counter offer" tone="violet" />
                                                )}
                                                {ratingValue && (
                                                    <Pill
                                                        label={ratingValue.toFixed(1)}
                                                        tone="amber"
                                                        icon={<Star size={11} color="#B45309" fill="#B45309" />}
                                                    />
                                                )}
                                                {showOrganizationLabel && (
                                                    <Pill label={organizationName} outlined icon={<Building2 size={11} color={tokenColors.textMuted} />} />
                                                )}
                                                {title === 'Interested' && (
                                                    <TouchableOpacity
                                                        onPress={() => {
                                                            const reviewMember = isPendingConfirmation && match.offer?.id != null
                                                                ? {
                                                                    ...memberAny,
                                                                    pendingConfirmation: true,
                                                                    pendingOfferId: match.offer.id,
                                                                    pendingConfirmationCounterOffer: match.offer,
                                                                }
                                                                : member;
                                                            onReviewCandidate(
                                                                reviewMember,
                                                                shiftId,
                                                                isPendingConfirmation || awaitingPayment ? null : match.offer,
                                                                match.slotId
                                                            );
                                                        }}
                                                        disabled={reviewLoadingId === userId}
                                                        style={styles.actionBtnPrimary}
                                                        activeOpacity={0.8}
                                                    >
                                                        {reviewLoadingId === userId ? (
                                                            <ActivityIndicator size={14} color="#fff" />
                                                        ) : (
                                                            <Text style={styles.actionBtnLabelPrimary}>
                                                                {isPendingConfirmation || awaitingPayment ? 'View' : 'Review'}
                                                            </Text>
                                                        )}
                                                    </TouchableOpacity>
                                                )}
                                                {isPendingConfirmation && pendingOfferId != null && onBuzzWorker && (
                                                    <TouchableOpacity
                                                        onPress={() => onBuzzWorker(Number(pendingOfferId))}
                                                        disabled={buzzLoadingOfferId === Number(pendingOfferId)}
                                                        style={styles.actionBtnBuzz}
                                                        activeOpacity={0.8}
                                                    >
                                                        {buzzLoadingOfferId === Number(pendingOfferId) ? (
                                                            <ActivityIndicator size={14} color="#1E1B4B" />
                                                        ) : (
                                                            <Text style={styles.actionBtnLabelBuzz}>Buzz</Text>
                                                        )}
                                                    </TouchableOpacity>
                                                )}
                                            </View>
                                        </View>
                                    </View>
                                );
                            })}
                        </View>
                    ) : (
                        <View style={styles.emptyCopy}>
                            <Text style={styles.emptyText}>No candidates yet.</Text>
                            <Text style={styles.emptySubText}>
                                {title === 'Interested'
                                    ? "When candidates show interest, they'll appear here."
                                    : title === 'Assigned'
                                        ? 'Assigned candidates will appear here.'
                                        : title === 'Rejected'
                                            ? 'Candidates you reject will appear here.'
                                            : 'No responses will appear here.'}
                            </Text>
                        </View>
                    )}
                </View>
            </Card.Content>
        </Card>
    );
}

const styles = StyleSheet.create({
    card: {
        borderWidth: 1,
        borderRadius: radius.card,
        minHeight: 128,
        elevation: 1,
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.04,
        shadowRadius: 12,
        overflow: 'hidden',
    },
    cardHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: space.md,
        paddingTop: space.md,
        paddingBottom: space.xs,
    },
    headerLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.xs + 2,
    },
    cardTitle: {
        fontWeight: '800',
        fontSize: 15,
        fontFamily: font.inter.semiBold,
    },
    cardContent: {
        paddingTop: space.xs,
        paddingHorizontal: space.md,
        paddingBottom: space.md,
    },
    bodyRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.sm,
    },
    illustration: {
        width: 68,
        height: 68,
        position: 'relative',
        flexShrink: 0,
        alignItems: 'center',
        justifyContent: 'center',
    },
    illustrationGlow: {
        position: 'absolute',
        left: 0,
        right: 0,
        top: 0,
        bottom: 0,
        borderRadius: radius.pill,
    },
    iconCircle: {
        width: 48,
        height: 48,
        borderRadius: radius.pill,
        backgroundColor: '#FFFFFF',
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 6,
        elevation: 2,
    },
    membersList: {
        flex: 1,
        gap: space.xs + 2,
    },
    memberCard: {
        backgroundColor: '#FFFFFF',
        borderRadius: radius.nested,
        borderWidth: 1,
        borderColor: tokenColors.border,
        paddingHorizontal: space.sm,
        paddingVertical: space.xs + 2,
    },
    memberRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: space.xs,
        minHeight: 44,
    },
    memberInfo: {
        flex: 1,
        flexShrink: 1,
        minWidth: 0,
    },
    memberName: {
        fontSize: 13,
        fontWeight: '700',
        fontFamily: font.inter.semiBold,
        color: tokenColors.textPrimary,
        lineHeight: 17,
    },
    employmentType: {
        fontSize: 11,
        color: tokenColors.textSecondary,
        marginTop: 1,
    },
    memberBadges: {
        flexDirection: 'row',
        gap: space.xs,
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'flex-end',
    },
    actionBtnPrimary: {
        minHeight: 44,
        minWidth: 54,
        paddingHorizontal: space.sm,
        borderRadius: radius.control,
        backgroundColor: tokenColors.primary,
        alignItems: 'center',
        justifyContent: 'center',
    },
    actionBtnLabelPrimary: {
        color: '#FFFFFF',
        fontSize: 11,
        fontWeight: '700',
        fontFamily: font.inter.semiBold,
    },
    actionBtnBuzz: {
        minHeight: 44,
        minWidth: 48,
        paddingHorizontal: space.xs + 4,
        borderRadius: radius.control,
        backgroundColor: '#FEF08A',
        alignItems: 'center',
        justifyContent: 'center',
    },
    actionBtnLabelBuzz: {
        color: '#713F12',
        fontSize: 11,
        fontWeight: '800',
        fontFamily: font.inter.semiBold,
    },
    emptyCopy: {
        flex: 1,
    },
    emptyText: {
        color: tokenColors.textPrimary,
        fontWeight: '700',
        fontSize: 13,
        marginBottom: 2,
    },
    emptySubText: {
        color: tokenColors.textSecondary,
        fontSize: 12,
        lineHeight: 16,
    },
});
