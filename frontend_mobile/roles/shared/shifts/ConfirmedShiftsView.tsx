import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import {
    Button,
    Card,
    Snackbar,
    Text,
} from 'react-native-paper';
import {
    activateShiftOfferPayrollService,
    fetchShiftOffers,

    type ShiftApi,
    type ShiftOfferApi,
    shiftsDomain,

    type Shift,
    type ShiftUser,
    viewAssignedShiftProfileService,
} from '@chemisttasker/shared-core';
import { type ApiList, camelCaseKeysDeep, fetchAllPages } from '@chemisttasker/shared-core/dist/utils/serialization';
import { fetchApi } from '@chemisttasker/shared-core/dist/transport/application';
import { ContentState } from '@/components/ui';
import { colors, radius, space } from '@/constants/tokens';
import OwnerAssignedShiftBoard from './OwnerAssignedShiftBoard';
import { useShiftSurface } from './useShiftSurface';
import { WorkerProfileDialog } from './WorkerProfileDialog';

export type DeferredPayrollOffer = {
    id: number;
    paymentPreferenceSnapshot?: string;
    settlementChannel?: string;
    engagementKind?: string;
    payrollActivatedAt?: string | null;
    engagementTermsSnapshot?: {
        payrollActivationRequired?: boolean;
        pharmacyId?: number;
        pharmacyName?: string;
        workerName?: string;
        awardClassification?: string;
        payBasis?: string;
    };
};

export function filterShiftsByPharmacy(shifts: Shift[], scopedPharmacyId: number | null): Shift[] {
    if (!Array.isArray(shifts)) return [];
    if (scopedPharmacyId == null) return shifts;
    return shifts.filter((shift: Shift) => {
        const targetId =
            (shift as any).pharmacyDetail?.id ??
            (shift as any).pharmacy_detail?.id ??
            (shift as any).pharmacy_id ??
            (shift as any).pharmacyId ??
            (shift as any).pharmacy;
        return typeof targetId === 'number' ? targetId === scopedPharmacyId : true;
    });
}

export function filterDeferredPayrollOffers(
    offers: DeferredPayrollOffer[],
    scopedPharmacyId: number | null,
): DeferredPayrollOffer[] {
    if (!Array.isArray(offers)) return [];
    return offers.filter((offer) => {
        const terms = offer.engagementTermsSnapshot;
        const pref = String(offer.paymentPreferenceSnapshot || '').toUpperCase();
        const kind = String(offer.engagementKind || '').toUpperCase();
        if (pref === 'ABN') return false;
        const isTfn = pref === 'TFN' || pref === 'PAYROLL' || kind === 'EMPLOYEE' || Boolean(terms?.payrollActivationRequired);
        const pending = !offer.payrollActivatedAt;
        if (!isTfn || !pending) return false;
        if (scopedPharmacyId != null && typeof terms?.pharmacyId === 'number') {
            return terms.pharmacyId === scopedPharmacyId;
        }
        return true;
    });
}

export default function ConfirmedShiftsView() {
    const surface = useShiftSurface();
    const scopedPharmacyId = surface.scopedPharmacyId;

    const [shifts, setShifts] = useState<Shift[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [deferredPayrollOffers, setDeferredPayrollOffers] = useState<DeferredPayrollOffer[]>([]);
    const [payrollLoading, setPayrollLoading] = useState(false);
    const [payrollError, setPayrollError] = useState<string | null>(null);
    const [activatingPayrollOfferIds, setActivatingPayrollOfferIds] = useState<Set<number>>(() => new Set());
    const [snackbar, setSnackbar] = useState<string>('');
    const [profile, setProfile] = useState<ShiftUser | null>(null);
    const [profileLoading, setProfileLoading] = useState(false);
    const [profileDialog, setProfileDialog] = useState(false);

    const loadGenRef = useRef(0);
    const payrollGenRef = useRef(0);

    const closeSnackbar = () => setSnackbar('');

    const loadShifts = useCallback(async () => {
        const gen = ++loadGenRef.current;
        setLoading(true);
        setError(null);
        try {
            const raw = await fetchAllPages<ShiftApi>((page) =>
                fetchApi<ApiList<ShiftApi>>(`/shifts/confirmed/?page=${page}`)
            );
            if (gen !== loadGenRef.current) return;
            const data = raw.map(shiftsDomain.mapShift);
            const filtered = filterShiftsByPharmacy(data, scopedPharmacyId);
            setShifts((prev) => (filtered.length === 0 && prev.length === 0 ? prev : filtered));
        } catch (err: any) {
            if (gen !== loadGenRef.current) return;
            const msg = err?.response?.data?.detail || err?.message || 'Failed to load confirmed shifts';
            setError(msg);
            setSnackbar(msg);
        } finally {
            if (gen === loadGenRef.current) {
                setLoading(false);
            }
        }
    }, [scopedPharmacyId]);

    useEffect(() => {
        void loadShifts();
    }, [loadShifts]);

    const loadDeferredPayroll = useCallback(async () => {
        const gen = ++payrollGenRef.current;
        setPayrollLoading(true);
        setPayrollError(null);
        try {
            const [acceptedRaw, awaitingRaw] = await Promise.all([
                fetchAllPages<ShiftOfferApi>((page) =>
                    fetchShiftOffers(`?status=ACCEPTED&page=${page}`)
                ),
                fetchAllPages<ShiftOfferApi>((page) =>
                    fetchShiftOffers(`?status=ACCEPTED_AWAITING_PAYMENT&page=${page}`)
                ),
            ]);
            if (gen !== payrollGenRef.current) return;
            const rows = [...acceptedRaw, ...awaitingRaw].map(camelCaseKeysDeep) as unknown as DeferredPayrollOffer[];
            const filtered = filterDeferredPayrollOffers(rows, scopedPharmacyId);
            setDeferredPayrollOffers((prev) => (filtered.length === 0 && prev.length === 0 ? prev : filtered));
        } catch (err: any) {
            if (gen !== payrollGenRef.current) return;
            const msg = err?.message || 'Failed to load deferred payroll setup';
            setPayrollError(msg);
            setSnackbar(msg);
        } finally {
            if (gen === payrollGenRef.current) {
                setPayrollLoading(false);
            }
        }
    }, [scopedPharmacyId]);

    useEffect(() => {
        void loadDeferredPayroll();
    }, [loadDeferredPayroll]);

    const activateDeferredPayroll = async (offer: DeferredPayrollOffer) => {
        if (activatingPayrollOfferIds.has(offer.id)) return;
        setActivatingPayrollOfferIds((prev) => new Set(prev).add(offer.id));
        try {
            await activateShiftOfferPayrollService(offer.id);
            setDeferredPayrollOffers((rows) => rows.filter((row) => row.id !== offer.id));
            setSnackbar('ChemistTasker Payroll activated for this accepted shift.');
        } catch (err: any) {
            setSnackbar(err?.message || 'Complete the worker TFN/super details before activating payroll.');
        } finally {
            setActivatingPayrollOfferIds((prev) => {
                const next = new Set(prev);
                next.delete(offer.id);
                return next;
            });
        }
    };

    const profileGenRef = useRef(0);

    const closeProfileDialog = useCallback(() => {
        profileGenRef.current++;
        setProfileDialog(false);
        setProfile(null);
        setProfileLoading(false);
    }, []);

    useEffect(() => {
        return () => {
            loadGenRef.current++;
            payrollGenRef.current++;
            profileGenRef.current++;
            setDeferredPayrollOffers([]);
            setActivatingPayrollOfferIds(new Set());
            setPayrollError(null);
        };
    }, [surface.scopeKey]);

    const openProfile = async (shiftId: number, slotId: number | null, userId: number) => {
        const gen = ++profileGenRef.current;
        setProfile(null);
        setProfileDialog(true);
        setProfileLoading(true);
        try {
            const result = await viewAssignedShiftProfileService({
                type: 'confirmed',
                shiftId,
                slotId: slotId ?? undefined,
                userId,
            });
            if (gen !== profileGenRef.current) return;
            setProfile(result);
        } catch (err: any) {
            if (gen !== profileGenRef.current) return;
            setSnackbar(err?.response?.data?.detail || 'Failed to load assigned profile');
            setProfileDialog(false);
        } finally {
            if (gen === profileGenRef.current) {
                setProfileLoading(false);
            }
        }
    };

    if (!loading && error && shifts.length === 0) {
        return (
            <ContentState
                kind="error"
                title="Could not load confirmed shifts"
                description={error}
                onAction={() => void loadShifts()}
            />
        );
    }

    return (
        <>
            <View style={styles.pageHeader}>
                <Text style={styles.pageTitle}>Confirmed Shifts</Text>
                <Text style={styles.pageSubtitle}>Review booked shifts and assigned chemists</Text>
            </View>

            {payrollError ? (
                <View style={styles.deferredSection}>
                    <ContentState
                        kind="error"
                        title="Could not load deferred payroll setup"
                        description={payrollError}
                        actionLabel="Try again"
                        onAction={() => void loadDeferredPayroll()}
                    />
                </View>
            ) : deferredPayrollOffers.length > 0 ? (
                <View style={styles.deferredSection}>
                    <Card mode="outlined" style={styles.deferredNotice}>
                        <Card.Content>
                            <Text style={styles.deferredTitle}>Payroll setup deferred</Text>
                            <Text style={styles.deferredText}>
                                These accepted TFN shifts remain rostered and timesheet-only.
                                Activate ChemistTasker Payroll after the worker completes TFN and super details.
                            </Text>
                        </Card.Content>
                    </Card>
                    {deferredPayrollOffers.map((offer) => {
                        const terms = offer.engagementTermsSnapshot;
                        const isPending = activatingPayrollOfferIds.has(offer.id);
                        return (
                            <Card key={offer.id} mode="outlined" style={styles.deferredCard}>
                                <Card.Content style={styles.deferredCardContent}>
                                    <View style={{ flex: 1, gap: 2 }}>
                                        <Text style={styles.bold}>
                                            {terms?.workerName || `Accepted worker · Offer #${offer.id}`}
                                        </Text>
                                        <Text style={styles.deferredText}>
                                            {terms?.pharmacyName || 'Pharmacy'} · {terms?.awardClassification || 'Casual TFN'}
                                            {terms?.payBasis ? ` · ${terms.payBasis}` : ''}
                                        </Text>
                                    </View>
                                    <Button
                                        mode="contained"
                                        loading={isPending}
                                        disabled={isPending}
                                        onPress={() => void activateDeferredPayroll(offer)}
                                        style={styles.actionBtn}
                                    >
                                        Activate payroll
                                    </Button>
                                </Card.Content>
                            </Card>
                        );
                    })}
                </View>
            ) : null}

            <OwnerAssignedShiftBoard
                title="Confirmed Shifts"
                shifts={shifts}
                loading={loading}
                emptyText="No confirmed shifts available."
                mode="confirmed"
                onViewAssigned={openProfile}
            />

            <WorkerProfileDialog
                visible={profileDialog}
                loading={profileLoading}
                profile={profile}
                onDismiss={closeProfileDialog}
                canMessage
                persona={surface.persona}
            />

            <Snackbar visible={!!snackbar} onDismiss={closeSnackbar} duration={3000}>
                {snackbar}
            </Snackbar>
        </>
    );
}

const styles = StyleSheet.create({
    pageHeader: { paddingHorizontal: space.lg, paddingTop: space.md, paddingBottom: 4, gap: 4 },
    pageTitle: { fontSize: 24, fontWeight: '900', color: colors.textPrimary },
    pageSubtitle: { color: colors.textMuted, fontSize: 14, fontWeight: '600' },
    bold: { fontWeight: '700' },
    deferredSection: { paddingHorizontal: space.lg, paddingTop: space.sm, gap: space.sm },
    deferredNotice: { backgroundColor: colors.status.amber.bg, borderRadius: radius.control },
    deferredTitle: { fontWeight: '800', color: colors.status.amber.fg, marginBottom: 4 },
    deferredText: { color: colors.textSecondary, fontSize: 13 },
    deferredCard: { backgroundColor: colors.surfaceBg, borderColor: colors.border, borderRadius: radius.control },
    deferredCardContent: { flexDirection: 'row', alignItems: 'center', gap: space.md },
    actionBtn: { minHeight: 44, justifyContent: 'center' },
});
