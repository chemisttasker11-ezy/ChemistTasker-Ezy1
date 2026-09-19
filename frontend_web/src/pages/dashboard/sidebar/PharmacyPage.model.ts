import type { MembershipDTO, PharmacyDTO as OwnerPharmacyDTO } from './owner/types';

export type PharmacyApi = {
  id: string | number;
  owner: number;
  name: string;
  email: string | null;
  claimed?: boolean | null;
  claim_status?: string | null;
  organization?: { id: number; name?: string | null } | number | null;
  organization_id?: number | null;
  street_address: string;
  suburb: string;
  postcode: string;
  google_place_id: string;
  latitude: number | null;
  longitude: number | null;
  state: string;
  chain: number | null;
  abn: string;
  abn_verified?: boolean | null;
  abn_entity_confirmed?: boolean | null;
  abn_entity_name?: string | null;
  abn_entity_type?: string | null;
  abn_status?: string | null;
  abn_gst_registered?: boolean | null;
  abn_gst_from?: string | null;
  abn_gst_to?: string | null;
  abn_last_checked?: string | null;
  abn_verification_note?: string | null;
  methadone_s8_protocols?: string;
  qld_sump_docs?: string;
  sops?: string;
  induction_guides?: string;
  employment_types?: string[];
  roles_needed?: string[];
  weekdays_start: string | null;
  weekdays_end: string | null;
  monday_start: string | null;
  monday_end: string | null;
  monday_closed?: boolean | null;
  tuesday_start: string | null;
  tuesday_end: string | null;
  tuesday_closed?: boolean | null;
  wednesday_start: string | null;
  wednesday_end: string | null;
  wednesday_closed?: boolean | null;
  thursday_start: string | null;
  thursday_end: string | null;
  thursday_closed?: boolean | null;
  friday_start: string | null;
  friday_end: string | null;
  friday_closed?: boolean | null;
  saturdays_start: string | null;
  saturdays_end: string | null;
  saturdays_closed?: boolean | null;
  sundays_start: string | null;
  sundays_end: string | null;
  sundays_closed?: boolean | null;
  public_holidays_start: string | null;
  public_holidays_end: string | null;
  public_holidays_closed?: boolean | null;
  default_rate_type: 'FIXED' | 'FLEXIBLE' | 'PHARMACIST_PROVIDED' | null;
  default_fixed_rate: string | null;
  rate_weekday?: string | null;
  rate_saturday?: string | null;
  rate_sunday?: string | null;
  rate_public_holiday?: string | null;
  rate_early_morning?: string | null;
  rate_late_night?: string | null;
  about: string;
  auto_publish_worker_requests?: boolean;
};

export type Pharmacy = Omit<PharmacyApi, 'id'> & { id: string };

export const normalizePharmacy = (raw: any): Pharmacy => ({
  id: String(raw.id),
  owner: raw.owner ?? raw.ownerId ?? 0,
  name: raw.name ?? '',
  email: raw.email ?? null,
  claimed: raw.claimed ?? false,
  claim_status: raw.claim_status ?? raw.claimStatus ?? null,
  organization: raw.organization ?? null,
  organization_id: raw.organization_id ?? raw.organizationId ?? null,
  street_address: raw.street_address ?? raw.streetAddress ?? '',
  suburb: raw.suburb ?? '',
  postcode: raw.postcode ?? '',
  google_place_id: raw.google_place_id ?? raw.googlePlaceId ?? '',
  latitude: raw.latitude ?? null,
  longitude: raw.longitude ?? null,
  state: raw.state ?? '',
  chain: raw.chain ?? null,
  abn: raw.abn ?? '',
  abn_verified: raw.abn_verified ?? false,
  abn_entity_confirmed: raw.abn_entity_confirmed ?? false,
  abn_entity_name: raw.abn_entity_name ?? null,
  abn_entity_type: raw.abn_entity_type ?? null,
  abn_status: raw.abn_status ?? null,
  abn_gst_registered: raw.abn_gst_registered ?? null,
  abn_gst_from: raw.abn_gst_from ?? null,
  abn_gst_to: raw.abn_gst_to ?? null,
  abn_last_checked: raw.abn_last_checked ?? null,
  abn_verification_note: raw.abn_verification_note ?? null,
  methadone_s8_protocols: raw.methadone_s8_protocols ?? raw.methadoneS8Protocols ?? undefined,
  qld_sump_docs: raw.qld_sump_docs ?? raw.qldSumpDocs ?? undefined,
  sops: raw.sops ?? undefined,
  induction_guides: raw.induction_guides ?? raw.inductionGuides ?? undefined,
  employment_types: raw.employment_types ?? raw.employmentTypes ?? [],
  roles_needed: raw.roles_needed ?? raw.rolesNeeded ?? [],
  weekdays_start: raw.weekdays_start ?? raw.weekdaysStart ?? '',
  weekdays_end: raw.weekdays_end ?? raw.weekdaysEnd ?? '',
  monday_start: raw.monday_start ?? raw.mondayStart ?? raw.weekdays_start ?? raw.weekdaysStart ?? '',
  monday_end: raw.monday_end ?? raw.mondayEnd ?? raw.weekdays_end ?? raw.weekdaysEnd ?? '',
  monday_closed: raw.monday_closed ?? raw.mondayClosed ?? false,
  tuesday_start: raw.tuesday_start ?? raw.tuesdayStart ?? raw.weekdays_start ?? raw.weekdaysStart ?? '',
  tuesday_end: raw.tuesday_end ?? raw.tuesdayEnd ?? raw.weekdays_end ?? raw.weekdaysEnd ?? '',
  tuesday_closed: raw.tuesday_closed ?? raw.tuesdayClosed ?? false,
  wednesday_start: raw.wednesday_start ?? raw.wednesdayStart ?? raw.weekdays_start ?? raw.weekdaysStart ?? '',
  wednesday_end: raw.wednesday_end ?? raw.wednesdayEnd ?? raw.weekdays_end ?? raw.weekdaysEnd ?? '',
  wednesday_closed: raw.wednesday_closed ?? raw.wednesdayClosed ?? false,
  thursday_start: raw.thursday_start ?? raw.thursdayStart ?? raw.weekdays_start ?? raw.weekdaysStart ?? '',
  thursday_end: raw.thursday_end ?? raw.thursdayEnd ?? raw.weekdays_end ?? raw.weekdaysEnd ?? '',
  thursday_closed: raw.thursday_closed ?? raw.thursdayClosed ?? false,
  friday_start: raw.friday_start ?? raw.fridayStart ?? raw.weekdays_start ?? raw.weekdaysStart ?? '',
  friday_end: raw.friday_end ?? raw.fridayEnd ?? raw.weekdays_end ?? raw.weekdaysEnd ?? '',
  friday_closed: raw.friday_closed ?? raw.fridayClosed ?? false,
  saturdays_start: raw.saturdays_start ?? raw.saturdaysStart ?? '',
  saturdays_end: raw.saturdays_end ?? raw.saturdaysEnd ?? '',
  saturdays_closed: raw.saturdays_closed ?? raw.saturdaysClosed ?? false,
  sundays_start: raw.sundays_start ?? raw.sundaysStart ?? '',
  sundays_end: raw.sundays_end ?? raw.sundaysEnd ?? '',
  sundays_closed: raw.sundays_closed ?? raw.sundaysClosed ?? false,
  public_holidays_start: raw.public_holidays_start ?? raw.publicHolidaysStart ?? '',
  public_holidays_end: raw.public_holidays_end ?? raw.publicHolidaysEnd ?? '',
  public_holidays_closed: raw.public_holidays_closed ?? raw.publicHolidaysClosed ?? false,
  default_rate_type: raw.default_rate_type ?? raw.defaultRateType ?? null,
  default_fixed_rate: raw.default_fixed_rate ?? raw.defaultFixedRate ?? null,
  rate_weekday: raw.rate_weekday ?? raw.rateWeekday ?? null,
  rate_saturday: raw.rate_saturday ?? raw.rateSaturday ?? null,
  rate_sunday: raw.rate_sunday ?? raw.rateSunday ?? null,
  rate_public_holiday: raw.rate_public_holiday ?? raw.ratePublicHoliday ?? null,
  rate_early_morning: raw.rate_early_morning ?? raw.rateEarlyMorning ?? null,
  rate_late_night: raw.rate_late_night ?? raw.rateLateNight ?? null,
  about: raw.about ?? '',
  auto_publish_worker_requests: raw.auto_publish_worker_requests ?? raw.autoPublishWorkerRequests ?? false,
});

export const toOwnerPharmacyDTO = (pharmacy: Pharmacy): OwnerPharmacyDTO => ({
  id: pharmacy.id,
  name: pharmacy.name,
  street_address: pharmacy.street_address,
  suburb: pharmacy.suburb,
  state: pharmacy.state,
  postcode: pharmacy.postcode,
});

export type ClaimStatus = 'PENDING' | 'ACCEPTED' | 'REJECTED';

export type OrganizationClaimItem = {
  id: number;
  status: ClaimStatus;
  status_display?: string;
  pharmacy: {
    id: number;
    name?: string | null;
    email?: string | null;
  } | null;
  message?: string | null;
  response_message?: string | null;
  created_at?: string | null;
  responded_at?: string | null;
};

export type OwnerClaimRequest = {
  id: number;
  status: ClaimStatus;
  status_display?: string;
  message?: string | null;
  response_message?: string | null;
  pharmacy: {
    id: number;
    name: string;
    email: string | null;
  };
  organization: {
    id: number;
    name?: string | null;
  } | null;
  created_at: string;
  responded_at: string | null;
};

export type OwnerClaimDialogState = {
  open: boolean;
  claim: OwnerClaimRequest | null;
  action: ClaimStatus | null;
  note: string;
};

export const initialOwnerDialogState: OwnerClaimDialogState = {
  open: false,
  claim: null,
  action: null,
  note: '',
};

export const CLAIM_STATUS_COLORS: Record<ClaimStatus, 'success' | 'warning' | 'error'> = {
  ACCEPTED: 'success',
  PENDING: 'warning',
  REJECTED: 'error',
};

export const formatDateTime = (value?: string | null) =>
  value ? new Date(value).toLocaleString() : '-';

export const formatDate = (value?: string | null) =>
  value ? new Date(value).toLocaleDateString() : '-';

export const membershipIsVisibleCategoryMember = (membership: MembershipDTO) => {
  const status = String((membership as any).status || '').toUpperCase();
  return !['REJECTED', 'LEFT'].includes(status);
};

export const EMPLOYMENT_TYPE_OPTIONS = ['PART_TIME', 'FULL_TIME', 'LOCUMS'];
export const ROLE_OPTIONS = ['PHARMACIST', 'INTERN', 'ASSISTANT', 'TECHNICIAN', 'STUDENT', 'ADMIN', 'DRIVER'];
export const RATE_TYPES = [
  { value: 'FIXED', label: 'Fixed' },
  { value: 'FLEXIBLE', label: 'Flexible' },
  { value: 'PHARMACIST_PROVIDED', label: 'Pharmacist Provided' },
] as const;

export const RATE_MINIMUM_EXAMPLE = '55';
export const GOVERNMENT_AWARD_GUIDE_URL =
  'https://calculate.fairwork.gov.au/payguides/fairwork/ma000012/pdf';

export const prettifyOptionLabel = (value: string) =>
  value
    .split('_')
    .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
    .join(' ');

export const PHARMACY_CACHE_KEY = 'pharmacyPage.cache.v2';
