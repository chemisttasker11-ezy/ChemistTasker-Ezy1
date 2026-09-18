export type WorkforceCheckSeverity = 'BLOCKER' | 'WARNING' | 'INFO';
export type WorkforceTimesheetStatus = 'OPEN' | 'NEEDS_REVIEW' | 'READY' | 'SUBMITTED' | 'APPROVED' | 'REOPENED';

export interface WorkforceRosterWarning {
  type: string;
  message: string;
  warning_key?: string;
  assignment_id?: number;
  user_id?: number;
  date?: string;
}

export interface WorkforceCoverageRow {
  requirement_id: number;
  date: string;
  role: string;
  start_time: string;
  end_time: string;
  minimum_staff: number;
  scheduled_staff: number;
  assignment_ids: number[];
  is_covered: boolean;
  shortfall: number;
}

export interface WorkforceRosterWorkspace {
  period_id: number | null;
  week_start: string;
  week_end: string;
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  draft_revision: number;
  published_revision: number;
  validated_revision: number | null;
  validation: {
    is_valid: boolean;
    errors: Array<{ type: string; message: string; assignment_id?: number }>;
    warnings: WorkforceRosterWarning[];
    total_assignments: number;
    total_workers: number;
  };
  grid: unknown;
  coverage_view: WorkforceCoverageRow[];
  summary: { staff_count: number; shift_count: number; vacancy_count: number; coverage_shortfalls: number };
}

export interface WorkforceTimesheetPeriod {
  id: number;
  pharmacy_id: number;
  start_date: string;
  end_date: string;
  status: 'OPEN' | 'REVIEW' | 'APPROVED' | 'LOCKED';
  timezone: string;
  locked_at?: string | null;
}

export interface WorkforceTimesheetSummary {
  period_id: number;
  pharmacy_id: number;
  start_date: string;
  end_date: string;
  status: string;
  total_timesheets: number;
  blocking_timesheets: number;
  warning_checks: number;
  pending_leave_requests: number;
  open_sessions: number;
  ready_timesheets: number;
}

export interface WorkforceTimesheetRow {
  id: number;
  period_id: number;
  worker: { id: number; name: string };
  membership_id: number | null;
  status: WorkforceTimesheetStatus;
  needs_rebuild: boolean;
  revision_number: number | null;
  rostered_minutes: number;
  planned_break_minutes: number;
  contracted_minutes: number | null;
  worked_minutes: number;
  approved_leave_minutes: number;
  reviewed_minutes: number;
  blocking_checks: number;
  warning_checks: number;
  comments_count: number;
  last_built_at: string | null;
}

export interface WorkforceTimesheetCheck {
  id: number;
  identity_key: string;
  code: string;
  severity: WorkforceCheckSeverity;
  work_date: string | null;
  message: string;
  details: Record<string, unknown>;
  decision?: { decision: 'RESOLVED' | 'WAIVED' | 'REOPENED'; reason: string; decided_by: number; created_at: string } | null;
}

export interface WorkforceTimesheetDay {
  date: string;
  session_id: number | null;
  assignment_id: number | null;
  actual_start: string | null;
  actual_end: string | null;
  recorded_break_minutes: number;
  worked_minutes: number;
  rostered_start: string | null;
  rostered_end: string | null;
  planned_break_minutes: number;
}

export interface WorkforceTimesheetDetail extends WorkforceTimesheetRow {
  snapshot: {
    worker: { id: number; name: string };
    pharmacy: { id: number; name: string };
    period: { id: number; start_date: string; end_date: string; timezone: string };
    days: WorkforceTimesheetDay[];
    leave: unknown[];
    totals: Record<string, number | null>;
  };
  checks: WorkforceTimesheetCheck[];
  effective_blocking_checks: number;
  effective_warning_checks: number;
  comments: Array<{ id: number; author_id: number; author_name: string; body: string; worker_visible: boolean; created_at: string }>;
}

export interface WorkforceCoverageRequirement {
  id: number;
  weekday: number;
  start_time: string;
  end_time: string;
  role: string;
  minimum_staff: number;
  active: boolean;
}

export interface WorkforceWorkSettings {
  membership_id: number;
  worker_id: number;
  worker_name: string;
  role: string;
  employment_type: string;
  contracted_weekly_minutes: number | null;
  effective_from: string | null;
  work_pattern: Record<string, unknown>;
}

export interface WorkforceLeave {
  id: number;
  pharmacy_name?: string;
  leave_type: string;
  start_at: string;
  end_at: string;
  status: string;
  note?: string;
  [key: string]: unknown;
}

export type WorkforceMyHoursRow = WorkforceTimesheetRow & {
  pharmacy: { id: number; name: string };
  start_date: string;
  end_date: string;
};
