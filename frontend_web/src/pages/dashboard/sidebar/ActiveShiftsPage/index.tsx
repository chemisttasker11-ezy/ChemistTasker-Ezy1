import React, { useState, useCallback, useMemo } from 'react';
import {
    Container,
    Typography,
    Snackbar,
    IconButton,
    useTheme,
} from '@mui/material';
import {
    Close as X,
} from '@mui/icons-material';
import { visuallyHidden } from '@mui/utils';
import { useLocation, useNavigate } from 'react-router-dom';
import {
    Shift,
    EscalationLevelKey,
} from '@chemisttasker/shared-core';
import { useAuth } from '../../../../contexts/AuthContext';

// Hooks
import ActiveShiftsList from './ActiveShiftsList';
import ActiveShiftsDialogs from './ActiveShiftsDialogs';
import { useShiftSlotAttention } from './hooks/useShiftSlotAttention';
import { useOfferDecisions } from './hooks/useOfferDecisions';
import { useShiftPaymentActions } from './hooks/useShiftPaymentActions';
import { useCandidateReview } from './hooks/useCandidateReview';
import { useShiftsData } from './hooks/useShiftsData';
import { useTabData } from './hooks/useTabData';
import { useCounterOffers } from './hooks/useCounterOffers';
import { useRevealInterest } from './hooks/useRevealInterest';
import { useShiftActions } from './hooks/useShiftActions';
import { useShareShift } from './hooks/useShareShift';

// Utils
import {
    CustomEscalationLevelKey,
    getCurrentLevelKey,
    deriveLevelSequence,
} from './utils/shiftHelpers';

// Types
import {
    DeleteConfirmDialogState,
} from './types';

// Theme

import {
    toFiniteNumber,
    resolveSlotId,
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

    const showSnackbar = useCallback((msg: string) => {
        setSnackbarMessage(msg);
        setSnackbarOpen(true);
    }, []);

    // Escalation level tracking
    const [selectedLevelByShift, setSelectedLevelByShift] = useState<Record<number, EscalationLevelKey>>({});
    const [selectedSlotByShift, setSelectedSlotByShift] = useState<Record<number, number>>({});
    const reviewLoadingId: number | null = null;

    // Dialogs
    const [deleteConfirmDialog, setDeleteConfirmDialog] = useState<DeleteConfirmDialogState>({
        open: false,
        shiftId: null,
    });
    // Expanded shifts tracking
    const [expandedShifts, setExpandedShifts] = useState<Set<number>>(new Set());

    // Tab key generator
    const getTabKey = useCallback((shiftId: number, levelKey: EscalationLevelKey) => {
        return `${shiftId}_${levelKey}`;
    }, []);
    // Data hooks
    const { shifts, setShifts, loading: shiftsLoading, error: shiftsError, loadShifts } = useShiftsData({ shiftId: routeShiftId });
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
    const { pillPayingShiftId, paymentSlotSelection, setPaymentSlotSelection,
        handlePayWithPills, handlePayWithStripe } = useShiftPaymentActions(loadShifts, showSnackbar);
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
    const { actionLoading, handleEscalate, handleDelete, handleAccept } = useShiftActions(setShifts, showSnackbar);
    const { sharingShiftId, handleShare } = useShareShift(showSnackbar);

    const { slotHasUpdatesByShift, markSlotSeen } = useShiftSlotAttention({ userId: user?.id,
        shifts, selectedLevelByShift, tabData, counterOffersByShift, getTabKey });
    const review = useCandidateReview({ selectedLevelByShift, tabData, getTabKey, loadTabDataForShift, counterOffersByShift, updateOfferCache, loadCounterOffers, revealInterest, showSnackbar });
    const { setReviewOfferDialog, handleRevealInterest, handleReviewOffer, handleReviewCandidate } = review;

    const decisions = useOfferDecisions({ shifts, selectedLevelByShift, setTabData, loadTabDataForShift, loadShifts, loadCounterOffers, acceptOffer, rejectOffer, handleAccept, setReviewOfferDialog, showSnackbar });
    const { handleBuzzWorker,
        buzzLoadingOfferId } = decisions;

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

    // Handle slot selection
    const handleSlotSelection = useCallback((shiftId: number, slotId: number) => {
        setSelectedSlotByShift(prev => ({ ...prev, [shiftId]: slotId }));
        markSlotSeen(shiftId, slotId);
    }, [markSlotSeen]);

    const postShiftRoute =
        scopedPharmacyId != null
            ? `/dashboard/admin/${scopedPharmacyId}/post-shift`
            : user?.role?.startsWith('ORG_')
                ? '/dashboard/organization/post-shift'
                : '/dashboard/owner/post-shift';

    const handleEditShift = useCallback((shiftId: number) => {
        navigate(`${postShiftRoute}?edit=${shiftId}`);
    }, [navigate, postShiftRoute]);

    const handlePostShift = useCallback(() => navigate(postShiftRoute), [navigate, postShiftRoute]);

    React.useEffect(() => {
        shifts.forEach((shift) => {
            if (Object.prototype.hasOwnProperty.call(counterOffersByShift, shift.id)) return;
            if (counterOffersLoadingByShift[shift.id]) return;
            loadCounterOffers(shift.id);
        });
    }, [shifts, counterOffersByShift, counterOffersLoadingByShift, loadCounterOffers]);

    return (
        <>
            <Container maxWidth={false} disableGutters sx={{ overflowX: 'hidden' }}>
                {/* The Shift Centre tabs already name this section; the heading stays for screen readers. */}
                <Typography component="h2" sx={visuallyHidden}>{title}</Typography>

                <ActiveShiftsList shifts={shifts} shiftsLoading={shiftsLoading} shiftsError={shiftsError}
                    loadShifts={loadShifts} handlePostShift={handlePostShift} isDarkMode={isDarkMode}
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

                <ActiveShiftsDialogs shifts={shifts} review={review} decisions={decisions}
                    deleteConfirmDialog={deleteConfirmDialog} setDeleteConfirmDialog={setDeleteConfirmDialog}
                    actionLoading={actionLoading} handleDelete={handleDelete} counterActionLoading={counterActionLoading} />

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
        </>
    );
};

export default ActiveShiftsPage;
