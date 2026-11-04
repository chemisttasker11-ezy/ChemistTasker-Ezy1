/*  */import React, { useState } from 'react';
import { ScrollView, StyleSheet, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import {
    ActivityIndicator,
    Button,
    Card,
    Chip,
    Surface,
    Text,
} from 'react-native-paper';
import { Calendar, CheckCircle2, Heart, Lock, Star, User, Users } from 'lucide-react-native';
import type { Shift, ShiftAssignment } from '@chemisttasker/shared-core';
import { colors, radius, space } from '@/constants/tokens';

export type AssignmentLike = ShiftAssignment | { slot_id?: number; user_id?: number; user?: any };

type Props = {
    emptyText: string;
    loading: boolean;
    mode: 'confirmed' | 'history';
    onRateAssigned?: (userId: number) => void;
    onViewAssigned: (shiftId: number, slotId: number | null, userId: number) => void;
    refreshing?: boolean;
    shifts: Shift[];
    title: string;
};

export const getAssignmentSlotId = (assignment: AssignmentLike): number | null =>
    'slotId' in assignment ? assignment.slotId ?? null : assignment.slot_id ?? null;

export const getAssignmentUserId = (assignment: AssignmentLike): number | null =>
    'userId' in assignment ? assignment.userId ?? null : assignment.user_id ?? null;

export const formatDateLabel = (rawDate?: string | null) => {
    if (!rawDate) return { day: 'TBD', date: '--' };
    const parsed = new Date(`${rawDate}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) return { day: 'TBD', date: rawDate };
    return {
        day: parsed.toLocaleDateString(undefined, { weekday: 'short' }),
        date: parsed.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }),
    };
};

export const formatClockTime = (rawTime?: string | null) => {
    if (!rawTime) return '--';
    const [hour, minute] = String(rawTime).split(':');
    return hour && minute ? `${hour}:${minute}` : String(rawTime);
};

export const formatTimeRange = (slot: any) => {
    const start = formatClockTime(slot?.startTime ?? slot?.start_time);
    const end = formatClockTime(slot?.endTime ?? slot?.end_time);
    return `${start} - ${end}`;
};

export const formatSlotLockedRate = (slot: any) => {
    const rawRate = slot?.rate ?? slot?.hourlyRate ?? slot?.hourly_rate;
    if (rawRate == null || rawRate === '') return 'Rate locked';
    const numeric = Number(rawRate);
    const value = Number.isFinite(numeric)
        ? numeric.toLocaleString(undefined, { maximumFractionDigits: 2 })
        : String(rawRate);
    return `$${value}/hr locked`;
};

export const getAssignedMember = (shift: Shift, userId?: number | null) => {
    if (userId == null) return null;
    const members = ((shift as any).assignedMembers ?? (shift as any).assigned_members ?? []) as any[];
    return members.find((member) => Number(member.userId ?? member.user_id) === Number(userId)) ?? null;
};

export const getAssignedName = (assignment?: AssignmentLike | null, member?: any) => {
    const user = (assignment as any)?.user ?? {};
    const firstName = user.firstName ?? user.first_name ?? '';
    const lastName = user.lastName ?? user.last_name ?? '';
    const fullName = `${firstName} ${lastName}`.trim();
    const memberFirstName = member?.userFirstName ?? member?.user_first_name ?? '';
    const memberLastName = member?.userLastName ?? member?.user_last_name ?? '';
    const memberFullName = `${memberFirstName} ${memberLastName}`.trim();
    return fullName || user.name || user.displayName || memberFullName || member?.name || user.email || 'Assigned candidate';
};

export const getAssignedDetails = (assignment?: AssignmentLike | null, member?: any) => {
    const user = (assignment as any)?.user ?? {};
    return user.email || user.phoneNumber || user.phone_number || member?.role || member?.employmentType || member?.employment_type || 'Profile locked to this slot';
};

export const getAssignedEntries = (shift: Shift) => {
    const assignments = ((shift as any).slotAssignments ?? (shift as any).slot_assignments ?? []) as AssignmentLike[];
    const slots = (shift.slots ?? []) as any[];
    const firstAssignedUserId = assignments.length > 0 ? getAssignmentUserId(assignments[0]) : null;

    if (shift.singleUserOnly) {
        return slots
            .map((slot) => ({ slot, userId: firstAssignedUserId, assignment: assignments[0] ?? null }))
            .filter((entry) => entry.userId != null);
    }

    return slots
        .map((slot) => {
            const assignment = assignments.find((entry) => getAssignmentSlotId(entry) === slot.id);
            return {
                slot,
                userId: assignment ? getAssignmentUserId(assignment) : null,
                assignment: assignment ?? null,
            };
        })
        .filter((entry) => entry.userId != null);
};

export const getSlotEntries = (shift: Shift) => {
    const assignments = ((shift as any).slotAssignments ?? (shift as any).slot_assignments ?? []) as AssignmentLike[];
    const slots = (shift.slots ?? []) as any[];
    const firstAssignedUserId = assignments.length > 0 ? getAssignmentUserId(assignments[0]) : null;

    if (shift.singleUserOnly) {
        return slots.map((slot) => ({
            slot,
            userId: firstAssignedUserId,
            assignment: assignments[0] ?? null,
            assigned: firstAssignedUserId != null,
        }));
    }

    return slots.map((slot) => {
        const assignment = assignments.find((entry) => getAssignmentSlotId(entry) === slot.id);
        const userId = assignment ? getAssignmentUserId(assignment) : null;
        return {
            slot,
            userId,
            assignment: assignment ?? null,
            assigned: userId != null,
        };
    });
};

function StatPill({ label, value, icon }: { icon: React.ReactNode; label: string; value: number }) {
    return (
        <Surface style={styles.statPill} elevation={0}>
            <View style={styles.statIconWrap}>{icon}</View>
            <View style={styles.statContent}>
                <Text style={styles.statValue}>{value}</Text>
                <Text style={styles.statLabel}>{label}</Text>
            </View>
        </Surface>
    );
}

export default function OwnerAssignedShiftBoard({
    emptyText,
    loading,
    mode,
    onRateAssigned,
    onViewAssigned,
    shifts,
    title,
}: Props) {
    const [expandedShiftIds, setExpandedShiftIds] = useState<Record<number, boolean>>({});
    const { width: screenWidth } = useWindowDimensions();
    const useTwoColumnSlots = screenWidth <= 420;

    const toggleShift = (shiftId: number) => {
        setExpandedShiftIds((prev) => ({
            ...prev,
            [shiftId]: !prev[shiftId],
        }));
    };

    if (loading) {
        return (
            <View style={styles.centered}>
                <ActivityIndicator color={colors.primary} />
            </View>
        );
    }

    if (!shifts.length) {
        return (
            <Surface style={styles.emptyState} elevation={0}>
                <Text style={styles.emptyTitle}>{title}</Text>
                <Text style={styles.emptyText}>{emptyText}</Text>
            </Surface>
        );
    }

    return (
        <ScrollView contentContainerStyle={styles.list}>
            {shifts.map((shift) => {
                const assignedEntries = getAssignedEntries(shift);
                const slotEntries = mode === 'history'
                    ? getSlotEntries(shift)
                    : assignedEntries.map((entry) => ({ ...entry, assigned: true }));
                const totalSlots = (shift.slots ?? []).length;
                const shiftAny = shift as any;
                const interests = shiftAny.interestedUsersCount ?? shiftAny.interested_users_count ?? 0;
                const location = shift.uiAddressLine ?? shiftAny.ui_address_line ?? shift.pharmacyDetail?.streetAddress ?? '';
                const isExpanded = Boolean(expandedShiftIds[shift.id]);
                const modeColors = mode === 'history'
                    ? { chipBg: colors.status.amber.bg, chipFg: colors.status.amber.fg, cardBg: colors.status.amber.bg }
                    : { chipBg: colors.status.green.bg, chipFg: colors.status.green.fg, cardBg: colors.primarySoft };

                return (
                    <Card
                        key={shift.id}
                        style={styles.shiftCard}
                        mode="outlined"
                        onPress={() => toggleShift(shift.id)}
                    >
                        <Card.Content style={styles.shiftContent}>
                            <View style={styles.headerRow}>
                                <View style={styles.headerMain}>
                                    <View style={styles.headerTextBlock}>
                                        <View style={styles.headerAvatar}>
                                            <CheckCircle2 size={24} color={colors.surfaceBg} />
                                        </View>
                                        <Text style={styles.shiftTitle}>{shift.pharmacyDetail?.name ?? 'Unknown Pharmacy'}</Text>
                                        <View style={styles.chipRow}>
                                            <Chip compact style={[styles.metaChip, { backgroundColor: colors.status.green.bg }]} textStyle={[styles.metaChipText, { color: colors.status.green.fg }]}>
                                                {shift.roleLabel ?? shift.roleNeeded ?? shiftAny.role_needed ?? 'Role'}
                                            </Chip>
                                            {shift.employmentType ? (
                                                <Chip compact style={[styles.metaChip, { backgroundColor: colors.tone.blue.bg }]} textStyle={[styles.metaChipText, { color: colors.tone.blue.fg }]}>
                                                    {String(shift.employmentType).replace('_', ' ')}
                                                </Chip>
                                            ) : null}
                                            {shift.uiIsUrgent ? (
                                                <Chip compact style={[styles.metaChip, { backgroundColor: colors.status.red.bg }]} textStyle={[styles.metaChipText, { color: colors.status.red.fg }]}>
                                                    Urgent
                                                </Chip>
                                            ) : null}
                                        </View>
                                    </View>
                                </View>
                            </View>

                            {location ? <Text style={styles.locationText}>{location}</Text> : null}

                            <View style={styles.statsRow}>
                                <StatPill icon={<Calendar size={18} color={colors.primary} />} label="Slots" value={totalSlots} />
                                <StatPill icon={<Users size={18} color={colors.primary} />} label="Assigned" value={assignedEntries.length} />
                                <StatPill icon={<Heart size={18} color={colors.primary} />} label="Interests" value={interests} />
                            </View>

                            {isExpanded && (
                                <>
                                    <View style={styles.sectionHeader}>
                                        <Text style={styles.sectionTitle}>{mode === 'history' ? 'Shift Slot Grid' : 'Assigned Slot Grid'}</Text>
                                        <Chip compact style={[styles.stateChip, { backgroundColor: modeColors.chipBg }]} textStyle={[styles.metaChipText, { color: modeColors.chipFg }]}>
                                            {mode === 'history' ? 'Completed' : 'Assigned'}
                                        </Chip>
                                    </View>
                                    <Text style={styles.sectionCopy}>
                                        {mode === 'history'
                                            ? 'All past slots are shown. Assigned ones keep profile and rating actions.'
                                            : 'Focused on paid and assigned chemists only.'}
                                    </Text>

                                    <View style={styles.slotGrid}>
                                        {slotEntries.map(({ slot, userId, assigned, assignment }) => {
                                            const dateBits = formatDateLabel(slot?.date);
                                            const assignedMember = getAssignedMember(shift, userId);
                                            const assignedName = getAssignedName(assignment, assignedMember);
                                            const assignedDetails = getAssignedDetails(assignment, assignedMember);
                                            const lockedRate = formatSlotLockedRate(slot);
                                            return (
                                                <TouchableOpacity
                                                    key={`${shift.id}_${slot?.id}`}
                                                    activeOpacity={assigned ? 0.84 : 1}
                                                    disabled={!assigned}
                                                    onPress={() => assigned ? onViewAssigned(shift.id, slot?.id ?? null, userId as number) : undefined}
                                                    style={[
                                                        styles.slotGridCell,
                                                        useTwoColumnSlots ? styles.slotGridCellHalf : styles.slotGridCellThird,
                                                    ]}
                                                >
                                                    <Surface
                                                        style={[
                                                            styles.slotCard,
                                                            mode === 'history' ? styles.slotCardCompact : null,
                                                            {
                                                                backgroundColor: assigned ? modeColors.cardBg : colors.subtleBg,
                                                                borderColor: colors.border,
                                                            },
                                                        ]}
                                                        elevation={0}
                                                    >
                                                        <View style={styles.slotTopRow}>
                                                            <View>
                                                                <Text style={[styles.slotDay, mode === 'history' ? styles.slotDayCompact : null]}>{dateBits.day}</Text>
                                                                <Text style={[styles.slotDate, mode === 'history' ? styles.slotDateCompact : null]}>{dateBits.date}</Text>
                                                            </View>
                                                            <View style={styles.slotTopMeta}>
                                                                <View style={[styles.slotAvatarWrap, { backgroundColor: assigned ? colors.primarySoft : colors.subtleBg }]}>
                                                                    <User size={16} color={assigned ? colors.primary : colors.textMuted} />
                                                                </View>
                                                            </View>
                                                        </View>

                                                        <Text style={[styles.slotTime, mode === 'history' ? styles.slotTimeCompact : null]}>{formatTimeRange(slot)}</Text>

                                                        <Surface style={[styles.assignedPanel, mode === 'history' ? styles.assignedPanelCompact : null]} elevation={0}>
                                                            <Text style={[styles.assignedTitle, mode === 'history' ? styles.assignedTitleCompact : null]}>{assigned ? assignedName : 'Open Slot'}</Text>
                                                            {assigned ? (
                                                                <>
                                                                    <Text style={[styles.assignedCopy, mode === 'history' ? styles.assignedCopyCompact : null]}>
                                                                        {assignedDetails}
                                                                    </Text>
                                                                    <View style={styles.lockedRateRow}>
                                                                        <Lock size={13} color={colors.primary} />
                                                                        <Text style={styles.lockedRateText}>{lockedRate}</Text>
                                                                    </View>
                                                                </>
                                                            ) : (
                                                                <Text style={[styles.assignedCopy, mode === 'history' ? styles.assignedCopyCompact : null]}>
                                                                    No assignment
                                                                </Text>
                                                            )}
                                                        </Surface>

                                                        {mode !== 'history' && (
                                                            <View style={styles.slotActionRow}>
                                                                {assigned ? (
                                                                    <Button
                                                                        mode="contained"
                                                                        onPress={() => onViewAssigned(shift.id, slot?.id ?? null, userId as number)}
                                                                        style={styles.primaryBtn}
                                                                        labelStyle={styles.primaryBtnText}
                                                                    >
                                                                        View Assigned
                                                                    </Button>
                                                                ) : (
                                                                    <Button mode="outlined" disabled style={styles.secondaryBtn} labelStyle={styles.secondaryBtnText}>
                                                                        No Assignment
                                                                    </Button>
                                                                )}
                                                            </View>
                                                        )}

                                                        {assigned && mode === 'history' && onRateAssigned ? (
                                                            <Button
                                                                mode="outlined"
                                                                compact
                                                                icon={({ size, color }) => <Star size={size} color={color} />}
                                                                onPress={() => onRateAssigned(userId as number)}
                                                                style={styles.secondaryBtn}
                                                                labelStyle={styles.secondaryBtnText}
                                                            >
                                                                Rate
                                                            </Button>
                                                        ) : null}
                                                    </Surface>
                                                </TouchableOpacity>
                                            );
                                        })}
                                    </View>
                                </>
                            )}
                        </Card.Content>
                    </Card>
                );
            })}
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    list: {
        padding: 12,
        gap: 14,
    },
    centered: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
    },
    emptyState: {
        margin: 12,
        padding: 20,
        borderRadius: radius.sheet,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surfaceBg,
        shadowColor: colors.textPrimary,
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.08,
        shadowRadius: 24,
        elevation: 3,
    },
    emptyTitle: {
        fontSize: 22,
        fontWeight: '900',
        color: colors.textPrimary,
        marginBottom: 6,
    },
    emptyText: {
        color: colors.textMuted,
    },
    shiftCard: {
        borderRadius: radius.card,
        borderColor: colors.border,
        backgroundColor: colors.surfaceBg,
        shadowColor: colors.primary,
        shadowOffset: { width: 0, height: 14 },
        shadowOpacity: 0.12,
        shadowRadius: 28,
        elevation: 5,
    },
    shiftContent: {
        gap: 14,
    },
    headerRow: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
    },
    headerMain: {
        flexDirection: 'column',
        gap: 12,
        flex: 1,
        alignItems: 'stretch',
    },
    headerAvatar: {
        width: 44,
        height: 44,
        borderRadius: radius.control,
        backgroundColor: colors.primary,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 2,
        shadowColor: colors.primary,
        shadowOffset: { width: 0, height: 12 },
        shadowOpacity: 0.22,
        shadowRadius: 24,
        elevation: 5,
    },
    headerTextBlock: {
        width: '100%',
        alignItems: 'flex-start',
    },
    shiftTitle: {
        color: colors.textPrimary,
        fontWeight: '900',
        fontSize: 24,
        lineHeight: 28,
        textAlign: 'left',
    },
    chipRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
        marginTop: 8,
        justifyContent: 'flex-start',
    },
    metaChip: {
        borderRadius: radius.pill,
        alignSelf: 'flex-start',
        maxWidth: '100%',
    },
    metaChipText: {
        fontWeight: '800',
    },
    locationText: {
        color: colors.textMuted,
        fontSize: 13,
        textAlign: 'left',
    },
    statsRow: {
        flexDirection: 'row',
        flexWrap: 'nowrap',
        justifyContent: 'space-between',
        alignItems: 'stretch',
        marginHorizontal: -4,
    },
    statPill: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        borderRadius: radius.nested,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.subtleBg,
        paddingHorizontal: 8,
        paddingVertical: 8,
        flex: 1,
        minWidth: 0,
        marginHorizontal: 4,
        shadowColor: colors.textPrimary,
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.06,
        shadowRadius: 18,
        elevation: 2,
    },
    statIconWrap: {
        width: 32,
        height: 32,
        borderRadius: radius.pill,
        backgroundColor: colors.primarySoft,
        alignItems: 'center',
        justifyContent: 'center',
    },
    statContent: {
        alignItems: 'center',
    },
    statValue: {
        fontWeight: '900',
        color: colors.textPrimary,
        fontSize: 16,
        lineHeight: 18,
        textAlign: 'center',
    },
    statLabel: {
        color: colors.textMuted,
        fontSize: 10,
        textTransform: 'uppercase',
        textAlign: 'center',
    },
    sectionHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 10,
    },
    sectionTitle: {
        color: colors.textPrimary,
        fontWeight: '900',
        fontSize: 18,
    },
    stateChip: {
        borderRadius: radius.pill,
    },
    sectionCopy: {
        color: colors.textMuted,
        marginTop: -8,
    },
    slotGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        marginHorizontal: -4,
    },
    slotGridCell: {
        paddingHorizontal: 4,
        marginBottom: 8,
    },
    slotGridCellHalf: {
        width: '50%',
    },
    slotGridCellThird: {
        width: '33.3333%',
    },
    slotCard: {
        borderRadius: radius.nested,
        borderWidth: 1,
        borderColor: colors.border,
        padding: 14,
        gap: 10,
        shadowColor: colors.textPrimary,
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.06,
        shadowRadius: 18,
        elevation: 2,
    },
    slotCardCompact: {
        padding: 10,
        gap: 8,
        minHeight: 176,
    },
    slotTopRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        gap: 8,
    },
    slotTopMeta: {
        alignItems: 'flex-end',
        flexShrink: 1,
        minWidth: 0,
    },
    slotDay: {
        color: colors.textMuted,
        fontSize: 12,
        fontWeight: '800',
        textTransform: 'uppercase',
    },
    slotDate: {
        color: colors.textPrimary,
        fontSize: 22,
        fontWeight: '900',
        lineHeight: 26,
    },
    slotDayCompact: {
        fontSize: 10,
    },
    slotDateCompact: {
        fontSize: 18,
        lineHeight: 20,
    },
    slotAvatarWrap: {
        width: 32,
        height: 32,
        borderRadius: radius.pill,
        alignItems: 'center',
        justifyContent: 'center',
    },
    slotTime: {
        color: colors.primary,
        fontWeight: '800',
    },
    slotTimeCompact: {
        fontSize: 11,
    },
    assignedPanel: {
        borderRadius: radius.control,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surfaceBg,
        padding: 12,
    },
    assignedPanelCompact: {
        padding: 8,
    },
    assignedTitle: {
        color: colors.textPrimary,
        fontWeight: '800',
    },
    assignedTitleCompact: {
        fontSize: 12,
    },
    assignedCopy: {
        color: colors.textMuted,
        fontSize: 12,
    },
    assignedCopyCompact: {
        fontSize: 10,
    },
    lockedRateRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        marginTop: 4,
    },
    lockedRateText: {
        color: colors.textPrimary,
        fontSize: 12,
        fontWeight: '800',
    },
    slotActionRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
    },
    primaryBtn: {
        backgroundColor: colors.primary,
        borderRadius: radius.pill,
        minHeight: 44,
        justifyContent: 'center',
    },
    primaryBtnText: {
        color: colors.surfaceBg,
        fontWeight: '800',
    },
    secondaryBtn: {
        borderRadius: radius.pill,
        borderColor: colors.border,
        minHeight: 44,
        justifyContent: 'center',
    },
    secondaryBtnText: {
        color: colors.textPrimary,
        fontWeight: '800',
    },
});
