export interface CalendarRecurrence {
    freq: 'DAILY' | 'WEEKLY' | 'MONTHLY';
    interval?: number;
    until_date?: string | null;
    byweekday?: number[];
}

/** Raw fields from team_calendar.serializers; date/time strings retain backend formatting. */
export interface WorkNoteAssigneeApi {
    id: number;
    membership_id: number;
    user_id: number | null;
    user_name: string;
    notified_at: string | null;
    created_at: string;
}
export interface WorkNoteApi {
    id: number | string;
    pharmacy: number;
    date: string;
    title: string;
    body: string;
    status: string;
    is_planner_task: boolean;
    is_clinical: boolean;
    start_time: string | null;
    end_time: string | null;
    notify_on_shift_start: boolean;
    is_general: boolean;
    recurrence?: CalendarRecurrence | null;
    series_id?: number;
    series_date?: string;
    occurrence_date?: string;
    is_occurrence?: boolean;
    assignees: WorkNoteAssigneeApi[];
    completed_by?: string[];
    completed_count?: number;
    created_by: number | null;
    created_by_name: string;
    created_at: string;
    updated_at: string;
}
export interface CalendarEventApi {
    id: number | string;
    pharmacy: number | null;
    organization: number | null;
    title: string;
    description: string;
    date: string;
    start_time: string | null;
    end_time: string | null;
    all_day: boolean;
    recurrence?: CalendarRecurrence | null;
    series_id?: number;
    series_date?: string;
    occurrence_date?: string;
    is_occurrence?: boolean;
    source: string;
    source_display: string;
    source_membership: number | null;
    is_read_only: boolean;
    created_by: number | null;
    created_by_name: string;
    created_at: string;
    updated_at: string;
}
export interface CalendarFeedApi {
    events: CalendarEventApi[];
    work_notes: WorkNoteApi[];
    date_from: string;
    date_to: string;
    pharmacy_id: number | null;
    organization_id: number | null;
}

export interface SavedTaskApi {
    id: number;
    pharmacy: number;
    title: string;
    details: string;
    start_time: string | null;
    end_time: string | null;
    is_clinical: boolean;
}
export type SavedTaskInput = Omit<SavedTaskApi, 'id' | 'details' | 'start_time' | 'end_time' | 'is_clinical'> &
    Partial<Pick<SavedTaskApi, 'details' | 'start_time' | 'end_time' | 'is_clinical'>>;
export interface OperationsContext {
    pharmacies: Array<{ id: number; name: string; organization_id: number | null }>;
}
export interface PlannerCopyInput {
    pharmacy: number;
    source_from: string;
    source_to: string;
    task_id?: number | null;
    day_offset: number;
    request_key: string;
}
export interface PlannerCopyResult {
    created: number;
    task_ids: number[];
    skipped_series: number;
    dropped_assignees: Array<{ task_id: number; membership_id: number; name: string }>;
}
export interface PlannerRosterInput {
    pharmacy: number;
    date: string;
    start_time?: string | null;
    end_time?: string | null;
    is_clinical?: boolean;
    role?: string;
}
