// Shift utilities for ShiftsBoard
// Exact replication from web version

import { addDays, isBefore, isSameDay, isAfter, endOfDay, startOfDay, isValid, getDay, format } from 'date-fns';
import { Shift } from '@chemisttasker/shared-core';
import { ShiftSlot } from '../types';

export const getShiftRoleLabel = (shift: Shift) => shift.roleLabel ?? shift.roleNeeded ?? 'Role';
export const normalizeRoleValue = (value?: string | null) => (value ?? '').toString().trim().toLowerCase();
export const getShiftAddress = (shift: Shift) => shift.uiAddressLine ?? '';
export const getShiftCity = (shift: Shift) => shift.uiLocationCity ?? '';
export const getShiftState = (shift: Shift) => shift.uiLocationState ?? '';
// Decide if rate can be negotiated in counter offer.
// Explicit override from uiIsNegotiable when provided, otherwise FLEXIBLE or PHARMACIST_PROVIDED allow negotiation.
export const getShiftNegotiable = (shift: Shift) => {
    if (shift.rateType === 'PHARMACIST_PROVIDED') return true;
    if (shift.uiIsNegotiable !== undefined && shift.uiIsNegotiable !== null) {
        return Boolean(shift.uiIsNegotiable);
    }
    return shift.rateType === 'FLEXIBLE';
};
export const getShiftFlexibleTime = (shift: Shift) => Boolean(shift.uiIsFlexibleTime ?? shift.flexibleTiming);
export const getShiftUrgent = (shift: Shift) => Boolean(shift.uiIsUrgent ?? shift.isUrgent);
export const getShiftAllowPartial = (shift: Shift) => Boolean(shift.uiAllowPartial ?? !shift.singleUserOnly);
export const getShiftDistance = (shift: Shift) => {
    const value = shift.uiDistanceKm;
    return typeof value === 'number' ? value : null;
};
export const getShiftPharmacyName = (shift: Shift) => {
    const pharmacy = shift.pharmacyDetail;
    if (shift.postAnonymously) {
        const suburb = shift.uiLocationCity || pharmacy?.suburb;
        return suburb ? `Shift in ${suburb}` : 'Anonymous Pharmacy';
    }
    return pharmacy?.name ?? 'Pharmacy';
};
export const getShiftPharmacyId = (shift: Shift) => {
    return (
        (shift as any)?.pharmacyDetail?.id ??
        (shift as any)?.pharmacy_detail?.id ??
        (shift as any)?.pharmacy?.id ??
        null
    );
};
export const getFirstSlot = (shift: Shift) => shift.slots?.[0];

export const getEmploymentLabel = (shift: Shift) => {
    if (shift.employmentType === 'FULL_TIME') return 'Full-time role';
    if (shift.employmentType === 'PART_TIME') return 'Part-time role';
    if (shift.employmentType === 'LOCUM') return 'Locum role';
    return 'Shift';
};

export const expandRecurringSlotsForDisplay = (slots: ShiftSlot[]): ShiftSlot[] => {
    const expanded: ShiftSlot[] = [];
    slots.forEach((slot, idx) => {
        const recurringDays: number[] =
            (slot as any)?.recurringDays ??
            (slot as any)?.recurring_days ??
            [];
        const recurringEnd: string | null | undefined =
            (slot as any)?.recurringEndDate ??
            (slot as any)?.recurring_end_date;

        if (!slot.date || !recurringDays.length || !recurringEnd) {
            expanded.push(slot);
            return;
        }

        const start = startOfDay(new Date(slot.date));
        const end = endOfDay(new Date(recurringEnd));
        if (!isValid(start) || !isValid(end)) {
            expanded.push(slot);
            return;
        }

        let cursor = new Date(start);
        let counter = 0;
        // Safety cap to avoid runaway expansion
        const MAX_OCCURRENCES = 90;
        while (isBefore(cursor, end) || isSameDay(cursor, end)) {
            const dayIdx = getDay(cursor); // 0-6
            if (recurringDays.includes(dayIdx)) {
                const clone: any = { ...slot };
                clone.date = format(cursor, 'yyyy-MM-dd');
                clone.__displayKey = `${slot.id ?? idx}-${format(cursor, 'yyyyMMdd')}`;
                expanded.push(clone);
                counter += 1;
                if (counter >= MAX_OCCURRENCES) break;
            }
            cursor = addDays(cursor, 1);
        }
    });
    return expanded.length ? expanded : slots;
};

export const isSlotRecurring = (slot: ShiftSlot) => {
    const raw: any = slot;
    const isRecurring = raw?.isRecurring ?? raw?.is_recurring;
    const recurringDays = raw?.recurringDays ?? raw?.recurring_days ?? [];
    const recurringEnd = raw?.recurringEndDate ?? raw?.recurring_end_date;
    return Boolean(isRecurring || (Array.isArray(recurringDays) && recurringDays.length > 0 && recurringEnd));
};

export const getExpandedSlotsForDisplay = (slots: ShiftSlot[]) => {
    if (!slots.length) return slots;
    if (!slots.some(isSlotRecurring)) return slots;
    return expandRecurringSlotsForDisplay(slots);
};

const getSlotStartDateTime = (slot: ShiftSlot) => {
    const raw: any = slot;
    const date = raw?.date ?? raw?.slot_date ?? raw?.slotDate;
    const timeRaw = raw?.startTime ?? raw?.start_time ?? raw?.startHour ?? raw?.start_hour;
    if (!date || timeRaw == null) return null;
    const timeStr =
        typeof timeRaw === 'number'
            ? `${String(timeRaw).padStart(2, '0')}:00`
            : String(timeRaw);
    const normalized = timeStr.length === 5 ? `${timeStr}:00` : timeStr;
    const dt = new Date(`${date}T${normalized}`);
    return isValid(dt) ? dt : null;
};

export const getUpcomingSlotsForDisplay = (slots: ShiftSlot[]) => {
    const expanded = getExpandedSlotsForDisplay(slots);
    if (!expanded.length) return expanded;
    const now = new Date();
    return expanded.filter((slot) => {
        const start = getSlotStartDateTime(slot);
        if (!start) return true;
        return !isBefore(start, now);
    });
};

// Render offers as returned by API (one entry per slot/slot_date with proposed times/rate).
export const expandOfferSlotsForDisplay = (offerSlots: any[], shiftSlots: ShiftSlot[]): any[] => {
    if (!Array.isArray(offerSlots) || offerSlots.length === 0) return [];
    const mapById = new Map<number, ShiftSlot>();
    shiftSlots.forEach((slot) => {
        if (slot?.id != null) mapById.set(slot.id, slot);
    });

    return offerSlots.map((entry, idx) => {
        const slotId = entry.slotId ?? entry.slot?.id ?? entry.id;
        const ref = slotId != null ? mapById.get(Number(slotId)) : null;
        const base = ref ?? entry.slot ?? {};
        const date = entry.slotDate ?? entry.slot_date ?? base.date ?? entry.date;
        const proposedStart =
            entry.proposedStartTime ??
            entry.proposed_start_time ??
            entry.start ??
            base.startTime ??
            (base as any)?.start_time;
        const proposedEnd =
            entry.proposedEndTime ??
            entry.proposed_end_time ??
            entry.end ??
            base.endTime ??
            (base as any)?.end_time;
        return {
            id: slotId ?? idx,
            date,
            startTime: proposedStart,
            endTime: proposedEnd,
            proposedStartTime: proposedStart,
            proposedEndTime: proposedEnd,
            proposedRate: entry.proposedRate ?? entry.proposed_rate,
            rate: base.rate,
            __displayKey: `${slotId ?? idx}-${date ?? idx}`,
        };
    });
};
