import { BRAND_COLORS } from '../../constants/brandTheme';

export interface StaffShiftItem {
  assignment_id: number;
  slot_id: number;
  date: string;
  start_time: string;
  end_time: string;
  hours: number;
  editable?: boolean;
  planned_break_minutes?: number;
  role: string;
}

export interface StaffMemberSummary {
  worker_id: number;
  worker_name: string;
  role: string;
  total_shifts: number;
  total_hours: number;
  shifts: StaffShiftItem[];
}

export interface StackedShiftItem {
  type: 'ASSIGNED' | 'VACANT';
  editable?: boolean;
  planned_break_minutes?: number;
  assignment_id?: number;
  slot_id?: number;
  worker_id?: number;
  worker_name?: string;
  start_time: string;
  end_time: string;
  role: string;
}

export interface DayStackedBucket {
  date: string;
  total_shifts: number;
  vacant_count: number;
  shifts: StackedShiftItem[];
}

export interface RosterGridViewsProps {
  viewMode: 'STAFF' | 'STACKED';
  staffViewData: StaffMemberSummary[];
  stackedViewData: DayStackedBucket[];
  weekStart: string;
  weekEnd: string;
  periodId?: number | null;
  pharmacyId?: number | null;
  vacantSlots?: any[];
  onRosterUpdated?: () => void;
  isPublished?: boolean;
}

const ROLE_BADGE_STYLES: Record<string, { bg: string; text: string; border: string }> = {
  PHARMACIST: { bg: BRAND_COLORS.purpleLight, text: BRAND_COLORS.purple, border: BRAND_COLORS.purple },
  INTERN: { bg: BRAND_COLORS.cyanLight, text: '#008ba3', border: BRAND_COLORS.cyan },
  TECHNICIAN: { bg: BRAND_COLORS.blueLight, text: BRAND_COLORS.blue, border: BRAND_COLORS.blue },
  ASSISTANT: { bg: '#FFFBEB', text: '#B45309', border: '#F59E0B' },
  DEFAULT: { bg: '#F1F5F9', text: '#475569', border: '#94A3B8' },
};

export const getRoleStyle = (role: string) => {
  const normalized = (role || '').toUpperCase();
  return ROLE_BADGE_STYLES[normalized] || ROLE_BADGE_STYLES.DEFAULT;
};
