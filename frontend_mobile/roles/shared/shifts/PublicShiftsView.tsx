// PublicShiftsView - Mobile implementation using ShiftsBoard
// Mirrors web logic for filters, pagination, and verification gating

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import { Animated, StyleSheet, View } from 'react-native';
import { Portal, Snackbar, Text } from 'react-native-paper';
import {
    Shift,
    ShiftCounterOfferPayload,
    ShiftInterest,
    ShiftOffer,
    PaginatedResponse,
    deleteSavedShift,
    fetchShiftOffersService,
    expressInterestInPublicShiftService,
    fetchPublicShifts,
    fetchSavedShifts,
    fetchShiftInterests,
    acceptShiftOfferService,
    activateShiftOfferPayrollService,
    declineShiftOfferService,
    saveShift,
    submitShiftCounterOfferService,
    getOnboardingDetail,
} from '@chemisttasker/shared-core';
import { useAuth } from '@/context/AuthContext';
import { Button as KitButton, ContentState, Pill } from '@/components/ui';
import { colors, font, radius, space, type } from '@/constants/tokens';
import { useShiftSurface } from './useShiftSurface';
import ShiftsBoard from './ShiftsBoard';
import { BoardTabs } from './ShiftsBoard/components/BoardTabs';
import type { FilterConfig } from './ShiftsBoard/types';
import ShiftEngagementTermsDialog from './ShiftsBoard/components/ShiftEngagementTermsDialog';
import {
    TermsAcceptanceState,
    createTermsAcceptanceState,
    dismissTermsAcceptance,
    dropCachedOfferPreviews,
    isTermsChangedError,
    isTermsDialogVisible,
    narrowSelectedOffers,
    selectOffersForTerms,
    transitionReloadFailure,
    transitionReloadStart,
    transitionReloadSuccess,
    transitionTermsChanged,
} from './workerShiftDetailLogic';
import type { ShiftOfferAcceptancePayload } from '@chemisttasker/shared-core';

type PublicShiftsViewProps = {
    activeTabOverride?: 'browse' | 'saved' | 'interested' | 'rejected' | 'accepted';
    onActiveTabChange?: (tab: 'browse' | 'saved' | 'interested' | 'rejected' | 'accepted') => void;
    hideTabs?: boolean;
    onScroll?: (event: any) => void;
};

const DEFAULT_FILTERS: FilterConfig = {
    city: [],
    roles: [],
    employmentTypes: [],
    minRate: 0,
    search: '',
    timeOfDay: [],
    dateRange: { start: '', end: '' },
    onlyUrgent: false,
    negotiableOnly: false,
    flexibleOnly: false,
    travelProvided: false,
    accommodationProvided: false,
    bulkShiftsOnly: false,
};

const coerceVerified = (value: any) => {
    if (value === true || value === 'true' || value === 'True') return true;
    if (value === 1 || value === '1') return true;
    return false;
};

/** Waits for the workspace policy (never a "switching" spinner) and starts a clean board for each scope. */
export default function PublicShiftsView(props: PublicShiftsViewProps = {}) {
    const surface = useShiftSurface();
    if (!surface.ready) return <ContentState kind="loading" style={styles.state} />;
    return <PublicShiftsBoard key={surface.scopeKey} {...props} />;
}

function PublicShiftsBoard({
    activeTabOverride,
    onActiveTabChange,
    hideTabs,
    onScroll,
}: PublicShiftsViewProps = {}) {
    const scrollY = useRef(new Animated.Value(0)).current;
    const { user } = useAuth();
    const router = useRouter();
    const workerPaymentPath =
        user?.role === 'PHARMACIST'
            ? '/pharmacist/profile-payment'
            : user?.role === 'OTHER_STAFF'
                ? '/otherstaff/profile-payment'
                : null;
    const userId = user?.id;
    // Only the latest request writes state: a slow page or filter response never replaces a newer one.
    const generation = useRef(0);
    const offersGeneration = useRef(0);

    const initialVerified =
        coerceVerified((user as any)?.verified) ||
        coerceVerified((user as any)?.pharmacist_profile?.verified) ||
        coerceVerified((user as any)?.other_staff_profile?.verified);
    const [isVerified, setIsVerified] = useState<boolean>(initialVerified);

    const [shifts, setShifts] = useState<Shift[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [errorOpen, setErrorOpen] = useState(false);
    const [appliedShiftIds, setAppliedShiftIds] = useState<number[]>([]);
    const [appliedSlotIds, setAppliedSlotIds] = useState<number[]>([]);
    const [filters, setFilters] = useState<FilterConfig>(DEFAULT_FILTERS);
    const [debouncedFilters, setDebouncedFilters] = useState<FilterConfig>(DEFAULT_FILTERS);
    const [page, setPage] = useState(1);
    const pageSize = 10;
    const [totalCount, setTotalCount] = useState<number | undefined>(undefined);
    const [savedShiftIds, setSavedShiftIds] = useState<Set<number>>(new Set());
    const [savedMap, setSavedMap] = useState<Map<number, number>>(new Map());
    const [boardTab, setBoardTab] = useState<'browse' | 'saved' | 'interested' | 'rejected' | 'accepted'>(
        activeTabOverride ?? 'browse'
    );
    const [offers, setOffers] = useState<ShiftOffer[]>([]);
    const [payrollActivationOffers, setPayrollActivationOffers] = useState<ShiftOffer[]>([]);
    const [offersLoading, setOffersLoading] = useState(false);
    const [offersError, setOffersError] = useState(false);
    const [termsState, setTermsState] = useState<TermsAcceptanceState>(() => createTermsAcceptanceState());
    const [termsConfirming, setTermsConfirming] = useState(false);
    const [payrollActivatingId, setPayrollActivatingId] = useState<number | null>(null);
    const [payrollNotice, setPayrollNotice] = useState('');

    useEffect(() => {
        if (activeTabOverride) {
            setBoardTab(activeTabOverride);
        }
    }, [activeTabOverride]);

    const showError = (message: string) => {
        const msg = message && message.trim().length > 0 ? message : 'Something went wrong. Please try again.';
        setError(msg);
        setErrorOpen(true);
    };
    const errorMessage = (err: unknown, fallback: string) =>
        err instanceof Error && err.message.trim().length > 0 ? err.message : fallback;

    const loadSaved = useCallback(async () => {
        try {
            const saved = await fetchSavedShifts();
            const ids = new Set<number>();
            const map = new Map<number, number>();
            saved.forEach((entry: any) => {
                if (typeof entry.shift === 'number') {
                    ids.add(entry.shift);
                    if (entry.id) {
                        map.set(entry.shift, entry.id);
                    }
                }
            });
            setSavedShiftIds(ids);
            setSavedMap(map);
        } catch (err) {
            console.error('Failed to load saved shifts', err);
        }
    }, []);

    const loadShifts = useCallback(
        async (activeFilters: FilterConfig, activePage: number) => {
            if (!userId) return;
            const request = ++generation.current;
            setLoading(true);
            setLoadError(false);
            try {
                const apiFilters = {
                    search: activeFilters.search,
                    roles: activeFilters.roles,
                    employmentTypes: activeFilters.employmentTypes,
                    city: activeFilters.city,
                    state: [],
                    minRate: activeFilters.minRate || undefined,
                    onlyUrgent: activeFilters.onlyUrgent || undefined,
                    negotiableOnly: activeFilters.negotiableOnly || undefined,
                    flexibleOnly: activeFilters.flexibleOnly || undefined,
                    travelProvided: activeFilters.travelProvided || undefined,
                    accommodationProvided: activeFilters.accommodationProvided || undefined,
                    bulkShiftsOnly: activeFilters.bulkShiftsOnly || undefined,
                    timeOfDay: activeFilters.timeOfDay,
                    startDate: activeFilters.dateRange.start || undefined,
                    endDate: activeFilters.dateRange.end || undefined,
                    page: activePage,
                    pageSize,
                };

                const [publicShifts, interests] = await Promise.all([
                    fetchPublicShifts(apiFilters) as Promise<PaginatedResponse<Shift>>,
                    fetchShiftInterests({ userId }),
                ]);
                if (request !== generation.current) return;

                const available = (publicShifts.results ?? []).filter((shift: Shift) => {
                    const slots = shift.slots ?? [];
                    if (slots.length === 0) return true;
                    const assignedSlotCount = shift.slotAssignments?.length ?? 0;
                    return assignedSlotCount < slots.length;
                });

                setShifts((prev) => (prev.length === 0 && available.length === 0 ? prev : available));
                setTotalCount(publicShifts.count);

                const nextShiftIds = new Set<number>();
                const nextSlotIds = new Set<number>();
                interests.forEach((interest: ShiftInterest) => {
                    if (interest.slotId != null) {
                        nextSlotIds.add(interest.slotId);
                    } else if (typeof interest.shift === 'number') {
                        nextShiftIds.add(interest.shift);
                    }
                });
                setAppliedShiftIds(Array.from(nextShiftIds));
                setAppliedSlotIds(Array.from(nextSlotIds));
            } catch (err) {
                if (request !== generation.current) return;
                console.error('Failed to load public shifts', err);
                setLoadError(true);
            } finally {
                if (request === generation.current) setLoading(false);
            }
        },
        [userId]
    );

    useEffect(() => {
        if (!userId) return;
        loadSaved();
    }, [loadSaved, userId]);

    useEffect(() => {
        const fetchVerification = async () => {
            try {
                if (!user) return;
                const roleKey =
                    user.role === 'PHARMACIST' ? 'pharmacist' :
                        user.role === 'OTHER_STAFF' ? 'other_staff' :
                            user.role === 'EXPLORER' ? 'explorer' :
                                user.role === 'OWNER' ? 'owner' :
                                    null;
                if (!roleKey) return;
                const onboarding: any = await getOnboardingDetail(roleKey);
                const verifiedFlag =
                    onboarding?.verified ??
                    onboarding?.data?.verified ??
                    (roleKey === 'pharmacist' ? onboarding?.ahpra_verified : undefined);
                setIsVerified(coerceVerified(verifiedFlag));
            } catch (err) {
                console.warn('Failed to fetch onboarding verification', err);
            }
        };
        fetchVerification();
    }, [user, user?.role]);

    useEffect(() => {
        const handle = setTimeout(() => setDebouncedFilters(filters), 350);
        return () => clearTimeout(handle);
    }, [filters]);

    useEffect(() => {
        if (!userId) return;
        loadShifts(debouncedFilters, page);
    }, [debouncedFilters, page, loadShifts, userId]);

    const guardVerified = () => {
        if (isVerified) return true;
        const msg = 'Verify your profile (email and mobile, plus AHPRA for pharmacists and interns) before applying for public shifts.';
        showError(msg);
        return false;
    };

    const handleApplyAll = async (shift: Shift) => {
        if (!guardVerified()) {
            throw new Error('Not verified');
        }
        try {
            const slots = shift.slots ?? [];
            if (shift.singleUserOnly || slots.length === 0) {
                await expressInterestInPublicShiftService({ shiftId: shift.id, slotId: null });
                setAppliedShiftIds((prev) => Array.from(new Set([...prev, shift.id])));
                return;
            }

            await expressInterestInPublicShiftService({ shiftId: shift.id, slotIds: slots.map((slot) => slot.id) } as any);
            setAppliedSlotIds((prev) => Array.from(new Set([...prev, ...slots.map((slot) => slot.id)])));
        } catch (err) {
            console.error('Failed to express interest', err);
            showError(errorMessage(err, 'Failed to express interest in this shift.'));
            throw err;
        }
    };

    const handleApplySlot = async (shift: Shift, slotId: number) => {
        if (!guardVerified()) {
            throw new Error('Not verified');
        }
        try {
            await expressInterestInPublicShiftService({ shiftId: shift.id, slotId });
            setAppliedSlotIds((prev) => Array.from(new Set([...prev, slotId])));
        } catch (err) {
            console.error('Failed to express interest in slot', err);
            showError(errorMessage(err, 'Failed to express interest in this slot.'));
            throw err;
        }
    };

    const handleSubmitCounterOffer = async (payload: ShiftCounterOfferPayload) => {
        if (!guardVerified()) {
            throw new Error('Verify your profile (email and mobile, plus AHPRA for pharmacists and interns) before applying for public shifts.');
        }
        try {
            await submitShiftCounterOfferService(payload);
        } catch (err) {
            console.error('Failed to submit counter offer', err);
            throw new Error(errorMessage(err, 'Failed to submit counter offer.'));
        }
    };

    const handleToggleSave = async (shiftId: number) => {
        const savedId = savedMap.get(shiftId);
        if (savedId) {
            try {
                await deleteSavedShift(savedId);
                const next = new Set(savedShiftIds);
                next.delete(shiftId);
                setSavedShiftIds(next);
                const nextMap = new Map(savedMap);
                nextMap.delete(shiftId);
                setSavedMap(nextMap);
            } catch (err) {
                console.error('Failed to unsave shift', err);
                showError('Failed to unsave this shift.');
            }
            return;
        }
        try {
            const created: any = await saveShift(shiftId);
            const next = new Set(savedShiftIds);
            next.add(shiftId);
            setSavedShiftIds(next);
            const nextMap = new Map(savedMap);
            if (created?.id) nextMap.set(shiftId, created.id);
            setSavedMap(nextMap);
        } catch (err) {
            console.error('Failed to save shift', err);
            showError('Failed to save this shift.');
        }
    };

    const handleFiltersChange = (nextFilters: FilterConfig) => {
        setFilters(nextFilters);
        setPage(1);
    };

    const handleBoardTabChange = (tab: 'browse' | 'saved' | 'interested' | 'rejected' | 'accepted') => {
        setBoardTab(tab);
        onActiveTabChange?.(tab);
    };

    const loadOffers = useCallback(async () => {
        const request = ++offersGeneration.current;
        setOffersLoading(true);
        setOffersError(false);
        try {
            const [pending, accepted] = await Promise.all([
                fetchShiftOffersService({ status: 'PENDING' }),
                fetchShiftOffersService({ status: 'ACCEPTED' }),
            ]);
            if (request !== offersGeneration.current) return;
            setOffers((pending as ShiftOffer[]).filter(
                (offer) => String(offer.status ?? '').toUpperCase() === 'PENDING'
            ));
            setPayrollActivationOffers(
                (accepted as ShiftOffer[]).filter((offer) => {
                    const preview = offer.engagementTermsPreview;
                    return (
                        offer.paymentPreferenceSnapshot === 'TFN'
                        && offer.engagementKind === 'SHIFT_EMPLOYMENT'
                        && !offer.payrollActivatedAt
                        && offer.settlementChannel !== 'PAYROLL'
                        && Boolean(preview?.payrollEnabled)
                    );
                })
            );
        } catch (err) {
            if (request !== offersGeneration.current) return;
            console.error('Failed to load offers', err);
            setOffersError(true);
        } finally {
            if (request === offersGeneration.current) setOffersLoading(false);
        }
    }, []);

    useEffect(() => {
        if (boardTab === 'accepted') {
            loadOffers();
        }
    }, [boardTab, loadOffers]);

    const offersByShift = useMemo(() => {
        const map = new Map<number, ShiftOffer[]>();
        offers.forEach((offer) => {
            if (String(offer.status ?? '').toUpperCase() !== 'PENDING') return;
            const shift = offer.shiftDetail;
            if (!shift) return;
            const list = map.get(shift.id) ?? [];
            list.push(offer);
            map.set(shift.id, list);
        });
        return map;
    }, [offers]);

    const offerShifts = useMemo(
        () =>
            Array.from(offersByShift.entries())
                .map(([, shiftOffers]) => {
                    const shift = shiftOffers[0]?.shiftDetail as Shift | undefined;
                    if (!shift) return null;

                    const offerSlotIds = new Set<number>();
                    const offerStatusBySlot: Record<number, string> = {};
                    const pendingOfferIdBySlot: Record<number, number> = {};
                    const shiftLevelOfferStatus = String(shiftOffers[0]?.status ?? '').toUpperCase();
                    shiftOffers.forEach((offer) => {
                        const raw = offer.slot ?? (offer as any).slotId ?? offer.slotDetail?.id ?? null;
                        const n = Number(raw);
                        if (!Number.isFinite(n)) return;
                        const slotId = n;
                        offerSlotIds.add(slotId);
                        const status = String(offer.status ?? '').toUpperCase();
                        offerStatusBySlot[slotId] = status;
                        if (status === 'PENDING') pendingOfferIdBySlot[slotId] = offer.id;
                    });

                    if (offerSlotIds.size === 0) {
                        return shift;
                    }

                    const slots = (shift.slots ?? []).filter((slot: any) => {
                        const n = Number(slot?.id);
                        return Number.isFinite(n) && offerSlotIds.has(n);
                    });
                    return ({
                        ...shift,
                        slots: slots.length > 0 ? slots : shift.slots,
                        __offerStatusBySlot: offerStatusBySlot,
                        __pendingOfferIdBySlot: pendingOfferIdBySlot,
                        __shiftOfferStatus: shiftLevelOfferStatus,
                    } as Shift);
                })
                .filter(Boolean) as Shift[],
        [offersByShift]
    );

    const reloadTermsOffers = async (selected: ShiftOffer[]) => {
        setTermsConfirming(true);
        setTermsState((prev) => transitionReloadStart(prev, selected));
        try {
            const fresh = await fetchShiftOffersService({ status: 'PENDING' });
            const freshPending = (fresh as ShiftOffer[]).filter(
                (offer) => String(offer.status ?? '').toUpperCase() === 'PENDING'
            );
            setOffers(freshPending);
            setTermsState((prev) => {
                const next = transitionReloadSuccess(prev, freshPending);
                if (next.status === 'failed') {
                    showError('The selected offers are no longer available.');
                }
                return next;
            });
        } catch (fetchErr) {
            setTermsState((prev) =>
                transitionReloadFailure(prev, 'Shift engagement terms have changed. Failed to refresh terms. Please retry.')
            );
            showError('Failed to refresh updated terms. Please retry.');
        } finally {
            setTermsConfirming(false);
        }
    };

    const acceptOffers = async (list: ShiftOffer[], payload?: ShiftOfferAcceptancePayload) => {
        if (list.length === 0) return;
        if (!payload) {
            const selection = selectOffersForTerms(termsState, list);
            if (selection.needsReload) {
                setTermsState(selection.state);
                await reloadTermsOffers(list);
                return;
            }
            const blocked = list.some((offer) => Boolean(offer.engagementTermsPreview?.blocked));
            if (blocked) {
                showError('This offer cannot be confirmed until the required onboarding/payment details are completed.');
                return;
            }
            const requiresAcceptance = list.some((offer) => Boolean(offer.engagementTermsPreview?.acceptanceRequired));
            if (requiresAcceptance) {
                setTermsState(selection.state);
                return;
            }
        }
        setTermsConfirming(true);
        try {
            await Promise.all(list.map((offer) => acceptShiftOfferService(offer.id, { ...payload, termsVersion: offer.engagementTermsPreview?.termsVersion })));
            setTermsState(createTermsAcceptanceState());
            await loadOffers();
        } catch (err) {
            if (isTermsChangedError(err)) {
                const termsMsg = 'Shift engagement terms have changed. Please review the updated terms and confirm again.';
                showError(termsMsg);
                setOffers((prev) => dropCachedOfferPreviews(prev, list.map((o) => o.id)));
                setTermsState((prev) => transitionTermsChanged(prev, list, termsMsg));
                await reloadTermsOffers(list);
                return;
            }
            showError(errorMessage(err, 'Failed to confirm the shift offer.'));
            throw err;
        } finally {
            setTermsConfirming(false);
        }
    };

    const handleConfirmOfferShift = async (targetShift: Shift) => {
        const list = (offersByShift.get(targetShift.id) ?? []).filter(
            (offer) => String(offer.status ?? '').toUpperCase() === 'PENDING'
        );
        await acceptOffers(list);
    };

    const handleConfirmOfferSlot = async (targetShift: Shift, slotId: number) => {
        const offer = (offersByShift.get(targetShift.id) ?? []).find((item) => {
            const raw = item.slot ?? (item as any).slotId ?? item.slotDetail?.id ?? null;
            const offerSlotId = Number(raw);
            return Number.isFinite(offerSlotId)
                && offerSlotId === slotId
                && String(item.status ?? '').toUpperCase() === 'PENDING';
        });
        if (!offer) return;
        await acceptOffers([offer]);
    };

    const handleApplySlots = async (shift: Shift, slotIds: number[]) => {
        if (!guardVerified()) {
            throw new Error('Not verified');
        }
        try {
            const uniqueSlotIds = Array.from(new Set(slotIds)).filter((slotId) => Number.isFinite(slotId));
            if (uniqueSlotIds.length === 0) return;
            await expressInterestInPublicShiftService({ shiftId: shift.id, slotIds: uniqueSlotIds } as any);
            setAppliedSlotIds((prev) => Array.from(new Set([...prev, ...uniqueSlotIds])));
        } catch (err) {
            console.error('Failed to express interest in slots', err);
            showError(errorMessage(err, 'Failed to express interest in the selected slots.'));
            throw err;
        }
    };

    const handleDeclineOfferShift = async (targetShift: Shift) => {
        const list = (offersByShift.get(targetShift.id) ?? []).filter(
            (offer) => String(offer.status ?? '').toUpperCase() === 'PENDING'
        );
        if (list.length == 0) return;
        await Promise.all(list.map((offer) => declineShiftOfferService(offer.id)));
        await loadOffers();
    };

    const openPrivatePaymentProfile = () => {
        setTermsState((prev) => dismissTermsAcceptance(prev));
        if (workerPaymentPath) {
            router.push(workerPaymentPath as any);
        }
    };

    const handleActivatePayroll = async (offer: ShiftOffer) => {
        setPayrollActivatingId(offer.id);
        setPayrollNotice('');
        try {
            await activateShiftOfferPayrollService(offer.id);
            setPayrollNotice('ChemistTasker Payroll is now active for this confirmed shift.');
            await loadOffers();
        } catch (err) {
            showError(errorMessage(
                err,
                'Payroll could not be activated yet. Complete your private TFN/super profile and try again.'
            ));
        } finally {
            setPayrollActivatingId(null);
        }
    };


    const slotFilterMode =
        boardTab === 'interested' ? 'interested' : boardTab === 'rejected' ? 'rejected' : 'all';
    const boardTabForBoard = boardTab === 'saved' ? 'saved' : 'browse';
    const handleScroll = Animated.event(
        [{ nativeEvent: { contentOffset: { y: scrollY } } }],
        {
            useNativeDriver: false,
            listener: onScroll,
        }
    );

    if (!userId) return null;

    return (
        <View style={styles.container}>
            {!hideTabs && <BoardTabs value={boardTab} onChange={handleBoardTabChange} savedCount={savedShiftIds.size} />}
            {boardTab === 'accepted' ? (
                offersLoading ? (
                    <ContentState kind="loading" style={styles.state} />
                ) : offersError ? (
                    <ContentState
                        kind="error"
                        title="Your offers did not load"
                        description="Check your connection, then try again."
                        onAction={() => void loadOffers()}
                        style={styles.state}
                    />
                ) : (
                        <View style={styles.offerWorkspace}>
                            {payrollNotice ? (
                                <Text style={styles.successText}>{payrollNotice}</Text>
                            ) : null}
                            {offerShifts.length === 0 ? (
                                <ContentState
                                    kind="empty"
                                    title="No pending offers"
                                    description="When a pharmacy offers you a shift, you confirm it here."
                                    style={styles.state}
                                />
                            ) : (
                                <ShiftsBoard
                                    title="Offers"
                                    shifts={offerShifts}
                                    loading={offersLoading}
                                    onApplyAll={handleConfirmOfferShift}
                                    onApplySlot={handleConfirmOfferSlot}
                                    onSubmitCounterOffer={handleSubmitCounterOffer}
                                    onRejectShift={handleDeclineOfferShift}
                                    onRejectSlot={undefined}
                                    enableSaved={false}
                                    hideSaveToggle
                                    hideFiltersAndSort
                                    hideTabs
                                    disableLocalPersistence
                                    applyLabel="Confirm"
                                    disableActionGuards
                                    actionDisabledGuard={(shift) =>
                                        !(offersByShift.get(shift.id) ?? []).some(
                                            (offer) => String(offer.status ?? '').toUpperCase() === 'PENDING'
                                        )
                                    }
                                    onRefresh={loadOffers}
                                    onScroll={onScroll}
                                    fallbackToAllShiftsWhenEmpty
                                    showAllSlots
                                />
                            )}

                            {payrollActivationOffers.length > 0 ? (
                                <View style={styles.payrollSection}>
                                    <Text variant="titleMedium" style={styles.payrollTitle}>
                                        Payroll setup for confirmed shifts
                                    </Text>
                                    <Text variant="bodySmall" style={styles.placeholderText}>
                                        These TFN shifts are confirmed and stay timesheet-only until your private TFN/super setup is complete. The pharmacy never receives your TFN or super member number.
                                    </Text>
                                    {payrollActivationOffers.map((offer) => {
                                        const preview = offer.engagementTermsPreview;
                                        const ready =
                                            preview?.payrollSetupStatus === 'READY'
                                            && !preview?.awardPayrollReviewRequired;
                                        const missing = preview?.payrollMissingFields || [];
                                        const shift = offer.shiftDetail as any;
                                        const pharmacyName =
                                            preview?.pharmacyName
                                            || shift?.pharmacyDetail?.name
                                            || shift?.pharmacyName
                                            || 'Confirmed shift';
                                        return (
                                            <View key={offer.id} style={styles.payrollCard}>
                                                <View style={styles.chipRow}>
                                                    <Pill label="TFN" tone="violet" />
                                                    <Pill
                                                        label={ready ? 'Ready to activate payroll' : 'Timesheet only · setup required'}
                                                        tone={ready ? 'green' : 'amber'}
                                                    />
                                                </View>
                                                <Text style={styles.payrollItemTitle}>
                                                    {pharmacyName}
                                                </Text>
                                                <Text style={styles.placeholderText}>
                                                    {preview?.awardClassification
                                                        ? `${preview.awardClassification.replaceAll('_', ' ')} · `
                                                        : ''}
                                                    {offer.settlementChannel === 'TIMESHEET_ONLY'
                                                        ? 'Currently timesheet only'
                                                        : offer.settlementChannel}
                                                </Text>
                                                {missing.length > 0 ? (
                                                    <Text style={styles.warningText}>
                                                        Private setup needed: {missing.map((field) => field.replaceAll('_', ' ')).join(', ')}
                                                    </Text>
                                                ) : null}
                                                {preview?.awardPayrollReviewRequired ? (
                                                    <Text style={styles.warningText}>
                                                        Award/overtime review is required before payroll activation.
                                                    </Text>
                                                ) : null}
                                                <View style={styles.payrollActions}>
                                                    {!ready && workerPaymentPath ? (
                                                        <KitButton
                                                            label="Complete private profile"
                                                            variant="outlined"
                                                            onPress={openPrivatePaymentProfile}
                                                        />
                                                    ) : null}
                                                    <KitButton
                                                        label={payrollActivatingId === offer.id ? 'Activating...' : 'Activate payroll'}
                                                        disabled={!ready || payrollActivatingId === offer.id}
                                                        onPress={() => void handleActivatePayroll(offer)}
                                                    />
                                                </View>
                                            </View>
                                        );
                                    })}
                                </View>
                            ) : null}
                        </View>
                )
            ) : loadError ? (
                <ContentState
                    kind="error"
                    title="Public shifts did not load"
                    description="Check your connection, then try again."
                    onAction={() => void loadShifts(debouncedFilters, page)}
                    style={styles.state}
                />
            ) : (
                <ShiftsBoard
                    title="Public shifts"
                    shifts={shifts}
                    loading={loading}
                    useServerFiltering
                    filters={filters}
                    onFiltersChange={handleFiltersChange}
                    totalCount={totalCount}
                    page={page}
                    pageSize={pageSize}
                    onPageChange={setPage}
                    onApplyAll={handleApplyAll}
                    onApplySlot={handleApplySlot}
                    onApplySlots={handleApplySlots}
                    onSubmitCounterOffer={handleSubmitCounterOffer}
                    savedShiftIds={Array.from(savedShiftIds)}
                    onToggleSave={handleToggleSave}
                    initialAppliedShiftIds={appliedShiftIds}
                    initialAppliedSlotIds={appliedSlotIds}
                    hideTabs
                    activeTabOverride={boardTabForBoard}
                    onActiveTabChange={(tab) => handleBoardTabChange(tab as any)}
                    onRefresh={() => loadShifts(debouncedFilters, page)}
                    disableLocalPersistence
                    slotFilterMode={slotFilterMode}
                    onScroll={handleScroll}
                />
            )}
            <ShiftEngagementTermsDialog
                visible={isTermsDialogVisible(termsState)}
                offers={termsState.offers}
                loading={termsConfirming || termsState.status === 'reloading'}
                status={termsState.status}
                error={termsState.error}
                onDismiss={() => {
                    setTermsState((prev) => dismissTermsAcceptance(prev));
                }}
                onConfirm={(payload) => acceptOffers(termsState.offers, payload)}
                onRetry={() => void reloadTermsOffers(termsState.offers.length > 0 ? termsState.offers : termsState.selectedOfferIds.map((id) => ({ id } as ShiftOffer)))}
                onOpenPaymentProfile={workerPaymentPath ? openPrivatePaymentProfile : undefined}
            />
            <Portal>
                <Snackbar
                    visible={errorOpen}
                    onDismiss={() => setErrorOpen(false)}
                    duration={4000}
                >
                    {error || 'Something went wrong. Please try again.'}
                </Snackbar>
            </Portal>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    state: {
        margin: space.lg,
    },
    placeholderText: {
        color: colors.textSecondary,
        textAlign: 'center',
    },
    offerWorkspace: {
        flex: 1,
        gap: space.lg,
    },
    payrollSection: {
        gap: 10,
        paddingHorizontal: space.lg,
    },
    payrollTitle: {
        fontFamily: font.outfit.medium,
        fontSize: type.titleMedium.fontSize,
        lineHeight: type.titleMedium.lineHeight,
        color: colors.textPrimary,
    },
    payrollCard: {
        backgroundColor: colors.surfaceBg,
        borderRadius: radius.card,
        borderCurve: 'continuous',
        borderWidth: 1,
        borderColor: colors.border,
        padding: space.lg,
        gap: space.sm,
    },
    payrollCardContent: {
        gap: 8,
    },
    payrollItemTitle: {
        fontFamily: font.inter.semiBold,
        fontSize: type.labelLarge.fontSize,
        lineHeight: type.labelLarge.lineHeight,
        color: colors.textPrimary,
    },
    chipRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
    },
    payrollActions: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
        marginTop: 4,
    },
    warningText: {
        color: colors.status.amber.fg,
    },
    successText: {
        marginHorizontal: space.lg,
        color: colors.status.green.fg,
        fontFamily: font.inter.semiBold,
    },
});
