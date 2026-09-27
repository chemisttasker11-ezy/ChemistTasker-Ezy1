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

export const isoDate = (date = new Date()) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// Date-only API values must stay on the selected local calendar day. Parsing
// YYYY-MM-DD with Date's string constructor treats it as UTC and can show the
// previous day in Australian time zones.
export const dateFromIso = (value?: string | null): Date | undefined => {
  if (!value) return undefined;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return undefined;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) ? undefined : date;
};

export const startOfWeek = (date = new Date()) => {
  const next = new Date(date);
  const day = (next.getDay() + 6) % 7;
  next.setDate(next.getDate() - day);
  next.setHours(0, 0, 0, 0);
  return isoDate(next);
};

export const idempotencyKey = (_prefix = 'mobile') => {
  const randomUuid = globalThis.crypto?.randomUUID?.();
  if (randomUuid) return randomUuid;
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
    const random = Math.floor(Math.random() * 16);
    const value = character === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
};

export const replaceUnderscore = (value: any) => String(value ?? '').replaceAll('_', ' ');

export const toNumber = (value: any, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};
