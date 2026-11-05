import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import {
    ActivityIndicator,
    Button,
    Dialog,
    Portal,
    Snackbar,
    Text,
    TextInput,
} from 'react-native-paper';
import { Star } from 'lucide-react-native';
import {
    createRatingService,
    fetchHistoryShifts,
    fetchMyRatingForTargetService,
    type Shift,
    type ShiftUser,
    viewAssignedShiftProfileService,
} from '@chemisttasker/shared-core';
import { ContentState } from '@/components/ui';
import { colors, radius, space } from '@/constants/tokens';
import { filterShiftsByPharmacy } from './ConfirmedShiftsView';
import OwnerAssignedShiftBoard from './OwnerAssignedShiftBoard';
import {
    createInitialRatingState,
    isRatingSaveDisabled,
    shouldApplyRatingResponse,
} from './shiftsScreenLogic';
import { useShiftSurface } from './useShiftSurface';
import { WorkerProfileDialog } from './WorkerProfileDialog';

export {
    createInitialRatingState,
    isRatingSaveDisabled,
    shouldApplyRatingResponse,
};

export function filterWorkerShiftsByWorkspace(
    shifts: Shift[],
    workspace: string | null,
    selectedPharmacyId: number | null,
): Shift[] {
    if (!Array.isArray(shifts)) return [];
    if (workspace === 'internal' && selectedPharmacyId != null) {
        return filterShiftsByPharmacy(shifts, selectedPharmacyId);
    }
    return shifts;
}

export default function HistoryShiftsView() {
    const surface = useShiftSurface();
    const scopedPharmacyId = surface.scopedPharmacyId;

    const [shifts, setShifts] = useState<Shift[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [snackbar, setSnackbar] = useState<string>('');

    const [profileDialog, setProfileDialog] = useState(false);
    const [profile, setProfile] = useState<ShiftUser | null>(null);

    const [ratingDialog, setRatingDialog] = useState(false);
    const [ratingState, setRatingState] = useState(() => createInitialRatingState<number>(null));
    const ratingTargetIdRef = useRef<number | null>(null);

    const loadGenRef = useRef(0);
    const profileGenRef = useRef(0);
    const ratingGenRef = useRef(0);
    const saveGenRef = useRef(0);

    const closeSnackbar = () => setSnackbar('');

    const loadShifts = useCallback(async () => {
        const gen = ++loadGenRef.current;
        setLoading(true);
        setError(null);
        try {
            const data = await fetchHistoryShifts();
            if (gen !== loadGenRef.current) return;
            const filtered = filterShiftsByPharmacy(data, scopedPharmacyId);
            setShifts((prev) => (filtered.length === 0 && prev.length === 0 ? prev : filtered));
        } catch (err: any) {
            if (gen !== loadGenRef.current) return;
            const msg = err?.response?.data?.detail || err?.message || 'Failed to load history shifts';
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

    const closeProfileDialog = useCallback(() => {
        profileGenRef.current++;
        setProfileDialog(false);
        setProfile(null);
    }, []);

    const closeRatingDialog = useCallback(() => {
        ratingGenRef.current++;
        saveGenRef.current++;
        ratingTargetIdRef.current = null;
        setRatingDialog(false);
        setRatingState(createInitialRatingState<number>(null));
    }, []);

    useEffect(() => {
        return () => {
            profileGenRef.current++;
            ratingGenRef.current++;
            saveGenRef.current++;
            ratingTargetIdRef.current = null;
        };
    }, [surface.scopeKey]);

    const openProfile = async (shiftId: number, slotId: number | null, userId: number) => {
        const gen = ++profileGenRef.current;
        setProfile(null);
        try {
            const result = await viewAssignedShiftProfileService({
                type: 'history',
                shiftId,
                slotId: slotId ?? undefined,
                userId,
            });
            if (gen !== profileGenRef.current) return;
            setProfile(result);
            setProfileDialog(true);
        } catch (err: any) {
            if (gen !== profileGenRef.current) return;
            setSnackbar(err?.response?.data?.detail || 'Failed to load profile');
        }
    };

    const openRateWorker = async (workerUserId: number) => {
        const gen = ++ratingGenRef.current;
        ratingTargetIdRef.current = workerUserId;
        setRatingState(createInitialRatingState(workerUserId));
        setRatingDialog(true);

        try {
            const existing = await fetchMyRatingForTargetService({
                targetType: 'worker',
                targetId: workerUserId,
            });
            if (!shouldApplyRatingResponse(ratingGenRef.current, gen, ratingTargetIdRef.current, workerUserId)) return;
            if (existing) {
                setRatingState((prev) => ({
                    ...prev,
                    loading: false,
                    stars: existing.stars || 0,
                    comment: existing.comment || '',
                    error: null,
                }));
            } else {
                setRatingState((prev) => ({
                    ...prev,
                    loading: false,
                    stars: 0,
                    comment: '',
                    error: null,
                }));
            }
        } catch (err: any) {
            if (!shouldApplyRatingResponse(ratingGenRef.current, gen, ratingTargetIdRef.current, workerUserId)) return;
            const msg = err?.response?.data?.detail || err?.message || 'Failed to load existing rating';
            setRatingState((prev) => ({
                ...prev,
                loading: false,
                error: msg,
                stars: 0,
                comment: '',
            }));
            setSnackbar(msg);
        }
    };

    const saveRating = async () => {
        const targetId = ratingTargetIdRef.current;
        if (!targetId || isRatingSaveDisabled({ loading: ratingState.loading, saving: ratingState.saving, stars: ratingState.stars, hasError: Boolean(ratingState.error) })) return;
        const gen = ++saveGenRef.current;
        setRatingState((prev) => ({ ...prev, saving: true }));
        try {
            await createRatingService({
                direction: 'OWNER_TO_WORKER',
                ratee_user: targetId,
                stars: ratingState.stars,
                comment: ratingState.comment,
            });
            if (saveGenRef.current !== gen || ratingTargetIdRef.current !== targetId) return;
            setSnackbar('Rating saved successfully!');
            closeRatingDialog();
        } catch (err: any) {
            if (saveGenRef.current !== gen || ratingTargetIdRef.current !== targetId) return;
            setSnackbar(err?.response?.data?.detail || err?.message || 'Failed to save rating');
        } finally {
            if (saveGenRef.current === gen) {
                setRatingState((prev) => ({ ...prev, saving: false }));
            }
        }
    };

    if (!loading && error && shifts.length === 0) {
        return (
            <ContentState
                kind="error"
                title="Could not load shift history"
                description={error}
                onAction={() => void loadShifts()}
            />
        );
    }

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

            <WorkerProfileDialog
                visible={profileDialog}
                loading={false}
                profile={profile}
                onDismiss={closeProfileDialog}
                canMessage={false}
                persona={surface.persona}
            />

            <Portal>
                <Dialog visible={ratingDialog} onDismiss={closeRatingDialog} style={{ borderRadius: radius.card }}>
                    <Dialog.Title>Review Assigned Team Member</Dialog.Title>
                    <Dialog.Content>
                        {ratingState.loading ? (
                            <View style={styles.centered}>
                                <ActivityIndicator color={colors.primary} />
                            </View>
                        ) : ratingState.error ? (
                            <ContentState
                                kind="error"
                                title="Could not load rating"
                                description={ratingState.error}
                                actionLabel="Try again"
                                onAction={() => ratingTargetIdRef.current != null && void openRateWorker(ratingTargetIdRef.current)}
                            />
                        ) : (
                            <View style={{ gap: space.sm }}>
                                <Text>Select a star rating:</Text>
                                <View style={styles.starRow} accessibilityRole="radiogroup" accessibilityLabel="Star rating">
                                    {[1, 2, 3, 4, 5].map((val) => (
                                        <Pressable
                                            key={val}
                                            onPress={() => setRatingState((prev) => ({ ...prev, stars: val }))}
                                            accessibilityRole="radio"
                                            accessibilityState={{ checked: ratingState.stars === val }}
                                            accessibilityLabel={`${val} ${val === 1 ? 'star' : 'stars'}`}
                                            hitSlop={8}
                                            style={styles.starButton}
                                        >
                                            <Star
                                                size={30}
                                                color={val <= ratingState.stars ? colors.status.amber.solid : colors.textMuted}
                                                fill={val <= ratingState.stars ? colors.status.amber.solid : 'transparent'}
                                            />
                                        </Pressable>
                                    ))}
                                </View>
                                <TextInput
                                    mode="outlined"
                                    label="Comment (optional)"
                                    multiline
                                    value={ratingState.comment}
                                    onChangeText={(text) => setRatingState((prev) => ({ ...prev, comment: text }))}
                                />
                            </View>
                        )}
                    </Dialog.Content>
                    <Dialog.Actions>
                        <Button onPress={closeRatingDialog} style={styles.actionBtn}>Cancel</Button>
                        <Button
                            onPress={saveRating}
                            mode="contained"
                            disabled={isRatingSaveDisabled({ loading: ratingState.loading, saving: ratingState.saving, stars: ratingState.stars, hasError: Boolean(ratingState.error) })}
                            loading={ratingState.saving}
                            style={styles.actionBtn}
                        >
                            {ratingState.saving ? 'Saving...' : 'Save Rating'}
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
    pageHeader: { paddingHorizontal: space.lg, paddingTop: space.md, paddingBottom: 4, gap: 4 },
    pageTitle: { fontSize: 24, fontWeight: '900', color: colors.textPrimary },
    pageSubtitle: { color: colors.textMuted, fontSize: 14, fontWeight: '600' },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xl },
    starRow: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
    starButton: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
    actionBtn: { minHeight: 44, justifyContent: 'center' },
});
