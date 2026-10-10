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

export const FILTER_SECTIONS = {
  roles: 'Job Role',
  dateRange: 'Date Range',
  perks: 'Perks & Benefits',
  locations: 'Locations',
  timeOfDay: 'Time of Day',
  minRate: 'Min Rate',
  employment: 'Employment Type',
};
