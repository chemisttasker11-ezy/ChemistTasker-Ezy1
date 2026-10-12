/** Pharmacy-owned service vocabulary, script volumes and software configuration. */
import { normalizeSkillIds, SOFTWARE_GROUP, type SkillsRegistry } from '../../skills';

export interface ScriptVolumeBand { code: string; label: string; range: string; level: number; color: string }
interface PharmacyVocabulary { service_codes: string[]; script_volume_bands: ScriptVolumeBand[] }
const vocabulary = (registry: SkillsRegistry): PharmacyVocabulary =>
  ((registry as any).pharmacy_profile || { service_codes: [], script_volume_bands: [] });
export const pharmacyServiceCodes = (registry: SkillsRegistry) => vocabulary(registry).service_codes;
export const scriptVolumeBands = (registry: SkillsRegistry) => vocabulary(registry).script_volume_bands;
export const scriptVolumeBand = (registry: SkillsRegistry, code?: string | null) =>
  scriptVolumeBands(registry).find(band => band.code === code) || null;

/** A pharmacy runs at most one product per software category; returns the codes grouped by category. */
export function pharmacySoftwareByCategory(registry: SkillsRegistry, codes: readonly string[]): Record<string, string> {
  const byCategory: Record<string, string> = {};
  for (const code of normalizeSkillIds(registry, codes)) {
    const skill = registry.skills.find(item => item.code === code);
    if (skill?.group === SOFTWARE_GROUP && skill.subgroup && !byCategory[skill.subgroup]) byCategory[skill.subgroup] = code;
  }
  return byCategory;
}
