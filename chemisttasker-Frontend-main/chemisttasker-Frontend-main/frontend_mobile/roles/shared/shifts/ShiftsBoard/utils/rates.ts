// Rate utilities for ShiftsBoard
// Exact replication from web version

import { getDay } from 'date-fns';
import { Shift } from '@chemisttasker/shared-core';
import { RatePreference, ShiftSlot } from '../types';

export const getStartHour = (slot: ShiftSlot) => {
    if (slot.startHour != null) return Number(slot.startHour);
    if (!slot.startTime) return null;
    return Number(slot.startTime.split(':')[0]);
};

export const getPharmacistProvidedRate = (slot: ShiftSlot, ratePref?: RatePreference) => {
    if (!ratePref) return null;
    const dayjsDate = slot.date ? new Date(slot.date) : null;
    const hour = getStartHour(slot);
    const isSunday = dayjsDate ? getDay(dayjsDate) === 0 : false;
    const isSaturday = dayjsDate ? getDay(dayjsDate) === 6 : false;
    const isEarly = hour != null && hour < 6;
    const isLate = hour != null && hour >= 20;

    // Early morning override
    if (isEarly && ratePref.early_morning && ratePref.early_morning_same_as_day === false) {
        return Number(ratePref.early_morning);
    }
    // Late night override
    if (isLate && ratePref.late_night && ratePref.late_night_same_as_day === false) {
        return Number(ratePref.late_night);
    }

    if (isSunday && ratePref.sunday) return Number(ratePref.sunday);
    if (isSaturday && ratePref.saturday) return Number(ratePref.saturday);
    if (ratePref.weekday) return Number(ratePref.weekday);
    if (ratePref.public_holiday) return Number(ratePref.public_holiday);
    if (isEarly && ratePref.early_morning) return Number(ratePref.early_morning);
    if (isLate && ratePref.late_night) return Number(ratePref.late_night);
    return null;
};

export const getSlotRate = (slot: ShiftSlot, shift: Shift, ratePref?: RatePreference) => {
    const slotRateNum = slot?.rate != null && slot.rate !== '' ? Number(slot.rate) : null;
    if (slotRateNum != null && Number.isFinite(slotRateNum) && slotRateNum > 0) return slotRateNum;

    const fixedRateNum = shift.fixedRate != null ? Number(shift.fixedRate) : null;
    if (fixedRateNum != null && Number.isFinite(fixedRateNum) && fixedRateNum > 0) return fixedRateNum;

    if (shift.rateType === 'PHARMACIST_PROVIDED') {
        const fromPref = getPharmacistProvidedRate(slot, ratePref);
        if (fromPref != null) return fromPref;
        if (shift.minHourlyRate != null) return Number(shift.minHourlyRate);
        if (shift.maxHourlyRate != null) return Number(shift.maxHourlyRate);
    }
    return 0;
};

export const formatCurrency = (value: number) => {
    if (!Number.isFinite(value)) return 'N/A';
    return value.toLocaleString('en-AU', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
};

export const getRateSummary = (shift: Shift) => {
    const isFullOrPartTime = ['FULL_TIME', 'PART_TIME'].includes(shift.employmentType ?? '');
    const minAnnual = shift.minAnnualSalary != null ? Number(shift.minAnnualSalary) : null;
    const maxAnnual = shift.maxAnnualSalary != null ? Number(shift.maxAnnualSalary) : null;
    const minHourly = shift.minHourlyRate != null ? Number(shift.minHourlyRate) : null;
    const maxHourly = shift.maxHourlyRate != null ? Number(shift.maxHourlyRate) : null;
    const slotRates = (shift.slots ?? [])
        .map((slot) => getSlotRate(slot, shift))
        .filter((rate) => Number.isFinite(rate) && rate > 0);

    if (isFullOrPartTime) {
        if (minAnnual || maxAnnual) {
            const display = minAnnual && maxAnnual
                ? `${formatCurrency(minAnnual)} - ${formatCurrency(maxAnnual)}`
                : `${formatCurrency(minAnnual ?? maxAnnual ?? 0)}`;
            return { display, unitLabel: 'Package' };
        }
        if (minHourly || maxHourly) {
            const display = minHourly && maxHourly
                ? `${formatCurrency(minHourly)} - ${formatCurrency(maxHourly)}`
                : `${formatCurrency(minHourly ?? maxHourly ?? 0)}`;
            return { display, unitLabel: '/hr' };
        }
    }

    // If slots carry rates (even when a fixedRate exists), surface the min/max from slots for clarity.
    if (slotRates.length > 0) {
        const minRate = Math.min(...slotRates);
        const maxRate = Math.max(...slotRates);
        const display = minRate === maxRate ? `${formatCurrency(minRate)}` : `${formatCurrency(minRate)} - ${formatCurrency(maxRate)}`;
        return { display, unitLabel: '/hr' };
    }

    if (shift.fixedRate != null) {
        return { display: formatCurrency(Number(shift.fixedRate)), unitLabel: '/hr' };
    }

    if (shift.rateType === 'PHARMACIST_PROVIDED') {
        return { display: 'Pharmacist provided', unitLabel: '' };
    }

    if (slotRates.length === 0) return { display: 'N/A', unitLabel: '/hr' };
    const minRate = Math.min(...slotRates);
    const maxRate = Math.max(...slotRates);
    const display = minRate === maxRate ? `${formatCurrency(minRate)}` : `${formatCurrency(minRate)} - ${formatCurrency(maxRate)}`;
    return { display, unitLabel: '/hr' };
};
