import React, { useState, useCallback, useMemo } from 'react';
import {
    Container,
    Typography,
    Box,
    CircularProgress,
    Snackbar,
    IconButton,
    Button,
    Card,
    CardContent,
    CardHeader,
    Stack,
    Chip,
    Tooltip,
    ThemeProvider,
    Divider,
    Pagination,
    alpha,
    useTheme,
} from '@mui/material';
import {
    Close as X,
    Edit,
    Delete as Trash2,
    Share as Share2,
    Business as Building,
    CalendarToday as CalendarDays,
    FavoriteBorder,
    Groups,
    LocationOn,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
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
import { EscalationStepper } from './components/Escalation/EscalationStepper';

import { PublicLevelView } from './components/Candidates/PublicLevelView';
import { CommunityLevelView } from './components/Candidates/CommunityLevelView';

// Utils
import {
    PUBLIC_LEVEL_KEY,
    CustomEscalationLevelKey,
    getCurrentLevelKey,
    getShiftSummary,
    deriveLevelSequence,
} from './utils/shiftHelpers';
import { dedupeMembers, findInterestForOffer } from './utils/candidateHelpers';
import { mapOfferSlotsWithShift } from './utils/offerHelpers';
import { getCardBorderColor, getLocationText } from './utils/displayHelpers';

// Types
import {
    ReviewOfferDialogState,
    DeleteConfirmDialogState,
} from './types';

// Theme
import { customTheme } from './theme';

const ACTIVE_SHIFT_SLOT_SEEN_KEY_PREFIX = 'active_shift_slot_seen_v2';

const toFiniteNumber = (raw: any): number | null => {
    if (raw == null) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
};

const resolveSlotId = (slot: any): number | null => {
    const raw = slot?.id ?? slot?.slotId ?? slot?.slot_id ?? null;
    return toFiniteNumber(raw);
};

const getSlotIds = (shift: Shift): number[] => {
    const slots = (shift as any).slots || [];
    return slots
        .map((slot: any) => resolveSlotId(slot))
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
        return offerSlots.some((s: any) => resolveSlotId(s?.slot) === slotId || resolveSlotId(s) === slotId);
    }
    const fallbackSlotId = resolveSlotId(offer?.slot) ?? toFiniteNumber(offer?.slot_id ?? offer?.slotId);
    if (fallbackSlotId == null) return false;
    return fallbackSlotId === slotId;
};

const interestBelongsToSlot = (interest: any, slotId: number) => {
    const explicitSlotId = resolveSlotId(interest?.slot) ?? toFiniteNumber(interest?.slot_id ?? interest?.slotId);
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
    const navigate = useNavigate();
    const outerTheme = useTheme();
    const isDarkMode = outerTheme.palette.mode === 'dark';
    const { user, activePersona, activeAdminPharmacyId } = useAuth();
    const selectedPharmacyId = null; // TODO: Get from proper context
    const scopedPharmacyId =
        activePersona === 'admin' && typeof activeAdminPharmacyId === 'number'
            ? activeAdminPharmacyId
            : null;

    // Snackbar
    const [snackbarOpen, setSnackbarOpen] = useState(false);
    const [snackbarMessage, setSnackbarMessage] = useState('');
    const [pillPayingShiftId, setPillPayingShiftId] = useState<number | null>(null);
    const itemsPerPage = 6;
    const [page, setPage] = useState(1);

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
                console.error('Failed to load worker ratings', error);
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
                    await loadTabDataForShift(shift.id, levelKey);
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
            };

            // Load ratings
            if (member.userId != null) {
                try {
                    await loadWorkerRatings(member.userId, 1);
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

            console.log('[ActiveShifts] Review candidate slot resolution', {
                shiftId: shift.id,
                offerId: offer?.id,
                slotId,
                offerSlotIds,
                resolvedSlotId,
            });

            // Map slots if offer exists
            const mappedSlots = offer ? mapOfferSlotsWithShift(offer, shift, resolvedSlotId) : [];

            setReviewOfferDialog({
                open: true,
                shiftId: shift.id,
                offer: offer ? { ...offer, _mappedSlots: mappedSlots } : null,
                candidate,
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

    const renderShiftCard = (shift: Shift, dedicated: boolean) => {
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
        const communityDataLoading = communityLevelKeys.some((_level, index) => {
            const data = communityTabData[index];
            return !data || data.loading;
        });
        const selectedSlotId = isSingleUserShift
            ? null
            : selectedSlotByShift[shift.id] ?? shift.slots?.[0]?.id ?? null;
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
        const labelOverrides = undefined;
        const roleNeeded = (shift as any).roleNeeded ?? (shift as any).role_needed;
        const employmentType = (shift as any).employmentType ?? (shift as any).employment_type;
        const isUrgent = Boolean((shift as any).isUrgent ?? (shift as any).is_urgent);
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
        const metricItems = [
            { label: 'Slots', value: slotsCount || '-', icon: <CalendarDays fontSize="small" /> },
            { label: 'Candidates', value: candidatesCount, icon: <Groups fontSize="small" /> },
            { label: 'Interests', value: interestsCount, icon: <FavoriteBorder fontSize="small" /> },
        ];
        const headerActions = (
            <Box
                onClick={(event) => event.stopPropagation()}
                sx={{ display: 'flex', gap: 0.5, alignItems: 'center', justifyContent: 'flex-end' }}
            >
                <Tooltip title="Share">
                    <span>
                        <IconButton
                            size="small"
                            sx={{
                                color: isDarkMode ? alpha('#FFFFFF', 0.86) : '#475569',
                                bgcolor: isDarkMode ? alpha('#FFFFFF', 0.08) : 'transparent',
                                border: isDarkMode ? `1px solid ${alpha('#FFFFFF', 0.12)}` : '1px solid transparent',
                                '&:hover': {
                                    bgcolor: isDarkMode ? alpha('#8B5CF6', 0.22) : alpha('#8B5CF6', 0.08),
                                    color: isDarkMode ? '#FFFFFF' : '#6D28D9',
                                },
                                '&.Mui-disabled': {
                                    color: isDarkMode ? alpha('#FFFFFF', 0.28) : undefined,
                                },
                            }}
                            onClick={e => {
                                e.stopPropagation();
                                handleShare(shift);
                            }}
                            disabled={sharingShiftId === shift.id}
                        >
                            <Share2 fontSize="small" />
                        </IconButton>
                    </span>
                </Tooltip>
                <Tooltip title="Edit">
                    <IconButton
                        size="small"
                        sx={{
                            color: isDarkMode ? alpha('#FFFFFF', 0.86) : '#475569',
                            bgcolor: isDarkMode ? alpha('#FFFFFF', 0.08) : 'transparent',
                            border: isDarkMode ? `1px solid ${alpha('#FFFFFF', 0.12)}` : '1px solid transparent',
                            '&:hover': {
                                bgcolor: isDarkMode ? alpha('#8B5CF6', 0.22) : alpha('#8B5CF6', 0.08),
                                color: isDarkMode ? '#FFFFFF' : '#6D28D9',
                            },
                        }}
                        onClick={e => {
                            e.stopPropagation();
                            handleEditShift(shift.id);
                        }}
                    >
                        <Edit fontSize="small" />
                    </IconButton>
                </Tooltip>
                <Tooltip title="Delete">
                    <IconButton
                        size="small"
                        sx={{
                            color: isDarkMode ? alpha('#FFFFFF', 0.86) : '#475569',
                            bgcolor: isDarkMode ? alpha('#FFFFFF', 0.08) : 'transparent',
                            border: isDarkMode ? `1px solid ${alpha('#FFFFFF', 0.12)}` : '1px solid transparent',
                            '&:hover': {
                                bgcolor: isDarkMode ? alpha('#EF4444', 0.2) : alpha('#EF4444', 0.08),
                                color: isDarkMode ? '#FCA5A5' : '#DC2626',
                            },
                            '&.Mui-disabled': {
                                color: isDarkMode ? alpha('#FFFFFF', 0.28) : undefined,
                            },
                        }}
                        onClick={e => {
                            e.stopPropagation();
                            setDeleteConfirmDialog({ open: true, shiftId: shift.id });
                        }}
                        disabled={actionLoading[`delete_${shift.id}`]}
                    >
                        <Trash2 fontSize="small" />
                    </IconButton>
                </Tooltip>
            </Box>
        );

        return (
            <Card
                key={shift.id}
                onClick={() => toggleShiftExpansion(shift.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        toggleShiftExpansion(shift.id);
                    }
                }}
                sx={{
                    position: 'relative',
                    overflow: 'hidden',
                    maxWidth: '100%',
                    borderRadius: 6,
                    border: '1px solid #D9E2F2',
                    background: 'linear-gradient(180deg, #F6FBFF 0%, #F8FAFC 46%, #FFFFFF 100%)',
                    boxShadow: '0 24px 60px rgba(15, 23, 42, 0.08)',
                    cursor: 'pointer',
                    transition: 'border-color 0.2s, box-shadow 0.2s, transform 0.2s',
                    '&:hover': {
                        transform: 'translateY(-1px)',
                        borderColor: '#C7D2FE',
                        boxShadow: '0 28px 66px rgba(15, 23, 42, 0.10)',
                    },
                    '&:focus-visible': {
                        outline: '3px solid rgba(124,58,237,.28)',
                        outlineOffset: 3,
                    },
                    '&:before': {
                        content: '""',
                        position: 'absolute',
                        inset: 0,
                        pointerEvents: 'none',
                        background: 'radial-gradient(circle at top right, rgba(37,99,235,.10), transparent 32%), radial-gradient(circle at top left, rgba(124,58,237,.10), transparent 28%)',
                    },
                }}
            >
                <CardHeader
                    disableTypography
                    sx={{ px: { xs: 2, md: 3 }, pt: { xs: 2, md: 3 }, pb: 1.5, minWidth: 0, position: 'relative' }}
                    title={
                        <Stack direction={{ xs: 'column', xl: 'row' }} spacing={{ xs: 1.5, md: 2 }} justifyContent="space-between" alignItems={{ xs: 'stretch', xl: 'flex-start' }} sx={{ width: '100%', minWidth: 0 }}>
                            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={{ xs: 1.25, sm: 2 }} sx={{ minWidth: 0, width: { xs: '100%', xl: 'auto' }, maxWidth: { xl: '52%' } }}>
                                <Box
                                    sx={{
                                        width: { xs: 54, sm: 58 },
                                        height: { xs: 54, sm: 58 },
                                        flexShrink: 0,
                                        display: 'grid',
                                        placeItems: 'center',
                                        borderRadius: 3.5,
                                        color: '#fff',
                                        background: 'linear-gradient(135deg, #5EEAD4 0%, #7C3AED 100%)',
                                        boxShadow: '0 18px 40px rgba(124,58,237,.24)',
                                    }}
                                >
                                    <Building />
                                </Box>
                                <Box sx={{ minWidth: 0 }}>
                                    <Typography variant="h6" component="div" sx={{ fontWeight: 900, color: '#111827', fontSize: { xs: 21, sm: 24 }, lineHeight: 1.18, overflowWrap: 'anywhere' }}>
                                        {(shift as any).pharmacyDetail?.name ?? "Unnamed Pharmacy"}
                                    </Typography>
                                    <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ mt: 1 }}>
                                        {roleNeeded && (
                                            <Chip label={roleNeeded} size="small" sx={{ bgcolor: cardBorderColor, color: '#fff', fontWeight: 800 }} />
                                        )}
                                        {employmentType && (
                                            <Chip label={employmentType} size="small" sx={{ bgcolor: '#F8FAFC', border: '1px solid #E5E7EB', fontWeight: 700 }} />
                                        )}
                                        {isUrgent && <Chip label="Urgent" color="error" size="small" sx={{ fontWeight: 800 }} />}
                                        {summaryText && (
                                            <Chip
                                                icon={<CalendarDays sx={{ fontSize: 15 }} />}
                                                label={summaryText}
                                                size="small"
                                                variant="outlined"
                                                sx={{ color: '#475569', fontWeight: 600 }}
                                            />
                                        )}
                                        {showPaymentRequired && (
                                            <Chip label="Payment Required" color="error" size="small" sx={{ fontWeight: 800 }} />
                                        )}
                                    </Stack>
                                </Box>
                            </Stack>
                            <Stack sx={{ ml: { xl: 'auto' }, width: '100%', maxWidth: { xs: '100%', xl: 520 }, alignItems: { xs: 'stretch', xl: 'flex-end' }, minWidth: 0 }}>
                                {headerActions}
                                <Box
                                    sx={{
                                        display: 'grid',
                                        gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                                        gap: { xs: 0.75, sm: 1.25 },
                                        width: '100%',
                                        mt: 1.25,
                                    }}
                                >
                                    {metricItems.map((item) => (
                                        <Box
                                            key={item.label}
                                            sx={{
                                                borderRadius: 3,
                                                border: `1px solid ${isDarkMode ? alpha('#FFFFFF', 0.14) : '#D9E2F2'}`,
                                                background: isDarkMode ? alpha('#FFFFFF', 0.075) : '#FFFFFFCC',
                                                minWidth: 0,
                                                width: '100%',
                                                px: { xs: 1.25, sm: 2 },
                                                py: { xs: 1.25, sm: 1.75 },
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                gap: { xs: 0.75, sm: 1.25 },
                                                boxShadow: isDarkMode
                                                    ? `0 12px 28px ${alpha('#000000', 0.16)}`
                                                    : '0 12px 24px rgba(15,23,42,.05)',
                                            }}
                                        >
                                            <Box
                                                sx={{
                                                    width: { xs: 30, sm: 36 },
                                                    height: { xs: 30, sm: 36 },
                                                    borderRadius: '50%',
                                                    bgcolor: isDarkMode ? alpha('#A78BFA', 0.18) : '#F3E8FF',
                                                    color: isDarkMode ? '#C4B5FD' : '#7C3AED',
                                                    display: 'grid',
                                                    placeItems: 'center',
                                                    flexShrink: 0,
                                                    '& svg': { fontSize: { xs: 18, sm: 20 } },
                                                }}
                                            >
                                                {item.icon}
                                            </Box>
                                            <Box sx={{ minWidth: 0, textAlign: 'center' }}>
                                                <Typography sx={{ fontWeight: 800, color: isDarkMode ? '#F8FAFC' : '#0F172A', lineHeight: 1.05, fontSize: { xs: '1.2rem', sm: '1.5rem' } }}>
                                                    {item.value}
                                                </Typography>
                                                <Typography
                                                    variant="caption"
                                                    sx={{
                                                        color: isDarkMode ? alpha('#FFFFFF', 0.72) : '#64748B',
                                                        textTransform: 'uppercase',
                                                        letterSpacing: { xs: 0.2, sm: 0.6 },
                                                        fontSize: { xs: '0.62rem', sm: '0.75rem' },
                                                        fontWeight: 400,
                                                    }}
                                                >
                                                    {item.label}
                                                </Typography>
                                            </Box>
                                        </Box>
                                    ))}
                                </Box>
                            </Stack>
                        </Stack>
                    }
                />
                <CardContent sx={{ px: { xs: 2, md: 3 }, pt: 0, minWidth: 0, position: 'relative' }}>
                    <Box
                        sx={{
                            display: 'flex',
                            gap: 1,
                            alignItems: 'center',
                            mb: 2,
                            color: isDarkMode ? alpha('#FFFFFF', 0.66) : '#64748B',
                        }}
                    >
                        <LocationOn sx={{ fontSize: 17 }} />
                        <Typography variant="body2" sx={{ color: 'inherit' }}>
                            {location}
                        </Typography>
                    </Box>

                    {dedicated && (
                        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', mb: 2 }}>
                            <Chip label="Direct / Private" color="info" size="small" />
                            <Chip label="Pending" variant="outlined" size="small" />
                        </Box>
                    )}

                    {isExpanded && (
                        <Box
                            onClick={(event) => event.stopPropagation()}
                            onKeyDown={(event) => event.stopPropagation()}
                        >
                            <Divider sx={{ my: 2.5 }} />

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
                                showPrivateFirst={dedicated}
                            />

                            {showPaymentRequired && (
                                <Box sx={{ mt: 3, p: 2.5, bgcolor: '#FEF2F2', borderRadius: 2, border: '1px solid #FCA5A5' }}>
                                    <Typography variant="h6" color="error.main" gutterBottom>
                                        Payment Required
                                    </Typography>
                                    <Typography variant="body2" sx={{ mb: 2 }}>
                                        A candidate has accepted the shift, but payment is required to finalize the assignment.
                                    </Typography>
                                    <Box sx={{ display: 'flex', justifyContent: 'center', gap: 1, flexWrap: 'wrap' }}>
                                        <Button
                                            variant="contained"
                                            color="error"
                                            onClick={async (e) => {
                                                e.stopPropagation();
                                                try {
                                                    const payload = !isSingleUserShift && slotsCount > 1 && selectedSlotId != null
                                                        ? { slot_id: selectedSlotId }
                                                        : {};
                                                    const { data: res } = await apiClient.post(`/billing/charge-fulfillment/${shift.id}/`, payload);
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
                                            }}
                                        >
                                            Pay with Stripe
                                        </Button>
                                        <Button
                                            variant="contained"
                                            disabled={pillPayingShiftId === shift.id}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                void handlePayWithPills(shift, !isSingleUserShift && slotsCount > 1 ? selectedSlotId : null);
                                            }}
                                        >
                                            {pillPayingShiftId === shift.id ? 'Paying...' : 'Pay with Pills'}
                                        </Button>
                                    </Box>
                                </Box>
                            )}

                            <Divider sx={{ my: 2.5 }} />

                            {currentTabData.loading ? (
                                <Box sx={{ py: 4, display: 'flex', justifyContent: 'center' }}>
                                    <CircularProgress />
                                </Box>
                            ) : selectedLevel === PUBLIC_LEVEL_KEY ? (
                                counterOffersLoading || !counterOffersLoaded ? (
                                    <Box sx={{ py: 4, display: 'flex', justifyContent: 'center' }}>
                                        <CircularProgress />
                                    </Box>
                                ) : (
                                    <PublicLevelView
                                        shift={shift}
                                        slotId={selectedSlotId}
                                        slotHasUpdates={slotHasUpdatesByShift[shift.id] || {}}
                                        slotCandidateCounts={slotCandidateCounts}
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
                                )
                            ) : (
                                communityDataLoading ? (
                                    <Box sx={{ py: 4, display: 'flex', justifyContent: 'center' }}>
                                        <CircularProgress />
                                    </Box>
                                ) : (
                                    <CommunityLevelView
                                        shift={shift}
                                        members={membersForView}
                                        selectedSlotId={selectedSlotId}
                                        slotHasUpdates={slotHasUpdatesByShift[shift.id] || {}}
                                        slotCandidateCounts={slotCandidateCounts}
                                        offers={offers || []}
                                        onSelectSlot={(slotId) => handleSlotSelection(shift.id, slotId)}
                                        onReviewCandidate={(member, _shiftId, offer, slotId) =>
                                            handleReviewCandidate(shift, member, offer, slotId)
                                        }
                                        reviewLoadingId={reviewLoadingId}
                                    />
                                )
                            )}
                            {selectedLevel === PUBLIC_LEVEL_KEY && (
                                <Box sx={{ mt: 2.5 }}>
                                    {communityDataLoading ? (
                                        <Box sx={{ py: 4, display: 'flex', justifyContent: 'center' }}>
                                            <CircularProgress />
                                        </Box>
                                    ) : (
                                        <CommunityLevelView
                                            shift={shift}
                                            members={membersForView}
                                            selectedSlotId={selectedSlotId}
                                            slotHasUpdates={slotHasUpdatesByShift[shift.id] || {}}
                                            slotCandidateCounts={slotCandidateCounts}
                                            offers={offers || []}
                                            showSlotSelector={false}
                                            onSelectSlot={(slotId) => handleSlotSelection(shift.id, slotId)}
                                            onReviewCandidate={(member, _shiftId, offer, slotId) =>
                                                handleReviewCandidate(shift, member, offer, slotId)
                                            }
                                            reviewLoadingId={reviewLoadingId}
                                        />
                                    )}
                                </Box>
                            )}
                        </Box>
                    )}
                </CardContent>
            </Card>
        );
    };

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
                                    {renderShiftCard(shift, isDedicated)}
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
            </Container>
        </ThemeProvider>
    );
};

export default ActiveShiftsPage;
