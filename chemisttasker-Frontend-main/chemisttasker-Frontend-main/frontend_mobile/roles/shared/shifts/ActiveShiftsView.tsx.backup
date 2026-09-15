import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, View, RefreshControl, StyleSheet, Linking } from 'react-native';
import {
    ActivityIndicator,
    Card,
    Chip,
    Divider,
    IconButton,
    List,
    Snackbar,
    Text,
    Button,
    Portal,
    Dialog,
    Icon,
} from 'react-native-paper';
import { useRouter } from 'expo-router';
import apiClient from '../../../utils/apiClient';
import {
    fetchActiveShifts,
    fetchShiftInterests,
    fetchShiftMemberStatus,
    generateShiftShareLinkService,
    escalateShiftService,
    deleteActiveShiftService,
    acceptShiftCandidateService,
    revealShiftInterestService,
    fetchRatingsSummaryService,
    fetchRatingsPageService,
    type Shift,
    type ShiftInterest,
    type ShiftMemberStatus,
    type EscalationLevelKey,
    type ShiftRatingSummary,
    type ShiftRatingComment,
} from '@chemisttasker/shared-core';
import { useAuth } from '@/context/AuthContext';

const ESCALATION_ORDER: Array<{ key: EscalationLevelKey; label: string }> = [
    { key: 'FULL_PART_TIME', label: 'My Pharmacy' },
    { key: 'LOCUM_CASUAL', label: 'Favourites' },
    { key: 'OWNER_CHAIN', label: 'Chain' },
    { key: 'ORG_CHAIN', label: 'Organization' },
    { key: 'PLATFORM', label: 'Platform' },
];

type Props = {
    onError?: (msg: string) => void;
    onShare?: (link: string | null) => void;
};

export default function ActiveShiftsView({ onError, onShare }: Props) {
    const { user } = useAuth();
    const router = useRouter();
    const [shifts, setShifts] = useState<Shift[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [snackbar, setSnackbar] = useState<string>('');
    const [shareLink, setShareLink] = useState<string | null>(null);
    const [escalating, setEscalating] = useState<Record<number, boolean>>({});
    const [deleting, setDeleting] = useState<Record<number, boolean>>({});
    const [deleteId, setDeleteId] = useState<number | null>(null);
    const [membersByLevel, setMembersByLevel] = useState<Record<string, ShiftMemberStatus[]>>({});
    const [interestsByShift, setInterestsByShift] = useState<Record<number, ShiftInterest[]>>({});
    const [expanded, setExpanded] = useState<number | null>(null);
    const [selectedLevelByShift, setSelectedLevelByShift] = useState<Record<number, EscalationLevelKey>>({});
    const [selectedSlotByShift, setSelectedSlotByShift] = useState<Record<number, number | undefined>>({});
    const [ratingDialog, setRatingDialog] = useState<{
        userId: number | null;
        name: string | null;
        employmentType?: string | null;
        email?: string | null;
        phone?: string | null;
        bio?: string | null;
    }>({ userId: null, name: null });
    const [ratingSummary, setRatingSummary] = useState<ShiftRatingSummary | null>(null);
    const [ratingComments, setRatingComments] = useState<ShiftRatingComment[]>([]);
    const [ratingLoading, setRatingLoading] = useState(false);

    const notify = (msg: string) => {
        setSnackbar(msg);
        onError?.(msg);
    };

    const ensureRevealedDetail = useCallback(
        async (shiftId: number, interest: ShiftInterest, slotId?: number | null) => {
            // If already have a name, reuse; otherwise call reveal API to fetch detail
            const alreadyNamed = displayInterestName(interest);
            const hasProfile = alreadyNamed && (interest as any).email;
            if (interest.revealed) {
                return {
                    detail: null,
                    name: alreadyNamed,
                    employmentType: (interest as any).employmentType || null,
                    email: (interest as any).email || null,
                    phone: (interest as any).phoneNumber || (interest as any).phone_number || null,
                    bio: (interest as any).shortBio || (interest as any).short_bio || null,
                };
            }
            const payload: any = { userId: interest.userId };
            if (slotId) payload.slotId = slotId;
            const detail: any = await revealShiftInterestService(shiftId, payload);
            const detailName =
                detail?.fullName ||
                detail?.full_name ||
                detail?.name ||
                (detail?.firstName && `${detail.firstName} ${detail.lastName || ''}`.trim()) ||
                alreadyNamed ||
                null;
            // update local interest cache so future renders have the name
            setInterestsByShift((prev) => {
                const list = prev[shiftId] || [];
                const updated = list.map((i) =>
                    i.userId === interest.userId
                        ? {
                            ...i,
                            revealed: true,
                            userName: detailName || i.userName,
                            employmentType: detail?.employmentType || detail?.employment_type || (i as any).employmentType,
                            email: detail?.email || (i as any).email,
                            phoneNumber: detail?.phoneNumber || detail?.phone_number || (i as any).phoneNumber,
                            shortBio: detail?.shortBio || detail?.short_bio || (i as any).shortBio,
                        }
                        : i,
                );
                return { ...prev, [shiftId]: updated };
            });
            return {
                detail,
                name: detailName,
                employmentType: detail?.employmentType || detail?.employment_type || (interest as any).employmentType || null,
                email: detail?.email || (interest as any).email || null,
                phone: detail?.phoneNumber || detail?.phone_number || (interest as any).phoneNumber || null,
                bio: detail?.shortBio || detail?.short_bio || (interest as any).shortBio || null,
            };
        },
        [],
    );

    const loadShifts = useCallback(async () => {
        setLoading(true);
        try {
            const data = await fetchActiveShifts();
            const list = Array.isArray(data) ? data : [];
            setShifts(list);
            // Preselect a slot for multi-slot shifts so slot_id is always sent
            setSelectedSlotByShift((prev) => {
                const next = { ...prev };
                list.forEach((shift) => {
                    if (!shift.singleUserOnly) {
                        const firstSlot = shift.slots?.[0]?.id;
                        if (firstSlot && next[shift.id] == null) {
                            next[shift.id] = firstSlot;
                        }
                    }
                });
                return next;
            });
        } catch (err: any) {
            notify(err?.message || 'Failed to load active shifts.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void loadShifts();
    }, [loadShifts]);

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        await loadShifts();
        setRefreshing(false);
    }, [loadShifts]);

    const handleEdit = (shift: Shift) => {
        const pharmacyId = (shift as any).pharmacyId ?? (shift as any).pharmacy_id ?? (shift as any).pharmacy ?? null;
        const base =
            user?.role?.startsWith('ORG_')
                ? '/organization/post-shift'
                : user?.role === 'PHARMACY_ADMIN'
                    ? (pharmacyId != null ? `/admin/${pharmacyId}/post-shift` : '/admin/post-shift')
                    : '/owner/post-shift';

        router.push({ pathname: base as any, params: { edit: String(shift.id) } });
    };

    const handleShare = async (id: number) => {
        try {
            const res = await generateShiftShareLinkService(id);
            const link = res?.shareToken || res?.share_token || null;
            setShareLink(link);
            onShare?.(link);
            setSnackbar('Share link generated');
        } catch (err: any) {
            notify(err?.message || 'Failed to generate share link');
        }
    };

    const handleEscalate = async (shift: Shift) => {
        const allowed = shift.allowedEscalationLevels || [];
        const currentIndex = allowed.findIndex((k) => k === shift.visibility);
        const next = currentIndex >= 0 && currentIndex < allowed.length - 1 ? allowed[currentIndex + 1] : null;
        if (!next) {
            notify('No further escalation level available.');
            return;
        }
        setEscalating((s) => ({ ...s, [shift.id]: true }));
        try {
            await escalateShiftService(shift.id, { targetVisibility: next });
            setSnackbar(`Escalated to ${next}`);
            await loadShifts();
        } catch (err: any) {
            notify(err?.message || 'Failed to escalate shift');
        } finally {
            setEscalating((s) => ({ ...s, [shift.id]: false }));
        }
    };

    const handleDelete = async (id: number) => {
        setDeleting((s) => ({ ...s, [id]: true }));
        try {
            await deleteActiveShiftService(id);
            setSnackbar('Shift deleted');
            await loadShifts();
        } catch (err: any) {
            notify(err?.message || 'Failed to delete shift');
        } finally {
            setDeleting((s) => ({ ...s, [id]: false }));
            setDeleteId(null);
        }
    };

    const loadMembers = async (shift: Shift, level: EscalationLevelKey) => {
        const key = `${shift.id}_${level}`;
        let slotId = currentSlotId(shift);
        // For multi-slot shifts the backend requires slot_id; default to first slot if none selected
        if (!shift.singleUserOnly && !slotId) {
            const first = shift.slots?.[0]?.id;
            if (!first) {
                notify('No slot selected for this shift.');
                return;
            }
            slotId = first;
            setSelectedSlotByShift((s) => ({ ...s, [shift.id]: first }));
        }
        try {
            const params = slotId
                ? { visibility: level, slot_id: slotId, slotId }
                : { visibility: level };
            const data = await fetchShiftMemberStatus(shift.id, params);
            setMembersByLevel((prev) => ({ ...prev, [key]: Array.isArray(data) ? data : [] }));
        } catch (err: any) {
            notify(err?.message || 'Failed to load members');
        }
    };

    const loadInterests = async (shiftId: number, slotId?: number | null) => {
        try {
            const params: any = { shiftId };
            if (slotId) params.slotId = slotId;
            const data = await fetchShiftInterests(params);
            setInterestsByShift((prev) => ({ ...prev, [shiftId]: Array.isArray(data) ? data : [] }));
        } catch (err: any) {
            notify(err?.message || 'Failed to load interests');
        }
    };

    const handleAccept = async (shiftId: number, userId: number, slotId?: number | null) => {
        try {
            const payload: any = { userId };
            if (slotId) payload.slotId = slotId;
            await acceptShiftCandidateService(shiftId, payload);
            setSnackbar('Candidate accepted');
            await loadShifts();
        } catch (err: any) {
            notify(err?.message || 'Failed to accept candidate');
        }
    };

    const displayInterestName = (i: ShiftInterest): string | null => {
        const candidate =
            (i as any).userName ||
            (i as any).user_name ||
            (i as any).full_name ||
            (i as any).name ||
            (i as any).user?.fullName ||
            (i as any).user?.full_name ||
            ((i as any).user?.firstName && `${(i as any).user?.firstName} ${(i as any).user?.lastName || ''}`.trim()) ||
            null;
        return candidate;
    };

    const handleReveal = async (
        shiftId: number,
        userId: number,
        slotId?: number | null,
        meta?: {
            name?: string | null;
            employmentType?: string | null;
        },
    ) => {
        try {
            const payload: any = { userId };
            if (slotId) payload.slotId = slotId;
            const detail: any = await revealShiftInterestService(shiftId, payload);
            setSnackbar('Profile revealed');
            setInterestsByShift((prev) => {
                const list = prev[shiftId] || [];
                const detailName =
                    detail?.fullName ||
                    detail?.full_name ||
                    detail?.name ||
                    (detail?.firstName && `${detail.firstName} ${detail.lastName || ''}`.trim()) ||
                    meta?.name ||
                    null;
                const updated = list.map((i) =>
                    i.userId === userId
                        ? {
                            ...i,
                            revealed: true,
                            userName: detailName || i.userName,
                            employmentType: detail?.employmentType || detail?.employment_type || (i as any).employmentType,
                            email: detail?.email || (i as any).email,
                            phoneNumber: detail?.phoneNumber || detail?.phone_number || (i as any).phoneNumber,
                            shortBio: detail?.shortBio || detail?.short_bio || (i as any).shortBio,
                        }
                        : i,
                );
                return { ...prev, [shiftId]: updated };
            });
            await loadInterests(shiftId, slotId);
            const detailName =
                detail?.fullName ||
                detail?.full_name ||
                detail?.name ||
                (detail?.firstName && `${detail.firstName} ${detail.lastName || ''}`.trim()) ||
                meta?.name ||
                null;
            setRatingDialog({
                userId,
                name: detailName,
                employmentType: meta?.employmentType ?? detail?.employmentType ?? detail?.employment_type ?? null,
            });
            void loadRatings(userId);
        } catch (err: any) {
            notify(err?.message || 'Failed to reveal profile');
        }
    };

    const loadRatings = async (userId: number) => {
        setRatingLoading(true);
        try {
            const summary = await fetchRatingsSummaryService({ targetType: 'worker', targetId: userId });
            setRatingSummary(summary ?? null);
            if (summary) {
                setRatingDialog((prev) => ({
                    ...prev,
                    name:
                        prev.name ||
                        (summary as any).targetName ||
                        (summary as any).target_name ||
                        (summary as any).userName ||
                        (summary as any).user_name ||
                        null,
                }));
            }
            const commentsRes = await fetchRatingsPageService({
                targetType: 'worker',
                targetId: userId,
                page: 1,
                pageSize: 10,
            });
            const items = (commentsRes as any)?.results ?? commentsRes ?? [];
            setRatingComments(Array.isArray(items) ? items : []);
        } catch (err: any) {
            notify(err?.message || 'Failed to load ratings');
        } finally {
            setRatingLoading(false);
        }
    };

    const openRatings = (
        userId: number,
        name?: string | null,
        meta?: {
            employmentType?: string | null;
            email?: string | null;
            phone?: string | null;
            bio?: string | null;
        },
    ) => {
        setRatingDialog({
            userId,
            name: name ?? null,
            employmentType: meta?.employmentType ?? null,
            email: meta?.email ?? null,
            phone: meta?.phone ?? null,
            bio: meta?.bio ?? null,
        });
        setRatingSummary(null);
        setRatingComments([]);
        void loadRatings(userId);
    };

    const closeRatings = () => {
        setRatingDialog({ userId: null, name: null });
        setRatingSummary(null);
        setRatingComments([]);
    };

    const levelsForShift = (shift: Shift) => {
        const allowed = shift.allowedEscalationLevels || [];
        if (!allowed.length) return ESCALATION_ORDER;
        return ESCALATION_ORDER.filter((l) => allowed.includes(l.key));
    };

    const currentSelectedLevel = (shift: Shift) => {
        const levels = levelsForShift(shift);
        const current = selectedLevelByShift[shift.id];
        if (current && levels.find((l) => l.key === current)) return current;
        return shift.visibility && levels.find((l) => l.key === (shift.visibility as EscalationLevelKey))?.key || levels[0].key;
    };

    const currentSlotId = (shift: Shift) => {
        const chosen = selectedSlotByShift[shift.id];
        if (chosen) return chosen;
        return shift.slots?.[0]?.id;
    };

    const renderEscalationStepper = (shift: Shift) => {
        const levels = levelsForShift(shift);
        const current = shift.visibility as EscalationLevelKey | undefined;
        const currentIdx = levels.findIndex((l) => l.key === current);
        return (
            <View style={styles.stepperRow}>
                {levels.map((lvl, idx) => {
                    const isActive = idx === currentIdx;
                    const isCompleted = idx < currentIdx;
                    return (
                        <View key={lvl.key} style={styles.stepperItem}>
                            <View style={[
                                styles.stepCircle,
                                isCompleted && styles.stepCircleCompleted,
                                isActive && styles.stepCircleActive,
                            ]}>
                                <Icon source={isCompleted ? 'check' : 'circle-outline'} size={16} color={isActive || isCompleted ? '#FFFFFF' : '#9CA3AF'} />
                            </View>
                            <Text style={[styles.stepLabel, isActive && styles.stepLabelActive]}>{lvl.label}</Text>
                        </View>
                    );
                })}
            </View>
        );
    };

    const renderMembers = (shift: Shift) => {
        const levels = levelsForShift(shift);
        const selectedLevel = currentSelectedLevel(shift);
        const slotId = currentSlotId(shift);

        const slots = shift.slots || [];

        const selectSlot = (id?: number) => {
            setSelectedSlotByShift((s) => ({ ...s, [shift.id]: id }));
            void loadMembers(shift, selectedLevel);
        };

        const bucketMembers = (members: ShiftMemberStatus[]) => {
            const buckets: Record<string, ShiftMemberStatus[]> = {
                interested: [],
                accepted: [],
                rejected: [],
                no_response: [],
            };
            members.forEach((m) => {
                const status = (m.status || 'no_response') as string;
                const key = buckets[status] ? status : 'no_response';
                buckets[key].push(m);
            });
            return buckets;
        };

        const key = `${shift.id}_${selectedLevel}`;
        const members = membersByLevel[key] || [];
        const grouped = bucketMembers(members);

        const bucketConfig: Array<{ key: keyof typeof grouped; label: string; color: string }> = [
            { key: 'interested', label: 'Interested', color: '#0EA5E9' },
            { key: 'accepted', label: 'Assigned', color: '#10B981' },
            { key: 'rejected', label: 'Rejected', color: '#EF4444' },
            { key: 'no_response', label: 'No Response', color: '#B45309' },
        ];

        // Public platform view: show interests list only (no buckets)
        if (selectedLevel === 'PLATFORM') {
            const pubInterests = interestsByShift[shift.id] || [];
            return (
                <View style={{ gap: 8 }}>
                    {slots.length > 1 ? (
                        <View style={styles.slotSelectorRow}>
                            {slots.map((slot) => {
                                const active = slot.id === slotId;
                                return (
                                    <Chip
                                        key={slot.id}
                                        selected={active}
                                        onPress={() => {
                                            setSelectedSlotByShift((s) => ({ ...s, [shift.id]: slot.id }));
                                            void loadInterests(shift.id, slot.id);
                                        }}
                                        style={[styles.levelChip, active && styles.levelChipActive]}
                                        textStyle={active ? styles.levelTextActive : styles.levelText}
                                    >
                                        {slot.date} {slot.startTime}-{slot.endTime}
                                    </Chip>
                                );
                            })}
                        </View>
                    ) : slots.length === 1 ? (
                        <Chip icon="calendar" style={styles.chip}>
                            Slot: {slots[0]?.date} {slots[0]?.startTime} - {slots[0]?.endTime}
                        </Chip>
                    ) : null}

                    <Card mode="outlined" style={styles.innerCard}>
                        <Card.Title
                            title="Public Interest"
                            right={() => (
                                <Button compact onPress={() => loadInterests(shift.id, slotId)}>Refresh</Button>
                            )}
                        />
                        <Card.Content>
                            {pubInterests.length === 0 ? (
                                <Text style={styles.muted}>No public interests yet.</Text>
                            ) : (
                                pubInterests.map((i) => (
                                    <List.Item
                                        key={`${i.id}-${i.userId}`}
                                        title={displayInterestName(i) || 'Anonymous Interest User'}
                                        description={(i as any).role || (i as any).employmentType || 'Candidate'}
                                        right={() => (
                                            <Button
                                                compact
                                                mode="text"
                                                onPress={async () => {
                                                    try {
                                                        const { detail, name, employmentType, email, phone, bio } = await ensureRevealedDetail(shift.id, i, slotId);
                                                        openRatings(i.userId!, name || displayInterestName(i), { employmentType, email, phone, bio });
                                                    } catch (err: any) {
                                                        notify(err?.message || 'Failed to reveal candidate');
                                                    }
                                                }}
                                            >
                                                {i.revealed ? 'Review' : 'Reveal'}
                                            </Button>
                                        )}
                                    />
                                ))
                            )}
                        </Card.Content>
                    </Card>
                </View>
            );
        }

        return (
            <View style={{ gap: 8 }}>
                {slots.length > 1 ? (
                    <View style={styles.slotSelectorRow}>
                        {slots.map((slot) => {
                            const active = slot.id === slotId;
                            return (
                                <Chip
                                    key={slot.id}
                                    selected={active}
                                    onPress={() => selectSlot(slot.id)}
                                    style={[styles.levelChip, active && styles.levelChipActive]}
                                    textStyle={active ? styles.levelTextActive : styles.levelText}
                                >
                                    {slot.date} {slot.startTime}-{slot.endTime}
                                </Chip>
                            );
                        })}
                    </View>
                ) : slots.length === 1 ? (
                    <Chip icon="calendar" style={styles.chip}>
                        Slot: {slots[0]?.date} {slots[0]?.startTime} - {slots[0]?.endTime}
                    </Chip>
                ) : null}

                <View style={styles.levelRow}>
                    {levels.map((lvl) => (
                        <Chip
                            key={lvl.key}
                            selected={lvl.key === selectedLevel}
                            onPress={() => {
                                setSelectedLevelByShift((s) => ({ ...s, [shift.id]: lvl.key }));
                                if (lvl.key === 'PLATFORM') {
                                    void loadInterests(shift.id, slotId);
                                } else {
                                    void loadMembers(shift, lvl.key);
                                }
                            }}
                            style={[styles.levelChip, lvl.key === selectedLevel && styles.levelChipActive]}
                            textStyle={lvl.key === selectedLevel ? styles.levelTextActive : styles.levelText}
                        >
                            {lvl.label}
                        </Chip>
                    ))}
                </View>

                <Card mode="outlined" style={styles.innerCard}>
                    <Card.Title
                        title={levels.find((l) => l.key === selectedLevel)?.label || 'Members'}
                        right={() => (
                            <Button compact onPress={() => loadMembers(shift, selectedLevel)}>Refresh</Button>
                        )}
                    />
                    <Card.Content>
                        {bucketConfig.map((bucket) => {
                            const list = grouped[bucket.key] || [];
                            return (
                                <View key={bucket.key} style={styles.bucketCard}>
                                    <View style={styles.bucketHeader}>
                                        <Text style={[styles.bucketTitle, { color: bucket.color }]}>{bucket.label}</Text>
                                        <Chip style={styles.countChip} textStyle={styles.countChipText}>{list.length}</Chip>
                                    </View>
                                    {list.length === 0 ? (
                                        <Text style={styles.muted}>No candidates yet.</Text>
                                    ) : (
                                        list.map((m) => (
                                            <List.Item
                                                key={`${m.userId}-${m.status}`}
                                                title={m.name || (m as any).fullName || `User ${m.userId}`}
                                                description={(m.employmentType || m.status || '').replace('_', ' ')}
                                                right={() => (
                                                    <View style={styles.row}>
                                                        {bucket.key === 'interested' ? (
                                                            <>
                                                                <Button
                                                                    compact
                                                                    onPress={() =>
                                                                        openRatings(m.userId!, m.name || (m as any).fullName || null, {
                                                                            employmentType: m.employmentType || null,
                                                                        })
                                                                    }
                                                                >
                                                                    Review
                                                                </Button>
                                                                <Button compact onPress={() => handleAccept(shift.id, m.userId!, slotId)}>Assign</Button>
                                                            </>
                                                        ) : null}
                                                    </View>
                                                )}
                                            />
                                        ))
                                    )}
                                    <Divider style={{ marginVertical: 8 }} />
                                </View>
                            );
                        })}
                    </Card.Content>
                </Card>
            </View>
        );
    };

    const renderShiftCard = (shift: Shift) => {
        const isExpanded = expanded === shift.id;
        const slotId = currentSlotId(shift);

        const toggleExpand = () => {
            if (isExpanded) {
                setExpanded(null);
                return;
            }
            setExpanded(shift.id);
            const level = currentSelectedLevel(shift);
            const slot = currentSlotId(shift);
            if (level === 'PLATFORM') {
                void loadInterests(shift.id, slot);
            } else {
                void loadMembers(shift, level);
            }
        };

        return (
            <Card key={shift.id} style={styles.card} mode="outlined">
                <Card.Content>
                    <View style={styles.actionsRow}>
                        <IconButton icon="share-variant" onPress={() => handleShare(shift.id)} />
                        <IconButton
                            icon="arrow-up-bold"
                            onPress={() => handleEscalate(shift)}
                            disabled={!!escalating[shift.id]}
                        />
                        <IconButton icon="pencil" onPress={() => handleEdit(shift)} />
                        <IconButton icon="delete" onPress={() => setDeleteId(shift.id)} disabled={!!deleting[shift.id]} />
                        <IconButton icon={isExpanded ? 'chevron-up' : 'chevron-down'} onPress={toggleExpand} />
                    </View>

                    <View style={styles.headerRow}>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.cardTitleText}>{shift.pharmacyName || shift.pharmacyDetail?.name || 'Pharmacy'}</Text>
                            <Text style={styles.cardSubtitleText}>{`${shift.roleNeeded || 'Role'} • ${shift.visibility}`}</Text>
                        </View>
                    </View>

                    {renderEscalationStepper(shift)}
                    {shift.description ? (
                        <Text style={styles.description}>{shift.description}</Text>
                    ) : null}
                    <View style={styles.slotRow}>
                        {(shift.slots || []).map((slot, idx) => (
                            <Chip key={`${shift.id}-slot-${idx}`} style={styles.chip} icon="calendar">
                                {slot.date || 'Date'} • {slot.startTime || ''}{slot.endTime ? ` - ${slot.endTime}` : ''}
                            </Chip>
                        ))}
                    </View>
                    {isExpanded ? (
                        <>
                            <Divider style={{ marginVertical: 8 }} />
                            <Text style={styles.sectionTitle}>Members by tier</Text>
                            {renderMembers(shift)}

                            {(shift as any).paymentStatus === 'PENDING' && (
                                <View style={{
                                    marginTop: 12,
                                    padding: 12,
                                    backgroundColor: '#FEE2E2',
                                    borderRadius: 8,
                                    borderWidth: 1,
                                    borderColor: '#EF4444',
                                }}>
                                    <Text style={{ fontWeight: 'bold', color: '#DC2626', marginBottom: 4 }}>
                                        Payment Required
                                    </Text>
                                    <Text style={{ color: '#374151', marginBottom: 10 }}>
                                        A candidate confirmed this shift. Complete payment to finalise their booking.
                                    </Text>
                                    <Button
                                        mode="contained"
                                        buttonColor="#DC2626"
                                        onPress={async () => {
                                            try {
                                                const { data: res } = await apiClient.post(`/billing/charge-fulfillment/${shift.id}/`);
                                                if (res?.url) {
                                                    await Linking.openURL(res.url);
                                                } else if (res?.free) {
                                                    notify(res?.message || 'Shift finalized without payment.');
                                                    await loadShifts();
                                                } else {
                                                    notify('Payment session was not returned.');
                                                }
                                            } catch (err: any) {
                                                notify(err?.message || 'Failed to initiate payment.');
                                            }
                                        }}
                                    >
                                        Pay Now
                                    </Button>
                                </View>
                            )}
                        </>
                    ) : null}
                </Card.Content>
            </Card>
        );
    };

    return (
        <>
            {loading ? (
                <View style={styles.centered}>
                    <ActivityIndicator size="large" color="#7C3AED" />
                </View>
            ) : (
                <ScrollView
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#7C3AED" />}
                    contentContainerStyle={styles.list}
                >
                    {shifts.length === 0 ? (
                        <View style={styles.centered}>
                            <Text style={styles.muted}>No active shifts</Text>
                        </View>
                    ) : shifts.map(renderShiftCard)}
                </ScrollView>
            )}

            <Snackbar visible={!!snackbar} onDismiss={() => setSnackbar('')} duration={3000}>
                {snackbar}
            </Snackbar>

            <Portal>
                <Dialog visible={ratingDialog.userId !== null} onDismiss={closeRatings}>
                    <Dialog.Title>Ratings & Reviews</Dialog.Title>
                    <Dialog.Content style={{ gap: 8 }}>
                        <Text style={styles.sectionTitle}>{ratingDialog.name || `User ${ratingDialog.userId}`}</Text>
                        {ratingDialog.employmentType ? <Text>{ratingDialog.employmentType}</Text> : null}
                        {ratingDialog.email ? <Text>{ratingDialog.email}</Text> : null}
                        {ratingDialog.phone ? <Text>{ratingDialog.phone}</Text> : null}
                        {ratingDialog.bio ? <Text>{ratingDialog.bio}</Text> : null}
                        {ratingLoading ? (
                            <ActivityIndicator />
                        ) : (
                            <>
                                {ratingSummary ? (
                                    <View style={styles.row}>
                                        <Icon source="star" color="#F59E0B" size={18} />
                                        <Text style={styles.ratingText}>
                                            {ratingSummary.average?.toFixed(1) ?? '0.0'} ({ratingSummary.count ?? 0} reviews)
                                        </Text>
                                    </View>
                                ) : (
                                    <Text style={styles.muted}>No ratings yet.</Text>
                                )}
                                <View style={{ gap: 6 }}>
                                    {ratingComments.length === 0 ? (
                                        <Text style={styles.muted}>No comments.</Text>
                                    ) : ratingComments.map((c) => (
                                        <Card key={c.id} mode="elevated" style={styles.commentCard}>
                                            <Card.Title
                                                title={
                                                    (c as any).reviewerName ||
                                                    (c as any).reviewer_name ||
                                                    c.user?.firstName ||
                                                    'Reviewer'
                                                }
                                                right={() => (
                                                    <View style={styles.row}>
                                                        <Icon source="star" color="#F59E0B" size={16} />
                                                        <Text style={styles.ratingText}>{c.stars?.toFixed(1) ?? '-'}</Text>
                                                    </View>
                                                )}
                                            />
                                            {c.comment ? (
                                                <Card.Content>
                                                    <Text>{c.comment}</Text>
                                                </Card.Content>
                                            ) : null}
                                        </Card>
                                    ))}
                                </View>
                            </>
                        )}
                    </Dialog.Content>
                    <Dialog.Actions>
                        <Button onPress={closeRatings}>Close</Button>
                    </Dialog.Actions>
                </Dialog>
                <Dialog visible={shareLink !== null} onDismiss={() => setShareLink(null)}>
                    <Dialog.Title>Share Link</Dialog.Title>
                    <Dialog.Content>
                        <Text selectable>{shareLink}</Text>
                    </Dialog.Content>
                    <Dialog.Actions>
                        <Button onPress={() => setShareLink(null)}>Close</Button>
                    </Dialog.Actions>
                </Dialog>
                <Dialog visible={deleteId !== null} onDismiss={() => setDeleteId(null)}>
                    <Dialog.Title>Delete shift?</Dialog.Title>
                    <Dialog.Content>
                        <Text>Are you sure you want to delete this shift?</Text>
                    </Dialog.Content>
                    <Dialog.Actions>
                        <Button onPress={() => setDeleteId(null)}>Cancel</Button>
                        <Button onPress={() => deleteId && handleDelete(deleteId)} loading={deleteId ? !!deleting[deleteId] : false}>
                            Delete
                        </Button>
                    </Dialog.Actions>
                </Dialog>
            </Portal>
        </>
    );
}

const styles = StyleSheet.create({
    list: { padding: 12, gap: 12 },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
    card: { borderRadius: 12, borderColor: '#E5E7EB' },
    innerCard: { marginTop: 8, borderRadius: 10 },
    actionsRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 4, marginBottom: 4 },
    headerRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 8 },
    cardTitleText: { fontSize: 16, fontWeight: '700', color: '#111827' },
    cardSubtitleText: { color: '#6B7280', marginTop: 2 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    chip: { backgroundColor: '#EEF2FF', marginRight: 6 },
    muted: { color: '#6B7280', textAlign: 'center' },
    sectionTitle: { fontWeight: '700', marginBottom: 4, color: '#111827' },
    ratingText: { color: '#111827', fontWeight: '600' },
    commentCard: { borderRadius: 10 },
    levelRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    levelChip: { backgroundColor: '#EEF2FF' },
    levelChipActive: { backgroundColor: '#7C3AED' },
    levelText: { color: '#4B5563', fontWeight: '600' },
    levelTextActive: { color: '#FFFFFF', fontWeight: '700' },
    description: { color: '#4B5563', marginTop: 6, marginBottom: 6 },
    slotRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
    stepperRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
    stepperItem: { flex: 1, alignItems: 'center', gap: 4 },
    stepCircle: { width: 28, height: 28, borderRadius: 14, borderWidth: 2, borderColor: '#E5E7EB', alignItems: 'center', justifyContent: 'center' },
    stepCircleActive: { backgroundColor: '#7C3AED', borderColor: '#7C3AED' },
    stepCircleCompleted: { backgroundColor: '#A5B4FC', borderColor: '#A5B4FC' },
    stepLabel: { fontSize: 11, color: '#6B7280', textAlign: 'center' },
    stepLabelActive: { color: '#111827', fontWeight: '700' },
    slotSelectorRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginVertical: 4 },
    bucketCard: { marginTop: 8, paddingVertical: 4 },
    bucketHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
    bucketTitle: { fontWeight: '700' },
    countChip: { backgroundColor: '#EEF2FF' },
    countChipText: { color: '#111827', fontWeight: '700' },
});
