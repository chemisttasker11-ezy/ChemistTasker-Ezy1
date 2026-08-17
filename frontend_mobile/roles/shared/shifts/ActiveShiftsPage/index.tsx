// ActiveShiftsPage - Main Component
// Mobile implementation aligned with web logic and hooks

import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { Alert, View, StyleSheet, ScrollView, TouchableOpacity, Linking } from 'react-native';
import { Text, Button, IconButton, Snackbar, ActivityIndicator, Card, Divider, Chip, Checkbox } from 'react-native-paper';
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

const slotHasAwaitingPayment = (slot: any): boolean => {
    return Boolean(slot?.awaitingPayment ?? slot?.awaiting_payment);
};

const getSlotAwaitingPaymentOfferId = (slot: any): number | null => {
    return toFiniteNumber(slot?.awaitingPaymentOfferId ?? slot?.awaiting_payment_offer_id);
};

const formatAuSlotDateTime = (slot: any): string => {
    const date = slot?.date ? new Date(`${slot.date}T00:00:00`) : null;
    const dateLabel = date && !Number.isNaN(date.getTime())
        ? new Intl.DateTimeFormat('en-AU', {
            weekday: 'short',
            day: '2-digit',
            month: 'short',
            year: 'numeric',
        }).format(date)
        : 'Date not set';
    const time = [slot?.startTime ?? slot?.start_time, slot?.endTime ?? slot?.end_time]
        .filter(Boolean)
        .map((value: string) => String(value).slice(0, 5))
        .join(' - ');
    return time ? `${dateLabel} | ${time}` : dateLabel;
};

const getCandidateNameForPaymentSlot = (shift: Shift, slotId: number): string => {
    const offers = ((shift as any).offers ?? (shift as any).shiftOffers ?? []) as any[];
    const match = offers.find((offer) => {
        const status = String(offer?.status ?? '').toUpperCase();
        const offerSlotId = toFiniteNumber(offer?.slotId ?? offer?.slot_id ?? offer?.slot?.id ?? offer?.slot);
        return status === 'ACCEPTED_AWAITING_PAYMENT' && offerSlotId === slotId;
    });
    const user = match?.userDetail ?? match?.user_detail ?? (typeof match?.user === 'object' ? match.user : null);
    const name = user?.name || user?.displayName || user?.display_name ||
        [user?.firstName ?? user?.first_name, user?.lastName ?? user?.last_name].filter(Boolean).join(' ');
    return name || 'Participant';
};

const shouldShowPaymentRequired = (shift: Shift, selectedSlotId: number | null): boolean => {
    const shiftAny = shift as any;
    const paymentStatus = shiftAny.paymentStatus ?? shiftAny.payment_status;
    if (paymentStatus !== 'PENDING') return false;

    const slots = Array.isArray(shiftAny.slots) ? shiftAny.slots : [];
    const isSingleUserShift = Boolean(shiftAny.singleUserOnly ?? shiftAny.single_user_only);
    if (selectedSlotId != null) {
        const selectedSlot = slots.find((slot: any) => resolveSlotIdAny(slot) === selectedSlotId);
        if (selectedSlot && slotHasAwaitingPayment(selectedSlot)) return true;
        if (selectedSlot && ('awaiting_payment' in selectedSlot || 'awaitingPayment' in selectedSlot)) return false;
    }

    const rawPendingSlotIds = shiftAny.pendingPaymentSlotIds ?? shiftAny.pending_payment_slot_ids;
    if (!Array.isArray(rawPendingSlotIds)) return isSingleUserShift || slots.length <= 1;
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

const findInterestForMember = (member: any, data: any, slotId: number | null): ShiftInterest | null => {
    const memberUserId = toFiniteNumber(member?.userId ?? member?.user_id ?? member?.user?.id);
    const lists: any[] = [];
    if (slotId != null) {
        lists.push(...(data?.interestsBySlot?.[slotId] ?? data?.interests_by_slot?.[slotId] ?? []));
    }
    lists.push(...(data?.interestsAll ?? data?.interests_all ?? []));

    return (
        lists.find((interest: any) => {
            const interestUserId = toFiniteNumber(
                interest?.userId ??
                interest?.user_id ??
                interest?.userDetail?.id ??
                interest?.user_detail?.id ??
                (typeof interest?.user === 'object' ? interest.user?.id : interest?.user)
            );
            const slotMatches = slotId == null || interestBelongsToSlot(interest, slotId);
            return memberUserId != null && interestUserId === memberUserId && slotMatches;
        }) ?? null
    );
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
    const [paymentSlotSelection, setPaymentSlotSelection] = useState<Record<number, number[]>>({});

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
    const [buzzLoadingOfferId, setBuzzLoadingOfferId] = useState<number | null>(null);
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
    const handlePayWithPills = useCallback(async (shift: Shift, offerIds: number[] = []) => {
        setPillPayingShiftId(shift.id);
        try {
            const { data: res } = await apiClient.post('/client-profile/pill-rewards/pay-shift/', {
                shift_id: shift.id,
                ...(offerIds.length > 0 ? { offer_ids: offerIds } : {}),
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

    const handlePayWithStripe = useCallback(async (shift: Shift, offerIds: number[] = []) => {
        try {
            const { data: res } = await apiClient.post(`/billing/charge-fulfillment/${shift.id}/`, {
                platform: 'mobile',
                ...(offerIds.length > 0 ? { offer_ids: offerIds } : {}),
            });
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
            pendingConfirmation: Boolean(interestAny?.pendingConfirmation ?? interestAny?.pending_confirmation),
            pendingOfferId: interestAny?.pendingOfferId ?? interestAny?.pending_offer_id ?? null,
            awaitingPayment: Boolean(interestAny?.awaitingPayment ?? interestAny?.awaiting_payment),
            awaitingPaymentOfferId: interestAny?.awaitingPaymentOfferId ?? interestAny?.awaiting_payment_offer_id ?? null,
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
                console.error('Failed to load candidate ratings', error);
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
                    console.error('Failed to load candidate ratings', error);
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
            const levelKey = selectedLevelByShift[shift.id] ?? getCurrentLevelKey(shift);
            const currentTabData = tabData[getTabKey(shift.id, levelKey)] || {};
            const interest = findInterestForMember(member, currentTabData, slotId);
            let revealedUser: any = null;

            if (interest && !(interest as any).revealed) {
                try {
                    revealedUser = await revealInterest(shift, interest, levelKey);
                    await loadTabDataForShift(shift, levelKey);
                } catch (error) {
                    console.error('Failed to reveal reviewed candidate', error);
                }
            }

            const revealedUserObj =
                (typeof revealedUser === 'object' && revealedUser) ||
                (typeof (interest as any)?.user === 'object' ? (interest as any).user : null) ||
                (interest as any)?.user_detail ||
                (interest as any)?.userDetail ||
                null;

            const pendingConfirmationCounterOffer =
                (member as any).pendingConfirmationCounterOffer ??
                (member as any).pending_confirmation_counter_offer ??
                null;
            const awaitingPaymentCounterOffer =
                (member as any).awaitingPaymentCounterOffer ??
                (member as any).awaiting_payment_counter_offer ??
                null;

            const candidate = {
                userId: revealedUserObj?.id ?? (member as any).userId ?? (member as any).user?.id ?? null,
                name:
                    revealedUserObj?.firstName && revealedUserObj?.lastName
                        ? `${revealedUserObj.firstName} ${revealedUserObj.lastName}`
                        : revealedUserObj?.first_name && revealedUserObj?.last_name
                            ? `${revealedUserObj.first_name} ${revealedUserObj.last_name}`
                            : (member as any).firstName && (member as any).lastName
                        ? `${(member as any).firstName} ${(member as any).lastName}`
                        : revealedUserObj?.name || revealedUserObj?.displayName || revealedUserObj?.display_name || member.displayName || (member as any).email || 'Candidate',
                email: revealedUserObj?.email || (member as any).email || '',
                shortBio: revealedUserObj?.shortBio || revealedUserObj?.short_bio || (member as any).shortBio || '',
                pendingConfirmation: !offer && Boolean((member as any).pendingConfirmation ?? (member as any).pending_confirmation),
                pendingOfferId: (member as any).pendingOfferId ?? (member as any).pending_offer_id ?? null,
                pendingConfirmationCounterOffer,
                awaitingPayment: !offer && Boolean((member as any).awaitingPayment ?? (member as any).awaiting_payment),
                awaitingPaymentOfferId: (member as any).awaitingPaymentOfferId ?? (member as any).awaiting_payment_offer_id ?? null,
                awaitingPaymentCounterOffer,
            };

            if ((member as any).userId != null) {
                try {
                    await loadWorkerRatings((member as any).userId, 1);
                } catch (error) {
                    console.error('Failed to load candidate ratings', error);
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
            const pendingCounterWithSlots = pendingConfirmationCounterOffer
                ? { ...pendingConfirmationCounterOffer, _mappedSlots: mapOfferSlotsWithShift(pendingConfirmationCounterOffer, shift, resolvedSlotId) }
                : null;
            const awaitingCounterWithSlots = awaitingPaymentCounterOffer
                ? { ...awaitingPaymentCounterOffer, _mappedSlots: mapOfferSlotsWithShift(awaitingPaymentCounterOffer, shift, resolvedSlotId) }
                : null;

            setReviewOfferDialog({
                open: true,
                shiftId: shift.id,
                offer: offer ? { ...offer, _mappedSlots: mappedSlots } : null,
                candidate: {
                    ...candidate,
                    pendingConfirmationCounterOffer: pendingCounterWithSlots,
                    awaitingPaymentCounterOffer: awaitingCounterWithSlots,
                },
                slotId: resolvedSlotId,
            });
        },
        [
            resetWorkerRatings,
            selectedLevelByShift,
            tabData,
            getTabKey,
            revealInterest,
            loadTabDataForShift,
            loadWorkerRatings,
            getOfferSlotIds,
        ]
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
            const result = await acceptOffer({ offer, shiftId, slotId: resolvedSlotId }, async () => {
                showSnackbar('Offer sent. Waiting for candidate confirmation.');
                setReviewOfferDialog({ open: false, shiftId: null, offer: null, candidate: null, slotId: null });
                await loadShifts();
                if (targetShift) {
                    const levelKey = selectedLevelByShift[shiftId] ?? getCurrentLevelKey(targetShift);
                    await loadTabDataForShift(targetShift, levelKey);
                    await loadCounterOffers(shiftId);
                }
            });
            if (result && !result.ok) {
                showSnackbar(result.detail || 'Failed to accept offer');
            }
        },
        [acceptOffer, showSnackbar, loadShifts, shifts, getOfferSlotIds, selectedLevelByShift, loadTabDataForShift, loadCounterOffers]
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
            const result = await handleAccept(shiftId, userId, slotId);
            if (result) {
                const targetShift = shifts.find((s) => s.id === shiftId);
                const offerId = (result as any)?.offerId ?? (result as any)?.offer_id ?? null;
                setReviewOfferDialog((prev) => ({
                    ...prev,
                    candidate: prev.candidate
                        ? { ...prev.candidate, pendingConfirmation: true, pendingOfferId: offerId ?? prev.candidate.pendingOfferId }
                        : prev.candidate,
                }));
                setTabData((prev) => {
                    const next = { ...prev };
                    Object.entries(next).forEach(([key, value]) => {
                        if (!key.startsWith(`${shiftId}_`) || !value) return;
                        const patchRecord = (record: any) => {
                            const recordUserId = getCandidateUserId(record);
                            if (recordUserId !== userId) return record;
                            return {
                                ...record,
                                pendingConfirmation: true,
                                pending_confirmation: true,
                                pendingOfferId: offerId ?? record.pendingOfferId ?? record.pending_offer_id,
                                pending_offer_id: offerId ?? record.pending_offer_id ?? record.pendingOfferId,
                            };
                        };
                        const updated: any = { ...value };
                        if (Array.isArray(updated.interestsAll)) updated.interestsAll = updated.interestsAll.map(patchRecord);
                        if (updated.interestsBySlot) {
                            updated.interestsBySlot = Object.fromEntries(Object.entries(updated.interestsBySlot).map(([sid, list]) => [
                                sid,
                                Array.isArray(list) ? list.map(patchRecord) : list,
                            ]));
                        }
                        if (Array.isArray(updated.members)) updated.members = updated.members.map(patchRecord);
                        if (updated.membersBySlot) {
                            updated.membersBySlot = Object.fromEntries(Object.entries(updated.membersBySlot).map(([sid, list]) => [
                                sid,
                                Array.isArray(list) ? list.map(patchRecord) : list,
                            ]));
                        }
                        next[key] = updated;
                    });
                    return next;
                });
                await loadShifts();
                if (targetShift) {
                    const levelKey = selectedLevelByShift[shiftId] ?? getCurrentLevelKey(targetShift);
                    await loadTabDataForShift(targetShift, levelKey);
                }
            }
        },
        [handleAccept, loadShifts, loadTabDataForShift, selectedLevelByShift, shifts]
    );

    const handleBuzzWorker = useCallback(
        async (offerId: number) => {
            if (!offerId) return;
            setBuzzLoadingOfferId(offerId);
            try {
                const response = await apiClient.post(`/client-profile/shift-offers/${offerId}/buzz/`);
                const result = response.data;
                Alert.alert(
                    'Buzz reminder',
                    result?.detail || "Reminder sent. We've gently nudged the candidate to confirm this shift.",
                    [{ text: 'Close' }]
                );
            } catch (error) {
                console.error('Failed to send confirmation reminder', error);
                const message =
                    (error as any)?.response?.data?.detail ||
                    (error as any)?.data?.detail ||
                    (error as any)?.message ||
                    'Failed to send confirmation reminder';
                Alert.alert('Buzz reminder', message, [{ text: 'Close' }]);
                await loadShifts();
            } finally {
                setBuzzLoadingOfferId(null);
            }
        },
        [loadShifts]
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
                    const allMembers = isSingleUserShift
                        ? consolidatedMembers
                        : Object.values(consolidatedMembersBySlot || {}).flatMap((slotMembers: any) => (
                            Array.isArray(slotMembers) ? slotMembers : []
                        ));
                    const allInterests = publicInterests;
                    const allOffers = publicOffers;
                    const slotById = new Map<number, any>();
                    (((shift as any).slots || []) as any[]).forEach((slot) => {
                        const slotId = resolveSlotIdAny(slot);
                        if (slotId != null) slotById.set(slotId, slot);
                    });
                    const directPaymentOptions = (((shift as any).paymentOptions ?? (shift as any).payment_options ?? []) as any[])
                        .map((option) => {
                            const offerId = toFiniteNumber(option.offerId ?? option.offer_id);
                            const slotId = toFiniteNumber(option.slotId ?? option.slot_id);
                            if (!offerId || !slotId) return null;
                            const slot = slotById.get(slotId) || {
                                id: slotId,
                                date: option.slotDate ?? option.slot_date,
                                start_time: option.startTime ?? option.start_time,
                                end_time: option.endTime ?? option.end_time,
                            };
                            return {
                                offerId,
                                slotId,
                                slot,
                                name: option.candidateName ?? option.candidate_name ?? option.candidateEmail ?? option.candidate_email ?? 'Participant',
                            };
                        })
                        .filter(Boolean) as Array<{ offerId: number; slotId: number; slot: any; name: string }>;
                    const memberPaymentOptions = dedupeMembers(allMembers)
                        .map((member: any) => {
                            const offerId = toFiniteNumber(member.awaitingPaymentOfferId ?? member.awaiting_payment_offer_id);
                            const slotId = toFiniteNumber(member.slotId ?? member.slot_id) ?? selectedSlotId;
                            if (!offerId || (!slotId && !isSingleUserShift)) return null;
                            const resolvedSlotId = slotId ?? 0;
                            return {
                                offerId,
                                slotId: resolvedSlotId,
                                slot: slotById.get(resolvedSlotId) || ((shift as any).slots || [])[0] || null,
                                name: member.displayName || member.display_name || member.name || member.email || 'Participant',
                            };
                        })
                        .filter(Boolean) as Array<{ offerId: number; slotId: number; slot: any; name: string }>;
                    const publicInterestPaymentOptions = dedupeMembers(allInterests)
                        .map((interest: any) => {
                            const offerId = toFiniteNumber(interest.awaitingPaymentOfferId ?? interest.awaiting_payment_offer_id);
                            const slotId = toFiniteNumber(interest.slotId ?? interest.slot_id) ?? selectedSlotId;
                            if (!offerId || (!slotId && !isSingleUserShift)) return null;
                            const resolvedSlotId = slotId ?? 0;
                            return {
                                offerId,
                                slotId: resolvedSlotId,
                                slot: slotById.get(resolvedSlotId) || ((shift as any).slots || [])[0] || null,
                                name: interest.displayName || interest.display_name || interest.userName || interest.user_name || interest.email || 'Participant',
                            };
                        })
                        .filter(Boolean) as Array<{ offerId: number; slotId: number; slot: any; name: string }>;
                    const paymentRequiredOffers = directPaymentOptions.length > 0
                        ? directPaymentOptions
                        : [...memberPaymentOptions, ...publicInterestPaymentOptions].filter((item, index, list) => (
                            list.findIndex((candidate) => candidate.offerId === item.offerId) === index
                        ));
                    const payableOfferIds = paymentRequiredOffers.map((item) => item.offerId);
                    const defaultPaymentOfferIds = Array.from(
                        paymentRequiredOffers.reduce((map, item) => {
                            if (!map.has(item.slotId)) map.set(item.slotId, item.offerId);
                            return map;
                        }, new Map<number, number>()).values()
                    );
                    const rawSelectedPaymentOfferIds = paymentSlotSelection[shift.id];
                    const selectedPaymentOfferIds = (rawSelectedPaymentOfferIds ?? defaultPaymentOfferIds).filter((offerId) => payableOfferIds.includes(offerId));
                    const effectivePaymentOfferIds = selectedPaymentOfferIds;
                    const paymentUnitCount = effectivePaymentOfferIds.length;
                    const showPaymentRequired = paymentRequiredOffers.length > 0;
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
                    const slotCandidateCounts = slotIds.reduce<Record<number, number>>((acc, slotId) => {
                        const slotMembers = consolidatedMembersBySlot[slotId] || [];
                        const slotInterests = allInterests.filter((interest: any) => interestBelongsToSlot(interest, slotId));
                        const slotOffers = allOffers.filter((offer: any) => offerBelongsToSlot(offer, slotId));
                        acc[slotId] = countUniquePeople([
                            ...dedupeMembers(slotMembers),
                            ...slotInterests,
                            ...slotOffers,
                        ]);
                        return acc;
                    }, {});
                    const slotStatusCounts = slotIds.reduce<Record<number, { interested: number; assigned: number; rejected: number; noResponse: number }>>((acc, slotId) => {
                        const slotMembers = dedupeMembers(consolidatedMembersBySlot[slotId] || []);
                        const slotInterests = allInterests.filter((interest: any) => interestBelongsToSlot(interest, slotId));
                        const slotOffers = allOffers.filter((offer: any) => offerBelongsToSlot(offer, slotId));
                        const slotNoResponse = countUniquePeople(slotMembers.filter((member: any) => member?.status === 'no_response'));
                        const shiftNoResponse = countUniquePeople(dedupeMembers(consolidatedMembers).filter((member: any) => member?.status === 'no_response'));
                        acc[slotId] = {
                            interested: countUniquePeople([
                                ...slotMembers.filter((member: any) => member?.status === 'interested'),
                                ...slotInterests,
                                ...slotOffers.filter(isActiveCounterOffer),
                            ]),
                            assigned: countUniquePeople(slotMembers.filter((member: any) => member?.status === 'accepted')),
                            rejected: countUniquePeople(slotMembers.filter((member: any) => member?.status === 'rejected')),
                            noResponse: slotNoResponse || shiftNoResponse,
                        };
                        return acc;
                    }, {});
                    if (selectedSlotId != null) {
                        const selectedMembers = dedupeMembers(membersForView);
                        slotStatusCounts[selectedSlotId] = {
                            interested: countUniquePeople([
                                ...selectedMembers.filter((member: any) => member?.status === 'interested'),
                                ...allInterests.filter((interest: any) => interestBelongsToSlot(interest, selectedSlotId)),
                                ...allOffers.filter((offer: any) => offerBelongsToSlot(offer, selectedSlotId) && isActiveCounterOffer(offer)),
                            ]),
                            assigned: countUniquePeople(selectedMembers.filter((member: any) => member?.status === 'accepted')),
                            rejected: countUniquePeople(selectedMembers.filter((member: any) => member?.status === 'rejected')),
                            noResponse: countUniquePeople(selectedMembers.filter((member: any) => member?.status === 'no_response')),
                        };
                    }

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
                                                    Payments Required
                                                </Text>
                                                <Text style={styles.paymentRequiredText}>
                                                    {isSingleUserShift
                                                        ? `${paymentRequiredOffers.length} bundle payment option${paymentRequiredOffers.length === 1 ? '' : 's'}`
                                                        : `${paymentUnitCount} selected from ${paymentRequiredOffers.length} payment option${paymentRequiredOffers.length === 1 ? '' : 's'}`} | ${paymentUnitCount * 30} AUD
                                                </Text>
                                                <View style={styles.paymentSlotList}>
                                                    {paymentRequiredOffers.map((item) => {
                                                        const checked = selectedPaymentOfferIds.includes(item.offerId);
                                                        const bundleSlots = isSingleUserShift ? (((shift as any).slots || []) as any[]) : [];
                                                        return (
                                                            <TouchableOpacity
                                                                key={`${shift.id}-${item.offerId}`}
                                                                style={styles.paymentSlotRow}
                                                                disabled={isSingleUserShift}
                                                                onPress={() => {
                                                                    setPaymentSlotSelection((prev) => {
                                                                        const current = new Set(prev[shift.id] ?? defaultPaymentOfferIds);
                                                                        if (current.has(item.offerId)) {
                                                                            current.delete(item.offerId);
                                                                        } else {
                                                                            paymentRequiredOffers
                                                                                .filter((candidate) => candidate.slotId === item.slotId)
                                                                                .forEach((candidate) => current.delete(candidate.offerId));
                                                                            current.add(item.offerId);
                                                                        }
                                                                        return { ...prev, [shift.id]: Array.from(current) };
                                                                    });
                                                                }}
                                                            >
                                                                {!isSingleUserShift && <Checkbox status={checked ? 'checked' : 'unchecked'} />}
                                                                <View style={styles.paymentSlotText}>
                                                                    {isSingleUserShift
                                                                        ? (
                                                                            <>
                                                                                <Text style={styles.paymentSlotTitle}>{item.name} | Offer #{item.offerId}</Text>
                                                                                {(bundleSlots.length > 0 ? bundleSlots : [item.slot]).filter(Boolean).map((slot: any, idx: number) => (
                                                                                    <Text key={resolveSlotIdAny(slot) ?? idx} style={styles.paymentSlotMeta}>
                                                                                        {formatAuSlotDateTime(slot)}
                                                                                    </Text>
                                                                                ))}
                                                                            </>
                                                                        )
                                                                        : (
                                                                            <>
                                                                                <Text style={styles.paymentSlotTitle}>{formatAuSlotDateTime(item.slot)}</Text>
                                                                                <Text style={styles.paymentSlotMeta}>
                                                                                    {item.name} | Offer #{item.offerId}
                                                                                </Text>
                                                                            </>
                                                                        )}
                                                                </View>
                                                                <Chip compact>Payment pending</Chip>
                                                            </TouchableOpacity>
                                                        );
                                                    })}
                                                </View>
                                                <View style={styles.paymentButtonRow}>
                                                    <Button
                                                        mode="contained"
                                                        buttonColor={customTheme.colors.error}
                                                        style={styles.paymentButton}
                                                        disabled={paymentUnitCount === 0}
                                                        onPress={() => handlePayWithStripe(shift, effectivePaymentOfferIds)}
                                                    >
                                                        {isSingleUserShift ? 'Pay with Stripe' : 'Pay selected with Stripe'}
                                                    </Button>
                                                    <Button
                                                        mode="contained"
                                                        buttonColor="#4F46E5"
                                                        style={styles.paymentButton}
                                                        loading={pillPayingShiftId === shift.id}
                                                        disabled={paymentUnitCount === 0 || pillPayingShiftId === shift.id}
                                                        onPress={() => handlePayWithPills(shift, effectivePaymentOfferIds)}
                                                    >
                                                        {isSingleUserShift ? 'Pay with Pills' : 'Pay selected with Pills'}
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
                                                        slotCandidateCounts={slotCandidateCounts}
                                                        slotStatusCounts={slotStatusCounts}
                                                        interestsAll={publicInterests}
                                                        counterOffers={publicOffers}
                                                        counterOffersLoaded={counterOffersLoaded}
                                                        onReveal={handleRevealInterest}
                                                        onSelectSlot={(slotId) => handleSlotSelection(shift.id, slotId)}
                                                        onReviewOffer={(s, o, slotId) =>
                                                            handleReviewOffer(s, o, currentTabData, slotId)
                                                        }
                                                        revealingInterestId={revealingInterestId}
                                                        onBuzzWorker={handleBuzzWorker}
                                                        buzzLoadingOfferId={buzzLoadingOfferId}
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
                                                        slotCandidateCounts={slotCandidateCounts}
                                                        slotStatusCounts={slotStatusCounts}
                                                        offers={offers || []}
                                                        showSlotSelector={false}
                                                        onSelectSlot={(slotId) => handleSlotSelection(shift.id, slotId)}
                                                        onReviewCandidate={(member, _shiftId, offer, slotId) =>
                                                            handleReviewCandidate(shift, member, offer, slotId)
                                                        }
                                                        reviewLoadingId={reviewLoadingId}
                                                        onBuzzWorker={handleBuzzWorker}
                                                        buzzLoadingOfferId={buzzLoadingOfferId}
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
                                                        slotCandidateCounts={slotCandidateCounts}
                                                        slotStatusCounts={slotStatusCounts}
                                                    offers={offers || []}
                                                    onSelectSlot={(slotId) => handleSlotSelection(shift.id, slotId)}
                                                    onReviewCandidate={(member, _shiftId, offer, slotId) =>
                                                        handleReviewCandidate(shift, member, offer, slotId)
                                                    }
                                                    reviewLoadingId={reviewLoadingId}
                                                    onBuzzWorker={handleBuzzWorker}
                                                    buzzLoadingOfferId={buzzLoadingOfferId}
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
    paymentSlotList: {
        gap: customTheme.spacing.sm,
    },
    paymentSlotRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: customTheme.spacing.sm,
        padding: customTheme.spacing.sm,
        backgroundColor: '#FFFFFF',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#FECACA',
    },
    paymentSlotText: {
        flex: 1,
        minWidth: 0,
    },
    paymentSlotTitle: {
        fontSize: 13,
        fontWeight: '800',
        color: customTheme.colors.text,
    },
    paymentSlotMeta: {
        fontSize: 11,
        color: customTheme.colors.textMuted,
        marginTop: 2,
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
