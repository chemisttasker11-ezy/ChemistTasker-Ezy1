import { Shift } from '@chemisttasker/shared-core';

export type CustomEscalationLevelKey = 'FULL_PART_TIME' | 'LOCUM_CASUAL' | 'OWNER_CHAIN' | 'ORG_CHAIN' | 'PLATFORM';

export const PUBLIC_LEVEL_KEY: CustomEscalationLevelKey = 'PLATFORM';
export const COMMUNITY_LEVEL_KEY: CustomEscalationLevelKey = 'LOCUM_CASUAL';
export const NETWORK_LEVEL_KEY: CustomEscalationLevelKey = 'FULL_PART_TIME';
const ALL_LEVELS: CustomEscalationLevelKey[] = ['FULL_PART_TIME', 'LOCUM_CASUAL', 'OWNER_CHAIN', 'ORG_CHAIN', 'PLATFORM'];

export function getCurrentLevelKey(shift: Shift): CustomEscalationLevelKey {
    const shiftAny = shift as any;
    if (shiftAny.visibility === 'PLATFORM' || shiftAny.visibilityLevel === 'PLATFORM') return PUBLIC_LEVEL_KEY;
    if (shiftAny.visibility === 'LOCUM_CASUAL' || shiftAny.visibilityLevel === 'LOCUM_CASUAL') return 'LOCUM_CASUAL';
    if (shiftAny.visibility === 'OWNER_CHAIN' || shiftAny.visibilityLevel === 'OWNER_CHAIN') return 'OWNER_CHAIN';
    if (shiftAny.visibility === 'ORG_CHAIN' || shiftAny.visibilityLevel === 'ORG_CHAIN') return 'ORG_CHAIN';
    return 'FULL_PART_TIME';
}

export function deriveLevelSequence(
    current: CustomEscalationLevelKey,
    allowedLevels?: string[] | null,
): CustomEscalationLevelKey[] {
    const allowedSet = new Set(
        (allowedLevels || [])
            .filter((level): level is CustomEscalationLevelKey => ALL_LEVELS.includes(level as CustomEscalationLevelKey))
    );
    const levels = allowedSet.size ? ALL_LEVELS.filter((level) => allowedSet.has(level)) : ALL_LEVELS;
    const currentIdx = levels.indexOf(current);
    return currentIdx === -1 ? levels : levels.slice(0, currentIdx + 1);
}

export function formatShiftTime(shift: Shift): string {
    const shiftAny = shift as any;
    if (!shiftAny.date) return 'No Date';
    const date = new Date(shiftAny.date);
    const dateStr = date.toLocaleDateString();
    const start = shiftAny.startTime?.slice(0, 5) || '';
    const end = shiftAny.endTime?.slice(0, 5) || '';
    if (start && end) {
        return `${dateStr}, ${start} - ${end}`;
    }
    return dateStr;
}

export function getShiftSummary(shift: Shift): string {
    const slots = (shift as any).slots || [];
    if (slots.length === 0) {
        return (shift as any).employmentType || 'No slots';
    }

    const firstSlot = slots[0];
    const formatSlotDate = (slot: any) =>
        `${new Date(slot.date).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}`;
    const formatTime = (time?: string | null) => (time ? time.slice(0, 5) : '');

    const uniform = slots.every((s: any) => s.startTime === firstSlot?.startTime && s.endTime === firstSlot?.endTime) &&
        firstSlot?.startTime && firstSlot?.endTime;
    const baseLabel = firstSlot ? formatSlotDate(firstSlot) : '';
    const extra = slots.length > 1 ? ` + ${slots.length - 1} more` : '';
    const timeRange = uniform ? ` ${formatTime(firstSlot?.startTime)} - ${formatTime(firstSlot?.endTime)}` : '';
    return `${baseLabel}${timeRange}${extra}`.trim();
}

export function getCardBorderColor(shift: Shift, theme: any): string {
    const shiftAny = shift as any;
    return shiftAny.visibility === 'PLATFORM'
        ? theme.palette.secondary.light
        : theme.palette.primary.light;
}

export function getLocationText(shift: Shift): string {
    const pharmacyDetail = (shift as any).pharmacyDetail;
    const location = [
        pharmacyDetail?.streetAddress,
        pharmacyDetail?.suburb,
        pharmacyDetail?.state,
        pharmacyDetail?.postcode,
    ].filter(Boolean).join(', ');
    return location || 'Address not available';
}
