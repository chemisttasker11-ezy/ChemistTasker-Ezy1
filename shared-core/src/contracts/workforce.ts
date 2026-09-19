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
  employment_engagement_public_id: string | null;
}

export interface WorkforceTimesheetDetail extends WorkforceTimesheetRow {
  snapshot: {
    worker: { id: number; name: string };
    pharmacy: { id: number; name: string };
    period: { id: number; start_date: string; end_date: string; timezone: string };
    employment_engagements: WorkforceTimesheetEmploymentEngagement[];
    days: WorkforceTimesheetDay[];
    leave: unknown[];
    totals: Record<string, number | null>;
  };
  checks: WorkforceTimesheetCheck[];
  effective_blocking_checks: number;
  effective_warning_checks: number;
  comments: Array<{ id: number; author_id: number; author_name: string; body: string; worker_visible: boolean; created_at: string }>;
}

export interface WorkforcePayrollConfiguration {
  pharmacy_id: number;
  pharmacy_name: string;
  use_chemisttasker_payroll: boolean;
  requirements: {
    staff_employment_terms: string;
    worker_payment_details: string;
    when_disabled: string;
    abn_workers: string;
  };
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
  employment_engagement_eligible: boolean;
  award_classification_options: Array<{ value: string; label: string; help?: string }>;
  default_award_classification: string;
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


export interface WorkforceOrdinaryHoursDay {
  weekday: number;
  weekday_label: string;
  start_time: string;
  end_time: string;
  meal_break_start: string | null;
  meal_break_minutes: number;
  ordinary_minutes: number;
}

export interface WorkforceOrdinaryHoursPattern {
  days: WorkforceOrdinaryHoursDay[];
  weekly_ordinary_minutes: number;
  weekly_ordinary_hours: string;
  variation_must_be_in_writing: boolean;
  overtime_above_agreed_hours: boolean;
  award_clause: string;
}

export interface WorkforceEmploymentCorrespondence {
  key: string;
  label: string;
  employment_type?: string;
  pay_basis?: string;
  award_code?: string;
  award_classification?: string;
  award_source_label?: string;
  award_source_url?: string;
  ordinary_hours_pattern?: WorkforceOrdinaryHoursPattern | Record<string, never>;
  rates?: {
    weekday: string;
    saturday: string;
    sunday: string;
    public_holiday: string;
    early_morning: string | null;
    late_night: string | null;
  };
}

export interface WorkforceTimesheetEmploymentEngagement {
  public_id: string;
  membership_id: number;
  effective_from: string;
  effective_to: string | null;
  role: string;
  employment_type: string;
  job_title: string;
  pay_basis: WorkforceEngagementPayBasis;
  award_code: string;
  award_classification: string;
  award_source_label: string;
  award_source_url: string;
  award_effective_from: string | null;
  award_rate_snapshot: Record<string, unknown>;
  adult_rate_confirmed: boolean | null;
  ordinary_hours_pattern: WorkforceOrdinaryHoursPattern | Record<string, never>;
  correspondence: Pick<WorkforceEmploymentCorrespondence, 'key' | 'label'>;
  rates: {
    weekday: string;
    saturday: string;
    sunday: string;
    public_holiday: string;
    early_morning: string | null;
    late_night: string | null;
    early_morning_applicable: boolean;
    late_night_applicable: boolean;
  };
}

export type WorkforceEngagementPayBasis = 'AWARD' | 'ABOVE_AWARD';

export interface WorkforceEmploymentEngagement {
  id: number;
  public_id: string;
  membership_id: number;
  pharmacy_id: number;
  worker_id: number;
  worker_name: string;
  role: string;
  employment_type: 'FULL_TIME' | 'PART_TIME' | 'CASUAL';
  job_title: string;
  effective_from: string;
  effective_to: string | null;
  pay_basis: WorkforceEngagementPayBasis;
  award_code: string;
  award_classification: string;
  award_source_label: string;
  award_source_url: string;
  award_effective_from: string | null;
  award_rate_snapshot: Record<string, unknown>;
  adult_rate_confirmed: boolean | null;
  ordinary_hours_pattern: WorkforceOrdinaryHoursPattern | Record<string, never>;
  correspondence: WorkforceEmploymentCorrespondence;
  rate_weekday: string;
  rate_saturday: string;
  rate_sunday: string;
  rate_public_holiday: string;
  rate_early_morning: string | null;
  rate_late_night: string | null;
  early_morning_applicable: boolean;
  late_night_applicable: boolean;
  notes: string;
  created_at: string;
  updated_at: string;
  terms_editable?: boolean;
}

export interface WorkforceAwardPreview {
  award_code: string;
  award_source_label: string;
  award_source_url: string;
  award_reference_url?: string;
  award_effective_from: string;
  award_effective_basis?: string;
  rate_scope?: string;
  date_of_birth?: string | null;
  age_at_effective_date?: number | null;
  junior_percentage?: string | null;
  next_rate_review_date?: string | null;
  role: string;
  classification: string;
  classification_label: string;
  employment_type: string;
  minimum_hourly_rate: string;
  schedule: Record<string, Record<string, string>>;
  window_labels?: Record<string, Record<string, string>>;
  ordinary_hours_note?: string;
  junior_rate_note?: string;
  rate_weekday: string;
  rate_saturday: string;
  rate_sunday: string;
  rate_public_holiday: string;
  rate_early_morning: string;
  rate_late_night: string;
  early_morning_applicable: boolean;
  late_night_applicable: boolean;
  classification_options: Array<{ value: string; label: string; help?: string }>;
  default_classification: string;
}

export interface WorkforceEmploymentEngagementWrite {
  membership_id: number;
  supersedes_public_id?: string;
  effective_from: string;
  effective_to?: string | null;
  employment_type?: 'FULL_TIME' | 'PART_TIME' | 'CASUAL';
  job_title?: string;
  pay_basis: WorkforceEngagementPayBasis;
  award_classification?: string;
  adult_rate_confirmed?: boolean;
  ordinary_hours_pattern?: {
    days: Array<{
      weekday: number;
      start_time: string;
      end_time: string;
      meal_break_start?: string | null;
      meal_break_minutes?: number;
    }>;
  };
  rate_weekday?: string | number;
  rate_saturday?: string | number;
  rate_sunday?: string | number;
  rate_public_holiday?: string | number;
  rate_early_morning?: string | number | null;
  rate_late_night?: string | number | null;
  early_morning_applicable?: boolean;
  late_night_applicable?: boolean;
  notes?: string;
}
