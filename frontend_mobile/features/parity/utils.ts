export const asArray = <T = any>(value: any): T[] => {
  if (Array.isArray(value)) return value as T[];
  if (Array.isArray(value?.results)) return value.results as T[];
  if (Array.isArray(value?.data)) return value.data as T[];
  return [];
};

export const errorMessage = (error: any, fallback = 'Unable to complete this action.') =>
  error?.response?.data?.detail ||
  error?.response?.data?.error ||
  error?.data?.detail ||
  error?.message ||
  fallback;

export const money = (value: any) => {
  const number = Number(value ?? 0);
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(Number.isFinite(number) ? number : 0);
};

export const dateLabel = (value: any) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString('en-AU', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

export const isoDate = (date = new Date()) => [
  date.getFullYear(),
  String(date.getMonth() + 1).padStart(2, '0'),
  String(date.getDate()).padStart(2, '0'),
].join('-');

export const dateFromIso = (value?: string | null): Date | undefined => {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  if (
    Number.isNaN(date.getTime()) ||
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return undefined;
  }
  return date;
};

export const startOfWeek = (date = new Date()) => {
  const next = new Date(date);
  const day = (next.getDay() + 6) % 7;
  next.setDate(next.getDate() - day);
  next.setHours(0, 0, 0, 0);
  return isoDate(next);
};

export const idempotencyKey = (prefix = 'mobile') =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

export const replaceUnderscore = (value: any) => String(value ?? '').replaceAll('_', ' ');

export const toNumber = (value: any, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};
