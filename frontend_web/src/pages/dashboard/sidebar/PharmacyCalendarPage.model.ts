export type ItemType = "all" | "events" | "notes" | "birthdays";

export const WEEKDAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

export const toDate = (value?: string | null) =>
    value ? new Date(`${value}T00:00:00`) : null;

export const ROLE_LABELS: Record<string, string> = {
    PHARMACIST: "Pharmacist",
    INTERN: "Intern Pharmacist",
    TECHNICIAN: "Dispensary Technician",
    ASSISTANT: "Pharmacy Assistant",
    STUDENT: "Pharmacy Student",
    CONTACT: "Contact",
};

export const EMPLOYMENT_TYPE_LABELS: Record<string, string> = {
    FULL_TIME: "Full-time",
    PART_TIME: "Part-time",
    LOCUM: "Locum",
    CASUAL: "Casual",
    SHIFT_HERO: "Shift Hero",
};

export const formatChoiceLabel = (value: any, labels: Record<string, string>) => {
    const key = String(value ?? "").trim().toUpperCase();
    return key
        ? labels[key] ??
            key
                .replace(/_/g, " ")
                .toLowerCase()
                .replace(/\b\w/g, (char) => char.toUpperCase())
        : "";
};
