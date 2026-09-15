import dayjs from 'dayjs';

export const formatDateShort = (value?: string | null) =>
  value ? dayjs(value).format('ddd, D MMM') : '';

export const formatDateLong = (value?: string | null) =>
  value ? dayjs(value).format('dddd, D MMMM') : '';

export const formatTime = (value?: string | null) =>
  value ? dayjs(`1970-01-01T${value}`).format('HH:mm') : '';
