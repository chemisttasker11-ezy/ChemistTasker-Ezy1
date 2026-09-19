import React, { useCallback, useEffect, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import {
    ActivityIndicator,
    Button,
    Card,
    Dialog,
    Portal,
    Snackbar,
    Text,
} from 'react-native-paper';
import { useAuth } from '@/context/AuthContext';
import {
    activateShiftOfferPayrollService,
    fetchConfirmedShifts,
    fetchShiftOffersService,
    type Shift,
    type ShiftUser,
    viewAssignedShiftProfileService,
} from '@chemisttasker/shared-core';
import OwnerAssignedShiftBoard from './OwnerAssignedShiftBoard';

type DeferredPayrollOffer = {
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

export default function ConfirmedShiftsView() {
    const { user } = useAuth();
    const activePersona = null;
    const activeAdminPharmacyId = null;
    const scopedPharmacyId =
        activePersona === 'admin' && typeof activeAdminPharmacyId === 'number'
            ? activeAdminPharmacyId
            : null;

    const [shifts, setShifts] = useState<Shift[]>([]);
    const [loading, setLoading] = useState(true);
    const [deferredPayrollOffers, setDeferredPayrollOffers] = useState<DeferredPayrollOffer[]>([]);
    const [activatingPayrollOfferId, setActivatingPayrollOfferId] = useState<number | null>(null);
    const [snackbar, setSnackbar] = useState<string>('');
    const [profile, setProfile] = useState<ShiftUser | null>(null);
    const [profileLoading, setProfileLoading] = useState(false);
    const [profileDialog, setProfileDialog] = useState(false);

    const closeSnackbar = () => setSnackbar('');

    const loadShifts = useCallback(async () => {
        setLoading(true);
        try {
            const data = await fetchConfirmedShifts();
            const filtered =
                scopedPharmacyId != null
                    ? data.filter((shift: Shift) => {
                        const targetId =
                            (shift as any).pharmacyDetail?.id ??
                            (shift as any).pharmacy_detail?.id ??
                            (shift as any).pharmacyId ??
                            (shift as any).pharmacy ??
                            null;
                        return Number(targetId ?? NaN) === scopedPharmacyId;
                    })
                    : data;
            setShifts(Array.isArray(filtered) ? filtered : []);
        } catch (err: any) {
            setSnackbar(err?.response?.data?.detail || 'Failed to load confirmed shifts');
        } finally {
            setLoading(false);
        }
    }, [scopedPharmacyId]);

    useEffect(() => {
        void loadShifts();
    }, [loadShifts]);

    const loadDeferredPayroll = useCallback(async () => {
        try {
            const [accepted, awaiting] = await Promise.all([
                fetchShiftOffersService({ status: 'ACCEPTED' }),
                fetchShiftOffersService({ status: 'ACCEPTED_AWAITING_PAYMENT' }),
            ]);
            const rows = [...accepted, ...awaiting] as DeferredPayrollOffer[];
            const filtered = rows.filter((offer) => {
                const terms = offer.engagementTermsSnapshot;
                const pharmacyMatches =
                    scopedPharmacyId == null || Number(terms?.pharmacyId ?? NaN) === scopedPharmacyId;
                return (
                    pharmacyMatches &&
                    offer.paymentPreferenceSnapshot === 'TFN' &&
                    offer.engagementKind === 'SHIFT_EMPLOYMENT' &&
                    offer.settlementChannel === 'TIMESHEET_ONLY' &&
                    terms?.payrollActivationRequired === true &&
                    !offer.payrollActivatedAt
                );
            });
            setDeferredPayrollOffers(filtered);
        } catch (err: any) {
            setSnackbar(err?.message || 'Failed to load deferred payroll setup');
        }
    }, [scopedPharmacyId]);

    useEffect(() => {
        void loadDeferredPayroll();
    }, [loadDeferredPayroll]);

    const activateDeferredPayroll = async (offer: DeferredPayrollOffer) => {
        setActivatingPayrollOfferId(offer.id);
        try {
            await activateShiftOfferPayrollService(offer.id);
            setDeferredPayrollOffers((rows) => rows.filter((row) => row.id !== offer.id));
            setSnackbar('ChemistTasker Payroll activated for this accepted shift.');
        } catch (err: any) {
            setSnackbar(err?.message || 'Complete the worker TFN/super details before activating payroll.');
        } finally {
            setActivatingPayrollOfferId(null);
        }
    };

    const openProfile = async (shiftId: number, slotId: number | null, userId: number) => {
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
            setProfile(result);
        } catch (err: any) {
            setSnackbar(err?.response?.data?.detail || 'Failed to load assigned profile');
            setProfileDialog(false);
        } finally {
            setProfileLoading(false);
        }
    };

    return (
        <>
            <View style={styles.pageHeader}>
                <Text style={styles.pageTitle}>Confirmed Shifts</Text>
                <Text style={styles.pageSubtitle}>Review booked shifts and assigned chemists</Text>
            </View>

            {deferredPayrollOffers.length > 0 ? (
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
                                        loading={activatingPayrollOfferId === offer.id}
                                        disabled={activatingPayrollOfferId === offer.id}
                                        onPress={() => void activateDeferredPayroll(offer)}
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

            <Portal>
                <Dialog visible={profileDialog} onDismiss={() => setProfileDialog(false)}>
                    <Dialog.Title>Assigned Profile</Dialog.Title>
                    <Dialog.Content>
                        {profileLoading ? (
                            <View style={styles.centered}>
                                <ActivityIndicator />
                            </View>
                        ) : profile ? (
                            <View style={{ gap: 6 }}>
                                <Text><Text style={styles.bold}>Name:</Text> {profile.firstName} {profile.lastName}</Text>
                                <Text><Text style={styles.bold}>Email:</Text> {profile.email}</Text>
                                {profile.phoneNumber ? (
                                    <Text><Text style={styles.bold}>Phone:</Text> {profile.phoneNumber}</Text>
                                ) : null}
                                {profile.shortBio ? (
                                    <Text><Text style={styles.bold}>Bio:</Text> {profile.shortBio}</Text>
                                ) : null}
                                {profile.resume ? (
                                    <Button mode="text" onPress={() => { }}>Download CV</Button>
                                ) : null}
                                {profile.ratePreference ? (
                                    <View style={{ marginTop: 8, gap: 2 }}>
                                        <Text style={styles.bold}>Rate Preference</Text>
                                        <Text>Weekday: {profile.ratePreference.weekday || 'N/A'}</Text>
                                        <Text>Saturday: {profile.ratePreference.saturday || 'N/A'}</Text>
                                        <Text>Sunday: {profile.ratePreference.sunday || 'N/A'}</Text>
                                        <Text>Public Holiday: {profile.ratePreference.publicHoliday || 'N/A'}</Text>
                                        <Text>Early Morning: {profile.ratePreference.earlyMorning || 'N/A'}</Text>
                                        <Text>Late Night: {profile.ratePreference.lateNight || 'N/A'}</Text>
                                    </View>
                                ) : null}
                            </View>
                        ) : (
                            <Text>No profile data available.</Text>
                        )}
                    </Dialog.Content>
                    <Dialog.Actions>
                        <Button onPress={() => setProfileDialog(false)}>Close</Button>
                    </Dialog.Actions>
                </Dialog>
            </Portal>

            <Snackbar visible={!!snackbar} onDismiss={closeSnackbar} duration={3000}>
                {snackbar}
            </Snackbar>
        </>
    );
}

const styles = StyleSheet.create({
    pageHeader: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 4, gap: 4 },
    pageTitle: { fontSize: 24, fontWeight: '900', color: '#111827' },
    pageSubtitle: { color: '#64748B', fontSize: 14, fontWeight: '600' },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
    bold: { fontWeight: '700' },
    deferredSection: { paddingHorizontal: 16, paddingTop: 12, gap: 10 },
    deferredNotice: { backgroundColor: '#FFF7ED' },
    deferredTitle: { fontWeight: '800', color: '#9A3412', marginBottom: 4 },
    deferredText: { color: '#64748B', fontSize: 13 },
    deferredCard: { backgroundColor: '#FFFFFF' },
    deferredCardContent: { flexDirection: 'row', alignItems: 'center', gap: 12 },
});
