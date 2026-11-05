// CommunityShiftsView - Mobile implementation using ShiftsBoard
// Mirrors web logic for filters, pagination, and rejections

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Lock } from 'lucide-react-native';
import { Snackbar } from 'react-native-paper';
import {
    Shift,
    ShiftCounterOfferPayload,
    ShiftInterest,
    ShiftOffer,
    PaginatedResponse,
    deleteSavedShift,
    fetchShiftOffersService,
    expressInterestInCommunityShiftService,
    fetchCommunityShifts,
    fetchSavedShifts,
    fetchShiftInterests,
    fetchShiftRejections,
    acceptShiftOfferService,
    declineShiftOfferService,
    rejectCommunityShiftService,
    saveShift,
    submitShiftCounterOfferService,
} from '@chemisttasker/shared-core';
import { useAuth } from '@/context/AuthContext';
import { useWorkspace } from '@/context/WorkspaceContext';
import { ContentState } from '@/components/ui';
import { space } from '@/constants/tokens';
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

type CommunityShiftsViewProps = {
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

const rejectSlotIdsWithBatchFallback = async (shiftId: number, slotIds: number[]) => {
    const uniqueSlotIds = Array.from(new Set(slotIds)).filter((slotId) => Number.isFinite(slotId));
    if (uniqueSlotIds.length === 0) return;
    await rejectCommunityShiftService({ shiftId, slotIds: uniqueSlotIds } as any);
};

/**
 * Waits for the workspace policy (never a "switching" spinner) and starts a clean board for each scope.
 * Explorers see public shifts only (surface.publicOnly): Community explains internal access instead of loading.
 */
export default function CommunityShiftsView(props: CommunityShiftsViewProps = {}) {
    const surface = useShiftSurface();
    const router = useRouter();
    if (!surface.ready) return <ContentState kind="loading" style={styles.state} />;
    if (surface.publicOnly) {
        return (
            <ContentState
                kind="empty"
                icon={<Lock />}
                title="Community shifts are for pharmacy teams"
                description="Pharmacies share these shifts with their own staff and favourite locums. Upgrade to a pharmacist or staff account and join a pharmacy to see them. Public shifts stay open to you."
                actionLabel="Upgrade my account"
                onAction={() => router.push('/explorer/profile' as any)}
                style={styles.state}
            />
        );
    }
    return <CommunityShiftsBoard key={surface.scopeKey} {...props} />;
}

function CommunityShiftsBoard({
    activeTabOverride,
    onActiveTabChange,
    hideTabs,
    onScroll,
}: CommunityShiftsViewProps = {}) {
    const scrollY = useRef(new Animated.Value(0)).current;
    const { user } = useAuth();
    const { workspace, selectedPharmacyId } = useWorkspace();
    const userId = user?.id;
    // Only the latest request writes state: a slow page or filter response never replaces a newer one.
    const generation = useRef(0);
    const offersGeneration = useRef(0);

    const [shifts, setShifts] = useState<Shift[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [appliedShiftIds, setAppliedShiftIds] = useState<number[]>([]);
    const [appliedSlotIds, setAppliedSlotIds] = useState<number[]>([]);
    const [rejectedShiftIds, setRejectedShiftIds] = useState<number[]>([]);
    const [rejectedSlotIds, setRejectedSlotIds] = useState<number[]>([]);
    const [filters, setFilters] = useState<FilterConfig>(DEFAULT_FILTERS);
    const [page, setPage] = useState(1);
    const pageSize = 10;
    const [totalCount, setTotalCount] = useState<number | undefined>(undefined);
    const [savedShiftIds, setSavedShiftIds] = useState<Set<number>>(new Set());
    const [savedMap, setSavedMap] = useState<Map<number, number>>(new Map());
    const [boardTab, setBoardTab] = useState<'browse' | 'saved' | 'interested' | 'rejected' | 'accepted'>(
        activeTabOverride ?? 'browse'
    );
    const [offers, setOffers] = useState<ShiftOffer[]>([]);
    const [offersLoading, setOffersLoading] = useState(false);
    const [offersError, setOffersError] = useState(false);
    const [termsState, setTermsState] = useState<TermsAcceptanceState>(() => createTermsAcceptanceState());
    const [termsConfirming, setTermsConfirming] = useState(false);

    const showError = (message: string) => {
        const msg = message && message.trim().length > 0 ? message : 'Something went wrong. Please try again.';
        setError(msg);
    };
    const errorMessage = (err: unknown, fallback: string) =>
        err instanceof Error && err.message.trim().length > 0 ? err.message : fallback;

    useEffect(() => {
        if (activeTabOverride) {
            setBoardTab(activeTabOverride);
        }
    }, [activeTabOverride]);

    const loadSaved = useCallback(async () => {
        try {
            const saved = await fetchSavedShifts();
            const ids = new Set<number>();
            const map = new Map<number, number>();
            saved.forEach((entry: any) => {
                if (typeof entry.shift === 'number') {
                    ids.add(entry.shift);
                    if (entry.id) map.set(entry.shift, entry.id);
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
                    pharmacyId: workspace === 'internal' && selectedPharmacyId ? selectedPharmacyId : undefined,
                };

                const [communityShifts, interests, rejections] = await Promise.all([
                    fetchCommunityShifts(apiFilters) as Promise<PaginatedResponse<Shift>>,
                    fetchShiftInterests({ userId }),
                    fetchShiftRejections({ userId }),
                ]);
                if (request !== generation.current) return;

                const available = (communityShifts.results ?? []).filter((shift: Shift) => {
                    const slots = shift.slots ?? [];
                    if (slots.length === 0) return true;
                    const assignedSlotCount = shift.slotAssignments?.length ?? 0;
                    return assignedSlotCount < slots.length;
                });

                setShifts((prev) => (prev.length === 0 && available.length === 0 ? prev : available));
                setTotalCount(communityShifts.count);

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

                const nextRejectedShiftIds = new Set<number>();
                const nextRejectedSlotIds = new Set<number>();
                (rejections || []).forEach((rejection: any) => {
                    if (rejection.slotId != null) {
                        nextRejectedSlotIds.add(rejection.slotId);
                    } else if (typeof rejection.shift === 'number') {
                        nextRejectedShiftIds.add(rejection.shift);
                    }
                });
                setRejectedShiftIds(Array.from(nextRejectedShiftIds));
                setRejectedSlotIds(Array.from(nextRejectedSlotIds));
            } catch (err) {
                if (request !== generation.current) return;
                console.error('Failed to load community shifts', err);
                setLoadError(true);
            } finally {
                if (request === generation.current) setLoading(false);
            }
        },
        [selectedPharmacyId, userId, workspace]
    );

    useEffect(() => {
        if (!userId) return;
        loadSaved();
    }, [loadSaved, userId]);

    useEffect(() => {
        if (!userId) return;
        loadShifts(filters, page);
    }, [filters, page, loadShifts, userId]);

    const handleApplyAll = async (shift: Shift) => {
        try {
            if (shift.singleUserOnly) {
                await expressInterestInCommunityShiftService({ shiftId: shift.id, slotId: null });
                setAppliedShiftIds((prev) => Array.from(new Set([...prev, shift.id])));
                return;
            }

            const slots = shift.slots ?? [];
            await expressInterestInCommunityShiftService({ shiftId: shift.id, slotIds: slots.map((slot) => slot.id) } as any);
            setAppliedSlotIds((prev) => Array.from(new Set([...prev, ...slots.map((slot) => slot.id)])));
        } catch (err) {
            console.error('Failed to express interest', err);
            showError(errorMessage(err, 'Failed to express interest in this shift.'));
            throw err;
        }
    };

    const handleApplySlot = async (shift: Shift, slotId: number) => {
        try {
            await expressInterestInCommunityShiftService({ shiftId: shift.id, slotId });
            setAppliedSlotIds((prev) => Array.from(new Set([...prev, slotId])));
        } catch (err) {
            console.error('Failed to express interest in slot', err);
            showError(errorMessage(err, 'Failed to express interest in this slot.'));
            throw err;
        }
    };

    const handleSubmitCounterOffer = async (payload: ShiftCounterOfferPayload) => {
        try {
            await submitShiftCounterOfferService(payload);
        } catch (err) {
            console.error('Failed to submit counter offer', err);
            throw new Error(errorMessage(err, 'Failed to submit counter offer.'));
        }
    };

    const handleRejectShift = async (shift: Shift) => {
        try {
            if (shift.singleUserOnly) {
                await rejectCommunityShiftService({ shiftId: shift.id, slotId: null });
            } else {
                const slots = shift.slots ?? [];
                await rejectSlotIdsWithBatchFallback(shift.id, slots.map((slot) => slot.id));
            }
        } catch (err) {
            console.error('Failed to reject shift', err);
            setError('Failed to reject this shift.');
            throw err;
        }
    };

    const handleRejectSlot = async (shift: Shift, slotId: number) => {
        try {
            await rejectCommunityShiftService({ shiftId: shift.id, slotId });
        } catch (err) {
            console.error('Failed to reject slot', err);
            setError('Failed to reject this slot.');
            throw err;
        }
    };

    const handleApplySlots = async (shift: Shift, slotIds: number[]) => {
        try {
            const uniqueSlotIds = Array.from(new Set(slotIds)).filter((slotId) => Number.isFinite(slotId));
            if (uniqueSlotIds.length === 0) return;
            await expressInterestInCommunityShiftService({ shiftId: shift.id, slotIds: uniqueSlotIds } as any);
            setAppliedSlotIds((prev) => Array.from(new Set([...prev, ...uniqueSlotIds])));
        } catch (err) {
            console.error('Failed to express interest in slots', err);
            showError(errorMessage(err, 'Failed to express interest in the selected slots.'));
            throw err;
        }
    };

    const handleRejectSlots = async (shift: Shift, slotIds: number[]) => {
        try {
            await rejectSlotIdsWithBatchFallback(shift.id, slotIds);
        } catch (err) {
            console.error('Failed to reject slots', err);
            setError('Failed to reject the selected slots.');
            throw err;
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
                setError('Failed to unsave this shift.');
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
            setError('Failed to save this shift.');
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
            const pending = await fetchShiftOffersService({ status: 'PENDING' });
            if (request !== offersGeneration.current) return;
            setOffers((pending as ShiftOffer[]).filter((offer) => String(offer.status ?? '').toUpperCase() === 'PENDING'));
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
            await Promise.all(list.map((offer) => acceptShiftOfferService(offer.id, payload)));
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

    const handleDeclineOfferShift = async (targetShift: Shift) => {
        const list = (offersByShift.get(targetShift.id) ?? []).filter(
            (offer) => String(offer.status ?? '').toUpperCase() === 'PENDING'
        );
        if (list.length == 0) return;
        await Promise.all(list.map((offer) => declineShiftOfferService(offer.id)));
        await loadOffers();
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
                ) : offerShifts.length === 0 ? (
                    <ContentState
                        kind="empty"
                        title="No offers yet"
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
                )
            ) : loadError ? (
                <ContentState
                    kind="error"
                    title="Community shifts did not load"
                    description="Check your connection, then try again."
                    onAction={() => void loadShifts(filters, page)}
                    style={styles.state}
                />
            ) : (
                <ShiftsBoard
                    title="Community shifts"
                    shifts={shifts}
                    loading={loading}
                    useServerFiltering
                    filters={filters}
                    onFiltersChange={handleFiltersChange}
                    totalCount={totalCount}
                    page={page}
                    pageSize={pageSize}
                    onPageChange={setPage}
                    savedShiftIds={Array.from(savedShiftIds)}
                    onToggleSave={handleToggleSave}
                    onApplyAll={handleApplyAll}
                    onApplySlot={handleApplySlot}
                    onApplySlots={handleApplySlots}
                    onSubmitCounterOffer={handleSubmitCounterOffer}
                    initialAppliedShiftIds={appliedShiftIds}
                    initialAppliedSlotIds={appliedSlotIds}
                    onRejectShift={handleRejectShift}
                    onRejectSlot={handleRejectSlot}
                    onRejectSlots={handleRejectSlots}
                    initialRejectedShiftIds={rejectedShiftIds}
                    initialRejectedSlotIds={rejectedSlotIds}
                    hideTabs
                    activeTabOverride={boardTabForBoard}
                    onActiveTabChange={(tab) => handleBoardTabChange(tab as any)}
                    onRefresh={() => loadShifts(filters, page)}
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
            />
            <Snackbar
                visible={!!error}
                onDismiss={() => setError(null)}
                duration={3000}
            >
                {error}
            </Snackbar>
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
});
