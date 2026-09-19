import type { UserAvailability, UserAvailabilityPayload } from '@chemisttasker/shared-core';

export type AvailabilityEntry = UserAvailability & { notifyNewShifts?: boolean };
export type AvailabilityDraft = Omit<AvailabilityEntry, 'id'>;
export type AvailabilityPayload = UserAvailabilityPayload & { notify_new_shifts?: boolean };

export const createEmptyEntry = (): AvailabilityDraft => ({
  date: '',
  startTime: '09:00',
  endTime: '17:00',
  isAllDay: false,
  isRecurring: false,
  recurringDays: [],
  recurringEndDate: '',
  notifyNewShifts: false,
  notes: '',
});

export const weekDays = [
  { value: 0, label: 'Sun' },
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
];

export const radiusOptions = [5, 10, 20, 30, 40, 50, 75, 100, 150, 200, 250, 300, 500, 1000];
export const stateOptions = ['NSW', 'VIC', 'QLD', 'WA', 'SA', 'TAS', 'ACT', 'NT'];

export const toLocalIsoDate = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

export const GOOGLE_LIBRARIES: Array<'places'> = ['places'];

export const DNA = {
  ink: '#06123A',
  muted: '#5E6B8D',
  line: '#E5ECF7',
  blue: '#063BDA',
  violet: '#6D28D9',
  magenta: '#EA0A8E',
  cyan: '#08BEEA',
  mint: '#00A878',
};

export type LocationFormState = {
  streetAddress: string;
  suburb: string;
  state: string;
  postcode: string;
  openToTravel: boolean;
  travelStates: string[];
  latitude: number | null;
  longitude: number | null;
  googlePlaceId: string;
  coverageRadiusKm: number;
};
