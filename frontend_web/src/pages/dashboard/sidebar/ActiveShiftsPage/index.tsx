import React, { useState, useCallback, useMemo } from 'react';
import {
    Container,
    Typography,
    Box,
    CircularProgress,
    Snackbar,
    Stack,
    IconButton,
    Button,
    ThemeProvider,
    Pagination,
    useTheme,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
} from '@mui/material';
import {
    Close as X,
} from '@mui/icons-material';
import { useLocation, useNavigate } from 'react-router-dom';
import apiClient from '../../../../utils/apiClient';
import {
    Shift,
    ShiftInterest,
    ShiftMemberStatus,
    EscalationLevelKey,
} from '@chemisttasker/shared-core';
import { useAuth } from '../../../../contexts/AuthContext';


// Hooks
import { useShiftsData } from './hooks/useShiftsData';
import { useTabData } from './hooks/useTabData';
import { useCounterOffers } from './hooks/useCounterOffers';
import { useRevealInterest } from './hooks/useRevealInterest';
import { useWorkerRatings } from './hooks/useWorkerRatings';
import { useShiftActions } from './hooks/useShiftActions';
import { useShareShift } from './hooks/useShareShift';

// Components
import { DeleteConfirmDialog } from './components/Dialogs/DeleteConfirmDialog';
import { CounterOfferDialog } from './components/Dialogs/CounterOfferDialog';

import ActiveShiftCard from './ActiveShiftCard';

// Utils
import {
    PUBLIC_LEVEL_KEY,
    CustomEscalationLevelKey,
    getCurrentLevelKey,
    deriveLevelSequence,
} from './utils/shiftHelpers';
import { findInterestForOffer } from './utils/candidateHelpers';
import { mapOfferSlotsWithShift } from './utils/offerHelpers';

// Types
import {
    ReviewOfferDialogState,
    DeleteConfirmDialogState,
} from './types';

// Theme
import { customTheme } from './theme';

import {
    ACTIVE_SHIFT_SLOT_SEEN_KEY_PREFIX,
    toFiniteNumber,
    resolveSlotId,
    getSlotIds,
    findInterestForMember,
    buildPublicSlotSignature,
    buildMemberSlotSignature,
    getCandidateUserId,
} from './utils/activeShiftRuntime';

type ActiveShiftsPageProps = {
    shiftId?: number | null;
    title?: string;
};

const ActiveShiftsPage: React.FC<ActiveShiftsPageProps> = ({ shiftId = null, title = 'Active Shifts' }) => {
    const navigate = useNavigate();
    const location = useLocation();
    const outerTheme = useTheme();
    const isDarkMode = outerTheme.palette.mode === 'dark';
    const { user, activePersona, activeAdminPharmacyId } = useAuth();
    const selectedPharmacyId = null; // TODO: Get from proper context
    const scopedPharmacyId =
        activePersona === 'admin' && typeof activeAdminPharmacyId === 'number'
            ? activeAdminPharmacyId
            : null;
    const routeParams = useMemo(() => new URLSearchParams(location.search), [location.search]);
    const routeShiftId = toFiniteNumber(routeParams.get('shift_id')) ?? shiftId;
    const routeSlotId = toFiniteNumber(routeParams.get('slot_id'));
    const routeNotificationId = routeParams.get('notification_id') ?? routeParams.get('_ntf');

    // Snackbar
    const [snackbarOpen, setSnackbarOpen] = useState(false);
    const [snackbarMessage, setSnackbarMessage] = useState('');
    const [buzzDialog, setBuzzDialog] = useState({ open: false, message: '' });
    const [pillPayingShiftId, setPillPayingShiftId] = useState<number | null>(null);
    const itemsPerPage = 6;
    const [page, setPage] = useState(1);
    const [paymentSlotSelection, setPaymentSlotSelection] = useState<Record<number, number[]>>({});

    const showSnackbar = useCallback((msg: string) => {
        setSnackbarMessage(msg);
        setSnackbarOpen(true);
    }, []);

    // Escalation level tracking
    const [selectedLevelByShift, setSelectedLevelByShift] = useState<Record<number, EscalationLevelKey>>({});
    const [selectedSlotByShift, setSelectedSlotByShift] = useState<Record<number, number>>({});
    const [slotHasUpdatesByShift, setSlotHasUpdatesByShift] = useState<Record<number, Record<number, boolean>>>({});
    const [seenSlotSignatures, setSeenSlotSignatures] = useState<Record<string, string>>({});
    const [slotSeenReady, setSlotSeenReady] = useState(false);
    const latestSlotSignaturesRef = React.useRef<Record<string, string>>({});
    const reviewLoadingId: number | null = null;

    // Dialogs
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

    // Expanded shifts tracking
    const [expandedShifts, setExpandedShifts] = useState<Set<number>>(new Set());

    // Tab key generator
    const getTabKey = useCallback((shiftId: number, levelKey: EscalationLevelKey) => {
        return `${shiftId}_${levelKey}`;
    }, []);
    const seenStorageKey = useMemo(
        () => `${ACTIVE_SHIFT_SLOT_SEEN_KEY_PREFIX}:${user?.id ?? 'anon'}`,
        [user?.id]
    );

    // Data hooks
    const { shifts, setShifts, loading: shiftsLoading, loadShifts } = useShiftsData({ selectedPharmacyId, shiftId: routeShiftId });
    const { tabData, setTabData, loadTabDataForShift } = useTabData(shifts, selectedLevelByShift, getTabKey);
    const lastNotificationNavigationRef = React.useRef<string | null>(null);

    React.useEffect(() => {
        if (!routeNotificationId) return;
        const signature = `${location.pathname}${location.search}`;
        if (lastNotificationNavigationRef.current === signature) return;
        lastNotificationNavigationRef.current = signature;
        void loadShifts();
    }, [loadShifts, location.pathname, location.search, routeNotificationId]);

    React.useEffect(() => {
        if (routeShiftId == null) return;
        const targetShift = shifts.find((shift) => shift.id === routeShiftId);
        if (!targetShift) return;

        setExpandedShifts((prev) => {
            if (prev.has(routeShiftId)) return prev;
            const next = new Set(prev);
            next.add(routeShiftId);
            return next;
        });

        const isSingleUserShift = Boolean((targetShift as any).singleUserOnly ?? (targetShift as any).single_user_only);
        if (!isSingleUserShift) {
            const fallbackSlotId = resolveSlotId((targetShift as any).slots?.[0]);
            const targetSlotId = routeSlotId ?? fallbackSlotId;
            if (targetSlotId != null) {
                setSelectedSlotByShift((prev) => (
                    prev[routeShiftId] === targetSlotId
                        ? prev
                        : { ...prev, [routeShiftId]: targetSlotId }
                ));
            }
        }

        const timeout = window.setTimeout(() => {
            document.getElementById(`active-shift-card-${routeShiftId}`)?.scrollIntoView({
                behavior: 'smooth',
                block: 'start',
            });
        }, 120);
        return () => window.clearTimeout(timeout);
    }, [routeShiftId, routeSlotId, shifts]);
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
            console.error(err);
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
                ...(offerIds.length > 0 ? { offer_ids: offerIds } : {}),
            });
            if (res?.url) {
                window.location.href = res.url;
            } else if (res?.free) {
                showSnackbar(res?.message || 'Shift finalized without payment.');
                await loadShifts();
            } else {
                showSnackbar('Payment session was not returned.');
            }
        } catch (err) {
            console.error(err);
            showSnackbar('Failed to initiate payment.');
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

    React.useEffect(() => {
        try {
            const raw = localStorage.getItem(seenStorageKey);
            const parsed = raw ? JSON.parse(raw) : {};
            if (parsed && typeof parsed === 'object') {
                setSeenSlotSignatures(parsed);
            } else {
                setSeenSlotSignatures({});
            }
        } catch {
            setSeenSlotSignatures({});
        } finally {
            setSlotSeenReady(true);
        }
    }, [seenStorageKey]);

    React.useEffect(() => {
        if (!slotSeenReady) return;
        try {
            localStorage.setItem(seenStorageKey, JSON.stringify(seenSlotSignatures));
        } catch {
            // ignore persistence failures
        }
    }, [seenSlotSignatures, seenStorageKey, slotSeenReady]);

    React.useEffect(() => {
        const onShiftSlotActivity = (evt: Event) => {
            const customEvt = evt as CustomEvent<any>;
            const notification = customEvt?.detail;
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
        };

        window.addEventListener('shift-slot-activity', onShiftSlotActivity as EventListener);
        return () => {
            window.removeEventListener('shift-slot-activity', onShiftSlotActivity as EventListener);
        };
    }, [markShiftSlotsUpdated]);

    const getOfferSlotIds = useCallback((offer: any): number[] => {
        const offerSlots = offer?.slots || offer?.offer_slots || [];
        return offerSlots
            .map((s: any) => s.slot_id ?? s.slotId ?? s.slot?.id ?? null)
            .filter((id: any) => id != null);
    }, []);

    // Handle reveal interest
    const handleRevealInterest = useCallback(async (shift: Shift, interest: ShiftInterest) => {
        const levelKey = selectedLevelByShift[shift.id] ?? PUBLIC_LEVEL_KEY;

        resetWorkerRatings();
        let revealedUser: any = null;

        // Reveal if not already revealed
        if (!interest.revealed) {
            try {
                revealedUser = await revealInterest(shift, interest, levelKey);


                // Update counter offer cache if they have an offer
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
            // Already revealed, use existing user data
            revealedUser = interest.user || (interest as any).user_detail;
        }



        // Build candidate object - handle case where user is just a string
        const userObj = (typeof revealedUser === 'object' && revealedUser)
            ? revealedUser
            : (typeof interest.user === 'object' && interest.user)
                ? interest.user
                : (interest as any).user_detail;

        const interestAny = interest as any;

        const candidate = {
            userId: interest.userId ?? userObj?.id ?? null,
            name:
                // Try object properties first
                (userObj?.firstName && userObj?.lastName)
                    ? `${userObj.firstName} ${userObj.lastName}`
                    : (userObj?.first_name && userObj?.last_name)
                        ? `${userObj.first_name} ${userObj.last_name}`
                        : userObj?.name || userObj?.displayName || userObj?.display_name
                        // Fall back to string fields
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

        // Load ratings
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

        // Open dialog (no counter offer, just showing interest)
        setReviewOfferDialog({
            open: true,
            shiftId: shift.id,
            offer: null,
            candidate,
            slotId: interest.slotId ?? null,
        });
    }, [revealInterest, selectedLevelByShift, counterOffersByShift, updateOfferCache, resetWorkerRatings, loadWorkerRatings, showSnackbar, loadCounterOffers]);

    // Handle review offer dialog
    const handleReviewOffer = useCallback(
        async (shift: Shift, offer: any, tabData: any, slotId: number | null) => {
            resetWorkerRatings();

            // Find the interest for this offer
            const interest = findInterestForOffer(offer, tabData, slotId);

            let revealedUser: any = null;

            // Reveal if necessary
            if (interest && !interest.revealed) {
                try {
                    const levelKey = selectedLevelByShift[shift.id] ?? PUBLIC_LEVEL_KEY;
                    revealedUser = await revealInterest(shift, interest, levelKey);

                    // Update offer cache
                    if (revealedUser) {
                        updateOfferCache(shift.id, offer.id, revealedUser);
                    }

                    await loadCounterOffers(shift.id); // Refresh to get user_detail
                } catch (error) {
                    console.error('Failed to reveal offer candidate', error);
                }
            }

            // Build candidate object
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

            // Load ratings
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

            console.log('[ActiveShifts] Review offer slot resolution', {
                shiftId: shift.id,
                offerId: offer?.id,
                slotId,
                offerSlotIds,
                resolvedSlotId,
            });

            // Map slots
            const mappedSlots = mapOfferSlotsWithShift(offer, shift, resolvedSlotId);

            // Open dialog
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
        ]
    );

    // Handle review candidate (community level)
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

            // Load ratings
            if (member.userId != null) {
                try {
                    await loadWorkerRatings(member.userId, 1);
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

            console.log('[ActiveShifts] Review candidate slot resolution', {
                shiftId: shift.id,
                offerId: offer?.id,
                slotId,
                offerSlotIds,
                resolvedSlotId,
            });

            // Map slots if offer exists
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

    // Handle accept/reject counter offer
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
            console.log('[ActiveShifts] Accept counter offer payload', {
                shiftId,
                offerId: offer?.id,
                slotId,
                offerSlotIds,
                resolvedSlotId,
                requiresSlot,
            });
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
                        ? {
                            ...prev.candidate,
                            pendingConfirmation: true,
                            pendingOfferId: offerId ?? prev.candidate.pendingOfferId,
                        }
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
                        if (Array.isArray(updated.interestsAll)) {
                            updated.interestsAll = updated.interestsAll.map(patchRecord);
                        }
                        if (updated.interestsBySlot) {
                            updated.interestsBySlot = Object.fromEntries(
                                Object.entries(updated.interestsBySlot).map(([sid, list]) => [
                                    sid,
                                    Array.isArray(list) ? list.map(patchRecord) : list,
                                ])
                            );
                        }
                        if (Array.isArray(updated.members)) {
                            updated.members = updated.members.map(patchRecord);
                        }
                        if (updated.membersBySlot) {
                            updated.membersBySlot = Object.fromEntries(
                                Object.entries(updated.membersBySlot).map(([sid, list]) => [
                                    sid,
                                    Array.isArray(list) ? list.map(patchRecord) : list,
                                ])
                            );
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
                setBuzzDialog({
                    open: true,
                    message: result?.detail || "Reminder sent. We've gently nudged the candidate to confirm this shift.",
                });
            } catch (error) {
                console.error('Failed to send confirmation reminder', error);
                const message =
                    (error as any)?.response?.data?.detail ||
                    (error as any)?.data?.detail ||
                    (error as any)?.message ||
                    'Failed to send confirmation reminder';
                setBuzzDialog({ open: true, message });
                await loadShifts();
            } finally {
                setBuzzLoadingOfferId(null);
            }
        },
        [loadShifts]
    );

    // Toggle shift expansion
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

    // Handle level change
    const handleLevelChange = useCallback(
        (shift: Shift, newLevel: EscalationLevelKey) => {
            const currentLevelKey = getCurrentLevelKey(shift);
            const viewableLevels = deriveLevelSequence(
                currentLevelKey,
                (shift as any).allowedEscalationLevels,
            );
            if (!viewableLevels.includes(newLevel as CustomEscalationLevelKey)) {
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

    // Handle slot selection
    const handleSlotSelection = useCallback((shiftId: number, slotId: number) => {
        setSelectedSlotByShift(prev => ({ ...prev, [shiftId]: slotId }));
        markSlotSeen(shiftId, slotId);
    }, [markSlotSeen]);

    const handleEditShift = useCallback((shiftId: number) => {
        const baseRoute =
            scopedPharmacyId != null
                ? `/dashboard/admin/${scopedPharmacyId}/post-shift`
                : user?.role?.startsWith('ORG_')
                    ? '/dashboard/organization/post-shift'
                    : '/dashboard/owner/post-shift';
        navigate(`${baseRoute}?edit=${shiftId}`);
    }, [navigate, scopedPharmacyId, user?.role]);

    const isDedicatedShift = useCallback((shift: Shift) => {
        const shiftAny = shift as any;
        return Boolean(shiftAny.dedicatedUser ?? shiftAny.dedicated_user);
    }, []);

    // Load counter offers for summary counts and expanded slot activity.
    React.useEffect(() => {
        shifts.forEach((shift) => {
            if (Object.prototype.hasOwnProperty.call(counterOffersByShift, shift.id)) return;
            if (counterOffersLoadingByShift[shift.id]) return;
            loadCounterOffers(shift.id);
        });
    }, [shifts, counterOffersByShift, counterOffersLoadingByShift, loadCounterOffers]);

    React.useEffect(() => {
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
    const pageCount = Math.ceil(orderedShifts.length / itemsPerPage);
    const visibleShifts = useMemo(
        () => orderedShifts.slice((page - 1) * itemsPerPage, page * itemsPerPage),
        [orderedShifts, page]
    );

    React.useEffect(() => {
        if (pageCount > 0 && page > pageCount) {
            setPage(pageCount);
        }
    }, [page, pageCount]);

    if (shiftsLoading) {
        return (
            <Container maxWidth="xl" sx={{ py: 4, overflowX: 'hidden' }}>
                <Box display="flex" justifyContent="center" alignItems="center" minHeight="50vh">
                    <CircularProgress />
                </Box>
            </Container>
        );
    }

    return (
        <ThemeProvider theme={customTheme}>
            <Container maxWidth="xl" sx={{ py: 4, overflowX: 'hidden' }}>
                <Box sx={{ mb: 3 }}>
                    <Typography variant="h4" fontWeight={900} sx={{ color: '#111827', letterSpacing: '-0.03em' }}>
                        {title}
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, fontWeight: 600 }}>
                        Manage and track your live shifts
                    </Typography>
                </Box>

                {shifts.length === 0 ? (
                    <Typography variant="body1" color="text.secondary">
                        No active shifts found.
                    </Typography>
                ) : (
                    <Stack spacing={2.5}>
                        {visibleShifts.map((shift, idx) => {
                            const absoluteIdx = (page - 1) * itemsPerPage + idx;
                            const isDedicated = isDedicatedShift(shift);
                            const prev = absoluteIdx > 0 ? orderedShifts[absoluteIdx - 1] : null;
                            const showSectionHeader =
                                isDedicated && (idx === 0 || (prev && isDedicatedShift(prev) !== isDedicated));
                            return (
                                <React.Fragment key={shift.id}>
                                    {showSectionHeader && (
                                        <Box sx={{ px: 1, pt: idx === 0 ? 0 : 2 }}>
                                            <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 900, letterSpacing: 1 }}>
                                                {isDedicated ? 'Direct / Private Offers' : 'Active Shifts'}
                                            </Typography>
                                        </Box>
                                    )}
                                    <ActiveShiftCard
                                    key={shift.id}
                                    shift={shift}
                                    dedicated={isDedicated}
                                    isDarkMode={isDarkMode}
                                    data={{
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
                                </React.Fragment>
                            );
                        })}
                        {pageCount > 1 && (
                            <Box display="flex" justifyContent="center" mt={1}>
                                <Pagination
                                    count={pageCount}
                                    page={page}
                                    onChange={(_, value) => {
                                        setPage(value);
                                        window.scrollTo({ top: 0, behavior: 'smooth' });
                                    }}
                                    color="primary"
                                />
                            </Box>
                        )}
                    </Stack>
                )}

                {/* Dialogs */}
                <DeleteConfirmDialog
                    open={deleteConfirmDialog.open}
                    loading={deleteConfirmDialog.shiftId ? actionLoading[`delete_${deleteConfirmDialog.shiftId}`] ?? false : false}
                    onClose={() => setDeleteConfirmDialog({ open: false, shiftId: null })}
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
                    open={reviewOfferDialog.open}
                    offer={reviewOfferDialog.offer}
                    candidate={reviewOfferDialog.candidate}
                    slotId={reviewOfferDialog.slotId}
                    assignLabel={
                        reviewOfferDialog.slotId != null
                            ? 'Assign to Slot'
                            : 'Assign to Shift'
                    }
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
                    onClose={() => setReviewOfferDialog({ open: false, shiftId: null, offer: null, candidate: null, slotId: null })}
                    onAccept={(offer) => handleAcceptOffer(offer, reviewOfferDialog.shiftId, reviewOfferDialog.slotId)}
                    onReject={(offer) => handleRejectOffer(offer, reviewOfferDialog.shiftId)}
                    onAssign={(userId, slotId) => handleAssignCandidate(userId, reviewOfferDialog.shiftId, slotId)}
                    onPageChange={(_, value) => {
                        if (reviewOfferDialog.candidate) {
                            // Re-load ratings for the new page
                            const userId = (reviewOfferDialog.offer?.user as any)?.id ?? reviewOfferDialog.candidate?.userId;
                            if (userId) {
                                loadWorkerRatings(userId, value);
                            }
                        }
                    }}
                />

                <Snackbar
                    open={snackbarOpen}
                    autoHideDuration={4000}
                    onClose={() => setSnackbarOpen(false)}
                    message={snackbarMessage}
                    action={
                        <IconButton size="small" color="inherit" onClick={() => setSnackbarOpen(false)}>
                            <X />
                        </IconButton>
                    }
                />
                <Dialog
                    open={buzzDialog.open}
                    onClose={() => setBuzzDialog({ open: false, message: '' })}
                    fullWidth
                    maxWidth="xs"
                >
                    <DialogTitle sx={{ fontWeight: 900 }}>Buzz reminder</DialogTitle>
                    <DialogContent>
                        <Typography sx={{ color: 'text.secondary', lineHeight: 1.6 }}>
                            {buzzDialog.message}
                        </Typography>
                    </DialogContent>
                    <DialogActions>
                        <Button
                            variant="contained"
                            onClick={() => setBuzzDialog({ open: false, message: '' })}
                            sx={{
                                bgcolor: '#E0AA3E',
                                color: '#111827',
                                fontWeight: 900,
                                '&:hover': { bgcolor: '#B88A44' },
                            }}
                        >
                            Close
                        </Button>
                    </DialogActions>
                </Dialog>
            </Container>
        </ThemeProvider>
    );
};

export default ActiveShiftsPage;
