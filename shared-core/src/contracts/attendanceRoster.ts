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
  worker_id: number;
  worker_name: string;
  is_provisional: boolean;
  timeline: JsonValue[];
}

export interface RosterPeriod {
  period_id: number | null;
  pharmacy_id: number;
  pharmacy_name: string;
  week_start: string;
  week_end: string;
  status: string;
  published_at: string | null;
  published_by: string | null;
  total_assignments: number;
  created: boolean;
  assignments: JsonValue[];
  vacant_slots: JsonValue[];
  staff_view: JsonValue[];
  stacked_view: JsonValue[];
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

