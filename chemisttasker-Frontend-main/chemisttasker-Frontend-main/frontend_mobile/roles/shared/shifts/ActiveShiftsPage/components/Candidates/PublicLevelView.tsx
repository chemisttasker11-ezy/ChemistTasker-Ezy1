// PublicLevelView Component
// Displays public shift candidates with counter offers and interests

import React from 'react';
import { Image, View, StyleSheet, ScrollView } from 'react-native';
import { Surface, Text, Button, Divider, Chip, Card, Avatar } from 'react-native-paper';
import { Shift, ShiftInterest } from '@chemisttasker/shared-core';
import { customTheme } from '../../theme';
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

const colorMap = {
    offer: { bg: '#F7F0FF', fg: '#6D28D9', border: '#C4B5FD', shadow: '#6D28D9' },
    match: { bg: '#E8FCFF', fg: '#008EA6', border: '#A5F3FC', shadow: '#08BEEA' },
};

function PublicCandidateCard({
    title,
    count,
    icon,
    palette,
    emptyTitle,
    emptySubtitle,
    children,
}: {
    title: string;
    count: number;
    icon: string;
    palette: keyof typeof colorMap;
    emptyTitle: string;
    emptySubtitle: string;
    children: React.ReactNode;
}) {
    const colors = colorMap[palette];

    return (
        <Card style={[styles.card, { backgroundColor: colors.bg, borderColor: colors.border, shadowColor: colors.shadow }]}>
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
                        {count}
                    </Chip>
                )}
            />
            <Card.Content style={styles.cardContent}>
                {count > 0 ? (
                    <View style={styles.candidateList}>{children}</View>
                ) : (
                    <View style={styles.emptyCopy}>
                        <Text style={styles.emptyTitle}>{emptyTitle}</Text>
                        <Text style={styles.emptySubText}>{emptySubtitle}</Text>
                    </View>
                )}
            </Card.Content>
        </Card>
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
                <Surface style={[styles.dividerChip, styles.publicDividerChip]} elevation={2}>
                    <Image source={chemisttaskerBadge} style={styles.publicDividerLogo} resizeMode="contain" />
                    <Text style={[styles.dividerChipText, styles.publicDividerText]}>
                        ChemistTasker Public Candidates
                    </Text>
                </Surface>
                <Divider style={styles.dividerLine} />
            </View>

            <View style={styles.grid}>
                <PublicCandidateCard
                    title="Counter offers"
                    count={slotOffers.length}
                    icon="tag"
                    palette="offer"
                    emptyTitle="No counter offers yet."
                    emptySubtitle="When candidates send counter offers, they'll appear here."
                >
                    {slotOffers.map((offer) => {
                        const offerSlotId = slotId ?? getOfferSlotId(offer);
                        const interest = findInterestForOffer(offer, offerSlotId);
                        const label = interest && !interest.revealed ? 'Reveal offer' : 'Review offer';
                        const isRevealLabel = label.toLowerCase().includes('reveal');
                        const title = (() => {
                            if (interest && interest.revealed) {
                                if (interest.user) {
                                    const userObj = typeof interest.user === 'object' ? interest.user : null;
                                    if (userObj) {
                                        const name =
                                            (userObj.firstName && userObj.lastName)
                                                ? `${userObj.firstName} ${userObj.lastName}`
                                                : (userObj.first_name && userObj.last_name)
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
                            <Surface key={offer.id} style={styles.candidateCard} elevation={1}>
                                <View style={styles.candidateRow}>
                                    <Text
                                        style={styles.candidateName}
                                        numberOfLines={1}
                                        ellipsizeMode="tail"
                                        adjustsFontSizeToFit
                                        minimumFontScale={0.72}
                                    >
                                        {title}
                                    </Text>
                                    <Button
                                        mode={isRevealLabel ? 'contained' : 'outlined'}
                                        compact
                                        onPress={() => onReviewOffer(shift, offer, offerSlotId)}
                                        style={styles.candidateButton}
                                    >
                                        {label}
                                    </Button>
                                </View>
                            </Surface>
                        );
                    })}
                </PublicCandidateCard>

                <PublicCandidateCard
                    title="Interested matches"
                    count={slotInterestsFiltered.length}
                    icon="account-check"
                    palette="match"
                    emptyTitle="No matches yet."
                    emptySubtitle="When public candidates show interest, they'll appear here."
                >
                    {slotInterestsFiltered.map(interest => {
                        const isRevealing = revealingInterestId === interest.id;
                        const isPendingConfirmation = Boolean(interest.pendingConfirmation ?? interest.pending_confirmation);
                        const isAwaitingPayment = Boolean(interest.awaitingPayment ?? interest.awaiting_payment);
                        const pendingOfferId = interest.pendingOfferId ?? interest.pending_offer_id ?? null;
                        return (
                            <Surface key={interest.id} style={styles.candidateCard} elevation={1}>
                                <View style={styles.candidateRow}>
                                    <Text
                                        style={styles.candidateName}
                                        numberOfLines={1}
                                        ellipsizeMode="tail"
                                        adjustsFontSizeToFit
                                        minimumFontScale={0.72}
                                    >
                                        {interest.revealed
                                            ? getInterestDisplayName(interest, interest.user)
                                            : 'Anonymous Interest User'}
                                    </Text>
                                    {isAwaitingPayment ? (
                                        <Chip compact style={styles.awaitingPaymentChip}>Awaiting payment</Chip>
                                    ) : isPendingConfirmation ? (
                                        <Chip compact style={styles.pendingChip}>Pending</Chip>
                                    ) : null}
                                    <Button
                                        mode={interest.revealed ? 'outlined' : 'contained'}
                                        compact
                                        onPress={() => onReveal(shift, interest)}
                                        disabled={isRevealing}
                                        loading={isRevealing}
                                        style={styles.candidateButton}
                                    >
                                        {isPendingConfirmation || isAwaitingPayment ? 'View' : interest.revealed ? 'Review' : 'Reveal'}
                                    </Button>
                                    {isPendingConfirmation && !isAwaitingPayment && pendingOfferId != null && onBuzzWorker && (
                                        <Button
                                            mode="contained"
                                            compact
                                            loading={buzzLoadingOfferId === Number(pendingOfferId)}
                                            disabled={buzzLoadingOfferId === Number(pendingOfferId)}
                                            onPress={() => onBuzzWorker(Number(pendingOfferId))}
                                            style={styles.buzzButton}
                                            labelStyle={styles.buzzButtonLabel}
                                        >
                                            Buzz
                                        </Button>
                                    )}
                                </View>
                            </Surface>
                        );
                    })}
                </PublicCandidateCard>
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
    dividerLine: {
        flex: 1,
    },
    dividerChip: {
        backgroundColor: customTheme.colors.greyLight,
        borderRadius: 999,
        paddingHorizontal: customTheme.spacing.md,
        paddingVertical: 8,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    publicDividerChip: {
        backgroundColor: '#F5F0FF',
        borderWidth: 1,
        borderColor: '#C4B5FD',
        shadowColor: '#6D28D9',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.16,
        shadowRadius: 12,
    },
    publicDividerLogo: {
        width: 24,
        height: 24,
    },
    dividerChipText: {
        fontSize: 13,
        fontWeight: '900',
    },
    publicDividerText: {
        color: '#4C1D95',
    },
    grid: {
        gap: customTheme.spacing.md,
    },
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
    cardContent: {
        paddingTop: customTheme.spacing.xs,
    },
    candidateList: {
        width: '100%',
        gap: customTheme.spacing.sm,
    },
    candidateCard: {
        width: '100%',
        padding: customTheme.spacing.sm,
        borderRadius: 14,
        backgroundColor: '#fff',
    },
    candidateRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        gap: customTheme.spacing.sm,
        minWidth: 0,
    },
    candidateName: {
        fontSize: 13,
        fontWeight: 'bold',
        color: customTheme.colors.text,
        flex: 1,
        flexShrink: 1,
        minWidth: 0,
    },
    candidateButton: {
        alignSelf: 'flex-start',
    },
    buzzButton: {
        alignSelf: 'flex-start',
        backgroundColor: '#F9F295',
    },
    buzzButtonLabel: {
        color: '#111827',
        fontWeight: '800',
    },
    pendingChip: {
        backgroundColor: '#F59E0B',
        alignSelf: 'flex-start',
    },
    awaitingPaymentChip: {
        backgroundColor: '#EF4444',
        alignSelf: 'flex-start',
    },
    emptyCopy: {
        paddingVertical: customTheme.spacing.md,
    },
    emptyTitle: {
        color: customTheme.colors.text,
        fontWeight: '800',
        marginBottom: 3,
        textAlign: 'center',
    },
    emptySubText: {
        color: customTheme.colors.textMuted,
        fontSize: 12,
        lineHeight: 17,
        textAlign: 'center',
    },
});
