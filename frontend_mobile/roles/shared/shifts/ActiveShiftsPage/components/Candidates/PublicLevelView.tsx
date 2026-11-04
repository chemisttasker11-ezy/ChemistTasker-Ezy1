// PublicLevelView Component
// Displays public shift candidates with counter offers and interests

import React from 'react';
import { Image, View, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Surface, Text, Divider, ActivityIndicator } from 'react-native-paper';
import { Tag, UserCheck, Star } from 'lucide-react-native';
import { Shift, ShiftInterest } from '@chemisttasker/shared-core';
import { Pill } from '@/components/ui/Pill';
import { colors as tokenColors, font, radius, space, touch } from '@/constants/tokens';
import SlotSelector from './SlotSelector';
import { getInterestDisplayName } from '../../utils/candidateHelpers';

const chemisttaskerBadge = require('../../../../../../assets/images/chemisttasker-platform.png');

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

function PublicCandidateCard({
    title,
    count,
    icon,
    tone,
    emptyTitle,
    emptySubtitle,
    children,
}: {
    title: string;
    count: number;
    icon: React.ReactNode;
    tone: 'violet' | 'cyan';
    emptyTitle: string;
    emptySubtitle: string;
    children: React.ReactNode;
}) {
    return (
        <View style={styles.card}>
            <View style={styles.cardHeader}>
                <View style={styles.headerLeft}>
                    <View style={styles.iconCircle}>
                        {icon}
                    </View>
                    <Text style={styles.cardTitle}>{title}</Text>
                </View>
                <Pill label={String(count)} tone={tone} />
            </View>
            <View style={styles.cardContent}>
                {count > 0 ? (
                    <View style={styles.candidateList}>{children}</View>
                ) : (
                    <View style={styles.emptyCopy}>
                        <Text style={styles.emptyTitle}>{emptyTitle}</Text>
                        <Text style={styles.emptySubText}>{emptySubtitle}</Text>
                    </View>
                )}
            </View>
        </View>
    );
}

export default function PublicLevelView({
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
}: PublicLevelViewProps) {
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
        return (
            interestsAll.find((i: any) => {
                const iUserId = i.userId ?? i.user?.id ?? null;
                if (iUserId !== offerUserId) return false;
                if (offerSlotId == null) {
                    return i.slotId == null;
                }
                return i.slotId === offerSlotId;
            }) || null
        );
    };

    // Filter interests based on slot
    const slotInterests = slotId
        ? interestsAll.filter((i) => i.slotId === slotId || i.slotId == null)
        : interestsAll;

    // Filter counter offers based on slot
    const slotOffers = slotId
        ? counterOffers.filter((o) => {
              const offerSlots = o.slots || o.offer_slots || [];
              return offerSlots.some((s: any) => (s.slot_id ?? s.slotId ?? s.slot?.id) === slotId);
          })
        : offersList;

    const offerUserIds = new Set(
        slotOffers
            .map((o) => (typeof o.user === 'object' ? o.user?.id : o.user))
            .filter((id: any) => id != null)
    );

    const slotInterestsFiltered = slotInterests.filter((interest) => {
        const iUserId = interest.userId ?? interest.user?.id ?? null;
        if (iUserId == null) return true;
        return !offerUserIds.has(iUserId);
    });

    return (
        <ScrollView contentContainerStyle={styles.container}>
            {/* Slot Selector for multi-slot shifts */}
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

            <View style={styles.dividerContainer}>
                <Divider style={styles.dividerLine} />
                <Surface style={styles.dividerChip} elevation={1}>
                    <Image source={chemisttaskerBadge} style={styles.publicDividerLogo} resizeMode="contain" />
                    <Text style={styles.dividerChipText}>ChemistTasker Public Candidates</Text>
                </Surface>
                <Divider style={styles.dividerLine} />
            </View>

            <View style={styles.grid}>
                <PublicCandidateCard
                    title="Counter offers"
                    count={slotOffers.length}
                    icon={<Tag size={18} color="#6D28D9" />}
                    tone="violet"
                    emptyTitle="No counter offers yet."
                    emptySubtitle="When candidates send counter offers, they'll appear here."
                >
                    {slotOffers.map((offer) => {
                        const offerSlotId = slotId ?? getOfferSlotId(offer);
                        const interest = findInterestForOffer(offer, offerSlotId);
                        const isRevealed = Boolean(interest?.revealed);
                        const label = interest && !interest.revealed ? 'Reveal offer' : 'Review offer';
                        const isRevealAction = !isRevealed && interest && !interest.revealed;

                        const title = (() => {
                            if (isRevealed) {
                                if (interest.user) {
                                    const userObj = typeof interest.user === 'object' ? interest.user : null;
                                    if (userObj) {
                                        const name =
                                            userObj.firstName && userObj.lastName
                                                ? `${userObj.firstName} ${userObj.lastName}`
                                                : userObj.first_name && userObj.last_name
                                                    ? `${userObj.first_name} ${userObj.last_name}`
                                                    : userObj.name || userObj.displayName || userObj.display_name;
                                        if (name) return name;
                                    }
                                    if (typeof userObj === 'string') return userObj;
                                }
                                const displayName = (interest as any).displayName || interest.userName;
                                if (displayName) return displayName;
                            }
                            return 'Someone sent a counter offer';
                        })();

                        return (
                            <View key={offer.id} style={styles.memberCard}>
                                <View style={styles.memberRow}>
                                    <View style={styles.memberInfo}>
                                        <Text style={styles.memberName} numberOfLines={1} ellipsizeMode="tail">
                                            {title}
                                        </Text>
                                        <Text style={styles.memberSubtitle}>
                                            {isRevealed ? 'Revealed profile' : 'Public candidate offer'}
                                        </Text>
                                    </View>
                                    <View style={styles.memberBadges}>
                                        <Pill label="Counter offer" tone="violet" />
                                        <TouchableOpacity
                                            style={isRevealAction ? styles.actionBtnPrimary : styles.actionBtnOutline}
                                            activeOpacity={0.8}
                                            onPress={() => onReviewOffer(shift, offer, offerSlotId)}
                                            accessible
                                            accessibilityRole="button"
                                            accessibilityLabel={`${label} from ${title}`}
                                        >
                                            <Text
                                                style={
                                                    isRevealAction
                                                        ? styles.actionBtnLabelPrimary
                                                        : styles.actionBtnLabelOutline
                                                }
                                            >
                                                {label}
                                            </Text>
                                        </TouchableOpacity>
                                    </View>
                                </View>
                            </View>
                        );
                    })}
                </PublicCandidateCard>

                <PublicCandidateCard
                    title="Interested matches"
                    count={slotInterestsFiltered.length}
                    icon={<UserCheck size={18} color="#008EA6" />}
                    tone="cyan"
                    emptyTitle="No matches yet."
                    emptySubtitle="When public candidates show interest, they'll appear here."
                >
                    {slotInterestsFiltered.map((interest) => {
                        const isRevealing = revealingInterestId === interest.id;
                        const isPendingConfirmation = Boolean(
                            interest.pendingConfirmation ?? interest.pending_confirmation
                        );
                        const isAwaitingPayment = Boolean(
                            interest.awaitingPayment ?? interest.awaiting_payment
                        );
                        const pendingOfferId =
                            interest.pendingOfferId ?? interest.pending_offer_id ?? null;
                        const candidateName = interest.revealed
                            ? getInterestDisplayName(interest, interest.user)
                            : 'Platform candidate';
                        const actionLabel = isPendingConfirmation || isAwaitingPayment
                            ? 'View'
                            : interest.revealed
                                ? 'Review'
                                : 'Reveal';

                        return (
                            <View key={interest.id} style={styles.memberCard}>
                                <View style={styles.memberRow}>
                                    <View style={styles.memberInfo}>
                                        <Text style={styles.memberName} numberOfLines={1} ellipsizeMode="tail">
                                            {candidateName}
                                        </Text>
                                        <Text style={styles.memberSubtitle}>
                                            {interest.revealed ? 'Revealed candidate' : 'Public applicant'}
                                        </Text>
                                    </View>
                                    <View style={styles.memberBadges}>
                                        {isAwaitingPayment ? (
                                            <Pill label="Awaiting payment" tone="red" />
                                        ) : isPendingConfirmation ? (
                                            <Pill label="Pending" tone="amber" />
                                        ) : !interest.revealed ? (
                                            <Pill label="Public" tone="cyan" />
                                        ) : null}

                                        <TouchableOpacity
                                            style={interest.revealed ? styles.actionBtnOutline : styles.actionBtnPrimary}
                                            activeOpacity={0.8}
                                            disabled={isRevealing}
                                            onPress={() => onReveal(shift, interest)}
                                            accessible
                                            accessibilityRole="button"
                                            accessibilityLabel={`${actionLabel} ${candidateName}`}
                                        >
                                            {isRevealing ? (
                                                <ActivityIndicator size={14} color="#FFFFFF" />
                                            ) : (
                                                <Text
                                                    style={
                                                        interest.revealed
                                                            ? styles.actionBtnLabelOutline
                                                            : styles.actionBtnLabelPrimary
                                                    }
                                                >
                                                    {actionLabel}
                                                </Text>
                                            )}
                                        </TouchableOpacity>

                                        {isPendingConfirmation &&
                                            !isAwaitingPayment &&
                                            pendingOfferId != null &&
                                            onBuzzWorker && (
                                                <TouchableOpacity
                                                    style={styles.actionBtnBuzz}
                                                    activeOpacity={0.8}
                                                    disabled={buzzLoadingOfferId === Number(pendingOfferId)}
                                                    onPress={() => onBuzzWorker(Number(pendingOfferId))}
                                                    accessible
                                                    accessibilityRole="button"
                                                    accessibilityLabel={`Buzz candidate for offer ${pendingOfferId}`}
                                                >
                                                    {buzzLoadingOfferId === Number(pendingOfferId) ? (
                                                        <ActivityIndicator size={14} color="#713F12" />
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
                </PublicCandidateCard>
            </View>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: {
        padding: space.md,
        gap: space.md,
    },
    dividerContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.sm,
        marginVertical: space.sm,
    },
    dividerLine: {
        flex: 1,
    },
    dividerChip: {
        backgroundColor: '#F5F0FF',
        borderWidth: 1,
        borderColor: '#C4B5FD',
        borderRadius: radius.pill,
        paddingHorizontal: space.md,
        paddingVertical: 6,
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.xs + 2,
    },
    publicDividerLogo: {
        width: 20,
        height: 20,
    },
    dividerChipText: {
        fontSize: 13,
        fontWeight: '800',
        fontFamily: font.inter.semiBold,
        color: '#4C1D95',
    },
    grid: {
        gap: space.md,
    },
    card: {
        backgroundColor: '#FFFFFF',
        borderWidth: 1,
        borderColor: tokenColors.border,
        borderRadius: radius.card,
        minHeight: 120,
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
        gap: space.xs + 4,
    },
    iconCircle: {
        width: 32,
        height: 32,
        borderRadius: radius.pill,
        backgroundColor: '#F8FAFC',
        alignItems: 'center',
        justifyContent: 'center',
    },
    cardTitle: {
        fontWeight: '800',
        fontSize: 15,
        fontFamily: font.inter.semiBold,
        color: tokenColors.textPrimary,
    },
    cardContent: {
        paddingTop: space.xs,
        paddingHorizontal: space.md,
        paddingBottom: space.md,
    },
    candidateList: {
        width: '100%',
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
        minHeight: touch.min,
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
    memberSubtitle: {
        fontSize: 11,
        fontFamily: font.inter.regular,
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
        minHeight: touch.min,
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
    actionBtnOutline: {
        minHeight: touch.min,
        minWidth: 54,
        paddingHorizontal: space.sm,
        borderRadius: radius.control,
        borderWidth: 1,
        borderColor: tokenColors.border,
        backgroundColor: '#FFFFFF',
        alignItems: 'center',
        justifyContent: 'center',
    },
    actionBtnLabelOutline: {
        color: tokenColors.textPrimary,
        fontSize: 11,
        fontWeight: '700',
        fontFamily: font.inter.semiBold,
    },
    actionBtnBuzz: {
        minHeight: touch.min,
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
        paddingVertical: space.md,
    },
    emptyTitle: {
        color: tokenColors.textPrimary,
        fontWeight: '700',
        fontFamily: font.inter.semiBold,
        fontSize: 13,
        marginBottom: 2,
        textAlign: 'center',
    },
    emptySubText: {
        color: tokenColors.textSecondary,
        fontSize: 12,
        fontFamily: font.inter.regular,
        lineHeight: 16,
        textAlign: 'center',
    },
});
