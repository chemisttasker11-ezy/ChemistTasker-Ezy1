/**
 * Domain helpers - business logic functions
 * All helpers in ONE file for simplicity
 */

import type {
    Pharmacy,
    Shift,
    ShiftStatus,
    Notification,
    Room,
    Invoice,
    RosterShift,
    HubPost,
    HubComment,
} from './types';

// ============================================
// PHARMACY DOMAIN HELPERS
// ============================================

export function groupPharmacies(pharmacies: Pharmacy[]): {
    verified: Pharmacy[];
    pending: Pharmacy[];
} {
    return {
        verified: pharmacies.filter(p => p.verified),
        pending: pharmacies.filter(p => !p.verified),
    };
}

export function formatPharmacyAddress(pharmacy: Pharmacy): string {
    return `${pharmacy.street_address}, ${pharmacy.suburb}, ${pharmacy.state} ${pharmacy.postcode}`;
}

export function searchPharmacies(pharmacies: Pharmacy[], query: string): Pharmacy[] {
    const lowerQuery = query.toLowerCase();
    return pharmacies.filter(
        p => p.name.toLowerCase().includes(lowerQuery) ||
            p.suburb.toLowerCase().includes(lowerQuery) ||
            p.postcode.includes(query)
    );
}

// ============================================
// SHIFT DOMAIN HELPERS
// ============================================

export function groupShiftsByStatus(shifts: Shift[]): Record<ShiftStatus, Shift[]> {
    const grouped: Record<string, Shift[]> = {};
    shifts.forEach(shift => {
        const key = shift.status ?? 'OPEN';
        if (!grouped[key]) {
            grouped[key] = [];
        }
        grouped[key].push(shift);
    });
    return grouped as Record<ShiftStatus, Shift[]>;
}

const getShiftDate = (shift: Shift, key: 'start' | 'end'): Date => {
    const snakeKey = `${key}_datetime`;
    const camelKey = `${key}Datetime`;
    const value = (shift as any)[snakeKey] ?? (shift as any)[camelKey];
    return new Date(value);
};

const getShiftRate = (shift: Shift): string => {
    return (shift as any).hourly_rate ?? (shift as any).hourlyRate ?? '0';
};

export function formatShiftDateRange(shift: Shift): string {
    const start = getShiftDate(shift, 'start');
    const end = getShiftDate(shift, 'end');

    const dateStr = start.toLocaleDateString();
    const startTime = start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const endTime = end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    return `${dateStr} ${startTime} - ${endTime}`;
}

export function calculateShiftDuration(shift: Shift): number {
    const start = getShiftDate(shift, 'start');
    const end = getShiftDate(shift, 'end');
    return (end.getTime() - start.getTime()) / (1000 * 60 * 60); // hours
}

export function calculateShiftPay(shift: Shift): string {
    const hours = calculateShiftDuration(shift);
    const rate = parseFloat(getShiftRate(shift));
    return (hours * rate).toFixed(2);
}

export function sortShiftsByDate(shifts: Shift[], descending = false): Shift[] {
    return [...shifts].sort((a, b) => {
        const dateA = getShiftDate(a, 'start').getTime();
        const dateB = getShiftDate(b, 'start').getTime();
        return descending ? dateB - dateA : dateA - dateB;
    });
}

// ============================================
// CHAT DOMAIN HELPERS
// ============================================

export function formatParticipants(participants: string[]): string {
    if (participants.length === 0) return 'No participants';
    if (participants.length === 1) return participants[0];
    if (participants.length === 2) return participants.join(' and ');
    return `${participants.slice(0, -1).join(', ')}, and ${participants[participants.length - 1]}`;
}

export function sortRoomsByRecent(rooms: Room[]): Room[] {
    return [...rooms].sort((a, b) => {
        const dateA = a.last_message_time ? new Date(a.last_message_time) : new Date(0);
        const dateB = b.last_message_time ? new Date(b.last_message_time) : new Date(0);
        return dateB.getTime() - dateA.getTime();
    });
}

export function getTotalUnreadCount(rooms: Room[]): number {
    return rooms.reduce((sum, room) => sum + room.unread_count, 0);
}

// ============================================
// NOTIFICATION DOMAIN HELPERS
// ============================================

export function getUnreadCount(notifications: Notification[]): number {
    return notifications.filter(n => !n.readAt).length;
}

export function sortNotificationsByRecent(notifications: Notification[]): Notification[] {
    return [...notifications].sort((a, b) => {
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
}

export function formatNotificationBadge(count: number): string {
    if (count === 0) return '';
    if (count > 99) return '99+';
    return count.toString();
}

// ============================================
// STATS DOMAIN HELPERS
// ============================================

export interface DashboardStats {
    pharmacies_count: number;
    active_shifts_count: number;
    total_applications?: number;
}

export function calculateOwnerStats(
    pharmacies: Pharmacy[],
    shifts: Shift[]
): DashboardStats {
    return {
        pharmacies_count: pharmacies.length,
        active_shifts_count: shifts.filter(s => s.status === 'OPEN').length,
        total_applications: shifts.reduce((sum, s) => {
            const applications = (s as any).applications_count ?? s.applicationsCount ?? 0;
            return sum + (Number(applications) || 0);
        }, 0),
    };
}

// ============================================
// ROSTER DOMAIN HELPERS
// ============================================

export function groupRosterByWeek(shifts: RosterShift[]): Record<string, RosterShift[]> {
    const grouped: Record<string, RosterShift[]> = {};
    shifts.forEach(shift => {
        const start = new Date(shift.start_datetime);
        const firstDay = new Date(start);
        firstDay.setDate(start.getDate() - start.getDay());
        const key = firstDay.toISOString().split('T')[0];
        grouped[key] = grouped[key] || [];
        grouped[key].push(shift);
    });
    return grouped;
}

export function findRosterConflicts(shifts: RosterShift[], candidate: RosterShift): RosterShift[] {
    const candidateStart = new Date(candidate.start_datetime).getTime();
    const candidateEnd = new Date(candidate.end_datetime).getTime();
    return shifts.filter(shift => {
        const start = new Date(shift.start_datetime).getTime();
        const end = new Date(shift.end_datetime).getTime();
        const sameUser = !candidate.assigned_user || !shift.assigned_user || shift.assigned_user === candidate.assigned_user;
        return sameUser && (
            (candidateStart >= start && candidateStart < end) ||
            (candidateEnd > start && candidateEnd <= end) ||
            (candidateStart <= start && candidateEnd >= end)
        );
    });
}

// ============================================
// HUB DOMAIN HELPERS
// ============================================

export function sortHubPostsByEngagement(posts: HubPost[]): HubPost[] {
    return [...posts].sort((a, b) => {
        const scoreA =
            (a.commentCount || 0) +
            Object.values(a.reactionSummary || {}).reduce<number>((sum, count) => sum + Number(count || 0), 0);
        const scoreB =
            (b.commentCount || 0) +
            Object.values(b.reactionSummary || {}).reduce<number>((sum, count) => sum + Number(count || 0), 0);
        return scoreB - scoreA;
    });
}

export function sortHubCommentsByRecent(comments: HubComment[]): HubComment[] {
    return [...comments].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export function filterPinnedPosts(posts: HubPost[]): HubPost[] {
    return posts.filter(post => post.isPinned);
}

// ============================================
// INVOICE DOMAIN HELPERS
// ============================================

export function groupInvoicesByStatus(invoices: Invoice[]): Record<Invoice['status'], Invoice[]> {
    return invoices.reduce((acc, invoice) => {
        acc[invoice.status] = acc[invoice.status] || [];
        acc[invoice.status].push(invoice);
        return acc;
    }, {} as Record<Invoice['status'], Invoice[]>);
}

export function calculateInvoiceTotals(invoices: Invoice[]): { subtotal: number; gst: number; superAmount: number; total: number } {
    return invoices.reduce(
        (acc, invoice) => ({
            subtotal: acc.subtotal + parseFloat(invoice.subtotal || '0'),
            gst: acc.gst + parseFloat(invoice.gst_amount || '0'),
            superAmount: acc.superAmount + parseFloat(invoice.super_amount || '0'),
            total: acc.total + parseFloat(invoice.total || '0'),
        }),
        { subtotal: 0, gst: 0, superAmount: 0, total: 0 },
    );
}
