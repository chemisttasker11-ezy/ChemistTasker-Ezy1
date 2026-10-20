import { describe, expect, it, vi } from "vitest";
import type { WorkNoteApi } from "@chemisttasker/shared-core";
import { copyResultMessage, editNoteForm, emptyNoteForm, notePayload, applySavedTask, weekRange } from "../src/pages/dashboard/sidebar/PharmacyCalendarPage.model";
import { addDashboardScopeParams } from "../src/layouts/dashboardRouteScope";

vi.mock("../src/utils/apiClient", () => ({ default: {} }));

const note: WorkNoteApi = {
    id: 8, pharmacy: 101, date: "2027-01-06", series_date: "2026-12-28", title: "Opening", body: "Details",
    status: "open", is_planner_task: true, is_clinical: true, start_time: "09:00:00", end_time: "10:00:00",
    notify_on_shift_start: false, is_general: false,
    recurrence: { freq: "WEEKLY", interval: 2, byweekday: [0, 2], until_date: "2027-04-01" },
    assignees: [{ id: 4, membership_id: 702, user_id: 2, user_name: "Worker", notified_at: null, created_at: "" }],
    created_by: 1, created_by_name: "Owner", created_at: "", updated_at: "2026-12-20T00:00:00.123456Z",
};

describe("Calendar Plan model", () => {
    it.each([
        ["2027-01-01", "2026-12-28", "2027-01-03"],
        ["2026-11-01", "2026-10-26", "2026-11-01"],
        ["2026-10-19", "2026-10-19", "2026-10-25"],
    ])("fetches the complete Monday–Sunday week for %s", (day, from, to) => {
        expect(weekRange(new Date(`${day}T00:00:00`))).toEqual({ from, to });
    });
    it("adds live, unassigned planner tasks with notifications off", () => {
        const form = emptyNoteForm(new Date("2026-12-31T00:00:00"), true);
        form.title = "  Opening  ";
        expect(notePayload(form, 101)).toMatchObject({ title: "Opening", date: "2026-12-31", isPlannerTask: true,
            assigneeMembershipIds: [], notifyOnShiftStart: false, recurrence: null, startTime: null, endTime: null });
    });
    it("retains informal-note defaults and general-note assignments", () => {
        const form = emptyNoteForm(new Date());
        expect(notePayload(form, 101).isPlannerTask).toBe(false);
        expect(notePayload({ ...form, isGeneral: true, assigneeIds: [702] }, 101).assigneeMembershipIds).toEqual([]);
    });
    it("edits from the series start, preserving weekdays and the exact stale token", () => {
        const payload = notePayload(editNoteForm(note), 101);
        expect(payload.date).toBe("2026-12-28");
        expect(payload.recurrence).toEqual(note.recurrence);
        expect(payload.updatedAt).toBe(note.updated_at);
        expect(editNoteForm({ ...note, series_date: undefined, date: "2026-12-28" }).date).toBe("2026-12-28");
    });
    it("locks dates and assignees once a planner task has any completions", () => {
        expect(editNoteForm(note, 1).locked).toBe(true);
        expect(editNoteForm({ ...note, completed_count: 1 }).locked).toBe(true);
        expect(editNoteForm(note).locked).toBe(false);
    });
    it("uses saved defaults without changing the chosen day, people or repeats", () => {
        const form = editNoteForm(note);
        const saved = { id: 1, pharmacy: 101, title: "Saved", details: "Reusable details", start_time: null, end_time: null, is_clinical: false };
        const used = applySavedTask(form, saved);
        expect(used).toMatchObject({ title: "Saved", body: "Reusable details", date: form.date, assigneeIds: [702], recurrence: form.recurrence, isClinical: false, startTime: "" });
        saved.title = "Changed later";
        expect(used.title).toBe("Saved");
    });
    it("reports copied, skipped repeating and dropped people by name", () => {
        expect(copyResultMessage({ created: 3, task_ids: [1, 2, 3], skipped_series: 2,
            dropped_assignees: [{ task_id: 1, membership_id: 9, name: "Alex" }] })).toBe("3 copied; 2 repeating skipped; 1 people dropped: Alex.");
    });
    it("keeps dashboard pharmacy scope on the calendar", () => {
        const url = new URL(addDashboardScopeParams("/dashboard/owner/calendar?date=2027-01-01", 101), "http://test");
        expect(Object.fromEntries(url.searchParams)).toMatchObject({ pharmacy_id: "101", pharmacy: "101", workspace: "internal", date: "2027-01-01" });
    });
});
