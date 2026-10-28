import type { JsonValue } from './publicContent';

export interface AttendanceWorkerStatus {
  has_active_session: boolean;
  session_id: number | null;
  pharmacy_id: number | null;
  pharmacy_name: string | null;
  started_at: string | null;
  is_provisional: boolean;
  is_on_break: boolean;
  last_event_type: string | null;
  cover_type?: string | null;
}

export interface AttendanceClockResult {
  session_id: number;
  pharmacy_id: number;
  pharmacy_name: string;
  started_at: string;
  ended_at?: string | null;
  is_provisional?: boolean;
  status: 'CLOCKED_IN' | 'CLOCKED_OUT';
}

export interface AttendanceClockOptions {
  confirm_opposite?: boolean;
  request_id?: string;
}

export interface AttendanceConfirmRequiredResponse {
  code: 'CONFIRM_OPPOSITE_ACTION';
  last_action: 'CLOCK_IN' | 'CLOCK_OUT';
  last_action_at: string;
  pending_action: 'CLOCK_IN' | 'CLOCK_OUT';
  message: string;
}

export interface AttendanceBreakResult {
  status: 'ON_BREAK' | 'WORKING';
  event_id: number;
  started_at?: string;
  ended_at?: string;
}

export interface AttendancePinPharmacy {
  id: number;
  name: string;
  has_pin: boolean;
}

export interface PendingAttendance {
  provisional_id: number;
  session_id: number;
  worker_id: number;
  worker_name: string;
  worker_email: string;
  started_at: string;
  ended_at: string | null;
  cover_type: string;
  source_pharmacy_name: string | null;
  status: string;
  decision_reason: string;
  created_at: string;
}

export interface AttendanceTimeline {
  session_id: number;
  pharmacy_id: number;
  pharmacy_name: string;
  pharmacy_timezone: string;
  worker_id: number;
  worker_name: string;
  is_provisional: boolean;
  timeline: JsonValue[];
}

/** Wire projections from workforce.roster.periods.get_roster_period_grid. */
export interface RosterGridSlot {
  slot_id: number;
  shift_id: number;
  date: string;
  start_time: string;
  end_time: string;
  role_needed: string;
  editable: boolean;
  planned_break_minutes: number;
  is_unpublished: boolean;
}
export interface RosterGridAssignment extends RosterGridSlot {
  id: number;
  worker_id: number;
  worker_name: string;
  worker_role: string;
  is_rostered: boolean;
}
export interface RosterStaffShift {
  assignment_id: number;
  slot_id: number;
  date: string;
  start_time: string;
  end_time: string;
  hours: number;
  editable: boolean;
  planned_break_minutes: number;
  role: string;
  is_unpublished: boolean;
}
export interface RosterStaffSummary {
  worker_id: number;
  worker_name: string;
  role: string;
  total_shifts: number;
  total_hours: number;
  shifts: RosterStaffShift[];
}
export interface RosterStackedSlot {
  type: 'ASSIGNED' | 'VACANT';
  slot_id: number;
  editable: boolean;
  planned_break_minutes: number;
  assignment_id?: number;
  worker_id?: number;
  worker_name?: string;
  start_time: string;
  end_time: string;
  role: string;
  is_unpublished: boolean;
}
export interface RosterStackedDay {
  date: string;
  total_shifts: number;
  vacant_count: number;
  shifts: RosterStackedSlot[];
}

export interface RosterPeriod {
  draft_revision: number;
  published_revision: number;
  period_id: number | null;
  pharmacy_id: number;
  pharmacy_name: string;
  week_start: string;
  week_end: string;
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  published_at: string | null;
  published_by: string | null;
  total_assignments: number;
  created: boolean;
  assignments: RosterGridAssignment[];
  vacant_slots: RosterGridSlot[];
  staff_view: RosterStaffSummary[];
  stacked_view: RosterStackedDay[];
}

export interface RosterTemplate {
  id: number;
  name: string;
  pharmacy_id: number;
  template_data: JsonValue[];
  total_slots: number;
  created_at: string;
  updated_at?: string;
}

export interface RosterActionResult {
  status: string;
  request_id: number;
  message: string;
  assignment_id?: number;
  audit_id?: number;
  target_user_id?: number;
  new_assigned_user_id?: number;
  shift_id?: number | null;
  visibility?: string | null;
}

export interface RosterAudit {
  id: number;
  action_type: string;
  performed_by: string | null;
  target_user: string | null;
  shift_assignment_id: number | null;
  details: Record<string, JsonValue>;
  created_at: string;
}



export interface PendingKioskReview {
  event_id: string;
  employee_id: number;
  worker_name: string;
  event_type: string;
  device_id: number;
  device_name: string;
  pharmacy_timezone: string;
  device_timestamp: string;
  trusted_time_estimate: string | null;
  received_at: string;
  integrity_flags: string[];
  can_approve: boolean;
  approval_block_reason: string | null;
}

export interface DecideKioskReviewPayload {
  event_id: string;
  decision: 'APPROVED' | 'REJECTED';
  reason: string;
  corrected_timestamp?: string;
}

export interface KioskReviewDecisionResponse {
  decision: string;
  review_id: number;
  attendance_event_id: number | null;
}
