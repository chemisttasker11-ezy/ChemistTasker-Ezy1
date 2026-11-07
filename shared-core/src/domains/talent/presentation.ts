import { findSkill, isMatchableSkill, skillId, SOFTWARE_GROUP, type SkillsRegistry } from '../../skills';
import { newcomerTypeLabel } from '../onboarding/newcomer';

export function resolveTalentBookingRole(category?: string | null, subtype?: string | null, title?: string | null): string {
  const normalize = (value?: string | null) => String(value || '').trim().toUpperCase().replace(/[\s-]+/g, '_');
  const roles: Record<string, string> = { PHARMACIST: 'PHARMACIST', COMMUNITY_PHARMACIST: 'PHARMACIST', INTERN: 'INTERN', INTERN_PHARMACIST: 'INTERN', STUDENT: 'STUDENT', PHARMACY_STUDENT: 'STUDENT', ASSISTANT: 'ASSISTANT', PHARMACY_ASSISTANT: 'ASSISTANT', TECHNICIAN: 'TECHNICIAN', DISPENSARY_TECHNICIAN: 'TECHNICIAN', PHARMACY_TECHNICIAN: 'TECHNICIAN', EXPLORER: 'EXPLORER' };
  const account = normalize(category);
  return account === 'OTHER_STAFF' ? roles[normalize(subtype)] || roles[normalize(title)] || '' : roles[account] || roles[normalize(subtype)] || roles[normalize(title)] || '';
}

/** Registry IDs throughout; labels are rendered by host components. */
export function projectTalentSkills(registry: SkillsRegistry, values: readonly string[]) {
  const clinicalServices: string[] = [], dispenseSoftware: string[] = [], expandedScope: string[] = [];
  for (const value of values) {
    const code = skillId(registry, value);
    if (!code || !isMatchableSkill(registry, code)) continue;
    const group = findSkill(registry, code)?.group;
    const target = group === SOFTWARE_GROUP ? dispenseSoftware : group === 'Clinical Services' ? clinicalServices : expandedScope;
    if (!target.includes(code)) target.push(code);
  }
  return { clinicalServices, dispenseSoftware, expandedScope, skills: [...clinicalServices, ...expandedScope] };
}

export interface TalentFilterCandidate {
  role: string; state: string; pitch: string; city: string; refId: string; workTypes: string[];
  clinicalServices?: string[]; expandedScope?: string[]; skills?: string[]; dispenseSoftware: string[];
  willingToTravel: boolean; isInternshipSeeker: boolean; availableDates?: string[];
}
export interface TalentFilters {
  search: string; roles: string[]; states: string[]; workTypes: string[]; skills: string[];
  willingToTravel: boolean; placementSeeker: boolean; availabilityStart?: string | null; availabilityEnd?: string | null;
}
export function filterTalentCandidates<T extends TalentFilterCandidate>(registry: SkillsRegistry, candidates: T[], filters: TalentFilters) {
  const canonical = (values: readonly string[]) => [...new Set(values.flatMap(value => {
    const id = skillId(registry, value);
    return id && isMatchableSkill(registry, id) ? [id] : [];
  }))];
  const unique = (values: string[]) => [...new Set(values.filter(Boolean))].sort();
  const roleOptions = unique(candidates.map(candidate => candidate.role));
  const stateOptions = unique(candidates.map(candidate => candidate.state));
  const roleSkillOptions: Record<string, string[]> = {};
  for (const candidate of candidates) {
    const skills = canonical([...(candidate.clinicalServices || []), ...(candidate.expandedScope || []), ...(candidate.skills || [])]).filter(code => findSkill(registry, code)?.group !== SOFTWARE_GROUP);
    roleSkillOptions[candidate.role] = unique([...(roleSkillOptions[candidate.role] || []), ...skills]);
  }
  const order = new Map(registry.skills.map((skill, index) => [skill.code, index]));
  const softwareOptions = canonical(candidates.flatMap(candidate => candidate.dispenseSoftware || [])).sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0));
  let start = filters.availabilityStart || null, end = filters.availabilityEnd || null;
  if (start && end && start > end) [start, end] = [end, start];
  const search = filters.search.trim().toLowerCase();
  const filtered = candidates.filter(candidate => {
    if (search && !`${candidate.role} ${candidate.pitch} ${candidate.city} ${candidate.refId}`.toLowerCase().includes(search)) return false;
    if (filters.roles.length && !filters.roles.includes(candidate.role)) return false;
    if (filters.states.length && !filters.states.includes(candidate.state)) return false;
    if (filters.workTypes.length && !candidate.workTypes.some(type => filters.workTypes.includes(type))) return false;
    const claims = canonical([...(candidate.skills || []), ...(candidate.clinicalServices || []), ...(candidate.expandedScope || []), ...candidate.dispenseSoftware]);
    if (filters.skills.some(value => { const id = skillId(registry, value); return !id || !isMatchableSkill(registry, id) || !claims.includes(id); })) return false;
    if (filters.willingToTravel && !candidate.willingToTravel) return false;
    if (filters.placementSeeker && !candidate.isInternshipSeeker) return false;
    if ((start || end) && !(candidate.availableDates || []).some(date => (!start || date >= start) && (!end || date <= end))) return false;
    return true;
  });
  return { filtered, roleOptions, stateOptions, roleSkillOptions, softwareOptions };
}


/**
 * One public talent presentation contract for Expo, Vite and Next. Map only
 * public/authorized feed fields; never project private email, contact, birth,
 * payment or onboarding details into a public card.
 */
export interface PublicTalentCandidate extends TalentFilterCandidate {
  id: number;
  roleTitle: string;
  referenceCode: string | null;
  headline: string;
  body: string;
  coverageRadius: string;
  travelStates: string[];
  experienceBadge: string | null;
  software: string[];
  experience: number | null;
  availabilityText: string;
  availabilityMode: string | null;
  postKind: string | null;
  isFullTimeApplication: boolean;
  showCalendar: boolean;
  availableSlots: Array<{date: string; startTime: string | null; endTime: string | null; isAllDay: boolean}>;
  availabilitySummary: string;
  ratingAverage: number | null;
  ratingCount: number | null;
  likeCount: number;
  isLikedByMe: boolean;
  authorUserId: number | null;
  explorerUserId: number | null;
  isExplorer: boolean;
  rawRoleCategory: string | null;
  explorerRoleType: string | null;
  explorerProfileId: number | null;
}

const titleCaseTalent = (value: string) => value.toLowerCase()
  .replace(/_/g, ' ').replace(/(^|\s)\S/g, letter => letter.toUpperCase());
const localTalentDate = (date = new Date()) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const isoTalentDay = (day: string) => /^\d{4}-\d{2}-\d{2}$/.test(day);

/** Normalize a server-visible post once; host UIs retain control of presentation. */
export function projectPublicTalentCandidate(
  raw: Record<string, unknown>,
  registry: SkillsRegistry,
): PublicTalentCandidate {
  const take = (...keys: string[]) => {
    for (const key of keys) if (raw[key] != null) return raw[key];
    return null;
  };
  const string = (...keys: string[]) => String(take(...keys) ?? '').trim();
  const strings = (...keys: string[]) => {
    const value = take(...keys);
    return Array.isArray(value) ? value.filter(item => typeof item === 'string' && item.trim()).map(String) : [];
  };
  const numberOrNull = (value: unknown) =>
    value != null && value !== '' && Number.isFinite(Number(value)) ? Number(value) : null;
  const idOrNull = (value: unknown) => {
    const id = numberOrNull(value);
    return id != null && Number.isSafeInteger(id) && id > 0 ? id : null;
  };

  const roleTitle = string('role_title', 'roleTitle', 'explorer_role_type',
    'explorerRoleType', 'role_category', 'roleCategory') || 'New to pharmacy';
  const code = roleTitle.toUpperCase();
  const role = code === 'EXPLORER' ? 'New to pharmacy'
    : code === 'OTHER_STAFF' ? 'Pharmacy team'
    : newcomerTypeLabel(roleTitle) ?? titleCaseTalent(roleTitle);
  const workTypes = strings('work_types', 'workTypes').map(titleCaseTalent);
  const referenceCode = string('reference_code', 'referenceCode') || null;
  const availabilityMode = string('availability_mode', 'availabilityMode') || null;
  const postKind = string('post_kind', 'postKind') ||
    (availabilityMode === 'FULL_TIME_NOTICE' ? 'FULL_TIME_APPLICATION' : 'AVAILABILITY');
  const isFullTimeApplication = postKind === 'FULL_TIME_APPLICATION';
  const now = localTalentDate();
  const rawSlots = take('availability_days', 'availabilityDays');
  const availableSlots = (Array.isArray(rawSlots) ? rawSlots : [])
    .map((item): {date: string;startTime: string|null;endTime: string|null;isAllDay: boolean}|null => {
      if (typeof item === 'string') {
        return {date:item, startTime:null, endTime:null, isAllDay:false};
      }
      if (!item || typeof item !== 'object') return null;
      const row = item as Record<string, unknown>;
      return {date:String(row.date ?? ''), startTime:String(row.start_time ?? row.startTime ?? row.start ?? '') || null,
        endTime:String(row.end_time ?? row.endTime ?? row.end ?? '') || null,
        isAllDay:Boolean(row.is_all_day ?? row.isAllDay)};
    })
    .filter((entry): entry is {date:string;startTime:string|null;endTime:string|null;isAllDay:boolean} =>
      entry != null && isoTalentDay(entry.date) && entry.date >= now);
  const availableDates = availableSlots.map(entry => entry.date);

  const projected = projectTalentSkills(registry, [...strings('skills'), ...strings('software')]);
  const radius = take('coverage_radius_km', 'coverageRadiusKm');
  const yearsSinceRegistration = take('ahpra_years_since_first_registration', 'ahpraYearsSinceFirstRegistration');
  const yearsExperience = take('years_experience', 'yearsExperience');
  const experienceBadge = role.includes('Pharmacist') && yearsSinceRegistration != null
    ? `${yearsSinceRegistration} yrs AHPRA`
    : role.includes('Pharmacy') || role.includes('Assistant') || role.includes('Technician')
      ? yearsExperience ? `${yearsExperience} yrs exp` : null
      : null;
  const nestedRating = take('rating');
  const rating = nestedRating && typeof nestedRating === 'object'
    ? nestedRating as Record<string, unknown> : {};
  const roleCategory = string('role_category', 'roleCategory') || null;
  const explorerProfileId = idOrNull(take('explorer_profile', 'explorerProfileId', 'explorerProfile'));
  return {
    id: Number(take('id')),
    roleTitle, role, referenceCode,
    refId: referenceCode ? referenceCode.startsWith('REF-') ? referenceCode : 'REF-' + referenceCode : 'REF-0000',
    headline: string('headline'), body: string('body'),
    state: string('location_state', 'locationState'),
    city: string('location_suburb', 'locationSuburb', 'location_state', 'locationState'),
    pitch: string('body', 'short_bio', 'shortBio', 'headline'),
    workTypes,
    coverageRadius: radius ? `+${radius}km` : 'Local',
    willingToTravel: Boolean(take('open_to_travel', 'openToTravel')),
    travelStates: strings('travel_states', 'travelStates'),
    experienceBadge,
    skills: projected.skills,
    clinicalServices: projected.clinicalServices,
    dispenseSoftware: projected.dispenseSoftware,
    expandedScope: projected.expandedScope,
    software: projected.dispenseSoftware,
    experience: null,
    availabilityText: isFullTimeApplication ? 'Open anytime' : '',
    availabilityMode, postKind, isFullTimeApplication,
    showCalendar: !isFullTimeApplication && availableDates.length > 0,
    availableDates, availableSlots,
    availabilitySummary: string('availability_summary', 'availabilitySummary'),
    isInternshipSeeker: role.includes('Student') || role.includes('Intern') ||
      workTypes.some(type => type === 'Placement' || type === 'Volunteering'),
    ratingAverage: numberOrNull(take('rating_average', 'ratingAverage') ?? rating.average),
    ratingCount: numberOrNull(take('rating_count', 'ratingCount') ?? rating.count),
    likeCount: numberOrNull(take('like_count', 'likeCount')) ?? 0,
    isLikedByMe: Boolean(take('is_liked_by_me', 'isLikedByMe')),
    authorUserId: idOrNull(take('author_user_id', 'authorUserId')),
    explorerUserId: idOrNull(take('explorer_user_id', 'explorerUserId')),
    isExplorer: String(roleCategory || '').toUpperCase() === 'EXPLORER' || explorerProfileId != null,
    rawRoleCategory: roleCategory,
    explorerRoleType: string('explorer_role_type', 'explorerRoleType') || null,
    explorerProfileId,
  };
}

/**
 * Common public-board wire aliases. Keep the same presentation contract in
 * Vite and the migrated Next copy; server visibility remains authoritative.
 */
export function normalizePublicTalentPost(post: Record<string, any>): Record<string, any> {
  return {
    ...post,
    authorUserId: post.author_user_id ?? post.authorUserId ?? null,
    roleTitle: post.role_title ?? post.roleTitle ?? null,
    roleCategory: post.role_category ?? post.roleCategory ?? null,
    workTypes: post.work_types ?? post.workTypes ?? null,
    postKind: post.post_kind ?? post.postKind ?? null,
    coverageRadiusKm: post.coverage_radius_km ?? post.coverageRadiusKm ?? null,
    openToTravel: post.open_to_travel ?? post.openToTravel ?? null,
    availabilityMode: post.availability_mode ?? post.availabilityMode ?? null,
    availabilitySummary: post.availability_summary ?? post.availabilitySummary ?? null,
    availabilityDays: post.availability_days ?? post.availabilityDays ?? null,
    availabilityNotice: post.availability_notice ?? post.availabilityNotice ?? null,
    locationState: post.location_state ?? post.locationState ?? null,
    locationSuburb: post.location_suburb ?? post.locationSuburb ?? null,
    locationPostcode: post.location_postcode ?? post.locationPostcode ?? null,
    referenceCode: post.reference_code ?? post.referenceCode ?? null,
    explorerRoleType: post.explorer_role_type ?? post.explorerRoleType ?? null,
    explorerUserId: post.explorer_user_id ?? post.explorerUserId ?? null,
    explorerProfileId: post.explorer_profile ?? post.explorerProfile ?? null,
    ratingAverage: post.rating_average ?? post.ratingAverage ?? null,
    ratingCount: post.rating_count ?? post.ratingCount ?? null,
  };
}
