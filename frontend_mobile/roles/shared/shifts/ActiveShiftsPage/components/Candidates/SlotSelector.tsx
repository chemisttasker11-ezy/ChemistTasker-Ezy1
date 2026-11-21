// SlotSelector Component
// Wrapped selector for multi-slot shifts with W3a tokens and Lucide

import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Surface, Text } from 'react-native-paper';
import { Users } from 'lucide-react-native';
import { colors as tokenColors, font, radius, space } from '@/constants/tokens';

interface SlotSelectorProps {
    slots: any[];
    selectedSlotId: number | null;
    onSelectSlot: (slotId: number) => void;
    slotHasUpdates?: Record<number, boolean>;
    slotCandidateCounts?: Record<number, number>;
    slotStatusCounts?: Record<number, { interested: number; assigned: number; rejected: number; noResponse: number }>;
}

export default function SlotSelector({
    slots,
    selectedSlotId,
    onSelectSlot,
    slotHasUpdates,
    slotCandidateCounts,
    slotStatusCounts,
}: SlotSelectorProps) {
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
        slotCandidateCounts?.[slot._slotId] ??
        slot?.candidateCount ??
        slot?.candidate_count ??
        slot?.assignedCount ??
        slot?.assigned_count ??
        0;

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
                    const hasNewActivity = Boolean(slotHasUpdates?.[slot._slotId]);
                    const count = getSlotCandidateCount(slot);

                    return (
                        <TouchableOpacity
                            key={slot._slotId}
                            onPress={() => onSelectSlot(slot._slotId!)}
                            accessible
                            accessibilityRole="button"
                            accessibilityState={{ selected }}
                            accessibilityLabel={`${parts.day} ${parts.date}, ${parts.time}. ${count} candidates.${hasNewActivity ? ' Has new activity.' : ''}`}
                            style={[styles.slotButton, selected && styles.slotButtonSelected]}
                            activeOpacity={0.75}
                        >
                            {hasNewActivity && (
                                <View style={styles.newActivityBadge} accessibilityLabel="New activity">
                                    <Text style={styles.newActivityText}>New activity</Text>
                                </View>
                            )}

                            <Text style={styles.slotDay}>{parts.day}</Text>
                            <Text style={styles.slotDate}>{parts.date}</Text>
                            <Text style={styles.slotTime}>{parts.time}</Text>

                            <View style={styles.slotFooter}>
                                <View style={styles.openDot} />
                                <Text style={styles.openText}>Open</Text>
                            </View>

                            <View style={styles.slotCandidateCount}>
                                <Users size={12} color={tokenColors.textSecondary} />
                                <Text style={styles.slotCandidateText}>{count}</Text>
                            </View>

                            <View style={styles.statusSummary}>
                                <Text style={[styles.statusPill, styles.interestedPill]}>
                                    Int {slotStatusCounts?.[slot._slotId]?.interested ?? 0}
                                </Text>
                                <Text style={[styles.statusPill, styles.assignedPill]}>
                                    Asg {slotStatusCounts?.[slot._slotId]?.assigned ?? 0}
                                </Text>
                                <Text style={[styles.statusPill, styles.rejectedPill]}>
                                    Rej {slotStatusCounts?.[slot._slotId]?.rejected ?? 0}
                                </Text>
                                <Text style={[styles.statusPill, styles.noResponsePill]}>
                                    No {slotStatusCounts?.[slot._slotId]?.noResponse ?? 0}
                                </Text>
                            </View>
                        </TouchableOpacity>
                    );
                })}
            </View>
        </Surface>
    );
}

const styles = StyleSheet.create({
    container: {
        paddingVertical: space.sm,
        paddingHorizontal: space.xs,
        marginBottom: space.md,
        backgroundColor: '#FFFFFF',
        borderRadius: radius.card,
    },
    headerRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: space.sm,
        paddingHorizontal: space.xs,
        gap: space.sm,
    },
    heading: {
        fontSize: 15,
        fontWeight: '800',
        fontFamily: font.inter.semiBold,
        color: tokenColors.textPrimary,
    },
    subheading: {
        fontSize: 11,
        fontWeight: '600',
        fontFamily: font.inter.medium,
        color: tokenColors.textSecondary,
        marginTop: 2,
    },
    selectorGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: space.xs,
    },
    slotButton: {
        width: '31.5%',
        minHeight: 114,
        borderRadius: radius.nested,
        borderWidth: 1,
        borderColor: tokenColors.border,
        backgroundColor: '#FFFFFF',
        padding: space.sm,
        position: 'relative',
    },
    slotButtonSelected: {
        borderColor: tokenColors.primary,
        borderWidth: 2,
        backgroundColor: '#F5F3FF',
    },
    slotDay: {
        color: tokenColors.textSecondary,
        fontSize: 11,
        fontWeight: '700',
        fontFamily: font.inter.semiBold,
    },
    slotDate: {
        color: tokenColors.textPrimary,
        fontSize: 13,
        fontWeight: '800',
        fontFamily: font.inter.semiBold,
        marginTop: 2,
    },
    slotTime: {
        alignSelf: 'flex-start',
        marginTop: space.xs,
        paddingHorizontal: space.xs + 2,
        paddingVertical: 2,
        borderRadius: radius.pill,
        overflow: 'hidden',
        backgroundColor: '#F3E8FF',
        color: '#6D28D9',
        fontSize: 10,
        fontWeight: '700',
        fontFamily: font.inter.semiBold,
    },
    slotFooter: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        marginTop: space.xs + 2,
    },
    openDot: {
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: '#15803D',
    },
    openText: {
        color: tokenColors.textSecondary,
        fontSize: 11,
        fontWeight: '600',
        fontFamily: font.inter.medium,
    },
    slotCandidateCount: {
        position: 'absolute',
        right: 6,
        bottom: 6,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 2,
    },
    slotCandidateText: {
        color: tokenColors.textSecondary,
        fontSize: 11,
        fontWeight: '700',
        fontFamily: font.inter.semiBold,
    },
    newActivityBadge: {
        position: 'absolute',
        top: 4,
        right: 4,
        backgroundColor: '#FEE2E2',
        borderWidth: 1,
        borderColor: '#FCA5A5',
        borderRadius: radius.pill,
        paddingHorizontal: 5,
        paddingVertical: 1,
        zIndex: 2,
    },
    newActivityText: {
        color: '#991B1B',
        fontSize: 8,
        fontWeight: '800',
        fontFamily: font.inter.semiBold,
        textTransform: 'uppercase',
    },
    statusSummary: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 3,
        marginTop: 4,
        paddingRight: 24,
    },
    statusPill: {
        fontSize: 8,
        fontWeight: '800',
        fontFamily: font.inter.semiBold,
        borderRadius: radius.pill,
        overflow: 'hidden',
        paddingHorizontal: 4,
        paddingVertical: 1,
    },
    interestedPill: {
        backgroundColor: '#DCFCE7',
        color: '#15803D',
    },
    assignedPill: {
        backgroundColor: '#DBEAFE',
        color: '#1D4ED8',
    },
    rejectedPill: {
        backgroundColor: '#FEE2E2',
        color: '#B91C1C',
    },
    noResponsePill: {
        backgroundColor: '#FEF3C7',
        color: '#B45309',
    },
});
