import React from 'react';
import { View, TouchableOpacity } from 'react-native';
import {
  ActivityIndicator,
  Button,
  Card,
  Checkbox,
  Chip,
  Divider,
  IconButton,
  Text,
} from 'react-native-paper';
import type { Dispatch, SetStateAction } from 'react';
import type {
  EscalationLevelKey,
  Shift,
  ShiftInterest,
  ShiftMemberStatus,
} from '@chemisttasker/shared-core';

import EscalationStepper from './components/Escalation/EscalationStepper';
import PublicLevelView from './components/Candidates/PublicLevelView';
import CommunityLevelView from './components/Candidates/CommunityLevelView';
import {
  PUBLIC_LEVEL_KEY,
  deriveLevelSequence,
  getCurrentLevelKey,
  getLocationText,
  getShiftSummary,
} from './utils/shiftHelpers';
import { dedupeMembers } from './utils/candidateHelpers';
import { getCardBorderColor } from './utils/displayHelpers';
import {
  countUniquePeople,
  formatAuSlotDateTime,
  getCandidateUserId,
  getSlotIds,
  interestBelongsToSlot,
  isActiveCounterOffer,
  offerBelongsToSlot,
  resolveSlotIdAny,
  toFiniteNumber,
} from './utils/activeShiftRuntime';
import type { DeleteConfirmDialogState } from './types';
import { customTheme } from './theme';
import { styles } from './styles';

type Setter<T> = Dispatch<SetStateAction<T>>;

type DataProps = {
  orderedShifts: Shift[];
  tabData: Record<string, any>;
  counterOffersByShift: Record<number, any[]>;
  counterOffersLoadingByShift: Record<number, boolean>;
};

type StateProps = {
  expandedShifts: Set<number>;
  selectedLevelByShift: Record<number, EscalationLevelKey>;
  selectedSlotByShift: Record<number, number>;
  paymentSlotSelection: Record<number, number[]>;
  setPaymentSlotSelection: Setter<Record<number, number[]>>;
  pillPayingShiftId: number | null;
  sharingShiftId: number | null;
  actionLoading: Record<string, boolean>;
  slotHasUpdatesByShift: Record<number, Record<number, boolean>>;
  revealingInterestId: number | null;
  buzzLoadingOfferId: number | null;
  reviewLoadingId: number | null;
  setDeleteConfirmDialog: Setter<DeleteConfirmDialogState>;
  setSelectedLevelByShift: Setter<Record<number, EscalationLevelKey>>;
};

type ActionProps = {
  getTabKey: (shiftId: number, levelKey: EscalationLevelKey) => string;
  resolveSlotId: (slot: any) => number | null;
  isDedicatedShift: (shift: Shift) => boolean;
  handlePayWithStripe: (shift: Shift, offerIds?: number[]) => Promise<void>;
  handlePayWithPills: (shift: Shift, offerIds?: number[]) => Promise<void>;
  handleShare: (shift: Shift) => void | Promise<void>;
  handleEditShift: (shift: Shift) => void;
  toggleShiftExpansion: (shiftId: number) => void;
  handleLevelChange: (shift: Shift, level: EscalationLevelKey) => void;
  handleEscalate: (shiftId: number, level: EscalationLevelKey) => Promise<boolean>;
  loadTabDataForShift: (shift: Shift, level: EscalationLevelKey) => Promise<any>;
  loadShifts: () => Promise<any>;
  handleRevealInterest: (shift: Shift, interest: ShiftInterest) => Promise<void>;
  handleSlotSelection: (shiftId: number, slotId: number) => void;
  handleReviewOffer: (shift: Shift, offer: any, tabDataState: any, slotId: number | null) => Promise<void>;
  handleBuzzWorker: (offerId: number) => Promise<void>;
  handleReviewCandidate: (
    shift: Shift,
    member: ShiftMemberStatus,
    offer: any | null,
    slotId: number | null,
  ) => Promise<void>;
};

type Props = {
  data: DataProps;
  state: StateProps;
  actions: ActionProps;
};

export default function ActiveShiftCards({ data, state, actions }: Props) {
  const {
    orderedShifts,
    tabData,
    counterOffersByShift,
    counterOffersLoadingByShift,
  } = data;
  const {
    expandedShifts,
    selectedLevelByShift,
    selectedSlotByShift,
    paymentSlotSelection,
    setPaymentSlotSelection,
    pillPayingShiftId,
    sharingShiftId,
    actionLoading,
    slotHasUpdatesByShift,
    revealingInterestId,
    buzzLoadingOfferId,
    reviewLoadingId,
    setDeleteConfirmDialog,
    setSelectedLevelByShift,
  } = state;
  const {
    getTabKey,
    resolveSlotId,
    isDedicatedShift,
    handlePayWithStripe,
    handlePayWithPills,
    handleShare,
    handleEditShift,
    toggleShiftExpansion,
    handleLevelChange,
    handleEscalate,
    loadTabDataForShift,
    loadShifts,
    handleRevealInterest,
    handleSlotSelection,
    handleReviewOffer,
    handleBuzzWorker,
    handleReviewCandidate,
  } = actions;

  return (
    <>
                {orderedShifts.map((shift, idx) => {
                    const isDedicated = isDedicatedShift(shift);
                    const prev = idx > 0 ? orderedShifts[idx - 1] : null;
                    const showSectionHeader = isDedicated && (idx === 0 || (prev && isDedicatedShift(prev) !== isDedicated));
                    const isExpanded = expandedShifts.has(shift.id);
                    const isSingleUserShift = Boolean((shift as any).singleUserOnly);
                    const shiftLevel = getCurrentLevelKey(shift);
                    const selectedLevel = selectedLevelByShift[shift.id] ?? shiftLevel;
                    const tabKey = getTabKey(shift.id, selectedLevel);
                    const currentTabData = tabData[tabKey] || { loading: false };
                    const viewableLevelKeys = deriveLevelSequence(
                        shiftLevel,
                        (shift as any).allowedEscalationLevels,
                    );
                    const communityLevelKeys = viewableLevelKeys.filter(level => level !== PUBLIC_LEVEL_KEY);
                    const communityTabData = communityLevelKeys.map(level => tabData[getTabKey(shift.id, level)]);
                    const communityDataLoading = communityLevelKeys.some((level, index) => {
                        const data = communityTabData[index];
                        return !data || data.loading;
                    });
                    const selectedSlotId = isSingleUserShift
                        ? null
                        : selectedSlotByShift[shift.id] ?? resolveSlotId(shift.slots?.[0]) ?? null;
                    const offers = counterOffersByShift[shift.id];
                    const counterOffersLoaded = Object.prototype.hasOwnProperty.call(counterOffersByShift, shift.id);
                    const counterOffersLoading = counterOffersLoadingByShift[shift.id] ?? false;
                    const slotIds = getSlotIds(shift);
                    const consolidatedMembersBySlot = slotIds.reduce<Record<number, ShiftMemberStatus[]>>((acc, slotId) => {
                        acc[slotId] = dedupeMembers(communityLevelKeys.flatMap((level, index) => (
                            communityTabData[index]?.membersBySlot?.[slotId] || []
                        ).map((member: any) => ({ ...member, sourceVisibility: level }))));
                        return acc;
                    }, {});
                    const consolidatedMembers = dedupeMembers(communityLevelKeys.flatMap((level, index) => (
                        communityTabData[index]?.members || []
                    ).map((member: any) => ({ ...member, sourceVisibility: level }))));
                    const knownCommunityUserIds = new Set(
                        consolidatedMembers
                            .map(getCandidateUserId)
                            .filter((id): id is number => id != null)
                    );
                    const publicInterests = (currentTabData.interestsAll || []).filter((interest: any) => {
                        const userId = getCandidateUserId(interest);
                        return userId == null || !knownCommunityUserIds.has(userId);
                    });
                    const publicOffers = (offers || []).filter((offer: any) => {
                        const userId = getCandidateUserId(offer);
                        return userId == null || !knownCommunityUserIds.has(userId);
                    });
                    const membersForView = isSingleUserShift
                        ? consolidatedMembers
                        : consolidatedMembersBySlot[selectedSlotId ?? -1] || [];

                    const cardBorderColor = getCardBorderColor((shift as any).visibility ?? 'PLATFORM');
                    const summaryText = getShiftSummary(shift);
                    const location = getLocationText(shift);
                    const roleNeeded = (shift as any).roleNeeded ?? (shift as any).role_needed ?? null;
                    const employmentType = (shift as any).employmentType ?? (shift as any).employment_type ?? null;
                    const isUrgent = Boolean((shift as any).isUrgent ?? (shift as any).is_urgent);
                    const description = (shift as any).description ?? null;
                    const hasBadges = Boolean(roleNeeded || employmentType || isUrgent);
                    const labelOverrides = undefined;
                    const slotsCount = Array.isArray((shift as any).slots) ? (shift as any).slots.length : 0;
                    const allMembers = isSingleUserShift
                        ? consolidatedMembers
                        : Object.values(consolidatedMembersBySlot || {}).flatMap((slotMembers: any) => (
                            Array.isArray(slotMembers) ? slotMembers : []
                        ));
                    const allInterests = publicInterests;
                    const allOffers = publicOffers;
                    const slotById = new Map<number, any>();
                    (((shift as any).slots || []) as any[]).forEach((slot) => {
                        const slotId = resolveSlotIdAny(slot);
                        if (slotId != null) slotById.set(slotId, slot);
                    });
                    const directPaymentOptions = (((shift as any).paymentOptions ?? (shift as any).payment_options ?? []) as any[])
                        .map((option) => {
                            const offerId = toFiniteNumber(option.offerId ?? option.offer_id);
                            const slotId = toFiniteNumber(option.slotId ?? option.slot_id);
                            if (!offerId || !slotId) return null;
                            const slot = slotById.get(slotId) || {
                                id: slotId,
                                date: option.slotDate ?? option.slot_date,
                                start_time: option.startTime ?? option.start_time,
                                end_time: option.endTime ?? option.end_time,
                            };
                            return {
                                offerId,
                                slotId,
                                slot,
                                name: option.candidateName ?? option.candidate_name ?? option.candidateEmail ?? option.candidate_email ?? 'Participant',
                            };
                        })
                        .filter(Boolean) as Array<{ offerId: number; slotId: number; slot: any; name: string }>;
                    const memberPaymentOptions = dedupeMembers(allMembers)
                        .map((member: any) => {
                            const offerId = toFiniteNumber(member.awaitingPaymentOfferId ?? member.awaiting_payment_offer_id);
                            const slotId = toFiniteNumber(member.slotId ?? member.slot_id) ?? selectedSlotId;
                            if (!offerId || (!slotId && !isSingleUserShift)) return null;
                            const resolvedSlotId = slotId ?? 0;
                            return {
                                offerId,
                                slotId: resolvedSlotId,
                                slot: slotById.get(resolvedSlotId) || ((shift as any).slots || [])[0] || null,
                                name: member.displayName || member.display_name || member.name || member.email || 'Participant',
                            };
                        })
                        .filter(Boolean) as Array<{ offerId: number; slotId: number; slot: any; name: string }>;
                    const publicInterestPaymentOptions = dedupeMembers(allInterests)
                        .map((interest: any) => {
                            const offerId = toFiniteNumber(interest.awaitingPaymentOfferId ?? interest.awaiting_payment_offer_id);
                            const slotId = toFiniteNumber(interest.slotId ?? interest.slot_id) ?? selectedSlotId;
                            if (!offerId || (!slotId && !isSingleUserShift)) return null;
                            const resolvedSlotId = slotId ?? 0;
                            return {
                                offerId,
                                slotId: resolvedSlotId,
                                slot: slotById.get(resolvedSlotId) || ((shift as any).slots || [])[0] || null,
                                name: interest.displayName || interest.display_name || interest.userName || interest.user_name || interest.email || 'Participant',
                            };
                        })
                        .filter(Boolean) as Array<{ offerId: number; slotId: number; slot: any; name: string }>;
                    const paymentRequiredOffers = directPaymentOptions.length > 0
                        ? directPaymentOptions
                        : [...memberPaymentOptions, ...publicInterestPaymentOptions].filter((item, index, list) => (
                            list.findIndex((candidate) => candidate.offerId === item.offerId) === index
                        ));
                    const payableOfferIds = paymentRequiredOffers.map((item) => item.offerId);
                    const defaultPaymentOfferIds = Array.from(
                        paymentRequiredOffers.reduce((map, item) => {
                            if (!map.has(item.slotId)) map.set(item.slotId, item.offerId);
                            return map;
                        }, new Map<number, number>()).values()
                    );
                    const rawSelectedPaymentOfferIds = paymentSlotSelection[shift.id];
                    const selectedPaymentOfferIds = (rawSelectedPaymentOfferIds ?? defaultPaymentOfferIds).filter((offerId) => payableOfferIds.includes(offerId));
                    const effectivePaymentOfferIds = selectedPaymentOfferIds;
                    const paymentUnitCount = effectivePaymentOfferIds.length;
                    const showPaymentRequired = paymentRequiredOffers.length > 0;
                    const candidatesCount = countUniquePeople([
                        ...dedupeMembers(allMembers),
                        ...allInterests,
                        ...allOffers,
                    ]);
                    const interestsCount = countUniquePeople([
                        ...dedupeMembers(allMembers.filter((member: any) => member?.status === 'interested')),
                        ...allInterests,
                        ...allOffers.filter(isActiveCounterOffer),
                    ]);
                    const slotCandidateCounts = slotIds.reduce<Record<number, number>>((acc, slotId) => {
                        const slotMembers = consolidatedMembersBySlot[slotId] || [];
                        const slotInterests = allInterests.filter((interest: any) => interestBelongsToSlot(interest, slotId));
                        const slotOffers = allOffers.filter((offer: any) => offerBelongsToSlot(offer, slotId));
                        acc[slotId] = countUniquePeople([
                            ...dedupeMembers(slotMembers),
                            ...slotInterests,
                            ...slotOffers,
                        ]);
                        return acc;
                    }, {});
                    const slotStatusCounts = slotIds.reduce<Record<number, { interested: number; assigned: number; rejected: number; noResponse: number }>>((acc, slotId) => {
                        const slotMembers = dedupeMembers(consolidatedMembersBySlot[slotId] || []);
                        const slotInterests = allInterests.filter((interest: any) => interestBelongsToSlot(interest, slotId));
                        const slotOffers = allOffers.filter((offer: any) => offerBelongsToSlot(offer, slotId));
                        const slotNoResponse = countUniquePeople(slotMembers.filter((member: any) => member?.status === 'no_response'));
                        const shiftNoResponse = countUniquePeople(dedupeMembers(consolidatedMembers).filter((member: any) => member?.status === 'no_response'));
                        acc[slotId] = {
                            interested: countUniquePeople([
                                ...slotMembers.filter((member: any) => member?.status === 'interested'),
                                ...slotInterests,
                                ...slotOffers.filter(isActiveCounterOffer),
                            ]),
                            assigned: countUniquePeople(slotMembers.filter((member: any) => member?.status === 'accepted')),
                            rejected: countUniquePeople(slotMembers.filter((member: any) => member?.status === 'rejected')),
                            noResponse: slotNoResponse || shiftNoResponse,
                        };
                        return acc;
                    }, {});
                    if (selectedSlotId != null) {
                        const selectedMembers = dedupeMembers(membersForView);
                        slotStatusCounts[selectedSlotId] = {
                            interested: countUniquePeople([
                                ...selectedMembers.filter((member: any) => member?.status === 'interested'),
                                ...allInterests.filter((interest: any) => interestBelongsToSlot(interest, selectedSlotId)),
                                ...allOffers.filter((offer: any) => offerBelongsToSlot(offer, selectedSlotId) && isActiveCounterOffer(offer)),
                            ]),
                            assigned: countUniquePeople(selectedMembers.filter((member: any) => member?.status === 'accepted')),
                            rejected: countUniquePeople(selectedMembers.filter((member: any) => member?.status === 'rejected')),
                            noResponse: countUniquePeople(selectedMembers.filter((member: any) => member?.status === 'no_response')),
                        };
                    }

                    return (
                        <React.Fragment key={shift.id}>
                            {showSectionHeader && (
                                <Text style={styles.sectionTitle}>
                                    {isDedicated ? 'Direct / Private Offers' : 'Active Shifts'}
                                </Text>
                            )}
                            <Card
                                style={styles.shiftCard}
                            >
                            <View style={[styles.cardAccent, { backgroundColor: cardBorderColor }]} />

                            <Card.Content>
                                <TouchableOpacity
                                    style={styles.cardPressArea}
                                    activeOpacity={0.85}
                                    onPress={() => toggleShiftExpansion(shift.id)}
                                >
                                <View style={styles.cardTopRow}>
                                    <View
                                        style={[styles.pharmacyMark, { backgroundColor: cardBorderColor }]}
                                    >
                                        <IconButton icon="storefront" size={28} iconColor="#fff" style={styles.markIcon} />
                                    </View>
                                    <View style={styles.cardTitleBlock}>
                                        <Text style={styles.cardTitle} numberOfLines={2}>
                                            {(shift as any).pharmacyDetail?.name ?? 'Unnamed Pharmacy'}
                                        </Text>
                                        {summaryText ? (
                                            <Text style={styles.cardSubtitle} numberOfLines={1}>
                                                {summaryText}
                                            </Text>
                                        ) : null}
                                    </View>
                                    <View style={styles.headerActions}>
                                        <IconButton
                                            icon="share-variant"
                                            size={20}
                                            onPress={(event) => {
                                                event.stopPropagation();
                                                handleShare(shift);
                                            }}
                                            disabled={sharingShiftId === shift.id}
                                            style={styles.actionButton}
                                        />
                                        <IconButton
                                            icon="pencil"
                                            size={20}
                                            onPress={(event) => {
                                                event.stopPropagation();
                                                handleEditShift(shift);
                                            }}
                                            style={styles.actionButton}
                                        />
                                        <IconButton
                                            icon="delete"
                                            size={20}
                                            onPress={(event) => {
                                                event.stopPropagation();
                                                setDeleteConfirmDialog({ open: true, shiftId: shift.id });
                                            }}
                                            disabled={actionLoading[`delete_${shift.id}`]}
                                            style={styles.actionButton}
                                        />
                                    </View>
                                </View>

                                {hasBadges ? (
                                    <View style={styles.badgeRow}>
                                        {roleNeeded && (
                                            <Chip
                                                style={[styles.primaryBadge, { backgroundColor: cardBorderColor }]}
                                                textStyle={styles.primaryBadgeText}
                                            >
                                                {roleNeeded}
                                            </Chip>
                                        )}
                                        {employmentType && (
                                            <Chip mode="outlined" style={styles.outlineBadge}>
                                                {employmentType}
                                            </Chip>
                                        )}
                                        {isUrgent && (
                                            <Chip style={styles.urgentBadge} textStyle={styles.urgentBadgeText}>
                                                Urgent
                                            </Chip>
                                        )}
                                    </View>
                                ) : null}

                                <View style={styles.metaRow}>
                                    <Text style={styles.location} numberOfLines={1}>
                                        {location}
                                    </Text>
                                </View>

                                <View style={styles.statsRow}>
                                        <View style={styles.statBox}>
                                            <IconButton icon="calendar-month" size={18} iconColor={customTheme.colors.primary} style={styles.statIcon} />
                                        <View>
                                            <Text style={styles.statValue}>{slotsCount || '-'}</Text>
                                            <Text style={styles.statLabel}>Slots</Text>
                                        </View>
                                        </View>
                                        <View style={styles.statDivider} />
                                        <View style={styles.statBox}>
                                        <IconButton icon="account-group-outline" size={18} iconColor={customTheme.colors.primary} style={styles.statIcon} />
                                        <View>
                                            <Text style={styles.statValue}>{candidatesCount}</Text>
                                            <Text style={styles.statLabel}>Candidates</Text>
                                        </View>
                                        </View>
                                        <View style={styles.statDivider} />
                                        <View style={styles.statBox}>
                                        <IconButton icon="heart-outline" size={18} iconColor={customTheme.colors.primary} style={styles.statIcon} />
                                        <View>
                                            <Text style={styles.statValue}>{interestsCount}</Text>
                                            <Text style={styles.statLabel}>Interests</Text>
                                        </View>
                                    </View>
                                </View>
                                </TouchableOpacity>

                                {isDedicated ? (
                                    <View style={styles.directBadgeRow}>
                                        <Chip style={styles.directBadge} textStyle={styles.directBadgeText}>
                                            Direct / Private
                                        </Chip>
                                        <Chip mode="outlined" style={styles.pendingBadge} textStyle={styles.pendingBadgeText}>
                                            Pending
                                        </Chip>
                                    </View>
                                ) : null}

                                {isExpanded && (
                                    <>
                                        <Divider style={styles.divider} />

                                        {description ? (
                                            <View style={styles.descriptionBox}>
                                                <Text style={styles.descriptionText}>{description}</Text>
                                            </View>
                                        ) : null}

                                            <EscalationStepper
                                                shift={shift}
                                                currentLevel={shiftLevel}
                                                selectedLevel={selectedLevel}
                                                onSelectLevel={(levelKey) => handleLevelChange(shift, levelKey)}
                                            onEscalate={async (_s, levelKey) => {
                                                const success = await handleEscalate(shift.id, levelKey);
                                                if (!success) return;
                                                const updatedShift = { ...shift, visibility: levelKey, visibilityLevel: levelKey } as Shift;
                                                setSelectedLevelByShift(prev => ({ ...prev, [shift.id]: levelKey }));
                                                await loadTabDataForShift(updatedShift, levelKey);
                                                await loadShifts();
                                                }}
                                                escalating={actionLoading[`escalate_${shift.id}`]}
                                            labelOverrides={labelOverrides}
                                            showPrivateFirst={isDedicated}
                                            />

                                        <Divider style={styles.divider} />

                                        {showPaymentRequired && (
                                            <View style={styles.paymentRequiredBox}>
                                                <Text style={styles.paymentRequiredTitle}>
                                                    Payments Required
                                                </Text>
                                                <Text style={styles.paymentRequiredText}>
                                                    {isSingleUserShift
                                                        ? `${paymentRequiredOffers.length} bundle payment option${paymentRequiredOffers.length === 1 ? '' : 's'}`
                                                        : `${paymentUnitCount} selected from ${paymentRequiredOffers.length} payment option${paymentRequiredOffers.length === 1 ? '' : 's'}`} | ${paymentUnitCount * 30} AUD
                                                </Text>
                                                <View style={styles.paymentSlotList}>
                                                    {paymentRequiredOffers.map((item) => {
                                                        const checked = selectedPaymentOfferIds.includes(item.offerId);
                                                        const bundleSlots = isSingleUserShift ? (((shift as any).slots || []) as any[]) : [];
                                                        return (
                                                            <TouchableOpacity
                                                                key={`${shift.id}-${item.offerId}`}
                                                                style={styles.paymentSlotRow}
                                                                disabled={isSingleUserShift}
                                                                onPress={() => {
                                                                    setPaymentSlotSelection((prev) => {
                                                                        const current = new Set(prev[shift.id] ?? defaultPaymentOfferIds);
                                                                        if (current.has(item.offerId)) {
                                                                            current.delete(item.offerId);
                                                                        } else {
                                                                            paymentRequiredOffers
                                                                                .filter((candidate) => candidate.slotId === item.slotId)
                                                                                .forEach((candidate) => current.delete(candidate.offerId));
                                                                            current.add(item.offerId);
                                                                        }
                                                                        return { ...prev, [shift.id]: Array.from(current) };
                                                                    });
                                                                }}
                                                            >
                                                                {!isSingleUserShift && <Checkbox status={checked ? 'checked' : 'unchecked'} />}
                                                                <View style={styles.paymentSlotText}>
                                                                    {isSingleUserShift
                                                                        ? (
                                                                            <>
                                                                                <Text style={styles.paymentSlotTitle}>{item.name} | Offer #{item.offerId}</Text>
                                                                                {(bundleSlots.length > 0 ? bundleSlots : [item.slot]).filter(Boolean).map((slot: any, idx: number) => (
                                                                                    <Text key={resolveSlotIdAny(slot) ?? idx} style={styles.paymentSlotMeta}>
                                                                                        {formatAuSlotDateTime(slot)}
                                                                                    </Text>
                                                                                ))}
                                                                            </>
                                                                        )
                                                                        : (
                                                                            <>
                                                                                <Text style={styles.paymentSlotTitle}>{formatAuSlotDateTime(item.slot)}</Text>
                                                                                <Text style={styles.paymentSlotMeta}>
                                                                                    {item.name} | Offer #{item.offerId}
                                                                                </Text>
                                                                            </>
                                                                        )}
                                                                </View>
                                                                <Chip compact>Payment pending</Chip>
                                                            </TouchableOpacity>
                                                        );
                                                    })}
                                                </View>
                                                <View style={styles.paymentButtonRow}>
                                                    <Button
                                                        mode="contained"
                                                        buttonColor={customTheme.colors.error}
                                                        style={styles.paymentButton}
                                                        disabled={paymentUnitCount === 0}
                                                        onPress={() => handlePayWithStripe(shift, effectivePaymentOfferIds)}
                                                    >
                                                        {isSingleUserShift ? 'Pay with Stripe' : 'Pay selected with Stripe'}
                                                    </Button>
                                                    <Button
                                                        mode="contained"
                                                        buttonColor="#4F46E5"
                                                        style={styles.paymentButton}
                                                        loading={pillPayingShiftId === shift.id}
                                                        disabled={paymentUnitCount === 0 || pillPayingShiftId === shift.id}
                                                        onPress={() => handlePayWithPills(shift, effectivePaymentOfferIds)}
                                                    >
                                                        {isSingleUserShift ? 'Pay with Pills' : 'Pay selected with Pills'}
                                                    </Button>
                                                </View>
                                            </View>
                                        )}

                                        {currentTabData.loading ? (
                                            <ActivityIndicator style={{ padding: 20 }} />
                                        ) : selectedLevel === PUBLIC_LEVEL_KEY ? (
                                            <>
                                                {counterOffersLoading || !counterOffersLoaded ? (
                                                    <ActivityIndicator style={{ padding: 20 }} />
                                                ) : (
                                                    <PublicLevelView
                                                        shift={shift}
                                                        slotId={selectedSlotId}
                                                        slotHasUpdates={slotHasUpdatesByShift[shift.id] || {}}
                                                        slotCandidateCounts={slotCandidateCounts}
                                                        slotStatusCounts={slotStatusCounts}
                                                        interestsAll={publicInterests}
                                                        counterOffers={publicOffers}
                                                        counterOffersLoaded={counterOffersLoaded}
                                                        onReveal={handleRevealInterest}
                                                        onSelectSlot={(slotId) => handleSlotSelection(shift.id, slotId)}
                                                        onReviewOffer={(s, o, slotId) =>
                                                            handleReviewOffer(s, o, currentTabData, slotId)
                                                        }
                                                        revealingInterestId={revealingInterestId}
                                                        onBuzzWorker={handleBuzzWorker}
                                                        buzzLoadingOfferId={buzzLoadingOfferId}
                                                    />
                                                )}
                                                {communityDataLoading ? (
                                                    <ActivityIndicator style={{ padding: 20 }} />
                                                ) : (
                                                    <CommunityLevelView
                                                        shift={shift}
                                                        members={membersForView}
                                                        selectedSlotId={selectedSlotId}
                                                        slotHasUpdates={slotHasUpdatesByShift[shift.id] || {}}
                                                        slotCandidateCounts={slotCandidateCounts}
                                                        slotStatusCounts={slotStatusCounts}
                                                        offers={offers || []}
                                                        showSlotSelector={false}
                                                        onSelectSlot={(slotId) => handleSlotSelection(shift.id, slotId)}
                                                        onReviewCandidate={(member, _shiftId, offer, slotId) =>
                                                            handleReviewCandidate(shift, member, offer, slotId)
                                                        }
                                                        reviewLoadingId={reviewLoadingId}
                                                        onBuzzWorker={handleBuzzWorker}
                                                        buzzLoadingOfferId={buzzLoadingOfferId}
                                                    />
                                                )}
                                            </>
                                        ) : (
                                            communityDataLoading ? (
                                                <ActivityIndicator style={{ padding: 20 }} />
                                            ) : (
                                                <CommunityLevelView
                                                    shift={shift}
                                                    members={membersForView}
                                                    selectedSlotId={selectedSlotId}
                                                        slotHasUpdates={slotHasUpdatesByShift[shift.id] || {}}
                                                        slotCandidateCounts={slotCandidateCounts}
                                                        slotStatusCounts={slotStatusCounts}
                                                    offers={offers || []}
                                                    onSelectSlot={(slotId) => handleSlotSelection(shift.id, slotId)}
                                                    onReviewCandidate={(member, _shiftId, offer, slotId) =>
                                                        handleReviewCandidate(shift, member, offer, slotId)
                                                    }
                                                    reviewLoadingId={reviewLoadingId}
                                                    onBuzzWorker={handleBuzzWorker}
                                                    buzzLoadingOfferId={buzzLoadingOfferId}
                                                />
                                            )
                                        )}
                                    </>
                                )}
                            </Card.Content>
                        </Card>
                        </React.Fragment>
                    );
                })}
    </>
  );
}
