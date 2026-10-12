import { findSkill, roleSkillGroups, validRoleSkillCodes, type SkillsRegistry, type WorkerSkillRole } from '../../skills';
import { storageGetItem, storageSetItem } from '../../storage';

export interface ShiftSkillPreset { required: string[]; preferred: string[] }
export const supportsShiftSkillPresets = (registry: SkillsRegistry, role: string) => roleSkillGroups(registry, role as WorkerSkillRole).length > 0;

function key(userId: number | string, role: string): string {
  if (!String(userId).trim()) throw new Error('Sign in before saving selections.');
  return `ct:shift-skill-preset:v1:${encodeURIComponent(String(userId))}:${role}`;
}

/** Saved requirements must not silently lose an unknown or role-ineligible mandatory choice. */
export function validateSkillPreset(registry: SkillsRegistry, role: string, preset: ShiftSkillPreset): ShiftSkillPreset {
  if (!supportsShiftSkillPresets(registry, role)) throw new Error('Select a valid role before saving selections.');
  const normalize = (values: string[]) => {
    if (!Array.isArray(values) || values.some(value => typeof value !== 'string')) throw new Error('Selections must be lists of skill IDs.');
    const allowed = new Set(validRoleSkillCodes(registry, role as WorkerSkillRole, values));
    const codes = values.map(value => findSkill(registry, value)?.code);
    if (codes.some(code => !code || !allowed.has(code) || findSkill(registry, code)?.matchable === false)) {
      throw new Error('Remove selections unavailable for this role before saving.');
    }
    return Array.from(new Set(codes as string[]));
  };
  const required = normalize(preset.required);
  const preferred = normalize(preset.preferred);
  if (preferred.some(code => required.includes(code))) throw new Error('A selection cannot be both Required and Preferred.');
  return { required, preferred };
}

export async function loadShiftSkillPreset(registry: SkillsRegistry, userId: number | string, role: string): Promise<ShiftSkillPreset | null> {
  if (!supportsShiftSkillPresets(registry, role)) return null;
  const raw = await storageGetItem(key(userId, role));
  if (!raw) return null;
  try {
    const stored = JSON.parse(raw);
    if (stored?.version !== 1) return null;
    return validateSkillPreset(registry, role, stored);
  } catch {
    return null;
  }
}

export async function saveShiftSkillPreset(registry: SkillsRegistry, userId: number | string, role: string, preset: ShiftSkillPreset): Promise<ShiftSkillPreset> {
  const storageKey = key(userId, role);
  const normalized = validateSkillPreset(registry, role, preset);
  await storageSetItem(storageKey, JSON.stringify({ version: 1, ...normalized }));
  return normalized;
}

/** Only seed untouched new-shift choices; an existing shift or manual choices need explicit application. */
export function canAutoApplySkillPreset(editing: boolean, current: ShiftSkillPreset, defaultPreferred: readonly string[]): boolean {
  return !editing && current.required.length === 0 && current.preferred.every(code => defaultPreferred.includes(code));
}
