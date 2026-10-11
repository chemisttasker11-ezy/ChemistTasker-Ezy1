/** Canonical pharmacy capability library shared by web, Expo and Django.
 * Eligibility describes how a claim can be represented, not legal permission to practise.
 * Explorer deliberately has no professional skills.
 */
export type WorkerSkillRole = 'PHARMACIST' | 'INTERN' | 'TECHNICIAN' | 'ASSISTANT' | 'STUDENT';
export type SkillClaimMode = 'experience' | 'supervised' | 'conditional' | 'familiarity' | 'none';

export interface SkillDefinition {
  code: string;
  label: string;
  group: string;
  icon_web: string;
  icon_mobile: string;
  icon_meaning: string;
  eligibility: Record<WorkerSkillRole, SkillClaimMode>;
  certificate: string;
  note: string;
}
export interface SkillCertificateDefinition {
  code: string;
  label: string;
  trigger: string;
  platform_policy?: boolean;
}
export interface SkillsRegistry {
  version: number;
  groups: string[];
  skills: SkillDefinition[];
  legacy_aliases: Record<string, string>;
  legacy_evidence_only: string[];
  certificates: SkillCertificateDefinition[];
}
export interface RoleSkillGroup {
  key: string;
  label: string;
  items: SkillDefinition[];
}
const STAFF_ROLES: WorkerSkillRole[] = ['INTERN', 'TECHNICIAN', 'ASSISTANT', 'STUDENT'];

export function workerSkillRole(persona: 'pharmacist' | 'otherstaff', subtype?: string | null): WorkerSkillRole | null {
  if (persona === 'pharmacist') return 'PHARMACIST';
  const upper = (subtype || '').trim().toUpperCase();
  return STAFF_ROLES.find(role => role === upper) || null;
}

export function roleSkillGroups(registry: SkillsRegistry, role: WorkerSkillRole | null): RoleSkillGroup[] {
  if (!role) return [];
  const groups = registry.groups.map(label => ({
    key: label,
    label,
    items: registry.skills.filter(skill => skill.group === label && skill.eligibility[role] !== 'none')
  }));
  // Put retail ahead of dispensing when the job is primarily retail.
  if (role === 'ASSISTANT' || role === 'STUDENT') {
    const retail = groups.find(group => group.label === 'Operations & Retail');
    return [retail, ...groups.filter(group => group !== retail)].filter(
      (group): group is RoleSkillGroup => Boolean(group && group.items.length)
    );
  }
  return groups.filter(group => group.items.length);
}

export function canonicalSkillCode(registry: SkillsRegistry, code: string): string {
  return registry.legacy_aliases[code] || code;
}

export function validRoleSkillCodes(registry: SkillsRegistry, role: WorkerSkillRole | null, raw: string[]): string[] {
  if (!role) return [];
  const allowed = new Set(registry.skills.filter(s => s.eligibility[role] !== 'none').map(s => s.code));
  return Array.from(new Set(raw.map(code => canonicalSkillCode(registry, code)).filter(code => allowed.has(code))));
}

export function legacySkillCodes(registry: SkillsRegistry, role: WorkerSkillRole | null, raw: string[]): string[] {
  const allowed = new Set(validRoleSkillCodes(registry, role, raw));
  return raw.filter(code => !allowed.has(canonicalSkillCode(registry, code)));
}

export function claimModeLabel(mode: SkillClaimMode): string | null {
  switch (mode) {
    case 'supervised': return 'Under pharmacist supervision';
    case 'conditional': return 'Training & supervision required';
    case 'familiarity': return 'Familiarity only';
    default: return null;
  }
}
export function skillCertificateLabel(registry: SkillsRegistry, skill: SkillDefinition): string | null {
  return registry.certificates.find(item => item.code === skill.certificate)?.label || null;
}
