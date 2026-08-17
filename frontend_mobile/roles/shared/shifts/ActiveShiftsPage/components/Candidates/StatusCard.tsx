// StatusCard Component
// Displays candidates grouped by status (Interested, Assigned, Rejected, No Response)

import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Card, Text, Button, Chip, ActivityIndicator, Surface, Avatar } from 'react-native-paper';
import { customTheme } from '../../theme';
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
    success: { bg: customTheme.colors.successLight, fg: customTheme.colors.success },
    error: { bg: customTheme.colors.errorLight, fg: customTheme.colors.error },
    warning: { bg: customTheme.colors.warningLight, fg: customTheme.colors.warning },
    info: { bg: customTheme.colors.infoLight, fg: customTheme.colors.info },
};

function StatusIllustration({ title, icon, fg }: { title: string; icon: string; fg: string }) {
    const isHourglass = title === 'No Response';
    const isInterested = title === 'Interested';
    const isAssigned = title === 'Assigned';
    const isRejected = title === 'Rejected';
    return (
        <View style={styles.illustration}>
            <View style={[styles.illustrationGlow, { backgroundColor: fg + '22' }]} />
            {isInterested ? (
                <>
                    <Avatar.Icon size={30} icon="account" style={[styles.groupPerson, styles.groupPersonLeft]} color="#64748B" />
                    <Avatar.Icon size={36} icon="account" style={[styles.groupPerson, styles.groupPersonCenter]} color="#64748B" />
                    <Avatar.Icon size={30} icon="account" style={[styles.groupPerson, styles.groupPersonRight]} color="#64748B" />
                    <Avatar.Icon size={46} icon="heart" style={styles.heartBadge} color="#7C3AED" />
                </>
            ) : isAssigned || isRejected ? (
                <>
                    <Avatar.Icon size={62} icon="file-document" style={styles.documentIllustration} color={isAssigned ? '#2563EB' : '#64748B'} />
                    <Avatar.Icon size={36} icon={isAssigned ? 'check-circle' : 'close-circle'} style={[styles.statusBadge, { backgroundColor: isAssigned ? '#0EA5E9' : '#EF4444' }]} color="#fff" />
                </>
            ) : isHourglass ? (
                <View style={styles.hourglass}>
                    <View style={styles.hourglassTop} />
                    <View style={styles.hourglassBottom} />
                </View>
            ) : (
                <Avatar.Icon size={58} icon={icon} style={styles.illustrationMain} color={fg} />
            )}
        </View>
    );
}

export default function StatusCard({
    title,
    members,
    icon,
    color,
    shiftId,
    onReviewCandidate,
    getOfferForMember,
    reviewLoadingId,
    onBuzzWorker,
    buzzLoadingOfferId,
}: StatusCardProps) {
    const colors = colorMap[color];

    return (
        <Card style={[styles.card, { backgroundColor: colors.bg, borderColor: colors.fg + '33' }]}>
            <Card.Title
                title={title}
                titleStyle={[styles.cardTitle, { color: colors.fg }]}
                left={() => (
                    <Avatar.Icon
                        size={40}
                        icon={icon}
                        style={styles.titleAvatar}
                        color={colors.fg}
                    />
                )}
                right={() => (
                    <Chip
                        style={{ backgroundColor: colors.fg }}
                        textStyle={{ color: '#fff', fontWeight: 'bold' }}
                    >
                        {members.length}
                    </Chip>
                )}
            />
            <Card.Content style={styles.cardContent}>
                <View style={styles.bodyRow}>
                    <StatusIllustration title={title} icon={icon} fg={colors.fg} />
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
                                <Surface key={userId} style={styles.memberCard} elevation={1}>
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
                                                <Chip
                                                    mode="flat"
                                                    compact
                                                    style={styles.pendingChip}
                                                    textStyle={styles.statusChipText}
                                                >
                                                    Pending
                                                </Chip>
                                            )}
                                            {title === 'Interested' && awaitingPayment && (
                                                <Chip
                                                    mode="flat"
                                                    compact
                                                    style={styles.awaitingPaymentChip}
                                                    textStyle={styles.statusChipText}
                                                >
                                                    Awaiting payment
                                                </Chip>
                                            )}
                                            {title === 'Interested' && isCounterOffer && !isPendingConfirmation && (
                                                <Chip
                                                    mode="flat"
                                                    compact
                                                    style={styles.counterChip}
                                                    textStyle={styles.statusChipText}
                                                >
                                                    Counter offer
                                                </Chip>
                                            )}
                                            {ratingValue && (
                                                <Chip
                                                    icon="star"
                                                    mode="outlined"
                                                    compact
                                                    style={{ borderColor: customTheme.colors.warning }}
                                                    textStyle={{ color: customTheme.colors.warning }}
                                                >
                                                    {ratingValue.toFixed(1)}
                                                </Chip>
                                            )}
                                            {showOrganizationLabel && (
                                                <Chip mode="outlined" compact>
                                                    {organizationName}
                                                </Chip>
                                            )}
                                            {title === 'Interested' && (
                                                <Button
                                                    mode="contained"
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
                                                    loading={reviewLoadingId === userId}
                                                    style={styles.reviewButton}
                                                    contentStyle={styles.compactButtonContent}
                                                    labelStyle={styles.compactButtonLabel}
                                                >
                                                    {isPendingConfirmation || awaitingPayment ? 'View' : hasOffer ? 'Review' : 'Review'}
                                                </Button>
                                            )}
                                            {isPendingConfirmation && pendingOfferId != null && onBuzzWorker && (
                                                <Button
                                                    mode="contained"
                                                    onPress={() => onBuzzWorker(Number(pendingOfferId))}
                                                    disabled={buzzLoadingOfferId === Number(pendingOfferId)}
                                                    loading={buzzLoadingOfferId === Number(pendingOfferId)}
                                                    style={styles.buzzButton}
                                                    contentStyle={styles.compactButtonContent}
                                                    labelStyle={styles.buzzButtonLabel}
                                                >
                                                    Buzz
                                                </Button>
                                            )}
                                        </View>
                                    </View>
                                </Surface>
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
        borderRadius: 18,
        minHeight: 128,
        elevation: 2,
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.06,
        shadowRadius: 16,
    },
    cardTitle: {
        fontWeight: '900',
    },
    titleAvatar: {
        backgroundColor: '#fff',
    },
    membersList: {
        flex: 1,
        width: '100%',
        gap: customTheme.spacing.sm,
    },
    memberCard: {
        width: '100%',
        padding: customTheme.spacing.sm,
        borderRadius: 14,
        backgroundColor: '#fff',
    },
    memberRow: {
        flexDirection: 'column',
        alignItems: 'stretch',
        gap: customTheme.spacing.sm,
        marginBottom: customTheme.spacing.xs,
    },
    memberInfo: {
        flex: 1,
        flexShrink: 1,
        minWidth: 0,
    },
    memberName: {
        fontSize: 12,
        fontWeight: 'bold',
        color: customTheme.colors.text,
        flexShrink: 1,
        lineHeight: 15,
    },
    employmentType: {
        fontSize: 10.5,
        color: customTheme.colors.textMuted,
        marginTop: 2,
    },
    memberBadges: {
        flexDirection: 'row',
        gap: customTheme.spacing.xs,
        flexWrap: 'nowrap',
        alignItems: 'center',
        maxWidth: '100%',
    },
    reviewButton: {
        alignSelf: 'flex-start',
        minWidth: 50,
    },
    buzzButton: {
        alignSelf: 'flex-start',
        backgroundColor: '#F9F295',
        minWidth: 50,
    },
    compactButtonContent: {
        minHeight: 26,
        paddingHorizontal: 3,
    },
    compactButtonLabel: {
        fontSize: 9.5,
        fontWeight: '800',
        marginHorizontal: 2,
    },
    buzzButtonLabel: {
        fontSize: 9.5,
        fontWeight: '800',
        marginHorizontal: 2,
        color: '#111827',
    },
    pendingChip: {
        backgroundColor: customTheme.colors.warningLight,
        maxWidth: 74,
    },
    awaitingPaymentChip: {
        backgroundColor: customTheme.colors.errorLight,
    },
    counterChip: {
        backgroundColor: customTheme.colors.infoLight,
    },
    statusChipText: {
        fontSize: 9.5,
        fontWeight: '800',
    },
    emptyText: {
        color: customTheme.colors.text,
        fontWeight: '800',
        marginBottom: 3,
    },
    emptySubText: {
        color: customTheme.colors.textMuted,
        fontSize: 12,
        lineHeight: 17,
    },
    emptyState: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: customTheme.spacing.md,
        paddingVertical: customTheme.spacing.md,
    },
    cardContent: {
        paddingTop: customTheme.spacing.xs,
    },
    bodyRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: customTheme.spacing.sm,
    },
    emptyCopy: {
        flex: 1,
    },
    illustration: {
        width: 92,
        height: 66,
        position: 'relative',
        flexShrink: 0,
        alignSelf: 'center',
    },
    illustrationGlow: {
        position: 'absolute',
        left: 2,
        right: 2,
        top: 4,
        bottom: 4,
        borderRadius: 999,
    },
    illustrationMain: {
        position: 'absolute',
        left: 24,
        bottom: 10,
        backgroundColor: '#fff',
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.16,
        shadowRadius: 14,
        elevation: 5,
    },
    illustrationBadge: {
        position: 'absolute',
        right: 8,
        bottom: 0,
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.18,
        shadowRadius: 10,
        elevation: 5,
    },
    groupPerson: {
        position: 'absolute',
        backgroundColor: '#EEF2FF',
        shadowColor: '#6366F1',
        shadowOffset: { width: 0, height: 7 },
        shadowOpacity: 0.16,
        shadowRadius: 10,
        elevation: 4,
    },
    groupPersonLeft: {
        left: 8,
        top: 22,
    },
    groupPersonCenter: {
        left: 31,
        top: 6,
    },
    groupPersonRight: {
        right: 8,
        top: 22,
    },
    heartBadge: {
        position: 'absolute',
        left: 28,
        bottom: 2,
        backgroundColor: '#EEF2FF',
        shadowColor: '#7C3AED',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.22,
        shadowRadius: 12,
        elevation: 5,
    },
    documentIllustration: {
        position: 'absolute',
        left: 20,
        top: 4,
        borderRadius: 12,
        backgroundColor: '#fff',
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.15,
        shadowRadius: 12,
        elevation: 5,
    },
    statusBadge: {
        position: 'absolute',
        right: 10,
        bottom: 2,
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.18,
        shadowRadius: 10,
        elevation: 5,
    },
    hourglass: {
        position: 'absolute',
        left: 30,
        top: 4,
        width: 38,
        height: 54,
        borderRadius: 12,
        borderWidth: 2,
        borderColor: '#FDBA74',
        backgroundColor: '#fff',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 8,
    },
    hourglassTop: {
        width: 18,
        height: 12,
        borderBottomLeftRadius: 10,
        borderBottomRightRadius: 10,
        backgroundColor: '#FDBA74',
    },
    hourglassBottom: {
        width: 18,
        height: 12,
        borderTopLeftRadius: 10,
        borderTopRightRadius: 10,
        backgroundColor: '#FED7AA',
    },
});
