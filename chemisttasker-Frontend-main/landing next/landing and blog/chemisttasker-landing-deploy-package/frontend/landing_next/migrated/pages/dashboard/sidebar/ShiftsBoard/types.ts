import {
  Shift,
  ShiftCounterOfferPayload,
  ShiftCounterOfferSlotPayload,
} from '@chemisttasker/shared-core';

export type ShiftSlot = NonNullable<Shift['slots']>[number];

export type CounterOfferFormSlot = {
  slotId?: number;
  dateLabel: string;
  dateValue?: string;
  startTime: string;
  endTime: string;
  rate: string;
};

export type TravelLocation = {
  streetAddress: string;
  suburb: string;
  state: string;
  postcode: string;
  googlePlaceId: string;
  latitude: number | null;
  longitude: number | null;
};

// Local extension to include slotDate until upstream package type publishes it.
export type ShiftCounterOfferSlotPayloadWithDate = ShiftCounterOfferSlotPayload & { slotDate?: string };

export type CounterOfferTrack = {
  slots: Record<number, { rate: string; start: string; end: string }>;
  summary: string;
};

export type FilterConfig = {
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

export type ShiftsBoardProps = {
  title: string;
  shifts: Shift[];
  loading?: boolean;
  onApplyAll: (shift: Shift) => Promise<void> | void;
  onApplySlot: (shift: Shift, slotId: number) => Promise<void> | void;
  onApplySlots?: (shift: Shift, slotIds: number[]) => Promise<void> | void;
  onSubmitCounterOffer?: (payload: ShiftCounterOfferPayload) => Promise<void> | void;
  onRejectShift?: (shift: Shift) => Promise<void> | void;
  onRejectSlot?: (shift: Shift, slotId: number) => Promise<void> | void;
  onRejectSlots?: (shift: Shift, slotIds: number[]) => Promise<void> | void;
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
  slotFilterMode?: SlotFilterMode;
  fallbackToAllShiftsWhenEmpty?: boolean;
  showAllSlots?: boolean;
  actionDisabledGuard?: (shift: Shift) => boolean;
  applyLabel?: string;
  disableSlotActions?: boolean;
  disableActionGuards?: boolean;
};

export type SortKey = 'shiftDate' | 'postedDate' | 'rate' | 'distance';

export type SlotFilterMode = 'all' | 'interested' | 'rejected';

export type RatePreference = {
  weekday?: string | number | null;
  saturday?: string | number | null;
  sunday?: string | number | null;
  public_holiday?: string | number | null;
  early_morning?: string | number | null;
  late_night?: string | number | null;
  early_morning_same_as_day?: boolean;
  late_night_same_as_day?: boolean;
};
