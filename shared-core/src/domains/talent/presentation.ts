import { findSkill, isMatchableSkill, skillId, SOFTWARE_GROUP, type SkillsRegistry } from '../../skills';

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
