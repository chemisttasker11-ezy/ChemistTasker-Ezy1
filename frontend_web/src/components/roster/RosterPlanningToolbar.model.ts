import type { StaffMemberSummary, DayStackedBucket } from './RosterGridViews.model';

/** Presentation DTOs extracted without modifying API shapes. */
export interface RosterPlanningToolbarProps {
  pharmacyId: number | null;
  calendarDate: Date;
  onRosterUpdated?: () => void;
  onNavigateWeek?: (targetDate: Date) => void;
  activeViewMode?: 'CALENDAR' | 'STAFF' | 'STACKED';
  onViewModeChange?: (mode: 'CALENDAR' | 'STAFF' | 'STACKED') => void;
}

export interface RosterPeriodData {
  draft_revision: number;
  published_revision: number;
  period_id: number | null;
  week_start: string;
  week_end: string;
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  published_at: string | null;
  published_by: string | null;
  total_assignments: number;
  assignments?: any[];
  vacant_slots?: any[];
  staff_view?: StaffMemberSummary[];
  stacked_view?: DayStackedBucket[];
}

export interface ValidationResult {
  is_valid: boolean;
  errors: Array<{ type: string; message: string }>;
  warnings: Array<{ type: string; message: string }>;
  total_assignments: number;
  total_workers: number;
}

export interface AcknowledgementWorker {
  id: number;
  name: string;
  role: string;
  shift_count: number;
  is_acknowledged: boolean;
  acknowledged_at: string | null;
  notes: string;
}

export interface AcknowledgementData {
  period_id: number;
  week_start: string;
  status: string;
  total_workers: number;
  acknowledged_count: number;
  pending_count: number;
  workers: AcknowledgementWorker[];
}

export interface RosterTemplateItem {
  id: number;
  name: string;
  pharmacy_id: number;
  template_data: any[];
  total_slots: number;
  created_at: string;
}

