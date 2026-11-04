import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Snackbar } from 'react-native-paper';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Lock, Sparkles } from 'lucide-react-native';
import {
    Shift,
    ShiftOffer,
    ShiftOfferAcceptancePayload,
    acceptShiftOfferService as acceptWorkerShiftOfferService,
    declineShiftOfferService as declineWorkerShiftOfferService,
    fetchShiftOffersService as fetchWorkerShiftOffersService,
    expressInterestInShiftService,
    submitShiftCounterOfferService,
    fetchShiftInterests,
    fetchShiftRejections,
    fetchWorkerShiftDetailService,
    rejectShiftService,
} from '@chemisttasker/shared-core';
import { Button, ConfirmDialog, ContentState } from '@/components/ui';
import { triggerHaptic } from '@/components/ui/ScalePressable';
import { colors, font, radius, space, type } from '@/constants/tokens';
import { useAuth } from '@/context/AuthContext';
import { useShiftSurface } from '@/roles/shared/shifts/useShiftSurface';
import ShiftsBoard from '@/roles/shared/shifts/ShiftsBoard';
import ShiftEngagementTermsDialog from '@/roles/shared/shifts/ShiftsBoard/components/ShiftEngagementTermsDialog';
import { getShiftPharmacyName } from '@/roles/shared/shifts/ShiftsBoard/utils/shift';
import {
    TermsAcceptanceState,
    beginOfferMutation,
    canAcceptOffer,
    createOfferMutationTracker,
    createTermsAcceptanceState,
    dismissTermsAcceptance,
    dropCachedOfferPreviews,
    endOfferMutation,
    getErrorHttpStatus,
    isExplorerShiftRestricted,
    isTermsChangedError,
    isTermsDialogVisible,
    releaseOfferMutation,
    resolveOfferAcceptanceResult,
    resolveWorkerShiftOffer,
    selectOffersForTerms,
    transitionReloadFailure,
    transitionReloadStart,
    transitionReloadSuccess,
    transitionTermsChanged,
} from '@/roles/shared/shifts/workerShiftDetailLogic';

const EMPTY_SHIFTS: Shift[] = [];
const EMPTY_OFFERS: ShiftOffer[] = [];
const keepEmpty = <T,>(next: T[]) => (prev: T[]) => (prev.length === 0 && next.length === 0 ? prev : next);

const getErrorMessage = (error: unknown, fallback: string) => {
    const detail = (error as any)?.payload?.detail ?? (error as any)?.response?.data?.detail;
    if (typeof detail === 'string') return detail;
    if (error instanceof Error && error.message) return error.message;
    return fallback;
};

const isSlotIdRequiredError = (error: unknown) => {
    const detail = (error as any)?.response?.data?.detail;
    const message = error instanceof Error ? error.message : null;
    return [detail, message].some((value) => typeof value === 'string' && value.includes('slot_id is required'));
};

const rejectSlotIdsWithBatchFallback = async (shiftId: number, slotIds: number[]) => {
    try {
        await rejectShiftService({ shiftId, slotIds } as any);
    } catch (err) {
        if (!isSlotIdRequiredError(err)) throw err;
        await Promise.all(slotIds.map((slotId) => rejectShiftService({ shiftId, slotId })));
    }
};

const coerceId = (value: unknown) => {
    return typeof value === 'number' ? value : null;
};

const coerceSlotId = (value: unknown) => {
    if (typeof value === 'number') return value;
    if (typeof value === 'string' && value.trim() !== '' && !Number.isNaN(Number(value))) {
        return Number(value);
    }
    return null;
};

export default function WorkerShiftDetailPage() {
    const { id, offer_id, offerId } = useLocalSearchParams<{ id?: string; offer_id?: string; offerId?: string }>();
    const surface = useShiftSurface();
    if (!surface.ready) {
        return (
            <SafeAreaView style={styles.container} edges={['left', 'right']}>
                <ContentState kind="loading" style={styles.state} />
            </SafeAreaView>
        );
    }
    return <ScopedWorkerShiftDetail key={`${surface.scopeKey}:${id ?? ''}`} id={id} offerParam={offer_id ?? offerId} surface={surface} />;
}

function ScopedWorkerShiftDetail({ id, offerParam, surface }: { id?: string; offerParam?: string; surface: ReturnType<typeof useShiftSurface> }) {
    const router = useRouter();
    const { user } = useAuth();
    const requestGen = useRef(0);
    const [shift, setShift] = useState<Shift | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [restrictedStatus, setRestrictedStatus] = useState<number | null>(null);
    const [offers, setOffers] = useState<ShiftOffer[]>([]);
    const [termsState, setTermsState] = useState<TermsAcceptanceState>(() => createTermsAcceptanceState());
    const [confirmAcceptOpen, setConfirmAcceptOpen] = useState(false);
    const [termsAcceptOpen, setTermsAcceptOpen] = useState(false);
    const [confirmDeclineOpen, setConfirmDeclineOpen] = useState(false);
    const [offerActionBusy, setOfferActionBusy] = useState(false);
    const [offerActionError, setOfferActionError] = useState<string | null>(null);
    const offerMutationTracker = useRef(createOfferMutationTracker());

    const [appliedShiftIds, setAppliedShiftIds] = useState<number[]>([]);
    const [appliedSlotIds, setAppliedSlotIds] = useState<number[]>([]);
    const [rejectedShiftIds, setRejectedShiftIds] = useState<number[]>([]);
    const [rejectedSlotIds, setRejectedSlotIds] = useState<number[]>([]);
    const [snackbar, setSnackbar] = useState<{ open: boolean; message: string | null }>(
        { open: false, message: null }
    );

    useEffect(() => () => {
        requestGen.current += 1;
        releaseOfferMutation(offerMutationTracker.current);
    }, []);

    const loadShift = useCallback(async () => {
        const req = ++requestGen.current;
        if (!id || !user) {
            setLoading(false);
            return;
        }
        const shiftId = Number(id);
        if (!Number.isFinite(shiftId)) {
            setError('Invalid shift identifier.');
            setLoading(false);
            return;
        }
        setLoading(true);
        setError(null);
        setRestrictedStatus(null);
        setTermsState((prev) => transitionReloadStart(prev));
        try {
            const [detail, interests, rejections, pendingOffers] = await Promise.all([
                fetchWorkerShiftDetailService(shiftId),
                fetchShiftInterests({ userId: user.id }),
                fetchShiftRejections({ userId: user.id }),
                fetchWorkerShiftOffersService({ status: 'PENDING' }),
            ]);
            if (req !== requestGen.current) return;

            const pendingList = ((pendingOffers as ShiftOffer[]) || []).filter((o) => String(o.status ?? '').toUpperCase() === 'PENDING');
            setShift(detail as Shift);
            setOffers(keepEmpty(pendingList));
            setTermsState((prev) => transitionReloadSuccess(prev, pendingList));

            const nextAppliedSlots = new Set<number>();
            const nextAppliedShifts = new Set<number>();
            (interests || []).forEach((interest: any) => {
                const slotId = coerceSlotId(interest?.slotId ?? interest?.slot_id ?? interest?.slot);
                if (slotId != null) {
                    nextAppliedSlots.add(slotId);
                    return;
                }
                const shiftIdValue = coerceId(interest?.shift) ?? coerceId(interest?.shift_id);
                if (shiftIdValue != null) {
                    nextAppliedShifts.add(shiftIdValue);
                }
            });

            const nextRejectedSlots = new Set<number>();
            const nextRejectedShifts = new Set<number>();
            (rejections || []).forEach((rejection: any) => {
                const slotId = coerceSlotId(rejection?.slotId ?? rejection?.slot_id ?? rejection?.slot);
                if (slotId != null) {
                    nextRejectedSlots.add(slotId);
                    return;
                }
                const shiftIdValue = coerceId(rejection?.shift) ?? coerceId(rejection?.shift_id);
                if (shiftIdValue != null) {
                    nextRejectedShifts.add(shiftIdValue);
                }
            });

            setAppliedSlotIds(keepEmpty(Array.from(nextAppliedSlots)));
            setAppliedShiftIds(keepEmpty(Array.from(nextAppliedShifts)));
            setRejectedSlotIds(keepEmpty(Array.from(nextRejectedSlots)));
            setRejectedShiftIds(keepEmpty(Array.from(nextRejectedShifts)));
        } catch (err) {
            if (req !== requestGen.current) return;
            const status = getErrorHttpStatus(err);
            if (isExplorerShiftRestricted(null, surface, status)) {
                setRestrictedStatus(status);
            } else {
                setError(getErrorMessage(err, 'Failed to load shift details. It may no longer be available.'));
            }
            setTermsState((prev) =>
                transitionReloadFailure(prev, 'Shift engagement terms have changed. Failed to refresh terms. Please retry.')
            );
        } finally {
            if (req === requestGen.current) setLoading(false);
        }
    }, [id, surface, user]);

    useEffect(() => {
        void loadShift();
    }, [loadShift]);

    const shifts = useMemo(() => (shift ? [shift] : EMPTY_SHIFTS), [shift]);
    const targetOfferId = Number(offerParam);
    const activeOffer = useMemo(
        () => (shift ? resolveWorkerShiftOffer({ offers, offerId: Number.isFinite(targetOfferId) ? targetOfferId : undefined, shiftId: shift.id }) : null),
        [offers, shift, targetOfferId],
    );
    const activeOfferRate = useMemo(
        () =>
            (activeOffer as any)?.hourlyRate ??
            (activeOffer?.engagementTermsPreview as any)?.occurrences?.[0]?.agreedRate ??
            (activeOffer?.engagementTermsPreview as any)?.agreedRate ??
            null,
        [activeOffer],
    );

    const handleApplyAll = async (targetShift: Shift) => {
        try {
            const shiftSlots = targetShift.slots ?? [];
            if (targetShift.singleUserOnly || shiftSlots.length === 0) {
                await expressInterestInShiftService({ shiftId: targetShift.id, slotId: null });
                setAppliedShiftIds((prev) => Array.from(new Set([...prev, targetShift.id])));
                return;
            }
            await expressInterestInShiftService({ shiftId: targetShift.id, slotIds: shiftSlots.map((slot) => slot.id) } as any);
            setAppliedSlotIds((prev) => Array.from(new Set([...prev, ...shiftSlots.map((s) => s.id)])));
        } catch (err) {
            setSnackbar({
                open: true,
                message: getErrorMessage(err, 'Failed to express interest.'),
            });
            throw err;
        }
    };

    const handleApplySlot = async (targetShift: Shift, slotId: number) => {
        try {
            await expressInterestInShiftService({ shiftId: targetShift.id, slotId });
            setAppliedSlotIds((prev) => Array.from(new Set([...prev, slotId])));
        } catch (err) {
            setSnackbar({
                open: true,
                message: getErrorMessage(err, 'Failed to express interest.'),
            });
            throw err;
        }
    };

    const handleRejectShift = async (targetShift: Shift) => {
        try {
            await rejectShiftService({ shiftId: targetShift.id, slotId: null });
            setRejectedShiftIds((prev) => Array.from(new Set([...prev, targetShift.id])));
        } catch (err) {
            setSnackbar({
                open: true,
                message: getErrorMessage(err, 'Failed to reject shift.'),
            });
            throw err;
        }
    };

    const handleRejectSlot = async (targetShift: Shift, slotId: number) => {
        try {
            await rejectShiftService({ shiftId: targetShift.id, slotId });
            setRejectedSlotIds((prev) => Array.from(new Set([...prev, slotId])));
        } catch (err) {
            setSnackbar({
                open: true,
                message: getErrorMessage(err, 'Failed to reject slot.'),
            });
            throw err;
        }
    };

    const handleApplySlots = async (targetShift: Shift, slotIds: number[]) => {
        try {
            const uniqueSlotIds = Array.from(new Set(slotIds)).filter((slotId) => Number.isFinite(slotId));
            if (uniqueSlotIds.length === 0) return;
            await expressInterestInShiftService({ shiftId: targetShift.id, slotIds: uniqueSlotIds } as any);
            setAppliedSlotIds((prev) => Array.from(new Set([...prev, ...uniqueSlotIds])));
        } catch (err) {
            setSnackbar({
                open: true,
                message: getErrorMessage(err, 'Failed to express interest in selected slots.'),
            });
            throw err;
        }
    };

    const handleRejectSlots = async (targetShift: Shift, slotIds: number[]) => {
        try {
            await rejectSlotIdsWithBatchFallback(targetShift.id, slotIds);
            setRejectedSlotIds((prev) => Array.from(new Set([...prev, ...slotIds])));
        } catch (err) {
            setSnackbar({
                open: true,
                message: getErrorMessage(err, 'Failed to reject selected slots.'),
            });
            throw err;
        }
    };

    const handleSubmitCounterOffer = async (payload: any) => {
        try {
            await submitShiftCounterOfferService(payload);
        } catch (err) {
            setSnackbar({
                open: true,
                message: getErrorMessage(err, 'Failed to submit counter offer.'),
            });
            throw err;
        }
    };

    const handleAcceptOffer = (offer: ShiftOffer) => {
        setOfferActionError(null);
        const selection = selectOffersForTerms(termsState, [offer]);
        if (selection.needsReload) {
            setTermsState(selection.state);
            setTermsAcceptOpen(true);
            void loadShift();
            return;
        }
        const check = canAcceptOffer(offer);
        if (check.requiresTerms || offer.engagementTermsPreview?.blocked) {
            setTermsState(selection.state);
            setTermsAcceptOpen(true);
            return;
        }
        if (!check.allowed) {
            setSnackbar({ open: true, message: check.reason ?? 'This offer cannot be accepted yet.' });
            return;
        }
        setConfirmAcceptOpen(true);
    };

    const executeAcceptOffer = async (payload?: ShiftOfferAcceptancePayload) => {
        if (!activeOffer) return;
        const mutation = beginOfferMutation(offerMutationTracker.current);
        setOfferActionBusy(true);
        setOfferActionError(null);
        try {
            const result = await acceptWorkerShiftOfferService(activeOffer.id, payload);
            if (!mutation.isLatest()) return;
            triggerHaptic('success');
            setConfirmAcceptOpen(false);
            setTermsAcceptOpen(false);
            setTermsState(createTermsAcceptanceState());
            const feedback = resolveOfferAcceptanceResult(result);
            setSnackbar({ open: true, message: feedback.message });
            await loadShift();
        } catch (err) {
            if (!mutation.isLatest()) return;
            if (isTermsChangedError(err)) {
                const termsMsg = 'Shift engagement terms have changed. Please review the updated terms and confirm again.';
                setOfferActionError(termsMsg);
                setSnackbar({ open: true, message: termsMsg });
                setConfirmAcceptOpen(false);
                setOffers((prev) => dropCachedOfferPreviews(prev, [activeOffer.id]));
                setTermsState((prev) => transitionTermsChanged(prev, [activeOffer], termsMsg));
                setTermsAcceptOpen(true);
                await loadShift();
                return;
            }
            const msg = getErrorMessage(err, 'Failed to accept shift offer.');
            setOfferActionError(msg);
            setSnackbar({ open: true, message: msg });
        } finally {
            const status = endOfferMutation(offerMutationTracker.current, mutation.gen);
            setOfferActionBusy(status.busy);
        }
    };

    const executeDeclineOffer = async () => {
        if (!activeOffer) return;
        const mutation = beginOfferMutation(offerMutationTracker.current);
        setOfferActionBusy(true);
        setOfferActionError(null);
        try {
            await declineWorkerShiftOfferService(activeOffer.id);
            if (!mutation.isLatest()) return;
            setConfirmDeclineOpen(false);
            setSnackbar({ open: true, message: 'Shift offer declined.' });
            await loadShift();
        } catch (err) {
            if (!mutation.isLatest()) return;
            const msg = getErrorMessage(err, 'Failed to decline shift offer.');
            setOfferActionError(msg);
            setSnackbar({ open: true, message: msg });
        } finally {
            const status = endOfferMutation(offerMutationTracker.current, mutation.gen);
            setOfferActionBusy(status.busy);
        }
    };

    if (error) {
        return (
            <SafeAreaView style={styles.container} edges={['left', 'right']}>
                <ContentState kind="error" title="Couldn't load shift" description={error} actionLabel="Try again" onAction={loadShift} style={styles.state} />
            </SafeAreaView>
        );
    }

    if (isExplorerShiftRestricted(shift, surface, restrictedStatus)) {
        return (
            <SafeAreaView style={styles.container} edges={['left', 'right']}>
                <ContentState
                    kind="empty"
                    icon={<Lock size={28} color={colors.accentStrong} />}
                    title="Community shifts are for pharmacy teams"
                    description="Pharmacies share these shifts with their own staff and favourite locums. Upgrade to a pharmacist or staff account and join a pharmacy to see them. Public shifts stay open to you."
                    actionLabel="Upgrade my account"
                    onAction={() => router.push('/explorer/profile' as any)}
                    style={styles.state}
                />
            </SafeAreaView>
        );
    }

    const workerPaymentPath = surface.persona === 'otherstaff' ? '/otherstaff/profile-payment' : '/pharmacist/profile-payment';

    return (
        <SafeAreaView style={styles.container} edges={['left', 'right']}>
            {activeOffer ? (
                <View style={styles.offerCard}>
                    <View style={styles.offerHeader}>
                        <View style={styles.offerIconTile}>
                            <Sparkles size={20} color={colors.accentStrong} strokeWidth={2} />
                        </View>
                        <View style={styles.offerTextCol}>
                            <Text style={styles.offerTitle}>You have a shift offer</Text>
                            <Text style={styles.offerSubtitle}>
                                {activeOfferRate ? `Offered at $${activeOfferRate}/hr` : 'Review terms and confirm to secure this booking.'}
                            </Text>
                        </View>
                    </View>
                    {offerActionError ? <Text style={styles.offerErrorText}>{offerActionError}</Text> : null}
                    <View style={styles.offerActionsRow}>
                        <Button label="Accept offer" onPress={() => handleAcceptOffer(activeOffer)} disabled={offerActionBusy} haptic="light" style={styles.offerButton} />
                        <Button label="Decline offer" variant="outlined" onPress={() => setConfirmDeclineOpen(true)} disabled={offerActionBusy} style={styles.offerButton} />
                    </View>
                </View>
            ) : null}
            <ShiftsBoard
                title="Shift Details"
                shifts={shifts}
                loading={loading}
                onApplyAll={handleApplyAll}
                onApplySlot={handleApplySlot}
                onApplySlots={handleApplySlots}
                onSubmitCounterOffer={handleSubmitCounterOffer}
                onRejectShift={handleRejectShift}
                onRejectSlot={handleRejectSlot}
                onRejectSlots={handleRejectSlots}
                initialAppliedShiftIds={appliedShiftIds}
                initialAppliedSlotIds={appliedSlotIds}
                initialRejectedShiftIds={rejectedShiftIds}
                initialRejectedSlotIds={rejectedSlotIds}
                enableSaved={false}
                hideSaveToggle
                hideFiltersAndSort
                hideTabs
                showAllSlots
                onRefresh={loadShift}
            />
            <ShiftEngagementTermsDialog
                visible={isTermsDialogVisible(termsState)}
                offers={termsState.offers.length > 0 ? termsState.offers : (activeOffer ? [activeOffer] : EMPTY_OFFERS)}
                loading={loading || offerActionBusy || termsState.status === 'reloading'}
                status={termsState.status}
                error={termsState.error || offerActionError}
                onDismiss={() => {
                    if (!offerActionBusy) {
                        setTermsAcceptOpen(false);
                        setTermsState((prev) => dismissTermsAcceptance(prev));
                    }
                }}
                onConfirm={(payload) => executeAcceptOffer(payload)}
                onRetry={() => void loadShift()}
                onOpenPaymentProfile={() => { setTermsAcceptOpen(false); router.push(workerPaymentPath as any); }}
            />
            <ConfirmDialog
                open={confirmAcceptOpen}
                title="Accept shift offer?"
                body={`You will be confirmed and booked for this shift at ${shift ? getShiftPharmacyName(shift) : 'this pharmacy'}.`}
                confirmLabel="Accept offer"
                busyLabel="Accepting..."
                busy={offerActionBusy}
                destructive={false}
                onConfirm={() => executeAcceptOffer()}
                onClose={() => setConfirmAcceptOpen(false)}
            />
            <ConfirmDialog
                open={confirmDeclineOpen}
                title="Decline shift offer?"
                body="Are you sure you want to decline this shift offer? The shift will be released back to the pharmacy."
                confirmLabel="Decline offer"
                busyLabel="Declining..."
                busy={offerActionBusy}
                destructive
                onConfirm={executeDeclineOffer}
                onClose={() => setConfirmDeclineOpen(false)}
            />
            <Snackbar
                visible={snackbar.open}
                onDismiss={() => setSnackbar({ open: false, message: null })}
                duration={4000}
            >
                {snackbar.message}
            </Snackbar>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.pageBg },
    state: { margin: space.lg },
    offerCard: {
        marginHorizontal: space.lg,
        marginTop: space.md,
        marginBottom: space.xs,
        padding: space.lg,
        borderRadius: radius.card,
        borderCurve: 'continuous',
        borderWidth: 1,
        borderColor: colors.accentStrong,
        backgroundColor: colors.surfaceBg,
        gap: space.md,
    },
    offerHeader: { flexDirection: 'row', alignItems: 'center', gap: space.md },
    offerIconTile: { width: 44, height: 44, borderRadius: radius.control, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.tone.violet.bg },
    offerTextCol: { flex: 1, gap: space.xxs },
    offerTitle: { fontFamily: font.outfit.medium, fontSize: type.titleMedium.fontSize, lineHeight: type.titleMedium.lineHeight, color: colors.textPrimary },
    offerSubtitle: { fontFamily: font.inter.regular, fontSize: type.bodySmall.fontSize, lineHeight: type.bodySmall.lineHeight, color: colors.textSecondary, fontVariant: ['tabular-nums'] },
    offerErrorText: { fontFamily: font.inter.regular, fontSize: type.bodySmall.fontSize, lineHeight: type.bodySmall.lineHeight, color: colors.status.red.fg },
    offerActionsRow: { flexDirection: 'row', gap: space.sm },
    offerButton: { flex: 1 },
});
