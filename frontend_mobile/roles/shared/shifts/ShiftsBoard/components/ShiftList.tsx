// ShiftList - Mobile React Native version
// Complete shift cards display with exact web logic

import React from 'react';
import { View, StyleSheet, TouchableOpacity, Linking, Platform } from 'react-native';
import { Card, Text, Button, Chip, IconButton, Checkbox, ActivityIndicator, Icon } from 'react-native-paper';
import { format } from 'date-fns';
import { Shift, ShiftCounterOfferPayload } from '@chemisttasker/shared-core';
import { CounterOfferTrack, RatePreference, ShiftSlot, SlotFilterMode } from '../types';
import { formatDateLong, formatDateShort, formatTime } from '../utils/date';
import { getRateSummary, getSlotRate } from '../utils/rates';
import {
    getEmploymentLabel,
    getUpcomingSlotsForDisplay,
    getShiftAddress,
    getShiftAllowPartial,
    getShiftCity,
    getShiftFlexibleTime,
    getShiftNegotiable,
    getShiftPharmacyId,
    getShiftPharmacyName,
    getShiftRoleLabel,
    getShiftState,
    getShiftUrgent,
} from '../utils/shift';

const buildMapAddress = (shift: Shift) => {
    const addressLine = getShiftAddress(shift);
    const city = getShiftCity(shift);
    const state = getShiftState(shift);
    const parts = [addressLine, city, state].filter(Boolean);
    if (parts.length > 0) return parts.join(', ');
    const pharmacy = shift.pharmacyDetail as any;
    const fallbackParts = [
        pharmacy?.streetAddress,
        pharmacy?.suburb,
        pharmacy?.state,
        pharmacy?.postcode,
    ].filter(Boolean);
    return fallbackParts.join(', ');
};

const openMap = (address: string) => {
    if (!address) return;
    const query = encodeURIComponent(address);
    const url = Platform.select({
        ios: `maps:0,0?q=${query}`,
        android: `geo:0,0?q=${query}`,
        default: `https://www.google.com/maps/search/?api=1&query=${query}`,
    });
    Linking.openURL(url!).catch(() => {});
};

type ShiftListProps = {
    loading?: boolean;
    processedShifts: Shift[];
    clearAllFilters: () => void;
    hideCounterOffer?: boolean;
    onSubmitCounterOffer?: (payload: ShiftCounterOfferPayload) => Promise<void> | void;
    onRejectShift?: (shift: Shift) => Promise<void> | void;
    onRejectSlot?: (shift: Shift, slotId: number) => Promise<void> | void;
    onRejectSlots?: (shift: Shift, slotIds: number[]) => Promise<void> | void;
    handleApplyAll: (shift: Shift) => Promise<void> | void;
    handleApplySlot: (shift: Shift, slotId: number) => Promise<void> | void;
    handleApplySlots: (shift: Shift, slotIds: number[]) => Promise<void> | void;
    handleRejectShift: (shift: Shift) => Promise<void> | void;
    handleRejectSlot: (shift: Shift, slotId: number) => Promise<void> | void;
    handleRejectSlots: (shift: Shift, slotIds: number[]) => Promise<void> | void;
    toggleExpandedCard: (shiftId: number) => void;
    expandedCards: Record<number, boolean>;
    selectedSlotIds: Record<number, Set<number>>;
    toggleSlotSelection: (shiftId: number, slotId: number) => void;
    clearSelection: (shiftId: number) => void;
    appliedShiftIds: Set<number>;
    appliedSlotIds: Set<number>;
    rejectedShiftIds: Set<number>;
    rejectedSlotIds: Set<number>;
    savedShiftIds: Set<number>;
    savedFeatureEnabled: boolean;
    hideSaveToggle?: boolean;
    toggleSaveShift: (shiftId: number) => void;
    counterOffers: Record<number, CounterOfferTrack>;
    onReviewOffers: (shiftId: number) => void;
    openCounterOffer: (shift: Shift, selectedSlots?: Set<number>) => void;
    rejectActionGuard?: (shift: Shift) => boolean;
    actionDisabledGuard?: (shift: Shift) => boolean;
    userRatePreference?: RatePreference;
    pharmacyRatings: Record<number, { average: number; count: number }>;
    slotFilterMode?: SlotFilterMode;
    applyLabel?: string;
    disableSlotActions?: boolean;
    disableActionGuards?: boolean;
};

const ShiftList: React.FC<ShiftListProps> = ({
    loading,
    processedShifts,
    clearAllFilters,
    hideCounterOffer,
    onSubmitCounterOffer,
    onRejectShift,
    onRejectSlot,
    onRejectSlots,
    handleApplyAll,
    handleApplySlot,
    handleApplySlots,
    handleRejectShift,
    handleRejectSlot,
    handleRejectSlots,
    toggleExpandedCard,
    expandedCards,
    selectedSlotIds,
    toggleSlotSelection,
    clearSelection,
    appliedShiftIds,
    appliedSlotIds,
    rejectedShiftIds,
    rejectedSlotIds,
    savedShiftIds,
    savedFeatureEnabled,
    hideSaveToggle,
    toggleSaveShift,
    counterOffers,
    onReviewOffers,
    openCounterOffer,
    rejectActionGuard,
    actionDisabledGuard,
    userRatePreference,
    pharmacyRatings,
    slotFilterMode,
    applyLabel,
    disableSlotActions,
    disableActionGuards,
}) => {
    if (loading) {
        return (
            <Card style={styles.loadingCard} mode="outlined">
                <Card.Content>
                    <ActivityIndicator size="large" />
                    <Text style={styles.loadingText}>Loading shifts...</Text>
                </Card.Content>
            </Card>
        );
    }

    if (processedShifts.length === 0) {
        return (
            <Card style={styles.emptyCard} mode="outlined">
                <Card.Content style={styles.emptyContent}>
                    <Icon source="filter-variant" size={48} color="#D1D5DB" />
                    <Text variant="headlineSmall" style={styles.emptyTitle}>No jobs found</Text>
                    <Text variant="bodyMedium" style={styles.emptySubtitle}>
                        We could not find any positions matching your criteria.
                    </Text>
                    <Button mode="contained" onPress={clearAllFilters} style={styles.resetButton}>
                        Reset filters
                    </Button>
                </Card.Content>
            </Card>
        );
    }

    return (
        <View style={styles.container}>
            {processedShifts.map((shift) => {
                const rawSlots = shift.slots ?? [];
                const allSlots = getUpcomingSlotsForDisplay(rawSlots as ShiftSlot[]);
                const mode = slotFilterMode ?? 'all';
                const actionsDisabled = actionDisabledGuard ? actionDisabledGuard(shift) : false;
                const isShiftApplied = appliedShiftIds.has(shift.id);
                const isShiftRejected = rejectedShiftIds.has(shift.id);
                const counterInfo = counterOffers[shift.id];
                const counterSlotIds = new Set<number>(
                    Object.keys(counterInfo?.slots ?? {})
                        .map((value) => Number(value))
                        .filter((value) => Number.isFinite(value))
                );
                const hasVisibleCounterOffer = Boolean(counterInfo) && counterSlotIds.size > 0;
                const hasShiftLevelCounter = false;
                const hasShiftLevelInterest = isShiftApplied || hasShiftLevelCounter;
                const hasSlotActions = allSlots.some((slot) => {
                    if (slot.id == null) return false;
                    return appliedSlotIds.has(slot.id) || rejectedSlotIds.has(slot.id) || counterSlotIds.has(slot.id);
                });

                let slots = allSlots;
                if (mode === 'interested') {
                    if (allSlots.length > 0) {
                        slots = allSlots.filter((slot) => {
                            if (slot.id == null) return false;
                            if (rejectedSlotIds.has(slot.id)) return false;
                            return appliedSlotIds.has(slot.id) || counterSlotIds.has(slot.id);
                        });
                        if (slots.length === 0) return null;
                    } else if (!hasShiftLevelInterest) {
                        return null;
                    }
                } else if (mode === 'rejected') {
                    if (!isShiftRejected) {
                        slots = allSlots.filter((slot) => slot.id != null && rejectedSlotIds.has(slot.id));
                    }
                    if (slots.length === 0 && !isShiftRejected) return null;
                }

                const isMulti = slots.length > 1;
                const isExpanded = Boolean(expandedCards[shift.id]);
                const selection = disableSlotActions ? new Set<number>() : (selectedSlotIds[shift.id] ?? new Set<number>());
                const isRejectedShift = isShiftRejected;
                const isFullOrPartTime = ['FULL_TIME', 'PART_TIME'].includes(shift.employmentType ?? '');
                const isPharmacistProvided = shift.rateType === 'PHARMACIST_PROVIDED';
                const offerStatusBySlot = ((shift as any).__offerStatusBySlot ?? {}) as Record<number, string>;
                const shiftOfferStatus = String((shift as any).__shiftOfferStatus ?? '').toUpperCase();
                const awaitingPaymentSlotIds = new Set(
                    Object.entries(offerStatusBySlot)
                        .filter(([, status]) => String(status).toUpperCase() === 'ACCEPTED_AWAITING_PAYMENT')
                        .map(([slotId]) => Number(slotId))
                        .filter((slotId) => Number.isFinite(slotId))
                );
                const isOffersMode = applyLabel === 'Confirm';
                const hasPendingOffer = !isOffersMode || shiftOfferStatus === 'PENDING' || Object.values(offerStatusBySlot).some(
                    (status) => String(status).toUpperCase() === 'PENDING'
                );
                const hasAwaitingPaymentSlots = awaitingPaymentSlotIds.size > 0 || shiftOfferStatus === 'ACCEPTED_AWAITING_PAYMENT';
                const hasSlots = slots.length > 0;
                const firstSlot = slots[0];
                const uniformSlotTimes =
                    hasSlots &&
                    slots.every(
                        (slot) =>
                            slot.startTime === firstSlot?.startTime &&
                            slot.endTime === firstSlot?.endTime &&
                            slot.startTime &&
                            slot.endTime
                    );
                const flexibleTime = getShiftFlexibleTime(shift);
                const showTimeText = (() => {
                    if (!hasSlots) {
                        return isFullOrPartTime ? getEmploymentLabel(shift) : 'Time not set';
                    }
                    if (uniformSlotTimes && firstSlot?.startTime && firstSlot?.endTime) {
                        return `${formatTime(firstSlot.startTime)} - ${formatTime(firstSlot.endTime)}`;
                    }
                    return '';
                })();
                const shouldShowTimeRow = Boolean(showTimeText) || flexibleTime;
                const showCounter = !hideCounterOffer && (getShiftFlexibleTime(shift) || getShiftNegotiable(shift)) && !isRejectedShift;
                const showNegotiable = getShiftNegotiable(shift) && !isRejectedShift;
                const superValue = Number(shift.superPercent);
                const showSuperChip = !isFullOrPartTime && Number.isFinite(superValue) && superValue > 0;
                const paymentType =
                    shift.paymentPreference ||
                    (shift.employmentType === 'LOCUM'
                        ? 'ABN'
                        : shift.employmentType
                            ? 'TFN'
                            : null);
                const isSaved = savedShiftIds.has(shift.id);
                const allSlotsApplied = allSlots.length > 0 && allSlots.every((slot) => appliedSlotIds.has(slot.id));
                const isApplied = isShiftApplied || allSlotsApplied;
                const hasRejectedSlots = allSlots.some((slot) => rejectedSlotIds.has(slot.id));
                const slotRejected = (slotId: number) => rejectedSlotIds.has(slotId) || isRejectedShift;
                const allowPartial = getShiftAllowPartial(shift);
                const canSelectSlots = !shift.singleUserOnly && isMulti && (allowPartial || isOffersMode) && !disableSlotActions;
                const hasActiveSlotSelection = canSelectSlots && selection.size > 0;
                const shiftLevelLocked = isShiftApplied || isRejectedShift || hasShiftLevelCounter;
                const slotLevelLocked = isShiftApplied || isRejectedShift;
                const interactionLocked = shiftLevelLocked || hasSlotActions;
                const shiftActionsDisabled = actionsDisabled || (!disableActionGuards && interactionLocked);
                const slotActionsDisabled = actionsDisabled || (!disableActionGuards && slotLevelLocked);
                const urgent = getShiftUrgent(shift);
                const rateSummary = getRateSummary(shift);
                const rejectAllowed = rejectActionGuard ? rejectActionGuard(shift) : true;
                const pharmacyId = getShiftPharmacyId(shift);
                const ratingSummary = pharmacyId != null ? pharmacyRatings[pharmacyId] : undefined;
                const isAnonymous = Boolean((shift as any).post_anonymously ?? shift.postAnonymously);
                const mapAddress = isAnonymous ? '' : buildMapAddress(shift);

                return (
                    <Card
                        key={shift.id}
                        style={[styles.shiftCard, urgent && styles.urgentCard]}
                        mode="outlined"
                    >
                        {urgent && (
                            <View style={styles.urgentBadge}>
                                <Icon source="flash" size={12} color="#FFFFFF" />
                                <Text style={styles.urgentText}>Urgent</Text>
                            </View>
                        )}

                        <Card.Content>
                            <View style={styles.header}>
                                <View style={styles.headerLeft}>
                                    <TouchableOpacity onPress={() => toggleExpandedCard(shift.id)}>
                                        <Text variant="titleLarge">{getShiftPharmacyName(shift)}</Text>
                                    </TouchableOpacity>
                                    {ratingSummary && ratingSummary.count > 0 && (
                                        <View style={styles.ratingRow}>
                                            <Icon source="star" size={14} color="#F59E0B" />
                                            <Text variant="bodySmall" style={styles.ratingText}>
                                                {ratingSummary.average.toFixed(1)} ({ratingSummary.count})
                                            </Text>
                                        </View>
                                    )}
                                    <View style={styles.chipRow}>
                                        <Chip icon="briefcase-outline" compact>{getShiftRoleLabel(shift)}</Chip>
                                        {shift.hasTravel && <Chip icon="airplane" compact>Travel</Chip>}
                                        {shift.hasAccommodation && <Chip icon="bed" compact>Accomm.</Chip>}
                                        {paymentType && <Chip mode="outlined" compact>Payment: {paymentType}</Chip>}
                                        {isRejectedShift && (
                                            <Chip textStyle={{ color: '#d32f2f' }} compact>Rejected</Chip>
                                        )}
                                    {hasVisibleCounterOffer && (
                                            <Button mode="text" compact onPress={() => onReviewOffers(shift.id)}>
                                                Review offer(s)
                                            </Button>
                                        )}
                                    </View>
                                    {shift.createdAt && (
                                        <Text variant="bodySmall" style={styles.postedDate}>
                                            Posted {format(new Date(shift.createdAt), 'd MMM yyyy')}
                                        </Text>
                                    )}
                                </View>
                                {savedFeatureEnabled && !hideSaveToggle && (
                                    <IconButton
                                        icon={isSaved ? 'heart' : 'heart-outline'}
                                        iconColor={isSaved ? '#d32f2f' : '#666'}
                                        onPress={() => toggleSaveShift(shift.id)}
                                    />
                                )}
                            </View>

                            <View style={styles.details}>
                                <View style={styles.detailRow}>
                                    <Icon source="calendar" size={16} color="#6B7280" />
                                    <Text variant="bodyMedium">
                                        {firstSlot
                                            ? formatDateShort(firstSlot?.date)
                                            : isFullOrPartTime
                                                ? getEmploymentLabel(shift)
                                                : 'No dates provided'}
                                        {isMulti && <Text style={styles.moreText}> + {slots.length - 1} more</Text>}
                                    </Text>
                                </View>
                                {shouldShowTimeRow && (
                                    <View style={styles.detailRow}>
                                        <Icon source="clock-outline" size={16} color="#6B7280" />
                                        {showTimeText && <Text variant="bodyMedium">{showTimeText}</Text>}
                                        {flexibleTime && <Chip compact textStyle={{ color: '#2e7d32' }}>Flex</Chip>}
                                    </View>
                                )}
                                <View style={styles.detailRow}>
                                    {mapAddress ? (
                                        <IconButton
                                            icon="map-marker"
                                            size={16}
                                            onPress={() => openMap(mapAddress)}
                                        />
                                    ) : (
                                        <Icon source="map-marker" size={16} color="#6B7280" />
                                    )}
                                    <Text variant="bodyMedium">{getShiftCity(shift)} ({getShiftState(shift)})</Text>
                                </View>
                            </View>

                            <View style={styles.rateSection}>
                                <View style={styles.rateRow}>
                                    <Icon source="currency-usd" size={16} color="#2e7d32" />
                                    <Text variant="headlineSmall" style={styles.rateText}>
                                        {rateSummary.display}
                                        <Text variant="bodySmall" style={styles.rateUnit}>{rateSummary.unitLabel}</Text>
                                    </Text>
                                </View>
                                {isFullOrPartTime && shift.superPercent && (
                                    <Chip compact>+ Superannuation ({shift.superPercent}%)</Chip>
                                )}
                                {showSuperChip && <Chip compact style={styles.superChip}>+Super</Chip>}
                                {showNegotiable && <Chip icon="cash" compact>Negotiable</Chip>}
                                {isPharmacistProvided && (
                                    <Text variant="bodySmall" style={styles.pharmacistRate}>
                                        Rate set by pharmacist preference. Update your profile rates to improve matches.
                                    </Text>
                                )}

                                <View style={styles.actions}>
                                    <Button
                                        mode="contained"
                                        disabled={shiftActionsDisabled || (!shift.singleUserOnly && hasRejectedSlots) || (isOffersMode && (!hasPendingOffer || hasAwaitingPaymentSlots))}
                                        onPress={() => handleApplyAll(shift)}
                                        style={styles.applyButton}
                                    >
                                        {isApplied && !isOffersMode ? 'Applied' : (applyLabel ?? 'Apply Now')}
                                    </Button>
                                    {showCounter && onSubmitCounterOffer && (
                                        <Button
                                            mode="outlined"
                                            onPress={() => openCounterOffer(shift)}
                                            icon="chat-outline"
                                            style={styles.counterButton}
                                            disabled={shiftActionsDisabled}
                                        >
                                            Counter Offer
                                        </Button>
                                    )}
                                    {onRejectShift && shift.singleUserOnly && rejectAllowed && (
                                        <Button
                                            mode="outlined"
                                            onPress={() => handleRejectShift(shift)}
                                            disabled={shiftActionsDisabled}
                                            style={styles.rejectButton}
                                        >
                                            {isRejectedShift ? 'Rejected' : 'Reject Shift'}
                                        </Button>
                                    )}
                                    {onRejectShift && !shift.singleUserOnly && !allowPartial && rejectAllowed && (
                                        <Button
                                            mode="outlined"
                                            onPress={() => handleRejectShift(shift)}
                                            disabled={shiftActionsDisabled}
                                            style={styles.rejectButton}
                                        >
                                            {isRejectedShift ? 'Rejected' : 'Reject Shift'}
                                        </Button>
                                    )}
                                    {onRejectShift && !shift.singleUserOnly && allowPartial && rejectAllowed && (
                                        <Button
                                            mode="outlined"
                                            onPress={() => handleRejectShift(shift)}
                                            disabled={shiftActionsDisabled || isRejectedShift}
                                            style={styles.rejectButton}
                                        >
                                            {isRejectedShift ? 'Rejected' : 'Reject Entire Shift'}
                                        </Button>
                                    )}
                                </View>
                            </View>

                            {isExpanded && (
                                <View style={styles.expandedSection}>
                                    <View style={styles.breakdownHeader}>
                                        <View style={styles.breakdownTitleRow}>
                                            <Icon source="calendar" size={16} color="#111827" />
                                            <Text variant="titleSmall">Shift Breakdown</Text>
                                        </View>
                                        {isMulti && !allowPartial && (
                                            <Chip icon="layers" compact style={styles.bundleChip}>Bundle only</Chip>
                                        )}
                                        {isMulti && allowPartial && !disableSlotActions && (
                                            <Chip icon="check-circle-outline" compact style={styles.selectChip}>Select shifts</Chip>
                                        )}
                                        {hasShiftLevelCounter && (
                                            <Chip compact mode="outlined">Shift offer sent</Chip>
                                        )}
                                    </View>

                                    <View style={styles.slotList}>
                                        {slots.length === 0 ? (
                                            <Card mode="outlined" style={styles.slotCard}>
                                                <Card.Content>
                                                    <Text variant="bodyMedium" style={styles.slotTitle}>
                                                        {isFullOrPartTime ? getEmploymentLabel(shift) : 'No time slots'}
                                                    </Text>
                                                    <Text variant="bodySmall" style={styles.slotSubtext}>
                                                        {isFullOrPartTime ? 'This is a non-slot based role.' : 'Slots will be announced.'}
                                                    </Text>
                                                    <Text variant="bodySmall" style={styles.slotSubtext}>
                                                        Rate: {rateSummary.display} {rateSummary.unitLabel}
                                                    </Text>
                                                </Card.Content>
                                            </Card>
                                        ) : (
                                            slots.map((slot, idx) => {
                                                const slotKey = (slot as any).__displayKey ?? slot.id ?? idx;
                                                const slotId = slot.id as number;
                                                const isSelected = selection.has(slotId);
                                                const isSlotApplied = appliedSlotIds.has(slotId);
                                                const isSlotRejected = slotRejected(slotId);
                                                const offerSlot = counterInfo?.slots?.[slotId];
                                                const isCountered = !!offerSlot;
                                                const offerStatus = String(offerStatusBySlot[slotId] ?? shiftOfferStatus).toUpperCase();
                                                const isPendingOfferSlot = offerStatus === 'PENDING';
                                                const isAwaitingPaymentSlot = offerStatus === 'ACCEPTED_AWAITING_PAYMENT';

                                                return (
                                                    <Card
                                                        key={slotKey}
                                                        mode="outlined"
                                                        style={[
                                                            styles.slotCard,
                                                            isSelected && styles.slotCardSelected,
                                                            isSlotApplied && styles.slotCardApplied,
                                                            isSlotRejected && styles.slotCardRejected,
                                                        ]}
                                                    >
                                                        <Card.Content style={styles.slotCardContent}>
                                                            <View style={styles.slotRow}>
                                                                <View style={styles.slotLeft}>
                                                                    {canSelectSlots && (!isOffersMode || isPendingOfferSlot) && (
                                                                        <Checkbox
                                                                            status={(isSelected || (!isOffersMode && (isSlotApplied || isCountered))) ? 'checked' : 'unchecked'}
                                                                            onPress={() => toggleSlotSelection(shift.id, slotId)}
                                                                            disabled={slotActionsDisabled || (!isOffersMode && (isSlotRejected || isSlotApplied || isCountered))}
                                                                        />
                                                                    )}
                                                                    <View style={styles.slotTextBlock}>
                                                                        <Text variant="bodyMedium" style={styles.slotTitle}>
                                                                            {formatDateLong(slot.date)}
                                                                        </Text>
                                                                        <Text variant="bodySmall" style={styles.slotSubtext}>
                                                                            {formatTime(slot.startTime)} - {formatTime(slot.endTime)}
                                                                        </Text>
                                                                    </View>
                                                                </View>
                                                                <View style={styles.slotRight}>
                                                                    {isSlotRejected ? (
                                                                        <Chip compact style={styles.rejectedChip}>Rejected</Chip>
                                                                    ) : isAwaitingPaymentSlot ? (
                                                                        <Chip compact style={styles.appliedChip}>Waiting for owner payment</Chip>
                                                                    ) : (
                                                                        <Chip compact style={styles.appliedChip}>
                                                                            {isSlotApplied
                                                                                ? 'Applied'
                                                                                : `$${getSlotRate(slot, shift, userRatePreference)}/hr`}
                                                                        </Chip>
                                                                    )}
                                                                    {offerSlot && <Chip compact mode="outlined">Offer sent</Chip>}
                                                                    {isOffersMode && !shift.singleUserOnly && isPendingOfferSlot && (
                                                                        <Button
                                                                            mode="contained"
                                                                            onPress={() => handleApplySlot(shift, slotId)}
                                                                            disabled={slotActionsDisabled}
                                                                            compact
                                                                        >
                                                                            Confirm
                                                                        </Button>
                                                                    )}
                                                                    {!disableSlotActions && !shift.singleUserOnly && onRejectSlot && rejectAllowed && !isSlotRejected && (
                                                                        <Button
                                                                            mode="outlined"
                                                                            onPress={() => handleRejectSlot(shift, slotId)}
                                                                            disabled={slotActionsDisabled}
                                                                            compact
                                                                        >
                                                                            Reject
                                                                        </Button>
                                                                    )}
                                                                </View>
                                                            </View>
                                                        </Card.Content>
                                                    </Card>
                                                );
                                            })
                                        )}
                                    </View>

                                    {isMulti && allowPartial && selection.size > 0 && !disableSlotActions && (
                                        <View style={styles.selectionActions}>
                                            {showCounter && onSubmitCounterOffer && (
                                                <Button
                                                    mode="outlined"
                                                    compact
                                                    icon="chat-outline"
                                                    onPress={() => openCounterOffer(shift, selection)}
                                                    disabled={slotActionsDisabled}
                                                >
                                                    {isOffersMode ? 'Counter Selected' : 'Send counter offer for selected'}
                                                </Button>
                                            )}
                                            <Button
                                                mode="contained"
                                                compact
                                                disabled={slotActionsDisabled || isRejectedShift}
                                                onPress={async () => {
                                                    const selectedIds = Array.from(selection);
                                                    await handleApplySlots(shift, selectedIds);
                                                    clearSelection(shift.id);
                                                }}
                                            >
                                                {isOffersMode ? `Confirm ${selection.size} Selected` : 'Apply for selected slots'}
                                            </Button>
                                            {(onRejectSlots || onRejectSlot) && rejectAllowed && (
                                                <Button
                                                    mode="outlined"
                                                    compact
                                                    disabled={slotActionsDisabled || isRejectedShift}
                                                    onPress={() => handleRejectSlots(shift, Array.from(selection))}
                                                >
                                                    {isOffersMode ? `Reject ${selection.size} Selected` : 'Reject selected'}
                                                </Button>
                                            )}
                                        </View>
                                    )}

                                    <View style={styles.aboutSection}>
                                        <Text variant="titleSmall">About the Role</Text>
                                        <Text variant="bodySmall" style={styles.aboutText}>
                                            {shift.description || 'No description provided.'}
                                        </Text>

                                        {shift.mustHave && shift.mustHave.length > 0 && (
                                            <View style={styles.tagSection}>
                                                <Text variant="labelSmall" style={styles.tagLabel}>Must have</Text>
                                                <View style={styles.tagRow}>
                                                    {shift.mustHave.map((item, idx) => (
                                                        <Chip key={`${item}-${idx}`} compact>{item}</Chip>
                                                    ))}
                                                </View>
                                            </View>
                                        )}

                                        {shift.niceToHave && shift.niceToHave.length > 0 && (
                                            <View style={styles.tagSection}>
                                                <Text variant="labelSmall" style={styles.tagLabel}>Nice to have</Text>
                                                <View style={styles.tagRow}>
                                                    {shift.niceToHave.map((item, idx) => (
                                                        <Chip key={`${item}-${idx}`} compact mode="outlined">{item}</Chip>
                                                    ))}
                                                </View>
                                            </View>
                                        )}

                                        {shift.workloadTags && shift.workloadTags.length > 0 && (
                                            <View style={styles.tagSection}>
                                                <Text variant="labelSmall" style={styles.tagLabel}>Workload</Text>
                                                <View style={styles.tagRow}>
                                                    {shift.workloadTags.map((tag, idx) => (
                                                        <Chip key={`${tag}-${idx}`} compact>{tag}</Chip>
                                                    ))}
                                                </View>
                                            </View>
                                        )}

                                        {shift.createdAt && (
                                            <Text variant="bodySmall" style={styles.postedDate}>
                                                Posted {format(new Date(shift.createdAt), 'd MMM yyyy')}
                                            </Text>
                                        )}

                                        <Card mode="outlined" style={styles.addressCard}>
                                            <Card.Content>
                                                <Text variant="labelSmall" style={styles.tagLabel}>Full Address</Text>
                                                <View style={styles.addressRow}>
                                                    <Icon source="map-marker" size={16} color="#6B7280" />
                                                    <Text variant="bodySmall">{getShiftAddress(shift) || 'N/A'}</Text>
                                                </View>
                                            </Card.Content>
                                        </Card>
                                    </View>
                                </View>
                            )}
                        </Card.Content>

                        <Card.Actions style={styles.footerActions}>
                            <Button
                                mode="text"
                                onPress={() => toggleExpandedCard(shift.id)}
                                icon={isExpanded ? 'chevron-up' : 'chevron-down'}
                            >
                                {isExpanded ? 'Hide Details' : 'Read More & Shift Breakdown'}
                            </Button>
                        </Card.Actions>
                    </Card>
                );
            })}
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        padding: 16,
        gap: 16,
    },
    loadingCard: {
        margin: 16,
    },
    loadingText: {
        marginTop: 12,
        textAlign: 'center',
    },
    emptyCard: {
        margin: 16,
    },
    emptyContent: {
        alignItems: 'center',
        paddingVertical: 32,
        gap: 8,
    },
    emptyTitle: {
        marginTop: 8,
    },
    emptySubtitle: {
        marginBottom: 16,
        color: '#666',
        textAlign: 'center',
    },
    resetButton: {
        marginTop: 8,
    },
    shiftCard: {
        marginBottom: 8,
    },
    urgentCard: {
        borderLeftWidth: 4,
        borderLeftColor: '#ed6c02',
    },
    urgentBadge: {
        position: 'absolute',
        top: 0,
        left: 0,
        backgroundColor: '#ed6c02',
        paddingHorizontal: 12,
        paddingVertical: 4,
        borderBottomRightRadius: 8,
        zIndex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    urgentText: {
        color: '#fff',
        fontSize: 10,
        fontWeight: '700',
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 16,
        gap: 12,
    },
    headerLeft: {
        flex: 1,
        gap: 4,
    },
    ratingRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    ratingText: {
        color: '#666',
    },
    chipRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
        marginTop: 4,
    },
    postedDate: {
        marginTop: 4,
        color: '#666',
    },
    details: {
        gap: 8,
        marginBottom: 16,
    },
    detailRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    moreText: {
        color: '#94A3B8',
    },
    rateSection: {
        gap: 8,
    },
    rateRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    rateText: {
        fontWeight: '600',
    },
    rateUnit: {
        color: '#666',
    },
    superChip: {
        backgroundColor: '#D7ECFF',
    },
    pharmacistRate: {
        color: '#666',
    },
    actions: {
        gap: 8,
        marginTop: 12,
    },
    applyButton: {
        marginBottom: 4,
    },
    counterButton: {
        marginBottom: 4,
    },
    rejectButton: {
        borderColor: '#d32f2f',
    },
    expandedSection: {
        marginTop: 16,
        gap: 16,
    },
    breakdownHeader: {
        gap: 8,
    },
    breakdownTitleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    bundleChip: {
        backgroundColor: '#FEE2E2',
    },
    selectChip: {
        backgroundColor: '#DCFCE7',
    },
    slotList: {
        gap: 8,
    },
    slotCard: {
        borderRadius: 8,
    },
    slotCardContent: {
        paddingVertical: 8,
    },
    slotCardSelected: {
        borderColor: '#6366F1',
        backgroundColor: '#EEF2FF',
    },
    slotCardApplied: {
        backgroundColor: '#ECFDF3',
    },
    slotCardRejected: {
        backgroundColor: '#FEF2F2',
    },
    slotRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: 12,
        flexWrap: 'wrap',
    },
    slotLeft: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 8,
        flex: 1,
        minWidth: 180,
    },
    slotTextBlock: {
        flex: 1,
        minWidth: 0,
    },
    slotRight: {
        alignItems: 'flex-end',
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'flex-end',
        gap: 6,
        flexShrink: 1,
    },
    slotTitle: {
        fontWeight: '600',
    },
    slotSubtext: {
        color: '#6B7280',
    },
    rejectedChip: {
        backgroundColor: '#FEE2E2',
    },
    appliedChip: {
        backgroundColor: '#ECFDF3',
    },
    rejectRow: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
    },
    selectionActions: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'flex-end',
        gap: 8,
    },
    aboutSection: {
        gap: 8,
    },
    aboutText: {
        color: '#6B7280',
    },
    tagSection: {
        gap: 6,
    },
    tagLabel: {
        color: '#6B7280',
        textTransform: 'uppercase',
        letterSpacing: 1,
    },
    tagRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 6,
    },
    addressCard: {
        borderRadius: 8,
    },
    addressRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginTop: 6,
    },
    footerActions: {
        justifyContent: 'flex-end',
    },
});

export default ShiftList;
