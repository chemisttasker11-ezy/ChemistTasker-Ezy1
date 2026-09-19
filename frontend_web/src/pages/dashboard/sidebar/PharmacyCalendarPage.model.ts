import apiClient from "../../../utils/apiClient";

export type ItemType = "all" | "events" | "notes" | "birthdays";

export type CalendarItem = {
    id: number | string;
    seriesId?: number;
    isOccurrence?: boolean;
    type: "event" | "note" | "birthday";
    title: string;
    date: Date;
    time?: string;
    allDay?: boolean;
    source: string;
    assignees?: string[];
    assigneeMembershipIds?: number[];
    status?: string;
    completedBy?: string[];
    readOnly?: boolean;
    description?: string;
    eventData?: any;
    noteData?: any;
};

export const WEEKDAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

export const normalizeList = (data: any) =>
    Array.isArray(data?.results)
        ? data.results
        : Array.isArray(data)
            ? data
            : [];

export const fetchJson = async (path: string, params?: Record<string, any>) => {
    const res = await apiClient.get(path, { params });
    return res.data;
};

export const postJson = async (
    path: string,
    body: any = null,
    method: "POST" | "PATCH" | "DELETE" = "POST"
) => {
    if (method === "DELETE") {
        const res = await apiClient.delete(path);
        return res.data;
    }
    const res = await apiClient.request({ url: path, method, data: body });
    return res.data;
};

export const toDate = (value?: string | null) =>
    value ? new Date(`${value}T00:00:00`) : null;

export const formatTimeRange = (start?: string | null, end?: string | null) => {
    if (!start && !end) return undefined;
    const trim = (time?: string | null) => (time ? time.slice(0, 5) : "");
    return [trim(start), trim(end)].filter(Boolean).join(" - ");
};

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
