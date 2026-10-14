import { ENGAGEMENT_LABELS } from "./constants";
import skillsRegistry from "../../../../../../shared-core/skills_registry.json";
import { skillId, skillLabel, newcomerTypeLabel } from "@chemisttasker/shared-core";

const titleCase = (value: string) =>
  value
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/(^|\s)\S/g, (t) => t.toUpperCase());

const formatRoleLabel = (role?: string | null) => {
  if (!role) return "New to pharmacy";
  const code = role.toUpperCase();
  if (code === "EXPLORER") return "New to pharmacy";
  if (code === "OTHER_STAFF") return "Pharmacy team";
  return newcomerTypeLabel(role) ?? titleCase(role);
};

const formatWorkType = (workType?: string | null) => {
  if (!workType) return "";
  return titleCase(workType);
};

const isIsoDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);

const toIsoDate = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

const todayIso = () => toIsoDate(new Date());

const expandAvailabilityEntryDates = (entry: any) => {
  const startDate = String(entry?.date || "");
  if (!isIsoDate(startDate)) return [];
  const isRecurring = Boolean(entry?.isRecurring ?? entry?.is_recurring);
  const recurringDays = entry?.recurringDays ?? entry?.recurring_days ?? [];
  const recurringEndDate = String(entry?.recurringEndDate ?? entry?.recurring_end_date ?? "");
  if (!isRecurring || !Array.isArray(recurringDays) || !recurringDays.length || !isIsoDate(recurringEndDate)) {
    return [startDate];
  }
  const dates: string[] = [];
  const end = new Date(`${recurringEndDate}T00:00:00`);
  for (let cursor = new Date(`${startDate}T00:00:00`), count = 0; cursor <= end && count < 366; cursor.setDate(cursor.getDate() + 1), count += 1) {
    if (recurringDays.includes(cursor.getDay())) dates.push(toIsoDate(cursor));
  }
  return dates;
};

const mapAvailabilityToPitchSlots = (entries: any[]) =>
  entries.flatMap((entry) =>
    expandAvailabilityEntryDates(entry).map((date) => ({
      date,
      startTime: entry?.startTime || entry?.start_time || "09:00",
      endTime: entry?.endTime || entry?.end_time || "17:00",
      isAllDay: Boolean(entry?.isAllDay ?? entry?.is_all_day),
      notes: entry?.notes || "",
    }))
  ).filter((slot) => slot.date >= todayIso());

const allWorkTypes = Object.values(ENGAGEMENT_LABELS);


const codeToLabel = new Map(skillsRegistry.skills.map(skill => [skill.code, skill.label]));
const codeToCategory = new Map(skillsRegistry.skills.map(skill => [
  skill.code,
  skill.group === "Clinical Services" ? "clinical_services" :
  skill.group === "Software & Digital" ? "dispense_software" : "expanded_scope"
] as const));
const resolveTalentSkillCode = (value: string) => skillId(skillsRegistry as any, value);
const resolveTalentSkillLabel = (value: string) => skillLabel(skillsRegistry as any, value);

export { formatRoleLabel, formatWorkType, mapAvailabilityToPitchSlots, allWorkTypes, codeToLabel, codeToCategory, resolveTalentSkillCode, resolveTalentSkillLabel, isIsoDate, todayIso };
