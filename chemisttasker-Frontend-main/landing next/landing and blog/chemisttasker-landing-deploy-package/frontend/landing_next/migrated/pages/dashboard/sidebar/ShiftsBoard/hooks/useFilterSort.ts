import { useEffect, useMemo, useState } from 'react';
import dayjs from 'dayjs';
import { Shift } from '@chemisttasker/shared-core';
import { FilterConfig, RatePreference, SortKey, ShiftSlot } from '../types';
import { getStartHour, getSlotRate } from '../utils/rates';
import {
  getUpcomingSlotsForDisplay,
  getFirstSlot,
  getShiftAddress,
  getShiftCity,
  getShiftDistance,
  getShiftFlexibleTime,
  getShiftNegotiable,
  getShiftPharmacyName,
  getShiftRoleLabel,
  getShiftState,
  getShiftUrgent,
  normalizeRoleValue,
} from '../utils/shift';

const DEFAULT_FILTERS: FilterConfig = {
  city: [],
  roles: [],
  employmentTypes: [],
  minRate: 0,
  search: '',
  timeOfDay: [],
  dateRange: { start: '', end: '' },
  onlyUrgent: false,
  negotiableOnly: false,
  flexibleOnly: false,
  travelProvided: false,
  accommodationProvided: false,
  bulkShiftsOnly: false,
};

type UseFilterSortParams = {
  shifts: Shift[];
  filters?: FilterConfig;
  onFiltersChange?: (filters: FilterConfig) => void;
  useServerFiltering?: boolean;
  activeTab: 'browse' | 'saved';
  savedShiftIds: Set<number>;
  savedFeatureEnabled: boolean;
  pharmacistRatePref?: RatePreference;
  roleOptionsOverride?: string[];
};

export const useFilterSort = ({
  shifts,
  filters,
  onFiltersChange,
  useServerFiltering,
  activeTab,
  savedShiftIds,
  savedFeatureEnabled,
  pharmacistRatePref,
  roleOptionsOverride,
}: UseFilterSortParams) => {
  const [filterConfig, setFilterConfig] = useState<FilterConfig>(filters ?? DEFAULT_FILTERS);
  const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: 'ascending' | 'descending' }>({
    key: 'shiftDate',
    direction: 'ascending',
  });
  const [expandedStates, setExpandedStates] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (filters) {
      setFilterConfig(filters);
    }
  }, [filters]);

  const normalizedSelectedRoles = useMemo(
    () => new Set(filterConfig.roles.map((role) => normalizeRoleValue(role))),
    [filterConfig.roles]
  );

  const uniqueRoles = useMemo(() => {
    // Track by normalized value so casing/spacing differences don't duplicate options.
    const map = new Map<string, string>();
    shifts.forEach((shift) => {
      const label = getShiftRoleLabel(shift);
      const key = normalizeRoleValue(label);
      if (!label || !key) return;
      if (!map.has(key)) map.set(key, label);
    });
    return Array.from(map.values()).sort();
  }, [shifts]);

  const roleOptions = useMemo(() => {
    if (roleOptionsOverride && roleOptionsOverride.length > 0) {
      // Keep override ordering but drop duplicates/empties
      const seen = new Set<string>();
      return roleOptionsOverride.filter((role) => {
        if (!role) return false;
        if (seen.has(role)) return false;
        seen.add(role);
        return true;
      });
    }
    return uniqueRoles;
  }, [roleOptionsOverride, uniqueRoles]);

  const locationGroups = useMemo(() => {
    const groups: Record<string, Set<string>> = {};
    shifts.forEach((shift) => {
      const state = getShiftState(shift);
      const city = getShiftCity(shift);
      if (!state || !city) return;
      if (!groups[state]) groups[state] = new Set();
      groups[state].add(city);
    });
    return groups;
  }, [shifts]);

  const toggleFilter = (key: keyof FilterConfig, value: string) => {
    setFilterConfig((prev) => {
      const current = prev[key] as string[];
      if (current.includes(value)) {
        const next = { ...prev, [key]: current.filter((item) => item !== value) };
        onFiltersChange?.(next);
        return next;
      }
      const next = { ...prev, [key]: [...current, value] };
      onFiltersChange?.(next);
      return next;
    });
  };

  const toggleBooleanFilter = (key: keyof FilterConfig) => {
    setFilterConfig((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      onFiltersChange?.(next);
      return next;
    });
  };

  const toggleStateExpand = (state: string) => {
    setExpandedStates((prev) => ({ ...prev, [state]: !prev[state] }));
  };

  const toggleStateSelection = (cities: string[]) => {
    setFilterConfig((prev) => {
      const current = prev.city;
      const allSelected = cities.every((city) => current.includes(city));
      const nextCities = allSelected
        ? current.filter((city) => !cities.includes(city))
        : [...current, ...cities.filter((city) => !current.includes(city))];
      const next = { ...prev, city: nextCities };
      onFiltersChange?.(next);
      return next;
    });
  };

  const handleSortChange = (key: SortKey) => {
    setSortConfig((prev) => ({
      key,
      direction: prev.key === key && prev.direction === 'ascending' ? 'descending' : 'ascending',
    }));
  };

  const clearAllFilters = () => {
    const nextFilters = {
      city: [],
      roles: [],
      employmentTypes: [],
      minRate: 0,
      search: '',
      timeOfDay: [],
      dateRange: { start: '', end: '' },
      onlyUrgent: false,
      negotiableOnly: false,
      flexibleOnly: false,
      travelProvided: false,
      accommodationProvided: false,
      bulkShiftsOnly: false,
    };
    setFilterConfig(nextFilters);
    onFiltersChange?.(nextFilters);
  };

  const activeFilterCount =
    filterConfig.city.length +
    filterConfig.roles.length +
    filterConfig.employmentTypes.length +
    filterConfig.timeOfDay.length +
    (filterConfig.minRate > 0 ? 1 : 0) +
    (filterConfig.search ? 1 : 0) +
    (filterConfig.onlyUrgent ? 1 : 0) +
    (filterConfig.negotiableOnly ? 1 : 0) +
    (filterConfig.flexibleOnly ? 1 : 0) +
    (filterConfig.travelProvided ? 1 : 0) +
    (filterConfig.accommodationProvided ? 1 : 0) +
    (filterConfig.bulkShiftsOnly ? 1 : 0) +
    (filterConfig.dateRange.start || filterConfig.dateRange.end ? 1 : 0);

  const getSortRateValue = (shift: Shift) => {
    const slots = shift.slots ?? [];
    const slotMax = slots.length
      ? Math.max(
          ...slots
            .map((slot) => getSlotRate(slot, shift, pharmacistRatePref))
            .filter((rate) => Number.isFinite(rate))
        )
      : null;
    if (Number.isFinite(slotMax)) return Number(slotMax);

    if (shift.fixedRate != null && Number.isFinite(Number(shift.fixedRate))) {
      return Number(shift.fixedRate);
    }
    if (shift.maxHourlyRate != null && Number.isFinite(Number(shift.maxHourlyRate))) {
      return Number(shift.maxHourlyRate);
    }
    if (shift.minHourlyRate != null && Number.isFinite(Number(shift.minHourlyRate))) {
      return Number(shift.minHourlyRate);
    }
    if (shift.maxAnnualSalary != null && Number.isFinite(Number(shift.maxAnnualSalary))) {
      return Number(shift.maxAnnualSalary);
    }
    if (shift.minAnnualSalary != null && Number.isFinite(Number(shift.minAnnualSalary))) {
      return Number(shift.minAnnualSalary);
    }
    return Number.NEGATIVE_INFINITY;
  };

  const sortShifts = (list: Shift[]) => {
    const sorted = [...list];
    sorted.sort((a, b): number => {
      const aUrgent = getShiftUrgent(a) ? 0 : 1;
      const bUrgent = getShiftUrgent(b) ? 0 : 1;
      if (aUrgent !== bUrgent) return aUrgent - bUrgent;

      let aVal: number | string | null = null;
      let bVal: number | string | null = null;

      if (sortConfig.key === 'shiftDate') {
        aVal = getFirstSlot(a)?.date ?? '';
        bVal = getFirstSlot(b)?.date ?? '';
      } else if (sortConfig.key === 'postedDate') {
        aVal = a.createdAt ?? '';
        bVal = b.createdAt ?? '';
      } else if (sortConfig.key === 'rate') {
        aVal = getSortRateValue(a);
        bVal = getSortRateValue(b);
      } else if (sortConfig.key === 'distance') {
        aVal = getShiftDistance(a) ?? Number.POSITIVE_INFINITY;
        bVal = getShiftDistance(b) ?? Number.POSITIVE_INFINITY;
      }

      if (aVal == null && bVal == null) return 0;
      if (aVal == null) return 1;
      if (bVal == null) return -1;
      if (aVal < bVal) return sortConfig.direction === 'ascending' ? -1 : 1;
      if (aVal > bVal) return sortConfig.direction === 'ascending' ? 1 : -1;
      return 0;
    });
    if (sortConfig.key === 'rate') {
      console.debug('Rate sort sample', sorted.slice(0, 3).map((s) => ({
        id: s.id,
        rateValue: getSortRateValue(s),
      })));
    }
    return sorted;
  };

  const processedShifts = useMemo(() => {
    const applySort = (list: Shift[]) => sortShifts(list);

    if (useServerFiltering) {
      let serverResult = shifts;
      if (savedFeatureEnabled && activeTab === 'saved') {
        serverResult = serverResult.filter((shift) => savedShiftIds.has(shift.id));
      }
      serverResult = serverResult.filter((shift) => {
        const rawSlots = shift.slots ?? [];
        if (rawSlots.length === 0) return true;
        const slots = getUpcomingSlotsForDisplay(rawSlots);
        return slots.length > 0;
      });
      // Apply local min-rate filter even with server filtering to catch pharmacist-provided zeros.
      if (filterConfig.minRate > 0) {
        serverResult = serverResult.filter((shift) => {
          const slots = getUpcomingSlotsForDisplay(shift.slots ?? []);
          const maxRate = Math.max(
            ...(slots || [])
              .map((slot) => getSlotRate(slot, shift, pharmacistRatePref))
              .filter((rate) => Number.isFinite(rate))
          );
          return Number.isFinite(maxRate) && maxRate >= filterConfig.minRate;
        });
      }
      return applySort(serverResult);
    }

    let result = [...shifts];
    if (savedFeatureEnabled && activeTab === 'saved') {
      result = result.filter((shift) => savedShiftIds.has(shift.id));
    }

    result = result.filter((shift) => {
      const slots = getUpcomingSlotsForDisplay(shift.slots ?? []);
      const hasOverlap = (predicate: (slot: ShiftSlot) => boolean) => slots.some(predicate);
      if ((shift.slots ?? []).length > 0 && slots.length === 0) return false;

      if (filterConfig.onlyUrgent && !getShiftUrgent(shift)) return false;
      if (filterConfig.negotiableOnly && !getShiftNegotiable(shift)) return false;
      if (filterConfig.flexibleOnly && !getShiftFlexibleTime(shift)) return false;
      if (filterConfig.travelProvided && !shift.hasTravel) return false;
      if (filterConfig.accommodationProvided && !shift.hasAccommodation) return false;
      if (filterConfig.bulkShiftsOnly && slots.length < 5) return false;
      if (filterConfig.city.length > 0 && !filterConfig.city.includes(getShiftCity(shift))) return false;
      if (filterConfig.roles.length > 0) {
        const roleKey = normalizeRoleValue(getShiftRoleLabel(shift));
        if (!normalizedSelectedRoles.has(roleKey)) return false;
      }
      if (filterConfig.employmentTypes.length > 0) {
        const employmentType = (shift.employmentType ?? '').toString();
        if (!filterConfig.employmentTypes.includes(employmentType)) return false;
      }

      if (filterConfig.timeOfDay.length > 0) {
        const matchesTime = hasOverlap((slot) => {
          const hour = getStartHour(slot);
          if (hour == null) return false;
          const matchesMorning = filterConfig.timeOfDay.includes('morning') && hour < 12;
          const matchesAfternoon = filterConfig.timeOfDay.includes('afternoon') && hour >= 12 && hour < 17;
          const matchesEvening = filterConfig.timeOfDay.includes('evening') && hour >= 17;
          return matchesMorning || matchesAfternoon || matchesEvening;
        });
        if (!matchesTime) return false;
      }

      if (filterConfig.dateRange.start || filterConfig.dateRange.end) {
        const startFilter = filterConfig.dateRange.start
          ? dayjs(filterConfig.dateRange.start).startOf('day')
          : dayjs('1970-01-01');
        const endFilter = filterConfig.dateRange.end
          ? dayjs(filterConfig.dateRange.end).endOf('day')
          : dayjs('2100-01-01');
        const matchesDate = hasOverlap((slot) => {
          const slotDate = dayjs(slot.date);
          return (
            slotDate.isSame(startFilter) ||
            slotDate.isSame(endFilter) ||
            (slotDate.isAfter(startFilter) && slotDate.isBefore(endFilter))
          );
        });
        if (!matchesDate) return false;
      }

      if (filterConfig.minRate > 0) {
        const maxRate = Math.max(
          ...(slots || [])
            .map((slot) => getSlotRate(slot, shift, pharmacistRatePref))
            .filter((rate) => Number.isFinite(rate))
        );
        if (!Number.isFinite(maxRate) || maxRate < filterConfig.minRate) return false;
      }

      if (filterConfig.search) {
        const search = filterConfig.search.toLowerCase();
        const matches =
          getShiftPharmacyName(shift).toLowerCase().includes(search) ||
          getShiftAddress(shift).toLowerCase().includes(search) ||
          getShiftRoleLabel(shift).toLowerCase().includes(search);
        if (!matches) return false;
      }

      return true;
    });

    return applySort(result);
  }, [
    shifts,
    activeTab,
    savedShiftIds,
    filterConfig,
    sortConfig,
    pharmacistRatePref,
    useServerFiltering,
    savedFeatureEnabled,
    normalizedSelectedRoles,
  ]);

  return {
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
  };
};
