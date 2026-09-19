import type { CSSProperties } from 'react';
import { BRAND_COLORS } from '../../constants/brandTheme';

export interface CalendarEventItem {
  id: string | number;
  title: string;
  start: Date;
  end: Date;
  allDay?: boolean;
  resource: any;
}

export interface HorizontalCalendarGridProps {
  events: CalendarEventItem[];
  currentDate: Date;
  onNavigate: (newDate: Date) => void;
  onSelectSlot: (slotInfo: { start: Date; end: Date }) => void;
  onSelectEvent: (event: { resource: any }) => void;
  onDuplicateShift?: (event: CalendarEventItem) => void;
  eventStyleGetter?: (event: any) => { style: CSSProperties };
  roleFilters?: string[];
  isLoading?: boolean;
  pharmacy?: any;
}

export interface DayOperatingHours {
  openMinutes: number | null;
  closeMinutes: number | null;
  isClosed: boolean;
  openLabel: string;
  closeLabel: string;
}

export const parseTimeToMinutes = (timeStr?: string | null): number | null => {
  if (!timeStr) return null;
  const parts = String(timeStr).trim().split(':');
  if (parts.length < 2) return null;
  const h = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  if (isNaN(h) || isNaN(m)) return null;
  return h * 60 + m;
};

export const formatMinutesToTime = (m: number | null): string => {
  if (m == null) return '';
  const hh = String(Math.floor(m / 60)).padStart(2, '0');
  const mm = String(m % 60).padStart(2, '0');
  return `${hh}:${mm}`;
};

export const getPharmacyDayHours = (pharmacy: any, dayShort: string): DayOperatingHours => {
  if (!pharmacy) {
    return {
      openMinutes: 8 * 60,
      closeMinutes: 19 * 60,
      isClosed: false,
      openLabel: '08:00',
      closeLabel: '19:00',
    };
  }

  const p = pharmacy;
  const fallbackStart = p.weekdaysStart ?? p.weekdays_start ?? '08:00';
  const fallbackEnd = p.weekdaysEnd ?? p.weekdays_end ?? '19:00';

  let startRaw: string | null = null;
  let endRaw: string | null = null;
  let closed = false;

  switch (dayShort.toUpperCase()) {
    case 'MON':
      startRaw = p.mondayStart ?? p.monday_start ?? fallbackStart;
      endRaw = p.mondayEnd ?? p.monday_end ?? fallbackEnd;
      closed = Boolean(p.mondayClosed ?? p.monday_closed);
      break;
    case 'TUE':
      startRaw = p.tuesdayStart ?? p.tuesday_start ?? fallbackStart;
      endRaw = p.tuesdayEnd ?? p.tuesday_end ?? fallbackEnd;
      closed = Boolean(p.tuesdayClosed ?? p.tuesday_closed);
      break;
    case 'WED':
      startRaw = p.wednesdayStart ?? p.wednesday_start ?? fallbackStart;
      endRaw = p.wednesdayEnd ?? p.wednesday_end ?? fallbackEnd;
      closed = Boolean(p.wednesdayClosed ?? p.wednesday_closed);
      break;
    case 'THU':
      startRaw = p.thursdayStart ?? p.thursday_start ?? fallbackStart;
      endRaw = p.thursdayEnd ?? p.thursday_end ?? fallbackEnd;
      closed = Boolean(p.thursdayClosed ?? p.thursday_closed);
      break;
    case 'FRI':
      startRaw = p.fridayStart ?? p.friday_start ?? fallbackStart;
      endRaw = p.fridayEnd ?? p.friday_end ?? fallbackEnd;
      closed = Boolean(p.fridayClosed ?? p.friday_closed);
      break;
    case 'SAT':
      startRaw = p.saturdaysStart ?? p.saturdays_start ?? '09:00';
      endRaw = p.saturdaysEnd ?? p.saturdays_end ?? '17:00';
      closed = Boolean(p.saturdaysClosed ?? p.saturdays_closed);
      break;
    case 'SUN':
      startRaw = p.sundaysStart ?? p.sundays_start ?? '10:00';
      endRaw = p.sundaysEnd ?? p.sundays_end ?? '16:00';
      closed = Boolean(p.sundaysClosed ?? p.sundays_closed);
      break;
    default:
      startRaw = fallbackStart;
      endRaw = fallbackEnd;
  }

  const openMinutes = closed ? null : parseTimeToMinutes(startRaw);
  const closeMinutes = closed ? null : parseTimeToMinutes(endRaw);

  return {
    openMinutes,
    closeMinutes,
    isClosed: closed || (openMinutes == null && closeMinutes == null),
    openLabel: formatMinutesToTime(openMinutes),
    closeLabel: formatMinutesToTime(closeMinutes),
  };
};

const ROLE_THEME: Record<string, { bg: string; text: string; border: string; bar: string }> = {
  PHARMACIST: {
    bg: '#F3EEFF',
    text: BRAND_COLORS.purple,
    border: '#D8B4FE',
    bar: BRAND_COLORS.purple,
  },
  INTERN: {
    bg: '#E0F7FA',
    text: '#00838F',
    border: '#80DEEA',
    bar: BRAND_COLORS.cyan,
  },
  TECHNICIAN: {
    bg: '#E0F2FE',
    text: '#0369A1',
    border: '#7DD3FC',
    bar: BRAND_COLORS.blue,
  },
  ASSISTANT: {
    bg: '#FEF3C7',
    text: '#92400E',
    border: '#FCD34D',
    bar: '#F59E0B',
  },
  STUDENT: {
    bg: '#ECFDF5',
    text: '#047857',
    border: '#A7F3D0',
    bar: '#10B981',
  },
  DEFAULT: {
    bg: '#F8FAFC',
    text: '#475569',
    border: '#CBD5E1',
    bar: '#94A3B8',
  },
};

export const getRoleTheme = (role?: string) => {
  const normalized = (role || '').toUpperCase();
  return ROLE_THEME[normalized] || ROLE_THEME.DEFAULT;
};
