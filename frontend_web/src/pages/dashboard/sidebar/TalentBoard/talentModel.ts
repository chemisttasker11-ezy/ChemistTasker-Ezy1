import { ENGAGEMENT_LABELS } from "./constants";
import skillsCatalog from "../../../../../../shared-core/skills_catalog.json";

const titleCase = (value: string) =>
  value
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/(^|\s)\S/g, (t) => t.toUpperCase());

const formatRoleLabel = (role?: string | null) => {
  if (!role) return "Explorer";
  return titleCase(role);
};

const formatWorkType = (workType?: string | null) => {
  if (!workType) return "";
  return titleCase(workType);
};

const mapRoleToShiftRole = (value?: string | null) => {
  if (!value) return "";
  const normalized = value.trim().toUpperCase().replace(/\s+/g, "_");
  if (["PHARMACIST", "INTERN", "STUDENT", "ASSISTANT", "TECHNICIAN", "EXPLORER"].includes(normalized)) {
    return normalized;
  }
  if (normalized.includes("OTHER_STAFF")) return "ASSISTANT";
  if (normalized.includes("COMMUNITY_PHARMACIST")) return "PHARMACIST";
  if (normalized.includes("DISPENSARY_TECHNICIAN")) return "TECHNICIAN";
  if (normalized.includes("PHARMACY_TECHNICIAN")) return "TECHNICIAN";
  if (normalized.includes("PHARMACY_ASSISTANT")) return "ASSISTANT";
  if (normalized.includes("PHARMACIST")) return "PHARMACIST";
  if (normalized.includes("TECHNICIAN")) return "TECHNICIAN";
  if (normalized.includes("ASSISTANT")) return "ASSISTANT";
  if (normalized.includes("INTERN")) return "INTERN";
  if (normalized.includes("STUDENT")) return "STUDENT";
  return "";
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


type SkillItem = {
  code: string;
  label: string;
  description?: string;
  requires_certificate?: boolean;
};

type RoleCatalog = {
  clinical_services: SkillItem[];
  dispense_software: SkillItem[];
  expanded_scope: SkillItem[];
};

type SkillsCatalog = {
  pharmacist: RoleCatalog;
  otherstaff: RoleCatalog;
};

const catalog = skillsCatalog as SkillsCatalog;

const buildSkillMaps = () => {
  const codeToLabel = new Map<string, string>();
  const codeToCategory = new Map<string, "clinical_services" | "dispense_software" | "expanded_scope">();
  (["pharmacist", "otherstaff"] as const).forEach((roleKey) => {
    const role = catalog[roleKey];
    if (!role) return;
    (["clinical_services", "dispense_software", "expanded_scope"] as const).forEach((category) => {
      role[category]?.forEach((item) => {
        if (!item?.code) return;
        if (!codeToLabel.has(item.code)) codeToLabel.set(item.code, item.label || item.code);
        if (!codeToCategory.has(item.code)) codeToCategory.set(item.code, category);
      });
    });
  });
  return { codeToLabel, codeToCategory };
};

const { codeToLabel, codeToCategory } = buildSkillMaps();


export { formatRoleLabel, formatWorkType, mapRoleToShiftRole, mapAvailabilityToPitchSlots, allWorkTypes, codeToLabel, codeToCategory, isIsoDate, todayIso };
