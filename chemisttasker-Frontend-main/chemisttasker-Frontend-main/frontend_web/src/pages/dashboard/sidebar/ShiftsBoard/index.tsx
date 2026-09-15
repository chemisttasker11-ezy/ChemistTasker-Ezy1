import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import {
  Box,
  Button,
  Chip,
  Divider,
  Drawer,
  FormControl,
  GlobalStyles,
  IconButton,
  InputLabel,
  MenuItem,
  Paper,
  Pagination,
  Select,
  Stack,
  Typography,
  useMediaQuery,
} from '@mui/material';
import {
  Close as CloseIcon,
  Favorite as FavoriteIcon,
  SwapVert as SwapVertIcon,
  Tune as TuneIcon,
  ArrowUpward as ArrowUpwardIcon,
  ArrowDownward as ArrowDownwardIcon,
} from '@mui/icons-material';
import {
  Shift,
  getPharmacistDashboard,
  getOnboardingDetail, // ensure rate_preference fallback using existing onboarding API
} from '@chemisttasker/shared-core';
import { useJsApiLoader } from '@react-google-maps/api';
import apiClient from '../../../../utils/apiClient';
import { API_ENDPOINTS } from '../../../../constants/api';
import { useAuth } from '../../../../contexts/AuthContext';
import { GOOGLE_LIBRARIES } from './constants';
import { RatePreference, ShiftsBoardProps, SlotFilterMode, SortKey } from './types';
import FiltersSidebar from './components/FiltersSidebar';
import CounterOfferDialog from './components/CounterOfferDialog';
import ShiftList from './components/ShiftList';
import ReviewCounterOfferDialog from './components/ReviewCounterOfferDialog';
import { useCounterOffers } from './hooks/useCounterOffers';
import { useFilterSort } from './hooks/useFilterSort';
import { useShiftPersistence } from './hooks/useShiftPersistence';
import { getUpcomingSlotsForDisplay, getShiftPharmacyId } from './utils/shift';

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
  fallbackToAllShiftsWhenEmpty,
  showAllSlots,
  actionDisabledGuard,
  applyLabel,
  disableSlotActions,
  disableActionGuards,
}) => {
  const slotFilterMode: SlotFilterMode = slotFilterModeProp ?? 'all';
  const auth = useAuth();
  const currentUserId = (auth as any)?.user?.id ?? null;
  const { isLoaded: isTravelMapsLoaded, loadError: travelMapsLoadError } = useJsApiLoader({
    googleMapsApiKey: import.meta.env.VITE_Maps_API_KEY || '',
    libraries: GOOGLE_LIBRARIES,
  });
  // Single source of truth for pharmacist rates: use the rate_preference from the user payload (as returned by /users/me).
  const userRatePreference: RatePreference | undefined =
    (auth as any)?.user?.rate_preference ||
    (auth as any)?.user?.ratePreference ||
    (auth as any)?.user?.pharmacist_onboarding?.rate_preference ||
    (auth as any)?.user?.pharmacistOnboarding?.rate_preference ||
    (auth as any)?.user?.pharmacist_profile?.rate_preference ||
    (auth as any)?.user?.pharmacistProfile?.rate_preference ||
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
      if (auth?.user?.role !== 'PHARMACIST') return;
      try {
        // Attempt dashboard first
        const dash: any = await getPharmacistDashboard({ workspace: "platform" });
        const fromDash =
          dash?.rate_preference ||
          dash?.ratePreference ||
          dash?.profile?.rate_preference ||
          dash?.profile?.ratePreference ||
          dash?.pharmacist_onboarding?.rate_preference ||
          dash?.pharmacistProfile?.ratePreference ||
          undefined;
        if (fromDash) {
          console.log('Pharmacist dashboard rate preference', fromDash);
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
        console.log('Pharmacist onboarding rate preference', fromOnboarding);
        if (fromOnboarding) setPharmacistRatePref(fromOnboarding);
      } catch (err) {
        console.warn('Pharmacist onboarding rate preference not found', err);
      }
    };
    fetchRates();
  }, [auth?.user?.role, pharmacistRatePref]);
  const isMobile = useMediaQuery('(max-width: 1024px)');
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
  const baseShifts = useMemo(() => {
    if (fallbackToAllShiftsWhenEmpty && !loading && processedShifts.length === 0 && shifts.length > 0) {
      return shifts;
    }
    return processedShifts;
  }, [fallbackToAllShiftsWhenEmpty, loading, processedShifts, shifts]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
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
    travelAutocompleteRef,
    setCounterOfferTravel,
    setCounterOfferTravelLocation,
    openCounterOffer,
    closeCounterOffer,
    clearCounterOfferTravelLocation,
    handleCounterOfferTravelPlaceChanged,
    handleCounterSlotChange,
    handleSubmitCounterOffer,
    reviewOfferShiftId,
    setReviewOfferShiftId,
    reviewOffers,
    reviewLoading,
  } = useCounterOffers({
    shifts,
    userRole: auth?.user?.role,
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
    if (slotFilterMode === 'all') return baseShifts;

    return baseShifts.filter((shift) => {
      const slots = getUpcomingSlotsForDisplay(shift.slots ?? []);
      const counterInfo = counterOffers[shift.id];
      const counterSlotIds = new Set<number>(
        Object.keys(counterInfo?.slots ?? {})
          .map((value) => Number(value))
          .filter((value) => Number.isFinite(value))
      );
      const hasShiftLevelInterest = appliedShiftIds.has(shift.id);

      if (slotFilterMode === 'interested') {
        if (slots.length === 0) {
          return hasShiftLevelInterest;
        }
        return slots.some((slot) => {
          if (slot.id == null) return false;
          if (rejectedSlotIds.has(slot.id)) return false;
          return appliedSlotIds.has(slot.id) || counterSlotIds.has(slot.id);
        });
      }
      if (slotFilterMode === 'rejected') {
        if (slots.length === 0) {
          return rejectedShiftIds.has(shift.id);
        }
        if (rejectedShiftIds.has(shift.id)) return true;
        return slots.some((slot) => slot.id != null && rejectedSlotIds.has(slot.id));
      }
      return true;
    });
  }, [
    slotFilterMode,
    baseShifts,
    appliedShiftIds,
    appliedSlotIds,
    rejectedShiftIds,
    rejectedSlotIds,
    counterOffers,
  ]);

  useEffect(() => {
    // Public pages (no token) shouldn't hit the protected ratings endpoint, otherwise
    // the axios interceptor will bounce the user to /login.
    if (!auth?.token) {
      return;
    }
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
      apiClient
        .get(`${API_ENDPOINTS.ratingsSummary}?target_type=pharmacy&target_id=${id}`)
        .then((res) => {
          const averageRaw = Number((res.data as any)?.average ?? 0);
          const countRaw = Number((res.data as any)?.count ?? 0);
          const average = Number.isFinite(averageRaw) ? averageRaw : 0;
          const count = Number.isFinite(countRaw) ? countRaw : 0;
          setPharmacyRatings((prev) => ({
            ...prev,
            [id]: { average, count },
          }));
        })
        .catch(() => {
          // ignore fetch errors; leave rating absent
        });
    });
  }, [shifts, auth?.token]);

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
      // Parent is responsible for showing any error/snackbar; skip local state updates.
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

  return (
    <Box sx={{ px: { xs: 0, lg: 2 }, py: 2 }}>
      <GlobalStyles styles={{ '.pac-container': { zIndex: 1400 } }} />
      <CounterOfferDialog
        open={counterOfferOpen}
        onClose={closeCounterOffer}
        counterOfferShift={counterOfferShift}
        counterOfferError={counterOfferError}
        counterOfferSlots={counterOfferSlots}
        counterOfferTravel={counterOfferTravel}
        counterOfferTravelLocation={counterOfferTravelLocation}
        hasCounterOfferTravelLocation={hasCounterOfferTravelLocation}
        isTravelMapsLoaded={isTravelMapsLoaded}
        travelMapsLoadError={travelMapsLoadError}
        counterSubmitting={counterSubmitting}
        onCounterSlotChange={handleCounterSlotChange}
        onCounterOfferTravelChange={setCounterOfferTravel}
        setCounterOfferTravelLocation={setCounterOfferTravelLocation}
        onClearTravelLocation={clearCounterOfferTravelLocation}
        onPlaceChanged={handleCounterOfferTravelPlaceChanged}
        onAutocompleteLoad={(ref) => (travelAutocompleteRef.current = ref)}
        onSubmit={handleSubmitCounterOffer}
      />

      <ReviewCounterOfferDialog
        open={reviewOfferShiftId != null}
        onClose={() => setReviewOfferShiftId(null)}
        reviewLoading={reviewLoading}
        reviewOfferShiftId={reviewOfferShiftId}
        reviewOffers={reviewOffers}
        shifts={shifts}
      />

      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', mb: 2 }}>
        <Box>
          <Typography variant="h4" fontWeight={700}>{title}</Typography>
          <Typography variant="body2" color="text.secondary">
            {activeTab === 'saved'
              ? `${displayShifts.length} saved items`
              : useServerFiltering && typeof totalCount === 'number' && slotFilterMode === 'all'
                ? `Showing ${totalCount} opportunities`
                : `Showing ${displayShifts.length} opportunities`}
          </Typography>
        </Box>
        {!hideTabs && (
          <Stack direction="row" spacing={1.5} alignItems="center">
            <Button
              variant={activeTab === 'browse' ? 'contained' : 'outlined'}
              onClick={() => handleActiveTabChange('browse')}
            >
              Browse
            </Button>
            {savedFeatureEnabled && (
              <Button
                variant={activeTab === 'saved' ? 'contained' : 'outlined'}
                onClick={() => handleActiveTabChange('saved')}
                startIcon={<FavoriteIcon />}
              >
                Saved ({savedShiftIds.size})
              </Button>
            )}
            {isMobile && !hideFiltersAndSort && (
              <IconButton onClick={() => setIsSidebarOpen(true)}>
                <TuneIcon />
              </IconButton>
            )}
          </Stack>
        )}
      </Box>

      <Box sx={{ display: 'flex', gap: 3 }}>
        {!isMobile && !hideFiltersAndSort && (
          <Paper variant="outlined" sx={{ width: 320, flexShrink: 0, borderRadius: 3, borderColor: 'grey.200' }}>
            {sidebarContent}
          </Paper>
        )}

        <Box sx={{ flex: 1, minWidth: 0 }}>
          {!hideFiltersAndSort && activeFilterCount > 0 && (
            <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ mb: 2 }}>
              {filterConfig.onlyUrgent && (
                <Chip label="Urgent" onDelete={() => toggleBooleanFilter('onlyUrgent')} color="warning" size="small" />
              )}
              {filterConfig.bulkShiftsOnly && (
                <Chip label="Bulk shifts" onDelete={() => toggleBooleanFilter('bulkShiftsOnly')} size="small" />
              )}
              {filterConfig.negotiableOnly && (
                <Chip label="Negotiable" onDelete={() => toggleBooleanFilter('negotiableOnly')} size="small" />
              )}
              {filterConfig.travelProvided && (
                <Chip label="Travel" onDelete={() => toggleBooleanFilter('travelProvided')} size="small" />
              )}
              {filterConfig.accommodationProvided && (
                <Chip label="Accommodation" onDelete={() => toggleBooleanFilter('accommodationProvided')} size="small" />
              )}
              {filterConfig.roles.map((role) => (
                <Chip key={role} label={role} onDelete={() => toggleFilter('roles', role)} size="small" />
              ))}
              {filterConfig.employmentTypes.map((type) => (
                <Chip key={type} label={type} onDelete={() => toggleFilter('employmentTypes', type)} size="small" />
              ))}
              {filterConfig.timeOfDay.map((time) => (
                <Chip key={time} label={time} onDelete={() => toggleFilter('timeOfDay', time)} size="small" />
              ))}
              <Button size="small" onClick={clearAllFilters} startIcon={<CloseIcon fontSize="small" />}>
                Clear all
              </Button>
            </Stack>
          )}

          {!hideFiltersAndSort && (
            <Stack direction="row" justifyContent="flex-end" alignItems="center" spacing={1} sx={{ mb: 2 }}>
              <SwapVertIcon fontSize="small" color="action" />
              <FormControl size="small" sx={{ minWidth: 160 }}>
                <InputLabel>Sort</InputLabel>
                <Select
                  label="Sort"
                  value={sortConfig.key}
                  onChange={(event) => handleSortChange(event.target.value as SortKey)}
                >
                  <MenuItem value="shiftDate">Shift date</MenuItem>
                  <MenuItem value="postedDate">Date posted</MenuItem>
                  <MenuItem value="rate">Rate</MenuItem>
                  <MenuItem value="distance">Distance</MenuItem>
                </Select>
              </FormControl>
              <IconButton
                aria-label="Toggle sort direction"
                onClick={() =>
                  setSortConfig((prev) => ({
                    ...prev,
                    direction: prev.direction === 'ascending' ? 'descending' : 'ascending',
                  }))
                }
              >
                {sortConfig.direction === 'ascending' ? (
                  <ArrowUpwardIcon fontSize="small" />
                ) : (
                  <ArrowDownwardIcon fontSize="small" />
                )}
              </IconButton>
            </Stack>
          )}

          {useServerFiltering && slotFilterMode === 'all' && typeof totalCount === 'number' && pageSize && onPageChange && (
            <Stack alignItems="center" sx={{ mt: 2, mb: 2 }}>
              <Pagination
                count={Math.max(1, Math.ceil(totalCount / pageSize))}
                page={page ?? 1}
                onChange={(_: React.ChangeEvent<unknown>, value: number) => onPageChange(value)}
              />
            </Stack>
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
            slotFilterMode={slotFilterMode}
            showAllSlots={showAllSlots}
            applyLabel={applyLabel}
            disableSlotActions={disableSlotActions}
            disableActionGuards={disableActionGuards}
          />
        </Box>
      </Box>

      {!hideFiltersAndSort && (
        <Drawer
          anchor="left"
          open={isSidebarOpen}
          onClose={() => setIsSidebarOpen(false)}
        >
          <Box sx={{ width: 320 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', p: 2 }}>
              <Typography variant="h6">Filters</Typography>
              <IconButton onClick={() => setIsSidebarOpen(false)}>
                <CloseIcon />
              </IconButton>
            </Box>
            <Divider />
            {sidebarContent}
          </Box>
        </Drawer>
      )}
    </Box>
  );
};

export default ShiftsBoard;
