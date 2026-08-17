import React, { useCallback, useEffect, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import {
    ActivityIndicator,
    Button,
    Dialog,
    IconButton,
    Portal,
    Snackbar,
    Text,
    TextInput,
} from 'react-native-paper';
import { useAuth } from '@/context/AuthContext';
import {
    createRatingService,
    fetchHistoryShifts,
    fetchMyRatingForTargetService,
    type Shift,
    type ShiftUser,
    viewAssignedShiftProfileService,
} from '@chemisttasker/shared-core';
import OwnerAssignedShiftBoard from './OwnerAssignedShiftBoard';

export default function HistoryShiftsView() {
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

    const [profileDialog, setProfileDialog] = useState(false);
    const [profile, setProfile] = useState<ShiftUser | null>(null);

    const [ratingDialog, setRatingDialog] = useState(false);
    const [selectedWorkerId, setSelectedWorkerId] = useState<number | null>(null);
    const [currentStars, setCurrentStars] = useState<number>(0);
    const [currentComment, setCurrentComment] = useState<string>('');
    const [loadingRating, setLoadingRating] = useState(false);
    const [savingRating, setSavingRating] = useState(false);

    const closeSnackbar = () => setSnackbar('');

    const loadShifts = useCallback(async () => {
        setLoading(true);
        try {
            const data = await fetchHistoryShifts();
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
            setSnackbar(err?.response?.data?.detail || 'Failed to load history shifts');
        } finally {
            setLoading(false);
        }
    }, [scopedPharmacyId]);

    useEffect(() => {
        void loadShifts();
    }, [loadShifts]);

    const openProfile = async (shiftId: number, slotId: number | null, userId: number) => {
        try {
            const result = await viewAssignedShiftProfileService({
                type: 'history',
                shiftId,
                slotId: slotId ?? undefined,
                userId,
            });
            setProfile(result);
            setProfileDialog(true);
        } catch (err: any) {
            setSnackbar(err?.response?.data?.detail || 'Failed to load profile');
        }
    };

    const openRateWorker = async (workerUserId: number) => {
        setSelectedWorkerId(workerUserId);
        setRatingDialog(true);
        setLoadingRating(true);
        try {
            const existing = await fetchMyRatingForTargetService({
                targetType: 'worker',
                targetId: workerUserId,
            });
            if (existing) {
                setCurrentStars(existing.stars || 0);
                setCurrentComment(existing.comment || '');
            } else {
                setCurrentStars(0);
                setCurrentComment('');
            }
        } catch {
            setSnackbar('Failed to load existing rating');
            setCurrentStars(0);
            setCurrentComment('');
        } finally {
            setLoadingRating(false);
        }
    };

    const saveRating = async () => {
        if (!selectedWorkerId || currentStars === 0) return;
        setSavingRating(true);
        try {
            await createRatingService({
                direction: 'OWNER_TO_WORKER',
                ratee_user: selectedWorkerId,
                stars: currentStars,
                comment: currentComment,
            });
            setSnackbar('Rating saved successfully!');
            setRatingDialog(false);
        } catch {
            setSnackbar('Failed to save rating');
        } finally {
            setSavingRating(false);
        }
    };

    return (
        <>
            <View style={styles.pageHeader}>
                <Text style={styles.pageTitle}>Shift History</Text>
                <Text style={styles.pageSubtitle}>Review completed shifts and rate assigned team members</Text>
            </View>

            <OwnerAssignedShiftBoard
                title="Shift History"
                shifts={shifts}
                loading={loading}
                emptyText="No past shifts found."
                mode="history"
                onViewAssigned={openProfile}
                onRateAssigned={openRateWorker}
            />

            <Portal>
                <Dialog visible={profileDialog} onDismiss={() => setProfileDialog(false)}>
                    <Dialog.Title>Assigned Profile</Dialog.Title>
                    <Dialog.Content>
                        {profile ? (
                            <View style={{ gap: 6 }}>
                                <Text><Text style={styles.bold}>Name:</Text> {profile.firstName} {profile.lastName}</Text>
                                <Text><Text style={styles.bold}>Email:</Text> {profile.email}</Text>
                                {profile.phoneNumber ? <Text><Text style={styles.bold}>Phone:</Text> {profile.phoneNumber}</Text> : null}
                                {profile.shortBio ? <Text><Text style={styles.bold}>Bio:</Text> {profile.shortBio}</Text> : null}
                                {profile.resume ? <Button mode="text" onPress={() => { }}>Download CV</Button> : null}
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
                            <View style={styles.centered}>
                                <Text>No profile data.</Text>
                            </View>
                        )}
                    </Dialog.Content>
                    <Dialog.Actions>
                        <Button onPress={() => setProfileDialog(false)}>Close</Button>
                    </Dialog.Actions>
                </Dialog>
            </Portal>

            <Portal>
                <Dialog visible={ratingDialog} onDismiss={() => setRatingDialog(false)}>
                    <Dialog.Title>Review Assigned Team Member</Dialog.Title>
                    <Dialog.Content>
                        {loadingRating ? (
                            <View style={styles.centered}>
                                <ActivityIndicator />
                            </View>
                        ) : (
                            <View style={{ gap: 12 }}>
                                <Text>Select a star rating:</Text>
                                <View style={styles.starRow}>
                                    {[1, 2, 3, 4, 5].map((val) => (
                                        <IconButton
                                            key={val}
                                            onPress={() => setCurrentStars(val)}
                                            icon={val <= currentStars ? 'star' : 'star-outline'}
                                            iconColor={val <= currentStars ? '#F4B400' : '#D1D5DB'}
                                            size={34}
                                            style={styles.starButton}
                                        />
                                    ))}
                                </View>
                                <TextInput
                                    mode="outlined"
                                    label="Comment (optional)"
                                    multiline
                                    value={currentComment}
                                    onChangeText={setCurrentComment}
                                />
                            </View>
                        )}
                    </Dialog.Content>
                    <Dialog.Actions>
                        <Button onPress={() => setRatingDialog(false)}>Cancel</Button>
                        <Button
                            onPress={saveRating}
                            mode="contained"
                            disabled={savingRating || currentStars === 0}
                            loading={savingRating}
                        >
                            {savingRating ? 'Saving...' : 'Save Rating'}
                        </Button>
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
    starRow: { flexDirection: 'row', alignItems: 'center', marginLeft: -8 },
    starButton: { margin: 0 },
    bold: { fontWeight: '700' },
});
