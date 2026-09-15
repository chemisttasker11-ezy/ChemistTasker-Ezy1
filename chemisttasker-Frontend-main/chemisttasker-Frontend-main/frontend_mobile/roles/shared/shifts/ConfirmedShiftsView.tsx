import React, { useCallback, useEffect, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import {
    ActivityIndicator,
    Button,
    Dialog,
    Portal,
    Snackbar,
    Text,
} from 'react-native-paper';
import { useAuth } from '@/context/AuthContext';
import {
    fetchConfirmedShifts,
    type Shift,
    type ShiftUser,
    viewAssignedShiftProfileService,
} from '@chemisttasker/shared-core';
import OwnerAssignedShiftBoard from './OwnerAssignedShiftBoard';

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
});
