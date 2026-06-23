// ActiveShiftsPage - Main Component
// Mobile implementation aligned with web logic and hooks

import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, Linking } from 'react-native';
import { Text, Button, IconButton, Snackbar, ActivityIndicator, Card, Divider, Chip } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { subscribeShiftSlotActivity } from '@/utils/pushNotifications';
import apiClient from '@/utils/apiClient';
import {
    Shift,
    ShiftInterest,
    ShiftMemberStatus,
    EscalationLevelKey,
} from '@chemisttasker/shared-core';
import { useAuth } from '@/context/AuthContext';

// Hooks
import { useShiftsData } from './hooks/useShiftsData';
import { useTabData } from './hooks/useTabData';
import { useCounterOffers } from './hooks/useCounterOffers';
import { useRevealInterest } from './hooks/useRevealInterest';
import { useWorkerRatings } from './hooks/useWorkerRatings';
import { useShiftActions } from './hooks/useShiftActions';
import { useShareShift } from './hooks/useShareShift';

// Components
import DeleteConfirmDialog from './components/Dialogs/DeleteConfirmDialog';
import CounterOfferDialog from './components/Dialogs/CounterOfferDialog';
import EscalationStepper from './components/Escalation/EscalationStepper';
import PublicLevelView from './components/Candidates/PublicLevelView';
import CommunityLevelView from './components/Candidates/CommunityLevelView';

// Utils
import {
    PUBLIC_LEVEL_KEY,
    getCurrentLevelKey,
    getShiftSummary,
    deriveLevelSequence,
    getLocationText,
} from './utils/shiftHelpers';
import { dedupeMembers, findInterestForOffer } from './utils/candidateHelpers';
import { mapOfferSlotsWithShift } from './utils/offerHelpers';
import { getCardBorderColor } from './utils/displayHelpers';

// Types
import { ReviewOfferDialogState, DeleteConfirmDialogState } from './types';

// Theme
import { customTheme } from './theme';

const ACTIVE_SHIFT_SLOT_SEEN_KEY_PREFIX = 'active_shift_slot_seen_v2';

const toFiniteNumber = (raw: any): number | null => {
    if (raw == null) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
};

const resolveSlotIdAny = (slot: any): number | null => {
    const raw = slot?.id ?? slot?.slotId ?? slot?.slot_id ?? null;
    return toFiniteNumber(raw);
};

const getSlotIds = (shift: Shift): number[] => {
    const slots = (shift as any).slots || [];
    return slots
        .map((slot: any) => resolveSlotIdAny(slot))
        .filter((id: number | null): id is number => id != null);
};

const shouldShowPaymentRequired = (shift: Shift, selectedSlotId: number | null): boolean => {
    const shiftAny = shift as any;
    if (shiftAny.paymentStatus !== 'PENDING') return false;

    const slots = Array.isArray(shiftAny.slots) ? shiftAny.slots : [];
    const isSingleUserShift = Boolean(shiftAny.singleUserOnly ?? shiftAny.single_user_only);
    if (isSingleUserShift || slots.length <= 1) return true;

    const rawPendingSlotIds = shiftAny.pendingPaymentSlotIds ?? shiftAny.pending_payment_slot_ids;
    if (!Array.isArray(rawPendingSlotIds)) return true;
    if (selectedSlotId == null) return false;

    const pendingSlotIds = rawPendingSlotIds
        .map((value: any) => Number(value))
        .filter((value: number) => Number.isFinite(value));
    return pendingSlotIds.includes(selectedSlotId);
};

const offerBelongsToSlot = (offer: any, slotId: number) => {
    const offerSlots = offer?.slots || offer?.offer_slots || [];
    if (Array.isArray(offerSlots) && offerSlots.length > 0) {
        return offerSlots.some((s: any) => resolveSlotIdAny(s?.slot) === slotId || resolveSlotIdAny(s) === slotId);
    }
    const fallbackSlotId = resolveSlotIdAny(offer?.slot) ?? toFiniteNumber(offer?.slot_id ?? offer?.slotId);
    if (fallbackSlotId == null) return false;
    return fallbackSlotId === slotId;
};

const interestBelongsToSlot = (interest: any, slotId: number) => {
    const explicitSlotId = resolveSlotIdAny(interest?.slot) ?? toFiniteNumber(interest?.slot_id ?? interest?.slotId);
    if (explicitSlotId == null) return false;
    return explicitSlotId === slotId;
};

const buildPublicSlotSignature = (slotId: number, interests: any[], offers: any[]) => {
    const interestSig = interests
        .filter((i: any) => interestBelongsToSlot(i, slotId))
        .map((i: any) => {
            const userId = i?.userId ?? i?.user_id ?? i?.user?.id ?? '';
            const ts = i?.expressedAt ?? i?.expressed_at ?? '';
            return `${i?.id ?? ''}:${userId}:${i?.revealed ? 1 : 0}:${ts}`;
        })
        .sort()
        .join('|');

    const offerSig = offers
        .filter((o: any) => offerBelongsToSlot(o, slotId))
        .map((o: any) => `${o?.id ?? ''}:${o?.status ?? ''}:${o?.updatedAt ?? o?.updated_at ?? o?.createdAt ?? o?.created_at ?? ''}`)
        .sort()
        .join('|');

    return `i:${interestSig}#o:${offerSig}`;
};

const buildMemberSlotSignature = (slotId: number, members: ShiftMemberStatus[], offers: any[]) => {
    const memberSig = members
        .map((m: any) => `${m?.userId ?? m?.user_id ?? ''}:${m?.status ?? ''}`)
        .sort()
        .join('|');
    const offerSig = offers
        .filter((o: any) => offerBelongsToSlot(o, slotId))
        .map((o: any) => `${o?.id ?? ''}:${o?.status ?? ''}:${o?.updatedAt ?? o?.updated_at ?? o?.createdAt ?? o?.created_at ?? ''}`)
        .sort()
        .join('|');
    return `m:${memberSig}#o:${offerSig}`;
};

const getPersonIdentity = (record: any): string | null => {
    if (!record) return null;
    const user = record.user;
    const userDetail = record.userDetail ?? record.user_detail;
    const rawId =
        record.userId ??
        record.user_id ??
        userDetail?.id ??
        (typeof user === 'object' ? user?.id : user) ??
        null;
    if (rawId != null) return `user:${rawId}`;

    const email = record.email ?? userDetail?.email ?? (typeof user === 'object' ? user?.email : null);
    if (email) return `email:${String(email).toLowerCase()}`;

    const recordId = record.id ?? null;
    return recordId != null ? `record:${recordId}` : null;
};

const countUniquePeople = (records: any[]): number => {
    const seen = new Set<string>();
    records.forEach((record) => {
        const key = getPersonIdentity(record);
        if (key) seen.add(key);
    });
    return seen.size;
};

const isActiveCounterOffer = (offer: any): boolean => {
    const status = String(offer?.status ?? '').toLowerCase();
    return !['accepted', 'rejected', 'declined', 'cancelled', 'canceled', 'expired'].includes(status);
};

const getCandidateUserId = (record: any): number | null => {
    const raw =
        record?.userId ??
        record?.user_id ??
        record?.userDetail?.id ??
        record?.user_detail?.id ??
        (typeof record?.user === 'object' ? record.user?.id : record?.user) ??
        null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
};

type ActiveShiftsPageProps = {
    shiftId?: number | null;
    title?: string;
};

const ActiveShiftsPage: React.FC<ActiveShiftsPageProps> = ({ shiftId = null, title = 'Active Shifts' }) => {
    const router = useRouter();
    const { user } = useAuth();
    const selectedPharmacyId = null;

    const [snackbarOpen, setSnackbarOpen] = useState(false);
    const [snackbarMessage, setSnackbarMessage] = useState('');
    const [pillPayingShiftId, setPillPayingShiftId] = useState<number | null>(null);

    const showSnackbar = useCallback((msg: string) => {
        setSnackbarMessage(msg);
        setSnackbarOpen(true);
    }, []);

    const [selectedLevelByShift, setSelectedLevelByShift] = useState<Record<number, EscalationLevelKey>>({});
    const [selectedSlotByShift, setSelectedSlotByShift] = useState<Record<number, number>>({});
    const [slotHasUpdatesByShift, setSlotHasUpdatesByShift] = useState<Record<number, Record<number, boolean>>>({});
    const [seenSlotSignatures, setSeenSlotSignatures] = useState<Record<string, string>>({});
    const [slotSeenReady, setSlotSeenReady] = useState(false);
    const latestSlotSignaturesRef = React.useRef<Record<string, string>>({});
    const [expandedShifts, setExpandedShifts] = useState<Set<number>>(new Set());
    const reviewLoadingId: number | null = null;

    const [deleteConfirmDialog, setDeleteConfirmDialog] = useState<DeleteConfirmDialogState>({
        open: false,
        shiftId: null,
    });
    const [reviewOfferDialog, setReviewOfferDialog] = useState<ReviewOfferDialogState>({
        open: false,
        shiftId: null,
        offer: null,
        candidate: null,
        slotId: null,
    });

    const getTabKey = useCallback((shiftId: number, levelKey: EscalationLevelKey) => {
        return `${shiftId}_${levelKey}`;
    }, []);
    const seenStorageKey = useMemo(
        () => `${ACTIVE_SHIFT_SLOT_SEEN_KEY_PREFIX}:${user?.id ?? 'anon'}`,
        [user?.id]
    );

    const { shifts, setShifts, loading: shiftsLoading, loadShifts } = useShiftsData({ selectedPharmacyId, shiftId });
    const { tabData, setTabData, loadTabDataForShift } = useTabData(shifts, selectedLevelByShift, getTabKey);
    const handlePayWithPills = useCallback(async (shift: Shift, slotId: number | null = null) => {
        setPillPayingShiftId(shift.id);
        try {
            const { data: res } = await apiClient.post('/client-profile/pill-rewards/pay-shift/', {
                shift_id: shift.id,
                ...(slotId != null ? { slot_id: slotId } : {}),
            });
            showSnackbar(res?.detail || 'Shift paid with pills.');
            await loadShifts();
        } catch (err: any) {
            const data = err?.response?.data;
            const detail = Array.isArray(data?.detail) ? data.detail[0] : data?.detail;
            const message = data?.code === 'insufficient_pills'
                ? `Not enough pills. You have ${data?.balance ?? 0}; this shift needs ${data?.required ?? 'more'} pills.`
                : detail || err?.message || 'Failed to pay with pills.';
            showSnackbar(message);
        } finally {
            setPillPayingShiftId(null);
        }
    }, [loadShifts, showSnackbar]);
    const {
        counterOffersByShift,
        counterOffersLoadingByShift,
        loadCounterOffers,
        acceptOffer,
        rejectOffer,
        counterActionLoading,
        updateOfferCache,
    } = useCounterOffers();
    const { revealInterest, revealingInterestId } = useRevealInterest(getTabKey, setTabData, showSnackbar);
    const {
        summary: workerRatingSummary,
        comments: workerRatingComments,
        page: workerCommentsPage,
        pageCount: workerCommentsPageCount,
        loadRatings: loadWorkerRatings,
        reset: resetWorkerRatings,
    } = useWorkerRatings();
    const { actionLoading, handleEscalate, handleDelete, handleAccept } = useShiftActions(setShifts, showSnackbar);
    const { sharingShiftId, handleShare } = useShareShift(showSnackbar);

    const markShiftSlotsUpdated = useCallback((shiftId: number, slotIds: number[] | null) => {
        const shift = shifts.find((s) => s.id === shiftId);
        if (!shift) return;
        const targetSlotIds = (slotIds && slotIds.length > 0) ? slotIds : [];
        if (targetSlotIds.length === 0) return;
        setSlotHasUpdatesByShift((prev) => {
            const nextShiftState = { ...(prev[shiftId] || {}) };
            targetSlotIds.forEach((slotId) => {
                nextShiftState[slotId] = true;
            });
            return {
                ...prev,
                [shiftId]: nextShiftState,
            };
        });
    }, [shifts]);

    useEffect(() => {
        let active = true;
        (async () => {
            try {
                const raw = await AsyncStorage.getItem(seenStorageKey);
                const parsed = raw ? JSON.parse(raw) : {};
                if (!active) return;
                if (parsed && typeof parsed === 'object') {
                    setSeenSlotSignatures(parsed);
                } else {
                    setSeenSlotSignatures({});
                }
            } catch {
                if (active) setSeenSlotSignatures({});
            } finally {
                if (active) setSlotSeenReady(true);
            }
        })();
        return () => {
            active = false;
        };
    }, [seenStorageKey]);

    useEffect(() => {
        if (!slotSeenReady) return;
        AsyncStorage.setItem(seenStorageKey, JSON.stringify(seenSlotSignatures)).catch(() => null);
    }, [seenSlotSignatures, seenStorageKey, slotSeenReady]);

    useEffect(() => {
        const sub = subscribeShiftSlotActivity((notification: any) => {
            const payload = notification?.payload || notification?.data || {};
            const shiftIdRaw = payload.shift_id ?? payload.shiftId;
            const shiftId = Number(shiftIdRaw);
            if (!Number.isFinite(shiftId)) return;
            const rawSlotIds = payload.slot_ids ?? payload.slotIds;
            const slotIdsFromList = Array.isArray(rawSlotIds)
                ? rawSlotIds.map((value: any) => Number(value)).filter((value: number) => Number.isFinite(value))
                : [];
            const slotIdRaw = payload.slot_id ?? payload.slotId;
            const slotIdSingle = Number(slotIdRaw);
            const slotIds = slotIdsFromList.length > 0
                ? slotIdsFromList
                : (Number.isFinite(slotIdSingle) ? [slotIdSingle] : null);
            markShiftSlotsUpdated(shiftId, slotIds);
        });
        return () => sub.remove();
    }, [markShiftSlotsUpdated]);

    const getOfferSlotIds = useCallback((offer: any): number[] => {
        const offerSlots = offer?.slots || offer?.offer_slots || [];
        return offerSlots
            .map((s: any) => s.slot_id ?? s.slotId ?? s.slot?.id ?? null)
            .filter((id: any) => id != null);
    }, []);

    const resolveSlotId = useCallback((slot: any): number | null => {
        return slot?.id ?? slot?.slotId ?? slot?.slot_id ?? null;
    }, []);

    const handleRevealInterest = useCallback(async (shift: Shift, interest: ShiftInterest) => {
        const levelKey = selectedLevelByShift[shift.id] ?? PUBLIC_LEVEL_KEY;

        resetWorkerRatings();
        let revealedUser: any = null;

        if (!interest.revealed) {
            try {
                revealedUser = await revealInterest(shift, interest, levelKey);

                const offers = counterOffersByShift[shift.id] || [];
                const matchingOffer = offers.find((o: any) => {
                    const offerUserId = typeof o.user === 'object' ? o.user?.id : o.user;
                    return offerUserId === interest.userId;
                });

                if (matchingOffer && revealedUser) {
                    updateOfferCache(shift.id, matchingOffer.id, revealedUser);
                    await loadCounterOffers(shift.id);
                }
            } catch (error) {
                console.error('Failed to reveal interest', error);
                showSnackbar('Failed to reveal candidate.');
                return;
            }
        } else {
            revealedUser = interest.user || (interest as any).user_detail;
        }

        const userObj = (typeof revealedUser === 'object' && revealedUser)
            ? revealedUser
            : (typeof interest.user === 'object' && interest.user)
                ? interest.user
                : (interest as any).user_detail;

        const interestAny = interest as any;
        const candidate = {
            userId: interest.userId ?? userObj?.id ?? null,
            name:
                (userObj?.firstName && userObj?.lastName)
                    ? `${userObj.firstName} ${userObj.lastName}`
                    : (userObj?.first_name && userObj?.last_name)
                        ? `${userObj.first_name} ${userObj.last_name}`
                        : userObj?.name || userObj?.displayName || userObj?.display_name
                        || interestAny?.displayName
                        || (typeof interest.user === 'string' ? interest.user : null)
                        || interest?.userName
                        || 'Candidate',
            email: userObj?.email || interestAny?.email || '',
            shortBio: userObj?.shortBio || userObj?.short_bio || interestAny?.shortBio || interestAny?.short_bio || '',
        };

        const interestUserId =
            typeof interest?.user === 'object' && interest?.user
                ? (interest.user as any).id
                : null;
        const ratingsUserId = (typeof userObj === 'object' && userObj?.id) ? userObj.id : (interest?.userId ?? interestUserId ?? null);
        if (ratingsUserId != null) {
            try {
                await loadWorkerRatings(ratingsUserId, 1);
            } catch (error) {
                console.error('Failed to load worker ratings', error);
            }
        }

        setReviewOfferDialog({
            open: true,
            shiftId: shift.id,
            offer: null,
            candidate,
            slotId: interest.slotId ?? null,
        });
    }, [
        revealInterest,
        selectedLevelByShift,
        counterOffersByShift,
        updateOfferCache,
        resetWorkerRatings,
        loadWorkerRatings,
        showSnackbar,
        loadCounterOffers,
    ]);

    const handleReviewOffer = useCallback(
        async (shift: Shift, offer: any, tabDataState: any, slotId: number | null) => {
            resetWorkerRatings();

            const interest = findInterestForOffer(offer, tabDataState, slotId);

            let revealedUser: any = null;

            if (interest && !interest.revealed) {
                try {
                    const levelKey = selectedLevelByShift[shift.id] ?? PUBLIC_LEVEL_KEY;
                    revealedUser = await revealInterest(shift, interest, levelKey);

                    if (revealedUser) {
                        updateOfferCache(shift.id, offer.id, revealedUser);
                    }

                    await loadCounterOffers(shift.id);
                } catch (error) {
                    console.error('Failed to reveal offer candidate', error);
                }
            }

            const userObj =
                revealedUser ||
                offer.userDetail ||
                offer.user_detail ||
                (typeof offer.user === 'object' ? offer.user : null);
            const interestAny = interest as any;
            const candidate =
                userObj || interest
                    ? {
                        userId: userObj?.id ?? interestAny?.userId ?? interest?.userId ?? offer?.user?.id ?? null,
                        name:
                            userObj?.firstName && userObj?.lastName
                                ? `${userObj.firstName} ${userObj.lastName}`
                                : userObj?.name ||
                                userObj?.displayName ||
                                interestAny?.userName ||
                                'Candidate',
                        email: userObj?.email || interestAny?.email,
                        shortBio: userObj?.shortBio || interestAny?.shortBio || interestAny?.short_bio || '',
                    }
                    : null;

            const interestUserId =
                typeof interestAny?.user === 'object' && interestAny?.user
                    ? interestAny.user.id
                    : null;
            const ratingsUserId = userObj?.id ?? interest?.userId ?? interestUserId ?? offer?.user?.id ?? null;
            if (ratingsUserId != null) {
                try {
                    await loadWorkerRatings(ratingsUserId, 1);
                } catch (error) {
                    console.error('Failed to load worker ratings', error);
                }
            }

            const isSingleUserShift = Boolean((shift as any).singleUserOnly);
            const offerSlotIds = getOfferSlotIds(offer);
            const slotFromOffer = offerSlotIds[0] ?? null;
            const fallbackSlotId = shift.slots?.[0]?.id ?? null;
            const slotMatchesOffer = slotId != null && offerSlotIds.length > 0 ? offerSlotIds.includes(slotId) : true;
            const resolvedSlotId = isSingleUserShift
                ? null
                : (slotMatchesOffer ? slotId : null) ?? slotFromOffer ?? slotId ?? fallbackSlotId;

            const mappedSlots = mapOfferSlotsWithShift(offer, shift, resolvedSlotId);

            setReviewOfferDialog({
                open: true,
                shiftId: shift.id,
                offer: { ...offer, _mappedSlots: mappedSlots },
                candidate,
                slotId: resolvedSlotId,
            });
        },
        [
            revealInterest,
            selectedLevelByShift,
            resetWorkerRatings,
            loadCounterOffers,
            loadWorkerRatings,
            updateOfferCache,
            getOfferSlotIds,
        ]
    );

    const handleReviewCandidate = useCallback(
        async (shift: Shift, member: ShiftMemberStatus, offer: any | null, slotId: number | null) => {
            resetWorkerRatings();

            const candidate = {
                userId: (member as any).userId ?? (member as any).user?.id ?? null,
                name:
                    (member as any).firstName && (member as any).lastName
                        ? `${(member as any).firstName} ${(member as any).lastName}`
                        : member.displayName || (member as any).email || 'Candidate',
                email: (member as any).email || '',
                shortBio: (member as any).shortBio || '',
            };

            if ((member as any).userId != null) {
                try {
                    await loadWorkerRatings((member as any).userId, 1);
                } catch (error) {
                    console.error('Failed to load worker ratings', error);
                }
            }

            const isSingleUserShift = Boolean((shift as any).singleUserOnly);
            const offerSlotIds = getOfferSlotIds(offer);
            const slotFromOffer = offerSlotIds[0] ?? null;
            const fallbackSlotId = shift.slots?.[0]?.id ?? null;
            const slotMatchesOffer = slotId != null && offerSlotIds.length > 0 ? offerSlotIds.includes(slotId) : true;
            const resolvedSlotId = isSingleUserShift
                ? null
                : (slotMatchesOffer ? slotId : null) ?? slotFromOffer ?? slotId ?? fallbackSlotId;

            const mappedSlots = offer ? mapOfferSlotsWithShift(offer, shift, resolvedSlotId) : [];

            setReviewOfferDialog({
                open: true,
                shiftId: shift.id,
                offer: offer ? { ...offer, _mappedSlots: mappedSlots } : null,
                candidate,
                slotId: resolvedSlotId,
            });
        },
        [resetWorkerRatings, loadWorkerRatings, getOfferSlotIds]
    );

    const handleAcceptOffer = useCallback(
        async (offer: any, shiftId: number | null, slotId: number | null) => {
            if (!offer || shiftId == null) return;
            const targetShift = shifts.find(s => s.id === shiftId);
            const requiresSlot = targetShift ? !((targetShift as any).singleUserOnly) : false;
            const offerSlotIds = getOfferSlotIds(offer);
            const slotMatchesOffer = slotId != null && offerSlotIds.length > 0 ? offerSlotIds.includes(slotId) : true;
            const resolvedSlotId = requiresSlot
                ? (slotMatchesOffer ? slotId : null) ?? offerSlotIds[0] ?? slotId
                : null;
            if (requiresSlot && resolvedSlotId == null) {
                showSnackbar('Select a slot to accept this offer.');
                return;
            }
            await acceptOffer({ offer, shiftId, slotId: resolvedSlotId }, async () => {
                showSnackbar('Counter offer accepted');
                setReviewOfferDialog({ open: false, shiftId: null, offer: null, candidate: null, slotId: null });
                await loadShifts();
            });
        },
        [acceptOffer, showSnackbar, loadShifts, shifts, getOfferSlotIds]
    );

    const handleRejectOffer = useCallback(
        async (offer: any, shiftId: number | null) => {
            if (!offer || shiftId == null) return;
            await rejectOffer({ offer, shiftId }, async () => {
                showSnackbar('Counter offer rejected');
                setReviewOfferDialog({ open: false, shiftId: null, offer: null, candidate: null, slotId: null });
                await loadShifts();
            });
        },
        [rejectOffer, showSnackbar, loadShifts]
    );

    const handleAssignCandidate = useCallback(
        async (userId: number, shiftId: number | null, slotId: number | null) => {
            if (!userId || shiftId == null) return;
            const success = await handleAccept(shiftId, userId, slotId);
            if (success) {
                setReviewOfferDialog({ open: false, shiftId: null, offer: null, candidate: null, slotId: null });
                await loadShifts();
            }
        },
        [handleAccept, loadShifts]
    );

    const toggleShiftExpansion = useCallback((shiftId: number) => {
        setExpandedShifts(prev => {
            const next = new Set(prev);
            if (next.has(shiftId)) {
                next.delete(shiftId);
            } else {
                next.add(shiftId);
            }
            return next;
        });
    }, []);

    const handleLevelChange = useCallback(
        (shift: Shift, newLevel: EscalationLevelKey) => {
            const currentLevelKey = getCurrentLevelKey(shift);
            const viewableLevels = deriveLevelSequence(
                currentLevelKey,
                (shift as any).allowedEscalationLevels,
            );
            if (!viewableLevels.includes(newLevel as any)) {
                showSnackbar('Escalate to this level to review members status.');
                return;
            }
            setSelectedLevelByShift(prev => ({ ...prev, [shift.id]: newLevel }));
            loadTabDataForShift(shift, newLevel);
        },
        [loadTabDataForShift, showSnackbar]
    );

    const markSlotSeen = useCallback(
        (shiftId: number, slotId: number) => {
            const shift = shifts.find((s) => s.id === shiftId);
            if (!shift) return;
            const levelKey = selectedLevelByShift[shiftId] ?? getCurrentLevelKey(shift);
            const signatureKey = `${shiftId}:${levelKey}:${slotId}`;
            const latestSignature = latestSlotSignaturesRef.current[signatureKey];
            if (!latestSignature) return;
            setSeenSlotSignatures((prev) => {
                if (prev[signatureKey] === latestSignature) return prev;
                return { ...prev, [signatureKey]: latestSignature };
            });
            setSlotHasUpdatesByShift((prev) => ({
                ...prev,
                [shiftId]: {
                    ...(prev[shiftId] || {}),
                    [slotId]: false,
                },
            }));
        },
        [selectedLevelByShift, shifts]
    );

    const handleSlotSelection = useCallback((shiftId: number, slotId: number) => {
        setSelectedSlotByShift(prev => ({ ...prev, [shiftId]: slotId }));
        markSlotSeen(shiftId, slotId);
    }, [markSlotSeen]);

    const handleEditShift = useCallback((shift: Shift) => {
        const pharmacyId = (shift as any).pharmacyDetail?.id ?? (shift as any).pharmacy_detail?.id ?? (shift as any).pharmacy;
        const baseRoute =
            user?.role?.startsWith('ORG_')
                ? '/organization/post-shift'
                : user?.role === 'PHARMACY_ADMIN'
                    ? (pharmacyId != null ? `/admin/${pharmacyId}/post-shift` : '/admin/post-shift')
                    : '/owner/post-shift';
        router.push({ pathname: baseRoute as any, params: { edit: String(shift.id) } });
    }, [router, user]);

    const isDedicatedShift = useCallback((shift: Shift) => {
        const shiftAny = shift as any;
        return Boolean(shiftAny.dedicatedUser ?? shiftAny.dedicated_user);
    }, []);

    useEffect(() => {
        shifts.forEach((shift) => {
            if (Object.prototype.hasOwnProperty.call(counterOffersByShift, shift.id)) return;
            if (counterOffersLoadingByShift[shift.id]) return;
            loadCounterOffers(shift.id);
        });
    }, [shifts, counterOffersByShift, counterOffersLoadingByShift, loadCounterOffers]);

    useEffect(() => {
        if (!slotSeenReady) return;

        const nextUpdatesByShift: Record<number, Record<number, boolean>> = {};
        const nextSignatures: Record<string, string> = {};
        const baselineMissing: Record<string, string> = {};

        shifts.forEach((shift) => {
            const isSingleUserShift = Boolean((shift as any).singleUserOnly);
            if (isSingleUserShift) return;

            const slotIds = getSlotIds(shift);
            if (slotIds.length === 0) return;

            const levelKey = selectedLevelByShift[shift.id] ?? getCurrentLevelKey(shift);
            const tabKey = getTabKey(shift.id, levelKey);
            const currentTabData = tabData[tabKey] || {};

            // Avoid creating a false "seen baseline" from empty/loading state.
            const tabDataReady = Object.prototype.hasOwnProperty.call(tabData, tabKey) && !currentTabData.loading;
            if (!tabDataReady) return;

            // Slot signatures include offers, so wait until they are loaded.
            const offersReady = Object.prototype.hasOwnProperty.call(counterOffersByShift, shift.id);
            if (!offersReady) return;

            const offers = counterOffersByShift[shift.id] || [];

            slotIds.forEach((slotId) => {
                const signature =
                    levelKey === PUBLIC_LEVEL_KEY
                        ? buildPublicSlotSignature(slotId, currentTabData.interestsAll || [], offers)
                        : buildMemberSlotSignature(slotId, currentTabData.membersBySlot?.[slotId] || [], offers);
                const signatureKey = `${shift.id}:${levelKey}:${slotId}`;
                nextSignatures[signatureKey] = signature;

                const seen = seenSlotSignatures[signatureKey];
                if (seen == null) {
                    baselineMissing[signatureKey] = signature;
                    return;
                }
                if (seen !== signature) {
                    if (!nextUpdatesByShift[shift.id]) nextUpdatesByShift[shift.id] = {};
                    nextUpdatesByShift[shift.id][slotId] = true;
                }
            });
        });

        latestSlotSignaturesRef.current = nextSignatures;
        setSlotHasUpdatesByShift(nextUpdatesByShift);
        if (Object.keys(baselineMissing).length > 0) {
            setSeenSlotSignatures((prev) => ({ ...prev, ...baselineMissing }));
        }
    }, [
        shifts,
        tabData,
        counterOffersByShift,
        selectedLevelByShift,
        getTabKey,
        seenSlotSignatures,
        slotSeenReady,
    ]);

    const orderedShifts = useMemo(() => {
        const list = [...shifts];
        list.sort((a, b) => {
            const aDedicated = isDedicatedShift(a) ? 1 : 0;
            const bDedicated = isDedicatedShift(b) ? 1 : 0;
            return bDedicated - aDedicated;
        });
        return list;
    }, [shifts, isDedicatedShift]);

    if (shiftsLoading) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={customTheme.colors.primary} />
                <Text style={styles.loadingText}>Loading shifts...</Text>
            </View>
        );
    }

    if (shifts.length === 0) {
        return (
            <SafeAreaView style={styles.container} edges={['left', 'right']}>
                <View style={styles.emptyContainer}>
                    <Text style={styles.emptyText}>No active shifts found.</Text>
                </View>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={styles.container} edges={['left', 'right']}>
            <ScrollView contentContainerStyle={styles.content}>
                <View style={styles.pageHeader}>
                    <Text style={styles.title}>{title}</Text>
                    <Text style={styles.subtitle}>Manage and track your live shifts</Text>
                </View>
                {orderedShifts.map((shift, idx) => {
                    const isDedicated = isDedicatedShift(shift);
                    const prev = idx > 0 ? orderedShifts[idx - 1] : null;
                    const showSectionHeader = isDedicated && (idx === 0 || (prev && isDedicatedShift(prev) !== isDedicated));
                    const isExpanded = expandedShifts.has(shift.id);
                    const isSingleUserShift = Boolean((shift as any).singleUserOnly);
                    const shiftLevel = getCurrentLevelKey(shift);
                    const selectedLevel = selectedLevelByShift[shift.id] ?? shiftLevel;
                    const tabKey = getTabKey(shift.id, selectedLevel);
                    const currentTabData = tabData[tabKey] || { loading: false };
                    const viewableLevelKeys = deriveLevelSequence(
                        shiftLevel,
                        (shift as any).allowedEscalationLevels,
                    );
                    const communityLevelKeys = viewableLevelKeys.filter(level => level !== PUBLIC_LEVEL_KEY);
                    const communityTabData = communityLevelKeys.map(level => tabData[getTabKey(shift.id, level)]);
                    const communityDataLoading = communityLevelKeys.some((level, index) => {
                        const data = communityTabData[index];
                        return !data || data.loading;
                    });
                    const selectedSlotId = isSingleUserShift
                        ? null
                        : selectedSlotByShift[shift.id] ?? resolveSlotId(shift.slots?.[0]) ?? null;
                    const offers = counterOffersByShift[shift.id];
                    const counterOffersLoaded = Object.prototype.hasOwnProperty.call(counterOffersByShift, shift.id);
                    const counterOffersLoading = counterOffersLoadingByShift[shift.id] ?? false;
                    const slotIds = getSlotIds(shift);
                    const consolidatedMembersBySlot = slotIds.reduce<Record<number, ShiftMemberStatus[]>>((acc, slotId) => {
                        acc[slotId] = dedupeMembers(communityLevelKeys.flatMap((level, index) => (
                            communityTabData[index]?.membersBySlot?.[slotId] || []
                        ).map((member: any) => ({ ...member, sourceVisibility: level }))));
                        return acc;
                    }, {});
                    const consolidatedMembers = dedupeMembers(communityLevelKeys.flatMap((level, index) => (
                        communityTabData[index]?.members || []
                    ).map((member: any) => ({ ...member, sourceVisibility: level }))));
                    const knownCommunityUserIds = new Set(
                        consolidatedMembers
                            .map(getCandidateUserId)
                            .filter((id): id is number => id != null)
                    );
                    const publicInterests = (currentTabData.interestsAll || []).filter((interest: any) => {
                        const userId = getCandidateUserId(interest);
                        return userId == null || !knownCommunityUserIds.has(userId);
                    });
                    const publicOffers = (offers || []).filter((offer: any) => {
                        const userId = getCandidateUserId(offer);
                        return userId == null || !knownCommunityUserIds.has(userId);
                    });
                    const membersForView = isSingleUserShift
                        ? consolidatedMembers
                        : consolidatedMembersBySlot[selectedSlotId ?? -1] || [];

                    const cardBorderColor = getCardBorderColor((shift as any).visibility ?? 'PLATFORM');
                    const summaryText = getShiftSummary(shift);
                    const location = getLocationText(shift);
                    const roleNeeded = (shift as any).roleNeeded ?? (shift as any).role_needed ?? null;
                    const employmentType = (shift as any).employmentType ?? (shift as any).employment_type ?? null;
                    const isUrgent = Boolean((shift as any).isUrgent ?? (shift as any).is_urgent);
                    const description = (shift as any).description ?? null;
                    const hasBadges = Boolean(roleNeeded || employmentType || isUrgent);
                    const labelOverrides = undefined;
                    const slotsCount = Array.isArray((shift as any).slots) ? (shift as any).slots.length : 0;
                    const showPaymentRequired = shouldShowPaymentRequired(shift, selectedSlotId);
                    const allMembers = isSingleUserShift
                        ? consolidatedMembers
                        : Object.values(consolidatedMembersBySlot || {}).flatMap((slotMembers: any) => (
                            Array.isArray(slotMembers) ? slotMembers : []
                        ));
                    const allInterests = publicInterests;
                    const allOffers = publicOffers;
                    const candidatesCount = countUniquePeople([
                        ...dedupeMembers(allMembers),
                        ...allInterests,
                        ...allOffers,
                    ]);
                    const interestsCount = countUniquePeople([
                        ...dedupeMembers(allMembers.filter((member: any) => member?.status === 'interested')),
                        ...allInterests,
                        ...allOffers.filter(isActiveCounterOffer),
                    ]);

                    return (
                        <React.Fragment key={shift.id}>
                            {showSectionHeader && (
                                <Text style={styles.sectionTitle}>
                                    {isDedicated ? 'Direct / Private Offers' : 'Active Shifts'}
                                </Text>
                            )}
                            <Card
                                style={styles.shiftCard}
                            >
                            <View style={[styles.cardAccent, { backgroundColor: cardBorderColor }]} />

                            <Card.Content>
                                <TouchableOpacity
                                    style={styles.cardPressArea}
                                    activeOpacity={0.85}
                                    onPress={() => toggleShiftExpansion(shift.id)}
                                >
                                <View style={styles.cardTopRow}>
                                    <View
                                        style={[styles.pharmacyMark, { backgroundColor: cardBorderColor }]}
                                    >
                                        <IconButton icon="storefront" size={28} iconColor="#fff" style={styles.markIcon} />
                                    </View>
                                    <View style={styles.cardTitleBlock}>
                                        <Text style={styles.cardTitle} numberOfLines={2}>
                                            {(shift as any).pharmacyDetail?.name ?? 'Unnamed Pharmacy'}
                                        </Text>
                                        {summaryText ? (
                                            <Text style={styles.cardSubtitle} numberOfLines={1}>
                                                {summaryText}
                                            </Text>
                                        ) : null}
                                    </View>
                                    <View style={styles.headerActions}>
                                        <IconButton
                                            icon="share-variant"
                                            size={20}
                                            onPress={(event) => {
                                                event.stopPropagation();
                                                handleShare(shift);
                                            }}
                                            disabled={sharingShiftId === shift.id}
                                            style={styles.actionButton}
                                        />
                                        <IconButton
                                            icon="pencil"
                                            size={20}
                                            onPress={(event) => {
                                                event.stopPropagation();
                                                handleEditShift(shift);
                                            }}
                                            style={styles.actionButton}
                                        />
                                        <IconButton
                                            icon="delete"
                                            size={20}
                                            onPress={(event) => {
                                                event.stopPropagation();
                                                setDeleteConfirmDialog({ open: true, shiftId: shift.id });
                                            }}
                                            disabled={actionLoading[`delete_${shift.id}`]}
                                            style={styles.actionButton}
                                        />
                                    </View>
                                </View>

                                {hasBadges ? (
                                    <View style={styles.badgeRow}>
                                        {roleNeeded && (
                                            <Chip
                                                style={[styles.primaryBadge, { backgroundColor: cardBorderColor }]}
                                                textStyle={styles.primaryBadgeText}
                                            >
                                                {roleNeeded}
                                            </Chip>
                                        )}
                                        {employmentType && (
                                            <Chip mode="outlined" style={styles.outlineBadge}>
                                                {employmentType}
                                            </Chip>
                                        )}
                                        {isUrgent && (
                                            <Chip style={styles.urgentBadge} textStyle={styles.urgentBadgeText}>
                                                Urgent
                                            </Chip>
                                        )}
                                    </View>
                                ) : null}

                                <View style={styles.metaRow}>
                                    <Text style={styles.location} numberOfLines={1}>
                                        {location}
                                    </Text>
                                </View>

                                <View style={styles.statsRow}>
                                        <View style={styles.statBox}>
                                            <IconButton icon="calendar-month" size={18} iconColor={customTheme.colors.primary} style={styles.statIcon} />
                                        <View>
                                            <Text style={styles.statValue}>{slotsCount || '-'}</Text>
                                            <Text style={styles.statLabel}>Slots</Text>
                                        </View>
                                        </View>
                                        <View style={styles.statDivider} />
                                        <View style={styles.statBox}>
                                        <IconButton icon="account-group-outline" size={18} iconColor={customTheme.colors.primary} style={styles.statIcon} />
                                        <View>
                                            <Text style={styles.statValue}>{candidatesCount}</Text>
                                            <Text style={styles.statLabel}>Candidates</Text>
                                        </View>
                                        </View>
                                        <View style={styles.statDivider} />
                                        <View style={styles.statBox}>
                                        <IconButton icon="heart-outline" size={18} iconColor={customTheme.colors.primary} style={styles.statIcon} />
                                        <View>
                                            <Text style={styles.statValue}>{interestsCount}</Text>
                                            <Text style={styles.statLabel}>Interests</Text>
                                        </View>
                                    </View>
                                </View>
                                </TouchableOpacity>

                                {isDedicated ? (
                                    <View style={styles.directBadgeRow}>
                                        <Chip style={styles.directBadge} textStyle={styles.directBadgeText}>
                                            Direct / Private
                                        </Chip>
                                        <Chip mode="outlined" style={styles.pendingBadge} textStyle={styles.pendingBadgeText}>
                                            Pending
                                        </Chip>
                                    </View>
                                ) : null}

                                {isExpanded && (
                                    <>
                                        <Divider style={styles.divider} />

                                        {description ? (
                                            <View style={styles.descriptionBox}>
                                                <Text style={styles.descriptionText}>{description}</Text>
                                            </View>
                                        ) : null}

                                            <EscalationStepper
                                                shift={shift}
                                                currentLevel={shiftLevel}
                                                selectedLevel={selectedLevel}
                                                onSelectLevel={(levelKey) => handleLevelChange(shift, levelKey)}
                                            onEscalate={async (_s, levelKey) => {
                                                const success = await handleEscalate(shift.id, levelKey);
                                                if (!success) return;
                                                const updatedShift = { ...shift, visibility: levelKey, visibilityLevel: levelKey } as Shift;
                                                setSelectedLevelByShift(prev => ({ ...prev, [shift.id]: levelKey }));
                                                await loadTabDataForShift(updatedShift, levelKey);
                                                await loadShifts();
                                                }}
                                                escalating={actionLoading[`escalate_${shift.id}`]}
                                            labelOverrides={labelOverrides}
                                            showPrivateFirst={isDedicated}
                                            />

                                        <Divider style={styles.divider} />

                                        {showPaymentRequired && (
                                            <View style={styles.paymentRequiredBox}>
                                                <Text style={styles.paymentRequiredTitle}>
                                                    Payment Required
                                                </Text>
                                                <Text style={styles.paymentRequiredText}>
                                                    A candidate confirmed this shift. Complete payment to finalise their booking.
                                                </Text>
                                                <View style={styles.paymentButtonRow}>
                                                    <Button
                                                        mode="contained"
                                                        buttonColor={customTheme.colors.error}
                                                        style={styles.paymentButton}
                                                        onPress={async () => {
                                                            try {
                                                                const payload = {
                                                                    platform: 'mobile',
                                                                    ...(!isSingleUserShift && slotsCount > 1 && selectedSlotId != null ? { slot_id: selectedSlotId } : {}),
                                                                };
                                                                const { data: res } = await apiClient.post(`/billing/charge-fulfillment/${shift.id}/`, payload);
                                                                if (res?.url) {
                                                                    await Linking.openURL(res.url);
                                                                } else if (res?.free) {
                                                                    showSnackbar(res?.message || 'Shift finalized without payment.');
                                                                    await loadShifts();
                                                                } else {
                                                                    showSnackbar('Payment session was not returned.');
                                                                }
                                                            } catch (err: any) {
                                                                showSnackbar(err?.message || 'Failed to initiate payment.');
                                                            }
                                                        }}
                                                    >
                                                        Pay with Stripe
                                                    </Button>
                                                    <Button
                                                        mode="contained"
                                                        buttonColor="#4F46E5"
                                                        style={styles.paymentButton}
                                                        loading={pillPayingShiftId === shift.id}
                                                        disabled={pillPayingShiftId === shift.id}
                                                        onPress={() => handlePayWithPills(shift, !isSingleUserShift && slotsCount > 1 ? selectedSlotId : null)}
                                                    >
                                                        Pay with Pills
                                                    </Button>
                                                </View>
                                            </View>
                                        )}

                                        {currentTabData.loading ? (
                                            <ActivityIndicator style={{ padding: 20 }} />
                                        ) : selectedLevel === PUBLIC_LEVEL_KEY ? (
                                            <>
                                                {counterOffersLoading || !counterOffersLoaded ? (
                                                    <ActivityIndicator style={{ padding: 20 }} />
                                                ) : (
                                                    <PublicLevelView
                                                        shift={shift}
                                                        slotId={selectedSlotId}
                                                        slotHasUpdates={slotHasUpdatesByShift[shift.id] || {}}
                                                        interestsAll={publicInterests}
                                                        counterOffers={publicOffers}
                                                        counterOffersLoaded={counterOffersLoaded}
                                                        onReveal={handleRevealInterest}
                                                        onSelectSlot={(slotId) => handleSlotSelection(shift.id, slotId)}
                                                        onReviewOffer={(s, o, slotId) =>
                                                            handleReviewOffer(s, o, currentTabData, slotId)
                                                        }
                                                        revealingInterestId={revealingInterestId}
                                                    />
                                                )}
                                                {communityDataLoading ? (
                                                    <ActivityIndicator style={{ padding: 20 }} />
                                                ) : (
                                                    <CommunityLevelView
                                                        shift={shift}
                                                        members={membersForView}
                                                        selectedSlotId={selectedSlotId}
                                                        slotHasUpdates={slotHasUpdatesByShift[shift.id] || {}}
                                                        offers={offers || []}
                                                        showSlotSelector={false}
                                                        onSelectSlot={(slotId) => handleSlotSelection(shift.id, slotId)}
                                                        onReviewCandidate={(member, _shiftId, offer, slotId) =>
                                                            handleReviewCandidate(shift, member, offer, slotId)
                                                        }
                                                        reviewLoadingId={reviewLoadingId}
                                                    />
                                                )}
                                            </>
                                        ) : (
                                            communityDataLoading ? (
                                                <ActivityIndicator style={{ padding: 20 }} />
                                            ) : (
                                                <CommunityLevelView
                                                    shift={shift}
                                                    members={membersForView}
                                                    selectedSlotId={selectedSlotId}
                                                    slotHasUpdates={slotHasUpdatesByShift[shift.id] || {}}
                                                    offers={offers || []}
                                                    onSelectSlot={(slotId) => handleSlotSelection(shift.id, slotId)}
                                                    onReviewCandidate={(member, _shiftId, offer, slotId) =>
                                                        handleReviewCandidate(shift, member, offer, slotId)
                                                    }
                                                    reviewLoadingId={reviewLoadingId}
                                                />
                                            )
                                        )}
                                    </>
                                )}
                            </Card.Content>
                        </Card>
                        </React.Fragment>
                    );
                })}
            </ScrollView>

            <DeleteConfirmDialog
                visible={deleteConfirmDialog.open}
                loading={deleteConfirmDialog.shiftId ? actionLoading[`delete_${deleteConfirmDialog.shiftId}`] ?? false : false}
                onDismiss={() => setDeleteConfirmDialog({ open: false, shiftId: null })}
                onConfirm={async () => {
                    if (deleteConfirmDialog.shiftId) {
                        const success = await handleDelete(deleteConfirmDialog.shiftId);
                        if (success) {
                            setDeleteConfirmDialog({ open: false, shiftId: null });
                        }
                    }
                }}
            />

            <CounterOfferDialog
                visible={reviewOfferDialog.open}
                offer={reviewOfferDialog.offer}
                candidate={reviewOfferDialog.candidate}
                slotId={reviewOfferDialog.slotId}
                assignLabel={reviewOfferDialog.slotId != null ? 'Assign to Slot' : 'Assign to Shift'}
                assignLoading={
                    reviewOfferDialog.shiftId != null && reviewOfferDialog.candidate?.userId != null
                        ? actionLoading[`accept_${reviewOfferDialog.shiftId}_${reviewOfferDialog.candidate.userId}`] ?? false
                        : false
                }
                workerRatingSummary={workerRatingSummary}
                workerRatingComments={workerRatingComments}
                workerCommentsPage={workerCommentsPage}
                workerCommentsPageCount={workerCommentsPageCount}
                counterActionLoading={counterActionLoading}
                onDismiss={() => setReviewOfferDialog({ open: false, shiftId: null, offer: null, candidate: null, slotId: null })}
                onAccept={(offer) => handleAcceptOffer(offer, reviewOfferDialog.shiftId, reviewOfferDialog.slotId)}
                onReject={(offer) => handleRejectOffer(offer, reviewOfferDialog.shiftId)}
                onAssign={(userId, slotId) => handleAssignCandidate(userId, reviewOfferDialog.shiftId, slotId)}
                onPageChange={(page) => {
                    if (reviewOfferDialog.candidate) {
                        const userId = (reviewOfferDialog.offer?.user as any)?.id ?? reviewOfferDialog.candidate?.userId;
                        if (userId) {
                            loadWorkerRatings(userId, page);
                        }
                    }
                }}
            />

            <Snackbar
                visible={snackbarOpen}
                onDismiss={() => setSnackbarOpen(false)}
                duration={4000}
            >
                {snackbarMessage}
            </Snackbar>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#F8FAFC',
    },
    content: {
        padding: customTheme.spacing.lg,
        gap: customTheme.spacing.md,
    },
    pageHeader: {
        gap: 4,
        marginBottom: customTheme.spacing.sm,
    },
    title: {
        fontSize: 24,
        fontWeight: '900',
        color: '#111827',
        letterSpacing: -0.4,
    },
    subtitle: {
        color: '#64748B',
        fontSize: 14,
        fontWeight: '600',
    },
    sectionTitle: {
        fontSize: 12,
        fontWeight: '700',
        textTransform: 'uppercase',
        color: customTheme.colors.textMuted,
        letterSpacing: 1,
        marginTop: customTheme.spacing.sm,
    },
    cardTitle: {
        fontSize: 17,
        fontWeight: '900',
        color: '#111827',
    },
    cardSubtitle: {
        fontSize: 12,
        color: '#64748B',
        marginTop: 5,
        fontWeight: '600',
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        gap: customTheme.spacing.md,
    },
    loadingText: {
        color: customTheme.colors.textMuted,
    },
    emptyContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: customTheme.spacing.xl,
    },
    emptyText: {
        fontSize: 16,
        color: customTheme.colors.textMuted,
    },
    shiftCard: {
        position: 'relative',
        overflow: 'hidden',
        marginBottom: customTheme.spacing.md,
        borderRadius: 24,
        borderWidth: 1,
        borderColor: '#D9E2F2',
        backgroundColor: '#FFFFFF',
        elevation: 5,
        shadowColor: '#6366F1',
        shadowOffset: { width: 0, height: 14 },
        shadowOpacity: 0.12,
        shadowRadius: 28,
    },
    cardAccent: {
        position: 'absolute',
        left: 0,
        top: 0,
        bottom: 0,
        width: 0,
    },
    cardPressArea: {
        marginTop: 0,
    },
    cardTopRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: customTheme.spacing.md,
        paddingTop: customTheme.spacing.sm,
        marginBottom: customTheme.spacing.sm,
    },
    pharmacyMark: {
        width: 58,
        height: 58,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#7C3AED',
        shadowOffset: { width: 0, height: 12 },
        shadowOpacity: 0.24,
        shadowRadius: 24,
        elevation: 5,
    },
    markIcon: {
        margin: 0,
    },
    cardTitleBlock: {
        flex: 1,
        minWidth: 0,
    },
    badgeRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: customTheme.spacing.xs,
        marginBottom: customTheme.spacing.sm,
    },
    primaryBadge: {
        borderWidth: 0,
    },
    primaryBadgeText: {
        color: '#fff',
        fontWeight: '600',
    },
    outlineBadge: {
        borderColor: customTheme.colors.border,
    },
    urgentBadge: {
        backgroundColor: customTheme.colors.errorLight,
    },
    urgentBadgeText: {
        color: customTheme.colors.error,
        fontWeight: '600',
    },
    metaRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: customTheme.spacing.sm,
        marginTop: customTheme.spacing.xs,
    },
    location: {
        flex: 1,
        fontSize: 13,
        color: '#64748B',
        fontWeight: '600',
    },
    headerActions: {
        flexDirection: 'row',
        alignItems: 'center',
        flexWrap: 'nowrap',
        justifyContent: 'flex-end',
        width: 96,
    },
    directBadgeRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: customTheme.spacing.sm,
        marginTop: customTheme.spacing.sm,
        marginBottom: customTheme.spacing.sm,
    },
    directBadge: {
        backgroundColor: '#E0F2FE',
    },
    directBadgeText: {
        color: '#0369A1',
        fontWeight: '600',
    },
    pendingBadge: {
        borderColor: customTheme.colors.border,
    },
    pendingBadgeText: {
        color: customTheme.colors.textMuted,
        fontWeight: '600',
    },
    actionButton: {
        margin: 0,
        width: 30,
        height: 30,
        backgroundColor: '#F8FAFC',
    },
    statsRow: {
        flexDirection: 'row',
        flexWrap: 'nowrap',
        justifyContent: 'space-between',
        alignItems: 'stretch',
        alignSelf: 'stretch',
        width: '100%',
        marginTop: customTheme.spacing.md,
        marginBottom: customTheme.spacing.sm,
        marginHorizontal: -4,
    },
    statBox: {
        flex: 1,
        minHeight: 64,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: customTheme.spacing.xs,
        paddingHorizontal: 8,
        paddingVertical: 8,
        marginHorizontal: 4,
        borderWidth: 1,
        borderColor: '#D9E2F2',
        borderRadius: 18,
        backgroundColor: '#F8FAFC',
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.06,
        shadowRadius: 18,
        elevation: 2,
    },
    statDivider: {
        width: 0,
    },
    statIcon: {
        margin: 0,
        width: 32,
        height: 32,
        backgroundColor: '#F3E8FF',
    },
    statValue: {
        color: '#111827',
        fontSize: 15,
        fontWeight: '900',
    },
    statLabel: {
        color: '#64748B',
        fontSize: 10,
        fontWeight: '700',
    },
    divider: {
        marginVertical: customTheme.spacing.lg,
    },
    descriptionBox: {
        backgroundColor: '#F9FAFB',
        borderRadius: 10,
        borderWidth: 1,
        borderColor: customTheme.colors.border,
        padding: customTheme.spacing.md,
        marginBottom: customTheme.spacing.md,
    },
    descriptionText: {
        color: customTheme.colors.text,
        fontSize: 13,
        lineHeight: 18,
    },
    paymentRequiredBox: {
        marginBottom: customTheme.spacing.md,
        padding: customTheme.spacing.lg,
        backgroundColor: '#FEF2F2',
        borderRadius: 18,
        borderWidth: 1,
        borderColor: '#FCA5A5',
        gap: customTheme.spacing.sm,
    },
    paymentRequiredTitle: {
        fontSize: 16,
        fontWeight: '700',
        color: customTheme.colors.error,
    },
    paymentRequiredText: {
        fontSize: 13,
        color: customTheme.colors.text,
        lineHeight: 18,
    },
    paymentButtonRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: customTheme.spacing.sm,
    },
    paymentButton: {
        flexGrow: 1,
    },
    sectionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: customTheme.spacing.sm,
        marginBottom: customTheme.spacing.sm,
    },
    sectionDivider: {
        flex: 1,
    },
    sectionChip: {
        backgroundColor: '#fff',
        borderColor: '#DDD6FE',
    },
});

export default ActiveShiftsPage;
