/// ShiftsBoard - Mobile React Native version
// Complete shift board implementation matching web behavior

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, type ScrollViewInstance, StyleSheet, Text, View } from 'react-native';
import { ArrowUpDown, Check, ChevronLeft, ChevronRight, SlidersHorizontal, X } from 'lucide-react-native';
import {
    Shift,
    fetchRatingsSummaryService,
    getOnboardingDetail,
    getPharmacistDashboard,
} from '@chemisttasker/shared-core';
import { BottomSheet, Button, Pill, ScalePressable, SegmentTabs } from '@/components/ui';
import { colors, font, space, touch, type } from '@/constants/tokens';
import { useAuth } from '@/context/AuthContext';
import { plural } from '@/roles/shared/dashboard/managerHomeLogic';
import { useShiftSurface } from '../useShiftSurface';
import { RatePreference, ShiftsBoardProps, SlotFilterMode, SortKey } from './types';
import FiltersSidebar from './components/FiltersSidebar';
import CounterOfferDialog from './components/CounterOfferDialog';
import ShiftList from './components/ShiftList';
import ReviewCounterOfferDialog from './components/ReviewCounterOfferDialog';
import { useCounterOffers } from './hooks/useCounterOffers';
import { useFilterSort } from './hooks/useFilterSort';
import { useShiftPersistence } from './hooks/useShiftPersistence';
import { getUpcomingSlotsForDisplay, getShiftPharmacyId } from './utils/shift';

const sortLabels: Record<SortKey, string> = {
    shiftDate: 'Shift date',
    postedDate: 'Date posted',
    rate: 'Rate',
    distance: 'Distance',
};
const SORT_KEYS: SortKey[] = ['shiftDate', 'postedDate', 'rate', 'distance'];
// Ascending, then descending, in the words a worker uses.
const sortOrderLabels: Record<SortKey, [string, string]> = {
    shiftDate: ['Soonest first', 'Latest first'],
    postedDate: ['Oldest first', 'Newest first'],
    rate: ['Lowest first', 'Highest first'],
    distance: ['Nearest first', 'Farthest first'],
};

/** Keyed by the surface scope: a persona, workspace, pharmacy or account switch starts a clean board. */
const ShiftsBoard: React.FC<ShiftsBoardProps> = (props) => {
    const { scopeKey } = useShiftSurface();
    return <ScopedShiftsBoard key={scopeKey} {...props} scopeKey={scopeKey} />;
};

const ScopedShiftsBoard: React.FC<ShiftsBoardProps & { scopeKey: string }> = ({
    scopeKey,
    title,
    shifts,
    loading,
    onApplyAll,
    onApplySlot,
    onApplySlots,
    onSubmitCounterOffer,
    onRejectShift,
    onRejectSlot,
    onRejectSlots,
    rejectActionGuard,
    useServerFiltering,
    onFiltersChange,
    filters,
    totalCount,
    page,
    pageSize,
    onPageChange,
    savedShiftIds: savedShiftIdsProp,
    onToggleSave,
    initialAppliedShiftIds,
    initialAppliedSlotIds,
    initialRejectedShiftIds,
    initialRejectedSlotIds,
    enableSaved,
    hideSaveToggle,
    readOnlyActions,
    disableLocalPersistence,
    hideCounterOffer,
    hideFiltersAndSort,
    hideTabs,
    activeTabOverride,
    onActiveTabChange,
    onRefresh,
    roleOptionsOverride,
    slotFilterMode: slotFilterModeProp,
    actionDisabledGuard,
    onScroll,
    applyLabel,
    disableSlotActions,
    disableActionGuards,
    fallbackToAllShiftsWhenEmpty,
    showAllSlots,
}) => {
    const slotFilterMode: SlotFilterMode = slotFilterModeProp ?? 'all';
    const effectiveSlotFilterMode: SlotFilterMode = showAllSlots ? 'all' : slotFilterMode;
    const { user, token } = useAuth();
    const currentUserId = user?.id ?? null;

    const userRatePreference: RatePreference | undefined =
        (user as any)?.rate_preference ||
        (user as any)?.ratePreference ||
        (user as any)?.pharmacist_onboarding?.rate_preference ||
        (user as any)?.pharmacistOnboarding?.rate_preference ||
        (user as any)?.pharmacist_profile?.rate_preference ||
        (user as any)?.pharmacistProfile?.rate_preference ||
        undefined;

    const [pharmacistRatePref, setPharmacistRatePref] = useState<RatePreference | undefined>(userRatePreference);

    const refreshShifts = useCallback(async () => {
        try {
            await onRefresh?.();
        } catch (err) {
            console.warn('Refresh shifts failed', err);
        }
    }, [onRefresh]);

    useEffect(() => {
        setPharmacistRatePref(userRatePreference);
    }, [userRatePreference]);

    useEffect(() => {
        const fetchRates = async () => {
            if (pharmacistRatePref) return;
            if (user?.role !== 'PHARMACIST') return;
            try {
                const dash: any = await getPharmacistDashboard({ workspace: 'platform' });
                const fromDash =
                    dash?.rate_preference ||
                    dash?.ratePreference ||
                    dash?.profile?.rate_preference ||
                    dash?.profile?.ratePreference ||
                    dash?.pharmacist_onboarding?.rate_preference ||
                    dash?.pharmacistProfile?.ratePreference ||
                    undefined;
                if (fromDash) {
                    setPharmacistRatePref(fromDash);
                    return;
                }
            } catch (err) {
                console.warn('Pharmacist dashboard rate preference not found', err);
            }
            try {
                const onboarding: any = await getOnboardingDetail('pharmacist');
                const fromOnboarding =
                    onboarding?.rate_preference ||
                    onboarding?.ratePreference ||
                    (onboarding?.data ? onboarding.data.rate_preference || onboarding.data.ratePreference : undefined);
                if (fromOnboarding) setPharmacistRatePref(fromOnboarding);
            } catch (err) {
                console.warn('Pharmacist onboarding rate preference not found', err);
            }
        };

        fetchRates();
    }, [pharmacistRatePref, user?.role]);

    const savedFeatureEnabled = enableSaved !== false;
    const [localActiveTab, setLocalActiveTab] = useState<'browse' | 'saved'>('browse');
    const activeTab = activeTabOverride ?? localActiveTab;

    const {
        savedShiftIds,
        setSavedShiftIds,
        appliedShiftIds,
        setAppliedShiftIds,
        appliedSlotIds,
        setAppliedSlotIds,
        rejectedShiftIds,
        setRejectedShiftIds,
        rejectedSlotIds,
        setRejectedSlotIds,
    } = useShiftPersistence({
        shifts,
        scopeKey,
        disableLocalPersistence,
        savedFeatureEnabled,
        savedShiftIdsProp,
        initialAppliedShiftIds,
        initialAppliedSlotIds,
        initialRejectedShiftIds,
        initialRejectedSlotIds,
    });

    const {
        filterConfig,
        setFilterConfig,
        sortConfig,
        setSortConfig,
        expandedStates,
        toggleStateExpand,
        toggleStateSelection,
        toggleFilter,
        toggleBooleanFilter,
        clearAllFilters,
        activeFilterCount,
        roleOptions,
        locationGroups,
        processedShifts,
    } = useFilterSort({
        shifts,
        filters,
        onFiltersChange,
        useServerFiltering,
        activeTab,
        savedShiftIds,
        savedFeatureEnabled,
        pharmacistRatePref,
        roleOptionsOverride,
    });

    const [filtersVisible, setFiltersVisible] = useState(false);
    const [sortMenuVisible, setSortMenuVisible] = useState(false);
    const scrollRef = useRef<ScrollViewInstance>(null);
    const [expandedCards, setExpandedCards] = useState<Record<number, boolean>>({});
    const [selectedSlotIds, setSelectedSlotIds] = useState<Record<number, Set<number>>>({});
    const [pharmacyRatings, setPharmacyRatings] = useState<Record<number, { average: number; count: number }>>({});
    const ratingFetchRef = useRef<Set<number>>(new Set());

    const toggleSlotSelection = (shiftId: number, slotId: number) => {
        setSelectedSlotIds((prev) => {
            const next = { ...prev };
            const current = new Set(next[shiftId] ?? []);
            if (current.has(slotId)) {
                current.delete(slotId);
            } else {
                current.add(slotId);
            }
            next[shiftId] = current;
            return next;
        });
    };

    const clearSelection = (shiftId: number) => {
        setSelectedSlotIds((prev) => {
            const next = { ...prev };
            delete next[shiftId];
            return next;
        });
    };

    const toggleExpandedCard = (shiftId: number) => {
        setExpandedCards((prev) => ({ ...prev, [shiftId]: !prev[shiftId] }));
    };

    const {
        counterOffers,
        counterSubmitting,
        counterOfferOpen,
        counterOfferShift,
        counterOfferSlots,
        counterOfferTravel,
        counterOfferTravelLocation,
        counterOfferError,
        hasCounterOfferTravelLocation,
        setCounterOfferTravel,
        setCounterOfferTravelLocation,
        openCounterOffer,
        closeCounterOffer,
        clearCounterOfferTravelLocation,
        handleCounterSlotChange,
        handleSubmitCounterOffer,
        reviewOfferShiftId,
        setReviewOfferShiftId,
        reviewOffers,
        reviewLoading,
        reviewError,
        retryReview,
    } = useCounterOffers({
        shifts,
        scopeKey,
        userRole: user?.role,
        pharmacistRatePref,
        hideCounterOffer,
        onSubmitCounterOffer,
        onPageChange,
        page,
        clearSelection,
        setAppliedShiftIds,
        setAppliedSlotIds,
        refreshShifts,
        currentUserId,
        disableLocalPersistence,
    });

    const displayShifts = useMemo(() => {
        if (effectiveSlotFilterMode === 'all') return processedShifts;

        const filteredShifts = processedShifts.filter((shift) => {
            const slots = getUpcomingSlotsForDisplay(shift.slots ?? []);
            const counterInfo = counterOffers[shift.id];
            const counterSlotIds = new Set<number>(
                Object.keys(counterInfo?.slots ?? {})
                    .map((value) => Number(value))
                    .filter((value) => Number.isFinite(value))
            );
            const hasShiftLevelInterest = appliedShiftIds.has(shift.id);

            if (effectiveSlotFilterMode === 'interested') {
                if (slots.length === 0) {
                    return hasShiftLevelInterest;
                }
                return slots.some((slot) => {
                    if (slot.id == null) return false;
                    if (rejectedSlotIds.has(slot.id)) return false;
                    return appliedSlotIds.has(slot.id) || counterSlotIds.has(slot.id);
                });
            }
            if (effectiveSlotFilterMode === 'rejected') {
                if (slots.length === 0) {
                    return rejectedShiftIds.has(shift.id);
                }
                if (rejectedShiftIds.has(shift.id)) return true;
                return slots.some((slot) => slot.id != null && rejectedSlotIds.has(slot.id));
            }
            return true;
        });

        if (fallbackToAllShiftsWhenEmpty && filteredShifts.length === 0 && processedShifts.length > 0) {
            return processedShifts;
        }

        return filteredShifts;
    }, [
        effectiveSlotFilterMode,
        processedShifts,
        appliedShiftIds,
        appliedSlotIds,
        rejectedShiftIds,
        rejectedSlotIds,
        counterOffers,
        fallbackToAllShiftsWhenEmpty,
    ]);

    useEffect(() => {
        if (!token) return;
        const ids = new Set<number>();
        shifts.forEach((shift) => {
            const pharmacyId = getShiftPharmacyId(shift);
            if (typeof pharmacyId === 'number') {
                ids.add(pharmacyId);
            }
        });

        ids.forEach((id) => {
            if (ratingFetchRef.current.has(id)) return;
            ratingFetchRef.current.add(id);
            fetchRatingsSummaryService({ targetType: 'pharmacy', targetId: id })
                .then((summary: any) => {
                    const averageRaw = Number(summary?.average ?? 0);
                    const countRaw = Number(summary?.count ?? 0);
                    const average = Number.isFinite(averageRaw) ? averageRaw : 0;
                    const count = Number.isFinite(countRaw) ? countRaw : 0;
                    setPharmacyRatings((prev) => ({
                        ...prev,
                        [id]: { average, count },
                    }));
                })
                .catch(() => {
                    // ignore fetch errors
                });
        });
    }, [shifts, token]);

    const handleActiveTabChange = (nextTab: 'browse' | 'saved') => {
        if (!activeTabOverride) {
            setLocalActiveTab(nextTab);
        }
        onActiveTabChange?.(nextTab);
    };

    const toggleSaveShift = async (shiftId: number) => {
        if (!savedFeatureEnabled || hideSaveToggle) return;
        if (onToggleSave) {
            await onToggleSave(shiftId);
            return;
        }
        setSavedShiftIds((prev) => {
            const next = new Set(prev);
            if (next.has(shiftId)) {
                next.delete(shiftId);
            } else {
                next.add(shiftId);
            }
            return next;
        });
    };

    const handleApplyAll = async (shift: Shift) => {
        try {
            if (readOnlyActions) {
                await onApplyAll(shift);
                return;
            }
            await onApplyAll(shift);
        } catch (err) {
            return;
        }
        await refreshShifts();
        setAppliedShiftIds((prev) => {
            const next = new Set(prev);
            next.add(shift.id);
            return next;
        });
        const slots = shift.slots ?? [];
        if (slots.length > 0) {
            setAppliedSlotIds((prev) => {
                const next = new Set(prev);
                slots.forEach((slot) => next.add(slot.id));
                return next;
            });
        }
    };

    const handleApplySlot = async (shift: Shift, slotId: number) => {
        try {
            if (readOnlyActions) {
                await onApplySlot(shift, slotId);
                return;
            }
            await onApplySlot(shift, slotId);
        } catch (err) {
            return;
        }
        await refreshShifts();
        setAppliedSlotIds((prev) => {
            const next = new Set(prev);
            next.add(slotId);
            return next;
        });
    };

    const handleApplySlots = async (shift: Shift, slotIds: number[]) => {
        const uniqueSlotIds = Array.from(new Set(slotIds)).filter((id) => Number.isFinite(id));
        if (uniqueSlotIds.length === 0) return;
        try {
            if (onApplySlots) {
                await onApplySlots(shift, uniqueSlotIds);
            } else {
                await Promise.all(uniqueSlotIds.map((slotId) => Promise.resolve(onApplySlot(shift, slotId))));
            }
        } catch (err) {
            return;
        }
        await refreshShifts();
        setAppliedSlotIds((prev) => {
            const next = new Set(prev);
            uniqueSlotIds.forEach((slotId) => next.add(slotId));
            return next;
        });
        setSelectedSlotIds((prev) => {
            const next = { ...prev };
            const current = new Set(next[shift.id] ?? []);
            uniqueSlotIds.forEach((slotId) => current.delete(slotId));
            next[shift.id] = current;
            return next;
        });
    };

    const handleRejectShift = async (shift: Shift) => {
        if (!onRejectShift) return;
        await onRejectShift(shift);
        await refreshShifts();
        setRejectedShiftIds((prev) => {
            const next = new Set(prev);
            next.add(shift.id);
            return next;
        });
        setAppliedShiftIds((prev) => {
            const next = new Set(prev);
            next.delete(shift.id);
            return next;
        });
        const slots = shift.slots ?? [];
        if (slots.length > 0) {
            setAppliedSlotIds((prev) => {
                const next = new Set(prev);
                slots.forEach((slot) => next.delete(slot.id));
                return next;
            });
            setRejectedSlotIds((prev) => {
                const next = new Set(prev);
                slots.forEach((slot) => next.add(slot.id));
                return next;
            });
        }
        clearSelection(shift.id);
    };

    const handleRejectSlot = async (shift: Shift, slotId: number) => {
        if (!onRejectSlot) return;
        await onRejectSlot(shift, slotId);
        await refreshShifts();
        setRejectedSlotIds((prev) => {
            const next = new Set(prev);
            next.add(slotId);
            return next;
        });
        setAppliedSlotIds((prev) => {
            const next = new Set(prev);
            next.delete(slotId);
            return next;
        });
        setSelectedSlotIds((prev) => {
            const next = { ...prev };
            const current = new Set(next[shift.id] ?? []);
            current.delete(slotId);
            next[shift.id] = current;
            return next;
        });
    };

    const handleRejectSlots = async (shift: Shift, slotIds: number[]) => {
        const uniqueSlotIds = Array.from(new Set(slotIds)).filter((id) => Number.isFinite(id));
        if (uniqueSlotIds.length === 0) return;
        if (onRejectSlots) {
            await onRejectSlots(shift, uniqueSlotIds);
        } else if (onRejectSlot) {
            await Promise.all(uniqueSlotIds.map((slotId) => Promise.resolve(onRejectSlot(shift, slotId))));
        } else {
            return;
        }
        await refreshShifts();
        setRejectedSlotIds((prev) => {
            const next = new Set(prev);
            uniqueSlotIds.forEach((slotId) => next.add(slotId));
            return next;
        });
        setAppliedSlotIds((prev) => {
            const next = new Set(prev);
            uniqueSlotIds.forEach((slotId) => next.delete(slotId));
            return next;
        });
        setSelectedSlotIds((prev) => {
            const next = { ...prev };
            const current = new Set(next[shift.id] ?? []);
            uniqueSlotIds.forEach((slotId) => current.delete(slotId));
            next[shift.id] = current;
            return next;
        });
    };

    const sidebarContent = (
        <FiltersSidebar
            filterConfig={filterConfig}
            setFilterConfig={setFilterConfig}
            roleOptions={roleOptions}
            locationGroups={locationGroups}
            expandedStates={expandedStates}
            toggleStateExpand={toggleStateExpand}
            toggleStateSelection={toggleStateSelection}
            toggleFilter={toggleFilter}
            toggleBooleanFilter={toggleBooleanFilter}
        />
    );

    const headerSubtitle =
        activeTab === 'saved'
            ? `${displayShifts.length} saved`
            : plural(
                useServerFiltering && typeof totalCount === 'number' && effectiveSlotFilterMode === 'all' ? totalCount : displayShifts.length,
                'shift',
            );

    const pageCount =
        useServerFiltering && typeof totalCount === 'number' && pageSize
            ? Math.max(1, Math.ceil(totalCount / pageSize))
            : null;
    const currentPage = page ?? 1;
    const goToPage = (next: number) => {
        onPageChange?.(next);
        scrollRef.current?.scrollTo({ y: 0, animated: false });
    };

    const booleanFilterLabels = {
        onlyUrgent: 'Urgent',
        bulkShiftsOnly: 'Bulk shifts',
        negotiableOnly: 'Negotiable',
        travelProvided: 'Travel',
        accommodationProvided: 'Accommodation',
    } as const;
    const activeFilters: { key: string; label: string; remove: () => void }[] = [
        ...(Object.keys(booleanFilterLabels) as (keyof typeof booleanFilterLabels)[])
            .filter((key) => filterConfig[key])
            .map((key) => ({ key, label: booleanFilterLabels[key], remove: () => toggleBooleanFilter(key) })),
        ...(['roles', 'employmentTypes', 'timeOfDay'] as const).flatMap((key) =>
            filterConfig[key].map((value) => ({ key: `${key}-${value}`, label: value, remove: () => toggleFilter(key, value) })),
        ),
    ];

    // One next step on every empty list (humanise 3.4.2); the board's tab picks the words.
    const emptyState =
        activeTab === 'saved'
            ? { title: 'No saved shifts', description: 'Tap the heart on a shift to keep it here.' }
            : effectiveSlotFilterMode === 'interested'
                ? { title: 'No interest shown yet', description: 'Shifts you apply for or counter show here.' }
                : effectiveSlotFilterMode === 'rejected'
                    ? { title: 'Nothing rejected', description: 'Shifts and dates you turn down show here.' }
                    : activeFilterCount > 0
                        ? { title: 'No shifts match your filters', description: 'Try fewer filters to see more shifts.', actionLabel: 'Clear filters', onAction: clearAllFilters }
                        : {
                            title: 'No open shifts right now',
                            description: 'New shifts show here as pharmacies post them.',
                            actionLabel: onRefresh ? 'Refresh' : undefined,
                            onAction: onRefresh ? () => void refreshShifts() : undefined,
                        };

    return (
        <View style={styles.container}>
            <CounterOfferDialog
                visible={counterOfferOpen}
                onDismiss={closeCounterOffer}
                counterOfferShift={counterOfferShift}
                counterOfferError={counterOfferError}
                counterOfferSlots={counterOfferSlots}
                counterOfferTravel={counterOfferTravel}
                counterOfferTravelLocation={counterOfferTravelLocation}
                hasCounterOfferTravelLocation={hasCounterOfferTravelLocation}
                counterSubmitting={counterSubmitting}
                onCounterSlotChange={handleCounterSlotChange}
                onCounterOfferTravelChange={setCounterOfferTravel}
                setCounterOfferTravelLocation={setCounterOfferTravelLocation}
                onClearTravelLocation={clearCounterOfferTravelLocation}
                onSubmit={handleSubmitCounterOffer}
            />

            <ReviewCounterOfferDialog
                visible={reviewOfferShiftId != null}
                onDismiss={() => setReviewOfferShiftId(null)}
                reviewLoading={reviewLoading}
                reviewError={reviewError}
                onRetry={retryReview}
                reviewOfferShiftId={reviewOfferShiftId}
                reviewOffers={reviewOffers}
                shifts={shifts}
            />

            <ScrollView
                ref={scrollRef}
                style={styles.scrollView}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
                onScroll={onScroll}
                scrollEventThrottle={16}
            >
                <View style={styles.header}>
                    <Text accessibilityRole="header" style={styles.title}>{title}</Text>
                    {!loading ? <Text style={styles.subtitle}>{headerSubtitle}</Text> : null}
                </View>

                {!hideTabs && (
                    <SegmentTabs
                        tabs={[
                            { value: 'browse' as const, label: 'Browse' },
                            ...(savedFeatureEnabled ? [{ value: 'saved' as const, label: `Saved (${savedShiftIds.size})` }] : []),
                        ]}
                        value={activeTab === 'saved' ? 'saved' : 'browse'}
                        onChange={handleActiveTabChange}
                        label="Shift list"
                        idPrefix="shift-board-list"
                        style={styles.tabsRow}
                    />
                )}

                {!hideFiltersAndSort && (
                    <View style={styles.chipRow}>
                        <Pill
                            label={activeFilterCount > 0 ? `Filters · ${activeFilterCount}` : 'Filters'}
                            icon={<SlidersHorizontal />}
                            selected={activeFilterCount > 0}
                            onPress={() => setFiltersVisible(true)}
                            accessibilityLabel={activeFilterCount > 0 ? `Filters, ${activeFilterCount} on` : 'Filters'}
                        />
                        <Pill
                            label={`Sort: ${sortLabels[sortConfig.key]}`}
                            icon={<ArrowUpDown />}
                            onPress={() => setSortMenuVisible(true)}
                            accessibilityLabel={`Sort by ${sortLabels[sortConfig.key]}, ${sortOrderLabels[sortConfig.key][sortConfig.direction === 'ascending' ? 0 : 1]}`}
                        />
                    </View>
                )}

                {!hideFiltersAndSort && activeFilterCount > 0 && (
                    <View style={styles.chipRow}>
                        {activeFilters.map((filter) => (
                            <Pill
                                key={filter.key}
                                label={filter.label}
                                icon={<X />}
                                selected
                                onPress={filter.remove}
                                accessibilityLabel={`Remove filter ${filter.label}`}
                            />
                        ))}
                        <Pill label="Clear all" onPress={clearAllFilters} accessibilityLabel="Clear all filters" />
                    </View>
                )}

                <ShiftList
                    loading={loading}
                    processedShifts={displayShifts}
                    clearAllFilters={clearAllFilters}
                    emptyState={emptyState}
                    hideCounterOffer={hideCounterOffer}
                    onSubmitCounterOffer={onSubmitCounterOffer}
                    onRejectShift={onRejectShift}
                    onRejectSlot={onRejectSlot}
                    onRejectSlots={onRejectSlots}
                    handleApplyAll={handleApplyAll}
                    handleApplySlot={handleApplySlot}
                    handleApplySlots={handleApplySlots}
                    handleRejectShift={handleRejectShift}
                    handleRejectSlot={handleRejectSlot}
                    handleRejectSlots={handleRejectSlots}
                    toggleExpandedCard={toggleExpandedCard}
                    expandedCards={expandedCards}
                    selectedSlotIds={selectedSlotIds}
                    toggleSlotSelection={toggleSlotSelection}
                    clearSelection={clearSelection}
                    appliedShiftIds={appliedShiftIds}
                    appliedSlotIds={appliedSlotIds}
                    rejectedShiftIds={rejectedShiftIds}
                    rejectedSlotIds={rejectedSlotIds}
                    savedShiftIds={savedShiftIds}
                    savedFeatureEnabled={savedFeatureEnabled}
                    hideSaveToggle={hideSaveToggle}
                    toggleSaveShift={toggleSaveShift}
                    counterOffers={counterOffers}
                    onReviewOffers={(shiftId) => setReviewOfferShiftId(shiftId)}
                    openCounterOffer={openCounterOffer}
                    rejectActionGuard={rejectActionGuard}
                    actionDisabledGuard={actionDisabledGuard}
                    userRatePreference={pharmacistRatePref}
                    pharmacyRatings={pharmacyRatings}
                    slotFilterMode={effectiveSlotFilterMode}
                    applyLabel={applyLabel}
                    disableSlotActions={disableSlotActions}
                    disableActionGuards={disableActionGuards}
                />

                {useServerFiltering && effectiveSlotFilterMode === 'all' && pageCount && pageCount > 1 && onPageChange && !loading ? (
                    <View style={styles.paginationRow}>
                        <Button
                            label="Previous"
                            variant="outlined"
                            icon={<ChevronLeft />}
                            disabled={currentPage <= 1}
                            onPress={() => goToPage(Math.max(1, currentPage - 1))}
                            accessibilityLabel="Previous page"
                        />
                        <Text style={styles.pageText}>{`Page ${currentPage} of ${pageCount}`}</Text>
                        <Button
                            label="Next"
                            variant="outlined"
                            icon={<ChevronRight />}
                            disabled={currentPage >= pageCount}
                            onPress={() => goToPage(Math.min(pageCount, currentPage + 1))}
                            accessibilityLabel="Next page"
                        />
                    </View>
                ) : null}
            </ScrollView>

            {!hideFiltersAndSort && (
                <>
                    <BottomSheet
                        open={filtersVisible}
                        onClose={() => setFiltersVisible(false)}
                        title="Filters"
                        footer={<Button label="Show shifts" onPress={() => setFiltersVisible(false)} />}
                    >
                        {sidebarContent}
                    </BottomSheet>
                    <BottomSheet open={sortMenuVisible} onClose={() => setSortMenuVisible(false)} title="Sort shifts">
                        <View accessibilityRole="radiogroup" accessibilityLabel="Sort by">
                            {SORT_KEYS.map((key) => {
                                const checked = sortConfig.key === key;
                                return (
                                    <ScalePressable
                                        key={key}
                                        static
                                        pressBg
                                        accessibilityRole="radio"
                                        accessibilityState={{ checked }}
                                        accessibilityLabel={sortLabels[key]}
                                        onPress={() => setSortConfig((prev) => ({ ...prev, key }))}
                                        style={styles.sortRow}
                                    >
                                        <Text style={[styles.sortLabel, checked ? styles.sortLabelOn : null]}>{sortLabels[key]}</Text>
                                        {checked ? <Check size={20} color={colors.accentStrong} strokeWidth={2} /> : null}
                                    </ScalePressable>
                                );
                            })}
                        </View>
                        <SegmentTabs
                            tabs={[
                                { value: 'ascending' as const, label: sortOrderLabels[sortConfig.key][0] },
                                { value: 'descending' as const, label: sortOrderLabels[sortConfig.key][1] },
                            ]}
                            value={sortConfig.direction}
                            onChange={(direction) => setSortConfig((prev) => ({ ...prev, direction }))}
                            label="Sort order"
                            idPrefix="shift-sort-order"
                            style={styles.sortOrder}
                        />
                    </BottomSheet>
                </>
            )}
        </View>
    );
};

const text = (t: { fontFamily: string; fontSize: number; lineHeight: number }) =>
    ({ fontFamily: t.fontFamily, fontSize: t.fontSize, lineHeight: t.lineHeight });

const styles = StyleSheet.create({
    container: { flex: 1 },
    scrollView: { flex: 1 },
    scrollContent: { gap: space.md, paddingBottom: space['2xl'] },
    header: { paddingHorizontal: space.lg, paddingTop: space.sm, gap: space.xxs },
    title: { ...text(type.titleLarge), color: colors.textPrimary },
    subtitle: { ...text(type.bodySmall), color: colors.textSecondary, fontVariant: ['tabular-nums'] },
    tabsRow: { marginHorizontal: space.lg },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.sm, paddingHorizontal: space.lg },
    paginationRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm, paddingHorizontal: space.lg },
    pageText: { ...text(type.bodySmall), fontFamily: font.inter.medium, color: colors.textSecondary, fontVariant: ['tabular-nums'] },
    sortRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        minHeight: touch.min,
        paddingHorizontal: space.sm,
        marginHorizontal: -space.sm,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: colors.border,
    },
    sortLabel: { ...text(type.bodyLarge), color: colors.textPrimary },
    sortLabelOn: { fontFamily: font.inter.semiBold, color: colors.accentStrong },
    sortOrder: { marginTop: space.lg, marginBottom: space.md },
});

export default ShiftsBoard;
