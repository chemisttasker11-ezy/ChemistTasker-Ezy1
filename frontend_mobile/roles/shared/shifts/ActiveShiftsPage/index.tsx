// ActiveShiftsPage - Main Component
// Mobile implementation aligned with web logic and hooks

import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { Alert, View, ScrollView, TouchableOpacity, Linking } from 'react-native';
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
import ActiveShiftCards from './ActiveShiftCards';

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
import { styles } from './styles';
import {
    ACTIVE_SHIFT_SLOT_SEEN_KEY_PREFIX,
    toFiniteNumber,
    resolveSlotIdAny,
    getSlotIds,
    slotHasAwaitingPayment,
    getSlotAwaitingPaymentOfferId,
    formatAuSlotDateTime,
    getCandidateNameForPaymentSlot,
    shouldShowPaymentRequired,
    offerBelongsToSlot,
    interestBelongsToSlot,
    findInterestForMember,
    buildPublicSlotSignature,
    buildMemberSlotSignature,
    countUniquePeople,
    isActiveCounterOffer,
    getCandidateUserId,
} from './utils/activeShiftRuntime';

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
                <ActiveShiftCards
                    data={{
                        orderedShifts,
                        tabData,
                        counterOffersByShift,
                        counterOffersLoadingByShift,
                    }}
                    state={{
                        expandedShifts,
                        selectedLevelByShift,
                        selectedSlotByShift,
                        paymentSlotSelection,
                        setPaymentSlotSelection,
                        pillPayingShiftId,
                        sharingShiftId,
                        actionLoading,
                        slotHasUpdatesByShift,
                        revealingInterestId,
                        buzzLoadingOfferId,
                        reviewLoadingId,
                        setDeleteConfirmDialog,
                        setSelectedLevelByShift,
                    }}
                    actions={{
                        getTabKey,
                        resolveSlotId,
                        isDedicatedShift,
                        handlePayWithStripe,
                        handlePayWithPills,
                        handleShare,
                        handleEditShift,
                        toggleShiftExpansion,
                        handleLevelChange,
                        handleEscalate,
                        loadTabDataForShift,
                        loadShifts,
                        handleRevealInterest,
                        handleSlotSelection,
                        handleReviewOffer,
                        handleBuzzWorker,
                        handleReviewCandidate,
                    }}
                />
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

export default ActiveShiftsPage;
