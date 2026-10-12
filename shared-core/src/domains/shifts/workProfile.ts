import type { ShiftWorkProfile } from '../../types';
import { camelCaseKeysDeep } from '../../utils/serialization';
import { findSkill, skillId, type SkillsRegistry } from '../../skills';

/** Reveal responses and already-mapped member/interest projections share this domain seam. */
export function normalizeShiftWorkProfile(value: unknown): ShiftWorkProfile | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return camelCaseKeysDeep(value) as ShiftWorkProfile;
}

export function groupWorkProfileSkills(registry: SkillsRegistry, codes: readonly string[]) {
  const groups: Record<string, string[]> = {};
  for (const code of codes) {
    const id = skillId(registry, code) || code;
    const group = findSkill(registry, id)?.group || 'other';
    const target = groups[group] ||= [];
    if (!target.includes(id)) target.push(id);
  }
  return groups;
}

/** Verification is a display signal and is never application eligibility. */
export function workProfileSkillVerification(registry: SkillsRegistry, profile: Partial<ShiftWorkProfile>, code: string): 'Verified' | 'Not verified' | '' {
  const id = skillId(registry, code) || code;
  if (profile.verifiedSkills?.includes(id)) return 'Verified';
  if (id === 'PRESCRIPTION_DISPENSING' && ['ASSISTANT','TECHNICIAN'].includes(profile.skillRole || '')) {
    return profile.dispensaryQualificationVerified ? 'Verified' : 'Not verified';
  }
  const skill = findSkill(registry, id);
  const mode = profile.skillRole ? skill?.eligibility[profile.skillRole] : undefined;
  return skill?.certificate && mode !== 'familiarity' ? 'Not verified' : '';
}
