// Display Helpers for ActiveShiftsPage
// Ported from web version

import { levelColors } from '../theme';

export function getCardBorderColor(visibility: string): string {
    return levelColors[visibility] || levelColors.PLATFORM;
}

export function formatRate(rate: number | string | null): string {
    if (!rate) return '$--';
    return `$${Number(rate).toFixed(2)}/hr`;
}

export function formatDateTime(dateStr: string): string {
    try {
        const date = new Date(dateStr);
        return date.toLocaleString(undefined, {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });
    } catch {
        return dateStr;
    }
}

export function getLevelLabel(level: string): string {
    const labels: Record<string, string> = {
        FULL_PART_TIME: 'Full/Part Time',
        LOCUM_CASUAL: 'Locum/Casual',
        OWNER_CHAIN: 'Owner Chain',
        ORG_CHAIN: 'Organization',
        PLATFORM: 'Chemisttasker',
    };
    return labels[level] || level;
}
