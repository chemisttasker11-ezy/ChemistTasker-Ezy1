import { isValid } from 'date-fns';

export type ItemType = 'all' | 'events' | 'notes' | 'birthdays';

export const WEEKDAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

export const normalizeList = (data: any) =>
  Array.isArray(data?.results) ? data.results : Array.isArray(data) ? data : [];

export const toDate = (value?: string | null) => {
  if (!value) return null;
  const base = String(value);
  const normalized = base.includes('T') ? base : `${base}T00:00:00`;
  const parsed = new Date(normalized);
  return isValid(parsed) ? parsed : null;
};

export const ROLE_LABELS: Record<string, string> = {
  PHARMACIST: 'Pharmacist',
  INTERN: 'Intern Pharmacist',
  TECHNICIAN: 'Dispensary Technician',
  ASSISTANT: 'Pharmacy Assistant',
  STUDENT: 'Pharmacy Student',
  CONTACT: 'Contact',
};

export const EMPLOYMENT_TYPE_LABELS: Record<string, string> = {
  FULL_TIME: 'Full-time',
  PART_TIME: 'Part-time',
  LOCUM: 'Locum',
  CASUAL: 'Casual',
  SHIFT_HERO: 'Shift Hero',
};

export const formatChoiceLabel = (value: any, labels: Record<string, string>) => {
  const key = String(value ?? '').trim().toUpperCase();
  return key
    ? labels[key] ??
        key
          .replace(/_/g, ' ')
          .toLowerCase()
          .replace(/\b\w/g, (char) => char.toUpperCase())
    : '';
};

export const parseTime = (value?: string | null) => {
  if (!value) return { hours: 9, minutes: 0 };
  const [hours, minutes] = value.split(':').map((part) => Number(part));
  return {
    hours: Number.isFinite(hours) ? hours : 9,
    minutes: Number.isFinite(minutes) ? minutes : 0,
  };
};

export const formatTime = (hours: number, minutes: number) => {
  const hh = String(hours).padStart(2, '0');
  const mm = String(minutes).padStart(2, '0');
  return `${hh}:${mm}`;
};
