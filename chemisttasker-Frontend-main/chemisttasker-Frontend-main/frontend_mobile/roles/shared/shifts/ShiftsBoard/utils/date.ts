// Date utilities for ShiftsBoard
// Exact replication from web version

import { format, parse } from 'date-fns';

export const formatDateShort = (value?: string | null) =>
    value ? format(new Date(value), 'EEE, d MMM') : '';

export const formatDateLong = (value?: string | null) =>
    value ? format(new Date(value), 'EEEE, d MMMM') : '';

const parseTime = (value: string) => {
    if (!value) return null;
    const trimmed = value.trim();
    if (trimmed.length === 5) {
        return parse(trimmed, 'HH:mm', new Date());
    }
    return parse(trimmed, 'HH:mm:ss', new Date());
};

export const formatTime = (value?: string | null) => {
    if (!value) return '';
    const parsed = parseTime(value);
    return parsed ? format(parsed, 'HH:mm') : '';
};
