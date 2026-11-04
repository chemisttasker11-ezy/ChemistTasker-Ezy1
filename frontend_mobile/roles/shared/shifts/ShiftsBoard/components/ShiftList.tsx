// ShiftList - the board's shift cards. ShiftSummary is the card body (rate first, every date with its time and
// rate); this file adds the worker's state, the slot picker and the actions, with the web board's rules.

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { format } from 'date-fns';
import {
    ChevronDown,
    ChevronUp,
    Heart,
    MapPin,
    MessagesSquare,
    MessageSquare,
    Square,
    SquareCheck,
    Star,
} from 'lucide-react-native';
import { shiftRequirementGroups, showPublishedShiftRates, skillLabel } from '@chemisttasker/shared-core';
import skillsRegistry from '@chemisttasker/shared-core/skills_registry.json';
import { Button, ContentState, Pill, ScalePressable } from '@/components/ui';
import { colors, font, radius, space, touch, type } from '@/constants/tokens';
import { PharmacyContextDetails } from '../../PharmacyContextDetails';
import { ShiftSummary, slotRateText } from '../../ShiftSummary';
import { ReportButton } from '../../../skills/ReportButton';
import { ShiftSlot } from '../types';
import { formatDateLong, formatTime } from '../utils/date';
import { getSlotRate } from '../utils/rates';
import {
    getEmploymentLabel,
    getUpcomingSlotsForDisplay,
    getShiftAllowPartial,
    getShiftFlexibleTime,
    getShiftNegotiable,
    getShiftPharmacyId,
    getShiftPharmacyName,
} from '../utils/shift';
import { buildMapAddress, openMap, type ShiftListProps } from './ShiftList.model';

const text = (t: { fontFamily: string; fontSize: number; lineHeight: number }) =>
    ({ fontFamily: t.fontFamily, fontSize: t.fontSize, lineHeight: t.lineHeight });

const ShiftList: React.FC<ShiftListProps> = ({
    loading,
    processedShifts,
    clearAllFilters,
    emptyState,
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
        return <ContentState kind="loading" style={styles.state} />;
    }

    if (processedShifts.length === 0) {
        const empty = emptyState ?? {
            title: 'No shifts found',
            description: 'No shifts match what you picked.',
            actionLabel: 'Reset filters',
            onAction: clearAllFilters,
        };
        return <ContentState kind="empty" {...empty} style={styles.state} />;
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
                const showPublishedRates = showPublishedShiftRates(shift);
                const isPharmacistProvided = showPublishedRates && shift.rateType === 'PHARMACIST_PROVIDED';
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
                const flexibleTime = getShiftFlexibleTime(shift);
                const showCounter = !hideCounterOffer && (getShiftFlexibleTime(shift) || getShiftNegotiable(shift)) && !isRejectedShift;
                const isSaved = savedShiftIds.has(shift.id);
                const allSlotsApplied = allSlots.length > 0 && allSlots.every((slot) => appliedSlotIds.has(slot.id));
                const isApplied = isShiftApplied || allSlotsApplied;
                const hasRejectedSlots = allSlots.some((slot) => rejectedSlotIds.has(slot.id));
                const slotRejected = (slotId: number) => rejectedSlotIds.has(slotId) || isRejectedShift;
                const allowPartial = getShiftAllowPartial(shift);
                const canSelectSlots = !shift.singleUserOnly && isMulti && (allowPartial || isOffersMode) && !disableSlotActions;
                const shiftLevelLocked = isShiftApplied || isRejectedShift || hasShiftLevelCounter;
                const slotLevelLocked = isShiftApplied || isRejectedShift;
                const interactionLocked = shiftLevelLocked || hasSlotActions;
                const shiftActionsDisabled = actionsDisabled || (!disableActionGuards && interactionLocked);
                const slotActionsDisabled = actionsDisabled || (!disableActionGuards && slotLevelLocked);
                const rejectAllowed = rejectActionGuard ? rejectActionGuard(shift) : true;
                const pharmacyId = getShiftPharmacyId(shift);
                const ratingSummary = pharmacyId != null ? pharmacyRatings[pharmacyId] : undefined;
                const isAnonymous = Boolean((shift as any).post_anonymously ?? shift.postAnonymously);
                const mapAddress = isAnonymous ? '' : buildMapAddress(shift);
                const name = getShiftPharmacyName(shift);
                const partialReject = !shift.singleUserOnly && allowPartial;
                const slotRejectAllowed = !disableSlotActions && !shift.singleUserOnly && Boolean(onRejectSlot) && rejectAllowed;
                // The date list with checkboxes and per-date actions, when there is something to pick or a per-date state.
                const showSlotPicker = slots.length > 0 && (isMulti || slotRejectAllowed || isOffersMode || hasSlotActions || isRejectedShift);
                const applyDisabled =
                    shiftActionsDisabled
                    || (!shift.singleUserOnly && hasRejectedSlots)
                    || (isOffersMode && (!hasPendingOffer || hasAwaitingPaymentSlots));

                const { requiredSkills, preferredSkills, software } = shiftRequirementGroups(skillsRegistry as any, shift.mustHave || [], shift.niceToHave || []);
                const skillBlock = (title: string, pills: React.ReactNode[]) =>
                    pills.length > 0 ? (
                        <View style={styles.tagSection} key={title}>
                            <Text style={styles.tagLabel}>{title}</Text>
                            <View style={styles.pillRow}>{pills}</View>
                        </View>
                    ) : null;

                const saveToggle = savedFeatureEnabled && !hideSaveToggle ? (
                    <ScalePressable
                        static
                        pressBg
                        haptic="selection"
                        onPress={() => toggleSaveShift(shift.id)}
                        accessibilityRole="button"
                        accessibilityState={{ selected: isSaved }}
                        accessibilityLabel={isSaved ? `Remove ${name} from saved` : `Save shift at ${name}`}
                        style={styles.saveButton}
                    >
                        <Heart
                            size={22}
                            strokeWidth={2}
                            color={isSaved ? colors.status.red.solid : colors.textSecondary}
                            fill={isSaved ? colors.status.red.solid : 'transparent'}
                        />
                    </ScalePressable>
                ) : null;

                const actions = (
                    <View style={styles.actions}>
                        <Button
                            label={isApplied && !isOffersMode ? 'Applied' : (applyLabel ?? 'Apply now')}
                            disabled={applyDisabled}
                            onPress={() => handleApplyAll(shift)}
                            haptic="light"
                            style={styles.actionGrow}
                        />
                        {showCounter && onSubmitCounterOffer ? (
                            <Button
                                label="Counter offer"
                                variant="outlined"
                                icon={<MessageSquare />}
                                onPress={() => openCounterOffer(shift)}
                                disabled={shiftActionsDisabled}
                                style={styles.actionGrow}
                            />
                        ) : null}
                        {onRejectShift && rejectAllowed ? (
                            <Button
                                label={isRejectedShift ? 'Rejected' : partialReject ? 'Reject entire shift' : 'Reject shift'}
                                variant="outlined"
                                onPress={() => handleRejectShift(shift)}
                                disabled={shiftActionsDisabled || (partialReject && isRejectedShift)}
                                style={styles.actionGrow}
                            />
                        ) : null}
                        {shift.visibility === 'PLATFORM' ? <ReportButton kind="jobs" id={shift.id} /> : null}
                    </View>
                );

                return (
                    <ShiftSummary
                        key={shift.id}
                        shift={shift}
                        slots={slots}
                        ratePreference={userRatePreference}
                        status={saveToggle}
                        footer={actions}
                    >
                        {isRejectedShift || hasVisibleCounterOffer || hasAwaitingPaymentSlots || flexibleTime || (ratingSummary && ratingSummary.count > 0) || (!slots.length && isFullOrPartTime) ? (
                            <View style={styles.pillRow}>
                                {isRejectedShift ? <Pill label="Rejected" tone="red" /> : null}
                                {hasAwaitingPaymentSlots ? <Pill label="Waiting for owner payment" tone="amber" /> : null}
                                {!slots.length && isFullOrPartTime ? <Pill label={getEmploymentLabel(shift)} outlined /> : null}
                                {flexibleTime ? <Pill label="Flexible hours" tone="cyan" /> : null}
                                {ratingSummary && ratingSummary.count > 0 ? (
                                    <Pill
                                        label={`${ratingSummary.average.toFixed(1)} (${ratingSummary.count})`}
                                        icon={<Star />}
                                        tone="amber"
                                        accessibilityLabel={`Pharmacy rated ${ratingSummary.average.toFixed(1)} from ${ratingSummary.count} ratings`}
                                    />
                                ) : null}
                                {hasVisibleCounterOffer ? (
                                    <Pill label="Review your counter offer" icon={<MessagesSquare />} onPress={() => onReviewOffers(shift.id)} />
                                ) : null}
                            </View>
                        ) : null}

                        {isPharmacistProvided ? (
                            <Text style={styles.note}>Rate set by your rate preference. Update your profile rates to improve matches.</Text>
                        ) : null}
                        {!slots.length && !isFullOrPartTime ? <Text style={styles.note}>Dates to be announced.</Text> : null}

                        {isExpanded ? (
                            <View style={styles.details}>
                                {showSlotPicker ? (
                                    <View style={styles.section}>
                                        <Text style={styles.sectionTitle}>
                                            {canSelectSlots && (!isOffersMode || allowPartial) ? 'Pick your dates' : 'Dates'}
                                        </Text>
                                        {isMulti && !allowPartial && !isOffersMode ? (
                                            <Text style={styles.note}>Bundle only: this shift is booked as a whole.</Text>
                                        ) : null}
                                        <View style={styles.slotList}>
                                            {slots.map((slot, idx) => {
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
                                                const selectable = canSelectSlots && (!isOffersMode || isPendingOfferSlot);
                                                const checked = isSelected || (!isOffersMode && (isSlotApplied || isCountered));
                                                const checkDisabled = slotActionsDisabled || (!isOffersMode && (isSlotRejected || isSlotApplied || isCountered));
                                                const rate = slotRateText(getSlotRate(slot, shift, userRatePreference), shift, showPublishedRates);
                                                const when = `${formatDateLong(slot.date)}, ${formatTime(slot.startTime)} to ${formatTime(slot.endTime)}`;
                                                const slotText = (
                                                    <View style={styles.slotText}>
                                                        <Text style={styles.slotDate}>{formatDateLong(slot.date)}</Text>
                                                        <Text style={styles.slotTime}>
                                                            {formatTime(slot.startTime)} - {formatTime(slot.endTime)}
                                                            {rate ? `  ·  ${rate}` : ''}
                                                        </Text>
                                                    </View>
                                                );

                                                return (
                                                    <View key={slotKey} style={[styles.slotRow, idx > 0 ? styles.slotDivider : null, isSelected ? styles.slotSelected : null]}>
                                                        {selectable ? (
                                                            <ScalePressable
                                                                static
                                                                pressBg
                                                                haptic="selection"
                                                                onPress={() => toggleSlotSelection(shift.id, slotId)}
                                                                disabled={checkDisabled}
                                                                accessibilityRole="checkbox"
                                                                accessibilityState={{ checked, disabled: checkDisabled }}
                                                                accessibilityLabel={when}
                                                                style={styles.slotPick}
                                                            >
                                                                {checked ? (
                                                                    <SquareCheck size={22} color={checkDisabled ? colors.disabledFg : colors.accentStrong} strokeWidth={2} />
                                                                ) : (
                                                                    <Square size={22} color={checkDisabled ? colors.disabledFg : colors.textSecondary} strokeWidth={2} />
                                                                )}
                                                                {slotText}
                                                            </ScalePressable>
                                                        ) : (
                                                            <View style={styles.slotPick} accessible accessibilityLabel={when}>{slotText}</View>
                                                        )}
                                                        <View style={styles.slotSide}>
                                                            {isSlotRejected ? (
                                                                <Pill label="Rejected" tone="red" />
                                                            ) : isAwaitingPaymentSlot ? (
                                                                <Pill label="Waiting for owner payment" tone="amber" />
                                                            ) : isSlotApplied ? (
                                                                <Pill label="Applied" tone="green" />
                                                            ) : null}
                                                            {offerSlot ? <Pill label="Offer sent" tone="violet" /> : null}
                                                            {isOffersMode && !shift.singleUserOnly && isPendingOfferSlot ? (
                                                                <Button label="Confirm" onPress={() => handleApplySlot(shift, slotId)} disabled={slotActionsDisabled} accessibilityLabel={`Confirm ${when}`} />
                                                            ) : null}
                                                            {slotRejectAllowed && !isSlotRejected ? (
                                                                <Button label="Reject" variant="outlined" onPress={() => handleRejectSlot(shift, slotId)} disabled={slotActionsDisabled} accessibilityLabel={`Reject ${when}`} />
                                                            ) : null}
                                                        </View>
                                                    </View>
                                                );
                                            })}
                                        </View>

                                        {isMulti && allowPartial && selection.size > 0 && !disableSlotActions ? (
                                            <View style={styles.actions}>
                                                <Button
                                                    label={isOffersMode ? `Confirm ${selection.size} selected` : `Apply for ${selection.size} selected`}
                                                    disabled={slotActionsDisabled || isRejectedShift}
                                                    haptic="light"
                                                    onPress={async () => {
                                                        await handleApplySlots(shift, Array.from(selection));
                                                        clearSelection(shift.id);
                                                    }}
                                                    style={styles.actionGrow}
                                                />
                                                {showCounter && onSubmitCounterOffer ? (
                                                    <Button
                                                        label={isOffersMode ? 'Counter selected' : 'Counter offer for selected'}
                                                        variant="outlined"
                                                        icon={<MessageSquare />}
                                                        onPress={() => openCounterOffer(shift, selection)}
                                                        disabled={slotActionsDisabled}
                                                        style={styles.actionGrow}
                                                    />
                                                ) : null}
                                                {(onRejectSlots || onRejectSlot) && rejectAllowed ? (
                                                    <Button
                                                        label={isOffersMode ? `Reject ${selection.size} selected` : 'Reject selected'}
                                                        variant="outlined"
                                                        disabled={slotActionsDisabled || isRejectedShift}
                                                        onPress={() => handleRejectSlots(shift, Array.from(selection))}
                                                        style={styles.actionGrow}
                                                    />
                                                ) : null}
                                            </View>
                                        ) : null}
                                    </View>
                                ) : null}

                                <View style={styles.section}>
                                    <Text style={styles.sectionTitle}>About the role</Text>
                                    <Text style={styles.body}>{shift.description || 'No description provided.'}</Text>
                                    {skillBlock('Required', requiredSkills.map((code) => <Pill key={code} label={skillLabel(skillsRegistry as any, code)} tone="violet" />))}
                                    {skillBlock('Preferred', preferredSkills.map((code) => <Pill key={code} label={skillLabel(skillsRegistry as any, code)} outlined />))}
                                    {skillBlock('Software', software.map((item) => (
                                        <Pill
                                            key={item.code}
                                            label={`${skillLabel(skillsRegistry as any, item.code)} · ${item.required ? 'required' : 'preferred'}`}
                                            tone={item.required ? 'violet' : 'neutral'}
                                            outlined={!item.required}
                                        />
                                    )))}
                                    <PharmacyContextDetails pharmacy={shift.pharmacyDetail} workload={shift.workloadTags} support={shift.supportOnShift} />
                                </View>

                                {mapAddress ? (
                                    <ScalePressable static pressBg onPress={() => openMap(mapAddress)} accessibilityRole="link" accessibilityLabel={`Open ${mapAddress} in maps`} style={styles.mapRow}>
                                        <MapPin size={18} color={colors.accentStrong} strokeWidth={2} />
                                        <Text style={styles.mapText} numberOfLines={2}>{mapAddress}</Text>
                                    </ScalePressable>
                                ) : null}
                                {shift.createdAt ? <Text style={styles.note}>Posted {format(new Date(shift.createdAt), 'd MMM yyyy')}</Text> : null}
                            </View>
                        ) : null}

                        <ScalePressable
                            static
                            pressBg
                            onPress={() => toggleExpandedCard(shift.id)}
                            accessibilityRole="button"
                            accessibilityState={{ expanded: isExpanded }}
                            accessibilityLabel={isExpanded ? 'Hide shift details' : `Shift details${canSelectSlots ? ' and date picker' : ''}`}
                            style={styles.expand}
                        >
                            <Text style={styles.expandText}>{isExpanded ? 'Hide details' : canSelectSlots ? 'Details and pick dates' : 'Shift details'}</Text>
                            {isExpanded ? <ChevronUp size={18} color={colors.accentStrong} /> : <ChevronDown size={18} color={colors.accentStrong} />}
                        </ScalePressable>
                    </ShiftSummary>
                );
            })}
        </View>
    );
};

const styles = StyleSheet.create({
    state: { marginHorizontal: space.lg },
    container: { paddingHorizontal: space.lg, gap: space.md },
    saveButton: {
        width: touch.min,
        height: touch.min,
        marginTop: -space.sm,
        marginRight: -space.sm,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: radius.pill,
    },
    pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs + 2 },
    note: { ...text(type.bodySmall), color: colors.textSecondary },
    body: { ...text(type.bodyMedium), color: colors.textSecondary },
    actions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.sm },
    actionGrow: { flexGrow: 1 },
    details: { gap: space.lg },
    section: { gap: space.sm },
    sectionTitle: { ...text(type.titleSmall), color: colors.textPrimary },
    slotList: {
        borderRadius: radius.nested,
        borderCurve: 'continuous',
        borderWidth: 1,
        borderColor: colors.border,
        overflow: 'hidden',
    },
    slotRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.sm, paddingRight: space.md },
    slotDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
    slotSelected: { backgroundColor: colors.primarySoft },
    slotPick: { flex: 1, minWidth: 180, flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: touch.min + 8, paddingHorizontal: space.md, paddingVertical: space.sm },
    slotText: { flex: 1, minWidth: 0 },
    slotDate: { ...text(type.labelLarge), color: colors.textPrimary },
    slotTime: { ...text(type.bodySmall), color: colors.textSecondary, fontVariant: ['tabular-nums'] },
    slotSide: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'flex-end', gap: space.xs + 2, paddingVertical: space.xs, marginLeft: 'auto' },
    tagSection: { gap: space.xs + 2 },
    tagLabel: { ...text(type.labelMedium), color: colors.textSecondary },
    mapRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: touch.min, borderRadius: radius.control, marginHorizontal: -space.xs, paddingHorizontal: space.xs },
    mapText: { flex: 1, ...text(type.bodyMedium), fontFamily: font.inter.medium, color: colors.accentStrong },
    expand: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: space.xs,
        minHeight: touch.min,
        borderRadius: radius.control,
    },
    expandText: { ...text(type.labelLarge), color: colors.accentStrong },
});

export default ShiftList;
