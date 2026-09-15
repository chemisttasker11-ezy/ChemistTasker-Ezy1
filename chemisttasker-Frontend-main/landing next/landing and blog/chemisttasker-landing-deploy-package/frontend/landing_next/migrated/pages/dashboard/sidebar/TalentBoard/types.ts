export type EngagementType = 'FULL_TIME' | 'PART_TIME' | 'CASUAL' | 'VOLUNTEERING' | 'PLACEMENT';

export type TalentFilterConfig = {
  search: string;
  roles: string[];
  states: string[];
  engagementTypes: EngagementType[];
};

export type Candidate = {
  id: number;
  refId: string;
  role: string;
  headline: string;
  body: string;
  city: string;
  state: string;
  coverageRadius: string;
  workTypes: string[];
  willingToTravel: boolean;
  pitch: string;
  travelStates?: string[];
  experienceBadge?: string | null;
  skills: string[];
  software: string[];
  clinicalServices: string[];
  dispenseSoftware: string[];
  expandedScope: string[];
  experience: number | null;
  availabilityText: string;
  availabilityMode: string | null;
  postKind?: string | null;
  isFullTimeApplication?: boolean;
  showCalendar: boolean;
  availableDates: string[];
  availableSlots?: Array<{
    date: string;
    startTime?: string | null;
    endTime?: string | null;
    isAllDay?: boolean;
  }>;
  isInternshipSeeker: boolean;
  ratingAverage: number;
  ratingCount: number;
  likeCount: number;
  isLikedByMe: boolean;
  authorUserId: number | null;
  explorerUserId: number | null;
  isExplorer: boolean;
  rawRoleCategory?: string | null;
  explorerRoleType?: string | null;
  explorerProfileId?: number | null;
  openToTravel?: boolean | null;
  coverageRadiusKm?: number | null;
  availabilityDays?: Array<string | number> | null;
  availabilityNotice?: string | null;
  availabilitySummary?: string | null;
};
