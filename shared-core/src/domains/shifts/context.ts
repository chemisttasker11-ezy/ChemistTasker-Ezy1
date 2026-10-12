/** Shift-owned workload vocabulary and accompanying-staff descriptions. */
import { skillId, splitSkillsAndSoftware, validRoleSkillCodes, SOFTWARE_GROUP, type SkillsRegistry, type WorkerSkillRole } from '../../skills';
export interface WorkloadTag { code: string; label: string; icon_web: string; icon_mobile?: string; explainer: string; aliases?: string[]; legacy?: boolean }
export interface SupportRole { code: string; label: string; one: string }
export interface SupportEntry { role: string; count: number }
interface ShiftContextVocabulary { workload_tags: WorkloadTag[]; support_roles: SupportRole[] }
const vocabulary = (registry: SkillsRegistry): ShiftContextVocabulary =>
  ((registry as any).pharmacy_profile || { workload_tags: [], support_roles: [] });
export const workloadTagOptions = (registry: SkillsRegistry) => vocabulary(registry).workload_tags;
export const supportRoles = (registry: SkillsRegistry) => vocabulary(registry).support_roles;

/** Keep unknown vacancy requirements until the poster explicitly removes or replaces them. */
export function normalizeShiftRequirements(registry: SkillsRegistry, values: readonly string[]): string[] {
  return Array.from(new Set(values.map(value => skillId(registry, value) || value)));
}

/** One grouping rule for summary and detail cards on all clients. Required software takes precedence. */
export function shiftRequirementGroups(registry: SkillsRegistry, required: readonly string[] = [], preferred: readonly string[] = []) {
  const must = splitSkillsAndSoftware(registry, required);
  const nice = splitSkillsAndSoftware(registry, preferred);
  const software = [...must.software.map(code => ({ code, required: true })),
    ...nice.software.filter(code => !must.software.includes(code)).map(code => ({ code, required: false }))];
  return { requiredSkills: must.skills, preferredSkills: nice.skills, software };
}

export function workloadTags(registry: SkillsRegistry, values: readonly string[] = []): WorkloadTag[] {
  const tags = workloadTagOptions(registry);
  const result: WorkloadTag[] = [];
  for (const value of values) {
    const key = String(value).trim().toLowerCase();
    const tag = tags.find(item => item.code.toLowerCase() === key || item.label.toLowerCase() === key || (item.aliases || []).some(alias => alias.toLowerCase() === key));
    if (tag && !result.includes(tag)) result.push(tag);
  }
  return result;
}

/** "1 dispensary technician, 2 retail assistants"; empty when the shift lists no support. */
export const normalizeWorkloadTags = (registry: SkillsRegistry, values: readonly string[] = []) => workloadTags(registry, values).map(tag => tag.code);

export function supportSummary(registry: SkillsRegistry, entries: readonly SupportEntry[] = []): string {
  const roles = supportRoles(registry);
  return entries.map(entry => {
    const role = roles.find(item => item.code === entry.role);
    if (!role) return null;
    return `${entry.count} ${entry.count === 1 ? role.one : `${role.one}s`}`;
  }).filter(Boolean).join(', ');
}

/** Role-filtered software defaults, without changing explicitly required capabilities. */
export function pharmacySoftwareDefaults(registry: SkillsRegistry, role: WorkerSkillRole | null, codes: string[]): string[] {
  const software = new Set(registry.skills.filter(skill => skill.group === SOFTWARE_GROUP).map(skill => skill.code));
  return validRoleSkillCodes(registry, role, codes).filter(code => software.has(code));
}

export function mergeSoftwareDefaults(preferred: string[], required: string[], previous: string[], next: string[]): string[] {
  const kept = preferred.filter(code => !previous.includes(code) || next.includes(code));
  return [...kept, ...next.filter(code => !kept.includes(code) && !required.includes(code))];
}

/** Apply a whole-number staffing input; invalid in-progress input leaves the current selection intact. */
export function setSupportCount(registry: SkillsRegistry, entries: SupportEntry[], role: string, raw: string): SupportEntry[] {
  const maximum = (registry as any).pharmacy_profile?.support_count_max ?? 20;
  const count = Number(raw);
  if (!supportRoles(registry).some(item => item.code === role) ||
      (raw && (!/^\d+$/.test(raw) || !Number.isInteger(count) || count < 1 || count > maximum))) return entries;
  const others = entries.filter(entry => entry.role !== role);
  return raw ? [...others, { role, count }] : others;
}

export type RequirementLevel = 'required' | 'preferred' | null;

/** Set one skill's level in the required/preferred lists (a skill is never in both). */
export function setRequirementLevel(required: readonly string[], preferred: readonly string[], code: string, level: RequirementLevel) {
  const nextRequired = required.filter(value => value !== code);
  const nextPreferred = preferred.filter(value => value !== code);
  if (level === 'required') nextRequired.push(code);
  if (level === 'preferred') nextPreferred.push(code);
  return { required: nextRequired, preferred: nextPreferred };
}

/** Short first-view lists for posting a shift: popular skills for the role, then the pharmacy's own software and the most
 * common dispensing systems. Everything stays role-eligible; the full catalogue is browsed separately. */
export function popularShiftChoices(registry: SkillsRegistry, role: WorkerSkillRole | null, pharmacySoftware: readonly string[] = []) {
  const posting = (registry as any).shift_posting || {};
  const eligible = (code: string) => {
    const skill = registry.skills.find(item => item.code === code);
    return Boolean(role && skill && skill.eligibility[role] && skill.eligibility[role] !== 'none');
  };
  const skills: string[] = (role ? posting.popular_by_role?.[role] || [] : []).filter(eligible);
  const software = Array.from(new Set([...pharmacySoftware, ...(posting.popular_software || [])])).filter(eligible);
  return { skills, software };
}

/** Automatic escalation: each wider audience opens `everyHours` after the previous one, starting from `from`. */
export function autoEscalationDates(tiers: readonly string[], everyHours: number, from: Date = new Date()): Record<string, string> {
  const pad = (value: number) => String(value).padStart(2, '0');
  // datetime-local format in the poster's own time zone, as the manual date fields use.
  const local = (date: Date) =>
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  return Object.fromEntries(tiers.map((tier, index) => [tier, local(new Date(from.getTime() + (index + 1) * everyHours * 3_600_000))]));
}
