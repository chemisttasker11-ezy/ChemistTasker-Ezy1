import { EngagementType } from './types';

export const DEFAULT_FILTERS: { search: string; roles: string[]; states: string[]; engagementTypes: EngagementType[] } = {
  search: '',
  roles: [],
  states: [],
  engagementTypes: [],
};

export const ENGAGEMENT_LABELS: Record<EngagementType, string> = {
  FULL_TIME: 'Full Time',
  PART_TIME: 'Part Time',
  CASUAL: 'Casual',
  VOLUNTEERING: 'Volunteering',
  PLACEMENT: 'Placement',
};
