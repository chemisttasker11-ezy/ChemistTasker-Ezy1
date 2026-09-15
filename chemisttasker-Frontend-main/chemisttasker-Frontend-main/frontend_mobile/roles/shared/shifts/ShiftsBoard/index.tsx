// ShiftsBoard - Mobile React Native version
// Complete shift board implementation matching web behavior

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, View, StyleSheet } from 'react-native';
import {
    Button,
    Chip,
    Divider,
    IconButton,
    Menu,
    Modal,
    Portal,
    SegmentedButtons,
    Text,
} from 'react-native-paper';
import {
    Shift,
    fetchRatingsSummaryService,
    getOnboardingDetail,
    getPharmacistDashboard,
} from '@chemisttasker/shared-core';
import { useAuth } from '@/context/AuthContext';
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

const ShiftsBoard: React.FC<ShiftsBoardProps> = ({
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
        handleSortChange,
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
    } = useCounterOffers({
        shifts,
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
            ? `${displayShifts.length} saved items`
            : useServerFiltering && typeof totalCount === 'number' && effectiveSlotFilterMode === 'all'
                ? `Showing ${totalCount} opportunities`
                : `Showing ${displayShifts.length} opportunities`;

    const pageCount =
        useServerFiltering && typeof totalCount === 'number' && pageSize
            ? Math.max(1, Math.ceil(totalCount / pageSize))
            : null;

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
                reviewOfferShiftId={reviewOfferShiftId}
                reviewOffers={reviewOffers}
                shifts={shifts}
            />

            <ScrollView
                style={styles.scrollView}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
                onScroll={onScroll}
                scrollEventThrottle={16}
            >
                <View style={styles.header}>
                    <View style={styles.headerText}>
                        <Text variant="headlineMedium" style={styles.title}>{title}</Text>
                        <Text variant="bodySmall" style={styles.subtitle}>{headerSubtitle}</Text>
                    </View>
                </View>

                {!hideTabs && (
                    <View style={styles.tabsRow}>
                        <SegmentedButtons
                            value={activeTab === 'saved' ? 'saved' : 'browse'}
                            onValueChange={(value) => handleActiveTabChange(value as 'browse' | 'saved')}
                            buttons={[
                                { value: 'browse', label: 'Browse' },
                                savedFeatureEnabled
                                    ? { value: 'saved', label: `Saved (${savedShiftIds.size})` }
                                    : null,
                            ].filter(Boolean) as Array<{ value: 'browse' | 'saved'; label: string }>}
                            theme={{ colors: { secondaryContainer: '#EEF2FF', onSecondaryContainer: '#6366F1' } }}
                        />
                    </View>
                )}

                {!hideFiltersAndSort && (
                    <View style={styles.filtersRow}>
                        <Button
                            mode="outlined"
                            icon="tune"
                            onPress={() => setFiltersVisible(true)}
                        >
                            Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
                        </Button>
                        <Menu
                            visible={sortMenuVisible}
                            onDismiss={() => setSortMenuVisible(false)}
                            anchor={
                                <Button
                                    mode="outlined"
                                    icon="swap-vertical"
                                    onPress={() => setSortMenuVisible(true)}
                                >
                                    Sort: {sortLabels[sortConfig.key]}
                                </Button>
                            }
                        >
                            {(['shiftDate', 'postedDate', 'rate', 'distance'] as SortKey[]).map((key) => (
                                <Menu.Item
                                    key={key}
                                    onPress={() => {
                                        handleSortChange(key);
                                        setSortMenuVisible(false);
                                    }}
                                    title={sortLabels[key]}
                                />
                            ))}
                        </Menu>
                        <IconButton
                            icon={sortConfig.direction === 'ascending' ? 'arrow-up' : 'arrow-down'}
                            onPress={() =>
                                setSortConfig((prev) => ({
                                    ...prev,
                                    direction: prev.direction === 'ascending' ? 'descending' : 'ascending',
                                }))
                            }
                        />
                    </View>
                )}

                {!hideFiltersAndSort && activeFilterCount > 0 && (
                    <View style={styles.activeFilters}>
                        {filterConfig.onlyUrgent && (
                            <Chip onClose={() => toggleBooleanFilter('onlyUrgent')}>Urgent</Chip>
                        )}
                        {filterConfig.bulkShiftsOnly && (
                            <Chip onClose={() => toggleBooleanFilter('bulkShiftsOnly')}>Bulk shifts</Chip>
                        )}
                        {filterConfig.negotiableOnly && (
                            <Chip onClose={() => toggleBooleanFilter('negotiableOnly')}>Negotiable</Chip>
                        )}
                        {filterConfig.travelProvided && (
                            <Chip onClose={() => toggleBooleanFilter('travelProvided')}>Travel</Chip>
                        )}
                        {filterConfig.accommodationProvided && (
                            <Chip onClose={() => toggleBooleanFilter('accommodationProvided')}>Accommodation</Chip>
                        )}
                        {filterConfig.roles.map((role) => (
                            <Chip key={role} onClose={() => toggleFilter('roles', role)}>{role}</Chip>
                        ))}
                        {filterConfig.employmentTypes.map((type) => (
                            <Chip key={type} onClose={() => toggleFilter('employmentTypes', type)}>{type}</Chip>
                        ))}
                        {filterConfig.timeOfDay.map((time) => (
                            <Chip key={time} onClose={() => toggleFilter('timeOfDay', time)}>{time}</Chip>
                        ))}
                        <Button mode="text" onPress={clearAllFilters} icon="close">
                            Clear all
                        </Button>
                    </View>
                )}

                {useServerFiltering && effectiveSlotFilterMode === 'all' && pageCount && onPageChange && (
                    <View style={styles.paginationRow}>
                        <Button
                            mode="outlined"
                            disabled={(page ?? 1) <= 1}
                            onPress={() => onPageChange(Math.max(1, (page ?? 1) - 1))}
                        >
                            Previous
                        </Button>
                        <Text variant="bodySmall" style={styles.pageText}>
                            Page {page ?? 1} of {pageCount}
                        </Text>
                        <Button
                            mode="outlined"
                            disabled={(page ?? 1) >= pageCount}
                            onPress={() => onPageChange(Math.min(pageCount, (page ?? 1) + 1))}
                        >
                            Next
                        </Button>
                    </View>
                )}

                <ShiftList
                    loading={loading}
                    processedShifts={displayShifts}
                    clearAllFilters={clearAllFilters}
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
            </ScrollView>

            {!hideFiltersAndSort && (
                <Portal>
                    <Modal
                        visible={filtersVisible}
                        onDismiss={() => setFiltersVisible(false)}
                        contentContainerStyle={styles.filterModal}
                    >
                        <View style={styles.filterHeader}>
                            <Text variant="titleMedium">Filters</Text>
                            <IconButton icon="close" onPress={() => setFiltersVisible(false)} />
                        </View>
                        <Divider />
                        <View style={styles.filterBody}>{sidebarContent}</View>
                    </Modal>
                </Portal>
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    scrollView: {
        flex: 1,
    },
    scrollContent: {
        paddingBottom: 24,
    },
    header: {
        paddingHorizontal: 16,
        paddingTop: 8,
        paddingBottom: 8,
    },
    headerText: {
        gap: 4,
    },
    title: {
        fontWeight: '700',
    },
    subtitle: {
        color: '#6B7280',
    },
    tabsRow: {
        paddingHorizontal: 16,
        paddingBottom: 8,
    },
    filtersRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
        paddingHorizontal: 16,
        paddingVertical: 8,
        alignItems: 'center',
    },
    activeFilters: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
        paddingHorizontal: 16,
        paddingBottom: 8,
        alignItems: 'center',
    },
    paginationRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingBottom: 12,
    },
    pageText: {
        color: '#6B7280',
    },
    filterModal: {
        backgroundColor: '#FFFFFF',
        marginHorizontal: 16,
        marginVertical: 24,
        borderRadius: 12,
        overflow: 'hidden',
        maxHeight: '90%',
    },
    filterHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 12,
    },
    filterBody: {
        flex: 1,
    },
});

export default ShiftsBoard;
