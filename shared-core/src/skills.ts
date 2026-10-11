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
  description?: string;
  definition: string;
  aliases: string[];
  matchable?: boolean;
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
  if (!role || !['PHARMACIST', 'INTERN', 'TECHNICIAN', 'ASSISTANT', 'STUDENT'].includes(role)) return [];
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
  if (!role || !['PHARMACIST', 'INTERN', 'TECHNICIAN', 'ASSISTANT', 'STUDENT'].includes(role)) return [];
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

/** Immutable cross-platform matching identity. Never equate arbitrary text with a skill. */
export function findSkill(registry: SkillsRegistry, codeOrLabel: string): SkillDefinition | null {
  if (typeof codeOrLabel !== 'string') return null;
  const query = codeOrLabel.trim().toLowerCase();
  if (!query) return null;
  const canonical = registry.legacy_aliases[codeOrLabel.trim().toUpperCase()];
  const match = registry.skills.find(skill =>
    skill.code.toLowerCase() === query ||
    skill.code === canonical ||
    skill.label.toLowerCase() === query ||
    (skill.aliases || []).some(alias => alias.toLowerCase() === query)
  );
  return match || null;
}
export function skillId(registry: SkillsRegistry, codeOrLabel: string): string | null {
  return findSkill(registry, codeOrLabel)?.code || null;
}
export function skillLabel(registry: SkillsRegistry, codeOrLabel: string): string {
  return findSkill(registry, codeOrLabel)?.label || codeOrLabel;
}
export function normalizeSkillIds(registry: SkillsRegistry, values: readonly string[]): string[] {
  const codes = values.map(value => skillId(registry, value)).filter((value): value is string => Boolean(value));
  return Array.from(new Set(codes));
}
export function skillMatches(registry: SkillsRegistry, requested: string, claimed: readonly string[]): boolean {
  const code = skillId(registry, requested);
  return code !== null && normalizeSkillIds(registry, claimed).includes(code);
}
/** This checks identity only. Mandatory licensing, certificates and supervision
 * are separate constraints that must be enforced before ranking or assignment. */
export function matchSkillRequirements(registry: SkillsRegistry, required: readonly string[], preferred: readonly string[], claimed: readonly string[]) {
  const actual = new Set(normalizeSkillIds(registry, claimed));
  const requiredCodes = normalizeSkillIds(registry, required);
  const preferredCodes = normalizeSkillIds(registry, preferred);
  const unknownRequired = required.filter(item => !skillId(registry, item));
  return {
    matchesRequired: unknownRequired.length === 0 && requiredCodes.every(code => actual.has(code)),
    matchedRequired: requiredCodes.filter(code => actual.has(code)),
    missingRequired: requiredCodes.filter(code => !actual.has(code)),
    unknownRequired,
    matchedPreferred: preferredCodes.filter(code => actual.has(code))
  };
}
