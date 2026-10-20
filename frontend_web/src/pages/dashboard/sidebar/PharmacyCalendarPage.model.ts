import apiClient from "../../../utils/apiClient";
import { addDays, format, startOfWeek } from "date-fns";
import type { CalendarRecurrence, PlannerCopyResult, SavedTaskApi, WorkNoteApi } from "@chemisttasker/shared-core";

export type CalendarNoteForm = {
    title: string;
    body: string;
    date: string;
    notify: boolean;
    isGeneral: boolean;
    isPlannerTask: boolean;
    isClinical: boolean;
    startTime: string;
    endTime: string;
    assigneeIds: number[];
    updatedAt?: string;
    locked: boolean;
    recurrence: { freq: "NONE" | CalendarRecurrence["freq"]; interval: number; until: string; byweekday: number[] };
};

export function weekRange(day: Date) {
    const monday = startOfWeek(day, { weekStartsOn: 1 });
    return { from: format(monday, "yyyy-MM-dd"), to: format(addDays(monday, 6), "yyyy-MM-dd") };
}

export function emptyNoteForm(day: Date, planner = false): CalendarNoteForm {
    return { title: "", body: "", date: format(day, "yyyy-MM-dd"), notify: false, isGeneral: false,
        isPlannerTask: planner, isClinical: false, startTime: "", endTime: "", assigneeIds: [], locked: false,
        recurrence: { freq: "NONE", interval: 1, until: "", byweekday: [] } };
}

export function editNoteForm(note: WorkNoteApi, completedCount = 0): CalendarNoteForm {
    return { title: note.title, body: note.body, date: note.series_date ?? note.date,
        notify: note.notify_on_shift_start, isGeneral: note.is_general, isPlannerTask: note.is_planner_task,
        isClinical: note.is_clinical, startTime: note.start_time?.slice(0, 5) ?? "", endTime: note.end_time?.slice(0, 5) ?? "",
        assigneeIds: note.assignees.map(a => a.membership_id), updatedAt: note.updated_at,
        locked: note.is_planner_task && (completedCount > 0 || (note.completed_count ?? 0) > 0),
        recurrence: { freq: note.recurrence?.freq ?? "NONE", interval: note.recurrence?.interval ?? 1,
            until: note.recurrence?.until_date ?? "", byweekday: note.recurrence?.byweekday ?? [] } };
}

export function notePayload(form: CalendarNoteForm, pharmacy: number) {
    return { pharmacy, title: form.title.trim(), body: form.body, date: form.date,
        notifyOnShiftStart: form.notify, isGeneral: form.isPlannerTask ? false : form.isGeneral,
        isPlannerTask: form.isPlannerTask, isClinical: form.isClinical,
        startTime: form.startTime || null, endTime: form.endTime || null,
        assigneeMembershipIds: form.isGeneral && !form.isPlannerTask ? [] : form.assigneeIds,
        updatedAt: form.updatedAt,
        recurrence: form.recurrence.freq === "NONE" ? null : {
            freq: form.recurrence.freq, interval: form.recurrence.interval,
            until_date: form.recurrence.until || null, byweekday: form.recurrence.byweekday,
        } };
}

export function copyResultMessage(result: PlannerCopyResult) {
    const dropped = [...new Set(result.dropped_assignees.map(person => person.name))];
    return `${result.created} copied; ${result.skipped_series} repeating skipped; ${result.dropped_assignees.length} people dropped${dropped.length ? `: ${dropped.join(", ")}` : ""}.`;
}

export function applySavedTask(form: CalendarNoteForm, task: SavedTaskApi): CalendarNoteForm {
    return { ...form, title: task.title, body: task.details, startTime: task.start_time?.slice(0, 5) ?? "",
        endTime: task.end_time?.slice(0, 5) ?? "", isClinical: task.is_clinical };
}

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
