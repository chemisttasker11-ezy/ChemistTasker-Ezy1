// SlotSelector Component
// Wrapped selector for multi-slot shifts

import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { IconButton, Surface, Text } from 'react-native-paper';
import { customTheme } from '../../theme';

interface SlotSelectorProps {
    slots: any[];
    selectedSlotId: number | null;
    onSelectSlot: (slotId: number) => void;
    slotHasUpdates?: Record<number, boolean>;
    slotCandidateCounts?: Record<number, number>;
    slotStatusCounts?: Record<number, { interested: number; assigned: number; rejected: number; noResponse: number }>;
}

export default function SlotSelector({ slots, selectedSlotId, onSelectSlot, slotHasUpdates, slotCandidateCounts, slotStatusCounts }: SlotSelectorProps) {
    const getSlotId = (slot: any): number | null =>
        (slot?.id ?? slot?.slotId ?? slot?.slot_id ?? null);

    const normalizedSlots = slots
        .map((slot) => ({ ...slot, _slotId: getSlotId(slot) }))
        .filter((slot) => slot._slotId != null);

    if (normalizedSlots.length === 0) {
        return null;
    }

    const formatTime = (time?: string | null) => (time ? time.slice(0, 5) : '');

    const formatParts = (slot: any) => {
        const date = new Date(slot.date);
        return {
            day: date.toLocaleDateString(undefined, { weekday: 'short' }),
            date: date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }),
            time: `${formatTime(slot.startTime)} - ${formatTime(slot.endTime)}`,
        };
    };
    const getSlotCandidateCount = (slot: any) =>
        slotCandidateCounts?.[slot._slotId] ?? slot?.candidateCount ?? slot?.candidate_count ?? slot?.assignedCount ?? slot?.assigned_count ?? 0;

    return (
        <Surface style={styles.container} elevation={0}>
            <View style={styles.headerRow}>
                <View>
                    <Text style={styles.heading}>Upcoming Shift Dates</Text>
                    <Text style={styles.subheading}>{normalizedSlots.length} upcoming shifts</Text>
                </View>
            </View>
            <View style={styles.selectorGrid}>
                    {normalizedSlots.map((slot) => {
                        const parts = formatParts(slot);
                        const selected = slot._slotId === selectedSlotId;
                        return (
                            <TouchableOpacity
                                key={slot._slotId}
                                onPress={() => onSelectSlot(slot._slotId!)}
                                style={[styles.slotButton, selected && styles.slotButtonSelected]}
                            >
                                <Text style={styles.slotDay}>{parts.day}</Text>
                                <Text style={styles.slotDate}>{parts.date}</Text>
                                <Text style={styles.slotTime}>{parts.time}</Text>
                                <View style={styles.slotFooter}>
                                    <View style={styles.openDot} />
                                    <Text style={styles.openText}>Open</Text>
                                </View>
                                <View style={styles.slotCandidateCount}>
                                    <IconButton icon="account-group-outline" size={14} iconColor="#64748B" style={styles.slotCandidateIcon} />
                                    <Text style={styles.slotCandidateText}>{getSlotCandidateCount(slot)}</Text>
                                </View>
                                <View style={styles.statusSummary}>
                                    <Text style={[styles.statusPill, styles.interestedPill]}>Int {slotStatusCounts?.[slot._slotId]?.interested ?? 0}</Text>
                                    <Text style={[styles.statusPill, styles.assignedPill]}>Asg {slotStatusCounts?.[slot._slotId]?.assigned ?? 0}</Text>
                                    <Text style={[styles.statusPill, styles.rejectedPill]}>Rej {slotStatusCounts?.[slot._slotId]?.rejected ?? 0}</Text>
                                    <Text style={[styles.statusPill, styles.noResponsePill]}>No {slotStatusCounts?.[slot._slotId]?.noResponse ?? 0}</Text>
                                </View>
                                {Boolean(slotHasUpdates?.[slot._slotId]) && <View style={styles.updateDot} />}
                            </TouchableOpacity>
                        );
                    })}
            </View>
        </Surface>
    );
}

const styles = StyleSheet.create({
    container: {
        paddingVertical: customTheme.spacing.sm,
        paddingHorizontal: customTheme.spacing.xs,
        marginBottom: customTheme.spacing.md,
        backgroundColor: '#fff',
        borderRadius: 16,
    },
    headerRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: customTheme.spacing.sm,
        paddingHorizontal: customTheme.spacing.xs,
        gap: customTheme.spacing.sm,
    },
    heading: {
        fontSize: 15,
        fontWeight: '900',
        color: '#111827',
    },
    subheading: {
        fontSize: 11,
        fontWeight: '600',
        color: '#64748B',
        marginTop: 2,
    },
    selectorRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    selectorGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: customTheme.spacing.xs,
    },
    scrollContent: {
        paddingHorizontal: customTheme.spacing.xs,
        gap: customTheme.spacing.md,
        alignItems: 'center',
    },
    scrollView: {
        flex: 1,
    },
    slotButton: {
        width: '31.5%',
        minHeight: 112,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#E5E7EB',
        backgroundColor: '#FFFFFF',
        padding: customTheme.spacing.sm,
        position: 'relative',
    },
    slotButtonSelected: {
        borderColor: '#8B5CF6',
        backgroundColor: '#FAF5FF',
    },
    slotDay: {
        color: '#64748B',
        fontSize: 11,
        fontWeight: '700',
    },
    slotDate: {
        color: '#111827',
        fontSize: 13,
        fontWeight: '900',
        marginTop: 2,
    },
    slotTime: {
        alignSelf: 'flex-start',
        marginTop: customTheme.spacing.sm,
        paddingHorizontal: customTheme.spacing.sm,
        paddingVertical: 2,
        borderRadius: 999,
        overflow: 'hidden',
        backgroundColor: '#F3E8FF',
        color: '#7C3AED',
        fontSize: 10,
        fontWeight: '800',
    },
    slotFooter: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        marginTop: customTheme.spacing.sm,
    },
    openDot: {
        width: 7,
        height: 7,
        borderRadius: 4,
        backgroundColor: '#16A34A',
    },
    openText: {
        color: '#475569',
        fontSize: 11,
        fontWeight: '700',
    },
    slotCandidateCount: {
        position: 'absolute',
        right: 7,
        bottom: 6,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 1,
    },
    slotCandidateIcon: {
        margin: 0,
        width: 16,
        height: 16,
    },
    slotCandidateText: {
        color: '#64748B',
        fontSize: 11,
        fontWeight: '800',
    },
    updateDot: {
        position: 'absolute',
        top: 2,
        right: 2,
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: '#DC2626',
    },
    statusSummary: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 3,
        marginTop: 5,
        paddingRight: 26,
    },
    statusPill: {
        color: '#FFFFFF',
        fontSize: 8,
        fontWeight: '900',
        borderRadius: 999,
        overflow: 'hidden',
        paddingHorizontal: 4,
        paddingVertical: 1,
    },
    interestedPill: { backgroundColor: '#047857' },
    assignedPill: { backgroundColor: '#0284C7' },
    rejectedPill: { backgroundColor: '#B91C1C' },
    noResponsePill: { backgroundColor: '#B45309' },
    navButton: {
        margin: 0,
    },
});
