import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Drawer,
  FormControl,
  FormControlLabel,
  GlobalStyles,
  IconButton,
  InputAdornment,
  InputLabel,
  MenuItem,
  Paper,
  Pagination,
  Select,
  Stack,
  TextField,
  Typography,
  Rating,
  useMediaQuery,
  CircularProgress,
} from '@mui/material';
import Grid from '@mui/material/Grid';
import {
  AccessTime as AccessTimeIcon,
  AttachMoney as AttachMoneyIcon,
  Bolt as BoltIcon,
  CalendarToday as CalendarTodayIcon,
  ChatBubbleOutline as ChatBubbleOutlineIcon,
  CheckCircleOutline as CheckCircleOutlineIcon,
  Close as CloseIcon,
  DateRange as DateRangeIcon,
  DarkMode as DarkModeIcon,
  ErrorOutline as ErrorOutlineIcon,
  ExpandLess as ExpandLessIcon,
  ExpandMore as ExpandMoreIcon,
  Favorite as FavoriteIcon,
  FilterList as FilterListIcon,
  Flight as FlightIcon,
  Hotel as HotelIcon,
  Layers as LayersIcon,
  Paid as PaidIcon,
  Place as PlaceIcon,
  Search as SearchIcon,
  SwapVert as SwapVertIcon,
  Tune as TuneIcon,
  WbSunny as WbSunnyIcon,
  WbTwilight as WbTwilightIcon,
  WorkOutline as WorkOutlineIcon,
  ArrowUpward as ArrowUpwardIcon,
  ArrowDownward as ArrowDownwardIcon,
} from '@mui/icons-material';
import dayjs from 'dayjs';
import {
  Shift,
  ShiftCounterOfferPayload,
  ShiftCounterOfferSlotPayload,
  storageGetItem,
  storageRemoveItem,
  storageSetItem,
  getPharmacistDashboard,
  getOnboardingDetail, // ensure rate_preference fallback using existing onboarding API
  calculateShiftRates,
  fetchShiftCounterOffersService,
} from '@chemisttasker/shared-core';
import { Autocomplete, useJsApiLoader } from '@react-google-maps/api';
import apiClient from '../../utils/apiClient';
import { API_ENDPOINTS } from '../../constants/api';
import { useAuth } from '../../contexts/AuthContext';

const SAVED_STORAGE_KEY = 'saved_shift_ids';
const APPLIED_STORAGE_KEY = 'applied_shift_ids';
const APPLIED_SLOT_STORAGE_KEY = 'applied_slot_ids';
const REJECTED_SHIFT_STORAGE_KEY = 'rejected_shift_ids';
const REJECTED_SLOT_STORAGE_KEY = 'rejected_slot_ids';
const COUNTER_OFFER_STORAGE_KEY = 'counter_offer_map';

type ShiftSlot = NonNullable<Shift['slots']>[number];

type CounterOfferFormSlot = {
  slotId?: number;
  dateLabel: string;
  dateValue?: string;
  startTime: string;
  endTime: string;
  rate: string;
};
type TravelLocation = {
  streetAddress: string;
  suburb: string;
  state: string;
  postcode: string;
  googlePlaceId: string;
  latitude: number | null;
  longitude: number | null;
};
// Local extension to include slotDate until upstream package type publishes it.
type ShiftCounterOfferSlotPayloadWithDate = ShiftCounterOfferSlotPayload & { slotDate?: string };
type CounterOfferTrack = {
  slots: Record<number, { rate: string; start: string; end: string }>;
  message?: string;
  summary: string;
};

type ShiftsBoardProps = {
  title: string;
  shifts: Shift[];
  loading?: boolean;
  onApplyAll: (shift: Shift) => Promise<void> | void;
  onApplySlot: (shift: Shift, slotId: number) => Promise<void> | void;
  onSubmitCounterOffer?: (payload: ShiftCounterOfferPayload) => Promise<void> | void;
  onRejectShift?: (shift: Shift) => Promise<void> | void;
  onRejectSlot?: (shift: Shift, slotId: number) => Promise<void> | void;
  rejectActionGuard?: (shift: Shift) => boolean;
  useServerFiltering?: boolean;
  onFiltersChange?: (filters: FilterConfig) => void;
  filters?: FilterConfig;
  onRefresh?: () => Promise<void> | void;
  totalCount?: number;
  page?: number;
  pageSize?: number;
  onPageChange?: (page: number) => void;
  savedShiftIds?: number[];
  onToggleSave?: (shiftId: number) => Promise<void> | void;
  initialAppliedShiftIds?: number[];
  initialAppliedSlotIds?: number[];
  initialRejectedShiftIds?: number[];
  initialRejectedSlotIds?: number[];
  enableSaved?: boolean;
  hideSaveToggle?: boolean;
  readOnlyActions?: boolean;
  disableLocalPersistence?: boolean;
  hideCounterOffer?: boolean;
  hideFiltersAndSort?: boolean;
  hideTabs?: boolean;
  activeTabOverride?: 'browse' | 'saved';
  onActiveTabChange?: (tab: 'browse' | 'saved') => void;
  roleOptionsOverride?: string[];
};

type SortKey = 'shiftDate' | 'postedDate' | 'rate' | 'distance';

type FilterConfig = {
  city: string[];
  roles: string[];
  employmentTypes: string[];
  minRate: number;
  search: string;
  timeOfDay: Array<'morning' | 'afternoon' | 'evening'>;
  dateRange: { start: string; end: string };
  onlyUrgent: boolean;
  negotiableOnly: boolean;
  flexibleOnly: boolean;
  travelProvided: boolean;
  accommodationProvided: boolean;
  bulkShiftsOnly: boolean;
};

const formatDateShort = (value?: string | null) =>
  value ? dayjs(value).format('ddd, D MMM') : '';

const formatDateLong = (value?: string | null) =>
  value ? dayjs(value).format('dddd, D MMMM') : '';

const formatTime = (value?: string | null) =>
  value ? dayjs(`1970-01-01T${value}`).format('HH:mm') : '';

const EMPTY_TRAVEL_LOCATION: TravelLocation = {
  streetAddress: '',
  suburb: '',
  state: '',
  postcode: '',
  googlePlaceId: '',
  latitude: null,
  longitude: null,
};

const GOOGLE_LIBRARIES = ['places'] as Array<'places'>;
const COUNTER_OFFER_TRAVEL_AUTOCOMPLETE_ID = 'counter-offer-travel-autocomplete';

const parseLocationNumber = (value: any) => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const normalizeOnboardingLocation = (raw: any): TravelLocation => {
  const source = raw?.data ?? raw ?? {};
  return {
    streetAddress: source.street_address ?? source.streetAddress ?? '',
    suburb: source.suburb ?? '',
    state: source.state ?? '',
    postcode: source.postcode ?? '',
    googlePlaceId: source.google_place_id ?? source.googlePlaceId ?? '',
    latitude: parseLocationNumber(source.latitude),
    longitude: parseLocationNumber(source.longitude),
  };
};

const formatTravelLocation = (location: TravelLocation) => {
  const street = location.streetAddress.trim();
  const suburb = location.suburb.trim();
  const state = location.state.trim();
  const postcode = location.postcode.trim();
  const cityLine = [suburb, state, postcode].filter(Boolean).join(' ');
  const parts = [street, cityLine].filter(Boolean);
  return parts.join(', ');
};

const buildCounterOfferMessage = (
  message: string,
  travelRequested: boolean,
  location: TravelLocation
) => {
  const base = (message ?? '').trim();
  if (!travelRequested) return base;
  const travelLine = formatTravelLocation(location);
  if (!travelLine) return base;
  const travelMessage = `Traveling from: ${travelLine}`;
  if (base.includes(travelMessage)) return base;
  return base ? `${base}\n\n${travelMessage}` : travelMessage;
};

type RatePreference = {
  weekday?: string | number | null;
  saturday?: string | number | null;
  sunday?: string | number | null;
  public_holiday?: string | number | null;
  early_morning?: string | number | null;
  late_night?: string | number | null;
  early_morning_same_as_day?: boolean;
  late_night_same_as_day?: boolean;
};

const getPharmacistProvidedRate = (slot: ShiftSlot, ratePref?: RatePreference) => {
  if (!ratePref) return null;
  const dayjsDate = slot.date ? dayjs(slot.date) : null;
  const hour = getStartHour(slot);
  const isSunday = dayjsDate ? dayjsDate.day() === 0 : false;
  const isSaturday = dayjsDate ? dayjsDate.day() === 6 : false;
  const isEarly = hour != null && hour < 6;
  const isLate = hour != null && hour >= 20;

  // Early morning override
  if (isEarly && ratePref.early_morning && ratePref.early_morning_same_as_day === false) {
    return Number(ratePref.early_morning);
  }
  // Late night override
  if (isLate && ratePref.late_night && ratePref.late_night_same_as_day === false) {
    return Number(ratePref.late_night);
  }

  if (isSunday && ratePref.sunday) return Number(ratePref.sunday);
  if (isSaturday && ratePref.saturday) return Number(ratePref.saturday);
  if (ratePref.weekday) return Number(ratePref.weekday);
  if (ratePref.public_holiday) return Number(ratePref.public_holiday);
  if (isEarly && ratePref.early_morning) return Number(ratePref.early_morning);
  if (isLate && ratePref.late_night) return Number(ratePref.late_night);
  return null;
};

const getSlotRate = (slot: ShiftSlot, shift: Shift, ratePref?: RatePreference) => {
  const slotRateNum = slot?.rate != null && slot.rate !== '' ? Number(slot.rate) : null;
  if (slotRateNum != null && Number.isFinite(slotRateNum) && slotRateNum > 0) return slotRateNum;

  const fixedRateNum = shift.fixedRate != null ? Number(shift.fixedRate) : null;
  if (fixedRateNum != null && Number.isFinite(fixedRateNum) && fixedRateNum > 0) return fixedRateNum;

  if (shift.rateType === 'PHARMACIST_PROVIDED') {
    const fromPref = getPharmacistProvidedRate(slot, ratePref);
    if (fromPref != null) return fromPref;
    if (shift.minHourlyRate != null) return Number(shift.minHourlyRate);
    if (shift.maxHourlyRate != null) return Number(shift.maxHourlyRate);
  }
  return 0;
};

const getStartHour = (slot: ShiftSlot) => {
  if (slot.startHour != null) return Number(slot.startHour);
  if (!slot.startTime) return null;
  return Number(slot.startTime.split(':')[0]);
};

const getShiftRoleLabel = (shift: Shift) => shift.roleLabel ?? shift.roleNeeded ?? 'Role';
const normalizeRoleValue = (value?: string | null) => (value ?? '').toString().trim().toLowerCase();
const getShiftAddress = (shift: Shift) => shift.uiAddressLine ?? '';
const getShiftCity = (shift: Shift) => shift.uiLocationCity ?? '';
const getShiftState = (shift: Shift) => shift.uiLocationState ?? '';
// Decide if rate can be negotiated in counter offer.
// Explicit override from uiIsNegotiable when provided, otherwise FLEXIBLE or PHARMACIST_PROVIDED allow negotiation.
const getShiftNegotiable = (shift: Shift) => {
  if (shift.rateType === 'PHARMACIST_PROVIDED') return true;
  if (shift.uiIsNegotiable !== undefined && shift.uiIsNegotiable !== null) {
    return Boolean(shift.uiIsNegotiable);
  }
  return shift.rateType === 'FLEXIBLE';
};
const getShiftFlexibleTime = (shift: Shift) => Boolean(shift.uiIsFlexibleTime ?? shift.flexibleTiming);
const getShiftUrgent = (shift: Shift) => Boolean(shift.uiIsUrgent ?? shift.isUrgent);
const getShiftAllowPartial = (shift: Shift) => Boolean(shift.uiAllowPartial ?? !shift.singleUserOnly);
const getShiftDistance = (shift: Shift) => {
  const value = shift.uiDistanceKm;
  return typeof value === 'number' ? value : null;
};
const getShiftPharmacyName = (shift: Shift) => {
  const pharmacy = shift.pharmacyDetail;
  if (shift.postAnonymously) {
    const suburb = shift.uiLocationCity || pharmacy?.suburb;
    return suburb ? `Shift in ${suburb}` : 'Anonymous Pharmacy';
  }
  return pharmacy?.name ?? 'Pharmacy';
};
const getShiftPharmacyId = (shift: Shift) => {
  return (
    (shift as any)?.pharmacyDetail?.id ??
    (shift as any)?.pharmacy_detail?.id ??
    (shift as any)?.pharmacy?.id ??
    null
  );
};
const getFirstSlot = (shift: Shift) => shift.slots?.[0];
const formatCurrency = (value: number) => {
  if (!Number.isFinite(value)) return 'N/A';
  return value.toLocaleString('en-AU', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
};

const getRateSummary = (shift: Shift) => {
  const isFullOrPartTime = ['FULL_TIME', 'PART_TIME'].includes(shift.employmentType ?? '');
  const minAnnual = shift.minAnnualSalary != null ? Number(shift.minAnnualSalary) : null;
  const maxAnnual = shift.maxAnnualSalary != null ? Number(shift.maxAnnualSalary) : null;
  const minHourly = shift.minHourlyRate != null ? Number(shift.minHourlyRate) : null;
  const maxHourly = shift.maxHourlyRate != null ? Number(shift.maxHourlyRate) : null;
  const slotRates = (shift.slots ?? [])
    .map((slot) => getSlotRate(slot, shift))
    .filter((rate) => Number.isFinite(rate) && rate > 0);

  if (isFullOrPartTime) {
    if (minAnnual || maxAnnual) {
      const display = minAnnual && maxAnnual
        ? `${formatCurrency(minAnnual)} - ${formatCurrency(maxAnnual)}`
        : `${formatCurrency(minAnnual ?? maxAnnual ?? 0)}`;
      return { display, unitLabel: 'Package' };
    }
    if (minHourly || maxHourly) {
      const display = minHourly && maxHourly
        ? `${formatCurrency(minHourly)} - ${formatCurrency(maxHourly)}`
        : `${formatCurrency(minHourly ?? maxHourly ?? 0)}`;
      return { display, unitLabel: '/hr' };
    }
  }

  // If slots carry rates (even when a fixedRate exists), surface the min/max from slots for clarity.
  if (slotRates.length > 0) {
    const minRate = Math.min(...slotRates);
    const maxRate = Math.max(...slotRates);
    const display = minRate === maxRate ? `${formatCurrency(minRate)}` : `${formatCurrency(minRate)} - ${formatCurrency(maxRate)}`;
    return { display, unitLabel: '/hr' };
  }

  if (shift.fixedRate != null) {
    return { display: formatCurrency(Number(shift.fixedRate)), unitLabel: '/hr' };
  }

  if (shift.rateType === 'PHARMACIST_PROVIDED') {
    return { display: 'Pharmacist provided', unitLabel: '' };
  }

  if (slotRates.length === 0) return { display: 'N/A', unitLabel: '/hr' };
  const minRate = Math.min(...slotRates);
  const maxRate = Math.max(...slotRates);
  const display = minRate === maxRate ? `${formatCurrency(minRate)}` : `${formatCurrency(minRate)} - ${formatCurrency(maxRate)}`;
  return { display, unitLabel: '/hr' };
};

const getEmploymentLabel = (shift: Shift) => {
  if (shift.employmentType === 'FULL_TIME') return 'Full-time role';
  if (shift.employmentType === 'PART_TIME') return 'Part-time role';
  if (shift.employmentType === 'LOCUM') return 'Locum role';
  return 'Shift';
};

const expandRecurringSlotsForDisplay = (slots: ShiftSlot[]): ShiftSlot[] => {
  const expanded: ShiftSlot[] = [];
  slots.forEach((slot, idx) => {
    const recurringDays: number[] =
      (slot as any)?.recurringDays ??
      (slot as any)?.recurring_days ??
      [];
    const recurringEnd: string | null | undefined =
      (slot as any)?.recurringEndDate ??
      (slot as any)?.recurring_end_date;

    if (!slot.date || !recurringDays.length || !recurringEnd) {
      expanded.push(slot);
      return;
    }

    const start = dayjs(slot.date).startOf('day');
    const end = dayjs(recurringEnd).endOf('day');
    if (!start.isValid() || !end.isValid()) {
      expanded.push(slot);
      return;
    }

    let cursor = start.clone();
    let counter = 0;
    // Safety cap to avoid runaway expansion
    const MAX_OCCURRENCES = 90;
    while (cursor.isBefore(end) || cursor.isSame(end, 'day')) {
      const dayIdx = cursor.day(); // 0-6
      if (recurringDays.includes(dayIdx)) {
        const clone: any = { ...slot };
        clone.date = cursor.format('YYYY-MM-DD');
        clone.__displayKey = `${slot.id ?? idx}-${cursor.format('YYYYMMDD')}`;
        expanded.push(clone);
        counter += 1;
        if (counter >= MAX_OCCURRENCES) break;
      }
      cursor = cursor.add(1, 'day');
    }
  });
  return expanded.length ? expanded : slots;
};

const isSlotRecurring = (slot: ShiftSlot) => {
  const raw: any = slot;
  const isRecurring = raw?.isRecurring ?? raw?.is_recurring;
  const recurringDays = raw?.recurringDays ?? raw?.recurring_days ?? [];
  const recurringEnd = raw?.recurringEndDate ?? raw?.recurring_end_date;
  return Boolean(isRecurring || (Array.isArray(recurringDays) && recurringDays.length > 0 && recurringEnd));
};

const getExpandedSlotsForDisplay = (slots: ShiftSlot[]) => {
  if (!slots.length) return slots;
  if (!slots.some(isSlotRecurring)) return slots;
  return expandRecurringSlotsForDisplay(slots);
};

// Render offers as returned by API (one entry per slot/slot_date with proposed times/rate).
const expandOfferSlotsForDisplay = (offerSlots: any[], shiftSlots: ShiftSlot[]): any[] => {
  if (!Array.isArray(offerSlots) || offerSlots.length === 0) return [];
  const mapById = new Map<number, ShiftSlot>();
  shiftSlots.forEach((slot) => {
    if (slot?.id != null) mapById.set(slot.id, slot);
  });

  return offerSlots.map((entry, idx) => {
    const slotId = entry.slotId ?? entry.slot?.id ?? entry.id;
    const ref = slotId != null ? mapById.get(Number(slotId)) : null;
    const base = ref ?? entry.slot ?? {};
    const date = entry.slotDate ?? entry.slot_date ?? base.date ?? entry.date;
    const proposedStart =
      entry.proposedStartTime ??
      entry.proposed_start_time ??
      entry.start ??
      base.startTime ??
      (base as any)?.start_time;
    const proposedEnd =
      entry.proposedEndTime ??
      entry.proposed_end_time ??
      entry.end ??
      base.endTime ??
      (base as any)?.end_time;
    return {
      id: slotId ?? idx,
      date,
      startTime: proposedStart,
      endTime: proposedEnd,
      proposedStartTime: proposedStart,
      proposedEndTime: proposedEnd,
      proposedRate: entry.proposedRate ?? entry.proposed_rate,
      rate: base.rate,
      __displayKey: `${slotId ?? idx}-${date ?? idx}`,
    };
  });
};

const filterSections = {
  roles: 'Job Role',
  dateRange: 'Date Range',
  perks: 'Perks & Benefits',
  locations: 'Locations',
  timeOfDay: 'Time of Day',
  minRate: 'Min Rate',
  employment: 'Employment Type',
};

const ShiftsBoard: React.FC<ShiftsBoardProps> = ({
  title,
  shifts,
  loading,
  onApplyAll,
  onApplySlot,
  onSubmitCounterOffer,
  onRejectShift,
  onRejectSlot,
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
}) => {
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
        const dash: any = await getPharmacistDashboard();
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
  const [savedShiftIds, setSavedShiftIds] = useState<Set<number>>(new Set(savedShiftIdsProp ?? []));
  const [filterConfig, setFilterConfig] = useState<FilterConfig>(filters ?? {
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
  });
  const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: 'ascending' | 'descending' }>({
    key: 'shiftDate',
    direction: 'ascending',
  });
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [expandedStates, setExpandedStates] = useState<Record<string, boolean>>({});
  const [expandedCards, setExpandedCards] = useState<Record<number, boolean>>({});
  const [selectedSlotIds, setSelectedSlotIds] = useState<Record<number, Set<number>>>({});
  const [appliedShiftIds, setAppliedShiftIds] = useState<Set<number>>(new Set(initialAppliedShiftIds ?? []));
  const [appliedSlotIds, setAppliedSlotIds] = useState<Set<number>>(new Set(initialAppliedSlotIds ?? []));
  const [rejectedShiftIds, setRejectedShiftIds] = useState<Set<number>>(new Set(initialRejectedShiftIds ?? []));
  const [rejectedSlotIds, setRejectedSlotIds] = useState<Set<number>>(new Set(initialRejectedSlotIds ?? []));
  const [counterOffers, setCounterOffers] = useState<Record<number, CounterOfferTrack>>({});
  const [counterSubmitting, setCounterSubmitting] = useState(false);
  const persistCounterOffers = (data: Record<number, CounterOfferTrack>) =>
    storageSetItem(COUNTER_OFFER_STORAGE_KEY, JSON.stringify(data)).catch(() => null);
  const [reviewOfferShiftId, setReviewOfferShiftId] = useState<number | null>(null);
  const [reviewOffers, setReviewOffers] = useState<any[]>([]);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);
  const serverCounterSyncRef = useRef<Set<number>>(new Set());
  const travelAutocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);

  const [counterOfferOpen, setCounterOfferOpen] = useState(false);
  const [counterOfferShift, setCounterOfferShift] = useState<Shift | null>(null);
  const [counterOfferSlots, setCounterOfferSlots] = useState<CounterOfferFormSlot[]>([]);
  const [counterOfferMessage, setCounterOfferMessage] = useState('');
  const [counterOfferTravel, setCounterOfferTravel] = useState(false);
  const [counterOfferTravelLocation, setCounterOfferTravelLocation] = useState<TravelLocation>(EMPTY_TRAVEL_LOCATION);
  const [counterOfferError, setCounterOfferError] = useState<string | null>(null);
  const [pharmacyRatings, setPharmacyRatings] = useState<Record<number, { average: number; count: number }>>({});
  const ratingFetchRef = useRef<Set<number>>(new Set());
  const normalizedSelectedRoles = useMemo(
    () => new Set(filterConfig.roles.map((role) => normalizeRoleValue(role))),
    [filterConfig.roles]
  );
  const hasCounterOfferTravelLocation = useMemo(() => {
    const { googlePlaceId, streetAddress, suburb, state, postcode } = counterOfferTravelLocation;
    return Boolean(googlePlaceId || streetAddress || suburb || state || postcode);
  }, [counterOfferTravelLocation]);

  const savedLoadRef = useRef(false);
  const markersLoadRef = useRef(false);
  const appliedShiftPropKey = useMemo(() => (initialAppliedShiftIds ?? []).join(','), [initialAppliedShiftIds]);
  const appliedSlotPropKey = useMemo(() => (initialAppliedSlotIds ?? []).join(','), [initialAppliedSlotIds]);
  const rejectedShiftPropKey = useMemo(() => (initialRejectedShiftIds ?? []).join(','), [initialRejectedShiftIds]);
const rejectedSlotPropKey = useMemo(() => (initialRejectedSlotIds ?? []).join(','), [initialRejectedSlotIds]);

const normalizeCounterOffers = (raw: any): Record<number, CounterOfferTrack> => {
  if (!raw || typeof raw !== 'object') return {};
  const result: Record<number, CounterOfferTrack> = {};
  Object.entries(raw).forEach(([shiftIdStr, payload]) => {
    const shiftId = Number(shiftIdStr);
    if (!Number.isFinite(shiftId) || !payload || typeof payload !== 'object') return;
    const slotsObj = (payload as any).slots || {};
    const normalizedSlots: Record<number, { rate: string; start: string; end: string }> = {};
    Object.entries(slotsObj).forEach(([slotIdStr, info]) => {
      const slotId = Number(slotIdStr);
      if (!Number.isFinite(slotId) || !info) return;
      const rate = (info as any).rate ?? '';
      const start = (info as any).start ?? '';
      const end = (info as any).end ?? '';
      normalizedSlots[slotId] = { rate, start, end };
    });
    result[shiftId] = {
      slots: normalizedSlots,
      message: (payload as any).message ?? '',
      summary: (payload as any).summary ?? '',
    };
  });
  return result;
};

useEffect(() => {
  if (filters) {
    setFilterConfig(filters);
  }
}, [filters]);

  useEffect(() => {
    if (savedShiftIdsProp && savedFeatureEnabled) {
      setSavedShiftIds(new Set(savedShiftIdsProp));
      savedLoadRef.current = true;
    }
  }, [savedShiftIdsProp, savedFeatureEnabled]);

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

  // hydrate persisted markers
  useEffect(() => {
    if (markersLoadRef.current) return;
    markersLoadRef.current = true;
    (async () => {
      if (!disableLocalPersistence && savedFeatureEnabled && !savedShiftIdsProp && !savedLoadRef.current) {
        const saved = await storageGetItem(SAVED_STORAGE_KEY).catch(() => null);
        if (saved) {
          try {
            const parsed = JSON.parse(saved);
            if (Array.isArray(parsed)) {
              setSavedShiftIds(new Set(parsed.filter((id) => Number.isFinite(id))));
            }
          } catch {}
        }
        savedLoadRef.current = true;
      }
      if (!disableLocalPersistence) {
        try {
          const appliedShifts = await storageGetItem(APPLIED_STORAGE_KEY);
          if (appliedShifts) setAppliedShiftIds(new Set(JSON.parse(appliedShifts)));
        } catch {}
        try {
          const appliedSlots = await storageGetItem(APPLIED_SLOT_STORAGE_KEY);
          if (appliedSlots) setAppliedSlotIds(new Set(JSON.parse(appliedSlots)));
        } catch {}
        try {
          const rejShifts = await storageGetItem(REJECTED_SHIFT_STORAGE_KEY);
          if (rejShifts) setRejectedShiftIds(new Set(JSON.parse(rejShifts)));
        } catch {}
        try {
          const rejSlots = await storageGetItem(REJECTED_SLOT_STORAGE_KEY);
          if (rejSlots) setRejectedSlotIds(new Set(JSON.parse(rejSlots)));
        } catch {}
      }
      // Always hydrate counter offers so their badges survive refresh, even when local persistence is disabled elsewhere.
      try {
        const counters = await storageGetItem(COUNTER_OFFER_STORAGE_KEY);
        if (counters) {
          const normalized = normalizeCounterOffers(JSON.parse(counters));
          setCounterOffers(normalized);
          persistCounterOffers(normalized); // rewrite malformed payloads in normalized form
        }
      } catch {}
      setIsHydrated(true);
    })();
  }, [savedShiftIdsProp, savedFeatureEnabled, disableLocalPersistence]);

  // persist markers
  useEffect(() => {
    if (disableLocalPersistence || savedShiftIdsProp || !savedFeatureEnabled) return;
    const list = Array.from(savedShiftIds);
    if (list.length === 0) {
      storageRemoveItem(SAVED_STORAGE_KEY).catch(() => null);
    } else {
      storageSetItem(SAVED_STORAGE_KEY, JSON.stringify(list)).catch(() => null);
    }
  }, [savedShiftIds, savedShiftIdsProp]);

  // keep in sync with parent props (backend interests)
  useEffect(() => {
    setAppliedShiftIds(new Set(initialAppliedShiftIds ?? []));
  }, [appliedShiftPropKey]);
  useEffect(() => {
    setAppliedSlotIds(new Set(initialAppliedSlotIds ?? []));
  }, [appliedSlotPropKey]);
  useEffect(() => {
    setRejectedShiftIds(new Set(initialRejectedShiftIds ?? []));
  }, [rejectedShiftPropKey]);
  useEffect(() => {
    setRejectedSlotIds(new Set(initialRejectedSlotIds ?? []));
  }, [rejectedSlotPropKey]);

useEffect(() => {
  if (disableLocalPersistence) return;
  storageSetItem(APPLIED_STORAGE_KEY, JSON.stringify(Array.from(appliedShiftIds))).catch(() => null);
}, [appliedShiftIds, disableLocalPersistence]);
useEffect(() => {
  if (disableLocalPersistence) return;
  storageSetItem(APPLIED_SLOT_STORAGE_KEY, JSON.stringify(Array.from(appliedSlotIds))).catch(() => null);
}, [appliedSlotIds, disableLocalPersistence]);
useEffect(() => {
  if (disableLocalPersistence) return;
  storageSetItem(REJECTED_SHIFT_STORAGE_KEY, JSON.stringify(Array.from(rejectedShiftIds))).catch(() => null);
}, [rejectedShiftIds, disableLocalPersistence]);
useEffect(() => {
  if (disableLocalPersistence) return;
  storageSetItem(REJECTED_SLOT_STORAGE_KEY, JSON.stringify(Array.from(rejectedSlotIds))).catch(() => null);
}, [rejectedSlotIds, disableLocalPersistence]);
  useEffect(() => {
    if (!isHydrated) return;
    // Persist counter offers regardless of disableLocalPersistence so badges stay after refresh.
    persistCounterOffers(counterOffers);
  }, [counterOffers, isHydrated]);

  // Drop local caches for shifts that no longer exist in the latest list
  useEffect(() => {
    if (!isHydrated) return;
    const liveIds = new Set(shifts.map((s) => s.id));
    setAppliedShiftIds((prev) => new Set([...prev].filter((id) => liveIds.has(id))));
    setRejectedShiftIds((prev) => new Set([...prev].filter((id) => liveIds.has(id))));
    setSavedShiftIds((prev) => new Set([...prev].filter((id) => liveIds.has(id))));
    setCounterOffers((prev) => {
      const next: Record<number, CounterOfferTrack> = {};
      Object.entries(prev).forEach(([idStr, data]) => {
        const id = Number(idStr);
        if (liveIds.has(id)) {
          next[id] = data;
        }
      });
      persistCounterOffers(next);
      return next;
    });
  }, [shifts, isHydrated]);

  // Whenever shifts change (e.g., after server refetch), wipe any locally persisted state for IDs that disappeared.
  useEffect(() => {
    if (!isHydrated) return;
    const liveIds = new Set(shifts.map((s) => s.id));
    if (!disableLocalPersistence) {
      storageSetItem(APPLIED_STORAGE_KEY, JSON.stringify([...appliedShiftIds].filter((id) => liveIds.has(id)))).catch(() => null);
      storageSetItem(APPLIED_SLOT_STORAGE_KEY, JSON.stringify([...appliedSlotIds].filter((id) => liveIds.has(id)))).catch(() => null);
      storageSetItem(REJECTED_SHIFT_STORAGE_KEY, JSON.stringify([...rejectedShiftIds].filter((id) => liveIds.has(id)))).catch(() => null);
      storageSetItem(REJECTED_SLOT_STORAGE_KEY, JSON.stringify([...rejectedSlotIds].filter((id) => liveIds.has(id)))).catch(() => null);
      const nextCounters: Record<number, CounterOfferTrack> = {};
      Object.entries(counterOffers).forEach(([idStr, data]) => {
        const id = Number(idStr);
        if (liveIds.has(id)) nextCounters[id] = data;
      });
      persistCounterOffers(nextCounters);
    }
  }, [shifts, isHydrated, disableLocalPersistence, appliedShiftIds, appliedSlotIds, rejectedShiftIds, rejectedSlotIds, counterOffers]);

// Fetch fresh offers when opening review dialog so we show full slot details and multiple offers.
useEffect(() => {
  const load = async () => {
    if (reviewOfferShiftId == null) {
      setReviewOffers([]);
      return;
    }
    setReviewOffers([]); // clear stale data while loading another shift
    setReviewLoading(true);
    try {
      const remote = await fetchShiftCounterOffersService(reviewOfferShiftId);
      let offers = Array.isArray(remote) ? remote : [];
      // Workers should only see their own offers; filter defensively.
      if (currentUserId != null) {
        offers = offers.filter((o: any) => o.user === currentUserId);
      }
      // Show latest first
      offers.sort((a: any, b: any) => {
        const aT = new Date(a.createdAt || a.created_at || a.updatedAt || a.updated_at || 0).getTime();
        const bT = new Date(b.createdAt || b.created_at || b.updatedAt || b.updated_at || 0).getTime();
        return bT - aT;
      });
      setReviewOffers(offers);
    } catch (err) {
      console.warn('Failed to load counter offers for review', err);
      setReviewOffers([]);
    } finally {
      setReviewLoading(false);
    }
  };
  load();
}, [reviewOfferShiftId]);

// Reconcile local counter offers with backend data to avoid stale badges when offers are removed server-side.
useEffect(() => {
  if (!isHydrated) return;
  const shiftIds = shifts.map((s) => s.id).filter((id) => Number.isFinite(id));
  const toFetch = shiftIds.filter((id) => !serverCounterSyncRef.current.has(id));
  if (toFetch.length === 0) return;

  const fetchCounters = async () => {
    const updates: Record<number, CounterOfferTrack> = {};
    for (const shiftId of toFetch) {
      try {
        const remote = await fetchShiftCounterOffersService(shiftId);
        const slotsMap: Record<number, { rate: string; start: string; end: string }> = {};
        (remote || []).forEach((offer: any) => {
          (offer.slots || []).forEach((slot: any) => {
            if (slot.slotId == null) return;
            slotsMap[slot.slotId] = {
              rate: slot.proposedRate != null ? String(slot.proposedRate) : '',
              start: slot.proposedStartTime || '',
              end: slot.proposedEndTime || '',
            };
          });
          updates[shiftId] = {
            slots: { ...slotsMap },
            message: offer.message ?? '',
            summary: (offer.slots || []).length > 0
              ? `Counter offer sent (${(offer.slots || []).length} slot${(offer.slots || []).length > 1 ? 's' : ''})`
              : 'Counter offer sent',
          };
        });
      } catch (err) {
        console.warn('Failed to fetch counter offers for shift', shiftId, err);
      } finally {
        serverCounterSyncRef.current.add(shiftId);
      }
    }

    setCounterOffers((prev) => {
      const next = { ...prev };
      // Remove entries for shifts we fetched that have no remote offers
      toFetch.forEach((id) => {
        if (!updates[id]) {
          delete next[id];
        }
      });
      // Apply fresh data
      Object.entries(updates).forEach(([idStr, data]) => {
        next[Number(idStr)] = data;
      });
      persistCounterOffers(next);
      return next;
    });
  };

  fetchCounters();
}, [shifts, isHydrated]);

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
      // Apply local min-rate filter even with server filtering to catch pharmacist-provided zeros.
      if (filterConfig.minRate > 0) {
        serverResult = serverResult.filter((shift) => {
          const slots = getExpandedSlotsForDisplay(shift.slots ?? []);
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
      const slots = getExpandedSlotsForDisplay(shift.slots ?? []);
      const hasOverlap = (predicate: (slot: ShiftSlot) => boolean) => slots.some(predicate);

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
  }, [shifts, activeTab, savedShiftIds, filterConfig, sortConfig, pharmacistRatePref, useServerFiltering, savedFeatureEnabled, normalizedSelectedRoles]);

  const openCounterOffer = async (shift: Shift, selectedSlots?: Set<number>) => {
    if (!onSubmitCounterOffer || hideCounterOffer) return;
    let ratePref = pharmacistRatePref;
    setCounterOfferTravelLocation(EMPTY_TRAVEL_LOCATION);
    if (auth?.user?.role?.toUpperCase() === 'PHARMACIST') {
      try {
        const onboarding: any = await getOnboardingDetail('pharmacist');
        const fromOnboarding =
          onboarding?.rate_preference ||
          onboarding?.ratePreference ||
          (onboarding?.data ? onboarding.data.rate_preference || onboarding.data.ratePreference : undefined);
        if (!ratePref && fromOnboarding) {
          ratePref = fromOnboarding;
          console.log('Counter offer fetched rate preference from onboarding', fromOnboarding);
        }
        setCounterOfferTravelLocation(normalizeOnboardingLocation(onboarding));
      } catch (err) {
        console.warn('Failed to fetch onboarding details on counter-offer open', err);
      }
    }
    const baseSlots = shift.slots ?? [];
    const normalizedSlots = getExpandedSlotsForDisplay(baseSlots as ShiftSlot[]);
    const slotIds = selectedSlots && selectedSlots.size > 0 ? selectedSlots : null;
    const slotsToUse = slotIds ? normalizedSlots.filter((slot) => slotIds.has(slot.id)) : normalizedSlots;

    const fallbackSlots: CounterOfferFormSlot[] =
      slotsToUse.length === 0
        ? [
            {
              slotId: undefined,
              dateLabel: shift.employmentType === 'FULL_TIME' ? 'Full-time schedule' : 'Part-time schedule',
              startTime: '',
              endTime: '',
              rate: '',
            },
          ]
        : [];

    setCounterOfferShift(shift);
    setCounterOfferMessage('');
    setCounterOfferTravel(false);
    setCounterOfferError(null);
    let calculatorRates: string[] | null = null;
    if (shift.rateType === 'PHARMACIST_PROVIDED' && ratePref) {
      try {
        const pharmacyId = (shift as any)?.pharmacyDetail?.id || (shift as any)?.pharmacy_detail?.id || (shift as any)?.pharmacy?.id;
        if (pharmacyId) {
          const payload = {
            pharmacyId,
            role: shift.roleNeeded || (shift as any).role_needed || (shift as any).roleLabel || 'PHARMACIST',
            employmentType: shift.employmentType || (shift as any).employment_type || 'LOCUM',
            rateType: shift.rateType || (shift as any).rate_type || 'PHARMACIST_PROVIDED',
            rate_weekday: ratePref.weekday,
            rate_saturday: ratePref.saturday,
            rate_sunday: ratePref.sunday,
            rate_public_holiday: ratePref.public_holiday,
            rate_early_morning: ratePref.early_morning,
            rate_late_night: ratePref.late_night,
            rate_early_morning_same_as_day: ratePref.early_morning_same_as_day,
            rate_late_night_same_as_day: ratePref.late_night_same_as_day,
            slots: slotsToUse.map((slot) => ({
              date: slot.date,
              startTime: (slot.startTime || '').slice(0, 5), // backend expects HH:MM
              endTime: (slot.endTime || '').slice(0, 5),
            })),
          };
          const calcResults: any[] = await calculateShiftRates(payload);
          if (Array.isArray(calcResults) && calcResults.length === slotsToUse.length) {
            calculatorRates = calcResults.map((r) => (r?.rate ? String(r.rate) : '0'));
            console.log('Counter offer calculator rates', calculatorRates);
          }
        }
      } catch (err) {
        console.warn('Counter offer calculateShiftRates failed', err);
      }
    }

    const mapped: CounterOfferFormSlot[] = slotsToUse.map((slot, idx) => {
      const derivedRate = calculatorRates
        ? Number(calculatorRates[idx] || 0)
        : getSlotRate(slot, shift, ratePref);
      console.log('Counter offer prefill', {
        slotId: slot.id,
        date: slot.date,
        start: slot.startTime,
        end: slot.endTime,
        rate_pref: ratePref,
        derivedRate,
      });
      return {
        slotId: slot.id,
        dateLabel: slot.date ? formatDateLong(slot.date) : `Slot ${slot.id ?? idx + 1}`,
        dateValue: slot.date,
        startTime: (slot.startTime || '').slice(0, 5),
        endTime: (slot.endTime || '').slice(0, 5),
        rate: derivedRate != null && Number.isFinite(derivedRate) ? String(derivedRate) : '',
      };
    });
    setCounterOfferSlots([...mapped, ...fallbackSlots]);
    setCounterOfferOpen(true);
  };

  const closeCounterOffer = () => {
    setCounterOfferOpen(false);
    if (counterOfferShift?.id != null) {
      clearSelection(counterOfferShift.id);
    }
    setCounterOfferShift(null);
    setCounterOfferSlots([]);
    setCounterOfferTravelLocation(EMPTY_TRAVEL_LOCATION);
    // Reload shifts on close to reflect any changes (e.g., new offer)
    onPageChange?.(page ?? 1);
  };

  const clearCounterOfferTravelLocation = () => {
    setCounterOfferTravelLocation(EMPTY_TRAVEL_LOCATION);
    const input = document.getElementById(COUNTER_OFFER_TRAVEL_AUTOCOMPLETE_ID) as HTMLInputElement | null;
    if (input) input.value = '';
  };

  const handleCounterOfferTravelPlaceChanged = () => {
    if (!travelAutocompleteRef.current) return;
    const place = travelAutocompleteRef.current.getPlace();
    if (!place || !place.address_components) return;

    let streetNumber = '';
    let route = '';
    let locality = '';
    let postalCode = '';
    let stateShort = '';

    place.address_components.forEach((component) => {
      const types = component.types;
      if (types.includes('street_number')) streetNumber = component.long_name;
      if (types.includes('route')) route = component.short_name;
      if (types.includes('locality')) locality = component.long_name;
      if (types.includes('postal_code')) postalCode = component.long_name;
      if (types.includes('administrative_area_level_1')) stateShort = component.short_name;
    });

    setCounterOfferTravelLocation({
      streetAddress: `${streetNumber} ${route}`.trim(),
      suburb: locality,
      postcode: postalCode,
      state: stateShort,
      googlePlaceId: place.place_id || '',
      latitude: place.geometry?.location ? place.geometry.location.lat() : null,
      longitude: place.geometry?.location ? place.geometry.location.lng() : null,
    });
  };

  const handleCounterSlotChange = (index: number, key: keyof CounterOfferFormSlot, value: string) => {
    setCounterOfferSlots((prev) =>
      prev.map((slot, idx) => (idx === index ? { ...slot, [key]: value } : slot))
    );
  };

  const handleSubmitCounterOffer = async () => {
    if (!counterOfferShift || !onSubmitCounterOffer) return;
    const canNegotiateRate = getShiftNegotiable(counterOfferShift);
    const messageToSend = buildCounterOfferMessage(
      counterOfferMessage,
      counterOfferTravel,
      counterOfferTravelLocation
    );
    const slotOfferMap: Record<number, { rate: string; start: string; end: string }> = {};
    const hasRealSlots = (counterOfferShift.slots?.length ?? 0) > 0;
    const slotsToSendRaw = hasRealSlots
      ? counterOfferSlots.filter((slot) => slot.slotId != null)
      : counterOfferSlots;
    // Send every occurrence we collected (per slot/date); backend guards duplicates.
    const slotsToSend = slotsToSendRaw;

    if (slotsToSend.length === 0) {
      setCounterOfferError('This shift has no slots to attach a counter offer. Please contact the poster.');
      return;
    }

    // Deduplicate (slotId, slotDate) pairs to avoid backend duplicate validation errors.
    const dedupedSlots: CounterOfferFormSlot[] = [];
    const seenPairs = new Set<string>();
    slotsToSend.forEach((slot) => {
      const normalizedDate = slot.dateValue ? dayjs(slot.dateValue).format('YYYY-MM-DD') : '';
      const key = `${slot.slotId ?? 'none'}|${normalizedDate}`;
      if (seenPairs.has(key)) return;
      seenPairs.add(key);
      dedupedSlots.push({ ...slot, dateValue: normalizedDate || undefined });
    });

    if (slotsToSend.some((s) => !s.startTime || !s.endTime)) {
      setCounterOfferError('Start and end time are required.');
      return;
    }
    const payload: ShiftCounterOfferPayload = {
      shiftId: counterOfferShift.id,
      message: messageToSend,
      requestTravel: counterOfferTravel,
      slots: dedupedSlots.map(
        (slot): ShiftCounterOfferSlotPayloadWithDate => ({
          slotId: slot.slotId != null ? (slot.slotId as number) : undefined,
          // Normalize to an ISO date string so recurring instances do not collapse into duplicates.
          slotDate: slot.dateValue ? dayjs(slot.dateValue).format('YYYY-MM-DD') : undefined,
          proposedStartTime: slot.startTime,
          proposedEndTime: slot.endTime,
          proposedRate: canNegotiateRate && slot.rate ? Number(slot.rate) : null,
        })
      ),
    };
    console.log('[ShiftsBoard] submit counter offer payload', payload);

    setCounterSubmitting(true);
    try {
      await onSubmitCounterOffer(payload);
    } catch (err) {
      setCounterSubmitting(false);
      throw err;
    }

    slotsToSend.forEach((slot) => {
      if (slot.slotId != null) {
        slotOfferMap[slot.slotId] = { rate: slot.rate, start: slot.startTime, end: slot.endTime };
      }
    });
    const sentCount = Object.keys(slotOfferMap).length;
    const updated = {
      ...counterOffers,
      [counterOfferShift.id]: {
        slots: slotOfferMap,
        message: messageToSend,
        summary: sentCount > 0 ? `Counter offer sent (${sentCount} slot${sentCount > 1 ? 's' : ''})` : 'Counter offer sent',
      },
    };
    setCounterOffers(updated);
    // Persist immediately so a full refresh keeps the slots locked and reviewable.
    persistCounterOffers(updated);

    // Treat countered slots as applied locally so they stay disabled and show chips immediately.
    // The backend now creates ShiftInterest records from the counter-offer endpoint, so we don't call onApplySlot/onApplyAll here to avoid duplicate interest emails.
    const targetedSlotIds = slotsToSend
      .map((slot) => slot.slotId)
      .filter((id): id is number => id != null);
    if (targetedSlotIds.length > 0) {
      setAppliedSlotIds((prev) => {
        const next = new Set(prev);
        targetedSlotIds.forEach((id) => next.add(id));
        return next;
      });
    } else {
      setAppliedShiftIds((prev) => {
        const next = new Set(prev);
        next.add(counterOfferShift.id);
        return next;
      });
    }

    closeCounterOffer();
    await refreshShifts();
    setCounterSubmitting(false);
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

  const toggleExpandedCard = (shiftId: number) => {
    setExpandedCards((prev) => ({ ...prev, [shiftId]: !prev[shiftId] }));
  };

  const renderFilterSection = (title: string, content: React.ReactNode, isOpen = true, onToggle?: () => void) => (
    <Box sx={{ borderBottom: '1px solid', borderColor: 'grey.100', pb: 2.5, mb: 2.5 }}>
      <Button
        onClick={onToggle}
        fullWidth
        sx={{
          justifyContent: 'space-between',
          textTransform: 'none',
          color: 'text.secondary',
          fontWeight: 700,
          fontSize: 12,
          letterSpacing: 1,
        }}
      >
        {title}
        {isOpen ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
      </Button>
      {isOpen && <Box>{content}</Box>}
    </Box>
  );

  const sidebarContent = (
    <Box sx={{ px: 2.5, py: 2 }}>
      <TextField
        fullWidth
        size="small"
        placeholder="Search pharmacy, role..."
        value={filterConfig.search}
        onChange={(event) => setFilterConfig((prev) => ({ ...prev, search: event.target.value }))}
        InputProps={{
          startAdornment: (
            <InputAdornment position="start">
              <SearchIcon fontSize="small" />
            </InputAdornment>
          ),
        }}
        sx={{ mb: 2 }}
      />

      <Box sx={{ mb: 2 }}>
        <FormControlLabel
          control={
            <Checkbox
              checked={filterConfig.onlyUrgent}
              onChange={() => toggleBooleanFilter('onlyUrgent')}
              icon={<BoltIcon fontSize="small" />}
              checkedIcon={<BoltIcon fontSize="small" />}
            />
          }
          label="Urgent only"
        />
      </Box>

      {renderFilterSection(
        filterSections.roles,
        <Stack spacing={1}>
          {roleOptions.map((role) => (
            <FormControlLabel
              key={role}
              control={
                <Checkbox
                  checked={filterConfig.roles.includes(role)}
                  onChange={() => toggleFilter('roles', role)}
                />
              }
              label={role}
            />
          ))}
        </Stack>
      )}

      {renderFilterSection(
        filterSections.dateRange,
        <Stack spacing={1.5}>
          <TextField
            type="date"
            label="From"
            size="small"
            InputLabelProps={{ shrink: true }}
            value={filterConfig.dateRange.start}
            onChange={(event) =>
              setFilterConfig((prev) => ({
                ...prev,
                dateRange: { ...prev.dateRange, start: event.target.value },
              }))
            }
          />
          <TextField
            type="date"
            label="To"
            size="small"
            InputLabelProps={{ shrink: true }}
            value={filterConfig.dateRange.end}
            onChange={(event) =>
              setFilterConfig((prev) => ({
                ...prev,
                dateRange: { ...prev.dateRange, end: event.target.value },
              }))
            }
          />
        </Stack>
      )}

      {renderFilterSection(
        filterSections.perks,
        <Stack spacing={1}>
          <FormControlLabel
            control={
              <Checkbox
                checked={filterConfig.bulkShiftsOnly}
                onChange={() => toggleBooleanFilter('bulkShiftsOnly')}
              />
            }
            label={
              <Stack direction="row" spacing={1} alignItems="center">
                <DateRangeIcon fontSize="small" />
                <span>Bulk shifts (1 week+)</span>
              </Stack>
            }
          />
          <FormControlLabel
            control={
              <Checkbox
                checked={filterConfig.negotiableOnly}
                onChange={() => toggleBooleanFilter('negotiableOnly')}
              />
            }
            label={
              <Stack direction="row" spacing={1} alignItems="center">
                <PaidIcon fontSize="small" />
                <span>Negotiable rate</span>
              </Stack>
            }
          />
          <FormControlLabel
            control={
              <Checkbox
                checked={filterConfig.flexibleOnly}
                onChange={() => toggleBooleanFilter('flexibleOnly')}
              />
            }
            label={
              <Stack direction="row" spacing={1} alignItems="center">
                <SwapVertIcon fontSize="small" />
                <span>Flexible hours</span>
              </Stack>
            }
          />
          <FormControlLabel
            control={
              <Checkbox
                checked={filterConfig.travelProvided}
                onChange={() => toggleBooleanFilter('travelProvided')}
              />
            }
            label={
              <Stack direction="row" spacing={1} alignItems="center">
                <FlightIcon fontSize="small" />
                <span>Travel paid</span>
              </Stack>
            }
          />
          <FormControlLabel
            control={
              <Checkbox
                checked={filterConfig.accommodationProvided}
                onChange={() => toggleBooleanFilter('accommodationProvided')}
              />
            }
            label={
              <Stack direction="row" spacing={1} alignItems="center">
                <HotelIcon fontSize="small" />
                <span>Accommodation</span>
              </Stack>
            }
          />
        </Stack>
      )}

      {renderFilterSection(
        filterSections.employment,
        <Stack spacing={1}>
          {[
            { id: 'FULL_TIME', label: 'Full-time' },
            { id: 'PART_TIME', label: 'Part-time' },
            { id: 'LOCUM', label: 'Locum' },
          ].map((item) => (
            <FormControlLabel
              key={item.id}
              control={
                <Checkbox
                  checked={filterConfig.employmentTypes.includes(item.id)}
                  onChange={() => toggleFilter('employmentTypes', item.id)}
                />
              }
              label={item.label}
            />
          ))}
        </Stack>
      )}

      {renderFilterSection(
        filterSections.locations,
        <Stack spacing={1}>
          {Object.entries(locationGroups).map(([state, citiesSet]) => {
            const cities = Array.from(citiesSet).sort();
            const isExpanded = !!expandedStates[state];
            const allSelected = cities.every((city) => filterConfig.city.includes(city));
            const someSelected = cities.some((city) => filterConfig.city.includes(city));

            return (
              <Box key={state} sx={{ borderBottom: '1px solid', borderColor: 'grey.100', pb: 1 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={allSelected}
                        indeterminate={someSelected && !allSelected}
                onChange={() => toggleStateSelection(cities)}
                      />
                    }
                    label={<Typography fontWeight={700}>{state}</Typography>}
                  />
                  <IconButton size="small" onClick={() => toggleStateExpand(state)}>
                    {isExpanded ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
                  </IconButton>
                </Box>
                {isExpanded && (
                  <Stack spacing={0.5} sx={{ pl: 3 }}>
                    {cities.map((city) => (
                      <FormControlLabel
                        key={city}
                        control={
                          <Checkbox
                            checked={filterConfig.city.includes(city)}
                            onChange={() => toggleFilter('city', city)}
                          />
                        }
                        label={city}
                      />
                    ))}
                  </Stack>
                )}
              </Box>
            );
          })}
        </Stack>
      )}

      {renderFilterSection(
        filterSections.timeOfDay,
        <Grid container spacing={1}>
          {[
            { id: 'morning', label: 'Morning', icon: <WbSunnyIcon fontSize="small" /> },
            { id: 'afternoon', label: 'Afternoon', icon: <WbTwilightIcon fontSize="small" /> },
            { id: 'evening', label: 'Evening', icon: <DarkModeIcon fontSize="small" /> },
          ].map((entry) => {
            const active = filterConfig.timeOfDay.includes(entry.id as 'morning' | 'afternoon' | 'evening');
            return (
              <Grid key={entry.id} size={{ xs: 4 }}>
                <Button
                  variant={active ? 'contained' : 'outlined'}
                  onClick={() => toggleFilter('timeOfDay', entry.id)}
                  fullWidth
                  sx={{ textTransform: 'none', gap: 1 }}
                >
                  {entry.icon}
                  {entry.label}
                </Button>
              </Grid>
            );
          })}
        </Grid>
      )}

      {renderFilterSection(
        `${filterSections.minRate}: $${filterConfig.minRate}/hr`,
        <Stack spacing={1}>
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={filterConfig.minRate}
            onChange={(event) => setFilterConfig((prev) => ({ ...prev, minRate: Number(event.target.value) }))}
          />
          <Stack direction="row" justifyContent="space-between" sx={{ fontSize: 12, color: 'text.secondary' }}>
            <span>Any</span>
            <span>$100+</span>
          </Stack>
        </Stack>
      )}
    </Box>
  );

  return (
    <Box sx={{ px: { xs: 0, lg: 2 }, py: 2 }}>
      <GlobalStyles styles={{ '.pac-container': { zIndex: 1400 } }} />
      <Dialog
        open={counterOfferOpen}
        onClose={closeCounterOffer}
        fullWidth
        maxWidth="md"
        disableEnforceFocus
      >
        <DialogTitle>
          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Box>
              <Typography variant="h6">Submit Counter Offer</Typography>
              <Typography variant="body2" color="text.secondary">
                {counterOfferShift ? getShiftPharmacyName(counterOfferShift) : ''}
              </Typography>
            </Box>
            <IconButton onClick={closeCounterOffer}>
              <CloseIcon />
            </IconButton>
          </Stack>
        </DialogTitle>
        <DialogContent dividers>
          {counterOfferError && (
            <Typography color="error" variant="body2" sx={{ mb: 1 }}>
              {counterOfferError}
            </Typography>
          )}
          {counterOfferShift && (
            <Stack spacing={2}>
              <Paper variant="outlined" sx={{ p: 2, borderColor: 'grey.200' }}>
                <Stack direction="row" spacing={1} alignItems="center">
                  <ErrorOutlineIcon fontSize="small" />
                  <Typography variant="body2">
                    Negotiation options:{' '}
                    {getShiftNegotiable(counterOfferShift) ? 'Rate negotiable.' : 'Rate fixed.'}{' '}
                    {getShiftFlexibleTime(counterOfferShift) ? 'Time flexible.' : 'Time fixed.'}
                  </Typography>
                </Stack>
              </Paper>
              <Stack spacing={2}>
                {counterOfferSlots.map((slot, idx) => (
                  <Paper
                    key={slot.slotId != null ? `${slot.slotId}-${slot.dateLabel || idx}` : `new-${idx}`}
                    variant="outlined"
                    sx={{ p: 2, borderColor: 'grey.200' }}
                  >
                    <Stack spacing={2}>
                      <Typography variant="subtitle2">
                        {slot.dateLabel}
                      </Typography>
                      <Grid container spacing={2}>
                        <Grid size={{ xs: 12, md: 6 }}>
                          <TextField
                            label="Start time"
                            type="time"
                            size="small"
                            fullWidth
                            value={slot.startTime}
                            onChange={(event) => handleCounterSlotChange(idx, 'startTime', event.target.value)}
                            disabled={!getShiftFlexibleTime(counterOfferShift)}
                            InputLabelProps={{ shrink: true }}
                          />
                        </Grid>
                        <Grid size={{ xs: 12, md: 6 }}>
                          <TextField
                            label="End time"
                            type="time"
                            size="small"
                            fullWidth
                            value={slot.endTime}
                            onChange={(event) => handleCounterSlotChange(idx, 'endTime', event.target.value)}
                            disabled={!getShiftFlexibleTime(counterOfferShift)}
                            InputLabelProps={{ shrink: true }}
                          />
                        </Grid>
                        <Grid size={{ xs: 12, md: 6 }}>
                          <TextField
                            label="Hourly rate"
                            type="number"
                            size="small"
                            fullWidth
                            value={slot.rate}
                            onChange={(event) => handleCounterSlotChange(idx, 'rate', event.target.value)}
                            disabled={!getShiftNegotiable(counterOfferShift)}
                          />
                        </Grid>
                      </Grid>
                    </Stack>
                  </Paper>
                ))}
              </Stack>
              {getShiftNegotiable(counterOfferShift) && (
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={counterOfferTravel}
                      onChange={(event) => setCounterOfferTravel(event.target.checked)}
                    />
                  }
                  label="Request travel allowance"
                />
              )}
              {counterOfferTravel && (
                <Paper variant="outlined" sx={{ p: 2, borderColor: 'grey.200' }}>
                  <Stack spacing={1.5}>
                    <Typography variant="subtitle2">Traveling from</Typography>
                    {travelMapsLoadError && (
                      <Alert severity="error">Google Maps failed to load.</Alert>
                    )}
                    {isTravelMapsLoaded && !hasCounterOfferTravelLocation && (
                      <Autocomplete
                        onLoad={(ref) => (travelAutocompleteRef.current = ref)}
                        onPlaceChanged={handleCounterOfferTravelPlaceChanged}
                        options={{
                          componentRestrictions: { country: 'au' },
                          fields: ['address_components', 'geometry', 'place_id', 'name'],
                        }}
                      >
                        <TextField
                          fullWidth
                          margin="normal"
                          label="Search Address"
                          id={COUNTER_OFFER_TRAVEL_AUTOCOMPLETE_ID}
                        />
                      </Autocomplete>
                    )}
                    {hasCounterOfferTravelLocation && (
                      <Box
                        sx={{
                          mt: 2,
                          p: 2,
                          border: '1px solid',
                          borderColor: 'divider',
                          borderRadius: 1,
                          bgcolor: 'action.hover',
                        }}
                      >
                        <TextField
                          label="Street Address"
                          fullWidth
                          margin="normal"
                          value={counterOfferTravelLocation.streetAddress}
                          onChange={(event) =>
                            setCounterOfferTravelLocation((prev) => ({
                              ...prev,
                              streetAddress: event.target.value,
                            }))
                          }
                        />
                        <TextField
                          label="Suburb"
                          fullWidth
                          margin="normal"
                          value={counterOfferTravelLocation.suburb}
                          onChange={(event) =>
                            setCounterOfferTravelLocation((prev) => ({
                              ...prev,
                              suburb: event.target.value,
                            }))
                          }
                        />
                        <TextField
                          label="State"
                          fullWidth
                          margin="normal"
                          value={counterOfferTravelLocation.state}
                          onChange={(event) =>
                            setCounterOfferTravelLocation((prev) => ({
                              ...prev,
                              state: event.target.value,
                            }))
                          }
                        />
                        <TextField
                          label="Postcode"
                          fullWidth
                          margin="normal"
                          value={counterOfferTravelLocation.postcode}
                          onChange={(event) =>
                            setCounterOfferTravelLocation((prev) => ({
                              ...prev,
                              postcode: event.target.value,
                            }))
                          }
                        />
                        <Button size="small" onClick={clearCounterOfferTravelLocation} sx={{ mt: 1 }}>
                          Clear Address & Search Again
                        </Button>
                      </Box>
                    )}
                  </Stack>
                </Paper>
              )}
              <TextField
                label="Message"
                value={counterOfferMessage}
                onChange={(event) => setCounterOfferMessage(event.target.value)}
                multiline
                minRows={3}
              />
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={closeCounterOffer}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleSubmitCounterOffer}
            disabled={!counterOfferShift || counterSubmitting}
            startIcon={
              counterSubmitting ? <CircularProgress size={16} color="inherit" /> : <ChatBubbleOutlineIcon fontSize="small" />
            }
          >
            {counterSubmitting ? 'Sending...' : 'Send Offer'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Review Counter Offer */}
      <Dialog
        open={reviewOfferShiftId != null}
        onClose={() => setReviewOfferShiftId(null)}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>Counter Offer Details</DialogTitle>
        <DialogContent dividers>
          {reviewLoading && (
            <Stack spacing={1} sx={{ mb: 2 }}>
              <Stack direction="row" spacing={1} alignItems="center">
                <CircularProgress size={16} />
                <Typography variant="body2" color="text.secondary">
                  Loading offers...
                </Typography>
              </Stack>
            </Stack>
          )}
          {reviewOfferShiftId != null ? (() => {
            const shift = shifts.find((s) => s.id === reviewOfferShiftId);
            if (!reviewOffers || reviewOffers.length === 0) {
              // Hide empty state to avoid a confusing “No counter offers” when the button was just clicked.
              return null;
            }
            return (
              <Stack spacing={2}>
                {reviewOffers.map((offer, idx) => {
                  const slotsRaw = Array.isArray(offer.slots) ? offer.slots : [];
                  const slots = expandOfferSlotsForDisplay(slotsRaw, shift?.slots ?? []);
                  return (
                    <Paper key={offer.id ?? idx} variant="outlined" sx={{ p: 1.5, borderColor: 'grey.200' }}>
                      <Stack spacing={1}>
                        {offer.message && (
                          <Typography variant="body2" color="text.primary">
                            Message: {offer.message}
                          </Typography>
                        )}
                        {slots.length > 0 ? (
                          slots.map((slot: any, slotIdx: number) => {
                            const slotId = slot.slotId ?? slot.id;
                            return (
                              <Paper key={slot.__displayKey ?? slotId ?? slotIdx} variant="outlined" sx={{ p: 1, borderColor: 'grey.200' }}>
                                <Stack spacing={0.5}>
                                  <Typography variant="body2" fontWeight={600}>
                                    {slot.date ? formatDateLong(slot.date) : `Slot ${slotId ?? ''}`}
                                  </Typography>
                                  <Typography variant="caption" color="text.secondary">
                                    {(slot.proposedStartTime || slot.startTime || '').toString().slice(0,5)} - {(slot.proposedEndTime || slot.endTime || '').toString().slice(0,5)}
                                  </Typography>
                                  <Typography variant="caption" color="text.secondary">
                                    Rate: {slot.proposedRate ?? slot.rate ?? 'N/A'}
                                  </Typography>
                                </Stack>
                              </Paper>
                            );
                          })
                        ) : (
                          <Typography variant="body2">No slot details recorded.</Typography>
                        )}
                      </Stack>
                    </Paper>
                  );
                })}
              </Stack>
            );
          })() : null}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setReviewOfferShiftId(null)}>Close</Button>
        </DialogActions>
      </Dialog>

      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', mb: 2 }}>
        <Box>
          <Typography variant="h4" fontWeight={700}>{title}</Typography>
          <Typography variant="body2" color="text.secondary">
            {activeTab === 'saved'
              ? `${processedShifts.length} saved items`
              : useServerFiltering && typeof totalCount === 'number'
                ? `Showing ${totalCount} opportunities`
                : `Showing ${processedShifts.length} opportunities`}
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

          {useServerFiltering && typeof totalCount === 'number' && pageSize && onPageChange && (
            <Stack alignItems="center" sx={{ mt: 2, mb: 2 }}>
              <Pagination
                count={Math.max(1, Math.ceil(totalCount / pageSize))}
                page={page ?? 1}
                onChange={(_: React.ChangeEvent<unknown>, value: number) => onPageChange(value)}
              />
            </Stack>
          )}

          <Stack spacing={2}>
            {loading && (
              <Paper variant="outlined" sx={{ p: 3, borderRadius: 3, borderColor: 'grey.200' }}>
                <Typography>Loading shifts...</Typography>
              </Paper>
            )}
            {!loading && processedShifts.length === 0 && (
              <Paper variant="outlined" sx={{ p: 4, borderRadius: 3, textAlign: 'center', borderColor: 'grey.200' }}>
                <FilterListIcon sx={{ fontSize: 48, color: 'grey.300' }} />
                <Typography variant="h6" sx={{ mt: 1 }}>No jobs found</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                  We couldn't find any positions matching your criteria.
                </Typography>
                <Button variant="contained" sx={{ mt: 2 }} onClick={clearAllFilters}>
                  Reset filters
                </Button>
              </Paper>
            )}

            {processedShifts.map((shift) => {
              const rawSlots = shift.slots ?? [];
              const slots = getExpandedSlotsForDisplay(rawSlots as ShiftSlot[]);
              const isMulti = slots.length > 1;
              const isExpanded = Boolean(expandedCards[shift.id]);
              const selection = selectedSlotIds[shift.id] ?? new Set<number>();
              const isRejectedShift = rejectedShiftIds.has(shift.id);
              const isFullOrPartTime = ['FULL_TIME', 'PART_TIME'].includes(shift.employmentType ?? '');
              const isPharmacistProvided = shift.rateType === 'PHARMACIST_PROVIDED';
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
                // Non-uniform times:
                // - If flexible: show tag only (no time text)
                // - If not flexible: hide the time row
                return '';
              })();
              const shouldShowTimeRow = Boolean(showTimeText) || flexibleTime;
              // Counter offer is allowed when either time is flexible or rate is negotiable.
              // Rate negotiation is only enabled in the modal when rate is flexible; time negotiation follows flexible_timing even for FT/PT.
              const showCounter = !hideCounterOffer && (getShiftFlexibleTime(shift) || getShiftNegotiable(shift)) && !isRejectedShift;
              const showNegotiable = getShiftNegotiable(shift) && !isRejectedShift;
              const superValue = Number(shift.superPercent);
              const showSuperChip = !isFullOrPartTime && Number.isFinite(superValue) && superValue > 0;
              const counterInfo = counterOffers[shift.id];
              const paymentType =
                shift.paymentPreference ||
                (shift.employmentType === 'LOCUM'
                  ? 'ABN'
                  : shift.employmentType
                  ? 'TFN'
                  : null);
              const isSaved = savedShiftIds.has(shift.id);
              const allSlotsApplied = slots.length > 0 && slots.every((slot) => appliedSlotIds.has(slot.id));
              const isApplied = appliedShiftIds.has(shift.id) || allSlotsApplied;
              const hasRejectedSlots = slots.some((slot) => rejectedSlotIds.has(slot.id));
              const slotRejected = (slotId: number) => rejectedSlotIds.has(slotId) || isRejectedShift;
              const allowPartial = getShiftAllowPartial(shift);
              const urgent = getShiftUrgent(shift);
              const rateSummary = getRateSummary(shift);
              const rejectAllowed = rejectActionGuard ? rejectActionGuard(shift) : true;
              const pharmacyId = getShiftPharmacyId(shift);
              const ratingSummary = pharmacyId != null ? pharmacyRatings[pharmacyId] : undefined;

              return (
                <Paper
                  key={shift.id}
                  variant="outlined"
                  sx={{
                    p: 2.5,
                    borderRadius: 3,
                    borderColor: urgent ? 'warning.main' : 'grey.200',
                    borderLeftWidth: urgent ? 4 : 1,
                    position: 'relative',
                    bgcolor: 'background.paper',
                    boxShadow: urgent ? 4 : 2,
                  }}
                >
                  {urgent && (
                    <Box
                      sx={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        px: 1.5,
                        py: 0.5,
                        bgcolor: 'warning.main',
                        color: 'common.white',
                        borderBottomRightRadius: 8,
                        fontSize: 10,
                        fontWeight: 700,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 0.5,
                      }}
                    >
                      <BoltIcon sx={{ fontSize: 12 }} />
                      Urgent
                    </Box>
                  )}
                  <Stack spacing={2}>
                    <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} justifyContent="space-between">
                      <Box sx={{ flex: 1 }}>
                        <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
                          <Box>
                            <Typography variant="h6" sx={{ cursor: 'pointer' }} onClick={() => toggleExpandedCard(shift.id)}>
                              {getShiftPharmacyName(shift)}
                            </Typography>
                            {ratingSummary && ratingSummary.count > 0 && (
                              <Stack direction="row" spacing={0.75} alignItems="center" sx={{ mt: 0.5 }}>
                                <Rating value={ratingSummary.average} precision={0.5} readOnly size="small" />
                                <Typography variant="caption" color="text.secondary">
                                  ({ratingSummary.count})
                                </Typography>
                              </Stack>
                            )}
                            <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ mt: 1 }}>
                              <Chip icon={<WorkOutlineIcon />} label={getShiftRoleLabel(shift)} size="small" />
                              {(shift.hasTravel || shift.hasAccommodation) && (
                                <Stack direction="row" spacing={0.5}>
                                  {shift.hasTravel && <Chip icon={<FlightIcon />} label="Travel" size="small" />}
                                  {shift.hasAccommodation && <Chip icon={<HotelIcon />} label="Accomm." size="small" />}
                                </Stack>
                              )}
                              {paymentType && (
                                <Chip label={`Payment: ${paymentType}`} size="small" variant="outlined" />
                              )}
                              {isRejectedShift && <Chip label="Rejected" size="small" color="error" />}
                              {counterInfo && (
                                <Button
                                  size="small"
                                  variant="text"
                                  onClick={() => setReviewOfferShiftId(shift.id)}
                                  sx={{ textTransform: 'none' }}
                                >
                                  Review counter offer(s)
                                </Button>
                              )}
                            </Stack>
                            {shift.createdAt && (
                              <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5 }}>
                                Posted {dayjs(shift.createdAt).format('D MMM YYYY')}
                              </Typography>
                            )}
                          </Box>
                          {savedFeatureEnabled && !hideSaveToggle && (
                            <IconButton onClick={() => toggleSaveShift(shift.id)}>
                              <FavoriteIcon color={isSaved ? 'error' : 'disabled'} />
                            </IconButton>
                          )}
                        </Stack>

                        <Stack spacing={1} sx={{ mt: 2 }}>
                          <Stack direction="row" spacing={1} alignItems="center">
                            <CalendarTodayIcon fontSize="small" color="action" />
                            <Typography variant="body2">
                              {firstSlot
                                ? formatDateShort(firstSlot?.date)
                                : isFullOrPartTime
                                  ? getEmploymentLabel(shift)
                                  : 'No dates provided'}
                              {isMulti && <span style={{ color: '#94A3B8', marginLeft: 6 }}>+ {slots.length - 1} more</span>}
                            </Typography>
                          </Stack>
                          {shouldShowTimeRow && (
                            <Stack direction="row" spacing={1} alignItems="center">
                              <AccessTimeIcon fontSize="small" color="action" />
                              {showTimeText && <Typography variant="body2">{showTimeText}</Typography>}
                              {flexibleTime && (
                                <Chip label="Flex" size="small" color="success" />
                              )}
                            </Stack>
                          )}
                          <Stack direction="row" spacing={1} alignItems="center">
                            <PlaceIcon fontSize="small" color="action" />
                            <Typography variant="body2">{getShiftCity(shift)} ({getShiftState(shift)})</Typography>
                          </Stack>
                        </Stack>
                      </Box>

                      <Box sx={{ minWidth: 180, textAlign: { xs: 'left', md: 'right' } }}>
                        <Stack spacing={1} alignItems={{ xs: 'flex-start', md: 'flex-end' }}>
                          <Stack direction="row" spacing={0.5} alignItems="center">
                            <AttachMoneyIcon fontSize="small" color="success" />
                            <Typography variant="h6">
                              {rateSummary.display}
                              <Typography component="span" variant="caption" color="text.secondary">
                                {rateSummary.unitLabel}
                              </Typography>
                            </Typography>
                          </Stack>
                          {isFullOrPartTime && shift.superPercent && (
                            <Chip label={`+ Superannuation (${shift.superPercent}%)`} size="small" />
                          )}
                          {showSuperChip && (
                            <Chip
                              label="+Super"
                              size="small"
                              sx={{ bgcolor: '#D7ECFF', color: '#0B4D8C' }}
                            />
                          )}
                          {showNegotiable && (
                            <Chip icon={<PaidIcon />} label="Negotiable" size="small" color="info" />
                          )}
                          {isPharmacistProvided && (
                            <Typography variant="caption" color="text.secondary">
                              Rate set by pharmacist — update your profile rates to improve matches.
                            </Typography>
                          )}
                          <Stack spacing={1} sx={{ mt: 1 }}>
                            <Button
                              variant="contained"
                              disabled={isApplied || isRejectedShift || (!shift.singleUserOnly && hasRejectedSlots)}
                              onClick={() => handleApplyAll(shift)}
                            >
                              {isApplied ? 'Applied' : 'Apply Now'}
                            </Button>
                          {showCounter && onSubmitCounterOffer && (
                            <Button
                              variant="outlined"
                              onClick={() => openCounterOffer(shift)}
                              startIcon={<ChatBubbleOutlineIcon fontSize="small" />}
                            >
                              Counter Offer
                            </Button>
                          )}
                          {onRejectShift && shift.singleUserOnly && rejectAllowed && (
                            <Button
                              variant="outlined"
                              color="error"
                              onClick={() => handleRejectShift(shift)}
                              disabled={isRejectedShift}
                            >
                                {isRejectedShift ? 'Rejected' : 'Reject Shift'}
                              </Button>
                            )}
                          {onRejectShift && !shift.singleUserOnly && !allowPartial && rejectAllowed && (
                            <Button
                              variant="outlined"
                              color="error"
                              onClick={() => handleRejectShift(shift)}
                              disabled={isRejectedShift}
                            >
                              {isRejectedShift ? 'Rejected' : 'Reject Shift'}
                            </Button>
                          )}
                          </Stack>
                        </Stack>
                      </Box>
                    </Stack>

                    {isExpanded && (
                      <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, borderColor: 'grey.100' }}>
                        <Grid container spacing={2}>
                          <Grid size={{ xs: 12, md: 6 }}>
                            <Stack spacing={1.5}>
                              <Stack direction="row" spacing={1} alignItems="center">
                                <CalendarTodayIcon fontSize="small" />
                                <Typography variant="subtitle2">Shift Breakdown</Typography>
                                {isMulti && !allowPartial && (
                                  <Chip icon={<LayersIcon />} label="Bundle only" size="small" color="error" />
                                )}
                                {isMulti && allowPartial && (
                                  <Chip icon={<CheckCircleOutlineIcon />} label="Select shifts" size="small" color="success" />
                                )}
                              </Stack>

                              <Stack spacing={1}>
                                {slots.length === 0 ? (
                                  <Paper variant="outlined" sx={{ p: 2, borderColor: 'grey.200' }}>
                                    <Stack spacing={1}>
                                      <Typography variant="body2" fontWeight={600}>
                                        {isFullOrPartTime ? getEmploymentLabel(shift) : 'No time slots'}
                                      </Typography>
                                      <Typography variant="caption" color="text.secondary">
                                        {isFullOrPartTime ? 'This is a non-slot based role.' : 'Slots will be announced.'}
                                      </Typography>
                                      <Typography variant="body2" color="text.secondary">
                                        Rate: {rateSummary.display} {rateSummary.unitLabel === '/hr' ? '/hr' : rateSummary.unitLabel}
                                      </Typography>
                                    </Stack>
                                  </Paper>
                                ) : (
                                  slots.map((slot, idx) => {
                                    const slotKey = (slot as any).__displayKey ?? slot.id ?? idx;
                                    const slotId = slot.id as number;
                                    const isSelected = selection.has(slotId);
                                    const isSlotApplied = appliedSlotIds.has(slotId);
                                    const isSlotRejected = slotRejected(slotId);
                                    const offerSlot = counterInfo?.slots?.[slotId];
                                    const isCountered = !!offerSlot;
                                    return (
                                      <Paper
                                        key={slotKey}
                                        variant="outlined"
                                        sx={{
                                          p: 1.5,
                                          borderColor: isSelected ? 'primary.main' : 'grey.200',
                                          bgcolor: isSelected ? 'primary.50' : isSlotApplied ? 'success.50' : 'transparent',
                                        }}
                                      >
                                        <Stack direction="row" justifyContent="space-between" alignItems="center">
                                          <Stack direction="row" spacing={1} alignItems="center">
                                            {isMulti && allowPartial && (
                                              <Checkbox
                                                checked={isSelected || isSlotApplied || isCountered}
                                                onChange={() => toggleSlotSelection(shift.id, slotId)}
                                                disabled={isSlotRejected || isSlotApplied || isCountered}
                                              />
                                            )}
                                            <Box>
                                              <Typography variant="body2" fontWeight={600}>
                                                {formatDateLong(slot.date)}
                                              </Typography>
                                              <Typography variant="caption" color="text.secondary">
                                                {formatTime(slot.startTime)} - {formatTime(slot.endTime)}
                                              </Typography>
                                            </Box>
                                          </Stack>
                                          <Stack direction="row" spacing={1} alignItems="center">
                                            {isSlotRejected ? (
                                              <Chip label="Rejected" color="error" size="small" />
                                            ) : (
                                              <Chip
                                                label={isSlotApplied ? 'Applied' : `$${getSlotRate(slot, shift, userRatePreference)}/hr`}
                                                color={isSlotApplied ? 'info' : 'success'}
                                                size="small"
                                              />
                                            )}
                                            {offerSlot && (
                                              <Chip
                                                label="Offer sent"
                                                size="small"
                                                variant="outlined"
                                              />
                                            )}
                                            {!shift.singleUserOnly && onRejectSlot && rejectAllowed && !isSlotRejected && (
                                              <Button
                                                size="small"
                                                variant="outlined"
                                                color="error"
                                                onClick={() => handleRejectSlot(shift, slotId)}
                                              >
                                                Reject
                                              </Button>
                                            )}
                                          </Stack>
                                        </Stack>
                                      </Paper>
                                    );
                                  })
                                )}
                              </Stack>

                              {isMulti && !allowPartial && onRejectShift && rejectAllowed && (
                                <Stack direction="row" justifyContent="flex-end" sx={{ mt: 1 }}>
                                  <Button
                                    size="small"
                                    variant="outlined"
                                    color="error"
                                    disabled={isRejectedShift}
                                    onClick={() => handleRejectShift(shift)}
                                  >
                                    {isRejectedShift ? 'Rejected' : 'Reject Shift'}
                                  </Button>
                                </Stack>
                              )}

                              {isMulti && allowPartial && selection.size > 0 && (
                                <Stack direction="row" spacing={1} justifyContent="flex-end">
                                  {showCounter && onSubmitCounterOffer && (
                                    <Button
                                      variant="outlined"
                                      size="small"
                                      startIcon={<ChatBubbleOutlineIcon fontSize="small" />}
                                      onClick={() => openCounterOffer(shift, selection)}
                                    >
                                      Counter Selected
                                    </Button>
                                  )}
                                  <Button
                                    variant="contained"
                                    size="small"
                                    disabled={isRejectedShift}
                                    onClick={async () => {
                                      const selectedIds = Array.from(selection);
                                      // Optimistically mark these slots as applied
                                      setAppliedSlotIds((prev) => {
                                        const next = new Set(prev);
                                        selectedIds.forEach((id) => next.add(id));
                                        return next;
                                      });
                                      await Promise.all(
                                        selectedIds.map((slotId) => Promise.resolve(handleApplySlot(shift, slotId)))
                                      );
                                      clearSelection(shift.id);
                                    }}
                                  >
                                    Apply to {selection.size} Selected
                                  </Button>
                                  {onRejectShift && rejectAllowed && (
                                    <Button
                                      size="small"
                                      variant="outlined"
                                      color="error"
                                      disabled={isRejectedShift}
                                      onClick={() => handleRejectShift(shift)}
                                    >
                                      {isRejectedShift ? 'Rejected' : 'Reject Entire Shift'}
                                    </Button>
                                  )}
                                </Stack>
                              )}
                              {isMulti && allowPartial && selection.size === 0 && onRejectShift && rejectAllowed && (
                                <Stack direction="row" justifyContent="flex-end">
                                  <Button
                                    size="small"
                                    variant="outlined"
                                    color="error"
                                    disabled={isRejectedShift}
                                    onClick={() => handleRejectShift(shift)}
                                  >
                                    {isRejectedShift ? 'Rejected' : 'Reject Entire Shift'}
                                  </Button>
                                </Stack>
                              )}
                            </Stack>
                          </Grid>

                          <Grid size={{ xs: 12, md: 6 }}>
                            <Stack spacing={1.5}>
                              <Typography variant="subtitle2">About the Role</Typography>
                              <Typography variant="body2" color="text.secondary">
                                {shift.description || 'No description provided.'}
                              </Typography>
                              {(shift.mustHave && shift.mustHave.length > 0) && (
                                <Stack spacing={0.5}>
                                  <Typography variant="caption" color="text.secondary">Must have</Typography>
                                  <Stack direction="row" spacing={0.5} flexWrap="wrap">
                                    {shift.mustHave.map((item, idx) => (
                                      <Chip key={idx} label={item} size="small" />
                                    ))}
                                  </Stack>
                                </Stack>
                              )}
                              {(shift.niceToHave && shift.niceToHave.length > 0) && (
                                <Stack spacing={0.5}>
                                  <Typography variant="caption" color="text.secondary">Nice to have</Typography>
                                  <Stack direction="row" spacing={0.5} flexWrap="wrap">
                                    {shift.niceToHave.map((item, idx) => (
                                      <Chip key={idx} label={item} size="small" variant="outlined" />
                                    ))}
                                  </Stack>
                                </Stack>
                              )}
                              {(shift.workloadTags && shift.workloadTags.length > 0) && (
                                <Stack spacing={0.5}>
                                  <Typography variant="caption" color="text.secondary">Workload</Typography>
                                  <Stack direction="row" spacing={0.5} flexWrap="wrap">
                                    {shift.workloadTags.map((tag, idx) => (
                                      <Chip key={idx} label={tag} size="small" color="default" />
                                    ))}
                                  </Stack>
                                </Stack>
                              )}
                              {shift.createdAt && (
                                <Typography variant="caption" color="text.secondary">
                                  Posted {dayjs(shift.createdAt).format('D MMM YYYY')}
                                </Typography>
                              )}
                              <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2, borderColor: 'grey.200' }}>
                                <Typography variant="caption" color="text.secondary">Full Address</Typography>
                                <Stack direction="row" spacing={1} alignItems="center">
                                  <PlaceIcon fontSize="small" color="action" />
                                  <Typography variant="body2">{getShiftAddress(shift) || 'N/A'}</Typography>
                                </Stack>
                              </Paper>
                            </Stack>
                          </Grid>
                        </Grid>
                      </Paper>
                    )}

                    <Button
                      onClick={() => toggleExpandedCard(shift.id)}
                      endIcon={isExpanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                      sx={{ textTransform: 'none' }}
                    >
                      {isExpanded ? 'Hide Details' : 'Read More & Shift Breakdown'}
                    </Button>
                  </Stack>
                </Paper>
              );
            })}
          </Stack>
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
