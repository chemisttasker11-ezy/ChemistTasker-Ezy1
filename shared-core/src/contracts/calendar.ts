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
    id: number;
    pharmacy: number;
    date: string;
    title: string;
    body: string;
    status: string;
    operation?: {
        task_id: number;
        plan_id: number;
        area: string;
        progress: {
            status: string;
            assigned: number;
            completed: number;
            kpi_actual: number;
            verified: boolean;
        };
        requires_verification: boolean;
        target_value: number | null;
        target_unit: string;
        target_kind: string;
        training_url: string;
    } | null;
    notify_on_shift_start: boolean;
    is_general: boolean;
    recurrence?: string;
    assignees: WorkNoteAssigneeApi[];
    created_by: number | null;
    created_by_name: string;
    created_at: string;
    updated_at: string;
}
export interface CalendarEventApi {
    id: number;
    pharmacy: number | null;
    organization: number | null;
    title: string;
    description: string;
    date: string;
    start_time: string | null;
    end_time: string | null;
    all_day: boolean;
    recurrence?: string;
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
