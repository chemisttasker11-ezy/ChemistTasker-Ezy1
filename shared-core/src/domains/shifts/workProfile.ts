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
